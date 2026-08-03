// Push notification registration helper.
// Called after login/registration and on every app open (tokens rotate).
// Uses the Emergent managed push relay via our backend.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { API_URL } from "./api";

let inFlight: Promise<void> | null = null;

export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === "web") return;
  if (!userId) return;
  // Dedupe concurrent calls.
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // Ask permission first (iOS + Android 13+).
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status !== "granted") return;

      // Get native FCM/APNs token (NOT expo push token).
      const tokenResp = await Notifications.getDevicePushTokenAsync();
      const deviceToken = tokenResp.data as string;
      if (!deviceToken) return;

      await fetch(`${API_URL}/register-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          platform: Platform.OS,
          device_token: deviceToken,
        }),
      });
    } catch (e) {
      // Never crash the app on push registration failures.
      console.warn("[push] register failed:", e);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
