# CalcAuto AiPro - Product Requirements Document

## Overview
Application mobile iOS/Android pour calculateur de financement véhicule avec système de gestion d'inventaire et scan de factures FCA.

## Architecture Backend - Pipeline OCR Multi-Niveaux

### Structure Modulaire Implémentée
```
/app/backend/
├── server.py         # API FastAPI principale (4800+ lignes)
├── ocr.py            # Pipeline OpenCV + Tesseract
├── parser.py         # Parser regex structuré
├── vin_utils.py      # Validation VIN industrielle
├── validation.py     # Règles métier FCA + scoring (seuil 85)
├── fca_parser.py     # Legacy parser (conservé)
├── ocr_zones.py      # Legacy OCR (conservé)
└── tests/
    ├── test_parser.py       # Tests VIN/Parser (15 tests)
    ├── test_checklist.py    # Tests Règle d'Or (20 tests)
    ├── test_integration.py  # Tests Pipeline Complet (57 tests)
    └── test_scan_batch.py   # Tests Batch + Stats (3 tests)
```

### Pipeline de Scan Facture - RÈGLE ZÉRO ERREUR
```
Niveau 1: PDF natif → pdfplumber + regex (100% précision, $0)
    ↓ (si échec)
Niveau 2: Image → OpenCV ROI + Tesseract (85-92%, $0)
    ↓ (si score < 60)
Niveau 3: Fallback → GPT-4 Vision (~$0.02-0.03)

DÉCISION:
- Score >= 85: AUTO_APPROVED (sauvegarde directe)
- Score 60-84: REVIEW_REQUIRED (modal révision)
- Score < 60: VISION_REQUIRED (fallback AI)

RÈGLE D'OR: Bloquer si VIN/EP/PDCO invalides
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
- [x] Déploiement production (Render)
- [x] Base de données MongoDB Atlas

### ✅ Phase 3 - Inventaire & Scan (Décembre 2025)
- [x] CRUD inventaire véhicules
- [x] Scanner facture PDF (pdfplumber)
- [x] Scanner facture image (GPT-4 Vision fallback)
- [x] **Pipeline OCR par zones OpenCV + Tesseract**
- [x] **Validation VIN industrielle avec auto-correction**
- [x] **Règles métier FCA + scoring (seuil 85)**
- [x] Anti-doublon (VIN + hash fichier)
- [x] **Suite de tests pytest complète (95 tests)**
- [x] **Script batch test avec statistiques**
- [ ] Modal de révision et correction (UI frontend)
- [ ] Intégration calculateur-inventaire

### ✅ Phase 4 - Refactorisation Frontend (Décembre 2025)
- [x] **Hooks modulaires créés** (582 lignes)
  - `useFinancingCalculation.ts` - Calculs paiement/amortissement
  - `usePrograms.ts` - Gestion programmes API
  - `useNetCost.ts` - Calcul EP/PDCO/marge
- [x] **Composants Calculator créés** (1539 lignes)
  - `PaymentResult.tsx` - Affichage résultats paiement
  - `ProgramSelector.tsx` - Sélecteur programmes filtrable
  - `CostBreakdown.tsx` - Ventilation des coûts
  - `CalculatorInputs.tsx` - Tous les inputs regroupés
- [x] **Backup créé** - `index_legacy.tsx` (3091 lignes)
- [x] **Import ajouté** dans `index.tsx`
- [ ] Remplacer blocs UI par composants (migration progressive)

**📌 Guide Migration `index.tsx`:**
```tsx
// 1. Import ajouté en ligne 34:
import { CalculatorInputs } from '../../components/calculator/CalculatorInputs';

// 2. Pour migrer le bloc d'inputs (lignes 1128-1414), remplacer par:
<CalculatorInputs
  vehiclePrice={vehiclePrice}
  customBonusCash={customBonusCash}
  comptantTxInclus={comptantTxInclus}
  fraisDossier={fraisDossier}
  taxePneus={taxePneus}
  fraisRDPRM={fraisRDPRM}
  prixEchange={prixEchange}
  montantDuEchange={montantDuEchange}
  selectedTerm={selectedTerm}
  paymentFrequency={paymentFrequency}
  selectedOption={selectedOption}
  // ... setters et autres props
/>

// 3. La logique de calcul reste dans calculateForTerm() - NE PAS MODIFIER
```

## Patchs Appliqués - Décembre 2025

### 🔧 PATCH 1: Clé option cohérente
- `first_option.get("code")` → `first_option.get("product_code", first_option.get("code"))`

### 🔧 PATCH 2: VIN regex strict
- Pattern permissif → `\b[0-9A-HJ-NPR-Z]{17}\b` (17 chars exacts)

### 🔧 PATCH 3: Suppression decode_fca_price() dupliqué
- Utiliser uniquement `clean_fca_price()`

### 🔧 PATCH 4: Seuil validation relevé
- `score >= 50` → `score >= 85` dans validation.py

### 🔧 PATCH 5: Monitoring Production (Décembre 2025)
- Logging structuré MongoDB (`parsing_metrics`)
- Endpoints admin: `/api/admin/parsing-stats`, `/api/admin/parsing-history`
- Détection dérive automatique (`quality_alert`)
- Script stress test parallèle

### 🔧 PATCH 6: Refactorisation Frontend (Décembre 2025)
- Structure hooks: `/frontend/hooks/`
- Structure composants: `/frontend/components/calculator/`
- Total: 1541 lignes de code modulaire

## Backlog Priorisé

### P0 - Critique
- [ ] Stabiliser environnement frontend Expo
- [ ] Tester pipeline OCR avec factures réelles
- [ ] Migrer index.tsx vers nouveaux composants

### P1 - Important
- [ ] Intégration calculateur ↔ inventaire
- [ ] Avertissement visuel VINs auto-corrigés

### P2 - Amélioration
- [ ] Programmes financement par véhicule
- [ ] Dashboard métriques parsing (admin)

### P3 - Backlog
- [x] ~~Refactoriser index.tsx (3000+ lignes)~~ → Hooks/Composants créés
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
