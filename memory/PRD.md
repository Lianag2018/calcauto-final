# CalcAuto AiPro - Product Requirements Document

## Overview
Application mobile iOS/Android de calcul de financement automobile avec gestion d'inventaire et scan de factures automatisé.

## Architecture
- **Frontend**: React Native (Expo)
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Production**: Vercel (frontend) + Render (backend) + MongoDB Atlas

## Completed Features

### Phase 1-4: Core Features (DONE)
- Calculateur de financement
- Authentification JWT
- Gestion CRM/contacts
- Inventaire véhicules

### Phase 5: Invoice Scanning - Google Cloud Vision (DONE)
- Pipeline OCR: CamScanner preprocessing + Google Vision
- Extraction: VIN, EP, PDCO, Stock#, Options
- Coût: ~$0.0015/image (vs $0.02 GPT-4)

### Phase 6: Window Sticker (DONE - Dec 2025)
- Téléchargement automatique lors création stock
- PDF en pièce jointe dans emails soumission
- Image intégrée dans email (converti avec PyMuPDF)
- Stockage MongoDB (collection `window_stickers`)
- Endpoints: `/api/window-sticker/{vin}`, `/api/window-sticker/{vin}/pdf`

### Phase 7: Accessoires dans Calculateur (DONE - Dec 2025)
- Section "Accessoires" après Rabais Cash
- Champs: Description + Prix
- Bouton "+ Ajouter" pour plusieurs accessoires
- Total ajouté au prix avant taxes
- Styles: vert, design moderne

### Phase 8: Améliorations Parser (DONE - Dec 2025)
- Options triées dans l'ordre de la facture (couleur → équipements → taxes)
- Stock# = dernier nombre 5 chiffres (manuscrit en bas)
- Format options: "CODE - Description"

### Phase 9: Bug Fixes (Feb 2026)
- ✅ Corrigé: Texte illisible dans les champs "Accessoires" (style `input` manquant ajouté)
- ✅ Vérifié: Window Sticker image intégrée dans les emails (conversion PDF→JPEG fonctionne)

## API Keys (Production - Render)
```
GOOGLE_VISION_API_KEY=AIzaSyDZES9Mi9zQFpLEnp5PBntgFxrcF_MJa6U
```

## Key Files Modified
- `backend/server.py` - Window Sticker auto-download, endpoints, email embedding
- `backend/parser.py` - Options FCA, stock# dernier
- `frontend/app/(tabs)/index.tsx` - Section Accessoires, style `input` ajouté

## Backlog
- (P1) VIN auto-rempli quand stock sélectionné
- (P2) Interface historique scans
- (P3) Refactoring code (index.tsx, server.py)

## Test Credentials
- Email: danielgiroux007@gmail.com
- Password: Liana2018$
