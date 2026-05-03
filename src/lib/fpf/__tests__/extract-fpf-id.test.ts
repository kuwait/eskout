// src/lib/fpf/__tests__/extract-fpf-id.test.ts
// Tests for FPF player ID extraction across all known FPF URL formats
// Catches regressions when FPF rotates IDs or changes URL schemes
// RELEVANT FILES: src/lib/fpf/extract-fpf-id.ts

import { extractFpfPlayerIdFromUrl } from '../extract-fpf-id';

describe('extractFpfPlayerIdFromUrl', () => {
  /* ───────────── Recognized formats ───────────── */

  it('extracts ID from /Player/Logo/<id> (resultados.fpf.pt match sheet photos)', () => {
    expect(extractFpfPlayerIdFromUrl('https://resultados.fpf.pt/Player/Logo/4106529')).toBe(4106529);
  });

  it('extracts ID from /playerId/<id> (www.fpf.pt profile URL)', () => {
    expect(
      extractFpfPlayerIdFromUrl('https://www.fpf.pt/pt/Jogadores/Ficha-de-Jogador/playerId/1939668'),
    ).toBe(1939668);
  });

  it('extracts ID from imagehandler ScoreImageHandler ?id=<id>', () => {
    expect(
      extractFpfPlayerIdFromUrl(
        'https://imagehandler.fpf.pt/ScoreImageHandler.ashx?type=Person&id=4106529&op=t&w=202&h=249',
      ),
    ).toBe(4106529);
  });

  it('extracts when id= is the only query param (no leading &)', () => {
    expect(
      extractFpfPlayerIdFromUrl('https://imagehandler.fpf.pt/ScoreImageHandler.ashx?id=4106527'),
    ).toBe(4106527);
  });

  it('is case-insensitive on path segments', () => {
    expect(extractFpfPlayerIdFromUrl('https://resultados.fpf.pt/player/logo/12345')).toBe(12345);
    expect(extractFpfPlayerIdFromUrl('https://www.fpf.pt/pt/Jogadores/playerid/9999')).toBe(9999);
  });

  /* ───────────── False-positive guards ───────────── */

  it('does NOT match ?id= on non-imagehandler hosts (avoid tracking-param false-positives)', () => {
    // A generic `?id=` on some other site shouldn't be interpreted as an FPF player ID.
    expect(extractFpfPlayerIdFromUrl('https://analytics.example.com/track?id=12345')).toBe(null);
    expect(extractFpfPlayerIdFromUrl('https://www.fpf.pt/some-page?id=12345')).toBe(null);
  });

  it('returns null for null/empty/undefined input', () => {
    expect(extractFpfPlayerIdFromUrl(null)).toBe(null);
    expect(extractFpfPlayerIdFromUrl(undefined)).toBe(null);
    expect(extractFpfPlayerIdFromUrl('')).toBe(null);
  });

  it('returns null for URLs without any recognized FPF ID pattern', () => {
    expect(extractFpfPlayerIdFromUrl('https://www.zerozero.pt/player.php?id=12345')).toBe(null);
    expect(extractFpfPlayerIdFromUrl('https://example.com/random/path')).toBe(null);
  });

  /* ───────────── Real-world cases that triggered earlier bugs ───────────── */

  it('handles FPF ID rotation (legacy fpf_link with old ID, photo_url with new ID)', () => {
    // Same player can have two different FPF IDs over time. Each URL is parsed independently.
    const oldLink = 'https://www.fpf.pt/pt/Jogadores/Ficha-de-Jogador/playerId/1920269';
    const newPhoto = 'https://imagehandler.fpf.pt/ScoreImageHandler.ashx?type=Person&id=4106529&op=t&w=202&h=249';
    expect(extractFpfPlayerIdFromUrl(oldLink)).toBe(1920269);
    expect(extractFpfPlayerIdFromUrl(newPhoto)).toBe(4106529);
  });

  it('does not confuse Person id with goal/cards counts in querystring', () => {
    // The imagehandler URL only ever has the player ID as `id` — but we should still
    // pick the first id= match, not get tripped by other params.
    expect(
      extractFpfPlayerIdFromUrl('https://imagehandler.fpf.pt/ScoreImageHandler.ashx?type=Person&id=42&w=10'),
    ).toBe(42);
  });
});
