// Texto d'une soumission, écrit pour le client. Fichier sans dépendance : il se
// teste seul.

const cad = (value: number, digits = 0) =>
  `${value.toLocaleString('fr-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits })} $`;

// Nom de véhicule lisible par un client : sans les précisions de programme entre
// parenthèses (« Cherokee (excluding Base (KMJL74)) » devient « Cherokee »).
export const plainVehicle = (...parts: (string | number | null | undefined)[]): string => {
  let text = parts.filter((p) => p !== null && p !== undefined && p !== '').join(' ');
  let previous = '';
  while (previous !== text) {
    previous = text;
    text = text.replace(/\([^()]*\)/g, ' ');
  }
  return text.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
};

// Le client a-t-il un nom et un numéro de téléphone complet (10 chiffres) ?
export const hasNameAndPhone = (name: string, phone: string): boolean =>
  (name || '').trim().length >= 2 && (phone || '').replace(/\D/g, '').length >= 10;

export type NewQuote = {
  clientName?: string;
  vehicle: string;
  price: number;
  frequency: 'monthly' | 'biweekly' | 'weekly';
  financing?: { payment: number; term: number; rate: number } | null;
  lease?: { payment: number; term: number; kmPerYear: number } | null;
  advisorName?: string;
  links?: string;
  lang?: string;
};

// Texto d'une soumission de véhicule neuf, écrit pour le client : une idée par
// ligne, sans abréviation ni code de programme. Les liens restent à la fin.
export const newQuoteSms = (q: NewQuote): string => {
  const fr = q.lang !== 'en';
  const every = q.frequency === 'weekly' ? (fr ? 'par semaine' : 'per week')
    : q.frequency === 'biweekly' ? (fr ? 'aux 2 semaines' : 'every 2 weeks') : (fr ? 'par mois' : 'per month');
  const first = (q.clientName || '').trim().split(/\s+/)[0];
  const rate = (value: number) => String(value).replace('.', fr ? ',' : '.');
  const lines = [
    first ? (fr ? `Bonjour ${first},` : `Hello ${first},`) : (fr ? 'Bonjour,' : 'Hello,'),
    '',
    `${fr ? 'Votre soumission' : 'Your quote'} : ${q.vehicle}`,
    `${fr ? 'Prix' : 'Price'} : ${cad(q.price)}`,
    '',
    q.financing ? (fr ? 'Financement' : 'Financing') : '',
    q.financing ? `${cad(q.financing.payment, 2)} ${every}` : '',
    q.financing ? `${q.financing.term} ${fr ? 'mois à' : 'months at'} ${rate(q.financing.rate)} %` : '',
    '',
    q.lease ? (fr ? 'Location' : 'Lease') : '',
    q.lease ? `${cad(q.lease.payment, 2)} ${every}, ${fr ? 'taxes incluses' : 'taxes included'}` : '',
    q.lease ? `${q.lease.term} ${fr ? 'mois' : 'months'}, ${q.lease.kmPerYear.toLocaleString('fr-CA')} km ${fr ? 'par an' : 'per year'}` : '',
    '',
    fr ? "Montants à titre indicatif, sous réserve de l'approbation du crédit." : 'Amounts for information only, subject to credit approval.',
    q.advisorName ? `— ${q.advisorName}` : '',
    q.links ? `\n${q.links}` : '',
  ];
  return lines.filter((line, i) => line !== '' || (i > 0 && lines[i - 1] !== '')).join('\n').trim();
};
