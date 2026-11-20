// Ce que la fiche d'un véhicule d'inventaire affiche en plus du modèle et du prix :
// numéro de stock, couleur, et étape du véhicule d'après DealerConnect.

type Lang = 'fr' | 'en';

export type CardVehicle = {
  stock_no?: string | number | null;
  stock_pending?: boolean;
  vin?: string | null;
  color?: string | null;
  paint_name?: string | null;
  interior_name?: string | null;
  dc_stage?: string | null;
  dc_status?: string | null;
};

export type StageTone = 'stock' | 'transit' | 'build' | 'unknown';

const STAGES: Record<string, { fr: string; en: string; tone: StageTone }> = {
  en_stock: { fr: 'En stock', en: 'In stock', tone: 'stock' },
  en_route: { fr: 'En route', en: 'In transit', tone: 'transit' },
  en_construction: { fr: 'En construction', en: 'Being built', tone: 'build' },
  commande: { fr: 'Commandé', en: 'Ordered', tone: 'build' },
};

export const STAGE_COLORS: Record<StageTone, string> = {
  stock: '#4ade80',
  transit: '#60a5fa',
  build: '#FFB347',
  unknown: '#8a93a1',
};

/** « #47043 », ou « Stock à venir · 593102 » quand le véhicule n'a pas encore de numéro. */
export function stockLabel(vehicle: CardVehicle, lang: Lang = 'fr'): string {
  if (vehicle.stock_pending) {
    const tail = String(vehicle.vin || '').slice(-6);
    const text = lang === 'fr' ? 'Stock à venir' : 'Stock # pending';
    return tail ? `${text} · ${tail}` : text;
  }
  return `#${vehicle.stock_no ?? ''}`;
}

/** « ROUGE FONDU (PR6 X9) », le code seul quand le nom manque, vide quand rien n'est connu. */
export function colorLabel(vehicle: CardVehicle): string {
  const name = String(vehicle.paint_name || '').trim();
  const code = String(vehicle.color || '').trim();
  if (name && code) return `${name} (${code})`;
  return name || code;
}

/** Étape à afficher ; null quand DealerConnect ne dit rien du véhicule. */
export function stageLabel(vehicle: CardVehicle, lang: Lang = 'fr'): { text: string; tone: StageTone } | null {
  const stage = String(vehicle.dc_stage || '');
  if (!stage) return null;
  const known = STAGES[stage];
  if (!known) {
    const code = String(vehicle.dc_status || '').trim();
    const text = lang === 'fr' ? 'Statut' : 'Status';
    return { text: code ? `${text} ${code}` : (lang === 'fr' ? 'Statut inconnu' : 'Unknown status'), tone: 'unknown' };
  }
  let text = known[lang];
  if (stage === 'en_stock' && vehicle.stock_pending) {
    text += lang === 'fr' ? ' · pas encore sur le site' : ' · not on the website yet';
  }
  return { text, tone: known.tone };
}
