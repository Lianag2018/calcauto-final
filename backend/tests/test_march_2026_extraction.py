"""
Test suite for CalcAuto AiPro - March 2026 PDF Extraction
Tests the sync and async extraction endpoints with March 2026 PDF
Validates:
1. Sync extraction returns 93 programs with correct pages 17-19
2. Auto-detect pages returns correct page numbers for March PDF
3. Cherokee 2026 has NO Option 2 rates (option2_rates=None)
4. Grand Cherokee/Grand Cherokee L 2026 has option1_rates with 0.99-4.49 (NOT all 4.99)
5. SCI lease rates: 33 vehicles_2026 + 40 vehicles_2025
6. Cherokee (excluding Base) SCI lease_cash=5250
7. Compass North has consumer_cash=3500 and BOTH option1 and option2 rates
8. Fiat 500e has consumer_cash=7000 and bonus_cash=5000
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://lease-extraction.preview.emergentagent.com')
ADMIN_PASSWORD = "Liana2018"
MARCH_PDF_PATH = "/app/backend/data/march2026_source.pdf"


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestMarchPDFAutoDetect:
    """Test auto_detect_pages for March 2026 PDF"""
    
    def test_scan_pdf_auto_detect_pages(self):
        """Verify auto_detect_pages returns correct page numbers for March PDF"""
        if not os.path.exists(MARCH_PDF_PATH):
            pytest.skip(f"March PDF not found at {MARCH_PDF_PATH}")
        
        with open(MARCH_PDF_PATH, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/scan-pdf",
                files={'file': ('march2026_source.pdf', f, 'application/pdf')},
                data={'password': ADMIN_PASSWORD}
            )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get('success') == True, f"scan-pdf failed: {data}"
        
        # March PDF should detect retail pages 17-19 (data starts after title page 16)
        retail_start = data.get('retail_start')
        retail_end = data.get('retail_end')
        
        assert retail_start == 17, f"Expected retail_start=17, got {retail_start}"
        assert retail_end == 19, f"Expected retail_end=19, got {retail_end}"
        
        # Lease pages should be 25-26
        lease_start = data.get('lease_start')
        lease_end = data.get('lease_end')
        
        assert lease_start == 25, f"Expected lease_start=25, got {lease_start}"
        assert lease_end == 26, f"Expected lease_end=26, got {lease_end}"


class TestMarchPDFSyncExtraction:
    """Test sync extraction endpoint with March 2026 PDF"""
    
    def test_extract_pdf_sync_93_programs(self):
        """POST /api/extract-pdf sync with March PDF returns 93 programs"""
        if not os.path.exists(MARCH_PDF_PATH):
            pytest.skip(f"March PDF not found at {MARCH_PDF_PATH}")
        
        with open(MARCH_PDF_PATH, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/extract-pdf",
                files={'file': ('march2026_source.pdf', f, 'application/pdf')},
                data={
                    'password': ADMIN_PASSWORD,
                    'program_month': '3',
                    'program_year': '2026',
                    'start_page': '17',
                    'end_page': '19',
                    'lease_start_page': '25',
                    'lease_end_page': '26'
                }
            )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:500]}"
        data = response.json()
        
        assert data.get('success') == True, f"Extraction failed: {data}"
        
        programs = data.get('programs', [])
        assert len(programs) == 93, f"Expected 93 programs, got {len(programs)}"
        
        # Verify message contains program count
        message = data.get('message', '')
        assert '93' in message, f"Expected '93' in message: {message}"


class TestMarchPDFAsyncExtraction:
    """Test async extraction endpoint with March 2026 PDF"""
    
    def test_extract_pdf_async_queues_correctly(self):
        """POST /api/extract-pdf-async auto-detects pages and queues extraction"""
        if not os.path.exists(MARCH_PDF_PATH):
            pytest.skip(f"March PDF not found at {MARCH_PDF_PATH}")
        
        with open(MARCH_PDF_PATH, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/extract-pdf-async",
                files={'file': ('march2026_source.pdf', f, 'application/pdf')},
                data={
                    'password': ADMIN_PASSWORD,
                    'program_month': '3',
                    'program_year': '2026'
                }
            )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Should return task_id
        task_id = data.get('task_id')
        assert task_id is not None, f"Expected task_id, got {data}"
        
        # Poll for completion (max 60 seconds)
        max_wait = 60
        wait_interval = 5
        elapsed = 0
        final_status = None
        
        while elapsed < max_wait:
            status_response = requests.get(f"{BASE_URL}/api/extract-task/{task_id}")
            if status_response.status_code == 200:
                status_data = status_response.json()
                final_status = status_data.get('status')
                if final_status == 'complete':
                    programs = status_data.get('programs', [])
                    assert len(programs) == 93, f"Expected 93 programs, got {len(programs)}"
                    break
                elif final_status == 'error':
                    pytest.fail(f"Extraction task failed: {status_data.get('message')}")
            
            time.sleep(wait_interval)
            elapsed += wait_interval
        
        assert final_status == 'complete', f"Task did not complete in {max_wait}s, final status: {final_status}"


class TestCherokee2026NoOption2:
    """Test Cherokee 2026 has NO Option 2 rates"""
    
    def test_cherokee_2026_option2_is_none(self, api_client):
        """Cherokee 2026 must have option2_rates=None (NO Option 2)"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        
        # Find all Cherokee 2026 entries (not Grand Cherokee)
        cherokee_2026 = [
            p for p in data 
            if p['model'] == 'Cherokee' and p['year'] == 2026
        ]
        
        assert len(cherokee_2026) >= 2, f"Expected at least 2 Cherokee 2026 entries, got {len(cherokee_2026)}"
        
        # ALL Cherokee 2026 entries must have option2_rates=None
        for p in cherokee_2026:
            option2 = p.get('option2_rates')
            assert option2 is None, f"Cherokee 2026 '{p.get('trim')}' should have option2_rates=None, got {option2}"
            
            # Verify option1 exists with 4.99% rates
            option1 = p.get('option1_rates')
            assert option1 is not None, f"Cherokee 2026 '{p.get('trim')}' missing option1_rates"
            assert option1.get('rate_36') == 4.99, f"Cherokee 2026 rate_36 should be 4.99"


class TestGrandCherokee2026Rates:
    """Test Grand Cherokee/Grand Cherokee L 2026 has correct Option 1 rates"""
    
    def test_grand_cherokee_2026_variable_rates(self, api_client):
        """Grand Cherokee/Grand Cherokee L 2026 must have option1_rates 0.99-4.49 (NOT all 4.99)"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        
        # Find Grand Cherokee/Grand Cherokee L 2026 entries
        grand_cherokee_2026 = [
            p for p in data 
            if 'Grand Cherokee' in p['model'] and p['year'] == 2026
        ]
        
        assert len(grand_cherokee_2026) >= 1, f"No Grand Cherokee 2026 entries found"
        
        # Check each Grand Cherokee 2026 entry for variable rates (not all 4.99)
        for p in grand_cherokee_2026:
            option1 = p.get('option1_rates')
            assert option1 is not None, f"Grand Cherokee 2026 '{p.get('trim')}' missing option1_rates"
            
            # Should have variable rates like: 0.99, 1.99, 2.99, 3.49, 3.99, 4.49
            # NOT all 4.99
            rates = [
                option1.get('rate_36'),
                option1.get('rate_48'),
                option1.get('rate_60'),
                option1.get('rate_72'),
                option1.get('rate_84'),
                option1.get('rate_96')
            ]
            
            # Filter out None values
            valid_rates = [r for r in rates if r is not None]
            
            # Check that not all rates are 4.99
            all_499 = all(r == 4.99 for r in valid_rates)
            assert not all_499, f"Grand Cherokee 2026 '{p.get('trim')}' should NOT have all 4.99 rates, got {option1}"
            
            # rate_36 should be around 0.99 or 1.99 (lower than 4.99)
            rate_36 = option1.get('rate_36')
            if rate_36 is not None:
                assert rate_36 <= 4.99, f"Grand Cherokee 2026 rate_36 should be <= 4.99, got {rate_36}"


class TestCompassNorth:
    """Test Compass North has consumer_cash=3500 and BOTH option1 and option2 rates"""
    
    def test_compass_north_cash_and_rates(self, api_client):
        """Compass North should have consumer_cash=3500 and both option1 and option2"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        
        # Find Compass North 2026
        compass_north = None
        for p in data:
            if p['model'] == 'Compass' and p['year'] == 2026:
                trim = (p.get('trim') or '').lower()
                if 'north' in trim and 'altitude' not in trim:
                    compass_north = p
                    break
        
        assert compass_north is not None, "Compass North 2026 not found"
        
        # Verify consumer_cash = 3500
        consumer_cash = compass_north.get('consumer_cash', 0)
        assert consumer_cash == 3500, f"Expected consumer_cash=3500, got {consumer_cash}"
        
        # Verify option1_rates exists
        option1 = compass_north.get('option1_rates')
        assert option1 is not None, f"Compass North missing option1_rates"
        
        # Verify option2_rates exists
        option2 = compass_north.get('option2_rates')
        assert option2 is not None, f"Compass North should have option2_rates, got None"


class TestFiat500e:
    """Test Fiat 500e entries"""
    
    def test_fiat_500e_2026_consumer_cash(self, api_client):
        """Fiat 500e 2026 should have consumer_cash=7000"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        
        # Find Fiat 500e 2026
        fiat_500e_2026 = None
        for p in data:
            if p['brand'] == 'Fiat' and '500' in p['model'] and p['year'] == 2026:
                fiat_500e_2026 = p
                break
        
        assert fiat_500e_2026 is not None, "Fiat 500e 2026 not found"
        
        # Verify consumer_cash = 7000
        consumer_cash = fiat_500e_2026.get('consumer_cash', 0)
        assert consumer_cash == 7000, f"Expected consumer_cash=7000, got {consumer_cash}"
    
    def test_fiat_500e_2025_bonus_cash(self, api_client):
        """Fiat 500e 2025 should have bonus_cash=5000"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        
        # Find Fiat 500e 2025
        fiat_500e_2025 = None
        for p in data:
            if p['brand'] == 'Fiat' and '500' in p['model'] and p['year'] == 2025:
                fiat_500e_2025 = p
                break
        
        assert fiat_500e_2025 is not None, "Fiat 500e 2025 not found"
        
        # Verify bonus_cash = 5000 (from Bonus Cash Program page)
        bonus_cash = fiat_500e_2025.get('bonus_cash', 0)
        assert bonus_cash == 5000, f"Expected bonus_cash=5000, got {bonus_cash}"


class TestSCILeaseRatesMarch:
    """Test SCI lease rates for March 2026"""
    
    def test_sci_lease_vehicle_counts(self, api_client):
        """Verify SCI lease rates: 33 vehicles_2026 + 40 vehicles_2025"""
        response = api_client.get(f"{BASE_URL}/api/sci/lease-rates?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        
        v2026 = data.get('vehicles_2026', [])
        v2025 = data.get('vehicles_2025', [])
        
        assert len(v2026) == 33, f"Expected 33 vehicles_2026, got {len(v2026)}"
        assert len(v2025) == 40, f"Expected 40 vehicles_2025, got {len(v2025)}"
    
    def test_cherokee_excluding_base_lease_cash(self, api_client):
        """Cherokee (excluding Base) SCI lease_cash should be 5250"""
        response = api_client.get(f"{BASE_URL}/api/sci/lease-rates?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        v2026 = data.get('vehicles_2026', [])
        
        # Find Cherokee (excluding Base)
        cherokee_excl = None
        for v in v2026:
            model = v.get('model', '')
            if 'Cherokee' in model and 'excluding Base' in model:
                cherokee_excl = v
                break
        
        assert cherokee_excl is not None, "Cherokee (excluding Base) not found in SCI lease rates"
        
        lease_cash = cherokee_excl.get('lease_cash', 0)
        assert lease_cash == 5250, f"Expected lease_cash=5250, got {lease_cash}"


class TestProgramsCount:
    """Test that March 2026 has exactly 93 programs in database"""
    
    def test_programs_count_93(self, api_client):
        """GET /api/programs?month=3&year=2026 should return 93 programs"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) == 93, f"Expected 93 programs, got {len(data)}"
    
    def test_all_brands_present(self, api_client):
        """All 5 brands should be present"""
        response = api_client.get(f"{BASE_URL}/api/programs?month=3&year=2026")
        assert response.status_code == 200
        
        data = response.json()
        brands = set(p['brand'] for p in data)
        
        expected = {'Chrysler', 'Dodge', 'Fiat', 'Jeep', 'Ram'}
        assert brands == expected, f"Expected {expected}, got {brands}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
