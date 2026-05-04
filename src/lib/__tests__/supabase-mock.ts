// src/lib/__tests__/supabase-mock.ts
// Reusable Supabase query-builder mock for server-action tests
// Captures mutation calls (update/insert/upsert/delete) via optional hooks
// RELEVANT FILES: src/actions/__tests__/pipeline.test.ts, src/actions/__tests__/scout-reports.test.ts

import type { Mock } from 'jest-mock';

/* ───────────── Types ───────────── */

export interface MutationCall {
  table: string;
  payload: Record<string, unknown>;
}

export interface DeleteCall {
  table: string;
}

export interface QueryBuilderHooks {
  /** Called when `.update(...)` is invoked. */
  onUpdate?: (table: string, payload: Record<string, unknown>) => void;
  /** Called when `.insert(...)` is invoked. */
  onInsert?: (table: string, payload: Record<string, unknown>) => void;
  /** Called when `.upsert(...)` is invoked. */
  onUpsert?: (table: string, payload: Record<string, unknown>) => void;
  /** Called when `.delete()` is invoked. */
  onDelete?: (table: string) => void;
  /** Per-table terminal resolution. Defaults to `{ data: null, error: null }`. */
  resolveFor?: (table: string) => { data: unknown; error: unknown };
}

/* ───────────── Factory ───────────── */

/** Create a chainable Supabase query builder mock for one table.
 *  All filter methods (eq, in, neq, not, order, range, limit, select) are no-ops returning
 *  the builder itself. Terminal methods (single, maybeSingle, .then) resolve to the value
 *  produced by `hooks.resolveFor(table)` (default null/null). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSupabaseQueryBuilder(table: string, hooks: QueryBuilderHooks = {}): Record<string, Mock | any> {
  const terminal = () => hooks.resolveFor?.(table) ?? { data: null, error: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: Record<string, any> = {};

  builder.update = jest.fn((payload: Record<string, unknown>) => {
    hooks.onUpdate?.(table, payload);
    return builder;
  });
  builder.insert = jest.fn((payload: Record<string, unknown>) => {
    hooks.onInsert?.(table, payload);
    return builder;
  });
  builder.upsert = jest.fn((payload: Record<string, unknown>) => {
    hooks.onUpsert?.(table, payload);
    return builder;
  });
  builder.delete = jest.fn(() => {
    hooks.onDelete?.(table);
    return builder;
  });
  builder.select = jest.fn().mockReturnValue(builder);
  builder.eq = jest.fn().mockReturnValue(builder);
  builder.neq = jest.fn().mockReturnValue(builder);
  builder.in = jest.fn().mockReturnValue(builder);
  builder.not = jest.fn().mockReturnValue(builder);
  builder.is = jest.fn().mockReturnValue(builder);
  builder.order = jest.fn().mockReturnValue(builder);
  builder.range = jest.fn().mockReturnValue(builder);
  builder.limit = jest.fn().mockReturnValue(builder);
  builder.single = jest.fn(() => Promise.resolve(terminal()));
  builder.maybeSingle = jest.fn(() => Promise.resolve(terminal()));
  // Allow `await query` (PostgREST builders are thenable)
  builder.then = (resolve: (v: unknown) => void) => resolve(terminal());

  return builder;
}

/** Create a Supabase client mock. Each `.from(table)` call returns a fresh query builder
 *  using the same hooks. Use this in `jest.mock('@/lib/supabase/server', ...)`. */
export function createSupabaseClientMock(hooks: QueryBuilderHooks = {}) {
  return {
    from: (table: string) => createSupabaseQueryBuilder(table, hooks),
  };
}
