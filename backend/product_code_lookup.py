"""
Module de recherche de codes produits FCA/Stellantis
Fichier de référence: data/master_product_codes.json

Ce module fournit une double vérification lors du scan de factures:
1. Extraction du code depuis le texte OCR
2. Lookup dans la base de données master pour validation

Si le code est trouvé dans la base, les données sont GARANTIES correctes.
Si le code n'est pas trouvé, on utilise le décodage par pattern (fallback).
"""

import json
import os
import re
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

# Chemin vers le fichier master
MASTER_CODES_FILE = os.path.join(
    os.path.dirname(__file__),
    'data',
    'master_product_codes.json'
)

# Cache des codes (chargé une seule fois)
_MASTER_CODES: Dict[str, Dict[str, Any]] = {}
_CODES_LOADED = False


def _safe_description(data: Dict[str, Any], fallback: str = "") -> str:
    """Retourne une description robuste pour logs/UI."""
    if not isinstance(data, dict):
        return fallback

    return (
        data.get("full_description")
        or data.get("vehicle_description")
        or data.get("description")
        or " ".join(
            str(part).strip()
            for part in [
                data.get("brand"),
                data.get("model"),
                data.get("trim"),
                data.get("cab"),
                data.get("drive"),
            ]
            if part
        ).strip()
        or fallback
    )


def _validate_master_codes() -> None:
    """Validation légère du fichier master pour repérer les entrées incomplètes."""
    if not isinstance(_MASTER_CODES, dict):
        logger.warning("[ProductCodeLookup] _MASTER_CODES n'est pas un dict")
        return

    invalid_entries: List[str] = []
    missing_full_description: List[str] = []

    for code, data in _MASTER_CODES.items():
        if not isinstance(data, dict):
            invalid_entries.append(str(code))
            continue

        if "full_description" not in data:
            missing_full_description.append(str(code))

    if invalid_entries:
        logger.warning(
            "[ProductCodeLookup] Entrées invalides dans la base master (%d): %s",
            len(invalid_entries),
            invalid_entries[:20],
        )

    if missing_full_description:
        logger.warning(
            "[ProductCodeLookup] Codes sans full_description (%d): %s",
            len(missing_full_description),
            missing_full_description[:20],
        )


def _load_master_codes():
    """Charge les codes master depuis le fichier JSON."""
    global _MASTER_CODES, _CODES_LOADED

    if _CODES_LOADED:
        return

    try:
        if os.path.exists(MASTER_CODES_FILE):
            with open(MASTER_CODES_FILE, 'r', encoding='utf-8') as f:
                loaded = json.load(f)

            if isinstance(loaded, dict):
                _MASTER_CODES = loaded
                logger.info(
                    "[ProductCodeLookup] Chargé %d codes master depuis %s",
                    len(_MASTER_CODES),
                    MASTER_CODES_FILE,
                )
                _validate_master_codes()
            else:
                logger.error(
                    "[ProductCodeLookup] Format inattendu pour %s: %s",
                    MASTER_CODES_FILE,
                    type(loaded).__name__,
                )
                _MASTER_CODES = {}
        else:
            logger.warning(
                "[ProductCodeLookup] Fichier master non trouvé: %s",
                MASTER_CODES_FILE,
            )
            _MASTER_CODES = {}

    except Exception as e:
        logger.error(f"[ProductCodeLookup] Erreur chargement: {e}")
        _MASTER_CODES = {}

    _CODES_LOADED = True


def lookup_product_code(code: str) -> Optional[Dict[str, Any]]:
    """
    Recherche un code produit dans la base master.

    Args:
        code: Code produit FCA (ex: D28H92, DJ7L92)

    Returns:
        Dict avec les infos du véhicule si trouvé, None sinon
    """
    _load_master_codes()

    if not code:
        logger.warning("[ProductCodeLookup] Code vide reçu")
        return None

    code = code.upper().strip()

    if code in _MASTER_CODES:
        entry = _MASTER_CODES[code] or {}

        description = _safe_description(entry, fallback=code)
        logger.info(f"[ProductCodeLookup] Code {code} TROUVÉ: {description}")

        return entry

    logger.warning(f"[ProductCodeLookup] Code {code} NON TROUVÉ dans la base master")
    return None


def extract_product_code_from_text(text: str) -> Optional[str]:
    """
    Extrait le code produit FCA depuis le texte OCR.

    Le code est généralement la première ligne sous "MODEL/OPT"
    Format: 6 caractères alphanumériques (ex: D28H92, DJ7L92, WLJP74)

    Args:
        text: Texte OCR complet de la facture

    Returns:
        Code produit si trouvé, None sinon
    """
    if not text:
        return None

    text = text.upper()

    # Patterns pour les codes produits FCA
    patterns = [
        # Ram Heavy Duty 3500 (D2x, D23, D28, etc.)
        r'\b(D2[0-9][A-Z0-9]{3})\b',
        r'\b(D[23][0-9][A-Z][0-9]{2})\b',

        # Ram Heavy Duty 2500 (DJx)
        r'\b(DJ[0-9][A-Z][0-9]{2})\b',

        # Ram 1500 (DTx, DSx)
        r'\b(DT[0-9][A-Z0-9]{3})\b',
        r'\b(DS[0-9][A-Z0-9]{3})\b',

        # Jeep
        r'\b(WL[A-Z]{2}[0-9]{2})\b',  # Grand Cherokee
        r'\b(WS[A-Z]{2}[0-9]{2})\b',  # Wagoneer S
        r'\b(JL[A-Z]{2}[0-9]{2})\b',  # Wrangler
        r'\b(JT[A-Z]{2}[0-9]{2})\b',  # Gladiator
        r'\b(MP[A-Z]{2}[0-9]{2})\b',  # Compass
        r'\b(KM[A-Z]{2}[0-9]{2})\b',  # Cherokee

        # Dodge
        r'\b(WD[A-Z]{2}[0-9]{2})\b',  # Durango
        r'\b(LD[A-Z]{2}[0-9]{2})\b',  # Durango/LD family
        r'\b(LB[A-Z]{2}[0-9]{2})\b',  # Charger
        r'\b(HN[A-Z]{2}[0-9]{2})\b',  # Hornet

        # Chrysler / Ram vans
        r'\b(RU[A-Z]{2}[0-9]{2})\b',  # Pacifica
        r'\b(VF[A-Z0-9]{2}[0-9]{2})\b',  # ProMaster

        # Pattern générique fallback pour 6 caractères
        r'\b([A-Z]{2}[A-Z0-9]{2}[0-9]{2})\b',
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            code = match.group(1)
            if len(code) == 6:
                return code

    return None


def get_vehicle_info_from_invoice(ocr_text: str) -> Dict[str, Any]:
    """
    Extrait et valide les informations véhicule depuis une facture.

    Processus de double vérification:
    1. Extraire le code produit du texte OCR
    2. Chercher ce code dans la base master
    3. Si trouvé: utiliser les données validées
    4. Si non trouvé: retourner le code avec infos partielles

    Args:
        ocr_text: Texte OCR complet de la facture

    Returns:
        Dict avec les informations du véhicule
    """
    result: Dict[str, Any] = {
        "code": None,
        "code_found_in_master": False,
        "year": None,
        "brand": None,
        "model": None,
        "trim": None,
        "cab": None,
        "drive": None,
        "full_description": None,
    }

    # Étape 1: Extraire le code
    code = extract_product_code_from_text(ocr_text)
    if not code:
        logger.warning("[ProductCodeLookup] Aucun code produit trouvé dans le texte OCR")
        return result

    result["code"] = code

    # Étape 2: Lookup dans la base master
    master_data = lookup_product_code(code)

    if master_data:
        result.update({
            "code_found_in_master": True,
            "year": master_data.get("year"),
            "brand": master_data.get("brand"),
            "model": master_data.get("model"),
            "trim": master_data.get("trim"),
            "cab": master_data.get("cab"),
            "drive": master_data.get("drive"),
            "full_description": (
                master_data.get("full_description")
                or _safe_description(master_data, fallback=code)
            ),
        })

        safe_description = (
            result.get("full_description")
            or result.get("model")
            or result.get("trim")
            or code
        )
        logger.info(f"[ProductCodeLookup] Validation réussie: {code} -> {safe_description}")

    else:
        # Code non trouvé - essayer de décoder par pattern
        result["code_found_in_master"] = False
        fallback_info = _decode_code_by_pattern(code)
        if fallback_info:
            result.update(fallback_info)
            result["full_description"] = _safe_description(result, fallback=code)
            logger.warning(
                f"[ProductCodeLookup] Code {code} décodé par pattern (non validé): {fallback_info}"
            )

    return result


def _decode_code_by_pattern(code: str) -> Optional[Dict[str, str]]:
    """
    Décode un code produit par pattern si non trouvé dans la base master.

    Retourne des informations partielles (brand, model).
    """
    code = code.upper()

    if code.startswith("DJ"):
        return {"brand": "Ram", "model": "2500", "trim": None, "cab": None, "drive": None}
    elif code.startswith("D2") or code.startswith("D3"):
        return {"brand": "Ram", "model": "3500", "trim": None, "cab": None, "drive": None}
    elif code.startswith("DT") or code.startswith("DS"):
        return {"brand": "Ram", "model": "1500", "trim": None, "cab": None, "drive": None}
    elif code.startswith("WL"):
        return {"brand": "Jeep", "model": "Grand Cherokee", "trim": None, "cab": None, "drive": None}
    elif code.startswith("WS"):
        return {"brand": "Jeep", "model": "Wagoneer S", "trim": None, "cab": None, "drive": None}
    elif code.startswith("JL"):
        return {"brand": "Jeep", "model": "Wrangler", "trim": None, "cab": None, "drive": None}
    elif code.startswith("JT"):
        return {"brand": "Jeep", "model": "Gladiator", "trim": None, "cab": None, "drive": None}
    elif code.startswith("MP"):
        return {"brand": "Jeep", "model": "Compass", "trim": None, "cab": None, "drive": None}
    elif code.startswith("KM"):
        return {"brand": "Jeep", "model": "Cherokee", "trim": None, "cab": None, "drive": None}
    elif code.startswith("WD") or code.startswith("LD"):
        return {"brand": "Dodge", "model": "Durango", "trim": None, "cab": None, "drive": None}
    elif code.startswith("LB"):
        return {"brand": "Dodge", "model": "Charger", "trim": None, "cab": None, "drive": None}
    elif code.startswith("HN"):
        return {"brand": "Dodge", "model": "Hornet", "trim": None, "cab": None, "drive": None}
    elif code.startswith("RU"):
        return {"brand": "Chrysler", "model": "Pacifica", "trim": None, "cab": None, "drive": None}
    elif code.startswith("VF"):
        return {"brand": "Ram", "model": "ProMaster", "trim": None, "cab": None, "drive": None}

    return None


def get_all_codes() -> Dict[str, Dict[str, Any]]:
    """Retourne tous les codes master."""
    _load_master_codes()
    return _MASTER_CODES.copy()


def get_codes_count() -> int:
    """Retourne le nombre total de codes master."""
    _load_master_codes()
    return len(_MASTER_CODES)


def search_codes(
    brand: str = None,
    model: str = None,
    trim: str = None,
    year: str = None
) -> list:
    """
    Recherche des codes par critères.

    Args:
        brand: Marque (Ram, Jeep, Dodge, Chrysler)
        model: Modèle (1500, 2500, 3500, Grand Cherokee, etc.)
        trim: Version (Big Horn, Tradesman, Limited, etc.)
        year: Année (2025, 2026)

    Returns:
        Liste des codes correspondants
    """
    _load_master_codes()
    results = []

    for code, data in _MASTER_CODES.items():
        if not isinstance(data, dict):
            continue

        match = True

        if brand and data.get("brand", "").lower() != brand.lower():
            match = False
        if model and model.lower() not in data.get("model", "").lower():
            match = False
        if trim and trim.lower() not in data.get("trim", "").lower():
            match = False
        if year and data.get("year") != year:
            match = False

        if match:
            results.append(data)

    return results


# Charger les codes au démarrage du module
_load_master_codes()
