"""Un nouveau guide SCI laisse une demande de comparaison TAQ ; les ajustements TAQ eux-mêmes non."""
import asyncio
import json

from services import data_store


class _Coll:
    def __init__(self):
        self.docs = {}

    async def update_one(self, flt, update, upsert=False):
        key = flt.get("_id") or flt.get("name")
        self.docs.setdefault(key, {}).update(update["$set"])


class _Db(dict):
    def __missing__(self, name):
        self[name] = _Coll()
        return self[name]


def test_new_sci_guide_requests_taq_check(tmp_path):
    db = _Db()
    data_store.snapshot(tmp_path)
    (tmp_path / "sci_residuals_dec2026.json").write_text(json.dumps({"vehicles": []}))
    saved = asyncio.run(data_store.save_changed_files(db, tmp_path))
    assert saved == 1
    pending = db["taq_checks"].docs["pending"]
    assert pending["status"] == "pending" and "sci_residuals_dec2026" in pending["reason"]


def test_taq_overrides_do_not_retrigger(tmp_path):
    db = _Db()
    data_store.snapshot(tmp_path)
    (tmp_path / "residual_overrides_taq.json").write_text(json.dumps({"vehicles": []}))
    assert asyncio.run(data_store.save_changed_files(db, tmp_path)) == 1
    assert "pending" not in db["taq_checks"].docs
