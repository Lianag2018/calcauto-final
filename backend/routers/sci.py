from fastapi import APIRouter, HTTPException
from database import db, ROOT_DIR, logger
import json

router = APIRouter()

# ============ SCI LEASE ENDPOINTS ============

@router.get("/sci/residuals")
async def get_sci_residuals():
    """Retourne les valeurs résiduelles SCI pour tous les véhicules"""
    residuals_path = ROOT_DIR / "data" / "sci_residuals_feb2026.json"
    if not residuals_path.exists():
        raise HTTPException(status_code=404, detail="Residual data not found")
    with open(residuals_path, 'r') as f:
        data = json.load(f)
    return data

@router.get("/sci/lease-rates")
async def get_sci_lease_rates():
    """Retourne les taux de location SCI et lease cash"""
    rates_path = ROOT_DIR / "data" / "sci_lease_rates_feb2026.json"
    if not rates_path.exists():
        raise HTTPException(status_code=404, detail="Lease rates data not found")
    with open(rates_path, 'r') as f:
        data = json.load(f)
    return data

@router.get("/sci/vehicle-hierarchy")
async def get_sci_vehicle_hierarchy():
    """Retourne la hiérarchie des véhicules SCI: marque -> modèle -> trim -> body_style"""
    residuals_path = ROOT_DIR / "data" / "sci_residuals_feb2026.json"
    if not residuals_path.exists():
        raise HTTPException(status_code=404, detail="Residual data not found")
    with open(residuals_path, 'r') as f:
        data = json.load(f)
    
    hierarchy = {}
    for v in data.get("vehicles", []):
        brand = v["brand"]
        model = v["model_name"]
        trim = v.get("trim", "")
        body = v.get("body_style", "")
        year = v.get("model_year", 2026)
        
        if brand not in hierarchy:
            hierarchy[brand] = {}
        if model not in hierarchy[brand]:
            hierarchy[brand][model] = {"years": set(), "trims": {}}
        hierarchy[brand][model]["years"].add(year)
        if trim not in hierarchy[brand][model]["trims"]:
            hierarchy[brand][model]["trims"][trim] = []
        if body and body not in hierarchy[brand][model]["trims"][trim]:
            hierarchy[brand][model]["trims"][trim].append(body)
    
    # Convert sets to sorted lists
    result = {}
    for brand, models in hierarchy.items():
        result[brand] = {}
        for model, info in models.items():
            result[brand][model] = {
                "years": sorted(list(info["years"]), reverse=True),
                "trims": info["trims"]
            }
    
    return result

@router.post("/sci/calculate-lease")
async def calculate_lease(payload: dict):
    """
    Calcule le paiement de location SCI.
    
    Formule location:
    - depreciation = (selling_price - residual_value) / term_months
    - finance_charge = (selling_price + residual_value) * (annual_rate / 2400)
    - monthly_payment = depreciation + finance_charge
    - Taxes QC (14.975%) appliquées sur le paiement mensuel
    """
    try:
        msrp = float(payload.get("msrp", 0))
        selling_price = float(payload.get("selling_price", 0))
        term = int(payload.get("term", 36))
        annual_rate = float(payload.get("annual_rate", 0))
        residual_pct = float(payload.get("residual_pct", 0))
        km_per_year = int(payload.get("km_per_year", 24000))
        lease_cash = float(payload.get("lease_cash", 0))
        bonus_cash = float(payload.get("bonus_cash", 0))
        cash_down = float(payload.get("cash_down", 0))
        trade_value = float(payload.get("trade_value", 0))
        trade_owed = float(payload.get("trade_owed", 0))
        frais_dossier = float(payload.get("frais_dossier", 259.95))
        taxe_pneus = float(payload.get("taxe_pneus", 15))
        frais_rdprm = float(payload.get("frais_rdprm", 100))
        
        if msrp <= 0 or selling_price <= 0 or term <= 0:
            raise HTTPException(status_code=400, detail="Invalid input values")
        
        # Load km adjustments
        residuals_path = ROOT_DIR / "data" / "sci_residuals_feb2026.json"
        km_adj = 0
        if residuals_path.exists():
            with open(residuals_path, 'r') as f:
                res_data = json.load(f)
            adjustments = res_data.get("km_adjustments", {}).get("adjustments", {})
            km_key = str(km_per_year)
            term_key = str(term)
            if km_key in adjustments and term_key in adjustments[km_key]:
                km_adj = adjustments[km_key][term_key]
        
        # Adjusted residual
        adjusted_residual_pct = residual_pct + km_adj
        residual_value = msrp * (adjusted_residual_pct / 100)
        
        # Net cap cost: selling_price - lease_cash - trade_net + fees
        trade_net = trade_value - trade_owed
        frais_taxables = frais_dossier + taxe_pneus + frais_rdprm
        
        # Cap cost = selling price + fees - lease cash - trade value
        cap_cost = selling_price + frais_taxables - lease_cash - trade_value
        
        # Taxes on the capitalized cost (before tax items)
        taux_taxe = 0.14975
        taxes_on_cap = (selling_price + frais_taxables - lease_cash - trade_value) * taux_taxe
        
        # Net cap cost after cash down and bonus cash
        net_cap_cost = cap_cost + taxes_on_cap + trade_owed - cash_down - bonus_cash
        
        # Lease payment calculation
        # Depreciation = (Net Cap Cost - Residual Value) / term
        depreciation = (net_cap_cost - residual_value) / term
        
        # Finance charge = (Net Cap Cost + Residual Value) * money factor
        # Money factor = annual_rate / 2400
        money_factor = annual_rate / 2400
        finance_charge = (net_cap_cost + residual_value) * money_factor
        
        # Monthly payment (taxes already included in cap cost for QC)
        monthly_before_tax = depreciation + finance_charge
        
        # In Quebec, taxes are on the monthly payment for leases
        # But since we already taxed the cap cost, we use the simpler model
        monthly_payment = monthly_before_tax
        
        biweekly_payment = monthly_payment * 12 / 26
        weekly_payment = monthly_payment * 12 / 52
        total_cost = monthly_payment * term + residual_value
        
        return {
            "success": True,
            "msrp": msrp,
            "selling_price": selling_price,
            "lease_cash": lease_cash,
            "bonus_cash": bonus_cash,
            "residual_pct": adjusted_residual_pct,
            "residual_value": round(residual_value, 2),
            "km_adjustment": km_adj,
            "annual_rate": annual_rate,
            "term": term,
            "net_cap_cost": round(net_cap_cost, 2),
            "depreciation": round(depreciation, 2),
            "finance_charge": round(finance_charge, 2),
            "monthly_payment": round(monthly_payment, 2),
            "biweekly_payment": round(biweekly_payment, 2),
            "weekly_payment": round(weekly_payment, 2),
            "total_lease_cost": round(total_cost, 2),
            "cash_down": cash_down,
            "trade_value": trade_value,
            "trade_owed": trade_owed,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lease calculation error: {str(e)}")

