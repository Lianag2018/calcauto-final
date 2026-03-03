# CalcAuto AiPro - PRD

## Problem Statement
Application de gestion de financement et location automobile pour concessionnaires FCA/Stellantis Canada (Quebec).

## Completed Features
- [x] Calcul financement Option 1/2 avec alternative_consumer_cash
- [x] Calcul location SCI — moteur refactore (leaseCalculator.ts) + backend /api/sci/calculate-lease
- [x] Import PDF via IA (GPT-4o) avec auto-correction
- [x] Export/Import Excel avec comparaison avant/apres + matching flexible
- [x] Memoire des corrections (P1) — matching flexible, compteur d'application
- [x] Upload multiple PDFs + file d'attente revision
- [x] Fix modal "Envoyer par email" — layout compact inline, boutons toujours visibles — 3 mars 2026
- [x] Fix SMTP import manquant → email Excel jamais envoye — 3 mars 2026
- [x] Extraction PDF asynchrone — upload immediat + traitement background + polling — 3 mars 2026
- [x] Fix parser Excel import — supporte format avec en-tetes, $, %, - — 3 mars 2026
- [x] Excel freeze_panes E4 (Programmes) + D4 (SCI Lease) — 3 mars 2026
- [x] Import Excel cree les programmes manquants — 3 mars 2026
- [x] Prompt AI standardise dans build_extraction_prompt() — structure FIGEE, incluant alt_consumer_cash — 3 mars 2026
- [x] Excel 2 onglets: Programmes + SCI Lease — email inclut les deux — 3 mars 2026

## Standard Excel Structure (FIGEE)
### Onglet 1: Programmes
- Row 1: Titre | Row 2: Categories | Row 3: Colonnes | Row 4+: Donnees
- A:Marque B:Modele C:Trim D:Annee | E:Rabais Opt1 F-K:Taux Opt1 | L:Rabais Opt2 M-R:Taux Opt2 | S:Bonus
- Freeze: E4

### Onglet 2: SCI Lease
- Row 1: Titre | Row 2: Categories | Row 3: Colonnes | Row 4+: Donnees
- A:Marque B:Modele | C:Lease Cash | D-L:Standard Rates(24-60m) | M-U:Alt Rates(24-60m)
- Freeze: D4

## Architecture Notes
- Frontend: Expo/React Native Web, pre-built to /app/frontend/dist
- Backend: FastAPI on port 8001
- Frontend rebuild: npx expo export --platform web + supervisorctl restart expo
- Async extraction: POST /api/extract-pdf-async + GET /api/extract-task/{task_id}
- Prompt AI centralise dans build_extraction_prompt() - NEVER modify column structure

## Backlog
- (P1) Creer UI admin pour gestion des corrections sauvegardees
- (P2) Refactorer index.tsx (3600+ lignes)
- (P2) Refactorer inventory.tsx
