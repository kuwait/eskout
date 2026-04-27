// src/__mocks__/server-only.ts
// Jest stub for the `server-only` package — no-op in tests (node env)
// Real package throws on import to prevent server-only modules leaking into client bundles
// RELEVANT FILES: jest.config.ts, src/actions/scraping/fpf-fetch.ts

export {};
