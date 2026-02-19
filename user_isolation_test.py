#!/usr/bin/env python3
"""
Backend Test Suite for CalcAuto AiPro - User Data Isolation Testing
Testing user authentication and data isolation per the review request.
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend/.env
BACKEND_URL = "https://auto-loan-pro.preview.emergentagent.com/api"

class UserIsolationTester:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.user_id = None
        self.test_results = []
        
    def log_test(self, test_name, status, details="", response_code=None):
        """Log test results"""
        result = {
            "test": test_name,
            "status": status,
            "details": details,
            "response_code": response_code,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        status_icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
        print(f"{status_icon} {test_name}: {status}")
        if details:
            print(f"   Details: {details}")
        if response_code:
            print(f"   Response Code: {response_code}")
        print()

    def test_1_login_and_token_retrieval(self):
        """Test 1: Login and retrieve token"""
        print("=== TEST 1: Login and Token Retrieval ===")
        
        try:
            login_data = {
                "email": "test@test.com",
                "password": "test123"
            }
            
            response = self.session.post(f"{BACKEND_URL}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("token"):
                    self.token = data["token"]
                    self.user_id = data.get("user", {}).get("id")
                    self.log_test(
                        "Login with test@test.com", 
                        "PASS", 
                        f"Token retrieved successfully. User ID: {self.user_id}",
                        response.status_code
                    )
                    return True
                else:
                    self.log_test(
                        "Login with test@test.com", 
                        "FAIL", 
                        f"Login successful but missing token or success flag. Response: {data}",
                        response.status_code
                    )
                    return False
            else:
                self.log_test(
                    "Login with test@test.com", 
                    "FAIL", 
                    f"Login failed. Response: {response.text}",
                    response.status_code
                )
                return False
                
        except Exception as e:
            self.log_test(
                "Login with test@test.com", 
                "FAIL", 
                f"Exception during login: {str(e)}"
            )
            return False

    def test_2_protected_endpoints_with_token(self):
        """Test 2: Test protected endpoints with Authorization header"""
        print("=== TEST 2: Protected Endpoints with Token ===")
        
        if not self.token:
            self.log_test("Protected endpoints test", "SKIP", "No token available from login")
            return False
            
        headers = {"Authorization": f"Bearer {self.token}"}
        
        # Test endpoints that should return 200 with token
        endpoints_to_test = [
            ("/contacts", "GET contacts"),
            ("/submissions", "GET submissions"), 
            ("/better-offers", "GET better-offers"),
            ("/submissions/reminders", "GET submissions/reminders")
        ]
        
        all_passed = True
        
        for endpoint, test_name in endpoints_to_test:
            try:
                response = self.session.get(f"{BACKEND_URL}{endpoint}", headers=headers)
                
                if response.status_code == 200:
                    data = response.json()
                    self.log_test(
                        test_name, 
                        "PASS", 
                        f"Endpoint accessible with token. Response type: {type(data).__name__}",
                        response.status_code
                    )
                else:
                    self.log_test(
                        test_name, 
                        "FAIL", 
                        f"Expected 200, got {response.status_code}. Response: {response.text}",
                        response.status_code
                    )
                    all_passed = False
                    
            except Exception as e:
                self.log_test(
                    test_name, 
                    "FAIL", 
                    f"Exception: {str(e)}"
                )
                all_passed = False
                
        return all_passed

    def test_3_endpoints_without_token(self):
        """Test 3: Test endpoints without token (should return 401)"""
        print("=== TEST 3: Endpoints Without Token (Should Return 401) ===")
        
        # Test GET /api/contacts without Authorization header
        try:
            response = self.session.get(f"{BACKEND_URL}/contacts")
            
            if response.status_code == 401:
                self.log_test(
                    "GET /contacts without token", 
                    "PASS", 
                    "Correctly returned 401 Unauthorized",
                    response.status_code
                )
                return True
            else:
                self.log_test(
                    "GET /contacts without token", 
                    "FAIL", 
                    f"Expected 401, got {response.status_code}. Response: {response.text}",
                    response.status_code
                )
                return False
                
        except Exception as e:
            self.log_test(
                "GET /contacts without token", 
                "FAIL", 
                f"Exception: {str(e)}"
            )
            return False

    def test_4_contact_creation_with_token(self):
        """Test 4: Test contact creation with token"""
        print("=== TEST 4: Contact Creation with Token ===")
        
        if not self.token:
            self.log_test("Contact creation test", "SKIP", "No token available from login")
            return False
            
        headers = {"Authorization": f"Bearer {self.token}"}
        
        contact_data = {
            "name": "Test Isolation",
            "phone": "5145551234", 
            "email": "test@test.com",
            "source": "manual"
        }
        
        try:
            response = self.session.post(f"{BACKEND_URL}/contacts", json=contact_data, headers=headers)
            
            if response.status_code in [200, 201]:
                data = response.json()
                contact_id = data.get("id")
                owner_id = data.get("owner_id")
                
                self.log_test(
                    "POST /contacts with token", 
                    "PASS", 
                    f"Contact created successfully. ID: {contact_id}, Owner: {owner_id}",
                    response.status_code
                )
                
                # Verify the contact belongs to the current user
                if owner_id == self.user_id:
                    self.log_test(
                        "Contact ownership verification", 
                        "PASS", 
                        f"Contact correctly assigned to user {self.user_id}"
                    )
                else:
                    self.log_test(
                        "Contact ownership verification", 
                        "FAIL", 
                        f"Contact owner_id ({owner_id}) doesn't match user_id ({self.user_id})"
                    )
                    
                return True
            else:
                self.log_test(
                    "POST /contacts with token", 
                    "FAIL", 
                    f"Expected 200/201, got {response.status_code}. Response: {response.text}",
                    response.status_code
                )
                return False
                
        except Exception as e:
            self.log_test(
                "POST /contacts with token", 
                "FAIL", 
                f"Exception: {str(e)}"
            )
            return False

    def test_5_data_isolation_verification(self):
        """Test 5: Verify that user only sees their own data"""
        print("=== TEST 5: Data Isolation Verification ===")
        
        if not self.token:
            self.log_test("Data isolation test", "SKIP", "No token available from login")
            return False
            
        headers = {"Authorization": f"Bearer {self.token}"}
        
        try:
            # Get contacts and verify they all belong to current user
            response = self.session.get(f"{BACKEND_URL}/contacts", headers=headers)
            
            if response.status_code == 200:
                contacts = response.json()
                
                if isinstance(contacts, list):
                    isolated_correctly = True
                    for contact in contacts:
                        if contact.get("owner_id") != self.user_id:
                            isolated_correctly = False
                            break
                    
                    if isolated_correctly:
                        self.log_test(
                            "Contact data isolation", 
                            "PASS", 
                            f"All {len(contacts)} contacts belong to current user",
                            response.status_code
                        )
                    else:
                        self.log_test(
                            "Contact data isolation", 
                            "FAIL", 
                            "Found contacts belonging to other users"
                        )
                        
                else:
                    self.log_test(
                        "Contact data isolation", 
                        "FAIL", 
                        f"Expected list, got {type(contacts).__name__}"
                    )
                    
            else:
                self.log_test(
                    "Contact data isolation", 
                    "FAIL", 
                    f"Failed to get contacts. Status: {response.status_code}",
                    response.status_code
                )
                
            # Test submissions isolation
            response = self.session.get(f"{BACKEND_URL}/submissions", headers=headers)
            
            if response.status_code == 200:
                submissions = response.json()
                
                if isinstance(submissions, list):
                    isolated_correctly = True
                    for submission in submissions:
                        if submission.get("owner_id") != self.user_id:
                            isolated_correctly = False
                            break
                    
                    if isolated_correctly:
                        self.log_test(
                            "Submission data isolation", 
                            "PASS", 
                            f"All {len(submissions)} submissions belong to current user",
                            response.status_code
                        )
                        return True
                    else:
                        self.log_test(
                            "Submission data isolation", 
                            "FAIL", 
                            "Found submissions belonging to other users"
                        )
                        return False
                        
                else:
                    self.log_test(
                        "Submission data isolation", 
                        "FAIL", 
                        f"Expected list, got {type(submissions).__name__}"
                    )
                    return False
                    
            else:
                self.log_test(
                    "Submission data isolation", 
                    "FAIL", 
                    f"Failed to get submissions. Status: {response.status_code}",
                    response.status_code
                )
                return False
                
        except Exception as e:
            self.log_test(
                "Data isolation verification", 
                "FAIL", 
                f"Exception: {str(e)}"
            )
            return False

    def run_all_tests(self):
        """Run all user isolation tests"""
        print("🔒 CALCAUTO AIPRO - USER DATA ISOLATION TESTING")
        print("=" * 60)
        print(f"Backend URL: {BACKEND_URL}")
        print(f"Test Time: {datetime.now().isoformat()}")
        print()
        
        # Run tests in sequence
        test_results = []
        
        test_results.append(self.test_1_login_and_token_retrieval())
        test_results.append(self.test_2_protected_endpoints_with_token())
        test_results.append(self.test_3_endpoints_without_token())
        test_results.append(self.test_4_contact_creation_with_token())
        test_results.append(self.test_5_data_isolation_verification())
        
        # Summary
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["status"] == "PASS")
        failed = sum(1 for result in self.test_results if result["status"] == "FAIL")
        skipped = sum(1 for result in self.test_results if result["status"] == "SKIP")
        
        print(f"✅ PASSED: {passed}")
        print(f"❌ FAILED: {failed}")
        print(f"⚠️ SKIPPED: {skipped}")
        print(f"📋 TOTAL: {len(self.test_results)}")
        
        if failed == 0:
            print("\n🎉 ALL TESTS PASSED - User data isolation is working correctly!")
            return True
        else:
            print(f"\n⚠️ {failed} TESTS FAILED - User data isolation has issues!")
            return False

def main():
    """Main test execution"""
    tester = UserIsolationTester()
    success = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()