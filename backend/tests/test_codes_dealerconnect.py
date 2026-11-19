"""Corrections de code de modèle (DealerConnect) : seulement si stock et NIV correspondent exactement."""
from services.program_matching import is_model_code
from services.shared_inventory import plan_code_updates

VIN = "1C4RDJDG2TC315121"
SHARED = [{"stock_no": "46260", "vin": VIN, "model_code": "WDEE75"},
          {"stock_no": "46255", "vin": "1C4RDJDG4TC315122", "model_code": "WDEH75"}]


def _plan(entries):
    return plan_code_updates(SHARED, entries, is_model_code)


def test_changement_applique():
    p = _plan([{"stock_no": "46260", "vin": VIN, "model_code": "wdeh75"}])
    assert p["changes"] == [{"stock_no": "46260", "vin": VIN, "old": "WDEE75", "new": "WDEH75"}]
    assert not p["refused"]


def test_code_identique_non_modifie():
    p = _plan([{"stock_no": "46255", "vin": "1C4RDJDG4TC315122", "model_code": "WDEH75"}])
    assert p["unchanged"] == 1 and not p["changes"]


def test_refus_niv_different_code_invalide_et_fiche_absente():
    p = _plan([{"stock_no": "46260", "vin": "1C4RDJDG2TC999999", "model_code": "WDEH75"},
               {"stock_no": "46255", "vin": "1C4RDJDG4TC315122", "model_code": "pas un code"},
               {"stock_no": "99999", "vin": VIN, "model_code": "WDEH75"}])
    assert not p["changes"] and len(p["refused"]) == 3


def test_stock_repete_refuse():
    p = _plan([{"stock_no": "46260", "vin": VIN, "model_code": "WDEH75"},
               {"stock_no": "46260", "vin": VIN, "model_code": "WDEE75"}])
    assert len(p["changes"]) == 1 and len(p["refused"]) == 1
