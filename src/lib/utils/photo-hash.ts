// src/lib/utils/photo-hash.ts
// Client-side image hashing for photo-based player matching
// Fetches images via /api/image-proxy (which adds CORS headers + auth) and computes SHA-256
// RELEVANT FILES: src/app/api/image-proxy/route.ts, src/app/master/competicoes/[id]/CompetitionStatsClient.tsx

/** Decode a base64 data URL into raw bytes. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return new Uint8Array(0);
  const b64 = dataUrl.slice(commaIdx + 1);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Format a hash buffer as a lowercase hex string. */
function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Fetch an image via the proxy and compute its SHA-256 hash.
 *  Returns null on any failure (proxy error, non-image response, hash failure). */
export async function fetchAndHashImage(imageUrl: string): Promise<string | null> {
  try {
    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) return null;
    const json = (await res.json()) as { dataUrl?: string };
    if (!json.dataUrl) return null;

    const bytes = dataUrlToBytes(json.dataUrl);
    if (bytes.length === 0) return null;

    // crypto.subtle.digest expects an ArrayBuffer-backed view; pass .buffer cast to ArrayBuffer
    // (we know dataUrlToBytes allocates a fresh ArrayBuffer, never SharedArrayBuffer).
    const hashBuf = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
    return bufferToHex(hashBuf);
  } catch {
    return null;
  }
}

/** Hash a list of unique URLs in parallel with a concurrency limit.
 *  Calls onProgress(done, total) after each completion so the UI can show progress.
 *  Returns Map<url, hash | null> — null when fetching/hashing failed. */
export async function hashImagesInParallel(
  urls: string[],
  concurrency = 10,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < urls.length) {
      const idx = cursor++;
      const url = urls[idx];
      const hash = await fetchAndHashImage(url);
      result.set(url, hash);
      done++;
      onProgress?.(done, urls.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);
  return result;
}
