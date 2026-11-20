import { findMatchingContact, contactChanges, phoneDigits } from '../utils/contactMatch';

const crm = [
  { id: 'a', name: '', phone: '', email: '' },
  { id: 'b', name: 'Client', phone: '418-555-0001', email: '' },
  { id: 'c', name: 'Marie Tremblay', phone: '(418) 555-0102', email: 'marie@exemple.ca' },
  { id: 'd', name: 'Jean Roy', phone: '', email: '' },
  { id: 'e', name: 'Jean Roy', phone: '418 555 0199', email: 'jroy@exemple.ca' },
];

describe('rapprochement du client avec le CRM', () => {
  it('un nom vide ne rapproche aucune fiche', () => {
    expect(findMatchingContact(crm, { name: '', phone: '581-555-7777', email: 'nouveau@exemple.ca' })).toBeUndefined();
  });

  it('« Client » ne rapproche aucune fiche par le nom', () => {
    expect(findMatchingContact(crm, { name: 'Client', phone: '581-555-7777', email: '' })).toBeUndefined();
  });

  it('le courriel rapproche, sans égard aux majuscules', () => {
    expect(findMatchingContact(crm, { name: '', email: 'MARIE@exemple.ca' })?.id).toBe('c');
  });

  it('le téléphone rapproche, quelle que soit sa mise en forme', () => {
    expect(findMatchingContact(crm, { phone: '1 418 555 0102' })?.id).toBe('c');
    expect(phoneDigits('+1 (418) 555-0102')).toBe('4185550102');
  });

  it('le même nom avec un autre téléphone est une autre personne', () => {
    expect(findMatchingContact(crm, { name: 'Marie Tremblay', phone: '581-555-0000' })).toBeUndefined();
  });

  it('le même nom sans coordonnées contraires est la même personne', () => {
    expect(findMatchingContact(crm, { name: 'jean  roy', phone: '418-555-4242' })?.id).toBe('d');
  });

  it('liste absente ou invalide : aucune fiche', () => {
    expect(findMatchingContact(undefined as any, { name: 'Jean Roy' })).toBeUndefined();
  });
});

describe('ce qui est écrit sur la fiche retrouvée', () => {
  it('ajoute le courriel et le téléphone manquants', () => {
    expect(contactChanges(crm[3], { name: 'Jean Roy', phone: '418-555-4242', email: 'j@exemple.ca' }))
      .toEqual({ phone: '418-555-4242', email: 'j@exemple.ca' });
  });

  it("n'écrase jamais un vrai nom", () => {
    expect(contactChanges(crm[2], { name: 'Daniel Essai', phone: '(418) 555-0102' })).toEqual({});
  });

  it('remplace « Client » par le vrai nom', () => {
    expect(contactChanges(crm[1], { name: 'Luc Fortin', phone: '418-555-0001' })).toEqual({ name: 'Luc Fortin' });
  });

  it('même téléphone écrit autrement : rien à changer', () => {
    expect(contactChanges(crm[2], { phone: '4185550102', email: 'marie@exemple.ca' })).toEqual({});
  });
});
