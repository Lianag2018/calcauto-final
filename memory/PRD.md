# CalcAuto AiPro - Product Requirements Document

## Original Problem Statement
Application mobile iOS/Android de calculateur de financement automobile pour concessionnaires FCA/Stellantis (Chrysler, Dodge, Jeep, Ram, Fiat).

## Core Features Implemented

### 1. Calculateur de Financement ✅
- Sélection véhicule par année/marque/modèle
- Calcul paiements (mensuel, bi-mensuel, hebdo)
- Application des programmes/primes FCA
- Envoi par email au client

### 2. CRM / Gestion Clients ✅
- Import/Export contacts
- Suivi des soumissions
- Rappels automatiques
- Better Offers

### 3. Multi-Tenancy (Isolation Données) ✅
- Chaque utilisateur a ses propres données
- `owner_id` sur contacts, submissions, inventory
- Endpoints sécurisés par token

### 4. Panneau Administrateur ✅ (NEW)
- Vue de tous les utilisateurs
- Bloquer/Débloquer comptes
- Statistiques globales
- Visible uniquement pour admin

### 5. Module Inventaire ✅ (NEW)
- Structure FCA complète:
  - Stock#, VIN, Marque, Modèle, Trim
  - PDCO, EP Cost, Holdback, Net Cost
  - PDSF, Prix affiché, Prix vendu
  - Statut: Disponible/Réservé/Vendu
- Calcul automatique: net_cost = ep_cost - holdback
- Filtres et recherche

### 6. Scanner de Factures FCA ✅ (COMPLETED)
- GPT-4o Vision via emergentintegrations (EMERGENT_LLM_KEY)
- Règle de décodage FCA (enlever 1er 0 + 2 derniers)
- Extraction: VIN, Modèle, E.P., PDCO, PREF, Options
- Sauvegarde automatique dans l'inventaire
- Interface utilisateur complète:
  - Bouton caméra (orange) dans l'en-tête Inventaire
  - Modal avec options "Prendre une photo" / "Importer une image"
  - Conseils pour un meilleur scan
  - Affichage des résultats avec véhicule ajouté

## Technical Architecture

### Backend (FastAPI)
- `/app/backend/server.py` - 3000+ lignes
- MongoDB avec Motor (async)
- JWT Authentication
- Deployed on Render: `calcauto-final-backend.onrender.com`

### Frontend (Expo/React Native)
- `/app/frontend/app/(tabs)/`
  - `index.tsx` - Calculateur
  - `inventory.tsx` - Inventaire
  - `clients.tsx` - CRM
  - `admin.tsx` - Administration
- Deployed on Vercel: `calcauto-final.vercel.app`

### Database (MongoDB Atlas)
- Collections: users, contacts, submissions, inventory, vehicle_options, programs, better_offers

## API Endpoints

### Authentication
- POST /api/auth/login
- POST /api/auth/register

### Inventory (NEW)
- GET /api/inventory
- POST /api/inventory
- POST /api/inventory/bulk
- PUT /api/inventory/{stock_no}
- DELETE /api/inventory/{stock_no}
- PUT /api/inventory/{stock_no}/status
- GET /api/inventory/stats/summary
- POST /api/inventory/scan-invoice
- POST /api/inventory/scan-and-save

### Admin (NEW)
- GET /api/admin/users
- PUT /api/admin/users/{user_id}/block
- PUT /api/admin/users/{user_id}/unblock
- GET /api/admin/stats

## Backlog (P0/P1/P2)

### P0 - Critical
- [x] Fix production login
- [x] Data migration to Atlas
- [x] Admin panel
- [x] Inventory module

### P1 - High Priority
- [ ] Inventory selector in calculator
- [ ] Bulk import CSV/Excel
- [ ] Native PDF parser (no AI)

### P2 - Medium Priority
- [ ] App Store / Play Store builds
- [ ] Refactor index.tsx (1800+ lines)
- [ ] Profit history per vehicle
- [ ] Export reports

### P3 - Future
- [ ] Multi-language support
- [ ] Offline mode
- [ ] Push notifications

## Credentials
- Admin: danielgiroux007@gmail.com
- Production URL: https://calcauto-final.vercel.app
- Backend URL: https://calcauto-final-backend.onrender.com

## Latest Changes (Feb 20, 2026)
- ✅ Fixed invoice scan integration (ImageContent → file_contents parameter)
- ✅ Switched from OPENAI_API_KEY to EMERGENT_LLM_KEY for reliability
- ✅ Added testID attributes for scan/add buttons
- ✅ All frontend tests passed (6/6)

## Last Updated
February 20, 2026
