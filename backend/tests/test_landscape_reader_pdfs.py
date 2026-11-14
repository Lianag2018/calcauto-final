"""Lecture des vrais PDF mensuels « QBC Retail Incentive Programs ».

Ces PDF sont des documents de concessionnaire : ils ne sont pas dans le dépôt.
Pour lancer ces tests, pointer CALCAUTO_PROGRAM_PDF_DIR vers un dossier qui les
contient ; sans cette variable, les tests sont sautés (ils ne « passent » pas).
"""
import glob
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

PDF_DIR = os.environ.get("CALCAUTO_PROGRAM_PDF_DIR", "")
PDFS = sorted(glob.glob(os.path.join(PDF_DIR, "*QBC_Retail*.pdf"))) if PDF_DIR else []

pytestmark = pytest.mark.skipif(not PDFS, reason="CALCAUTO_PROGRAM_PDF_DIR absent : PDF de programmes non fournis")

# Nombre de lignes par année-modèle, compté sur les pages elles-mêmes.
EXPECTED = {
    "January_2026": ({2026: 29, 2025: 47, 2024: 14}, {2026: 26, 2025: 45, 2024: 12}),
    "February_2026": ({2026: 34, 2025: 47, 2024: 14}, {2026: 29, 2025: 45}),
    "March_2026": ({2026: 36, 2025: 43, 2024: 14}, {2026: 33, 2025: 41}),
    "September_2026": ({2027: 12, 2026: 41, 2025: 20, 2024: 4}, {2027: 7, 2026: 40, 2025: 19}),
    "November_2026": ({2027: 25, 2026: 40}, {2027: 23, 2026: 39}),
}


def _month(path):
    match = re.search(r"([A-Z][a-z]+_20\d\d)_QBC", os.path.basename(path))
    return match.group(1) if match else os.path.basename(path)


@pytest.mark.parametrize("path", PDFS, ids=_month)
def test_controle_et_nombre_de_lignes(path):
    from services.pdfplumber_parser import parse_retail_programs, parse_sci_lease

    with open(path, "rb") as handle:
        content = handle.read()
    programs = parse_retail_programs(content, 1, 1)   # lève LandscapeControlError si une page est douteuse
    lease = parse_sci_lease(content, 1, 1)

    finance_years = {}
    for program in programs:
        finance_years[program["year"]] = finance_years.get(program["year"], 0) + 1
        assert program["brand"] != "Unknown" and program["model"]
        assert program["option1_rates"] or program["option2_rates"], program
    lease_years = {int(key.split("_")[1]): len(value) for key, value in lease.items() if value}

    expected = EXPECTED.get(_month(path))
    if expected:
        assert finance_years == expected[0]
        assert lease_years == expected[1]
    else:
        assert finance_years and lease_years


def test_code_de_programme_pas_pris_pour_un_rabais():
    """« MSRP % Off Discount (P2619A3) » est une remarque, pas 2 619 $ de rabais."""
    from services.pdfplumber_parser import parse_retail_programs

    path = next((p for p in PDFS if _month(p) == "March_2026"), None)
    if not path:
        pytest.skip("PDF de mars 2026 non fourni")
    with open(path, "rb") as handle:
        programs = parse_retail_programs(handle.read(), 1, 1)
    row = next(p for p in programs if p["year"] == 2024 and p["trim"] == "Daytona R/T (BEV)")
    assert row["consumer_cash"] == 0
    assert "MSRP % Off" in row["notes"]["consumer_cash"]


def test_prime_de_fidelite_de_novembre():
    from services.pdfplumber_parser import parse_retail_programs

    path = next((p for p in PDFS if _month(p) == "November_2026"), None)
    if not path:
        pytest.skip("PDF de novembre 2026 non fourni")
    with open(path, "rb") as handle:
        programs = parse_retail_programs(handle.read(), 1, 1)
    loyal = [p for p in programs if p["loyalty_bonus_cash"]]
    assert len(loyal) == 19
    assert all(p["bonus_cash"] == 0 for p in loyal)
