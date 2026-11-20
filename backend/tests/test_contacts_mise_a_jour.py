"""PUT /contacts/{id} : l'écran envoie les champs dans le corps JSON.

Avant, la route ne lisait que l'adresse : la mise à jour ne faisait rien et
répondait quand même 200. Les coordonnées saisies à l'envoi d'une soumission
par courriel n'étaient donc jamais rangées sur la fiche retrouvée.
"""
import asyncio
import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routers import contacts  # noqa: E402


class _Result:
    def __init__(self, matched):
        self.matched_count = matched
        self.modified_count = matched


class _Collection:
    def __init__(self, matched=1):
        self.matched = matched
        self.calls = []

    async def update_one(self, query, update):
        self.calls.append((query, update))
        return _Result(self.matched)


class _Db:
    def __init__(self, matched=1):
        self.contacts = _Collection(matched)


@pytest.fixture
def base(monkeypatch):
    async def user(_authorization):
        return {"id": "conseiller-1"}

    db = _Db()
    monkeypatch.setattr(contacts, "db", db)
    monkeypatch.setattr(contacts, "get_current_user", user)
    return db


def _put(**kw):
    kw.setdefault("authorization", "Bearer x")
    return asyncio.run(contacts.update_contact("c-1", **kw))


def test_le_corps_json_est_enregistre(base):
    out = _put(payload={"phone": " 418-555-0102 ", "email": "marie@exemple.ca"})
    assert out["success"] is True and out["updated"] == ["email", "phone"]
    query, update = base.contacts.calls[0]
    assert query == {"id": "c-1", "owner_id": "conseiller-1"}
    assert update == {"$set": {"phone": "418-555-0102", "email": "marie@exemple.ca"}}


def test_les_champs_dans_l_adresse_marchent_encore(base):
    _put(name="Marie Tremblay")
    assert base.contacts.calls[0][1] == {"$set": {"name": "Marie Tremblay"}}


def test_rien_a_ecrire_est_une_erreur_et_pas_un_faux_succes(base):
    for payload in (None, {}, {"phone": "  "}, {"autre": "x"}):
        with pytest.raises(HTTPException) as err:
            _put(payload=payload)
        assert err.value.status_code == 400
    assert base.contacts.calls == []


def test_la_fiche_d_un_autre_conseiller_reste_introuvable(monkeypatch, base):
    monkeypatch.setattr(contacts, "db", _Db(matched=0))
    with pytest.raises(HTTPException) as err:
        _put(payload={"phone": "418-555-0102"})
    assert err.value.status_code == 404
