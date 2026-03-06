"""
╔══════════════════════════════════════════════════════════════╗
║  PARSEUR DÉTERMINISTE PDF — FCA Canada QBC Retail Programs  ║
║  Utilise pdfplumber (pas d'OCR/IA) pour extraction fiable   ║
║  Même PDF = même résultat, 100% du temps                    ║
╚══════════════════════════════════════════════════════════════╝
"""
import pdfplumber
import re
import logging
from typing import List, Dict, Optional, Tuple
from io import BytesIO

logger = logging.getLogger(__name__)

# Brand markers in PDF (appear reversed/garbled in column 0)
BRAND_MARKERS = {
    "RELSYRHC": "Chrysler",
    "CHRYSLER": "Chrysler",
    "PEEJ": "Jeep",
    "JEEP": "Jeep",
    "EGDOD": "Dodge",
    "DODGE": "Dodge",
    "MAR": "Ram",
    "RAM": "Ram",
    "TAIF": "Fiat",
    "FIAT": "Fiat",
}

# Model → Brand fallback (when brand marker is missing)
MODEL_BRAND_MAP = {
    "500e": "Fiat",
    "Grand Caravan": "Chrysler",
    "Pacifica": "Chrysler",
    "Compass": "Jeep",
    "Cherokee": "Jeep",
    "Wrangler": "Jeep",
    "Gladiator": "Jeep",
    "Grand Cherokee": "Jeep",
    "Grand Wagoneer": "Jeep",
    "Wagoneer": "Jeep",
    "Durango": "Dodge",
    "Charger": "Dodge",
    "Hornet": "Dodge",
    "Ram": "Ram",
    "ProMaster": "Ram",
    "Promaster": "Ram",
}


def _clean_value(val) -> str:
    """Nettoie une valeur de cellule."""
    if val is None:
        return ""
    return str(val).strip()


def _parse_cash(val: str) -> float:
    """Parse un montant cash: '$6,000' -> 6000.0, 'P' -> 0, '-' -> 0."""
    val = val.replace("P", "").strip()
    if not val or val == "-":
        return 0.0
    match = re.search(r'\$?([\d,]+(?:\.\d+)?)', val)
    if match:
        return float(match.group(1).replace(",", ""))
    return 0.0


def _parse_rate(val: str) -> Optional[float]:
    """Parse un taux: '4.99%' -> 4.99, '-' -> None, '' -> None."""
    val = val.strip()
    if not val or val == "-" or val == "P":
        return None
    match = re.search(r'([\d.]+)\s*%', val)
    if match:
        return float(match.group(1))
    return None


def _detect_brand(marker: str, model: str, current_brand: str) -> str:
    """Détecte la marque à partir du marqueur et/ou du nom du modèle."""
    marker_clean = marker.strip().upper()
    
    # Check brand markers
    for pattern, brand in BRAND_MARKERS.items():
        if pattern in marker_clean:
            return brand
    
    # Fallback: check model name
    for keyword, brand in MODEL_BRAND_MAP.items():
        if keyword.lower() in model.lower():
            return brand
    
    return current_brand


def _parse_model_trim(model_raw: str) -> Tuple[str, str]:
    """Sépare le modèle et le trim. Ex: 'Compass North' -> ('Compass', 'North')"""
    model_raw = model_raw.replace("\n", " ").strip()
    # Remove parenthetical codes like (KMJL74) 
    model_raw = re.sub(r'\([A-Z0-9]+\)', '', model_raw).strip()
    
    parts = model_raw.split(" ", 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1].strip()


def _detect_year_from_table(table_rows: list) -> int:
    """Détecte l'année du modèle à partir des en-têtes du tableau."""
    for row in table_rows[:8]:
        for cell in row:
            if cell:
                if "2026" in str(cell):
                    return 2026
                if "2025" in str(cell):
                    return 2025
                if "2024" in str(cell):
                    return 2024
    return 2026


def parse_finance_table(table: list, year: int) -> List[Dict]:
    """Parse un tableau de financement (Table 0 du PDF).
    
    Structure des colonnes (25 ou 27 cols):
    [0]: Brand marker  [1]: Model  [2-3]: markers  [4]: Consumer Cash
    [5]: marker  [6-11]: Opt1 rates (36,48,60,72,84,96M)
    [12-16]: separators  [17]: Alt CC marker  [18-23]: Opt2 rates (36,48,60,72,84,96M)
    [24-25]: empty  [26]: Bonus Cash (si 27 cols)
    """
    programs = []
    current_brand = ""
    num_cols = len(table[0]) if table else 0
    has_bonus_col = num_cols >= 27
    
    terms = [36, 48, 60, 72, 84, 96]
    
    for row_idx, row in enumerate(table):
        # Skip header/empty rows
        if row_idx < 7:
            continue
        
        model_raw = _clean_value(row[1]) if len(row) > 1 else ""
        if not model_raw:
            continue
        
        # Skip non-data rows
        skip_keywords = ["Consumer Cash", "TYPE OF SALE", "Stackable", "Discount Type", 
                         "BEFORE TAX", "AFTER TAX", "PROGRAM", "MODEL", "IMPORTANT",
                         "*See Program", "*Consumer Cash"]
        if any(kw.lower() in model_raw.lower() for kw in skip_keywords):
            continue
        
        # Detect brand
        brand_marker = _clean_value(row[0]) if len(row) > 0 else ""
        current_brand = _detect_brand(brand_marker, model_raw, current_brand)
        
        if not current_brand:
            continue
        
        # Parse model/trim
        model, trim = _parse_model_trim(model_raw)
        
        # Consumer Cash (col 4)
        consumer_cash_raw = _clean_value(row[4]) if len(row) > 4 else ""
        # Also check col 3 for "P $X,XXX" pattern
        p_marker = _clean_value(row[3]) if len(row) > 3 else ""
        consumer_cash = _parse_cash(p_marker + " " + consumer_cash_raw)
        
        # Option 1 rates (cols 6-11)
        opt1_rates = {}
        has_opt1 = False
        for i, term in enumerate(terms):
            col_idx = 6 + i
            if col_idx < len(row):
                rate = _parse_rate(_clean_value(row[col_idx]))
                if rate is not None:
                    opt1_rates[f"rate_{term}"] = rate
                    has_opt1 = True
        
        # Alt Consumer Cash (look for value near col 16-17)
        alt_cc_raw = ""
        for check_col in [16, 17]:
            if check_col < len(row):
                val = _clean_value(row[check_col])
                if "$" in val:
                    alt_cc_raw = val
                    break
        alt_consumer_cash = _parse_cash(alt_cc_raw)
        
        # Option 2 rates (cols 18-23)
        opt2_rates = {}
        has_opt2 = False
        for i, term in enumerate(terms):
            col_idx = 18 + i
            if col_idx < len(row):
                rate = _parse_rate(_clean_value(row[col_idx]))
                if rate is not None:
                    opt2_rates[f"rate_{term}"] = rate
                    has_opt2 = True
        
        # Bonus Cash (last column if 27+ cols)
        bonus_cash = 0.0
        if has_bonus_col and len(row) > 26:
            bonus_cash = _parse_cash(_clean_value(row[26]))
        
        prog = {
            "brand": current_brand,
            "model": model,
            "trim": trim,
            "year": year,
            "consumer_cash": consumer_cash,
            "alt_consumer_cash": alt_consumer_cash,
            "bonus_cash": bonus_cash,
            "option1_rates": opt1_rates if has_opt1 else None,
            "option2_rates": opt2_rates if has_opt2 else None,
        }
        programs.append(prog)
    
    return programs


def parse_lease_table(table: list, year: int) -> List[Dict]:
    """Parse un tableau SCI Lease du PDF.
    
    Structure similaire au financement mais avec 9 termes (24-60M)
    et Lease Cash au lieu de Consumer Cash.
    """
    programs = []
    current_brand = ""
    terms = [24, 27, 36, 39, 42, 48, 51, 54, 60]
    
    for row_idx, row in enumerate(table):
        if row_idx < 7:
            continue
        
        model_raw = _clean_value(row[1]) if len(row) > 1 else ""
        if not model_raw:
            continue
        
        skip_keywords = ["Lease Cash", "TYPE OF SALE", "Stackable", "Discount Type",
                         "BEFORE TAX", "AFTER TAX", "PROGRAM", "MODEL", "IMPORTANT",
                         "*See Program", "*Lease Cash"]
        if any(kw.lower() in model_raw.lower() for kw in skip_keywords):
            continue
        
        brand_marker = _clean_value(row[0]) if len(row) > 0 else ""
        current_brand = _detect_brand(brand_marker, model_raw, current_brand)
        
        if not current_brand:
            continue
        
        model, trim = _parse_model_trim(model_raw)
        
        # Lease Cash
        lease_cash_raw = _clean_value(row[4]) if len(row) > 4 else ""
        p_marker = _clean_value(row[3]) if len(row) > 3 else ""
        lease_cash = _parse_cash(p_marker + " " + lease_cash_raw)
        
        # Standard rates (9 terms starting at col 6)
        std_rates = {}
        has_std = False
        for i, term in enumerate(terms):
            col_idx = 6 + i
            if col_idx < len(row):
                rate = _parse_rate(_clean_value(row[col_idx]))
                if rate is not None:
                    std_rates[str(term)] = rate
                    has_std = True
        
        # Alternative Lease Cash
        alt_lc_raw = ""
        for check_col in range(15, 20):
            if check_col < len(row):
                val = _clean_value(row[check_col])
                if "$" in val:
                    alt_lc_raw = val
                    break
        alt_lease_cash = _parse_cash(alt_lc_raw)
        
        # Alternative rates (9 terms)
        alt_rates = {}
        has_alt = False
        alt_start = 20  # Approximate start of alt rates
        for check in range(15, 22):
            if check < len(row):
                rate = _parse_rate(_clean_value(row[check]))
                if rate is not None:
                    alt_start = check
                    break
        
        for i, term in enumerate(terms):
            col_idx = alt_start + i
            if col_idx < len(row):
                rate = _parse_rate(_clean_value(row[col_idx]))
                if rate is not None:
                    alt_rates[str(term)] = rate
                    has_alt = True
        
        prog = {
            "brand": current_brand,
            "model": f"{model} {trim}".strip(),
            "lease_cash": lease_cash,
            "alt_lease_cash": alt_lease_cash,
            "standard_rates": std_rates if has_std else {},
            "alternative_rates": alt_rates if has_alt else {},
        }
        programs.append(prog)
    
    return programs


def extract_programs_from_pdf(pdf_bytes: bytes, pages: List[int], extraction_type: str = "finance") -> Dict:
    """
    Extraction déterministe des programmes depuis un PDF FCA.
    
    Args:
        pdf_bytes: contenu du PDF
        pages: liste des numéros de pages (1-indexed)
        extraction_type: 'finance' ou 'lease'
    
    Returns:
        Dict avec les programmes extraits par année
    """
    all_programs = []
    
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        total_pages = len(pdf.pages)
        logger.info(f"[PDF Parser] Opening PDF with {total_pages} pages, extracting pages {pages}")
        
        for page_num in pages:
            if page_num < 1 or page_num > total_pages:
                logger.warning(f"[PDF Parser] Page {page_num} out of range (1-{total_pages})")
                continue
            
            page = pdf.pages[page_num - 1]
            tables = page.extract_tables()
            
            if not tables:
                logger.warning(f"[PDF Parser] No tables found on page {page_num}")
                continue
            
            # Main data table is always the first/largest table
            main_table = max(tables, key=lambda t: len(t))
            year = _detect_year_from_table(main_table)
            
            logger.info(f"[PDF Parser] Page {page_num}: {len(tables)} tables, main={len(main_table)} rows x {len(main_table[0])} cols, year={year}")
            
            if extraction_type == "lease":
                progs = parse_lease_table(main_table, year)
            else:
                progs = parse_finance_table(main_table, year)
            
            logger.info(f"[PDF Parser] Page {page_num}: extracted {len(progs)} programs")
            all_programs.extend(progs)
    
    # Group by year
    programs_by_year = {}
    for prog in all_programs:
        y = prog.get("year", 2026)
        if y not in programs_by_year:
            programs_by_year[y] = []
        programs_by_year[y].append(prog)
    
    return {
        "programs": all_programs,
        "by_year": programs_by_year,
        "total": len(all_programs),
    }
