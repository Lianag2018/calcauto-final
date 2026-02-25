"""
Test suite for CalcAuto AiPro - Residual Guide Upload System
Tests:
1. POST /api/upload-residual-guide - Upload PDF, parse, save JSON, send email
2. Verify JSON file is saved to /app/backend/data/
3. GET /api/sci/vehicle-hierarchy - Verify hierarchy after upload
"""
import pytest
import requests
import os
import json
from pathlib import Path

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://lease-residual-fix.preview.emergentagent.com')
ADMIN_PASSWORD = "Liana2018"
TEST_PDF_PATH = "/app/sci_residual_guide.pdf"

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Accept": "application/json"})
    return session


class TestResidualGuideUpload:
    """Test the residual guide upload endpoint"""
    
    def test_upload_residual_guide_success(self, api_client):
        """Test uploading a valid PDF file returns success with vehicle count"""
        # Skip if PDF doesn't exist
        if not os.path.exists(TEST_PDF_PATH):
            pytest.skip(f"Test PDF not found: {TEST_PDF_PATH}")
        
        url = f"{BASE_URL}/api/upload-residual-guide"
        
        with open(TEST_PDF_PATH, 'rb') as pdf_file:
            files = {'file': ('sci_residual_guide.pdf', pdf_file, 'application/pdf')}
            data = {
                'password': ADMIN_PASSWORD,
                'effective_month': '2',
                'effective_year': '2026'
            }
            
            response = api_client.post(url, files=files, data=data, timeout=120)
        
        # Check status code
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Check response structure
        result = response.json()
        assert result.get('success') == True, f"Expected success=True, got {result}"
        assert 'total_vehicles' in result, f"Missing total_vehicles in response: {result}"
        assert result['total_vehicles'] > 0, f"Expected some vehicles, got {result['total_vehicles']}"
        
        # Check brands breakdown
        assert 'brands' in result, f"Missing brands in response: {result}"
        brands = result['brands']
        assert len(brands) > 0, f"Expected some brands, got {brands}"
        
        # Verify Stellantis brands are present (at least some)
        expected_brands = ['Chrysler', 'Dodge', 'Jeep', 'Ram', 'Fiat']
        found_brands = list(brands.keys())
        assert any(b in found_brands for b in expected_brands), f"Expected at least one Stellantis brand in {found_brands}"
        
        print(f"SUCCESS: Uploaded residual guide - {result['total_vehicles']} vehicles")
        print(f"Brands: {brands}")
        print(f"Email sent: {result.get('email_sent', False)}")
    
    def test_upload_residual_guide_wrong_password(self, api_client):
        """Test upload with wrong password returns 401"""
        if not os.path.exists(TEST_PDF_PATH):
            pytest.skip(f"Test PDF not found: {TEST_PDF_PATH}")
        
        url = f"{BASE_URL}/api/upload-residual-guide"
        
        with open(TEST_PDF_PATH, 'rb') as pdf_file:
            files = {'file': ('sci_residual_guide.pdf', pdf_file, 'application/pdf')}
            data = {
                'password': 'wrong_password',
                'effective_month': '2',
                'effective_year': '2026'
            }
            
            response = api_client.post(url, files=files, data=data, timeout=30)
        
        assert response.status_code == 401, f"Expected 401 for wrong password, got {response.status_code}"
        print("SUCCESS: Wrong password correctly rejected with 401")
    
    def test_upload_residual_guide_missing_password(self, api_client):
        """Test upload without password returns 422"""
        if not os.path.exists(TEST_PDF_PATH):
            pytest.skip(f"Test PDF not found: {TEST_PDF_PATH}")
        
        url = f"{BASE_URL}/api/upload-residual-guide"
        
        with open(TEST_PDF_PATH, 'rb') as pdf_file:
            files = {'file': ('sci_residual_guide.pdf', pdf_file, 'application/pdf')}
            data = {
                'effective_month': '2',
                'effective_year': '2026'
            }
            
            response = api_client.post(url, files=files, data=data, timeout=30)
        
        # 422 = Unprocessable Entity (missing required field)
        assert response.status_code == 422, f"Expected 422 for missing password, got {response.status_code}"
        print("SUCCESS: Missing password correctly rejected with 422")


class TestVehicleHierarchy:
    """Test the vehicle hierarchy endpoint after upload"""
    
    def test_get_vehicle_hierarchy(self, api_client):
        """Test GET /api/sci/vehicle-hierarchy returns valid hierarchy"""
        url = f"{BASE_URL}/api/sci/vehicle-hierarchy"
        response = api_client.get(url, timeout=10)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert 'brands' in result, f"Missing 'brands' key in response: {result.keys()}"
        
        brands = result['brands']
        assert len(brands) > 0, f"Expected some brands, got empty list"
        
        # Each brand should have models
        for brand in brands[:3]:  # Check first 3 brands
            assert 'name' in brand, f"Missing 'name' in brand: {brand}"
            assert 'models' in brand, f"Missing 'models' in brand: {brand}"
            
            # Each model should have model_year and trims
            if brand['models']:
                model = brand['models'][0]
                assert 'model_name' in model or 'name' in model, f"Missing model name in: {model}"
        
        print(f"SUCCESS: Vehicle hierarchy returned {len(brands)} brands")
        brand_names = [b['name'] for b in brands]
        print(f"Brands: {brand_names}")
    
    def test_vehicle_hierarchy_structure(self, api_client):
        """Test that hierarchy has correct nested structure: brand->model->trim->body_style"""
        url = f"{BASE_URL}/api/sci/vehicle-hierarchy"
        response = api_client.get(url, timeout=10)
        
        assert response.status_code == 200
        result = response.json()
        
        # Find a brand with models
        brands = result.get('brands', [])
        assert len(brands) > 0, "No brands found"
        
        brand_with_models = None
        for b in brands:
            if b.get('models') and len(b['models']) > 0:
                brand_with_models = b
                break
        
        assert brand_with_models is not None, "No brand with models found"
        print(f"Testing brand: {brand_with_models['name']}")
        
        # Check model structure
        model = brand_with_models['models'][0]
        model_name = model.get('model_name') or model.get('name', 'Unknown')
        print(f"Testing model: {model_name}")
        
        # Check for trims or years structure
        has_structure = (
            'trims' in model or 
            'years' in model or 
            'body_styles' in model or
            'model_year' in model
        )
        assert has_structure, f"Model lacks expected structure: {model.keys()}"
        print(f"SUCCESS: Model has valid structure with keys: {list(model.keys())}")


class TestVerifyPasswordEndpoint:
    """Test the verify-password endpoint used by import page"""
    
    def test_verify_password_success(self, api_client):
        """Test correct password verification"""
        url = f"{BASE_URL}/api/verify-password"
        
        # The endpoint expects form data
        data = {'password': ADMIN_PASSWORD}
        response = api_client.post(url, data=data, timeout=10)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("SUCCESS: Password verification passed")
    
    def test_verify_password_failure(self, api_client):
        """Test wrong password rejection"""
        url = f"{BASE_URL}/api/verify-password"
        
        data = {'password': 'wrong_password'}
        response = api_client.post(url, data=data, timeout=10)
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("SUCCESS: Wrong password correctly rejected")


class TestJSONFilePersistence:
    """Test that JSON files are correctly saved"""
    
    def test_json_file_exists_after_upload(self):
        """Test that JSON file exists in /app/backend/data/ after upload"""
        data_dir = Path("/app/backend/data")
        
        # Look for any sci_residuals file
        residual_files = list(data_dir.glob("sci_residuals_*.json"))
        assert len(residual_files) > 0, f"No sci_residuals JSON files found in {data_dir}"
        
        # Check latest file
        latest_file = sorted(residual_files)[-1]
        print(f"Found residual file: {latest_file}")
        
        # Verify JSON structure
        with open(latest_file, 'r') as f:
            data = json.load(f)
        
        assert 'vehicles' in data, f"Missing 'vehicles' key in JSON: {data.keys()}"
        assert 'km_adjustments' in data, f"Missing 'km_adjustments' key in JSON"
        
        vehicles = data['vehicles']
        assert len(vehicles) > 0, "No vehicles in JSON file"
        
        # Check vehicle structure
        vehicle = vehicles[0]
        required_fields = ['brand', 'model_year', 'model_name', 'trim', 'body_style', 'residual_percentages']
        for field in required_fields:
            assert field in vehicle, f"Missing '{field}' in vehicle: {vehicle.keys()}"
        
        # Check residual percentages has expected terms
        residuals = vehicle['residual_percentages']
        expected_terms = ['24', '27', '36', '39', '42', '48', '51', '54', '60']
        for term in expected_terms:
            assert term in residuals, f"Missing term '{term}' in residual_percentages"
        
        print(f"SUCCESS: JSON file valid with {len(vehicles)} vehicles")
        print(f"Sample vehicle: {vehicle['brand']} {vehicle['model_name']} {vehicle['trim']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
