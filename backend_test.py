#!/usr/bin/env python3
"""
CalcAuto AiPro Backend API Testing Suite
Tests the deployed API on Render: https://calcauto-aipro.onrender.com
"""

import requests
import json
import sys
from typing import Dict, List, Any, Optional

# Backend URL from the review request
BACKEND_URL = "https://calcauto-aipro.onrender.com"

class APITester:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.timeout = 30
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, message: str, details: Optional[Dict] = None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "details": details or {}
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def test_health_check(self):
        """Test GET /api/ping"""
        try:
            response = self.session.get(f"{self.base_url}/api/ping")
            
            if response.status_code != 200:
                self.log_test("Health Check", False, f"Expected 200, got {response.status_code}", 
                            {"status_code": response.status_code, "response": response.text})
                return False
            
            data = response.json()
            if data.get("status") != "ok":
                self.log_test("Health Check", False, f"Expected status 'ok', got {data.get('status')}", 
                            {"response": data})
                return False
            
            self.log_test("Health Check", True, "API is responding correctly")
            return True
            
        except Exception as e:
            self.log_test("Health Check", False, f"Request failed: {str(e)}")
            return False
    
    def test_get_programs(self):
        """Test GET /api/programs"""
        try:
            response = self.session.get(f"{self.base_url}/api/programs")
            
            if response.status_code != 200:
                self.log_test("Get Programs", False, f"Expected 200, got {response.status_code}", 
                            {"status_code": response.status_code, "response": response.text})
                return False
            
            data = response.json()
            if not isinstance(data, list):
                self.log_test("Get Programs", False, "Expected array response", 
                            {"response_type": type(data).__name__})
                return False
            
            if len(data) == 0:
                self.log_test("Get Programs", False, "No programs returned")
                return False
            
            # Validate program structure
            required_fields = ["brand", "model", "year", "consumer_cash", "bonus_cash", "option1_rates"]
            sample_program = data[0]
            
            missing_fields = [field for field in required_fields if field not in sample_program]
            if missing_fields:
                self.log_test("Get Programs", False, f"Missing required fields: {missing_fields}", 
                            {"sample_program": sample_program})
                return False
            
            self.log_test("Get Programs", True, f"Retrieved {len(data)} programs with correct structure")
            return data
            
        except Exception as e:
            self.log_test("Get Programs", False, f"Request failed: {str(e)}")
            return False
    
    def test_get_periods(self):
        """Test GET /api/periods"""
        try:
            response = self.session.get(f"{self.base_url}/api/periods")
            
            if response.status_code != 200:
                self.log_test("Get Periods", False, f"Expected 200, got {response.status_code}", 
                            {"status_code": response.status_code, "response": response.text})
                return False
            
            data = response.json()
            if not isinstance(data, list):
                self.log_test("Get Periods", False, "Expected array response", 
                            {"response_type": type(data).__name__})
                return False
            
            # Check for January and February 2026
            periods = {(p.get("month"), p.get("year")): p.get("count") for p in data}
            
            jan_2026 = periods.get((1, 2026))
            feb_2026 = periods.get((2, 2026))
            
            if jan_2026 is None:
                self.log_test("Get Periods", False, "January 2026 period not found", 
                            {"available_periods": list(periods.keys())})
                return False
            
            if feb_2026 is None:
                self.log_test("Get Periods", False, "February 2026 period not found", 
                            {"available_periods": list(periods.keys())})
                return False
            
            self.log_test("Get Periods", True, f"Found periods including Jan 2026 ({jan_2026} programs) and Feb 2026 ({feb_2026} programs)")
            return data
            
        except Exception as e:
            self.log_test("Get Periods", False, f"Request failed: {str(e)}")
            return False
    
    def test_filter_by_period(self):
        """Test GET /api/programs?month=X&year=2026"""
        results = {}
        
        # Test January 2026
        try:
            response = self.session.get(f"{self.base_url}/api/programs?month=1&year=2026")
            
            if response.status_code != 200:
                self.log_test("Filter January 2026", False, f"Expected 200, got {response.status_code}", 
                            {"status_code": response.status_code})
                return False
            
            jan_data = response.json()
            if not isinstance(jan_data, list):
                self.log_test("Filter January 2026", False, "Expected array response")
                return False
            
            # Verify all programs are from January 2026
            wrong_period = [p for p in jan_data if p.get("program_month") != 1 or p.get("program_year") != 2026]
            if wrong_period:
                self.log_test("Filter January 2026", False, f"Found {len(wrong_period)} programs from wrong period")
                return False
            
            results["january"] = len(jan_data)
            self.log_test("Filter January 2026", True, f"Retrieved {len(jan_data)} programs for January 2026")
            
        except Exception as e:
            self.log_test("Filter January 2026", False, f"Request failed: {str(e)}")
            return False
        
        # Test February 2026
        try:
            response = self.session.get(f"{self.base_url}/api/programs?month=2&year=2026")
            
            if response.status_code != 200:
                self.log_test("Filter February 2026", False, f"Expected 200, got {response.status_code}", 
                            {"status_code": response.status_code})
                return False
            
            feb_data = response.json()
            if not isinstance(feb_data, list):
                self.log_test("Filter February 2026", False, "Expected array response")
                return False
            
            # Verify all programs are from February 2026
            wrong_period = [p for p in feb_data if p.get("program_month") != 2 or p.get("program_year") != 2026]
            if wrong_period:
                self.log_test("Filter February 2026", False, f"Found {len(wrong_period)} programs from wrong period")
                return False
            
            results["february"] = len(feb_data)
            self.log_test("Filter February 2026", True, f"Retrieved {len(feb_data)} programs for February 2026")
            
        except Exception as e:
            self.log_test("Filter February 2026", False, f"Request failed: {str(e)}")
            return False
        
        # Validate expected counts from review request
        if results.get("january") == 76:
            self.log_test("January Count Validation", True, "January 2026 has expected 76 programs")
        else:
            self.log_test("January Count Validation", False, f"Expected 76 programs for January 2026, got {results.get('january')}")
        
        if results.get("february") == 81:
            self.log_test("February Count Validation", True, "February 2026 has expected 81 programs")
        else:
            self.log_test("February Count Validation", False, f"Expected 81 programs for February 2026, got {results.get('february')}")
        
        return results
    
    def test_verify_password(self):
        """Test POST /api/verify-password"""
        try:
            # Test with correct password
            response = self.session.post(f"{self.base_url}/api/verify-password", 
                                       data={"password": "Liana2018"})
            
            if response.status_code != 200:
                self.log_test("Verify Password", False, f"Expected 200, got {response.status_code}", 
                            {"status_code": response.status_code, "response": response.text})
                return False
            
            data = response.json()
            if not data.get("success"):
                self.log_test("Verify Password", False, "Password verification failed", 
                            {"response": data})
                return False
            
            self.log_test("Verify Password", True, "Password verification successful")
            
            # Test with wrong password
            response = self.session.post(f"{self.base_url}/api/verify-password", 
                                       data={"password": "wrongpassword"})
            
            if response.status_code == 401:
                self.log_test("Wrong Password Test", True, "Correctly rejected wrong password")
            else:
                self.log_test("Wrong Password Test", False, f"Expected 401 for wrong password, got {response.status_code}")
            
            return True
            
        except Exception as e:
            self.log_test("Verify Password", False, f"Request failed: {str(e)}")
            return False
    
    def test_ram_bonus_cash(self):
        """Test Ram 2500/3500 and Ram 1500 2025 bonus cash values"""
        try:
            # Get all programs
            response = self.session.get(f"{self.base_url}/api/programs")
            if response.status_code != 200:
                self.log_test("Ram Bonus Cash Test", False, "Could not retrieve programs for bonus cash test")
                return False
            
            programs = response.json()
            
            # Filter Ram 2500/3500 2025 models
            ram_2500_3500_2025 = [
                p for p in programs 
                if p.get("brand", "").lower() == "ram" 
                and ("2500" in p.get("model", "") or "3500" in p.get("model", ""))
                and p.get("year") == 2025
            ]
            
            # Filter Ram 1500 2025 models
            ram_1500_2025 = [
                p for p in programs 
                if p.get("brand", "").lower() == "ram" 
                and "1500" in p.get("model", "")
                and p.get("year") == 2025
            ]
            
            # Test Ram 2500/3500 2025 bonus cash (should be 0)
            ram_2500_3500_issues = []
            for program in ram_2500_3500_2025:
                bonus_cash = program.get("bonus_cash", 0)
                if bonus_cash != 0:
                    ram_2500_3500_issues.append({
                        "model": program.get("model"),
                        "trim": program.get("trim"),
                        "bonus_cash": bonus_cash
                    })
            
            if ram_2500_3500_issues:
                self.log_test("Ram 2500/3500 2025 Bonus Cash", False, 
                            f"Found {len(ram_2500_3500_issues)} Ram 2500/3500 2025 models with incorrect bonus cash (should be 0)", 
                            {"incorrect_programs": ram_2500_3500_issues})
            else:
                self.log_test("Ram 2500/3500 2025 Bonus Cash", True, 
                            f"All {len(ram_2500_3500_2025)} Ram 2500/3500 2025 models have correct bonus cash (0)")
            
            # Test Ram 1500 2025 bonus cash (should be 3000)
            ram_1500_issues = []
            for program in ram_1500_2025:
                bonus_cash = program.get("bonus_cash", 0)
                if bonus_cash != 3000:
                    ram_1500_issues.append({
                        "model": program.get("model"),
                        "trim": program.get("trim"),
                        "bonus_cash": bonus_cash
                    })
            
            if ram_1500_issues:
                self.log_test("Ram 1500 2025 Bonus Cash", False, 
                            f"Found {len(ram_1500_issues)} Ram 1500 2025 models with incorrect bonus cash (should be 3000)", 
                            {"incorrect_programs": ram_1500_issues})
            else:
                self.log_test("Ram 1500 2025 Bonus Cash", True, 
                            f"All {len(ram_1500_2025)} Ram 1500 2025 models have correct bonus cash (3000)")
            
            return len(ram_2500_3500_issues) == 0 and len(ram_1500_issues) == 0
            
        except Exception as e:
            self.log_test("Ram Bonus Cash Test", False, f"Request failed: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all API tests"""
        print(f"🚀 Starting CalcAuto AiPro API Tests")
        print(f"📍 Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Test 1: Health Check
        health_ok = self.test_health_check()
        
        # Test 2: Get Programs
        programs = self.test_get_programs()
        
        # Test 3: Get Periods
        periods = self.test_get_periods()
        
        # Test 4: Filter by Period
        period_results = self.test_filter_by_period()
        
        # Test 5: Verify Password
        password_ok = self.test_verify_password()
        
        # Test 6: Ram Bonus Cash Validation
        ram_bonus_ok = self.test_ram_bonus_cash()
        
        print("=" * 60)
        
        # Summary
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"📊 Test Summary: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All tests passed! API is working correctly.")
            return True
        else:
            print("⚠️  Some tests failed. Check the details above.")
            failed_tests = [result for result in self.test_results if not result["success"]]
            print("\n❌ Failed Tests:")
            for test in failed_tests:
                print(f"   - {test['test']}: {test['message']}")
            return False

def main():
    """Main test runner"""
    tester = APITester(BACKEND_URL)
    success = tester.run_all_tests()
    
    # Return appropriate exit code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()