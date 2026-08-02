// Native (iOS / Android) implementation backed by expo-sqlite.
// Provides an offline-first store for the provider's confirmed appointments,
// addresses, and personal client notes so they remain usable without a
// network connection.
//
// A `.web.ts` sibling of this file provides an AsyncStorage-backed fallback
// so the same import continues to work on the web preview.

import * as SQLite from "expo-sqlite";
import type { LocalBooking, LocalSchedule } from "./schema";

const DB_NAME = "khedmapro_offline_v1.db";

let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      // Enable WAL for concurrent reads (recommended for mobile).
      try {
        await db.execAsync("PRAGMA journal_mode = WAL;");
      } catch {}
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS bookings (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          provider_id TEXT,
          provider_name TEXT,
          provider_category TEXT,
          provider_avatar TEXT,
          client_id TEXT,
          client_name TEXT,
          client_phone TEXT,
          client_email TEXT,
          is_guest INTEGER,
          scheduled_date TEXT,
          task_description TEXT,
          address TEXT,
          rate_type TEXT,
          estimated_hours REAL,
          estimated_total REAL,
          status TEXT,
          booking_type TEXT,
          location_lat REAL,
          location_lng REAL,
          wilaya_code TEXT,
          baladiya TEXT,
          reviewed INTEGER,
          created_at TEXT,
          local_notes TEXT,
          cached_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_bookings_user     ON bookings(user_id);
        CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_bookings_date     ON bookings(user_id, scheduled_date);

        CREATE TABLE IF NOT EXISTS schedules (
          provider_id TEXT PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL,
          cached_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT
        );
      `);
      return db;
    });
  }
  return _dbPromise;
}

// ---------- bookings ----------
export const bookingsStore = {
  async upsertMany(userId: string, bookings: LocalBooking[]) {
    if (!userId) return;
    const db = await getDb();
    const cachedAt = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      // Remove server-known bookings for this user that no longer exist
      // remotely (based on the incoming list). We keep any local_notes rows
      // that the provider added — those live in the same table.
      const ids = bookings.map((b) => b.id);
      if (ids.length > 0) {
        const placeholders = ids.map(() => "?").join(",");
        await db.runAsync(
          `DELETE FROM bookings WHERE user_id = ? AND id NOT IN (${placeholders})`,
          userId,
          ...ids,
        );
      } else {
        await db.runAsync(`DELETE FROM bookings WHERE user_id = ?`, userId);
      }
      for (const b of bookings) {
        await db.runAsync(
          `INSERT INTO bookings (
            id, user_id, provider_id, provider_name, provider_category, provider_avatar,
            client_id, client_name, client_phone, client_email, is_guest,
            scheduled_date, task_description, address, rate_type,
            estimated_hours, estimated_total, status, booking_type,
            location_lat, location_lng, wilaya_code, baladiya, reviewed,
            created_at, local_notes, cached_at
          )
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            provider_id = excluded.provider_id,
            provider_name = excluded.provider_name,
            provider_category = excluded.provider_category,
            provider_avatar = excluded.provider_avatar,
            client_id = excluded.client_id,
            client_name = excluded.client_name,
            client_phone = excluded.client_phone,
            client_email = excluded.client_email,
            is_guest = excluded.is_guest,
            scheduled_date = excluded.scheduled_date,
            task_description = excluded.task_description,
            address = excluded.address,
            rate_type = excluded.rate_type,
            estimated_hours = excluded.estimated_hours,
            estimated_total = excluded.estimated_total,
            status = excluded.status,
            booking_type = excluded.booking_type,
            location_lat = excluded.location_lat,
            location_lng = excluded.location_lng,
            wilaya_code = excluded.wilaya_code,
            baladiya = excluded.baladiya,
            reviewed = excluded.reviewed,
            created_at = excluded.created_at,
            cached_at = excluded.cached_at`,
          b.id,
          userId,
          b.provider_id ?? null,
          b.provider_name ?? null,
          b.provider_category ?? null,
          b.provider_avatar ?? null,
          b.client_id ?? null,
          b.client_name ?? null,
          b.client_phone ?? null,
          b.client_email ?? null,
          b.is_guest ? 1 : 0,
          b.scheduled_date ?? null,
          b.task_description ?? null,
          b.address ?? null,
          b.rate_type ?? null,
          b.estimated_hours ?? null,
          b.estimated_total ?? null,
          b.status ?? null,
          b.booking_type ?? null,
          b.location_lat ?? null,
          b.location_lng ?? null,
          b.wilaya_code ?? null,
          b.baladiya ?? null,
          b.reviewed ? 1 : 0,
          b.created_at ?? null,
          b.local_notes ?? null,
          cachedAt,
        );
      }
      await db.runAsync(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        `bookings_sync_${userId}`,
        cachedAt,
      );
    });
  },

  async list(userId: string): Promise<LocalBooking[]> {
    if (!userId) return [];
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM bookings WHERE user_id = ? ORDER BY scheduled_date DESC`,
      userId,
    );
    return rows.map(rowToBooking);
  },

  async listConfirmedUpcoming(userId: string): Promise<LocalBooking[]> {
    if (!userId) return [];
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM bookings
       WHERE user_id = ? AND status = 'confirmed'
       ORDER BY scheduled_date ASC`,
      userId,
    );
    return rows.map(rowToBooking);
  },

  async setLocalNotes(bookingId: string, userId: string, note: string) {
    const db = await getDb();
    await db.runAsync(
      `UPDATE bookings SET local_notes = ? WHERE id = ? AND user_id = ?`,
      note,
      bookingId,
      userId,
    );
  },

  async getLastSync(userId: string): Promise<string | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<any>(
      `SELECT value FROM meta WHERE key = ?`,
      `bookings_sync_${userId}`,
    );
    return row?.value ?? null;
  },

  async clear(userId: string) {
    const db = await getDb();
    await db.runAsync(`DELETE FROM bookings WHERE user_id = ?`, userId);
    await db.runAsync(`DELETE FROM meta WHERE key = ?`, `bookings_sync_${userId}`);
  },
};

// ---------- schedule ----------
export const scheduleStore = {
  async put(providerId: string, payload: Omit<LocalSchedule, "cached_at">) {
    const db = await getDb();
    const cachedAt = new Date().toISOString();
    const encoded = JSON.stringify({ ...payload, cached_at: cachedAt });
    await db.runAsync(
      `INSERT INTO schedules (provider_id, payload, cached_at) VALUES (?, ?, ?)
       ON CONFLICT(provider_id) DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at`,
      providerId,
      encoded,
      cachedAt,
    );
  },

  async get(providerId: string): Promise<LocalSchedule | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<any>(
      `SELECT payload FROM schedules WHERE provider_id = ?`,
      providerId,
    );
    if (!row?.payload) return null;
    try {
      return JSON.parse(row.payload) as LocalSchedule;
    } catch {
      return null;
    }
  },
};

function rowToBooking(row: any): LocalBooking {
  return {
    id: row.id,
    provider_id: row.provider_id,
    provider_name: row.provider_name,
    provider_category: row.provider_category,
    provider_avatar: row.provider_avatar,
    client_id: row.client_id,
    client_name: row.client_name,
    client_phone: row.client_phone,
    client_email: row.client_email,
    is_guest: !!row.is_guest,
    scheduled_date: row.scheduled_date,
    task_description: row.task_description,
    address: row.address,
    rate_type: row.rate_type,
    estimated_hours: row.estimated_hours,
    estimated_total: row.estimated_total,
    status: row.status,
    booking_type: row.booking_type,
    location_lat: row.location_lat,
    location_lng: row.location_lng,
    wilaya_code: row.wilaya_code,
    baladiya: row.baladiya,
    reviewed: !!row.reviewed,
    created_at: row.created_at,
    local_notes: row.local_notes,
    cached_at: row.cached_at,
  };
}
