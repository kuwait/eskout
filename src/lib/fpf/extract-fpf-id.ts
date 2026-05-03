// src/lib/fpf/extract-fpf-id.ts
// Pure helper to pull the FPF player ID out of any FPF-hosted URL we see in our DB
// Lives outside 'use server' files so it can be unit-tested directly
// RELEVANT FILES: src/actions/scraping/fpf-competitions/link-players.ts

/** Extract the FPF player ID from any FPF-hosted URL.
 *  Recognized patterns:
 *    /Player/Logo/12345              (resultados.fpf.pt photos used in match sheets)
 *    ?id=12345                       (imagehandler.fpf.pt ScoreImageHandler.ashx photos)
 *    /playerId/12345                 (www.fpf.pt Ficha-de-Jogador profile URLs)
 *  Returns null when no recognized pattern matches. */
export function extractFpfPlayerIdFromUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  // /Player/Logo/<id>
  let m = url.match(/\/Player\/Logo\/(\d+)/i);
  if (m) return parseInt(m[1], 10);
  // /playerId/<id>
  m = url.match(/\/playerId\/(\d+)/i);
  if (m) return parseInt(m[1], 10);
  // ?id=<id> or &id=<id> — only when scoped to FPF imagehandler. Generic ?id= would
  // false-positive on URLs that happen to have an `id` query param (e.g. tracking).
  if (/imagehandler\.fpf\.pt/i.test(url)) {
    m = url.match(/[?&]id=(\d+)/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}
