"""Lecture du guide des valeurs résiduelles SCI (PDF anglais ou français).

Chaque page de tableau a la même forme :

    DODGE                 24  27  36  39  42  48  51  54  60     <- marque + termes
    2025 Charger                                                 <- année + modèle
    Daytona                                                      <- suite du modèle
     R/T        2D Coupe AWD   45  43  38  36  35  32  31  29  28
     SRT Hellcat 4D Utility AWD 49 48  42  40  37  33  31  29  27
     Hammerhead                                                  <- suite de la version

La lecture se fait par position : chaque pourcentage est rattaché au terme
écrit au-dessus de lui, et non à son rang dans la ligne. Un contrôle refuse
le guide si une ligne ne se lit pas entièrement.
"""
import hashlib
import io
import re
from typing import Any, Dict, List, Optional, Tuple

import pdfplumber

TERMS = ["24", "27", "36", "39", "42", "48", "51", "54", "60"]
BRANDS = {"CHRYSLER": "Chrysler", "DODGE": "Dodge", "JEEP": "Jeep", "RAM": "Ram", "FIAT": "Fiat"}

_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "août": 8, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11,
    "décembre": 12, "decembre": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9,
    "oct": 10, "nov": 11, "dec": 12,
}
_MONTH_WORD = r"([A-Za-zéûÉÛ]{3,10})\.?"
_RANGE_EN = re.compile(
    r"Effective:\s*" + _MONTH_WORD + r"\s+\d{1,2},?\s*(20\d{2})\s*[-–]\s*"
    + _MONTH_WORD + r"\s+\d{1,2},?\s*(20\d{2})", re.IGNORECASE)
_RANGE_FR = re.compile(
    r"En vigueur\s*:\s*\d{1,2}(?:er)?\s+" + _MONTH_WORD + r"\s+(20\d{2})\s+jusqu.au\s+"
    r"\d{1,2}(?:er)?\s+" + _MONTH_WORD + r"\s+(20\d{2})", re.IGNORECASE)
_TITLE = re.compile(r"\b" + _MONTH_WORD + r"\s+(20\d{2})\b")
_BODY_START = re.compile(r"^\dD$")
_CAB = {"Crew", "Quad", "Mega", "Reg"}
_FOOTER = ("675 cochrane", "t: 1-888", "scileasecorp")
_LINE_TOLERANCE = 2.5
_COLUMN_TOLERANCE = 6.0
_INDENT_TOLERANCE = 2.5
_CACHE: Dict[str, Dict[str, Any]] = {}


class ResidualGuideError(ValueError):
    """Le guide ne s'est pas lu entièrement : rien ne doit être enregistré."""


def _lines(words: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    lines: List[List[Dict[str, Any]]] = []
    for word in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if lines and abs(word["top"] - lines[-1][0]["top"]) <= _LINE_TOLERANCE:
            lines[-1].append(word)
        else:
            lines.append([word])
    return [sorted(line, key=lambda w: w["x0"]) for line in lines]


def _center(word: Dict[str, Any]) -> float:
    return (word["x0"] + word["x1"]) / 2


def _text(words: List[Dict[str, Any]]) -> str:
    return " ".join(w["text"] for w in words)


def _is_percent(text: str) -> bool:
    return text.isdigit() and len(text) <= 2


def read_table_page(page) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Véhicules d'une page et problèmes rencontrés."""
    words = page.extract_words(y_tolerance=1)
    vehicles: List[Dict[str, Any]] = []
    problems: List[str] = []
    brand = None
    columns: List[float] = []
    margin = body_x = None
    year = model = None
    last_kind = None

    for line in _lines(words):
        text = _text(line)
        low = text.lower()
        if any(mark in low for mark in _FOOTER):
            brand = None
            continue
        first = line[0]

        # En-tête : marque suivie des neuf termes
        if first["text"] in BRANDS and [w["text"] for w in line[1:]] == TERMS:
            brand = BRANDS[first["text"]]
            columns = [_center(w) for w in line[1:]]
            margin = first["x0"]
            body_x = None
            year = model = None
            last_kind = "brand"
            continue
        if brand is None:
            continue

        at_margin = abs(first["x0"] - margin) <= _INDENT_TOLERANCE
        numbers = [w for w in line if _is_percent(w["text"]) and w["x0"] > columns[0] - 20]

        if at_margin and re.fullmatch(r"20\d{2}", first["text"]) and not numbers:
            year = int(first["text"])
            model = _text(line[1:])
            last_kind = "model"
            continue
        if at_margin and not numbers and last_kind == "model":
            model = f"{model} {text}".strip()
            continue

        if numbers:
            label = [w for w in line if w not in numbers]
            if year is None or not model:
                problems.append(f"ligne sans modèle : {text}")
                continue
            split = next((i for i, w in enumerate(label)
                          if _BODY_START.match(w["text"]) or (
                              w["text"] in _CAB and i + 1 < len(label)
                              and label[i + 1]["text"] == "Cab")), None)
            if split is None or split == 0:
                problems.append(f"carrosserie introuvable : {text}")
                continue
            if body_x is None:
                body_x = label[split]["x0"]
            elif abs(label[split]["x0"] - body_x) > _INDENT_TOLERANCE:
                problems.append(f"carrosserie hors colonne : {text}")
                continue
            values: Dict[str, int] = {}
            for word in numbers:
                index = min(range(len(columns)), key=lambda i: abs(columns[i] - _center(word)))
                if abs(columns[index] - _center(word)) > _COLUMN_TOLERANCE or TERMS[index] in values:
                    problems.append(f"pourcentage hors colonne : {text}")
                    values = {}
                    break
                values[TERMS[index]] = int(word["text"])
            if len(values) != len(TERMS):
                if values:
                    problems.append(f"{len(values)} pourcentages au lieu de 9 : {text}")
                continue
            ordered = [values[t] for t in TERMS]
            if any(a < b for a, b in zip(ordered, ordered[1:])) or not all(1 <= v <= 99 for v in ordered):
                problems.append(f"pourcentages incohérents : {text}")
                continue
            vehicles.append({
                "brand": brand,
                "model_year": year,
                "model_name": model,
                "trim": _text(label[:split]),
                "body_style": _text(label[split:]),
                "residual_percentages": values,
            })
            last_kind = "row"
            continue

        # Suite d'un nom de version replié sur deux lignes
        if last_kind == "row" and not at_margin and first["x0"] < (body_x or 0):
            vehicles[-1]["trim"] = f"{vehicles[-1]['trim']} {text}"
            continue
        problems.append(f"ligne non reconnue : {text}")

    return vehicles, problems


def _percent_row(text: str) -> Optional[List[int]]:
    values = re.findall(r"\+\s*(\d{1,2})\s*%", text)
    return [int(v) for v in values] if values else None


def read_km_adjustments(text: str) -> Optional[Dict[str, Any]]:
    """Tableau « Kilométrage et coûts » : hausse du résiduel par tranche de
    termes pour 18 000 et 12 000 km par an."""
    header = None
    rows: Dict[str, List[int]] = {}
    for line in text.split("\n"):
        ranges = re.findall(r"(\d{2})(?:\s*-\s*(\d{2}))?\s*(?:mois|months)", line)
        if len(ranges) >= 2:
            header = [(int(a), int(b or a)) for a, b in ranges]
            continue
        match = re.match(r"\s*(\d{2}),?000\s+Kilom", line, re.IGNORECASE)
        if match and header:
            values = _percent_row(line)
            if values and len(values) == len(header):
                rows[f"{match.group(1)}000"] = values
    if not header or "18000" not in rows or "12000" not in rows or "24000" not in rows:
        return None
    covered = [t for t in TERMS if any(lo <= int(t) <= hi for lo, hi in header)]
    if covered != TERMS:
        return None

    def by_term(values: List[int]) -> Dict[str, int]:
        return {t: next(v for (lo, hi), v in zip(header, values) if lo <= int(t) <= hi)
                for t in TERMS}

    limit = re.search(r"(\d{2}),?000\s*(?:km par an|/year)", text)
    return {
        "standard_km": 24000,
        "max_km_per_year": int(limit.group(1)) * 1000 if limit else 36000,
        "adjustments": {"18000": by_term(rows["18000"]), "12000": by_term(rows["12000"])},
        "source": "residual_guide",
    }


def read_period(text: str) -> Dict[str, Optional[int]]:
    """Mois et année du guide, et fin de validité quand elle est écrite."""
    flat = re.sub(r"\s+", " ", text)
    for pattern in (_RANGE_EN, _RANGE_FR):
        match = pattern.search(flat)
        if match:
            start = _MONTHS.get(match.group(1).lower())
            end = _MONTHS.get(match.group(3).lower())
            if start and end:
                return {"month": start, "year": int(match.group(2)),
                        "end_month": end, "end_year": int(match.group(4))}
    for match in _TITLE.finditer(flat):
        month = _MONTHS.get(match.group(1).lower())
        if month:
            return {"month": month, "year": int(match.group(2)),
                    "end_month": None, "end_year": None}
    return {"month": None, "year": None, "end_month": None, "end_year": None}


def read_residual_guide(pdf_content: bytes) -> Dict[str, Any]:
    """Lit tout le guide. Lève ResidualGuideError si le contrôle échoue."""
    digest = hashlib.sha256(pdf_content).hexdigest()
    if digest in _CACHE:
        return _CACHE[digest]

    vehicles: List[Dict[str, Any]] = []
    problems: List[str] = []
    front_text = ""
    km_adjustments = None
    with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            if number <= 3:
                front_text += "\n" + text
            if km_adjustments is None and re.search(r"kilom", text, re.IGNORECASE):
                km_adjustments = read_km_adjustments(text)
            page_vehicles, page_problems = read_table_page(page)
            vehicles.extend(page_vehicles)
            problems.extend(f"page {number} : {p}" for p in page_problems)

    period = read_period(front_text)
    if not vehicles:
        problems.append("aucun véhicule trouvé")
    if period["month"] is None:
        problems.append("mois du guide introuvable")
    if km_adjustments is None:
        problems.append("tableau du kilométrage introuvable ou incomplet")
    seen = set()
    for vehicle in vehicles:
        key = (vehicle["brand"], vehicle["model_year"], vehicle["model_name"],
               vehicle["trim"], vehicle["body_style"])
        if key in seen:
            problems.append("véhicule en double : " + " ".join(str(k) for k in key))
        seen.add(key)
    if problems:
        raise ResidualGuideError(
            f"Guide résiduel refusé, {len(problems)} problème(s) : " + " | ".join(problems[:8]))

    result = {"vehicles": vehicles, "km_adjustments": km_adjustments, **period}
    _CACHE.clear()
    _CACHE[digest] = result
    return result
