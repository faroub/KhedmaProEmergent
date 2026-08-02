// Web fallback for the offline booking / schedule store.
// Uses AsyncStorage (backed by IndexedDB via its web shim) to keep behavior
// consistent with the native SQLite implementation without pulling wa-sqlite
// into the web bundle.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LocalBooking, LocalSchedule } from "./schema";

const BOOKINGS_KEY = (userId: string) => `khedmapro_bookings_${userId}`;
const SYNC_KEY = (userId: string) => `khedmapro_bookings_sync_${userId}`;
const NOTES_KEY = (userId: string) => `khedmapro_bookings_notes_${userId}`;
const SCHED_KEY = (providerId: string) => `khedmapro_schedule_${providerId}`;

async function readJSON<T>(k: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
async function writeJSON<T>(k: string, v: T) {
  try {
    await AsyncStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

export const bookingsStore = {
  async upsertMany(userId: string, bookings: LocalBooking[]) {
    if (!userId) return;
    const cachedAt = new Date().toISOString();
    const notes = (await readJSON<Record<string, string>>(NOTES_KEY(userId))) || {};
    const withNotes = bookings.map((b) => ({
      ...b,
      local_notes: notes[b.id] ?? b.local_notes ?? null,
      cached_at: cachedAt,
    }));
    await writeJSON(BOOKINGS_KEY(userId), withNotes);
    await writeJSON(SYNC_KEY(userId), cachedAt);
  },

  async list(userId: string): Promise<LocalBooking[]> {
    if (!userId) return [];
    const rows = (await readJSON<LocalBooking[]>(BOOKINGS_KEY(userId))) || [];
    return [...rows].sort((a, b) => (b.scheduled_date || "").localeCompare(a.scheduled_date || ""));
  },

  async listConfirmedUpcoming(userId: string): Promise<LocalBooking[]> {
    const all = await this.list(userId);
    return all.filter((b) => b.status === "confirmed")
      .sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""));
  },

  async setLocalNotes(bookingId: string, userId: string, note: string) {
    const notes = (await readJSON<Record<string, string>>(NOTES_KEY(userId))) || {};
    notes[bookingId] = note;
    await writeJSON(NOTES_KEY(userId), notes);
    const rows = (await readJSON<LocalBooking[]>(BOOKINGS_KEY(userId))) || [];
    const next = rows.map((b) => (b.id === bookingId ? { ...b, local_notes: note } : b));
    await writeJSON(BOOKINGS_KEY(userId), next);
  },

  async getLastSync(userId: string): Promise<string | null> {
    return (await readJSON<string>(SYNC_KEY(userId))) || null;
  },

  async clear(userId: string) {
    await AsyncStorage.removeItem(BOOKINGS_KEY(userId));
    await AsyncStorage.removeItem(SYNC_KEY(userId));
    await AsyncStorage.removeItem(NOTES_KEY(userId));
  },
};

export const scheduleStore = {
  async put(providerId: string, payload: Omit<LocalSchedule, "cached_at">) {
    const cachedAt = new Date().toISOString();
    await writeJSON(SCHED_KEY(providerId), { ...payload, cached_at: cachedAt });
  },
  async get(providerId: string): Promise<LocalSchedule | null> {
    return (await readJSON<LocalSchedule>(SCHED_KEY(providerId))) || null;
  },
};
