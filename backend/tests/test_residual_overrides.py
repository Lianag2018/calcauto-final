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


# ───────── mise à jour automatique : garde-fous ─────────
from services.residual_overrides import validate_update, MIN_VERSIONS  # noqa: E402


def _guide(n=30, month="2026-11-01"):
    return {"effective_from": month, "vehicles": [
        {"brand": "Ram", "model_year": 2027, "model_name": "1500", "trim": f"T{i}", "body_style": "Crew",
         "residual_percentages": {"24": 55, "27": 53, "36": 48, "39": 46, "42": 44, "48": 40, "51": 38, "54": 36, "60": 33}}
        for i in range(n)]}


def _update(guide, delta=-2, **over):
    rows = []
    for v in guide["vehicles"]:
        pct = {t: p + delta for t, p in v["residual_percentages"].items()}
        rows.append({k: v[k] for k in ("brand", "model_year", "model_name", "trim", "body_style")} | {"residual_percentages": pct})
    return {"effective_from": guide["effective_from"], "source": "TAQ", "vehicles": rows, **over}


def test_releve_valide_est_accepte_et_nettoye():
    g = _guide()
    out, problems, summary = validate_update(_update(g), g)
    assert not problems and out and len(out["vehicles"]) == 30 and summary["max_gap_points"] == 2.0


def test_mauvais_mois_ou_trop_petit_ou_inconnu_sont_refuses():
    g = _guide()
    assert validate_update(_update(g, ) | {"effective_from": "2026-12-01"}, g)[0] is None
    small = _update(_guide(MIN_VERSIONS - 1), delta=-1)
    assert validate_update(small, _guide(MIN_VERSIONS - 1))[0] is None
    u = _update(g); u["vehicles"][0]["trim"] = "Inconnue"
    out, problems, _ = validate_update(u, g)
    assert out is None and any("Absente du guide" in p for p in problems)


def test_ecart_trop_grand_ou_residuels_qui_montent_refuses_tout_ou_rien():
    g = _guide()
    out, problems, _ = validate_update(_update(g, delta=-9), g)
    assert out is None and any("Écart" in p for p in problems)
    u = _update(g); u["vehicles"][3]["residual_percentages"]["60"] = 70
    out, problems, _ = validate_update(u, g)
    assert out is None and any("incohérents" in p for p in problems)


def test_releve_qui_retire_la_moitie_des_versions_est_refuse():
    g = _guide(60)
    previous = _update(g)
    shrunk = _update(g); shrunk["vehicles"] = shrunk["vehicles"][:25]
    out, problems, _ = validate_update(shrunk, g, previous)
    assert out is None and any("retire trop" in p for p in problems)
