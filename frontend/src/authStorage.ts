import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "sp_token";
let memToken: string | null = null;

export async function saveToken(token: string) {
  memToken = token;
  if (Platform.OS !== "web") {
    try {
      await SecureStore.setItemAsync(KEY, token);
    } catch {}
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
  return null;
}

export async function clearToken() {
  memToken = null;
  if (Platform.OS !== "web") {
    try {
      await SecureStore.deleteItemAsync(KEY);
    } catch {}
  }
}
