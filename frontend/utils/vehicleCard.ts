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

const clean = (text: unknown) => String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Recherche directe d'un véhicule d'inventaire, neuf ou d'occasion : numéro de stock
 * (avec ou sans « # »), fin du NIV, ou mots du modèle. Le numéro de stock exact vient
 * en premier, puis ceux qui commencent par la saisie. Moins de 2 caractères : rien.
 */
export function searchInventory<T extends CardVehicle & Record<string, any>>(list: T[], query: string, limit = 8): T[] {
  const words = String(query || '').trim().split(/\s+/).map(clean).filter(Boolean);
  const whole = words.join('');
  if (whole.length < 2) return [];
  const scored: { vehicle: T; score: number }[] = [];
  for (const vehicle of list || []) {
    // Le repère interne « DC-… » n'est pas un numéro de stock : on cherche ces fiches par le NIV.
    const stock = vehicle.stock_pending ? '' : clean(vehicle.stock_no);
    const vin = clean(vehicle.vin);
    let score = 0;
    if (stock && stock === whole) score = 4;
    else if (stock && stock.startsWith(whole)) score = 3;
    else if (whole.length >= 4 && vin.endsWith(whole)) score = 3;
    else if ((stock && stock.includes(whole)) || (whole.length >= 4 && vin.includes(whole))) score = 2;
    else {
      // Mot par mot : une saisie ne doit pas chevaucher deux mots (« DC » dans « Grand Cherokee »).
      const parts = [vehicle.year, vehicle.brand, vehicle.model, vehicle.trim, vehicle.model_code]
        .flatMap(part => String(part ?? '').split(/\s+/)).map(clean).filter(Boolean);
      if (words.every(w => parts.some(part => part.includes(w)) || (stock && stock.includes(w)))) score = 1;
    }
    if (score) scored.push({ vehicle, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(s => s.vehicle);
}
