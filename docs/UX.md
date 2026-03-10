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

---

## 2. Mobile Navigation (Hamburger Drawer)

Hamburger menu that slides out, mirrors the sidebar structure:

1. **Jogadores** (Users icon) — Player database
2. **Plantel** (ShieldCheck icon) — Real squad
3. **Sombra** (Shield icon) — Shadow squad
4. **Abordagens** (GitBranch icon) — Recruitment pipeline
5. **Prioritarias** (Bell icon) — Flagged notes inbox (`/alertas`). Shows red badge (urgent count) + yellow badge (important count).
6. **Mais** (Menu icon) — Calendar, Import, Export, Admin (Utilizadores)

---

## 3. Desktop Navigation (Sidebar)
- Jogadores
- Planteis (Real squad)
- Planteis Sombra (Shadow squad)
- Abordagens (Pipeline)
- Calendario
- Notas Prioritarias (Bell icon) — with red badge (urgent count) + yellow badge (important count)
- **Admin section:**
  - Definicoes
  - Importar
  - Exportar
  - Utilizadores

---

## 4. Workflows

### 4.1. Initial Setup
1. Create Supabase project (DB + Auth)
2. Run SQL migrations
3. Deploy frontend to Vercel
4. Create first admin user
5. Upload Excel via Import page → populates database
6. Shadow squad for gen 2012 is pre-loaded during import

### 4.2. Daily Use
1. Open app → Dashboard for selected age group
2. Check Plantel view → compare real vs shadow squads
3. Browse by position → identify gaps
4. Click player → view full profile
5. Admin: change status, move to shadow squad, edit data
6. Scout: add observation note after watching a match

### 4.3. Internal Scout at the Field (Mobile)
1. Open app on phone
2. Jogadores → + Novo (Add New)
3. Fill: name, position, club, date of birth
4. Optionally paste FPF link
5. Save → player appears with status "pool" for admin to review

### 4.4. External Scout Submission
1. Open app on phone (logged in as scout_externo)
2. Automatically lands on `/submeter`
3. Fill: name, position, club, date of birth, foot, notes
4. Save → player appears with status "pool", `created_by` = this scout
5. Form resets for next submission — no access to other pages

### 4.5. Update External Data (Weekly/Monthly)
1. Run `fpf_scraper.py` in terminal
2. Run `zerozero_scraper.py` in terminal
3. Run `extract_reports.py` for new reports
4. Data updates directly in Supabase
