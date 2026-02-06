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

class FinancingTerm(BaseModel):
    term_months: int
    interest_rate: float
    rebate_amount: float = 0

class VehicleProgram(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    brand: str
    model: str
    year: int
    financing_terms: List[FinancingTerm]
    consumer_cash: float = 0
    special_notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class VehicleProgramCreate(BaseModel):
    brand: str
    model: str
    year: int
    financing_terms: List[FinancingTerm]
    consumer_cash: float = 0
    special_notes: str = ""

class VehicleProgramUpdate(BaseModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    financing_terms: Optional[List[FinancingTerm]] = None
    consumer_cash: Optional[float] = None
    special_notes: Optional[str] = None

class CalculationRequest(BaseModel):
    vehicle_price: float
    program_id: Optional[str] = None
    custom_rates: Optional[List[FinancingTerm]] = None
    consumer_cash: float = 0

class PaymentOption(BaseModel):
    term_months: int
    option_a_rate: float  # Taux réduit
    option_a_monthly: float
    option_a_total: float
    option_b_rate: float  # 4.99% avec 10% comptant
    option_b_monthly: float
    option_b_total: float
    option_b_down_payment: float
    best_option: str  # "A" or "B"
    savings: float

class CalculationResponse(BaseModel):
    vehicle_price: float
    consumer_cash: float
    payment_options: List[PaymentOption]

# ============ Utility Functions ============

def calculate_monthly_payment(principal: float, annual_rate: float, months: int) -> float:
    """Calculate monthly payment using amortization formula"""
    if annual_rate == 0:
        return principal / months if months > 0 else 0
    
    monthly_rate = annual_rate / 100 / 12
    if monthly_rate == 0:
        return principal / months if months > 0 else 0
    
    payment = principal * (monthly_rate * (1 + monthly_rate) ** months) / ((1 + monthly_rate) ** months - 1)
    return round(payment, 2)

# ============ Routes ============

@api_router.get("/")
async def root():
    return {"message": "Vehicle Financing Calculator API"}

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
    consumer_cash = request.consumer_cash
    
    # Get financing terms either from program or custom
    financing_terms = []
    
    if request.program_id:
        program = await db.programs.find_one({"id": request.program_id})
        if program:
            financing_terms = [FinancingTerm(**t) for t in program.get("financing_terms", [])]
            consumer_cash = program.get("consumer_cash", 0)
    
    if request.custom_rates:
        financing_terms = request.custom_rates
    
    # Default terms if none provided
    if not financing_terms:
        default_terms = [36, 48, 60, 72, 84, 96]
        financing_terms = [FinancingTerm(term_months=t, interest_rate=4.99, rebate_amount=0) for t in default_terms]
    
    payment_options = []
    
    for term in financing_terms:
        # Option A: Taux réduit (promotional rate)
        principal_a = vehicle_price - consumer_cash
        monthly_a = calculate_monthly_payment(principal_a, term.interest_rate, term.term_months)
        total_a = monthly_a * term.term_months
        
        # Option B: 10% comptant + 4.99% + rabais
        down_payment = vehicle_price * 0.10
        principal_b = vehicle_price - down_payment - term.rebate_amount
        rate_b = 4.99
        monthly_b = calculate_monthly_payment(principal_b, rate_b, term.term_months)
        total_b = monthly_b * term.term_months + down_payment
        
        # Determine best option
        best = "A" if total_a <= total_b else "B"
        savings = abs(total_a - total_b)
        
        payment_options.append(PaymentOption(
            term_months=term.term_months,
            option_a_rate=term.interest_rate,
            option_a_monthly=monthly_a,
            option_a_total=total_a,
            option_b_rate=rate_b,
            option_b_monthly=monthly_b,
            option_b_total=total_b,
            option_b_down_payment=down_payment,
            best_option=best,
            savings=round(savings, 2)
        ))
    
    return CalculationResponse(
        vehicle_price=vehicle_price,
        consumer_cash=consumer_cash,
        payment_options=payment_options
    )

# Seed initial data
@api_router.post("/seed")
async def seed_data():
    # Check if data already exists
    count = await db.programs.count_documents({})
    if count > 0:
        return {"message": f"Database already has {count} programs"}
    
    # Initial programs from PDF
    initial_programs = [
        {
            "brand": "Ram",
            "model": "1500 DT",
            "year": 2026,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 0, "rebate_amount": 8000},
                {"term_months": 48, "interest_rate": 0, "rebate_amount": 9000},
                {"term_months": 60, "interest_rate": 0, "rebate_amount": 10000},
                {"term_months": 72, "interest_rate": 1.99, "rebate_amount": 11000},
                {"term_months": 84, "interest_rate": 2.99, "rebate_amount": 11500},
                {"term_months": 96, "interest_rate": 4.99, "rebate_amount": 11500}
            ],
            "consumer_cash": 11500,
            "special_notes": "No Finance Payments for 90 Days"
        },
        {
            "brand": "Ram",
            "model": "1500 DT",
            "year": 2025,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 0, "rebate_amount": 9000},
                {"term_months": 48, "interest_rate": 0, "rebate_amount": 10000},
                {"term_months": 60, "interest_rate": 0, "rebate_amount": 11000},
                {"term_months": 72, "interest_rate": 0, "rebate_amount": 12250},
                {"term_months": 84, "interest_rate": 1.99, "rebate_amount": 12250},
                {"term_months": 96, "interest_rate": 4.99, "rebate_amount": 12250}
            ],
            "consumer_cash": 12250,
            "special_notes": "No Finance Payments for 90 Days"
        },
        {
            "brand": "Jeep",
            "model": "Wrangler",
            "year": 2026,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 0, "rebate_amount": 4000},
                {"term_months": 48, "interest_rate": 0, "rebate_amount": 5000},
                {"term_months": 60, "interest_rate": 0, "rebate_amount": 6000},
                {"term_months": 72, "interest_rate": 1.99, "rebate_amount": 6000},
                {"term_months": 84, "interest_rate": 2.99, "rebate_amount": 6000},
                {"term_months": 96, "interest_rate": 4.99, "rebate_amount": 6000}
            ],
            "consumer_cash": 6000,
            "special_notes": "Enhanced to 0% for 60 Months"
        },
        {
            "brand": "Jeep",
            "model": "Wrangler",
            "year": 2025,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 0, "rebate_amount": 6000},
                {"term_months": 48, "interest_rate": 0, "rebate_amount": 7000},
                {"term_months": 60, "interest_rate": 0, "rebate_amount": 8000},
                {"term_months": 72, "interest_rate": 0, "rebate_amount": 8500},
                {"term_months": 84, "interest_rate": 1.49, "rebate_amount": 8500},
                {"term_months": 96, "interest_rate": 4.99, "rebate_amount": 8500}
            ],
            "consumer_cash": 8500,
            "special_notes": "No Finance Payments for 90 Days"
        },
        {
            "brand": "Jeep",
            "model": "Compass",
            "year": 2026,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 0, "rebate_amount": 2500},
                {"term_months": 48, "interest_rate": 0, "rebate_amount": 3000},
                {"term_months": 60, "interest_rate": 0, "rebate_amount": 4000},
                {"term_months": 72, "interest_rate": 1.49, "rebate_amount": 4000},
                {"term_months": 84, "interest_rate": 2.49, "rebate_amount": 4000},
                {"term_months": 96, "interest_rate": 4.99, "rebate_amount": 4000}
            ],
            "consumer_cash": 4000,
            "special_notes": "Enhanced Alternative Lease rates as low as 1.99%"
        },
        {
            "brand": "Jeep",
            "model": "Compass",
            "year": 2025,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 0, "rebate_amount": 5000},
                {"term_months": 48, "interest_rate": 0, "rebate_amount": 6000},
                {"term_months": 60, "interest_rate": 0, "rebate_amount": 7000},
                {"term_months": 72, "interest_rate": 0, "rebate_amount": 7500},
                {"term_months": 84, "interest_rate": 1.49, "rebate_amount": 7500},
                {"term_months": 96, "interest_rate": 4.99, "rebate_amount": 7500}
            ],
            "consumer_cash": 7500,
            "special_notes": "No Finance Payments for 90 Days"
        },
        {
            "brand": "Jeep",
            "model": "Grand Cherokee",
            "year": 2025,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 0, "rebate_amount": 7000},
                {"term_months": 48, "interest_rate": 0, "rebate_amount": 8000},
                {"term_months": 60, "interest_rate": 0, "rebate_amount": 9000},
                {"term_months": 72, "interest_rate": 0, "rebate_amount": 9500},
                {"term_months": 84, "interest_rate": 1.99, "rebate_amount": 9500},
                {"term_months": 96, "interest_rate": 4.99, "rebate_amount": 9500}
            ],
            "consumer_cash": 9500,
            "special_notes": "Enhanced Consumer Cash by up to $1,000"
        },
        {
            "brand": "Dodge",
            "model": "Durango",
            "year": 2026,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 0, "rebate_amount": 6000},
                {"term_months": 48, "interest_rate": 0, "rebate_amount": 7000},
                {"term_months": 60, "interest_rate": 0, "rebate_amount": 9000},
                {"term_months": 72, "interest_rate": 1.99, "rebate_amount": 9000},
                {"term_months": 84, "interest_rate": 2.99, "rebate_amount": 9000},
                {"term_months": 96, "interest_rate": 4.99, "rebate_amount": 9000}
            ],
            "consumer_cash": 9000,
            "special_notes": "Enhanced Consumer Cash by $1,000"
        },
        {
            "brand": "Chrysler",
            "model": "Pacifica",
            "year": 2026,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 0, "rebate_amount": 3000},
                {"term_months": 48, "interest_rate": 0, "rebate_amount": 4000},
                {"term_months": 60, "interest_rate": 0, "rebate_amount": 5000},
                {"term_months": 72, "interest_rate": 0, "rebate_amount": 5500},
                {"term_months": 84, "interest_rate": 1.99, "rebate_amount": 5500},
                {"term_months": 96, "interest_rate": 4.99, "rebate_amount": 5500}
            ],
            "consumer_cash": 5500,
            "special_notes": "No Finance Payments for 90 Days"
        },
        {
            "brand": "Chrysler",
            "model": "Grand Caravan",
            "year": 2026,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 4.99, "rebate_amount": 0},
                {"term_months": 48, "interest_rate": 4.99, "rebate_amount": 0},
                {"term_months": 60, "interest_rate": 5.49, "rebate_amount": 0},
                {"term_months": 72, "interest_rate": 5.99, "rebate_amount": 0},
                {"term_months": 84, "interest_rate": 6.49, "rebate_amount": 0},
                {"term_months": 96, "interest_rate": 6.99, "rebate_amount": 0}
            ],
            "consumer_cash": 0,
            "special_notes": "Starting at $49,995"
        },
        {
            "brand": "Ram",
            "model": "HD 2500/3500 Gas",
            "year": 2026,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 0, "rebate_amount": 5000},
                {"term_months": 48, "interest_rate": 0, "rebate_amount": 6000},
                {"term_months": 60, "interest_rate": 0, "rebate_amount": 7000},
                {"term_months": 72, "interest_rate": 0, "rebate_amount": 7000},
                {"term_months": 84, "interest_rate": 1.99, "rebate_amount": 7000},
                {"term_months": 96, "interest_rate": 4.99, "rebate_amount": 7000}
            ],
            "consumer_cash": 7000,
            "special_notes": "Gas Models - No Finance Payments for 90 Days"
        },
        {
            "brand": "Ram",
            "model": "HD 2500/3500 Diesel",
            "year": 2026,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 0.99, "rebate_amount": 3000},
                {"term_months": 48, "interest_rate": 0.99, "rebate_amount": 4000},
                {"term_months": 60, "interest_rate": 0.99, "rebate_amount": 5000},
                {"term_months": 72, "interest_rate": 0.99, "rebate_amount": 5000},
                {"term_months": 84, "interest_rate": 2.49, "rebate_amount": 5000},
                {"term_months": 96, "interest_rate": 4.99, "rebate_amount": 5000}
            ],
            "consumer_cash": 5000,
            "special_notes": "Diesel Models - Enhanced rates as low as 0.99%"
        },
        {
            "brand": "Jeep",
            "model": "Gladiator",
            "year": 2026,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 2.99, "rebate_amount": 2000},
                {"term_months": 48, "interest_rate": 2.99, "rebate_amount": 3000},
                {"term_months": 60, "interest_rate": 3.49, "rebate_amount": 4000},
                {"term_months": 72, "interest_rate": 3.99, "rebate_amount": 4000},
                {"term_months": 84, "interest_rate": 4.49, "rebate_amount": 4000},
                {"term_months": 96, "interest_rate": 4.99, "rebate_amount": 4000}
            ],
            "consumer_cash": 4000,
            "special_notes": "No Finance Payments for 90 Days"
        },
        {
            "brand": "Jeep",
            "model": "Cherokee",
            "year": 2026,
            "financing_terms": [
                {"term_months": 36, "interest_rate": 4.99, "rebate_amount": 0},
                {"term_months": 48, "interest_rate": 4.99, "rebate_amount": 0},
                {"term_months": 60, "interest_rate": 4.99, "rebate_amount": 0},
                {"term_months": 72, "interest_rate": 4.99, "rebate_amount": 0},
                {"term_months": 84, "interest_rate": 4.99, "rebate_amount": 0},
                {"term_months": 96, "interest_rate": 4.99, "rebate_amount": 0}
            ],
            "consumer_cash": 0,
            "special_notes": "No Finance Payments for 90 Days"
        }
    ]
    
    for prog_data in initial_programs:
        prog = VehicleProgram(**prog_data)
        await db.programs.insert_one(prog.dict())
    
    return {"message": f"Seeded {len(initial_programs)} programs"}

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
