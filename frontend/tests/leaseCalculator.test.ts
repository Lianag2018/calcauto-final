/**
 * Rabais de location : avant taxes (Lease Cash) et après taxes (Bonus Cash).
 */
import { bonusBeforeTax, computeNetCapCost, leaseCashFor, LeaseInputs } from '../utils/leaseCalculator';

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
