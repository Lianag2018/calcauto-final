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
  1. Prétraitement CamScanner (OpenCV)
  2. OCR via Google Cloud Vision API (PRIORITAIRE si clé configurée)
  3. Parsing structuré via regex (parser.py)

### Phase 6: Scan History & Statistics (DONE - Dec 2025)
- `GET /api/scans/history` - Historique des scans
- `GET /api/scans/stats` - Statistiques détaillées

### Phase 7: Window Sticker Integration (DONE - Dec 2025)
- **Fonctionnalité**: Récupération automatique du Window Sticker officiel Stellantis
- **URLs supportées**: Chrysler, Jeep, Dodge, Ram, Fiat, Alfa Romeo
- **Stockage**: MongoDB (collection `window_stickers`)
- **Email**: Window Sticker en pièce jointe PDF automatique dans les soumissions
- **Endpoints**:
  - `GET /api/window-sticker/{vin}` - Récupère le Window Sticker
  - `GET /api/window-sticker/{vin}/pdf` - Télécharge le PDF

## API Keys Required (Production)
```
GOOGLE_VISION_API_KEY=AIzaSyDZES9Mi9zQFpLEnp5PBntgFxrcF_MJa6U
OPENAI_API_KEY=sk-proj-... (backup)
```

## Key Endpoints
- `GET /api/scans/history` - Historique des scans
- `GET /api/scans/stats` - Statistiques
- `GET /api/window-sticker/{vin}` - Window Sticker
- `POST /api/send-calculation-email` - Email soumission avec Window Sticker

## Key Files
- `backend/ocr.py` - Pipeline CamScanner + Google Vision OCR
- `backend/parser.py` - Extraction regex
- `backend/server.py` - API FastAPI (incluant Window Sticker)

## Backlog (P1-P3)

### P1: Frontend
- Migrer `frontend/app/(tabs)/index.tsx`
- Ajouter bouton Window Sticker dans l'interface

### P2: UX
- Indicateur visuel VINs corrigés
- Interface historique scans

### P3: Code Quality
- Refactorer `backend/server.py`
- App Store / Play Store

## Test Credentials
- Email: danielgiroux007@gmail.com
- Password: Liana2018$

## Recent Changes (Dec 2025)
1. Google Cloud Vision intégré (PRIORITAIRE si clé présente)
2. Window Sticker automatique dans emails soumission
3. Endpoints /api/window-sticker/{vin}
4. Stockage Window Stickers dans MongoDB
