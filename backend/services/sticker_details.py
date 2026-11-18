"""Détails techniques d'un véhicule, lus sur son Window Sticker (fiche du fabricant, PDF).

Entrée : les mots du PDF avec leur position (x0, y0, x1, y1, texte) ; PyMuPDF les donne par
`page.get_text("words")`. Sortie : un dictionnaire court pour la soumission imprimée — options
d'usine avec prix, équipement principal (libellés propres), consommation, garantie. Aucune valeur
n'est devinée : ce qui n'est pas lu reste absent. Ne lève jamais.
"""
import re
import unicodedata

# Libellés lisibles pour l'équipement de série ou optionnel les plus parlants (motif sur le texte
# du fabricant, en majuscules sans accents -> libellé). L'ordre est celui de l'affichage.
HIGHLIGHTS = [
    (r"RECHARGE SANS FIL", "Recharge sans fil pour téléphone"),
    (r"NAVIGATION", "Navigation GPS"),
    (r"APPLE CARPLAY|ANDROID AUTO", "Apple CarPlay et Android Auto"),
    (r"DEMARREUR A DISTANCE", "Démarreur à distance"),
    (r"SIEGES AVANT CHAUFFANTS", "Sièges avant chauffants"),
    (r"SIEGES ARRIERE CHAUFFANTS", "Sièges arrière chauffants"),
    (r"SIEGES AVANT VENTILES", "Sièges avant ventilés"),
    (r"VOLANT CHAUFFANT", "Volant chauffant"),
    (r"CLIMAT.*BIZONE", "Climatisation automatique bizone"),
    (r"PANORAMIQUE", "Caméra panoramique"),
    (r"CAMERA RECUL", "Caméra de recul"),
    (r"REGUL VIT ADAPT", "Régulateur de vitesse adaptatif"),
    (r"ANGLES MORTS", "Surveillance des angles morts"),
    (r"FREIN URG|COLLISION AV", "Freinage d'urgence et alerte de collision"),
    (r"ASSISTANCE ACTIVE CONDUITE|MAINTIEN DE VOIE|GESTION ACTIVE DE TRAJECTOIRE", "Aides actives à la conduite"),
    (r"PARK.?SENSE", "Aide au stationnement Park-Sense"),
    (r"DEGIVREUR", "Dégivreur d'essuie-glace"),
    (r"OUVRE.PORTE DE GARAGE", "Ouvre-porte de garage universel"),
    (r"TOIT OUVRANT|TOIT PANORAMIQUE", "Toit ouvrant"),
    (r"ATTELAGE", "Ensemble d'attelage de remorque"),
    (r"BANQUETTE ARRIERE 60.40", "Banquette arrière 60-40 rabattable"),
    (r"JEEP ACTIVE DRIVE|QUADRA|4X4 ", "Transmission intégrale"),
]

_LEFT_MAX = 340      # colonne de gauche : équipement de série
_MID_MAX = 650       # colonne du centre : équipement et accessoires optionnels
_PRICE_X = 540       # les prix de la colonne du centre sont alignés à droite, à partir de là


def _norm(text):
    text = str(text).replace("–", "-").replace("’", "'")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", text.upper()).strip()


def _lines(words, x_min, x_max, tol=3.0):
    """Regroupe les mots d'une bande verticale en lignes : [(y, [(x0, mot)...])] du haut vers le bas."""
    rows = []
    for x0, y0, x1, y1, text in sorted((w for w in words if x_min <= w[0] < x_max), key=lambda w: (w[1], w[0])):
        if rows and abs(rows[-1][0] - y0) <= tol:
            rows[-1][1].append((x0, text))
        else:
            rows.append([y0, [(x0, text)]])
    return [(y, sorted(ws)) for y, ws in rows]


_ACCENTS = {"Evolue": "évolué", "Eclair": "Éclair", "Federale": "fédérale", "Expedition": "expédition",
            "Electronique": "électronique", "Systeme": "système", "Securite": "sécurité", "Cable": "câble"}


def _pretty(label):
    """Libellé du fabricant (majuscules sans accents) -> casse lisible, accents des mots courants."""
    text = re.sub(r"\s+", " ", str(label).replace("–", "-")).strip().title()
    text = re.sub(r"\b(De|Du|Des|Et|A|Au|La|Le)\b", lambda m: m.group(1).lower(), text)
    text = re.sub(r"\b[DL]'[A-Z]", lambda m: m.group(0).lower()[:2] + m.group(0)[2:].lower(), text)
    for plain, accented in _ACCENTS.items():
        text = re.sub(r"\b" + plain + r"\b", accented, text)
    return text[:1].upper() + text[1:]


def _money(tokens):
    """['2', '595', '$'] -> 2595 ; None si ce n'est pas un montant."""
    joined = "".join(t for t in tokens if t != "$")
    return int(joined) if joined.isdigit() and "$" in tokens else None


def parse_sticker_words(words):
    out = {}
    try:
        words = [(float(a), float(b), float(c), float(d), str(t)) for a, b, c, d, t in words]
        all_text = _norm(" ".join(w[4] for w in sorted(words, key=lambda w: (round(w[1] / 3), w[0]))))

        # Titre : « ANNÉE MODÈLE 2026 » puis la ligne du modèle, en haut à gauche
        top = [ln for ln in _lines([w for w in words if w[1] < 200], 0, 650) if ln[1]]
        heading = [" ".join(t for _, t in ws) for _, ws in top]
        for i, h in enumerate(heading):
            if _norm(h).startswith("ANNEE MODELE") and i + 1 < len(heading):
                out["title"] = heading[i + 1].strip() or None
                break

        # Prix de base et prix total (PDSF du fabricant)
        for y, ws in _lines(words, 0, _LEFT_MAX):
            txt = " ".join(t for _, t in ws)
            if re.search(r"Prix de base", txt, re.I):
                nums = _money([t for _, t in ws if re.fullmatch(r"\d+|\$", t)])
                if nums:
                    out["base_price"] = nums
        mid = _lines(words, _LEFT_MAX, _MID_MAX)
        header_y = None
        for y, ws in mid:
            txt = _norm(" ".join(t for _, t in ws))
            if txt.startswith("ACCESSOIRES OPTIONNELS"):
                header_y = y
            if "PRIX TOTAL" in txt:
                total = _money([t for _, t in ws if re.fullmatch(r"\d+|\$", t)])
                if total:
                    out["total_price"] = total

        # Options d'usine : lignes de la colonne du centre qui portent un prix à droite
        options = []
        priced = [w for w in words if _LEFT_MAX <= w[0] < _MID_MAX + 40 and w[0] >= _PRICE_X]
        for y, ws in _lines(priced, _PRICE_X, _MID_MAX + 40):
            amount = _money([t for _, t in ws])
            if amount is None or (header_y is not None and y < header_y - 4):
                continue
            row_words = [w for w in words if abs(w[1] - y) <= 3 and _LEFT_MAX <= w[0] < _PRICE_X]
            name = " ".join(w[4] for w in sorted(row_words, key=lambda w: w[0]))
            if "PRIX TOTAL" in _norm(name):
                continue
            options.append({"label": _pretty(name) if name else None, "price": amount})
        named = [o for o in options if o["label"] and "FRAIS" not in _norm(o["label"]) and "ACCISE" not in _norm(o["label"])]
        fees = [o for o in options if o["label"] and o not in named]
        unnamed = sum(o["price"] for o in options if not o["label"])
        out["options"] = [{"label": o["label"], "price": o["price"]} for o in named]
        out["fees"] = [{"label": o["label"], "price": o["price"]} for o in fees]
        if unnamed:
            out["unlabeled_options_total"] = unnamed

        # Équipement principal : libellés propres pour ce que la fiche liste
        equipment_text = [_norm(" ".join(t for _, t in ws)) for _, ws in _lines(words, 0, _MID_MAX)]
        found = []
        for pattern, label in HIGHLIGHTS:
            if any(re.search(pattern, line) for line in equipment_text) and label not in found:
                found.append(label)
        out["highlights"] = found

        # Consommation (EnerGuide) : le gros chiffre est la valeur combinée ; ville et route sont dessous
        guide = [w for w in words if w[0] >= 650 and 420 <= w[1] <= 560 and re.fullmatch(r"\d\.\d", w[4])]
        if guide:
            big = max(guide, key=lambda w: w[3] - w[1])
            small = sorted((w for w in guide if w is not big and abs((w[3] - w[1]) - (big[3] - big[1])) > 5), key=lambda w: w[0])
            fuel = {"combined": float(big[4])}
            if len(small) >= 2:
                fuel["city"], fuel["highway"] = float(small[0][4]), float(small[1][4])
            out["fuel_l100"] = fuel
        cost = [w for w in words if w[0] >= 900 and 450 <= w[1] <= 540 and w[4] == "$"]
        if cost:
            row = sorted((w for w in words if abs(w[1] - cost[0][1]) <= 6 and w[0] > cost[0][0] and re.fullmatch(r"\d+", w[4])),
                         key=lambda w: w[0])
            digits = "".join(w[4] for w in row)
            if digits.isdigit():
                out["fuel_annual_cost"] = int(digits)

        warranty = re.search(r"(\d)-ANS ?/ ?(\d[\d ]*\d) KM", all_text)
        if warranty:
            out["powertrain_warranty"] = {"years": int(warranty.group(1)), "km": int(warranty.group(2).replace(" ", ""))}
        plant = re.search(r"PORT D'ENTREE ?: ?([A-Z ,.'-]{3,40}?)(?: S\.L\.| EXPEDIER| NIV|$)", all_text)
        if plant:
            out["plant"] = plant.group(1).strip().title()
    except Exception:
        return {k: v for k, v in out.items() if v not in (None, [], {})}
    return {k: v for k, v in out.items() if v not in (None, [], {})}
