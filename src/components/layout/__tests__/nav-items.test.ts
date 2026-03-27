// src/components/layout/__tests__/nav-items.test.ts
// Unit tests for navigation item filtering by role and feature toggles
// Ensures each role sees only their allowed pages — security-critical logic
// RELEVANT FILES: src/components/layout/nav-items.ts, src/components/layout/Sidebar.tsx, src/components/layout/MobileDrawer.tsx

import { filterNavItems, filterAdminItems } from '../nav-items';

/* ───────────── Helpers ───────────── */

const ALL_FEATURES: Record<string, boolean> = {};
const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

/* ───────────── Admin ───────────── */

describe('filterNavItems — admin', () => {
  const items = filterNavItems('admin', ALL_FEATURES);

  it('sees Jogadores, Planteis, Pipeline, Calendário, Tarefas', () => {
    expect(hrefs(items)).toContain('/');
    expect(hrefs(items)).toContain('/campo/real');
    expect(hrefs(items)).toContain('/campo/sombra');
    expect(hrefs(items)).toContain('/pipeline');
    expect(hrefs(items)).toContain('/calendario');
    expect(hrefs(items)).toContain('/tarefas');
  });

  it('does NOT see scout-only pages', () => {
    expect(hrefs(items)).not.toContain('/meus-relatorios');
    expect(hrefs(items)).not.toContain('/submeter');
  });

  it('does NOT see meus-jogadores (scout-only)', () => {
    expect(hrefs(items)).not.toContain('/meus-jogadores');
  });
});

/* ───────────── Editor ───────────── */

describe('filterNavItems — editor', () => {
  const items = filterNavItems('editor', ALL_FEATURES);

  it('sees same main items as admin', () => {
    expect(hrefs(items)).toContain('/');
    expect(hrefs(items)).toContain('/campo/real');
    expect(hrefs(items)).toContain('/pipeline');
    expect(hrefs(items)).toContain('/tarefas');
  });

  it('does NOT see scout-only or recruiter-only pages', () => {
    expect(hrefs(items)).not.toContain('/meus-relatorios');
    expect(hrefs(items)).not.toContain('/submeter');
    expect(hrefs(items)).not.toContain('/meus-jogadores');
  });
});

/* ───────────── Scout ───────────── */

describe('filterNavItems — scout', () => {
  const items = filterNavItems('scout', ALL_FEATURES);

  it('sees Jogadores and Observações', () => {
    expect(hrefs(items)).toContain('/');
    expect(hrefs(items)).toContain('/observacoes');
    // /meus-relatorios is now a sub-item of Observações (rendered in Sidebar, not in NAV_ITEMS)
  });

  it('does NOT see admin/editor-only pages', () => {
    expect(hrefs(items)).not.toContain('/campo/real');
    expect(hrefs(items)).not.toContain('/campo/sombra');
    expect(hrefs(items)).not.toContain('/pipeline');
    expect(hrefs(items)).not.toContain('/calendario');
    expect(hrefs(items)).not.toContain('/tarefas');
  });
});

/* ───────────── Recruiter ───────────── */

describe('filterNavItems — recruiter', () => {
  const items = filterNavItems('recruiter', ALL_FEATURES);

  it('sees Jogadores (main list)', () => {
    expect(hrefs(items)).toContain('/');
  });

  it('sees Planteis, Pipeline, Calendário, Tarefas', () => {
    expect(hrefs(items)).toContain('/campo/real');
    expect(hrefs(items)).toContain('/campo/sombra');
    expect(hrefs(items)).toContain('/pipeline');
    expect(hrefs(items)).toContain('/calendario');
    expect(hrefs(items)).toContain('/tarefas');
  });

  it('does NOT see Meus Jogadores (removed for recruiter)', () => {
    expect(hrefs(items)).not.toContain('/meus-jogadores');
  });

  it('does NOT see scout-only pages', () => {
    expect(hrefs(items)).not.toContain('/meus-relatorios');
    expect(hrefs(items)).not.toContain('/submeter');
  });
});

/* ───────────── Feature Toggles ───────────── */

describe('filterNavItems — feature toggles', () => {
  it('hides shadow squad when feature disabled', () => {
    const items = filterNavItems('admin', { shadow_squad: false });
    expect(hrefs(items)).not.toContain('/campo/sombra');
  });

  it('hides pipeline when feature disabled', () => {
    const items = filterNavItems('admin', { pipeline: false });
    expect(hrefs(items)).not.toContain('/pipeline');
  });

  it('hides calendar when feature disabled', () => {
    const items = filterNavItems('admin', { calendar: false });
    expect(hrefs(items)).not.toContain('/calendario');
  });

  it('hides scout submissions when feature disabled', () => {
    const items = filterNavItems('scout', { scout_submissions: false });
    expect(hrefs(items)).not.toContain('/meus-relatorios');
  });

  it('keeps items when feature not explicitly disabled', () => {
    const items = filterNavItems('admin', { shadow_squad: true });
    expect(hrefs(items)).toContain('/campo/sombra');
  });
});

/* ───────────── Admin Items ───────────── */

describe('filterAdminItems', () => {
  it('returns all items with no feature restrictions', () => {
    const items = filterAdminItems(ALL_FEATURES);
    expect(hrefs(items)).toContain('/definicoes');
    expect(hrefs(items)).toContain('/admin/utilizadores');
    expect(hrefs(items)).toContain('/admin/dados');
  });

  it('does not contain items moved to sidebar subitems', () => {
    const items = filterAdminItems(ALL_FEATURES);
    // Relatórios, Exportar, Objetivos Contacto are now sidebar subitems, not standalone admin items
    expect(hrefs(items)).not.toContain('/admin/relatorios');
    expect(hrefs(items)).not.toContain('/exportar');
    expect(hrefs(items)).not.toContain('/admin/objetivos-contacto');
  });
});
