from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ============ Models ============

class FinancingRates(BaseModel):
    rate_36: float
    rate_48: float
    rate_60: float
    rate_72: float
    rate_84: float
    rate_96: float

class VehicleProgram(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    brand: str
    model: str
    trim: Optional[str] = None
    year: int
    # Option 1: Consumer Cash + 4.99% rate
    consumer_cash: float = 0
    option1_rates: FinancingRates
    # Option 2: No cash + Subvented rates
    option2_rates: Optional[FinancingRates] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class VehicleProgramCreate(BaseModel):
    brand: str
    model: str
    trim: Optional[str] = None
    year: int
    consumer_cash: float = 0
    option1_rates: FinancingRates
    option2_rates: Optional[FinancingRates] = None

class VehicleProgramUpdate(BaseModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    trim: Optional[str] = None
    year: Optional[int] = None
    consumer_cash: Optional[float] = None
    option1_rates: Optional[FinancingRates] = None
    option2_rates: Optional[FinancingRates] = None

class CalculationRequest(BaseModel):
    vehicle_price: float
    program_id: Optional[str] = None

class PaymentComparison(BaseModel):
    term_months: int
    # Option 1: With Consumer Cash + standard rate
    option1_rate: float
    option1_monthly: float
    option1_total: float
    option1_rebate: float
    # Option 2: No cash + subvented rate
    option2_rate: Optional[float] = None
    option2_monthly: Optional[float] = None
    option2_total: Optional[float] = None
    # Best option
    best_option: Optional[str] = None  # "1" or "2" or None
    savings: Optional[float] = None

class CalculationResponse(BaseModel):
    vehicle_price: float
    consumer_cash: float
    brand: str
    model: str
    trim: Optional[str]
    year: int
    comparisons: List[PaymentComparison]

# ============ Utility Functions ============

def calculate_monthly_payment(principal: float, annual_rate: float, months: int) -> float:
    """Calculate monthly payment using amortization formula"""
    if principal <= 0 or months <= 0:
        return 0
    if annual_rate == 0:
        return round(principal / months, 2)
    
    monthly_rate = annual_rate / 100 / 12
    payment = principal * (monthly_rate * (1 + monthly_rate) ** months) / ((1 + monthly_rate) ** months - 1)
    return round(payment, 2)

def get_rate_for_term(rates: FinancingRates, term: int) -> float:
    """Get rate for specific term"""
    rate_map = {
        36: rates.rate_36,
        48: rates.rate_48,
        60: rates.rate_60,
        72: rates.rate_72,
        84: rates.rate_84,
        96: rates.rate_96
    }
    return rate_map.get(term, 4.99)

# ============ Routes ============

@api_router.get("/")
async def root():
    return {"message": "Vehicle Financing Calculator API - v2"}

# Programs CRUD
@api_router.post("/programs", response_model=VehicleProgram)
async def create_program(program: VehicleProgramCreate):
    program_dict = program.dict()
    program_obj = VehicleProgram(**program_dict)
    await db.programs.insert_one(program_obj.dict())
    return program_obj

@api_router.get("/programs", response_model=List[VehicleProgram])
async def get_programs():
    programs = await db.programs.find().to_list(1000)
    return [VehicleProgram(**p) for p in programs]

@api_router.get("/programs/{program_id}", response_model=VehicleProgram)
async def get_program(program_id: str):
    program = await db.programs.find_one({"id": program_id})
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    return VehicleProgram(**program)

@api_router.put("/programs/{program_id}", response_model=VehicleProgram)
async def update_program(program_id: str, update: VehicleProgramUpdate):
    program = await db.programs.find_one({"id": program_id})
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.programs.update_one({"id": program_id}, {"$set": update_data})
    updated = await db.programs.find_one({"id": program_id})
    return VehicleProgram(**updated)

@api_router.delete("/programs/{program_id}")
async def delete_program(program_id: str):
    result = await db.programs.delete_one({"id": program_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Program not found")
    return {"message": "Program deleted successfully"}

# Calculate financing options
@api_router.post("/calculate", response_model=CalculationResponse)
async def calculate_financing(request: CalculationRequest):
    vehicle_price = request.vehicle_price
    
    if not request.program_id:
        raise HTTPException(status_code=400, detail="Program ID is required")
    
    program = await db.programs.find_one({"id": request.program_id})
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    
    program_obj = VehicleProgram(**program)
    consumer_cash = program_obj.consumer_cash
    
    comparisons = []
    terms = [36, 48, 60, 72, 84, 96]
    
    for term in terms:
        # Option 1: With Consumer Cash + standard rate (usually 4.99%)
        option1_rate = get_rate_for_term(program_obj.option1_rates, term)
        principal1 = vehicle_price - consumer_cash
        monthly1 = calculate_monthly_payment(principal1, option1_rate, term)
        total1 = round(monthly1 * term, 2)
        
        comparison = PaymentComparison(
            term_months=term,
            option1_rate=option1_rate,
            option1_monthly=monthly1,
            option1_total=total1,
            option1_rebate=consumer_cash
        )
        
        # Option 2: No cash + subvented rate (if available)
        if program_obj.option2_rates:
            option2_rate = get_rate_for_term(program_obj.option2_rates, term)
            if option2_rate is not None:
                principal2 = vehicle_price  # No rebate
                monthly2 = calculate_monthly_payment(principal2, option2_rate, term)
                total2 = round(monthly2 * term, 2)
                
                comparison.option2_rate = option2_rate
                comparison.option2_monthly = monthly2
                comparison.option2_total = total2
                
                # Determine best option (lowest total cost)
                if total1 < total2:
                    comparison.best_option = "1"
                    comparison.savings = round(total2 - total1, 2)
                elif total2 < total1:
                    comparison.best_option = "2"
                    comparison.savings = round(total1 - total2, 2)
                else:
                    comparison.best_option = "1"  # Equal, prefer cash option
                    comparison.savings = 0
        
        comparisons.append(comparison)
    
    return CalculationResponse(
        vehicle_price=vehicle_price,
        consumer_cash=consumer_cash,
        brand=program_obj.brand,
        model=program_obj.model,
        trim=program_obj.trim,
        year=program_obj.year,
        comparisons=comparisons
    )

# Seed initial data from PDF pages 20-21
@api_router.post("/seed")
async def seed_data():
    # Clear existing data
    await db.programs.delete_many({})
    
    # Standard 4.99% rates for Option 1
    standard_rates = FinancingRates(
        rate_36=4.99, rate_48=4.99, rate_60=4.99,
        rate_72=4.99, rate_84=4.99, rate_96=4.99
    )
    
    programs_data = [
        # ============ 2026 MODELS ============
        # Chrysler
        {"brand": "Chrysler", "model": "Pacifica PHEV", "trim": None, "year": 2026,
         "consumer_cash": 0,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49}},
        
        {"brand": "Chrysler", "model": "Pacifica", "trim": None, "year": 2026,
         "consumer_cash": 0,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49}},
        
        {"brand": "Chrysler", "model": "Grand Caravan", "trim": "SXT", "year": 2026,
         "consumer_cash": 0,
         "option1_rates": standard_rates.dict(),
         "option2_rates": None},
        
        # Jeep Compass 2026
        {"brand": "Jeep", "model": "Compass", "trim": "Sport", "year": 2026,
         "consumer_cash": 0,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49}},
        
        {"brand": "Jeep", "model": "Compass", "trim": "North", "year": 2026,
         "consumer_cash": 3500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49}},
        
        {"brand": "Jeep", "model": "Compass", "trim": "North w/ Altitude Package", "year": 2026,
         "consumer_cash": 4000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49}},
        
        {"brand": "Jeep", "model": "Compass", "trim": "Trailhawk", "year": 2026,
         "consumer_cash": 4000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49}},
        
        {"brand": "Jeep", "model": "Compass", "trim": "Limited", "year": 2026,
         "consumer_cash": 0,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49}},
        
        # Jeep Wrangler 2026
        {"brand": "Jeep", "model": "Wrangler", "trim": "2-Door Rubicon", "year": 2026,
         "consumer_cash": 5250,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        {"brand": "Jeep", "model": "Wrangler", "trim": "4-Door (excl. 392 et 4xe)", "year": 2026,
         "consumer_cash": 6000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        # Jeep Grand Cherokee 2026
        {"brand": "Jeep", "model": "Grand Cherokee/L", "trim": "Laredo/Laredo X", "year": 2026,
         "consumer_cash": 0,
         "option1_rates": {"rate_36": 1.99, "rate_48": 2.99, "rate_60": 3.49, "rate_72": 3.99, "rate_84": 4.49, "rate_96": 4.99},
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 2.49, "rate_96": 3.49}},
        
        {"brand": "Jeep", "model": "Grand Cherokee/L", "trim": "Altitude", "year": 2026,
         "consumer_cash": 0,
         "option1_rates": {"rate_36": 1.99, "rate_48": 2.99, "rate_60": 3.49, "rate_72": 3.99, "rate_84": 4.49, "rate_96": 4.99},
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 2.49, "rate_96": 3.49}},
        
        {"brand": "Jeep", "model": "Grand Cherokee/L", "trim": "Limited/Summit", "year": 2026,
         "consumer_cash": 0,
         "option1_rates": {"rate_36": 1.99, "rate_48": 2.99, "rate_60": 3.49, "rate_72": 3.99, "rate_84": 4.49, "rate_96": 4.99},
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 2.49, "rate_96": 3.49}},
        
        # Jeep Grand Wagoneer 2026
        {"brand": "Jeep", "model": "Grand Wagoneer/L", "trim": None, "year": 2026,
         "consumer_cash": 0,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 3.99}},
        
        # Dodge Durango 2026
        {"brand": "Dodge", "model": "Durango", "trim": "SXT, GT, GT Plus", "year": 2026,
         "consumer_cash": 7500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.49}},
        
        {"brand": "Dodge", "model": "Durango", "trim": "GT Hemi V8 Plus/Premium", "year": 2026,
         "consumer_cash": 9000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.49}},
        
        {"brand": "Dodge", "model": "Durango", "trim": "SRT Hellcat", "year": 2026,
         "consumer_cash": 15500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.49}},
        
        # Ram 1500 2026
        {"brand": "Ram", "model": "1500", "trim": "Tradesman, Express, Warlock", "year": 2026,
         "consumer_cash": 6500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        {"brand": "Ram", "model": "1500", "trim": "Big Horn", "year": 2026,
         "consumer_cash": 6000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        {"brand": "Ram", "model": "1500", "trim": "Sport, Rebel", "year": 2026,
         "consumer_cash": 8250,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        {"brand": "Ram", "model": "1500", "trim": "Laramie, Limited, Longhorn, Tungsten, RHO", "year": 2026,
         "consumer_cash": 11500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        # Ram HD 2026
        {"brand": "Ram", "model": "2500/3500", "trim": "Gas Models", "year": 2026,
         "consumer_cash": 7000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        {"brand": "Ram", "model": "2500/3500", "trim": "Diesel Models", "year": 2026,
         "consumer_cash": 5000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 0.99, "rate_96": 3.49}},
        
        # ============ 2025 MODELS ============
        # Chrysler 2025
        {"brand": "Chrysler", "model": "Grand Caravan", "trim": "SXT", "year": 2025,
         "consumer_cash": 0,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 1.99, "rate_72": 2.99, "rate_84": 3.99, "rate_96": 4.99}},
        
        {"brand": "Chrysler", "model": "Pacifica", "trim": "Select Models", "year": 2025,
         "consumer_cash": 750,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.99}},
        
        {"brand": "Chrysler", "model": "Pacifica", "trim": "(excl. Select & Hybrid)", "year": 2025,
         "consumer_cash": 5500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.49}},
        
        # Jeep Compass 2025
        {"brand": "Jeep", "model": "Compass", "trim": "Sport", "year": 2025,
         "consumer_cash": 7500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0.99, "rate_60": 1.99, "rate_72": 1.99, "rate_84": 3.99, "rate_96": 4.99}},
        
        {"brand": "Jeep", "model": "Compass", "trim": "North", "year": 2025,
         "consumer_cash": 0,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.49}},
        
        {"brand": "Jeep", "model": "Compass", "trim": "Altitude, Trailhawk", "year": 2025,
         "consumer_cash": 750,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.49}},
        
        {"brand": "Jeep", "model": "Compass", "trim": "Limited", "year": 2025,
         "consumer_cash": 1000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.49}},
        
        # Jeep Wrangler 2025
        {"brand": "Jeep", "model": "Wrangler", "trim": "4-Door 4xe", "year": 2025,
         "consumer_cash": 4000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0.99, "rate_48": 1.99, "rate_60": 2.49, "rate_72": 3.49, "rate_84": 3.99, "rate_96": 4.99}},
        
        {"brand": "Jeep", "model": "Wrangler", "trim": "2-Door Rubicon", "year": 2025,
         "consumer_cash": 8500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        {"brand": "Jeep", "model": "Wrangler", "trim": "4-Door (excl. Rubicon 2.0L et 4xe)", "year": 2025,
         "consumer_cash": 8500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        # Jeep Gladiator 2025
        {"brand": "Jeep", "model": "Gladiator", "trim": None, "year": 2025,
         "consumer_cash": 11000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 3.49}},
        
        # Jeep Grand Cherokee 2025
        {"brand": "Jeep", "model": "Grand Cherokee 4xe", "trim": None, "year": 2025,
         "consumer_cash": 4000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0.99, "rate_48": 1.99, "rate_60": 2.49, "rate_72": 3.49, "rate_84": 3.99, "rate_96": 4.99}},
        
        {"brand": "Jeep", "model": "Grand Cherokee L", "trim": "Laredo", "year": 2025,
         "consumer_cash": 6000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.99}},
        
        {"brand": "Jeep", "model": "Grand Cherokee L", "trim": "Altitude", "year": 2025,
         "consumer_cash": 7500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.99}},
        
        {"brand": "Jeep", "model": "Grand Cherokee L", "trim": "(excl. Laredo, Altitude, Overland)", "year": 2025,
         "consumer_cash": 9500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.99}},
        
        # Jeep Wagoneer 2025
        {"brand": "Jeep", "model": "Wagoneer/L", "trim": None, "year": 2025,
         "consumer_cash": 7500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 3.99}},
        
        {"brand": "Jeep", "model": "Grand Wagoneer/L", "trim": None, "year": 2025,
         "consumer_cash": 9500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 3.99}},
        
        {"brand": "Jeep", "model": "Wagoneer S", "trim": "Limited & Premium (BEV)", "year": 2025,
         "consumer_cash": 8000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 2.99}},
        
        # Dodge Durango 2025
        {"brand": "Dodge", "model": "Durango", "trim": "GT, GT Plus", "year": 2025,
         "consumer_cash": 8000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.49}},
        
        {"brand": "Dodge", "model": "Durango", "trim": "R/T, R/T Plus, Citadel", "year": 2025,
         "consumer_cash": 9500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.49}},
        
        {"brand": "Dodge", "model": "Durango", "trim": "SRT Hellcat", "year": 2025,
         "consumer_cash": 16000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.49}},
        
        # Dodge Charger 2025
        {"brand": "Dodge", "model": "Charger Daytona", "trim": "R/T (BEV)", "year": 2025,
         "consumer_cash": 3000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 2.99}},
        
        {"brand": "Dodge", "model": "Charger Daytona", "trim": "R/T Plus (BEV)", "year": 2025,
         "consumer_cash": 5000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 2.99}},
        
        {"brand": "Dodge", "model": "Charger Daytona", "trim": "Scat Pack (BEV)", "year": 2025,
         "consumer_cash": 7000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 2.99}},
        
        # Ram 1500 2025
        {"brand": "Ram", "model": "1500", "trim": "Tradesman, Express, Warlock", "year": 2025,
         "consumer_cash": 9250,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        {"brand": "Ram", "model": "1500", "trim": "Big Horn", "year": 2025,
         "consumer_cash": 9250,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        {"brand": "Ram", "model": "1500", "trim": "Sport, Rebel", "year": 2025,
         "consumer_cash": 10000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        {"brand": "Ram", "model": "1500", "trim": "Laramie, Limited, Longhorn, Tungsten, RHO", "year": 2025,
         "consumer_cash": 12250,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        # Ram HD 2025
        {"brand": "Ram", "model": "2500/3500", "trim": "Gas Models", "year": 2025,
         "consumer_cash": 9500,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}},
        
        {"brand": "Ram", "model": "2500/3500", "trim": "Diesel Models", "year": 2025,
         "consumer_cash": 7000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0.99, "rate_48": 0.99, "rate_60": 0.99, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 2.99}},
        
        {"brand": "Ram", "model": "Chassis Cab", "trim": None, "year": 2025,
         "consumer_cash": 6000,
         "option1_rates": standard_rates.dict(),
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 1.99, "rate_72": 3.49, "rate_84": 3.99, "rate_96": 4.99}},
    ]
    
    for prog_data in programs_data:
        if prog_data.get("option2_rates"):
            prog_data["option2_rates"] = FinancingRates(**prog_data["option2_rates"]).dict()
        prog_data["option1_rates"] = FinancingRates(**prog_data["option1_rates"]).dict()
        prog = VehicleProgram(**prog_data)
        await db.programs.insert_one(prog.dict())
    
    return {"message": f"Seeded {len(programs_data)} programs"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
