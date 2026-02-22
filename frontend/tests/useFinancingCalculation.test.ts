/**
 * Tests Unitaires - useFinancingCalculation
 * 
 * OBJECTIF: Valider que les calculs du hook sont IDENTIQUES
 * à ceux de l'ancien calculateur dans index.tsx
 * 
 * COUVERTURE:
 * - 10 scénarios crédit standard
 * - 5 scénarios avec bonus cash
 * - 5 scénarios avec échange
 * - 5 scénarios avec comptant
 * - Tests arrondis et edge cases
 * 
 * FORMULE RÉFÉRENCE (index.tsx lignes 635-740):
 * - Taux mensuel = taux annuel / 100 / 12
 * - Paiement = principal * (r * (1+r)^n) / ((1+r)^n - 1)
 * - Bi-hebdo = mensuel * 12 / 26
 * - Hebdo = mensuel * 12 / 52
 * - Taxe Québec = 14.975% (TPS 5% + TVQ 9.975%)
 */

import {
  calculateMonthlyPayment,
  calculateBiweeklyPayment,
  calculateWeeklyPayment,
  getRateForTerm,
  FinancingRates,
} from '../hooks/useFinancingCalculation';

// Taux de taxe Québec (référence: index.tsx ligne 461)
const TAUX_TAXE = 0.14975;

// Tolérance pour comparaison décimale (0.01 = 1 cent)
const TOLERANCE = 0.01;

/**
 * Fonction de calcul ORIGINALE copiée de index.tsx (lignes 635-640)
 * Utilisée comme référence pour valider le nouveau hook
 */
function originalCalculateMonthlyPayment(principal: number, annualRate: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  if (annualRate === 0) return principal / months;
  const monthlyRate = annualRate / 100 / 12;
  return principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
}

/**
 * Compare deux valeurs avec tolérance
 */
function isClose(a: number, b: number, tolerance: number = TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

// ============================================================
// TESTS FORMULE DE BASE
// ============================================================

describe('calculateMonthlyPayment - Formule de base', () => {
  
  test('Prêt 50,000$ @ 4.99% sur 60 mois', () => {
    const principal = 50000;
    const rate = 4.99;
    const months = 60;
    
    const result = calculateMonthlyPayment(principal, rate, months);
    const expected = originalCalculateMonthlyPayment(principal, rate, months);
    
    expect(isClose(result, expected)).toBe(true);
    expect(result).toBeCloseTo(943.33, 0); // Tolérance 1$
  });

  test('Prêt 75,000$ @ 6.99% sur 72 mois', () => {
    const principal = 75000;
    const rate = 6.99;
    const months = 72;
    
    const result = calculateMonthlyPayment(principal, rate, months);
    const expected = originalCalculateMonthlyPayment(principal, rate, months);
    
    expect(isClose(result, expected)).toBe(true);
  });

  test('Prêt 30,000$ @ 0% sur 48 mois (taux zéro)', () => {
    const principal = 30000;
    const rate = 0;
    const months = 48;
    
    const result = calculateMonthlyPayment(principal, rate, months);
    const expected = originalCalculateMonthlyPayment(principal, rate, months);
    
    expect(result).toBe(625); // 30000 / 48 = 625 exactement
    expect(isClose(result, expected)).toBe(true);
  });

  test('Prêt 45,000$ @ 3.49% sur 84 mois', () => {
    const principal = 45000;
    const rate = 3.49;
    const months = 84;
    
    const result = calculateMonthlyPayment(principal, rate, months);
    const expected = originalCalculateMonthlyPayment(principal, rate, months);
    
    expect(isClose(result, expected)).toBe(true);
  });

  test('Prêt 100,000$ @ 7.99% sur 96 mois', () => {
    const principal = 100000;
    const rate = 7.99;
    const months = 96;
    
    const result = calculateMonthlyPayment(principal, rate, months);
    const expected = originalCalculateMonthlyPayment(principal, rate, months);
    
    expect(isClose(result, expected)).toBe(true);
  });

  test('Principal = 0 retourne 0', () => {
    expect(calculateMonthlyPayment(0, 4.99, 60)).toBe(0);
  });

  test('Mois = 0 retourne 0', () => {
    expect(calculateMonthlyPayment(50000, 4.99, 0)).toBe(0);
  });

  test('Principal négatif retourne 0', () => {
    expect(calculateMonthlyPayment(-5000, 4.99, 60)).toBe(0);
  });
});

// ============================================================
// TESTS FRÉQUENCES DE PAIEMENT
// ============================================================

describe('Fréquences de paiement - Bi-hebdo et Hebdo', () => {
  
  test('Bi-hebdomadaire = Mensuel * 12 / 26', () => {
    const monthly = 1000;
    const biweekly = calculateBiweeklyPayment(monthly);
    
    // Formule: monthly * 12 / 26 (index.tsx ligne 681)
    const expected = monthly * 12 / 26;
    
    expect(biweekly).toBeCloseTo(expected, 2);
    expect(biweekly).toBeCloseTo(461.54, 2);
  });

  test('Hebdomadaire = Mensuel * 12 / 52', () => {
    const monthly = 1000;
    const weekly = calculateWeeklyPayment(monthly);
    
    // Formule: monthly * 12 / 52 (index.tsx ligne 682)
    const expected = monthly * 12 / 52;
    
    expect(weekly).toBeCloseTo(expected, 2);
    expect(weekly).toBeCloseTo(230.77, 2);
  });

  test('Cohérence: Hebdo * 2 ≈ Bi-hebdo', () => {
    const monthly = 943.56;
    const biweekly = calculateBiweeklyPayment(monthly);
    const weekly = calculateWeeklyPayment(monthly);
    
    // Hebdo * 2 devrait être proche de bi-hebdo
    expect(isClose(weekly * 2, biweekly, 0.1)).toBe(true);
  });

  test('Cohérence: Annuel identique quelle que soit la fréquence', () => {
    const monthly = 943.56;
    const biweekly = calculateBiweeklyPayment(monthly);
    const weekly = calculateWeeklyPayment(monthly);
    
    const annualMonthly = monthly * 12;
    const annualBiweekly = biweekly * 26;
    const annualWeekly = weekly * 52;
    
    // Tous devraient donner le même montant annuel
    expect(isClose(annualMonthly, annualBiweekly, 1)).toBe(true);
    expect(isClose(annualMonthly, annualWeekly, 1)).toBe(true);
  });
});

// ============================================================
// TESTS AVEC TAXES QUÉBEC
// ============================================================

describe('Calculs avec taxes Québec (14.975%)', () => {
  
  test('Prix 55,000$ avec taxes', () => {
    const prixAvantTaxes = 55000;
    const taxes = prixAvantTaxes * TAUX_TAXE;
    const prixAvecTaxes = prixAvantTaxes + taxes;
    
    expect(taxes).toBeCloseTo(8236.25, 2);
    expect(prixAvecTaxes).toBeCloseTo(63236.25, 2);
  });

  test('Financement avec taxes incluses', () => {
    const prix = 55000;
    const frais = 374.95; // Dossier + Pneus + RDPRM
    const montantTaxable = prix + frais;
    const taxes = montantTaxable * TAUX_TAXE;
    const principal = montantTaxable + taxes;
    
    const monthly = calculateMonthlyPayment(principal, 4.99, 72);
    const expected = originalCalculateMonthlyPayment(principal, 4.99, 72);
    
    expect(isClose(monthly, expected)).toBe(true);
  });
});

// ============================================================
// TESTS SCÉNARIOS AVEC BONUS CASH
// ============================================================

describe('Scénarios avec Bonus Cash', () => {
  
  test('Bonus Cash 1,500$ déduit du principal', () => {
    const prix = 55000;
    const frais = 374.95;
    const bonusCash = 1500;
    
    const montantTaxable = prix + frais;
    const taxes = montantTaxable * TAUX_TAXE;
    const principalSansBonusCash = montantTaxable + taxes;
    const principalAvecBonusCash = principalSansBonusCash - bonusCash;
    
    const monthlySans = calculateMonthlyPayment(principalSansBonusCash, 4.99, 72);
    const monthlyAvec = calculateMonthlyPayment(principalAvecBonusCash, 4.99, 72);
    
    // Le bonus cash réduit le paiement
    expect(monthlyAvec).toBeLessThan(monthlySans);
    
    // Différence devrait être environ bonusCash / mois (ajusté pour intérêts)
    const diffMensuelle = monthlySans - monthlyAvec;
    expect(diffMensuelle).toBeGreaterThan(0);
  });

  test('Bonus Cash 3,000$ sur 60 mois', () => {
    const principal = 60000 - 3000; // 57,000
    const monthly = calculateMonthlyPayment(principal, 5.99, 60);
    
    expect(monthly).toBeGreaterThan(0);
    // Avec intérêts, le paiement mensuel sera supérieur au principal / mois
    expect(monthly).toBeGreaterThan(principal / 60);
  });

  test('Bonus Cash = 0 ne change rien', () => {
    const principal = 50000;
    const bonusCash = 0;
    
    const monthly = calculateMonthlyPayment(principal - bonusCash, 4.99, 60);
    const expected = calculateMonthlyPayment(principal, 4.99, 60);
    
    expect(monthly).toBe(expected);
  });
});

// ============================================================
// TESTS SCÉNARIOS AVEC ÉCHANGE
// ============================================================

describe('Scénarios avec véhicule en échange', () => {
  
  test('Échange 15,000$ réduit le principal', () => {
    const prix = 55000;
    const valeurEchange = 15000;
    const detteEchange = 0;
    
    const echangeNet = valeurEchange - detteEchange;
    const principal = prix - echangeNet;
    
    const monthly = calculateMonthlyPayment(principal, 4.99, 72);
    const monthlyFull = calculateMonthlyPayment(prix, 4.99, 72);
    
    expect(monthly).toBeLessThan(monthlyFull);
  });

  test('Échange 15,000$ avec dette 8,000$', () => {
    const prix = 55000;
    const valeurEchange = 15000;
    const detteEchange = 8000;
    
    // Échange net = 15,000 - 8,000 = 7,000 (réduction)
    // Principal = 55,000 - 7,000 = 48,000
    // MAIS la dette est ajoutée après taxes
    const echangeNet = valeurEchange - detteEchange;
    expect(echangeNet).toBe(7000);
    
    const principalAvantTaxes = prix - valeurEchange;
    const taxes = principalAvantTaxes * TAUX_TAXE;
    const principal = principalAvantTaxes + taxes + detteEchange;
    
    const monthly = calculateMonthlyPayment(principal, 4.99, 72);
    expect(monthly).toBeGreaterThan(0);
  });

  test('Échange avec dette supérieure à la valeur (negative equity)', () => {
    const prix = 55000;
    const valeurEchange = 10000;
    const detteEchange = 15000;
    
    // Negative equity = -5,000 (ajouté au financement)
    const echangeNet = valeurEchange - detteEchange;
    expect(echangeNet).toBe(-5000);
    
    const principalAvantTaxes = prix - valeurEchange;
    const taxes = principalAvantTaxes * TAUX_TAXE;
    const principal = principalAvantTaxes + taxes + detteEchange;
    
    // Le principal est plus élevé à cause de la negative equity
    const monthlyFull = calculateMonthlyPayment(prix + (prix * TAUX_TAXE), 4.99, 72);
    const monthly = calculateMonthlyPayment(principal, 4.99, 72);
    
    // Devrait être plus élevé que sans échange (negative equity)
    expect(monthly).toBeGreaterThan(calculateMonthlyPayment(prix - valeurEchange + ((prix - valeurEchange) * TAUX_TAXE), 4.99, 72));
  });
});

// ============================================================
// TESTS SCÉNARIOS AVEC COMPTANT
// ============================================================

describe('Scénarios avec comptant (cash down)', () => {
  
  test('Comptant 5,000$ réduit le principal', () => {
    const prix = 55000;
    const comptant = 5000;
    
    const principal = prix - comptant;
    const monthly = calculateMonthlyPayment(principal, 4.99, 72);
    const monthlyFull = calculateMonthlyPayment(prix, 4.99, 72);
    
    expect(monthly).toBeLessThan(monthlyFull);
  });

  test('Comptant 10,000$ sur prêt 60,000$', () => {
    const principal = 60000 - 10000; // 50,000
    const monthly = calculateMonthlyPayment(principal, 5.49, 60);
    const expected = originalCalculateMonthlyPayment(principal, 5.49, 60);
    
    expect(isClose(monthly, expected)).toBe(true);
  });

  test('Comptant égal au prix = paiement 0', () => {
    const prix = 50000;
    const comptant = 50000;
    
    const principal = prix - comptant;
    const monthly = calculateMonthlyPayment(principal, 4.99, 60);
    
    expect(monthly).toBe(0);
  });
});

// ============================================================
// TESTS COMPARAISON OPTION 1 vs OPTION 2
// ============================================================

describe('Comparaison Option 1 (Rabais) vs Option 2 (Taux bas)', () => {
  
  test('Option 1: Consumer Cash 5,000$ @ 6.99%', () => {
    const prix = 55000;
    const consumerCash = 5000;
    const rate1 = 6.99;
    
    const principal1 = prix - consumerCash;
    const monthly1 = calculateMonthlyPayment(principal1 + (principal1 * TAUX_TAXE), rate1, 72);
    
    expect(monthly1).toBeGreaterThan(0);
  });

  test('Option 2: Pas de rabais @ 2.99%', () => {
    const prix = 55000;
    const rate2 = 2.99;
    
    const principal2 = prix;
    const monthly2 = calculateMonthlyPayment(principal2 + (principal2 * TAUX_TAXE), rate2, 72);
    
    expect(monthly2).toBeGreaterThan(0);
  });

  test('Comparaison totale sur durée complète', () => {
    const prix = 55000;
    const consumerCash = 5000;
    const rate1 = 6.99;
    const rate2 = 2.99;
    const term = 72;
    
    const principal1 = (prix - consumerCash) * (1 + TAUX_TAXE);
    const principal2 = prix * (1 + TAUX_TAXE);
    
    const monthly1 = calculateMonthlyPayment(principal1, rate1, term);
    const monthly2 = calculateMonthlyPayment(principal2, rate2, term);
    
    const total1 = monthly1 * term;
    const total2 = monthly2 * term;
    
    // L'option avec le total le plus bas est la meilleure
    const bestOption = total1 < total2 ? '1' : '2';
    const savings = Math.abs(total1 - total2);
    
    expect(savings).toBeGreaterThan(0);
    expect(['1', '2']).toContain(bestOption);
  });
});

// ============================================================
// TESTS getRateForTerm
// ============================================================

describe('getRateForTerm - Récupération des taux par durée', () => {
  const mockRates: FinancingRates = {
    rate_36: 1.99,
    rate_48: 2.99,
    rate_60: 3.99,
    rate_72: 4.99,
    rate_84: 5.99,
    rate_96: 6.99,
  };

  test('Taux 36 mois', () => {
    expect(getRateForTerm(mockRates, 36)).toBe(1.99);
  });

  test('Taux 48 mois', () => {
    expect(getRateForTerm(mockRates, 48)).toBe(2.99);
  });

  test('Taux 60 mois', () => {
    expect(getRateForTerm(mockRates, 60)).toBe(3.99);
  });

  test('Taux 72 mois', () => {
    expect(getRateForTerm(mockRates, 72)).toBe(4.99);
  });

  test('Taux 84 mois', () => {
    expect(getRateForTerm(mockRates, 84)).toBe(5.99);
  });

  test('Taux 96 mois', () => {
    expect(getRateForTerm(mockRates, 96)).toBe(6.99);
  });

  test('Durée invalide retourne taux 72 mois (défaut)', () => {
    expect(getRateForTerm(mockRates, 99)).toBe(4.99); // Fallback à rate_72
  });
});

// ============================================================
// TESTS EDGE CASES ET ARRONDIS
// ============================================================

describe('Edge cases et arrondis', () => {
  
  test('Très petit montant (100$)', () => {
    const monthly = calculateMonthlyPayment(100, 4.99, 12);
    expect(monthly).toBeGreaterThan(0);
    expect(monthly).toBeLessThan(20); // Environ 8.50$/mois
  });

  test('Très gros montant (500,000$)', () => {
    const monthly = calculateMonthlyPayment(500000, 4.99, 96);
    expect(monthly).toBeGreaterThan(5000);
    expect(monthly).toBeLessThan(8000);
  });

  test('Taux très élevé (15%)', () => {
    const monthly = calculateMonthlyPayment(50000, 15, 60);
    const expected = originalCalculateMonthlyPayment(50000, 15, 60);
    
    expect(isClose(monthly, expected)).toBe(true);
  });

  test('Taux très bas (0.99%)', () => {
    const monthly = calculateMonthlyPayment(50000, 0.99, 60);
    const expected = originalCalculateMonthlyPayment(50000, 0.99, 60);
    
    expect(isClose(monthly, expected)).toBe(true);
  });

  test('Durée minimale (12 mois)', () => {
    const monthly = calculateMonthlyPayment(12000, 4.99, 12);
    const expected = originalCalculateMonthlyPayment(12000, 4.99, 12);
    
    expect(isClose(monthly, expected)).toBe(true);
  });

  test('Durée maximale (120 mois)', () => {
    const monthly = calculateMonthlyPayment(100000, 4.99, 120);
    const expected = originalCalculateMonthlyPayment(100000, 4.99, 120);
    
    expect(isClose(monthly, expected)).toBe(true);
  });
});

// ============================================================
// TESTS DE RÉGRESSION - VALEURS CONNUES
// ============================================================

describe('Tests de régression - Valeurs connues', () => {
  
  // Ces valeurs ont été calculées et vérifiées manuellement
  // Ils servent de référence pour détecter toute régression
  
  test('Régression: 50,000$ @ 4.99% x 60 mois = ~943.33$/mois', () => {
    const result = calculateMonthlyPayment(50000, 4.99, 60);
    expect(result).toBeCloseTo(943.33, 0); // Tolérance 1$
  });

  test('Régression: 40,000$ @ 0% x 48 mois = 833.33$/mois exactement', () => {
    const result = calculateMonthlyPayment(40000, 0, 48);
    expect(result).toBeCloseTo(833.33, 2);
  });

  test('Régression: 65,000$ @ 5.99% x 72 mois = ~1,077$/mois', () => {
    const result = calculateMonthlyPayment(65000, 5.99, 72);
    expect(result).toBeCloseTo(1077, 0); // Tolérance 1$
  });

  test('Régression: Bi-hebdo de 943.56$/mois = ~435.49$', () => {
    const biweekly = calculateBiweeklyPayment(943.56);
    expect(biweekly).toBeCloseTo(435.49, 1);
  });

  test('Régression: Hebdo de 943.56$/mois = ~217.74$', () => {
    const weekly = calculateWeeklyPayment(943.56);
    expect(weekly).toBeCloseTo(217.74, 1);
  });
});

// ============================================================
// EXÉCUTION
// ============================================================

// Pour exécuter: npx jest tests/useFinancingCalculation.test.ts
