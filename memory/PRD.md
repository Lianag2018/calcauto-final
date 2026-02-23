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

### Phase 6: Window Sticker - KenBot Style (DONE - Feb 2026)
- **HTTP humain** avec headers (User-Agent, Referer, Accept)
- **Validation PDF**: taille > 20KB + commence par `%PDF`
- **Playwright fallback** si HTTP échoue
- **Cache MongoDB** pour éviter re-téléchargements
- **Image CID** intégrée dans email (meilleur support Gmail)
- Image compressée: 800px max, JPEG 70%, ~80KB
- Endpoints: `/api/window-sticker/{vin}`, `/api/window-sticker/{vin}/pdf`

### Phase 7: Accessoires dans Calculateur (DONE - Dec 2025)
- Section "Accessoires" après Rabais Cash
- Champs: Description + Prix
- Bouton "+ Ajouter" pour plusieurs accessoires
- Total ajouté au prix avant taxes

### Phase 8: Améliorations Parser (DONE - Dec 2025)
- Options triées dans l'ordre de la facture
- Stock# = dernier nombre 5 chiffres (manuscrit en bas)
- Format options: "CODE - Description"

### Phase 9: Bug Fixes & UI (DONE - Feb 2026)
- ✅ Option 2 s'affiche même avec taux 0%
- ✅ Texte accessoires lisible (style `input` ajouté)
- ✅ VIN affiché dans inventaire (cartes véhicules)
- ✅ VIN affiché dans calculateur (sélecteur + bannière)
- ✅ Window Sticker image intégrée via CID (Gmail compatible)
- ✅ **VIN manuel** si pas d'inventaire (nouveau champ)

## Stockage Inventaire
- **Collection MongoDB**: `inventory`
- **Par utilisateur**: `owner_id` pour isolation des données
- **Champs**: stock_no, vin, brand, model, trim, year, msrp, net_cost, asking_price, status, options, etc.

## API Keys (Production - Render)
```
GOOGLE_VISION_API_KEY=AIzaSyDZES9Mi9zQFpLEnp5PBntgFxrcF_MJa6U
```

## Key Files Modified
- `backend/server.py` - Window Sticker KenBot (HTTP + Playwright), email CID, Option 2 fix
- `backend/parser.py` - Options FCA, stock# dernier
- `frontend/app/(tabs)/index.tsx` - Section Accessoires, VIN manuel, styles
- `frontend/app/(tabs)/inventory.tsx` - VIN affiché dans cartes

## Backlog
- (P1) Refactoring index.tsx (fichier monolithique)
- (P2) Interface historique scans
- (P3) Refactoring server.py en structure routes/
- (P3) Dashboard admin métriques parsing

## Test Credentials
- Email: danielgiroux007@gmail.com
- Password: Liana2018$

## Note Production (Render)
Pour Playwright sur Render, ajouter au build:
```
playwright install chromium
```
