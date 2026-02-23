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


def parse_trim_from_description(text: str) -> Optional[str]:
    """
    Extrait le trim depuis la ligne DESCRIPTION de la facture FCA.
    
    La ligne ressemble généralement à:
    MODEL/OPT    Compass    DESCRIPTION    Limited    AMOUNT/MONTANT
    ou: Ram 3500 Bighorn (manuscrit)
    
    Trims connus Stellantis:
    - Compass: Sport, North, Trailhawk, Limited, Altitude
    - Grand Cherokee: Laredo, Altitude, Limited, Summit, Overland, Trackhawk
    - Ram: Tradesman, Big Horn, Bighorn, Lone Star, Laramie, Limited, Rebel, TRX, Express
    - Wrangler: Sport, Willys, Rubicon, Sahara
    - Cherokee: Latitude, Altitude, Trailhawk, Limited, Overland
    """
    # Liste des trims connus (ordre de priorité - du plus spécifique au moins)
    known_trims = [
        # Trims spécifiques longs d'abord
        "Limited Reserve", "Summit Reserve", "High Altitude", "Big Horn", "Lone Star",
        # Trims Ram
        "Bighorn", "Laramie", "Rebel", "Tradesman", "TRX", "Express", "Night Edition",
        # Trims courants
        "Limited", "Trailhawk", "Altitude", "Summit", "Overland",
        "Laredo", "North", "Sport", "Sahara", "Rubicon", "Willys",
        "Latitude", "SXT", "PHEV", "Base"
    ]
    
    text_upper = text.upper()
    
    # Chercher dans le texte
    for trim in known_trims:
        # Chercher le trim dans le texte (insensible à la casse)
        pattern = rf'\b{trim}\b'
        if re.search(pattern, text, re.IGNORECASE):
            return trim
    
    return None


def parse_model_from_description(text: str) -> Optional[str]:
    """
    Extrait le modèle depuis la ligne DESCRIPTION de la facture FCA.
    
    Patterns: "Ram 1500", "Ram 2500", "Ram 3500", "Grand Cherokee", etc.
    """
    # Patterns pour les modèles Ram avec numéro
    ram_patterns = [
        (r'\bRam\s*3500\b', 'Ram 3500'),
        (r'\bRam\s*2500\b', 'Ram 2500'),
        (r'\bRam\s*1500\b', 'Ram 1500'),
        (r'\b3500\b.*\bRam\b', 'Ram 3500'),
        (r'\b2500\b.*\bRam\b', 'Ram 2500'),
        (r'\b1500\b.*\bRam\b', 'Ram 1500'),
    ]
    
    for pattern, model in ram_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return model
    
    # Patterns pour autres modèles
    model_patterns = [
        (r'\bGrand\s*Cherokee\s*L\b', 'Grand Cherokee L'),
        (r'\bGrand\s*Cherokee\b', 'Grand Cherokee'),
        (r'\bCompass\b', 'Compass'),
        (r'\bWrangler\b', 'Wrangler'),
        (r'\bGladiator\b', 'Gladiator'),
        (r'\bCherokee\b', 'Cherokee'),
        (r'\bDurango\b', 'Durango'),
        (r'\bCharger\b', 'Charger'),
        (r'\bChallenger\b', 'Challenger'),
        (r'\bPacifica\b', 'Pacifica'),
        (r'\bHornet\b', 'Hornet'),
        (r'\bProMaster\b', 'ProMaster'),
    ]
    
    for pattern, model in model_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return model
    
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
    Extrait la liste des options depuis le texte OCR de factures FCA Canada.
    
    Le texte OCR de Google Vision peut avoir les codes et descriptions sur des lignes séparées.
    On construit un mapping code→description en analysant le texte.
    """
    options = []
    
    # Dictionnaire des descriptions FCA connues
    fca_descriptions = {
        # Couleurs
        'PXJ': 'Couche nacrée cristal noir étincelant',
        'PW7': 'Blanc éclatant',
        'PWZ': 'Blanc ivoire 3 couches',
        'PWL': 'Blanc perle',
        'PX8': 'Noir diamant',
        'PAU': 'Rouge flamme',
        'PSC': 'Gris destroyer',
        'PGG': 'Gris granit cristal',
        'PBF': 'Bleu patriote',
        'PGE': 'Vert sarge',
        'PRM': 'Rouge velours',
        'PAR': 'Argent billet',
        'PYB': 'Jaune stinger',
        'PBJ': 'Bleu hydro',
        'PFQ': 'Granite cristal',
        # Intérieur
        'B6W7': 'Sièges en similicuir capri',
        'CLX9': 'Cuir Nappa ventilé',
        # Équipements
        'ABR': 'Ensemble attelage de remorque',
        'ALC': 'Ensemble allure noire',
        'DFW': 'Transmission automatique 8 vitesses',
        'ERC': 'Moteur V6 Pentastar 3.6L',
        'GWJ': 'Toit ouvrant panoramique 2 panneaux CommandView',
        'YGW': '20L supplémentaires essence',
        'ADE': 'Système de divertissement arrière',
        'ADG': 'Navigation et radio satellite',
        'UAQ': 'Groupe remorquage haute capacité',
        'RSD': 'Roues 20 pouces',
        'DMC': 'Climatisation 3 zones',
        'AJK': 'Sièges avant chauffants et ventilés',
        'AHR': 'Volant chauffant',
        'AWL': 'Système audio premium Alpine',
        # Packages
        '2TE': 'Ensemble éclair 2TE',
        '23E': 'Ensemble éclair 23E',
        '2BZ': 'Groupe luxe',
        '2BX': 'Groupe technologie',
        '21D': 'Groupe remorquage',
        '22B': 'Groupe commodité',
        '27A': 'Groupe apparence',
        '3CC': 'Groupe 3CC',
        # Taxes/Frais
        '4CP': 'Taxe accise fédérale - Climatiseur',
        '801': 'Frais de transport',
        '999': 'Finance/Expédition',
        '92HC1': 'Cotisation P.P.',
        '92HC2': 'Allocation de marketing',
    }
    
    # Codes à ignorer (pas des options)
    invalid_codes = {
        'VIN', 'GST', 'TPS', 'QUE', 'INC', 'PDCO', 'PREF', 'MODEL', 'MODELE',
        'TOTAL', 'MSRP', 'SUB', 'EP', 'HST', 'TVQ', 'GVW', 'KG', 'FCA',
        'DIST', 'DEALER', 'SHIP', 'TERMS', 'KEY', 'OPT', 'SOLD', 'DATE',
        'INVOICE', 'VEHICLE', 'NUMBER', 'FACTURE', 'AMOUNT', 'MONTANT',
        'CE', 'DU', 'DE', 'LA', 'LE', 'AU', 'EN', 'ET', 'OU', 'UN', 'IF',
        'NO', 'SEE', 'PAGE', 'VOIR', 'PAS', 'SHOWN', 'CANADA', 'FOR',
        'ORIGINAL', 'WINDSOR', 'ONTARIO', 'BOULEVARD', 'STREET', 'SAND',
        'SOMME', 'TOIT', '20L', 'SANS', 'FRAIS', 'ACCISE', 'ALLURE',
        'AUX', 'BEAU', 'ECLAIR', 'ATTELAGE', 'OUVR', 'PANO', 'TAXES',
        'NACREE', 'CRISTAL', 'NOIR', 'ETINCEL', 'ENSEMBLE', 'GROUPE',
        'REMORQUE', 'TRANSMISSION', 'AUTOMATIQUE', 'MOTEUR', 'PENTASTAR',
        'SUPPLEMENTAIRES', 'ESSENCE', 'TRANSPORT', 'COTISATION', 'MARKETING',
        'ALLOCATION', 'FINANCE', 'EXPEDIE', 'FEDERALE', 'CLIMATISEUR',
        'SIEGES', 'SIMILICUIR', 'CAPRI', 'COMMANDVIEW', 'VITESSES',
        'NOIRE', 'EST', 'FABRIQUE', 'POUR', 'REPONDRE', 'EXIGENCES',
        'CANADIENNES', 'SPECIFIQUES', 'VEHICULE', 'VENTE', 'IMMATRICULATION',
        'HORS', 'LIMITED', 'DESCRIPTION', 'CONC', 'VENDU', 'KENNEBEC',
        'DODGE', 'CHRYSLER', 'LACROIX', 'GEORGES', 'REG', 'INS', 'AUTOMOTIVE',
        'LEE', 'HIM', 'WELLINGTON', 'TORONTO', 'ORDER', 'COMMANDE', 'CLEF',
        'COUCHE', 'C08', 'C4564', 'G5Y', '1K1', 'M5J', '1J1', 'FL', 'ON',
        '1C4', 'S8', '806264', 'R100963941', 'GFBR', 'RETING', 'II', 'III',
        'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'NI', 'TAX', 'TAUX',
        'PAN', 'PANN',  # Fragments de descriptions (YGW retiré - c'est une option valide)
    }
    
    text_upper = text.upper()
    
    # Chercher UNIQUEMENT les codes connus (plus fiable, évite les faux positifs)
    found_codes = set()
    for code in fca_descriptions.keys():
        if re.search(rf'\b{re.escape(code)}\b', text_upper):
            found_codes.add(code)
    
    # Construire la liste d'options avec CODE + DESCRIPTION (format facture)
    for code in found_codes:
        if code in invalid_codes:
            continue
        
        # Format: "CODE - Description" comme sur la facture
        base_description = fca_descriptions.get(code, "")
        formatted_description = f"{code} - {base_description}" if base_description else code
        
        options.append({
            "product_code": code,
            "description": formatted_description[:60],
            "amount": 0  # Prix à 0 comme demandé
        })
    
    # Définir l'ordre de priorité (comme sur la facture FCA)
    # 1. Couleurs, 2. Intérieur, 3. Équipements, 4. Packages, 5. Taxes/Frais
    priority_order = {
        # Couleurs (en premier)
        'PXJ': 1, 'PW7': 1, 'PWZ': 1, 'PWL': 1, 'PX8': 1, 'PAU': 1, 
        'PSC': 1, 'PGG': 1, 'PBF': 1, 'PGE': 1, 'PRM': 1, 'PAR': 1,
        'PYB': 1, 'PBJ': 1, 'PFQ': 1,
        # Intérieur
        'B6W7': 2, 'CLX9': 2,
        # Équipements
        'ABR': 3, 'ALC': 3, 'DFW': 3, 'ERC': 3, 'GWJ': 3, 'YGW': 3,
        'ADE': 3, 'ADG': 3, 'UAQ': 3, 'RSD': 3, 'DMC': 3, 'AJK': 3, 'AHR': 3, 'AWL': 3,
        # Packages
        '2TE': 4, '23E': 4, '2BZ': 4, '2BX': 4, '21D': 4, '22B': 4, '27A': 4, '3CC': 4,
        # Taxes/Frais (en dernier)
        '4CP': 5, '801': 5, '999': 5, '92HC1': 5, '92HC2': 5,
    }
    
    # Trier par priorité (ordre facture), puis par code
    options.sort(key=lambda x: (priority_order.get(x['product_code'], 3), x['product_code']))
    
    # Limiter à 20 options max
    return options[:20]


def parse_stock_number(text: str) -> Optional[str]:
    """
    Extrait le numéro de stock (souvent écrit à la main, 5 chiffres)
    Le stock manuscrit est généralement le DERNIER nombre de 5 chiffres sur la facture
    (écrit en bas, au centre ou à droite)
    """
    # Patterns avec label explicite (priorité haute)
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
    
    # Codes à exclure (adresses, montants partiels, codes financiers)
    exclude_patterns = {
        '10240',  # Adresse dealer
        '07544', '07774', '06997', '07205', '07070', '07277',  # Codes financiers
        '72752', '76389', '64951',  # Montants
        '50000', '05000',  # GVW patterns
    }
    
    # Exclure les nombres qui font partie d'adresses (suivi de BOULEVARD, ST-, etc.)
    address_context = re.findall(r'(\d{5})[,\s]+(BOULEVARD|BLVD|AVENUE|AVE|RUE|ST-|STREET)', text, re.IGNORECASE)
    for addr_num, _ in address_context:
        exclude_patterns.add(addr_num)
    
    # Trouver TOUS les nombres de 5 chiffres isolés sur leur propre ligne
    # Le stock manuscrit est généralement le DERNIER (tout en bas de la facture)
    lines = text.split('\n')
    stock_candidates = []
    
    # D'abord chercher les lignes avec UNIQUEMENT un nombre 5 chiffres (manuscrit)
    for line in lines:
        line = line.strip()
        # Ligne contenant uniquement un nombre de 5 chiffres (ou avec quelques caractères)
        match = re.match(r'^[\s\W]*(\d{5})[\s\W]*$', line)
        if match:
            num = match.group(1)
            if num not in exclude_patterns and not num.startswith('0'):
                stock_candidates.append(num)
    
    # Prendre le DERNIER candidat (le plus en bas de la facture)
    if stock_candidates:
        return stock_candidates[-1]
    
    # Fallback: chercher le dernier nombre de 5 chiffres valide dans le texte
    # En commençant par la fin du texte (où le stock manuscrit se trouve souvent)
    all_five_digits = re.findall(r'\b(\d{5})\b', text)
    
    # Filtrer et prendre le dernier
    valid_candidates = []
    for num in all_five_digits:
        if num not in exclude_patterns and not num.startswith('0'):
            # Vérifier que ce n'est pas un montant ou partie d'une adresse
            if not re.search(rf'\${num}|{num}\.00|{num}\.60|{num}[,\s]+BOULEVARD|{num}[,\s]+BLVD', text, re.IGNORECASE):
                valid_candidates.append(num)
    
    if valid_candidates:
        return valid_candidates[-1]  # Retourner le DERNIER
    
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
        "trim": None,  # Ajouté pour extraire le trim de la facture
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
    
    # Trim depuis la description (full_text)
    result["trim"] = parse_trim_from_description(ocr_result.get("full_text", ""))
    
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
