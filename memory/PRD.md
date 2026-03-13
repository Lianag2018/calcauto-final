# CalcAuto AiPro - PRD

## Problème Original
CRM pour concessionnaire automobile. Parser PDF déterministe (pdfplumber) pour extraire les données de programmes de financement mensuels FCA (Stellantis).

## Architecture
- **Frontend**: React Native (Expo)
- **Backend**: FastAPI + MongoDB
- **Parser**: pdfplumber (déterministe, pas d'IA)
- **Excel**: openpyxl pour génération de fichiers Excel

## Fonctionnalités Implémentées

### P0 - Parser PDF Robuste (RÉÉCRITURE MAJEURE - Mars 2026)
**Classification de tables par contenu (content-driven):**
- `_classify_table()` identifie chaque table par son CONTENU (mots-clés véhicule, valeurs %, montants $)
- `_classify_all_tables()` catégorise toutes les tables d'une page en: rates, names, bonus, delivery
- Plus aucune dépendance sur `tables[0]`, `tables[1]` etc.

**Détection dynamique des colonnes:**
- Méthode 1: Analyse des en-têtes (36M, Lease Cash, SCI Standard, etc.)
- Méthode 2: Fallback par pattern — scan des données pour trouver clusters de %
- `_detect_sci_columns()`: exact match "LEASE CASH", first-match-wins, ignore "Stackable" text
- `_detect_rate_columns()`: dual-method (header + data fallback)

**Protection des données:**
- `parse_dollar()`: ignore les textes MSRP/Discount/programme (ex: "P2619B3" ≠ $2,619)
- Validation post-extraction: vérifie cohérence CC, taux, noms, doublons
- Endpoint `/api/validate-data` pour vérification à la demande

**Logging détaillé:**
- Classification de chaque table loggée
- Colonnes détectées loggées
- Nombre de véhicules extraits par page
- Avertissements d'alignement noms↔taux

### P0 - Export Excel
- Onglet Financement: 93 programmes, colonnes Version (55 chars, aligné gauche)
- Onglet SCI Lease: 73 véhicules, colonne Modèle (60 chars, aligné gauche)
- Onglet Rapport: validation automatique, statistiques, avertissements
- Endpoint GET `/api/download-excel?month=X&year=Y`
- Envoi automatique par email

### Autres (Complétés)
- CI/CD GitHub Actions
- Mode Démo (demo@calcauto.ca)
- Détection automatique des pages (TOC-first)
- Extraction bonus cash depuis page séparée
- Détection marqueurs de loyauté "P"

## Bugs Corrigés (Session Actuelle)
1. MSRP Discount: parse_dollar extrayait codes programme ($2,619) → FIXED
2. SCI Lease colonnes: lease_cash=col4 au lieu de col2 → FIXED via exact match
3. SCI Lease bonus: bonus_col=col17 au lieu de col30 → FIXED via startsWith
4. Excel affichage: noms tronqués (col 28 chars centré) → FIXED (60 chars gauche)
5. Parser fragile: dépendait des indices de tables → FIXED via content-driven classification

## Tâches En Cours
- CI/CD: utilisateur doit "Save to GitHub" pour débloquer
- Splash screen: attente feedback utilisateur

## Backlog
- P2: Bouton "Télécharger Excel" dans le frontend
- P2: Interface gestion des corrections
- P3: Refactoring composants frontend

## Endpoints Clés
- POST `/api/extract-pdf` - Import PDF (sync)
- POST `/api/extract-pdf-async` - Import PDF (async)
- GET `/api/download-excel?month=X&year=Y` - Téléchargement Excel
- GET `/api/validate-data?month=X&year=Y` - Rapport de validation

## Schéma BD
- `programs`: brand, model, trim, year, consumer_cash, alt_consumer_cash, bonus_cash, option1_rates, option2_rates, loyalty_cash, loyalty_opt1, loyalty_opt2, program_month, program_year
- `residuals`: valeurs résiduelles véhicules
- `users`: comptes utilisateurs

## Tests
- iteration_28.json: 16/16 (pré-rewrite)
- iteration_29.json: 17/17 (post bug fixes)
- iteration_30.json: 18/18 (post content-driven rewrite)
