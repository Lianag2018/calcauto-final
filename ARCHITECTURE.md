# CalcAuto AiPro - Architecture & Guide de Deploiement

> Document complet pour comprendre, deployer et maintenir l'application de maniere independante.

---

## Table des matieres

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture Backend (FastAPI)](#2-architecture-backend-fastapi)
3. [Architecture Frontend (Expo React)](#3-architecture-frontend-expo-react)
4. [Base de donnees (MongoDB)](#4-base-de-donnees-mongodb)
5. [Deploiement](#5-deploiement)
   - [GitHub](#51-github)
   - [Backend sur Render](#52-backend-sur-render)
   - [Frontend sur Vercel](#53-frontend-sur-vercel)
6. [Variables d'environnement](#6-variables-denvironnement)
7. [Flux de donnees](#7-flux-de-donnees)
8. [Maintenance et operations courantes](#8-maintenance-et-operations-courantes)
9. [Depannage](#9-depannage)

---

## 1. Vue d'ensemble

**CalcAuto AiPro** est une application full-stack de financement vehiculaire composee de 3 parties :

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   FRONTEND      │       │   BACKEND       │       │   BASE DE       │
│   (Vercel)      │──────>│   (Render)      │──────>│   DONNEES       │
│   Expo/React    │       │   FastAPI       │       │   (MongoDB      │
│   TypeScript    │       │   Python 3.11   │       │    Atlas)       │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

| Composant | Technologie | Hebergement |
|-----------|-------------|-------------|
| Frontend  | Expo (React) + TypeScript | Vercel |
| Backend   | FastAPI + Python 3.11 | Render |
| Base de donnees | MongoDB | MongoDB Atlas (cloud) |

**Repositories GitHub (compte `Lianag2018`):**
- Backend : `Lianag2018/calcauto-backend` (ou similaire)
- Frontend : `Lianag2018/calcauto-frontend` (ou similaire)

---

## 2. Architecture Backend (FastAPI)

### Structure des fichiers

```
backend/
├── server.py              # Point d'entree principal (FastAPI app)
├── database.py            # Connexion MongoDB + configuration globale
├── models.py              # Modeles Pydantic (validation des donnees)
├── dependencies.py        # Fonctions utilitaires (auth, calculs)
├── validation.py          # Validation de donnees
├── vin_utils.py           # Utilitaires VIN (decodage vehicule)
├── product_code_lookup.py # Referentiel codes produits FCA
├── fca_parser.py          # Parseur de programmes FCA depuis PDF
├── ocr.py                 # Logique OCR pour scan de factures
├── ocr_zones.py           # Zones de detection OCR
├── parser.py              # Parseur de factures
│
├── routers/               # Endpoints API (chaque fichier = un groupe)
│   ├── auth.py            # /api/auth/register, /api/auth/login, /api/auth/logout
│   ├── programs.py        # /api/programs (CRUD), /api/calculate, /api/import, /api/seed
│   ├── submissions.py     # /api/submissions (CRM: soumissions clients)
│   ├── contacts.py        # /api/contacts (carnet d'adresses)
│   ├── inventory.py       # /api/inventory (gestion vehicules en stock)
│   ├── invoice.py         # /api/invoice/scan (scanner factures OCR/IA)
│   ├── email.py           # /api/email/send (envoi emails de calcul)
│   ├── import_wizard.py   # /api/import-wizard (import PDF/Excel programmes)
│   ├── sci.py             # /api/sci/* (taux location SCI, residuels)
│   └── admin.py           # /api/admin/* (gestion utilisateurs, stats)
│
├── services/
│   ├── email_service.py   # Service SMTP (envoi emails via Gmail)
│   └── window_sticker.py  # Recuperation Window Sticker Stellantis
│
├── scripts/
│   └── setup_trim_orders.py  # Script pour configurer l'ordre des trims
│
├── data/                  # Fichiers de donnees statiques
│   ├── sci_residuals_feb2026.json      # Valeurs residuelles SCI
│   ├── sci_lease_rates_feb2026.json    # Taux de location SCI
│   ├── fca_product_codes_2026.json     # Codes produits FCA
│   └── ...
│
├── requirements.txt       # Dependances Python
├── Procfile               # Commande de demarrage (Render)
├── render.yaml            # Configuration Render
└── runtime.txt            # Version Python (3.11.4)
```

### Fichiers cles expliques

#### `server.py` - Point d'entree
C'est le fichier principal qui demarre l'application FastAPI. Il:
- Cree l'application FastAPI
- Importe et enregistre tous les routers sous le prefixe `/api`
- Configure le CORS (Cross-Origin Resource Sharing) pour permettre au frontend de communiquer
- Gere la fermeture propre de la connexion MongoDB

**Tous les endpoints API sont prefixes par `/api`** grace a la ligne :
```python
api_router = APIRouter(prefix="/api")
```

#### `database.py` - Configuration
Ce fichier gere :
- La connexion a MongoDB via `motor` (driver async)
- La lecture des variables d'environnement (`.env`)
- Les constantes globales : `ADMIN_PASSWORD`, `OPENAI_API_KEY`, `SMTP_*`

#### `models.py` - Modeles de donnees
Definit tous les schemas Pydantic pour la validation :
- `VehicleProgram` : Programme de financement (marque, modele, trim, taux Option 1/2, bonus cash, sort_order)
- `Submission` : Soumission client (CRM)
- `InventoryVehicle` : Vehicule en inventaire
- `User` : Utilisateur de l'application
- `Contact` : Contact importe
- Et d'autres modeles de requete/reponse...

#### `dependencies.py` - Utilitaires
Contient :
- `hash_password()` : Hachage de mot de passe (SHA256)
- `generate_token()` : Generation de jetons d'authentification
- `get_current_user()` : Middleware d'authentification
- `calculate_monthly_payment()` : Formule d'amortissement pour les paiements
- `get_rate_for_term()` : Extraction du taux pour un terme donne

### Endpoints API principaux

| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/auth/register` | Inscription d'un utilisateur |
| POST | `/api/auth/login` | Connexion (retourne un token) |
| GET | `/api/programs` | Liste des programmes de financement (tries par sort_order) |
| POST | `/api/calculate` | Calcul de financement pour un vehicule |
| POST | `/api/import` | Import de programmes (protege par mot de passe admin) |
| PUT | `/api/programs/reorder` | Reordonnement des programmes (admin) |
| GET/POST | `/api/inventory` | Gestion de l'inventaire vehiculaire |
| POST | `/api/invoice/scan` | Scanner une facture (OCR) |
| POST | `/api/email/send` | Envoyer un calcul par email |
| GET/POST | `/api/submissions` | Gestion des soumissions (CRM) |
| GET/POST | `/api/contacts` | Gestion des contacts |
| GET | `/api/sci/residuals` | Valeurs residuelles SCI |
| GET | `/api/sci/lease-rates` | Taux de location SCI |
| GET | `/api/admin/users` | Liste des utilisateurs (admin) |
| GET | `/api/admin/stats` | Statistiques globales (admin) |

---

## 3. Architecture Frontend (Expo React)

### Structure des fichiers

```
frontend/
├── app/
│   ├── _layout.tsx              # Layout racine (authentification, navigation)
│   ├── login.tsx                # Page de connexion
│   ├── import.tsx               # Page d'import de programmes
│   ├── manage.tsx               # Page de gestion
│   └── (tabs)/
│       ├── _layout.tsx          # Configuration des onglets (barre de navigation)
│       ├── index.tsx            # Onglet "Calcul" (calculateur principal)
│       ├── inventory.tsx        # Onglet "Inventaire"
│       ├── clients.tsx          # Onglet "CRM" (soumissions + contacts)
│       └── admin.tsx            # Onglet "Admin" (visible admin seulement)
│
├── components/
│   ├── AnimatedSplashScreen.tsx # Animation d'ecran de demarrage
│   ├── EmailModal.tsx           # Modal d'envoi d'email
│   ├── FilterBar.tsx            # Barre de filtres
│   ├── LanguageSelector.tsx     # Selecteur de langue (FR/EN)
│   ├── LoadingBorderAnimation.tsx
│   └── calculator/              # Composants du calculateur
│       ├── CalculatorInputs.tsx
│       ├── CostBreakdown.tsx
│       ├── PaymentResult.tsx
│       ├── ProgramSelector.tsx
│       └── index.ts
│
├── contexts/
│   └── AuthContext.tsx           # Contexte d'authentification (login, token, user)
│
├── hooks/
│   ├── useCalculator.ts         # Hook du calculateur
│   ├── useFinancingCalculation.ts # Calculs de financement
│   ├── useNetCost.ts            # Calcul du cout net
│   └── usePrograms.ts           # Recuperation des programmes
│
├── utils/
│   ├── api.ts                   # Configuration de l'URL backend
│   └── i18n.ts                  # Internationalisation (FR/EN)
│
├── locales/
│   ├── fr.json                  # Traductions francaises
│   └── en.json                  # Traductions anglaises
│
├── types/
│   └── calculator.ts            # Types TypeScript du calculateur
│
├── assets/                      # Images et polices
├── package.json                 # Dependances NPM
├── vercel.json                  # Configuration de deploiement Vercel
├── app.json                     # Configuration Expo
└── tsconfig.json                # Configuration TypeScript
```

### Fichiers cles expliques

#### `utils/api.ts` - Communication avec le backend
Ce fichier determine l'URL du backend :
- **Sur le web (Vercel):** Utilise `window.location.origin` (les appels API sont rediriges vers Render via les `rewrites` de Vercel)
- **En developpement:** Utilise `EXPO_PUBLIC_BACKEND_URL` ou `http://localhost:8001`

#### `contexts/AuthContext.tsx` - Authentification
Gere tout le cycle d'authentification :
- Stockage du token (localStorage sur web, AsyncStorage sur mobile)
- Login/Logout/Register
- Verification automatique du token au demarrage
- Detection du role admin

#### `app/(tabs)/_layout.tsx` - Navigation
Configure les 4 onglets de l'application :
1. **Calcul** (`index.tsx`) - Calculateur de financement
2. **Inventaire** (`inventory.tsx`) - Gestion du stock
3. **CRM** (`clients.tsx`) - Clients et soumissions
4. **Admin** (`admin.tsx`) - Administration (visible uniquement pour les admins)

#### `app/(tabs)/index.tsx` - Calculateur principal
C'est le fichier le plus important et le plus volumineux (~3000+ lignes). Il gere :
- Selection du vehicule (marque, modele, trim)
- Calcul des paiements (financement + location)
- Comparaison Option 1 vs Option 2
- Partage par SMS/screenshot
- Integration avec l'inventaire

#### `vercel.json` - Configuration Vercel
```json
{
  "buildCommand": "npx expo export -p web",
  "outputDirectory": "dist",
  "framework": null,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://calcauto-final-backend.onrender.com/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
- **buildCommand:** Compile le frontend Expo en site web statique
- **outputDirectory:** Le dossier `dist/` contient les fichiers compiles
- **rewrites:** 
  - Toute requete commencant par `/api/` est redirigee vers le backend Render
  - Toute autre requete sert `index.html` (Single Page Application)

---

## 4. Base de donnees (MongoDB)

### Connexion
L'application utilise **MongoDB Atlas** (cloud) via le driver `motor` (async Python).

La chaine de connexion est stockee dans la variable `MONGO_URL` du fichier `.env` backend.

### Collections principales

| Collection | Description | Champs cles |
|------------|-------------|-------------|
| `programs` | Programmes de financement | `id`, `brand`, `model`, `trim`, `year`, `consumer_cash`, `bonus_cash`, `option1_rates`, `option2_rates`, `sort_order`, `program_month`, `program_year` |
| `trim_orders` | Ordre des trims par modele | `brand`, `model`, `year`, `trims` (liste ordonnee) |
| `users` | Comptes utilisateurs | `id`, `name`, `email`, `password_hash`, `is_admin`, `is_blocked` |
| `tokens` | Tokens d'authentification | `user_id`, `token`, `created_at` |
| `submissions` | Soumissions clients (CRM) | `id`, `owner_id`, `client_name`, `client_phone`, `vehicle_*`, `payment_*`, `status` |
| `contacts` | Contacts importes | `id`, `owner_id`, `name`, `phone`, `email` |
| `inventory` | Vehicules en stock | `id`, `owner_id`, `stock_no`, `vin`, `brand`, `model`, `msrp`, `status` |
| `vehicle_options` | Options/equipements | `stock_no`, `product_code`, `description`, `amount` |
| `window_stickers` | Window Stickers caches | `vin`, `data`, `images` |
| `parsing_metrics` | Metriques de scan OCR | `owner_id`, `vin`, `score`, `status`, `duration_sec` |

### Tri logique (sort_order)
Le champ `sort_order` dans la collection `programs` determine l'ordre d'affichage des vehicules. Cet ordre est base sur le document PDF officiel d'incentives FCA/Stellantis, et non pas alphabetique.

La collection `trim_orders` stocke l'ordre de reference pour chaque marque/modele, ce qui permet de recalculer automatiquement le `sort_order` lors de futurs imports.

---

## 5. Deploiement

### 5.1 GitHub

Le code source est stocke dans vos repositories GitHub sous le compte `Lianag2018`.

**Structure recommandee :** 2 repositories separes pour faciliter le deploiement :
- Un repository pour le **backend** (contenu du dossier `backend/`)
- Un repository pour le **frontend** (contenu du dossier `frontend/`)

#### Pousser le code vers GitHub
```bash
# Depuis le dossier backend/
cd backend
git init
git remote add origin https://github.com/Lianag2018/calcauto-backend.git
git add .
git commit -m "Initial commit"
git push -u origin main

# Depuis le dossier frontend/
cd frontend
git init
git remote add origin https://github.com/Lianag2018/calcauto-frontend.git
git add .
git commit -m "Initial commit"
git push -u origin main
```

> **Note :** Sur la plateforme Emergent, utilisez le bouton "Save to GitHub" dans l'interface pour pousser automatiquement votre code.

---

### 5.2 Backend sur Render

#### Etape 1 : Creer un compte Render
Allez sur [render.com](https://render.com) et connectez-vous avec votre compte GitHub.

#### Etape 2 : Creer un nouveau "Web Service"
1. Cliquez sur **"New +"** > **"Web Service"**
2. Connectez votre repository GitHub `calcauto-backend`
3. Configurez :

| Parametre | Valeur |
|-----------|--------|
| **Name** | `calcauto-backend` (ou un nom de votre choix) |
| **Region** | `Oregon (US West)` (ou la plus proche) |
| **Branch** | `main` |
| **Root Directory** | *(laisser vide si le repo contient directement les fichiers backend)* |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn server:app --host 0.0.0.0 --port $PORT` |

#### Etape 3 : Variables d'environnement
Dans la section **"Environment"** de Render, ajoutez :

| Variable | Description | Exemple |
|----------|-------------|---------|
| `MONGO_URL` | Chaine de connexion MongoDB Atlas | `mongodb+srv://user:pass@cluster.mongodb.net/` |
| `DB_NAME` | Nom de la base de donnees | `calcauto_prod` |
| `ADMIN_PASSWORD` | Mot de passe admin pour les imports | `Liana2018` |
| `OPENAI_API_KEY` | Cle API OpenAI (pour OCR/IA) | `sk-proj-...` |
| `GOOGLE_VISION_API_KEY` | Cle API Google Cloud Vision (OCR) | `AIzaSy...` |
| `SMTP_EMAIL` | Email Gmail pour envoi | `danielgiroux007@gmail.com` |
| `SMTP_PASSWORD` | Mot de passe d'application Gmail | `xxxx xxxx xxxx xxxx` |
| `SMTP_HOST` | Serveur SMTP | `smtp.gmail.com` |
| `SMTP_PORT` | Port SMTP | `587` |

> **Important :** Pour `SMTP_PASSWORD`, vous devez generer un **mot de passe d'application** dans les parametres de securite de votre compte Google (Parametres > Securite > Verification en 2 etapes > Mots de passe d'application).

#### Etape 4 : Deploiement automatique
- Render deploie automatiquement a chaque `git push` sur la branche `main`
- L'URL de votre backend sera quelque chose comme : `https://calcauto-backend.onrender.com`
- Testez avec : `https://votre-backend.onrender.com/api/ping` (devrait retourner `{"status": "ok"}`)

#### Fichiers de configuration Render
Le repository contient deja les fichiers necessaires :
- **`Procfile`** : `web: uvicorn server:app --host 0.0.0.0 --port $PORT`
- **`runtime.txt`** : `python-3.11.4`
- **`render.yaml`** : Configuration declarative complete

---

### 5.3 Frontend sur Vercel

#### Etape 1 : Creer un compte Vercel
Allez sur [vercel.com](https://vercel.com) et connectez-vous avec votre compte GitHub.

#### Etape 2 : Importer le projet
1. Cliquez sur **"Add New..."** > **"Project"**
2. Selectionnez votre repository `calcauto-frontend`
3. Vercel detectera automatiquement la configuration grace au fichier `vercel.json`

#### Etape 3 : Configuration du build
Vercel utilisera automatiquement `vercel.json`, mais verifiez que :

| Parametre | Valeur |
|-----------|--------|
| **Build Command** | `npx expo export -p web` |
| **Output Directory** | `dist` |
| **Framework Preset** | `Other` (pas React, pas Next.js) |
| **Install Command** | `yarn install` (par defaut) |

#### Etape 4 : Configuration des rewrites (CRUCIAL)
Le fichier `vercel.json` contient deja les regles de redirection :

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://calcauto-final-backend.onrender.com/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Vous devez mettre a jour l'URL de destination** avec l'URL reelle de votre backend Render :
```json
"destination": "https://VOTRE-BACKEND.onrender.com/api/$1"
```

Cette configuration fait en sorte que :
- Les appels a `/api/*` sont rediriges vers votre backend Render
- Toutes les autres requetes servent l'application frontend (SPA)

#### Etape 5 : Deploiement automatique
- Vercel deploie automatiquement a chaque `git push` sur la branche `main`
- L'URL sera quelque chose comme : `https://calcauto-frontend.vercel.app`
- Vous pouvez ajouter un domaine personnalise dans les parametres Vercel

---

## 6. Variables d'environnement

### Backend (`.env`)

```env
MONGO_URL=mongodb+srv://user:password@cluster.mongodb.net/
DB_NAME=calcauto_prod
ADMIN_PASSWORD=Liana2018
OPENAI_API_KEY=sk-proj-...
GOOGLE_VISION_API_KEY=AIzaSy...
SMTP_EMAIL=danielgiroux007@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

> **MONGO_URL :** Obtenez cette URL depuis votre dashboard MongoDB Atlas :
> 1. Connectez-vous a [cloud.mongodb.com](https://cloud.mongodb.com)
> 2. Cliquez sur **"Connect"** pour votre cluster
> 3. Choisissez **"Connect your application"**
> 4. Copiez la chaine de connexion et remplacez `<password>` par votre mot de passe

### Frontend
Le frontend n'a **pas besoin de variables d'environnement en production** sur Vercel. La communication avec le backend se fait via les `rewrites` de `vercel.json`.

Pour le developpement local uniquement :
```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```

---

## 7. Flux de donnees

### Flux d'un calcul de financement
```
1. L'utilisateur selectionne un vehicule dans le frontend
   │
2. Le frontend appelle GET /api/programs
   │
3. Le backend retourne les programmes tries par sort_order
   │
4. L'utilisateur entre un prix et choisit un terme
   │
5. Le frontend appelle POST /api/calculate avec le program_id et le prix
   │
6. Le backend calcule les paiements Option 1 et Option 2
   │
7. Le frontend affiche les resultats avec la comparaison
   │
8. L'utilisateur peut envoyer par email (POST /api/email/send)
   ou creer une soumission CRM (POST /api/submissions)
```

### Flux de l'import de programmes
```
1. L'admin televerse un PDF/Excel de programmes
   │
2. Le backend parse le fichier (pdfplumber/openpyxl)
   │
3. Les programmes extraits sont presentes pour validation
   │
4. L'admin confirme l'import (avec mot de passe)
   │
5. Les anciens programmes du mois sont supprimes
   │
6. Les nouveaux programmes sont inseres avec le sort_order calcule
```

### Flux d'authentification
```
1. L'utilisateur entre email + mot de passe
   │
2. POST /api/auth/login
   │
3. Le backend verifie les credentials et retourne un token
   │
4. Le token est stocke dans localStorage (web) ou AsyncStorage (mobile)
   │
5. Chaque requete suivante inclut le token dans le header Authorization
   │
6. Le backend verifie le token via get_current_user()
```

---

## 8. Maintenance et operations courantes

### Mettre a jour les programmes mensuels
1. Connectez-vous en tant qu'admin
2. Allez dans l'onglet **Admin** > **Import**
3. Televersez le nouveau PDF ou Excel des programmes
4. Validez et confirmez l'import

### Modifier l'ordre des vehicules
1. Connectez-vous en tant qu'admin
2. Allez dans l'onglet **Admin** > **Ordre vehicules**
3. Faites glisser-deposer les vehicules dans l'ordre souhaite
4. Sauvegardez (mot de passe admin requis : `Liana2018`)

### Ajouter un utilisateur
Les utilisateurs peuvent s'inscrire eux-memes via la page de connexion. L'admin peut ensuite bloquer/debloquer des utilisateurs depuis l'onglet Admin.

### Forcer un redeploiement
- **Backend (Render):** Allez sur le dashboard Render > votre service > cliquez "Manual Deploy"
- **Frontend (Vercel):** Allez sur le dashboard Vercel > votre projet > "Redeploy"

Ou simplement poussez un commit sur la branche `main` de GitHub.

### Surveiller les erreurs
- **Render:** Dashboard > Logs (en temps reel)
- **Vercel:** Dashboard > Deployments > Logs
- **MongoDB Atlas:** Dashboard > Monitoring

### Sauvegarder la base de donnees
Depuis MongoDB Atlas :
1. Allez dans votre cluster > **Collections**
2. Vous pouvez exporter des collections en JSON
3. Ou utilisez `mongodump` en ligne de commande :
```bash
mongodump --uri="mongodb+srv://user:pass@cluster.mongodb.net/calcauto_prod" --out=./backup
```

---

## 9. Depannage

### Le backend ne demarre pas sur Render
- Verifiez les logs dans le dashboard Render
- Assurez-vous que toutes les variables d'environnement sont configurees
- Verifiez que `MONGO_URL` est accessible (whitelist IP dans MongoDB Atlas)

### "CORS error" dans le navigateur
- Le CORS est configure pour accepter toutes les origines (`allow_origins=["*"]`)
- Si vous voyez une erreur CORS, c'est probablement que le backend n'est pas accessible
- Verifiez l'URL dans `vercel.json` > `rewrites`

### Les programmes ne s'affichent pas
- Verifiez que la base de donnees contient des programmes : `GET /api/programs`
- Si la reponse est vide, executez un import de programmes via l'interface admin

### Les emails ne sont pas envoyes
- Verifiez que `SMTP_EMAIL` et `SMTP_PASSWORD` sont correctement configures
- Le `SMTP_PASSWORD` doit etre un **mot de passe d'application** Google, pas votre mot de passe Gmail normal
- Activez la verification en 2 etapes dans votre compte Google, puis generez un mot de passe d'application

### MongoDB Atlas : whitelist des IP
Sur MongoDB Atlas, vous devez autoriser les IP de Render a se connecter :
1. Allez dans **Network Access** dans le dashboard Atlas
2. Ajoutez `0.0.0.0/0` pour autoriser toutes les IP (simple mais moins securise)
3. Ou ajoutez les IP statiques de Render (disponibles dans leur documentation)

### Le frontend affiche une page blanche
- Verifiez que le build a reussi sur Vercel (dashboard > derniere deploiement)
- Verifiez la console du navigateur (F12) pour les erreurs JavaScript
- Assurez-vous que `vercel.json` est correct et que la rewrite vers le backend fonctionne

---

## Annexe : Dependances principales

### Backend (Python)
| Package | Version | Usage |
|---------|---------|-------|
| fastapi | 0.110.1 | Framework web API |
| uvicorn | 0.25.0 | Serveur ASGI |
| motor | 3.3.1 | Driver MongoDB async |
| pymongo | 4.5.0 | Driver MongoDB |
| pydantic | 2.12.5 | Validation de donnees |
| openai | 1.99.9 | API OpenAI (OCR/IA) |
| openpyxl | 3.1.2 | Lecture/ecriture Excel |
| PyMuPDF | 1.27.1 | Conversion PDF en images |
| pdfplumber | 0.11.9 | Extraction texte PDF |
| pytesseract | 0.3.13 | OCR Tesseract |
| Pillow | 10.4.0 | Traitement d'images |
| opencv-python-headless | 4.10.0.84 | Vision par ordinateur |
| PyJWT | 2.8.0 | Tokens JWT |
| python-dotenv | 1.2.1 | Variables d'environnement |

### Frontend (JavaScript/TypeScript)
| Package | Version | Usage |
|---------|---------|-------|
| expo | 54.0.33 | Framework React Native/Web |
| react | 19.1.0 | Bibliotheque UI |
| react-native-web | 0.21.0 | React Native sur le web |
| axios | 1.13.4 | Requetes HTTP |
| zustand | 5.0.11 | Gestion d'etat |
| html2canvas | 1.4.1 | Screenshots pour SMS |
| expo-router | 6.0.22 | Routing (navigation) |
| expo-document-picker | 14.0.8 | Selection de fichiers |
| expo-file-system | 19.0.21 | Systeme de fichiers |

---

## Annexe : Comptes et acces

| Service | URL | Identifiants |
|---------|-----|-------------|
| Application (login) | *(votre URL Vercel)* | `danielgiroux007@gmail.com` / `Liana2018$` |
| Admin (import/gestion) | *(meme app, onglet Admin)* | Mot de passe: `Liana2018` |
| MongoDB Atlas | cloud.mongodb.com | *(votre compte)* |
| Render Dashboard | dashboard.render.com | *(votre compte GitHub)* |
| Vercel Dashboard | vercel.com/dashboard | *(votre compte GitHub)* |
| GitHub | github.com/Lianag2018 | *(votre compte)* |

---

*Document genere le 27 fevrier 2026 pour CalcAuto AiPro*
