import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { bootstrapAuth, api } from "./api";
import { registerForPush } from "./push";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: "service_provider" | "client";
  phone?: string;
  category?: string;
  bio?: string;
  hourly_rate?: number;
  task_rate?: number;
  city?: string;
  avatar_url?: string;
  rating: number;
  reviews_count: number;
  active: boolean;
  created_at: string;
  trial_ends_at?: string | null;
  subscription_status?: string | null;
  days_until_due?: number | null;
  wilaya_code?: string;
  baladiya?: string;
  cross_wilaya?: boolean;
  portfolio_images?: (string | { url: string; caption?: string | null; tags?: string[]; is_cover?: boolean })[];
  is_manually_deactivated?: boolean;
  manually_deactivated_at?: string | null;
  is_deleted?: boolean;
  last_paid_at?: string | null;
  verification_status?: "unverified" | "pending" | "verified" | "rejected";
  is_verified?: boolean;
  verification_documents?: { id: string; type: string; url: string; note?: string | null; uploaded_at?: string }[];
  verification_reject_reason?: string | null;
  verification_submitted_at?: string | null;
  verification_reviewed_at?: string | null;
  is_admin?: boolean;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: any) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const u = await bootstrapAuth();
      setUser(u);
      setLoading(false);
      // Best-effort seed for dev demo
      try {
        await api.seed();
      } catch {}
      // Register for push if already signed in.
      if (u?.id) registerForPush(u.id);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data: any = await api.login(email, password);
    setUser(data.user);
    if (data.user?.id) registerForPush(data.user.id);
    return data.user as User;
  }, []);

  const register = useCallback(async (payload: any) => {
    const data: any = await api.register(payload);
    // save token
    const { saveToken } = await import("./authStorage");
    if (data.access_token) await saveToken(data.access_token);
    setUser(data.user);
    if (data.user?.id) registerForPush(data.user.id);
    return data.user as User;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const u = await api.me();
      setUser(u);
      if ((u as any)?.id) registerForPush((u as any).id);
    } catch {}
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
