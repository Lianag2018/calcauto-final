"""
Test suite for SCI Lease parser fix - verifying the 2-row offset bug has been fixed.
The bug was in parse_sci_lease() where vehicle names and rate data were misaligned.
"""
import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://toc-extraction-fix.preview.emergentagent.com').rstrip('/')
ADMIN_PASSWORD = "Liana2018"
MARCH_PDF_PATH = "/app/march_2026.pdf"
FEBRUARY_PDF_PATH = "/app/pdf_source.pdf"


class TestScanPDF:
    """Test /api/scan-pdf endpoint for page detection"""
    
    def test_scan_march_2026_pdf_detects_lease_pages(self):
        """POST /api/scan-pdf should detect lease pages 25-26 for March 2026 PDF"""
        with open(MARCH_PDF_PATH, 'rb') as f:
            files = {'file': ('march_2026.pdf', f, 'application/pdf')}
            data = {'password': ADMIN_PASSWORD}
            response = requests.post(f"{BASE_URL}/api/scan-pdf", files=files, data=data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        result = response.json()
        
        # Verify lease pages detected
        assert result.get('success') is True, "Expected success=True"
        assert result.get('lease_start') == 25, f"Expected lease_start=25, got {result.get('lease_start')}"
        assert result.get('lease_end') == 26, f"Expected lease_end=26, got {result.get('lease_end')}"
        
        print(f"PASSED: Lease pages detected: {result.get('lease_start')}-{result.get('lease_end')}")
        print(f"  Retail pages: {result.get('retail_start')}-{result.get('retail_end')}")
        print(f"  Total pages: {result.get('total_pages')}")


class TestExtractPDF:
    """Test /api/extract-pdf endpoint for data extraction"""
    
    def test_extract_march_2026_pdf_counts(self):
        """POST /api/extract-pdf should extract 93 retail programs and 74 SCI lease vehicles"""
        with open(MARCH_PDF_PATH, 'rb') as f:
            files = {'file': ('march_2026.pdf', f, 'application/pdf')}
            data = {
                'password': ADMIN_PASSWORD,
                'program_month': 3,
                'program_year': 2026
            }
            response = requests.post(f"{BASE_URL}/api/extract-pdf", files=files, data=data, timeout=120)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        result = response.json()
        
        # Verify extraction success
        assert result.get('success') is True, "Expected success=True"
        
        # Verify retail program count (93)
        programs = result.get('programs', [])
        assert len(programs) == 93, f"Expected 93 retail programs, got {len(programs)}"
        
        # Verify SCI lease count (74)
        sci_lease_count = result.get('sci_lease_count', 0)
        assert sci_lease_count == 74, f"Expected 74 SCI lease vehicles, got {sci_lease_count}"
        
        print(f"PASSED: Extracted {len(programs)} retail programs + {sci_lease_count} SCI lease vehicles")


class TestSavedSCILeaseData:
    """Test the saved SCI Lease JSON files for correct data alignment"""
    
    def test_march_2026_vehicle_counts(self):
        """March 2026 sci_lease_rates_mar2026.json should have 33 vehicles_2026 and 41 vehicles_2025"""
        with open('/app/backend/data/sci_lease_rates_mar2026.json', 'r') as f:
            data = json.load(f)
        
        vehicles_2026 = data.get('vehicles_2026', [])
        vehicles_2025 = data.get('vehicles_2025', [])
        
        assert len(vehicles_2026) == 33, f"Expected 33 vehicles_2026, got {len(vehicles_2026)}"
        assert len(vehicles_2025) == 41, f"Expected 41 vehicles_2025, got {len(vehicles_2025)}"
        
        print(f"PASSED: March 2026 has {len(vehicles_2026)} v2026 + {len(vehicles_2025)} v2025 = {len(vehicles_2026) + len(vehicles_2025)} total")
    
    def test_march_2026_compass_north_lease_cash(self):
        """Compass North should have Lease Cash = $3,500"""
        with open('/app/backend/data/sci_lease_rates_mar2026.json', 'r') as f:
            data = json.load(f)
        
        compass_north = None
        for v in data['vehicles_2026']:
            if v['model'] == 'Compass North':
                compass_north = v
                break
        
        assert compass_north is not None, "Compass North not found in vehicles_2026"
        assert compass_north['lease_cash'] == 3500, f"Expected Compass North LC=$3500, got ${compass_north['lease_cash']}"
        
        print(f"PASSED: Compass North has Lease Cash = ${compass_north['lease_cash']}")
    
    def test_march_2026_ram_sport_rebel_lease_cash(self):
        """Ram 1500 Sport, Rebel should have Lease Cash = $8,250"""
        with open('/app/backend/data/sci_lease_rates_mar2026.json', 'r') as f:
            data = json.load(f)
        
        ram_sport = None
        for v in data['vehicles_2026']:
            if 'Ram 1500 Sport' in v['model'] and 'Rebel' in v['model']:
                ram_sport = v
                break
        
        assert ram_sport is not None, "Ram 1500 Sport, Rebel not found in vehicles_2026"
        assert ram_sport['lease_cash'] == 8250, f"Expected Ram Sport Rebel LC=$8250, got ${ram_sport['lease_cash']}"
        
        print(f"PASSED: Ram 1500 Sport, Rebel has Lease Cash = ${ram_sport['lease_cash']}")
    
    def test_march_2026_durango_srt_hellcat_lease_cash(self):
        """Durango SRT Hellcat should have Lease Cash = $15,500"""
        with open('/app/backend/data/sci_lease_rates_mar2026.json', 'r') as f:
            data = json.load(f)
        
        durango_hellcat = None
        for v in data['vehicles_2026']:
            if 'Durango SRT Hellcat' in v['model']:
                durango_hellcat = v
                break
        
        assert durango_hellcat is not None, "Durango SRT Hellcat not found in vehicles_2026"
        assert durango_hellcat['lease_cash'] == 15500, f"Expected Durango SRT Hellcat LC=$15500, got ${durango_hellcat['lease_cash']}"
        
        print(f"PASSED: Durango SRT Hellcat has Lease Cash = ${durango_hellcat['lease_cash']}")
    
    def test_march_2026_ram_laramie_lease_cash(self):
        """Ram Laramie (full trim line) should have Lease Cash = $11,500"""
        with open('/app/backend/data/sci_lease_rates_mar2026.json', 'r') as f:
            data = json.load(f)
        
        ram_laramie = None
        for v in data['vehicles_2026']:
            if 'Laramie' in v['model'] and 'Limited' in v['model'] and 'Ram 1500' in v['model']:
                ram_laramie = v
                break
        
        assert ram_laramie is not None, "Ram 1500 Laramie not found in vehicles_2026"
        assert ram_laramie['lease_cash'] == 11500, f"Expected Ram Laramie LC=$11500, got ${ram_laramie['lease_cash']}"
        
        print(f"PASSED: Ram 1500 Laramie has Lease Cash = ${ram_laramie['lease_cash']}")
    
    def test_march_2026_grand_caravan_alt_rates(self):
        """Grand Caravan SXT should have alt rates starting at 4.99% (not 3.49% which was the old bug)"""
        with open('/app/backend/data/sci_lease_rates_mar2026.json', 'r') as f:
            data = json.load(f)
        
        grand_caravan = None
        for v in data['vehicles_2026']:
            if 'Grand Caravan SXT' in v['model']:
                grand_caravan = v
                break
        
        assert grand_caravan is not None, "Grand Caravan SXT not found in vehicles_2026"
        
        alt_rates = grand_caravan.get('alternative_rates')
        assert alt_rates is not None, "Grand Caravan SXT should have alternative_rates"
        
        # Check the 24-month rate is 4.99, not 3.49 (old bug value)
        rate_24 = alt_rates.get('24')
        assert rate_24 == 4.99, f"Expected Grand Caravan SXT 24m alt rate=4.99%, got {rate_24}% (3.49% was the old bug)"
        
        print(f"PASSED: Grand Caravan SXT alt_rates['24'] = {rate_24}% (not 3.49% old bug)")
    
    def test_february_2026_vehicle_counts(self):
        """February 2026 data should have 29 v2026 and 45 v2025"""
        with open('/app/backend/data/sci_lease_rates_feb2026.json', 'r') as f:
            data = json.load(f)
        
        vehicles_2026 = data.get('vehicles_2026', [])
        vehicles_2025 = data.get('vehicles_2025', [])
        
        assert len(vehicles_2026) == 29, f"Expected 29 vehicles_2026, got {len(vehicles_2026)}"
        assert len(vehicles_2025) == 45, f"Expected 45 vehicles_2025, got {len(vehicles_2025)}"
        
        print(f"PASSED: February 2026 has {len(vehicles_2026)} v2026 + {len(vehicles_2025)} v2025 = {len(vehicles_2026) + len(vehicles_2025)} total")
    
    def test_all_2026_vehicles_have_rates(self):
        """All 2026 vehicles should have either standard_rates or alternative_rates (none should be completely empty)"""
        with open('/app/backend/data/sci_lease_rates_mar2026.json', 'r') as f:
            data = json.load(f)
        
        empty_vehicles = []
        for v in data['vehicles_2026']:
            sr = v.get('standard_rates')
            ar = v.get('alternative_rates')
            
            # Check if either has data
            has_std = sr is not None and isinstance(sr, dict) and any(sr.values())
            has_alt = ar is not None and isinstance(ar, dict) and any(ar.values())
            
            if not has_std and not has_alt:
                empty_vehicles.append(v['model'])
        
        assert len(empty_vehicles) == 0, f"Found {len(empty_vehicles)} vehicles with no rates: {empty_vehicles}"
        
        print(f"PASSED: All {len(data['vehicles_2026'])} 2026 vehicles have either standard_rates or alternative_rates")


class TestParserFix:
    """Direct tests for the parse_sci_lease function to verify the row alignment fix"""
    
    def test_parse_sci_lease_march_directly(self):
        """Directly test the parse_sci_lease function with March PDF"""
        import sys
        sys.path.insert(0, '/app/backend')
        from services.pdfplumber_parser import parse_sci_lease
        
        with open(MARCH_PDF_PATH, 'rb') as f:
            pdf_content = f.read()
        
        # Parse lease pages 25-26
        result = parse_sci_lease(pdf_content, 25, 26)
        
        vehicles_2026 = result.get('vehicles_2026', [])
        vehicles_2025 = result.get('vehicles_2025', [])
        
        # Verify counts
        assert len(vehicles_2026) == 33, f"Expected 33 v2026, got {len(vehicles_2026)}"
        assert len(vehicles_2025) == 41, f"Expected 41 v2025, got {len(vehicles_2025)}"
        
        # Verify first vehicle alignment
        first_v2026 = vehicles_2026[0]
        assert 'Grand Caravan' in first_v2026['model'], f"Expected first v2026 to be Grand Caravan, got {first_v2026['model']}"
        
        print(f"PASSED: parse_sci_lease() returns correct aligned data")
        print(f"  First 2026 vehicle: {first_v2026['model']}")
        print(f"  Total: {len(vehicles_2026)} v2026 + {len(vehicles_2025)} v2025")


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
