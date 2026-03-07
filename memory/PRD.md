# CalcAuto AiPro - PRD

## Original Problem Statement
Application CRM pour concessionnaires automobiles Stellantis/FCA Canada. Extraction déterministe des programmes de financement à partir de PDFs mensuels via pdfplumber.

## Core Features
1. **Parser PDF déterministe** (pdfplumber) pour extraire programmes retail et SCI Lease
2. **Mode Démo** - accès sans mot de passe via `demo@calcauto.ca`
3. **UI Dynamique** - bannière événement + toggles fidélité/paiement différé
4. **Calcul de financement** - logique complète avec options 1/2, taxes QC, accessoires, échange
5. **CI/CD** - GitHub Actions avec tests unitaires, déploiement Render/Vercel

## Architecture
- **Frontend**: React/Expo web (TypeScript)
- **Backend**: FastAPI (Python)
- **Database**: MongoDB (users, programs, submissions) + fichiers JSON (data/)
- **PDF Parsing**: pdfplumber + regex

## What's Been Implemented

### Completed (Mar 7, 2026 - Session courante)
- **TOC-first auto-detection** - Parse la Table des Matières (page 2) au lieu de scanner chaque page
- **Support dual-layout retail parser** - Layout A (Jan/Feb 25+ cols) et Layout B (Mars 24 cols séparés)
- **Détection dynamique des colonnes** - Indices de colonnes détectés depuis les headers
- **Bonus Cash parser** - Extraction des bonus cash de la page 8 (Bonus Cash Program)
- **Fix "All-New" prefix** - Suppression du préfixe "All-New" pour les modèles 2024
- **Fix word boundary** - "Grand Cherokee L" ne mange plus le "L" de "Laredo"
- **Animation comète** - Traînée de particules améliorée (code utilisateur)
- **Correction metadata Mars** - `no_payments_days=0`, `loyalty_rate=0.5`

### Résultats validés
- Janvier: 90 programmes, 83 SCI Lease, 1 bonus cash
- Février: 95 programmes, 74 SCI Lease, 1 bonus cash
- Mars: 93 programmes, 73 SCI Lease, 1 bonus cash (Fiat 500e $5000)
- 0 erreurs de noms sur les 3 mois

## Prioritized Backlog

### P1 - UI Gestion des Corrections
- Interface frontend admin pour `/api/corrections` APIs existantes

### P2 - Refactoring Frontend
- Découper `index.tsx`, `inventory.tsx`, `clients.tsx`

## Key Files
- `backend/services/pdfplumber_parser.py` - Parsers PDF (TOC, retail, bonus, lease)
- `backend/routers/import_wizard.py` - API import
- `frontend/components/AnimatedSplashScreen.tsx` - Animation comète
- `frontend/components/EventBanner.tsx` - Bannière événement
- `frontend/hooks/useCalculator.ts` - Logique calcul

## Credentials
- Admin: `Liana2018`
- Demo: auto-login `demo@calcauto.ca`
