# CalcAuto AiPro - Product Requirements Document

## Original Problem Statement
Mobile application for auto dealers (Quebec, Stellantis/FCA vehicles) that scans invoices via OCR and calculates financing options. The app supports a hybrid OCR workflow (Google Vision + GPT-4o), Excel export/import, SMS/email sharing, printing, and now lease comparison (SCI).

## Core Requirements
- Invoice scanner with hybrid OCR (Vision + GPT-4o)
- Financing calculator with Option 1 (Rabais + Taux) and Option 2 (Taux réduits)
- Payment frequency: Monthly, Bi-weekly, Weekly
- Excel export/import workflow
- SMS, Email, Print sharing
- **Location SCI**: Lease comparison integrated into calculator
- Admin panel, CRM, Inventory management

## User Persona
- Quebec auto dealers working with Stellantis/FCA brands (Chrysler, Dodge, Jeep, Ram, Fiat)
- Language: French (primary)

## Tech Stack
- Frontend: React Native (Expo) served as static web build
- Backend: FastAPI (Python)
- Database: MongoDB
- OCR: Google Cloud Vision + OpenAI GPT-4o
- PDF parsing: PyMuPDF

## What's Been Implemented

### Phase 1-24 (Previous sessions)
- Full auth system, programs management, inventory, CRM
- Invoice scanner with hybrid OCR pipeline
- Calculator with Option 1/2, frequency toggle, term selection
- Excel export/import workflow
- SMS sharing with preview modal
- Print functionality
- Email sending
- Holdback calculation

### Phase 25 - Location SCI Feature (Feb 25, 2026) ✅
- **Backend**:
  - `GET /api/sci/residuals` - Serves vehicle residual values from `sci_residuals_feb2026.json`
  - `GET /api/sci/lease-rates` - Serves lease rate programs from `sci_lease_rates_feb2026.json`
  - `POST /api/sci/calculate-lease` - Calculates lease payments
- **Frontend**:
  - "Location SCI" toggle button integrated after financing results
  - Km/year selector (12k, 18k, 24k) with residual adjustment
  - Lease term selector (24-60 months)
  - Dual card display: Standard rate + Lease Cash vs Alternative rate
  - Best choice banner with savings
  - Location vs Financement comparison section
  - Uses same payment frequency as financing (monthly/biweekly/weekly)
- **Data Files**:
  - `backend/data/sci_residuals_feb2026.json` - 64 vehicles with residual %
  - `backend/data/sci_lease_rates_feb2026.json` - 69 vehicles (29 2026 + 40 2025) with rates

## Prioritized Backlog

### P1 - Validation Required
- User validation of parser fixes (MSRP, Net Cost, holdback)
- User validation of Excel workflow
- User validation of Location SCI feature

### P2 - Refactoring
- Refactor `server.py` into routes/ directory using APIRouter
- Continue refactoring `index.tsx` (extract `usePrograms.ts`)
- Refactor `inventory.tsx` into smaller components
- Clean up dead code in `parser.py`
- Evaluate `index_legacy.tsx` for deletion

### P3 - Future
- Automated frontend rebuild on file change
- More vehicle brands/programs support
- Enhanced lease calculation with taxes model refinement

## Key API Endpoints
- `POST /api/auth/login` - Authentication
- `GET /api/programs` - Financing programs
- `POST /api/inventory/scan-invoice` - Invoice OCR
- `GET /api/sci/residuals` - SCI residual values
- `GET /api/sci/lease-rates` - SCI lease rates
- `POST /api/sci/calculate-lease` - Lease calculation

## Architecture
```
/app
├── backend/
│   ├── data/
│   │   ├── sci_residuals_feb2026.json
│   │   └── sci_lease_rates_feb2026.json
│   ├── server.py
│   ├── parser.py
│   └── tests/
│       └── test_sci_lease.py
├── frontend/
│   ├── dist/           # Static web build
│   ├── app/(tabs)/
│   │   └── index.tsx   # Main calculator + SCI lease
│   ├── hooks/
│   │   └── useCalculator.ts
│   └── types/
│       └── calculator.ts
```
