# CalcAuto AiPro - Product Requirements Document

## Overview
Application mobile iOS/Android de calcul de financement automobile avec gestion d'inventaire et scan de factures automatisé.

## Architecture
- **Frontend**: React Native (Expo)
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Production**: Vercel (frontend) + Render (backend) + MongoDB Atlas

## Completed Features

### Phase 1: Core Calculator (DONE)
- Calcul de financement avec comparaison Option 1 vs Option 2
- Support des programmes Stellantis (Chrysler, Jeep, Dodge, Ram)
- Import de programmes via PDF/Excel

### Phase 2: User Management (DONE)
- Authentification JWT
- Multi-tenancy (isolation des données par utilisateur)
- Panel Admin

### Phase 3: CRM (DONE)
- Gestion des soumissions clients
- Système de rappels
- Import de contacts

### Phase 4: Inventory Management (DONE)
- Gestion de l'inventaire véhicules
- Intégration calculateur-inventaire

### Phase 5: Invoice Scanning - Google Cloud Vision (DONE - Dec 2025)
- **Pipeline OCR hybride**:
  1. Prétraitement CamScanner (OpenCV):
     - Correction de perspective automatique
     - Suppression des ombres
     - Amélioration du contraste (CLAHE)
     - Débruitage
  2. OCR via Google Cloud Vision API (DOCUMENT_TEXT_DETECTION)
  3. Parsing structuré via regex (parser.py)
  
- **Champs extraits automatiquement**:
  - VIN (17 caractères, validation checksum)
  - Code modèle (WLJP74, etc.)
  - Couleur (code PXJ, PW7, etc.)
  - EP (Employee Price)
  - PDCO (Dealer Price)
  - PREF (Reference Price)
  - Holdback
  - Stock# (manuscrit supporté!)
  - Options/équipements

- **Coût**: ~$0.0015/image (vs $0.02 avec GPT-4 Vision = 92% d'économie)
- **Quota gratuit**: 1000 images/mois

### Phase 6: Scan History & Statistics (DONE - Dec 2025)
- **Nouveaux endpoints API**:
  - `GET /api/scans/history` - Historique des scans de l'utilisateur
  - `GET /api/scans/stats` - Statistiques détaillées (taux de succès, coûts, méthodes)
  
- **Métriques trackées**:
  - VIN, stock#, marque, modèle
  - Score de confiance
  - Méthode utilisée (google_vision_hybrid, tesseract, gpt4_vision)
  - Coût estimé par scan
  - Économies par rapport à GPT-4 Vision
  - Quota gratuit restant Google Vision

## API Keys Required (Production)
```
GOOGLE_VISION_API_KEY=AIzaSyDZES9Mi9zQFpLEnp5PBntgFxrcF_MJa6U
OPENAI_API_KEY=sk-proj-... (backup uniquement)
```

## Key Endpoints (New)
- `GET /api/scans/history?limit=50` - Derniers scans
- `GET /api/scans/stats?days=30` - Statistiques sur N jours

## Key Files
- `backend/ocr.py` - Pipeline CamScanner + Google Vision OCR
- `backend/parser.py` - Extraction regex des données structurées
- `backend/server.py` - API FastAPI principale
- `backend/vin_utils.py` - Validation et correction VIN

## Backlog (P1-P3)

### P1: Frontend Refactoring
- Migrer `frontend/app/(tabs)/index.tsx` (monolithique ~3000 lignes)
- Plan dans `frontend/docs/INDEX_MIGRATION_CODE.ts`

### P2: UX Improvements
- Indicateur visuel pour VINs auto-corrigés
- Interface mobile pour voir l'historique des scans

### P3: Code Quality
- Refactorer `backend/server.py` (~4800 lignes) en structure routes/
- Finaliser processus App Store / Play Store

## Test Credentials
- Email: danielgiroux007@gmail.com
- Password: Liana2018$

## Recent Changes (Dec 2025)
1. Intégration Google Cloud Vision API pour OCR
2. Remplacement GPT-4 Vision par approche hybride (Google Vision + parser regex)
3. Amélioration parser.py pour variations OCR et stock# manuscrit
4. Test réussi 8/8 champs sur vraie facture FCA
5. **NEW**: Endpoints /api/scans/history et /api/scans/stats pour statistiques utilisateur
