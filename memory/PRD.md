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

### Phase 10: Code Produit → Promotions Automatiques (DONE - Feb 2026)
- **Base de données codes produits** : 131 codes (2025 + 2026) extraits des PDFs Stellantis officiels
- **Mapping code → programme financement** : 114 codes liés aux promotions actuelles
- **Scan facture enrichi** : Consumer Cash, Bonus Cash, taux Option 1 & 2 automatiquement ajoutés
- **Nouveaux endpoints API** :
  - `GET /api/product-codes/{code}/financing` - Infos financement d'un code
  - `GET /api/financing/lookup?brand=Ram&model=3500` - Recherche par véhicule
  - `GET /api/financing/summary` - Résumé des meilleures offres
- **Frontend** : Bannière "Promotions détectées automatiquement" avec Consumer Cash, Bonus Cash, total rabais

### Phase 11: Fix Scan Facture - Révision Manuelle (DONE - Feb 2026)
- **Bug corrigé** : Quand le scan retournait des données incomplètes (VIN manquant, EP=0, etc.), l'app affichait une erreur bloquante au lieu de permettre la correction manuelle.
- **Solution** :
  - Frontend accepte maintenant `review_required: true` en plus de `success: true`
  - Le modal de révision s'ouvre avec les données partielles pré-remplies
  - Un bandeau rouge affiche les erreurs bloquantes (`blocking_errors[]`) pour guider l'utilisateur
  - L'utilisateur peut corriger manuellement les champs et sauvegarder
- **Fichiers modifiés** :
  - `frontend/app/(tabs)/inventory.tsx` - Gestion `review_required`, bandeau erreurs
- **Tests** : 
  - `backend/tests/test_scan_invoice.py` - 7 tests de validation du fix

### Phase 12: Amélioration Parser - Extraction Parfaite (DONE - Feb 2026)
- **Objectif** : Atteindre 100% de précision sur les factures FCA Canada
- **Améliorations VIN** :
  - Ajout patterns pour Ram HD (3C6UR...)
  - Support VINs avec espaces/erreurs OCR  
  - Correction automatique erreurs OCR (O→0, I→1)
- **Améliorations Code Produit** :
  - Validation contre base de **140 codes produits FCA**
  - Recherche agressive de tous codes 6 caractères
  - Ajout codes manquants: WLJP74, WLJH75, et 24 autres
- **Améliorations Financières** :
  - Support GKRP comme alias de PDCO
  - Extraction holdback format 070000 → $700
- **Consolidation Base de Données** :
  - 140 codes produits (2025: 20, 2026: 113, Autres: 7)
  - 140 mappings code → programme financement
  - Par marque: Ram (86), Jeep (35), Dodge (10), Chrysler (8), Fiat (1)
- **API /product-codes** mise à jour pour retourner tous les codes
- **Tests validés** :
  - 4 factures réelles testées: 100% succès
  - VIN, Code, EP, Stock# tous extraits correctement
  - 145 tests unitaires passés

## Stockage Inventaire
- **Collection MongoDB**: `inventory`
- **Par utilisateur**: `owner_id` pour isolation des données
- **Champs**: stock_no, vin, brand, model, trim, year, msrp, net_cost, asking_price, status, options, etc.

## Fichiers de données
- `backend/fca_product_codes_2026.json` - 131 codes produits FCA (marque, modèle, trim, année)
- `backend/data/code_program_mapping.json` - Mapping code → programme financement
- `programmes_fevrier_2026.csv` - Programmes financement source

## API Keys (Production - Render)
```
GOOGLE_VISION_API_KEY=AIzaSyDZES9Mi9zQFpLEnp5PBntgFxrcF_MJa6U
```

## Key Files Modified
- `backend/server.py` - Window Sticker KenBot (HTTP + Playwright), email CID, Option 2 fix, auto-financing
- `backend/parser.py` - Options FCA, stock# dernier
- `frontend/app/(tabs)/index.tsx` - Section Accessoires, VIN manuel, auto-financing banner, styles
- `frontend/app/(tabs)/inventory.tsx` - VIN affiché dans cartes

### Phase 13: Partage SMS & Impression (DONE - Feb 2026)
- **Partage SMS** via API native Share de React Native
  - Bouton "Partager par texto" / "Share via SMS"
  - **Modal d'aperçu** avec texte modifiable avant envoi
  - Génère un texte formaté avec: véhicule, prix, VIN, terme, taux, paiement
  - Compteur de caractères pour suivre la longueur du message
  - Sur mobile: utilise l'API Share native (peut ouvrir Messages, WhatsApp, etc.)
  - Sur web: utilise Web Share API ou ouvre sms: link
- **Impression** des soumissions
  - Bouton "Imprimer" / "Print"
  - Génère un document HTML formaté avec logo CalcAuto AiPro
  - Sur web: ouvre la fenêtre d'impression du navigateur
  - Sur mobile: guide l'utilisateur vers la fonction Partager -> Imprimer
- **Fichiers modifiés**: `frontend/app/(tabs)/index.tsx`
  - Ajout imports: `Share`, `Linking` de react-native
  - États: `showSmsPreview`, `smsPreviewText`
  - Nouvelles fonctions: `generateSubmissionText()`, `handleShareSMS()`, `handleSendSms()`, `handlePrint()`
  - Styles: Modal aperçu SMS complet avec header, textarea, boutons
  - data-testid: `share-sms-btn`, `print-btn`, `send-email-btn`, `sms-preview-send-btn`

## Backlog
- (P1) Refactoring index.tsx (fichier monolithique)
- (P2) Interface historique scans
- (P3) Refactoring server.py en structure routes/
- (P3) Dashboard admin métriques parsing

### Phase 14: Parser V6.5 - Déduplication (DONE - Feb 2026)
- **Bug fix critique**: Résolu le problème de duplication d'options similaires
- **Nouvelle fonction `deduplicate_options()`** dans `backend/parser.py`
  - Catégories FCA: transmission, engine, color, fuel, fee, package
  - Priorisation: options avec montant > 0 prioritaires (OCR direct vs fallback)
  - Aucune suppression du code existant (VIN, fallback, skip_codes)
- **CATEGORY_GROUPS**: 7 catégories avec ~45 codes FCA
- **Tests pytest**: 7 nouveaux tests dans `test_parser.py::TestDeduplication`
- **Résultat**: 25 tests passent (0 régression)

### Phase 15: Corrections Invoice Scan Grand Cherokee (DONE - Feb 2026)
- **Coût Net = E.P.**: Le E.P. FCA inclut DÉJÀ la déduction holdback, ne plus soustraire
  - Modifié: `server.py` aux lignes 3496, 3551, 4859, 5015, 5218
  - Avant: `net_cost = ep_cost - holdback` 
  - Après: `net_cost = ep_cost`
- **Nouveaux codes FCA ajoutés** dans `parser.py`:
  - Couleur: `PAS` (Gris de mer métallisé)
  - Sièges: `FLX7` (Sièges dessus en cuir Nappa)
  - Équipements Grand Cherokee: `ACX`, `ADT`, `DC1`, `EC7`
  - Packages: `2C1`, `2T1` (Ensemble Éclair)
- **CATEGORY_GROUPS enrichi**: Ajouté DC1 (transmission), EC7 (engine), PAS (color), 2C1/2T1 (package)
- **Fichiers modifiés**: `backend/parser.py`, `backend/server.py`

### Phase 16: Système Excel Export/Import (DONE - Feb 2026)
- **Workflow hybride**: OCR → Excel (révision) → Import corrigé
- **Endpoints API créés**:
  - `POST /api/invoice/export-excel` - Exporte données scan vers Excel formaté
  - `POST /api/invoice/import-excel` - Importe Excel corrigé
  - `GET /api/invoice/template-excel` - Télécharge template vide
- **Frontend**:
  - Nouveau bouton "Excel" (vert #217346) dans la barre d'actions
  - Fonction `handleExportExcel()` - Télécharge fichier Excel après scan
- **Fichiers Excel créés**:
  - `FCA_Master_Codes.xlsx` - 162 codes véhicules + 48 codes options
  - `fca_product_codes_2025.json` - Base complète 2025
  - Template facture avec sections: véhicule, financier, options
- **Codes Ram 2500 ajoutés**: DJ7H91/92 (Big Horn), DJ7L91/62 (Tradesman), DJ7P91/92 (Laramie), DJ7S91/92 (Limited)

## Test Credentials
- Email: danielgiroux007@gmail.com
- Password: Liana2018$

## Note Production (Render)
Pour Playwright sur Render, ajouter au build:
```
playwright install chromium
```
