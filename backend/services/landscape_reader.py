"""Lecture par position des pages « Landscape » du PDF mensuel des programmes.

Pourquoi ce module : l'ancien lecteur devinait les colonnes selon l'ordre des
cases et ne connaissait que les années-modèles 2024, 2025 et 2026. Une case
vide, une colonne ajoutée par Stellantis ou une nouvelle année-modèle faisaient
glisser ou disparaître des valeurs sans aucun avertissement.

Ici chaque valeur est rangée selon sa position sur la page :
  - l'année-modèle est lue dans l'en-tête de la page, quelle qu'elle soit ;
  - chaque taux est rattaché au terme (36M, 48M…) situé au-dessus de lui ;
  - chaque montant est rattaché à la colonne « BEFORE TAX » / « AFTER TAX »
    située au-dessus de lui ;
  - le nom du véhicule est le texte à gauche des colonnes, sur la même ligne.

Un contrôle compare ensuite le nombre de lignes lues au nombre de lignes de la
page. Rien n'est deviné : ce qui ne peut pas être rangé est signalé.
"""
from __future__ import annotations

import hashlib
import re
from io import BytesIO
from statistics import median
from typing import Dict, List, Optional

RATE_RE = re.compile(r"^\d{1,2}\.\d{1,2}%$")
MONEY_RE = re.compile(r"^\$\d[\d,]*$")
TERM_RE = re.compile(r"^(\d\d)M$")
YEAR_RE = re.compile(r"\b(20\d\d)\s+(?:MODELS?\b|MODEL\s+YEAR)", re.IGNORECASE)

FINANCE_TERMS = [36, 48, 60, 72, 84, 96]
LEASE_TERMS = [24, 27, 36, 39, 42, 48, 51, 54, 60]

_CACHE: dict = {}
_LINE_TOLERANCE = 2.5   # points : deux mots à moins de ça sont sur la même ligne
_NAME_GAP = 12.0        # points : blanc qui sépare un nom d'une remarque voisine
_NAME_MARGIN = 6.0      # points laissés libres à gauche de la première colonne


def _center(word: dict) -> float:
    return (word["x0"] + word["x1"]) / 2.0


def _lines(words: List[dict], tolerance: float = _LINE_TOLERANCE) -> List[List[dict]]:
    """Regroupe les mots en lignes (même hauteur), de haut en bas."""
    lines: List[List[dict]] = []
    for word in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if lines and abs(lines[-1][0]["top"] - word["top"]) <= tolerance:
            lines[-1].append(word)
        else:
            lines.append([word])
    return [sorted(line, key=lambda w: w["x0"]) for line in lines]


def _term_groups(words: List[dict]) -> Optional[dict]:
    """Trouve les deux blocs de termes (offre standard et offre alternative)."""
    terms = [w for w in words if TERM_RE.match(w["text"])]
    if len(terms) < 12:
        return None
    top = median(w["top"] for w in terms)
    terms = sorted((w for w in terms if abs(w["top"] - top) <= 4), key=_center)
    values = [int(TERM_RE.match(w["text"]).group(1)) for w in terms]
    kind = "lease" if 24 in values else "finance"
    expected = LEASE_TERMS if kind == "lease" else FINANCE_TERMS
    size = len(expected)
    if len(terms) != size * 2 or values[:size] != expected or values[size:] != expected:
        return None
    return {
        "kind": kind,
        "top": top,
        "terms": expected,
        "standard": [_center(w) for w in terms[:size]],
        "alternative": [_center(w) for w in terms[size:]],
    }


def _money_columns(words: List[dict], groups: dict) -> List[dict]:
    """Colonnes de montants, repérées par les mentions BEFORE TAX / AFTER TAX."""
    left_edge = groups["standard"][0]
    middle_from, middle_to = groups["standard"][-1], groups["alternative"][0]
    right_edge = groups["alternative"][-1]
    tax = [w for w in words if w["text"] in ("BEFORE", "AFTER") and w["top"] > groups["top"]]
    if not tax:
        return []
    row_top = min(w["top"] for w in tax)
    tax = sorted((w for w in tax if abs(w["top"] - row_top) <= 4), key=lambda w: w["x0"])
    headers = [w for w in words if w["top"] < groups["top"] and w["x0"] > right_edge
               and w["text"].rstrip("*^") in ("Bonus", "Delivery")]

    columns: List[dict] = []
    left = [w for w in tax if w["x0"] < left_edge]
    middle = [w for w in tax if middle_from < w["x0"] < middle_to]
    right = [w for w in tax if w["x0"] > right_edge]
    if groups["kind"] == "finance":
        left_names, middle_names = ["consumer_cash"], ["alt_consumer_cash"]
    else:
        left_names = ["lease_cash", "standard_rate_lease_cash"]
        middle_names = ["alt_lease_cash"]
    for names, found in ((left_names, left), (middle_names, middle)):
        for name, word in zip(names, found):
            columns.append({"field": name, "x": word["x0"], "tax": word["text"].lower()})
    for word in right:
        field = "bonus_cash"
        if headers:
            nearest = min(headers, key=lambda h: abs(h["x0"] - word["x0"]))
            field = "delivery_credit" if nearest["text"].startswith("Delivery") else "bonus_cash"
        if any(c["field"] == field for c in columns):
            field = "delivery_credit" if field == "bonus_cash" else "bonus_cash"
        columns.append({"field": field, "x": word["x0"], "tax": word["text"].lower()})
    for col in columns:
        col["table_top"] = row_top
    return columns


def _nearest(value: float, centers: List[float], limit: float) -> Optional[int]:
    best = min(range(len(centers)), key=lambda i: abs(centers[i] - value))
    return best if abs(centers[best] - value) <= limit else None


def _row_edges(page, name_right: float, table_top: float) -> List[float]:
    """Hauteurs des traits horizontaux de la grille dans la colonne des noms."""
    edges: List[float] = []
    for rect in getattr(page, "rects", []) or []:
        if rect["height"] < 0.6 and rect["width"] > 40 and rect["x0"] < name_right \
                and rect["x1"] <= name_right + 25 and rect["top"] >= table_top - 12:
            edges.append(rect["top"])
    merged: List[float] = []
    for edge in sorted(edges):
        if not merged or edge - merged[-1] > 1.0:
            merged.append(edge)
    return merged


def read_landscape_page(page) -> Optional[dict]:
    """Lit une page Landscape. Retourne None si la page n'en est pas une."""
    # y_tolerance serré : les noms sur deux lignes sont écrits très petit et
    # se mélangeraient lettre par lettre avec la tolérance par défaut.
    words = page.extract_words(extra_attrs=["upright", "fontname"], y_tolerance=1)
    groups = _term_groups(words)
    if not groups:
        return None
    text = " ".join(w["text"] for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])))
    year_match = YEAR_RE.search(text)
    problems: List[str] = []
    if not year_match:
        problems.append("année-modèle introuvable dans l'en-tête")
    model_year = int(year_match.group(1)) if year_match else None

    columns = _money_columns(words, groups)
    if not columns:
        problems.append("colonnes de montants introuvables (BEFORE TAX / AFTER TAX)")
    table_top = columns[0]["table_top"] if columns else groups["top"]
    spacing = groups["standard"][1] - groups["standard"][0]
    limit = spacing / 2.0
    name_right = min([c["x"] for c in columns] + [groups["standard"][0]]) - _NAME_MARGIN

    body = [w for w in words if w["top"] > table_top + _LINE_TOLERANCE and w.get("upright", True)
            and "Wingdings" not in str(w.get("fontname", ""))]
    lines = _lines(body)

    def is_value(word: dict) -> bool:
        return bool(RATE_RE.match(word["text"])) or word["text"] == "-"

    rate_from = groups["standard"][0] - limit
    rate_to = groups["alternative"][-1] + limit
    value_lines = [line for line in lines
                   if sum(1 for w in line if is_value(w) and rate_from <= _center(w) <= rate_to)
                   >= len(groups["terms"])]
    if not value_lines:
        return {"kind": groups["kind"], "model_year": model_year, "rows": [],
                "expected_rows": 0, "problems": problems + ["aucune ligne de taux trouvée"]}

    tops = [line[0]["top"] for line in value_lines]
    gaps = [b - a for a, b in zip(tops, tops[1:])]
    half = (median(gaps) if gaps else 10.0) / 2.0

    # Les traits horizontaux de la grille donnent la hauteur exacte de chaque
    # ligne : un nom écrit sur deux ou trois lignes reste dans sa case.
    edges = _row_edges(page, name_right, table_top)
    firsts = [round(min((w["x0"] for w in line if w["x1"] <= name_right + _NAME_MARGIN), default=-1))
              for line in value_lines]
    firsts = [x for x in firsts if x >= 0]
    name_left = (max(set(firsts), key=firsts.count) if firsts else 0) - 1.5

    # Les noms sont relus lettre par lettre dans leur colonne : une étiquette
    # voisine qui touche le nom (« TAIF500e », « (24-42Wrangler ») est coupée
    # au bord de la colonne au lieu d'avaler le premier mot.
    name_box = (max(name_left, 0), table_top, min(name_right + _NAME_MARGIN, page.width), page.height)
    name_words = (page
                  .filter(lambda o: o.get("object_type") != "char"
                          or (o.get("upright", True) and "Wingdings" not in str(o.get("fontname", ""))))
                  .within_bbox(name_box)
                  .extract_words(y_tolerance=1))
    # Un texte qui déborde à droite de la colonne (titre de colonne) n'est pas un nom.
    overflow = [w for w in body if w["x0"] < name_right and w["x1"] > name_right + _NAME_MARGIN]
    name_words = [w for w in name_words if w["top"] > table_top + _LINE_TOLERANCE
                  and not any(abs(o["top"] - w["top"]) < 1.5 and o["x0"] - 1 <= w["x0"] for o in overflow)]

    def band_of(center: float, index: int):
        below = [e for e in edges if e <= center]
        above = [e for e in edges if e > center]
        if below and above:
            return below[-1], above[0]
        low = (tops[index - 1] + tops[index]) / 2.0 if index else max(table_top, tops[index] - half)
        high = (tops[index] + tops[index + 1]) / 2.0 if index + 1 < len(tops) else tops[index] + half
        return low, high

    rows: List[dict] = []
    used_bands = set()
    for index, line in enumerate(value_lines):
        center = median((w["top"] + w["bottom"]) / 2.0 for w in line)
        low, high = band_of(center, index)
        if (low, high) in used_bands:
            problems.append(f"ligne {index + 1} : deux lignes de taux dans la même case")
        used_bands.add((low, high))
        band = [w for w in body if low < (w["top"] + w["bottom"]) / 2.0 <= high]

        name_lines = _lines([w for w in name_words if low < (w["top"] + w["bottom"]) / 2.0 <= high], 2.0)
        # Un grand blanc dans la ligne : la suite est une remarque de la colonne
        # voisine (« MSRP % Off Discount (P2619A1) »), pas la fin du nom.
        kept: List[str] = []
        spill_top = spill_x = None
        for name_line in name_lines:
            for position, word in enumerate(name_line):
                if position and word["x0"] - name_line[position - 1]["x1"] > _NAME_GAP:
                    spill_top, spill_x = word["top"], word["x0"]
                    break
                kept.append(word["text"])
        name = " ".join(kept)
        name = re.sub(r"\s+", " ", name).strip()

        standard: Dict[str, Optional[float]] = {}
        alternative: Dict[str, Optional[float]] = {}
        for word in line:
            if not is_value(word):
                continue
            value = None if word["text"] == "-" else float(word["text"].rstrip("%"))
            for target, centers in ((standard, groups["standard"]), (alternative, groups["alternative"])):
                slot = _nearest(_center(word), centers, limit)
                if slot is not None:
                    target[str(groups["terms"][slot])] = value

        row = {
            "name": name,
            "model_year": model_year,
            "standard_rates": standard if any(v is not None for v in standard.values()) else None,
            "alternative_rates": alternative if any(v is not None for v in alternative.values()) else None,
            "notes": {},
        }
        for col in columns:
            row[col["field"]] = 0
        for word in band:
            if not MONEY_RE.match(word["text"]) or not columns:
                continue
            col = min(columns, key=lambda c: abs(c["x"] - word["x0"]))
            if abs(col["x"] - word["x0"]) > 45:
                problems.append(f"{name or 'ligne sans nom'} : montant {word['text']} hors colonne")
                continue
            row[col["field"]] = int(word["text"].lstrip("$").replace(",", ""))
            extra = [w["text"] for w in band
                     if w["top"] >= word["top"] - _LINE_TOLERANCE and w is not word
                     and w["x0"] >= name_right and not is_value(w) and not MONEY_RE.match(w["text"])
                     and abs(min(columns, key=lambda c: abs(c["x"] - w["x0"]))["x"] - col["x"]) < 1]
            if extra:
                row["notes"][col["field"]] = " ".join(extra)
        if spill_top is not None and columns:
            remark = [w["text"] for w in sorted(band, key=lambda w: w["x0"])
                      if abs(w["top"] - spill_top) < _LINE_TOLERANCE and spill_x - 1 <= w["x0"] < rate_from
                      and not is_value(w) and not MONEY_RE.match(w["text"])]
            row["notes"].setdefault(columns[0]["field"], " ".join(remark))
        row["loyalty_bonus"] = "loyalty" in row["notes"].get("bonus_cash", "").lower()
        if not name:
            problems.append(f"ligne {index + 1} : nom du véhicule introuvable")
        rows.append(row)

    # Contrôle indépendant de la détection des taux : chaque case de la grille
    # qui contient un nom doit avoir donné une ligne.
    named_cells = 0
    for low, high in zip(edges, edges[1:]):
        if any(low < (w["top"] + w["bottom"]) / 2.0 <= high for w in name_words):
            named_cells += 1
    expected = named_cells if len(edges) >= 2 else len(value_lines)

    seen: Dict[str, int] = {}
    for row in rows:
        seen[row["name"]] = seen.get(row["name"], 0) + 1
    for name, count in seen.items():
        if name and count > 1:
            problems.append(f"{name} : présent {count} fois sur la page")

    return {"kind": groups["kind"], "model_year": model_year, "rows": rows,
            "expected_rows": expected, "columns": [c["field"] for c in columns],
            "problems": problems}


def read_landscapes(pdf_content: bytes, pages: Optional[List[int]] = None) -> dict:
    """Lit toutes les pages Landscape d'un PDF de programmes.

    `pages` : numéros de page (à partir de 1) à lire ; toutes les pages sinon.
    Les pages « Non-Prime » sont écartées : le calculateur ne s'en sert pas.
    """
    import pdfplumber

    # L'import lit le même PDF deux fois de suite (achat puis location).
    digest = (hashlib.sha256(pdf_content).hexdigest(), tuple(pages or ()))
    if _CACHE.get("key") == digest:
        return _CACHE["value"]

    finance: List[dict] = []
    lease: List[dict] = []
    with pdfplumber.open(BytesIO(pdf_content)) as pdf:
        numbers = pages or list(range(1, len(pdf.pages) + 1))
        section = "prime"
        for number in range(1, len(pdf.pages) + 1):
            page = pdf.pages[number - 1]
            result = read_landscape_page(page)
            if not result:
                # Page de séparation : elle annonce la section qui suit.
                title = re.sub(r"\s+", " ", (page.extract_text() or "")[:300]).upper()
                if "LANDSCAPE" in title:
                    if "LOYALTY" in title:
                        section = "loyalty"
                    elif "NON" in title and "PRIME" in title:
                        section = "non_prime"
                    elif "LEASE" in title:
                        section = "lease"
                    elif "PRIME" in title:
                        section = "prime"
                continue
            if number not in numbers:
                continue
            result["page"] = number
            if result["kind"] == "lease":
                lease.append(result)
            elif section == "prime":
                finance.append(result)
    value = {"finance": finance, "lease": lease, "control": control_report(finance + lease)}
    _CACHE["key"], _CACHE["value"] = digest, value
    return value


def control_report(pages: List[dict]) -> dict:
    """Contrôle : une page mal lue bloque l'enregistrement du mois."""
    errors: List[str] = []
    by_year: Dict[str, Dict[str, int]] = {}
    seen = set()
    for page in pages:
        label = f"page {page.get('page')} ({page['kind']}, {page.get('model_year')})"
        if page["model_year"] is None:
            errors.append(f"{label} : année-modèle inconnue")
        if len(page["rows"]) != page["expected_rows"] or not page["rows"]:
            errors.append(f"{label} : {len(page['rows'])} lignes lues pour {page['expected_rows']} sur la page")
        key = (page["kind"], page["model_year"])
        if key in seen:
            errors.append(f"{label} : deux pages pour la même année-modèle")
        seen.add(key)
        errors.extend(f"{label} : {p}" for p in page["problems"])
        by_year.setdefault(page["kind"], {})[str(page["model_year"])] = len(page["rows"])
    if not any(p["kind"] == "finance" for p in pages):
        errors.append("aucune page de taux d'achat trouvée")
    if not any(p["kind"] == "lease" for p in pages):
        errors.append("aucune page de taux de location trouvée")
    return {"ok": not errors, "errors": errors, "rows_by_year": by_year}
