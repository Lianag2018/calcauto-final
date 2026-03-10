"""
Test suite for CalcAuto AiPro - March 2026 Programs
Tests:
1. GET /api/programs?month=3&year=2026 - 93 programs, no naming duplications
2. GET /api/sci/lease-rates - March 2026 lease data (33 v2026, 40 v2025)
3. GET /api/sci/residuals - Residual data availability
4. POST /api/extract-pdf-async - PDF extraction task queueing
5. Model/trim naming validation (no model name inside trim)
6. SCI lease matching for Cherokee 2026 (lease_cash=5250)
"""

import pytest
import requests
import os
import json

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://lease-extraction.preview.emergentagent.com')
ADMIN_PASSWORD = "Liana2018"

# ============== FIXTURES ==============

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ============== GET /api/programs TESTS ==============

class TestMarch2026Programs:
    """Tests for March 2026 financing programs endpoint"""
    
    def test_get_programs_returns_93_programs(self, api_client):
        """Verify /api/programs?month=3&year=2026 returns exactly 93 programs"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) == 93, f"Expected 93 programs, got {len(data)}"
    
    def test_programs_have_all_brands(self, api_client):
        """Verify all 5 brands are represented in March 2026 programs"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        brands = set(p['brand'] for p in data)
        
        expected_brands = {'Chrysler', 'Dodge', 'Fiat', 'Jeep', 'Ram'}
        assert brands == expected_brands, f"Expected brands {expected_brands}, got {brands}"
    
    def test_no_model_name_duplication_in_trim(self, api_client):
        """Verify model name does NOT appear inside the trim field"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        issues = []
        
        for p in data:
            model = p.get('model', '')
            trim = p.get('trim', '') or ''
            brand = p.get('brand', '')
            
            # Check if key model words appear at the START of trim
            model_words = model.lower().split()
            trim_lower = trim.lower()
            
            for word in model_words:
                if word in ['grand', 'cherokee', 'wagoneer']:
                    if trim_lower.startswith(word):
                        issues.append(f"{brand} {model} | trim={trim}")
                        break
        
        assert len(issues) == 0, f"Found {len(issues)} model/trim naming duplications: {issues[:5]}"
    
    def test_cherokee_models_correct_naming(self, api_client):
        """Verify Cherokee and Grand Cherokee models have correct naming"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        cherokee_models = [p for p in data if 'Cherokee' in p.get('model', '')]
        
        # Verify we have Cherokee entries
        assert len(cherokee_models) > 0, "No Cherokee models found"
        
        # Verify Cherokee (not Grand Cherokee) exists
        plain_cherokee = [p for p in cherokee_models if p['model'] == 'Cherokee']
        assert len(plain_cherokee) >= 2, f"Expected at least 2 Cherokee entries, got {len(plain_cherokee)}"
        
        # Verify Grand Cherokee/Grand Cherokee L combined format exists for 2026
        grand_cherokee_combined = [p for p in cherokee_models if 'Grand Cherokee/Grand Cherokee L' in p['model'] and p['year'] == 2026]
        assert len(grand_cherokee_combined) >= 1, "No Grand Cherokee/Grand Cherokee L combined entries for 2026"
        
        # Verify separate Grand Cherokee and Grand Cherokee L exist for 2025
        gc_2025 = [p for p in cherokee_models if p['model'] == 'Grand Cherokee' and p['year'] == 2025]
        gcl_2025 = [p for p in cherokee_models if p['model'] == 'Grand Cherokee L' and p['year'] == 2025]
        assert len(gc_2025) >= 1, "No separate Grand Cherokee entries for 2025"
        assert len(gcl_2025) >= 1, "No separate Grand Cherokee L entries for 2025"
    
    def test_wagoneer_models_correct_naming(self, api_client):
        """Verify Wagoneer variants have correct naming"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        wagoneer_models = [p for p in data if 'Wagoneer' in p.get('model', '')]
        
        # Verify we have Wagoneer entries
        assert len(wagoneer_models) > 0, "No Wagoneer models found"
        
        # Check for Grand Wagoneer/Grand Wagoneer L combined
        grand_wagoneer_combined = [p for p in wagoneer_models if 'Grand Wagoneer/Grand Wagoneer L' in p['model']]
        assert len(grand_wagoneer_combined) >= 1, "No Grand Wagoneer/Grand Wagoneer L combined entries"
    
    def test_program_structure_valid(self, api_client):
        """Verify program documents have required fields"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        required_fields = ['id', 'brand', 'model', 'year', 'program_month', 'program_year']
        
        for p in data[:10]:  # Check first 10
            for field in required_fields:
                assert field in p, f"Missing required field: {field}"
            
            assert p['program_month'] == 3, f"Expected program_month=3, got {p['program_month']}"
            assert p['program_year'] == 2026, f"Expected program_year=2026, got {p['program_year']}"


# ============== SCI LEASE RATES TESTS ==============

class TestSCILeaseRates:
    """Tests for SCI lease rates endpoint"""
    
    def test_get_lease_rates_march_2026(self, api_client):
        """Verify /api/sci/lease-rates returns March 2026 data"""
        response = api_client.get(f"{BASE_URL}/api/sci/lease-rates?month=3&year=2026")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'vehicles_2026' in data, "Missing vehicles_2026 key"
        assert 'vehicles_2025' in data, "Missing vehicles_2025 key"
        assert data.get('program_period') == 'Mars 2026', f"Expected 'Mars 2026', got {data.get('program_period')}"
    
    def test_lease_rates_vehicle_counts(self, api_client):
        """Verify correct vehicle counts: 33 for 2026, 40 for 2025"""
        response = api_client.get(f"{BASE_URL}/api/sci/lease-rates?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        v2026_count = len(data.get('vehicles_2026', []))
        v2025_count = len(data.get('vehicles_2025', []))
        
        assert v2026_count == 33, f"Expected 33 vehicles_2026, got {v2026_count}"
        assert v2025_count == 40, f"Expected 40 vehicles_2025, got {v2025_count}"
    
    def test_cherokee_2026_lease_cash(self, api_client):
        """Verify Cherokee (excluding Base) 2026 has lease_cash=5250"""
        response = api_client.get(f"{BASE_URL}/api/sci/lease-rates?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        v2026 = data.get('vehicles_2026', [])
        
        # Find Cherokee (excluding Base (KMJL74))
        cherokee_excl_base = None
        for v in v2026:
            if 'Cherokee' in v.get('model', '') and 'excluding Base' in v.get('model', ''):
                cherokee_excl_base = v
                break
        
        assert cherokee_excl_base is not None, "Cherokee (excluding Base (KMJL74)) not found in SCI lease rates"
        assert cherokee_excl_base.get('lease_cash') == 5250, f"Expected lease_cash=5250, got {cherokee_excl_base.get('lease_cash')}"
    
    def test_lease_rates_have_standard_or_alternative(self, api_client):
        """Verify each vehicle has either standard_rates or alternative_rates"""
        response = api_client.get(f"{BASE_URL}/api/sci/lease-rates?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        all_vehicles = data.get('vehicles_2026', []) + data.get('vehicles_2025', [])
        
        for v in all_vehicles[:20]:  # Check first 20
            has_rates = v.get('standard_rates') is not None or v.get('alternative_rates') is not None
            assert has_rates, f"Vehicle {v.get('model')} has neither standard nor alternative rates"


# ============== SCI RESIDUALS TESTS ==============

class TestSCIResiduals:
    """Tests for SCI residuals endpoint"""
    
    def test_get_residuals_available(self, api_client):
        """Verify /api/sci/residuals returns data"""
        response = api_client.get(f"{BASE_URL}/api/sci/residuals")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'vehicles' in data, "Missing 'vehicles' key in residuals"
        assert len(data['vehicles']) > 0, "No vehicles in residuals data"
    
    def test_residuals_have_percentages(self, api_client):
        """Verify residual vehicles have residual_percentages"""
        response = api_client.get(f"{BASE_URL}/api/sci/residuals")
        assert response.status_code == 200
        
        data = response.json()
        for v in data['vehicles'][:10]:  # Check first 10
            assert 'residual_percentages' in v, f"Vehicle {v.get('model_name')} missing residual_percentages"
            pcts = v.get('residual_percentages', {})
            # Should have at least some term entries
            assert len(pcts) > 0, f"Vehicle {v.get('model_name')} has empty residual_percentages"
    
    def test_km_adjustments_available(self, api_client):
        """Verify km_adjustments are included"""
        response = api_client.get(f"{BASE_URL}/api/sci/residuals")
        assert response.status_code == 200
        
        data = response.json()
        assert 'km_adjustments' in data, "Missing km_adjustments in residuals"
        adjustments = data.get('km_adjustments', {})
        assert 'adjustments' in adjustments, "Missing adjustments sub-key"


# ============== PDF EXTRACTION TESTS ==============

class TestPDFExtraction:
    """Tests for PDF extraction endpoint (async)"""
    
    def test_extract_pdf_async_requires_file(self, api_client):
        """Verify POST /api/extract-pdf-async requires a file"""
        response = requests.post(
            f"{BASE_URL}/api/extract-pdf-async",
            data={
                'password': ADMIN_PASSWORD,
                'program_month': 2,
                'program_year': 2026
            }
        )
        
        # Should return 422 (validation error) without file
        assert response.status_code == 422, f"Expected 422 without file, got {response.status_code}"
    
    def test_extract_pdf_async_requires_password(self, api_client):
        """Verify POST /api/extract-pdf-async requires correct password"""
        # Try with wrong password
        with open('/app/pdf_source.pdf', 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/extract-pdf-async",
                files={'file': ('test.pdf', f, 'application/pdf')},
                data={
                    'password': 'wrong_password',
                    'program_month': 2,
                    'program_year': 2026
                }
            )
        
        assert response.status_code == 401, f"Expected 401 with wrong password, got {response.status_code}"
    
    def test_extract_pdf_async_queues_task(self, api_client):
        """Verify PDF extraction task is queued with correct parameters"""
        # This test checks the endpoint accepts the request - actual extraction is async
        pdf_path = '/app/pdf_source.pdf'
        if not os.path.exists(pdf_path):
            pytest.skip(f"PDF file not found at {pdf_path}")
        
        with open(pdf_path, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/extract-pdf-async",
                files={'file': ('pdf_source.pdf', f, 'application/pdf')},
                data={
                    'password': ADMIN_PASSWORD,
                    'program_month': 2,
                    'program_year': 2026
                }
            )
        
        # Should return 200 or 202 (accepted) for async task
        assert response.status_code in [200, 202], f"Expected 200/202, got {response.status_code}"
        
        data = response.json()
        assert data.get('success') == True or 'task_id' in data, f"Expected success or task_id, got {data}"


# ============== BRAND FILTER TESTS ==============

class TestBrandFilters:
    """Tests to verify all brand filter options have data"""
    
    @pytest.mark.parametrize("brand", ["Chrysler", "Dodge", "Fiat", "Jeep", "Ram"])
    def test_brand_has_programs(self, api_client, brand):
        """Verify each brand has at least one program in March 2026"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        brand_programs = [p for p in data if p['brand'] == brand]
        
        assert len(brand_programs) > 0, f"No programs found for brand: {brand}"
        
        # Verify brand programs have valid structure
        for p in brand_programs[:3]:
            assert p.get('model'), f"{brand} program missing model"
            assert p.get('year') in [2025, 2026], f"{brand} program has invalid year"


# ============== INTEGRATION TEST ==============

class TestEndToEndIntegration:
    """End-to-end integration tests"""
    
    def test_programs_and_lease_data_consistency(self, api_client):
        """Verify programs and SCI lease data are consistent for key models"""
        # Get programs
        prog_response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert prog_response.status_code == 200
        programs = prog_response.json()
        
        # Get lease rates
        lease_response = api_client.get(f"{BASE_URL}/api/sci/lease-rates?month=3&year=2026")
        assert lease_response.status_code == 200
        lease_data = lease_response.json()
        
        # Check Cherokee 2026 exists in both
        cherokee_prog = [p for p in programs if p['model'] == 'Cherokee' and p['year'] == 2026]
        assert len(cherokee_prog) > 0, "No Cherokee 2026 in programs"
        
        cherokee_lease = [v for v in lease_data.get('vehicles_2026', []) if 'Cherokee' in v.get('model', '')]
        assert len(cherokee_lease) > 0, "No Cherokee in SCI lease rates for 2026"
    
    def test_api_health_check(self, api_client):
        """Verify API is healthy and responsive"""
        # Test multiple endpoints in sequence
        endpoints = [
            f"{BASE_URL}/api/programs?month=3&year=2026",
            f"{BASE_URL}/api/sci/lease-rates",
            f"{BASE_URL}/api/sci/residuals",
            f"{BASE_URL}/api/periods"
        ]
        
        for endpoint in endpoints:
            response = api_client.get(endpoint)
            assert response.status_code == 200, f"Endpoint {endpoint} returned {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
