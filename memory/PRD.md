# CalcAuto AiPro - Product Requirements Document

## Original Problem Statement
Mobile application for auto dealers (Quebec, Stellantis/FCA vehicles) that scans invoices via OCR and calculates financing options. The app supports a hybrid OCR workflow (Google Vision + GPT-4o), Excel export/import, SMS/email sharing, printing, and lease comparison (SCI).

## Core Requirements
- Invoice scanner with hybrid OCR (Vision + GPT-4o)
- Financing calculator with Option 1 (Rabais + Taux) and Option 2 (Taux réduits)
- Payment frequency: Monthly, Bi-weekly, Weekly
- Excel export/import workflow
- SMS, Email, Print sharing (includes lease data)
- **Location SCI**: Lease comparison integrated into calculator with proper Quebec tax handling
- Admin panel, CRM, Inventory management

## Tech Stack
- Frontend: React Native (Expo) served as static web build
- Backend: FastAPI (Python) + MongoDB
- OCR: Google Cloud Vision + OpenAI GPT-4o
- PDF parsing: PyMuPDF

## What's Been Implemented

### Phase 1-24 (Previous sessions)
- Full auth system, programs management, inventory, CRM
- Invoice scanner with hybrid OCR pipeline
- Calculator with Option 1/2, frequency toggle, term selection
- Excel export/import, SMS sharing, Print, Email sending, Holdback

### Phase 25 - Location SCI Feature (Feb 25, 2026)
- Backend: 3 API endpoints (residuals, rates, calculate-lease)
- Frontend: Integrated lease section with km/term selectors, dual comparison cards
- Data: 64 vehicles residual + 69 vehicles rates (2025 & 2026)

### Phase 26 - Lease in SMS/Email/Print (Feb 25, 2026)
- SMS (Texto), Print (Imprimer), Email include lease data when toggled on

### Phase 27 - Lease Calculation Corrections (Feb 25, 2026)
- **PDSF séparé**: New input field, résiduel calculé sur PDSF (pas prix de vente)
- **Solde reporté**: New field for carried-over balance from previous lease
- **Crédit taxe échange**: Limited to total lease taxes, surplus is lost (with warning)
- **Frais auto-inclus**: Info bar showing dossier + pneus + RDPRM automatically
- **Quebec tax handling**: Proper 14.975% TPS+TVQ calculation with trade-in credit limits

## Key Lease Calculation Fields
1. Prix de vente (selling price) - for capitalized cost
2. PDSF / PDOC (MSRP) - for residual value calculation
3. Solde reporté - balance from previous lease (negative = debt with taxes)
4. Échange (trade-in value) - tax credit limited to lease taxes
5. Montant dû (amount owed on trade)
6. Comptant (cash down)
7. Frais (auto-included: dossier + pneus + RDPRM)
8. Lease Cash / Taux (from program data)
9. Kilométrage / an (affects residual %)
10. Terme (24-60 months)

## Prioritized Backlog

### P1 - Validation Required
- User validation of Location SCI calculations with real deals
- User validation of parser fixes (MSRP, Net Cost, holdback)

### P2 - Refactoring
- Refactor `server.py` into routes/ directory
- Continue refactoring `index.tsx`
- Clean up dead code

### P3 - Future
- Automated frontend rebuild
- Compare all terms table
- Enhanced lease reporting

## Key API Endpoints
- `POST /api/auth/login`
- `GET /api/programs`
- `POST /api/inventory/scan-invoice`
- `GET /api/sci/residuals`
- `GET /api/sci/lease-rates`
- `POST /api/sci/calculate-lease`
- `POST /api/send-calculation-email`
