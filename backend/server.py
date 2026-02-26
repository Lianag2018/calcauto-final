"""
CalcAuto AiPro - Main Application Entry Point

This is the central entry point that wires together all modular routers.
All business logic resides in the routers/ and services/ directories.
"""
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from database import client, logger

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
