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
    """Create a simple dummy PDF using basic PDF structure"""
    # Create a minimal PDF with multiple pages
    pdf_content = b"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R 4 0 R 5 0 R 6 0 R 7 0 R 8 0 R 9 0 R 10 0 R 11 0 R 12 0 R 13 0 R 14 0 R 15 0 R 16 0 R 17 0 R 18 0 R 19 0 R 20 0 R 21 0 R 22 0 R 23 0 R 24 0 R 25 0 R 26 0 R 27 0 R]
/Count 25
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 28 0 R
>>
endobj

4 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 29 0 R
>>
endobj

5 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 30 0 R
>>
endobj

6 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 31 0 R
>>
endobj

7 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 32 0 R
>>
endobj

8 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 33 0 R
>>
endobj

9 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 34 0 R
>>
endobj

10 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 35 0 R
>>
endobj

11 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 36 0 R
>>
endobj

12 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 37 0 R
>>
endobj

13 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 38 0 R
>>
endobj

14 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 39 0 R
>>
endobj

15 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 40 0 R
>>
endobj

16 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 41 0 R
>>
endobj

17 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 42 0 R
>>
endobj

18 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 43 0 R
>>
endobj

19 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 44 0 R
>>
endobj

20 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 45 0 R
>>
endobj

21 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 46 0 R
>>
endobj

22 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 47 0 R
>>
endobj

23 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 48 0 R
>>
endobj

24 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 49 0 R
>>
endobj

25 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 50 0 R
>>
endobj

26 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 51 0 R
>>
endobj

27 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 52 0 R
>>
endobj

28 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 1 Content) Tj
ET
endstream
endobj

29 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 2 Content) Tj
ET
endstream
endobj

30 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 3 Content) Tj
ET
endstream
endobj

31 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 4 Content) Tj
ET
endstream
endobj

32 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 5 Content) Tj
ET
endstream
endobj

33 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 6 Content) Tj
ET
endstream
endobj

34 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 7 Content) Tj
ET
endstream
endobj

35 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 8 Content) Tj
ET
endstream
endobj

36 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 9 Content) Tj
ET
endstream
endobj

37 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 10 Content) Tj
ET
endstream
endobj

38 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 11 Content) Tj
ET
endstream
endobj

39 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 12 Content) Tj
ET
endstream
endobj

40 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 13 Content) Tj
ET
endstream
endobj

41 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 14 Content) Tj
ET
endstream
endobj

42 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 15 Content) Tj
ET
endstream
endobj

43 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 16 Content) Tj
ET
endstream
endobj

44 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 17 Content) Tj
ET
endstream
endobj

45 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 18 Content) Tj
ET
endstream
endobj

46 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 19 Content) Tj
ET
endstream
endobj

47 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 20 Content) Tj
ET
endstream
endobj

48 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 21 Content) Tj
ET
endstream
endobj

49 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 22 Content) Tj
ET
endstream
endobj

50 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 23 Content) Tj
ET
endstream
endobj

51 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 24 Content) Tj
ET
endstream
endobj

52 0 obj
<<
/Length 45
>>
stream
BT
/F1 12 Tf
100 700 Td
(Page 25 Content) Tj
ET
endstream
endobj

xref
0 53
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000215 00000 n 
0000000294 00000 n 
0000000373 00000 n 
0000000452 00000 n 
0000000531 00000 n 
0000000610 00000 n 
0000000689 00000 n 
0000000768 00000 n 
0000000848 00000 n 
0000000928 00000 n 
0000001008 00000 n 
0000001088 00000 n 
0000001168 00000 n 
0000001248 00000 n 
0000001328 00000 n 
0000001408 00000 n 
0000001488 00000 n 
0000001568 00000 n 
0000001648 00000 n 
0000001728 00000 n 
0000001808 00000 n 
0000001888 00000 n 
0000001968 00000 n 
0000002048 00000 n 
0000002128 00000 n 
0000002208 00000 n 
0000002302 00000 n 
0000002396 00000 n 
0000002490 00000 n 
0000002584 00000 n 
0000002678 00000 n 
0000002772 00000 n 
0000002866 00000 n 
0000002960 00000 n 
0000003055 00000 n 
0000003151 00000 n 
0000003247 00000 n 
0000003343 00000 n 
0000003439 00000 n 
0000003535 00000 n 
0000003631 00000 n 
0000003727 00000 n 
0000003823 00000 n 
0000003919 00000 n 
0000004015 00000 n 
0000004111 00000 n 
0000004207 00000 n 
0000004303 00000 n 
0000004399 00000 n 
0000004495 00000 n 
trailer
<<
/Size 53
/Root 1 0 R
>>
startxref
4591
%%EOF"""
    
    return pdf_content

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