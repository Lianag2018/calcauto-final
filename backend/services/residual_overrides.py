"""Résiduels relevés dans TAQ Auto, posés par-dessus le guide SCI du mois.

Le fichier `data/residual_overrides_taq.json` (hors des fichiers gardés en base) liste, pour un mois
précis (« effective_from »), les versions dont TAQ donne un résiduel différent du guide SCI.
Il ne s'applique qu'au guide du même mois : le guide suivant repart de ses propres chiffres.
Une ligne qui ne correspond à aucune version du guide est ignorée. Ne lève jamais.
"""
import json
import logging
from pathlib import Path

FILENAME = "residual_overrides_taq.json"
_log = logging.getLogger(__name__)


def _key(row):
    return (row.get("brand"), int(row.get("model_year", 0)), str(row.get("model_name", "")).strip(),
            str(row.get("trim", "")).strip(), str(row.get("body_style", "")).strip())


def apply_overrides(data, data_dir):
    try:
        path = Path(data_dir) / FILENAME
        if not path.is_file() or not isinstance(data, dict):
            return data
        overrides = json.loads(path.read_text(encoding="utf-8"))
        if str(overrides.get("effective_from", ""))[:7] != str(data.get("effective_from", ""))[:7]:
            return data
        wanted = {_key(row): row.get("residual_percentages") or {} for row in overrides.get("vehicles", [])}
        applied = 0
        for vehicle in data.get("vehicles", []):
            values = wanted.get(_key(vehicle))
            if values:
                vehicle["residual_percentages"] = {**vehicle.get("residual_percentages", {}), **values}
                applied += 1
        if applied:
            data["residual_overrides"] = {"source": overrides.get("source", "TAQ Auto"), "versions": applied}
    except Exception as error:  # le guide du mois reste servi tel quel
        _log.warning("[Residuals] ajustements TAQ ignorés: %s", error)
    return data
