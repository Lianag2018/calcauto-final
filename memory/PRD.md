# CalcAuto AiPro - PRD

## Original Problem Statement
Application CRM pour concessionnaires automobiles Stellantis/FCA Canada. Extraction deterministe des programmes de financement a partir de PDFs mensuels via pdfplumber.

## CORRECTIONS CRITIQUES (Mar 10, 2026)

### 1. Protection anti-perte de donnees
**Probleme**: L'ancien code effacait les programmes AVANT l'extraction. Si extraction echouait (0 programmes), les donnees etaient perdues.
**Fix**: Si 0 programmes extraits, les donnees existantes sont CONSERVEES avec message d'erreur.

### 2. Auto-correction des numeros de pages
**Probleme**: L'utilisateur entrait les pages de Fevrier (20-21) pour le PDF de Mars qui a des pages differentes (17-19). Resultat: 0 programmes.
**Fix**: L'extraction auto-detecte TOUJOURS les pages depuis le TOC, ignorant les pages manuelles. Meme avec des mauvaises pages, le systeme trouve les bonnes.

### 3. Cherokee 2026 - pas d'Option 2
**Probleme**: Les anciennes donnees montraient Option 2 pour Cherokee 2026 qui n'existe pas dans le PDF de Mars.
**Fix**: Re-extraction avec parseur corrige. Cherokee 2026 a seulement Option 1 a 4.99%.

## Pages par PDF (auto-detectees depuis TOC)
- **Fevrier 2026** (29 pages): Retail=20-22, SCI Lease=28-29
- **Mars 2026** (39 pages): Retail=17-19, SCI Lease=25-26
- Note: les numeros de pages CHANGENT entre les mois car les PDFs ont des structures differentes

## Architecture
- **Frontend**: React/Expo web (TypeScript)
- **Backend**: FastAPI (Python)
- **Database**: MongoDB + fichiers JSON (data/)
- **PDF Parsing**: pdfplumber + regex

## What's Been Implemented

### Completed (Mar 10, 2026)
- Protection anti-perte de donnees (0 programmes → garde les existants)
- Auto-correction pages (ignore les pages manuelles, utilise TOC)
- Fix nommage modeles combines (Grand Cherokee/Grand Cherokee L)
- Ajout modeles: Grand Wagoneer L, Wagoneer L
- Fix DB: 13 corrections (duplications + bug "aredo")
- Tests: 12/12 backend (iteration_27), 23/23 (iteration_26)

### Completed (Sessions precedentes)
- TOC-first auto-detection
- Support dual-layout (Layout A/B)
- Bonus Cash parser (page 8)
- Fix "All-New", fix word boundary "Laredo"
- Mode Demo, Detection auto pages, CI/CD

## Prioritized Backlog
- P1: Splash Screen Animation (attente retour utilisateur)
- P2: UI Gestion des Corrections (admin panel)
- P3: Refactoring Frontend (index.tsx 3696 lignes)

## Key Files
- `backend/services/pdfplumber_parser.py` - Parsers PDF
- `backend/routers/import_wizard.py` - API extraction (PROTEGE)
- `backend/data/march2026_source.pdf` - PDF Mars pour tests

## Key API Endpoints
- `POST /api/extract-pdf` - Extraction sync (auto-detecte pages, protege contre perte)
- `POST /api/extract-pdf-async` - Extraction async (auto-detecte pages, protege contre perte)
- `GET /api/programs?month=M&year=Y` - Liste programmes
- `GET /api/sci/lease-rates` - Taux SCI Lease
