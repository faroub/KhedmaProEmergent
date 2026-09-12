// Shared types for the offline store.
// A single source of truth for both the SQLite (native) and AsyncStorage
// (web fallback) implementations.

export type LocalBooking = {
  id: string;
  provider_id: string;
  provider_name?: string;
  provider_category?: string;
  provider_avatar?: string | null;
  client_id: string;
  client_name: string;
  client_phone?: string | null;
  client_email?: string | null;
  is_guest?: boolean;
  scheduled_date: string;
  task_description: string;
  address: string;
  rate_type: string;
  estimated_hours?: number | null;
  estimated_total?: number | null;
  status: "pending" | "confirmed" | "in_progress" | "awaiting_confirmation" | "completed" | "cancelled";
  arrived_at?: string | null;
  booking_type?: "instant" | "quote";
  location_lat?: number | null;
  location_lng?: number | null;
  wilaya_code?: string | null;
  baladiya?: string | null;
  reviewed?: boolean;
  created_at?: string;
  // extra column set by the offline cache — the client note the provider
  // takes for themselves; kept locally so it survives connectivity loss.
  local_notes?: string | null;
  cached_at?: string;
};

export type LocalSchedule = {
  provider_id: string;
  working_hours: Record<string, { start: string; end: string } | null>;
  breaks: Record<string, { start: string; end: string }[]>;
  vacation_days: string[];
  cached_at: string;
};
