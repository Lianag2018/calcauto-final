# CalcAuto AiPro - PRD

## Problem Statement
Application de gestion de financement et location automobile pour concessionnaires FCA Canada. Permet de calculer les paiements de financement et de location, gérer les programmes de rabais, importer/exporter des données via Excel et PDF.

## Core Requirements
- **Calcul de financement**: Option 1 (rabais + taux standard) vs Option 2 (taux réduit)
- **Calcul de location SCI**: Paiements mensuels, bi-hebdo, hebdo avec résiduels
- **Import PDF automatique**: Extraction IA (GPT-4o) des programmes depuis PDF Stellantis
- **Workflow Excel**: Export → correction manuelle → réimport comme source de vérité
- **Système de comparaison avant/après**: Snapshot MongoDB avant import, diff détaillé, historique
- **Force logout**: Invalidation des tokens après import pour forcer refresh des données
- **Gestion admin**: Utilisateurs, programmes, inventaire, tri drag-and-drop

## Architecture
- **Frontend**: React Native (Expo) web
- **Backend**: FastAPI + MongoDB (motor)
- **3rd Party**: OpenAI GPT-4o, Google Cloud Vision, openpyxl

## Completed Features
- [x] Calcul financement Option 1/2
- [x] Calcul location SCI avec résiduels
- [x] Import PDF via IA (GPT-4o)
- [x] Export/Import Excel programmes (avec freeze panes)
- [x] Export/Import Excel SCI Lease
- [x] Système de comparaison avant/après (MongoDB) - 2 mars 2026
- [x] Clé composite (brand+model+trim+year) pour matching fiable
- [x] Force logout après import
- [x] Migration données (corrections rebates, doublons)
- [x] Champ Alternative Consumer Cash
- [x] Historique des comparaisons d'imports
- [x] Gestion admin (utilisateurs, programmes, inventaire)
- [x] Documentation architecture (ARCHITECTURE.md)

## Key Endpoints
- `POST /api/programs/import-excel` - Import avec comparaison avant/après
- `GET /api/programs/export-excel` - Export Excel programmes
- `GET /api/programs/comparisons` - Historique des comparaisons
- `GET /api/programs/comparison/{id}` - Détail d'une comparaison
- `POST /api/sci/import-excel` - Import SCI avec comparaison
- `GET /api/sci/export-excel` - Export Excel SCI
- `GET /api/sci/comparisons` - Historique comparaisons SCI

## DB Collections
- `programs` - Programmes de financement (clé composite: brand+model+trim+year)
- `program_corrections` - Corrections mémorisées pour futurs imports PDF
- `import_comparisons` - Historique des comparaisons avant/après
- `sci_lease_rates` - Taux de location SCI (fichier JSON)

## Backlog
- (P1) Améliorer le système de mémoire des corrections pour futurs imports PDF
- (P2) Refactorer `index.tsx` (3000+ lignes) en composants
- (P2) Refactorer `inventory.tsx` en composants
