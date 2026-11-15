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
