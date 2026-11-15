"""Codes de modèle possibles pour un véhicule dont la fiche n'en a pas.

La version (Tradesman, Big Horn...) vient de la fiche, du titre de l'annonce ou
du décodage du NIV ; le référentiel des codes de produit donne ensuite les codes
de cette version, classés selon la cabine et la traction quand on les connaît.
"""
import re
from typing import Any, Dict, Iterable, List, Optional

_BRANDS = r'(ram|jeep|dodge|chrysler|fiat|alfa romeo)'


def _norm(text: Any) -> str:
    return re.sub(r'[^a-z0-9]', '', str(text or '').lower())


def _norm_model(model: Any) -> str:
    return _norm(re.sub(r'^\s*' + _BRANDS + r'\s+', '', str(model or ''), flags=re.IGNORECASE))


def trim_from_title(title: Any, brand: Any = '', model: Any = '', year: Any = None) -> str:
    """'Ram 1500 EXPRESS 2027' -> 'EXPRESS' : le titre moins la marque, le modèle et l'année."""
    text = f' {title or ""} '
    for piece in (str(year or ''), str(brand or ''), str(model or '')):
        piece = piece.strip()
        if piece:
            text = re.sub(r'(?<![A-Za-z0-9])' + re.escape(piece) + r'(?![A-Za-z0-9])', ' ', text,
                          flags=re.IGNORECASE)
    text = re.sub(r'(?<![A-Za-z0-9])(19|20)\d{2}(?![A-Za-z0-9])', ' ', text)
    text = re.sub(r'(?<![A-Za-z])' + _BRANDS + r'(?![A-Za-z])', ' ', text, flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', text).strip(' -–|,')


def cab_kind(text: Any) -> str:
    low = str(text or '').lower()
    for kind in ('mega', 'crew', 'quad', 'regular'):
        if kind in low:
            return kind
    if 'extended' in low:
        return 'quad'
    return ''


def drive_kind(text: Any) -> str:
    low = str(text or '').lower()
    if '4x4' in low or '4wd' in low or 'awd' in low:
        return '4x4'
    if '4x2' in low or 'rwd' in low or '2wd' in low or 'fwd' in low:
        return '4x2'
    return ''


# Camions Ram : les deux derniers caractères du code donnent la cabine quand
# le référentiel ne la précise pas (DT6L98 = cabine d'équipe, caisse courte).
_RAM_CAB_BY_SUFFIX = {'98': 'crew', '91': 'crew', '41': 'quad'}


def _cab_from_code(code: Any) -> str:
    code = str(code or '').upper()
    return _RAM_CAB_BY_SUFFIX.get(code[-2:], '') if code.startswith('D') and len(code) == 6 else ''


def suggest_codes(master: Dict[str, Dict[str, Any]], brand: Any, model: Any,
                  trims: Iterable[Any], cab: Any = '', drive: Any = '') -> List[Dict[str, Any]]:
    """Codes du référentiel pour ce modèle et l'une de ces versions. L'année du
    référentiel est ignorée : les codes se reportent d'une année à l'autre."""
    wanted = [t for t in (_norm(t) for t in trims) if t]
    if not wanted:
        return []
    want_brand, want_model = _norm(brand), _norm_model(model)
    want_cab, want_drive = cab_kind(cab), drive_kind(drive)
    found = []
    for code, info in (master or {}).items():
        info = info or {}
        if want_brand and _norm(info.get('brand')) != want_brand:
            continue
        if _norm_model(info.get('model')) != want_model:
            continue
        if _norm(info.get('trim')) not in wanted:
            continue
        code_cab = cab_kind(info.get('cab') or info.get('full_description')) or _cab_from_code(code)
        code_drive = drive_kind(info.get('drive') or info.get('full_description'))
        if want_drive and code_drive and code_drive != want_drive:
            continue
        score = 0
        if want_cab and code_cab:
            score += 2 if code_cab == want_cab else -2
        if want_drive and code_drive == want_drive:
            score += 1
        found.append({
            'code': str(code).upper(),
            'description': info.get('full_description') or ' '.join(
                str(x) for x in (info.get('brand'), info.get('model'), info.get('trim'),
                                 info.get('cab'), info.get('drive')) if x),
            'score': score,
        })
    found.sort(key=lambda c: (-c['score'], c['code']))
    return found


def trims_of_program(program: Optional[Dict[str, Any]]) -> List[str]:
    """'Tradesman, Express, Warlock' -> ['Tradesman', 'Express', 'Warlock']."""
    text = re.sub(r'\([^)]*\)', ' ', (program or {}).get('trim') or '')
    return [t.strip() for t in re.split(r'[,/]', text) if t.strip()]
