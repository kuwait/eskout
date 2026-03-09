// src/components/reports/ReportFilters.tsx
// Combined filter bar for reports — scout, decision, rating, position, tags
// Desktop: inline row of selects. Mobile: collapsible filter strip.
// RELEVANT FILES: src/components/reports/ReportsView.tsx, src/actions/scout-reports.ts

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, X } from 'lucide-react';
import { useState } from 'react';

/* ───────────── Filter Options ───────────── */

const DECISION_OPTIONS = ['Assinar', 'Acompanhar', 'Sem interesse', 'Rever'];
const RATING_OPTIONS = [
  { value: '5', label: '5 estrelas' },
  { value: '4', label: '4+ estrelas' },
  { value: '3', label: '3+ estrelas' },
  { value: '2', label: '2+ estrelas' },
];
const POSITION_OPTIONS = ['GR', 'DD', 'DE', 'DC', 'MDC', 'MC', 'MOC', 'ED', 'EE', 'PL'];
const STATUS_OPTIONS = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'rejeitado', label: 'Rejeitado' },
];
const TAG_OPTIONS = ['Prioritário', 'Rever', 'Contactar'];

/* ───────────── Component ───────────── */

export function ReportFilters({ scoutNames }: { scoutNames: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);

  // Current filter values from URL
  const activeStatus = searchParams.get('status') ?? '';
  const activeDecision = searchParams.get('decision') ?? '';
  const activeRating = searchParams.get('ratingMin') ?? '';
  const activePosition = searchParams.get('position') ?? '';
  const activeScout = searchParams.get('scoutName') ?? '';
  const activeTag = searchParams.get('tag') ?? '';

  const activeCount = [activeStatus, activeDecision, activeRating, activePosition, activeScout, activeTag].filter(Boolean).length;

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    // Reset to page 1 when filters change
    params.delete('page');
    router.push(`?${params.toString()}`);
  }

  function clearAll() {
    const params = new URLSearchParams();
    const search = searchParams.get('search');
    if (search) params.set('search', search);
    router.push(`?${params.toString()}`);
  }

  return (
    <div>
      {/* Toggle button (mobile) + active count */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors md:hidden ${
            activeCount > 0 ? 'border-neutral-900 bg-neutral-900 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filtros
          {activeCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-neutral-900">
              {activeCount}
            </span>
          )}
        </button>

        {activeCount > 0 && (
          <button onClick={clearAll} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
            <X className="h-3 w-3" /> Limpar filtros
          </button>
        )}
      </div>

      {/* Filter selects — always visible on desktop, toggled on mobile */}
      <div className={`mt-2 flex flex-wrap gap-2 ${showFilters ? '' : 'hidden md:flex'}`}>
        <FilterSelect
          label="Estado"
          value={activeStatus}
          onChange={(v) => setFilter('status', v)}
          options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <FilterSelect
          label="Decisão"
          value={activeDecision}
          onChange={(v) => setFilter('decision', v)}
          options={DECISION_OPTIONS.map((d) => ({ value: d, label: d }))}
        />
        <FilterSelect
          label="Rating"
          value={activeRating}
          onChange={(v) => setFilter('ratingMin', v)}
          options={RATING_OPTIONS}
        />
        <FilterSelect
          label="Posição"
          value={activePosition}
          onChange={(v) => setFilter('position', v)}
          options={POSITION_OPTIONS.map((p) => ({ value: p, label: p }))}
        />
        {scoutNames.length > 0 && (
          <FilterSelect
            label="Scout"
            value={activeScout}
            onChange={(v) => setFilter('scoutName', v)}
            options={scoutNames.map((s) => ({ value: s, label: s }))}
          />
        )}
        <FilterSelect
          label="Tag"
          value={activeTag}
          onChange={(v) => setFilter('tag', v)}
          options={TAG_OPTIONS.map((t) => ({ value: t, label: t }))}
        />
      </div>
    </div>
  );
}

/* ───────────── Filter Select ───────────── */

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
        value ? 'border-neutral-400 bg-neutral-50 font-medium text-neutral-900' : 'bg-white text-neutral-500'
      }`}
    >
      <option value="">{label}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
