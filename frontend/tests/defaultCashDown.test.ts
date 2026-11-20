import { cashDownNote, cashDownOnSelect, defaultCashDown } from '../utils/defaultCashDown';

const fiat = { brand: 'Fiat', model: '500e', trim: 'Pop' };
const nov20 = new Date(2026, 10, 20);

describe('comptant par défaut (subvention)', () => {
  it('propose 7 000 $ pour toutes les Fiat 500', () => {
    expect(defaultCashDown(fiat, nov20)?.amount).toBe(7000);
    expect(defaultCashDown({ brand: 'FIAT', model: '500e (RED)' }, nov20)?.amount).toBe(7000);
    expect(defaultCashDown({ brand: 'fiat ', model: ' 500 ' }, nov20)?.amount).toBe(7000);
  });

  it('ne touche à aucun autre véhicule', () => {
    expect(defaultCashDown({ brand: 'Ram', model: '1500' }, nov20)).toBeNull();
    expect(defaultCashDown({ brand: 'Chrysler', model: '500' }, nov20)).toBeNull();
    expect(defaultCashDown({ brand: 'Fiat', model: 'Topolino' }, nov20)).toBeNull();
    expect(defaultCashDown(null, nov20)).toBeNull();
    expect(defaultCashDown({ brand: 'Fiat' }, nov20)).toBeNull();
  });

  it("s'applique jusqu'au 31 décembre inclus, plus après", () => {
    expect(defaultCashDown(fiat, new Date(2026, 11, 31, 23, 59))?.amount).toBe(7000);
    expect(defaultCashDown(fiat, new Date(2027, 0, 1, 0, 0))).toBeNull();
  });

  it('remplit le comptant en choisissant une Fiat 500', () => {
    const rule = defaultCashDown(fiat, nov20);
    expect(cashDownOnSelect('', '', rule)).toEqual({ value: '7000', autoFilled: '7000' });
    expect(cashDownOnSelect('2500', '', rule)).toEqual({ value: '7000', autoFilled: '7000' });
  });

  it('ne laisse pas la subvention suivre le client vers un autre véhicule', () => {
    expect(cashDownOnSelect('7000', '7000', null)).toEqual({ value: '', autoFilled: '' });
  });

  it('garde le comptant tapé par le vendeur sur un autre véhicule', () => {
    expect(cashDownOnSelect('3000', '', null)).toEqual({ value: '3000', autoFilled: '' });
    expect(cashDownOnSelect('9000', '7000', null)).toEqual({ value: '9000', autoFilled: '' });
  });

  it('explique le montant tant que le vendeur ne le change pas', () => {
    const rule = defaultCashDown(fiat, nov20);
    expect(cashDownNote('7000', rule)).toBe("Subvention gouvernementale de 7 000 $ (taxes incluses) mise en comptant — jusqu'au 31 décembre 2026");
    expect(cashDownNote('7000', rule, 'en')).toBe('Government incentive of $7,000 (tax incl.) applied as cash down — until December 31, 2026');
    expect(cashDownNote('5000', rule)).toBe('');
    expect(cashDownNote('7000', null)).toBe('');
  });
});
