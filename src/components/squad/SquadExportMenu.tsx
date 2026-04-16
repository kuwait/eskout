// src/components/squad/SquadExportMenu.tsx
// Dropdown menu for exporting squad data in multiple formats (PDF, image, text, WhatsApp, print)
// Renders a compact button that opens a dropdown with export options
// RELEVANT FILES: src/lib/utils/exportSquad.ts, src/components/squad/SquadPanelView.tsx, src/components/ui/dropdown-menu.tsx

'use client';

import { useState } from 'react';
import { Download, FileText, Image as ImageIcon, MessageCircle, Printer, Copy, Check, Camera, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  exportAsPdf,
  exportAsVisualPdf,
  exportAsImage,
  exportAsExcel,
  exportAsText,
  exportAsWhatsApp,
  copyToClipboard,
  printTablePdf,
  printVisualPdf,
  type ExportSquadData,
} from '@/lib/utils/exportSquad';

interface SquadExportMenuProps {
  data: ExportSquadData;
  /** Ref to the element to capture as image / visual PDF */
  captureRef: React.RefObject<HTMLElement | null>;
}

export function SquadExportMenu({ data, captureRef }: SquadExportMenuProps) {
  const [copied, setCopied] = useState<'text' | 'whatsapp' | null>(null);
  const [exporting, setExporting] = useState(false);

  async function handleCopy(format: 'text' | 'whatsapp') {
    const text = format === 'whatsapp' ? exportAsWhatsApp(data) : exportAsText(data);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(format);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  /** Wrap async export actions with loading state */
  async function withLoading(fn: () => Promise<void>) {
    setExporting(true);
    try { await fn(); } finally { setExporting(false); }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" disabled={exporting}>
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{exporting ? 'A exportar...' : 'Exportar'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {/* ───── Download ───── */}
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Descarregar</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => withLoading(() => exportAsPdf(data))}>
          <FileText className="h-4 w-4" />
          PDF (tabela)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { if (captureRef.current) withLoading(() => exportAsVisualPdf(captureRef.current!, data)); }}>
          <Camera className="h-4 w-4" />
          PDF (visual)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { if (captureRef.current) withLoading(() => exportAsImage(captureRef.current!, data)); }}>
          <ImageIcon className="h-4 w-4" />
          Imagem (PNG)
        </DropdownMenuItem>
        {/* Excel for coaches/directors — only relevant for the real squad */}
        {data.squadType === 'real' && (
          <DropdownMenuItem onClick={() => withLoading(() => exportAsExcel(data))}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel (diretores)
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {/* ───── Copy ───── */}
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Copiar</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handleCopy('text')}>
          {copied === 'text' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          Texto simples
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleCopy('whatsapp')}>
          {copied === 'whatsapp' ? <Check className="h-4 w-4 text-green-600" /> : <MessageCircle className="h-4 w-4" />}
          WhatsApp
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* ───── Print ───── */}
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Imprimir</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => withLoading(() => printTablePdf(data))}>
          <Printer className="h-4 w-4" />
          Imprimir tabela
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { if (captureRef.current) withLoading(() => printVisualPdf(captureRef.current!, data)); }}>
          <Printer className="h-4 w-4" />
          Imprimir visual
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
