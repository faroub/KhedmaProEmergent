import { clearToken, readToken, saveToken } from "./authStorage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
export const API_URL = `${BASE}/api`;

export type PortfolioItem = {
  url: string;
  caption?: string | null;
  tags?: string[];
  is_cover?: boolean;
};

type FetchOpts = RequestInit & { auth?: boolean };

async function request<T = any>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { auth = true, ...init } = opts;
  const headers = new Headers(init.headers as any);
  headers.set("Content-Type", "application/json");
  if (auth) {
    const token = await readToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    if (res.status === 401 || res.status === 410) await clearToken();
    const msg = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : "Request failed");
  }
  return data as T;
}

// AUTH
export const api = {
  register: (payload: any) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(payload), auth: false }),
  login: async (email: string, password: string) => {
    const data: any = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      auth: false,
    });
    if (data.access_token) await saveToken(data.access_token);
    return data;
  },
  me: () => request("/auth/me"),
  logout: async () => {
    await clearToken();
  },

  categories: () => request("/categories", { auth: false }),
  providers: (params?: { category?: string; search?: string; wilaya?: string }) => {
    const q = new URLSearchParams();
    if (params?.category) q.set("category", params.category);
    if (params?.search) q.set("search", params.search);
    if (params?.wilaya) q.set("wilaya", params.wilaya);
    const qs = q.toString();
    return request(`/providers${qs ? `?${qs}` : ""}`, { auth: false });
  },
  provider: (id: string) => request(`/providers/${id}`, { auth: false }),
  providerReviews: (id: string) => request(`/providers/${id}/reviews`, { auth: false }),

  createBooking: (payload: any) =>
    request("/bookings", { method: "POST", body: JSON.stringify(payload) }),
  myBookings: () => request("/bookings/mine"),
  updateBookingStatus: (id: string, status: string) =>
    request(`/bookings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),

  createReview: (payload: any) =>
    request("/reviews", { method: "POST", body: JSON.stringify(payload) }),

  paySubscription: () =>
    request("/subscription/pay", { method: "POST" }),
  subscriptionStatus: () => request("/subscription/status"),

  deactivateAccount: () => request("/users/me/deactivate", { method: "POST" }),
  reactivateAccount: () => request("/users/me/reactivate", { method: "POST" }),
  deleteAccount: () => request("/users/me/delete", { method: "POST" }),

  // Verification (provider)
  verificationStatus: () => request("/verification/status"),
  submitVerification: (documents: { type: string; url: string; note?: string | null }[]) =>
    request("/verification/submit", { method: "POST", body: JSON.stringify({ documents }) }),
  deleteVerificationDoc: (docId: string) =>
    request(`/verification/documents/${encodeURIComponent(docId)}`, { method: "DELETE" }),

  // Admin
  adminListPending: () => request("/admin/verification/pending"),
  adminGetProvider: (id: string) => request(`/admin/verification/${encodeURIComponent(id)}`),
  adminApprove: (id: string) => request(`/admin/verification/${encodeURIComponent(id)}/approve`, { method: "POST" }),
  adminReject: (id: string, reason: string) =>
    request(`/admin/verification/${encodeURIComponent(id)}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),

  // Phone reveal (behind bookings)
  revealPhone: (otherId: string) =>
    request<{ phone: string | null; full_name: string }>(
      `/users/${encodeURIComponent(otherId)}/phone`
    ),

  // Admin flag queue
  adminListFlags: () => request<any[]>("/admin/flags"),
  adminClearFlag: (providerId: string) =>
    request(`/admin/flags/${encodeURIComponent(providerId)}/clear`, { method: "POST" }),

  // OTP auth
  otpRequest: (phone: string) =>
    request("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone }), auth: false }),
  otpVerify: async (phone: string, code: string, role: "client" | "service_provider") => {
    const data: any = await request("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code, role }),
      auth: false,
    });
    if (data.access_token) await saveToken(data.access_token);
    return data;
  },
  completeProfile: (payload: any) =>
    request("/users/me/profile", { method: "PATCH", body: JSON.stringify(payload) }),

  wilayas: () => request("/wilayas", { auth: false }),

  updatePortfolio: (images: (string | PortfolioItem)[]) =>
    request("/users/me/portfolio", { method: "PATCH", body: JSON.stringify({ portfolio_images: images }) }),

  reportProvider: (payload: { provider_id: string; reason: string; details?: string }) =>
    request("/reports", { method: "POST", body: JSON.stringify(payload) }),

  // Schedule
  getSchedule: (providerId: string) =>
    request(`/schedule/${providerId}`, { auth: false }),
  setSchedule: (payload: any) =>
    request("/schedule", { method: "PUT", body: JSON.stringify(payload) }),

  // Chat
  myChats: () => request("/chats/mine"),
  chatHistory: (otherId: string) => request(`/chats/${otherId}/messages`),
  sendMessage: (otherId: string, text: string) =>
    request(`/chats/${otherId}/messages`, { method: "POST", body: JSON.stringify({ text }) }),

  seed: () => request("/seed", { method: "POST", auth: false }),
};

export const WS_URL = (token: string) => {
  const base = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/^http/, "ws");
  return `${base}/api/ws/chat?token=${encodeURIComponent(token)}`;
};

export async function bootstrapAuth(): Promise<any | null> {
  const token = await readToken();
  if (!token) return null;
  try {
    return await api.me();
  } catch {
    return null;
  }
}
