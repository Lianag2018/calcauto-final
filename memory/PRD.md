# CalcAuto AiPro - Product Requirements Document

## Original Problem Statement
Application mobile iOS/Android "CalcAuto AiPro" - Calculateur de financement automobile complet avec gestion d'inventaire et scan de factures FCA.

## CHANGELOG

### 2026-02-21 - Parser V5 Industriel avec VIN Auto-Correction

**Architecture V5 finale:**
```
PDF natif → Parser structuré (pdfplumber + regex) → $0
IMAGE     → GPT-4 Vision (image originale) → ~$0.03-0.05
           ↓
      Extraction JSON
           ↓
      Auto-correction VIN (checksum + OCR fixes)
           ↓
      Validation (score 0-100)
           ↓
      Retour avec flags
```

**Fonctionnalités VIN:**
- ✅ Validation checksum ISO 3779
- ✅ Auto-correction erreurs OCR (O→0, I→1, P↔J, etc.)
- ✅ Décodage année (10e caractère)
- ✅ Décodage constructeur (WMI 3 premiers chars)
- ✅ Validation cohérence VIN ↔ marque
- ✅ Flag si VIN corrigé ou incohérent

**Réponse API enrichie:**
```json
{
  "vehicle": {
    "vin": "1C6PJTAGXTL160857",
    "vin_valid": true,
    "vin_corrected": true,
    "vin_original": "1C6JJTAG7LL160857",
    "vin_brand": "Jeep",
    "vin_consistent": true,
    "ep_cost": 56620,
    "pdco": 59995
  },
  "validation": {
    "score": 95,
    "errors": ["VIN auto-corrigé"],
    "is_valid": true
  }
}
```

## Statut des Fonctionnalités

### P0 - Complété ✅
- [x] Authentification utilisateur
- [x] Data isolation (multi-tenancy)
- [x] Admin Panel
- [x] **Parser V5 de factures FCA**
- [x] **Auto-correction VIN avec validation checksum**

### P1 - En cours
- [ ] Finaliser intégration Calculateur-Inventaire
- [ ] Intégrer programmes de financement automatiques

### P2/P3 - Backlog
- [ ] Refactoriser index.tsx (1800+ lignes)
- [ ] Builds App Store / Play Store
- [ ] Dashboard métriques parsing

## Architecture Technique

### Backend
```
/app/backend/server.py
├── VIN Validation (lignes 3170-3320)
│   ├── validate_vin_checksum()
│   ├── auto_correct_vin()
│   ├── decode_vin_year()
│   ├── decode_vin_brand()
│   └── validate_vin_brand_consistency()
│
├── Parser FCA (lignes 3470-3700)
│   ├── clean_fca_price()
│   ├── parse_fca_invoice_structured()
│   └── validate_invoice_data()
│
└── Endpoint scan-invoice (lignes 3980-4250)
    ├── PDF → structured parser
    └── IMAGE → GPT-4 Vision + VIN correction
```

### Dependencies
```
pdfplumber==0.11.9
pytesseract==0.3.13
opencv-python-headless==4.10.0.84
Pillow==10.4.0
```

## Credentials Test
- Email: `danielgiroux007@gmail.com`
- Password: `Liana2018$`

## Résultats Tests

### Facture Gladiator (1C6PJTAGXTL160857)
| Champ | Attendu | Obtenu | Status |
|-------|---------|--------|--------|
| E.P. | 56620 | 56620 | ✅ |
| PDCO | 59995 | 59995 | ✅ |
| PREF | 57145 | 57145 | ✅ |
| Holdback | 500 | 500 | ✅ |
| VIN Valid | - | True | ✅ |
| VIN Corrected | - | True | ✅ |

## Prochaines Étapes
1. Intégrer calculateur-inventaire (sélection véhicule → remplir prix)
2. Dashboard métriques parsing (optionnel)
3. Tests avec plus de factures pour affiner les patterns OCR
