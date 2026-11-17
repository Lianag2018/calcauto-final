import { hasNameAndPhone, newQuoteSms, plainVehicle } from '../utils/quoteSms';

describe('texto de soumission pour le client', () => {
  it('retire les précisions de programme du nom du véhicule', () => {
    expect(plainVehicle('Jeep', 'Cherokee (excluding Base (KMJL74))', '', 2026)).toBe('Jeep Cherokee 2026');
    expect(plainVehicle('Jeep', 'Cherokee', 'Limited 4x4', 2026)).toBe('Jeep Cherokee Limited 4x4 2026');
  });

  it('exige un nom et un téléphone à 10 chiffres', () => {
    expect(hasNameAndPhone('Client Essai', '418 555-0100')).toBe(true);
    expect(hasNameAndPhone('', '418 555-0100')).toBe(false);
    expect(hasNameAndPhone('Client Essai', '555-0100')).toBe(false);
  });

  it('écrit une idée par ligne, sans code ni abréviation', () => {
    const text = newQuoteSms({
      clientName: 'Camille Essai', vehicle: 'Jeep Cherokee Limited 4x4 2026', price: 50000, frequency: 'weekly',
      financing: { payment: 200.5, term: 96, rate: 4.99 }, lease: { payment: 190.25, term: 54, kmPerYear: 12000 },
      advisorName: 'Alex Essai', links: 'Window Sticker :\nhttps://exemple.test/s', lang: 'fr',
    }).replace(/[  ]/g, ' ');
    expect(text).toBe([
      'Bonjour Camille,', '', 'Votre soumission : Jeep Cherokee Limited 4x4 2026', 'Prix : 50 000 $', '',
      'Financement', '200,50 $ par semaine', '96 mois à 4,99 %', '',
      'Location', '190,25 $ par semaine, taxes incluses', '54 mois, 12 000 km par an', '',
      "Montants à titre indicatif, sous réserve de l'approbation du crédit.", '— Alex Essai', '',
      'Window Sticker :', 'https://exemple.test/s',
    ].join('\n'));
    expect(text).not.toMatch(/Option|KMJL|\(/);
  });

  it('sans location ni nom : aucune ligne vide en double', () => {
    const text = newQuoteSms({ vehicle: 'Ram 1500 2026', price: 60000, frequency: 'monthly', financing: { payment: 900, term: 84, rate: 0 } });
    expect(text.startsWith('Bonjour,\n\nVotre soumission : Ram 1500 2026')).toBe(true);
    expect(text).not.toMatch(/\n\n\n|Location/);
  });
});
