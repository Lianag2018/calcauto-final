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
│   │   ├── email.py           # Email soumission (taux dynamiques)
│   │   ├── auth.py, submissions.py, contacts.py, inventory.py
│   │   ├── invoice.py, import_wizard.py, sci.py, admin.py
│   ├── services/              # window_sticker.py, email_service.py
│   ├── scripts/
│   │   └── setup_trim_orders.py  # Mapping exact PDF → sort_order
│   └── data/                  # JSON (taux, residuels, codes)
├── frontend/
│   ├── app/(tabs)/index.tsx   # Calculateur (tri sort_order, SMS screenshot)
│   ├── types/calculator.ts    # VehicleProgram avec sort_order
│   └── utils/api.ts           # Resolution dynamique URL backend
```

## MongoDB Collections
- `programs`: Programmes de financement (avec sort_order = position PDF)
- `trim_orders`: Hierarchie des trims par marque/modele/annee
- `code_guides`: Metadata des guides de commande PDF (65 entries)

## Completed Features
- Calculateur location SCI + financement
- "Meilleur Choix" automatique, Grille d'analyse comparative
- Partage SMS/texto avec screenshot (tableau taux + details + options)
- Soumission email avec taux dynamiques (Option 1 seule ou 1+2)
- Scanner factures (OCR: Google Cloud Vision + GPT-4o)
- Import programmes depuis PDF, CRM avec rappels
- Gestion inventaire avec Window Sticker
- Inventaire filtre par modele (pas juste marque)

## Completed - Tri Logique PDF (Feb 26, 2026)
- sort_order = position exacte dans le PDF FCA QBC Incentive Landscape
- 2026: page 20 (34 programmes, sort_order 0-33)
- 2025: page 21 (47 programmes, sort_order 0-46)

## Completed - Email/SMS Coherence (Feb 26, 2026)
- Tableau des taux dynamique (avant: hardcode avec mauvaises valeurs)
- Si Option 2 = null: colonne Option 2 masquee partout
- SMS screenshot: meme structure que email (taux + details + comparaison)
- Frontend envoie rates_table avec option1_rates et option2_rates reels

## P1 Backlog
- Verifier donnees "Option 2" sur tous les modeles

## P2 Backlog
- Refactoring complet frontend index.tsx (hooks)
- Refactoring inventory.tsx

## Credentials
- Login: danielgiroux007@gmail.com / Liana2018$
- Admin: Liana2018$
