"""Tri des tests CalcAuto : aucun fichier n'est ignoré en silence.

Trois familles :
- hors réseau : tournent à chaque commit (`pytest tests/`) ;
- intégration : appellent un serveur en marche. Ils ne tournent que si
  CALCAUTO_INTEGRATION=1 ET que l'adresse visée n'est pas la production ;
- quarantaine : échecs connus, marqués xfail avec la raison écrite.

Un fichier de test nouveau qui appelle le réseau sans être classé ici fait
échouer `test_tri_des_tests.py`.
"""
import os
import sys

# Les tests importent les modules du serveur (vin_utils, parser, services…)
# quelle que soit la façon de lancer pytest.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Le serveur lit ces variables à l'import. Valeurs factices : le client Mongo
# ne se connecte qu'à la première requête, et aucun test hors réseau n'en fait.
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "calcauto_test")

# Fichiers qui appellent un serveur (requests / BASE_URL). À faire tourner
# contre l'environnement d'essai seulement, jamais contre la production.
INTEGRATION = {
    "test_alternative_consumer_cash.py", "test_backend_apis.py",
    "test_calculator_state.py", "test_body_style_iter10.py",
    "test_excel_import_comparison.py", "test_corrections_api.py",
    "test_corrections_system.py", "test_integration.py",
    "test_crm_offers_history.py", "test_extract_pdf_dual_page.py",
    "test_fuzzy_matching_cpos.py", "test_deferred_payment_90day.py",
    "test_residual_guide_upload.py", "test_km_adjustments_full.py",
    "test_loyalty_event_banner.py", "test_pdfplumber_extraction.py",
    "test_refactoring_iter13.py", "test_sci_lease_refactored.py",
    "test_scan_batch.py", "test_sci_lease.py", "test_scan_invoice.py",
    "test_sci_cascade_iter7.py", "test_residual_upload.py",
    "test_sci_lease_fix.py", "test_sci_lease_iter6.py",
    "test_trim_sort_order.py", "test_toc_extraction.py",
    "test_stress_parallel.py",
}

# Adresses de production : les tests d'intégration écrivent (imports,
# corrections, contacts). Ils ne doivent jamais les viser.
PRODUCTION = ("calcauto-aipro", "calcauto-final", "etradevalue.ca", "kenbot")

# Échecs connus : (fichier::classe::test) -> raison.
QUARANTAINE = {}


def _adresse():
    return (os.environ.get("REACT_APP_BACKEND_URL")
            or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "")


def integration_permise():
    if os.environ.get("CALCAUTO_INTEGRATION") != "1":
        return False, "CALCAUTO_INTEGRATION absent"
    adresse = _adresse().lower()
    if not adresse:
        return False, "aucune adresse de serveur d'essai"
    if any(mot in adresse for mot in PRODUCTION):
        return False, "adresse de production refusée"
    return True, adresse


_PERMIS, _RAISON = integration_permise()
collect_ignore = [] if _PERMIS else sorted(INTEGRATION)


def pytest_report_header(config):
    if _PERMIS:
        return f"CalcAuto : tests d'intégration ACTIFS contre {_RAISON}"
    return (f"CalcAuto : {len(INTEGRATION)} fichiers d'intégration non lancés "
            f"({_RAISON}) ; {len(QUARANTAINE)} tests en quarantaine")


def pytest_collection_modifyitems(config, items):
    import pytest
    for item in items:
        cle = item.nodeid.split("/")[-1]
        if cle in QUARANTAINE:
            item.add_marker(pytest.mark.xfail(reason=QUARANTAINE[cle], strict=True))
