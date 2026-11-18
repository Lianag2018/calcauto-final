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
