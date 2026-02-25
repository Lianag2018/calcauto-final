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

### Phase 17: Blocage Complet Codes YG4/4CP/2TZ (DONE - Feb 2026)
- **Bug fix critique**: Les codes YG4, 4CP, 2TZ apparaissaient toujours en lignes 1 et 2 de toutes les factures
- **Cause racine**: Les boucles fallback dans `parse_options()` ne vérifiaient pas `skip_codes`
- **Corrections dans `backend/parser.py`**:
  1. Supprimé YG4, 4CP, 2TZ du dictionnaire `fca_descriptions`
  2. Supprimé tous les mappings `description_to_code` pointant vers ces codes
  3. Ajouté check `skip_codes` aux deux boucles fallback (description_to_code + fca_descriptions)
  4. Nettoyé `equivalent_codes` (retiré YG4)
  5. Ajouté DJ7H91, DT6L98 aux skip_codes (codes modèles, pas des options)
- **Tests**: 3 nouveaux tests `TestBlockedCodes` (29/29 tests passent)

### Phase 18: Impression Professionnelle (DONE - Feb 2026)
- Utilise `expo-print` sur mobile (dialogue natif, plus de blocage)
- Format professionnel identique au courriel

### Phase 20: Simplification Déduplication (DONE - Feb 2026)
- **Remplacé** `deduplicate_options()` (CATEGORY_GROUPS complexe) par `deduplicate_by_equivalence()` (minimal, stable)
- **Principe**: Dédup par `equivalent_codes` existant + priorité OCR (montant > 0)
- **Étendu `equivalent_codes`**: Ajouté DC1, DFM, DFH et famille transmission complète
- **Supprimé**: CATEGORY_GROUPS (système parallèle inutile)
- **Résultat**: DFR OCR gagne sur DC1 fallback, une seule transmission par facture
- **Tests**: 6 nouveaux tests `TestDeduplicationByEquivalence` (28/28 passent)
- **Bug fix critique**: Le parseur extrayait des mots de l'en-tête (ELITE, BANQUE, 596, TAN, HURRIC) comme options
- **Bug fix couleur**: PAU hardcodé "Rouge Flamme" dans `server.py` color_map → remplacé par extraction dynamique depuis le texte OCR. Priorité: description OCR > mapping statique > code brut
- **Corrections parser.py**:
  1. Ajouté ELITE, BANQUE, DOMINION, AVENUE, OUELETTE, TAN, HURRIC, ADIAN, etc. aux skip_codes ET invalid_codes
  2. Amélioré filtre d'adresses 3 chiffres
  3. Ajouté DT6L98 aux skip_codes (code modèle Ram 1500)
  4. Le fallback fca_descriptions extrait maintenant la description réelle du texte OCR au lieu d'utiliser le mapping hardcodé
- **Corrections server.py**: Couleur dynamique extraite du texte OCR, PAU retiré du color_map hardcodé, PDN ajouté
- **Tests**: 29/29 passent + validations manuelles Ram 1500 et Ram 2500

### Phase 21: Excel Workflow Complet (DONE - Feb 2026)
- **Export mobile corrigé**: Utilise `expo-file-system` + `expo-sharing` pour sauvegarder et partager le .xlsx (avant: juste un Alert vide)
- **Import Excel implémenté**: Nouveau bouton "Importer un Excel" dans le modal scan (inventory.tsx)
  - Utilise `expo-document-picker` pour choisir un .xlsx
  - Envoie à `/api/invoice/import-excel` (backend existant)
  - Ouvre le modal review avec les données importées
  - **AUCUN re-parsing, AUCUNE dédup** (données brutes du fichier)
- **Cycle complet**: Scan → Export → Correction manuelle → Import → Review
- **Testé**: Export et Import via curl, 28/28 tests pytest passent

### Phase 22: Refactor index.tsx — Étape 1 (DONE - Feb 2026)
- **Extrait** types dans `types/calculator.ts` (79 lignes)
- **Extrait** logique calcul dans `hooks/useCalculator.ts` (184 lignes)
  - `calculateMonthlyPayment()` — formule PMT standard
  - `getRateForTerm()` — lookup taux par terme
  - `formatCurrency()` / `formatCurrencyDecimal()` — formatage devise
  - `useCalculator()` — hook réactif avec calcul Option 1/2, taxes, échange, accessoires
- **index.tsx**: 4216 → 4007 lignes (-209 lignes, logique calcul isolée)
- **Aucune régression**: 28/28 tests pytest, backend OK, imports vérifiés

### Phase 23: Pipeline Hybride Google Vision + GPT-4o (DONE - Feb 2026)
- **Nouveau pipeline**: Google Vision (lecture OCR gratuite 1000/mois) → GPT-4o TEXTE (structuration ~0.003$)
- **GPT-4o ne lit pas l'image** — il reçoit le texte déjà lu par Google Vision et le structure en JSON
- Le prompt GPT-4o est spécifique FCA Canada : ignore concessionnaire/banque/adresse, extrait options dans l'ordre exact
- **Fallback automatique** : si GPT-4o indisponible → ancien regex parser (tout est préservé)
- **Avantages** : plus de skip_codes pour structurer, plus de regex fragile pour les options, couleur correcte automatiquement
- **Coût** : ~0.006$/scan (Vision gratuit + GPT-4o texte 0.003$)

### Phase 24: Fix URLs Hardcodées — Environnement (DONE - Feb 2026)
- **Bug critique**: URLs `calcauto-final-backend.onrender.com` hardcodées dans `inventory.tsx`, `admin.tsx`, `clients.tsx`, `index_legacy.tsx`
- **Cause**: Condition `window.location.hostname.includes('vercel.app')` retournait l'URL Render au lieu d'utiliser `EXPO_PUBLIC_BACKEND_URL`
- **Fix**: Simplifié `getApiUrl()` dans les 4 fichiers pour utiliser uniquement `process.env.EXPO_PUBLIC_BACKEND_URL`
- **Frontend serve**: Expo tunnel → Static export (`npx expo export --platform web`) + Python HTTP server sur port 3000
- **Résultat**: Toutes les pages (Calcul, CRM, Inventaire, Admin) fonctionnent avec le backend

## Backlog
- (P1) Continuer refactoring index.tsx → extraire `usePrograms.ts`
- (P1) Validation utilisateur du parser Vision+GPT-4o
- (P1) Validation utilisateur du workflow Excel
- (P2) Refactoring server.py en structure routes/
- (P2) Refactoring inventory.tsx en composants
- (P2) Nettoyage code mort parser.py (CATEGORY_GROUPS, deduplicate_options)
- (P3) Dashboard admin métriques parsing
- (P3) Supprimer index_legacy.tsx et son onglet navigation

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
