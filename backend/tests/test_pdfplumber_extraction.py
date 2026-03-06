"""
Backend tests for pdfplumber PDF extraction and API endpoints
Tests the deterministic parser replacing AI-based PDF extraction
"""
import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://toc-extraction-fix.preview.emergentagent.com').rstrip('/')


class TestRetailProgramsAPI:
    """Test GET /api/programs endpoint for March 2026 retail programs"""
    
    def test_programs_endpoint_returns_data(self):
        """Test that programs endpoint returns data for March 2026"""
        response = requests.get(f"{BASE_URL}/api/programs", params={"program_month": 3, "program_year": 2026})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: Programs endpoint returned {len(data)} programs")
        
    def test_programs_count_at_least_81(self):
        """Test that at least 81 programs are returned (requirement)"""
        response = requests.get(f"{BASE_URL}/api/programs", params={"program_month": 3, "program_year": 2026})
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 81, f"Expected at least 81 programs, got {len(data)}"
        print(f"PASS: {len(data)} programs (>=81 required)")
        
    def test_programs_have_required_fields(self):
        """Test that programs have all required fields"""
        response = requests.get(f"{BASE_URL}/api/programs", params={"program_month": 3, "program_year": 2026})
        data = response.json()
        required_fields = ['brand', 'model', 'trim', 'year', 'consumer_cash', 'bonus_cash', 'option1_rates', 'option2_rates']
        
        for prog in data[:5]:  # Check first 5 programs
            for field in required_fields:
                assert field in prog, f"Missing field '{field}' in program {prog.get('brand')} {prog.get('model')}"
        print("PASS: All required fields present in programs")
        
    def test_fiat_500e_bev_2025_data(self):
        """Verify Fiat 500e BEV (2025) has bonus_cash=$5000 and consumer_cash=$6000"""
        response = requests.get(f"{BASE_URL}/api/programs", params={"program_month": 3, "program_year": 2026})
        data = response.json()
        
        fiat_500e = None
        for prog in data:
            if prog.get('brand') == 'Fiat' and '500e' in prog.get('model', '') and prog.get('year') == 2025:
                fiat_500e = prog
                break
        
        assert fiat_500e is not None, "Fiat 500e BEV 2025 not found"
        assert fiat_500e.get('bonus_cash') == 5000, f"Expected bonus_cash=5000, got {fiat_500e.get('bonus_cash')}"
        assert fiat_500e.get('consumer_cash') == 6000, f"Expected consumer_cash=6000, got {fiat_500e.get('consumer_cash')}"
        print(f"PASS: Fiat 500e BEV 2025 - bonus_cash=${fiat_500e.get('bonus_cash')}, consumer_cash=${fiat_500e.get('consumer_cash')}")
        
    def test_ram_1500_laramie_dt6p98_2026(self):
        """Verify Ram 1500 Laramie (DT6P98) 2026 has consumer_cash=0, option1_rates all null, option2_rates with valid rates"""
        response = requests.get(f"{BASE_URL}/api/programs", params={"program_month": 3, "program_year": 2026})
        data = response.json()
        
        ram_laramie = None
        for prog in data:
            if (prog.get('brand') == 'Ram' and 
                prog.get('model') == '1500' and 
                'DT6P98' in (prog.get('trim') or '') and 
                prog.get('year') == 2026):
                ram_laramie = prog
                break
        
        assert ram_laramie is not None, "Ram 1500 Laramie (DT6P98) 2026 not found"
        assert ram_laramie.get('consumer_cash') == 0, f"Expected consumer_cash=0, got {ram_laramie.get('consumer_cash')}"
        
        # Option 1 rates should all be null
        opt1 = ram_laramie.get('option1_rates') or {}
        for term in ['rate_36', 'rate_48', 'rate_60', 'rate_72', 'rate_84', 'rate_96']:
            assert opt1.get(term) is None, f"Expected {term}=None in option1_rates, got {opt1.get(term)}"
        
        # Option 2 rates should have valid values
        opt2 = ram_laramie.get('option2_rates')
        assert opt2 is not None, "option2_rates should not be None"
        print(f"PASS: Ram 1500 Laramie (DT6P98) 2026 - consumer_cash=0, option1_rates all null, option2_rates has rates")
        
    def test_dodge_durango_srt_hellcat_2026(self):
        """Verify Dodge Durango SRT Hellcat 2026 has consumer_cash=$15,500"""
        response = requests.get(f"{BASE_URL}/api/programs", params={"program_month": 3, "program_year": 2026})
        data = response.json()
        
        durango_hellcat = None
        for prog in data:
            if (prog.get('brand') == 'Dodge' and 
                'Durango' in prog.get('model', '') and 
                'Hellcat' in (prog.get('trim') or '') and 
                prog.get('year') == 2026):
                durango_hellcat = prog
                break
        
        assert durango_hellcat is not None, "Dodge Durango SRT Hellcat 2026 not found"
        assert durango_hellcat.get('consumer_cash') == 15500, f"Expected consumer_cash=15500, got {durango_hellcat.get('consumer_cash')}"
        print(f"PASS: Dodge Durango SRT Hellcat 2026 - consumer_cash=${durango_hellcat.get('consumer_cash')}")
        
    def test_jeep_compass_limited_2026(self):
        """Verify Jeep Compass Limited 2026 has no option1_rates (all null) but has option2_rates"""
        response = requests.get(f"{BASE_URL}/api/programs", params={"program_month": 3, "program_year": 2026})
        data = response.json()
        
        compass_limited = None
        for prog in data:
            if (prog.get('brand') == 'Jeep' and 
                'Compass' in prog.get('model', '') and 
                prog.get('trim') == 'Limited' and 
                prog.get('year') == 2026):
                compass_limited = prog
                break
        
        assert compass_limited is not None, "Jeep Compass Limited 2026 not found"
        
        # Option 1 rates should all be null
        opt1 = compass_limited.get('option1_rates') or {}
        all_null = all(opt1.get(term) is None for term in ['rate_36', 'rate_48', 'rate_60', 'rate_72', 'rate_84', 'rate_96'])
        assert all_null, f"Expected all option1_rates to be null, got {opt1}"
        
        # Option 2 rates should exist
        opt2 = compass_limited.get('option2_rates')
        assert opt2 is not None, "option2_rates should exist"
        print(f"PASS: Jeep Compass Limited 2026 - option1_rates all null, option2_rates has rates")


class TestSCILeaseAPI:
    """Test GET /api/sci/lease-rates endpoint for March 2026 SCI Lease data"""
    
    def test_sci_lease_endpoint_returns_data(self):
        """Test that SCI lease endpoint returns data for March 2026"""
        response = requests.get(f"{BASE_URL}/api/sci/lease-rates", params={"month": 3, "year": 2026})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert 'vehicles_2026' in data, "Response should have vehicles_2026"
        assert 'vehicles_2025' in data, "Response should have vehicles_2025"
        print(f"PASS: SCI lease endpoint returned data with both 2026 and 2025 vehicles")
        
    def test_sci_lease_vehicle_count(self):
        """Test that SCI lease has at least 74 vehicles total"""
        response = requests.get(f"{BASE_URL}/api/sci/lease-rates", params={"month": 3, "year": 2026})
        data = response.json()
        
        v2026 = len(data.get('vehicles_2026', []))
        v2025 = len(data.get('vehicles_2025', []))
        total = v2026 + v2025
        
        assert total >= 74, f"Expected at least 74 vehicles, got {total}"
        print(f"PASS: SCI Lease total vehicles: {total} (2026:{v2026}, 2025:{v2025})")
        
    def test_sci_lease_vehicle_structure(self):
        """Test that SCI lease vehicles have correct structure"""
        response = requests.get(f"{BASE_URL}/api/sci/lease-rates", params={"month": 3, "year": 2026})
        data = response.json()
        
        # Check first vehicle from 2026
        vehicles_2026 = data.get('vehicles_2026', [])
        if vehicles_2026:
            v = vehicles_2026[0]
            assert 'model' in v, "Vehicle should have 'model'"
            assert 'brand' in v, "Vehicle should have 'brand'"
            assert 'lease_cash' in v, "Vehicle should have 'lease_cash'"
            print(f"PASS: SCI lease vehicle structure correct")


class TestDataFilesExist:
    """Test that data files were created correctly"""
    
    def test_key_incentives_file_exists(self):
        """Verify key_incentives_mar2026.json file was created"""
        filepath = '/app/backend/data/key_incentives_mar2026.json'
        assert os.path.exists(filepath), f"File not found: {filepath}"
        
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        assert isinstance(data, list), "key_incentives should be a list"
        assert len(data) > 0, "key_incentives should not be empty"
        print(f"PASS: key_incentives_mar2026.json exists with {len(data)} entries")
        
    def test_sci_lease_rates_file_exists(self):
        """Verify sci_lease_rates_mar2026.json was created with correct structure"""
        filepath = '/app/backend/data/sci_lease_rates_mar2026.json'
        assert os.path.exists(filepath), f"File not found: {filepath}"
        
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        assert 'vehicles_2026' in data, "File should have vehicles_2026"
        assert 'vehicles_2025' in data, "File should have vehicles_2025"
        assert 'program_period' in data, "File should have program_period"
        print(f"PASS: sci_lease_rates_mar2026.json exists with correct structure")


class TestAsyncExtractionEndpoints:
    """Test async PDF extraction endpoints"""
    
    def test_extract_task_endpoint_exists(self):
        """Test that GET /api/extract-task/{task_id} returns 404 for non-existent task"""
        response = requests.get(f"{BASE_URL}/api/extract-task/non-existent-task-id")
        # Should return 404 for non-existent task
        assert response.status_code == 404, f"Expected 404 for non-existent task, got {response.status_code}"
        print("PASS: extract-task endpoint exists and returns 404 for missing task")
        
    def test_verify_password_endpoint(self):
        """Test password verification endpoint"""
        response = requests.post(f"{BASE_URL}/api/verify-password", data={"password": "Liana2018"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get('success') == True, "Password verification should succeed"
        print("PASS: verify-password endpoint works")
        
    def test_verify_password_wrong(self):
        """Test password verification with wrong password"""
        response = requests.post(f"{BASE_URL}/api/verify-password", data={"password": "wrong"})
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: verify-password rejects wrong password")


class TestSpecificVehicleData:
    """Additional specific vehicle data tests"""
    
    def test_all_brands_present(self):
        """Verify all expected brands are present in programs"""
        response = requests.get(f"{BASE_URL}/api/programs", params={"program_month": 3, "program_year": 2026})
        data = response.json()
        
        brands = set(prog.get('brand') for prog in data)
        expected_brands = {'Chrysler', 'Jeep', 'Dodge', 'Ram', 'Fiat'}
        
        for brand in expected_brands:
            assert brand in brands, f"Brand '{brand}' not found in programs"
        print(f"PASS: All expected brands present: {brands}")
        
    def test_both_years_present(self):
        """Verify both 2025 and 2026 model years are present"""
        response = requests.get(f"{BASE_URL}/api/programs", params={"program_month": 3, "program_year": 2026})
        data = response.json()
        
        years = set(prog.get('year') for prog in data)
        assert 2025 in years, "2025 model year not found"
        assert 2026 in years, "2026 model year not found"
        print(f"PASS: Both model years present: {years}")
        
    def test_option_rates_structure(self):
        """Verify option rates have correct structure (rate_36 through rate_96)"""
        response = requests.get(f"{BASE_URL}/api/programs", params={"program_month": 3, "program_year": 2026})
        data = response.json()
        
        rate_keys = ['rate_36', 'rate_48', 'rate_60', 'rate_72', 'rate_84', 'rate_96']
        
        for prog in data:
            opt1 = prog.get('option1_rates')
            if opt1:
                for key in rate_keys:
                    assert key in opt1, f"Missing {key} in option1_rates for {prog.get('brand')} {prog.get('model')}"
                    
            opt2 = prog.get('option2_rates')
            if opt2:
                for key in rate_keys:
                    assert key in opt2, f"Missing {key} in option2_rates for {prog.get('brand')} {prog.get('model')}"
        print("PASS: Option rates have correct structure")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
