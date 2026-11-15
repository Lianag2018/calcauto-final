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
