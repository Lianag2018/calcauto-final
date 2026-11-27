"""Quatre portes fermées le 27 nov. 2026, et le compte d'essai « claude ».

1. L'entrée démo ne donne plus de session.
2. Écrire, modifier, effacer ou réinitialiser les programmes demande un administrateur.
3. Les routes de courriel demandent une session.
4. Aucun mot de passe d'administrateur de secours n'est écrit dans le code.

Hors réseau : fausse base en mémoire, aucun serveur.
"""
import ast
import asyncio
import os
import re
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, BACKEND)

from routers import auth, email, programs  # noqa: E402
from services import test_account  # noqa: E402

LONG = "essai-" + "x" * 20  # valeur de test, pas un vrai mot de passe


def run(coro):
    return asyncio.run(coro)


def refused(coro):
    with pytest.raises(HTTPException) as err:
        run(coro)
    return err.value.status_code


class _Users:
    def __init__(self, docs=()):
        self.docs = [dict(d) for d in docs]

    async def find_one(self, query):
        return next((d for d in self.docs if all(d.get(k) == v for k, v in query.items())), None)

    async def insert_one(self, doc):
        self.docs.append(doc)

    async def update_one(self, query, update):
        doc = await self.find_one(query)
        if doc:
            doc.update(update["$set"])


class _Tokens:
    def __init__(self, docs=()):
        self.docs = [dict(d) for d in docs]

    async def delete_many(self, query):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not all(d.get(k) == v for k, v in query.items())]
        return SimpleNamespace(deleted_count=before - len(self.docs))


def _db(users=(), tokens=()):
    return SimpleNamespace(users=_Users(users), tokens=_Tokens(tokens))


# ── 1. Entrée démo ───────────────────────────────────────────────────────────

def test_demo_login_is_closed():
    assert refused(auth.demo_login()) == 410


def test_old_demo_account_loses_admin_and_every_session():
    db = _db(users=[{"id": "d1", "email": "demo@calcauto.ca", "is_admin": True}],
             tokens=[{"token": "a", "user_id": "d1"}, {"token": "b", "user_id": "d1"},
                     {"token": "c", "user_id": "autre"}])
    assert run(test_account.close_old_demo(db)) == 2
    demo = db.users.docs[0]
    assert demo["is_admin"] is False and demo["is_blocked"] is True
    assert db.tokens.docs == [{"token": "c", "user_id": "autre"}]


def test_closing_the_demo_without_a_demo_account_does_nothing():
    assert run(test_account.close_old_demo(_db())) == 0


def test_the_app_no_longer_calls_the_demo_entry():
    root = os.path.join(BACKEND, "..", "frontend")
    for folder in ("app", "contexts", "components", "utils", "hooks"):
        for base, _, files in os.walk(os.path.join(root, folder)):
            for name in files:
                if name.endswith((".ts", ".tsx")):
                    with open(os.path.join(base, name), encoding="utf-8") as f:
                        text = f.read()
                    assert "demo-login" not in text and "isDemoUser" not in text, name


# ── Compte d'essai « claude » ────────────────────────────────────────────────

def test_claude_account_is_closed_without_the_server_variable():
    for expected in ("", None, "court"):
        assert run(test_account.login(_db(), "claude", "court", expected=expected or "")) is None
    assert test_account.password_matches("", "") is False


def test_claude_account_opens_only_with_the_exact_password():
    db = _db()
    assert run(test_account.login(db, "claude", LONG + "!", expected=LONG)) is None
    assert db.users.docs == []
    user = run(test_account.login(db, " Claude ", LONG, expected=LONG))
    assert user["email"] == "claude@calcauto.ca" and user["is_admin"] is True
    assert user["password_hash"] == ""  # rien à voler en base
    again = run(test_account.login(db, "claude@calcauto.ca", LONG, expected=LONG))
    assert again["id"] == user["id"] and len(db.users.docs) == 1


def test_nobody_can_sign_up_with_the_test_account_address():
    for address in ("claude@calcauto.ca", "Claude"):
        form = SimpleNamespace(name="x", email=address, password="y")
        assert refused(auth.register_user(form)) == 400


def test_a_squatted_test_account_loses_its_password_and_sessions():
    db = _db(users=[{"id": "s1", "email": "claude@calcauto.ca", "password_hash": "abc"}],
             tokens=[{"token": "t", "user_id": "s1"}])
    user = run(test_account.login(db, "claude", LONG, expected=LONG))
    assert user["password_hash"] == "" and db.users.docs[0]["password_hash"] == ""
    assert db.tokens.docs == []


def test_the_test_password_never_opens_another_account():
    db = _db(users=[{"id": "u1", "email": "quelquun@example.invalid"}])
    assert run(test_account.login(db, "quelquun@example.invalid", LONG, expected=LONG)) is None


# ── 2. Programmes ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("call", [
    lambda: programs.create_program(None, authorization=None),
    lambda: programs.update_program("p1", None, authorization=None),
    lambda: programs.delete_program("p1", authorization=None),
    lambda: programs.seed_data(authorization=None),
])
def test_writing_programs_without_a_session_is_refused(call):
    assert refused(call()) == 401


# ── 3. Courriel ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("call", [
    lambda: email.send_calculation_email(None, authorization=None),
    lambda: email.send_import_report(None, authorization=None),
    lambda: email.test_email(authorization=None),
])
def test_email_routes_without_a_session_are_refused(call):
    assert refused(call()) == 401


# ── 4. Mot de passe de secours ───────────────────────────────────────────────

def test_no_default_admin_password_in_code():
    with open(os.path.join(BACKEND, "database.py"), encoding="utf-8") as f:
        tree = ast.parse(f.read())
    seen = 0
    for node in ast.walk(tree):
        if (isinstance(node, ast.Call) and getattr(node.func, "attr", "") == "get" and node.args
                and getattr(node.args[0], "value", "") in ("ADMIN_PASSWORD", "CLAUDE_TEST_PASSWORD")):
            seen += 1
            default = node.args[1].value if len(node.args) > 1 else ""
            assert default == "", "une valeur de secours est écrite dans le code"
    assert seen == 2


def test_an_empty_admin_password_never_matches():
    from services.etv_link import admin_password_matches
    assert admin_password_matches("", "") is False
    assert admin_password_matches("x", "") is False


def test_no_router_compares_the_admin_password_directly():
    folder = os.path.join(BACKEND, "routers")
    for name in os.listdir(folder):
        if name.endswith(".py"):
            with open(os.path.join(folder, name), encoding="utf-8") as f:
                assert not re.search(r"[!=]=\s*ADMIN_PASSWORD", f.read()), name
