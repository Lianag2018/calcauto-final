"""
Parser Structuré FCA Canada - Extraction Regex
Parse le texte OCR en données structurées

Appliqué après le pipeline OCR par zones.
"""

import re
from typing import Dict, List, Optional, Any
import logging

logger = logging.getLogger(__name__)


def clean_fca_price(raw_value: str) -> int:
    """
    Décode le format prix FCA Canada:
    - Enlever le premier 0
    - Enlever les deux derniers chiffres
    
    Exemple: 05662000 → 5662000 → 56620 → 56620$
    """
    raw_value = str(raw_value).strip()
    raw_value = re.sub(r'[^\d]', '', raw_value)
    
    if not raw_value or len(raw_value) < 4:
        return 0
    
    # Enlever le premier 0
    if raw_value.startswith("0"):
        raw_value = raw_value[1:]
    
    # Enlever les deux derniers chiffres
    if len(raw_value) >= 2:
        raw_value = raw_value[:-2]
    
    try:
        return int(raw_value)
    except:
        return 0


def parse_vin(text: str) -> Optional[str]:
    """
    Extrait le VIN depuis le texte.
    
    Formats supportés:
    - VIN standard 17 caractères
    - VIN FCA avec tirets: XXXXX-XX-XXXXXX
    """
    # VIN avec tirets FCA
    vin_match = re.search(
        r'([0-9A-HJ-NPR-Z]{5})[-\s]?([A-HJ-NPR-Z0-9]{2})[-\s]?([A-HJ-NPR-Z0-9]{6,10})',
        text.upper()
    )
    if vin_match:
        vin = vin_match.group(1) + vin_match.group(2) + vin_match.group(3)
        # Prendre seulement 17 caractères
        return vin[:17] if len(vin) >= 17 else None
    
    # VIN standard 17 caractères
    vin_match = re.search(r'\b([0-9A-HJ-NPR-Z]{17})\b', text.upper())
    if vin_match:
        return vin_match.group(1)
    
    return None


def parse_model_code(text: str) -> Optional[str]:
    """
    Extrait le code modèle FCA.
    
    Patterns connus:
    - WL**** (Grand Cherokee)
    - JT**** (Gladiator)
    - DT**** (Ram)
    - JL**** (Wrangler)
    """
    patterns = [
        r'\b(WL[A-Z]{2}\d{2})\b',  # Grand Cherokee
        r'\b(JT[A-Z]{2}\d{2})\b',  # Gladiator
        r'\b(DT[A-Z0-9]{2}\d{2})\b',  # Ram
        r'\b(JL[A-Z]{2}\d{2})\b',  # Wrangler
        r'\b(KL[A-Z]{2}\d{2})\b',  # Cherokee
        r'\b(WD[A-Z]{2}\d{2})\b',  # Durango
        r'\b(MP[A-Z]{2}\d{2})\b',  # Compass
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text.upper())
        if match:
            return match.group(1)
    
    return None


def parse_financial_data(text: str) -> Dict[str, Optional[int]]:
    """
    Extrait EP, PDCO, PREF, Holdback depuis le texte.
    """
    data = {
        "ep_cost": None,
        "pdco": None,
        "pref": None,
        "holdback": None
    }
    
    # E.P. (Employee Price / Coût réel)
    ep_patterns = [
        r"E\.P\.\s*(\d{7,10})",
        r"E\.P\s+(\d{7,10})",
        r"EP\s+(\d{7,10})"
    ]
    for pattern in ep_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            data["ep_cost"] = clean_fca_price(match.group(1))
            break
    
    # PDCO (Prix Dealer)
    pdco_patterns = [
        r"PDCO\s*(\d{7,10})",
        r"P\.D\.C\.O\.\s*(\d{7,10})"
    ]
    for pattern in pdco_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            data["pdco"] = clean_fca_price(match.group(1))
            break
    
    # PREF (Prix de référence)
    pref_patterns = [
        r"PREF\*?\s*(\d{7,10})",
        r"P\.R\.E\.F\.\s*(\d{7,10})"
    ]
    for pattern in pref_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            data["pref"] = clean_fca_price(match.group(1))
            break
    
    # Holdback (généralement 6 chiffres commençant par 0)
    holdback_match = re.search(r'\b(0[3-9]\d{4})\b', text)
    if holdback_match:
        data["holdback"] = clean_fca_price(holdback_match.group(1))
    
    return data


def parse_totals(text: str) -> Dict[str, Optional[float]]:
    """
    Extrait subtotal et total depuis le texte.
    """
    data = {
        "subtotal": None,
        "invoice_total": None
    }
    
    # Subtotal patterns
    subtotal_patterns = [
        r"SUB\s*TOTAL\s*EXCLUDING\s*TAXES.*?([\d,]+\.\d{2})",
        r"SOMME\s*PARTIELLE\s*SANS\s*TAXES.*?([\d,]+\.\d{2})",
        r"SUB\s*TOTAL.*?([\d,]+\.\d{2})"
    ]
    for pattern in subtotal_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                data["subtotal"] = float(match.group(1).replace(',', ''))
            except:
                pass
            break
    
    # Total patterns
    total_patterns = [
        r"TOTAL\s+DE\s+LA\s+FACTURE\s*([\d,]+\.\d{2})",
        r"INVOICE\s*TOTAL.*?([\d,]+\.\d{2})",
        r"TOTAL\s*:?\s*([\d,]+\.\d{2})"
    ]
    for pattern in total_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                data["invoice_total"] = float(match.group(1).replace(',', ''))
            except:
                pass
            break
    
    return data


def parse_options(text: str) -> List[Dict[str, Any]]:
    """
    Extrait la liste des options depuis le texte.
    
    Pattern: CODE (2-6 chars) + DESCRIPTION + MONTANT (7-8 chiffres)
    """
    options = []
    
    # Codes à ignorer (déjà extraits ailleurs ou invalides)
    invalid_codes = {
        'VIN', 'GST', 'TPS', 'QUE', 'INC', 'PDCO', 'PREF', 
        'MODEL', 'TOTAL', 'MSRP', 'SUB', 'EP', 'HST', 'TVQ'
    }
    
    # Pattern: CODE + DESCRIPTION + MONTANT
    option_pattern = re.findall(
        r'\b([A-Z0-9]{2,6})\s+([A-Z][A-Z0-9\s,\-\'/\.]{4,50}?)\s+(\d{6,10}|\*|SANS)',
        text.upper()
    )
    
    for code, desc, amount in option_pattern:
        if code in invalid_codes:
            continue
        
        # Nettoyer la description
        desc_clean = re.sub(r'\s+', ' ', desc.strip())[:80]
        
        # Calculer le montant
        if amount in ['*', 'SANS']:
            amount_value = 0
        else:
            amount_value = clean_fca_price(amount)
        
        options.append({
            "product_code": code,
            "description": desc_clean,
            "amount": amount_value
        })
    
    return options


def parse_stock_number(text: str) -> Optional[str]:
    """
    Extrait le numéro de stock (souvent écrit à la main, 5 chiffres)
    """
    patterns = [
        r"STOCK\s*#?\s*(\d{5})",
        r"INV\s*#?\s*(\d{5})",
        r"#(\d{5})\b"
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return None


def parse_invoice_text(ocr_result: Dict[str, str]) -> Dict[str, Any]:
    """
    Parse complet du texte OCR en données structurées.
    
    Prend le résultat du pipeline OCR par zones et extrait:
    - VIN
    - Model code
    - EP, PDCO, PREF, Holdback
    - Subtotal, Total
    - Options
    - Stock number
    """
    result = {
        "vin": None,
        "model_code": None,
        "stock_no": None,
        "ep_cost": None,
        "pdco": None,
        "pref": None,
        "holdback": None,
        "subtotal": None,
        "invoice_total": None,
        "options": [],
        "fields_extracted": 0,
        "parse_method": "regex_zones"
    }
    
    # Parse VIN depuis zone VIN
    vin_text = ocr_result.get("vin_text", "")
    result["vin"] = parse_vin(vin_text)
    if result["vin"]:
        result["fields_extracted"] += 1
    
    # Chercher VIN dans full_text si pas trouvé
    if not result["vin"]:
        full_text = ocr_result.get("full_text", "")
        result["vin"] = parse_vin(full_text)
        if result["vin"]:
            result["fields_extracted"] += 1
    
    # Model code depuis zone VIN
    result["model_code"] = parse_model_code(vin_text)
    if not result["model_code"]:
        result["model_code"] = parse_model_code(ocr_result.get("full_text", ""))
    
    # Données financières depuis zone finance
    finance_text = ocr_result.get("finance_text", "")
    financial = parse_financial_data(finance_text)
    
    # Si pas trouvé dans zone finance, chercher dans full_text
    if not financial["ep_cost"]:
        financial = parse_financial_data(ocr_result.get("full_text", ""))
    
    result["ep_cost"] = financial["ep_cost"]
    result["pdco"] = financial["pdco"]
    result["pref"] = financial["pref"]
    result["holdback"] = financial["holdback"]
    
    if result["ep_cost"]:
        result["fields_extracted"] += 1
    if result["pdco"]:
        result["fields_extracted"] += 1
    
    # Totaux depuis zone totals
    totals_text = ocr_result.get("totals_text", "")
    totals = parse_totals(totals_text)
    
    if not totals["subtotal"]:
        totals = parse_totals(ocr_result.get("full_text", ""))
    
    result["subtotal"] = totals["subtotal"]
    result["invoice_total"] = totals["invoice_total"]
    
    if result["subtotal"]:
        result["fields_extracted"] += 1
    
    # Options depuis zone options
    options_text = ocr_result.get("options_text", "")
    result["options"] = parse_options(options_text)
    
    if len(result["options"]) >= 3:
        result["fields_extracted"] += 1
    
    # Stock number
    result["stock_no"] = parse_stock_number(ocr_result.get("full_text", ""))
    
    logger.info(f"Parser: {result['fields_extracted']} fields extracted, VIN={result['vin']}, EP={result['ep_cost']}")
    
    return result
