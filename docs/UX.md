# UX & Interface — Eskout

Design principles, navigation structure, and user workflows.

**See also:** [SOP.md](SOP.md) (overview) · [FEATURES.md](FEATURES.md) (feature specs)

---

## 1. Design Principles
- **Mobile-first** — scouts use their phone at the field
- **Simple and clean** — minimum clicks for common actions
- **Team identity** — Boavista FC colors: black and white/checkered as brand identity
- **Immediate feedback** — toast notifications for actions, login button shows spinner via `useActionState`, loading skeletons on page transitions
- **No accidental actions on mobile** — drag-and-drop disabled where it conflicts with scroll (e.g. pipeline Kanban), replaced with explicit action menus
- **Portuguese throughout** — all labels, buttons, messages in PT-PT
- **Safe area insets** — `env(safe-area-inset-*)` support for iPhone notch/dynamic island via `viewport-fit: cover`

---

## 2. Navigation

Navigation items are defined in `src/components/layout/nav-items.ts` and shared by both Sidebar and MobileDrawer. Items are filtered by user role and club feature toggles.

### 2.1. Shared Nav Items (role-filtered via `filterNavItems`)

| Route | Label | Icon | Visibility |
|---|---|---|---|
| `/` | Jogadores | Users | All except scout |
| `/campo/real` | Planteis | ShieldCheck | All except scout |
| `/campo/sombra` | Planteis Sombra | Shield | All except scout (feature: `shadow_squad`) |
| `/pipeline` | Abordagens | GitBranch | All except scout (feature: `pipeline`) |
| `/calendario` | Calendario | CalendarDays | All except scout (feature: `calendar`) |
| `/tarefas` | Tarefas | ListTodo | All except scout |
| `/meus-relatorios` | Meus Relatorios | FileText | Scout only (feature: `scout_submissions`) |
| `/submeter` | Submeter Relatorio | PlusCircle | Scout only (feature: `scout_submissions`) |
| `/meus-jogadores` | Jogadores | Users | Scout only |

### 2.2. Sub-items (rendered inline under Jogadores)

| Route | Label | Icon | Visibility |
|---|---|---|---|
| `/admin/pendentes` | Adicionados | UserPlus | Admin and editor only. Badge: pending player count (red). |
| `/listas` | Listas | List | All except scout. Personal player lists (multi-list system). |

### 2.3. Admin Section (only visible to admin role)

| Route | Label | Feature gate |
|---|---|---|
| `/admin/relatorios` | Relatorios | `scouting_reports` — badge: pending report count (red) |
| `/definicoes` | Clube | none |
| `/exportar` | Exportar | `export` |
| `/admin/utilizadores` | Utilizadores | none |

### 2.4. Footer Actions (all roles)

| Route | Label | Icon | Condition |
|---|---|---|---|
| `/master` | Gestao Admin Eskout | Building2 | Superadmin only |
| `/escolher-clube` | Trocar Clube | ArrowLeftRight | Always visible |
| `/preferencias` | Preferencias | Palette | Always visible |
| (logout) | Sair | LogOut | Always visible |

### 2.5. Badge System

- **Tarefas**: blue badge (pending task count) + red badge (urgent flagged notes count). Appears when either count > 0.
- **Adicionados**: red badge (pending players awaiting approval).
- **Relatorios** (admin): red badge (pending scout reports).

---

## 3. Mobile Navigation (Hamburger Drawer)

`MobileDrawer.tsx` — slide-out panel from the left, visible below `lg` breakpoint.

- Always in the DOM (no Radix Portal) for instant response
- Overlay fades in/out, drawer slides in/out with 250ms transition
- Body scroll locked when open
- Closes on: overlay tap, X button, Escape key, link navigation
- Mirrors the exact same items, sub-items, admin section, and footer as the desktop sidebar
- Touch targets slightly larger than desktop (py-2.5 vs py-2, icons h-5 vs h-4)
- Club logo + name in the header, close button on the right

---

## 4. Desktop Navigation (Sidebar)

`Sidebar.tsx` — fixed left sidebar, 256px wide, visible at `lg` breakpoint and above.

- Club logo + name in the header (links to `/`)
- Main nav items with active state highlighting (`bg-primary text-primary-foreground`)
- Jogadores sub-items indented (pl-10) with smaller text (13px)
- Admin section separated by a heading ("Admin" label, uppercase, muted)
- Footer with superadmin link, club switcher, preferences, and logout

---

## 5. Role-Specific UX

### 5.1. Admin

Full access to everything. Sees:
- All main nav items + all sub-items (Adicionados, A Observar)
- Admin section (Relatorios, Clube, Exportar, Utilizadores)
- Player profiles: all fields, evaluations, opinion badges, reports, observation notes, share/print
- Pipeline: full DnD on desktop, action menus on mobile, all statuses
- Tasks: own tasks + dropdown to view/create tasks for any user
- Listas: own lists + secretly sees all users' lists in "Todas" panel
- Superadmin link visible if the user has the `is_superadmin` flag

### 5.2. Editor

Same as admin except:
- No admin section in the sidebar
- Cannot delete players (soft delete restricted to admin)
- Player profile: full edit, evaluations, opinion badges, reports visible
- Tasks: only own tasks (no admin oversight dropdown)
- Listas: only own lists

### 5.3. Recruiter

Limited view focused on squads and pipeline:
- Main nav: Jogadores, Planteis, Planteis Sombra, Abordagens, Calendario, Tarefas
- No admin section
- Player list: opinion badges and evaluation columns hidden
- Player profile: sees observation notes (`!isRestricted`), personal evaluation stars. Hidden: team evaluations, opinion badges, observer/decision/reports, share/print
- Edit mode restricted to: name, DOB, club, position, foot, nationality, number, contact, photo, links (no scouting fields)
- Blocked routes (middleware): `/exportar`, `/meus-relatorios`, `/submeter`, `/admin`, `/alertas`
- A Observar: own list
- Tasks: only own tasks

### 5.4. Scout

Minimal, submission-focused interface:
- Nav items: Meus Relatorios, Submeter Relatorio, Jogadores (own submitted players via `/meus-jogadores`)
- No access to squads, pipeline, calendar, tasks, listas, admin, export
- Lands on `/submeter` by default
- Player profile: limited fields (no scouting data from other scouts)
- `/meus-jogadores` shows only players created by this scout

---

## 6. Workflows

### 6.1. Initial Setup
1. Create Supabase project (DB + Auth)
2. Run SQL migrations (001-054)
3. Deploy frontend to Vercel
4. Create first admin user
5. Import players via `scripts/import_initial_data.ts`
6. Shadow squad for gen 2012 is pre-loaded during import

### 6.2. Admin Daily Use
1. Open app — lands on Jogadores (player database) for the selected age group
2. Check Planteis — compare real vs shadow squads
3. Check Tarefas — review pending tasks, flagged notes, auto-tasks from pipeline
4. Review Adicionados — approve/reject pending player submissions
5. Browse pipeline — move players through recruitment stages
6. Click player — view full profile, edit data, manage evaluations
7. Check Listas — review personal player lists (A Observar + custom lists)

### 6.3. Scout Workflow (Mobile)
1. Open app on phone — lands on `/submeter`
2. Fill: name, position, club, date of birth, foot, notes
3. Save — player created with status "pool", `created_by` = this scout
4. Form resets for next submission
5. Check `/meus-relatorios` — view submitted reports and their approval status
6. Check `/meus-jogadores` — browse players submitted by this scout

### 6.4. Recruiter Workflow
1. Open app — lands on `/` (player list, no evaluations/opinions visible)
2. Check `/campo/real` — review real squad composition
3. Check `/campo/sombra` — review shadow squad candidates
4. Check `/pipeline` — monitor recruitment pipeline, move players
5. Check `/listas` — manage personal player lists
6. Check `/tarefas` — review own tasks (auto-generated from pipeline actions)

### 6.5. Multi-Club Switching
1. Navigate to `/escolher-clube` (via "Trocar Clube" in sidebar footer)
2. Club picker page shows all clubs the user belongs to
3. Select a club — context switches, all data scoped to the new club
4. Club name and logo update in the sidebar/drawer header

### 6.6. Superadmin Management
1. Navigate to `/master` (link visible in sidebar footer for superadmins only)
2. Master panel has its own sidebar (`MasterSidebar.tsx`) with sub-pages:
   - Dashboard (`/master`) — overview statistics
   - Clubes (`/master/clubes`) — manage clubs, create new clubs, view club details
   - Utilizadores (`/master/utilizadores`) — manage all users across clubs
   - Online (`/master/online`) — monitor currently online users, presence heatmap

### 6.7. Preferences
1. Navigate to `/preferencias` (via sidebar footer)
2. Choose from 10 themes (8 light + 2 dark)
3. Choose from 3 fonts (Inter, DM Sans, Space Grotesk)
4. Settings saved to localStorage, applied instantly

### 6.8. Update External Data (Weekly/Monthly)
1. Run `fpf_scraper.py` in terminal
2. Run `zerozero_scraper.py` in terminal
3. Run `extract_reports.py` for new reports
4. Data updates directly in Supabase
