export type Suggestion = {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
};

// OpenStreetMap Nominatim geocoder.
// Free & no key; keep queries small and add a UA per policy.
export async function searchAddress(q: string, lang: string = "en"): Promise<Suggestion[]> {
  const trimmed = q.trim();
  if (trimmed.length < 3) return [];
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}` +
    `&format=json&limit=6&addressdetails=1&countrycodes=dz&accept-language=${lang}`;
  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim ToS: identify the app.
        "Accept": "application/json",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Suggestion[];
    return data;
  } catch {
    return [];
  }
}
