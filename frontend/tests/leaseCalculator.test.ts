/**
 * Rabais de location : avant taxes (Lease Cash) et après taxes (Bonus Cash).
 */
import { bonusBeforeTax, computeNetCapCost, findRateEntry, leaseCashFor, LeaseInputs } from '../utils/leaseCalculator';

const base: LeaseInputs = {
  price: 50000, pdsf: 52000, leaseCash: 0, rate: 5.99, term: 48, residualPct: 50,
  fraisDossier: 0, totalAccessoires: 0, rabaisConcess: 0, soldeReporte: 0,
  tradeValue: 0, tradeOwed: 0, comptant: 0, bonusCash: 0,
};

describe('Rabais de location', () => {
  test('le Lease Cash (avant taxes) réduit le montant financé de sa pleine valeur', () => {
    expect(computeNetCapCost({ ...base, leaseCash: 1000 })).toBeCloseTo(49000, 2);
  });

  test('le Bonus Cash (après taxes) est ramené avant taxes', () => {
    expect(bonusBeforeTax(1149.75)).toBeCloseTo(1000, 2);
    expect(computeNetCapCost({ ...base, bonusCash: 1149.75 })).toBeCloseTo(49000, 2);
  });

  test('taux standard : Lease Cash + Lease Cash du taux standard', () => {
    const entry = { lease_cash: 3500, standard_rate_lease_cash: 1000, alt_lease_cash: 8000 };
    expect(leaseCashFor(entry, 'standard')).toBe(4500);
  });

  test('taux alternatif : Alternative Lease Cash seulement', () => {
    const entry = { lease_cash: 3500, standard_rate_lease_cash: 1000, alt_lease_cash: 8000 };
    expect(leaseCashFor(entry, 'alternative')).toBe(8000);
    expect(leaseCashFor({ lease_cash: 3500 }, 'alternative')).toBe(0);
    expect(leaseCashFor(null, 'standard')).toBe(0);
  });
});

describe('Ligne de location d\'un programme d\'achat', () => {
  const row = (model: string, brand = 'Jeep') => ({ brand, model });
  const rows = [
    row('Wrangler 2-Door (JL) (JLJL72) (non Rubicon models)'),
    row('Wrangler 4-Door Sport, Sport S (JLJL74 2*B, 2*S)'),
    row('Wrangler 4-Door Willys (JLJL74 2*W), Sahara'),
    row('Wrangler 4-Door Rubicon/Rubicon X (JLJS74) (excludes Rubicon w/ 2.0L (JLJS74 22R))'),
    row('Wrangler 4-Door 392 (JLJX74)'),
    row('Ram 1500 Big Horn (DT6H91)', 'Ram'),
    row('Ram 1500 Big Horn (excludes DT6H91)', 'Ram'),
    row('Ram 2500/3500 Gas Models (excl Chassis Cab Models)', 'Ram'),
  ];

  test('une version exclue ne prend pas la ligne d\'un autre modèle', () => {
    const entry = findRateEntry(rows, 'Jeep', 'Wrangler', '4-Door (JL) (JLJL74) (non Sahara, Rubicon, 392 models)');
    expect(entry.model).toBe('Wrangler 4-Door Sport, Sport S (JLJL74 2*B, 2*S)');
  });

  test('même nom : la ligne avec le code, pas celle qui l\'exclut', () => {
    expect(findRateEntry(rows, 'Ram', '1500', 'Big Horn (DT6H91)').model).toBe('Ram 1500 Big Horn (DT6H91)');
    expect(findRateEntry(rows, 'Ram', '1500', 'Big Horn (excludes DT6H91)').model).toBe('Ram 1500 Big Horn (excludes DT6H91)');
  });

  test('un modèle nommé seulement dans une exclusion n\'a pas de ligne', () => {
    expect(findRateEntry(rows, 'Ram', 'Chassis Cab', '')).toBeNull();
  });
});
