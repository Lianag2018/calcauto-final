# CalcAuto AiPro - Product Requirements Document

## Original Problem Statement
Application mobile iOS/Android "CalcAuto AiPro" - Calculateur de financement automobile complet avec gestion d'inventaire et scan de factures FCA.

## User Personas
- **Concessionnaires automobiles FCA** (Stellantis: Ram, Jeep, Chrysler, Dodge)
- Besoin de calculer rapidement les paiements de financement
- Gestion d'inventaire avec coûts réels extraits des factures FCA

## Core Requirements

### P0 - Complété
- [x] Authentification utilisateur (login/register)
- [x] Data isolation (multi-tenancy)
- [x] Save submissions to server
- [x] Smart Contact Management (Upsert)
- [x] Logout functionality
- [x] Admin Panel (gestion des utilisateurs)
- [x] **Parser structuré de factures FCA (regex + pdfplumber)** - IMPLÉMENTÉ 2026-02-21

### P1 - En cours
- [ ] Finaliser intégration Calculateur-Inventaire
- [ ] Intégrer programmes de financement automatiques

### P2/P3 - Backlog
- [ ] Refactoriser index.tsx (1800+ lignes)
- [ ] Builds App Store / Play Store

## Implemented Features (2026-02-21)

### Parser Structuré de Factures FCA
**Fichier:** `backend/server.py`

**Fonctions ajoutées:**
- `clean_fca_price(raw_value)` - Décode prix FCA (enlève premier 0 + 2 derniers chiffres)
- `clean_decimal_price(raw_value)` - Nettoie montants décimaux
- `extract_pdf_text(file_bytes)` - Extrait texte PDF avec pdfplumber
- `parse_fca_invoice_structured(text)` - Parser regex principal

**Logique métier:**
- `E.P.` = Coût du véhicule (Employee Price)
- `PDCO` = PDSF/MSRP
- `Holdback` = Informatif seulement, pas de calcul
- `Net Cost` = E.P. directement

**Endpoints mis à jour:**
- `POST /api/inventory/scan-invoice` - Utilise parser structuré pour PDFs, fallback IA pour images
- `POST /api/inventory/scan-invoice-file` - Upload direct de fichiers PDF

**Frontend updates:**
- Ajout bouton "Importer un PDF" dans le modal de scan
- Support base64 avec paramètre `is_pdf`
- Affichage `parse_method` dans les données de review

### Dependencies ajoutées
- `pdfplumber==0.11.9` dans requirements.txt

## Technical Architecture

```
/app
├── backend/
│   ├── server.py          # FastAPI avec parser FCA structuré
│   ├── requirements.txt   # + pdfplumber
│   └── .env               # MONGO_URL, EMERGENT_LLM_KEY, etc.
└── frontend/
    └── app/
        ├── (tabs)/
        │   ├── index.tsx       # Calculateur principal
        │   └── inventory.tsx   # Inventaire + scan factures
        └── contexts/
            └── AuthContext.tsx
```

## API Endpoints

### Invoice Scanning
- `POST /api/inventory/scan-invoice` - Scanner facture (base64)
  - Input: `{ image_base64: string, is_pdf?: boolean }`
  - Output: `{ success: true, vehicle: {...}, parse_method: "structured_regex" | "ai_fallback" }`

- `POST /api/inventory/scan-invoice-file` - Upload fichier direct
  - Input: multipart/form-data avec field `file`
  - Output: même format que scan-invoice

### Inventory
- `GET /api/inventory` - Liste véhicules de l'utilisateur
- `POST /api/inventory` - Ajouter véhicule (avec validation duplicat VIN/stock_no)
- `PUT /api/inventory/{item_id}` - Modifier véhicule
- `DELETE /api/inventory/{stock_no}` - Supprimer véhicule

## Data Models

### Inventory Vehicle
```python
{
  stock_no: str,
  vin: str,
  brand: str,
  model: str,
  trim: str,
  year: int,
  ep_cost: float,    # Employee Price = Coût
  pdco: float,       # Prix dealer
  holdback: float,   # Informatif
  net_cost: float,   # = ep_cost
  msrp: float,       # = pdco
  asking_price: float,
  status: "disponible" | "réservé" | "vendu"
}
```

## Credentials Test
- Email: `danielgiroux007@gmail.com`
- Password: `Liana2018$`

## Known Issues
- Frontend tunnel ngrok en conflit (ERR_NGROK_334) - problème infrastructure temporaire
- Le backend fonctionne parfaitement

## Next Steps
1. Tester le parser avec des factures FCA réelles (images et PDFs)
2. Finaliser intégration calculateur-inventaire
3. Refactoriser index.tsx
