// src/app/demo/page.tsx
// Demo mode landing page — public, no auth required
// Allows potential clients to explore the app with fictional data (read-only)
// RELEVANT FILES: src/app/api/demo/route.ts, src/app/login/page.tsx, src/middleware.ts

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Loader2, Eye, Shield, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function DemoPage() {
  const [loading, setLoading] = useState(false);

  function handleEnterDemo() {
    setLoading(true);
    // Navigate to API route that handles auto-login + redirect
    window.location.href = '/api/demo';
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-primary">
      {/* ───────────── Content ───────────── */}
      <div className="flex flex-1 flex-col items-center justify-center px-5">
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Image src="/logo-icon.svg" alt="" width={56} height={56} className="invert" />
          <h1 className="text-3xl font-bold tracking-tight text-primary-foreground lg:text-4xl">
            Eskout
          </h1>
          <p className="text-sm text-primary-foreground/60">
            Plataforma de scouting e recrutamento de formação
          </p>
        </div>

        {/* Demo card */}
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-2 text-center">
              <h2 className="text-xl font-semibold">Modo Demonstração</h2>
              <p className="text-sm text-muted-foreground">
                Explore a plataforma com dados fictícios de um clube de formação.
                Todas as funcionalidades estão disponíveis em modo de leitura.
              </p>
            </div>

            {/* Feature highlights */}
            <div className="space-y-3">
              <FeatureRow icon={<Eye className="h-4 w-4" />} text="Plantel real vs plantel sombra" />
              <FeatureRow icon={<BarChart3 className="h-4 w-4" />} text="Pipeline de recrutamento" />
              <FeatureRow icon={<Shield className="h-4 w-4" />} text="Dados fictícios — apenas leitura" />
            </div>

            <Button
              onClick={handleEnterDemo}
              className="h-11 w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  A entrar...
                </>
              ) : (
                'Entrar na Demo'
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              <a href="/login" className="underline hover:text-foreground">
                Já tem conta? Iniciar sessão
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ───────────── Feature Row ───────────── */

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        {icon}
      </div>
      {text}
    </div>
  );
}
