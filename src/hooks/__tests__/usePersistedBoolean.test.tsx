/** @jest-environment jsdom */
// src/hooks/__tests__/usePersistedBoolean.test.tsx
// Tests for the SSR-safe boolean state hook with localStorage persistence
// Verifies default fallback, restore from storage, and write-through on update
// RELEVANT FILES: src/hooks/usePersistedBoolean.ts

import { act, renderHook } from '@testing-library/react';
import { usePersistedBoolean } from '../usePersistedBoolean';

describe('usePersistedBoolean', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the default value when nothing is stored', () => {
    const { result } = renderHook(() => usePersistedBoolean('key-a', true));
    expect(result.current[0]).toBe(true);
  });

  it('restores a previously stored value', () => {
    localStorage.setItem('key-b', 'false');
    const { result } = renderHook(() => usePersistedBoolean('key-b', true));
    expect(result.current[0]).toBe(false);
  });

  it('persists updates to localStorage', () => {
    const { result } = renderHook(() => usePersistedBoolean('key-c', true));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('key-c')).toBe('false');
  });

  it('supports functional updates', () => {
    const { result } = renderHook(() => usePersistedBoolean('key-d', true));
    act(() => result.current[1]((prev) => !prev));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('key-d')).toBe('false');
  });

  it('ignores malformed stored values and keeps the default', () => {
    localStorage.setItem('key-e', 'not-a-bool');
    const { result } = renderHook(() => usePersistedBoolean('key-e', true));
    expect(result.current[0]).toBe(true);
  });
});
