"""
Location SCI comparée à TAQ Auto : chiffres relevés le 17 novembre 2026
(PDSF et prix 47 412 $, frais 259 $, 48 mois, 3,99 %, résiduel 47 %). Sans réseau ni base de données.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.lease_math import lease_payment  # noqa: E402

CAP_COST = 47412 + 259
RESIDUAL = 47412 * 0.47


@pytest.mark.parametrize("extra, taq", [
    ({}, 741.65),
    ({"trade_value": 10000}, 482.96),
    ({"trade_value": 10000, "trade_owed": 4000}, 572.96),
    ({"solde_reporte": 3000}, 819.27),
    ({"solde_reporte": -3000}, 819.27),
    ({"cash_down": 2299.50}, 689.92),
    ({"bonus_cash": 1500}, 702.86),
])
def test_paiement_identique_a_taq(extra, taq):
    assert abs(lease_payment(CAP_COST, RESIDUAL, 3.99, 48, **extra)["monthly_payment"] - taq) <= 0.02


def test_taux_zero():
    calc = lease_payment(45000, 22500, 0, 24)
    assert round(calc["monthly_before_tax"], 2) == 937.5
    assert calc["finance_charge"] == 0


# --- Fréquences, montant dû et kilométrage élevé : relevés TAQ Auto du 17 novembre 2026 ---

from services.lease_math import extra_km_reduction, payment_count, pmt_advance  # noqa: E402


@pytest.mark.parametrize("term, periods, count", [
    (48, 26, 104), (48, 52, 208), (36, 26, 78), (36, 52, 156),
    (27, 26, 59), (39, 26, 85), (51, 26, 111), (27, 52, 117), (51, 52, 221), (27, 12, 27),
])
def test_nombre_de_paiements(term, periods, count):
    assert payment_count(term, periods) == count


@pytest.mark.parametrize("price, pct, rate, term, key, taq", [
    # Jeep Cherokee Laredo 2026, 47 412 $
    (47412, 47, 3.99, 48, "biweekly_payment", 342.66),
    (47412, 47, 3.99, 48, "weekly_payment", 171.40),
    (47412, 52, 2.99, 36, "biweekly_payment", 387.06),
    (47412, 52, 2.99, 36, "weekly_payment", 193.60),
    (47412, 52, 2.99, 36, "monthly_payment", 838.01),
    # Ram 1500 Big Horn 2026, prix d'essai 75 000 $
    (75000, 47, 9.49, 27, "biweekly_payment", 1012.27),
    (75000, 47, 9.49, 27, "weekly_payment", 510.03),
    (75000, 47, 9.49, 27, "monthly_payment", 2201.89),
    (75000, 42, 8.99, 39, "biweekly_payment", 806.60),
    (75000, 37, 8.99, 51, "biweekly_payment", 701.30),
    (75000, 37, 8.99, 51, "weekly_payment", 352.14),
])
def test_frequences_identiques_a_taq(price, pct, rate, term, key, taq):
    calc = lease_payment(price + 259, price * pct / 100, rate, term)
    assert abs(calc[key] - taq) <= 0.02


@pytest.mark.parametrize("trade, owed, taq", [(8000, 6000, 745.26), (5000, 9000, 932.32)])
def test_montant_du_sur_echange_36_mois(trade, owed, taq):
    calc = lease_payment(47412 + 259, 47412 * 0.52, 2.99, 36, trade_value=trade, trade_owed=owed)
    assert abs(calc["monthly_payment"] - taq) <= 0.02


@pytest.mark.parametrize("km, term, reduction", [
    (24000, 36, 0), (12000, 36, 0), (25000, 36, 360), (28000, 36, 1440),
    (30000, 36, 2160), (36000, 36, 4320), (36000, 60, 7200), (30000, 60, 3600),
])
def test_redressement_kilometrage_eleve(km, term, reduction):
    assert round(extra_km_reduction(km, term), 2) == reduction


def test_paiement_kilometrage_eleve_durango():
    # Dodge Durango GT 2026, 60 000 $, 60 mois à 8,99 %, résiduel 29 %, 36 000 km par année
    residual = 60000 * 0.29 - extra_km_reduction(36000, 60)
    assert abs(pmt_advance(60000 + 259, residual, 8.99, 60) - 1107.02) <= 0.02
