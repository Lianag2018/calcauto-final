// Comptant proposé par défaut pour certains véhicules : une subvention gouvernementale
// que le client applique en comptant, taxes incluses. Règle datée : passé `until`, elle
// ne s'applique plus, sans autre intervention. Le vendeur peut toujours changer le montant.

export interface CashDownRule {
  brand: string;        // marque, comparée sans tenir compte des majuscules
  modelPrefix: string;  // début du nom du modèle (« 500 » couvre 500e, 500e Pop…)
  amount: number;       // comptant proposé, taxes incluses
  until: string;        // dernier jour d'application, AAAA-MM-JJ (inclus)
  label: { fr: string; en: string };
}

export const CASH_DOWN_RULES: CashDownRule[] = [
  {
    brand: 'fiat', modelPrefix: '500', amount: 7000, until: '2026-12-31',
    label: { fr: 'Subvention gouvernementale', en: 'Government incentive' },
  },
];

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const two = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => [d.getFullYear(), two(d.getMonth() + 1), two(d.getDate())].join('-');
const thousands = (n: number, sep: string) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);

/** La règle en vigueur pour ce véhicule aujourd'hui, ou null. */
export function defaultCashDown(
  vehicle: { brand?: string | null; model?: string | null } | null | undefined,
  today: Date = new Date(),
  rules: CashDownRule[] = CASH_DOWN_RULES,
): CashDownRule | null {
  const brand = (vehicle?.brand || '').trim().toLowerCase();
  const model = (vehicle?.model || '').trim().toLowerCase();
  if (!brand || !model) return null;
  const day = localDay(today);
  return rules.find(r => brand === r.brand && model.startsWith(r.modelPrefix) && day <= r.until) || null;
}

/**
 * Valeur du champ « Comptant » quand on choisit un véhicule.
 * - une règle s'applique : son montant ;
 * - aucune règle, et le champ contient encore un montant proposé par nous : on le vide,
 *   pour qu'une subvention ne suive pas le client vers un autre véhicule ;
 * - sinon : ce que le vendeur a tapé reste tel quel.
 */
export function cashDownOnSelect(current: string, autoFilled: string, rule: CashDownRule | null): { value: string; autoFilled: string } {
  if (rule) return { value: String(rule.amount), autoFilled: String(rule.amount) };
  if (autoFilled && current === autoFilled) return { value: '', autoFilled: '' };
  return { value: current, autoFilled: '' };
}

/** Note affichée sous le champ tant que le comptant est celui de la règle. */
export function cashDownNote(current: string, rule: CashDownRule | null, lang: 'fr' | 'en' = 'fr'): string {
  if (!rule || (parseFloat(current) || 0) !== rule.amount) return '';
  const [y, m, d] = rule.until.split('-').map(Number);
  return lang === 'fr'
    ? `${rule.label.fr} de ${thousands(rule.amount, ' ')} $ (taxes incluses) mise en comptant — jusqu'au ${d} ${MONTHS_FR[m - 1]} ${y}`
    : `${rule.label.en} of $${thousands(rule.amount, ',')} (tax incl.) applied as cash down — until ${MONTHS_EN[m - 1]} ${d}, ${y}`;
}
