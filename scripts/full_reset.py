#!/usr/bin/env python3
# scripts/full_reset.py
# Full database reset: clear data, import players, scrape external data, extract PDF reports
# Single script to rebuild the entire Eskout database from scratch
# RELEVANT FILES: scripts/import_initial_data.ts, scripts/extract_reports.py, src/actions/scraping.ts

"""
Usage:
    python3 scripts/full_reset.py                    # Full reset (asks confirmation)
    python3 scripts/full_reset.py --skip-import      # Skip player import (already done)
    python3 scripts/full_reset.py --skip-scrape      # Skip FPF/ZeroZero scraping
    python3 scripts/full_reset.py --skip-reports      # Skip PDF report extraction
    python3 scripts/full_reset.py --scrape-only       # Only run FPF/ZeroZero scraping
    python3 scripts/full_reset.py --reports-only      # Only run PDF report extraction
    python3 scripts/full_reset.py --no-clear          # Don't clear DB first

Requires:
    pip3 install pdfplumber supabase python-dotenv google-auth google-api-python-client
    npm install (for player import via npx tsx)

Environment (.env.local):
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    GOOGLE_SERVICE_ACCOUNT_KEY (path to service account JSON)
"""

from __future__ import annotations

import os
import re
import sys
import json
import time
import argparse
import subprocess
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client

# Load env
load_dotenv(Path(__file__).parent.parent / ".env.local")

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

PROJECT_ROOT = Path(__file__).parent.parent

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
}


# ═══════════════════════════════════════════════════════════════
# STEP 1: Clear Database
# ═══════════════════════════════════════════════════════════════

def clear_database():
    """Delete all player-related data from the database."""
    print("\n" + "=" * 60)
    print("STEP 1: Clearing database")
    print("=" * 60)

    # Order matters — foreign keys
    tables = [
        "scouting_reports",
        "status_history",
        "observation_notes",
        "calendar_event_players",
        "calendar_events",
        "players",
    ]

    for table in tables:
        try:
            # Delete all rows — use a filter that matches everything
            result = supabase.table(table).delete().neq("id", -999999).execute()
            count = len(result.data) if result.data else 0
            print(f"  {table}: deleted {count} rows")
        except Exception as e:
            print(f"  {table}: {e}")

    print("  Database cleared!")


# ═══════════════════════════════════════════════════════════════
# STEP 2: Import Players from JSON
# ═══════════════════════════════════════════════════════════════

def import_players():
    """Run the TypeScript import script via npx tsx."""
    print("\n" + "=" * 60)
    print("STEP 2: Importing players from all_players.json")
    print("=" * 60)

    result = subprocess.run(
        ["npx", "tsx", "scripts/import_initial_data.ts"],
        cwd=str(PROJECT_ROOT),
        env={**os.environ, "DOTENV_CONFIG_PATH": str(PROJECT_ROOT / ".env.local")},
    )

    if result.returncode != 0:
        print("  [ERROR] Import failed!")
        sys.exit(1)

    print("  Import complete!")


# ═══════════════════════════════════════════════════════════════
# STEP 3: Scrape FPF + ZeroZero
# ═══════════════════════════════════════════════════════════════

import requests


def normalize_club_name(name: str) -> str:
    """Normalize club name for comparison."""
    result = name.lower()
    for pattern in [r"futebol\s*clube", r"f\.?\s*c\.?", r"s\.?\s*c\.?", r"c\.?\s*f\.?"]:
        result = re.sub(pattern, "", result, flags=re.I)
    result = re.sub(r"[.\-,'\"()]", "", result)
    return re.sub(r"\s+", " ", result).strip()


def clubs_match(a: str, b: str) -> bool:
    if not a or not b:
        return False
    if a == b:
        return True
    na, nb = normalize_club_name(a), normalize_club_name(b)
    return na == nb or na in nb or nb in na


def scrape_fpf(fpf_link: str) -> Optional[dict]:
    """Scrape FPF player page — extracts from embedded var model JSON."""
    try:
        resp = requests.get(fpf_link, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None
        html = resp.text
        m = re.search(r"var\s+model\s*=\s*(\{[\s\S]*?\});", html)
        if not m:
            return None
        model = json.loads(m.group(1))
        return {
            "current_club": model.get("CurrentClub") or None,
            "photo_url": model.get("Image") or None,
            "nationality": model.get("Nationality") or model.get("Nacionalidade") or None,
            "birth_country": model.get("BirthCountry") or model.get("CountryOfBirth") or None,
        }
    except Exception:
        return None


def scrape_zerozero(zz_link: str) -> Optional[dict]:
    """Scrape ZeroZero player page — JSON-LD + HTML card-data sidebar."""
    try:
        resp = requests.get(zz_link, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None

        # ZeroZero serves ISO-8859-1
        html = resp.content.decode("iso-8859-1", errors="replace")

        result = {
            "current_club": None, "current_team": None, "photo_url": None,
            "height": None, "weight": None, "nationality": None,
            "birth_country": None, "position": None, "foot": None,
            "games_season": None, "goals_season": None, "team_history": [],
        }

        # JSON-LD
        ld_match = re.search(r'<script\s+type="application/ld\+json"[^>]*>([\s\S]*?)</script>', html)
        if ld_match:
            try:
                ld = json.loads(ld_match.group(1))
                if isinstance(ld.get("image"), str):
                    result["photo_url"] = ld["image"]
                if ld.get("nationality"):
                    nat = ld["nationality"]
                    result["nationality"] = nat if isinstance(nat, str) else (nat.get("name") if isinstance(nat, dict) else None)
                if ld.get("height"):
                    hm = re.search(r"(\d+)", str(ld["height"]))
                    if hm:
                        result["height"] = int(hm.group(1))
                if ld.get("weight"):
                    wm = re.search(r"(\d+)", str(ld["weight"]))
                    if wm:
                        result["weight"] = int(wm.group(1))
                if ld.get("worksFor"):
                    wf = ld["worksFor"]
                    if isinstance(wf, str) and wf:
                        result["current_club"] = wf
                    elif isinstance(wf, dict):
                        result["current_club"] = wf.get("name")
                    elif isinstance(wf, list) and wf:
                        result["current_club"] = wf[0].get("name") if isinstance(wf[0], dict) else None
                if ld.get("description") and isinstance(ld["description"], str):
                    dm = re.search(r"Joga como\s+.+?\s+em\s+([^,.]+)", ld["description"])
                    if dm and not result["current_club"]:
                        result["current_club"] = dm.group(1).strip()
                    pm = re.search(r"Joga(?:va)? como\s+([^,.]+?)(?:\s+em\s+|\s*[,.])", ld["description"])
                    if pm:
                        result["position"] = pm.group(1).strip()
            except Exception:
                pass

        # Card-data sidebar helpers
        def card_value(label: str) -> Optional[str]:
            m = re.search(rf'card-data__label">{label}</span>[\s\S]*?card-data__value[^>]*>([^<]+)', html, re.I)
            return m.group(1).strip() if m else None

        def card_value_flag(label: str) -> Optional[str]:
            m = re.search(rf'card-data__label">{label}</span>[\s\S]*?class="text">([^<]+)', html, re.I)
            return m.group(1).strip() if m else None

        # Position
        pos = card_value(r"Posi[çc][ãa]o")
        if pos and len(pos) < 40:
            result["position"] = pos

        # Club
        if not result["current_club"]:
            result["current_club"] = card_value_flag("Clube atual")

        # Foot
        foot_raw = card_value(r"P[ée]\s*[Pp]referencial")
        if foot_raw:
            fl = foot_raw.lower()
            if "direito" in fl or fl == "right":
                result["foot"] = "Dir"
            elif "esquerdo" in fl or fl == "left":
                result["foot"] = "Esq"
            elif "ambidextro" in fl or "amb" in fl:
                result["foot"] = "Amb"

        # Birth country, nationality from sidebar
        if not result["birth_country"]:
            result["birth_country"] = card_value_flag(r"Pa[ií]s de Nascimento")
        sidebar_nat = card_value_flag("Nacionalidade")
        if sidebar_nat:
            result["nationality"] = sidebar_nat

        # Height/weight from sidebar
        if not result["height"]:
            h = card_value("Altura")
            if h:
                hn = re.search(r"\d+", h)
                if hn:
                    result["height"] = int(hn.group())
        if not result["weight"]:
            w = card_value("Peso")
            if w:
                wn = re.search(r"\d+", w)
                if wn:
                    result["weight"] = int(wn.group())

        # Club fallback from header
        if not result["current_club"]:
            cm = re.search(r'class="zz-enthdr-club"[^>]*>([^<]+)', html)
            if cm and cm.group(1).strip() != "Sem Equipa":
                result["current_club"] = cm.group(1).strip()

        # Photo fallback
        if not result["photo_url"]:
            im = re.search(r'src="([^"]*(?:cdn-img\.zerozero\.pt|zerozero\.pt)/img/jogadores/[^"]+)"', html)
            if im:
                result["photo_url"] = im.group(1)
        if result["photo_url"] and result["photo_url"].startswith("//"):
            result["photo_url"] = "https:" + result["photo_url"]

        # Career history table
        rows = re.findall(r"<tr[^>]*>[\s\S]*?</tr>", html, re.I)
        is_first = True
        for row_html in rows:
            sm = re.search(r"(20\d{2}/\d{2})", row_html)
            if not sm:
                continue
            season = sm.group(1)
            club_m = re.search(r"<a[^>]*>([^<]+)</a>", row_html)
            club = club_m.group(1).strip() if club_m else ""
            if not club:
                continue
            nums = re.findall(r"<td[^>]*>\s*(\d+)\s*</td>", row_html)
            games = int(nums[0]) if len(nums) > 0 else 0
            goals = int(nums[1]) if len(nums) > 1 else 0
            if is_first:
                result["current_team"] = club
                result["games_season"] = games
                result["goals_season"] = goals
                is_first = False
            result["team_history"].append({"club": club, "season": season, "games": games, "goals": goals})

        # Discard zero values
        if result["height"] == 0:
            result["height"] = None
        if result["weight"] == 0:
            result["weight"] = None

        return result
    except Exception:
        return None


def bulk_scrape():
    """Scrape FPF + ZeroZero for all players with links."""
    print("\n" + "=" * 60)
    print("STEP 3: Scraping FPF + ZeroZero")
    print("=" * 60)

    # Fetch all players with links
    all_players = []
    page_size = 1000
    offset = 0
    while True:
        result = supabase.table("players").select(
            "id, fpf_link, zerozero_link, club, photo_url, zz_photo_url, "
            "height, weight, birth_country, nationality, foot"
        ).range(offset, offset + page_size - 1).execute()
        if not result.data:
            break
        all_players.extend(result.data)
        if len(result.data) < page_size:
            break
        offset += page_size

    # Filter to those with at least one link
    players = [p for p in all_players if p.get("fpf_link") or p.get("zerozero_link")]
    print(f"  Found {len(players)} players with external links (out of {len(all_players)} total)")

    stats = {"fpf_ok": 0, "zz_ok": 0, "updated": 0, "errors": 0}

    for i, player in enumerate(players):
        pid = player["id"]
        if i > 0 and i % 50 == 0:
            print(f"  Progress: {i}/{len(players)} ({stats['fpf_ok']} FPF, {stats['zz_ok']} ZZ, {stats['updated']} updated, {stats['errors']} errors)")

        auto_updates: dict = {}
        cache_updates: dict = {}

        # FPF
        if player.get("fpf_link"):
            fpf = scrape_fpf(player["fpf_link"])
            if fpf:
                stats["fpf_ok"] += 1
                cache_updates["fpf_current_club"] = fpf["current_club"]
                cache_updates["fpf_last_checked"] = "now()"
                # Auto-apply photo if player has none
                if fpf["photo_url"] and not player.get("photo_url") and not player.get("zz_photo_url"):
                    auto_updates["photo_url"] = fpf["photo_url"]
                if fpf["nationality"] and not player.get("nationality"):
                    auto_updates["nationality"] = fpf["nationality"]
                if fpf["birth_country"] and not player.get("birth_country"):
                    auto_updates["birth_country"] = fpf["birth_country"]
            else:
                stats["errors"] += 1

        # Rate limit between requests
        time.sleep(0.3)

        # ZeroZero
        if player.get("zerozero_link"):
            zz = scrape_zerozero(player["zerozero_link"])
            if zz:
                stats["zz_ok"] += 1
                cache_updates["zz_current_club"] = zz["current_club"]
                cache_updates["zz_current_team"] = zz["current_team"]
                cache_updates["zz_games_season"] = zz["games_season"]
                cache_updates["zz_goals_season"] = zz["goals_season"]
                cache_updates["zz_height"] = zz["height"]
                cache_updates["zz_weight"] = zz["weight"]
                cache_updates["zz_photo_url"] = zz["photo_url"]
                cache_updates["zz_team_history"] = zz["team_history"] if zz["team_history"] else None
                cache_updates["zz_last_checked"] = "now()"
                # ZZ photo takes priority
                if zz["photo_url"]:
                    auto_updates["photo_url"] = zz["photo_url"]
                if zz["height"] and not player.get("height"):
                    auto_updates["height"] = zz["height"]
                if zz["weight"] and not player.get("weight"):
                    auto_updates["weight"] = zz["weight"]
                if zz["foot"] and not player.get("foot"):
                    auto_updates["foot"] = zz["foot"]
                if zz["nationality"] and not player.get("nationality") and "nationality" not in auto_updates:
                    auto_updates["nationality"] = zz["nationality"]
            else:
                stats["errors"] += 1

            # Rate limit — ZeroZero is stricter
            time.sleep(1 + (0.5 * (i % 3)))  # Vary delay to look more natural

        # Apply updates
        all_updates = {**cache_updates, **auto_updates}
        if all_updates:
            try:
                supabase.table("players").update(all_updates).eq("id", pid).execute()
                if auto_updates:
                    stats["updated"] += 1
            except Exception as e:
                print(f"  [ERROR] Update failed for player {pid}: {e}")
                stats["errors"] += 1

    print(f"\n  Scraping complete!")
    print(f"    FPF: {stats['fpf_ok']} scraped")
    print(f"    ZeroZero: {stats['zz_ok']} scraped")
    print(f"    Players updated: {stats['updated']}")
    print(f"    Errors: {stats['errors']}")


# ═══════════════════════════════════════════════════════════════
# STEP 4: Extract PDF Reports
# ═══════════════════════════════════════════════════════════════

def extract_reports():
    """Run the PDF report extraction script."""
    print("\n" + "=" * 60)
    print("STEP 4: Extracting PDF reports from Google Drive")
    print("=" * 60)

    result = subprocess.run(
        [sys.executable, "scripts/extract_reports.py"],
        cwd=str(PROJECT_ROOT),
    )

    if result.returncode != 0:
        print("  [WARN] Report extraction had errors (some PDFs may have failed)")


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Full Eskout database reset and rebuild")
    parser.add_argument("--no-clear", action="store_true", help="Don't clear the database first")
    parser.add_argument("--skip-import", action="store_true", help="Skip player import")
    parser.add_argument("--skip-scrape", action="store_true", help="Skip FPF/ZeroZero scraping")
    parser.add_argument("--skip-reports", action="store_true", help="Skip PDF report extraction")
    parser.add_argument("--scrape-only", action="store_true", help="Only run scraping")
    parser.add_argument("--reports-only", action="store_true", help="Only run report extraction")
    args = parser.parse_args()

    print("=" * 60)
    print("  ESKOUT — Full Database Reset")
    print("=" * 60)

    # Shortcut modes
    if args.scrape_only:
        bulk_scrape()
        return
    if args.reports_only:
        extract_reports()
        return

    # Confirmation for destructive operation
    if not args.no_clear and not args.skip_import:
        print("\n  WARNING: This will DELETE all data and reimport from scratch!")
        print("  Tables affected: players, scouting_reports, status_history, observation_notes, calendar_events")
        confirm = input("\n  Type 'RESET' to confirm: ")
        if confirm != "RESET":
            print("  Aborted.")
            return

    # Step 1: Clear
    if not args.no_clear and not args.skip_import:
        clear_database()

    # Step 2: Import
    if not args.skip_import:
        import_players()

    # Step 3: Scrape FPF + ZeroZero
    if not args.skip_scrape:
        bulk_scrape()

    # Step 4: Extract PDF reports
    if not args.skip_reports:
        extract_reports()

    print("\n" + "=" * 60)
    print("  ALL DONE!")
    print("=" * 60)


if __name__ == "__main__":
    main()
