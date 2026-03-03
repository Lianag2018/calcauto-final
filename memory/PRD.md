# CalcAuto AiPro - PRD

## Problem Statement
Application de gestion de financement et location automobile pour concessionnaires FCA/Stellantis Canada (Québec).

## Completed Features
- [x] Calcul financement Option 1/2 avec alternative_consumer_cash
- [x] Calcul location SCI — moteur refactoré (leaseCalculator.ts) + backend /api/sci/calculate-lease
- [x] Audit Option 1 vs Option 2 — cohérence confirmée
- [x] Import PDF via IA (GPT-4o) avec auto-correction
- [x] Export/Import Excel avec comparaison avant/après + matching flexible
- [x] Mémoire des corrections (P1) — matching flexible, compteur d'application, rapport — 3 mars 2026
- [x] API gestion corrections (GET /api/corrections, DELETE /api/corrections/all)
- [x] Upload multiple PDFs + file d'attente révision
- [x] Force logout après import

## Mémoire des corrections (P1)
- Corrections sauvegardées lors de l'import Excel (program_corrections collection)
- Matching flexible lors de l'import PDF (normalisation noms modèles/trims)
- Compteur `times_applied` et `last_applied_at` pour suivi
- Rapport de corrections appliquées dans la réponse de sauvegarde
- Endpoints: GET /api/corrections, DELETE /api/corrections/{brand}/{model}/{year}, DELETE /api/corrections/all

## Backlog
- (P2) Refactorer index.tsx (3700+ lignes)
- (P2) Refactorer inventory.tsx
