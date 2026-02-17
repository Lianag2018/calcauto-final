#!/usr/bin/env python3
"""
CalcAuto AiPro CRM Backend API Test Suite
Tests all submission-related endpoints for the CRM functionality
"""

import requests
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, List
import sys

# Backend URL from environment
BACKEND_URL = "https://financeplus-44.preview.emergentagent.com/api"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def log_test(test_name: str, status: str, details: str = ""):
    """Log test results with colors"""
    color = Colors.GREEN if status == "PASS" else Colors.RED if status == "FAIL" else Colors.YELLOW
    print(f"{color}[{status}]{Colors.ENDC} {test_name}")
    if details:
        print(f"    {details}")

def test_health_check():
    """Test basic API health"""
    try:
        response = requests.get(f"{BACKEND_URL}/ping", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("status") == "ok":
                log_test("Health Check", "PASS", f"API responding: {data}")
                return True
            else:
                log_test("Health Check", "FAIL", f"Unexpected response: {data}")
                return False
        else:
            log_test("Health Check", "FAIL", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Health Check", "FAIL", f"Connection error: {str(e)}")
        return False

def test_get_programs():
    """Test existing programs endpoint"""
    try:
        response = requests.get(f"{BACKEND_URL}/programs", timeout=10)
        if response.status_code == 200:
            programs = response.json()
            if isinstance(programs, list) and len(programs) > 0:
                log_test("GET /programs", "PASS", f"Retrieved {len(programs)} programs")
                return True, programs[0] if programs else None
            else:
                log_test("GET /programs", "FAIL", "No programs found")
                return False, None
        else:
            log_test("GET /programs", "FAIL", f"Status {response.status_code}: {response.text}")
            return False, None
    except Exception as e:
        log_test("GET /programs", "FAIL", f"Error: {str(e)}")
        return False, None

def test_get_periods():
    """Test existing periods endpoint"""
    try:
        response = requests.get(f"{BACKEND_URL}/periods", timeout=10)
        if response.status_code == 200:
            periods = response.json()
            if isinstance(periods, list) and len(periods) > 0:
                log_test("GET /periods", "PASS", f"Retrieved {len(periods)} periods")
                return True
            else:
                log_test("GET /periods", "FAIL", "No periods found")
                return False
        else:
            log_test("GET /periods", "FAIL", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("GET /periods", "FAIL", f"Error: {str(e)}")
        return False

def test_get_submissions_empty():
    """Test GET /submissions when empty"""
    try:
        response = requests.get(f"{BACKEND_URL}/submissions", timeout=10)
        if response.status_code == 200:
            submissions = response.json()
            if isinstance(submissions, list):
                log_test("GET /submissions (initial)", "PASS", f"Retrieved {len(submissions)} submissions")
                return True, submissions
            else:
                log_test("GET /submissions (initial)", "FAIL", f"Expected list, got: {type(submissions)}")
                return False, []
        else:
            log_test("GET /submissions (initial)", "FAIL", f"Status {response.status_code}: {response.text}")
            return False, []
    except Exception as e:
        log_test("GET /submissions (initial)", "FAIL", f"Error: {str(e)}")
        return False, []

def create_test_submission(client_name: str, vehicle_brand: str = "Ram", vehicle_model: str = "1500") -> Dict[str, Any]:
    """Create a test submission payload"""
    return {
        "client_name": client_name,
        "client_phone": "514-555-0123",
        "client_email": f"{client_name.lower().replace(' ', '.')}@example.com",
        "vehicle_brand": vehicle_brand,
        "vehicle_model": vehicle_model,
        "vehicle_year": 2025,
        "vehicle_price": 45000.0,
        "term": 72,
        "payment_monthly": 650.0,
        "payment_biweekly": 300.0,
        "payment_weekly": 150.0,
        "selected_option": "1",
        "rate": 4.99,
        "program_month": 2,
        "program_year": 2026
    }

def test_create_submission():
    """Test POST /submissions"""
    try:
        # Create first test submission
        submission_data = create_test_submission("Jean Dupont", "Ram", "1500")
        
        response = requests.post(
            f"{BACKEND_URL}/submissions",
            json=submission_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("success") and "submission" in result:
                submission = result["submission"]
                submission_id = submission.get("id")
                reminder_date = submission.get("reminder_date")
                
                if submission_id and reminder_date:
                    log_test("POST /submissions (Jean Dupont)", "PASS", 
                           f"Created submission ID: {submission_id}, Reminder: {reminder_date}")
                    return True, submission_id
                else:
                    log_test("POST /submissions (Jean Dupont)", "FAIL", "Missing ID or reminder_date")
                    return False, None
            else:
                log_test("POST /submissions (Jean Dupont)", "FAIL", f"Unexpected response: {result}")
                return False, None
        else:
            log_test("POST /submissions (Jean Dupont)", "FAIL", f"Status {response.status_code}: {response.text}")
            return False, None
    except Exception as e:
        log_test("POST /submissions (Jean Dupont)", "FAIL", f"Error: {str(e)}")
        return False, None

def test_create_second_submission():
    """Test creating a second submission"""
    try:
        # Create second test submission
        submission_data = create_test_submission("Marie Tremblay", "Jeep", "Grand Cherokee")
        
        response = requests.post(
            f"{BACKEND_URL}/submissions",
            json=submission_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("success") and "submission" in result:
                submission = result["submission"]
                submission_id = submission.get("id")
                
                log_test("POST /submissions (Marie Tremblay)", "PASS", 
                       f"Created submission ID: {submission_id}")
                return True, submission_id
            else:
                log_test("POST /submissions (Marie Tremblay)", "FAIL", f"Unexpected response: {result}")
                return False, None
        else:
            log_test("POST /submissions (Marie Tremblay)", "FAIL", f"Status {response.status_code}: {response.text}")
            return False, None
    except Exception as e:
        log_test("POST /submissions (Marie Tremblay)", "FAIL", f"Error: {str(e)}")
        return False, None

def test_get_submissions_with_data():
    """Test GET /submissions after creating data"""
    try:
        response = requests.get(f"{BACKEND_URL}/submissions", timeout=10)
        if response.status_code == 200:
            submissions = response.json()
            if isinstance(submissions, list) and len(submissions) >= 2:
                # Check required fields
                first_sub = submissions[0]
                required_fields = [
                    "id", "client_name", "client_phone", "client_email",
                    "vehicle_brand", "vehicle_model", "vehicle_year", "vehicle_price",
                    "term", "payment_monthly", "submission_date", "reminder_date",
                    "reminder_done", "status"
                ]
                
                missing_fields = [field for field in required_fields if field not in first_sub]
                if not missing_fields:
                    log_test("GET /submissions (with data)", "PASS", 
                           f"Retrieved {len(submissions)} submissions with all required fields")
                    return True, submissions
                else:
                    log_test("GET /submissions (with data)", "FAIL", 
                           f"Missing fields: {missing_fields}")
                    return False, submissions
            else:
                log_test("GET /submissions (with data)", "FAIL", 
                       f"Expected at least 2 submissions, got {len(submissions) if isinstance(submissions, list) else 'non-list'}")
                return False, []
        else:
            log_test("GET /submissions (with data)", "FAIL", f"Status {response.status_code}: {response.text}")
            return False, []
    except Exception as e:
        log_test("GET /submissions (with data)", "FAIL", f"Error: {str(e)}")
        return False, []

def test_update_reminder(submission_id: str):
    """Test PUT /submissions/{id}/reminder"""
    try:
        # Set reminder for tomorrow
        future_date = (datetime.utcnow() + timedelta(days=1)).isoformat()
        
        reminder_data = {
            "reminder_date": future_date,
            "notes": "Follow up on financing options"
        }
        
        response = requests.put(
            f"{BACKEND_URL}/submissions/{submission_id}/reminder",
            json=reminder_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                log_test("PUT /submissions/{id}/reminder", "PASS", 
                       f"Updated reminder for {submission_id}")
                return True
            else:
                log_test("PUT /submissions/{id}/reminder", "FAIL", f"Unexpected response: {result}")
                return False
        else:
            log_test("PUT /submissions/{id}/reminder", "FAIL", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("PUT /submissions/{id}/reminder", "FAIL", f"Error: {str(e)}")
        return False

def test_mark_reminder_done(submission_id: str):
    """Test PUT /submissions/{id}/done"""
    try:
        response = requests.put(
            f"{BACKEND_URL}/submissions/{submission_id}/done",
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                log_test("PUT /submissions/{id}/done", "PASS", 
                       f"Marked reminder done for {submission_id}")
                return True
            else:
                log_test("PUT /submissions/{id}/done", "FAIL", f"Unexpected response: {result}")
                return False
        else:
            log_test("PUT /submissions/{id}/done", "FAIL", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("PUT /submissions/{id}/done", "FAIL", f"Error: {str(e)}")
        return False

def test_update_status(submission_id: str, status: str):
    """Test PUT /submissions/{id}/status"""
    try:
        response = requests.put(
            f"{BACKEND_URL}/submissions/{submission_id}/status",
            params={"status": status},
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                log_test(f"PUT /submissions/{{id}}/status ({status})", "PASS", 
                       f"Updated status to {status} for {submission_id}")
                return True
            else:
                log_test(f"PUT /submissions/{{id}}/status ({status})", "FAIL", f"Unexpected response: {result}")
                return False
        else:
            log_test(f"PUT /submissions/{{id}}/status ({status})", "FAIL", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test(f"PUT /submissions/{{id}}/status ({status})", "FAIL", f"Error: {str(e)}")
        return False

def test_get_reminders():
    """Test GET /submissions/reminders"""
    try:
        response = requests.get(f"{BACKEND_URL}/submissions/reminders", timeout=10)
        if response.status_code == 200:
            result = response.json()
            if isinstance(result, dict) and all(key in result for key in ["due", "upcoming", "due_count", "upcoming_count"]):
                log_test("GET /submissions/reminders", "PASS", 
                       f"Due: {result['due_count']}, Upcoming: {result['upcoming_count']}")
                return True, result
            else:
                log_test("GET /submissions/reminders", "FAIL", f"Unexpected response format: {result}")
                return False, {}
        else:
            log_test("GET /submissions/reminders", "FAIL", f"Status {response.status_code}: {response.text}")
            return False, {}
    except Exception as e:
        log_test("GET /submissions/reminders", "FAIL", f"Error: {str(e)}")
        return False, {}

def test_search_submissions():
    """Test GET /submissions with search parameters"""
    try:
        # Test search by name
        response = requests.get(f"{BACKEND_URL}/submissions", params={"search": "Jean"}, timeout=10)
        if response.status_code == 200:
            submissions = response.json()
            if isinstance(submissions, list):
                jean_found = any("Jean" in sub.get("client_name", "") for sub in submissions)
                if jean_found:
                    log_test("GET /submissions (search by name)", "PASS", 
                           f"Found {len(submissions)} submissions matching 'Jean'")
                else:
                    log_test("GET /submissions (search by name)", "FAIL", "Jean not found in search results")
                    return False
            else:
                log_test("GET /submissions (search by name)", "FAIL", f"Expected list, got: {type(submissions)}")
                return False
        else:
            log_test("GET /submissions (search by name)", "FAIL", f"Status {response.status_code}: {response.text}")
            return False
        
        # Test search by status
        response = requests.get(f"{BACKEND_URL}/submissions", params={"status": "contacted"}, timeout=10)
        if response.status_code == 200:
            submissions = response.json()
            if isinstance(submissions, list):
                log_test("GET /submissions (filter by status)", "PASS", 
                       f"Found {len(submissions)} submissions with status 'contacted'")
                return True
            else:
                log_test("GET /submissions (filter by status)", "FAIL", f"Expected list, got: {type(submissions)}")
                return False
        else:
            log_test("GET /submissions (filter by status)", "FAIL", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("GET /submissions (search)", "FAIL", f"Error: {str(e)}")
        return False

def main():
    """Run all CRM backend tests"""
    print(f"{Colors.BOLD}{Colors.BLUE}=== CalcAuto AiPro CRM Backend API Tests ==={Colors.ENDC}")
    print(f"Testing backend at: {BACKEND_URL}")
    print()
    
    # Track test results
    passed_tests = 0
    total_tests = 0
    
    # Test 1: Health check
    total_tests += 1
    if test_health_check():
        passed_tests += 1
    
    # Test 2: Existing endpoints (programs)
    total_tests += 1
    programs_ok, sample_program = test_get_programs()
    if programs_ok:
        passed_tests += 1
    
    # Test 3: Existing endpoints (periods)
    total_tests += 1
    if test_get_periods():
        passed_tests += 1
    
    # Test 4: Get submissions (initially empty)
    total_tests += 1
    submissions_ok, initial_submissions = test_get_submissions_empty()
    if submissions_ok:
        passed_tests += 1
    
    # Test 5: Create first submission
    total_tests += 1
    create1_ok, submission_id1 = test_create_submission()
    if create1_ok:
        passed_tests += 1
    
    # Test 6: Create second submission
    total_tests += 1
    create2_ok, submission_id2 = test_create_second_submission()
    if create2_ok:
        passed_tests += 1
    
    # Test 7: Get submissions with data
    total_tests += 1
    get_data_ok, submissions_with_data = test_get_submissions_with_data()
    if get_data_ok:
        passed_tests += 1
    
    # Test 8: Update reminder (use first submission)
    if submission_id1:
        total_tests += 1
        if test_update_reminder(submission_id1):
            passed_tests += 1
    
    # Test 9: Mark reminder done (use second submission)
    if submission_id2:
        total_tests += 1
        if test_mark_reminder_done(submission_id2):
            passed_tests += 1
    
    # Test 10: Update status (use second submission)
    if submission_id2:
        total_tests += 1
        if test_update_status(submission_id2, "contacted"):
            passed_tests += 1
    
    # Test 11: Get reminders
    total_tests += 1
    reminders_ok, reminders_data = test_get_reminders()
    if reminders_ok:
        passed_tests += 1
    
    # Test 12: Search functionality
    total_tests += 1
    if test_search_submissions():
        passed_tests += 1
    
    # Summary
    print()
    print(f"{Colors.BOLD}=== Test Summary ==={Colors.ENDC}")
    print(f"Passed: {Colors.GREEN}{passed_tests}{Colors.ENDC}/{total_tests}")
    print(f"Failed: {Colors.RED}{total_tests - passed_tests}{Colors.ENDC}/{total_tests}")
    
    if passed_tests == total_tests:
        print(f"{Colors.GREEN}{Colors.BOLD}✅ All tests passed!{Colors.ENDC}")
        return 0
    else:
        print(f"{Colors.RED}{Colors.BOLD}❌ Some tests failed{Colors.ENDC}")
        return 1

if __name__ == "__main__":
    sys.exit(main())