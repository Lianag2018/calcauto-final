# CalcAuto AiPro - Product Requirements Document

## Problem Statement
Application full-stack de financement vehiculaire avec calculateur de location/financement,
OCR pour factures, gestion d'inventaire et CRM.

## Architecture
```
/app
├── backend/
│   ├── server.py              # Point d'entree minimal
│   ├── database.py            # Connexion MongoDB, config, logger
│   ├── models.py              # Modeles Pydantic (incl. sort_order)
│   ├── dependencies.py        # Auth helpers, utilitaires
│   ├── routers/
│   │   ├── programs.py        # Programmes CRUD, calcul, tri logique PDF
│   │   ├── auth.py, submissions.py, contacts.py, inventory.py
│   │   ├── invoice.py, email.py, import_wizard.py, sci.py, admin.py
│   ├── services/              # window_sticker.py, email_service.py
│   ├── scripts/
│   │   └── setup_trim_orders.py  # Mapping exact PDF → sort_order
│   └── data/                  # JSON (taux, residuels, codes)
├── frontend/
│   ├── app/(tabs)/index.tsx   # Calculateur (tri par sort_order)
│   ├── types/calculator.ts    # VehicleProgram avec sort_order
│   └── utils/api.ts           # Resolution dynamique URL backend
```

## MongoDB Collections
- `programs`: Programmes de financement (avec sort_order = position PDF)
- `trim_orders`: Hierarchie des trims par marque/modele/annee (35 entries)
- `code_guides`: Metadata des guides de commande PDF (65 entries)

## Completed Features
- Calculateur location SCI + financement
- "Meilleur Choix" automatique, Grille d'analyse comparative
- Partage SMS, Sauvegarde/restauration calculs
- Scanner factures (OCR: Google Cloud Vision + GPT-4o)
- Import programmes depuis PDF, CRM avec rappels
- Gestion inventaire avec Window Sticker

## Completed - Backend Refactoring (Feb 26, 2026)
- server.py 7315 → 71 lignes (15 modules)
- Tests: 21/21 endpoints OK

## Completed - Tri Logique PDF (Feb 26, 2026)
- sort_order = position exacte dans le PDF FCA QBC Incentive Landscape
- 2026: page 20 (34 programmes, sort_order 0-33)
- 2025: page 21 (47 programmes, sort_order 0-46)
- Ordre: Chrysler → Jeep → Dodge → Ram → Fiat
- Compass: Sport → North → North+ADZ → Trailhawk → Limited
- Wrangler 2026: 2-Door → 2-Door Rubicon → 4-Door → 4-Door MOAB
- Wrangler 2025: 4xe → 2-Door → 2-Door Rubicon → 4-Door Rubicon → 4-Door
- Ram 1500: Tradesman → Big Horn → Sport,Rebel → Laramie → Limited...
- Stockage MongoDB: trim_orders + code_guides collections
- Auto-assign sort_order lors de l'import de nouveaux programmes
- Tests: 13/13 backend OK + verification visuelle frontend

## P1 Backlog
- Verifier donnees "Option 2" sur tous les modeles

## P2 Backlog
- Refactoring complet frontend index.tsx (hooks)
- Refactoring inventory.tsx

## Credentials
- Login: danielgiroux007@gmail.com / Liana2018$
- Admin: Liana2018$
