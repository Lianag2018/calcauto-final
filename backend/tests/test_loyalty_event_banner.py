"""
Test suite for Event Banner and Loyalty Rate functionality
Tests the /api/program-meta endpoint and verifies loyalty rate behavior
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestProgramMetaEndpoint:
    """Tests for GET /api/program-meta endpoint"""
    
    def test_march_2026_returns_month_of_ram_event(self):
        """March 2026 should return 'Month of Ram' event with loyalty_rate=0.5"""
        response = requests.get(f"{BASE_URL}/api/program-meta", params={"month": 3, "year": 2026})
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify event name
        assert "event_names" in data
        assert len(data["event_names"]) > 0
        assert "Month of Ram" in data["event_names"]
        
        # Verify loyalty rate
        assert "loyalty_rate" in data
        assert data["loyalty_rate"] == 0.5
        
        # Verify other metadata
        assert data["program_month"] == "March"
        assert data["program_year"] == 2026
        assert "program_period" in data
        assert "March" in data["program_period"]
        
        print(f"SUCCESS: March 2026 - Event: {data['event_names']}, Loyalty Rate: {data['loyalty_rate']}")
    
    def test_february_2026_returns_4x4_event_no_loyalty(self):
        """February 2026 should return '4X4 Winter Event' with loyalty_rate=0.0"""
        response = requests.get(f"{BASE_URL}/api/program-meta", params={"month": 2, "year": 2026})
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify event name
        assert "event_names" in data
        assert len(data["event_names"]) > 0
        assert "4X4 Winter Event" in data["event_names"]
        
        # Verify NO loyalty rate
        assert "loyalty_rate" in data
        assert data["loyalty_rate"] == 0.0  # Should be 0 for February
        
        # Verify other metadata
        assert data["program_month"] == "February"
        assert data["program_year"] == 2026
        
        print(f"SUCCESS: February 2026 - Event: {data['event_names']}, Loyalty Rate: {data['loyalty_rate']}")
    
    def test_march_2026_has_no_payments_days(self):
        """March 2026 should have 90 no-payment days"""
        response = requests.get(f"{BASE_URL}/api/program-meta", params={"month": 3, "year": 2026})
        
        assert response.status_code == 200
        data = response.json()
        
        assert "no_payments_days" in data
        assert data["no_payments_days"] == 90
        
        print(f"SUCCESS: No payment days: {data['no_payments_days']}")
    
    def test_march_2026_has_featured_rate(self):
        """March 2026 should have featured rate and term"""
        response = requests.get(f"{BASE_URL}/api/program-meta", params={"month": 3, "year": 2026})
        
        assert response.status_code == 200
        data = response.json()
        
        assert "featured_rate" in data
        assert data["featured_rate"] == 0.0  # 0% rate
        
        assert "featured_term" in data
        assert data["featured_term"] == 72  # 72 months
        
        print(f"SUCCESS: Featured rate: {data['featured_rate']}% / {data['featured_term']} months")
    
    def test_auto_detect_latest_period(self):
        """Without month/year params, should return latest available metadata"""
        response = requests.get(f"{BASE_URL}/api/program-meta")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return some valid metadata (latest available)
        assert "event_names" in data or "program_month" in data
        
        print(f"SUCCESS: Auto-detected period - Month: {data.get('program_month')}")


class TestProgramMetaDataStructure:
    """Tests for correct data structure of program metadata"""
    
    def test_march_2026_complete_structure(self):
        """Verify complete data structure for March 2026 metadata"""
        response = requests.get(f"{BASE_URL}/api/program-meta", params={"month": 3, "year": 2026})
        
        assert response.status_code == 200
        data = response.json()
        
        # All required fields
        required_fields = [
            "event_names",
            "program_period", 
            "program_month",
            "loyalty_rate",
            "no_payments_days",
            "featured_rate",
            "featured_term",
            "key_message"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Type checks
        assert isinstance(data["event_names"], list)
        assert isinstance(data["loyalty_rate"], (int, float))
        assert isinstance(data["no_payments_days"], int)
        
        print(f"SUCCESS: All required fields present and correct types")
    
    def test_february_2026_loyalty_toggle_behavior(self):
        """Verify February 2026 should NOT show loyalty toggle (rate=0)"""
        response = requests.get(f"{BASE_URL}/api/program-meta", params={"month": 2, "year": 2026})
        
        assert response.status_code == 200
        data = response.json()
        
        # Frontend logic: hasLoyalty = meta.loyalty_rate > 0
        # With loyalty_rate=0, toggle should not appear
        assert data["loyalty_rate"] == 0.0
        
        # This means hasLoyalty = (0.0 > 0) = False
        # So the loyalty toggle checkbox should NOT be rendered
        
        print(f"SUCCESS: February loyalty_rate={data['loyalty_rate']} - toggle should be hidden")
    
    def test_march_2026_loyalty_toggle_behavior(self):
        """Verify March 2026 SHOULD show loyalty toggle (rate=0.5)"""
        response = requests.get(f"{BASE_URL}/api/program-meta", params={"month": 3, "year": 2026})
        
        assert response.status_code == 200
        data = response.json()
        
        # Frontend logic: hasLoyalty = meta.loyalty_rate > 0
        # With loyalty_rate=0.5, toggle should appear
        assert data["loyalty_rate"] == 0.5
        
        # This means hasLoyalty = (0.5 > 0) = True
        # So the loyalty toggle checkbox SHOULD be rendered
        
        print(f"SUCCESS: March loyalty_rate={data['loyalty_rate']} - toggle should be visible")


class TestProgramsEndpoint:
    """Tests for /api/programs endpoint to verify vehicle data loads"""
    
    def test_programs_returns_vehicles(self):
        """Verify programs endpoint returns vehicle list"""
        response = requests.get(f"{BASE_URL}/api/programs")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) > 0
        
        print(f"SUCCESS: {len(data)} programs returned")
    
    def test_ram_1500_big_horn_exists(self):
        """Verify Ram 1500 Big Horn vehicle exists in programs"""
        response = requests.get(f"{BASE_URL}/api/programs")
        
        assert response.status_code == 200
        data = response.json()
        
        # Find Ram 1500 Big Horn
        ram_big_horn = None
        for prog in data:
            if prog.get("brand") == "Ram" and prog.get("model") == "1500" and "Big Horn" in str(prog.get("trim", "")):
                ram_big_horn = prog
                break
        
        assert ram_big_horn is not None, "Ram 1500 Big Horn not found in programs"
        
        # Verify it has required data
        assert "option1_rates" in ram_big_horn
        assert "consumer_cash" in ram_big_horn
        
        print(f"SUCCESS: Ram 1500 Big Horn found - Consumer Cash: ${ram_big_horn.get('consumer_cash', 0)}")


# Fixtures
@pytest.fixture(scope="module", autouse=True)
def setup_base_url():
    """Ensure BASE_URL is set"""
    global BASE_URL
    if not BASE_URL:
        BASE_URL = "https://stellantis-calc.preview.emergentagent.com"
    print(f"\nUsing BASE_URL: {BASE_URL}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
