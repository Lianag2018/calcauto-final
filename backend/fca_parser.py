"""
Parser FCA Canada - Approche structurée avec regex
Basé sur la structure standard des factures FCA

Zones de la facture:
1. Header (Dealer, VIN, modèle)
2. Bloc codes financiers (EP / PDCO / PREF)
3. Bloc détail des options (code + description + montant)
4. Bloc totaux (subtotal / taxes / total)
"""

import re
from typing import Optional

def clean_price(raw_value: str) -> int:
    """
    Règle FCA standard:
    - enlever le premier 0
    - enlever les deux derniers chiffres
    
    Exemple: 05662000 → 5662000 → 56620 → 56620$
    """
    raw_value = str(raw_value).strip()
    
    # Enlever caractères non numériques
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


def parse_fca_invoice_text(text: str) -> dict:
    """
    Parse le texte extrait d'une facture FCA Canada
    Utilise des regex pour extraire les champs clés
    """
    
    data = {
        "stock_no": None,
        "vin": None,
        "model": None,
        "ep_cost": None,
        "pdco": None,
        "pref": None,
        "subtotal": None,
        "total_invoice": None,
        "options": []
    }
    
    # -------------------
    # VIN (17 caractères alphanumérique, pas de I, O, Q)
    # -------------------
    vin_match = re.search(r"\b([0-9A-HJ-NPR-Z]{17})\b", text)
    if vin_match:
        data["vin"] = vin_match.group(1)
    
    # -------------------
    # E.P. (Employee Price / Coût réel)
    # Format: E.P. 05662000 ou E.P.05662000
    # -------------------
    ep_patterns = [
        r"E\.P\.\s*(\d{7,8})",
        r"E\.P\s+(\d{7,8})",
        r"EP\s+(\d{7,8})"
    ]
    for pattern in ep_patterns:
        ep_match = re.search(pattern, text, re.IGNORECASE)
        if ep_match:
            data["ep_cost"] = clean_price(ep_match.group(1))
            break
    
    # -------------------
    # PDCO (Prix Dealer)
    # -------------------
    pdco_patterns = [
        r"PDCO\s*(\d{7,8})",
        r"PDCO\s+(\d{7,8})"
    ]
    for pattern in pdco_patterns:
        pdco_match = re.search(pattern, text, re.IGNORECASE)
        if pdco_match:
            data["pdco"] = clean_price(pdco_match.group(1))
            break
    
    # -------------------
    # PREF (Prix de référence)
    # -------------------
    pref_patterns = [
        r"PREF\*?\s*(\d{7,8})",
        r"PREF\s+(\d{7,8})"
    ]
    for pattern in pref_patterns:
        pref_match = re.search(pattern, text, re.IGNORECASE)
        if pref_match:
            data["pref"] = clean_price(pref_match.group(1))
            break
    
    # -------------------
    # Holdback (optionnel, 6 chiffres)
    # -------------------
    holdback_match = re.search(r"HOLD\s*BACK\s*(\d{5,6})", text, re.IGNORECASE)
    if holdback_match:
        data["holdback"] = clean_price(holdback_match.group(1))
    
    # -------------------
    # Stock Number (écrit à la main, souvent 5 chiffres)
    # On cherche des patterns comme "46058" ou "#46058"
    # -------------------
    stock_patterns = [
        r"#?\s*(\d{5})\s*$",  # À la fin du texte
        r"stock\s*#?\s*(\d{5})",
        r"inv\s*#?\s*(\d{5})"
    ]
    for pattern in stock_patterns:
        stock_match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if stock_match:
            data["stock_no"] = stock_match.group(1)
            break
    
    # -------------------
    # Subtotal
    # -------------------
    subtotal_match = re.search(r"SUB\s*TOTAL.*?(\d{1,3}[,\s]?\d{3}\.\d{2})", text, re.IGNORECASE)
    if subtotal_match:
        subtotal_str = subtotal_match.group(1).replace(",", "").replace(" ", "")
        try:
            data["subtotal"] = float(subtotal_str)
        except:
            pass
    
    # -------------------
    # Total Invoice
    # -------------------
    total_match = re.search(r"(TOTAL|INVOICE TOTAL).*?(\d{1,3}[,\s]?\d{3}\.\d{2})", text, re.IGNORECASE)
    if total_match:
        total_str = total_match.group(2).replace(",", "").replace(" ", "")
        try:
            data["total_invoice"] = float(total_str)
        except:
            pass
    
    # -------------------
    # OPTIONS
    # Pattern: [CODE] [DESCRIPTION] [MONTANT]
    # Exemple: ETM  6 CYL 6.7L CUMMINS DIESEL  880000
    # -------------------
    option_pattern = re.findall(
        r"\b([A-Z0-9]{2,6})\s+(.{5,50}?)\s+(\d{5,8})\b",
        text
    )
    
    for code, desc, amount in option_pattern:
        # Ignorer les codes financiers qu'on a déjà extraits
        if code.upper() in ['EP', 'PDCO', 'PREF']:
            continue
        try:
            data["options"].append({
                "code": code.strip(),
                "description": desc.strip(),
                "amount": clean_price(amount)
            })
        except:
            continue
    
    return data


def decode_vin_year(vin: str) -> Optional[int]:
    """Décode l'année du VIN (position 10)"""
    if not vin or len(vin) < 10:
        return None
    
    year_codes = {
        'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014,
        'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
        'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024,
        'S': 2025, 'T': 2026, 'V': 2027, 'W': 2028, 'X': 2029,
        'Y': 2030
    }
    
    year_char = vin[9].upper()
    return year_codes.get(year_char)


def decode_vin_brand(vin: str) -> Optional[str]:
    """Décode la marque du VIN (positions 1-3 + 4-5)"""
    if not vin or len(vin) < 5:
        return None
    
    # Jeep Gladiator a un VIN qui commence par 1C6PJ
    if vin.startswith("1C6PJ"):
        return "Jeep"
    
    wmi = vin[0:3].upper()
    
    brand_map = {
        "1C4": "Jeep",
        "1C6": "Ram",
        "1J4": "Jeep",
        "1J8": "Jeep",
        "2C3": "Chrysler",
        "3C4": "Chrysler",
        "3C6": "Ram",
        "3D4": "Dodge",
        "1B3": "Dodge",
        "2B3": "Dodge"
    }
    
    return brand_map.get(wmi)
