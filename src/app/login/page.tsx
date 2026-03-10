// src/app/login/page.tsx
// Login page with email + password authentication via Supabase Auth
// Public route — unauthenticated users are redirected here by middleware
// RELEVANT FILES: src/actions/auth.ts, src/middleware.ts, src/lib/validators.ts

'use client';

import { useActionState, useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { login, resetPassword } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

/* ───────────── Decorative floating pills — ethereal/space style ───────────── */

function FloatingPills() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* ── Mobile pills (edges, smaller) ── */}
      <span className="absolute left-[3%] top-[4%] rotate-[-10deg] rounded-full bg-blue-400/15 px-4 py-1.5 text-[11px] font-medium text-blue-300/50 blur-[0.5px] lg:hidden">Plantel Sombra</span>
      <span className="absolute right-[4%] top-[6%] rotate-[7deg] rounded-full bg-emerald-400/12 px-4 py-1.5 text-[11px] font-medium text-emerald-300/45 blur-[0.5px] lg:hidden">Calendário</span>
      <span className="absolute left-[20%] top-[11%] rotate-[5deg] rounded-full bg-purple-400/12 px-3 py-1 text-[10px] text-purple-300/40 blur-[0.3px] lg:hidden">Observação</span>
      <span className="absolute right-[22%] top-[13%] rotate-[-4deg] rounded-full bg-yellow-400/12 px-3 py-1 text-[10px] text-yellow-300/40 blur-[0.5px] lg:hidden">Avaliações</span>
      <span className="absolute left-[2%] top-[26%] rotate-[12deg] rounded-full bg-cyan-400/10 px-4 py-1.5 text-[11px] font-medium text-cyan-300/35 blur-[0.8px] lg:hidden">Jogadores</span>
      <span className="absolute left-[5%] top-[46%] rotate-[-6deg] rounded-full bg-blue-500/12 px-3 py-1 text-[10px] text-blue-300/40 blur-[0.5px] lg:hidden">Notas</span>
      <span className="absolute left-[1%] top-[66%] rotate-[8deg] rounded-lg bg-violet-400/10 px-3 py-1 text-xs font-bold text-violet-300/25 blur-[1px] lg:hidden">GR</span>
      <span className="absolute right-[3%] top-[30%] rotate-[-8deg] rounded-full bg-rose-400/12 px-4 py-1.5 text-[11px] font-medium text-rose-300/35 blur-[0.8px] lg:hidden">Abordagens</span>
      <span className="absolute right-[6%] top-[50%] rotate-[5deg] rounded-full bg-orange-400/12 px-3 py-1 text-[10px] text-orange-300/40 blur-[0.5px] lg:hidden">Scout</span>
      <span className="absolute right-[2%] top-[72%] rotate-[-5deg] rounded-full bg-sky-400/10 px-3 py-1 text-[10px] text-sky-300/30 blur-[1px] lg:hidden">Histórico</span>
      <span className="absolute bottom-[14%] left-[4%] rotate-[5deg] rounded-full bg-teal-400/12 px-4 py-1.5 text-[11px] font-medium text-teal-300/40 blur-[0.5px] lg:hidden">Base de Dados</span>
      <span className="absolute bottom-[5%] left-[20%] rotate-[-8deg] rounded-full bg-green-500/10 px-3 py-1 text-[10px] text-green-300/35 blur-[0.8px] lg:hidden">Observadores</span>
      <span className="absolute bottom-[12%] right-[5%] rotate-[-5deg] rounded-full bg-indigo-400/12 px-4 py-1.5 text-[11px] font-medium text-indigo-300/40 blur-[0.5px] lg:hidden">Planteis</span>
      <span className="absolute bottom-[4%] right-[22%] rotate-[6deg] rounded-lg bg-fuchsia-400/10 px-3 py-1 text-xs font-bold text-fuchsia-300/25 blur-[1px] lg:hidden">PL</span>
      <span className="absolute left-[28%] top-[19%] rotate-[-3deg] rounded-full bg-white/5 px-3 py-1 text-[10px] text-white/15 blur-[2px] lg:hidden">Posições</span>
      <span className="absolute right-[30%] bottom-[22%] rotate-[8deg] rounded-full bg-white/5 px-3 py-1 text-[10px] text-white/15 blur-[2px] lg:hidden">Recrutamento</span>

      {/* ── Desktop pills — tight orbit around center, very faded ── */}
      {/* Inner ring — closest to logo */}
      <span className="absolute left-[18%] top-[33%] rotate-[-5deg] rounded-full bg-blue-400/10 px-5 py-2 text-sm font-medium text-blue-300/30 blur-[1px] hidden lg:inline">Plantel Sombra</span>
      <span className="absolute right-[16%] top-[30%] rotate-[3deg] rounded-full bg-emerald-400/8 px-5 py-2 text-sm font-medium text-emerald-300/25 blur-[1px] hidden lg:inline">Calendário</span>
      <span className="absolute left-[22%] bottom-[32%] rotate-[4deg] rounded-full bg-rose-400/8 px-5 py-2 text-sm font-medium text-rose-300/25 blur-[1px] hidden lg:inline">Abordagens</span>
      <span className="absolute right-[18%] bottom-[30%] rotate-[-3deg] rounded-full bg-cyan-400/10 px-5 py-2 text-sm font-medium text-cyan-300/30 blur-[1px] hidden lg:inline">Jogadores</span>
      <span className="absolute left-[35%] top-[28%] rotate-[-2deg] rounded-full bg-orange-400/8 px-4 py-1.5 text-xs font-medium text-orange-300/25 blur-[1px] hidden lg:inline">Scout</span>
      <span className="absolute right-[33%] bottom-[26%] rotate-[5deg] rounded-full bg-green-500/8 px-4 py-1.5 text-xs font-medium text-green-300/25 blur-[1px] hidden lg:inline">Observadores</span>

      {/* Outer ring */}
      <span className="absolute left-[10%] top-[20%] rotate-[8deg] rounded-full bg-purple-400/8 px-5 py-2 text-sm font-medium text-purple-300/25 blur-[1.5px] hidden lg:inline">Observação</span>
      <span className="absolute right-[10%] top-[18%] rotate-[-6deg] rounded-full bg-yellow-400/8 px-5 py-2 text-sm font-medium text-yellow-300/25 blur-[1.5px] hidden lg:inline">Avaliações</span>
      <span className="absolute left-[8%] bottom-[20%] rotate-[-7deg] rounded-full bg-teal-400/8 px-5 py-2 text-sm font-medium text-teal-300/25 blur-[1.5px] hidden lg:inline">Base de Dados</span>
      <span className="absolute right-[8%] bottom-[18%] rotate-[5deg] rounded-full bg-indigo-400/8 px-5 py-2 text-sm font-medium text-indigo-300/25 blur-[1.5px] hidden lg:inline">Planteis</span>
      <span className="absolute left-[12%] top-[50%] rotate-[12deg] rounded-full bg-blue-500/6 px-4 py-1.5 text-xs text-blue-300/20 blur-[2px] hidden lg:inline">Notas</span>
      <span className="absolute right-[12%] top-[52%] rotate-[-8deg] rounded-full bg-sky-400/6 px-4 py-1.5 text-xs text-sky-300/20 blur-[2px] hidden lg:inline">Histórico</span>
      <span className="absolute left-[28%] top-[16%] rotate-[6deg] rounded-full bg-fuchsia-400/6 px-4 py-1.5 text-xs text-fuchsia-300/20 blur-[2px] hidden lg:inline">Recrutamento</span>
      <span className="absolute right-[26%] bottom-[14%] rotate-[-4deg] rounded-full bg-white/5 px-4 py-1.5 text-xs text-white/15 blur-[2px] hidden lg:inline">Posições</span>
      <span className="absolute left-[30%] bottom-[16%] rotate-[3deg] rounded-lg bg-violet-400/6 px-4 py-1.5 text-sm font-bold text-violet-300/18 blur-[2px] hidden lg:inline">GR</span>
      <span className="absolute right-[30%] top-[15%] rotate-[-4deg] rounded-lg bg-fuchsia-400/5 px-4 py-1.5 text-sm font-bold text-fuchsia-300/15 blur-[2px] hidden lg:inline">PL</span>

      {/* Ambient glow orbs */}
      <div className="absolute left-[10%] top-[15%] h-32 w-32 rounded-full bg-blue-500/8 blur-3xl lg:h-48 lg:w-48" />
      <div className="absolute right-[10%] top-[60%] h-40 w-40 rounded-full bg-purple-500/6 blur-3xl lg:h-56 lg:w-56" />
      <div className="absolute bottom-[10%] left-[30%] h-36 w-36 rounded-full bg-emerald-500/5 blur-3xl lg:h-52 lg:w-52" />
    </div>
  );
}

/* ───────────── Login form (shared between mobile and desktop) ───────────── */

function LoginForm({ error, isPending, formAction, onResetPassword, resetSent, idPrefix }: {
  error: string | null;
  isPending: boolean;
  formAction: (formData: FormData) => void;
  onResetPassword: (email: string) => void;
  resetSent: boolean;
  idPrefix: string;
}) {
  const emailRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="w-full max-w-sm shadow-xl">
      <CardContent className="space-y-5 pt-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Iniciar sessão</h2>
          <p className="text-sm text-muted-foreground">Introduza as suas credenciais</p>
        </div>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-email`}>Email</Label>
            <Input ref={emailRef} id={`${idPrefix}-email`} name="email" type="email" placeholder="email@exemplo.com" required autoComplete="email" className="h-11" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${idPrefix}-pw`}>Palavra-passe</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => onResetPassword(emailRef.current?.value ?? '')}
              >
                Esqueci a palavra-passe
              </button>
            </div>
            <Input id={`${idPrefix}-pw`} name="password" type="password" placeholder="••••••" required minLength={6} autoComplete="current-password" className="h-11" />
          </div>
          {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
          {resetSent && <p className="text-sm text-green-600" role="status">Email de recuperação enviado! Verifique a sua caixa de correio.</p>}
          <Button type="submit" className="h-11 w-full" disabled={isPending}>
            {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />A entrar...</> : 'Entrar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* ───────────── Page ───────────── */

export default function LoginPage() {
  const [resetSent, setResetSent] = useState(false);

  // useActionState: React 19 built-in for server action loading + error state.
  // isPending is true from the instant the form is submitted until the action resolves.
  const [error, formAction, isPending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const result = await login(formData);
      // Only reached on error — success triggers redirect() inside login()
      return result.success ? null : (result.error ?? 'Erro desconhecido');
    },
    null,
  );

  /* Set dark status bar on iOS for this page only */
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#1a1a1a';
    document.head.appendChild(meta);
    // Only paint body dark on mobile (desktop has split layout with white right side)
    const isMobile = window.innerWidth < 1024;
    if (isMobile) document.body.style.backgroundColor = '#1a1a1a';
    return () => {
      meta.remove();
      document.body.style.backgroundColor = '';
    };
  }, []);

  /* Resize mobile container to match visualViewport — follows keyboard in real time */
  const mobileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !mobileRef.current) return;
    const el = mobileRef.current;

    let raf = 0;
    const sync = () => {
      el.style.height = `${vv.height}px`;
    };
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };

    sync();
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  async function handleResetPassword(email: string) {
    setResetSent(false);
    if (!email) return;
    const result = await resetPassword(email);
    if (result.success) setResetSent(true);
  }

  return (
    <>
      {/* ───────────── Desktop — side by side ───────────── */}
      <div className="hidden min-h-[100dvh] lg:grid lg:grid-cols-2">
        <div className="relative flex flex-col items-center justify-center overflow-hidden bg-primary px-10">
          <FloatingPills />
          <div className="relative z-10 flex flex-col items-center gap-4">
            <Image src="/logo-icon.svg" alt="" width={64} height={64} className="invert" />
            <h1 className="text-4xl font-bold tracking-tight text-primary-foreground">Eskout</h1>
            <p className="text-sm text-primary-foreground/60">Plataforma de scouting e recrutamento de formação</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center px-6">
          <LoginForm error={error} isPending={isPending} formAction={formAction} onResetPassword={handleResetPassword} resetSent={resetSent} idPrefix="d" />
        </div>
      </div>

      {/* ───────────── Mobile — full dark bg + floating card ───────────── */}
      <div ref={mobileRef} className="fixed inset-x-0 top-0 flex flex-col bg-primary px-5 lg:hidden" style={{ height: '100dvh' }}>
        <FloatingPills />
        {/* Top spacer + branding — pushes card to center */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-end pb-4">
          <Image src="/logo-icon.svg" alt="" width={44} height={44} className="invert" />
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-primary-foreground">Eskout</h1>
          <p className="mt-0.5 text-xs text-primary-foreground/50">Plataforma de Scouting</p>
        </div>
        {/* Card — dead center */}
        <div className="relative z-10 w-full self-center max-w-sm">
          <LoginForm error={error} isPending={isPending} formAction={formAction} onResetPassword={handleResetPassword} resetSent={resetSent} idPrefix="m" />
        </div>
        {/* Bottom spacer */}
        <div className="flex-1" />
      </div>
    </>
  );
}
