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

/** Opinion array to short string */
function opinionStr(opinions: string[]): string {
  if (!opinions.length) return '';
  return opinions.join(', ');
}

/** Squad type label in Portuguese */
function squadLabel(type: 'real' | 'shadow'): string {
  return type === 'real' ? 'Plantel Real' : 'Plantel Sombra';
}

/** Filename-safe label */
function fileLabel(data: ExportSquadData): string {
  return `${squadLabel(data.squadType).replace(/ /g, '_')}_${data.ageGroupLabel.replace(/ /g, '_')}`;
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

/* ───────────── Plain Text ───────────── */

export function exportAsText(data: ExportSquadData): string {
  const title = `${squadLabel(data.squadType).toUpperCase()} — ${data.ageGroupLabel}`;
  const date = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const lines: string[] = [title, date, ''];

  for (const { slot, label, players } of activeSlots(data)) {
    lines.push(`${slot} — ${label}`);
    players.forEach((p, i) => {
      const rank = data.squadType === 'shadow' ? `${i + 1}. ` : '• ';
      const details = join([p.club, p.foot, formatDob(p.dob), opinionStr(p.departmentOpinion)]);
      lines.push(`  ${rank}${shortName(p.name)}${details ? ` (${details})` : ''}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/* ───────────── WhatsApp Message ───────────── */

export function exportAsWhatsApp(data: ExportSquadData): string {
  const title = `⚽ *${squadLabel(data.squadType)} — ${data.ageGroupLabel}*`;
  const date = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const lines: string[] = [title, `📅 ${date}`, ''];

  for (const { slot, label, players } of activeSlots(data)) {
    const emoji = POS_EMOJI[slot] ?? '📋';
    lines.push(`${emoji} *${slot} — ${label}*`);
    players.forEach((p, i) => {
      const rank = data.squadType === 'shadow' ? `${i + 1}.` : '•';
      const details = join([p.club, p.foot, opinionStr(p.departmentOpinion)]);
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
  doc.text(`${squadLabel(data.squadType)} — ${data.ageGroupLabel}`, margin, y);
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
      ? [['#', 'Nome', 'Clube', 'Pé', 'Nasc.', 'Opinião']]
      : [['Nome', 'Clube', 'Pé', 'Nasc.', 'Opinião']];

    const rows = players.map((p, i) => {
      const row = [
        shortName(p.name),
        p.club || '—',
        p.foot || '—',
        formatDob(p.dob) || '—',
        opinionStr(p.departmentOpinion) || '—',
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
  const { toPng } = await import('html-to-image');
  // html-to-image uses the browser's serialization — handles oklch/lab/modern CSS
  return toPng(element, {
    backgroundColor: '#ffffff',
    pixelRatio: 2,
    // Skip cross-origin images that would taint the canvas
    skipAutoScale: true,
  });
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
      img.onerror = reject;
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
    doc.text(`${squadLabel(data.squadType)} — ${data.ageGroupLabel}`, margin, 8);
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
