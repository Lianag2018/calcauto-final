from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from datetime import datetime
from database import db, ADMIN_EMAIL
from models import UserRegister, UserLogin, User
from dependencies import hash_password, generate_token, get_current_user
from services import test_account

router = APIRouter()

@router.post("/auth/register")
async def register_user(user_data: UserRegister):
    """Register a new user"""
    # L'adresse du compte d'essai est réservée : personne ne peut s'y inscrire.
    if test_account.is_test_login(user_data.email):
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    # Check if email already exists
    existing_user = await db.users.find_one({"email": user_data.email.lower()})
    if existing_user:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    
    # Create user
    user = User(
        name=user_data.name,
        email=user_data.email.lower(),
        password_hash=hash_password(user_data.password)
    )
    
    user_dict = user.dict()
    await db.users.insert_one(user_dict)
    
    # Generate token
    token = generate_token()
    await db.tokens.insert_one({
        "user_id": user.id,
        "token": token,
        "created_at": datetime.utcnow()
    })
    
    return {
        "success": True,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email
        },
        "token": token
    }

@router.post("/auth/login")
async def login_user(credentials: UserLogin):
    """Login user"""
    # Compte d'essai « claude » : son mot de passe vit dans une variable du serveur, jamais en base.
    user = await test_account.login(db, credentials.email, credentials.password)
    if user is None:
        user = await db.users.find_one({
            "email": credentials.email.lower(),
            "password_hash": hash_password(credentials.password)
        })
    
    if not user:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    # Check if user is blocked
    if user.get("is_blocked", False):
        raise HTTPException(status_code=403, detail="Votre compte a été désactivé. Contactez l'administrateur.")
    
    # Update last_login
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    # Check if user should be admin
    is_admin = user.get("is_admin", False) or user["email"] == ADMIN_EMAIL
    
    # Generate token
    token = generate_token()
    await db.tokens.insert_one({
        "user_id": user["id"],
        "token": token,
        "created_at": datetime.utcnow()
    })
    
    return {
        "success": True,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "is_admin": is_admin,
            # Compte relié à eTradeValue : ses dossiers d'évaluation le suivent ici aussi.
            **{key: user[key] for key in ("dealer_slug", "etv_username", "etv_role") if user.get(key)}
        },
        "token": token
    }

@router.post("/auth/logout")
async def logout_user(token: str):
    """Logout user by deleting token"""
    await db.tokens.delete_one({"token": token})
    return {"success": True}


@router.post("/auth/demo-login")
async def demo_login():
    """Fermée le 27 nov. 2026 : elle donnait une session d'administrateur sans mot de passe.
    Pour les essais, se connecter avec le compte « claude » (variable CLAUDE_TEST_PASSWORD)."""
    raise HTTPException(status_code=410, detail="L'entrée démo est fermée. Connectez-vous.")

