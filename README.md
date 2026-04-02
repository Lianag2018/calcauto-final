# CalcAuto AiPro

> CRM et calculateur de financement/location pour concessionnaires automobiles Stellantis (Chrysler, Dodge, Jeep, Ram, Fiat).

## Fonctionnalites principales

- **Calculateur de financement** : Option 1 vs Option 2, comparaison instantanee
- **Calculateur de location SCI** : Taux, residuels, ajustements kilometrage
- **Import PDF automatique** : Extraction des programmes mensuels et residuels via `pdfplumber`
- **Detection automatique** : Mois/annee, pages (via TOC), plage de dates effective
- **Rapports de comparaison** : Ameliorations vs deteriorations entre les mois
- **Sauvegarde multi-mois** : Un guide residuel couvrant Mar-Apr sauvegarde pour les deux
- **Banniere dynamique** : Evenements promotionnels (loyalty, 90j differe)
- **CRM integre** : Soumissions clients, contacts, inventaire
- **Mode Demo** : Acces sans mot de passe pour demonstration
- **CI/CD** : GitHub Actions (tests + deploy Render/Vercel)

## Stack technique

| Composant | Technologie | Hebergement |
|-----------|-------------|-------------|
| Frontend | Expo (React Native for Web) + TypeScript | Vercel |
| Backend | FastAPI + Python 3.11 + pdfplumber | Render |
| Base de donnees | MongoDB Atlas | Cloud |
| Stockage fichiers | JSON locaux + Supabase | Supabase |

## Demarrage rapide

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001
```

### Frontend
```bash
cd frontend
yarn install
npx expo export --platform web   # Build statique
# Ou pour le dev:
npx expo start --web
```

## Credentials

| Acces | Email | Mot de passe |
|-------|-------|-------------|
| Admin | `danielgiroux007@gmail.com` | `Liana2018$` |
| Demo | Auto-login | *(aucun)* |
| Import (mot de passe admin) | - | `Liana2018` |

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** : Architecture detaillee, flux de donnees, deploiement
- **[memory/PRD.md](./memory/PRD.md)** : Product Requirements Document

## Flux d'import mensuel

```
1. Televersez le PDF Retail → auto-detection mois, extraction programmes + taux SCI Lease
   → Rapport: X ameliores, Y deteriores, Z nouveaux
   
2. Televersez le Guide Residuel → auto-detection mois + plage de dates
   → Sauvegarde pour tous les mois couverts (ex: Mars + Avril)
   → Rapport: ameliorations/deteriorations des residuels par trim
```

## Structure des donnees

```
backend/data/
├── sci_residuals_{mois}{annee}.json    # Residuels par vehicule/trim (Sport ≠ Rebel)
├── sci_lease_rates_{month}{year}.json  # Taux de location SCI groupes
├── km_adjustments_{month}{year}.json   # Ajustements 12k/18k km
├── program_meta_{month}{year}.json     # Metadonnees evenement (banniere)
├── code_program_mapping.json           # Mapping codes FCA
└── fca_product_codes*.json             # Codes produits FCA
```
