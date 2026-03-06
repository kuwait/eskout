#!/usr/bin/env python3
# scripts/extract_reports.py
# Extract scouting report data from Google Drive PDFs and insert into scouting_reports table
# Parses the fixed Boavista FC report template using pdfplumber + regex
# RELEVANT FILES: docs/report_template_example.pdf, scripts/import_initial_data.ts, data/all_players.json

"""
Usage:
    python3 scripts/extract_reports.py                    # All players with report links
    python3 scripts/extract_reports.py --player-id 42     # Single player
    python3 scripts/extract_reports.py --retry-errors      # Retry previously failed extractions
    python3 scripts/extract_reports.py --dry-run            # Parse PDFs but don't insert into DB

Requires:
    pip3 install pdfplumber supabase python-dotenv

Environment:
    NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
"""

from __future__ import annotations

import os
import re
import sys
import json
import time
import argparse
import tempfile
from pathlib import Path
from typing import Optional

import pdfplumber
import requests
from dotenv import load_dotenv
from supabase import create_client
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io

# Load env from .env.local (Next.js convention)
load_dotenv(Path(__file__).parent.parent / ".env.local")

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Google Service Account credentials path — set in .env.local or env var
GOOGLE_SA_KEY_PATH = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY", "")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ───────────── Google Drive API ─────────────

def get_drive_service():
    """Initialize Google Drive API v3 client using Service Account credentials."""
    if not GOOGLE_SA_KEY_PATH:
        raise RuntimeError(
            "GOOGLE_SERVICE_ACCOUNT_KEY not set. "
            "Set it to the path of your service account JSON key file in .env.local"
        )
    if not os.path.exists(GOOGLE_SA_KEY_PATH):
        raise RuntimeError(f"Service account key file not found: {GOOGLE_SA_KEY_PATH}")

    creds = service_account.Credentials.from_service_account_file(
        GOOGLE_SA_KEY_PATH,
        scopes=["https://www.googleapis.com/auth/drive.readonly"],
    )
    return build("drive", "v3", credentials=creds)


# Lazy-initialized Drive service — created on first download
_drive_service = None

def _get_drive():
    global _drive_service
    if _drive_service is None:
        _drive_service = get_drive_service()
    return _drive_service


def extract_gdrive_file_id(url: str) -> str | None:
    """Extract file ID from Google Drive URL formats."""
    # https://drive.google.com/file/d/{ID}/view
    # https://drive.google.com/file/d/{ID}
    # https://drive.google.com/open?id={ID}
    m = re.search(r"/d/([a-zA-Z0-9_-]+)", url)
    if m:
        return m.group(1)
    m = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", url)
    if m:
        return m.group(1)
    return None


def download_pdf(file_id: str, dest_path: str) -> bool:
    """Download a PDF from Google Drive using the Service Account API."""
    try:
        drive = _get_drive()
        request = drive.files().get_media(fileId=file_id)

        with open(dest_path, "wb") as f:
            downloader = MediaIoBaseDownload(f, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()

        # Verify it's a PDF
        with open(dest_path, "rb") as f:
            header = f.read(4)
        if header != b"%PDF":
            print(f"  [WARN] Downloaded file is not a PDF for {file_id}")
            return False

        return True
    except Exception as e:
        print(f"  [ERROR] Download failed for {file_id}: {e}")
        return False


# ───────────── PDF Parsing ─────────────

def parse_report_pdf(pdf_path: str) -> dict:
    """Parse a Boavista FC scouting report PDF into structured fields.

    The template has a fixed layout with labeled fields.
    We extract raw text and use regex to find each field value.
    """
    result = {
        "competition": None,
        "age_group": None,
        "match": None,
        "match_date": None,
        "match_result": None,
        "player_name_report": None,
        "shirt_number_report": None,
        "birth_year_report": None,
        "foot_report": None,
        "team_report": None,
        "position_report": None,
        "physical_profile": None,
        "strengths": None,
        "weaknesses": None,
        "rating": None,
        "decision": None,
        "analysis": None,
        "contact_info": None,
        "scout_name": None,
        "raw_text": None,
    }

    try:
        with pdfplumber.open(pdf_path) as pdf:
            if not pdf.pages:
                return result

            page = pdf.pages[0]
            text = page.extract_text() or ""
            result["raw_text"] = text

            if not text.strip():
                return result

            # ── Match context ──
            # COMPETIÇÃO ... ESCALÃO — age group can be multi-word (e.g. "Sub 12", "Infantil A")
            m = re.search(r"COMPETI[ÇC][ÃA]O\s+(.+?)\s+ESCAL[ÃA]O\s+(.+?)$", text, re.I | re.M)
            if m:
                result["competition"] = m.group(1).strip()
                result["age_group"] = m.group(2).strip()

            # JOGO ... DATA
            m = re.search(r"JOGO\s+(.+?)\s+DATA\s+(.+?)$", text, re.I | re.M)
            if m:
                result["match"] = m.group(1).strip()
                date_raw = m.group(2).strip()
                # Try to extract dd/mm/yyyy from messy date text
                date_m = re.search(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", date_raw)
                if date_m:
                    d, mo, y = date_m.group(1), date_m.group(2), date_m.group(3)
                    result["match_date"] = f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
                else:
                    # Fallback: parse English date "Month DDth, YYYY" from garbled text
                    result["match_date"] = _parse_english_date(date_raw)

            # RESULTADO
            m = re.search(r"RESULTADO\s+(.+?)$", text, re.I | re.M)
            if m:
                result["match_result"] = m.group(1).strip()

            # ── Player data ──
            # NOME ... NÚMERO (with or without colons)
            m = re.search(r"NOME:?\s+(.+?)\s+N[ÚU]MERO:?\s+(\S+)", text, re.I)
            if m:
                result["player_name_report"] = m.group(1).strip()
                result["shirt_number_report"] = m.group(2).strip()

            # Birth year — handles "ANO NASCIMENTO" or "DATA NASCIMENTO" with optional colon
            m = re.search(r"(?:ANO|DATA)\s+NASCIMENTO:?\s+(?:\d{1,2}/\d{1,2}/)?(\d{4})", text, re.I)
            if m:
                result["birth_year_report"] = m.group(1)

            # Foot — search only in the player data section (before PERFIL FÍSICO)
            # to avoid matching "pé direito" in assessment text
            player_section_end = re.search(r"PERFIL\s+F[ÍI]SICO", text, re.I)
            player_section = text[:player_section_end.start()] if player_section_end else text[:500]

            foot_pattern = r"(Dir(?:eito)?|Esq(?:uerdo)?|Amb(?:idestro)?|Drt)"
            # Try: "PÉ: Direito" or "PÉ\n...Direito"
            m = re.search(r"P[ÉE]:?\s*(?:\(.*?\))?\s*\n?\s*" + foot_pattern, player_section, re.I)
            if not m:
                # Fallback: foot value on line after "PÉ" — may have birth year between
                m = re.search(r"P[ÉE]\s*\n.*?" + foot_pattern, player_section, re.I)
            if not m:
                # Fallback: near birth year
                m = re.search(r"\d{4}\s+(?:\(\d+\)\s+)?" + foot_pattern, player_section, re.I)
            if m:
                result["foot_report"] = normalize_foot(m.group(1))

            # EQUIPA ... POSIÇÃO (with optional colons)
            m = re.search(r"EQUIPA:?\s+(.+?)\s+POSI[ÇC][ÃA]O:?\s+(.+?)$", text, re.I | re.M)
            if m:
                result["team_report"] = m.group(1).strip()
                result["position_report"] = m.group(2).strip()

            # ── Assessment blocks ──
            # Two-column PDF layout: the text flows across labels.
            # Structure: PERFIL FÍSICO → value → (subtitle) → strengths text start → PONTOS FORTES → strengths text cont → (subtitle) → ... → PONTOS FRACOS → ...
            # Strategy: physical_profile = text between "PERFIL FÍSICO" and "(fisionomia..."
            #           strengths = ALL text between "(fisionomia..." and "PONTOS FRACOS", minus labels/subtitles
            #           weaknesses = ALL text between "PONTOS FRACOS" and "AVALIAÇÃO", minus labels/subtitles

            # Try position-based extraction first (most accurate for two-column PDFs)
            # Falls back to regex-based extraction if position data is insufficient
            pos_result = extract_assessments_by_position(page)
            if pos_result:
                result["physical_profile"] = pos_result.get("physical_profile")
                result["strengths"] = pos_result.get("strengths")
                result["weaknesses"] = pos_result.get("weaknesses")
            else:
                result["physical_profile"] = extract_physical_profile(text)
                result["strengths"] = extract_strengths(text)
                result["weaknesses"] = extract_weaknesses(text)

            # ── Rating / Decision / Analysis ──
            # Layout varies heavily. Common patterns:
            #   Pattern A: "AVALIAÇÃO\n5 Acompanhar Potencial"
            #   Pattern B: "(1-mín; 5-máx) 4 (Assinar / Acompanhar / Acompanhar (Rendimento / Potencial) Potencial"
            # Strategy: find the rating area, extract the rating number, then find decision/analysis values

            # Rating (1-5) — find a single digit near AVALIAÇÃO
            # Match the rating area — may start with DECISÃO or AVALIAÇÃO depending on layout
            rating_area = re.search(
                r"(?:DECIS[ÃA]O\s*\n\s*)?AVALIA[ÇC][ÃA]O[\s\S]*?CONTACTO",
                text, re.I
            )
            if rating_area:
                area = rating_area.group(0)

                # Rating: first standalone digit 1-5 that's not part of template text
                rm = re.search(r"(?:5-m[áa]x\)?\s*)?(\d)(?:\s|$)", area)
                if rm:
                    rating = int(rm.group(1))
                    if 1 <= rating <= 5:
                        result["rating"] = rating

                # Decision: find actual decision value (not the template labels)
                # Template has "(Assinar / Acompanhar / Rever / Sem interesse)" as labels
                # The actual value appears OUTSIDE parentheses or repeated after the template
                # Count occurrences — if a value appears more than in the template, it's the real one
                decisions_found = []
                for dec in ["Acompanhar", "Assinar", "Rever", "Sem [Ii]nteresse"]:
                    matches = re.findall(dec, area, re.I)
                    # Template contains each once inside parens; real value appears an extra time
                    template_count = len(re.findall(dec, "(Assinar / Acompanhar / Rever / Sem interesse)", re.I))
                    if len(matches) > template_count:
                        decisions_found.append(matches[-1].strip().title())

                if decisions_found:
                    result["decision"] = decisions_found[0]
                else:
                    # Fallback: check line-by-line after rating number
                    lines_after_rating = area.split("\n")
                    for line in lines_after_rating:
                        for dec in ["Sem interesse", "Acompanhar", "Assinar", "Rever"]:
                            # Only match if it's NOT inside parentheses
                            if re.search(dec, line, re.I) and not re.search(r"\(" + ".*?" + dec + ".*?" + r"\)", line, re.I):
                                result["decision"] = re.search(dec, line, re.I).group(0).strip().title()
                                break
                        if result["decision"]:
                            break

                # Analysis: look for Rendimento/Potencial on the same line as the rating
                # The rating line typically has: "4 Acompanhar Potencial" or "5 Acompanhar P o t e n c i a l"
                # Try same-line approach first (most reliable), then fallback to post-template
                rating_line = re.search(r"\n\s*(\d)\s+(.+?)$", area, re.M)
                if rating_line and result["decision"]:
                    line_text = rating_line.group(2)
                    dec_idx = line_text.lower().find(result["decision"].lower())
                    if dec_idx >= 0:
                        tail = line_text[dec_idx + len(result["decision"]):].strip()
                        # Collapse spaced letters: "P o t e n c i a l" → "Potencial"
                        if re.match(r"^[A-Za-zÀ-ú](\s[A-Za-zÀ-ú]){3,}", tail):
                            tail = tail.replace(" ", "")
                        if tail and len(tail) > 1:
                            result["analysis"] = tail

                # Fallback: look for Rendimento/Potencial after "(Rendimento / Potencial)" template
                if not result["analysis"]:
                    analysis_m = re.search(r"(?:Potencial\))\s+(.+?)(?:\n|$)", area)
                    if analysis_m:
                        raw_analysis = analysis_m.group(1).strip()
                        if re.match(r"^[A-Za-zÀ-ú](\s[A-Za-zÀ-ú]){3,}", raw_analysis):
                            raw_analysis = raw_analysis.replace(" ", "")
                        # Skip template text
                        if raw_analysis and len(raw_analysis) > 1 and not re.match(r"^(Rever|Sem|Assinar)", raw_analysis, re.I):
                            result["analysis"] = raw_analysis

            # ── Contact & Scout ──
            m = re.search(r"CONTACTO(?:\s+DO\s+ENCARREGADO\s+DE\s+EDUCA[ÇC][ÃA]O)?\s*\n?\s*(.+?)(?:\n|SCOUT)", text, re.I | re.S)
            if m:
                contact = m.group(1).strip()
                # Skip if empty or just template label text
                if contact and contact not in ("SCOUT", "") and not re.match(r"^(DO\s+)?ENCARREGADO", contact, re.I):
                    result["contact_info"] = contact

            m = re.search(r"SCOUT\s*/?\s*OBSERVADOR\s+(.+?)$", text, re.I | re.M)
            if m:
                result["scout_name"] = m.group(1).strip()

    except Exception as e:
        print(f"  [ERROR] PDF parse failed: {e}")

    return result


ENGLISH_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def _parse_english_date(raw: str) -> str | None:
    """Parse English date from garbled PDF text, e.g. '...Saturday, April 22nd, 2023'."""
    m = re.search(
        r"(January|February|March|April|May|June|July|August|September|October|November|December)"
        r"\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})",
        raw, re.I,
    )
    if m:
        month = ENGLISH_MONTHS[m.group(1).lower()]
        day = int(m.group(2))
        year = int(m.group(3))
        return f"{year}-{month:02d}-{day:02d}"
    return None


def normalize_foot(raw: str) -> str:
    """Normalize foot text to Dir/Esq/Amb."""
    r = raw.strip().lower()
    if r in ("dir", "drt", "direito", "right"):
        return "Dir"
    if r in ("esq", "esquerdo", "left"):
        return "Esq"
    if r in ("amb", "ambidestro", "ambidextro", "both"):
        return "Amb"
    return raw.strip()


def extract_assessments_by_position(page) -> dict | None:
    """Extract physical_profile, strengths, weaknesses using word positions.

    Instead of parsing interleaved text, uses Y coordinates of labels and content
    to accurately separate sections. The PONTOS FRACOS label's Y position defines
    the boundary: content near it (within ~25px above) = weaknesses, content above = strengths.

    Returns dict with physical_profile, strengths, weaknesses, or None if extraction fails.
    """
    try:
        words = page.extract_words(keep_blank_chars=True, x_tolerance=3, y_tolerance=3)
        if not words:
            return None

        # ── Find label Y positions ──
        label_positions = {}
        for w in words:
            t = w["text"].strip().upper()
            if "PERFIL" in t and ("FÍSICO" in t or "FISICO" in t):
                label_positions["perfil"] = w["top"]
            elif t == "PONTOS FORTES":
                label_positions["fortes"] = w["top"]
            elif t == "PONTOS FRACOS" or (t.startswith("PONTOS FRACOS")):
                label_positions["fracos"] = w["top"]
            elif t.startswith("AVALIA") or t == "DECISÃO":
                # Take the earliest of AVALIAÇÃO/DECISÃO as end boundary
                if "end" not in label_positions or w["top"] < label_positions["end"]:
                    label_positions["end"] = w["top"]

        # Need at least PONTOS FRACOS and an end marker to use position-based approach
        if "fracos" not in label_positions or "end" not in label_positions:
            return None

        # ── Find subtitle "(fisionomia...)" Y position ──
        subtitle_y = None
        for w in words:
            if "fisionomia" in w["text"].lower():
                subtitle_y = w["top"]
                break

        perfil_y = label_positions.get("perfil", 0)
        fracos_y = label_positions["fracos"]
        end_y = label_positions["end"]

        # ── Find content column X threshold ──
        # Content is to the right of labels. Find the X where most long text starts.
        # Labels are at x≈73, content starts at x≈193 or x≈336 depending on template.
        content_xs = [w["x0"] for w in words if len(w["text"].strip()) > 15 and w["x0"] > 100]
        if not content_xs:
            return None

        # Content column X = the most common X position for long text
        from collections import Counter
        x_counts = Counter(round(x, 0) for x in content_xs)
        content_x_threshold = min(x for x, _ in x_counts.most_common(3)) - 10

        # ── Collect content lines ──
        # Group words by Y position into lines, filtering to content column
        content_words = [
            w for w in words
            if w["x0"] >= content_x_threshold
            and perfil_y - 5 < w["top"] < end_y
            and len(w["text"].strip()) > 0
        ]

        # Sort by Y, then X
        content_words.sort(key=lambda w: (w["top"], w["x0"]))

        # Group into lines (words within 3px Y tolerance)
        lines = []
        current_line_y = -999
        current_line_text = ""
        for w in content_words:
            t = w["text"].strip()
            if not t:
                continue
            # Skip known labels and subtitles (match exact labels, not content containing those words)
            t_upper = t.upper()
            if t_upper in ("PONTOS FORTES", "PONTOS FRACOS", "PONTOS FRACOS:", "PERFIL FÍSICO", "PERFIL FISICO"):
                continue
            if re.match(r"^\(fisionomia", t, re.I) or re.match(r"^\(f[ií]sicos", t, re.I):
                continue

            if abs(w["top"] - current_line_y) < 5:
                # Same line
                current_line_text += " " + t
            else:
                # New line
                if current_line_text.strip():
                    lines.append({"y": current_line_y, "text": current_line_text.strip()})
                current_line_y = w["top"]
                current_line_text = t

        if current_line_text.strip():
            lines.append({"y": current_line_y, "text": current_line_text.strip()})

        if not lines:
            return None

        # ── Separate sections using PONTOS FRACOS label Y position ──
        # Content within 25px above (or below) PONTOS FRACOS label = weaknesses
        # Content above that = strengths (or physical profile)
        FRACOS_PROXIMITY = 25  # px threshold for "near" the PONTOS FRACOS label

        physical_lines = []
        strength_lines = []
        weakness_lines = []

        for line in lines:
            y = line["y"]

            if subtitle_y and y < subtitle_y + 5:
                # Above subtitle = physical profile
                physical_lines.append(line["text"])
            elif y >= fracos_y - FRACOS_PROXIMITY:
                # Near or below PONTOS FRACOS label = weaknesses
                weakness_lines.append(line["text"])
            else:
                # Between subtitle and PONTOS FRACOS = strengths
                strength_lines.append(line["text"])

        # ── Build text with smart line merging ──
        result = {
            "physical_profile": _merge_lines(physical_lines),
            "strengths": _merge_lines(strength_lines),
            "weaknesses": _merge_lines(weakness_lines),
        }

        # Only return if we got at least one non-empty field
        if any(v for v in result.values()):
            return result

    except Exception as e:
        print(f"  [WARN] Position-based extraction failed: {e}")

    return None


def _merge_lines(lines: list) -> str | None:
    """Merge extracted lines with smart newline/space handling."""
    if not lines:
        return None

    merged = [lines[0]]
    for line in lines[1:]:
        prev = merged[-1]
        # Merge if previous line ends mid-sentence
        ends_mid_sentence = (
            prev[-1] not in ".!?:" and
            (line[0].islower() or prev[-1] == "," or
             re.search(r"\b(de|da|do|das|dos|a|o|as|os|e|ou|com|para|por|no|na|nos|nas|em|ao|à|um|uma)\s*$", prev, re.I))
        )
        if ends_mid_sentence:
            merged[-1] = prev + " " + line
        else:
            merged.append(line)

    result = "\n".join(merged).strip()
    # Remove leading colon/punctuation artifacts
    result = re.sub(r"^[:\s]+", "", result)
    return result if result else None


def extract_physical_profile(text: str) -> str | None:
    """Extract physical profile from two-column PDF layout.

    The value can appear in two places:
    1. Between "PERFIL FÍSICO" and "(fisionomia..." subtitle
    2. On the SAME LINE after "(fisionomia...)" closing paren (e.g. "(fisionomia...) Mesomorfo")
    Both parts are combined.
    """
    parts = []

    # Part 1: text between "PERFIL FÍSICO" and "(fisionomia"
    m = re.search(r"PERFIL\s+F[ÍI]SICO:?\s*\n?([\s\S]*?)\(fisionomia", text, re.I)
    if m:
        p1 = _clean_assessment_text(m.group(1))
        if p1:
            parts.append(p1)

        # Part 2: text on the SAME LINE after the "(fisionomia...)" closing paren
        # Use [ \t]* (not \s*) to avoid consuming newlines
        subtitle_m = re.search(r"\(fisionomia[^)]*\)[ \t]*(.*)", text, re.I)
        if subtitle_m:
            same_line = subtitle_m.group(1).strip()
            if same_line:
                parts.append(same_line)

        if parts:
            return " ".join(parts)

    # Fallback: text between PERFIL FÍSICO and PONTOS FORTES (no subtitle found)
    m = re.search(r"PERFIL\s+F[ÍI]SICO:?\s*\n?([\s\S]*?)(?=PONTOS\s+FORTES)", text, re.I)
    if m:
        value = _clean_assessment_text(m.group(1))
        if value:
            return value

    return None


def extract_strengths(text: str) -> str | None:
    """Extract strengths from two-column PDF layout.

    Strengths text starts on the LINE AFTER the "(fisionomia...)" subtitle line,
    and continues until "PONTOS FRACOS". The "PONTOS FORTES" label and
    "(físicos / técnicos / mentais)" subtitle appear mid-text and are stripped.
    """
    # Primary: find the "(fisionomia...)" subtitle line, take everything from the
    # NEXT LINE onwards until PONTOS FRACOS
    subtitle_m = re.search(r"\(fisionomia[^)]*\).*\n([\s\S]*?)(?=PONTOS\s+FRACOS)", text, re.I)
    if subtitle_m:
        block = subtitle_m.group(1)
        # Remove labels and subtitles that appear mid-text
        block = re.sub(r"PONTOS\s+FORTES:?", "", block, flags=re.I)
        block = re.sub(r"\(f[ií]sicos\s*[/,]\s*t[ée]cnicos\s*[/,]\s*mentais\)", "", block, flags=re.I)
        value = _clean_assessment_text(block)
        if value:
            return value

    # Fallback: between "PONTOS FORTES" and "PONTOS FRACOS" (simple layout)
    m = re.search(r"PONTOS\s+FORTES:?\s*\n?([\s\S]*?)(?=PONTOS\s+FRACOS)", text, re.I)
    if m:
        block = m.group(1)
        block = re.sub(r"\(f[ií]sicos\s*[/,]\s*t[ée]cnicos\s*[/,]\s*mentais\)", "", block, flags=re.I)
        value = _clean_assessment_text(block)
        if value:
            return value

    return None


def extract_weaknesses(text: str) -> str | None:
    """Extract weaknesses — text between PONTOS FRACOS and AVALIAÇÃO/DECISÃO."""
    # End at AVALIAÇÃO or DECISÃO, whichever comes first
    m = re.search(r"PONTOS\s+FRACOS:?\s*([\s\S]*?)(?=AVALIA[ÇC][ÃA]O|DECIS[ÃA]O)", text, re.I)
    if m:
        block = m.group(1)
        block = re.sub(r"\(f[ií]sicos\s*[/,]\s*t[ée]cnicos\s*[/,]\s*mentais\)", "", block, flags=re.I)
        value = _clean_assessment_text(block)
        if value:
            return value

    return None


def _fix_cross_section_flow(strengths: str | None, weaknesses: str | None) -> tuple:
    """Fix two-column PDF text flow where the PONTOS FRACOS label splits a sentence.

    When the PDF has two columns, pdfplumber interleaves them. This causes the
    weaknesses text to start BEFORE the "PONTOS FRACOS" label in the extracted text,
    with the rest continuing after it. The result is:
    - strengths ends with leaked weaknesses text (often an incomplete sentence)
    - weaknesses starts with the continuation (lowercase or mid-sentence)

    Detection: weaknesses starts lowercase OR strengths ends without terminal punctuation.
    Fix: search BACKWARDS in strengths for the last sentence boundary (". [A-Z]" or ".\n[A-Z]")
    where the remaining text ends without terminal punctuation. Move the leaked fragment
    to the front of weaknesses.
    """
    if not strengths or not weaknesses:
        return strengths, weaknesses

    # Detect cross-section flow
    strengths_stripped = strengths.rstrip()
    strengths_ends_clean = strengths_stripped[-1] in ".!?)" if strengths_stripped else True
    weaknesses_starts_lower = weaknesses[0].islower()

    if strengths_ends_clean and not weaknesses_starts_lower:
        return strengths, weaknesses

    # Search BACKWARDS for the last ". [A-Z]" or ".\n[A-Z]" boundary
    # where the remaining text (after boundary) ends WITHOUT terminal punctuation
    for i in range(len(strengths) - 1, 0, -1):
        is_sentence_end = (
            strengths[i] == '.' and
            i + 2 < len(strengths) and
            strengths[i + 1] in ' \n' and
            strengths[i + 2].isupper()
        )
        if is_sentence_end:
            remaining = strengths[i + 1:].strip()
            if remaining and remaining[-1] not in '.!?)':
                real_strengths = strengths[:i + 1].strip()
                leaked_fragment = remaining
                fixed_weaknesses = (leaked_fragment + " " + weaknesses).strip()
                return real_strengths, fixed_weaknesses

    return strengths, weaknesses


def _clean_assessment_text(block: str) -> str | None:
    """Clean up extracted assessment text — remove empty lines, leading colons, etc.

    Preserves newlines between distinct points/sentences.
    Merges lines that are continuations (line ends mid-sentence without punctuation
    and next line starts lowercase or continues a sentence).
    """
    lines = []
    for line in block.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        # Skip pure parenthetical subtitle lines
        if re.match(r"^\(.*\)$", stripped):
            continue
        lines.append(stripped)

    if not lines:
        return None

    # Merge continuation lines: if previous line ends mid-word/sentence (no period,
    # no comma at end) AND next line starts lowercase or continues a phrase, merge.
    # Otherwise keep as separate lines.
    merged = [lines[0]]
    for line in lines[1:]:
        prev = merged[-1]
        # Merge if: previous line ends without terminal punctuation AND
        # (next line starts lowercase OR previous line ends with a preposition/article/comma)
        ends_mid_sentence = (
            prev[-1] not in ".!?:" and
            (line[0].islower() or prev[-1] == "," or
             re.search(r"\b(de|da|do|das|dos|a|o|as|os|e|ou|com|para|por|no|na|nos|nas|em|ao|à|um|uma)\s*$", prev, re.I))
        )
        if ends_mid_sentence:
            merged[-1] = prev + " " + line
        else:
            merged.append(line)

    result = "\n".join(merged).strip()
    # Remove leading colon/punctuation artifacts
    result = re.sub(r"^[:\s]+", "", result)
    return result if result else None


# ───────────── Database Operations ─────────────

def get_players_with_reports(player_id: int | None = None, retry_errors: bool = False) -> list[dict]:
    """Fetch players that have report links from the database."""
    query = supabase.table("players").select(
        "id, report_link_1, report_link_2, report_link_3, "
        "report_link_4, report_link_5, report_link_6, "
        "report_label_1, report_label_2, report_label_3, "
        "report_label_4, report_label_5, report_label_6"
    )

    if player_id:
        query = query.eq("id", player_id)

    # Fetch all — paginate if needed
    result = query.execute()
    players = result.data or []

    # Filter to those with at least one report link
    players_with_reports = []
    for p in players:
        links = []
        for i in range(1, 7):
            link = p.get(f"report_link_{i}")
            label = p.get(f"report_label_{i}")
            if link and link.strip():
                links.append({"num": i, "link": link.strip(), "label": label or ""})
        if links:
            players_with_reports.append({"id": p["id"], "reports": links})

    return players_with_reports


def report_already_extracted(player_id: int, gdrive_file_id: str, retry_errors: bool = False) -> bool:
    """Check if a report has already been extracted."""
    query = supabase.table("scouting_reports").select("id, extraction_status").eq(
        "player_id", player_id
    ).eq("gdrive_file_id", gdrive_file_id)

    result = query.execute()
    if not result.data:
        return False

    # If retry_errors, allow re-extraction of failed reports
    if retry_errors:
        return result.data[0]["extraction_status"] == "success"

    return True


def insert_report(player_id: int, file_id: str, link: str, report_num: int, label: str, parsed: dict) -> bool:
    """Insert or update a scouting report in the database."""
    # Determine extraction status
    has_core_fields = bool(parsed.get("player_name_report") or parsed.get("rating") or parsed.get("strengths"))
    has_all_fields = all([
        parsed.get("player_name_report"),
        parsed.get("rating"),
        parsed.get("decision"),
    ])

    if has_all_fields:
        status = "success"
    elif has_core_fields:
        status = "partial"
    elif parsed.get("raw_text"):
        status = "partial"
    else:
        status = "error"

    row = {
        "player_id": player_id,
        "gdrive_file_id": file_id,
        "gdrive_link": link,
        "report_number": report_num,
        "pdf_filename": label,
        "competition": parsed.get("competition"),
        "age_group": parsed.get("age_group"),
        "match": parsed.get("match"),
        "match_date": parsed.get("match_date"),
        "match_result": parsed.get("match_result"),
        "player_name_report": parsed.get("player_name_report"),
        "shirt_number_report": parsed.get("shirt_number_report"),
        "birth_year_report": parsed.get("birth_year_report"),
        "foot_report": parsed.get("foot_report"),
        "team_report": parsed.get("team_report"),
        "position_report": parsed.get("position_report"),
        "physical_profile": parsed.get("physical_profile"),
        "strengths": parsed.get("strengths"),
        "weaknesses": parsed.get("weaknesses"),
        "rating": parsed.get("rating"),
        "decision": parsed.get("decision"),
        "analysis": parsed.get("analysis"),
        "contact_info": parsed.get("contact_info"),
        "scout_name": parsed.get("scout_name"),
        "raw_text": parsed.get("raw_text"),
        "extraction_status": status,
        "extracted_at": "now()",
    }

    # Upsert — if same player+file_id exists, update
    try:
        # Check existing
        existing = supabase.table("scouting_reports").select("id").eq(
            "player_id", player_id
        ).eq("gdrive_file_id", file_id).execute()

        if existing.data:
            supabase.table("scouting_reports").update(row).eq("id", existing.data[0]["id"]).execute()
        else:
            supabase.table("scouting_reports").insert(row).execute()

        return True
    except Exception as e:
        print(f"  [ERROR] DB insert failed: {e}")
        return False


# ───────────── Main ─────────────

def main():
    parser = argparse.ArgumentParser(description="Extract scouting reports from Google Drive PDFs")
    parser.add_argument("--player-id", type=int, help="Process a single player by ID")
    parser.add_argument("--retry-errors", action="store_true", help="Retry previously failed extractions")
    parser.add_argument("--dry-run", action="store_true", help="Parse PDFs but don't insert into DB")
    parser.add_argument("--limit", type=int, help="Limit number of players to process")
    args = parser.parse_args()

    print("Fetching players with report links...")
    players = get_players_with_reports(player_id=args.player_id, retry_errors=args.retry_errors)

    if args.limit:
        players = players[:args.limit]

    total_reports = sum(len(p["reports"]) for p in players)
    print(f"Found {len(players)} players with {total_reports} reports total")

    stats = {"downloaded": 0, "parsed": 0, "inserted": 0, "skipped": 0, "errors": 0}

    for pi, player in enumerate(players):
        player_id = player["id"]
        print(f"\n[{pi+1}/{len(players)}] Player {player_id} ({len(player['reports'])} reports)")

        for report in player["reports"]:
            link = report["link"]
            num = report["num"]
            label = report["label"]

            file_id = extract_gdrive_file_id(link)
            if not file_id:
                print(f"  Report {num}: Could not extract file ID from {link}")
                stats["errors"] += 1
                continue

            # Skip already extracted
            if not args.dry_run and report_already_extracted(player_id, file_id, args.retry_errors):
                print(f"  Report {num}: Already extracted, skipping")
                stats["skipped"] += 1
                continue

            # Download PDF to temp file
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp_path = tmp.name

            try:
                print(f"  Report {num}: Downloading {file_id}...")
                if not download_pdf(file_id, tmp_path):
                    stats["errors"] += 1
                    if not args.dry_run:
                        insert_report(player_id, file_id, link, num, label, {
                            "raw_text": None,
                            "extraction_status": "error",
                        })
                    continue
                stats["downloaded"] += 1

                # Parse
                print(f"  Report {num}: Parsing PDF...")
                parsed = parse_report_pdf(tmp_path)
                stats["parsed"] += 1

                # Show summary
                rating = parsed.get("rating", "?")
                decision = parsed.get("decision", "?")
                scout = parsed.get("scout_name", "?")
                print(f"  Report {num}: Rating={rating}, Decision={decision}, Scout={scout}")

                # Insert into DB
                if not args.dry_run:
                    if insert_report(player_id, file_id, link, num, label, parsed):
                        stats["inserted"] += 1
                    else:
                        stats["errors"] += 1

            finally:
                # Clean up temp file
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

            # Rate limit — be gentle with Google Drive
            time.sleep(0.5)

    print(f"\n{'='*50}")
    print(f"Done! Stats:")
    print(f"  Downloaded: {stats['downloaded']}")
    print(f"  Parsed:     {stats['parsed']}")
    print(f"  Inserted:   {stats['inserted']}")
    print(f"  Skipped:    {stats['skipped']}")
    print(f"  Errors:     {stats['errors']}")


if __name__ == "__main__":
    main()
