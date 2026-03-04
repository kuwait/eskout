// src/components/players/PlayerForm.tsx
// Mobile-optimized form for adding a new player
// Required fields: name, DOB, position, club. Age group auto-calculated from DOB.
// RELEVANT FILES: src/actions/players.ts, src/lib/validators.ts, src/lib/constants.ts

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPlayer } from '@/actions/players';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { POSITIONS, FOOT_OPTIONS } from '@/lib/constants';

export function PlayerForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);

    const result = await createPlayer(formData);

    if (result.success && result.data) {
      router.push(`/jogadores/${result.data.id}`);
    } else {
      setError(result.error ?? 'Erro desconhecido');
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="pt-6">
        <form action={handleSubmit} className="space-y-4">
          {/* ───────────── Campos obrigatórios ───────────── */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" name="name" required placeholder="Nome completo" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dob">Data de Nascimento *</Label>
            <Input id="dob" name="dob" type="date" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="positionNormalized">Posição *</Label>
            <Select name="positionNormalized" required>
              <SelectTrigger id="positionNormalized">
                <SelectValue placeholder="Selecionar posição" />
              </SelectTrigger>
              <SelectContent>
                {POSITIONS.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.code} — {p.labelPt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="club">Clube *</Label>
            <Input id="club" name="club" required placeholder="Nome do clube" />
          </div>

          {/* ───────────── Campos opcionais ───────────── */}
          <div className="space-y-2">
            <Label htmlFor="foot">Pé</Label>
            <Select name="foot">
              <SelectTrigger id="foot">
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {FOOT_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shirtNumber">Número</Label>
            <Input id="shirtNumber" name="shirtNumber" placeholder="Ex: 10" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact">Contacto</Label>
            <Input id="contact" name="contact" placeholder="Telefone / Email" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fpfLink">Link FPF</Label>
            <Input id="fpfLink" name="fpfLink" type="url" placeholder="https://www.fpf.pt/..." />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" name="notes" rows={3} placeholder="Notas sobre o jogador..." />
          </div>

          {/* Hidden defaults */}
          <input type="hidden" name="departmentOpinion" value="Por Observar" />
          <input type="hidden" name="recruitmentStatus" value="pool" />

          {error && (
            <p className="text-sm text-red-500" role="alert">{error}</p>
          )}

          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'A guardar...' : 'Guardar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
