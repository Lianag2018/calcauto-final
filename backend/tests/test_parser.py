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
    parse_options,
    deduplicate_by_equivalence
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
    
    def test_double_char_ocr_error(self):
        """Test correction de 2 erreurs OCR simultanées (cas réel utilisateur)
        
        Facture réelle: 1C4RJKAG9S8804569
        OCR extrait:    1C4RJKAG8S8804S69
        Erreurs: position 9: 9→8, position 15: 5→S
        
        Note: Les deux VINs sont valides par checksum, donc correction non possible
        automatiquement. Ce test vérifie que le système accepte les deux comme valides.
        """
        vin_correct = "1C4RJKAG9S8804569"
        vin_ocr_error = "1C4RJKAG8S8804S69"
        
        # Les deux VINs doivent être valides
        result_correct = validate_and_correct_vin(vin_correct)
        result_ocr = validate_and_correct_vin(vin_ocr_error)
        
        assert result_correct["is_valid"] == True, "VIN correct devrait être valide"
        assert result_ocr["is_valid"] == True, "VIN OCR devrait aussi être valide (checksum ok)"
        
        # Vérifier année et marque
        assert result_correct["year"] == 2025
        assert result_correct["brand"] == "Jeep"
    
    def test_single_char_ocr_correction_5_to_S(self):
        """Test correction 5→S (erreur OCR fréquente)"""
        # Créer un VIN où 5 est remplacé par S et le checksum devient invalide
        # Pour ce test, nous vérifions que la paire de confusion existe
        from vin_utils import OCR_CONFUSION_PAIRS
        
        assert '5' in OCR_CONFUSION_PAIRS
        assert 'S' in OCR_CONFUSION_PAIRS['5']
        assert '5' in OCR_CONFUSION_PAIRS['S']
    
    def test_single_char_ocr_correction_8_to_9(self):
        """Test correction 8→9 (erreur OCR fréquente)"""
        from vin_utils import OCR_CONFUSION_PAIRS
        
        assert '8' in OCR_CONFUSION_PAIRS
        assert '9' in OCR_CONFUSION_PAIRS['8']
        assert '8' in OCR_CONFUSION_PAIRS['9']


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


# =====================================
# TESTS DÉDUPLICATION V6.5
# =====================================

from parser import deduplicate_options, CATEGORY_GROUPS


class TestDeduplication:
    """Tests pour la déduplication d'options FCA"""
    
    def test_deduplicate_transmission(self):
        """Deux transmissions → garde celle avec montant > 0"""
        options = [
            {"product_code": "DFT", "description": "Trans Auto 8 vitesses", "amount": 0},
            {"product_code": "DFW", "description": "Trans Auto 8 vitesses", "amount": 1500}
        ]
        
        result = deduplicate_options(options)
        
        assert len(result) == 1
        assert result[0]["product_code"] == "DFW"
        assert result[0]["amount"] == 1500
    
    def test_deduplicate_engine(self):
        """Deux moteurs → garde celui avec montant > 0"""
        options = [
            {"product_code": "ERB", "description": "Moteur V6", "amount": 0},
            {"product_code": "ERC", "description": "Moteur V6 Pentastar", "amount": 0}
        ]
        
        result = deduplicate_options(options)
        
        # Les deux ont amount=0, garde le premier
        assert len(result) == 1
        assert result[0]["product_code"] == "ERB"
    
    def test_deduplicate_color(self):
        """Deux couleurs → garde une seule"""
        options = [
            {"product_code": "PXJ", "description": "Noir cristal", "amount": 500},
            {"product_code": "PW7", "description": "Blanc éclatant", "amount": 0}
        ]
        
        result = deduplicate_options(options)
        
        assert len(result) == 1
        assert result[0]["product_code"] == "PXJ"  # montant > 0
    
    def test_deduplicate_fuel(self):
        """Carburant supplémentaire → une seule option"""
        options = [
            {"product_code": "YGN", "description": "15L essence", "amount": 0},
            {"product_code": "YGW", "description": "20L essence", "amount": 100}
        ]
        
        result = deduplicate_options(options)
        
        assert len(result) == 1
        assert result[0]["product_code"] == "YGW"
    
    def test_no_dedup_different_categories(self):
        """Options de catégories différentes → toutes gardées"""
        options = [
            {"product_code": "DFT", "description": "Transmission", "amount": 0},
            {"product_code": "ERC", "description": "Moteur", "amount": 0},
            {"product_code": "PXJ", "description": "Couleur", "amount": 500}
        ]
        
        result = deduplicate_options(options)
        
        assert len(result) == 3
    
    def test_no_dedup_unknown_codes(self):
        """Codes inconnus → tous gardés"""
        options = [
            {"product_code": "ABC", "description": "Option inconnue 1", "amount": 0},
            {"product_code": "XYZ", "description": "Option inconnue 2", "amount": 100},
            {"product_code": "DFT", "description": "Transmission", "amount": 0}
        ]
        
        result = deduplicate_options(options)
        
        # ABC et XYZ gardés (inconnus) + DFT gardé (seul de sa catégorie)
        assert len(result) == 3
    
    def test_mixed_dedup(self):
        """Mix de catégories connues et inconnues"""
        options = [
            {"product_code": "DFT", "description": "Trans 1", "amount": 0},
            {"product_code": "DFW", "description": "Trans 2", "amount": 1000},
            {"product_code": "ABC", "description": "Inconnu", "amount": 0},
            {"product_code": "PXJ", "description": "Couleur 1", "amount": 0},
            {"product_code": "PW7", "description": "Couleur 2", "amount": 200},
            {"product_code": "ERC", "description": "Moteur", "amount": 0}
        ]
        
        result = deduplicate_options(options)
        
        # ABC (inconnu) + DFW (trans prioritaire) + PW7 (couleur prioritaire) + ERC (moteur seul)
        assert len(result) == 4
        
        codes = [opt["product_code"] for opt in result]
        assert "ABC" in codes
        assert "DFW" in codes
        assert "PW7" in codes
        assert "ERC" in codes
        assert "DFT" not in codes  # Supprimé car DFW prioritaire
        assert "PXJ" not in codes  # Supprimé car PW7 prioritaire


class TestBlockedCodes:
    """Tests pour vérifier que YG4, 4CP, 2TZ sont complètement bloqués"""

    BLOCKED_CODES = {'YG4', '4CP', '2TZ'}

    def test_blocked_codes_direct_ocr(self):
        """Les codes bloqués sont ignorés même quand l'OCR les détecte directement"""
        text = """
PDN GRIS CERAMIQUE SANS FRAIS
YG4 20L SUPPLEMENTAIRES DIESEL SANS FRAIS
4CP TAXE ACCISE FEDERALE CLIMATISEUR 100.00
2TZ ENSEMBLE ECLAIR 2TZ 935.00
ETM 6 CYL TURBO DIESEL CUMMINS 6,7L 8,800.00
"""
        options = parse_options(text)
        codes = {opt["product_code"] for opt in options}
        assert codes.isdisjoint(self.BLOCKED_CODES), f"Codes bloqués trouvés: {codes & self.BLOCKED_CODES}"
        assert "PDN" in codes
        assert "ETM" in codes

    def test_blocked_codes_fallback_description(self):
        """Les codes bloqués ne sont pas ajoutés via fallback description"""
        text = """
PDN GRIS CERAMIQUE SANS FRAIS
20L SUPPLEMENTAIRES DIESEL
TAXE ACCISE FEDERALE CLIMATISEUR
ENSEMBLE ECLAIR 2TZ
"""
        options = parse_options(text)
        codes = {opt["product_code"] for opt in options}
        assert codes.isdisjoint(self.BLOCKED_CODES), f"Codes bloqués via fallback: {codes & self.BLOCKED_CODES}"

    def test_blocked_codes_full_ram_invoice(self):
        """Simulation complète d'une facture Ram 2500 sans codes bloqués"""
        text = """
DJ7H91 RAM 2500 BIG HORN
PDN GRIS CERAMIQUE SANS FRAIS
MJX9 BAQUETS AVANT TISSU CATEGORIE SUP SANS FRAIS
AHU PREP REMORQ SELLETTE/COL-DE-CYGNE 485.00
ASH EDITION NUIT 1,495.00
A7H ENSEMBLE EQUIP NIVEAU 2 BIG HORN 5,530.00
CLF TAPIS PROTECT AVANT/ARR MOPARMD 440.00
DFM TRANSMISSION AUTO 8 VIT ZF POWERLINE SANS FRAIS
ETM 6 CYL LI TURB DIESEL HR CUMMINS 6,7L 8,800.00
LHL COMMANDES AUXILIAIRES TABLEAU BORD SANS FRAIS
MWH DOUBLURES PASSAGE ROUE ARRIERE 345.00
Z7H PNBV 4490 KG (9900 LB) SANS FRAIS
YG4 20L SUPPLEMENTAIRES DIESEL SANS FRAIS
4CP TAXE ACCISE FEDERALE CLIMATISEUR 100.00
2TZ ENSEMBLE ECLAIR 2TZ 935.00
"""
        options = parse_options(text)
        codes = [opt["product_code"] for opt in options]

        # Aucun code bloqué ne doit apparaître
        for blocked in self.BLOCKED_CODES:
            assert blocked not in codes, f"{blocked} ne devrait pas être dans les options"

        # Les vrais codes doivent y être
        expected = ["PDN", "MJX9", "AHU", "ASH", "A7H", "CLF", "DFM", "ETM", "LHL", "MWH", "Z7H"]
        for exp in expected:
            assert exp in codes, f"{exp} devrait être dans les options"


class TestHeaderFiltering:
    """Tests pour vérifier que les données de l'en-tête de facture sont filtrées"""

    HEADER_CODES = {'ELITE', 'BANQUE', '596', 'TAN', 'HURRIC', 'DC1', 'DT6L98'}

    def test_header_codes_filtered(self):
        """Les mots de l'en-tête ne doivent pas apparaître comme options"""
        text = """
SOLD TO ELITE CHRYSLER JEEP INC.
6138 CH DE SAINT-ELIE
BANQUE TORONTO DOMINION
596 AVENUE OUELETTE
WINDSOR ONTARIO N9A 1B7
DT6L98 57,710.00
PAU CRISTAL GRANIT METALLISE 524.00
C5X9 BAQUETS AVANT DOSSIER HAUT EN TISSU SANS FRAIS
AMQ ENSEMBLE EXPRESS NOIRE 1,104.00
DFR TRANSMISSION AUTOMATIQUE 8 VITESSES
EFH HURRIC BITUR 3L 6CYL LIGN RD STD ESS 3,340.00
MWH DOUBLURES PASSAGE DE ROUE ARRIERE
YGV 17 L SUPPLEMENTAIRES D ESSENCE
21D ENSEMBLE ECLAIR 21D 1,320.00
801 FRAIS DE TRANSPORT 2,595.00
"""
        options = parse_options(text)
        codes = {opt["product_code"] for opt in options}

        # Aucun code d'en-tête
        assert codes.isdisjoint(self.HEADER_CODES), f"Codes d'en-tête trouvés: {codes & self.HEADER_CODES}"

        # Les vrais codes doivent y être
        assert "PAU" in codes
        assert "DFR" in codes
        assert "EFH" in codes
        assert "MWH" in codes
        assert "YGV" in codes


if __name__ == "__main__":
    # Exécuter avec pytest
    pytest.main([__file__, "-v", "--tb=short"])
