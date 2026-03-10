# CalcAuto AiPro - PRD

## Original Problem Statement
Application CRM pour concessionnaires automobiles Stellantis/FCA Canada. Extraction deterministe des programmes de financement a partir de PDFs mensuels via pdfplumber.

## Core Features
1. **Parser PDF deterministe** (pdfplumber) pour extraire programmes retail et SCI Lease
2. **Mode Demo** - acces sans mot de passe via `demo@calcauto.ca`
3. **UI Dynamique** - banniere evenement + toggles fidelite/paiement differe
4. **Calcul de financement** - logique complete avec options 1/2, taxes QC, accessoires, echange
5. **Calcul Location SCI** - lease calculator avec residuels, ajustement km, taux standard/alternatif
6. **CI/CD** - GitHub Actions avec tests unitaires, deploiement Render/Vercel

## Architecture
- **Frontend**: React/Expo web (TypeScript)
- **Backend**: FastAPI (Python)
- **Database**: MongoDB (users, programs, submissions) + fichiers JSON (data/)
- **PDF Parsing**: pdfplumber + regex

## What's Been Implemented

### Completed (Mar 10, 2026 - Session courante)
- **Fix nommage modeles combines** - "Grand Cherokee/Grand Cherokee L" correctement parse (plus de duplication trim)
- **Ajout modeles manquants** - Grand Wagoneer L, Wagoneer L ajoutes a MODELS_BY_BRAND
- **Fix Brand Wagoneer** - Wagoneer sous Chrysler corrige vers Jeep
- **Fix DB existante** - 13 corrections appliquees (6 dups Mars, 6 dups Fev, 1 aredo)
- **Verification SCI Lease Mars** - 33 vehicules 2026 + 40 vehicules 2025, matching OK
- **Tests complets** - 23/23 backend, 100% frontend

### Completed (Sessions precedentes)
- **TOC-first auto-detection** - Parse la Table des Matieres (page 2)
- **Support dual-layout retail parser** - Layout A (Jan/Feb 25+ cols) et Layout B (Mars 24 cols)
- **Detection dynamique des colonnes** - Indices detectes depuis les headers
- **Bonus Cash parser** - Extraction de la page 8 (Bonus Cash Program)
- **Fix "All-New" prefix** - Suppression du prefixe "All-New"
- **Fix word boundary** - "Grand Cherokee L" ne mange plus le "L" de "Laredo"
- **Animation comete** - Trainee de particules (code utilisateur)
- **Correction metadata Mars** - `no_payments_days=0`, `loyalty_rate=0.5`
- **Mode Demo** - Auto-login sans mot de passe
- **Detection auto pages** - Plus besoin d'entrer les numeros de pages manuellement

### Resultats valides
- Janvier: 90 programmes, 83 SCI Lease, 1 bonus cash
- Fevrier: 95 programmes, 74 SCI Lease, 1 bonus cash (re-extrait avec corrections)
- Mars: 93 programmes, 73 SCI Lease, 1 bonus cash (Fiat 500e $5000)
- 0 duplications de nommage sur tous les mois
- Matching SCI Lease fonctionne pour tous les vehicules (Cherokee, Grand Cherokee, Wagoneer)

## Prioritized Backlog

### P1 - Splash Screen Animation
- En attente du retour utilisateur sur la derniere version

### P2 - UI Gestion des Corrections
- Interface frontend admin pour `/api/corrections` APIs existantes

### P3 - Refactoring Frontend
- Decouper `index.tsx` (3696 lignes), `inventory.tsx`, `clients.tsx`

## Key Files
- `backend/services/pdfplumber_parser.py` - Parsers PDF (TOC, retail, bonus, lease, split_model_trim)
- `backend/routers/import_wizard.py` - API import et extraction async
- `backend/routers/programs.py` - CRUD programmes
- `backend/routers/sci.py` - API SCI Lease rates et residuels
- `frontend/utils/leaseCalculator.ts` - Logique calcul location (findRateEntry, findResidualVehicle)
- `frontend/app/(tabs)/index.tsx` - Page principale calculateur
- `frontend/components/AnimatedSplashScreen.tsx` - Animation comete

## Key API Endpoints
- `POST /api/extract-pdf-async` - Extraction PDF async
- `GET /api/programs?month=M&year=Y` - Liste programmes
- `GET /api/sci/lease-rates` - Taux SCI Lease
- `GET /api/sci/residuals` - Residuels vehicules
- `POST /api/auth/demo-login` - Connexion demo

## DB Schema
- `db.programs` - Programmes vehicules (model, trim, rates, consumer_cash, bonus_cash)
- `db.users` - Comptes utilisateurs
- `db.residuals` - Valeurs residuelles
