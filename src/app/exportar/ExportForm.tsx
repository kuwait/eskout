// src/app/exportar/ExportForm.tsx
// Client component with filter dropdowns and download buttons for Excel and PDF export
// Excel via Server Action (base64), PDF via jsPDF client-side with data from Server Action
// RELEVANT FILES: src/app/exportar/page.tsx, src/actions/export.ts, src/lib/constants.ts

'use client';

import { useState } from 'react';
import { Braces, Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportPlayersExcel, exportPlayersPdfData, exportFullDatabaseJson } from '@/actions/export';
import type { ExportFilters } from '@/actions/export';

const PDF_COLUMNS = [
  'Nome', 'Clube', 'Posição', 'Pos. 2', 'Pos. 3', 'Pé', 'Nascimento',
  'Nº Camisola', 'Nacionalidade', 'País Nasc.', 'Altura', 'Peso',
  'Opinião Dep.', 'Decisão Obs.', 'Observador', 'Referido por',
  'Estado Pipeline', 'Plantel', 'Plantel Sombra', 'Pos. Sombra',
  'Contacto', 'Notas',
];
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/* ───────────── Constants ───────────── */

const POSITIONS = [
  { value: 'GR', label: 'Guarda-Redes' },
  { value: 'DD', label: 'Defesa Direito' },
  { value: 'DE', label: 'Defesa Esquerdo' },
  { value: 'DC', label: 'Defesa Central' },
  { value: 'MDC', label: 'Médio Defensivo' },
  { value: 'MC', label: 'Médio Centro' },
  { value: 'MOC', label: 'Médio Ofensivo' },
  { value: 'ED', label: 'Extremo Direito' },
  { value: 'EE', label: 'Extremo Esquerdo' },
  { value: 'PL', label: 'Ponta de Lança' },
];

const FEET = [
  { value: 'Dir', label: 'Direito' },
  { value: 'Esq', label: 'Esquerdo' },
  { value: 'Amb', label: 'Ambidestro' },
];

const OPINIONS = [
  '1ª Escolha', '2ª Escolha', 'Acompanhar', 'Urgente Observar',
  'Por Observar', 'Sem interesse', 'Potencial',
];

const STATUSES = [
  { value: 'por_tratar', label: 'Por Tratar' },
  { value: 'em_contacto', label: 'Em Contacto' },
  { value: 'vir_treinar', label: 'Vir Treinar' },
  { value: 'reuniao_marcada', label: 'Reunião Marcada' },
  { value: 'a_decidir', label: 'A Decidir' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'assinou', label: 'Assinou' },
  { value: 'rejeitado', label: 'Rejeitado' },
];

/* ───────────── Component ───────────── */

interface Props {
  ageGroups: { id: number; name: string }[];
  clubs: string[];
}

export function ExportForm({ ageGroups, clubs }: Props) {
  const [ageGroupId, setAgeGroupId] = useState('all');
  const [position, setPosition] = useState('');
  const [club, setClub] = useState('');
  const [foot, setFoot] = useState('');
  const [opinion, setOpinion] = useState('');
  const [status, setStatus] = useState('');
  const [realSquad, setRealSquad] = useState('');
  const [shadowSquad, setShadowSquad] = useState('');
  const [exporting, setExporting] = useState<'excel' | 'pdf' | 'json' | null>(null);

  // Build filters object from current state
  function buildFilters(): ExportFilters {
    return {
      ageGroupId: ageGroupId !== 'all' ? ageGroupId : undefined,
      position: position || undefined,
      club: club || undefined,
      foot: foot || undefined,
      opinion: opinion || undefined,
      status: status || undefined,
      realSquad: realSquad || undefined,
      shadowSquad: shadowSquad || undefined,
    };
  }

  // Trigger browser download from blob
  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ───────────── Excel Export ───────────── */

  async function handleExcelExport() {
    setExporting('excel');
    try {
      const result = await exportPlayersExcel(buildFilters());
      if (!result.success || !result.data) {
        alert(result.error || 'Erro ao exportar');
        setExporting(null);
        return;
      }

      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      downloadBlob(blob, result.filename ?? 'eskout_export.xlsx');
    } catch {
      alert('Erro ao exportar');
    }
    setExporting(null);
  }

  /* ───────────── PDF Export ───────────── */

  async function handlePdfExport() {
    setExporting('pdf');
    try {
      const result = await exportPlayersPdfData(buildFilters());
      if (!result.success || !result.rows) {
        alert(result.error || 'Erro ao exportar');
        setExporting(null);
        return;
      }

      // Dynamic import — autoTable must load before jsPDF instantiation
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default ?? autoTableModule;
      const { jsPDF } = await import('jspdf');

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      // Title
      doc.setFontSize(14);
      doc.text('Eskout — Jogadores', 14, 15);
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`${result.total} jogadores • ${new Date().toLocaleDateString('pt-PT')}`, 14, 21);
      doc.setTextColor(0);

      // Table body — all columns matching PDF_COLUMNS order
      const body = result.rows.map((r) => [
        r.name, r.club, r.position, r.secondary_position, r.tertiary_position,
        r.foot, r.dob, r.shirt_number, r.nationality, r.birth_country,
        r.height, r.weight, r.department_opinion, r.observer_decision,
        r.observer, r.referred_by, r.recruitment_status, r.is_real_squad,
        r.is_shadow_squad, r.shadow_position, r.contact, r.notes,
      ]);

      // Use functional API (works regardless of side-effect timing)
      autoTable(doc, {
        startY: 25,
        head: [PDF_COLUMNS],
        body,
        styles: { fontSize: 5.5, cellPadding: 1, overflow: 'linebreak' },
        headStyles: { fillColor: [26, 26, 26], textColor: 255, fontStyle: 'bold', fontSize: 5.5 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { left: 5, right: 5 },
        tableWidth: 'auto',
      });

      doc.save(result.filename ?? 'eskout_export.pdf');
    } catch (err) {
      console.error('PDF export error:', err);
      alert(`Erro ao exportar PDF: ${err instanceof Error ? err.message : String(err)}`);
    }
    setExporting(null);
  }

  /* ───────────── JSON Export ───────────── */

  async function handleJsonExport() {
    setExporting('json');
    try {
      // Full DB export — ignores filters
      const result = await exportFullDatabaseJson();
      if (!result.success || !result.data) {
        alert(result.error || 'Erro ao exportar');
        setExporting(null);
        return;
      }

      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/json' });
      downloadBlob(blob, result.filename ?? 'eskout_backup.json');
    } catch {
      alert('Erro ao exportar JSON');
    }
    setExporting(null);
  }

  // Use "none" as sentinel for clearing Select (shadcn Select doesn't support empty string)
  function selectVal(v: string) { return v || 'none'; }
  function fromSelect(v: string) { return v === 'none' ? '' : v; }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-4 space-y-4">
        <p className="text-sm font-semibold">Filtros</p>
        <p className="text-xs text-muted-foreground">Seleciona os filtros para exportar. Deixa em branco para exportar tudo.</p>

        <div className="grid grid-cols-2 gap-3">
          {/* Age Group */}
          <FilterSelect
            label="Escalão"
            value={ageGroupId}
            onChange={setAgeGroupId}
            options={[{ value: 'all', label: 'Todos' }, ...ageGroups.map((g) => ({ value: String(g.id), label: g.name }))]}
          />

          {/* Position */}
          <FilterSelect
            label="Posição"
            value={selectVal(position)}
            onChange={(v) => setPosition(fromSelect(v))}
            options={[{ value: 'none', label: 'Todas' }, ...POSITIONS.map((p) => ({ value: p.value, label: p.label }))]}
          />

          {/* Club */}
          <FilterSelect
            label="Clube"
            value={selectVal(club)}
            onChange={(v) => setClub(fromSelect(v))}
            options={[{ value: 'none', label: 'Todos' }, ...clubs.map((c) => ({ value: c, label: c }))]}
          />

          {/* Foot */}
          <FilterSelect
            label="Pé"
            value={selectVal(foot)}
            onChange={(v) => setFoot(fromSelect(v))}
            options={[{ value: 'none', label: 'Todos' }, ...FEET]}
          />

          {/* Opinion */}
          <FilterSelect
            label="Opinião"
            value={selectVal(opinion)}
            onChange={(v) => setOpinion(fromSelect(v))}
            options={[{ value: 'none', label: 'Todas' }, ...OPINIONS.map((o) => ({ value: o, label: o }))]}
          />

          {/* Pipeline Status */}
          <FilterSelect
            label="Estado Pipeline"
            value={selectVal(status)}
            onChange={(v) => setStatus(fromSelect(v))}
            options={[{ value: 'none', label: 'Todos' }, ...STATUSES]}
          />

          {/* Real Squad */}
          <FilterSelect
            label="Plantel"
            value={selectVal(realSquad)}
            onChange={(v) => setRealSquad(fromSelect(v))}
            options={[{ value: 'none', label: 'Todos' }, { value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
          />

          {/* Shadow Squad */}
          <FilterSelect
            label="Plantel Sombra"
            value={selectVal(shadowSquad)}
            onChange={(v) => setShadowSquad(fromSelect(v))}
            options={[{ value: 'none', label: 'Todos' }, { value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Button
          className="w-full"
          size="lg"
          onClick={handleExcelExport}
          disabled={exporting !== null}
        >
          {exporting === 'excel' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {exporting === 'excel' ? 'A gerar...' : 'Excel'}
        </Button>
        <Button
          className="w-full"
          size="lg"
          variant="outline"
          onClick={handlePdfExport}
          disabled={exporting !== null}
        >
          {exporting === 'pdf' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          {exporting === 'pdf' ? 'A gerar...' : 'PDF'}
        </Button>
        <Button
          className="w-full"
          size="lg"
          variant="outline"
          onClick={handleJsonExport}
          disabled={exporting !== null}
        >
          {exporting === 'json' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Braces className="mr-2 h-4 w-4" />}
          {exporting === 'json' ? 'A gerar...' : 'JSON'}
        </Button>
      </div>
    </div>
  );
}

/* ───────────── UI Helper ───────────── */

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
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
