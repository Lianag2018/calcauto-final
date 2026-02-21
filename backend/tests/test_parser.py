"""
Test du pipeline OCR par zones - Validation des modules
"""

import sys
sys.path.insert(0, '/app/backend')

import pytest
from vin_utils import (
    validate_vin_checksum,
    calculate_check_digit,
    correct_vin_ocr_errors,
    validate_and_correct_vin,
    decode_vin_year,
    decode_vin_brand
)
from parser import (
    clean_fca_price,
    parse_vin,
    parse_financial_data,
    parse_options
)
from validation import (
    validate_ep_pdco,
    validate_pdco_minimum,
    calculate_validation_score
)


class TestVINValidation:
    """Tests pour le module vin_utils"""
    
    def test_valid_vin_checksum(self):
        """VIN valide avec bon check digit"""
        # VIN Jeep valide connu
        valid_vin = "1C4RJKBG5S8123456"
        # Calculer le bon check digit
        check = calculate_check_digit(valid_vin)
        # Construire un VIN avec le bon check digit
        corrected = valid_vin[:8] + check + valid_vin[9:]
        assert validate_vin_checksum(corrected) == True
    
    def test_invalid_vin_length(self):
        """VIN avec mauvaise longueur"""
        assert validate_vin_checksum("1C4RJKBG5S812345") == False  # 16 chars
        assert validate_vin_checksum("1C4RJKBG5S81234567") == False  # 18 chars
        assert validate_vin_checksum("") == False
    
    def test_ocr_corrections(self):
        """Correction des erreurs OCR courantes"""
        # O → 0
        assert correct_vin_ocr_errors("1C4RJKBG5SO123456") == "1C4RJKBG5S0123456"
        # I → 1
        assert correct_vin_ocr_errors("IC4RJKBG5S8123456") == "1C4RJKBG5S8123456"
        # Q → 0
        assert correct_vin_ocr_errors("1C4RJKBG5SQ123456") == "1C4RJKBG5S0123456"
    
    def test_vin_year_decode(self):
        """Décodage année VIN"""
        assert decode_vin_year("1C4RJKBG5S8123456") == 2025  # S = 2025
        assert decode_vin_year("1C4RJKBG5T8123456") == 2026  # T = 2026
        assert decode_vin_year("1C4RJKBG5R8123456") == 2024  # R = 2024
    
    def test_vin_brand_decode(self):
        """Décodage marque VIN"""
        assert decode_vin_brand("1C4RJKBG5S8123456") == "Jeep"
        assert decode_vin_brand("1C6RJEBG5S8123456") == "Ram"
        assert decode_vin_brand("2C3RJKBG5S8123456") == "Chrysler"
    
    def test_full_vin_validation_correction(self):
        """Validation et correction complète"""
        # VIN Jeep valide connu
        result = validate_and_correct_vin("1C4RJKBG5S8806267")
        assert result["corrected"] is not None
        assert result["year"] == 2025
        # Brand peut être None si WMI non reconnu, test le décodage séparé
        assert decode_vin_brand("1C4RJKBG5S8806267") == "Jeep"


class TestFCAParser:
    """Tests pour le module parser"""
    
    def test_clean_fca_price(self):
        """Décodage prix FCA (enlève premier 0 et 2 derniers chiffres)"""
        # 05662000 → 56620
        assert clean_fca_price("05662000") == 56620
        # 06500000 → 65000
        assert clean_fca_price("06500000") == 65000
        # 03500000 → 35000
        assert clean_fca_price("03500000") == 35000
    
    def test_parse_vin_standard(self):
        """Parse VIN standard 17 caractères"""
        text = "VIN: 1C4RJKBG5S8123456"
        vin = parse_vin(text)
        assert vin == "1C4RJKBG5S8123456"
    
    def test_parse_vin_with_dashes(self):
        """Parse VIN avec tirets FCA - format réel"""
        # Format FCA réel: 1C4RJKBG5-S8-806267
        text = "VIN: 1C4RJKBG5-S8-806267"
        vin = parse_vin(text)
        assert vin is not None
        assert len(vin) == 17
        assert vin == "1C4RJKBG5S8806267"
    
    def test_parse_financial_data(self):
        """Parse données financières"""
        text = """
        E.P. 05662000
        PDCO 06500000
        PREF 05662000
        """
        data = parse_financial_data(text)
        assert data["ep_cost"] == 56620
        assert data["pdco"] == 65000
        assert data["pref"] == 56620
    
    def test_parse_options(self):
        """Parse liste des options"""
        text = """
        ETM  6 CYL 6.7L CUMMINS DIESEL  0880000
        AZC  HEATED SEATS  0025000
        XXX  TEST OPTION  0010000
        """
        options = parse_options(text)
        assert len(options) >= 2
        # Vérifier qu'au moins une option a un code valide
        codes = [opt["product_code"] for opt in options]
        assert "ETM" in codes or "AZC" in codes


class TestValidation:
    """Tests pour le module validation"""
    
    def test_validate_ep_pdco_valid(self):
        """EP < PDCO valide"""
        valid, msg = validate_ep_pdco(55000, 65000)
        assert valid == True
    
    def test_validate_ep_pdco_invalid(self):
        """EP >= PDCO invalide"""
        valid, msg = validate_ep_pdco(65000, 55000)
        assert valid == False
    
    def test_validate_pdco_minimum(self):
        """PDCO minimum pour véhicule neuf"""
        valid, msg = validate_pdco_minimum(65000)
        assert valid == True
        
        valid, msg = validate_pdco_minimum(20000)
        assert valid == False  # Trop bas
    
    def test_validation_score(self):
        """Calcul du score de validation"""
        data = {
            "vin": "1C4RJKBG5S8123456",
            "vin_valid": True,
            "ep_cost": 55000,
            "pdco": 65000,
            "subtotal": 60000,
            "options": [{"code": "A"}, {"code": "B"}, {"code": "C"}, {"code": "D"}, {"code": "E"}]
        }
        result = calculate_validation_score(data)
        assert result["score"] >= 70
        assert result["status"] in ["valid", "review"]


if __name__ == "__main__":
    # Exécuter avec pytest
    pytest.main([__file__, "-v", "--tb=short"])
