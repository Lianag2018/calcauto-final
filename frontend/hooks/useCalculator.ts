import { useCallback, useEffect, useState } from 'react';
import { FinancingRates, VehicleProgram, LocalResult } from '../types/calculator';

// Taux de taxe QC: 5% TPS + 9.975% TVQ
const TAUX_TAXE = 0.14975;

/**
 * Calcul du paiement mensuel de financement (formule PMT standard)
 */
export function calculateMonthlyPayment(principal: number, annualRate: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  if (annualRate === 0) return principal / months;
  const monthlyRate = annualRate / 100 / 12;
  return principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
}

/**
 * Obtenir le taux pour un terme donné
 */
export function getRateForTerm(rates: FinancingRates | null | undefined, term: number): number {
  if (!rates) return 0;
  const rateMap: { [key: number]: number } = {
    24: (rates as any).rate_24,  // véhicules d'occasion seulement
    36: rates.rate_36,
    48: rates.rate_48,
    60: rates.rate_60,
    72: rates.rate_72,
    84: rates.rate_84,
    96: rates.rate_96,
  };
  return rateMap[term] ?? 0;
}

/**
 * Formater en devise canadienne (sans décimales)
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Formater en devise canadienne (avec décimales)
 */
export function formatCurrencyDecimal(value: number): string {
  return new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  }).format(value);
}

interface CalculatorInputs {
  selectedProgram: VehicleProgram | null;
  vehiclePrice: string;
  selectedTerm: number;
  customBonusCash: string;
  comptantTxInclus: string;
  fraisDossier: string;
  taxePneus: string;
  fraisRDPRM: string;
  prixEchange: string;
  montantDuEchange: string;
  accessories: Array<{ description: string; price: string }>;
  rabaisConcess: string;
  loyaltyRate?: number;
  /** Prime de fidélité (après taxes) quand le vendeur a coché que le client y a droit. */
  loyaltyBonus?: number;
  /** Promotions cochées qui réduisent le prix AVANT taxes (les deux options). */
  offersBeforeTax?: number;
  deferredPayment?: boolean;
  soldeReporteLocation?: string;
}

/**
 * Hook principal de calcul de financement
 * Extrait la logique pure de calcul de index.tsx
 */
/** Prime utilisée par le calcul : le montant tapé à la main s'il y en a un (0 compris), sinon celle du programme. */
export function resolveBonus(typed: string, programBonus: number): number {
  const value = parseFloat(typed);
  return (typed || '').trim() !== '' && !isNaN(value) && value >= 0 ? value : programBonus;
}

/** Promotions à cocher d'un programme. Les anciennes données n'ont que la prime de fidélité. */
export function offersOf(program: any): any[] {
  if (!program) return [];
  if (Array.isArray(program.special_offers)) return program.special_offers.filter((o: any) => o && o.amount > 0);
  const loyalty = program.loyalty_bonus_cash || 0;
  return loyalty > 0 ? [{
    code: program.loyalty_bonus_cash_program?.code || 'loyalty',
    name: program.loyalty_bonus_cash_program?.name || 'Loyalty Bonus Cash',
    kind: 'loyalty', tax: 'after', amount: loyalty, sale_types: ['1', 'L', 'E'],
  }] : [];
}

/** Clé d'une promotion à l'écran : un code peut servir à deux promotions d'un même mois. */
export function offerKey(offer: any): string {
  return `${offer.code}|${offer.tax}|${offer.amount}`;
}

/** Total des promotions cochées d'un type de taxe, pour l'achat ('E') ou la location ('L'). */
export function checkedOffersTotal(offers: any[], checked: Record<string, boolean>, tax: 'before' | 'after', sale: 'E' | 'L'): number {
  return offers
    .filter(o => o.tax === tax && checked[offerKey(o)])
    .filter(o => !o.sale_types?.length || o.sale_types.includes(sale) || (sale === 'E' && o.sale_types.includes('1')))
    .reduce((sum, o) => sum + (o.amount || 0), 0);
}

export function useCalculator(inputs: CalculatorInputs) {
  const [localResult, setLocalResult] = useState<LocalResult | null>(null);

  const {
    selectedProgram, vehiclePrice, selectedTerm, customBonusCash,
    comptantTxInclus, fraisDossier, taxePneus, fraisRDPRM,
    prixEchange, montantDuEchange, accessories, rabaisConcess,
    loyaltyRate = 0,
    loyaltyBonus = 0,
    offersBeforeTax = 0,
    deferredPayment = false,
    soldeReporteLocation = '',
  } = inputs;

  const calculateForTerm = useCallback(() => {
    if (!selectedProgram || !vehiclePrice) {
      setLocalResult(null);
      return;
    }

    const price = parseFloat(vehiclePrice);
    if (isNaN(price) || price <= 0) {
      setLocalResult(null);
      return;
    }

    const bonusCash = resolveBonus(customBonusCash, selectedProgram.bonus_cash || 0) + loyaltyBonus;
    const consumerCash = selectedProgram.consumer_cash;
    const comptant = parseFloat(comptantTxInclus) || 0;
    const rabais = parseFloat(rabaisConcess) || 0;

    // Frais taxables
    const dossier = parseFloat(fraisDossier) || 0;
    const pneus = parseFloat(taxePneus) || 0;
    const rdprm = parseFloat(fraisRDPRM) || 0;
    const fraisTaxables = dossier + pneus + rdprm;

    // Echange
    const valeurEchange = parseFloat(prixEchange) || 0;
    const detteSurEchange = parseFloat(montantDuEchange) || 0;
    const echangeNet = valeurEchange - detteSurEchange;

    // Accessoires
    const totalAccessoires = accessories.reduce((sum, acc) => sum + (parseFloat(acc.price) || 0), 0);

    // Solde reporté location (taxable - s'ajoute au prix avant taxes)
    const soldeReporte = parseFloat(soldeReporteLocation) || 0;

    // Option 1: Prix + Accessoires + Solde reporté - Consumer Cash - Rabais concess. - valeur echange + frais + dette echange + taxes - comptant - bonus cash
    const montantAvantTaxesO1 = price + totalAccessoires + soldeReporte - consumerCash - offersBeforeTax - rabais - valeurEchange + fraisTaxables;
    const taxesO1 = montantAvantTaxesO1 * TAUX_TAXE;
    const principalOption1Brut = montantAvantTaxesO1 + taxesO1 + detteSurEchange;
    const principalOption1 = principalOption1Brut - comptant - bonusCash;
    const rate1 = Math.max(0, getRateForTerm(selectedProgram.option1_rates, selectedTerm) - loyaltyRate);

    // 90 jours sans paiement: capitalise 2 mois d'intérêts (éligible ≤ 84 mois seulement)
    const canDefer = deferredPayment && selectedTerm <= 84;
    const monthlyRate1 = rate1 / 100 / 12;
    const deferredPrincipal1 = canDefer && monthlyRate1 > 0
      ? Math.max(0, principalOption1) * Math.pow(1 + monthlyRate1, 2)
      : Math.max(0, principalOption1);
    const deferredInterest1 = canDefer ? deferredPrincipal1 - Math.max(0, principalOption1) : 0;

    const monthly1 = calculateMonthlyPayment(deferredPrincipal1, rate1, selectedTerm);
    const biweekly1 = monthly1 * 12 / 26;
    const weekly1 = monthly1 * 12 / 52;
    const total1 = monthly1 * selectedTerm;

    let monthly2: number | null = null;
    let biweekly2: number | null = null;
    let weekly2: number | null = null;
    let total2: number | null = null;
    let rate2: number | null = null;
    let bestOption: string | null = null;
    let savings = 0;

    // Option 2: Prix + Solde reporté - Alternative Consumer Cash - Rabais concess. - valeur echange + frais + dette echange + taxes - comptant - bonus cash
    const altConsumerCash = selectedProgram.alternative_consumer_cash || 0;
    const montantAvantTaxesO2 = price + totalAccessoires + soldeReporte - altConsumerCash - offersBeforeTax - rabais - valeurEchange + fraisTaxables;
    const taxesO2 = montantAvantTaxesO2 * TAUX_TAXE;
    const principalOption2Brut = montantAvantTaxesO2 + taxesO2 + detteSurEchange;
    // La prime (Bonus Cash, après taxes) se combine aussi avec l'option 2.
    const principalOption2 = principalOption2Brut - comptant - bonusCash;

    if (selectedProgram.option2_rates) {
      rate2 = Math.max(0, getRateForTerm(selectedProgram.option2_rates, selectedTerm) - loyaltyRate);

      // 90 jours sans paiement pour Option 2 aussi
      const monthlyRate2 = rate2 / 100 / 12;
      const deferredPrincipal2 = canDefer && monthlyRate2 > 0
        ? Math.max(0, principalOption2) * Math.pow(1 + monthlyRate2, 2)
        : Math.max(0, principalOption2);

      monthly2 = calculateMonthlyPayment(deferredPrincipal2, rate2, selectedTerm);
      biweekly2 = monthly2 * 12 / 26;
      weekly2 = monthly2 * 12 / 52;
      total2 = monthly2 * selectedTerm;

      if (total1 < total2) {
        bestOption = '1';
        savings = total2 - total1;
      } else if (total2 < total1) {
        bestOption = '2';
        savings = total1 - total2;
      } else {
        bestOption = '1';
        savings = 0;
      }
      // Pas d'option 1 dans le programme : il n'y a rien à comparer
      if (!selectedProgram.option1_rates) {
        bestOption = '2';
        savings = 0;
      }
    }

    setLocalResult({
      option1Monthly: monthly1,
      option1Biweekly: biweekly1,
      option1Weekly: weekly1,
      option1Total: total1,
      option1Rate: rate1,
      option2Monthly: monthly2,
      option2Biweekly: biweekly2,
      option2Weekly: weekly2,
      option2Total: total2,
      option2Rate: rate2,
      bestOption,
      savings,
      principalOption1,
      principalOption2,
      fraisTaxables,
      taxes: taxesO1,
      echangeNet,
      comptant,
      bonusCash,
      deferredInterest: deferredInterest1,
      deferredActive: canDefer,
      soldeReporte,
    });
  }, [selectedProgram, vehiclePrice, selectedTerm, customBonusCash, comptantTxInclus, fraisDossier, taxePneus, fraisRDPRM, prixEchange, montantDuEchange, accessories, rabaisConcess, loyaltyRate, loyaltyBonus, offersBeforeTax, deferredPayment, soldeReporteLocation]);

  useEffect(() => {
    calculateForTerm();
  }, [calculateForTerm]);

  return { localResult, calculateForTerm };
}
