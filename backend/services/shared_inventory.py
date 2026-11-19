"""Inventaire partagé du concessionnaire, recopié du site par Kenbot."""
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

SHARED_OWNER = "SHARED_KENNEBEC"

# Kenbot ajoute et met à jour les véhicules du site, mais ne retire pas ceux
# qui en sont sortis (vendus). Un véhicule partagé que la synchronisation n'a
# pas revu depuis ce délai, compté à partir de la dernière synchronisation,
# n'est plus sur le site : on ne le montre plus.
SHARED_STALE_AFTER = timedelta(hours=48)


def _naive(moment: Any) -> Optional[datetime]:
    if not isinstance(moment, datetime):
        return None
    return moment.replace(tzinfo=None) - (moment.utcoffset() or timedelta(0)) if moment.tzinfo else moment


def drop_stale_shared(vehicles: List[Dict[str, Any]], latest_sync: Any) -> List[Dict[str, Any]]:
    """Retire les véhicules partagés que la dernière synchronisation du site n'a pas revus."""
    latest = _naive(latest_sync)
    if latest is None:
        return vehicles
    cutoff = latest - SHARED_STALE_AFTER
    kept = []
    for vehicle in vehicles:
        if vehicle.get("owner_id") == SHARED_OWNER:
            seen = _naive(vehicle.get("last_synced_at"))
            if seen is None or seen < cutoff:
                continue
        kept.append(vehicle)
    return kept


def _amount(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def calc_price(vehicle: Dict[str, Any]) -> Dict[str, Any]:
    """Prix de départ du calculateur pour un véhicule d'inventaire.

    Un véhicule neuf part toujours du PDSF, avant tout rabais : les rabais du
    programme sont appliqués ensuite par le calculateur. Partir du prix du
    site, déjà réduit, compterait les rabais deux fois. Un véhicule d'occasion
    part de son prix affiché.

    `pdsf_confirmed` est faux quand le PDSF n'a pas été lu sur le site (ou
    qu'il est plus bas que le prix affiché) : le prix proposé est alors le
    meilleur chiffre connu et doit être vérifié.
    """
    asking = _amount(vehicle.get("asking_price"))
    msrp = _amount(vehicle.get("msrp"))
    if str(vehicle.get("type") or "neuf").lower() == "occasion":
        return {"calc_price": asking or msrp, "pdsf_confirmed": True}

    pdsf = _amount(vehicle.get("pdsf"))
    if pdsf > 0 and pdsf >= asking:
        return {"calc_price": pdsf, "pdsf_confirmed": True}
    if vehicle.get("owner_id") != SHARED_OWNER and msrp > 0 and msrp >= asking:
        # Fiche saisie à la main ou par facture : le PDSF vient de l'utilisateur.
        return {"calc_price": msrp, "pdsf_confirmed": True}
    return {"calc_price": max(msrp, asking, pdsf), "pdsf_confirmed": False}


_COLOR = re.compile(r"[A-Z0-9]{2,3} [A-Z0-9]{2}")


def plan_code_updates(shared_vehicles: List[Dict[str, Any]], entries: List[Dict[str, Any]], is_code) -> Dict[str, Any]:
    """Prépare les corrections de fiche (code de modèle, couleur) d'après DealerConnect, sans rien écrire.

    Une entrée est retenue seulement si le numéro de stock ET le NIV complet correspondent à une fiche
    partagée et si chaque valeur a la bonne forme (code de modèle ; couleur « PW7 X9 » = peinture + intérieur) ;
    le reste est refusé avec sa raison. Chaque changement porte sur un seul champ.
    """
    by_stock = {str(v.get("stock_no")): v for v in shared_vehicles if v.get("stock_no")}
    changes, same, refused = [], 0, []
    seen = set()
    for entry in entries or []:
        stock = str(entry.get("stock_no") or "").strip()
        vin = str(entry.get("vin") or "").strip().upper()
        vehicle = by_stock.get(stock)
        if not stock or stock in seen:
            refused.append({"stock_no": stock, "reason": "numéro de stock manquant ou répété"})
            continue
        seen.add(stock)
        if not vehicle:
            refused.append({"stock_no": stock, "reason": "fiche partagée introuvable"})
            continue
        if len(vin) != 17 or str(vehicle.get("vin") or "").upper() != vin:
            refused.append({"stock_no": stock, "reason": "NIV différent de la fiche"})
            continue
        wanted = {}
        code = str(entry.get("model_code") or "").strip().upper()
        color = str(entry.get("color") or "").strip().upper()
        if "model_code" in entry:
            if is_code(code):
                wanted["model_code"] = code
            else:
                refused.append({"stock_no": stock, "reason": f"code {code or 'vide'} n'a pas la forme d'un code de modèle"})
        if "color" in entry:
            if _COLOR.fullmatch(color):
                wanted["color"] = color
            else:
                refused.append({"stock_no": stock, "reason": f"couleur {color or 'vide'} n'a pas la forme « PW7 X9 »"})
        for field, value in wanted.items():
            old = str(vehicle.get(field) or "")
            if old.upper() == value:
                same += 1
            else:
                changes.append({"stock_no": stock, "vin": vin, "field": field, "old": old, "new": value})
    return {"changes": changes, "unchanged": same, "refused": refused}
