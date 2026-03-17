// src/lib/__tests__/quick-report-tags.test.ts
// Tests for tag routing logic and Tag shape contract
// Verifies getTagsForDimension returns correct tags per dimension/position
// RELEVANT FILES: src/lib/constants/quick-report-tags.ts

import { getTagsForDimension, DIMENSIONS, type DimensionKey } from '@/lib/constants/quick-report-tags';

/* ───────────── getTagsForDimension ───────────── */

describe('getTagsForDimension', () => {
  const allKeys: DimensionKey[] = ['tecnica', 'tatica', 'fisico', 'mentalidade', 'potencial'];

  it.each(allKeys)('returns outfield tags for %s when not goalkeeper', (key) => {
    const tags = getTagsForDimension(key, false);
    expect(tags.length).toBeGreaterThan(0);
  });

  it.each(allKeys)('returns GR tags for %s when goalkeeper', (key) => {
    const tags = getTagsForDimension(key, true);
    expect(tags.length).toBeGreaterThan(0);
  });

  it('GR tags differ from outfield tags for tecnica', () => {
    const outfield = getTagsForDimension('tecnica', false);
    const gr = getTagsForDimension('tecnica', true);
    const outfieldLabels = outfield.map(t => t.label);
    const grLabels = gr.map(t => t.label);
    expect(outfieldLabels).not.toEqual(grLabels);
  });

  it('every tag has a non-empty label and valid sentiment', () => {
    for (const key of allKeys) {
      for (const isGk of [false, true]) {
        const tags = getTagsForDimension(key, isGk);
        for (const tag of tags) {
          expect(tag.label).toBeTruthy();
          expect(['positive', 'negative']).toContain(tag.sentiment);
        }
      }
    }
  });

  it('outfield tecnica contains at least one positive and one negative tag', () => {
    const tags = getTagsForDimension('tecnica', false);
    expect(tags.some(t => t.sentiment === 'positive')).toBe(true);
    expect(tags.some(t => t.sentiment === 'negative')).toBe(true);
  });

  it('GR tecnica contains at least one positive and one negative tag', () => {
    const tags = getTagsForDimension('tecnica', true);
    expect(tags.some(t => t.sentiment === 'positive')).toBe(true);
    expect(tags.some(t => t.sentiment === 'negative')).toBe(true);
  });

  it('DIMENSIONS has 5 entries with required fields', () => {
    expect(DIMENSIONS).toHaveLength(5);
    for (const d of DIMENSIONS) {
      expect(d.key).toBeTruthy();
      expect(d.label).toBeTruthy();
      expect(d.emoji).toBeTruthy();
      expect(d.color).toBeTruthy();
      expect(d.borderColor).toBeTruthy();
      expect(d.textColor).toBeTruthy();
    }
  });
});
