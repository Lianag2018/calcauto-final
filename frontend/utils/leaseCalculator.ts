/**
 * Moteur de calcul Location SCI Québec
 * Méthode: Annuité en avance (paiement début de période)
 * Validé le 2 mars 2026 — match parfait avec formules SCI
 */

// Constantes fiscales Québec
const TPS = 0.05;
const TVQ = 0.09975;
const TAUX_TAXE = TPS + TVQ; // 14.975%

// === Types ===

export interface LeaseInputs {
  price: number;            // Prix de vente
  pdsf: number;             // PDSF (MSRP) pour calcul résiduel
  leaseCash: number;        // Lease cash (rabais location)
  rate: number;             // Taux annuel en %
  term: number;             // Terme en mois
  residualPct: number;      // % résiduel ajusté (incluant km adjustment)
  fraisDossier: number;     // Frais de dossier
  totalAccessoires: number; // Total accessoires
  rabaisConcess: number;    // Rabais concessionnaire
  soldeReporte: number;     // Solde reporté (négatif = dette)
  tradeValue: number;       // Valeur échange
  tradeOwed: number;        // Montant dû sur échange
  comptant: number;         // Comptant taxes incluses
  bonusCash: number;        // Bonus cash (après taxes, taxes incluses)
}

export interface LeaseResult {
  monthly: number;
  biweekly: number;
  weekly: number;
  monthlyBeforeTax: number;
  weeklyBeforeTax: number;
  biweeklyBeforeTax: number;
  total: number;
  rate: number;
  netCapCost: number;
  residualValue: number;
  leaseCash: number;
  capCost: number;
  tpsOnPayment: number;
  tvqOnPayment: number;
  creditTaxeParMois: number;
  creditPerdu: number;
  pdsf: number;
  rabaisConcess: number;
  coutEmprunt: number;
  fraisDossierOnly: number;
}

// === Fonctions de calcul ===

/** 1. Coût capitalisé = prix vente + accessoires - rabais concess. + frais dossier - lease cash */
export function computeCapCost(inputs: LeaseInputs): number {
  const sellingPrice = inputs.price + inputs.totalAccessoires - inputs.rabaisConcess;
  return sellingPrice + inputs.fraisDossier - inputs.leaseCash;
}

/** 2. Solde reporté net (positif = ajouter, négatif = dette avec taxes) */
export function computeSoldeNet(soldeReporte: number): number {
  if (soldeReporte < 0) return Math.abs(soldeReporte) * (1 + TAUX_TAXE);
  if (soldeReporte > 0) return soldeReporte;
  return 0;
}

/** Part avant taxes d'un rabais après taxes (Bonus Cash) : le montant annoncé inclut les taxes. */
export function bonusBeforeTax(bonusCash: number): number {
  return bonusCash / (1 + TAUX_TAXE);
}

/** 3. Net cap cost = cap + solde + dû échange - valeur échange - comptant - bonus (ramené avant taxes) */
export function computeNetCapCost(inputs: LeaseInputs): number {
  const capCost = computeCapCost(inputs);
  const soldeNet = computeSoldeNet(inputs.soldeReporte);
  return capCost + soldeNet + inputs.tradeOwed - inputs.tradeValue - inputs.comptant - bonusBeforeTax(inputs.bonusCash);
}

/**
 * Rabais de location (tous avant taxes) selon le taux choisi :
 * taux standard = Lease Cash + Lease Cash du taux standard ; taux alternatif = Alternative Lease Cash.
 */
export function leaseCashFor(rateEntry: any, option: 'standard' | 'alternative'): number {
  if (!rateEntry) return 0;
  if (option === 'alternative') return rateEntry.alt_lease_cash || rateEntry.alternative_lease_cash || 0;
  return (rateEntry.lease_cash || 0) + (rateEntry.standard_rate_lease_cash || 0);
}

/** 4. Valeur résiduelle = PDSF × (% résiduel ajusté / 100) */
export function computeResidual(pdsf: number, adjustedResidualPct: number): number {
  return pdsf * (adjustedResidualPct / 100);
}

/** 5. PMT en avance (formule SCI exacte) */
export function computePMTAdvance(netCapCost: number, residualValue: number, rate: number, term: number): { monthlyBeforeTax: number; financeCharge: number } {
  const monthlyRate = rate / 100 / 12;

  if (monthlyRate === 0) {
    return {
      monthlyBeforeTax: (netCapCost - residualValue) / term,
      financeCharge: 0,
    };
  }

  const factor = Math.pow(1 + monthlyRate, term);
  const pmtArrears = (netCapCost * monthlyRate * factor - residualValue * monthlyRate) / (factor - 1);
  const monthlyBeforeTax = pmtArrears / (1 + monthlyRate);
  const financeCharge = monthlyBeforeTax - (netCapCost - residualValue) / term;

  return { monthlyBeforeTax, financeCharge };
}

/** 6. Taxes QC sur le paiement mensuel */
export function computeTaxesQC(monthlyBeforeTax: number): { tps: number; tvq: number; total: number } {
  const tps = monthlyBeforeTax * TPS;
  const tvq = monthlyBeforeTax * TVQ;
  return { tps, tvq, total: tps + tvq };
}

/** 7. Crédit taxe échange réparti sur les paiements */
export function computeTradeTaxCredit(tradeValue: number, term: number, taxesMensuelles: number): { creditParMois: number; creditPerdu: number } {
  if (tradeValue <= 0) return { creditParMois: 0, creditPerdu: 0 };
  const depreciation = tradeValue / term;
  const creditPotentiel = depreciation * TAUX_TAXE;
  const creditParMois = Math.min(creditPotentiel, taxesMensuelles);
  const creditPerdu = Math.max(0, creditPotentiel - taxesMensuelles);
  return { creditParMois, creditPerdu };
}

/** Calcul complet d'une location SCI (version détaillée) */
export function computeLeasePayment(inputs: LeaseInputs): LeaseResult {
  const capCost = computeCapCost(inputs);
  const netCapCost = computeNetCapCost(inputs);
  const residualValue = computeResidual(inputs.pdsf, inputs.residualPct);
  const { monthlyBeforeTax, financeCharge } = computePMTAdvance(netCapCost, residualValue, inputs.rate, inputs.term);
  const taxes = computeTaxesQC(monthlyBeforeTax);
  const tradeTaxCredit = computeTradeTaxCredit(inputs.tradeValue, inputs.term, taxes.total);

  const monthlyAfterTax = monthlyBeforeTax + taxes.total - tradeTaxCredit.creditParMois;

  return {
    monthly: Math.max(0, monthlyAfterTax),
    biweekly: Math.max(0, monthlyAfterTax * 12 / 26),
    weekly: Math.max(0, monthlyAfterTax * 12 / 52),
    monthlyBeforeTax: Math.max(0, monthlyBeforeTax),
    weeklyBeforeTax: Math.max(0, monthlyBeforeTax * 12 / 52),
    biweeklyBeforeTax: Math.max(0, monthlyBeforeTax * 12 / 26),
    total: Math.max(0, monthlyAfterTax * inputs.term),
    rate: inputs.rate,
    netCapCost: Math.max(0, netCapCost),
    residualValue,
    leaseCash: inputs.leaseCash,
    capCost,
    tpsOnPayment: Math.round(taxes.tps * 100) / 100,
    tvqOnPayment: Math.round(taxes.tvq * 100) / 100,
    creditTaxeParMois: Math.round(tradeTaxCredit.creditParMois * 100) / 100,
    creditPerdu: Math.round(tradeTaxCredit.creditPerdu * 100) / 100,
    pdsf: inputs.pdsf,
    rabaisConcess: inputs.rabaisConcess,
    coutEmprunt: Math.round(financeCharge * inputs.term * 100) / 100,
    fraisDossierOnly: inputs.fraisDossier,
  };
}

/** Calcul simplifié pour la grille meilleur choix (même formule, retour réduit) */
export function computeLeaseForGrid(inputs: LeaseInputs): {
  monthly: number;
  monthlyBeforeTax: number;
  rate: number;
  term: number;
  residualPct: number;
  residualValue: number;
  coutEmprunt: number;
  leaseCash: number;
  kmPerYear: number;
} & { kmPerYear: number } {
  const netCapCost = computeNetCapCost(inputs);
  const residualValue = computeResidual(inputs.pdsf, inputs.residualPct);
  const { monthlyBeforeTax, financeCharge } = computePMTAdvance(netCapCost, residualValue, inputs.rate, inputs.term);
  const taxes = computeTaxesQC(monthlyBeforeTax);
  const tradeTaxCredit = computeTradeTaxCredit(inputs.tradeValue, inputs.term, taxes.total);
  const monthly = monthlyBeforeTax + taxes.total - tradeTaxCredit.creditParMois;

  return {
    monthly: Math.max(0, monthly),
    monthlyBeforeTax: Math.max(0, monthlyBeforeTax),
    rate: inputs.rate,
    term: inputs.term,
    residualPct: inputs.residualPct,
    residualValue,
    coutEmprunt: financeCharge * inputs.term,
    leaseCash: inputs.leaseCash,
    kmPerYear: 0, // sera set par l'appelant
  };
}

// === Matching vehicule ===

export function findResidualVehicle(
  vehicles: any[],
  brand: string,
  model: string,
  trim: string,
  bodyStyle?: string
): any | null {
  const brandLower = brand.toLowerCase();
  const modelLower = model.toLowerCase();
  const trimLower = (trim || '').toLowerCase();
  const bodyStyleLower = (bodyStyle || '').toLowerCase();

  // If trim starts with model name + extra word(s), use extended model for better matching
  // e.g., model="Grand Cherokee", trim="Grand Cherokee L Altitude..." → effectiveModel="grand cherokee l"
  let effectiveModel = modelLower;
  if (trimLower.startsWith(modelLower + ' ')) {
    const extra = trimLower.slice(modelLower.length).trim().split(/[\s(]/)[0];
    if (extra && extra.length >= 1 && extra.length <= 5) {
      effectiveModel = modelLower + ' ' + extra;
    }
  }

  // Extract trim keywords for fuzzy matching
  const combined = (trimLower + ' ' + modelLower).replace(/[()]/g, ' ');
  const skipWords = new Set(['cpos', 'grand', 'cherokee', 'ram', 'dodge', 'jeep', 'chrysler', 'fiat', 'all', 'new', 'model', 'models', 'excl', 'excludes', 'excluding', 'with', 'plus']);
  const trimKeywords = combined.split(/[\s,/]+/).filter(w => w.length > 3 && !skipWords.has(w));

  const matchesBrand = (v: any) => v.brand.toLowerCase() === brandLower;

  // Model matching: use effectiveModel first, then fallback to modelLower
  const matchesModelExact = (v: any) => {
    const vm = (v.model_name || '').toLowerCase().trim();
    return vm === effectiveModel;
  };
  const matchesModelLoose = (v: any) => {
    const vm = (v.model_name || '').toLowerCase().trim();
    return vm.startsWith(effectiveModel) || effectiveModel.startsWith(vm);
  };
  // Fallback: original model name (less specific)
  const matchesModelBase = (v: any) => {
    const vm = (v.model_name || '').toLowerCase().trim();
    return vm === modelLower || vm.startsWith(modelLower) || modelLower.startsWith(vm);
  };

  const matchesTrimExact = (v: any) => {
    const vt = (v.trim || '').toLowerCase();
    if (!trimLower) return true;
    return vt.includes(trimLower) || trimLower.includes(vt);
  };

  // When trim contains commas (e.g., "Sport, Rebel"), split into variants
  // and match the FIRST variant with highest priority
  const trimVariants = trimLower.split(/[,\/]/).map((t: string) => t.trim()).filter((t: string) => t.length > 0);
  const primaryTrim = trimVariants[0] || trimLower;

  const matchesTrimPrimary = (v: any) => {
    const vt = (v.trim || '').toLowerCase();
    if (!primaryTrim) return true;
    return vt === primaryTrim || vt.includes(primaryTrim) || primaryTrim.includes(vt);
  };

  const matchesTrimKeyword = (v: any) => {
    const vt = (v.trim || '').toLowerCase();
    const vm = (v.model_name || '').toLowerCase();
    const target = vt + ' ' + vm;
    return trimKeywords.some(kw => target.includes(kw));
  };

  // P0: exact model + body_style + PRIMARY trim (first variant before comma)
  if (bodyStyleLower && trimVariants.length > 1) {
    const match = vehicles.find((v: any) =>
      matchesBrand(v) && matchesModelExact(v) && matchesTrimPrimary(v) &&
      (v.body_style || '').toLowerCase() === bodyStyleLower
    );
    if (match) return match;
  }

  // P1: exact model + body_style + trim
  if (bodyStyleLower) {
    const match = vehicles.find((v: any) =>
      matchesBrand(v) && matchesModelExact(v) && matchesTrimExact(v) &&
      (v.body_style || '').toLowerCase() === bodyStyleLower
    );
    if (match) return match;
  }

  // P1.5: exact model + PRIMARY trim (no body_style)
  if (trimVariants.length > 1) {
    const match = vehicles.find((v: any) =>
      matchesBrand(v) && matchesModelExact(v) && matchesTrimPrimary(v)
    );
    if (match) return match;
  }

  // P2: exact model + exact trim
  const exactBoth = vehicles.find((v: any) =>
    matchesBrand(v) && matchesModelExact(v) && matchesTrimExact(v)
  );
  if (exactBoth) return exactBoth;

  // P3: loose model + exact trim
  const looseTrim = vehicles.find((v: any) =>
    matchesBrand(v) && matchesModelLoose(v) && matchesTrimExact(v)
  );
  if (looseTrim) return looseTrim;

  // P4: exact model + keyword trim
  const exactKw = vehicles.find((v: any) =>
    matchesBrand(v) && matchesModelExact(v) && matchesTrimKeyword(v)
  );
  if (exactKw) return exactKw;

  // P5: loose model + keyword trim
  const looseKw = vehicles.find((v: any) =>
    matchesBrand(v) && matchesModelLoose(v) && matchesTrimKeyword(v)
  );
  if (looseKw) return looseKw;

  // P6: exact model only (no trim)
  const exactOnly = vehicles.find((v: any) =>
    matchesBrand(v) && matchesModelExact(v)
  );
  if (exactOnly) return exactOnly;

  // P7: loose model only (fallback)
  const looseOnly = vehicles.find((v: any) =>
    matchesBrand(v) && matchesModelLoose(v)
  );
  if (looseOnly) return looseOnly;

  // P8: base model (original, less specific) + trim
  const baseTrim = vehicles.find((v: any) =>
    matchesBrand(v) && matchesModelBase(v) && matchesTrimExact(v)
  );
  if (baseTrim) return baseTrim;

  // P9: base model + keyword
  const baseKw = vehicles.find((v: any) =>
    matchesBrand(v) && matchesModelBase(v) && matchesTrimKeyword(v)
  );
  if (baseKw) return baseKw;

  // P10: base model only
  return vehicles.find((v: any) =>
    matchesBrand(v) && matchesModelBase(v)
  ) || null;
}

// === Association programme d'achat -> ligne de location ===

const RATE_STOPWORDS = new Set(['models', 'model', 'all', 'and', 'with', 'w', 'the', 'engine', 'cpos', 'jl', 'new']);

function rateTokens(text: string): string[] {
  return text.toLowerCase().replace(/[()\/,&]/g, ' ').split(/\s+/)
    .filter(t => t && !RATE_STOPWORDS.has(t));
}

/** Sépare ce qu'une ligne couvre de ce qu'elle exclut : « (excludes X, Y) », « (excl …) », « (non …) ». */
function rateConditions(text: string): { positive: Set<string>; excluded: string[][]; positiveText: string } {
  let positive = '';
  const excluded: string[][] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '(') {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '(') depth++;
        else if (text[j] === ')') depth--;
        j++;
      }
      const inner = text.slice(i + 1, depth === 0 ? j - 1 : j);
      const keyword = inner.match(/^\s*(excludes|excluding|excl\.?|non)\s+/i);
      if (keyword) {
        // Éléments séparés par une virgule ou « and », hors parenthèses imbriquées
        const items: string[] = [];
        let level = 0;
        let current = '';
        const body = inner.slice(keyword[0].length);
        for (let k = 0; k < body.length; k++) {
          const ch = body[k];
          if (ch === '(') level++;
          if (ch === ')') level--;
          const isAnd = level === 0 && body.slice(k, k + 5).toLowerCase() === ' and ';
          if (level === 0 && (ch === ',' || isAnd)) {
            items.push(current);
            current = '';
            if (isAnd) k += 4;
          } else {
            current += ch;
          }
        }
        items.push(current);
        items.map(rateTokens).filter(tokens => tokens.length > 0).forEach(tokens => excluded.push(tokens));
      } else {
        positive += '(' + inner + ')';
      }
      i = j;
    } else {
      positive += text[i];
      i++;
    }
  }
  return { positive: new Set(rateTokens(positive)), excluded, positiveText: positive.replace(/\s+/g, ' ').trim() };
}

const rateKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9*]/g, '');

/**
 * Ligne de location d'un programme d'achat, en respectant les exclusions écrites
 * dans les deux noms. null si rien de sûr : l'appelant retombe sur l'ancienne règle.
 */
export function matchRateEntry(vehicleList: any[], brand: string, model: string, trim: string): any | null {
  const brandLower = brand.toLowerCase();
  const stripBrand = (name: string) => name.toLowerCase().startsWith(brandLower + ' ') ? name.slice(brandLower.length + 1) : name;
  const rows = (vehicleList || []).filter((v: any) => (v.brand || '').toLowerCase() === brandLower);
  const wanted = `${stripBrand(model)} ${trim || ''}`;

  // 1. Même nom, à la ponctuation près
  const exact = rows.find((v: any) => rateKey(stripBrand(v.model || '')) === rateKey(wanted));
  if (exact) return exact;

  // 2. Meilleur recoupement de mots, sans jamais prendre une ligne exclue
  const program = rateConditions(wanted);
  const modelTokens = rateTokens(stripBrand(model));
  const covers = (item: string[], positive: Set<string>) => item.every(token => positive.has(token));
  let best: any = null;
  let bestScore = 0;
  for (const row of rows) {
    const candidate = rateConditions(stripBrand(row.model || ''));
    if (!modelTokens.every(token => candidate.positive.has(token))) continue;
    if (program.excluded.some(item => covers(item, candidate.positive))) continue;
    if (candidate.excluded.some(item => covers(item, program.positive))) continue;
    let shared = 0;
    program.positive.forEach(token => { if (candidate.positive.has(token)) shared++; });
    const score = shared - candidate.positive.size * 0.01;
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}

export function findRateEntry(
  vehicleList: any[],
  brand: string,
  model: string,
  trim: string
): any | null {
  const matched = matchRateEntry(vehicleList, brand, model, trim);
  if (matched) return matched;

  const brandLower = brand.toLowerCase();
  const modelLower = model.toLowerCase();
  const trimLower = (trim || '').toLowerCase();

  // Priorité: match modèle + trim
  let entry = vehicleList?.find((v: any) => {
    const vModel = rateConditions(v.model || '').positiveText.toLowerCase();  // sans les exclusions
    const vBrand = v.brand.toLowerCase();
    if (vBrand !== brandLower) return false;
    const hasModel = vModel.includes(modelLower) || modelLower.includes(v.model.toLowerCase());
    if (!hasModel) return false;
    if (!trimLower) return true;
    return vModel.includes(trimLower) || trimLower.split(',').some((t: string) => vModel.includes(t.trim()));
  });

  // Fallback: match modèle seul
  if (!entry) {
    entry = vehicleList?.find((v: any) => {
      const vModel = rateConditions(v.model || '').positiveText.toLowerCase();  // sans les exclusions
      const vBrand = v.brand.toLowerCase();
      if (vBrand !== brandLower) return false;
      return vModel.includes(modelLower) || modelLower.includes(v.model.toLowerCase());
    });
  }

  return entry || null;
}

/** Calcule l'ajustement km pour un terme donné */
export function getKmAdjustment(
  kmAdjustments: any,
  kmPerYear: number,
  term: number
): number {
  if (kmPerYear === 24000 || !kmAdjustments) return 0;
  return kmAdjustments[String(kmPerYear)]?.[String(term)] || 0;
}
