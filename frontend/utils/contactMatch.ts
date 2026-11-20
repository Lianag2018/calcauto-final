// Rapprochement d'un client saisi dans le calculateur avec un contact du CRM.
//
// Règle : le courriel ou le téléphone identifient une personne ; le nom seul ne
// suffit que s'il est vraiment écrit et que rien ne le contredit. Un nom vide ne
// rapproche jamais deux fiches, et un vrai nom déjà au CRM n'est jamais écrasé.

export interface ContactLike {
  id?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface ClientInput {
  name?: string;
  phone?: string;
  email?: string;
}

/** Les chiffres du téléphone, sans le 1 de l'indicatif nord-américain. */
export const phoneDigits = (value?: string | null): string =>
  (value || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

const mail = (value?: string | null): string => (value || '').trim().toLowerCase();
const plainName = (value?: string | null): string => (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** « Client », « client » ou rien : un nom de remplacement, pas un vrai nom. */
export const isPlaceholderName = (value?: string | null): boolean => {
  const n = plainName(value);
  return n === '' || n === 'client';
};

export function findMatchingContact<T extends ContactLike>(contacts: T[], client: ClientInput): T | undefined {
  const email = mail(client.email);
  const phone = phoneDigits(client.phone);
  const name = plainName(client.name);
  const list = Array.isArray(contacts) ? contacts : [];

  if (email) {
    const byEmail = list.find((c) => mail(c.email) === email);
    if (byEmail) return byEmail;
  }
  if (phone.length >= 7) {
    const byPhone = list.find((c) => phoneDigits(c.phone) === phone);
    if (byPhone) return byPhone;
  }
  if (isPlaceholderName(name)) return undefined;
  // Même nom : la même personne seulement si ses coordonnées connues ne disent pas le contraire.
  return list.find((c) => {
    if (plainName(c.name) !== name) return false;
    const otherEmail = mail(c.email);
    const otherPhone = phoneDigits(c.phone);
    if (email && otherEmail && otherEmail !== email) return false;
    if (phone && otherPhone && otherPhone !== phone) return false;
    return true;
  });
}

/** Ce qu'il faut écrire sur la fiche retrouvée : les coordonnées nouvelles, jamais un vrai nom remplacé. */
export function contactChanges(existing: ContactLike, client: ClientInput): Record<string, string> {
  const changes: Record<string, string> = {};
  const email = (client.email || '').trim();
  const phone = (client.phone || '').trim();
  const name = (client.name || '').trim();
  if (email && mail(email) !== mail(existing.email)) changes.email = email;
  if (phone && phoneDigits(phone) !== phoneDigits(existing.phone)) changes.phone = phone;
  if (name && !isPlaceholderName(name) && isPlaceholderName(existing.name)) changes.name = name;
  return changes;
}
