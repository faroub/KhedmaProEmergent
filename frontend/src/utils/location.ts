// Client location fetcher with a 10-minute in-memory cache so we don't spin
// up the GPS chip on every re-render or filter change.
//
// Follows the permission contract: never asks unless the caller triggers
// `getClientLocation()` after showing intent (e.g. tapping "Near me").
import * as Location from "expo-location";

export type Coords = { lat: number; lng: number };

const CACHE_TTL_MS = 10 * 60 * 1000;

let cache: { coords: Coords; at: number } | null = null;
let inFlight: Promise<Coords | null> | null = null;

/**
 * Fetch the current client GPS location, or `null` if permission was denied
 * or the device can't provide a fix quickly.
 *
 * - Prompts for foreground permission at most once per session.
 * - Returns cached coords for 10 min.
 * - Never throws — always resolves.
 */
export async function getClientLocation(): Promise<Coords | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.coords;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      let status = perm.status;
      if (status !== "granted" && perm.canAskAgain) {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
      }
      if (status !== "granted") return null;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      cache = { coords, at: Date.now() };
      return coords;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function clearLocationCache() {
  cache = null;
}

/** Non-blocking read of cached coords (used to gate UI while a fresh fetch runs). */
export function peekLocationCache(): Coords | null {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.coords;
  return null;
}
