import { colorLabel, stageLabel, stockLabel } from '../utils/vehicleCard';

describe('fiche de véhicule', () => {
  it('affiche le numéro de stock du site', () => {
    expect(stockLabel({ stock_no: '47043' })).toBe('#47043');
  });

  it("n'affiche pas le repère interne quand le numéro de stock n'existe pas encore", () => {
    const label = stockLabel({ stock_no: 'DC-VN593102', stock_pending: true, vin: '1C6SRFLTXVN593102' });
    expect(label).toBe('Stock à venir · 593102');
    expect(stockLabel({ stock_pending: true, vin: '1C6SRFLTXVN593102' }, 'en')).toBe('Stock # pending · 593102');
  });

  it('affiche le nom de la couleur avec son code', () => {
    expect(colorLabel({ paint_name: 'ROUGE FONDU', color: 'PR6 X9' })).toBe('ROUGE FONDU (PR6 X9)');
    expect(colorLabel({ color: 'PW7 X9' })).toBe('PW7 X9');
    expect(colorLabel({ paint_name: 'ROUGE FONDU' })).toBe('ROUGE FONDU');
    expect(colorLabel({})).toBe('');
  });

  it("n'affiche aucune étape quand DealerConnect ne dit rien", () => {
    expect(stageLabel({ stock_no: '47043' })).toBeNull();
  });

  it('nomme chaque étape', () => {
    expect(stageLabel({ dc_stage: 'en_stock' })).toEqual({ text: 'En stock', tone: 'stock' });
    expect(stageLabel({ dc_stage: 'en_route' })).toEqual({ text: 'En route', tone: 'transit' });
    expect(stageLabel({ dc_stage: 'en_construction' })).toEqual({ text: 'En construction', tone: 'build' });
    expect(stageLabel({ dc_stage: 'commande' }, 'en')).toEqual({ text: 'Ordered', tone: 'build' });
  });

  it('dit qu\'un véhicule en stock sans fiche du site n\'y est pas encore', () => {
    expect(stageLabel({ dc_stage: 'en_stock', stock_pending: true })?.text).toBe('En stock · pas encore sur le site');
  });

  it('montre le code brut plutôt que de deviner une étape inconnue', () => {
    expect(stageLabel({ dc_stage: 'inconnu', dc_status: 'ZA' })).toEqual({ text: 'Statut ZA', tone: 'unknown' });
    expect(stageLabel({ dc_stage: 'inconnu' })?.text).toBe('Statut inconnu');
  });
});

import { searchInventory } from '../utils/vehicleCard';

describe('recherche directe par stock', () => {
  const list = [
    { stock_no: '47043', vin: '1C6SRFLT1VN593101', year: 2027, brand: 'Ram', model: '1500', trim: 'Rebel', model_code: 'DT6X98' },
    { stock_no: 'DC-VN593102', stock_pending: true, vin: '1C6SRFLTXVN593102', year: 2027, brand: 'Ram', model: '1500', trim: 'Rebel', model_code: 'DT6X98' },
    { stock_no: '47050', vin: '1C4RJKBG5S8700001', year: 2025, brand: 'Jeep', model: 'Grand Cherokee', trim: 'Limited' },
    { stock_no: '14704A', vin: '2C3CDXBG0NH100002', year: 2022, brand: 'Dodge', model: 'Charger', trim: 'SXT', type: 'occasion' },
  ];
  const stocks = (q: string) => searchInventory(list, q).map(v => v.stock_no);

  it('trouve le numéro de stock exact, avec ou sans #', () => {
    expect(stocks('47043')).toEqual(['47043']);
    expect(stocks(' #47043 ')).toEqual(['47043']);
  });

  it('classe le stock exact, puis le début, puis le milieu', () => {
    expect(stocks('4705')).toEqual(['47050']);
    expect(stocks('470')).toEqual(['47043', '47050', '14704A']);
  });

  it('trouve un véhicule sans numéro de stock par la fin de son NIV', () => {
    expect(stocks('593102')).toEqual(['DC-VN593102']);
    expect(stocks('vn593102')).toEqual(['DC-VN593102']);
  });

  it('ne cherche pas dans le repère interne DC', () => {
    expect(stocks('DC')).toEqual([]);
  });

  it('trouve aussi par les mots du modèle et le code', () => {
    expect(stocks('rebel 2027')).toEqual(['47043', 'DC-VN593102']);
    expect(stocks('dt6x98').length).toBe(2);
    expect(stocks('charger')).toEqual(['14704A']);
  });

  it('ne propose rien pour une saisie trop courte ou sans résultat', () => {
    expect(stocks('4')).toEqual([]);
    expect(stocks('')).toEqual([]);
    expect(stocks('99999')).toEqual([]);
  });

  it('limite le nombre de résultats', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ stock_no: `48${String(i).padStart(3, '0')}` }));
    expect(searchInventory(many, '48').length).toBe(8);
  });
});
