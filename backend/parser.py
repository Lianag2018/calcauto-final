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
    - VIN FCA avec tirets: XXXXX-XX-XXXXXX (format 5-2-X)
    - VIN avec erreurs OCR courantes (I/1, O/0, K/J)
    """
    text = text.upper()
    
    # Pattern VIN FCA spécifique (1C4R... avec tirets)
    # Tolère K au lieu de J (erreur OCR courante)
    vin_fca_pattern = r'1C4R[IJKL][JK]AG[0-9][-\s]*[A-Z0-9]{2}[-\s]*[A-Z0-9]{6}'
    vin_match = re.search(vin_fca_pattern, text)
    if vin_match:
        vin = re.sub(r'[-\s]', '', vin_match.group())
        # Corriger K→J si nécessaire (position 5 devrait être J)
        if len(vin) >= 5 and vin[4] == 'K':
            vin = vin[:4] + 'J' + vin[5:]
        return vin[:17] if len(vin) >= 17 else vin
    
    # VIN avec tirets FCA générique (5-2-X chars)
    vin_dash_match = re.search(
        r'([0-9A-HJ-NPR-Z]{5,9})[-\s]([A-HJ-NPR-Z0-9]{2})[-\s]([A-HJ-NPR-Z0-9]{6,10})',
        text
    )
    if vin_dash_match:
        vin = vin_dash_match.group(1) + vin_dash_match.group(2) + vin_dash_match.group(3)
        if len(vin) >= 17:
            return vin[:17]
    
    # VIN standard 17 caractères (sans tirets)
    vin_match = re.search(r'\b([0-9A-HJ-NPR-Z]{17})\b', text)
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
    Amélioré pour supporter les variations de format Google Vision OCR.
    """
    data = {
        "ep_cost": None,
        "pdco": None,
        "pref": None,
        "holdback": None
    }
    
    # Normaliser le texte (remplacer les séparateurs courants)
    normalized = text.upper()
    
    # E.P. (Employee Price / Coût réel) - Patterns améliorés
    ep_patterns = [
        r"E\.P\.?\s*(\d{7,10})",      # E.P. ou E.P suivi de chiffres
        r"E\.?P\.?\s*(\d{7,10})",     # EP. ou E.P ou EP
        r"EP\s*(\d{7,10})",           # EP sans point
        r"\bEP[\.\s]*(\d{7,10})",     # EP avec . ou espace optionnel
    ]
    for pattern in ep_patterns:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            data["ep_cost"] = clean_fca_price(match.group(1))
            break
    
    # PDCO (Prix Dealer) - Patterns améliorés
    pdco_patterns = [
        r"PDCO\s*(\d{7,10})",         # PDCO standard
        r"PDC0\s*(\d{7,10})",         # PDC0 (OCR confusion O/0)
        r"P\.?D\.?C\.?O\.?\s*(\d{7,10})",  # Avec points
        r"\bPDCO?(\d{7,10})",         # PDCO collé aux chiffres
    ]
    for pattern in pdco_patterns:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            data["pdco"] = clean_fca_price(match.group(1))
            break
    
    # PREF (Prix de référence)
    pref_patterns = [
        r"PREF\*?\s*(\d{7,10})",
        r"P\.?R\.?E\.?F\.?\*?\s*(\d{7,10})",
        r"\bPREF\*?(\d{7,10})",       # PREF collé aux chiffres
    ]
    for pattern in pref_patterns:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            data["pref"] = clean_fca_price(match.group(1))
            break
    
    # Holdback: chercher près de PREF pour éviter faux positifs
    holdback_patterns = [
        r"PREF[^\d]*\d{7,8}[^\d]*(\b0\d{5}\b)",  # Holdback après PREF
        r"HOLDBACK\s*[:\s]*(\d{3,6})",           # Label explicite
        r"HB\s*[:\s]*(\d{3,6})"                  # Abréviation
    ]
    for pattern in holdback_patterns:
        holdback_match = re.search(pattern, normalized, re.IGNORECASE)
        if holdback_match:
            data["holdback"] = clean_fca_price(holdback_match.group(1))
            break
    
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
    Extrait la liste des options depuis le texte OCR.
    
    Format FCA Canada:
    - CODE (2-5 chars alphanumériques) + DESCRIPTION + [MONTANT ou * ou SANS FRAIS]
    
    Codes d'options FCA typiques:
    - PXJ, PWZ, PW7 (couleurs)
    - ABR, ALC, GWJ, YGW, DFW, ERC (équipements)
    - 2TE, 23E, 3CC, 4CP (packages)
    - B6W7 (intérieur)
    """
    options = []
    
    # Codes connus FCA Canada (équipements, couleurs, packages)
    known_fca_codes = {
        # Couleurs
        'PXJ', 'PW7', 'PWZ', 'PWL', 'PX8', 'PAU', 'PSC', 'PGG', 'PBF', 'PGE',
        'PRM', 'PAR', 'PYB', 'PBJ', 'PFQ', 'PR4', 'PBK', 'PWD',
        # Intérieur
        'B6W7', 'CLX9', 'X9', 'TL', 'TX', 'T9',
        # Équipements
        'ABR', 'ALC', 'DFW', 'ERC', 'GWJ', 'YGW', 'ADE', 'ADG', 'APA', 'XAC',
        'UAQ', 'UAM', 'RSD', 'RSB', 'GCD', 'AAN', 'AAM', 'NHK', 'LNJ', 'XR',
        'DMC', 'AJK', 'AJV', 'AHR', 'RC3', 'RC4', 'AH6', 'AFG', 'AWB', 'AWL',
        # Packages / Groupes
        '2TE', '23E', '2BZ', '2BX', '2BY', '21D', '22B', '22D', '22G', '22J',
        '27A', '27D', '29K', '29N', '27J', '21B', '21F', '25A', '26A', '25F',
        '3CC', '4CP',
        # Taxes / Frais
        '801', '999', '92HC1', '92HC2',
    }
    
    # Codes à ignorer (pas des options)
    invalid_codes = {
        'VIN', 'GST', 'TPS', 'QUE', 'INC', 'PDCO', 'PREF', 'MODEL', 'MODELE',
        'TOTAL', 'MSRP', 'SUB', 'EP', 'HST', 'TVQ', 'GVW', 'KG', 'FCA',
        'DIST', 'DEALER', 'SHIP', 'TERMS', 'KEY', 'OPT', 'SOLD', 'DATE',
        'INVOICE', 'VEHICLE', 'NUMBER', 'FACTURE', 'AMOUNT', 'MONTANT',
        'CE', 'DU', 'DE', 'LA', 'LE', 'AU', 'EN', 'ET', 'OU', 'UN', 'IF',
        'NO', 'SEE', 'PAGE', 'VOIR', 'PAS', 'SHOWN', 'CANADA', 'FOR',
        'ORIGINAL', 'WINDSOR', 'ONTARIO', 'BOULEVARD', 'STREET',
    }
    
    # Nettoyer et normaliser le texte
    text_upper = text.upper()
    lines = text_upper.split('\n')
    
    # Méthode 1: Chercher les codes connus directement
    for code in known_fca_codes:
        # Chercher le code suivi d'une description
        pattern = rf'\b{re.escape(code)}\s+([A-Z][A-Z0-9\s,\-\'/\.]+?)(?:\s+(\d{{1,3}}[,\.]?\d{{3}}[,\.]?\d{{2}}|\d+\.\d{2}|SANS\s*FRAIS|\*))?(?:\n|$)'
        matches = re.findall(pattern, text_upper, re.MULTILINE)
        
        for match in matches:
            desc = match[0].strip() if match[0] else ""
            amount_str = match[1] if len(match) > 1 and match[1] else ""
            
            # Nettoyer la description
            desc = re.sub(r'\s+', ' ', desc)[:60]
            
            # Filtrer les descriptions invalides
            if len(desc) < 3 or desc.startswith('AMOUNT') or desc.startswith('MONTANT'):
                continue
            
            # Calculer le montant
            if 'SANS' in amount_str or amount_str == '*' or not amount_str:
                amount_value = 0
            else:
                # Convertir montant (format: 1,658.00 ou 871.00)
                clean_amount = re.sub(r'[^\d]', '', amount_str)
                if len(clean_amount) >= 3:
                    try:
                        amount_value = int(clean_amount[:-2]) if len(clean_amount) > 2 else int(clean_amount)
                    except:
                        amount_value = 0
                else:
                    amount_value = 0
            
            # Éviter les doublons
            if not any(o['product_code'] == code for o in options):
                options.append({
                    "product_code": code,
                    "description": desc,
                    "amount": 0  # On met 0 comme demandé par l'utilisateur
                })
    
    # Méthode 2: Chercher les codes avec pattern générique (2-5 chars)
    # Pattern: CODE au début de ligne ou après espace, suivi de description
    generic_pattern = r'(?:^|\n)\s*([A-Z0-9]{2,5})\s+([A-Z][A-Z\s]{5,40}?)(?:\s+\d|$|\n)'
    generic_matches = re.findall(generic_pattern, text_upper, re.MULTILINE)
    
    for code, desc in generic_matches:
        # Filtrer les codes invalides
        if code in invalid_codes:
            continue
        if len(code) < 2 or code.isdigit():
            continue
        
        # Filtrer les descriptions invalides
        desc = re.sub(r'\s+', ' ', desc.strip())[:60]
        if len(desc) < 5:
            continue
        if any(invalid in desc for invalid in ['AMOUNT', 'MONTANT', 'TOTAL', 'FACTURE', 'INVOICE']):
            continue
        
        # Éviter les doublons
        if not any(o['product_code'] == code for o in options):
            options.append({
                "product_code": code,
                "description": desc,
                "amount": 0
            })
    
    # Limiter à 20 options max pour éviter le bruit
    return options[:20]


def parse_stock_number(text: str) -> Optional[str]:
    """
    Extrait le numéro de stock (souvent écrit à la main, 5 chiffres)
    Amélioré pour supporter les différents formats et positions
    """
    # Patterns avec label explicite
    patterns = [
        r"STOCK\s*#?\s*(\d{5})",
        r"INV\s*#?\s*(\d{5})",
        r"#(\d{5})\b",
        r"STOCK\s*NO\.?\s*(\d{5})",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    
    # Si pas trouvé avec label, chercher un nombre de 5 chiffres isolé
    # Le stock manuscrit est souvent sur sa propre ligne
    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        # Ligne contenant uniquement un nombre de 5 chiffres
        if re.match(r'^\d{5}$', line):
            # Éviter les faux positifs (codes postaux, etc.)
            num = int(line)
            # Les numéros de stock FCA sont généralement entre 10000 et 99999
            # et ne ressemblent pas à des codes postaux canadiens
            if 10000 <= num <= 99999:
                # Exclure les codes connus (adresses, etc.)
                if line not in ['10240']:  # Exclure adresse connue du dealer
                    return line
    
    # Fallback: chercher parmi tous les nombres de 5 chiffres
    # en excluant ceux qui ressemblent à des montants ou codes connus
    all_five_digits = re.findall(r'\b(\d{5})\b', text)
    exclude_patterns = ['10240', '07544', '06997', '07070']  # Adresses et codes financiers partiels
    
    for num in all_five_digits:
        if num not in exclude_patterns and not num.startswith('0'):
            # Vérifier que ce n'est pas un montant (pas précédé de $ ou suivi de .00)
            if not re.search(rf'\${num}|{num}\.00', text):
                return num
    
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
