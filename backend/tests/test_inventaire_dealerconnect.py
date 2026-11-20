"""Liste DealerConnect : véhicules en stock, en route et en construction.

Le site de la concession ne montre un véhicule qu'une fois mis en vente. Un camion
arrivé mais pas encore affiché, ou encore en usine, n'avait donc aucune fiche.
"""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routers import inventory  # noqa: E402
from services import dealerconnect_inventory as dc  # noqa: E402
from services.shared_inventory import SHARED_OWNER, is_dealerconnect_code  # noqa: E402
from vin_utils import calculate_check_digit, validate_vin_checksum  # noqa: E402


def vin(serial: int) -> str:
    """NIV fictif au chiffre de contrôle valide."""
    raw = f"1C6SRFLT0VN{serial:06d}"
    return raw[:8] + calculate_check_digit(raw) + raw[9:]


def entry(serial: int, **over):
    base = {"vin": vin(serial), "year": 2027, "model_code": "DT6X98", "status": "KZX",
            "description": "RAM 1500 REBEL CREW CAB 4X4", "package": "25W", "paint": "PR6", "interior": "X9",
            "paint_name": "ROUGE FONDU", "interior_name": "NOIR"}
    return {**base, **over}


def plan(entries):
    return dc.plan_list(entries, validate_vin_checksum, is_dealerconnect_code)


REFERENCE = {"DT6X98": {"brand": "Ram", "model": "1500", "trim": "Rebel", "cab": "Crew Cab"}}


# ---------- étapes ----------

@pytest.mark.parametrize("code,expected", [
    ("KZX", dc.EN_STOCK), ("kzx ", dc.EN_STOCK),
    ("KZT", dc.EN_ROUTE), ("KZ", dc.EN_ROUTE), ("KZLD", dc.EN_ROUTE), ("JB", dc.EN_ROUTE),
    ("D", dc.EN_CONSTRUCTION), ("E", dc.EN_CONSTRUCTION), ("G", dc.EN_CONSTRUCTION),
    ("BA", dc.COMMANDE), ("C", dc.COMMANDE),
    ("ZA", dc.INCONNU), ("", dc.INCONNU), (None, dc.INCONNU),
])
def test_etape_selon_le_statut(code, expected):
    assert dc.stage(code) == expected


# ---------- validation de la liste ----------

def test_une_entree_valide_est_retenue_avec_son_etape():
    result = plan([entry(1)])
    assert result["refused"] == []
    vehicle = result["vehicles"][0]
    assert vehicle["stage"] == dc.EN_STOCK
    assert dc.color_code(vehicle) == "PR6 X9"
    assert vehicle["paint_name"] == "ROUGE FONDU"


@pytest.mark.parametrize("over,reason", [
    ({"vin": "1C6SRFLT0VN000001"[:-1] + "9"}, "NIV invalide"),
    ({"vin": "ABC"}, "NIV invalide"),
    ({"model_code": "REBEL"}, "code"),
    ({"year": None}, "année"),
    ({"status": "K-1"}, "statut"),
    ({"paint": "ROUGE"}, "peinture"),
    ({"interior": "X"}, "intérieur"),
])
def test_une_entree_douteuse_est_refusee_avec_sa_raison(over, reason):
    result = plan([entry(1, **over)])
    assert result["vehicles"] == []
    assert reason in result["refused"][0]["reason"]


def test_un_niv_repete_est_refuse():
    result = plan([entry(1), entry(1)])
    assert len(result["vehicles"]) == 1
    assert result["refused"][0]["reason"] == "NIV répété"


def test_les_textes_libres_sont_nettoyes():
    vehicle = plan([entry(1, paint_name='<b>ROUGE</b>  "FONDU"\n', description="x" * 500)])["vehicles"][0]
    assert vehicle["paint_name"] == "bROUGE/b FONDU"
    assert len(vehicle["description"]) == 120


# ---------- fiches ----------

def test_un_vehicule_jamais_vu_a_l_inventaire_obtient_une_fiche():
    rows = plan([entry(1), entry(2, status="D", paint="PW7")])["vehicles"]
    cards = dc.cards(rows, [], SHARED_OWNER, REFERENCE)
    assert [c["dc_stage"] for c in cards] == [dc.EN_STOCK, dc.EN_CONSTRUCTION]
    card = cards[0]
    assert card["stock_no"] == f"DC-{vin(1)[-8:]}" and card["stock_pending"] is True
    assert (card["brand"], card["model"], card["trim"]) == ("Ram", "1500", "Rebel")
    assert card["type"] == "neuf" and card["status"] == "disponible"
    assert card["color"] == "PR6 X9" and card["model_code"] == "DT6X98"


def test_un_vehicule_deja_passe_a_l_inventaire_n_a_pas_de_seconde_fiche():
    rows = plan([entry(1), entry(2)])["vehicles"]
    cards = dc.cards(rows, [vin(1).lower()], SHARED_OWNER, REFERENCE)
    assert [c["vin"] for c in cards] == [vin(2)]


def test_la_fiche_du_site_recoit_l_etape_et_le_nom_de_la_couleur():
    rows = {r["vin"]: r for r in plan([entry(1)])["vehicles"]}
    site = [{"stock_no": "47043", "vin": vin(1), "color": "PAU X9", "model_code": "DT6X98"},
            {"stock_no": "47050", "vin": vin(9), "color": ""}]
    dc.attach(site, rows)
    assert site[0]["dc_stage"] == dc.EN_STOCK and site[0]["paint_name"] == "ROUGE FONDU"
    assert site[0]["color"] == "PAU X9"  # une couleur déjà sur la fiche n'est pas écrasée
    assert "dc_stage" not in site[1]


def test_la_fiche_sans_couleur_ni_code_les_recoit():
    rows = {r["vin"]: r for r in plan([entry(1)])["vehicles"]}
    site = [{"stock_no": "47043", "vin": vin(1), "color": "", "model_code": ""}]
    dc.attach(site, rows)
    assert site[0]["color"] == "PR6 X9" and site[0]["model_code"] == "DT6X98"


# ---------- routes ----------

class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, _limit):
        return list(self.docs)

    def __aiter__(self):
        async def walk():
            for doc in self.docs:
                yield doc
        return walk()


class _Collection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])
        self.deleted = 0

    def find(self, *_args, **_kwargs):
        return _Cursor(self.docs)

    async def count_documents(self, _query):
        return len(self.docs)

    async def delete_many(self, _query):
        self.deleted += 1
        self.docs = []

    async def insert_many(self, documents):
        self.docs.extend(documents)


class _Db:
    def __init__(self, dealerconnect=None, site=None):
        self.dealerconnect_vehicles = _Collection(dealerconnect)
        self.inventory = _Collection(site)


@pytest.fixture
def base(monkeypatch):
    db = _Db()
    monkeypatch.setattr(inventory, "db", db)

    async def allowed(*_args):
        return None

    import routers.sci as sci
    monkeypatch.setattr(sci, "_require_veille", allowed)
    return db


def send(entries, dry_run=False):
    return asyncio.run(inventory.replace_dealerconnect_list(
        payload={"vehicles": entries}, dry_run=dry_run, authorization=None, x_admin_password="", x_veille_key="k"))


def test_la_liste_complete_remplace_la_precedente(base):
    base.dealerconnect_vehicles.docs = [{"vin": "ANCIEN", "owner_id": SHARED_OWNER}]
    result = send([entry(i, status="KZX" if i % 2 else "D") for i in range(1, 31)])
    assert result["ok"] and result["written"] and result["vehicles"] == 30 and result["previous_vehicles"] == 1
    assert result["stages"] == {dc.EN_STOCK: 15, dc.EN_CONSTRUCTION: 15}
    assert len(base.dealerconnect_vehicles.docs) == 30
    assert all(d["owner_id"] == SHARED_OWNER for d in base.dealerconnect_vehicles.docs)


def test_l_essai_a_blanc_n_ecrit_rien(base):
    result = send([entry(i) for i in range(1, 31)], dry_run=True)
    assert result["ok"] and not result["written"]
    assert base.dealerconnect_vehicles.docs == [] and base.dealerconnect_vehicles.deleted == 0


def test_une_seule_entree_douteuse_fait_refuser_toute_la_liste(base):
    base.dealerconnect_vehicles.docs = [{"vin": "ANCIEN"}]
    result = send([entry(i) for i in range(1, 31)] + [entry(99, model_code="???")])
    assert not result["ok"] and not result["written"] and result["reason"] == "entrées refusées"
    assert base.dealerconnect_vehicles.docs == [{"vin": "ANCIEN"}]


def test_une_liste_trop_courte_ne_remplace_rien(base):
    base.dealerconnect_vehicles.docs = [{"vin": "ANCIEN"}]
    result = send([entry(i) for i in range(1, 6)])
    assert not result["ok"] and "lecture douteuse" in result["reason"]
    assert base.dealerconnect_vehicles.docs == [{"vin": "ANCIEN"}]


def test_sans_cle_la_liste_est_refusee(monkeypatch):
    monkeypatch.setattr(inventory, "db", _Db())
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as refused:
        asyncio.run(inventory.replace_dealerconnect_list(
            payload={"vehicles": [entry(1)]}, dry_run=True, authorization=None, x_admin_password="", x_veille_key=""))
    assert refused.value.status_code in (401, 403)


def _add(monkeypatch, user_sees, site, **filters):
    rows = plan([entry(1), entry(2, status="D")])["vehicles"]
    db = _Db(dealerconnect=[{**r, "owner_id": SHARED_OWNER} for r in rows], site=[{"vin": v} for v in site])
    monkeypatch.setattr(inventory, "db", db)
    monkeypatch.setattr(inventory, "sees_shared_inventory", lambda _user: user_sees)

    async def reference():
        return REFERENCE

    monkeypatch.setattr(inventory, "_reference_codes", reference)
    vehicles = [{"stock_no": "47043", "vin": vin(1), "owner_id": SHARED_OWNER}] if vin(1) in site else []
    args = {"type": None, "status": None, "year": None, "brand": None, **filters}
    asyncio.run(inventory._add_dealerconnect(vehicles, {"id": "u1"}, **args))
    return vehicles


def test_l_inventaire_recoit_les_vehicules_absents_du_site(monkeypatch):
    vehicles = _add(monkeypatch, True, site=[vin(1)])
    assert [v["stock_no"] for v in vehicles] == ["47043", f"DC-{vin(2)[-8:]}"]
    assert vehicles[0]["dc_stage"] == dc.EN_STOCK and vehicles[1]["dc_stage"] == dc.EN_CONSTRUCTION


def test_une_autre_concession_ne_recoit_rien(monkeypatch):
    assert _add(monkeypatch, False, site=[]) == []


@pytest.mark.parametrize("filters", [{"type": "occasion"}, {"status": "vendu"}, {"year": 2026}, {"brand": "Jeep"}])
def test_les_filtres_de_la_demande_sont_respectes(monkeypatch, filters):
    assert _add(monkeypatch, True, site=[], **filters) == []
