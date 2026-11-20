"""Garde-fou : chaque fichier de test est classé, aucun n'est oublié."""
import os
import re

import conftest

ICI = os.path.dirname(os.path.abspath(__file__))
RESEAU = re.compile(r"^import requests|^from requests|requests\.(get|post|put|delete)"
                    r"|httpx\.|BASE_URL|BACKEND_URL", re.MULTILINE)
MOI = {"test_tri_des_tests.py"}


def _fichiers():
    return sorted(f for f in os.listdir(ICI) if f.startswith("test_") and f.endswith(".py"))


def test_tout_fichier_reseau_est_classe_integration():
    oublies = []
    for nom in _fichiers():
        if nom in MOI or nom in conftest.INTEGRATION:
            continue
        with open(os.path.join(ICI, nom), encoding="utf-8") as f:
            if RESEAU.search(f.read()):
                oublies.append(nom)
    assert not oublies, f"Tests réseau non classés dans conftest.INTEGRATION : {oublies}"


def test_la_liste_integration_ne_nomme_que_des_fichiers_existants():
    absents = sorted(conftest.INTEGRATION - set(_fichiers()))
    assert not absents, f"Fichiers classés mais absents : {absents}"


def test_la_production_est_refusee(monkeypatch):
    monkeypatch.setenv("CALCAUTO_INTEGRATION", "1")
    for adresse in ("https://calcauto-aipro-xck3.onrender.com",
                    "https://calcauto-final-backend.onrender.com",
                    "https://calcauto-final.vercel.app"):
        monkeypatch.setenv("REACT_APP_BACKEND_URL", adresse)
        permis, raison = conftest.integration_permise()
        assert not permis and "production" in raison


def test_sans_accord_explicite_rien_ne_part(monkeypatch):
    monkeypatch.delenv("CALCAUTO_INTEGRATION", raising=False)
    monkeypatch.setenv("REACT_APP_BACKEND_URL", "http://127.0.0.1:8000")
    assert conftest.integration_permise()[0] is False
