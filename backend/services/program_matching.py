"""Association d'un véhicule à sa ligne de programme, en respectant les
conditions écrites dans le nom de la ligne.

Les PDF Stellantis départagent des lignes par code de produit et par
forfait (CPOS) :

    Big Horn (DT6H91)                       -> seulement ce code
    Big Horn (excludes DT6H91)              -> tout Big Horn sauf ce code
    Laredo (WLJH74 2*A)                     -> ce code avec le forfait 2?A
    Grand Cherokee L Altitude (CPOS 2B5)    -> ce forfait
    (excluding Base (KMJL74))               -> tout sauf ce code

Quand le code ou les options du véhicule ne sont pas connus et qu'une
condition en dépend, le résultat est marqué incertain plutôt que deviné.
"""
import re
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

_MODEL_CODE = re.compile(r'\b[A-Z]{2}[A-Z0-9]{2}[0-9]{2}\b')
# Forfait ou option : 22L, 2B5, 2*A, 23S, 2UP, 4KF (commence par un chiffre)
_PACKAGE = re.compile(
    r'(?<![A-Za-z0-9.*])(?=[0-9*]{0,2}[A-Z*])[0-9][0-9A-Z*][0-9A-Z](?![A-Za-z0-9*])')
_PAREN_OPTION = re.compile(r'\(([A-Z]{3})\)')
_NOT_OPTIONS = {'BEV', 'ICE', 'GAS', 'AWD', 'FWD', 'RWD', 'RHO', 'SRT', 'TRX'}
_FAMILY_TAG = re.compile(r'\((?:[A-Z]{2}|BEV|ICE|PHEV|Gas|ETM)\)')
_EXCLUSION_START = re.compile(r'\(\s*(excl\w*|non)\b', re.IGNORECASE)
_FEATURE_SPLIT = re.compile(r'\s+(?:w/|with)\s*', re.IGNORECASE)
_DOORS = re.compile(r'\b([24])[- ]door\b', re.IGNORECASE)
_WORD = re.compile(r"[a-z0-9.']+")
_STOP_WORDS = {'models', 'model', 'all', 'and', 'the', 'engine', 'package',
               'only', 'cpos', 'value', 'of'}
_NOT_GAS = ('diesel', 'cummins', 'phev', 'hybrid', '4xe', 'bev', 'electric')

Target = Tuple[Optional[str], Tuple[str, ...]]


def is_model_code(text: str) -> bool:
    return bool(_MODEL_CODE.fullmatch((text or '').upper().strip()))


def _words(text: str) -> List[str]:
    text = (text or '').lower().replace('bighorn', 'big horn')
    return [w.strip(".'") for w in _WORD.findall(text)
            if w.strip(".'") and w.strip(".'") not in _STOP_WORDS]


def _targets(text: str) -> List[Target]:
    """Codes de produit du texte, chacun avec les forfaits qui le suivent ;
    les forfaits sans code deviennent une cible (None, forfaits)."""
    targets: List[Target] = []
    codes = list(_MODEL_CODE.finditer(text))
    covered = [False] * len(text)
    for index, match in enumerate(codes):
        end = codes[index + 1].start() if index + 1 < len(codes) else len(text)
        tail = text[match.end():end]
        stop = tail.find(')')
        if stop >= 0:
            tail = tail[:stop]
        packages = tuple(_PACKAGE.findall(tail))
        for position in range(match.start(), match.end() + len(tail)):
            covered[position] = True
        targets.append((match.group(0), packages))
    loose = ''.join(' ' if covered[i] else c for i, c in enumerate(text))
    packages = tuple(_PACKAGE.findall(loose)) + tuple(
        code for code in _PAREN_OPTION.findall(loose) if code not in _NOT_OPTIONS)
    if packages:
        targets.append((None, packages))
    return targets


def _strip_codes(text: str) -> str:
    text = _FAMILY_TAG.sub(' ', text)
    text = _MODEL_CODE.sub(' ', text)
    text = _PAREN_OPTION.sub(' ', text)
    text = re.sub(r'\bCPOS\b', ' ', text)
    text = _PACKAGE.sub(' ', text)
    text = re.sub(r'\(\s*[&/\s]*\)', ' ', text)
    return re.sub(r'\s+', ' ', text).strip(' ,')


def _split_top(text: str, separators: str) -> List[str]:
    """Coupe sur les séparateurs hors parenthèses."""
    parts, depth, current = [], 0, ''
    for char in text:
        if char == '(':
            depth += 1
        elif char == ')':
            depth = max(0, depth - 1)
        if depth == 0 and char in separators:
            parts.append(current)
            current = ''
        else:
            current += char
    parts.append(current)
    return [p.strip() for p in parts if p.strip()]


def _alternatives(name: str) -> List[List[str]]:
    """'Laredo/Laredo X' -> [[laredo], [laredo, x]] ; 'R/T' reste entier."""
    pieces = [name]
    for separator in ('&', '/'):
        split: List[str] = []
        for piece in pieces:
            parts = [p.strip() for p in piece.split(separator)]
            if len(parts) > 1 and all(len(p) > 1 for p in parts):
                split.extend(parts)
            else:
                split.append(piece)
        pieces = split
    return [words for words in (_words(p) for p in pieces) if words]


def _item(text: str) -> Dict[str, Any]:
    text = re.sub(r'^\s*and\s+', '', text, flags=re.IGNORECASE)
    targets = _targets(text)
    label = _DOORS.sub(' ', _strip_codes(text))
    parts = _FEATURE_SPLIT.split(label, maxsplit=1)
    return {
        'targets': targets,
        'names': _alternatives(parts[0]),
        'feature': len(parts) > 1,
    }


def parse_conditions(trim: Optional[str]) -> Dict[str, Any]:
    """Découpe le nom d'une ligne en : cibles incluses, noms de version,
    éléments exclus, portes."""
    text = trim or ''
    positive, exclusions, descriptive = '', [], []
    position = 0
    while True:
        match = _EXCLUSION_START.search(text, position)
        if not match:
            positive += text[position:]
            break
        positive += text[position:match.start()]
        depth, end = 0, len(text)
        for index in range(match.start(), len(text)):
            if text[index] == '(':
                depth += 1
            elif text[index] == ')':
                depth -= 1
                if depth == 0:
                    end = index + 1
                    break
        content = text[match.end():end].rstrip(')')
        items = []
        for part in _split_top(content, ','):
            items.extend(_split_top(re.sub(r'\s+and\s+', ',', part), ','))
        parsed = [_item(i) for i in items]
        parsed = [i for i in parsed if i['targets'] or i['names']]
        if match.group(1).lower() == 'non':
            descriptive.extend(parsed)
        else:
            exclusions.extend(parsed)
        position = end

    doors = {m.group(1) for m in _DOORS.finditer(positive)}
    names: List[List[str]] = []
    feature = False
    for part in _split_top(_DOORS.sub(' ', _strip_codes(positive)), ','):
        pieces = _FEATURE_SPLIT.split(part, maxsplit=1)
        feature = feature or len(pieces) > 1
        names.extend(_alternatives(pieces[0]))
    return {
        'targets': _targets(positive),
        'names': names,
        'feature': feature,
        'doors': doors,
        'exclusions': exclusions,
        'descriptive': descriptive,
    }


def condition_signature(trim: Optional[str]) -> Tuple:
    """Codes et forfaits inclus et exclus : deux lignes dont la signature
    diffère ne sont jamais la même ligne, même si le reste du nom concorde."""
    conditions = parse_conditions(trim)
    excluded = sorted(str(t) for item in conditions['exclusions'] for t in item['targets'])
    return (tuple(sorted(str(t) for t in conditions['targets'])), tuple(excluded))


# ───────────────────────── véhicule ─────────────────────────

def describe_vehicle(brand: str = '', model: str = '', trim: str = '', year: Any = None,
                     body_style: str = '', code: str = '',
                     options: Optional[Iterable[str]] = None,
                     description: str = '', option_text: str = '') -> Dict[str, Any]:
    """`options` : codes d'option de la facture (forfait CPOS compris) ;
    `option_text` : leurs descriptions, pour reconnaître un moteur diesel."""
    model_clean = re.sub(r'^\s*(ram|jeep|dodge|chrysler|fiat)\s+', '', model or '',
                         flags=re.IGNORECASE).strip()
    option_set = {str(o).upper().strip() for o in (options or []) if str(o).strip()}
    text = ' '.join([model_clean, trim or '', body_style or '', description or ''])
    return {
        'brand': (brand or '').strip().lower(),
        'model': re.sub(r'\s+', ' ', model_clean.lower()),
        'year': int(year) if str(year or '').strip().isdigit() else None,
        'code': (code or '').upper().strip() or None,
        'options': option_set or None,
        'has_trim': bool((trim or '').strip()),
        'words': set(_words(text)),
        'text': (text + ' ' + (option_text or '')).lower(),
        'engine_known': bool((option_text or '').strip()),
    }


def _line_models(program: Dict[str, Any]) -> Tuple[Set[str], str]:
    """Modèles couverts par la ligne, et le nom de version sans le modèle.
    'Grand Cherokee' + 'Grand Cherokee L Altitude' couvre les deux modèles."""
    model = re.sub(r'\s+', ' ', (program.get('model') or '').strip().lower())
    trim = program.get('trim') or ''
    parts = [p.strip() for p in model.split('/') if p.strip()]
    models = set()
    for part in parts:
        if len(part) <= 2 and parts[0] != part:
            part = f'{parts[0]} {part}'
        models.add(part)
    first = parts[0] if parts else ''
    if first and re.match(re.escape(first) + r'\s+l\b', trim, flags=re.IGNORECASE):
        models.add(f'{first} l')
        trim = trim[len(first):].strip()[1:].strip()
    return models, trim


def _model_matches(vehicle: Dict[str, Any], models: Set[str]) -> bool:
    model = vehicle['model']
    if model in models:
        return True
    # « ProMaster Cargo Van » appartient à la ligne « ProMaster »
    return any(model.startswith(m + ' ') and not model.startswith(m + ' l') and
               not model.startswith(m + ' s') for m in models)


def _package_matches(pattern: str, options: Set[str]) -> bool:
    regex = re.compile('^' + re.escape(pattern).replace(r'\*', '.') + '$')
    return any(regex.match(option) for option in options)


def _eval_target(target: Target, vehicle: Dict[str, Any]) -> Tuple[Optional[bool], str]:
    """(vrai / faux / inconnu, cause de l'inconnu : 'code' ou 'options')."""
    code, packages = target
    if code:
        if vehicle['code'] is None:
            return None, 'code'
        if vehicle['code'] != code:
            return False, ''
    if packages:
        if vehicle['options'] is None:
            return None, 'options'
        return any(_package_matches(p, vehicle['options']) for p in packages), ''
    return True, ''


def _eval_name(words: List[str], vehicle: Dict[str, Any]) -> Optional[bool]:
    if not words:
        return None
    if any(w in ('gas', 'ice', 'diesel') for w in words):
        rest = [w for w in words if w not in ('gas', 'ice', 'diesel')]
        if rest and not all(w in vehicle['words'] for w in rest):
            return False
        non_gas = any(token in vehicle['text'] for token in _NOT_GAS)
        diesel = 'diesel' in vehicle['text'] or 'cummins' in vehicle['text']
        gas = bool(vehicle['words'] & {'gas', 'ice', 'hemi'})
        known = gas or vehicle['engine_known']
        if 'diesel' in words:
            return True if diesel else (False if known else None)
        return False if non_gas else (True if known else None)
    return all(w in vehicle['words'] for w in words)


def _eval_item(item: Dict[str, Any], vehicle: Dict[str, Any]) -> Tuple[Optional[bool], str]:
    """Un élément d'exclusion s'applique-t-il au véhicule ?"""
    cause = ''
    for target in item['targets']:
        result, why = _eval_target(target, vehicle)
        if result:
            return True, ''
        if result is None:
            cause = why
    if item['targets'] and not cause:
        return False, ''
    if cause == 'options':
        return None, cause
    if not item['names']:
        return (None, cause) if cause else (False, '')
    if not vehicle['has_trim']:
        return None, 'version'
    named = [_eval_name(words, vehicle) for words in item['names']]
    if any(n is True for n in named):
        return (None, 'options') if item['feature'] else (True, '')
    if any(n is None for n in named):
        return None, 'moteur'
    return False, ''


def evaluate_line(program: Dict[str, Any], vehicle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """None si la ligne ne s'applique pas ; sinon {'score', 'unknown'}."""
    if (program.get('brand') or '').strip().lower() != vehicle['brand']:
        return None
    if vehicle['year'] is not None and str(program.get('year')) != str(vehicle['year']):
        return None
    models, trim = _line_models(program)
    if not _model_matches(vehicle, models):
        return None
    conditions = parse_conditions(trim)
    unknown: Set[str] = set()

    for item in conditions['exclusions']:
        result, why = _eval_item(item, vehicle)
        if result:
            return None
        if result is None:
            unknown.add(why)

    if conditions['doors']:
        seen = {m.group(1) for m in _DOORS.finditer(vehicle['text'])}
        if seen and not (seen & conditions['doors']):
            return None

    names = [_eval_name(words, vehicle) for words in conditions['names']]
    best_name = max((len(words) for words, ok in zip(conditions['names'], names) if ok),
                    default=0)
    name_known = vehicle['has_trim']

    code_hit = False
    if conditions['targets']:
        results = [_eval_target(t, vehicle) for t in conditions['targets']]
        if any(r is True for r, _ in results):
            code_hit = True
        elif all(r is False for r, _ in results):
            return None
        else:
            causes = {why for r, why in results if r is None}
            unknown |= causes
            # Code reconnu mais forfait inconnu : il faut au moins que le nom concorde
            code_known_hit = any(
                r is None and why == 'options' and t[0] for (r, why), t
                in zip(results, conditions['targets']))
            if code_known_hit:
                if conditions['names'] and name_known and not best_name:
                    return None
                return {'score': 50 + best_name, 'unknown': unknown}

    if code_hit:
        # Le code de produit fait foi, même si le nom de version diffère
        return {'score': 100 + best_name, 'unknown': unknown}

    for item in conditions['descriptive']:
        result, why = _eval_item(item, vehicle)
        if result:
            return None

    if not conditions['names']:
        return {'score': 1, 'unknown': unknown}
    # Forfait seul (sans code) et options inconnues : le nom de version décide
    unknown.discard('options')
    if best_name:
        return {'score': 10 + best_name, 'unknown': unknown}
    if any(n is None for n in names):
        unknown.add('moteur' if name_known else 'version')
        return {'score': 5, 'unknown': unknown}
    if not name_known:
        unknown.add('version')
        return {'score': 2, 'unknown': unknown}
    return None


_CAUSES = {
    'code': 'code de produit du véhicule inconnu',
    'options': 'options (forfait CPOS) du véhicule inconnues',
    'moteur': 'motorisation du véhicule inconnue',
    'version': 'version du véhicule inconnue',
}


def match_program(vehicle: Dict[str, Any], programs: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    """Meilleure ligne pour le véhicule.

    Retourne {'program', 'certain', 'candidates', 'reason'} ; `program` vaut
    None si aucune ligne ne s'applique ou si plusieurs restent possibles."""
    survivors = []
    siblings = 0
    for program in programs:
        if (program.get('brand') or '').strip().lower() == vehicle['brand'] and (
                vehicle['year'] is None or str(program.get('year')) == str(vehicle['year'])
        ) and _model_matches(vehicle, _line_models(program)[0]):
            siblings += 1
        verdict = evaluate_line(program, vehicle)
        if verdict:
            survivors.append((verdict['score'], verdict['unknown'], program))
    if not survivors:
        return {'program': None, 'certain': False, 'candidates': [],
                'reason': 'aucune ligne du programme ne correspond'}
    survivors.sort(key=lambda s: -s[0])
    top_score, top_unknown, top = survivors[0]
    tied = [s for s in survivors if s[0] == top_score]
    others_unknown = set().union(*[s[1] for s in survivors[1:]]) if len(survivors) > 1 else set()
    doubt = set(top_unknown)
    if len(tied) > 1:
        tied_doubt = set().union(*[s[1] for s in tied])
        if not tied_doubt:
            conditional = any(parse_conditions(_line_models(s[2])[1])['targets'] for s in tied)
            tied_doubt = {'options' if conditional else 'version'}
        doubt |= tied_doubt
    # Une ligne mieux ciblée pourrait s'appliquer si on connaissait le code ou les options
    if top_score < 100:
        doubt |= others_unknown & {'code', 'options'}
    if len(survivors) == 1:
        # Une seule ligne possible pour ce modèle : la motorisation ou la
        # version inconnue ne change rien au résultat
        doubt -= {'moteur'}
        if siblings == 1:
            doubt -= {'version'}
    if doubt:
        return {
            'program': None, 'certain': False,
            'candidates': [s[2] for s in survivors],
            'reason': 'plusieurs lignes possibles : ' + ', '.join(
                sorted(_CAUSES.get(d, d) for d in doubt)),
        }
    return {'program': top, 'certain': True, 'candidates': [top], 'reason': ''}
