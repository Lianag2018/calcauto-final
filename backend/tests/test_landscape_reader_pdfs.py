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
    "June_2026": ({2027: 2, 2026: 39, 2025: 21, 2024: 4}, {2027: 2, 2026: 38, 2025: 20}),
    "July_2026": ({2027: 2, 2026: 40, 2025: 20, 2024: 4}, {2027: 2, 2026: 39, 2025: 19}),
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


def test_juillet_prime_de_fidelite_jeep_pas_pour_tous():
    """En juillet 2026, la colonne « Bonus Cash » mêle le programme 2618 (pour
    tous : 5 000 $ sur le Fiat 500e 2025) et le 2646 (fidélité Jeep : 1 850 $).
    Seules les pages de règles les distinguent."""
    from services.pdfplumber_parser import parse_retail_programs, parse_sci_lease

    path = next((p for p in PDFS if "July_2026" in p), None)
    if not path:
        pytest.skip("PDF de juillet 2026 absent")
    with open(path, "rb") as handle:
        content = handle.read()
    programs = parse_retail_programs(content, 1, 99)
    jeep = [p for p in programs if p["brand"] == "Jeep" and (p["bonus_cash"] or p["loyalty_bonus_cash"])]
    assert len(jeep) == 32
    assert all(p["bonus_cash"] == 0 and p["loyalty_bonus_cash"] == 1850 for p in jeep)
    fiat = [p for p in programs if p["brand"] == "Fiat" and p["year"] == 2025]
    assert [(p["bonus_cash"], p["loyalty_bonus_cash"]) for p in fiat] == [(5000, 0)]
    lease = parse_sci_lease(content, 1, 99)
    assert not any(v.get("bonus_cash") for v in lease["vehicles_2026"])
    assert sum(1 for v in lease["vehicles_2026"] if v.get("loyalty_bonus_cash") == 1850) > 0


def _offers_by_code(path):
    from services.pdfplumber_parser import parse_retail_programs
    with open(path, "rb") as handle:
        programs = parse_retail_programs(handle.read(), 1, 99)
    found = {}
    for program in programs:
        for offer in program.get("special_offers") or []:
            found.setdefault(offer["code"], []).append((program, offer))
    return programs, found


def test_promotions_de_novembre_a_cocher():
    """Novembre 2026 : fidélité (après taxes), liquidation ciblée (avant taxes),
    vendredi fou (après taxes) — chacune sur ses véhicules."""
    path = next((p for p in PDFS if _month(p) == "November_2026"), None)
    if not path:
        pytest.skip("PDF de novembre 2026 non fourni")
    programs, found = _offers_by_code(path)
    assert set(found) == {"2646M1", "2634M1", "2634M2"}
    assert len(found["2646M1"]) == 19 and all(o["tax"] == "after" for _, o in found["2646M1"])
    assert all(o["amount"] == p["loyalty_bonus_cash"] for p, o in found["2646M1"])
    targeted = found["2634M1"]
    assert [(p["model"], p["trim"]) for p, _ in targeted] == [("1500", "Sport, Rebel")]
    assert targeted[0][1]["tax"] == "before" and targeted[0][1]["amount"] == 1500 and targeted[0][1]["vin_list"]
    friday = found["2634M2"]
    assert all(o["tax"] == "after" and o["amount"] == 3000 and p["year"] == 2026 for p, o in friday)
    assert {p["model"] for p, _ in friday} == {"1500", "Gladiator", "Grand Cherokee", "Grand Cherokee L",
                                               "Wrangler", "Grand Wagoneer", "Charger"}
    assert [p["trim"] for p, _ in friday if p["model"] == "1500"] == ["Tradesman, Express, Warlock"]


def test_promotions_de_septembre_conquete_et_liquidation():
    path = next((p for p in PDFS if "September_2026" in p), None)
    if not path:
        pytest.skip("PDF de septembre 2026 absent")
    programs, found = _offers_by_code(path)
    assert set(found) == {"2646J1", "2634J1"}
    assert all(o["kind"] == "conquest" and o["tax"] == "after" for _, o in found["2646J1"])
    wrangler = [o["amount"] for p, o in found["2646J1"] if p["model"] == "Wrangler"]
    assert wrangler and set(wrangler) == {1250}
    assert {(p["model"], o["amount"]) for p, o in found["2634J1"] if p["model"] == "Grand Caravan"} == {("Grand Caravan", 1250)}
    assert all(o["tax"] == "before" for _, o in found["2634J1"])


def test_mois_sans_promotion_a_cocher():
    for month in ("January_2026", "February_2026", "June_2026"):
        path = next((p for p in PDFS if month in p), None)
        if not path:
            continue
        programs, found = _offers_by_code(path)
        assert found == {} and all(p["special_offers"] == [] for p in programs)


@pytest.mark.parametrize("path", PDFS, ids=[_month(p) for p in PDFS])
def test_assistant_d_import_trouve_les_sections(path):
    """L'écran d'import liste `sections` : sans elles il affiche « 0 sections trouvées »
    et le bouton d'extraction reste grisé."""
    from services.pdfplumber_parser import auto_detect_pages
    with open(path, "rb") as handle:
        found = auto_detect_pages(handle.read())
    names = [s["name"] for s in found["sections"]]
    assert "Finance Prime Rate Landscapes" in names and "Lease Landscapes" in names
    assert all(re.fullmatch(r"\d+-\d+", s["pages"]) for s in found["sections"])
