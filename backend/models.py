from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid


# ============ Financing Models ============

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
    Structure d'un programme de financement vehicule
    
    REGLES IMPORTANTES:
    - Option 1 (Consumer Cash): Rabais AVANT TAXES + taux d'interet (variables selon le vehicule)
    - Option 2 (Alternative): Rabais = $0 + taux reduits (peut etre None si non disponible)
    - Bonus Cash: Rabais APRES TAXES (comme comptant), combinable avec Option 1 OU 2
    - Les taux sont FIXES (non variables)
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    brand: str
    model: str
    trim: Optional[str] = None
    year: int
    
    # Option 1: Consumer Cash (rabais AVANT taxes) + taux Consumer Cash
    consumer_cash: float = 0
    option1_rates: FinancingRates
    
    # Option 2: Alternative Consumer Cash (generalement $0) + taux reduits
    option2_rates: Optional[FinancingRates] = None
    
    # Bonus Cash: Rabais APRES taxes (combinable avec Option 1 ou 2)
    bonus_cash: float = 0
    
    # Metadonnees du programme
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
    option1_rate: float
    option1_monthly: float
    option1_total: float
    option1_rebate: float
    option2_rate: Optional[float] = None
    option2_monthly: Optional[float] = None
    option2_total: Optional[float] = None
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


# ============ CRM Models ============

class Submission(BaseModel):
    """Soumission client avec suivi"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str = ""
    client_name: str
    client_phone: str
    client_email: str
    vehicle_brand: str
    vehicle_model: str
    vehicle_year: int
    vehicle_price: float
    term: int
    payment_monthly: float
    payment_biweekly: float = 0
    payment_weekly: float = 0
    selected_option: str = "1"
    rate: float = 0
    submission_date: datetime = Field(default_factory=datetime.utcnow)
    reminder_date: Optional[datetime] = None
    reminder_done: bool = False
    status: str = "pending"
    notes: str = ""
    program_month: int = 0
    program_year: int = 0
    calculator_state: Optional[dict] = None

class SubmissionCreate(BaseModel):
    client_name: str
    client_phone: str
    client_email: str
    vehicle_brand: str
    vehicle_model: str
    vehicle_year: int
    vehicle_price: float
    term: int
    payment_monthly: float
    payment_biweekly: float = 0
    payment_weekly: float = 0
    selected_option: str = "1"
    rate: float = 0
    program_month: int = 0
    program_year: int = 0
    calculator_state: Optional[dict] = None

class ReminderUpdate(BaseModel):
    reminder_date: datetime
    notes: Optional[str] = None

class BetterOffer(BaseModel):
    """Meilleure offre trouvee pour un client"""
    submission_id: str
    client_name: str
    client_phone: str
    client_email: str
    vehicle: str
    old_payment: float
    new_payment: float
    savings_monthly: float
    savings_total: float
    term: int
    approved: bool = False
    email_sent: bool = False


# ============ Auth Models ============

class UserRegister(BaseModel):
    name: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_admin: bool = False
    is_blocked: bool = False
    last_login: Optional[datetime] = None


# ============ Contact Models ============

class Contact(BaseModel):
    """Contact importe depuis vCard/CSV"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str = ""
    name: str
    phone: str = ""
    email: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    source: str = "import"

class ContactCreate(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    source: str = "import"

class ContactBulkCreate(BaseModel):
    contacts: List[ContactCreate]


# ============ Inventory Models ============

class InventoryVehicle(BaseModel):
    """Vehicule en inventaire avec couts reels"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str = ""
    stock_no: str
    vin: str = ""
    brand: str
    model: str
    trim: str = ""
    body_style: str = ""
    year: int
    type: str = "neuf"
    pdco: float = 0
    ep_cost: float = 0
    holdback: float = 0
    net_cost: float = 0
    msrp: float = 0
    asking_price: float = 0
    sold_price: Optional[float] = None
    status: str = "disponible"
    km: int = 0
    color: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class InventoryCreate(BaseModel):
    stock_no: str
    vin: str = ""
    brand: str
    model: str
    trim: str = ""
    body_style: str = ""
    year: int
    type: str = "neuf"
    pdco: float = 0
    ep_cost: float = 0
    holdback: float = 0
    msrp: float = 0
    asking_price: float = 0
    km: int = 0
    color: str = ""

class InventoryUpdate(BaseModel):
    vin: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    trim: Optional[str] = None
    body_style: Optional[str] = None
    year: Optional[int] = None
    type: Optional[str] = None
    pdco: Optional[float] = None
    ep_cost: Optional[float] = None
    holdback: Optional[float] = None
    msrp: Optional[float] = None
    asking_price: Optional[float] = None
    sold_price: Optional[float] = None
    status: Optional[str] = None
    km: Optional[int] = None
    color: Optional[str] = None

class VehicleOption(BaseModel):
    """Option/equipement d'un vehicule"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    stock_no: str
    product_code: str
    order: int = 0
    description: str
    amount: float = 0

class ProductCode(BaseModel):
    """Referentiel des codes produits FCA"""
    code: str
    description_standard: str
    category: str = ""


# ============ PDF Import Models ============

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
    sci_lease_count: int = 0

class SaveProgramsRequest(BaseModel):
    password: str
    programs: List[Dict[str, Any]]
    program_month: int
    program_year: int


# ============ Email Models ============

class SendCalculationEmailRequest(BaseModel):
    """Requete pour envoyer un calcul par email"""
    client_email: str
    client_name: str = ""
    vehicle_info: Dict[str, Any]
    calculation_results: Dict[str, Any]
    selected_term: int = 60
    selected_option: str = "1"
    vehicle_price: float
    payment_frequency: str = "monthly"
    dealer_name: str = "CalcAuto AiPro"
    dealer_phone: str = ""
    rates_table: Dict[str, Any] = {}
    fees: Dict[str, float] = {}
    trade_in: Dict[str, float] = {}
    include_window_sticker: bool = True
    vin: str = ""
    lease_data: Optional[Dict[str, Any]] = None

class SendReportEmailRequest(BaseModel):
    """Requete pour envoyer un rapport apres import"""
    programs_count: int
    program_month: int
    program_year: int
    brands_summary: Dict[str, int]
