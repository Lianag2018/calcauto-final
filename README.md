# CalcAuto AiPro

> Application de financement vehiculaire pour concessionnaires automobiles Stellantis/FCA.
> Calculateur de paiements, import automatique de programmes mensuels, CRM integre.

---

## Apercu

CalcAuto AiPro est un outil professionnel concu pour les conseillers en financement automobile. Il permet de :

- **Calculer instantanement** les paiements de financement et de location (Option 1 / Option 2)
- **Importer automatiquement** les programmes d'incitatifs mensuels depuis les PDF officiels Stellantis
- **Gerer un inventaire** de vehicules avec decodage VIN et Window Stickers
- **Suivre les clients** via un CRM integre (soumissions, contacts, historique)
- **Comparer les options** de financement vs location SCI cote a cote

---

## Stack technique

| Composant | Technologie | Hebergement |
|-----------|-------------|-------------|
| Frontend | Expo 54 + React 19 + TypeScript | Vercel |
| Backend | FastAPI + Python 3.11 | Render |
| Base de donnees | MongoDB | MongoDB Atlas |
| Stockage fichiers | Supabase Storage | Supabase |

---

## Structure du projet

```
calcauto-aipro/
├── backend/                    # API FastAPI
│   ├── server.py               # Point d'entree (startup sync, migrations)
│   ├── routers/                # Endpoints API (/api/*)
│   │   ├── auth.py             # Authentification (login, register, demo)
│   │   ├── programs.py         # Programmes de financement
│   │   ├── import_wizard.py    # Import PDF (scan TOC + extraction)
│   │   ├── sci.py              # Taux location SCI + residuels
│   │   ├── inventory.py        # Inventaire vehicules
│   │   ├── submissions.py      # Soumissions CRM
│   │   ├── contacts.py         # Contacts
│   │   └── admin.py            # Administration
│   ├── services/
│   │   ├── pdfplumber_parser.py  # Parseur PDF deterministe
│   │   ├── storage.py            # Module Supabase Storage
│   │   └── email_service.py      # Envoi emails SMTP
│   ├── data/                   # Cache local (sync Supabase au demarrage)
│   └── tests/                  # Tests unitaires et integration
│
├── frontend/                   # App Expo/React Native (web + mobile)
│   ├── app/                    # Pages (Expo Router)
│   │   ├── (tabs)/             # Onglets principaux
│   │   │   ├── index.tsx       # Calculateur de financement
│   │   │   ├── inventory.tsx   # Inventaire
│   │   │   ├── clients.tsx     # CRM
│   │   │   └── admin.tsx       # Administration
│   │   ├── import.tsx          # Import PDF avec checkboxes
│   │   └── login.tsx           # Connexion
│   ├── components/             # Composants reutilisables
│   ├── hooks/                  # Hooks personnalises
│   ├── utils/                  # Utilitaires (API, i18n, calculs)
│   └── locales/                # Traductions (FR/EN)
│
└── ARCHITECTURE.md             # Documentation technique detaillee
```

---

## Fonctionnalites principales

### Import PDF intelligent
- Upload du PDF mensuel d'incitatifs Stellantis
- Lecture automatique de la Table des Matieres
- Selection des sections a extraire via checkboxes
- Extraction deterministe avec `pdfplumber` (pas d'IA)
- Sauvegarde automatique vers Supabase Storage

### Calculateur de financement
- Taux Option 1 et Option 2
- Consumer Cash et Bonus Cash
- Termes de 24 a 96 mois
- Calcul de location SCI avec residuels
- Comparaison financement vs location

### CRM
- Soumissions clients avec details vehicule/financement
- Carnet de contacts
- Envoi de calculs par email
- Historique des soumissions

### Administration
- Gestion des utilisateurs
- Import de programmes
- Reordonnement des vehicules
- Mode demo (sans mot de passe)

---

## Installation locale

### Prerequis
- Python 3.11+
- Node.js 18+
- MongoDB (local ou Atlas)
- Yarn

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Linux/Mac
# venv\Scripts\activate       # Windows
pip install -r requirements.txt
```

Creer un fichier `backend/.env` :
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=calcauto_dev
ADMIN_PASSWORD=VotreMotDePasse
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_KEY=votre-cle-service
OPENAI_API_KEY=sk-...
SMTP_EMAIL=votre@email.com
SMTP_PASSWORD=mot-de-passe-application
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

Demarrer le serveur :
```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend

```bash
cd frontend
yarn install
```

Creer un fichier `frontend/.env` :
```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

Demarrer en mode web :
```bash
npx expo start --web
```

---

## Deploiement

| Service | Plateforme | Configuration |
|---------|-----------|---------------|
| Backend | Render | `Procfile` + `render.yaml` inclus |
| Frontend | Vercel | `vercel.json` inclus (rewrites vers le backend) |
| Base de donnees | MongoDB Atlas | Configurer `MONGO_URL` dans les variables d'environnement |
| Stockage | Supabase | Bucket `calcauto-data` (cree automatiquement) |

> Voir `ARCHITECTURE.md` pour le guide de deploiement complet pas a pas.

---

## Endpoints API

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/auth/login` | Connexion |
| POST | `/api/auth/demo-login` | Mode demo |
| GET | `/api/programs` | Programmes de financement |
| POST | `/api/calculate` | Calcul de paiement |
| POST | `/api/scan-pdf` | Scan TOC du PDF |
| POST | `/api/extract-pdf-async` | Extraction selective |
| GET | `/api/sci/lease-rates` | Taux location SCI |
| GET | `/api/sci/residuals` | Valeurs residuelles |
| GET | `/api/inventory` | Inventaire vehicules |
| GET | `/api/submissions` | Soumissions CRM |
| GET | `/api/ping` | Keep-alive |

---

## Etat actuel / Limites

- Le stockage fichiers passe par **Supabase Storage** — le backend maintient un **cache local** synchronise au demarrage
- **MongoDB** reste la base principale pour les programmes, utilisateurs et CRM
- Le parseur PDF (`pdfplumber`) est deterministe mais **sensible aux changements de format** des PDF mensuels — chaque nouveau mois peut reveler des cas limites
- Les composants frontend `index.tsx` (~3000 lignes), `inventory.tsx` et `clients.tsx` sont encore **monolithiques** et candidats au refactoring
- L'authentification utilise des tokens SHA256 maison — pas de JWT standard ni OAuth
- Le projet utilise **yarn** comme gestionnaire de paquets (pas npm)

---

## Tests

```bash
cd backend
pytest tests/ -v
```

---

## Licence

Projet prive - Tous droits reserves.
