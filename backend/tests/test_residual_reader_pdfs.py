"""Lecture des vrais guides de valeurs résiduelles SCI.

Ces PDF sont des documents de concessionnaire : ils ne sont pas dans le dépôt.
Pour lancer ces tests, pointer CALCAUTO_RESIDUAL_PDF_DIR vers un dossier qui
les contient ; sans cette variable, les tests sont sautés (ils ne « passent » pas).
"""
import glob
import os
import sys
from collections import Counter

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

PDF_DIR = os.environ.get("CALCAUTO_RESIDUAL_PDF_DIR", "")
PDFS = sorted(glob.glob(os.path.join(PDF_DIR, "*.pdf"))) if PDF_DIR else []

pytestmark = pytest.mark.skipif(
    not PDFS, reason="CALCAUTO_RESIDUAL_PDF_DIR absent : guides résiduels non fournis")

# (mois, année, mois de fin) -> véhicules par année-modèle, comptés dans le texte du PDF
EXPECTED = {
    (2, 2026, 3): {2026: 128, 2025: 146},
    (3, 2026, 4): {2026: 142, 2025: 146},
    (9, 2026, 9): {2027: 91, 2026: 146, 2025: 32},
    (10, 2026, 11): {2027: 128, 2026: 146, 2025: 32},
    (11, 2026, 11): {2027: 148, 2026: 147},
}
KM_18 = {"24": 1, "27": 1, "36": 2, "39": 2, "42": 2, "48": 3, "51": 3, "54": 3, "60": 4}
KM_12 = {"24": 2, "27": 2, "36": 3, "39": 3, "42": 3, "48": 4, "51": 4, "54": 4, "60": 5}


@pytest.mark.parametrize("path", PDFS, ids=os.path.basename)
def test_guide_complet(path):
    from services.residual_reader import read_residual_guide

    with open(path, "rb") as handle:
        guide = read_residual_guide(handle.read())
    period = (guide["month"], guide["year"], guide["end_month"])
    assert period in EXPECTED, f"période inattendue : {period}"
    assert dict(Counter(v["model_year"] for v in guide["vehicles"])) == EXPECTED[period]
    assert guide["km_adjustments"]["adjustments"] == {"18000": KM_18, "12000": KM_12}
    for vehicle in guide["vehicles"]:
        assert vehicle["trim"] and vehicle["body_style"] and vehicle["model_name"]
        assert list(vehicle["residual_percentages"]) == [
            "24", "27", "36", "39", "42", "48", "51", "54", "60"]


def test_anglais_identique_aux_fichiers_du_depot():
    """Sur le guide de mars-avril, le nouveau lecteur redonne exactement le
    fichier déjà dans le dépôt (produit par l'ancien lecteur)."""
    import json
    from services.residual_reader import read_residual_guide

    path = next((p for p in PDFS if "April_2026" in p), None)
    if not path:
        pytest.skip("guide d'avril 2026 absent")
    with open(path, "rb") as handle:
        guide = read_residual_guide(handle.read())
    repo = os.path.join(os.path.dirname(__file__), "..", "data", "sci_residuals_avril2026.json")
    with open(repo) as handle:
        expected = json.load(handle)["vehicles"]

    def table(vehicles):
        return {(v["brand"], v["model_year"], v["model_name"], v["trim"], v["body_style"]):
                {k: int(x) for k, x in v["residual_percentages"].items()} for v in vehicles}
    assert table(guide["vehicles"]) == table(expected)
