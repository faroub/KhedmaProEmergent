// Aggressive multi-pass image compression built for slow Algerian mobile
// data networks. Uses expo-image-manipulator which runs 100% on-device.
//
// Strategy:
//   1) Downscale to a target width (default 1024).
//   2) Encode as JPEG at a low quality (0.55).
//   3) If the result is still above the target file size we recompress with
//      progressively smaller widths / lower qualities until we fit — with a
//      hard floor so we never destroy the image entirely.
//
// Returns the final data-URI, byte count, dimensions, and how many
// compression passes we ran so the UI can surface it to the user.

import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

export type CompressResult = {
  uri: string; // file:// or blob: URI (native/web)
  dataUri: string; // base64 data-URI ready to POST
  bytes: number;
  width: number;
  height: number;
  passes: number;
  originalBytes: number | null;
};

export type CompressOptions = {
  /** Target maximum output size in bytes (default 220 KB). */
  targetBytes?: number;
  /** Maximum width for the first pass, in px (default 1024). */
  initialWidth?: number;
  /** Floor width so we never end up with a thumbnail-only file (default 640). */
  minWidth?: number;
  /** Initial JPEG quality 0..1 (default 0.55). */
  initialQuality?: number;
  /** Absolute floor for quality (default 0.35). */
  minQuality?: number;
};

const DEFAULTS: Required<CompressOptions> = {
  targetBytes: 220 * 1024,
  initialWidth: 1024,
  minWidth: 640,
  initialQuality: 0.55,
  minQuality: 0.35,
};

async function readSize(uri: string): Promise<number | null> {
  try {
    // On web, expo-file-system is limited — we fall back to fetching the blob.
    const info: any = await FileSystem.getInfoAsync(uri, { size: true } as any);
    if (info && typeof info.size === "number") return info.size;
  } catch {}
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    return blob.size;
  } catch {}
  return null;
}

async function toDataUri(uri: string): Promise<{ dataUri: string; bytes: number }> {
  // Read as base64 (works cross-platform via fetch → blob → FileReader).
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = Math.floor((b64.length * 3) / 4);
    return { dataUri: `data:image/jpeg;base64,${b64}`, bytes };
  } catch {
    const res = await fetch(uri);
    const blob = await res.blob();
    const b64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(r.error);
      r.onloadend = () => {
        const s = (r.result as string) || "";
        resolve(s.includes(",") ? s.split(",")[1] : s);
      };
      r.readAsDataURL(blob);
    });
    return { dataUri: `data:image/jpeg;base64,${b64}`, bytes: blob.size };
  }
}

export async function compressImage(
  uri: string,
  opts: CompressOptions = {},
): Promise<CompressResult> {
  const cfg = { ...DEFAULTS, ...opts };
  const originalBytes = await readSize(uri);

  let width = cfg.initialWidth;
  let quality = cfg.initialQuality;
  let last: ImageManipulator.ImageResult | null = null;
  let passes = 0;

  // First pass — always resize down to `initialWidth` (never up).
  last = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
  );
  passes++;

  let sized = await readSize(last.uri);
  if (sized == null) sized = originalBytes ?? cfg.targetBytes; // best effort

  // Iteratively shrink if too big. Each pass reduces width by 20% and quality by 0.1.
  while (sized > cfg.targetBytes && (width > cfg.minWidth || quality > cfg.minQuality)) {
    if (quality > cfg.minQuality) {
      quality = Math.max(cfg.minQuality, +(quality - 0.1).toFixed(2));
    } else if (width > cfg.minWidth) {
      width = Math.max(cfg.minWidth, Math.floor(width * 0.8));
    } else {
      break;
    }
    last = await ImageManipulator.manipulateAsync(
      last!.uri,
      [{ resize: { width } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
    );
    passes++;
    sized = (await readSize(last.uri)) ?? sized;
    if (passes >= 5) break; // hard stop
  }

  const { dataUri, bytes } = await toDataUri(last!.uri);
  return {
    uri: last!.uri,
    dataUri,
    bytes,
    width: last!.width,
    height: last!.height,
    passes,
    originalBytes,
  };
}

/** Nicely format a byte count for UI toasts, e.g. "312 KB". */
export function formatBytes(b: number | null | undefined): string {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}
