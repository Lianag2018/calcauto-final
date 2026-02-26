import hashlib
import secrets
from typing import Optional
from fastapi import Header, HTTPException
from database import db, ADMIN_EMAIL


def hash_password(password: str) -> str:
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()


def generate_token() -> str:
    """Generate a random token"""
    return secrets.token_hex(32)


async def get_current_user(authorization: Optional[str] = Header(None)):
    """Obtient l'utilisateur courant a partir du token d'autorisation"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    
    token_doc = await db.tokens.find_one({"token": token})
    if not token_doc:
        raise HTTPException(status_code=401, detail="Token invalide")
    
    user = await db.users.find_one({"id": token_doc["user_id"]})
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur non trouve")
    
    return user


async def get_optional_user(authorization: Optional[str] = Header(None)):
    """Obtient l'utilisateur courant si un token est fourni, sinon None"""
    if not authorization:
        return None
    
    try:
        return await get_current_user(authorization)
    except:
        return None


def calculate_monthly_payment(principal: float, annual_rate: float, months: int) -> float:
    """Calcule le paiement mensuel avec la formule d'amortissement"""
    if principal <= 0 or months <= 0:
        return 0
    if annual_rate == 0:
        return round(principal / months, 2)
    
    monthly_rate = annual_rate / 100 / 12
    payment = principal * (monthly_rate * (1 + monthly_rate) ** months) / ((1 + monthly_rate) ** months - 1)
    return round(payment, 2)


def get_rate_for_term(rates, term: int) -> float:
    """Obtient le taux pour un terme specifique"""
    if isinstance(rates, dict):
        return rates.get(f"rate_{term}", 4.99)
    rate_map = {
        36: rates.rate_36,
        48: rates.rate_48,
        60: rates.rate_60,
        72: rates.rate_72,
        84: rates.rate_84,
        96: rates.rate_96
    }
    return rate_map.get(term, 4.99)
