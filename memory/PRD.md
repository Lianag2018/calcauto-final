# CalcAuto AiPro - Product Requirements Document

## Original Problem Statement
Mobile application for auto dealers (Quebec, Stellantis/FCA vehicles) that scans invoices via OCR and calculates financing options. Supports hybrid OCR (Google Vision + GPT-4o), Excel export/import, SMS/email sharing, printing, and SCI lease comparison.

## What's Been Implemented

### Phase 1-24 (Previous sessions)
- Full auth, programs, inventory, CRM, OCR pipeline, Calculator, Excel, SMS, Print, Email, Holdback

### Phase 25 - Location SCI Feature
- Backend: 3 API endpoints (residuals, rates, calculate-lease)
- Frontend: Integrated lease section with km/term selectors, dual comparison cards

### Phase 26 - Lease in SMS/Email/Print
- All sharing channels include lease data when toggled on

### Phase 27 - Corrected Lease Calculation (Feb 25, 2026)
- **PDSF séparé** from selling price (PDSF for residual, selling price for cap cost)
- **Taxes SUR le paiement** (not capitalized) — matches real SCI calculator
- **TPS 5% + TVQ 9.975%** displayed separately on cards
- **Crédit taxe échange** per payment, limited to monthly tax (surplus lost with warning)
- **Solde reporté** field for previous lease balance
- **Frais auto-inclus** (dossier + pneus + RDPRM shown in info bar)
- **Validated against real SCI**: Ram 1500 Express 2026, 42mo, 1.49%
  - My calc: 179.47$/sem before tax vs SCI: 179.48$/sem — **0.01$ diff**

## Lease Calculation Formula (Quebec SCI)
```
1. Cap cost = selling_price + fees - lease_cash
2. Net cap = cap_cost + solde_reporté + montant_dû - échange - comptant - bonus
3. Residual = PDSF × residual% (adjusted for km)
4. Depreciation = (net_cap - residual) / term
5. Finance = (net_cap + residual) × (rate / 2400)
6. Monthly before tax = depreciation + finance
7. TPS = monthly × 5%, TVQ = monthly × 9.975%
8. Trade credit/month = min(échange/term × 14.975%, TPS+TVQ)
9. Monthly after tax = monthly + TPS + TVQ - trade_credit
```

## Prioritized Backlog
### P1
- User validation of all SCI calculations with real deals
- Parser fixes validation

### P2
- Refactor server.py and index.tsx
- Code cleanup

### P3
- All-terms comparison table
- Enhanced reporting
