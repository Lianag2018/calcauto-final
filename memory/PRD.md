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
- **Extraction PDF Mars 2026** - 93 programmes + 73 taux SCI Lease extraits correctement
  - Auto-detection pages correcte: retail=17-19, SCI=25-26 (Mars a 39 pages vs 29 pour Fevrier)
  - Cherokee 2026: seulement Option 1 a 4.99%, PAS d'Option 2
  - Grand Cherokee/Grand Cherokee L: taux variables 0.99-4.49%
  - Fiat 500e: CC=$7,000, BC=$5,000 (2025)
- **Fix nommage modeles combines** - "Grand Cherokee/Grand Cherokee L" correctement parse
- **Ajout modeles manquants** - Grand Wagoneer L, Wagoneer L ajoutes a MODELS_BY_BRAND
- **Fix DB existante** - 13 corrections appliquees (duplications + bug "aredo")
- **Tests complets** - 12/12 backend (iteration_27), 23/23 backend (iteration_26)

### Completed (Sessions precedentes)
- **TOC-first auto-detection** - Parse la Table des Matieres (page 2)
- **Support dual-layout retail parser** - Layout A (Jan/Feb 25+ cols) et Layout B (Mars 24 cols)
- **Detection dynamique des colonnes** - Indices detectes depuis les headers
- **Bonus Cash parser** - Extraction de la page 8 (Bonus Cash Program)
- **Fix "All-New" prefix** - Suppression du prefixe "All-New"
- **Fix word boundary** - "Grand Cherokee L" ne mange plus le "L" de "Laredo"
- **Animation comete** - Trainee de particules (code utilisateur)
- **Mode Demo** - Auto-login sans mot de passe
- **Detection auto pages** - Plus besoin d'entrer les numeros de pages manuellement

### Resultats valides Mars 2026
- 93 programmes (36 x 2026, 43 x 2025, 14 x 2024)
- 73 SCI Lease (33 x 2026, 40 x 2025)
- Cherokee 2026: opt1=4.99% flat, opt2=None
- Grand Cherokee 2026: opt1=0.99%-4.49%, opt2=None
- Compass North: CC=$3,500, opt1=True, opt2=True
- 0 duplications de nommage

## Important: Guide d'extraction
- **Fevrier 2026** (29 pages): Retail=20-22, SCI=28-29
- **Mars 2026** (39 pages): Retail=17-19, SCI=25-26
- Les pages sont auto-detectees depuis le TOC (page 2) - NE PAS changer les pages auto-detectees

## Prioritized Backlog

### P1 - Splash Screen Animation
- En attente du retour utilisateur sur la derniere version

### P2 - UI Gestion des Corrections
- Interface frontend admin pour `/api/corrections` APIs existantes

### P3 - Refactoring Frontend
- Decouper `index.tsx` (3696 lignes), `inventory.tsx`, `clients.tsx`

## Key Files
- `backend/services/pdfplumber_parser.py` - Parsers PDF
- `backend/routers/import_wizard.py` - API import et extraction
- `backend/routers/programs.py` - CRUD programmes
- `backend/routers/sci.py` - API SCI Lease rates
- `frontend/utils/leaseCalculator.ts` - Logique calcul location
- `frontend/app/(tabs)/index.tsx` - Page principale calculateur
- `backend/data/march2026_source.pdf` - PDF Mars pour tests

## Key API Endpoints
- `POST /api/extract-pdf` - Extraction PDF sync
- `POST /api/extract-pdf-async` - Extraction PDF async (auto-detect pages)
- `GET /api/programs?month=M&year=Y` - Liste programmes
- `GET /api/sci/lease-rates` - Taux SCI Lease
- `GET /api/sci/residuals` - Residuels vehicules
