"""Clé dédiée de la veille TAQ : acceptée par son empreinte, sinon retour à l'accès administrateur."""
import asyncio
import hashlib

import pytest
from fastapi import HTTPException

from routers.sci import _require_veille

KEY = "k" * 40


def _run(key, monkeypatch, env=True):
    if env:
        monkeypatch.setenv("TAQ_VEILLE_KEY_SHA256", hashlib.sha256(KEY.encode()).hexdigest())
    else:
        monkeypatch.delenv("TAQ_VEILLE_KEY_SHA256", raising=False)
    return asyncio.run(_require_veille(None, "", key))


def test_bonne_cle_acceptee(monkeypatch):
    assert _run(KEY, monkeypatch) is None


@pytest.mark.parametrize("bad", ["", "x" * 40, KEY[:-1], "k" * 10])
def test_mauvaise_cle_refusee(monkeypatch, bad):
    with pytest.raises(HTTPException) as err:
        _run(bad, monkeypatch)
    assert err.value.status_code == 401


def test_sans_empreinte_configuree_la_cle_ne_passe_pas(monkeypatch):
    with pytest.raises(HTTPException):
        _run(KEY, monkeypatch, env=False)
