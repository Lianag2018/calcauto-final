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
