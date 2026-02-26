# CalcAuto AiPro - Product Requirements Document

## Problem Statement
Application full-stack de financement vehiculaire avec calculateur de location/financement,
OCR pour factures, gestion d'inventaire et CRM.

## Architecture
```
/app
├── backend/
│   ├── server.py              # Point d'entree minimal (71 lignes)
│   ├── database.py            # Connexion MongoDB, config, logger
│   ├── models.py              # Tous les modeles Pydantic (incl. sort_order)
│   ├── dependencies.py        # Auth helpers, utilitaires
│   ├── routers/
│   │   ├── auth.py            # Authentification (register, login, logout)
│   │   ├── programs.py        # Programmes CRUD, calcul, periodes, tri logique
│   │   ├── submissions.py     # CRM (soumissions, rappels, meilleures offres)
│   │   ├── contacts.py        # Gestion des contacts
│   │   ├── inventory.py       # Inventaire vehicules, stats, codes produits
│   │   ├── invoice.py         # Scanner de factures OCR (VIN, codes FCA)
│   │   ├── email.py           # Envoi d'emails, window sticker
│   │   ├── import_wizard.py   # Import PDF taux/residuels
│   │   ├── sci.py             # Location SCI (residuels, taux)
│   │   └── admin.py           # Administration
│   ├── services/
│   │   ├── window_sticker.py  # Fetch/convert window stickers
│   │   └── email_service.py   # Service d'envoi d'email SMTP
│   ├── scripts/
│   │   └── setup_trim_orders.py # Script extraction/setup des ordres de tri
│   └── data/                  # Fichiers JSON (taux, residuels, codes)
├── frontend/
│   ├── app/(tabs)/
│   │   ├── index.tsx          # Calculateur principal (~3691 lignes)
│   │   ├── styles/
│   │   │   └── homeStyles.ts  # Styles extraits
│   │   ├── clients.tsx        # Historique soumissions
│   │   └── inventory.tsx      # Gestion inventaire
│   ├── components/
│   │   ├── LoadingBorderAnimation.tsx
│   │   └── ...
│   ├── types/
│   │   └── calculator.ts      # Types (VehicleProgram avec sort_order)
│   └── utils/
│       └── api.ts             # Resolution dynamique URL backend
```

## MongoDB Collections
- `programs`: Programmes de financement (avec sort_order)
- `trim_orders`: Hierarchie des trims par marque/modele (29 entries)
- `code_guides`: Metadata des guides de commande PDF (65 entries)
- `users`, `submissions`, `contacts`, `inventory`

## Completed Features
- Calculateur location SCI + financement
- "Meilleur Choix" automatique (location)
- Grille d'analyse comparative
- Partage SMS avec captures d'ecran
- Sauvegarde/restauration de calculs depuis l'historique
- Scanner de factures (OCR: Google Cloud Vision + GPT-4o)
- Gestion inventaire avec Window Sticker
- Import de programmes depuis PDF
- CRM avec rappels
- Integration body_style pour residuels

## Completed - Refactoring (Feb 26, 2026)
- Backend: server.py 7315 → 71 lignes (15 modules)
- Frontend: index.tsx 5853 → 3665 lignes (styles + composant extraits)
- Tests: 21/21 endpoints backend OK, 0 regression

## Completed - Tri Logique des Vehicules (Feb 26, 2026)
- Extraction de l'ordre des trims depuis les guides de commande officiels Stellantis (PDFs)
- Stockage dans MongoDB (trim_orders collection, code_guides collection)
- Champ sort_order sur chaque programme (hierarchie fabricant)
- Tri backend: sort_order ASC dans GET /api/programs
- Tri frontend: sort_order dans les deux points de tri (chargement + filtre)
- Endpoints: GET /api/trim-orders, POST /api/trim-orders/recalculate
- Import auto du sort_order lors de l'import de nouveaux programmes
- Tests: 13/13 backend OK, frontend verifie

## Key API Endpoints
- GET /api/programs - Programmes tries par sort_order
- GET /api/trim-orders - Ordres de tri stockes
- POST /api/trim-orders/recalculate - Recalcul des sort_order
- POST /api/calculate - Calcul financement
- POST /api/auth/login - Connexion

## P1 Backlog
- Verifier donnees "Option 2" sur tous les modeles

## P2 Backlog
- Refactoring complet frontend/app/(tabs)/index.tsx (extraction hooks)
- Refactoring frontend/app/(tabs)/inventory.tsx
- Amelioration continue du parseur OCR

## Credentials
- Login: danielgiroux007@gmail.com / Liana2018$
- Admin password: Liana2018$
