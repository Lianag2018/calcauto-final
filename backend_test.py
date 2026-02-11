#!/usr/bin/env python3
"""
Backend API Testing Script
Tests the PDF extraction endpoint with page range parameters
"""

import requests
import json
import os
from io import BytesIO

# Get backend URL from frontend .env
def get_backend_url():
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    except:
        pass
    return "http://localhost:8001"

BACKEND_URL = get_backend_url()
API_BASE = f"{BACKEND_URL}/api"

def create_dummy_pdf():
    """Create a small dummy PDF with multiple pages for testing"""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    
    # Create 25 pages with some content
    for page_num in range(1, 26):
        c.drawString(100, 750, f"This is page {page_num}")
        c.drawString(100, 700, f"Vehicle financing data for page {page_num}")
        c.drawString(100, 650, "Sample content for PDF extraction testing")
        c.showPage()
    
    c.save()
    buffer.seek(0)
    return buffer.getvalue()

def test_pdf_extraction_endpoint():
    """Test the PDF extraction endpoint with page range parameters"""
    print("=" * 60)
    print("TESTING PDF EXTRACTION ENDPOINT")
    print("=" * 60)
    
    # Create dummy PDF
    print("Creating dummy PDF with 25 pages...")
    pdf_data = create_dummy_pdf()
    
    # Test parameters
    test_params = {
        'password': 'Liana2018',
        'program_month': 2,
        'program_year': 2026,
        'start_page': 20,
        'end_page': 21
    }
    
    print(f"Testing endpoint: {API_BASE}/extract-pdf")
    print(f"Parameters: {test_params}")
    
    try:
        # Prepare multipart form data
        files = {
            'file': ('test_document.pdf', pdf_data, 'application/pdf')
        }
        
        data = {
            'password': test_params['password'],
            'program_month': test_params['program_month'],
            'program_year': test_params['program_year'],
            'start_page': test_params['start_page'],
            'end_page': test_params['end_page']
        }
        
        print("\nSending POST request...")
        response = requests.post(
            f"{API_BASE}/extract-pdf",
            files=files,
            data=data,
            timeout=30
        )
        
        print(f"Response Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            print("✅ SUCCESS: Endpoint accepts page range parameters")
            try:
                response_json = response.json()
                print(f"Response JSON keys: {list(response_json.keys())}")
                print(f"Success: {response_json.get('success', 'N/A')}")
                print(f"Message: {response_json.get('message', 'N/A')}")
            except:
                print("Response is not JSON format")
                print(f"Response text (first 500 chars): {response.text[:500]}")
        else:
            print(f"❌ FAILED: HTTP {response.status_code}")
            print(f"Response: {response.text}")
            
        return response.status_code == 200
        
    except requests.exceptions.RequestException as e:
        print(f"❌ REQUEST ERROR: {str(e)}")
        return False
    except Exception as e:
        print(f"❌ UNEXPECTED ERROR: {str(e)}")
        return False

def test_basic_api_health():
    """Test basic API connectivity"""
    print("=" * 60)
    print("TESTING BASIC API CONNECTIVITY")
    print("=" * 60)
    
    try:
        print(f"Testing: {API_BASE}/")
        response = requests.get(f"{API_BASE}/", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ API is accessible")
            try:
                data = response.json()
                print(f"Response: {data}")
            except:
                print(f"Response text: {response.text}")
            return True
        else:
            print(f"❌ API returned {response.status_code}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ CONNECTION ERROR: {str(e)}")
        return False

def main():
    """Run all tests"""
    print(f"Backend URL: {BACKEND_URL}")
    print(f"API Base: {API_BASE}")
    
    # Test basic connectivity first
    api_healthy = test_basic_api_health()
    
    if not api_healthy:
        print("\n❌ CRITICAL: Cannot connect to API. Stopping tests.")
        return False
    
    # Test PDF extraction endpoint
    pdf_test_passed = test_pdf_extraction_endpoint()
    
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"API Health: {'✅ PASS' if api_healthy else '❌ FAIL'}")
    print(f"PDF Extraction with Page Range: {'✅ PASS' if pdf_test_passed else '❌ FAIL'}")
    
    return api_healthy and pdf_test_passed

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)