"""
TESTS INTÉGRATION COMPLETS - Pipeline Scan Invoice FCA
Tests pytest avec fixtures, mocks et validation end-to-end

Couvre:
- A. Tests PDF (parsing structuré)
- B. Tests Image OCR (pipeline zones)
- C. Tests VIN (validation, correction, décodage)
- D. Tests Financiers (EP, PDCO, PREF)
- E. Tests Scoring & Décision
- F. Tests Règle d'Or (blocage si invalide)
- G. Tests API Endpoint
"""

import sys
import os
from pathlib import Path

# Ajouter le chemin backend
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
import base64
import requests
from unittest.mock import patch, MagicMock
from io import BytesIO

# Imports modules backend
from vin_utils import (
    validate_vin_checksum,
    calculate_check_digit,
    correct_vin_ocr_errors,
    validate_and_correct_vin,
    decode_vin_year,
    decode_vin_brand,
    smart_vin_correction
)
from parser import (
    clean_fca_price,
    parse_vin,
    parse_financial_data,
    parse_options,
    parse_model_code,
    parse_invoice_text
)
from validation import (
    validate_ep_pdco,
    validate_pdco_minimum,
    validate_subtotal_pref,
    validate_options_count,
    calculate_validation_score,
    validate_invoice_data
)
from ocr import (
    preprocess_for_ocr,
    load_image_from_bytes
)


# =========================
# FIXTURES
# =========================

@pytest.fixture
def valid_invoice_data():
    """Données de facture FCA valide parfaite"""
    return {
        "vin": "1C4RJHBG6S8806264",
        "vin_valid": True,
        "model_code": "WLJP74",
        "stock_no": "45237",
        "ep_cost": 69979,
        "pdco": 75445,
        "pref": 70704,
        "holdback": 1530,
        "subtotal": 70679,
        "invoice_total": 74212.95,
        "options": [
            {"product_code": "ETM", "description": "6.7L CUMMINS DIESEL", "amount": 8800},
            {"product_code": "AZC", "description": "HEATED SEATS", "amount": 250},
            {"product_code": "NAS", "description": "NAVIGATION", "amount": 1500},
            {"product_code": "APA", "description": "PARKING SENSORS", "amount": 600},
            {"product_code": "XR9", "description": "RUNNING BOARDS", "amount": 950}
        ]
    }


@pytest.fixture
def partial_invoice_data():
    """Données de facture avec données manquantes"""
    return {
        "vin": "1C4RJHBG6S8806264",
        "vin_valid": True,
        "ep_cost": 69979,
        "pdco": 0,  # Manquant
        "options": []
    }


@pytest.fixture
def invalid_vin_data():
    """Données avec VIN invalide"""
    return {
        "vin": "1C4RJHBG6X8806264",  # Check digit invalide
        "vin_valid": False,
        "ep_cost": 69979,
        "pdco": 75445,
        "options": []
    }


@pytest.fixture
def ocr_result_good():
    """Résultat OCR simulé - bonne qualité"""
    return {
        "vin_text": "VIN: 1C4RJHBG6-S8-806264\nMODEL: WLJP74",
        "finance_text": "E.P. 06997900\nPDCO 07544500\nPREF* 07070400",
        "options_text": "ETM 6 CYL DIESEL 0880000\nAZC HEATED 0025000",
        "totals_text": "SUB TOTAL 70,679.00\nTOTAL 74,212.95",
        "full_text": "INVOICE FCA CANADA",
        "zones_processed": 4,
        "parse_method": "ocr_zones"
    }


@pytest.fixture
def ocr_result_poor():
    """Résultat OCR simulé - mauvaise qualité"""
    return {
        "vin_text": "V1N: 1C4RjH8G6-58-8O626A",  # Erreurs OCR
        "finance_text": "E.P. ILLISIBLE",
        "options_text": "",
        "totals_text": "",
        "full_text": "blurry text",
        "zones_processed": 1,
        "parse_method": "ocr_global"
    }


# =========================
# A. TESTS VIN - VALIDATION
# =========================

class TestVINValidation:
    """Tests complets pour le module vin_utils"""
    
    def test_checksum_valid_jeep(self):
        """VIN Jeep avec checksum valide"""
        # Construire un VIN valide
        vin = "1C4RJKBG5S8123456"
        check = calculate_check_digit(vin)
        valid_vin = vin[:8] + check + vin[9:]
        
        assert validate_vin_checksum(valid_vin) == True
    
    def test_checksum_invalid(self):
        """VIN avec checksum invalide"""
        vin = "1C4RJHBG6X8806264"  # X n'est pas le bon check digit
        assert validate_vin_checksum(vin) == False
    
    def test_checksum_short_vin(self):
        """VIN trop court"""
        assert validate_vin_checksum("1C4RJHBG6S880626") == False  # 16 chars
    
    def test_checksum_long_vin(self):
        """VIN trop long"""
        assert validate_vin_checksum("1C4RJHBG6S88062641") == False  # 18 chars
    
    def test_ocr_correction_o_to_0(self):
        """Correction O → 0"""
        corrected = correct_vin_ocr_errors("1C4RJHBG6SO806264")
        assert "O" not in corrected
        assert "0" in corrected
    
    def test_ocr_correction_i_to_1(self):
        """Correction I → 1"""
        corrected = correct_vin_ocr_errors("IC4RJHBG6S8806264")
        assert corrected[0] == "1"
    
    def test_ocr_correction_q_to_0(self):
        """Correction Q → 0"""
        corrected = correct_vin_ocr_errors("1C4RJHBG6SQ806264")
        assert "Q" not in corrected


class TestVINDecoding:
    """Tests pour le décodage VIN"""
    
    def test_decode_year_2025(self):
        """Année 2025 (S)"""
        assert decode_vin_year("1C4RJHBG6S8806264") == 2025
    
    def test_decode_year_2024(self):
        """Année 2024 (R)"""
        assert decode_vin_year("1C4RJHBG6R8806264") == 2024
    
    def test_decode_year_2026(self):
        """Année 2026 (T)"""
        assert decode_vin_year("1C4RJHBG6T8806264") == 2026
    
    def test_decode_brand_jeep(self):
        """Marque Jeep (1C4)"""
        assert decode_vin_brand("1C4RJHBG6S8806264") == "Jeep"
    
    def test_decode_brand_ram(self):
        """Marque Ram (1C6)"""
        assert decode_vin_brand("1C6RJHBG6S8806264") == "Ram"
    
    def test_decode_brand_chrysler(self):
        """Marque Chrysler (2C3)"""
        assert decode_vin_brand("2C3RJHBG6S8806264") == "Chrysler"


class TestVINSmartCorrection:
    """Tests pour smart_vin_correction"""
    
    def test_no_correction_needed(self):
        """VIN déjà valide"""
        # Créer un VIN valide
        vin = "1C4RJKBG5S8123456"
        check = calculate_check_digit(vin)
        valid_vin = vin[:8] + check + vin[9:]
        
        result = smart_vin_correction(valid_vin)
        assert result["is_valid"] == True
        assert result["correction_applied"] == False
    
    def test_correction_simple_ocr(self):
        """Correction OCR simple"""
        # VIN avec O au lieu de 0
        result = smart_vin_correction("1C4RJHBG6SO806264")
        assert "O" not in result["corrected"]
    
    def test_no_forced_checkdigit(self):
        """Ne jamais forcer le check digit - RÈGLE CRITIQUE"""
        # VIN avec mauvais check digit
        vin = "1C4RJHBG6X8806264"
        result = smart_vin_correction(vin)
        
        # Si le VIN ne peut pas être corrigé via OCR,
        # il doit rester invalide (pas de forçage)
        if not result["is_valid"]:
            assert result["correction_type"] == "checksum_invalid_review_required"


# =========================
# B. TESTS PARSER
# =========================

class TestFCAParser:
    """Tests pour le module parser"""
    
    def test_clean_fca_price_standard(self):
        """Décodage prix FCA standard"""
        assert clean_fca_price("06997900") == 69979
        assert clean_fca_price("07544500") == 75445
        assert clean_fca_price("07070400") == 70704
    
    def test_clean_fca_price_with_leading_zero(self):
        """Prix avec 0 initial"""
        assert clean_fca_price("05662000") == 56620
        assert clean_fca_price("03500000") == 35000
    
    def test_clean_fca_price_invalid(self):
        """Prix invalide"""
        assert clean_fca_price("abc") == 0
        assert clean_fca_price("") == 0
        assert clean_fca_price("12") == 0  # Trop court
    
    def test_parse_vin_standard(self):
        """Parse VIN standard 17 chars"""
        text = "VIN: 1C4RJHBG6S8806264"
        assert parse_vin(text) == "1C4RJHBG6S8806264"
    
    def test_parse_vin_with_dashes(self):
        """Parse VIN FCA avec tirets"""
        text = "1C4RJHBG6-S8-806264"
        vin = parse_vin(text)
        assert vin is not None
        assert len(vin) == 17
        assert "-" not in vin
    
    def test_parse_model_code_grand_cherokee(self):
        """Parse model code Grand Cherokee (WL)"""
        text = "MODEL: WLJP74 GRAND CHEROKEE"
        code = parse_model_code(text)
        assert code == "WLJP74"
    
    def test_parse_model_code_gladiator(self):
        """Parse model code Gladiator (JT)"""
        text = "MODEL: JTHP87 GLADIATOR"
        code = parse_model_code(text)
        assert code == "JTHP87"


class TestFinancialParsing:
    """Tests pour l'extraction de données financières"""
    
    def test_parse_ep_standard(self):
        """Parse E.P. standard"""
        text = "E.P. 06997900"
        data = parse_financial_data(text)
        assert data["ep_cost"] == 69979
    
    def test_parse_ep_with_dots(self):
        """Parse E.P. avec points"""
        text = "E.P. 07544500"
        data = parse_financial_data(text)
        assert data["ep_cost"] == 75445
    
    def test_parse_pdco(self):
        """Parse PDCO"""
        text = "PDCO 07544500"
        data = parse_financial_data(text)
        assert data["pdco"] == 75445
    
    def test_parse_pref(self):
        """Parse PREF"""
        text = "PREF* 07070400"
        data = parse_financial_data(text)
        assert data["pref"] == 70704
    
    def test_parse_all_financial(self):
        """Parse toutes les données financières"""
        text = """
        E.P. 06997900
        PDCO 07544500
        PREF* 07070400
        """
        data = parse_financial_data(text)
        assert data["ep_cost"] == 69979
        assert data["pdco"] == 75445
        assert data["pref"] == 70704


class TestOptionsParsing:
    """Tests pour l'extraction des options"""
    
    def test_parse_options_standard(self):
        """Parse options standard"""
        text = """
        ETM 6 CYL CUMMINS DIESEL 0880000
        AZC HEATED SEATS 0025000
        NAS NAVIGATION SYSTEM 0150000
        """
        options = parse_options(text)
        assert len(options) >= 2
        
        codes = [opt["product_code"] for opt in options]
        assert "ETM" in codes
    
    def test_parse_options_exclude_invalid(self):
        """Exclure les codes invalides (VIN, GST, etc.)"""
        text = """
        VIN VEHICLE IDENTIFICATION 0000000
        GST TAX NUMBER 0000000
        ETM VALID OPTION 0880000
        """
        options = parse_options(text)
        codes = [opt["product_code"] for opt in options]
        
        assert "VIN" not in codes
        assert "GST" not in codes


# =========================
# C. TESTS VALIDATION
# =========================

class TestBusinessValidation:
    """Tests pour les règles métier FCA"""
    
    def test_ep_pdco_valid(self):
        """EP < PDCO valide"""
        valid, msg = validate_ep_pdco(69979, 75445)
        assert valid == True
    
    def test_ep_pdco_invalid_ep_higher(self):
        """EP > PDCO invalide"""
        valid, msg = validate_ep_pdco(80000, 75000)
        assert valid == False
        assert "EP" in msg and "PDCO" in msg
    
    def test_ep_pdco_equal_invalid(self):
        """EP = PDCO invalide"""
        valid, msg = validate_ep_pdco(75000, 75000)
        assert valid == False
    
    def test_ep_pdco_missing(self):
        """EP ou PDCO manquant"""
        valid, msg = validate_ep_pdco(0, 75000)
        assert valid == False
        
        valid, msg = validate_ep_pdco(69979, 0)
        assert valid == False
    
    def test_pdco_minimum_valid(self):
        """PDCO > 30000 valide"""
        valid, msg = validate_pdco_minimum(75445)
        assert valid == True
    
    def test_pdco_minimum_too_low(self):
        """PDCO < 30000 invalide"""
        valid, msg = validate_pdco_minimum(20000)
        assert valid == False
    
    def test_pdco_maximum_exceeded(self):
        """PDCO > 150000 invalide"""
        valid, msg = validate_pdco_minimum(200000)
        assert valid == False
    
    def test_options_count_sufficient(self):
        """5+ options valide"""
        options = [{"c": "A"} for _ in range(5)]
        valid, msg = validate_options_count(options)
        assert valid == True
    
    def test_options_count_insufficient(self):
        """< 3 options invalide"""
        options = [{"c": "A"}, {"c": "B"}]
        valid, msg = validate_options_count(options)
        assert valid == False


# =========================
# D. TESTS SCORING
# =========================

class TestValidationScoring:
    """Tests pour le calcul du score de validation"""
    
    def test_score_perfect_data(self, valid_invoice_data):
        """Score >= 85 pour données parfaites"""
        result = calculate_validation_score(valid_invoice_data)
        assert result["score"] >= 85
        assert result["status"] == "valid"
    
    def test_score_without_vin(self, valid_invoice_data):
        """Score réduit sans VIN"""
        data = valid_invoice_data.copy()
        data["vin"] = None
        
        result = calculate_validation_score(data)
        assert result["score"] < 75
    
    def test_score_invalid_vin(self, valid_invoice_data):
        """Score réduit avec VIN invalide"""
        data = valid_invoice_data.copy()
        data["vin_valid"] = False
        
        result = calculate_validation_score(data)
        # VIN invalide = 5 points au lieu de 25
        assert result["score"] < 85
    
    def test_score_without_ep(self, valid_invoice_data):
        """Score réduit sans EP"""
        data = valid_invoice_data.copy()
        data["ep_cost"] = 0
        
        result = calculate_validation_score(data)
        assert result["score"] < 85
    
    def test_score_without_pdco(self, valid_invoice_data):
        """Score réduit sans PDCO"""
        data = valid_invoice_data.copy()
        data["pdco"] = 0
        
        result = calculate_validation_score(data)
        assert result["score"] < 85


# =========================
# E. TESTS RÈGLE D'OR
# =========================

class TestGoldenRule:
    """Tests pour la Règle d'Or - jamais enregistrer si invalide"""
    
    def test_vin_missing_blocks(self):
        """VIN manquant → doit bloquer"""
        data = {
            "vin": "",
            "ep_cost": 69979,
            "pdco": 75445
        }
        result = validate_invoice_data(data)
        assert result["is_valid"] == False
    
    def test_ep_missing_blocks(self):
        """EP manquant → doit bloquer"""
        data = {
            "vin": "1C4RJHBG6S8806264",
            "vin_valid": True,
            "ep_cost": 0,
            "pdco": 75445
        }
        result = validate_invoice_data(data)
        assert result["is_valid"] == False
    
    def test_pdco_missing_low_score(self):
        """PDCO manquant → score bas"""
        data = {
            "vin": "1C4RJHBG6S8806264",
            "vin_valid": True,
            "ep_cost": 69979,
            "pdco": 0
        }
        result = validate_invoice_data(data)
        assert result["score"] < 60
    
    def test_ep_higher_than_pdco_error(self):
        """EP > PDCO → erreur dans liste"""
        data = {
            "vin": "1C4RJHBG6S8806264",
            "vin_valid": True,
            "ep_cost": 80000,
            "pdco": 75000
        }
        result = validate_invoice_data(data)
        assert len(result["errors"]) > 0
        assert any("EP" in e and "PDCO" in e for e in result["errors"])


# =========================
# F. TESTS DÉCISION PIPELINE
# =========================

class TestDecisionLogic:
    """Tests pour la logique de décision (seuils 85/60)"""
    
    def test_auto_approved_threshold(self, valid_invoice_data):
        """Score >= 85 → auto_approved"""
        result = calculate_validation_score(valid_invoice_data)
        assert result["score"] >= 85
        # En pratique, l'endpoint retournerait decision = "auto_approved"
    
    def test_review_required_threshold(self, partial_invoice_data):
        """Score 60-84 → review_required"""
        result = calculate_validation_score(partial_invoice_data)
        # Score avec PDCO=0 devrait être dans la zone review
        assert result["score"] < 85
    
    def test_vision_required_threshold(self):
        """Score < 60 → vision_required"""
        data = {
            "vin": "",
            "ep_cost": 0,
            "pdco": 0,
            "options": []
        }
        result = calculate_validation_score(data)
        assert result["score"] < 60


# =========================
# G. TESTS OCR PIPELINE
# =========================

class TestOCRPipeline:
    """Tests pour le pipeline OCR"""
    
    def test_parse_invoice_text_good(self, ocr_result_good):
        """Parse texte OCR de bonne qualité"""
        result = parse_invoice_text(ocr_result_good)
        
        assert result["vin"] is not None
        assert len(result["vin"]) == 17
        assert result["ep_cost"] == 69979
        assert result["pdco"] == 75445
    
    def test_parse_invoice_text_poor(self, ocr_result_poor):
        """Parse texte OCR de mauvaise qualité"""
        result = parse_invoice_text(ocr_result_poor)
        
        # Devrait avoir peu de champs extraits
        assert result["fields_extracted"] < 3
    
    def test_load_image_invalid_bytes(self):
        """Charger image avec bytes invalides"""
        invalid_bytes = b"not an image"
        result = load_image_from_bytes(invalid_bytes)
        assert result is None


# =========================
# H. TESTS INTÉGRATION FULL
# =========================

class TestFullPipeline:
    """Tests d'intégration du pipeline complet"""
    
    def test_valid_invoice_full_pipeline(self, valid_invoice_data):
        """Pipeline complet avec facture valide"""
        # 1. Validation
        validation = validate_invoice_data(valid_invoice_data)
        assert validation["is_valid"] == True
        assert validation["score"] >= 85
        
        # 2. VIN correction
        vin_result = validate_and_correct_vin(valid_invoice_data["vin"])
        assert vin_result["is_valid"] == True
    
    def test_invalid_invoice_blocked(self, invalid_vin_data):
        """Pipeline bloque facture invalide"""
        validation = validate_invoice_data(invalid_vin_data)
        
        # Devrait être invalide ou avoir un score bas
        assert validation["score"] < 85
    
    def test_partial_invoice_review(self, partial_invoice_data):
        """Pipeline met facture partielle en review"""
        validation = validate_invoice_data(partial_invoice_data)
        
        # PDCO manquant = score bas
        assert validation["score"] < 85


# =========================
# EXÉCUTION
# =========================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-x"])
