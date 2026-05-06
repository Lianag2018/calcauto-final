# Répertoire `options/` — Catalogue codes FCA par marque/modèle

Ce dossier contient les **descriptions officielles** des codes d'options FCA, organisées par marque et modèle pour faciliter la maintenance.

## Structure

| Fichier | Périmètre |
|---|---|
| `_generic.json` | Codes communs à tous les modèles (couleurs partagées, packages génériques) |
| `ram_1500.json` | Ram 1500 (Sport, Big Horn, Tradesman, Laramie, Limited, Tungsten, RHO, Rebel) |
| `ram_2500_3500.json` | Ram Heavy Duty (2500, 3500) |
| `jeep_grand_cherokee.json` | Jeep Grand Cherokee (Limited, Overland, Summit) |
| `jeep_wrangler_gladiator.json` | Jeep Wrangler & Gladiator |

## Format JSON

```json
{
  "_meta": {
    "brand": "Ram",
    "model": "1500",
    "description": "...",
    "last_updated": "2026-05-06"
  },
  "options": {
    "MH1": "Steel Sport Hood",
    "MRU": "Marchepieds lat tub noirs Mopar (MD)"
  }
}
```

## Usage

Chargé automatiquement par `parser.py:_load_fca_options_catalog()` au démarrage. Les fichiers sont fusionnés dans un dict unique `code → description`.

**Priorité de résolution** : Le code `parse_options()` utilise CE catalogue en priorité absolue. Si un code FCA scanné est trouvé ici, sa description vient de cette source de vérité — JAMAIS du texte OCR (qui peut être décalé d'une ligne quand certains codes n'ont pas de description sur leur ligne, ex: MH1).

## Ajouter un nouveau code

1. Identifier la marque/modèle du véhicule
2. Ouvrir le fichier correspondant (`ram_1500.json`, etc.)
3. Ajouter `"CODE": "Description en français"` dans la section `options`
4. Commit + push → auto-deploy
