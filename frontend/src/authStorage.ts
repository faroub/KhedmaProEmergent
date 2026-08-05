import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "sp_token";
let memToken: string | null = null;

// Best-effort localStorage helpers (web only). Wrapped so SSR / RN native builds never crash.
function webStorageGet(): string | null {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(KEY);
    }
  } catch {}
  return null;
}
function webStorageSet(token: string | null) {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.localStorage) {
      if (token) window.localStorage.setItem(KEY, token);
      else window.localStorage.removeItem(KEY);
    }
  } catch {}
}

export async function saveToken(token: string) {
  memToken = token;
  if (Platform.OS !== "web") {
    try {
      await SecureStore.setItemAsync(KEY, token);
    } catch {}
  } else {
    webStorageSet(token);
  }
}

export async function readToken(): Promise<string | null> {
  if (memToken) return memToken;
  if (Platform.OS !== "web") {
    try {
      const t = await SecureStore.getItemAsync(KEY);
      memToken = t;
      return t;
    } catch {
      return null;
    }
  }
  // web fallback: rehydrate from localStorage so the user stays signed in on reload.
  const t = webStorageGet();
  if (t) memToken = t;
  return memToken;
}

export async function clearToken() {
  memToken = null;
  if (Platform.OS !== "web") {
    try {
      await SecureStore.deleteItemAsync(KEY);
    } catch {}
  } else {
    webStorageSet(null);
  }
}
