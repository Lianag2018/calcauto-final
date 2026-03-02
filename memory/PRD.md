# CalcAuto AiPro - PRD

## Problem Statement
Application de gestion de financement et location automobile pour concessionnaires FCA Canada. Permet de calculer les paiements de financement et de location, gérer les programmes de rabais, importer/exporter des données via Excel et PDF.

## Core Requirements
- **Calcul de financement**: Option 1 (rabais + taux standard) vs Option 2 (taux réduit)
- **Calcul de location SCI**: Paiements mensuels, bi-hebdo, hebdo avec résiduels
- **Import PDF automatique**: Extraction IA (GPT-4o) des programmes depuis PDF Stellantis
- **Workflow Excel**: Export → correction manuelle → réimport comme source de vérité
- **Système de comparaison avant/après**: Snapshot MongoDB avant import, diff détaillé, historique
- **Matching flexible**: Clé composite avec normalisation (retire codes CPOS, WLJH74, etc.)
- **Force logout**: Invalidation des tokens après import

## Architecture
- **Frontend**: React Native (Expo) web
- **Backend**: FastAPI + MongoDB (motor)
- **3rd Party**: OpenAI GPT-4o, Google Cloud Vision, openpyxl

## Completed Features
- [x] Calcul financement Option 1/2
- [x] Calcul location SCI avec résiduels
- [x] Import PDF via IA (GPT-4o)
- [x] Export/Import Excel programmes (freeze panes)
- [x] Export/Import Excel SCI Lease
- [x] Système de comparaison avant/après (MongoDB) - 2 mars 2026
- [x] Matching flexible avec normalisation (codes produit) - 2 mars 2026
- [x] 5 stratégies de matching: exact, None vs "", normalisé, trim partiel, modèle partiel
- [x] Force logout après import
- [x] Migration données (corrections rebates, doublons)
- [x] Champ Alternative Consumer Cash
- [x] Historique des comparaisons d'imports
- [x] Documentation architecture (ARCHITECTURE.md)

## Key Endpoints
- `POST /api/programs/import-excel` - Import avec comparaison + matching flexible
- `GET /api/programs/export-excel` - Export Excel programmes
- `GET /api/programs/comparisons` - Historique comparaisons
- `GET /api/programs/comparison/{id}` - Détail comparaison
- `POST /api/sci/import-excel` - Import SCI avec comparaison
- `GET /api/sci/export-excel` - Export Excel SCI
- `GET /api/sci/comparisons` - Historique SCI

## Backlog
- (P1) Améliorer mémoire des corrections pour futurs imports PDF
- (P2) Refactorer index.tsx (3000+ lignes)
- (P2) Refactorer inventory.tsx
