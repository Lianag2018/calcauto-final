# CalcAuto AiPro - PRD

## Original Problem Statement
Application CRM pour concessionnaires automobiles Stellantis/FCA Canada. Extraction déterministe des programmes de financement à partir de PDFs mensuels via pdfplumber (remplaçant l'ancienne solution IA/OCR).

## Core Features
1. **Parser PDF déterministe** (pdfplumber) pour extraire programmes retail et SCI Lease
2. **Mode Démo** - accès sans mot de passe via `demo@calcauto.ca`
3. **UI Dynamique** - bannière événement + toggles fidélité/paiement différé basés sur la couverture PDF
4. **Calcul de financement** - logique complète avec options 1/2, taxes QC, accessoires, échange
5. **CI/CD** - GitHub Actions avec tests unitaires, déploiement Render/Vercel

## Architecture
- **Frontend**: React/Expo web (TypeScript)
- **Backend**: FastAPI (Python)
- **Database**: MongoDB (users, programs, submissions) + fichiers JSON (data/)
- **PDF Parsing**: pdfplumber + regex

## What's Been Implemented

### Completed (Feb 2026)
- Parser PDF déterministe remplaçant IA/OCR
- Mode Démo avec auto-login
- EventBanner dynamique avec toggles fidélité et 90j
- Logique calcul fidélité (-0.5%) et paiement différé 90j
- CI/CD GitHub Actions
- Correction dépendances Render

### Completed (Mar 6, 2026)
- **TOC-first auto-detection** - Réécriture complète de `auto_detect_pages()` pour parser la Table des Matières (page 2) au lieu de scanner chaque page
- **Support dual-layout retail parser** - `parse_retail_programs()` gère deux layouts:
  - Layout A (Jan/Feb): noms + taux dans le même tableau (25+ cols)
  - Layout B (Mars): noms dans un tableau séparé, taux dans le tableau principal (24 cols)
- **Détection dynamique des colonnes** - Les indices de colonnes pour les taux sont détectés depuis les headers (plus de hardcoding)
- **Correction metadata Mars** - `no_payments_days=0` (pas 90), `loyalty_rate=0.5`
- **Résultats validés**: 
  - Janvier: 90 programmes, 83 SCI Lease
  - Février: 95 programmes, 74 SCI Lease
  - Mars: 93 programmes, 73 SCI Lease

## TOC Structure Reference
### January/February 2026
- Finance Prime Rate Landscapes: page 19 (data: 20-22)
- Finance Non-Prime Rate Landscapes: page 23 (data: 24-26)
- Lease Landscapes: page 27 (data: 28-29/30)

### March 2026
- Finance Prime Rate Landscapes: page 16 (data: 17-19)
- Finance Non-Prime Rate Landscapes: page 20 (data: 21-23)
- Lease Landscapes: page 24 (data: 25-26)
- Loyalty Finance Prime: page 34 (data: 35-36)
- Loyalty Lease: page 37 (data: 38-39)

## Prioritized Backlog

### P1 - UI Gestion des Corrections
- Interface frontend admin pour `/api/corrections` APIs existantes

### P2 - Refactoring Frontend
- Découper `index.tsx`, `inventory.tsx`, `clients.tsx`

### P3 - Loyalty Rate Landscapes (Mars)
- Parser les pages de taux fidélité (34-39 dans Mars) pour extraction séparée

## Key Files
- `backend/services/pdfplumber_parser.py` - Parsers PDF
- `backend/routers/import_wizard.py` - API import
- `frontend/components/EventBanner.tsx` - Bannière événement
- `frontend/hooks/useCalculator.ts` - Logique calcul
- `frontend/app/(tabs)/index.tsx` - Page calculateur principale

## Test Reports
- `/app/test_reports/iteration_25.json` - Tests TOC extraction (100% pass)
- `/app/backend/tests/test_toc_extraction.py` - Tests unitaires TOC
- `/app/backend/tests/test_ci_unit.py` - Tests CI

## Credentials
- Admin: `Liana2018`
- Demo: auto-login `demo@calcauto.ca`
