# CalcAuto AiPro - PRD

## Problem Statement
Car dealership CRM that parses FCA Canada monthly incentive PDFs to extract retail programs, SCI lease rates, and display them via a dynamic calculator UI. Originally used AI/OCR; now uses deterministic pdfplumber parsing.

## Architecture
- **Backend:** FastAPI + pdfplumber + pandas, file-based storage in `backend/data/`
- **Frontend:** React/Expo (static export), served from `dist/`
- **DB:** MongoDB (users, submissions, corrections)
- **CI/CD:** GitHub Actions -> Render (backend) + Vercel (frontend)

## Completed Features
1. **Deterministic PDF Parser** (pdfplumber) - replaces old AI/OCR
2. **TOC-based Auto-Detection** - parses Table of Contents on page 2
3. **Retail Program Parser** - extracts Option 1, Option 2, Consumer Cash, Bonus Cash
4. **SCI Lease Parser** - FIXED row alignment bug (2-row offset between names/rates tables)
5. **Bonus Cash Parser** - separate page parsing
6. **Dynamic Event Banner** - promotional info from PDF cover page
7. **Loyalty Rate & 90-day Deferred Payment** - calculation modifiers
8. **Demo Mode** - password-free access via demo@calcauto.ca
9. **CI/CD Pipeline** - GitHub Actions with pytest + deploy hooks
10. **Animated Splash Screen** - comet trail loading animation
11. **Corrections Management UI** - Admin panel tab for viewing/deleting corrections
12. **Improved Residual Vehicle Matching** - 10-priority matching with effectiveModel, keyword, and fallback levels

## Key Bug Fixes (Current Session)
- **SCI Lease Row Alignment:** Fixed 2-row offset between names table (row 14) and rates table (row 12). Uses zip of filtered lists.
- **Residual Vehicle Matching:** Improved `findResidualVehicle` from 2-priority to 10-priority matching. Added effectiveModel extraction from trim (e.g., "Grand Cherokee L" from trim "Grand Cherokee L Altitude..."), keyword matching, and base model fallback.

## API Endpoints
- `POST /api/scan-pdf` - auto-detect section pages
- `POST /api/extract-pdf` - full PDF extraction pipeline
- `GET /api/corrections` - list memorized corrections
- `DELETE /api/corrections/{brand}/{model}/{year}` - delete correction
- `DELETE /api/corrections/all` - delete all corrections
- `GET /api/programs/:month/:year` - get programs

## Credentials
- Admin: password `Liana2018`
- Demo: auto-login `demo@calcauto.ca`

## Upcoming Tasks
- **(P2)** Refactor large frontend components (index.tsx, inventory.tsx, clients.tsx)
- **(P3)** Parse Loyalty Rate Landscapes (pages 34-39 in March PDF)
