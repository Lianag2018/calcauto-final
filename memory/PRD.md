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
│   ├── models.py              # Tous les modeles Pydantic
│   ├── dependencies.py        # Auth helpers, utilitaires
│   ├── routers/
│   │   ├── auth.py            # Authentification (register, login, logout)
│   │   ├── programs.py        # Programmes CRUD, calcul, periodes
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
│   └── data/                  # Fichiers JSON (taux, residuels, codes)
├── frontend/
│   ├── app/(tabs)/
│   │   ├── index.tsx          # Calculateur principal (3665 lignes)
│   │   ├── styles/
│   │   │   └── homeStyles.ts  # Styles extraits (2067 lignes)
│   │   ├── clients.tsx        # Historique soumissions
│   │   └── inventory.tsx      # Gestion inventaire
│   ├── components/
│   │   ├── LoadingBorderAnimation.tsx  # Animation chargement extraite
│   │   └── ...
│   └── hooks/
│       └── useCalculator.ts   # Hook calcul financement
```

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

## P2 Backlog
- Refactoring frontend/app/(tabs)/inventory.tsx
- Amelioration continue du parseur OCR

## Credentials
- Login: danielgiroux007@gmail.com / Liana2018$
- Admin password: Liana2018$
