# Data Sources & Files — Eskout

Detailed data model, import sources, normalization rules, and script documentation.

**See also:** [SOP.md](SOP.md) (overview) · [ARCHITECTURE.md](ARCHITECTURE.md) (DB schema)

---

## 1. Primary Database (Excel Import)

**Source file:** `Base_de_Dados_de_Scouting-_Boavista_FC.xlsx`
**Main sheet:** "Base de dados Nova"
**Total players:** 1,982 across all age groups
**Players with FPF link:** 1,980 (99.9%)

**Columns in the Excel file:**

| Col | Header | Type | Notes |
|-----|--------|------|-------|
| A (1) | Nome | Text | Full name |
| B (2) | Opinião Departamento | Text | Values: 1ª Escolha, 2ª Escolha, Acompanhar, Por Observar, Urgente Observar, Sem interesse, Potencial |
| C (3) | FPF | Hyperlink | Cell displays "LINK" but actual URL is in `cell.hyperlink.target`. MUST extract via openpyxl hyperlink, NOT cell value. |
| D (4) | Ano | Formula | `=IF(ISBLANK(F{row}),,YEAR(F{row}))` — MUST use `data_only=True` in openpyxl to get computed value |
| E (5) | Idade | Formula | Age calculation |
| F (6) | Nascimento | Date | Python datetime object |
| G (7) | Clube | Text | Club at time of scouting — MAY BE OUTDATED |
| H (8) | Posição | Text | Free text, inconsistent — NEEDS NORMALIZATION (see Section 4) |
| I (9) | Pé | Text | Dir, Esq, Amb |
| J (10) | Número | Text | Shirt number |
| K (11) | Contacto | Text | Parent/guardian contact. May contain `\n` |
| L (12) | Referenciado | Text | Scout who referred. May contain `\n` |
| M (13) | Observações | Text | Free notes |
| N (14) | Observador | Text | Match observer(s). May contain `\n` |
| O (15) | Avaliação Observador | Text | 2 - Dúvida, 3 - Bom, 4 - Muito Bom, 5 - Excelente |
| P (16) | Decisão Observador | Text | Assinar, Acompanhar, Rever, Sem Interesse |
| Q-V (17-22) | Relatório Observação 1-6 | Text + Hyperlink | Label text in cell value, PDF link in `cell.hyperlink.target` (Google Drive) |

**CRITICAL parsing notes:**
- Column D (Year) is a formula. Open with `openpyxl.load_workbook(file, data_only=True)`.
- Column C (FPF) and Q-V (Reports) have hyperlinks. Extract with `cell.hyperlink.target`.
- Cells may contain `\n` newlines — normalize to ` / ` or `, `.
- Some players have no position, no foot, or other missing fields — handle gracefully.

## 2. Age Group Distribution

| Age Group | Birth Year | Players |
|-----------|-----------|---------|
| Sub-15 | 2011 | 376 |
| Sub-14 | 2012 | 244 |
| Sub-17 | 2009 | 242 |
| Sub-19 | 2004-2007 | 215 |
| Sub-12 | 2014 | 210 |
| Sub-13 | 2013 | 206 |
| Sub-16 | 2010 | 189 |
| Sub-18 | 2008 | 158 |
| Sub-11 | 2015 | 84 |
| Sub-10 | 2016 | 47 |
| Sub-9/8/7 | 2017-2019 | 11 |
| **Total** | | **1,982** |

**Birth year → Age group mapping (season 2025/2026):**
2019→Sub-7, 2018→Sub-8, 2017→Sub-9, 2016→Sub-10, 2015→Sub-11, 2014→Sub-12, 2013→Sub-13, 2012→Sub-14, 2011→Sub-15, 2010→Sub-16, 2009→Sub-17, 2008→Sub-18, 2004-2007→Sub-19

## 3. Pre-defined Shadow Squad (Generation 2012 only)

Pre-load these into the app as shadow squad players. Other age groups start with empty shadow squads.

**GR (5):** Lucas Correia (Lourosa), Afonso Isac (Dragon Force), Santiago Casimiro (Famalicão), Santiago Coutinho (Famalicão), Veniamin Negrych (Arcozelo)

**DE (5):** Gustavo Mota Silva (Salgueiros), Tiago Correia (Dragon Force), Daniel Marques (Leixões), Júlio Lopes (Famalicão), Nuno Porto (Foz)

**DC (10):** Martim Silva/Tim (Grijó), Nélson (Salgueiros), Tiago Rodrigues (Salgueiros), Martim Castro (Alfenense), Duarte Moreira (Lousada), Guilherme Sousa (Leixões), Carlos Soares (Hernâni), João Andrade (Coimbrões), Gonçalo Rodrigues (Coimbrões), Tiago Teixeira (Leça Academia)

**DD (4):** Pedro Bento (Hernâni), Vasco (Arcozelo), Jose Matias (Varzim), Arthur Neves (Alfenense)

**MC (19):** Marco Rafael Leão (Lousada), Afonso Fonseca (Maia), João Tavares (Grijó), Francisco Brandão (Lourosa), Tiago Martinez (Alfenense), Afonso Sousa (Nogueirense), Guilherme Carvalho (Salgueiros), Salvador Babo Coelho (Panther Force), Afonso Rocha (Foz), Luís Ferreira (Salgueiros), Tomás Rocha (Maia), Araújo (Varzim), Gonçalo Sardinha Capingala (Foz), Filipe Viana (Dragon Force), Rodrigo Castelo (Famalicão), Santiago Pinto (Maia), Duarte Outeiro (Col. Ermesinde), João Beleza (Leça), Pedro Bento (Grijó)

**EE/ED (9):** Salvador Costa (Salgueiros), Tomé Bessa (Oliveira do Douro), Manuel Mendes (Foz), Miguel Freitas (Hernâni), Luís Wozniak (Leça), Leandro Lopes (Alfenense), Daniel Santos (Lousada), Martim Magalhães (Alfenense), Lourenço Rosário (Lousada)

**PL (8):** Afonso Silva (Salgueiros), Pedro Gonçalves (Leça), João Fernandes (Sra. da Hora), João Silva (Salgueiros), Tomás Grilo (Dragon Force), Diogo Batista (Famalicão), Martim Almeida (Valadares), Rafael Kole (Col. Ermesinde)

**Unpositioned / To Observe (4):** Gabriel Muenho Silva (Gandra), Afonso Martins (Padroense), Afonso Peixoto (Padroense), Adilson Chimbundo (Valadares)

## 3.1. Scouting Report PDFs

**Total:** 1,545 PDFs across 1,203 players
**Storage:** Google Drive (links in Excel columns Q-V as hyperlinks)
**Format:** `https://drive.google.com/file/d/{FILE_ID}`

All PDFs follow the same Boavista FC template. Fields to extract:

| Category | Field | DB Column |
|----------|-------|-----------|
| Match | Competição | competition |
| Match | Escalão | age_group |
| Match | Jogo | match |
| Match | Data | match_date |
| Match | Resultado | match_result |
| Player | Nome | player_name_report |
| Player | Número | shirt_number_report |
| Player | Ano Nascimento | birth_year_report |
| Player | Pé | foot_report |
| Player | Equipa | team_report |
| Player | Posição | position_report |
| Assessment | Perfil Físico | physical_profile |
| Assessment | Pontos Fortes | strengths |
| Assessment | Pontos Fracos | weaknesses |
| Rating | Avaliação (1-5) | rating |
| Rating | Decisão | decision |
| Rating | Análise | analysis |
| Meta | Contacto | contact_info |
| Meta | Scout / Observador | scout_name |

## 3.2. External Data: FPF
- URL: `https://www.fpf.pt/pt/Jogadores/Ficha-de-Jogador/playerId/{ID}`
- Data: Current club
- Purpose: Detect club changes since scouting
- 1,980 players have FPF links

## 3.3. External Data: ZeroZero
- URL: `https://www.zerozero.pt/jogador/{slug}/{id}`
- Data: Current club/team, games, goals, team history, height, weight, photo, season stats
- Purpose: Enrich player profiles
- Links added manually by admin in app
- Returns 403 on basic scraping — needs realistic headers/cookies/sessions

---

## 4. Position Normalization Reference

The Excel data has free-text positions with many variations. Map them to the 10 position codes:

| Normalized | Input Variations |
|------------|-----------------|
| GR | Guarda Redes, Guarda-Redes, guarda redes |
| DD | Lateral Direito |
| DE | Lateral Esquerdo, DAE, DE/DD |
| DC | Defesa Central, DC, DC/MDC, DC/DE, Defesa-Central, Defesa, Def |
| MDC | Pivô, Médio Defensivo, MDC, Medio Def, Médio Defensivo Centro |
| MC | Médio Centro, MC, Medio Centro, Médio |
| MOC | Médio Ofensivo, MCO, MOD, Médio Ofensivo Centro, MC / MCO |
| ED | Extremo Direito, ED, Ala Direito, Ala direito, ED/PL, ED/DE |
| EE | Extremo Esquerdo, EE, Ala Esquerdo, EE/PL |
| PL | Ponta de Lança, PL, Avançado, Avançado Centro, Avançado/Extremo |

**Ambiguous cases:**
- "Extremo" or "Ala" (without side) → Leave `position_normalized` empty. Admin assigns ED or EE manually in the app.
- "Médio" (without qualifier) → Map to MC
- Compound positions like "DC/MDC" → Map to the first position (DC)
- "Defesa Esquerdo/Extremo Esquerdo" → Map to DE (primary position)

---

## 5. Data Files & Scripts

| File | Description |
|------|-------------|
| `data/all_players.json` | 1,982 players from all age groups, extracted from Excel (with FPF links and report Google Drive links) |
| `docs/SOP.md` | Hub document |
| `docs/report_template.pdf` | Example scouting report PDF for reference when building the parser |
| `scripts/import_initial_data.ts` | TypeScript script to import `all_players.json` into Supabase |
| `scripts/extract_reports.py` | Download PDFs from Google Drive + parse scouting report template into structured data |
| `scripts/full_reset.py` | **Full database reset script** — the single command to rebuild the entire database from scratch |

### Full Reset Script (`scripts/full_reset.py`)

**This is the final step of the project setup.** After all code is deployed, run this script to start with a clean, fully enriched database.

```bash
python3 scripts/full_reset.py
```

**What it does (in order):**
1. **Clears data tables** — deletes all player-related data (asks confirmation: type "RESET")
2. **Imports players** — runs `import_initial_data.ts` to load 1,982 players from `all_players.json`
3. **Scrapes FPF** — fetches current club for each player from FPF website
4. **Scrapes ZeroZero** — fetches stats, history, and photos from ZeroZero
5. **Extracts PDF reports** — downloads and parses scouting report PDFs from Google Drive

**What it DELETES:**
| Table | Description |
|-------|-------------|
| `scouting_reports` | Extracted PDF report data |
| `status_history` | Pipeline/status change log |
| `observation_notes` | Scout field notes |
| `calendar_events` | Calendar events |
| `players` | All players (includes pipeline, squad assignments, etc.) |

**What it does NOT delete:**
| Table | Description |
|-------|-------------|
| `profiles` | User accounts (admin/scout) |
| `age_groups` | Age group definitions (Sub-7 to Sub-19) |

**Flags:**
| Flag | Description |
|------|-------------|
| `--no-clear` | Skip database clear (add to existing data) |
| `--skip-import` | Skip player import |
| `--skip-scrape` | Skip FPF + ZeroZero scraping |
| `--skip-fpf` | Skip FPF only |
| `--skip-zerozero` | Skip ZeroZero only |
| `--skip-reports` | Skip PDF report extraction |
| `--scrape-only` | Only run scraping (no clear, no import, no reports) |
| `--reports-only` | Only run PDF extraction (no clear, no import, no scraping) |

**Requirements:**
```bash
pip3 install pdfplumber supabase python-dotenv google-auth google-api-python-client
```

**Environment (.env.local):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_KEY` — path to Google Service Account JSON key file

### JSON Structure (`all_players.json`)
Each player object has these fields:
```json
{
  "id": 0,
  "name": "Rodrigo Jesus Almeida",
  "year": "2012",
  "escalao": "Sub-14",
  "op": "1ª Escolha",
  "dob": "12/01/2012",
  "club": "Boavista Futebol Clube",
  "pos": "Ponta de Lança",
  "pn": "PL",
  "foot": "Dir",
  "num": "45",
  "contact": "Marco | 912 726 422",
  "ref": "Diogo Nunes",
  "notes": "Único Sub11 a jogar Sub13 2ª Divisão - Titular",
  "obs": "",
  "eval": "",
  "dec": "",
  "fpf": "https://www.fpf.pt/pt/Jogadores/Ficha-de-Jogador/playerId/1853103",
  "reports": ["Report label 1", "Report label 2"],
  "reportLinks": [
    {"num": 1, "label": "2012 Rodrigo Almeida - Boavista FC", "link": "https://drive.google.com/file/d/ABC123"}
  ],
  "status": "signed"
}
```
