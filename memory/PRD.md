# CalcAuto AiPro - Product Requirements Document

## Problème Original
Application CRM pour concessionnaires automobiles utilisant un parser PDF déterministe (pdfplumber) pour extraire les données de programmes de financement mensuels FCA Canada.

## Architecture
- **Frontend**: React/Expo (TypeScript)
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Parser**: pdfplumber (déterministe, sans IA)

## Fonctionnalités Implémentées

### Parser PDF (CORE)
- Extraction déterministe via pdfplumber (Layout A: Jan/Feb, Layout B: Mars+)
- Stratégie TOC-first pour détection automatique des pages
- Extraction Consumer Cash, taux Option 1 et Option 2 (36m-96m)
- Extraction Alternative Consumer Cash
- Extraction Bonus Cash depuis page dédiée (page 8)
- **[Mars 2026] Détection des marqueurs de loyauté "P"** (colonnes 2, 4, 16)
- Extraction SCI Lease rates
- Extraction Key Incentives

### Export Excel (VÉRIFIÉ)
- Onglet "Financement": Année, Marque, Modèle, Version, P(Loyauté), Rabais, Taux 36m-96m (Opt1 + Opt2), Bonus
- Onglet "SCI Lease": Marque, Modèle, Rabais, Taux Standard/Alternative
- Freeze panes F4 (5 colonnes + 3 lignes d'en-tête figées)
- Couleurs par section (rouge Opt1, bleu Opt2, vert Bonus, orange Loyauté)
- **Endpoint GET /api/download-excel?month=X&year=Y** pour téléchargement direct

### Protection des Données
- Pas de suppression des données existantes si extraction retourne 0 programmes
- Auto-détection forcée des pages (ignore les valeurs client)

### Mode Démo
- Connexion automatique demo@calcauto.ca avec accès admin complet

### CI/CD
- GitHub Actions configuré (test-backend + deploy)
- Fix du test unitaire bloquant (PENDING PUSH via "Save to GitHub")

## Endpoints API Clés
- `POST /api/extract-pdf` - Import PDF synchrone
- `POST /api/extract-pdf-async` - Import PDF asynchrone
- `GET /api/download-excel?month=3&year=2026` - Téléchargement Excel
- `GET /api/programs` - Liste des programmes
- `GET /api/sci/lease-rates` - Taux SCI Lease
- `GET /api/program-meta?month=3&year=2026` - Métadonnées du programme

## Schéma DB
- `db.programs`: brand, model, trim, year, consumer_cash, alt_consumer_cash, bonus_cash, option1_rates, option2_rates, loyalty_cash, loyalty_opt1, loyalty_opt2, program_month, program_year
- `db.residuals`: Valeurs résiduelles
- `db.users`: Comptes utilisateurs

## Tâches Restantes (par priorité)
- **P0**: CI/CD - L'utilisateur doit cliquer "Save to GitHub" pour pousser les fixes
- **P1**: Splash screen animé - en attente du feedback utilisateur
- **P2**: Interface de gestion des corrections (frontend)
- **P3**: Refactoring des composants frontend (index.tsx, inventory.tsx, clients.tsx)
