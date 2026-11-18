/**
 * Rabais de location : avant taxes (Lease Cash) et après taxes (Bonus Cash).
 */
import { computeLeasePayment, computeNetCapCost, findRateEntry, leaseCashFor, LeaseInputs } from '../utils/leaseCalculator';

const base: LeaseInputs = {
  price: 50000, pdsf: 52000, leaseCash: 0, rate: 5.99, term: 48, residualPct: 50,
  fraisDossier: 0, totalAccessoires: 0, rabaisConcess: 0, soldeReporte: 0,
  tradeValue: 0, tradeOwed: 0, comptant: 0, bonusCash: 0,
};

describe('Rabais de location', () => {
  test('le Lease Cash (avant taxes) réduit le montant financé de sa pleine valeur', () => {
    expect(computeNetCapCost({ ...base, leaseCash: 1000 })).toBeCloseTo(49000, 2);
  });

  test('le Bonus Cash (après taxes) réduit le montant financé de sa pleine valeur', () => {
    expect(computeNetCapCost({ ...base, bonusCash: 1500 })).toBeCloseTo(48500, 2);
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

// Chiffres relevés dans TAQ Auto le 17 novembre 2026 (48 mois, 3,99 %, résiduel 47 %, frais 259 $).
describe('Location comparée à TAQ Auto', () => {
  const taq: LeaseInputs = {
    price: 47412, pdsf: 47412, leaseCash: 0, rate: 3.99, term: 48, residualPct: 47,
    fraisDossier: 259, totalAccessoires: 0, rabaisConcess: 0, soldeReporte: 0,
    tradeValue: 0, tradeOwed: 0, comptant: 0, bonusCash: 0,
  };
  const monthly = (extra: Partial<LeaseInputs>) => computeLeasePayment({ ...taq, ...extra }).monthly;

  test('sans rien : 741,65 $', () => {
    expect(monthly({})).toBeCloseTo(741.65, 1);
  });

  test('échange de 10 000 $ : 482,96 $, sans autre crédit de taxe', () => {
    expect(monthly({ tradeValue: 10000 })).toBeCloseTo(482.96, 1);
  });

  test('échange de 10 000 $ avec 4 000 $ dû : 572,96 $', () => {
    expect(monthly({ tradeValue: 10000, tradeOwed: 4000 })).toBeCloseTo(572.96, 1);
  });

  test('solde reporté de 3 000 $, entré en positif ou en négatif : 819,27 $', () => {
    expect(monthly({ soldeReporte: 3000 })).toBeCloseTo(819.27, 1);
    expect(monthly({ soldeReporte: -3000 })).toBeCloseTo(819.27, 1);
  });

  test('comptant de 2 299,50 $ taxes incluses : 689,92 $', () => {
    expect(monthly({ comptant: 2299.5 })).toBeCloseTo(689.92, 1);
  });

  test('boni après taxes de 1 500 $ : 702,86 $', () => {
    expect(monthly({ bonusCash: 1500 })).toBeCloseTo(702.86, 1);
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

describe('promotions du mois à cocher', () => {
  const { offersOf, offerKey, checkedOffersTotal } = require('../hooks/useCalculator');
  const offers = [
    { code: '2646Z1', name: 'Loyalty', tax: 'after', amount: 700, sale_types: ['1', 'L', 'E'] },
    { code: '2634Z1', name: 'Targeted', tax: 'before', amount: 600, sale_types: ['1', 'L', 'E'] },
    { code: '2699Z2', name: 'Lease only', tax: 'after', amount: 450, sale_types: ['L'] },
  ];
  const all = Object.fromEntries(offers.map(o => [offerKey(o), true]));

  test('rien de coché : rien de déduit', () => {
    expect(checkedOffersTotal(offers, {}, 'after', 'E')).toBe(0);
    expect(checkedOffersTotal(offers, {}, 'before', 'L')).toBe(0);
  });

  test('chaque promotion va à sa place : avant ou après taxes, achat ou location', () => {
    expect(checkedOffersTotal(offers, all, 'after', 'E')).toBe(700);
    expect(checkedOffersTotal(offers, all, 'before', 'E')).toBe(600);
    expect(checkedOffersTotal(offers, all, 'after', 'L')).toBe(1150);
    expect(checkedOffersTotal(offers, all, 'before', 'L')).toBe(600);
  });

  test('anciennes données : la prime de fidélité seule devient une case', () => {
    const legacy = offersOf({ loyalty_bonus_cash: 1500, loyalty_bonus_cash_program: { code: '2646M1', name: 'Loyal' } });
    expect(legacy).toHaveLength(1);
    expect(legacy[0]).toMatchObject({ code: '2646M1', tax: 'after', amount: 1500 });
    expect(offersOf({ special_offers: [], loyalty_bonus_cash: 1500 })).toEqual([]);
  });
});

describe('Lease Cash du taux standard (261QLB)', () => {
  const entry = { lease_cash: 4000, standard_rate_lease_cash: 3000, alt_lease_cash: 0 };
  test('ajouté seulement quand il est coché', () => {
    expect(leaseCashFor(entry, 'standard', false)).toBe(4000);
    expect(leaseCashFor(entry, 'standard', true)).toBe(7000);
    expect(leaseCashFor(entry, 'alternative', true)).toBe(0);
  });
});

describe('Versions possibles pour le résiduel', () => {
  const { residualCandidates } = require('../utils/leaseCalculator');
  const v = (model_name: string, trim: string, body_style = '4D Utility', brand = 'Zed') => ({ brand, model_name, trim, body_style });
  const guide = [
    v('Rover', 'Base'), v('Rover', 'Trail'), v('Rover', 'Summit'),
    v('Rover', 'Base', '2D Utility'), v('Rover', 'Trail', '2D Utility'),
    v('Rover L', 'Base'), v('Rover L', 'Summit'),
    v('Rover', 'Base', '4D Utility', 'Autre'),
  ];
  const trims = (rows: any[]) => rows.map(r => `${r.model_name} ${r.trim} ${r.body_style[0]}`).sort();

  test('plusieurs versions nommées : toutes sont proposées, pas une seule supposée', () => {
    expect(trims(residualCandidates(guide, 'Zed', 'Rover', '4-Door Trail, Summit'))).toEqual(['Rover Summit 4', 'Rover Trail 4']);
  });

  test('carrosserie seule : toutes les versions de cette carrosserie', () => {
    expect(trims(residualCandidates(guide, 'Zed', 'Rover', '2-Door'))).toEqual(['Rover Base 2', 'Rover Trail 2']);
  });

  test('une version exclue est retirée', () => {
    expect(trims(residualCandidates(guide, 'Zed', 'Rover', '4-Door (non Summit models)'))).toEqual(['Rover Base 4', 'Rover Trail 4']);
  });

  test('le modèle long n\'est pas mêlé au modèle court', () => {
    expect(trims(residualCandidates(guide, 'Zed', 'Rover L', 'Summit'))).toEqual(['Rover L Summit 4']);
    expect(residualCandidates(guide, 'Zed', 'Rover', 'Summit').every((r: any) => r.model_name === 'Rover')).toBe(true);
  });

  test('modèle absent du guide : aucune ligne', () => {
    expect(residualCandidates(guide, 'Zed', 'Cargo', '')).toEqual([]);
  });
});

describe('Option 1 absente du programme', () => {
  const { getRateForTerm } = require('../hooks/useCalculator');
  test('aucun taux inventé', () => {
    expect(getRateForTerm(null, 60)).toBe(0);
    expect(getRateForTerm({ rate_36: 1, rate_48: 2, rate_60: 3, rate_72: 4, rate_84: 5, rate_96: 6 }, 60)).toBe(3);
  });
});

describe('Véhicule d\'occasion : taux entré par le conseiller', () => {
  const { getRateForTerm, calculateMonthlyPayment } = require('../hooks/useCalculator');
  const rates: any = {};
  [24, 36, 48, 60, 72, 84, 96].forEach(term => { rates[`rate_${term}`] = 7.5; });

  test('le même taux pour tous les termes, 24 mois compris', () => {
    expect(getRateForTerm(rates, 24)).toBe(7.5);
    expect(getRateForTerm(rates, 96)).toBe(7.5);
  });

  test('paiement mensuel', () => {
    expect(calculateMonthlyPayment(20000, 7.5, 24)).toBeCloseTo(899.99, 1);
    expect(calculateMonthlyPayment(20000, 0, 40)).toBe(500);
  });
});
