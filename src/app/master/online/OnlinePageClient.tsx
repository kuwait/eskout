// src/app/master/online/OnlinePageClient.tsx
// Full online monitoring page — stats, user list, role/device breakdown, heatmap, activity feed
// Polls every 30s for live updates
// RELEVANT FILES: src/app/master/online/page.tsx, src/actions/presence.ts

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wifi, Clock, TrendingUp, Monitor, Smartphone, Search, Activity } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/* ───────────── Types ───────────── */

interface UserClub {
  clubName: string;
  role: string;
}

interface OnlineUser {
  id: string;
  fullName: string;
  lastSeenAt: string;
  page: string;
  rawPage: string | null;
  device: 'mobile' | 'desktop' | null;
  sessionStartedAt: string | null;
  clubs: UserClub[];
}

interface ActivityItem {
  id: number;
  playerName: string;
  playerId: number;
  userName: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  notes: string | null;
  createdAt: string;
}

interface Props {
  initialOnline: OnlineUser[];
  initialRecent: OnlineUser[];
  initialActive24h: number;
  peakToday: number;
  peakTodayAt: string | null;
  heatmap: number[][];
  activityFeed: ActivityItem[];
  excludedUserIds: string[];
}

/* ───────────── Constants ───────────── */

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  scout: 'Scout',
  recruiter: 'Recrutador',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-700',
  editor: 'bg-green-100 text-green-700',
  scout: 'bg-amber-100 text-amber-700',
  recruiter: 'bg-purple-100 text-purple-700',
};

const PAGE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/jogadores': 'Jogadores',
  '/campo': 'Plantel',
  '/campo/real': 'Plantel Real',
  '/campo/sombra': 'Plantel Sombra',
  '/pipeline': 'Pipeline',
  '/posicoes': 'Posições',
  '/calendario': 'Calendário',
  '/alertas': 'Alertas',
  '/exportar': 'Exportar',
  '/submeter': 'Submeter Relatório',
  '/meus-relatorios': 'Meus Relatórios',
  '/meus-jogadores': 'Meus Jogadores',
  '/preferencias': 'Preferências',
  '/definicoes': 'Definições',
  '/admin/pendentes': 'Pendentes',
  '/admin/relatorios': 'Relatórios Admin',
  '/master': 'Gestão',
  '/master/online': 'Online',
};

function getPageLabel(path: string | null): string {
  if (!path) return '—';
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  if (/^\/jogadores\/\d+$/.test(path)) return 'Perfil Jogador';
  for (const [prefix, label] of Object.entries(PAGE_LABELS)) {
    if (path.startsWith(prefix) && prefix !== '/') return label;
  }
  return path;
}

const FIELD_LABELS: Record<string, string> = {
  recruitment_status: 'Estado',
  department_opinion: 'Opinião',
  is_shadow_squad: 'Plantel Sombra',
  is_real_squad: 'Plantel Real',
  shadow_position: 'Posição Sombra',
  position_normalized: 'Posição',
  club: 'Clube',
  observer_decision: 'Decisão',
};

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/* ───────────── Helpers ───────────── */

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function sessionDuration(startedAt: string | null): string {
  if (!startedAt) return '—';
  const diff = Date.now() - new Date(startedAt).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`;
}

function isOnline(lastSeenAt: string): boolean {
  return Date.now() - new Date(lastSeenAt).getTime() < 2 * 60 * 1000;
}

/* ───────────── Heatmap Component ───────────── */

function ActivityHeatmap({ data }: { data: number[][] }) {
  const maxVal = Math.max(1, ...data.flat());

  function cellColor(val: number): string {
    if (val === 0) return 'bg-neutral-100';
    const intensity = val / maxVal;
    if (intensity < 0.25) return 'bg-purple-100';
    if (intensity < 0.5) return 'bg-purple-200';
    if (intensity < 0.75) return 'bg-purple-400';
    return 'bg-purple-600';
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Hour labels */}
        <div className="flex gap-0.5 mb-1 ml-10">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="w-4 text-center text-[9px] text-muted-foreground">
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>
        {/* Rows */}
        {data.map((row, day) => (
          <div key={day} className="flex items-center gap-0.5 mb-0.5">
            <span className="w-9 text-right text-[11px] text-muted-foreground pr-1">{DAY_LABELS[day]}</span>
            {row.map((val, hour) => (
              <div
                key={hour}
                className={`w-4 h-4 rounded-sm ${cellColor(val)}`}
                title={`${DAY_LABELS[day]} ${hour}h: ${val} ações`}
              />
            ))}
          </div>
        ))}
        {/* Legend */}
        <div className="flex items-center gap-1 mt-2 ml-10 text-[10px] text-muted-foreground">
          <span>Menos</span>
          <div className="w-3 h-3 rounded-sm bg-neutral-100" />
          <div className="w-3 h-3 rounded-sm bg-purple-100" />
          <div className="w-3 h-3 rounded-sm bg-purple-200" />
          <div className="w-3 h-3 rounded-sm bg-purple-400" />
          <div className="w-3 h-3 rounded-sm bg-purple-600" />
          <span>Mais</span>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Main Component ───────────── */

export function OnlinePageClient({
  initialOnline,
  initialRecent,
  initialActive24h,
  peakToday,
  peakTodayAt,
  heatmap,
  activityFeed,
  excludedUserIds,
}: Props) {
  const excludedSet = new Set(excludedUserIds);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>(initialOnline);
  const [recentUsers, setRecentUsers] = useState<OnlineUser[]>(initialRecent);
  const [active24h, setActive24h] = useState(initialActive24h);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'online' | 'recent'>('online');
  const [, setTick] = useState(0);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const now = new Date();
    const twoMinAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [onlineRes, recentRes, activeCountRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, last_seen_at, last_page, last_device, session_started_at')
        .gte('last_seen_at', twoMinAgo)
        .order('last_seen_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, full_name, last_seen_at, last_page, last_device, session_started_at')
        .gte('last_seen_at', twentyFourHoursAgo)
        .order('last_seen_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id')
        .gte('last_seen_at', twentyFourHoursAgo),
    ]);

    // Preserve existing club data (not re-fetched on poll)
    const clubLookup = new Map(recentUsers.map((u) => [u.id, u.clubs]));

    const mapUser = (p: { id: string; full_name: string | null; last_seen_at: string; last_page?: string | null; last_device?: string | null; session_started_at?: string | null }) => ({
      id: p.id,
      fullName: p.full_name ?? 'Sem nome',
      lastSeenAt: p.last_seen_at,
      page: getPageLabel(p.last_page ?? null),
      rawPage: p.last_page ?? null,
      device: (p.last_device as 'mobile' | 'desktop' | null) ?? null,
      sessionStartedAt: p.session_started_at ?? null,
      clubs: clubLookup.get(p.id) ?? [],
    });

    if (onlineRes.data) setOnlineUsers(onlineRes.data.filter((p) => !excludedSet.has(p.id)).map(mapUser));
    if (recentRes.data) setRecentUsers(recentRes.data.filter((p) => !excludedSet.has(p.id)).map(mapUser));
    if (activeCountRes.data) {
      setActive24h(activeCountRes.data.filter((p: { id: string }) => !excludedSet.has(p.id)).length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentUsers]);

  useEffect(() => {
    const dataInterval = setInterval(fetchData, 30_000);
    const tickInterval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(tickInterval);
    };
  }, [fetchData]);

  // Current list based on tab
  const currentList = tab === 'online' ? onlineUsers : recentUsers;

  // Filter by search
  const filtered = search
    ? currentList.filter((u) =>
        u.fullName.toLowerCase().includes(search.toLowerCase()) ||
        u.clubs.some((c) => c.clubName.toLowerCase().includes(search.toLowerCase())) ||
        u.page.toLowerCase().includes(search.toLowerCase())
      )
    : currentList;

  // Breakdowns from current online users
  const roleBreakdown: Record<string, number> = {};
  const deviceBreakdown = { mobile: 0, desktop: 0 };
  for (const u of onlineUsers) {
    for (const c of u.clubs) {
      roleBreakdown[c.role] = (roleBreakdown[c.role] ?? 0) + 1;
    }
    if (u.device === 'mobile') deviceBreakdown.mobile++;
    else deviceBreakdown.desktop++;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Utilizadores Online</h1>

      {/* ───── Stats cards ───── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
        <div className="rounded-lg border bg-white p-4">
          <div className="inline-flex rounded-md p-2 bg-emerald-100 text-emerald-700">
            <Wifi className="h-5 w-5" />
          </div>
          <p className="mt-2 text-3xl font-bold">{onlineUsers.length}</p>
          <p className="text-xs text-muted-foreground">Online agora</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="inline-flex rounded-md p-2 bg-sky-100 text-sky-700">
            <Clock className="h-5 w-5" />
          </div>
          <p className="mt-2 text-3xl font-bold">{active24h}</p>
          <p className="text-xs text-muted-foreground">Ativos 24h</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="inline-flex rounded-md p-2 bg-orange-100 text-orange-700">
            <TrendingUp className="h-5 w-5" />
          </div>
          <p className="mt-2 text-3xl font-bold">{peakToday}</p>
          <p className="text-xs text-muted-foreground">
            Pico hoje{peakTodayAt ? ` (${new Date(peakTodayAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })})` : ''}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1.5">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-bold">{deviceBreakdown.desktop}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-bold">{deviceBreakdown.mobile}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Desktop / Mobile</p>
        </div>
      </div>

      {/* ───── Role breakdown (only if online) ───── */}
      {onlineUsers.length > 0 && Object.keys(roleBreakdown).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.entries(roleBreakdown)
            .sort(([, a], [, b]) => b - a)
            .map(([role, count]) => (
              <span key={role} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${ROLE_COLORS[role] ?? 'bg-neutral-100 text-neutral-700'}`}>
                {ROLE_LABELS[role] ?? role}
                <span className="font-bold">{count}</span>
              </span>
            ))}
        </div>
      )}

      {/* ───── Tabs + Search ───── */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex rounded-lg border bg-white p-0.5">
          <button
            type="button"
            onClick={() => setTab('online')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === 'online' ? 'bg-purple-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Online ({onlineUsers.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('recent')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === 'recent' ? 'bg-purple-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Últimas 24h ({active24h})
          </button>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Pesquisar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border bg-white py-2 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* ───── Users list ───── */}
      <div className="rounded-lg border bg-white mb-8">
        <div className="hidden sm:grid grid-cols-[16px_2fr_1fr_80px_64px_64px] gap-x-4 border-b px-4 py-2.5 text-[11px] font-semibold uppercase text-muted-foreground">
          <span className="w-3" />
          <span>Utilizador</span>
          <span>Página</span>
          <span>Dispositivo</span>
          <span>Sessão</span>
          <span>Atividade</span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {search ? 'Nenhum resultado' : tab === 'online' ? 'Nenhum utilizador online' : 'Nenhum utilizador ativo nas últimas 24h'}
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((user) => {
              const online = isOnline(user.lastSeenAt);
              return (
                <li key={user.id} className="px-4 py-3">
                  {/* Mobile layout */}
                  <div className="flex items-center gap-3 sm:hidden">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      {online ? (
                        <>
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        </>
                      ) : (
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-neutral-300" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.fullName}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{user.page}</span>
                        <span>·</span>
                        {user.device === 'mobile' ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                        <span>·</span>
                        <span>{timeAgo(user.lastSeenAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden sm:grid grid-cols-[16px_2fr_1fr_80px_64px_64px] items-center gap-x-4">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      {online ? (
                        <>
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        </>
                      ) : (
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-neutral-300" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <span className="text-sm font-medium truncate block">{user.fullName}</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {user.clubs.map((c, i) => (
                          <span key={i} className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[10px] font-medium ${ROLE_COLORS[c.role] ?? 'bg-neutral-100 text-neutral-600'}`}>
                            {c.clubName} · {ROLE_LABELS[c.role] ?? c.role}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{user.page}</span>
                    <span className="text-xs">
                      {user.device === 'mobile' ? <Smartphone className="h-3.5 w-3.5 text-muted-foreground" /> : <Monitor className="h-3.5 w-3.5 text-muted-foreground" />}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{sessionDuration(user.sessionStartedAt)}</span>
                    <span className={`text-xs whitespace-nowrap ${online ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}`}>
                      {timeAgo(user.lastSeenAt)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ───── Heatmap ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border bg-white p-4">
          <h3 className="text-sm font-semibold mb-3">Atividade por hora (últimos 30 dias)</h3>
          <ActivityHeatmap data={heatmap} />
        </div>

        {/* ───── Activity feed ───── */}
        <div className="rounded-lg border bg-white">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Últimas ações</h3>
          </div>
          {activityFeed.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Sem atividade recente</div>
          ) : (
            <ul className="divide-y max-h-96 overflow-y-auto">
              {activityFeed.map((a) => (
                <li key={a.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm">
                      <span className="font-medium">{a.userName}</span>
                      {' alterou '}
                      <span className="text-muted-foreground">{FIELD_LABELS[a.field] ?? a.field}</span>
                      {' de '}
                      <span className="font-medium">{a.playerName}</span>
                    </p>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(a.createdAt)}</span>
                  </div>
                  {a.oldValue !== null && a.newValue !== null && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.oldValue || '(vazio)'} → {a.newValue || '(vazio)'}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
