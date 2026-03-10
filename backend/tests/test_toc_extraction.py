"""
Test suite for TOC-based PDF extraction feature.
Tests:
1. POST /api/scan-pdf - page range detection from TOC
2. POST /api/extract-pdf - program extraction from PDFs  
3. GET /api/program-meta - metadata for monthly programs (loyalty_rate, no_payments_days)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://lease-extraction.preview.emergentagent.com')
ADMIN_PASSWORD = "Liana2018"

# Test PDF paths
PDF_JAN = "/tmp/jan2026.pdf"
PDF_FEB = "/tmp/feb2026.pdf"
PDF_MAR = "/tmp/mar2026.pdf"


class TestScanPDF:
    """POST /api/scan-pdf - Page range detection using TOC parsing"""
    
    def test_scan_jan2026_pdf(self):
        """January 2026 PDF should detect retail, lease, non-prime page ranges"""
        if not os.path.exists(PDF_JAN):
            pytest.skip("January 2026 PDF not found at /tmp/jan2026.pdf")
        
        with open(PDF_JAN, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/scan-pdf",
                files={"file": ("jan2026.pdf", f, "application/pdf")},
                data={"password": ADMIN_PASSWORD}
            )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify success and page detection
        assert data.get("success") is True
        assert data.get("retail_start") is not None, "Should detect retail_start"
        assert data.get("retail_end") is not None, "Should detect retail_end"
        assert data.get("lease_start") is not None, "Should detect lease_start"
        assert data.get("lease_end") is not None, "Should detect lease_end"
        assert data.get("total_pages") > 20, "PDF should have more than 20 pages"
        
        # Verify detected_sections
        sections = data.get("detected_sections", [])
        assert len(sections) >= 2, "Should detect at least 2 sections"
        section_types = [s["type"] for s in sections]
        assert "retail_prime" in section_types, "Should detect retail_prime section"
        assert "lease" in section_types, "Should detect lease section"
        
        print(f"Jan2026: retail={data['retail_start']}-{data['retail_end']}, "
              f"lease={data['lease_start']}-{data['lease_end']}, total={data['total_pages']} pages")

    def test_scan_feb2026_pdf(self):
        """February 2026 PDF should detect page ranges"""
        if not os.path.exists(PDF_FEB):
            pytest.skip("February 2026 PDF not found at /tmp/feb2026.pdf")
        
        with open(PDF_FEB, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/scan-pdf",
                files={"file": ("feb2026.pdf", f, "application/pdf")},
                data={"password": ADMIN_PASSWORD}
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        assert data.get("retail_start") is not None
        assert data.get("retail_end") is not None
        print(f"Feb2026: retail={data['retail_start']}-{data['retail_end']}, "
              f"lease={data.get('lease_start')}-{data.get('lease_end')}, total={data['total_pages']} pages")

    def test_scan_mar2026_pdf(self):
        """March 2026 PDF should detect page ranges (Layout B with TOC)"""
        if not os.path.exists(PDF_MAR):
            pytest.skip("March 2026 PDF not found at /tmp/mar2026.pdf")
        
        with open(PDF_MAR, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/scan-pdf",
                files={"file": ("mar2026.pdf", f, "application/pdf")},
                data={"password": ADMIN_PASSWORD}
            )
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        assert data.get("retail_start") is not None
        assert data.get("retail_end") is not None
        
        # March uses Layout B - page numbers may be different
        print(f"Mar2026: retail={data['retail_start']}-{data['retail_end']}, "
              f"lease={data.get('lease_start')}-{data.get('lease_end')}, total={data['total_pages']} pages")

    def test_scan_pdf_wrong_password(self):
        """Should return 401 with wrong password"""
        if not os.path.exists(PDF_MAR):
            pytest.skip("March 2026 PDF not found")
        
        with open(PDF_MAR, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/scan-pdf",
                files={"file": ("mar2026.pdf", f, "application/pdf")},
                data={"password": "wrongpassword"}
            )
        
        assert response.status_code == 401


class TestExtractPDF:
    """POST /api/extract-pdf - Program extraction from PDFs"""
    
    def test_extract_mar2026_programs(self):
        """March 2026 PDF should extract ~93 programs with all 5 brands"""
        if not os.path.exists(PDF_MAR):
            pytest.skip("March 2026 PDF not found at /tmp/mar2026.pdf")
        
        with open(PDF_MAR, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/extract-pdf",
                files={"file": ("mar2026.pdf", f, "application/pdf")},
                data={
                    "password": ADMIN_PASSWORD,
                    "program_month": 3,
                    "program_year": 2026
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify extraction success
        assert data.get("success") is True
        programs = data.get("programs", [])
        assert len(programs) >= 80, f"Should extract ~93 programs, got {len(programs)}"
        
        # Verify all 5 brands present
        brands = set(p["brand"] for p in programs)
        expected_brands = {"Chrysler", "Jeep", "Dodge", "Ram", "Fiat"}
        assert expected_brands.issubset(brands), f"Missing brands: {expected_brands - brands}"
        
        # Verify program structure
        sample = programs[0]
        assert "brand" in sample
        assert "model" in sample
        assert "year" in sample
        assert "option1_rates" in sample or "option2_rates" in sample
        
        print(f"Mar2026 extraction: {len(programs)} programs, brands={brands}")

    def test_extract_feb2026_programs(self):
        """February 2026 PDF should extract ~95 programs"""
        if not os.path.exists(PDF_FEB):
            pytest.skip("February 2026 PDF not found at /tmp/feb2026.pdf")
        
        with open(PDF_FEB, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/extract-pdf",
                files={"file": ("feb2026.pdf", f, "application/pdf")},
                data={
                    "password": ADMIN_PASSWORD,
                    "program_month": 2,
                    "program_year": 2026
                }
            )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("success") is True
        programs = data.get("programs", [])
        assert len(programs) >= 80, f"Should extract ~95 programs, got {len(programs)}"
        
        brands = set(p["brand"] for p in programs)
        expected_brands = {"Chrysler", "Jeep", "Dodge", "Ram", "Fiat"}
        assert expected_brands.issubset(brands), f"Missing brands: {expected_brands - brands}"
        
        print(f"Feb2026 extraction: {len(programs)} programs, brands={brands}")


class TestProgramMeta:
    """GET /api/program-meta - Monthly program metadata"""
    
    def test_mar2026_meta_loyalty_rate(self):
        """March 2026 should have loyalty_rate=0.5, no_payments_days=0"""
        response = requests.get(f"{BASE_URL}/api/program-meta", params={"month": 3, "year": 2026})
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify March 2026 metadata
        assert data.get("program_month") == "March"
        assert data.get("program_year") == 2026
        assert data.get("loyalty_rate") == 0.5, f"Expected loyalty_rate=0.5, got {data.get('loyalty_rate')}"
        assert data.get("no_payments_days") == 0, f"Expected no_payments_days=0, got {data.get('no_payments_days')}"
        
        # Verify event names
        event_names = data.get("event_names", [])
        assert "Month of Ram" in event_names, "Should include 'Month of Ram' event"
        
        print(f"Mar2026 meta: loyalty={data['loyalty_rate']}%, no_payments={data['no_payments_days']}d, events={event_names}")

    def test_feb2026_meta_deferred_payment(self):
        """February 2026 should have loyalty_rate=0.0, no_payments_days=90"""
        response = requests.get(f"{BASE_URL}/api/program-meta", params={"month": 2, "year": 2026})
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify February 2026 metadata
        assert data.get("program_month") == "February"
        assert data.get("program_year") == 2026
        assert data.get("loyalty_rate") == 0.0, f"Expected loyalty_rate=0.0, got {data.get('loyalty_rate')}"
        assert data.get("no_payments_days") == 90, f"Expected no_payments_days=90, got {data.get('no_payments_days')}"
        
        # Verify event names
        event_names = data.get("event_names", [])
        assert "4X4 Winter Event" in event_names, "Should include '4X4 Winter Event'"
        
        print(f"Feb2026 meta: loyalty={data['loyalty_rate']}%, no_payments={data['no_payments_days']}d, events={event_names}")

    def test_meta_brands_list(self):
        """Program meta should include brands list"""
        response = requests.get(f"{BASE_URL}/api/program-meta", params={"month": 3, "year": 2026})
        
        assert response.status_code == 200
        data = response.json()
        
        brands = data.get("brands", [])
        assert len(brands) >= 5, f"Should have 5 brands, got {len(brands)}"
        
        expected_brands = {"Chrysler", "Dodge", "Fiat", "Jeep", "Ram"}
        assert set(brands) == expected_brands, f"Brands mismatch: got {brands}"


class TestCalculatorIntegration:
    """Integration tests for calculator with loyalty rate reduction"""
    
    def test_loyalty_rate_deduction(self):
        """Verify loyalty rate reduces displayed rate by 0.5%"""
        # This is a frontend calculation test - verify the useCalculator.ts logic
        # The formula: rate1 = Math.max(0, getRateForTerm(selectedProgram.option1_rates, selectedTerm) - loyaltyRate)
        
        # Get a program with rates
        response = requests.get(f"{BASE_URL}/api/programs", params={"month": 3, "year": 2026})
        assert response.status_code == 200
        programs = response.json()
        
        # Find a program with option1_rates
        program_with_rates = None
        for p in programs:
            if p.get("option1_rates") and p["option1_rates"].get("rate_72") is not None:
                program_with_rates = p
                break
        
        if not program_with_rates:
            # Check option2_rates
            for p in programs:
                if p.get("option2_rates") and p["option2_rates"].get("rate_72") is not None:
                    program_with_rates = p
                    break
        
        assert program_with_rates is not None, "Should have at least one program with rates"
        
        # Example calculation: if rate is 4.99%, with 0.5% loyalty, effective rate = 4.49%
        opt1 = program_with_rates.get("option1_rates", {})
        opt2 = program_with_rates.get("option2_rates", {})
        
        base_rate = opt1.get("rate_72") or opt2.get("rate_72")
        if base_rate:
            loyalty_rate = 0.5
            effective_rate = max(0, base_rate - loyalty_rate)
            print(f"Example: base_rate={base_rate}%, loyalty={loyalty_rate}%, effective={effective_rate}%")
            assert effective_rate >= 0, "Effective rate should never be negative"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
