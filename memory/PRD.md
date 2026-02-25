# CalcAuto AiPro - PRD

## Original Problem Statement
Application mobile "CalcAuto AiPro" pour les concessionnaires automobiles Stellantis (FCA). Fonctionnalités principales: scan de factures, calculatrice de financement, gestion d'inventaire, calcul de location (Location SCI).

## Core Requirements
- **Invoice Scanner**: OCR (Google Vision) + GPT-4o pour extraire les données de factures FCA
- **Financing Calculator**: Calculs de paiements avec programmes Stellantis
- **Lease Calculator (SCI)**: Calcul précis de location avec résiduels, taux et cash incentives
- **Inventory Management**: CRUD véhicules avec scan, export Excel, partage (email/SMS/print)
- **SCI Cascading Dropdowns**: Menus déroulants en cascade (Marque->Modèle->Trim->Carrosserie) basés sur le guide résiduel SCI
- **Monthly PDF Upload System**: Upload mensuel de 2 documents (Programmes + Guide Résiduel) avec parsing automatique et email de vérification
- **Dual-Page PDF Extraction**: Support de deux plages de pages (Retail + SCI Lease) depuis un même PDF de programmes

## Architecture
- **Frontend**: React Native (Expo) -> Static web build (dist/)
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
- [x] Monthly upload system for Residual Guide PDF (auto-parse + Excel email)
- [x] Document type choice page (Programmes vs Guide Résiduel)
- [x] Dual-page PDF extraction - Retail pages + SCI Lease pages from same PDF
- [x] SCI Lease rates auto-saved to sci_lease_rates_{month}{year}.json
- [x] "Meilleur Choix" (Best Choice) - searches ALL km × ALL terms for absolute cheapest lease
- [x] Body style used in residual lookup (priority match with body_style > fallback)
- [x] "Rabais concessionnaire" partagé entre financement ET location (un seul champ en haut)
- [x] Vercel deployment fix (output: static → single for SPA mode)

## Build Process
```bash
cd /app/frontend
rm -rf dist .expo/web node_modules/.cache
npx expo export --platform web --clear
sudo supervisorctl restart expo
```

## Key API Endpoints
- POST /api/auth/login, /api/auth/register
- POST /api/inventory/scan-invoice
- GET/POST/PUT/DELETE /api/inventory
- GET /api/sci/residuals
- GET /api/sci/lease-rates
- GET /api/sci/vehicle-hierarchy
- POST /api/upload-residual-guide
- POST /api/extract-pdf (Dual-page: retail + SCI lease)
- POST /api/verify-password
- GET /api/programs
- POST /api/inventory/send-email
- POST /api/pdf-info

## Prioritized Backlog
### P2 (Medium)
- Refactoring of server.py (7300+ lines → APIRouter modules)
- Refactoring of index.tsx (5700+ lines → components + hooks)
- Refactoring of inventory.tsx

### P3 (Low)
- Code deduplication across tabs
- Performance optimization

## Test Credentials
- Email: danielgiroux007@gmail.com
- Password: Liana2018$
- Admin password (import): Liana2018$
