from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import base64
import json
import re

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

# Admin password for import (from .env)
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Liana2018')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')

# Gmail SMTP Configuration
SMTP_EMAIL = os.environ.get('SMTP_EMAIL', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))

# ============ Models ============

class FinancingRates(BaseModel):
    """Taux de financement pour chaque terme (36-96 mois)"""
    rate_36: float
    rate_48: float
    rate_60: float
    rate_72: float
    rate_84: float
    rate_96: float

class VehicleProgram(BaseModel):
    """
    Structure d'un programme de financement véhicule
    
    RÈGLES IMPORTANTES:
    - Option 1 (Consumer Cash): Rabais AVANT TAXES + taux d'intérêt (variables selon le véhicule)
    - Option 2 (Alternative): Rabais = $0 + taux réduits (peut être None si non disponible)
    - Bonus Cash: Rabais APRÈS TAXES (comme comptant), combinable avec Option 1 OU 2
    - Les taux sont FIXES (non variables)
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    brand: str
    model: str
    trim: Optional[str] = None
    year: int
    
    # Option 1: Consumer Cash (rabais AVANT taxes) + taux Consumer Cash
    consumer_cash: float = 0  # Rabais avant taxes
    option1_rates: FinancingRates
    
    # Option 2: Alternative Consumer Cash (généralement $0) + taux réduits
    # None = Option 2 non disponible pour ce véhicule
    option2_rates: Optional[FinancingRates] = None
    
    # Bonus Cash: Rabais APRÈS taxes (combinable avec Option 1 ou 2)
    bonus_cash: float = 0
    
    # Métadonnées du programme
    program_month: int = Field(default_factory=lambda: datetime.utcnow().month)
    program_year: int = Field(default_factory=lambda: datetime.utcnow().year)
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
    bonus_cash: float = 0
    program_month: Optional[int] = None
    program_year: Optional[int] = None

class VehicleProgramUpdate(BaseModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    trim: Optional[str] = None
    year: Optional[int] = None
    consumer_cash: Optional[float] = None
    option1_rates: Optional[FinancingRates] = None
    option2_rates: Optional[FinancingRates] = None
    bonus_cash: Optional[float] = None

class CalculationRequest(BaseModel):
    vehicle_price: float
    program_id: Optional[str] = None

class PaymentComparison(BaseModel):
    term_months: int
    # Option 1: Consumer Cash + taux
    option1_rate: float
    option1_monthly: float
    option1_total: float
    option1_rebate: float  # Consumer Cash (avant taxes)
    # Option 2: Taux réduits (si disponible)
    option2_rate: Optional[float] = None
    option2_monthly: Optional[float] = None
    option2_total: Optional[float] = None
    # Meilleure option
    best_option: Optional[str] = None
    savings: Optional[float] = None

class CalculationResponse(BaseModel):
    vehicle_price: float
    consumer_cash: float
    bonus_cash: float
    brand: str
    model: str
    trim: Optional[str]
    year: int
    comparisons: List[PaymentComparison]

class ProgramPeriod(BaseModel):
    month: int
    year: int
    count: int

class ImportRequest(BaseModel):
    password: str
    programs: List[Dict[str, Any]]
    program_month: int
    program_year: int

# ============ Utility Functions ============

def calculate_monthly_payment(principal: float, annual_rate: float, months: int) -> float:
    """Calcule le paiement mensuel avec la formule d'amortissement"""
    if principal <= 0 or months <= 0:
        return 0
    if annual_rate == 0:
        return round(principal / months, 2)
    
    monthly_rate = annual_rate / 100 / 12
    payment = principal * (monthly_rate * (1 + monthly_rate) ** months) / ((1 + monthly_rate) ** months - 1)
    return round(payment, 2)

def get_rate_for_term(rates: FinancingRates, term: int) -> float:
    """Obtient le taux pour un terme spécifique"""
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
    return {"message": "Vehicle Financing Calculator API - v4 (avec historique et Bonus Cash)"}

# Get available program periods (for history)
@api_router.get("/periods", response_model=List[ProgramPeriod])
async def get_periods():
    """Récupère les périodes de programmes disponibles (pour l'historique)"""
    pipeline = [
        {"$group": {
            "_id": {"month": "$program_month", "year": "$program_year"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id.year": -1, "_id.month": -1}}
    ]
    periods = await db.programs.aggregate(pipeline).to_list(100)
    return [ProgramPeriod(month=p["_id"]["month"], year=p["_id"]["year"], count=p["count"]) for p in periods]

# Programs CRUD
@api_router.post("/programs", response_model=VehicleProgram)
async def create_program(program: VehicleProgramCreate):
    program_dict = program.dict()
    if program_dict.get("program_month") is None:
        program_dict["program_month"] = datetime.utcnow().month
    if program_dict.get("program_year") is None:
        program_dict["program_year"] = datetime.utcnow().year
    program_obj = VehicleProgram(**program_dict)
    await db.programs.insert_one(program_obj.dict())
    return program_obj

@api_router.get("/programs", response_model=List[VehicleProgram])
async def get_programs(month: Optional[int] = None, year: Optional[int] = None):
    """
    Récupère les programmes de financement
    Si month/year sont fournis, filtre par période
    Sinon, retourne la période la plus récente
    """
    if month and year:
        query = {"program_month": month, "program_year": year}
    else:
        # Trouver la période la plus récente
        latest = await db.programs.find_one(sort=[("program_year", -1), ("program_month", -1)])
        if latest:
            query = {"program_month": latest.get("program_month"), "program_year": latest.get("program_year")}
        else:
            query = {}
    
    programs = await db.programs.find(query).to_list(1000)
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

# Import programs with password protection
@api_router.post("/import")
async def import_programs(request: ImportRequest):
    """
    Importe des programmes de financement (protégé par mot de passe)
    Remplace tous les programmes pour le mois/année spécifié
    """
    if request.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    
    # Supprimer les programmes existants pour cette période
    await db.programs.delete_many({
        "program_month": request.program_month,
        "program_year": request.program_year
    })
    
    # Insérer les nouveaux programmes
    inserted = 0
    for prog_data in request.programs:
        # Assurer que les taux sont au bon format
        if prog_data.get("option1_rates") and isinstance(prog_data["option1_rates"], dict):
            prog_data["option1_rates"] = FinancingRates(**prog_data["option1_rates"]).dict()
        if prog_data.get("option2_rates") and isinstance(prog_data["option2_rates"], dict):
            prog_data["option2_rates"] = FinancingRates(**prog_data["option2_rates"]).dict()
        
        prog_data["program_month"] = request.program_month
        prog_data["program_year"] = request.program_year
        prog_data["bonus_cash"] = prog_data.get("bonus_cash", 0)
        
        prog = VehicleProgram(**prog_data)
        await db.programs.insert_one(prog.dict())
        inserted += 1
    
    return {"message": f"Importé {inserted} programmes pour {request.program_month}/{request.program_year}"}

# Calculate financing options
@api_router.post("/calculate", response_model=CalculationResponse)
async def calculate_financing(request: CalculationRequest):
    """
    Calcule et compare les options de financement
    
    Option 1: Prix - Consumer Cash (rabais avant taxes), avec taux Option 1
    Option 2: Prix complet, avec taux réduits (si disponible)
    
    Note: Bonus Cash est affiché mais non inclus dans le calcul du financement
    (car appliqué après taxes, comme comptant)
    """
    vehicle_price = request.vehicle_price
    
    if not request.program_id:
        raise HTTPException(status_code=400, detail="Program ID is required")
    
    program = await db.programs.find_one({"id": request.program_id})
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    
    program_obj = VehicleProgram(**program)
    consumer_cash = program_obj.consumer_cash
    bonus_cash = program_obj.bonus_cash
    
    comparisons = []
    terms = [36, 48, 60, 72, 84, 96]
    
    for term in terms:
        # Option 1: Avec Consumer Cash (rabais avant taxes) + taux Option 1
        option1_rate = get_rate_for_term(program_obj.option1_rates, term)
        principal1 = vehicle_price - consumer_cash  # Rabais avant taxes
        monthly1 = calculate_monthly_payment(principal1, option1_rate, term)
        total1 = round(monthly1 * term, 2)
        
        comparison = PaymentComparison(
            term_months=term,
            option1_rate=option1_rate,
            option1_monthly=monthly1,
            option1_total=total1,
            option1_rebate=consumer_cash
        )
        
        # Option 2: Sans rabais + taux réduits (si disponible)
        if program_obj.option2_rates:
            option2_rate = get_rate_for_term(program_obj.option2_rates, term)
            principal2 = vehicle_price  # Pas de rabais
            monthly2 = calculate_monthly_payment(principal2, option2_rate, term)
            total2 = round(monthly2 * term, 2)
            
            comparison.option2_rate = option2_rate
            comparison.option2_monthly = monthly2
            comparison.option2_total = total2
            
            # Déterminer la meilleure option (coût total le plus bas)
            if total1 < total2:
                comparison.best_option = "1"
                comparison.savings = round(total2 - total1, 2)
            elif total2 < total1:
                comparison.best_option = "2"
                comparison.savings = round(total1 - total2, 2)
            else:
                comparison.best_option = "1"
                comparison.savings = 0
        
        comparisons.append(comparison)
    
    return CalculationResponse(
        vehicle_price=vehicle_price,
        consumer_cash=consumer_cash,
        bonus_cash=bonus_cash,
        brand=program_obj.brand,
        model=program_obj.model,
        trim=program_obj.trim,
        year=program_obj.year,
        comparisons=comparisons
    )

# Seed initial data from PDF pages 20-21 (Février 2026)
@api_router.post("/seed")
async def seed_data():
    """
    Seed les données initiales à partir du PDF Février 2026
    Pages 20 (2026) et 21 (2025)
    """
    # Clear existing data
    await db.programs.delete_many({})
    
    # Taux standard 4.99% pour la plupart des véhicules
    std = {"rate_36": 4.99, "rate_48": 4.99, "rate_60": 4.99, "rate_72": 4.99, "rate_84": 4.99, "rate_96": 4.99}
    
    # Mois/Année du programme
    prog_month = 2
    prog_year = 2026
    
    programs_data = [
        # ==================== 2026 MODELS (Page 20) ====================
        
        # CHRYSLER 2026
        {"brand": "Chrysler", "model": "Grand Caravan", "trim": "SXT", "year": 2026,
         "consumer_cash": 0, "option1_rates": std, 
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49}, 
         "bonus_cash": 0},
        
        {"brand": "Chrysler", "model": "Pacifica", "trim": "PHEV", "year": 2026,
         "consumer_cash": 0, "option1_rates": std, 
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49}, 
         "bonus_cash": 0},
        
        # Pacifica (excluding PHEV): Taux bas (0% jusqu'à 72mo, 1.99% à 84mo, 3.49% à 96mo), PAS d'Option 2
        {"brand": "Chrysler", "model": "Pacifica", "trim": "(excluding PHEV)", "year": 2026,
         "consumer_cash": 0,
         "option1_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 3.49},
         "option2_rates": None, "bonus_cash": 0},
        
        # JEEP COMPASS 2026 - Taux Option 2 corrigés
        {"brand": "Jeep", "model": "Compass", "trim": "Sport", "year": 2026,
         "consumer_cash": 0, "option1_rates": std, 
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49}, 
         "bonus_cash": 0},
        
        {"brand": "Jeep", "model": "Compass", "trim": "North", "year": 2026,
         "consumer_cash": 3500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49},
         "bonus_cash": 0},
        
        {"brand": "Jeep", "model": "Compass", "trim": "North w/ Altitude Package (ADZ)", "year": 2026,
         "consumer_cash": 4000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49},
         "bonus_cash": 0},
        
        {"brand": "Jeep", "model": "Compass", "trim": "Trailhawk", "year": 2026,
         "consumer_cash": 4000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49},
         "bonus_cash": 0},
        
        {"brand": "Jeep", "model": "Compass", "trim": "Limited", "year": 2026,
         "consumer_cash": 0, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 1.99, "rate_96": 3.49},
         "bonus_cash": 0},
        
        # JEEP CHEROKEE 2026
        {"brand": "Jeep", "model": "Cherokee", "trim": "Base (KMJL74)", "year": 2026,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 0},
        
        {"brand": "Jeep", "model": "Cherokee", "trim": "(excluding Base)", "year": 2026,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 0},
        
        # JEEP WRANGLER 2026 - Corrigé avec Option 2
        {"brand": "Jeep", "model": "Wrangler", "trim": "2-Door (JL) non Rubicon", "year": 2026,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 0},
        
        {"brand": "Jeep", "model": "Wrangler", "trim": "2-Door Rubicon (JL)", "year": 2026,
         "consumer_cash": 0, "option1_rates": std, 
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}, 
         "bonus_cash": 0},
        
        {"brand": "Jeep", "model": "Wrangler", "trim": "4-Door (excl. 392 et 4xe)", "year": 2026,
         "consumer_cash": 5250, "option1_rates": std, 
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99}, 
         "bonus_cash": 0},
        
        {"brand": "Jeep", "model": "Wrangler", "trim": "4-Door MOAB 392", "year": 2026,
         "consumer_cash": 6000, "option1_rates": std, "option2_rates": None, "bonus_cash": 0},
        
        # JEEP GLADIATOR 2026
        {"brand": "Jeep", "model": "Gladiator", "trim": "Sport S, Willys, Sahara, Willys '41", "year": 2026,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 0},
        
        {"brand": "Jeep", "model": "Gladiator", "trim": "(excl. Sport S, Willys, Sahara, Willys '41)", "year": 2026,
         "consumer_cash": 0, "option1_rates": std, 
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.49}, 
         "bonus_cash": 0},
        
        # JEEP GRAND CHEROKEE 2026 - Taux variables Option 1 et Option 2 corrigés
        {"brand": "Jeep", "model": "Grand Cherokee/L", "trim": "Laredo/Laredo X", "year": 2026,
         "consumer_cash": 0,
         "option1_rates": {"rate_36": 1.99, "rate_48": 2.99, "rate_60": 3.49, "rate_72": 3.99, "rate_84": 4.49, "rate_96": 4.99},
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 2.49, "rate_96": 3.49},
         "bonus_cash": 0},
        
        {"brand": "Jeep", "model": "Grand Cherokee/L", "trim": "Altitude", "year": 2026,
         "consumer_cash": 0,
         "option1_rates": {"rate_36": 1.99, "rate_48": 2.99, "rate_60": 3.49, "rate_72": 3.99, "rate_84": 4.49, "rate_96": 4.99},
         "option2_rates": None,
         "bonus_cash": 0},
        
        {"brand": "Jeep", "model": "Grand Cherokee/L", "trim": "Limited/Limited Reserve/Summit", "year": 2026,
         "consumer_cash": 0,
         "option1_rates": {"rate_36": 1.99, "rate_48": 2.99, "rate_60": 3.49, "rate_72": 3.99, "rate_84": 4.49, "rate_96": 4.99},
         "option2_rates": None,
         "bonus_cash": 0},
        
        # JEEP GRAND WAGONEER 2026
        {"brand": "Jeep", "model": "Grand Wagoneer/L", "trim": None, "year": 2026,
         "consumer_cash": 0, "option1_rates": std, 
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 3.99}, 
         "bonus_cash": 0},
        
        # DODGE DURANGO 2026
        {"brand": "Dodge", "model": "Durango", "trim": "SXT, GT, GT Plus", "year": 2026,
         "consumer_cash": 7500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 2.49, "rate_96": 3.49},
         "bonus_cash": 0},
        
        {"brand": "Dodge", "model": "Durango", "trim": "GT Hemi V8 Plus, GT Hemi V8 Premium", "year": 2026,
         "consumer_cash": 9000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 2.49, "rate_96": 3.49},
         "bonus_cash": 0},
        
        {"brand": "Dodge", "model": "Durango", "trim": "SRT Hellcat", "year": 2026,
         "consumer_cash": 15500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.49, "rate_84": 2.49, "rate_96": 3.49},
         "bonus_cash": 0},
        
        # DODGE CHARGER 2026
        {"brand": "Dodge", "model": "Charger", "trim": "2-Door & 4-Door (ICE)", "year": 2026,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 0},
        
        # RAM 2026 - Corrigé
        {"brand": "Ram", "model": "ProMaster", "trim": None, "year": 2026,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 0},
        
        {"brand": "Ram", "model": "1500", "trim": "Tradesman, Express, Warlock", "year": 2026,
         "consumer_cash": 6500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.99, "rate_84": 2.99, "rate_96": 3.99},
         "bonus_cash": 0},
        
        {"brand": "Ram", "model": "1500", "trim": "Big Horn", "year": 2026,
         "consumer_cash": 6000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.99, "rate_84": 2.99, "rate_96": 3.99},
         "bonus_cash": 0},
        
        {"brand": "Ram", "model": "1500", "trim": "Sport, Rebel", "year": 2026,
         "consumer_cash": 8250, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.99, "rate_84": 2.99, "rate_96": 3.99},
         "bonus_cash": 0},
        
        {"brand": "Ram", "model": "1500", "trim": "Laramie (DT6P98)", "year": 2026,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 0},
        
        {"brand": "Ram", "model": "1500", "trim": "Laramie, Limited, Longhorn, Tungsten, RHO (excl. DT6P98)", "year": 2026,
         "consumer_cash": 11500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 3.49},
         "bonus_cash": 0},
        
        {"brand": "Ram", "model": "2500 Power Wagon Crew Cab", "trim": "(DJ7X91 2UP)", "year": 2026,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 0},
        
        {"brand": "Ram", "model": "2500/3500", "trim": "Gas Models", "year": 2026,
         "consumer_cash": 7000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 1.99, "rate_84": 2.99, "rate_96": 3.99},
         "bonus_cash": 0},
        
        {"brand": "Ram", "model": "2500/3500", "trim": "Diesel Models", "year": 2026,
         "consumer_cash": 5000, "option1_rates": std,
         "option2_rates": {"rate_36": 0.99, "rate_48": 0.99, "rate_60": 0.99, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 3.49},
         "bonus_cash": 0},
        
        {"brand": "Ram", "model": "Chassis Cab", "trim": None, "year": 2026,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 0},
        
        # ==================== 2025 MODELS (Page 21) ====================
        
        # CHRYSLER 2025 - Corrigé
        {"brand": "Chrysler", "model": "Grand Caravan", "trim": "SXT", "year": 2025,
         "consumer_cash": 0, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.99},
         "bonus_cash": 1000},
        
        {"brand": "Chrysler", "model": "Pacifica", "trim": "Hybrid", "year": 2025,
         "consumer_cash": 0, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 1.99, "rate_72": 2.99, "rate_84": 3.99, "rate_96": 4.99},
         "bonus_cash": 1000},
        
        {"brand": "Chrysler", "model": "Pacifica", "trim": "Select Models (excl. Hybrid)", "year": 2025,
         "consumer_cash": 0, 
         "option1_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 1.99, "rate_72": 2.99, "rate_84": 3.99, "rate_96": 4.99},
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.49},
         "bonus_cash": 1000},
        
        {"brand": "Chrysler", "model": "Pacifica", "trim": "(excl. Select & Hybrid)", "year": 2025,
         "consumer_cash": 750, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.49},
         "bonus_cash": 1000},
        
        # JEEP COMPASS 2025 - Corrigé
        {"brand": "Jeep", "model": "Compass", "trim": "Sport", "year": 2025,
         "consumer_cash": 5500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.49},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Compass", "trim": "North", "year": 2025,
         "consumer_cash": 7500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0.99, "rate_60": 1.99, "rate_72": 1.99, "rate_84": 3.99, "rate_96": 4.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Compass", "trim": "Altitude, Trailhawk, Trailhawk Elite", "year": 2025,
         "consumer_cash": 4000, "option1_rates": std,
         "option2_rates": {"rate_36": 0.99, "rate_48": 1.99, "rate_60": 2.49, "rate_72": 3.49, "rate_84": 3.99, "rate_96": 4.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Compass", "trim": "Limited", "year": 2025,
         "consumer_cash": 0, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.49, "rate_96": 2.49},
         "bonus_cash": 1000},
        
        # JEEP WRANGLER 2025 - Corrigé
        {"brand": "Jeep", "model": "Wrangler", "trim": "4-Door (JL) 4xe (JLXL74)", "year": 2025,
         "consumer_cash": 4000, "option1_rates": std,
         "option2_rates": {"rate_36": 0.99, "rate_48": 1.99, "rate_60": 2.49, "rate_72": 3.49, "rate_84": 3.99, "rate_96": 4.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Wrangler", "trim": "4-Door (JL) 4xe (excl. JLXL74)", "year": 2025,
         "consumer_cash": 4000, "option1_rates": std,
         "option2_rates": {"rate_36": 0.99, "rate_48": 1.99, "rate_60": 2.49, "rate_72": 3.49, "rate_84": 3.99, "rate_96": 4.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Wrangler", "trim": "2-Door (JL) non Rubicon", "year": 2025,
         "consumer_cash": 750, "option1_rates": std, "option2_rates": None, "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Wrangler", "trim": "2-Door Rubicon (JL)", "year": 2025,
         "consumer_cash": 8500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Wrangler", "trim": "4-Door Rubicon w/ 2.0L", "year": 2025,
         "consumer_cash": 0, 
         "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Wrangler", "trim": "4-Door (JL) (excl. Rubicon 2.0L & 4xe)", "year": 2025,
         "consumer_cash": 8500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99},
         "bonus_cash": 1000},
        
        # JEEP GLADIATOR 2025
        {"brand": "Jeep", "model": "Gladiator", "trim": None, "year": 2025,
         "consumer_cash": 11000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 3.49},
         "bonus_cash": 1000},
        
        # JEEP GRAND CHEROKEE 2025 - Corrigé
        {"brand": "Jeep", "model": "Grand Cherokee", "trim": "4xe (WL)", "year": 2025,
         "consumer_cash": 4000, "option1_rates": std,
         "option2_rates": {"rate_36": 0.99, "rate_48": 1.99, "rate_60": 2.49, "rate_72": 3.49, "rate_84": 3.99, "rate_96": 4.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Grand Cherokee", "trim": "Laredo (WLJH74 2*A)", "year": 2025,
         "consumer_cash": 6000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Grand Cherokee", "trim": "Altitude (WLJH74 2*B)", "year": 2025,
         "consumer_cash": 7500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Grand Cherokee", "trim": "Summit (WLJT74 23S)", "year": 2025,
         "consumer_cash": 0, 
         "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Grand Cherokee", "trim": "(WL) (excl. Laredo, Altitude, Summit, 4xe)", "year": 2025,
         "consumer_cash": 9500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.99},
         "bonus_cash": 1000},
        
        # JEEP GRAND CHEROKEE L 2025 - Corrigé
        {"brand": "Jeep", "model": "Grand Cherokee L", "trim": "Laredo (WLJH75 2*A)", "year": 2025,
         "consumer_cash": 6000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Grand Cherokee L", "trim": "Altitude (WLJH75 2*B)", "year": 2025,
         "consumer_cash": 7500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Grand Cherokee L", "trim": "Overland (WLJS75)", "year": 2025,
         "consumer_cash": 0, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Grand Cherokee L", "trim": "(WL) (excl. Laredo, Altitude, Overland)", "year": 2025,
         "consumer_cash": 9500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.99},
         "bonus_cash": 1000},
        
        # JEEP WAGONEER 2025 - Corrigé
        {"brand": "Jeep", "model": "Wagoneer/L", "trim": None, "year": 2025,
         "consumer_cash": 7500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 3.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Grand Wagoneer/L", "trim": None, "year": 2025,
         "consumer_cash": 9500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 3.99},
         "bonus_cash": 1000},
        
        {"brand": "Jeep", "model": "Wagoneer S", "trim": "Limited & Premium (BEV)", "year": 2025,
         "consumer_cash": 8000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 2.99},
         "bonus_cash": 1000},
        
        # DODGE DURANGO 2025 - Corrigé
        {"brand": "Dodge", "model": "Durango", "trim": "GT, GT Plus", "year": 2025,
         "consumer_cash": 8000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.49},
         "bonus_cash": 1000},
        
        {"brand": "Dodge", "model": "Durango", "trim": "R/T, R/T Plus, R/T 20th Anniversary", "year": 2025,
         "consumer_cash": 9500, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.49},
         "bonus_cash": 1000},
        
        {"brand": "Dodge", "model": "Durango", "trim": "SRT Hellcat", "year": 2025,
         "consumer_cash": 16000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 2.99, "rate_96": 3.49},
         "bonus_cash": 1000},
        
        # DODGE CHARGER 2025 - Corrigé
        {"brand": "Dodge", "model": "Charger Daytona", "trim": "R/T (BEV)", "year": 2025,
         "consumer_cash": 3000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 2.99},
         "bonus_cash": 1000},
        
        {"brand": "Dodge", "model": "Charger Daytona", "trim": "R/T Plus (BEV)", "year": 2025,
         "consumer_cash": 5000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 2.99},
         "bonus_cash": 1000},
        
        {"brand": "Dodge", "model": "Charger Daytona", "trim": "Scat Pack (BEV)", "year": 2025,
         "consumer_cash": 7000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 2.99},
         "bonus_cash": 1000},
        
        # DODGE HORNET 2025
        {"brand": "Dodge", "model": "Hornet", "trim": "RT (PHEV)", "year": 2025,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 1000},
        
        {"brand": "Dodge", "model": "Hornet", "trim": "RT Plus (PHEV)", "year": 2025,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 1000},
        
        {"brand": "Dodge", "model": "Hornet", "trim": "GT (Gas)", "year": 2025,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 1000},
        
        {"brand": "Dodge", "model": "Hornet", "trim": "GT Plus (Gas)", "year": 2025,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 1000},
        
        # RAM 2025 - Corrigé
        {"brand": "Ram", "model": "ProMaster", "trim": None, "year": 2025,
         "consumer_cash": 0, "option1_rates": std, "option2_rates": None, "bonus_cash": 3000},
        
        {"brand": "Ram", "model": "1500", "trim": "Tradesman, Warlock, Express (DT)", "year": 2025,
         "consumer_cash": 9250, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99},
         "bonus_cash": 3000},
        
        {"brand": "Ram", "model": "1500", "trim": "Big Horn (DT) w/ Off-Roader Value Package (4KF)", "year": 2025,
         "consumer_cash": 0, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99},
         "bonus_cash": 3000},
        
        {"brand": "Ram", "model": "1500", "trim": "Big Horn (DT) (excl. Off-Roader)", "year": 2025,
         "consumer_cash": 9250, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99},
         "bonus_cash": 3000},
        
        {"brand": "Ram", "model": "1500", "trim": "Sport, Rebel (DT)", "year": 2025,
         "consumer_cash": 10000, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99},
         "bonus_cash": 3000},
        
        {"brand": "Ram", "model": "1500", "trim": "Laramie, Limited, Longhorn, Tungsten, RHO (DT)", "year": 2025,
         "consumer_cash": 12250, "option1_rates": std,
         "option2_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 0, "rate_72": 0, "rate_84": 1.99, "rate_96": 2.99},
         "bonus_cash": 3000},
        
        {"brand": "Ram", "model": "2500/3500", "trim": "Gas Models (excl. Chassis Cab, Diesel)", "year": 2025,
         "consumer_cash": 9500, "option1_rates": std, "option2_rates": None, "bonus_cash": 3000},
        
        {"brand": "Ram", "model": "2500/3500", "trim": "6.7L High Output Diesel (ETM)", "year": 2025,
         "consumer_cash": 7000, "option1_rates": std,
         "option2_rates": {"rate_36": 0.99, "rate_48": 0.99, "rate_60": 0.99, "rate_72": 0.99, "rate_84": 1.99, "rate_96": 2.99},
         "bonus_cash": 3000},
        
        {"brand": "Ram", "model": "Chassis Cab", "trim": None, "year": 2025,
         "consumer_cash": 5000, "option1_rates": std, "option2_rates": None, "bonus_cash": 3000},
        
        # FIAT 2025
        {"brand": "Fiat", "model": "500e", "trim": "BEV", "year": 2025,
         "consumer_cash": 6000,
         "option1_rates": {"rate_36": 0, "rate_48": 0, "rate_60": 1.99, "rate_72": 3.49, "rate_84": 3.99, "rate_96": 4.99},
         "option2_rates": None, "bonus_cash": 5000},
    ]
    
    for prog_data in programs_data:
        if prog_data.get("option2_rates") and isinstance(prog_data["option2_rates"], dict):
            prog_data["option2_rates"] = FinancingRates(**prog_data["option2_rates"]).dict()
        if isinstance(prog_data["option1_rates"], dict):
            prog_data["option1_rates"] = FinancingRates(**prog_data["option1_rates"]).dict()
        prog_data["program_month"] = prog_month
        prog_data["program_year"] = prog_year
        prog = VehicleProgram(**prog_data)
        await db.programs.insert_one(prog.dict())
    
    return {"message": f"Seeded {len(programs_data)} programs for {prog_month}/{prog_year}"}

# ============ PDF Import with AI ============

class PDFExtractRequest(BaseModel):
    password: str
    program_month: int
    program_year: int

class ProgramPreview(BaseModel):
    """Preview of extracted program for validation"""
    brand: str
    model: str
    trim: Optional[str] = None
    year: int
    consumer_cash: float = 0
    bonus_cash: float = 0
    option1_rates: Dict[str, float]
    option2_rates: Optional[Dict[str, float]] = None
    
class ExtractedDataResponse(BaseModel):
    success: bool
    message: str
    programs: List[Dict[str, Any]] = []
    raw_text: str = ""

class SaveProgramsRequest(BaseModel):
    password: str
    programs: List[Dict[str, Any]]
    program_month: int
    program_year: int

@api_router.post("/verify-password")
async def verify_password(password: str = Form(...)):
    """Vérifie le mot de passe admin"""
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    return {"success": True, "message": "Mot de passe vérifié"}

@api_router.post("/extract-pdf", response_model=ExtractedDataResponse)
async def extract_pdf(
    file: UploadFile = File(...),
    password: str = Form(...),
    program_month: int = Form(...),
    program_year: int = Form(...),
    start_page: int = Form(1),
    end_page: int = Form(9999)
):
    """
    Extrait les données de financement d'un PDF via OpenAI GPT-4
    Retourne les programmes pour prévisualisation/modification avant sauvegarde
    
    start_page et end_page permettent de limiter l'extraction à certaines pages
    (indexation commence à 1)
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="Clé OpenAI non configurée")
    
    try:
        import tempfile
        import os as os_module
        import base64
        from openai import OpenAI
        import PyPDF2
        
        # Save uploaded PDF temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        try:
            # Extract text ONLY from specified pages using PyPDF2
            pdf_text = ""
            with open(tmp_path, 'rb') as pdf_file:
                reader = PyPDF2.PdfReader(pdf_file)
                total_pages = len(reader.pages)
                
                # Convert to 0-based index and validate range
                start_idx = max(0, start_page - 1)  # Convert 1-based to 0-based
                end_idx = min(total_pages, end_page)  # Keep as-is (exclusive end)
                
                logger.info(f"PDF has {total_pages} pages. Extracting pages {start_page} to {end_page} (indices {start_idx} to {end_idx})")
                
                # Only extract the specified pages
                for page_num in range(start_idx, end_idx):
                    page = reader.pages[page_num]
                    page_text = page.extract_text()
                    pdf_text += f"\n--- PAGE {page_num + 1} ---\n{page_text}\n"
                
                logger.info(f"Extracted {end_idx - start_idx} pages, total text length: {len(pdf_text)} characters")
            
            # Use OpenAI to extract structured data
            client = OpenAI(api_key=OPENAI_API_KEY)
            
            extraction_prompt = f"""EXTRAIS TOUS LES VÉHICULES de ce PDF de programmes de financement FCA Canada.

TEXTE COMPLET DU PDF:
{pdf_text}

=== FORMAT DES LIGNES DU PDF ===
Chaque ligne suit ce format:
VÉHICULE [Consumer Cash $X,XXX] [6 taux Option1] [6 taux Option2] [Bonus Cash]

- Si tu vois "- - - - - -" = option non disponible (null)
- Si tu vois "P" avant un montant = c'est quand même le montant
- 6 taux = 36M, 48M, 60M, 72M, 84M, 96M

=== EXEMPLES CONCRETS DU PDF ===

"Grand Caravan SXT    4.99% 4.99% 4.99% 4.99% 4.99% 4.99%    - - - - - -"
→ brand: "Chrysler", model: "Grand Caravan", trim: "SXT", consumer_cash: 0
→ option1: 4.99 partout, option2: null

"Compass North  $3,500  4.99% 4.99% 4.99% 4.99% 4.99% 4.99%   P 0.00% 0.00% 0.00% 1.49% 1.99% 3.49%"
→ brand: "Jeep", model: "Compass", trim: "North", consumer_cash: 3500
→ option1: 4.99 partout, option2: 0/0/0/1.49/1.99/3.49

"Durango SXT, GT, GT Plus P $7,500  4.99% 4.99% 4.99% 4.99% 4.99% 4.99%    0.00% 0.00% 0.00% 1.49% 2.49% 3.49%"
→ brand: "Dodge", model: "Durango", trim: "SXT, GT, GT Plus", consumer_cash: 7500
→ option1: 4.99 partout, option2: 0/0/0/1.49/2.49/3.49

"Ram 1500 Tradesman, Express, Warlock  $6,500  4.99% 4.99% 4.99% 4.99% 4.99% 4.99%    0.00% 0.00% 0.00% 1.99% 2.99% 3.99%"
→ brand: "Ram", model: "1500", trim: "Tradesman, Express, Warlock", consumer_cash: 6500
→ option1: 4.99 partout, option2: 0/0/0/1.99/2.99/3.99

"Ram 1500 Laramie (DT6P98)    - - - - - -    0.00% 0.00% 0.00% 1.99% 2.99% 3.99%"
→ brand: "Ram", model: "1500", trim: "Laramie (DT6P98)", consumer_cash: 0
→ option1: null (tirets), option2: 0/0/0/1.99/2.99/3.99

=== MARQUES À EXTRAIRE ===
- CHRYSLER: Grand Caravan, Pacifica
- JEEP: Compass, Cherokee, Wrangler, Gladiator, Grand Cherokee, Grand Wagoneer
- DODGE: Durango, Charger
- RAM: ProMaster, 1500, 2500, 3500, Chassis Cab

=== ANNÉES ===
- "2026 MODELS" → year: 2026
- "2025 MODELS" → year: 2025
Extrais les véhicules des DEUX sections!

=== JSON REQUIS ===
{{
    "programs": [
        {{
            "brand": "Chrysler",
            "model": "Grand Caravan", 
            "trim": "SXT",
            "year": 2026,
            "consumer_cash": 0,
            "bonus_cash": 0,
            "option1_rates": {{"rate_36": 4.99, "rate_48": 4.99, "rate_60": 4.99, "rate_72": 4.99, "rate_84": 4.99, "rate_96": 4.99}},
            "option2_rates": null
        }},
        ... TOUS les autres véhicules ...
    ]
}}

EXTRAIS ABSOLUMENT TOUS LES VÉHICULES DES SECTIONS 2026 ET 2025. Ne manque aucune ligne!"""

            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "Tu extrais TOUS les véhicules d'un PDF FCA Canada. CHAQUE ligne = 1 entrée. N'oublie AUCUN véhicule. Sections 2026 ET 2025. JSON valide uniquement."},
                    {"role": "user", "content": extraction_prompt}
                ],
                temperature=0.1,
                max_tokens=16000,
                response_format={"type": "json_object"}
            )
            
            response_text = response.choices[0].message.content.strip()
            
            # Clean up response (remove markdown code blocks if present)
            if response_text.startswith("```"):
                lines = response_text.split("\n")
                response_text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
                response_text = response_text.strip()
            if response_text.endswith("```"):
                response_text = response_text[:-3].strip()
            
            # Clean common JSON issues
            response_text = response_text.replace('\n', ' ').replace('\r', '')
            response_text = re.sub(r',\s*}', '}', response_text)  # Remove trailing commas
            response_text = re.sub(r',\s*]', ']', response_text)  # Remove trailing commas in arrays
            
            try:
                data = json.loads(response_text)
                programs = data.get("programs", [])
            except json.JSONDecodeError as e:
                # Try to fix common issues and retry
                try:
                    # Find the programs array and try to parse it
                    programs_match = re.search(r'"programs"\s*:\s*\[(.*)\]', response_text, re.DOTALL)
                    if programs_match:
                        programs_str = programs_match.group(1)
                        # Try to parse individual objects
                        programs = []
                        obj_pattern = r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
                        for obj_match in re.finditer(obj_pattern, programs_str):
                            try:
                                obj = json.loads(obj_match.group())
                                programs.append(obj)
                            except:
                                continue
                        if programs:
                            data = {"programs": programs}
                        else:
                            raise e
                    else:
                        raise e
                except:
                    return ExtractedDataResponse(
                        success=False,
                        message=f"Erreur de parsing JSON: {str(e)}",
                        programs=[],
                        raw_text=response_text[:3000]
                    )
            
            # Validate and clean programs
            valid_programs = []
            for p in programs:
                # Ensure required fields exist
                if 'brand' in p and 'model' in p:
                    # Clean up rates
                    if p.get('option1_rates') and isinstance(p['option1_rates'], dict):
                        for key in ['rate_36', 'rate_48', 'rate_60', 'rate_72', 'rate_84', 'rate_96']:
                            if key not in p['option1_rates']:
                                p['option1_rates'][key] = 4.99
                    if p.get('option2_rates') and isinstance(p['option2_rates'], dict):
                        for key in ['rate_36', 'rate_48', 'rate_60', 'rate_72', 'rate_84', 'rate_96']:
                            if key not in p['option2_rates']:
                                p['option2_rates'][key] = 0
                    valid_programs.append(p)
            
            return ExtractedDataResponse(
                success=True,
                message=f"Extrait {len(valid_programs)} programmes du PDF",
                programs=valid_programs,
                raw_text=""
            )
            
        finally:
            # Clean up temp file
            os_module.unlink(tmp_path)
            
    except Exception as e:
        logger.error(f"Error extracting PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur d'extraction: {str(e)}")

@api_router.post("/save-programs")
async def save_programs(request: SaveProgramsRequest):
    """
    Sauvegarde les programmes validés dans la base de données
    Remplace les programmes existants pour le mois/année spécifié
    Garde seulement les 6 derniers mois d'historique
    """
    if request.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    
    # Delete existing programs for this period
    await db.programs.delete_many({
        "program_month": request.program_month,
        "program_year": request.program_year
    })
    
    # Insert new programs
    inserted = 0
    skipped = 0
    default_rates = {"rate_36": 4.99, "rate_48": 4.99, "rate_60": 4.99, "rate_72": 4.99, "rate_84": 4.99, "rate_96": 4.99}
    
    for prog_data in request.programs:
        # Skip invalid entries (missing brand/model)
        if not prog_data.get("brand") or not prog_data.get("model"):
            skipped += 1
            continue
            
        # Ensure option1_rates has a default value if missing
        if not prog_data.get("option1_rates"):
            prog_data["option1_rates"] = default_rates.copy()
        elif isinstance(prog_data["option1_rates"], dict):
            prog_data["option1_rates"] = FinancingRates(**prog_data["option1_rates"]).dict()
            
        # Process option2_rates if present
        if prog_data.get("option2_rates") and isinstance(prog_data["option2_rates"], dict):
            prog_data["option2_rates"] = FinancingRates(**prog_data["option2_rates"]).dict()
        
        prog_data["program_month"] = request.program_month
        prog_data["program_year"] = request.program_year
        prog_data["bonus_cash"] = prog_data.get("bonus_cash", 0)
        prog_data["consumer_cash"] = prog_data.get("consumer_cash", 0)
        
        try:
            prog = VehicleProgram(**prog_data)
            await db.programs.insert_one(prog.dict())
            inserted += 1
        except Exception as e:
            logger.warning(f"Skipped invalid program: {prog_data.get('brand')} {prog_data.get('model')} - {str(e)}")
            skipped += 1
            continue
    
    # Clean up old programs (keep only 6 months)
    await cleanup_old_programs()
    
    return {
        "success": True,
        "message": f"Sauvegardé {inserted} programmes pour {request.program_month}/{request.program_year}" + (f" ({skipped} ignorés)" if skipped > 0 else "")
    }

async def cleanup_old_programs():
    """Supprime les programmes de plus de 6 mois"""
    # Get all unique periods
    pipeline = [
        {"$group": {
            "_id": {"month": "$program_month", "year": "$program_year"}
        }},
        {"$sort": {"_id.year": -1, "_id.month": -1}}
    ]
    periods = await db.programs.aggregate(pipeline).to_list(100)
    
    # Keep only the 6 most recent periods
    if len(periods) > 6:
        periods_to_delete = periods[6:]
        for p in periods_to_delete:
            await db.programs.delete_many({
                "program_month": p["_id"]["month"],
                "program_year": p["_id"]["year"]
            })
            logger.info(f"Deleted old programs for {p['_id']['month']}/{p['_id']['year']}")

# ============ Email Functions ============

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import io

def send_email(to_email: str, subject: str, html_body: str, attachment_data: bytes = None, attachment_name: str = None):
    """Envoie un email via Gmail SMTP"""
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        raise Exception("Configuration SMTP manquante")
    
    msg = MIMEMultipart('alternative')
    msg['From'] = f"CalcAuto AiPro <{SMTP_EMAIL}>"
    msg['To'] = to_email
    msg['Subject'] = subject
    
    # Corps HTML
    msg.attach(MIMEText(html_body, 'html', 'utf-8'))
    
    # Pièce jointe si fournie
    if attachment_data and attachment_name:
        part = MIMEBase('application', 'octet-stream')
        part.set_payload(attachment_data)
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', f'attachment; filename="{attachment_name}"')
        msg.attach(part)
    
    # Connexion SMTP
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.send_message(msg)
    
    return True

class SendCalculationEmailRequest(BaseModel):
    """Requête pour envoyer un calcul par email"""
    client_email: str
    client_name: str = ""
    vehicle_info: Dict[str, Any]
    calculation_results: Dict[str, Any]
    selected_term: int = 60
    selected_option: str = "1"
    vehicle_price: float
    dealer_name: str = "CalcAuto AiPro"
    dealer_phone: str = ""

class SendReportEmailRequest(BaseModel):
    """Requête pour envoyer un rapport après import"""
    programs_count: int
    program_month: int
    program_year: int
    brands_summary: Dict[str, int]

@api_router.post("/send-calculation-email")
async def send_calculation_email(request: SendCalculationEmailRequest):
    """Envoie un calcul de financement par email au client"""
    try:
        vehicle = request.vehicle_info
        calc = request.calculation_results
        term = request.selected_term
        option = request.selected_option
        
        # Trouver les détails du terme sélectionné
        comparison = None
        for c in calc.get('comparisons', []):
            if c.get('term_months') == term:
                comparison = c
                break
        
        if not comparison:
            raise HTTPException(status_code=400, detail="Terme non trouvé")
        
        # Déterminer les valeurs selon l'option choisie
        if option == "1":
            rate = comparison.get('option1_rate', 0)
            monthly = comparison.get('option1_monthly', 0)
            total = comparison.get('option1_total', 0)
            rebate = calc.get('consumer_cash', 0)
        else:
            rate = comparison.get('option2_rate', 0)
            monthly = comparison.get('option2_monthly', 0)
            total = comparison.get('option2_total', 0)
            rebate = 0
        
        bonus_cash = calc.get('bonus_cash', 0)
        
        # Créer le HTML de l'email
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
                .header {{ background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 30px; text-align: center; }}
                .header h1 {{ margin: 0; font-size: 24px; }}
                .header p {{ margin: 10px 0 0; opacity: 0.8; }}
                .content {{ padding: 30px; }}
                .vehicle-box {{ background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px; }}
                .vehicle-name {{ font-size: 20px; font-weight: bold; color: #1a1a2e; margin-bottom: 10px; }}
                .vehicle-year {{ color: #4ECDC4; font-weight: 600; }}
                .price-row {{ display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }}
                .price-label {{ color: #666; }}
                .price-value {{ font-weight: bold; color: #1a1a2e; }}
                .highlight-box {{ background: linear-gradient(135deg, #4ECDC4 0%, #44a08d 100%); color: white; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }}
                .monthly-payment {{ font-size: 36px; font-weight: bold; }}
                .monthly-label {{ opacity: 0.9; margin-top: 5px; }}
                .details {{ margin-top: 20px; }}
                .detail-row {{ display: flex; justify-content: space-between; padding: 8px 0; }}
                .footer {{ background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }}
                .dealer-info {{ margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚗 CalcAuto AiPro</h1>
                    <p>Votre soumission de financement</p>
                </div>
                <div class="content">
                    <p>Bonjour{' ' + request.client_name if request.client_name else ''},</p>
                    <p>Voici les détails de votre financement automobile:</p>
                    
                    <div class="vehicle-box">
                        <div class="vehicle-name">
                            {vehicle.get('brand', '')} {vehicle.get('model', '')} 
                            <span class="vehicle-year">{vehicle.get('year', '')}</span>
                        </div>
                        <div style="color: #666;">{vehicle.get('trim', '') or ''}</div>
                    </div>
                    
                    <div class="price-row">
                        <span class="price-label">Prix du véhicule</span>
                        <span class="price-value">${request.vehicle_price:,.2f}</span>
                    </div>
                    {"<div class='price-row'><span class='price-label'>Rabais (Consumer Cash)</span><span class='price-value' style='color:#4ECDC4;'>-$" + f"{rebate:,.2f}" + "</span></div>" if rebate > 0 else ""}
                    {"<div class='price-row'><span class='price-label'>Bonus Cash</span><span class='price-value' style='color:#4ECDC4;'>-$" + f"{bonus_cash:,.2f}" + "</span></div>" if bonus_cash > 0 else ""}
                    
                    <div class="highlight-box">
                        <div class="monthly-payment">${monthly:,.2f}</div>
                        <div class="monthly-label">par mois × {term} mois</div>
                    </div>
                    
                    <div class="details">
                        <div class="detail-row">
                            <span>Taux d'intérêt</span>
                            <span><strong>{rate}%</strong></span>
                        </div>
                        <div class="detail-row">
                            <span>Terme</span>
                            <span><strong>{term} mois</strong></span>
                        </div>
                        <div class="detail-row">
                            <span>Option choisie</span>
                            <span><strong>Option {option}</strong></span>
                        </div>
                        <div class="detail-row">
                            <span>Coût total du financement</span>
                            <span><strong>${total:,.2f}</strong></span>
                        </div>
                    </div>
                    
                    <div class="dealer-info">
                        <p style="margin: 0; color: #666;">Pour plus d'informations, contactez-nous:</p>
                        <p style="margin: 10px 0 0; font-weight: bold; color: #1a1a2e;">
                            {request.dealer_name}
                            {' • ' + request.dealer_phone if request.dealer_phone else ''}
                        </p>
                    </div>
                </div>
                <div class="footer">
                    <p>Ce calcul est une estimation et ne constitue pas une offre de financement officielle.</p>
                    <p>Les taux et conditions peuvent varier selon votre dossier de crédit.</p>
                    <p style="margin-top: 15px;">Généré par CalcAuto AiPro</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        subject = f"Votre soumission - {vehicle.get('brand', '')} {vehicle.get('model', '')} {vehicle.get('year', '')}"
        
        send_email(request.client_email, subject, html_body)
        
        return {"success": True, "message": f"Email envoyé à {request.client_email}"}
        
    except Exception as e:
        logger.error(f"Erreur envoi email: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur d'envoi: {str(e)}")

@api_router.post("/send-import-report")
async def send_import_report(request: SendReportEmailRequest):
    """Envoie un rapport par email après l'import des programmes"""
    try:
        months_fr = {
            1: "Janvier", 2: "Février", 3: "Mars", 4: "Avril",
            5: "Mai", 6: "Juin", 7: "Juillet", 8: "Août",
            9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre"
        }
        month_name = months_fr.get(request.program_month, str(request.program_month))
        
        # Générer le résumé par marque
        brands_html = ""
        for brand, count in request.brands_summary.items():
            brands_html += f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'>{brand}</td><td style='padding: 8px; border-bottom: 1px solid #eee; text-align: center; font-weight: bold;'>{count}</td></tr>"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
                .header {{ background: linear-gradient(135deg, #4ECDC4 0%, #44a08d 100%); color: white; padding: 30px; text-align: center; }}
                .header h1 {{ margin: 0; font-size: 24px; }}
                .content {{ padding: 30px; }}
                .success-badge {{ background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; text-align: center; margin-bottom: 20px; }}
                .stats-box {{ background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }}
                .big-number {{ font-size: 48px; font-weight: bold; color: #1a1a2e; text-align: center; }}
                .big-label {{ text-align: center; color: #666; }}
                table {{ width: 100%; border-collapse: collapse; margin-top: 15px; }}
                th {{ background: #1a1a2e; color: white; padding: 10px; text-align: left; }}
                .footer {{ background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✅ Import Réussi</h1>
                    <p>CalcAuto AiPro - Rapport d'import</p>
                </div>
                <div class="content">
                    <div class="success-badge">
                        <strong>🎉 Programmes {month_name} {request.program_year} importés avec succès!</strong>
                    </div>
                    
                    <div class="stats-box">
                        <div class="big-number">{request.programs_count}</div>
                        <div class="big-label">programmes de financement</div>
                    </div>
                    
                    <h3>Répartition par marque:</h3>
                    <table>
                        <tr>
                            <th>Marque</th>
                            <th style="text-align: center;">Nombre</th>
                        </tr>
                        {brands_html}
                    </table>
                    
                    <p style="margin-top: 20px; color: #666;">
                        Les nouveaux programmes sont maintenant disponibles dans l'application CalcAuto AiPro.
                    </p>
                </div>
                <div class="footer">
                    <p>Ce rapport a été généré automatiquement après l'import.</p>
                    <p>Date: {datetime.now().strftime('%d/%m/%Y à %H:%M')}</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        subject = f"✅ Import {month_name} {request.program_year} - {request.programs_count} programmes"
        
        send_email(SMTP_EMAIL, subject, html_body)
        
        return {"success": True, "message": "Rapport envoyé par email"}
        
    except Exception as e:
        logger.error(f"Erreur envoi rapport: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur d'envoi: {str(e)}")

@api_router.post("/test-email")
async def test_email():
    """Teste la configuration email"""
    try:
        html_body = """
        <div style="font-family: Arial; padding: 20px; text-align: center;">
            <h1 style="color: #4ECDC4;">✅ Test Email Réussi!</h1>
            <p>Votre configuration Gmail SMTP fonctionne correctement.</p>
            <p style="color: #666;">CalcAuto AiPro</p>
        </div>
        """
        send_email(SMTP_EMAIL, "🧪 Test CalcAuto AiPro - Email OK", html_body)
        return {"success": True, "message": f"Email de test envoyé à {SMTP_EMAIL}"}
    except Exception as e:
        logger.error(f"Erreur test email: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

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
