// src/lib/utils/exportSquad.ts
// Export squad data in multiple formats: PDF, image, text, WhatsApp message, print
// Pure functions that receive squad data and produce downloadable output
// RELEVANT FILES: src/components/squad/SquadExportMenu.tsx, src/lib/constants.ts, src/lib/types/index.ts

import { SQUAD_SLOTS, type SquadSlot } from '@/lib/constants';
import type { Player } from '@/lib/types';

/* ───────────── Types ───────────── */

export interface ExportSquadData {
  squadType: 'real' | 'shadow';
  ageGroupLabel: string;
  byPosition: Record<string, Player[]>;
  /** Custom squad name — if set, overrides the default "Plantel"/"Plantel Sombra" label */
  squadName?: string;
}

/* ───────────── Helpers ───────────── */

/** First + last name for long names */
function shortName(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** Format DOB as dd/MM/yyyy */
function formatDob(dob: string | null): string {
  if (!dob) return '';
  try {
    return new Date(dob).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dob;
  }
}

/** Join non-empty strings with separator */
function join(parts: (string | null | undefined)[], sep = ' · '): string {
  return parts.filter(Boolean).join(sep);
}

/** Squad type label in Portuguese — uses custom name if available */
function squadLabel(type: 'real' | 'shadow', customName?: string): string {
  if (customName) return customName;
  return type === 'real' ? 'Plantel' : 'Plantel Sombra';
}

/**
 * Split the title into left (squad/type) and right (age group). When the squad
 * name matches the age group label (e.g. squad "Sub-15" in age group "Sub-15"),
 * collapse into a single part ("Plantel Sub-15") to avoid "Sub-15 — Sub-15".
 */
function titleParts(data: ExportSquadData): { left: string; right: string | null } {
  const left = squadLabel(data.squadType, data.squadName);
  if (data.ageGroupLabel && left === data.ageGroupLabel) {
    const prefix = data.squadType === 'real' ? 'Plantel' : 'Plantel Sombra';
    return { left: `${prefix} ${left}`, right: null };
  }
  return { left, right: data.ageGroupLabel || null };
}

function buildTitle(data: ExportSquadData): string {
  const { left, right } = titleParts(data);
  return right ? `${left} — ${right}` : left;
}

/** Filename-safe label */
function fileLabel(data: ExportSquadData): string {
  return buildTitle(data).replace(/ /g, '_');
}

/** Position emoji for WhatsApp messages */
const POS_EMOJI: Record<string, string> = {
  GR: '🧤', DD: '🛡️', DE: '🛡️', DC: '🛡️', DC_E: '🛡️', DC_D: '🛡️',
  MDC: '⚙️', MC: '⚙️', MOC: '🎯',
  ED: '🏃', EE: '🏃',
  PL: '⚽',
};

/** Get slots that have players */
function activeSlots(data: ExportSquadData): { slot: SquadSlot; label: string; players: Player[] }[] {
  return SQUAD_SLOTS
    .map(({ slot, label }) => ({ slot, label, players: data.byPosition[slot] ?? [] }))
    .filter(({ players }) => players.length > 0);
}

/**
 * Hide interactive UI elements inside a container (buttons, add controls)
 * Returns a cleanup function that restores their visibility.
 */
function hideInteractiveElements(container: HTMLElement): () => void {
  // Hide: add buttons, remove buttons, action bars, ghost buttons
  const selectors = 'button, [data-export-hide]';
  const hidden: { el: HTMLElement; prev: string }[] = [];

  container.querySelectorAll(selectors).forEach((el) => {
    const htmlEl = el as HTMLElement;
    hidden.push({ el: htmlEl, prev: htmlEl.style.display });
    htmlEl.style.display = 'none';
  });

  return () => {
    for (const { el, prev } of hidden) {
      el.style.display = prev;
    }
  };
}

/* ───────────── Excel for Coaches/Directors ───────────── */

export type DirectorExcelColumnId =
  | 'name' | 'dob' | 'position' | 'previousClub' | 'contact' | 'notes'
  | 'foot' | 'naturalPosition' | 'shirtNumber' | 'height'
  | 'secondaryPosition' | 'weight' | 'nationality' | 'birthCountry';

export type DirectorExcelCellValue = string | number | Date | null;

interface DirectorExcelColumnDef {
  id: DirectorExcelColumnId;
  label: string;
  /** Excel column width (character units, ExcelJS convention) */
  width: number;
  defaultEnabled: boolean;
  /** Excel number format applied to data cells (e.g. for dates) */
  numFmt?: string;
  /** Extract the cell value from a Player + the slot label they were rendered under */
  extract: (p: Player, slotLabel: string) => DirectorExcelCellValue;
}

/**
 * Canonical column registry for the directors' Excel export. Order here is the
 * default order shown in the customization dialog.
 *
 * Defaults (defaultEnabled: true) mirror what Ruben asked for: Nome, Data
 * Nascimento, Posição, Clube Anterior, Contacto, Observações. Extras let
 * power users add Pé, Posição Natural, Nº Camisola, Altura.
 */
export const DIRECTOR_EXCEL_COLUMNS: DirectorExcelColumnDef[] = [
  // ── Defaults (Ruben's original ask) ──
  { id: 'name', label: 'Nome', width: 36, defaultEnabled: true, extract: (p) => p.name },
  {
    id: 'dob', label: 'Data Nascimento', width: 16, defaultEnabled: true, numFmt: 'dd/mm/yyyy',
    extract: (p) => {
      if (!p.dob) return null;
      const d = new Date(p.dob);
      return isNaN(d.getTime()) ? null : d;
    },
  },
  { id: 'position', label: 'Posição', width: 18, defaultEnabled: true, extract: (_p, slot) => slot },
  // "Clube Anterior" header but value is the player's current club in our DB —
  // from the receiving director's perspective, that's their previous club.
  { id: 'previousClub', label: 'Clube Anterior', width: 22, defaultEnabled: true, extract: (p) => p.club ?? '' },
  { id: 'contact', label: 'Contacto', width: 16, defaultEnabled: true, extract: (p) => p.contact ?? '' },
  // Always emits empty so directors can fill it in by hand
  { id: 'notes', label: 'Observações', width: 28, defaultEnabled: true, extract: () => '' },
  // ── Extras (off by default) ──
  { id: 'secondaryPosition', label: 'Posição Secundária', width: 18, defaultEnabled: false, extract: (p) => p.secondaryPosition ?? '' },
  { id: 'foot', label: 'Pé', width: 8, defaultEnabled: false, extract: (p) => p.foot ?? '' },
  { id: 'naturalPosition', label: 'Posição Natural', width: 16, defaultEnabled: false, extract: (p) => p.positionNormalized ?? '' },
  { id: 'shirtNumber', label: 'Nº Camisola', width: 12, defaultEnabled: false, extract: (p) => p.shirtNumber ?? '' },
  { id: 'height', label: 'Altura', width: 10, defaultEnabled: false, extract: (p) => p.height ?? '' },
  { id: 'weight', label: 'Peso', width: 10, defaultEnabled: false, extract: (p) => p.weight ?? '' },
  { id: 'nationality', label: 'Nacionalidade', width: 16, defaultEnabled: false, extract: (p) => p.nationality ?? '' },
  { id: 'birthCountry', label: 'País Nascimento', width: 18, defaultEnabled: false, extract: (p) => p.birthCountry ?? '' },
];

const COLUMNS_BY_ID = new Map(DIRECTOR_EXCEL_COLUMNS.map((c) => [c.id, c]));

/** Default-on column IDs in registry order — used by the dialog and as the export fallback */
export const DEFAULT_DIRECTOR_COLUMN_IDS: DirectorExcelColumnId[] =
  DIRECTOR_EXCEL_COLUMNS.filter((c) => c.defaultEnabled).map((c) => c.id);

export interface DirectorExcelPayload {
  title: string;
  subtitle: string;
  headers: string[];
  rows: DirectorExcelCellValue[][];
  /** Column metadata aligned 1:1 with headers/rows for Excel rendering */
  columns: DirectorExcelColumnDef[];
}

/** Compute the Portuguese football season label for a given date (Jul 1 → Jun 30) */
function seasonLabel(now: Date = new Date()): string {
  const year = now.getFullYear();
  const startYear = now.getMonth() >= 6 ? year : year - 1; // July (index 6) onwards is new season
  return `${startYear}/${startYear + 1}`;
}

/**
 * Resolve a list of column IDs into validated DirectorExcelColumnDef entries.
 * Unknown IDs are dropped silently — that way an outdated localStorage entry
 * (e.g. a column we removed in a future release) doesn't crash the export.
 * If the resulting list is empty, falls back to the defaults so the user always
 * gets a usable file.
 */
function resolveColumns(columnIds?: DirectorExcelColumnId[]): DirectorExcelColumnDef[] {
  const ids = columnIds?.length ? columnIds : DEFAULT_DIRECTOR_COLUMN_IDS;
  const cols = ids.map((id) => COLUMNS_BY_ID.get(id)).filter((c): c is DirectorExcelColumnDef => !!c);
  if (cols.length === 0) {
    return DEFAULT_DIRECTOR_COLUMN_IDS.map((id) => COLUMNS_BY_ID.get(id)!);
  }
  return cols;
}

/**
 * Build the rows + headers for the directors' Excel — pure function, easy to test.
 * `columnIds` is the user's chosen order/selection; defaults to enabled-by-default.
 */
export function buildDirectorExcelPayload(
  data: ExportSquadData,
  columnIds?: DirectorExcelColumnId[],
  now: Date = new Date(),
): DirectorExcelPayload {
  const columns = resolveColumns(columnIds);
  const rows: DirectorExcelCellValue[][] = [];
  for (const { label, players } of activeSlots(data)) {
    for (const p of players) {
      rows.push(columns.map((c) => c.extract(p, label)));
    }
  }
  return {
    title: buildTitle(data),
    subtitle: `Época Desportiva ${seasonLabel(now)}`,
    headers: columns.map((c) => c.label),
    rows,
    columns,
  };
}

/**
 * Excel export for coaches/directors. Mimics the printed list format they're
 * used to: title + season subtitle, then a table grouped in pitch order.
 * Empty cells (Contacto/Observações) are intentional — for hand editing.
 */
export async function exportAsExcel(
  data: ExportSquadData,
  columnIds?: DirectorExcelColumnId[],
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const payload = buildDirectorExcelPayload(data, columnIds);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Eskout';
  wb.created = new Date();

  const ws = wb.addWorksheet('Plantel');
  const colCount = payload.headers.length;

  // Row 1: Title (merged across all columns)
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = payload.title;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 22;

  // Row 2: Subtitle (season)
  ws.mergeCells(2, 1, 2, colCount);
  const subtitleCell = ws.getCell(2, 1);
  subtitleCell.value = payload.subtitle;
  subtitleCell.font = { italic: true, size: 10, color: { argb: 'FF737373' } };
  subtitleCell.alignment = { horizontal: 'left', vertical: 'middle' };

  // Row 3: blank spacer

  // Row 4: Column headers
  const headerRow = ws.getRow(4);
  payload.headers.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
  });
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 20;

  // Rows 5+: player data, applying numFmt per-column where defined
  payload.rows.forEach((r, rowIdx) => {
    const row = ws.getRow(5 + rowIdx);
    r.forEach((value, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = value;
      const numFmt = payload.columns[colIdx].numFmt;
      if (numFmt) cell.numFmt = numFmt;
    });
  });

  // Column widths from registry
  payload.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  // Auto-filter on header row + freeze panes below it
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: colCount } };
  ws.views = [{ state: 'frozen', ySplit: 4 }];

  // Generate buffer → trigger download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileLabel(data)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ───────────── Plain Text ───────────── */

export function exportAsText(data: ExportSquadData): string {
  // Uppercase only the squad/type label, leave the age group in original case
  const { left, right } = titleParts(data);
  const title = right ? `${left.toUpperCase()} — ${right}` : left.toUpperCase();
  const date = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const lines: string[] = [title, date, ''];

  for (const { slot, label, players } of activeSlots(data)) {
    lines.push(`${slot} — ${label}`);
    players.forEach((p, i) => {
      const rank = data.squadType === 'shadow' ? `${i + 1}. ` : '• ';
      const details = join([p.club, p.foot, formatDob(p.dob)]);
      lines.push(`  ${rank}${shortName(p.name)}${details ? ` (${details})` : ''}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/* ───────────── WhatsApp Message ───────────── */

export function exportAsWhatsApp(data: ExportSquadData): string {
  const title = `⚽ *${buildTitle(data)}*`;
  const date = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const lines: string[] = [title, `📅 ${date}`, ''];

  for (const { slot, label, players } of activeSlots(data)) {
    const emoji = POS_EMOJI[slot] ?? '📋';
    lines.push(`${emoji} *${slot} — ${label}*`);
    players.forEach((p, i) => {
      const rank = data.squadType === 'shadow' ? `${i + 1}.` : '•';
      const details = join([p.club, p.foot]);
      lines.push(`${rank} ${shortName(p.name)}${details ? ` — ${details}` : ''}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/* ───────────── Copy to Clipboard ───────────── */

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }
}

/* ───────────── Shared: open PDF blob for printing ───────────── */

function openPdfForPrint(doc: { output: (type: 'blob') => Blob }): void {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url);
  if (printWindow) {
    printWindow.addEventListener('load', () => {
      printWindow.print();
      // Revoke after a delay to allow the print dialog to use the blob
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
  } else {
    // Popup blocked — fallback to download
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantel.pdf';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

/* ───────────── PDF Export (structured data) ───────────── */

export async function exportAsPdf(data: ExportSquadData, mode: 'download' | 'print' = 'download'): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(buildTitle(data), margin, y);
  y += 7;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  const date = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  doc.text(`Gerado a ${date}`, margin, y);
  doc.setTextColor(0);
  y += 10;

  // Position sections
  for (const { slot, label, players } of activeSlots(data)) {
    // Check if we need a new page (position header + at least one row ~ 20mm)
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 16;
    }

    // Position header
    doc.setFillColor(26, 26, 26);
    doc.roundedRect(margin, y, pageW - margin * 2, 7, 1, 1, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255);
    doc.text(`${slot} — ${label}`, margin + 3, y + 5);
    doc.setTextColor(0);
    y += 10;

    // Player table
    const headers = data.squadType === 'shadow'
      ? [['#', 'Nome', 'Clube', 'Pé', 'Nasc.']]
      : [['Nome', 'Clube', 'Pé', 'Nasc.']];

    const rows = players.map((p, i) => {
      const row = [
        shortName(p.name),
        p.club || '—',
        p.foot || '—',
        formatDob(p.dob) || '—',
      ];
      if (data.squadType === 'shadow') row.unshift(String(i + 1));
      return row;
    });

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: headers,
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [245, 245, 245], textColor: [60, 60, 60], fontStyle: 'bold' },
      columnStyles: data.squadType === 'shadow'
        ? { 0: { cellWidth: 8, halign: 'center' } }
        : {},
      didDrawPage: () => {
        // Footer on each page
        doc.setFontSize(7);
        doc.setTextColor(160);
        doc.text('Eskout', margin, doc.internal.pageSize.getHeight() - 6);
        doc.text(
          `Página ${doc.getCurrentPageInfo().pageNumber}`,
          pageW - margin,
          doc.internal.pageSize.getHeight() - 6,
          { align: 'right' }
        );
        doc.setTextColor(0);
      },
    });

    // Get the Y position after the table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (mode === 'print') {
    openPdfForPrint(doc);
  } else {
    doc.save(`${fileLabel(data)}.pdf`);
  }
}

/* ───────────── Shared: capture element as PNG data URL ───────────── */

async function captureElement(element: HTMLElement): Promise<string> {
  // html2canvas-pro: fork of html2canvas with native oklch()/lab()/lch() support.
  // Required because Tailwind v4 emits all design tokens as oklch(), and the
  // previous library (html-to-image) crashes when getComputedStyle returns oklch().
  const { default: html2canvas } = await import('html2canvas-pro');

  // Pre-convert cross-origin images to data URLs via our proxy to avoid canvas taint
  const imgs = element.querySelectorAll<HTMLImageElement>('img[src]');
  const originals: { img: HTMLImageElement; src: string }[] = [];

  await Promise.all(Array.from(imgs).map(async (img) => {
    const src = img.src;
    if (src.startsWith('data:') || src.startsWith(window.location.origin)) return;
    originals.push({ img, src });
    try {
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(src)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error('proxy fetch failed');
      const json = await res.json();
      if (json.dataUrl) img.src = json.dataUrl;
    } catch {
      // Hide the image entirely so it doesn't taint the canvas
      img.style.visibility = 'hidden';
    }
  }));

  try {
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });
    return canvas.toDataURL('image/png');
  } finally {
    for (const { img, src } of originals) {
      img.src = src;
      img.style.visibility = '';
    }
  }
}

/* ───────────── Visual PDF (screenshot of current view) ───────────── */

export async function exportAsVisualPdf(element: HTMLElement, data: ExportSquadData, mode: 'download' | 'print' = 'download'): Promise<void> {
  const { jsPDF } = await import('jspdf');

  const restore = hideInteractiveElements(element);

  try {
    const dataUrl = await captureElement(element);

    // Create a temporary image to get dimensions
    const img = new window.Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Falha ao carregar imagem capturada para PDF'));
      img.src = dataUrl;
    });

    // Determine orientation based on aspect ratio
    const landscape = img.width > img.height;
    const doc = new jsPDF({
      orientation: landscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;
    const titleH = 12;

    // Title
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(buildTitle(data), margin, 8);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140);
    const date = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    doc.text(date, pageW - margin, 8, { align: 'right' });
    doc.setTextColor(0);

    // Scale image to fit page
    const imgW = pageW - margin * 2;
    const imgH = (img.height / img.width) * imgW;
    const maxH = pageH - margin - titleH;

    const finalW = imgH > maxH ? (maxH / imgH) * imgW : imgW;
    const finalH = imgH > maxH ? maxH : imgH;

    doc.addImage(dataUrl, 'PNG', margin, titleH, finalW, finalH);

    if (mode === 'print') {
      openPdfForPrint(doc);
    } else {
      doc.save(`${fileLabel(data)}_visual.pdf`);
    }
  } finally {
    restore();
  }
}

/* ───────────── Image Export (PNG) ───────────── */

export async function exportAsImage(element: HTMLElement, data: ExportSquadData): Promise<void> {
  const restore = hideInteractiveElements(element);

  try {
    const dataUrl = await captureElement(element);

    // Trigger download
    const link = document.createElement('a');
    link.download = `${fileLabel(data)}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    restore();
  }
}

/* ───────────── Print (generates PDF then opens browser print dialog) ───────────── */

export async function printTablePdf(data: ExportSquadData): Promise<void> {
  return exportAsPdf(data, 'print');
}

export async function printVisualPdf(element: HTMLElement, data: ExportSquadData): Promise<void> {
  return exportAsVisualPdf(element, data, 'print');
}
