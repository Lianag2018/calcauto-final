"""Compte d'essai « claude » (27 nov. 2026, demande de Daniel).

Il remplace l'entrée démo, qui donnait une session d'administrateur sans mot de passe.

- Identifiant : `claude` (ou `claude@calcauto.ca`), sur l'écran de connexion habituel.
- Mot de passe : la variable `CLAUDE_TEST_PASSWORD` du serveur, 16 caractères au moins.
  Il n'est jamais écrit dans le code ni dans la base. Sans la variable, le compte est fermé.
- Mêmes droits que l'ancienne démo (administrateur), pour pouvoir essayer tous les écrans.
"""
import hmac
from datetime import datetime, timezone

TEST_LOGINS = ("claude", "claude@calcauto.ca")
TEST_EMAIL = "claude@calcauto.ca"
TEST_NAME = "Claude (essais)"
OLD_DEMO_EMAIL = "demo@calcauto.ca"
MIN_PASSWORD_LENGTH = 16


def is_test_login(identifier) -> bool:
    return str(identifier or "").strip().lower() in TEST_LOGINS


def password_matches(password, expected) -> bool:
    """Jamais accepté si la variable est absente ou trop courte."""
    if not password or not expected or len(str(expected)) < MIN_PASSWORD_LENGTH:
        return False
    return hmac.compare_digest(str(password).encode(), str(expected).encode())


async def login(db, identifier, password, expected=None):
    """Retourne le compte d'essai si l'identifiant et le mot de passe sont les siens, sinon None.

    None veut dire « ce n'est pas le compte d'essai » : la connexion habituelle continue, et
    comme ce compte n'a pas de mot de passe en base, elle refuse.
    """
    if not is_test_login(identifier):
        return None
    if expected is None:
        from database import CLAUDE_TEST_PASSWORD as expected
    if not password_matches(password, expected):
        return None
    user = await db.users.find_one({"email": TEST_EMAIL})
    if not user:
        from models import User
        # Empreinte vide : la connexion habituelle ne peut jamais l'égaler.
        user = User(name=TEST_NAME, email=TEST_EMAIL, password_hash="").dict()
        await db.users.insert_one(user)
    if user.get("password_hash"):
        # Une fiche créée autrement avec cette adresse : son mot de passe et ses sessions sautent.
        await db.users.update_one({"email": TEST_EMAIL}, {"$set": {"password_hash": ""}})
        await db.tokens.delete_many({"user_id": user["id"]})
        user["password_hash"] = ""
    if not user.get("is_admin"):
        await db.users.update_one({"email": TEST_EMAIL}, {"$set": {"is_admin": True}})
        user["is_admin"] = True
    return user


async def close_old_demo(db, now=None) -> int:
    """Au démarrage : l'ancien compte démo perd ses droits et toutes ses sessions.

    Ses jetons n'expirent pas : sans ce ménage, une session démo déjà ouverte resterait
    administrateur après la fermeture de l'entrée. Ses contacts et soumissions restent en base.
    """
    demo = await db.users.find_one({"email": OLD_DEMO_EMAIL})
    if not demo:
        return 0
    await db.users.update_one(
        {"email": OLD_DEMO_EMAIL},
        {"$set": {"is_admin": False, "is_blocked": True, "demo_closed_at": now or datetime.now(timezone.utc)}},
    )
    result = await db.tokens.delete_many({"user_id": demo["id"]})
    return int(getattr(result, "deleted_count", 0) or 0)
