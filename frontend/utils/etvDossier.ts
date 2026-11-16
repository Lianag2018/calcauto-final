import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL } from './api';

// Dossier venu d'une évaluation eTradeValue : le client, sa reprise et le
// véhicule qu'il convoite. Le CRM le dépose ici ; le calculateur le reprend
// et se remplit tout seul.

const OPEN_DOSSIER_KEY = 'calcauto_open_dossier';
const ETV_EVAL_KEY = 'calcauto_etv_eval';

export interface DossierTrade {
  year?: string;
  make?: string;
  model?: string;
  trim?: string;
  vin?: string;
  km?: number | null;
  value?: number | null;
  balance_owed?: number | null;
}

export interface DossierDesired {
  stock: string;
  label?: string;
  price?: number | null;
}

export interface Dossier {
  evalId: string;
  /** Conseiller qui a fait l'évaluation (utile au directeur et à l'administrateur). */
  advisor: string;
  name: string;
  phone: string;
  email: string;
  trade: DossierTrade | null;
  desired: DossierDesired[];
  /** Vrai quand le véhicule convoité a été jumelé à la main par le conseiller. */
  paired?: boolean;
}

export const dossierFromContact = (contact: any): Dossier | null => {
  if (!contact || !contact.etv_eval_id) return null;
  return {
    evalId: String(contact.etv_eval_id),
    advisor: String(contact.etv_advisor || ''),
    name: contact.name || '',
    phone: contact.phone || '',
    email: contact.email || '',
    trade: contact.trade && typeof contact.trade === 'object' ? contact.trade : null,
    desired: Array.isArray(contact.desired) ? contact.desired.filter((d: any) => d && d.stock) : [],
    paired: !!contact.desired_paired,
  };
};

const money = (value: number) => `${Math.round(value).toLocaleString('fr-CA')} $`;

export const tradeLabel = (dossier: Dossier): string => {
  const trade = dossier.trade;
  if (!trade) return '';
  const vehicle = [trade.year, trade.make, trade.model].filter(Boolean).join(' ');
  if (!vehicle) return '';
  const parts = [vehicle];
  if (trade.value) parts.push(money(trade.value));
  if (trade.balance_owed) parts.push(`solde dû ${money(trade.balance_owed)}`);
  return parts.join(' · ');
};

export const desiredLabel = (dossier: Dossier): string => {
  const first = dossier.desired[0];
  if (!first) return '';
  const more = dossier.desired.length > 1 ? ` (+${dossier.desired.length - 1})` : '';
  return `#${first.stock}${first.label ? ` ${first.label}` : ''}${more}`;
};

export const queueDossier = async (dossier: Dossier): Promise<void> => {
  await AsyncStorage.setItem(OPEN_DOSSIER_KEY, JSON.stringify(dossier));
};

export const takeQueuedDossier = async (): Promise<Dossier | null> => {
  const raw = await AsyncStorage.getItem(OPEN_DOSSIER_KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(OPEN_DOSSIER_KEY);
  try {
    const dossier = JSON.parse(raw);
    return dossier && dossier.evalId ? dossier : null;
  } catch {
    return null;
  }
};

// Évaluation depuis laquelle le conseiller a ouvert le calculateur.
export const rememberEvalId = async (evalId: string): Promise<void> => {
  await AsyncStorage.setItem(ETV_EVAL_KEY, evalId);
};

export const takeEvalId = async (): Promise<string | null> => {
  const evalId = await AsyncStorage.getItem(ETV_EVAL_KEY);
  if (evalId) await AsyncStorage.removeItem(ETV_EVAL_KEY);
  return evalId;
};

// Recopie dans les contacts les évaluations que ce conseiller a le droit de voir.
// Une panne d'eTradeValue ne doit jamais bloquer le calculateur : on renvoie false.
export const syncDossiers = async (headers: Record<string, string>): Promise<boolean> => {
  try {
    await axios.post(`${API_URL}/api/etv/sync`, null, { headers, timeout: 40000 });
    return true;
  } catch {
    return false;
  }
};

// Relance à faire après une évaluation (2, 7 et 15 jours).
export interface Followup {
  etv_eval_id: string;
  day: number;
  due: string;
  overdue: boolean;
  name: string;
  phone?: string;
  email?: string;
  trade?: DossierTrade | null;
  desired?: DossierDesired[];
  etv_advisor?: string;
}

export const fetchFollowups = async (headers: Record<string, string>): Promise<Followup[]> => {
  try {
    const response = await axios.get(`${API_URL}/api/etv/followups`, { headers, timeout: 40000 });
    return Array.isArray(response.data?.followups) ? response.data.followups : [];
  } catch {
    return [];
  }
};

export const completeFollowup = async (headers: Record<string, string>, followup: Followup): Promise<boolean> => {
  try {
    await axios.put(`${API_URL}/api/etv/followups/${encodeURIComponent(followup.etv_eval_id)}/${followup.day}/done`, null, { headers });
    return true;
  } catch {
    return false;
  }
};

// Adresse privée du calendrier des relances (à abonner une seule fois dans le téléphone).
export const followupCalendarUrl = async (headers: Record<string, string>): Promise<string | null> => {
  try {
    const response = await axios.post(`${API_URL}/api/etv/calendar-link`, null, { headers });
    return response.data?.path ? `${API_URL}${response.data.path}` : null;
  } catch {
    return null;
  }
};

// Jumelle un véhicule de l'inventaire à un contact d'évaluation (null : enlève le jumelage).
// Renvoie les véhicules convoités à afficher, ou null si l'enregistrement a échoué.
export const pairDesired = async (
  headers: Record<string, string>, evalId: string, vehicle: DossierDesired | null,
): Promise<{ desired: DossierDesired[]; paired: boolean } | null> => {
  try {
    const response = await axios.put(
      `${API_URL}/api/etv/dossiers/${encodeURIComponent(evalId)}/desired`,
      vehicle || { stock: '' }, { headers, timeout: 40000 });
    return {
      desired: Array.isArray(response.data?.desired) ? response.data.desired : [],
      paired: !!response.data?.desired_paired,
    };
  } catch {
    return null;
  }
};

// Lien de la fiche du site (c'est lui qui fait apparaître la photo dans le texto). Vide si inconnu.
export const fetchListingUrl = async (headers: Record<string, string>, stock: string): Promise<string> => {
  if (!stock) return '';
  try {
    const response = await axios.get(`${API_URL}/api/etv/listing`, { headers, params: { stock }, timeout: 25000 });
    return typeof response.data?.url === 'string' ? response.data.url : '';
  } catch {
    return '';
  }
};

const cad = (value: number, digits = 0) =>
  `${value.toLocaleString('fr-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits })} $`;

export interface UsedQuote {
  vehicle: string;
  stock?: string;
  km?: number;
  price: number;
  term: number;
  rate: number;
  payment: number;
  frequency: 'monthly' | 'biweekly' | 'weekly';
  tradeValue?: number;
  advisorName?: string;
  listingUrl?: string;
  stickerUrl?: string;
  lang?: 'fr' | 'en';
}

// Window Sticker du fabricant (marques Stellantis seulement, NIV complet).
const STICKER_SITES: Record<string, string> = {
  chrysler: 'www.chrysler.com',
  jeep: 'www.jeep.com',
  dodge: 'www.dodge.com',
  ram: 'www.ramtrucks.com',
  fiat: 'www.fiatusa.com',
  alfa: 'www.alfaromeousa.com',
};

export const windowStickerUrl = (brand: string | undefined, vin: string | undefined): string => {
  const cleanVin = (vin || '').trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVin)) return '';
  const name = (brand || '').toLowerCase();
  const key = Object.keys(STICKER_SITES).find((k) => name.includes(k));
  return key ? `https://${STICKER_SITES[key]}/hostd/windowsticker/getWindowStickerPdf.do?vin=${cleanVin}` : '';
};

// Liens à la fin d'un texto : le Window Sticker d'abord, la fiche du site en
// toute dernière ligne (c'est elle qui donne l'aperçu avec la photo dans Messages).
export const smsLinks = (stickerUrl: string, listingUrl: string, lang: 'fr' | 'en' = 'fr'): string => {
  const parts: string[] = [];
  if (stickerUrl) parts.push(`Window Sticker :\n${stickerUrl}`);
  if (listingUrl) parts.push(`${lang === 'en' ? 'Photos and details' : 'Photos et détails'} :\n${listingUrl}`);
  return parts.join('\n\n');
};

// Texto d'un calcul de véhicule d'occasion. Le lien de la fiche va en dernière
// ligne : c'est ce qui fait apparaître l'aperçu avec la photo dans Messages.
export const usedQuoteSms = (q: UsedQuote): string => {
  const fr = q.lang !== 'en';
  const every = q.frequency === 'weekly' ? (fr ? 'par semaine' : 'weekly')
    : q.frequency === 'biweekly' ? (fr ? 'aux 2 semaines' : 'bi-weekly') : (fr ? 'par mois' : 'monthly');
  const lines = [
    q.vehicle,
    q.stock ? `${fr ? 'Inventaire' : 'Stock'} #${q.stock}` : '',
    q.km ? `${q.km.toLocaleString('fr-CA')} km` : '',
    `${fr ? 'Prix' : 'Price'} : ${cad(q.price)}`,
    q.tradeValue ? `${fr ? 'Votre échange' : 'Your trade-in'} : ${cad(q.tradeValue)}` : '',
    '',
    `${fr ? 'Paiement' : 'Payment'} ${every} : ${cad(q.payment, 2)}`,
    `${q.term} ${fr ? 'mois à' : 'months at'} ${String(q.rate).replace('.', fr ? ',' : '.')} %`,
    '',
    fr ? "Montants à titre indicatif, sous réserve de l'approbation du crédit." : 'Amounts for information only, subject to credit approval.',
    q.advisorName ? `— ${q.advisorName}` : '',
    q.stickerUrl || q.listingUrl ? `\n${smsLinks(q.stickerUrl || '', q.listingUrl || '', fr ? 'fr' : 'en')}` : '',
  ];
  return lines.filter((line, i) => line !== '' || (i > 0 && lines[i - 1] !== '')).join('\n').trim();
};

// Adresse qui ouvre l'application de textos, déjà adressée au client quand son numéro est connu.
export const smsHref = (phone: string, body: string): string => {
  const number = (phone || '').replace(/[^0-9+]/g, '');
  return `sms:${number}?&body=${encodeURIComponent(body)}`;
};
