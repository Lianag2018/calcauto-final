"""Véhicules de la concession tels que DealerConnect les liste : en stock, en route,
en construction, commandés.

Le site de la concession ne montre un véhicule qu'une fois affiché à la vente. La
liste de DealerConnect, elle, contient aussi ceux qui viennent d'arriver et ceux qui
ne sont pas encore livrés. Elle est envoyée en entier à chaque relevé et remplace la
précédente pour la concession : un véhicule qui n'y est plus disparaît.

Fonctions pures : aucune lecture ni écriture de base ici.
"""
import re
from typing import Any, Callable, Dict, Iterable, List, Optional

EN_STOCK, EN_ROUTE, EN_CONSTRUCTION, COMMANDE, INCONNU = (
    "en_stock", "en_route", "en_construction", "commande", "inconnu")

# Une liste « complète » plus courte que ceci est une lecture ratée : on ne remplace rien.
MIN_COMPLETE_LIST = 20
MAX_LIST = 2000

_STATUS = re.compile(r"[A-Z]{1,5}")
_PAINT = re.compile(r"[A-Z0-9]{3}")
_INTERIOR = re.compile(r"[A-Z0-9]{2}")
_PACKAGE = re.compile(r"[A-Z0-9]{2,4}")


def stage(status_code: Any) -> str:
    """Étape du véhicule d'après le code de statut de commande Stellantis.

    KZX : livré au concessionnaire. Les autres KZ… et J… : construit, facturé ou en
    transport. D à I : en usine (planifié, châssis, peinture, garniture). B et C :
    commande reçue. Tout autre code est rapporté « inconnu » plutôt que deviné.
    """
    code = str(status_code or "").strip().upper()
    if code == "KZX":
        return EN_STOCK
    if code.startswith("KZ") or code.startswith("J"):
        return EN_ROUTE
    if code[:1] in ("D", "E", "F", "G", "I"):
        return EN_CONSTRUCTION
    if code[:1] in ("B", "C"):
        return COMMANDE
    return INCONNU


def _text(value: Any, limit: int) -> str:
    text = "".join(c for c in str(value or "") if c.isprintable() and c not in "<>\"\\")
    return " ".join(text.split())[:limit]


def _number(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def plan_list(entries: Any, valid_vin: Callable[[str], bool], is_code: Callable[[str], bool]) -> Dict[str, Any]:
    """Valide la liste envoyée, sans rien écrire. Tout ou rien : la moindre entrée
    douteuse est rapportée et la liste entière sera refusée par la route."""
    vehicles, refused, seen = [], [], set()
    for entry in entries if isinstance(entries, list) else []:
        entry = entry if isinstance(entry, dict) else {}
        vin = str(entry.get("vin") or "").strip().upper()
        tag = vin[-8:] or "?"
        if len(vin) != 17 or not valid_vin(vin):
            refused.append({"vin": tag, "reason": "NIV invalide (17 caractères et chiffre de contrôle)"})
            continue
        if vin in seen:
            refused.append({"vin": tag, "reason": "NIV répété"})
            continue
        seen.add(vin)
        code = str(entry.get("model_code") or "").strip().upper()
        if not is_code(code):
            refused.append({"vin": tag, "reason": f"code {code or 'vide'} n'a pas la forme d'un code de modèle"})
            continue
        try:
            year = int(entry.get("year"))
        except (TypeError, ValueError):
            year = 0
        if not 2000 <= year <= 2100:
            refused.append({"vin": tag, "reason": "année manquante ou invalide"})
            continue
        status = str(entry.get("status") or "").strip().upper()
        if not _STATUS.fullmatch(status):
            refused.append({"vin": tag, "reason": f"statut {status or 'vide'} invalide"})
            continue
        paint = str(entry.get("paint") or "").strip().upper()
        interior = str(entry.get("interior") or "").strip().upper()
        package = str(entry.get("package") or "").strip().upper()
        if paint and not _PAINT.fullmatch(paint):
            refused.append({"vin": tag, "reason": f"peinture {paint} invalide"})
            continue
        if interior and not _INTERIOR.fullmatch(interior):
            refused.append({"vin": tag, "reason": f"intérieur {interior} invalide"})
            continue
        vehicles.append({
            "vin": vin, "year": year, "model_code": code, "status": status, "stage": stage(status),
            "description": _text(entry.get("description"), 120),
            "package": package if _PACKAGE.fullmatch(package) else "",
            "paint": paint, "interior": interior,
            "paint_name": _text(entry.get("paint_name"), 60),
            "interior_name": _text(entry.get("interior_name"), 60),
            "pdsf": _number(entry.get("pdsf")),
        })
    return {"vehicles": vehicles, "refused": refused}


def color_code(row: Dict[str, Any]) -> str:
    """« PW7 X9 » : peinture + intérieur, la forme déjà utilisée sur les fiches."""
    paint, interior = str(row.get("paint") or ""), str(row.get("interior") or "")
    return f"{paint} {interior}" if paint and interior else ""


def _identity(row: Dict[str, Any], reference: Dict[str, Dict[str, Any]]) -> Dict[str, str]:
    known = reference.get(row.get("model_code") or "") or {}
    description = str(row.get("description") or "")
    return {
        "brand": str(known.get("brand") or ""),
        "model": str(known.get("model") or "") or description.split(" ")[0],
        "trim": str(known.get("trim") or ""),
        "body_style": str(known.get("cab") or ""),
    }


def attach(vehicles: List[Dict[str, Any]], rows_by_vin: Dict[str, Dict[str, Any]]) -> None:
    """Ajoute aux fiches déjà à l'inventaire ce que DealerConnect en dit : étape, statut,
    nom de la couleur ; et le code ou la couleur quand la fiche n'en a pas."""
    for vehicle in vehicles:
        row = rows_by_vin.get(str(vehicle.get("vin") or "").upper())
        if not row:
            continue
        vehicle["dc_status"] = row.get("status") or ""
        vehicle["dc_stage"] = row.get("stage") or INCONNU
        for field in ("paint_name", "interior_name"):
            if row.get(field):
                vehicle[field] = row[field]
        if not vehicle.get("color") and color_code(row):
            vehicle["color"] = color_code(row)
        if not vehicle.get("model_code") and row.get("model_code"):
            vehicle["model_code"] = row["model_code"]


def cards(rows: Iterable[Dict[str, Any]], known_vins: Iterable[str], owner_id: str,
          reference: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Fiches des véhicules de DealerConnect qui n'ont jamais été à l'inventaire.

    `known_vins` : tous les NIV déjà vus à l'inventaire, y compris ceux sortis du site.
    Un véhicule vendu ne revient donc pas sous prétexte que DealerConnect le liste encore.
    Le numéro de stock n'existe pas dans DealerConnect : la fiche porte un repère
    « DC-<8 derniers du NIV> » et `stock_pending`.
    """
    known = {str(v or "").upper() for v in known_vins}
    out = []
    for row in rows:
        vin = str(row.get("vin") or "").upper()
        if not vin or vin in known:
            continue
        out.append({
            "id": f"dc-{vin}", "stock_no": f"DC-{vin[-8:]}", "stock_pending": True, "on_site": False,
            "vin": vin, "year": row.get("year"), "type": "neuf", "status": "disponible",
            "owner_id": owner_id, "source": "dealerconnect",
            "model_code": row.get("model_code") or "", "color": color_code(row),
            "paint_name": row.get("paint_name") or "", "interior_name": row.get("interior_name") or "",
            "package": row.get("package") or "", "description": row.get("description") or "",
            "dc_status": row.get("status") or "", "dc_stage": row.get("stage") or INCONNU,
            "pdsf": row.get("pdsf") or 0, "msrp": 0, "asking_price": 0, "km": 0,
            **_identity(row, reference),
        })
    return out
