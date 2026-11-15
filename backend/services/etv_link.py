"""Lien eTradeValue → CalcAuto : billet d'entrée et dossiers (logique pure).

eTradeValue signe avec la clé partagée `CALCAUTO_LINK_SECRET`. Sans la clé,
la connexion par billet et la synchronisation des dossiers sont refusées et le
reste du calculateur fonctionne comme avant.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

STAFF_ROLES = ("admin", "directeur", "conseiller")
SHARED_INVENTORY_DEALER = "kennebec"  # l'inventaire partagé actuel est celui de Kennebec


class LinkError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def link_secret() -> bytes:
    secret = (os.environ.get("CALCAUTO_LINK_SECRET") or "").strip()
    if len(secret) < 32:
        raise LinkError(503, "Le lien avec eTradeValue n'est pas configuré.")
    return secret.encode()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def sign(secret: bytes, message: str) -> str:
    return _b64(hmac.new(secret, message.encode(), hashlib.sha256).digest())


def verify_ticket(ticket: str, now: Optional[float] = None) -> Dict[str, Any]:
    """Identité portée par un billet valide ; lève LinkError sinon."""
    secret = link_secret()
    body, _, signature = str(ticket or "").partition(".")
    if not body or not signature or not hmac.compare_digest(sign(secret, "ticket:" + body), signature):
        raise LinkError(401, "Billet invalide.")
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except (ValueError, TypeError):
        raise LinkError(401, "Billet invalide.") from None
    if not isinstance(payload, dict) or payload.get("v") != 1:
        raise LinkError(401, "Billet invalide.")
    current = now if now is not None else time.time()
    try:
        expires = float(payload.get("exp"))
    except (TypeError, ValueError):
        raise LinkError(401, "Billet invalide.") from None
    if expires < current or expires > current + 600:
        raise LinkError(401, "Billet expiré. Rouvrez le calculateur à partir d'eTradeValue.")
    username = str(payload.get("sub") or "").strip()
    dealer = str(payload.get("dealer") or "").strip().lower()
    role = str(payload.get("role") or "").strip()
    nonce = str(payload.get("nonce") or "").strip()
    if (not re.fullmatch(r"[^\s@/]{1,80}", username) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,60}", dealer)
            or role not in STAFF_ROLES or len(nonce) < 16):
        raise LinkError(401, "Billet invalide.")
    return {"username": username, "dealer_slug": dealer, "role": role, "nonce": nonce, "expires": expires,
            "name": str(payload.get("name") or username).strip()[:80] or username}


def account_email(username: str, dealer_slug: str) -> str:
    """Identifiant interne du compte : jamais un vrai courriel, unique par concession."""
    return f"{username.lower()}@{dealer_slug}.etradevalue"


def is_calcauto_admin(role: str, dealer_slug: str) -> bool:
    """L'onglet Admin modifie des données communes à tous (programmes, utilisateurs) :
    réservé aux administrateurs des concessions nommées dans CALCAUTO_ADMIN_DEALERS."""
    allowed = {d.strip().lower() for d in (os.environ.get("CALCAUTO_ADMIN_DEALERS") or "kennebec").split(",") if d.strip()}
    return role == "admin" and dealer_slug in allowed


def sees_shared_inventory(user: Dict[str, Any]) -> bool:
    """Un compte sans concession (ancien compte, Démo) garde l'inventaire partagé ;
    un compte d'une autre concession ne voit jamais l'inventaire de Kennebec."""
    dealer = str(user.get("dealer_slug") or "").strip().lower()
    return not dealer or dealer == SHARED_INVENTORY_DEALER


def inventory_owners(user: Dict[str, Any], shared_owner: str) -> List[str]:
    """Propriétaires dont ce compte voit les véhicules."""
    return [user["id"], shared_owner] if sees_shared_inventory(user) else [user["id"]]


def dossiers_request(user: Dict[str, Any], now: Optional[float] = None) -> Dict[str, Any]:
    """Paramètres et en-têtes signés de l'appel aux dossiers d'eTradeValue."""
    secret = link_secret()
    dealer = str(user.get("dealer_slug") or "").strip().lower()
    username = str(user.get("etv_username") or "").strip()
    role = str(user.get("etv_role") or "").strip()
    if not dealer or not username or role not in STAFF_ROLES:
        raise LinkError(403, "Ce compte n'est pas relié à eTradeValue.")
    stamp = str(int(now if now is not None else time.time()))
    return {
        "params": {"dealer": dealer, "username": username, "role": role},
        "headers": {"X-CalcAuto-Timestamp": stamp,
                    "X-CalcAuto-Signature": sign(secret, f"dossiers:{stamp}:{dealer}:{username}:{role}")},
    }


def _amount(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def contact_from_dossier(dossier: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Champs du contact tirés d'un dossier ; None si le dossier est inutilisable."""
    if not isinstance(dossier, dict):
        return None
    eval_id = str(dossier.get("id") or "").strip()
    client = dossier.get("client") if isinstance(dossier.get("client"), dict) else {}
    name = str(client.get("name") or "").strip()[:120]
    if not eval_id or not name:
        return None
    trade = dossier.get("trade") if isinstance(dossier.get("trade"), dict) else {}
    desired: List[Dict[str, Any]] = []
    for item in dossier.get("desired") if isinstance(dossier.get("desired"), list) else []:
        if isinstance(item, dict) and str(item.get("stock") or "").strip():
            desired.append({"stock": str(item["stock"]).strip()[:20], "label": str(item.get("label") or "").strip()[:120],
                            "price": _amount(item.get("price"))})
    return {
        "name": name,
        "phone": str(client.get("phone") or "").strip()[:40],
        "email": str(client.get("email") or "").strip()[:120],
        "source": "etradevalue",
        "etv_eval_id": eval_id[:80],
        "etv_created_at": str(dossier.get("created_at") or "")[:40],
        "etv_status": str(dossier.get("status") or "")[:40],
        "etv_advisor": str(dossier.get("advisor") or "")[:80],
        "trade": {
            "year": str(trade.get("year") or "")[:8], "make": str(trade.get("make") or "")[:40],
            "model": str(trade.get("model") or "")[:60], "trim": str(trade.get("trim") or "")[:60],
            "vin": str(trade.get("vin") or "")[:20], "km": _amount(trade.get("km")),
            "value": _amount(trade.get("value")), "balance_owed": _amount(trade.get("balance_owed")),
        },
        "desired": desired[:5],
    }


def admin_password_matches(password, expected) -> bool:
    """Ancien mot de passe des outils Admin : jamais accepte s'il est vide."""
    if not password or not expected:
        return False
    return hmac.compare_digest(str(password).encode(), str(expected).encode())


def browser_key_hash(key) -> str:
    """Empreinte de la cle que le navigateur joint au billet (vide si absente ou trop courte)."""
    key = str(key or "").strip()
    if len(key) < 16:
        return ""
    return hashlib.sha256(key.encode()).hexdigest()


def same_browser(stored_hash, key) -> bool:
    """Le meme navigateur represente son billet (page rechargee pendant le reveil du serveur)."""
    candidate = browser_key_hash(key)
    if not stored_hash or not candidate:
        return False
    return hmac.compare_digest(str(stored_hash), candidate)


ETV_ACCOUNT_SUFFIX = ".etradevalue"
DEMO_EMAIL = "demo@calcauto.ca"


def is_etv_only_account(user) -> bool:
    """Compte fabrique par l'entree eTradeValue (aucun mot de passe, aucun historique)."""
    user = user or {}
    return bool(user.get("etv_username")) and str(user.get("email") or "").endswith(ETV_ACCOUNT_SUFFIX)


def link_refusal(target, link_key) -> str:
    """Raison de refuser de relier ce compte CalcAuto a cette identite eTradeValue ('' si permis)."""
    target = target or {}
    email = str(target.get("email") or "").lower()
    if not email or not link_key:
        return "Compte introuvable."
    if target.get("is_blocked"):
        return "Ce compte est désactivé."
    if email == DEMO_EMAIL or email.endswith(ETV_ACCOUNT_SUFFIX):
        return "Ce compte ne peut pas être relié."
    existing = target.get("etv_link_key")
    if existing and existing != link_key:
        return "Ce compte est déjà relié à un autre utilisateur d'eTradeValue."
    return ""


# --- Relances après une évaluation : 2, 7 et 15 jours -------------------------------

FOLLOWUP_DAYS = (2, 7, 15)


def parse_instant(value) -> Optional[datetime]:
    """Date ISO d'eTradeValue -> datetime UTC sans fuseau ; None si illisible."""
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(timezone.utc).replace(tzinfo=None) if parsed.tzinfo else parsed


def followup_plan(created_at, now: datetime) -> List[Dict[str, Any]]:
    """Relances a venir pour une evaluation. Celles deja depassees ne sont pas creees :
    une vieille evaluation importee ne noie pas le conseiller de rappels en retard."""
    start = parse_instant(created_at)
    if not start:
        return []
    plan = []
    for day in FOLLOWUP_DAYS:
        due = start + timedelta(days=day)
        if due > now:
            plan.append({"day": day, "due": due, "done": False})
    return plan


def owns_followups(user: Dict[str, Any], advisor: str) -> bool:
    """Les relances vont au conseiller qui a fait l'evaluation, pas a tous ceux qui la voient."""
    username = str((user or {}).get("etv_username") or "").strip().lower()
    return bool(username) and username == str(advisor or "").strip().lower()


def _ics_text(value) -> str:
    return (str(value or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
            .replace("\r", "").replace("\n", "\\n"))


def _ics_fold(line: str) -> str:
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    parts, current = [], b""
    for char in line:
        encoded = char.encode("utf-8")
        if len(current) + len(encoded) > (75 if not parts else 74):
            parts.append(current.decode("utf-8"))
            current = b""
        current += encoded
    parts.append(current.decode("utf-8"))
    return "\r\n ".join(parts)


def calendar_feed(items: List[Dict[str, Any]], web_url: str, now: datetime) -> str:
    """Calendrier (format iCalendar) des relances a faire. Un evenement d'une journee
    par relance, avec le lien qui ouvre le dossier dans le calculateur par eTradeValue."""
    base = str(web_url or "").rstrip("/")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CalcAuto//Relances//FR", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH", "X-WR-CALNAME:Relances CalcAuto", "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
             "X-PUBLISHED-TTL:PT6H"]
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    for item in items:
        due = item.get("due")
        eval_id = str(item.get("eval_id") or "")
        if not isinstance(due, datetime) or not eval_id:
            continue
        link = f"{base}/?tab=calculateur&ouvrir=1&eval={eval_id}"
        details = [part for part in (item.get("trade"), item.get("phone")) if part]
        details.append(f"Ouvrir le dossier : {link}")
        lines += [
            "BEGIN:VEVENT",
            f"UID:{re.sub(r'[^A-Za-z0-9-]', '', eval_id)}-j{int(item.get('day') or 0)}@calcauto",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{due.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{(due + timedelta(days=1)).strftime('%Y%m%d')}",
            f"SUMMARY:{_ics_text('Relancer ' + str(item.get('name') or 'le client') + ' (jour ' + str(item.get('day')) + ')')}",
            f"DESCRIPTION:{_ics_text(chr(10).join(details))}",
            f"URL:{link}",
            "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Relance client", "TRIGGER:PT9H", "END:VALARM",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(_ics_fold(line) for line in lines) + "\r\n"


def trade_summary(trade) -> str:
    trade = trade if isinstance(trade, dict) else {}
    vehicle = " ".join(str(trade.get(key) or "").strip() for key in ("year", "make", "model")).strip()
    return f"Reprise : {vehicle}" if vehicle else ""
