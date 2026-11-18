"""Lecture d'un Window Sticker : mots synthétiques placés comme sur une vraie fiche (sans PDF du fabricant)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.sticker_details import parse_sticker_words  # noqa: E402


def row(y, x, text, h=8):
    return [(x + i * 40, y, x + i * 40 + 30, y + h, w) for i, w in enumerate(text.split())]


def words():
    w = []
    w += row(50, 165, "ANNÉE MODÈLE 2026")
    w += row(90, 165, "RAM 1500 BIG HORN")
    w += row(130, 97, "Prix de base : 40 995 $")
    w += row(300, 61, "SYSTEME DE NAVIGATION GPS")
    w += row(320, 61, "COMPATIBILITE AVEC APPLE CARPLAY")
    w += row(180, 345, "ACCESSOIRES OPTIONNELS")
    w += row(200, 345, "ENSEMBLE ECLAIR 23Q") + row(200, 564, "2 595 $")
    w += row(220, 345, "FRAIS D'EXPÉDITION") + row(220, 564, "2 295 $")
    w += row(240, 345, "PRIX TOTAL : * 45 885 $")
    w += row(500, 720, "6.3", h=40) + row(560, 700, "6.1", h=14) + row(560, 800, "6.7", h=14)
    w += row(600, 100, "5–ANS / 100 000 KM")
    return w


def test_lit_prix_options_equipement_et_consommation():
    d = parse_sticker_words(words())
    assert d["base_price"] == 40995 and d["total_price"] == 45885
    assert {"label": "Ensemble Éclair 23Q", "price": 2595} in d["options"]
    assert d["fees"][0]["price"] == 2295
    assert "Navigation GPS" in d["highlights"] and "Apple CarPlay et Android Auto" in d["highlights"]
    assert d["fuel_l100"]["combined"] == 6.3


def test_rien_inventer_sur_une_fiche_vide_ou_bizarre():
    assert parse_sticker_words([]) == {}
    assert parse_sticker_words([("x", 0, 0, 0, "y")]) == {}
