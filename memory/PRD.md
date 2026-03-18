# CalcAuto AiPro - PRD

## Problem Statement
Application CRM pour un concessionnaire automobile. Permet de calculer les paiements de financement et de location pour les véhicules Chrysler/Dodge/Fiat/Jeep/Ram à partir des programmes mensuels d'incitatifs PDF.

## Core Features
- Calculateur de paiements (financement et location SCI)
- Importation et parsing de PDF mensuels d'incitatifs
- Gestion de l'inventaire véhicules
- CRM clients avec historique des soumissions
- Comparaison automatique "meilleures offres" entre mois
- Mode démo sans mot de passe
- Admin panel avec gestion d'ordre des véhicules

## Architecture
- **Frontend**: React/Expo (web) avec TypeScript
- **Backend**: FastAPI (Python) + MongoDB
- **Storage**: Supabase pour fichiers persistants
- **PDF Parsing**: pdfplumber (déterministe)

## Code Architecture (Hooks)
```
frontend/features/calculator/hooks/
├── useCalculatorPage.ts   (1322 lignes - orchestrateur principal)
├── useProgramsData.ts     (221 lignes - chargement, filtrage, périodes)
├── useInventoryData.ts    (128 lignes - inventaire, auto-financing)
└── useLeaseModule.ts      (289 lignes - calculs SCI lease)
```

## What's Been Implemented

### Session 2026-03-18 (Current)
- **Backend: Comparaison multi-variantes** - La logique "meilleures offres" vérifie maintenant TOUTES les variantes/trims, pas seulement la première (`find_one` → `find().to_list()`)
- **Backend: Gestion None** - Les taux `None` dans les programmes ne causent plus de crash
- **Frontend: Token refresh** - Ré-authentification automatique si le token expire lors de la sauvegarde de soumission
- **Frontend: Retry 401** - Si la sauvegarde échoue avec 401, retry avec un nouveau token
- **Frontend: Refactoring Phase 2** - Extraction de 3 sous-hooks (useProgramsData, useInventoryData, useLeaseModule) depuis useCalculatorPage.ts

### Previous Sessions
- Refactoring Phase 1: index.tsx (3695 → 1970 lignes) + useCalculatorPage.ts
- Bug fix: Soumissions email sauvegardées correctement
- Bug fix: Comparaison "meilleures offres" utilise Option 1 ET Option 2
- Mode démo, détection automatique de pages PDF, parsing pdfplumber

## Pending Issues
- P2: Onglet parasite `styles/homeStyles` dans la navigation (fichier dans dossier tabs)
- P2: Overlay Admin intercepte certains clics

## Upcoming Tasks
- (P1) UI gestion des corrections (`/api/corrections` admin interface)
- (P2) Refactorer `inventory.tsx` et `clients.tsx`

## Key Endpoints
- POST /api/auth/demo-login
- GET /api/programs?month=X&year=Y
- GET /api/program-meta?month=X&year=Y
- POST /api/compare-programs
- POST /api/submissions
- GET /api/submissions
- GET /api/better-offers

## Database
- MongoDB: test_database
- Collections: programs, submissions, better_offers, users, residuals, contacts

## Credentials
- Demo: demo@calcauto.ca / demo_access_2026
- Supabase: https://oslbndkfizswhsipjavm.supabase.co
