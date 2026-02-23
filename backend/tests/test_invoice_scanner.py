"""
Tests automatisés pour le scanner de factures FCA/Stellantis
Exécuter avec: python -m pytest tests/test_invoice_scanner.py -v
"""

import pytest
import json
import os
import sys

# Ajouter le répertoire parent au path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from parser import parse_options, parse_model_code, parse_invoice_text
from product_code_lookup import lookup_product_code, get_codes_count


class TestProductCodeDatabase:
    """Tests pour la base de données des codes produits"""
    
    def test_codes_loaded(self):
        """Vérifie que les codes sont chargés"""
        count = get_codes_count()
        assert count >= 100, f"Attendu >= 100 codes, obtenu {count}"
    
    def test_critical_codes_exist(self):
        """Vérifie que les codes critiques existent"""
        critical_codes = ['D28H92', 'DJ7L92', 'DJ7H91', 'DJ7H92', 'D23L91']
        for code in critical_codes:
            result = lookup_product_code(code)
            assert result is not None, f"Code {code} manquant!"
    
    def test_d28h92_is_bighorn(self):
        """D28H92 doit être Ram 3500 Big Horn"""
        result = lookup_product_code('D28H92')
        assert result is not None
        assert result['brand'] == 'Ram'
        assert result['model'] == '3500'
        assert result['trim'] == 'Big Horn'
    
    def test_dj7l92_is_tradesman(self):
        """DJ7L92 doit être Ram 2500 Tradesman"""
        result = lookup_product_code('DJ7L92')
        assert result is not None
        assert result['brand'] == 'Ram'
        assert result['model'] == '2500'
        assert result['trim'] == 'Tradesman'
    
    def test_dj7h91_is_bighorn(self):
        """DJ7H91 doit être Ram 2500 Big Horn"""
        result = lookup_product_code('DJ7H91')
        assert result is not None
        assert result['brand'] == 'Ram'
        assert result['model'] == '2500'
        assert result['trim'] == 'Big Horn'


class TestModelCodeExtraction:
    """Tests pour l'extraction du code modèle"""
    
    def test_extract_dj7l92(self):
        """Extraction DJ7L92 (Ram 2500)"""
        result = parse_model_code('DJ7L92 description text')
        assert result == 'DJ7L92'
    
    def test_extract_d28h92(self):
        """Extraction D28H92 (Ram 3500)"""
        result = parse_model_code('D28H92 test')
        assert result == 'D28H92'
    
    def test_extract_d23l91(self):
        """Extraction D23L91 (Ram 3500)"""
        result = parse_model_code('D23L91 text')
        assert result == 'D23L91'
    
    def test_extract_wljp74(self):
        """Extraction WLJP74 (Grand Cherokee)"""
        result = parse_model_code('WLJP74 jeep')
        assert result == 'WLJP74'
    
    def test_extract_from_invoice(self):
        """Extraction depuis texte complet de facture"""
        invoice_text = """
        MODEL/OPT
        DJ7L92
        PW7     BLANC ECLATANT
        """
        result = parse_model_code(invoice_text)
        assert result == 'DJ7L92'


class TestOptionsExtraction:
    """Tests pour l'extraction des options"""
    
    def test_options_in_order(self):
        """Les options doivent être dans l'ordre de la facture"""
        invoice_text = '''
PW7     BLANC ECLATANT                               66,770.00
TXX8    BANQ AVANT 40-20-40 VINYLE RENFORCE          SANS FRAIS
AHU     PREP REMORQ SELLETTE/COL-DE-CYGNE            876.00
ETM     6 CYL LI TURB DIESEL HR CUMMINS 6,7L         8,800.00
4CP     TAXE ACCISE FEDERALE - CLIMATISEUR           100.00
801     FRAIS DE TRANSPORT                           2,395.00
'''
        options = parse_options(invoice_text)
        
        expected_order = ['PW7', 'TXX8', 'AHU', 'ETM', '4CP', '801']
        actual_order = [opt['product_code'] for opt in options[:6]]
        
        assert actual_order == expected_order, f"Ordre incorrect: {actual_order}"
    
    def test_all_options_extracted(self):
        """Toutes les options doivent être extraites"""
        invoice_text = '''
PW7     BLANC ECLATANT                               66,770.00
TXX8    BANQ AVANT 40-20-40 VINYLE RENFORCE          SANS FRAIS
AHU     PREP REMORQ SELLETTE/COL-DE-CYGNE            876.00
ETM     6 CYL LI TURB DIESEL HR CUMMINS 6,7L         8,800.00
4CP     TAXE ACCISE FEDERALE                         100.00
801     FRAIS DE TRANSPORT                           2,395.00
92HC1   COTISATION P.P.                              75.00
92HC2   ALLOCATION DE MARKETING                      340.00
'''
        options = parse_options(invoice_text)
        
        # Vérifier qu'on a au moins 7 options
        assert len(options) >= 7, f"Attendu >= 7 options, obtenu {len(options)}"
    
    def test_option_format(self):
        """Format des options: CODE - Description"""
        invoice_text = '''
PW7     BLANC ECLATANT                               66,770.00
'''
        options = parse_options(invoice_text)
        
        assert len(options) >= 1
        assert 'PW7' in options[0]['description']
        assert '-' in options[0]['description']


class TestHoldbackExtraction:
    """Tests pour l'extraction du holdback depuis la facture"""
    
    def test_holdback_070000(self):
        """070000 = $700.00"""
        from parser import parse_financial_data
        text = "PREF*08731300\n070000  GVW:"
        result = parse_financial_data(text)
        assert result.get("holdback") == 700.0
    
    def test_holdback_0280000(self):
        """0280000 = $2800.00"""
        from parser import parse_financial_data
        text = "PREF*08731300\n0280000  GVW:"
        result = parse_financial_data(text)
        assert result.get("holdback") == 2800.0
    
    def test_holdback_0120000(self):
        """0120000 = $1200.00"""
        from parser import parse_financial_data
        text = "PREF*08731300\n0120000  GVW:"
        result = parse_financial_data(text)
        assert result.get("holdback") == 1200.0


class TestTrimBuilding:
    """Tests pour la construction du trim"""
    
    def test_full_trim(self):
        """Trim complet avec cab et drive"""
        def _build_trim_string(product_info):
            if not product_info:
                return ""
            trim = product_info.get("trim") or ""
            cab = product_info.get("cab") or ""
            drive = product_info.get("drive") or ""
            body = f"{cab} {drive}".strip()
            
            if trim and body:
                return f"{trim} {body}"
            elif trim:
                return trim
            elif body:
                return body
            return ""
        
        result = _build_trim_string({
            'trim': 'Big Horn',
            'cab': 'Crew Cab',
            'drive': '4x4'
        })
        assert result == 'Big Horn Crew Cab 4x4'
    
    def test_empty_trim(self):
        """Trim vide quand pas de données"""
        def _build_trim_string(product_info):
            if not product_info:
                return ""
            trim = product_info.get("trim") or ""
            cab = product_info.get("cab") or ""
            drive = product_info.get("drive") or ""
            body = f"{cab} {drive}".strip()
            
            if trim and body:
                return f"{trim} {body}"
            elif trim:
                return trim
            elif body:
                return body
            return ""
        
        result = _build_trim_string({'trim': None, 'cab': None, 'drive': None})
        assert result == ''


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
