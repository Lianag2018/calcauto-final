# CalcAuto AiPro - PRD

## Original Problem Statement
Application mobile "CalcAuto AiPro" pour les concessionnaires automobiles Stellantis (FCA). Fonctionnalités principales: scan de factures, calculatrice de financement, gestion d'inventaire, calcul de location (Location SCI).

## Core Requirements
- **Invoice Scanner**: OCR (Google Vision) + GPT-4o pour extraire les données de factures FCA
- **Financing Calculator**: Calculs de paiements avec programmes Stellantis
- **Lease Calculator (SCI)**: Calcul précis de location avec résiduels, taux et cash incentives
- **Inventory Management**: CRUD véhicules avec scan, export Excel, partage (email/SMS/print)
- **SCI Cascading Dropdowns**: Menus déroulants en cascade (Marque→Modèle→Trim→Carrosserie) basés sur le guide résiduel SCI

## Architecture
- **Frontend**: React Native (Expo) → Static web build (dist/)
- **Backend**: FastAPI (Python) on port 8001
- **Database**: MongoDB (for users, inventory, clients)
- **Data Files**: JSON files in backend/data/ for SCI residuals, lease rates, programs

## What's Been Implemented
- [x] Authentication (login/register)
- [x] Invoice scanner (Google Vision + GPT-4o)
- [x] Financing calculator with Stellantis programs
- [x] Lease calculator (SCI) - accurate to the cent
- [x] Inventory CRUD with body_style field
- [x] SCI cascading dropdowns (274 vehicles from PDF guide)
- [x] Email, SMS, Print sharing with lease data
- [x] Excel export/import workflow
- [x] Client management

## Latest Changes (Feb 2026)
- Added `body_style` field to InventoryVehicle and InventoryCreate models
- Created `/api/sci/vehicle-hierarchy` endpoint for cascading dropdown data
- Parsed full SCI Residual Guide PDF (274 vehicles: Chrysler, Dodge, Fiat, Jeep, Ram)
- Replaced free-text brand/model/trim inputs with Modal-based picker dropdowns
- Auto-select body_style when only one option exists for a trim
- Display body_style in vehicle cards ("Trim - Body Style" format)

## Prioritized Backlog
### P0 (Critical)
- None currently

### P1 (High)
- User validation of parser fixes with various invoices
- User validation of Excel workflow
- Refactoring of index.tsx (5000+ lines → components + hooks)

### P2 (Medium)
- Refactoring of server.py (monolithic → APIRouter)
- Update rebuild.sh to include yarn clean:cache
- Improve residual matching in lease calculator to use body_style

### P3 (Low)
- Code deduplication across tabs
- Performance optimization for large inventory lists

## Key API Endpoints
- POST /api/auth/login, /api/auth/register
- POST /api/inventory/scan-invoice
- GET/POST/PUT/DELETE /api/inventory
- GET /api/sci/residuals
- GET /api/sci/lease-rates
- GET /api/sci/vehicle-hierarchy
- GET /api/programs
- POST /api/inventory/send-email

## Key Files
- backend/server.py - Main FastAPI app
- frontend/app/(tabs)/index.tsx - Calculator page
- frontend/app/(tabs)/inventory.tsx - Inventory page with SCI dropdowns
- backend/data/sci_residuals_feb2026.json - 274 vehicle residual values
- backend/data/sci_lease_rates_feb2026.json - Lease rates and cash rebates

## Build Process
```bash
cd /app/frontend
rm -rf dist .expo/web node_modules/.cache
npx expo export --platform web --clear
sudo supervisorctl restart expo
```

## Test Credentials
- Email: danielgiroux007@gmail.com
- Password: Liana2018$
