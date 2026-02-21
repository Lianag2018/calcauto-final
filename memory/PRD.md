# CalcAuto AiPro - Product Requirements Document

## Overview
Application mobile iOS/Android pour calculateur de financement véhicule avec système de gestion d'inventaire et scan de factures FCA.

## Architecture Backend - Pipeline OCR Multi-Niveaux

### Structure Modulaire Implémentée
```
/app/backend/
├── server.py         # API FastAPI principale (4400+ lignes)
├── ocr.py            # Pipeline OpenCV + Tesseract (NOUVEAU)
├── parser.py         # Parser regex structuré (NOUVEAU)
├── vin_utils.py      # Validation VIN industrielle (NOUVEAU)
├── validation.py     # Règles métier FCA + scoring (NOUVEAU)
├── fca_parser.py     # Legacy parser (conservé)
├── ocr_zones.py      # Legacy OCR (conservé)
└── tests/
    └── test_parser.py  # Tests unitaires (15/15 passent)
```

### Pipeline de Scan Facture
```
Niveau 1: PDF natif → pdfplumber + regex (100% précision, $0)
    ↓ (si échec)
Niveau 2: Image → OpenCV ROI + Tesseract (85-92%, $0)
    ↓ (si score < 70)
Niveau 3: Fallback → GPT-4 Vision (~$0.02-0.03)
```

### Endpoints Principaux
- `POST /api/inventory/scan-invoice` - Scan facture multi-niveaux
- `GET /api/inventory` - Liste véhicules
- `POST /api/auth/login` - Authentification
- `GET /api/programs` - Programmes financement

## Fonctionnalités Complétées

### ✅ Phase 1 - Fondations
- [x] Authentification utilisateur (JWT)
- [x] Multi-tenancy (isolation données par utilisateur)
- [x] Sauvegarde soumissions serveur
- [x] Gestion contacts intelligente (upsert)
- [x] Déconnexion

### ✅ Phase 2 - Admin & Infrastructure
- [x] Panneau admin complet
- [x] Déploiement production (Render + Vercel)
- [x] Base de données MongoDB Atlas

### ✅ Phase 3 - Inventaire (Partiel)
- [x] CRUD inventaire véhicules
- [x] Scanner facture PDF (pdfplumber)
- [x] Scanner facture image (GPT-4 Vision fallback)
- [x] **Pipeline OCR par zones OpenCV + Tesseract** (NOUVEAU)
- [x] **Validation VIN industrielle avec auto-correction** (NOUVEAU)
- [x] **Règles métier FCA + scoring** (NOUVEAU)
- [x] Anti-doublon (VIN + hash fichier)
- [ ] Modal de révision et correction (UI)
- [ ] Intégration calculateur-inventaire

## Backlog Priorisé

### P0 - Critique
- [ ] Stabiliser environnement frontend Expo
- [ ] Tester pipeline OCR avec factures réelles

### P1 - Important
- [ ] Intégration calculateur ↔ inventaire
- [ ] Avertissement visuel VINs auto-corrigés

### P2 - Amélioration
- [ ] Programmes financement par véhicule
- [ ] Dashboard métriques parsing (admin)

### P3 - Backlog
- [ ] Refactoriser index.tsx (1800+ lignes)
- [ ] Builds App Store / Play Store

## Intégrations Tierces
- **MongoDB Atlas**: Base de données
- **OpenAI GPT-4o**: Fallback Vision (demote)
- **Tesseract OCR**: Engine OCR open-source
- **OpenCV**: Prétraitement image
- **pdfplumber**: Extraction PDF

## Schéma Base de Données

### Collection: inventory
```json
{
  "_id": ObjectId,
  "owner_id": "user_id",
  "stock_no": "12345",
  "vin": "1C4RJKBG5S8806267",
  "brand": "Jeep",
  "model": "Grand Cherokee",
  "year": 2025,
  "ep_cost": 55000,
  "pdco": 65000,
  "parse_method": "ocr_zones",
  "vin_valid": true,
  "validation_score": 85
}
```

## Credentials Test
- Email: `danielgiroux007@gmail.com`
- Password: `Liana2018$`

---
*Dernière mise à jour: 21 Février 2025*
