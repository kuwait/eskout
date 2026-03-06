// src/app/definir-password/page.tsx
// Set password page — shown after accepting an invite or password recovery
// User must be authenticated (token exchanged) but needs to set their password
// RELEVANT FILES: src/app/auth/confirm/route.ts, src/actions/auth.ts, src/middleware.ts

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('A palavra-passe deve ter pelo menos 6 caracteres');
      return;
    }

    if (password !== confirm) {
      setError('As palavras-passe não coincidem');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.push('/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-col items-center text-center">
          <Image src="/logo-icon.svg" alt="Eskout" width={56} height={56} className="mb-2" />
          <CardTitle className="text-2xl font-bold tracking-tight">
            Definir palavra-passe
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Escolhe uma palavra-passe para a tua conta
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Palavra-passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar palavra-passe</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="••••••"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'A guardar...' : 'Guardar palavra-passe'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
