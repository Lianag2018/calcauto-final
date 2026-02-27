"""
CalcAuto AiPro - Main Application Entry Point

This is the central entry point that wires together all modular routers.
All business logic resides in the routers/ and services/ directories.
"""
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from database import client, db, logger

# Import all routers
from routers.auth import router as auth_router
from routers.programs import router as programs_router
from routers.submissions import router as submissions_router
from routers.contacts import router as contacts_router
from routers.inventory import router as inventory_router
from routers.invoice import router as invoice_router
from routers.email import router as email_router
from routers.import_wizard import router as import_wizard_router
from routers.sci import router as sci_router
from routers.admin import router as admin_router

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# ============ Root Endpoints ============

@api_router.get("/")
async def root():
    return {"message": "Vehicle Financing Calculator API - v4 (avec historique et Bonus Cash)"}


@api_router.api_route("/ping", methods=["GET", "HEAD"])
async def ping():
    """Endpoint pour garder le serveur actif (keep-alive)"""
    return {"status": "ok", "message": "Server is alive"}


# ============ Include All Routers ============

api_router.include_router(auth_router)
api_router.include_router(programs_router)
api_router.include_router(submissions_router)
api_router.include_router(contacts_router)
api_router.include_router(inventory_router)
api_router.include_router(invoice_router)
api_router.include_router(email_router)
api_router.include_router(import_wizard_router)
api_router.include_router(sci_router)
api_router.include_router(admin_router)

# Mount the API router on the app
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@app.on_event("startup")
async def run_data_migration():
    """Migration automatique: corrige les donnees 2025 erronees au demarrage"""
    try:
        migration_key = "migration_fix_2025_v3"
        existing = await db.migrations.find_one({"key": migration_key})
        if existing:
            logger.info(f"[MIGRATION] {migration_key} deja executee, skip")
            return

        logger.info(f"[MIGRATION] Execution de {migration_key}...")

        # 1. Mettre TOUS les bonus_cash a 0 pour 2025 (Delivery Credits erroneement importes)
        r1 = await db.programs.update_many(
            {"year": 2025, "bonus_cash": {"$gt": 0}},
            {"$set": {"bonus_cash": 0}}
        )
        logger.info(f"[MIGRATION] bonus_cash mis a 0 pour {r1.modified_count} programmes 2025")

        # 2. Fiat 500e BEV 2025: seul vehicule avec vrai Bonus Cash ($5,000 AFTER TAX)
        r2 = await db.programs.update_many(
            {"year": 2025, "brand": "Fiat", "model": "500e"},
            {"$set": {"bonus_cash": 5000}}
        )
        logger.info(f"[MIGRATION] Fiat 500e bonus_cash=5000 pour {r2.modified_count} programmes")

        # 3. Corriger l'inversion Compass North <-> Compass Altitude/Trailhawk
        # PDF dit: North = $7,500, Altitude/Trailhawk/TH Elite = $5,500
        r3a = await db.programs.update_many(
            {"year": 2025, "model": "Compass", "trim": {"$regex": "North"}},
            {"$set": {"consumer_cash": 7500}}
        )
        r3b = await db.programs.update_many(
            {"year": 2025, "model": "Compass", "trim": {"$regex": "Altitude|Trailhawk"}},
            {"$set": {"consumer_cash": 5500}}
        )
        logger.info(f"[MIGRATION] Compass North={r3a.modified_count}, Altitude/TH={r3b.modified_count}")

        # 4. Mettre TOUS les bonus_cash a 0 pour 2026 aussi (meme probleme)
        r4 = await db.programs.update_many(
            {"year": 2026, "bonus_cash": {"$gt": 0}},
            {"$set": {"bonus_cash": 0}}
        )
        logger.info(f"[MIGRATION] bonus_cash mis a 0 pour {r4.modified_count} programmes 2026")

        # Marquer la migration comme executee
        await db.migrations.insert_one({"key": migration_key, "executed_at": __import__('datetime').datetime.utcnow()})
        logger.info(f"[MIGRATION] {migration_key} terminee avec succes!")

    except Exception as e:
        logger.error(f"[MIGRATION] Erreur: {e}")
