# CalcAuto AiPro - PRD

## Problem Statement
Application de gestion de financement et location automobile pour concessionnaires FCA/Stellantis Canada (Quebec).

## Completed Features
- [x] Calcul financement Option 1/2 avec alternative_consumer_cash
- [x] Calcul location SCI — moteur refactore (leaseCalculator.ts) + backend /api/sci/calculate-lease
- [x] Audit Option 1 vs Option 2 — coherence confirmee
- [x] Import PDF via IA (GPT-4o) avec auto-correction
- [x] Export/Import Excel avec comparaison avant/apres + matching flexible
- [x] Memoire des corrections (P1) — matching flexible, compteur d'application, rapport
- [x] API gestion corrections (GET /api/corrections, DELETE /api/corrections/all)
- [x] Upload multiple PDFs + file d'attente revision
- [x] Force logout apres import
- [x] Fix modal "Envoyer par email" — layout compact inline, boutons toujours visibles (Dimensions-based maxHeight) — 3 mars 2026
- [x] Fix SMTP import manquant (SMTP_HOST, SMTP_PASSWORD, SMTP_PORT) — email Excel jamais envoye — 3 mars 2026
- [x] Extraction PDF asynchrone — upload immediat + traitement background + polling statut — 3 mars 2026
- [x] Fix parser Excel import — supporte nouveau format avec en-tetes, $, %, - — 3 mars 2026
- [x] Excel freeze_panes E4 — fige lignes 1-3 (headers) + colonnes A-D (vehicule) — 3 mars 2026
- [x] Import Excel cree les programmes manquants (pas seulement mise a jour) — 3 mars 2026

## Architecture Notes
- Frontend: Expo/React Native Web, pre-built to /app/frontend/dist, served by Python HTTP server
- Backend: FastAPI on port 8001
- IMPORTANT: Changes to frontend require rebuild via `npx expo export --platform web` + restart expo supervisor
- Async extraction: POST /api/extract-pdf-async (returns task_id) + GET /api/extract-task/{task_id} (polling)
- MongoDB collection `extract_tasks` tracks async extraction task status
- Excel format: Row 1 = title, Row 2 = category headers, Row 3 = column headers, Row 4+ = data
- Columns: A-D (vehicle), E (opt1 cash), F-K (opt1 rates), L (opt2 cash), M-R (opt2 rates), S (bonus)

## Backlog
- (P1) Creer UI admin pour gestion des corrections sauvegardees (voir/supprimer via /api/corrections)
- (P2) Refactorer index.tsx (3600+ lignes)
- (P2) Refactorer inventory.tsx
