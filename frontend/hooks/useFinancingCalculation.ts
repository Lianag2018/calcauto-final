/**
 * useFinancingCalculation - Hook pour les calculs de financement
 * 
 * Contient toute la logique métier de calcul:
 * - Paiement mensuel/bi-hebdo/hebdo
 * - Principal avec taxes
 * - Comparaison options
 * - Échange et comptant
 */

import { useMemo, useCallback } from 'react';

// Types
export interface FinancingRates {
  rate_36: number;
  rate_48: number;
  rate_60: number;
  rate_72: number;
  rate_84: number;
  rate_96: number;
}

export interface CalculationParams {
  vehiclePrice: number;
  consumerCash: number;
  bonusCash: number;
  option1Rates: FinancingRates;
  option2Rates: FinancingRates | null;
  term: number;
  comptant: number;
  fraisDossier: number;
  taxePneus: number;
  fraisRDPRM: number;
  prixEchange: number;
  montantDuEchange: number;
}

export interface CalculationResult {
  option1Monthly: number;
  option1Biweekly: number;
  option1Weekly: number;
  option1Total: number;
  option1Rate: number;
  option2Monthly: number | null;
  option2Biweekly: number | null;
  option2Weekly: number | null;
  option2Total: number | null;
  option2Rate: number | null;
  bestOption: '1' | '2' | null;
  savings: number;
  principalOption1: number;
  principalOption2: number;
  fraisTaxables: number;
  taxes: number;
  echangeNet: number;
  comptant: number;
  bonusCash: number;
}

// Taux de taxe Québec (TPS + TVQ)
const TAUX_TAXE = 0.14975; // 5% TPS + 9.975% TVQ

/**
 * Récupère le taux d'intérêt pour une durée donnée
 */
export const getRateForTerm = (rates: FinancingRates, term: number): number => {
  const rateKey = `rate_${term}` as keyof FinancingRates;
  return rates[rateKey] ?? rates.rate_72;
};

/**
 * Calcule le paiement mensuel avec formule d'amortissement
 */
export const calculateMonthlyPayment = (
  principal: number,
  annualRate: number,
  months: number
): number => {
  if (principal <= 0 || months <= 0) return 0;
  if (annualRate === 0) return principal / months;
  
  const monthlyRate = annualRate / 100 / 12;
  return (
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, months))) /
    (Math.pow(1 + monthlyRate, months) - 1)
  );
};

/**
 * Calcule le paiement bi-hebdomadaire à partir du mensuel
 */
export const calculateBiweeklyPayment = (monthly: number): number => {
  return monthly * 12 / 26; // 26 paiements par an
};

/**
 * Calcule le paiement hebdomadaire à partir du mensuel
 */
export const calculateWeeklyPayment = (monthly: number): number => {
  return monthly * 12 / 52; // 52 paiements par an
};

/**
 * Hook principal pour les calculs de financement
 */
export function useFinancingCalculation(params: CalculationParams | null): CalculationResult | null {
  return useMemo(() => {
    if (!params) return null;
    
    const {
      vehiclePrice,
      consumerCash,
      bonusCash,
      option1Rates,
      option2Rates,
      term,
      comptant,
      fraisDossier,
      taxePneus,
      fraisRDPRM,
      prixEchange,
      montantDuEchange,
    } = params;
    
    if (vehiclePrice <= 0) return null;
    
    // Frais taxables
    const fraisTaxables = fraisDossier + taxePneus + fraisRDPRM;
    
    // Échange net
    const echangeNet = prixEchange - montantDuEchange;
    
    // === OPTION 1: Avec Consumer Cash et Bonus Cash ===
    // Montant avant taxes = prix - consumer cash - valeur échange + frais
    const montantAvantTaxesO1 = vehiclePrice - consumerCash - prixEchange + fraisTaxables;
    const taxesO1 = montantAvantTaxesO1 * TAUX_TAXE;
    
    // Principal = montant + taxes + dette échange - comptant - bonus cash
    const principalOption1Brut = montantAvantTaxesO1 + taxesO1 + montantDuEchange;
    const principalOption1 = Math.max(0, principalOption1Brut - comptant - bonusCash);
    
    // Taux et paiements Option 1
    const rate1 = getRateForTerm(option1Rates, term);
    const monthly1 = calculateMonthlyPayment(principalOption1, rate1, term);
    const biweekly1 = calculateBiweeklyPayment(monthly1);
    const weekly1 = calculateWeeklyPayment(monthly1);
    const total1 = monthly1 * term;
    
    // === OPTION 2: Sans Consumer Cash ni Bonus (taux réduit) ===
    let monthly2: number | null = null;
    let biweekly2: number | null = null;
    let weekly2: number | null = null;
    let total2: number | null = null;
    let rate2: number | null = null;
    let bestOption: '1' | '2' | null = null;
    let savings = 0;
    
    if (option2Rates) {
      // Montant avant taxes = prix complet - valeur échange + frais
      const montantAvantTaxesO2 = vehiclePrice - prixEchange + fraisTaxables;
      const taxesO2 = montantAvantTaxesO2 * TAUX_TAXE;
      
      // Principal = montant + taxes + dette échange - comptant (pas de bonus)
      const principalOption2Brut = montantAvantTaxesO2 + taxesO2 + montantDuEchange;
      const principalOption2 = Math.max(0, principalOption2Brut - comptant);
      
      rate2 = getRateForTerm(option2Rates, term);
      monthly2 = calculateMonthlyPayment(principalOption2, rate2, term);
      biweekly2 = calculateBiweeklyPayment(monthly2);
      weekly2 = calculateWeeklyPayment(monthly2);
      total2 = monthly2 * term;
      
      // Comparaison
      if (total1 < total2) {
        bestOption = '1';
        savings = total2 - total1;
      } else if (total2 < total1) {
        bestOption = '2';
        savings = total1 - total2;
      } else {
        bestOption = '1'; // Égalité, préférer option avec rabais
        savings = 0;
      }
    }
    
    return {
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
      principalOption2: option2Rates 
        ? Math.max(0, (vehiclePrice - prixEchange + fraisTaxables) * (1 + TAUX_TAXE) + montantDuEchange - comptant)
        : 0,
      fraisTaxables,
      taxes: taxesO1,
      echangeNet,
      comptant,
      bonusCash,
    };
  }, [params]);
}

/**
 * Hook pour formater les montants en devise canadienne
 */
export function useCurrencyFormatter() {
  const formatCurrency = useCallback((value: number): string => {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }, []);
  
  const formatCurrencyDecimal = useCallback((value: number): string => {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
    }).format(value);
  }, []);
  
  return { formatCurrency, formatCurrencyDecimal };
}

export default useFinancingCalculation;
