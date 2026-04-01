# CalcAuto AiPro - PRD

## Problem Statement
CRM complet pour concessionnaires automobiles qui analyse les PDFs mensuels d'incitatifs financiers FCA Canada/Stellantis. Extraction déterministe via pdfplumber, calcul de location/financement avec UI dynamique.

## Architecture
- **Backend:** FastAPI + pdfplumber + PyMuPDF(fitz), stockage fichiers dans `backend/data/`
- **Frontend:** Expo/React Native for Web (TypeScript)
- **DB:** MongoDB Atlas (users, submissions, corrections, inventory)
- **Stockage:** Supabase Storage (persistance fichiers JSON)
- **CI/CD:** GitHub Actions -> Render (backend) + Vercel (frontend)

## Completed Features
1. **Deterministic PDF Parser** (pdfplumber) - replaces old AI/OCR
2. **TOC-based Auto-Detection** - parses Table of Contents on page 2
3. **Retail Program Parser** - extracts Option 1, Option 2, Consumer Cash, Bonus Cash
4. **SCI Lease Parser** - with row alignment fix (2-row offset)
5. **Bonus Cash Parser** - separate page parsing
6. **Dynamic Event Banner** - promotional info from PDF cover page
7. **Loyalty Rate & 90-day Deferred Payment** - calculation modifiers
8. **Demo Mode** - password-free access via demo@calcauto.ca
9. **CI/CD Pipeline** - GitHub Actions with pytest + deploy hooks
10. **Animated Splash Screen** - comet trail loading animation
11. **Corrections Management UI** - Admin panel tab for corrections
12. **Improved Residual Vehicle Matching** - 10-priority matching + primary trim priority
13. **Supabase Storage Integration** - persistence for ephemeral deployments
14. **Dynamic KM Adjustments Extraction** - from General Rules section AND from SCI residual guide last page
15. **Auto-Import Résiduel Guide** - Auto-détection mois/année, extraction km adjustments, comparaison ancien/nouveau
16. **Primary Trim Matching Fix** - For multi-trim programs (e.g. "Sport, Rebel"), prioritizes first trim variant to prevent incorrect residual matching

## Bug Fixes (This Session)
- **Sport 2026 residual 52% → 51%** : Matching "Sport, Rebel" found Rebel (47%) before Sport (46%). Fixed by adding P0/P1.5 priority levels for primary trim matching.
- **CI/CD test failure** : `test_mar_metadata_structure` assertion on `no_payments_days` fixed.
- **Hardcoded "FEBRUARY 2026"** filter in residual guide upload - replaced with generic month pattern matching.

## Key APIs
- `POST /api/scan-pdf` - auto-detect section pages via TOC
- `POST /api/extract-pdf-async` - full PDF extraction pipeline
- `GET /api/sci/residuals` - residuals + dynamic km_adjustments
- `POST /api/upload-residual-guide` - upload SCI residual PDF (auto-detect month, compare, extract km adj)
- `GET /api/sci/lease-rates` - lease rates data

## Credentials
- Admin: danielgiroux007@gmail.com / Liana2018$
- Demo: auto-login demo@calcauto.ca

## Upcoming Tasks
- **(P2)** Extraction des "Loyalty Rate Landscapes" comme type distinct
- **(P3)** Refactorisation composants massifs (index.tsx ~3700 lignes, inventory.tsx, clients.tsx)
