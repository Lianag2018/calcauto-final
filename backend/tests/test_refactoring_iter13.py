"""
Backend API Tests for CalcAuto AiPro - Refactoring Verification (Iteration 13)

This test suite verifies that all API endpoints work correctly after the major
backend refactoring from a monolithic 7315-line server.py to modular router files.

Tests cover:
- Root endpoints (/api/, /api/ping)
- Auth endpoints (/api/auth/login)
- Programs endpoints (/api/programs, /api/periods)
- SCI endpoints (/api/sci/residuals, /api/sci/lease-rates, /api/sci/vehicle-hierarchy)
- Authenticated endpoints (/api/contacts, /api/inventory, /api/submissions)
- Product codes (/api/product-codes)
"""

import pytest
import requests
import os

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "danielgiroux007@gmail.com"
TEST_PASSWORD = "Liana2018$"


class TestRootEndpoints:
    """Test root-level API endpoints"""
    
    def test_root_endpoint(self):
        """GET /api/ should return API version message"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Vehicle Financing Calculator API" in data["message"]
        print(f"✓ Root endpoint returns: {data['message']}")
    
    def test_ping_endpoint(self):
        """GET /api/ping should return status ok"""
        response = requests.get(f"{BASE_URL}/api/ping")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        print(f"✓ Ping endpoint status: {data['status']}")
    
    def test_ping_head_method(self):
        """HEAD /api/ping should return 200 (keep-alive check)"""
        response = requests.head(f"{BASE_URL}/api/ping")
        assert response.status_code == 200
        print("✓ Ping HEAD method works")


class TestAuthEndpoints:
    """Test authentication endpoints"""
    
    def test_login_success(self):
        """POST /api/auth/login with valid credentials should return token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] == True
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL.lower()
        print(f"✓ Login successful, token: {data['token'][:20]}...")
    
    def test_login_invalid_credentials(self):
        """POST /api/auth/login with invalid credentials should return 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "wrong@example.com", "password": "wrongpass"}
        )
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected with 401")
    
    def test_login_missing_fields(self):
        """POST /api/auth/login with missing fields should return 422"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "test@example.com"}  # Missing password
        )
        assert response.status_code == 422
        print("✓ Missing password correctly rejected with 422")


class TestProgramsEndpoints:
    """Test programs-related endpoints"""
    
    def test_get_periods(self):
        """GET /api/periods should return array of periods"""
        response = requests.get(f"{BASE_URL}/api/periods")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert "month" in data[0]
            assert "year" in data[0]
            assert "count" in data[0]
            print(f"✓ Periods endpoint returns {len(data)} periods")
        else:
            print("✓ Periods endpoint returns empty list (no data)")
    
    def test_get_programs(self):
        """GET /api/programs should return array of programs"""
        response = requests.get(f"{BASE_URL}/api/programs")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert "brand" in data[0]
            assert "model" in data[0]
            assert "year" in data[0]
            print(f"✓ Programs endpoint returns {len(data)} programs")
        else:
            print("✓ Programs endpoint returns empty list")
    
    def test_get_programs_with_filter(self):
        """GET /api/programs?month=2&year=2026 should filter by period"""
        response = requests.get(f"{BASE_URL}/api/programs", params={"month": 2, "year": 2026})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Programs with filter returns {len(data)} programs")


class TestSCIEndpoints:
    """Test SCI (Stellantis Credit Insurance) endpoints"""
    
    def test_get_residuals(self):
        """GET /api/sci/residuals should return vehicles with residual data"""
        response = requests.get(f"{BASE_URL}/api/sci/residuals")
        assert response.status_code == 200
        data = response.json()
        assert "vehicles" in data
        assert isinstance(data["vehicles"], list)
        assert len(data["vehicles"]) > 0
        
        # Verify vehicle structure
        vehicle = data["vehicles"][0]
        assert "brand" in vehicle
        assert "model_name" in vehicle
        assert "residual_percentages" in vehicle
        print(f"✓ SCI residuals returns {len(data['vehicles'])} vehicles")
    
    def test_get_lease_rates(self):
        """GET /api/sci/lease-rates should return lease rate data"""
        response = requests.get(f"{BASE_URL}/api/sci/lease-rates")
        assert response.status_code == 200
        data = response.json()
        assert "vehicles_2025" in data or "vehicles_2026" in data
        print(f"✓ SCI lease rates returns data with keys: {list(data.keys())}")
    
    def test_get_vehicle_hierarchy(self):
        """GET /api/sci/vehicle-hierarchy should return brand/model/trim hierarchy"""
        response = requests.get(f"{BASE_URL}/api/sci/vehicle-hierarchy")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        # Should have brand names as keys
        expected_brands = ["Chrysler", "Dodge", "Jeep", "Ram"]
        for brand in expected_brands:
            if brand in data:
                print(f"  - {brand}: {len(data[brand])} models")
        print(f"✓ Vehicle hierarchy returns {len(data)} brands")


class TestAuthenticatedEndpoints:
    """Test endpoints that require authentication"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Get auth token before each test"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate - skipping auth tests")
    
    def test_get_contacts(self):
        """GET /api/contacts should return user's contacts"""
        response = requests.get(f"{BASE_URL}/api/contacts", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Contacts endpoint returns {len(data)} contacts")
    
    def test_get_contacts_unauthorized(self):
        """GET /api/contacts without auth should return 401"""
        response = requests.get(f"{BASE_URL}/api/contacts")
        assert response.status_code == 401
        print("✓ Contacts endpoint correctly requires auth (401)")
    
    def test_get_inventory(self):
        """GET /api/inventory should return user's inventory"""
        response = requests.get(f"{BASE_URL}/api/inventory", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Inventory endpoint returns {len(data)} vehicles")
    
    def test_get_inventory_unauthorized(self):
        """GET /api/inventory without auth should return 401"""
        response = requests.get(f"{BASE_URL}/api/inventory")
        assert response.status_code == 401
        print("✓ Inventory endpoint correctly requires auth (401)")
    
    def test_get_submissions(self):
        """GET /api/submissions should return user's submissions"""
        response = requests.get(f"{BASE_URL}/api/submissions", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Submissions endpoint returns {len(data)} submissions")
    
    def test_get_submissions_unauthorized(self):
        """GET /api/submissions without auth should return 401"""
        response = requests.get(f"{BASE_URL}/api/submissions")
        assert response.status_code == 401
        print("✓ Submissions endpoint correctly requires auth (401)")
    
    def test_get_reminders(self):
        """GET /api/submissions/reminders should return reminder data"""
        response = requests.get(f"{BASE_URL}/api/submissions/reminders", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "due" in data
        assert "upcoming" in data
        print(f"✓ Reminders: {data['due_count']} due, {data['upcoming_count']} upcoming")


class TestProductCodes:
    """Test product codes endpoints"""
    
    def test_get_product_codes(self):
        """GET /api/product-codes should return product codes"""
        response = requests.get(f"{BASE_URL}/api/product-codes")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert "code" in data[0]
        print(f"✓ Product codes endpoint returns {len(data)} codes")


class TestInventoryStats:
    """Test inventory statistics endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Get auth token before each test"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
    
    def test_inventory_stats_summary(self):
        """GET /api/inventory/stats/summary should return stats"""
        response = requests.get(f"{BASE_URL}/api/inventory/stats/summary", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "disponible" in data
        print(f"✓ Inventory stats: {data['total']} total, {data['disponible']} available")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
