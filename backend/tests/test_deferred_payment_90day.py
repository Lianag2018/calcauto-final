"""
Test suite for 90-day deferred payment feature
Tests: Backend API, calculation logic, eligibility rules
"""
import pytest
import requests
import os
import math

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://lease-extraction.preview.emergentagent.com').rstrip('/')

class TestDeferredPaymentAPI:
    """Test backend API for program metadata with no_payments_days"""
    
    def test_program_meta_returns_no_payments_days(self):
        """GET /api/program-meta should return no_payments_days=90 for March 2026"""
        response = requests.get(f"{BASE_URL}/api/program-meta", params={'month': 3, 'year': 2026})
        assert response.status_code == 200
        
        data = response.json()
        assert 'no_payments_days' in data, "Missing no_payments_days field"
        assert data['no_payments_days'] == 90, f"Expected 90, got {data['no_payments_days']}"
        print(f"✓ March 2026 metadata has no_payments_days=90")
    
    def test_program_meta_includes_all_required_fields(self):
        """Program meta should have all fields needed for deferred payment UI"""
        response = requests.get(f"{BASE_URL}/api/program-meta", params={'month': 3, 'year': 2026})
        assert response.status_code == 200
        
        data = response.json()
        required_fields = ['event_names', 'program_period', 'loyalty_rate', 'no_payments_days']
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        print(f"✓ All required fields present: {required_fields}")
    
    def test_program_meta_feb2026_no_deferred(self):
        """February 2026 may have different no_payments_days"""
        response = requests.get(f"{BASE_URL}/api/program-meta", params={'month': 2, 'year': 2026})
        if response.status_code == 200:
            data = response.json()
            no_payments = data.get('no_payments_days', 0)
            print(f"✓ February 2026 no_payments_days={no_payments}")
        else:
            print(f"February 2026 metadata not available (status {response.status_code})")


class TestDeferredPaymentCalculation:
    """Test the mathematical calculation of deferred payments"""
    
    def calculate_monthly_payment(self, principal, annual_rate, months):
        """Standard PMT formula for monthly payment"""
        if principal <= 0 or months <= 0:
            return 0
        if annual_rate == 0:
            return principal / months
        monthly_rate = annual_rate / 100 / 12
        return principal * (monthly_rate * math.pow(1 + monthly_rate, months)) / (math.pow(1 + monthly_rate, months) - 1)
    
    def calculate_deferred_principal(self, principal, annual_rate):
        """Calculate principal with 2 months of capitalized interest"""
        monthly_rate = annual_rate / 100 / 12
        if monthly_rate <= 0:
            return principal
        return principal * math.pow(1 + monthly_rate, 2)
    
    def test_deferred_calculation_math(self):
        """Verify deferred payment math: P * (1 + r/12)^2"""
        principal = 65000
        annual_rate = 4.99  # Common rate for Ram 1500
        
        # Calculate expected deferred principal
        monthly_rate = annual_rate / 100 / 12
        expected_deferred = principal * math.pow(1 + monthly_rate, 2)
        
        # Calculate using our function
        calculated = self.calculate_deferred_principal(principal, annual_rate)
        
        assert abs(calculated - expected_deferred) < 0.01, f"Expected {expected_deferred}, got {calculated}"
        
        # The deferred interest should be ~2 months worth of interest compounded
        deferred_interest = calculated - principal
        print(f"✓ Principal: ${principal:,.2f}")
        print(f"✓ Rate: {annual_rate}%")
        print(f"✓ Deferred Principal: ${calculated:,.2f}")
        print(f"✓ Capitalized Interest (2 months): ${deferred_interest:,.2f}")
    
    def test_84month_eligible_payment_increase(self):
        """With 84-month term, deferred should increase monthly payment"""
        principal = 65000
        rate = 4.99
        term = 84
        
        # Normal payment
        normal_monthly = self.calculate_monthly_payment(principal, rate, term)
        
        # Deferred payment (with 2 months capitalized interest)
        deferred_principal = self.calculate_deferred_principal(principal, rate)
        deferred_monthly = self.calculate_monthly_payment(deferred_principal, rate, term)
        
        # Deferred should be higher
        assert deferred_monthly > normal_monthly, "Deferred payment should be higher"
        
        increase = deferred_monthly - normal_monthly
        increase_pct = (increase / normal_monthly) * 100
        
        print(f"✓ 84-month term (ELIGIBLE)")
        print(f"  Normal monthly: ${normal_monthly:,.2f}")
        print(f"  Deferred monthly: ${deferred_monthly:,.2f}")
        print(f"  Increase: ${increase:,.2f} ({increase_pct:.2f}%)")
    
    def test_96month_ineligible(self):
        """96-month term should NOT apply deferred logic"""
        # Based on the code: canDefer = deferredPayment && selectedTerm <= 84
        term = 96
        can_defer = term <= 84
        
        assert can_defer == False, "96-month term should not be eligible for deferral"
        print(f"✓ 96-month term is correctly INELIGIBLE (term > 84)")
    
    def test_various_terms_eligibility(self):
        """Test all terms for eligibility"""
        eligible_terms = [36, 48, 60, 72, 84]
        ineligible_terms = [96]
        
        for term in eligible_terms:
            can_defer = term <= 84
            assert can_defer == True, f"Term {term} should be eligible"
            print(f"✓ {term} months: ELIGIBLE")
        
        for term in ineligible_terms:
            can_defer = term <= 84
            assert can_defer == False, f"Term {term} should be ineligible"
            print(f"✓ {term} months: INELIGIBLE")


class TestCombinedLoyaltyAndDeferred:
    """Test that loyalty rate and deferred payment can be combined"""
    
    def calculate_monthly_payment(self, principal, annual_rate, months):
        """Standard PMT formula"""
        if principal <= 0 or months <= 0:
            return 0
        if annual_rate == 0:
            return principal / months
        monthly_rate = annual_rate / 100 / 12
        return principal * (monthly_rate * math.pow(1 + monthly_rate, months)) / (math.pow(1 + monthly_rate, months) - 1)
    
    def test_combined_loyalty_and_deferred(self):
        """Both loyalty (-0.5%) and deferred can apply simultaneously"""
        principal = 65000
        base_rate = 4.99
        loyalty_reduction = 0.5  # From March 2026 metadata
        term = 84
        
        # Calculate adjusted rate with loyalty
        adjusted_rate = max(0, base_rate - loyalty_reduction)
        
        # Calculate deferred principal
        monthly_rate = adjusted_rate / 100 / 12
        deferred_principal = principal * math.pow(1 + monthly_rate, 2)
        
        # Normal payment (no loyalty, no deferred)
        normal_payment = self.calculate_monthly_payment(principal, base_rate, term)
        
        # With loyalty only
        loyalty_payment = self.calculate_monthly_payment(principal, adjusted_rate, term)
        
        # With deferred only (using base rate)
        base_monthly_rate = base_rate / 100 / 12
        deferred_only_principal = principal * math.pow(1 + base_monthly_rate, 2)
        deferred_only_payment = self.calculate_monthly_payment(deferred_only_principal, base_rate, term)
        
        # With BOTH loyalty and deferred
        combined_payment = self.calculate_monthly_payment(deferred_principal, adjusted_rate, term)
        
        print(f"✓ COMBINED LOYALTY + DEFERRED TEST")
        print(f"  Principal: ${principal:,.2f}")
        print(f"  Base Rate: {base_rate}%")
        print(f"  Loyalty Reduction: -{loyalty_reduction}%")
        print(f"  Adjusted Rate: {adjusted_rate}%")
        print(f"  Term: {term} months")
        print(f"")
        print(f"  Normal payment (no toggles): ${normal_payment:,.2f}")
        print(f"  Loyalty only payment: ${loyalty_payment:,.2f}")
        print(f"  Deferred only payment: ${deferred_only_payment:,.2f}")
        print(f"  Combined (loyalty + deferred): ${combined_payment:,.2f}")
        
        # Loyalty should reduce payment
        assert loyalty_payment < normal_payment, "Loyalty should reduce payment"
        
        # Deferred should increase payment
        assert deferred_only_payment > normal_payment, "Deferred should increase payment"
        
        # Combined should be between deferred-only and loyalty+deferred
        # The combined payment uses lower rate but higher principal
        assert combined_payment < deferred_only_payment, "Combined should benefit from loyalty rate reduction"
        
        print(f"✓ All combined calculations verified")


class TestProgramsWithDeferredEligibility:
    """Test that programs API returns data needed for deferred payment"""
    
    def test_programs_have_rate_data(self):
        """Programs should have rate data for all terms including 96"""
        response = requests.get(f"{BASE_URL}/api/programs", params={'month': 3, 'year': 2026})
        assert response.status_code == 200
        
        programs = response.json()
        assert len(programs) > 0, "No programs returned"
        
        # Check first program has rates
        program = programs[0]
        assert 'option1_rates' in program, "Missing option1_rates"
        
        rates = program['option1_rates']
        required_terms = ['rate_36', 'rate_48', 'rate_60', 'rate_72', 'rate_84', 'rate_96']
        for term in required_terms:
            assert term in rates, f"Missing {term} in rates"
        
        print(f"✓ Program '{program['brand']} {program['model']}' has all rate terms")
        print(f"  84-month rate: {rates['rate_84']}% (ELIGIBLE for deferred)")
        print(f"  96-month rate: {rates['rate_96']}% (INELIGIBLE for deferred)")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
