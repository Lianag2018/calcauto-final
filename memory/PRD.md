# CalcAuto AiPro - PRD

## Probleme original
Application CRM pour concessionnaire automobile. Parseur PDF deterministe avec `pdfplumber` pour extraire les programmes d'incitatifs mensuels (taux finance, location SCI, bonus cash, loyaute).

## Architecture
- **Frontend**: React Native / Expo (Web) - port 3000 (dist statique)
- **Backend**: FastAPI - port 8001
- **DB**: MongoDB (programmes, utilisateurs, corrections)
- **Storage**: Supabase Storage (PDFs, JSON mensuels, guides residuels)
- **Parseur**: `pdfplumber` + `openpyxl` pour Excel

## Storage Supabase
- Bucket: `calcauto-data`
- `monthly/{mois}{annee}/` : JSON extraits + PDF source
- `reference/` : guides residuels (65 PDFs), codes produits
- Sync automatique au demarrage du serveur
- Upload automatique apres chaque extraction

## Fonctionnalites implementees

### Import PDF avec Checkboxes (Mars 2026)
- TOC page 2 lu automatiquement via `improved_parse_toc`
- 13 sections detectees avec classification automatique
- Frontend: checkboxes pour selectionner les sections a extraire
- Backend: `/scan-pdf` retourne toutes les sections, `/extract-pdf-async` accepte `selected_sections`

### Parseur PDF robuste
- Strategie "content-driven" (identifie colonnes par headers)
- Alignement correct noms/taux dans parse_sci_lease (fix offset 2 rangees)
- Matching strict Cherokee vs Grand Cherokee dans findRateEntry
- parse_bonus_cash_page, parse_retail_programs_content_driven, parse_sci_lease
- Validation des donnees avec rapport dans Excel

### Supabase Storage Integration
- Module `backend/services/storage.py`
- Sync au demarrage : telecharge JSON depuis Supabase
- Upload apres extraction : sauvegarde JSON + PDF sur Supabase
- Repo Git allege : 20MB -> 220KB dans data/

### Autres
- Mode Demo: `demo@calcauto.ca`
- Detection automatique des pages (TOC-first)
- CI/CD GitHub Actions
- Export Excel avec onglets multiples
- .gitignore nettoye (corrompu par Save to GitHub)

## Backlog
- (P2) UI Gestion des corrections frontend
- (P3) Refactoring composants frontend volumineux

## Fichiers cles
- `backend/services/pdfplumber_parser.py` - Logique de parsing
- `backend/services/storage.py` - Module Supabase Storage
- `backend/routers/import_wizard.py` - Orchestration import + Excel
- `frontend/app/import.tsx` - UI import PDF avec checkboxes
- `frontend/utils/leaseCalculator.ts` - Calcul taux + matching strict

## Schema BD
- `db.programs`: Donnees finance
- `db.sci_lease_rates`: Taux location SCI
- `db.corrections`: Corrections manuelles
- `db.extract_tasks`: Taches d'extraction async

## Credentials
- Demo: `demo@calcauto.ca`
- Admin password: `Liana2018`
- Supabase: `https://oslbndkfizswhsipjavm.supabase.co`
