# CalcAuto AiPro - PRD (Product Requirements Document)

## Problem Statement
Application CRM pour concessionnaire automobile Stellantis/FCA Canada. Calculateur de financement véhicules, gestion des clients, et importation automatique des programmes d'incitatifs mensuels depuis les PDFs Stellantis.

## Architecture
- **Frontend**: React Native (Expo) 
- **Backend**: FastAPI (Python)
- **Database**: MongoDB + fichiers JSON versionnés (données mensuelles)
- **PDF Parsing**: pdfplumber (déterministe, ZERO IA)

## Core Features
- CRM client avec historique des offres
- Calculateur de financement (Option 1/Option 2, Bonus Cash, taxes)
- Inventaire véhicules avec VIN decoder
- Importation automatique des programmes FCA depuis PDF
- Export Excel et envoi par email
- Panneau admin avec gestion des corrections

## Data Model
- **Programs**: MongoDB `programs` collection (brand, model, trim, year, consumer_cash, option1_rates, option2_rates, bonus_cash)
- **SCI Lease**: Fichiers JSON versionnés `sci_lease_rates_{month}{year}.json`
- **Key Incentives**: Fichiers JSON `key_incentives_{month}{year}.json`
- **Residuals**: Fichiers JSON `sci_residual_values_{month}{year}.json`

## What's Been Implemented

### Completed (March 6, 2026)
- [x] **P0 - Parser pdfplumber déterministe** (TERMINÉ - 18/18 tests passent)
  - `parse_retail_programs()`: 81 programmes Finance Prime (34 x 2026 + 47 x 2025)
  - `parse_sci_lease()`: 74 véhicules SCI Lease (29 x 2026 + 45 x 2025)
  - `parse_key_incentives()`: 13 entrées Go-to-Market summary
  - Détection marques inversées (RELSYRHC → Chrysler, PEEJ → Jeep, etc.)
  - Bonus Cash correctement identifié et extrait
  - Colonne Delivery Credit ignorée
  - Intégré dans `import_wizard.py` (sync + async endpoints)
  - OpenAI/GPT-4o entièrement supprimé du flux d'extraction
  - Modèles Pydantic mis à jour (FinancingRates Optional, VehicleProgram.option1_rates Optional)

### Previously Completed
- [x] SCI Lease Data Pipeline (dynamique + historique via ?month=&year=)
- [x] Data Carry-over (copie taux du mois précédent)
- [x] Offer Savings Calculation (méthode delta)
- [x] CRM Offer Modal & History Tab
- [x] Data Versioning by Filename

## Prioritized Backlog

### P1 - UI Gestion des Corrections
- Interface admin pour gérer les corrections de programmes
- Backend APIs `/api/corrections` existent déjà

### P2 - Refactoring Frontend
- Refactorer `index.tsx` (composant monolithique)
- Refactorer `inventory.tsx` (composant monolithique)
- Refactorer `clients.tsx` (composant monolithique)

## Key API Endpoints
- `POST /api/extract-pdf-async` - Extraction PDF async (pdfplumber)
- `GET /api/extract-task/{task_id}` - Poll task status
- `POST /api/extract-pdf` - Extraction PDF sync (pdfplumber)
- `GET /api/programs` - Liste des programmes
- `GET /api/sci/lease-rates` - Taux SCI Lease
- `POST /api/sci/import-rates` - Import taux SCI
- `POST /api/programs/import-excel` - Import Excel corrections

## Key Files
- `/app/backend/services/pdfplumber_parser.py` - Parser déterministe (NOUVEAU)
- `/app/backend/routers/import_wizard.py` - Workflow d'importation
- `/app/backend/routers/sci.py` - Endpoints SCI Lease
- `/app/backend/routers/programs.py` - CRUD programmes
- `/app/backend/models.py` - Modèles Pydantic

## Credentials
- Admin: `Liana2018`
- User: `danielgiroux007@gmail.com` / `Liana2018$`
