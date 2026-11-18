"""Ajustements TAQ posés sur le guide du mois : bon mois seulement, aucune devinette. Sans réseau."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.residual_overrides import FILENAME, apply_overrides  # noqa: E402

TERMS = ["24", "27", "36", "39", "42", "48", "51", "54", "60"]


def guide(month="2026-11-01"):
    return {"effective_from": month, "vehicles": [
        {"brand": "Ram", "model_year": 2027, "model_name": "1500", "trim": "Big Horn", "body_style": "Crew Cab SWB 4WD",
         "residual_percentages": {t: 50 for t in TERMS}},
        {"brand": "Ram", "model_year": 2026, "model_name": "1500", "trim": "Big Horn", "body_style": "Crew Cab SWB 4WD",
         "residual_percentages": {t: 50 for t in TERMS}},
    ]}


def write(tmp_path, month="2026-11-01"):
    (tmp_path / FILENAME).write_text(json.dumps({"effective_from": month, "source": "TAQ", "vehicles": [
        {"brand": "Ram", "model_year": 2027, "model_name": "1500", "trim": "Big Horn", "body_style": "Crew Cab SWB 4WD",
         "residual_percentages": {"24": 47, "60": 33}},
        {"brand": "Ram", "model_year": 2027, "model_name": "Inconnu", "trim": "X", "body_style": "Y",
         "residual_percentages": {"24": 1}},
    ]}))


def test_sans_fichier_le_guide_reste_tel_quel(tmp_path):
    data = apply_overrides(guide(), tmp_path)
    assert data["vehicles"][0]["residual_percentages"]["24"] == 50 and "residual_overrides" not in data


def test_pose_seulement_la_version_2027_nommee(tmp_path):
    write(tmp_path)
    data = apply_overrides(guide(), tmp_path)
    v2027, v2026 = data["vehicles"]
    assert v2027["residual_percentages"]["24"] == 47 and v2027["residual_percentages"]["60"] == 33
    assert v2027["residual_percentages"]["36"] == 50      # un terme non listé garde la valeur du guide
    assert v2026["residual_percentages"]["24"] == 50      # l'année 2026 n'est jamais touchée
    assert data["residual_overrides"]["versions"] == 1    # la ligne « Inconnu » est ignorée


def test_un_autre_mois_nest_pas_touche(tmp_path):
    write(tmp_path, month="2026-11-01")
    data = apply_overrides(guide("2026-12-01"), tmp_path)
    assert data["vehicles"][0]["residual_percentages"]["24"] == 50 and "residual_overrides" not in data


def test_fichier_illisible_ne_bloque_pas(tmp_path):
    (tmp_path / FILENAME).write_text("{pas du json")
    assert apply_overrides(guide(), tmp_path)["vehicles"][0]["residual_percentages"]["24"] == 50


def test_fichier_taq_de_novembre_est_complet_et_coherent():
    """Le vrai fichier d'ajustements : 9 termes par version, résiduels décroissants, année 2027 seulement."""
    path = Path(__file__).resolve().parents[1] / "data" / FILENAME
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["effective_from"].startswith("2026-11")
    assert len(data["vehicles"]) >= 100
    keys = set()
    for v in data["vehicles"]:
        assert v["model_year"] == 2027
        pct = v["residual_percentages"]
        assert sorted(pct) == sorted(TERMS), v
        series = [float(pct[t]) for t in TERMS]
        assert all(a >= b for a, b in zip(series, series[1:])), v
        key = (v["brand"], v["model_name"], v["trim"], v["body_style"])
        assert key not in keys, key
        keys.add(key)
