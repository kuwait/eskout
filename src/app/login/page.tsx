// src/app/login/page.tsx
// Login page with email + password authentication via Supabase Auth
// Public route — unauthenticated users are redirected here by middleware
// RELEVANT FILES: src/actions/auth.ts, src/middleware.ts, src/lib/validators.ts

'use client';

import { useState } from 'react';
import Image from 'next/image';
import { login } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);

    const result = await login(formData);

    // If we get here, login failed (success redirects via server action)
    if (!result.success) {
      setError(result.error ?? 'Erro desconhecido');
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-col items-center text-center">
          <Image src="/logo-icon.svg" alt="Eskout" width={56} height={56} className="mb-2" />
          <CardTitle className="text-2xl font-bold tracking-tight">
            Eskout
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Plataforma de Scouting
          </p>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="email@exemplo.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Palavra-passe</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••"
                required
                minLength={6}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'A entrar...' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
