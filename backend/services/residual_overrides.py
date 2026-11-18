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


# ───────── Mise à jour automatique (relevé TAQ envoyé par le programme du Mac) ─────────
TERMS = ["24", "27", "36", "39", "42", "48", "51", "54", "60"]
MAX_DEVIATION = 6.0      # points d'écart permis avec le guide : au-delà, c'est probablement une mauvaise lecture
MIN_VERSIONS = 20        # un relevé plus petit n'est pas un relevé complet
SHRINK_LIMIT = 0.5       # un relevé qui retire plus de la moitié des versions déjà ajustées est refusé


def _key5(row):
    return (row.get("brand"), int(row.get("model_year", 0)), str(row.get("model_name", "")).strip(),
            str(row.get("trim", "")).strip(), str(row.get("body_style", "")).strip())


def validate_update(update, guide, previous=None):
    """Garde-fous du relevé TAQ. -> (fichier propre à écrire ou None, liste des problèmes, résumé).

    Tout ou rien : un seul problème et rien n'est écrit. Le guide du MÊME mois sert de référence.
    """
    problems = []
    if not isinstance(update, dict) or not isinstance(update.get("vehicles"), list):
        return None, ["Format invalide : « vehicles » attendu."], {}
    month = str(update.get("effective_from", ""))[:7]
    if not month or month != str(guide.get("effective_from", ""))[:7]:
        return None, [f"Le mois du relevé ({month or '?'}) n'est pas celui du guide ({str(guide.get('effective_from',''))[:7]})."], {}
    if len(update["vehicles"]) < MIN_VERSIONS:
        problems.append(f"Relevé trop petit ({len(update['vehicles'])} versions, minimum {MIN_VERSIONS}).")
    by_guide = {_key5(v): v for v in guide.get("vehicles", [])}
    clean, seen, worst = [], set(), 0.0
    for row in update["vehicles"]:
        try:
            key = _key5(row)
        except Exception:
            problems.append("Une ligne est illisible.")
            continue
        label = " ".join(str(x) for x in key[:5])
        if key in seen:
            problems.append(f"Doublon : {label}")
            continue
        seen.add(key)
        base = by_guide.get(key)
        if base is None:
            problems.append(f"Absente du guide du mois : {label}")
            continue
        pct = row.get("residual_percentages")
        if not isinstance(pct, dict) or sorted(pct) != sorted(TERMS):
            problems.append(f"Termes incomplets : {label}")
            continue
        try:
            series = [float(pct[t]) for t in TERMS]
        except (TypeError, ValueError):
            problems.append(f"Valeur non numérique : {label}")
            continue
        if any(not 0 < v < 100 for v in series) or any(a < b for a, b in zip(series, series[1:])):
            problems.append(f"Résiduels incohérents (hors limites ou qui montent avec le terme) : {label}")
            continue
        gap = max(abs(float(pct[t]) - float(base["residual_percentages"].get(t, pct[t]))) for t in TERMS)
        worst = max(worst, gap)
        if gap > MAX_DEVIATION:
            problems.append(f"Écart de {gap:.0f} points avec le guide (max {MAX_DEVIATION:.0f}) : {label}")
            continue
        clean.append({"brand": key[0], "model_year": key[1], "model_name": key[2], "trim": key[3], "body_style": key[4],
                      "residual_percentages": {t: (int(float(pct[t])) if float(pct[t]).is_integer() else float(pct[t])) for t in TERMS}})
    old = len((previous or {}).get("vehicles", [])) if (previous or {}).get("effective_from", "")[:7] == month else 0
    if old and len(clean) < old * SHRINK_LIMIT:
        problems.append(f"Le relevé retire trop de versions ({len(clean)} contre {old} déjà ajustées).")
    summary = {"versions": len(clean), "previous_versions": old, "max_gap_points": round(worst, 1)}
    if problems:
        return None, problems, summary
    out = {"effective_from": str(update.get("effective_from"))[:10], "source": str(update.get("source") or "TAQ Auto")[:200],
           "vehicles": clean}
    return out, [], summary
