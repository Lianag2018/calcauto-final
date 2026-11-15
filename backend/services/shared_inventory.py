"""Inventaire partagé du concessionnaire, recopié du site par Kenbot."""
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
