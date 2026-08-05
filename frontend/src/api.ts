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
  providers: (params?: { category?: string; search?: string; wilaya?: string; lat?: number; lng?: number; radius_km?: number }) => {
    const q = new URLSearchParams();
    if (params?.category) q.set("category", params.category);
    if (params?.search) q.set("search", params.search);
    if (params?.wilaya) q.set("wilaya", params.wilaya);
    if (params?.lat != null && params?.lng != null && params?.radius_km != null) {
      q.set("lat", String(params.lat));
      q.set("lng", String(params.lng));
      q.set("radius_km", String(params.radius_km));
    }
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

  // Admin dashboard
  adminStats: () => request<any>("/admin/stats"),
  adminSearchUsers: (params?: { q?: string; role?: string; wilaya?: string; status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.role) qs.set("role", params.role);
    if (params?.wilaya) qs.set("wilaya", params.wilaya);
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    const s = qs.toString();
    return request<any[]>(`/admin/users${s ? `?${s}` : ""}`);
  },
  adminDeactivateUser: (id: string) =>
    request(`/admin/users/${encodeURIComponent(id)}/deactivate`, { method: "POST" }),
  adminReactivateUser: (id: string) =>
    request(`/admin/users/${encodeURIComponent(id)}/reactivate`, { method: "POST" }),
  adminForceVerify: (id: string, verified = true) =>
    request(`/admin/users/${encodeURIComponent(id)}/force-verify`, {
      method: "POST",
      body: JSON.stringify({ verified }),
    }),
  adminDeleteUser: (id: string) =>
    request(`/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adminBookings: (status?: string, limit = 50) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    qs.set("limit", String(limit));
    return request<any[]>(`/admin/bookings?${qs.toString()}`);
  },
  adminRevenue: (months = 6) =>
    request<any[]>(`/admin/revenue?months=${months}`),
  adminBroadcast: (payload: { title: string; message: string; audience: string; wilaya_code?: string; action_url?: string }) =>
    request("/admin/broadcast", { method: "POST", body: JSON.stringify(payload) }),
  adminExportUrl: (kind: "users" | "providers" | "bookings") => `${API_URL}/admin/export/${kind}`,

  // Admin categories
  adminListCategories: () => request<any[]>("/admin/categories"),
  adminCreateCategory: (payload: any) =>
    request("/admin/categories", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateCategory: (id: string, patch: any) =>
    request(`/admin/categories/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  adminDeleteCategory: (id: string) =>
    request(`/admin/categories/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adminReorderCategories: (order: string[]) =>
    request<any[]>("/admin/categories/reorder", { method: "POST", body: JSON.stringify({ order }) }),

  // Ads (public)
  listAds: () => request<any[]>("/ads", { auth: false }),
  adImpression: (id: string) =>
    fetch(`${API_URL}/ads/${encodeURIComponent(id)}/impression`, { method: "POST" }).catch(() => {}),
  adClick: (id: string) =>
    fetch(`${API_URL}/ads/${encodeURIComponent(id)}/click`, { method: "POST" }).catch(() => {}),
  // Ads (admin)
  adminListAds: () => request<any[]>("/admin/ads"),
  adminCreateAd: (payload: any) =>
    request("/admin/ads", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateAd: (id: string, patch: any) =>
    request(`/admin/ads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  adminDeleteAd: (id: string) =>
    request(`/admin/ads/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adminReorderAds: (order: string[]) =>
    request<any[]>("/admin/ads/reorder", { method: "POST", body: JSON.stringify({ order }) }),

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
  /** Verify the phone of the CURRENTLY authenticated user (best-effort phone verification). */
  verifyMyPhone: (code: string) =>
    request<{ phone_verified: boolean; user: any }>("/auth/verify-my-phone", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
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
