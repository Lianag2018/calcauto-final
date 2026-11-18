"""Garde en base les fichiers de données écrits par les imports.

Les imports (guide résiduel, taux de location, kilométrage, incitatifs)
écrivent des fichiers JSON dans `data/`. Sur Render, ce disque est effacé à
chaque redémarrage ou déploiement : sans copie en base, le serveur retombe
sur les fichiers du dépôt et les imports sont perdus.

Au démarrage : les fichiers gardés en base sont réécrits sur le disque.
Ensuite : tout fichier nouveau ou modifié est copié en base.
"""
import asyncio
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict

PREFIXES = ("sci_residuals_", "sci_lease_rates_", "km_adjustments_", "residual_overrides_",
            "key_incentives_", "program_meta_")
COLLECTION = "data_files"
_known: Dict[str, str] = {}


def _sha(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _tracked(data_dir: Path):
    for path in sorted(Path(data_dir).glob("*.json")):
        if path.name.startswith(PREFIXES):
            yield path


def snapshot(data_dir: Path) -> None:
    """Retient l'état actuel du disque : seuls les changements ultérieurs
    seront copiés en base."""
    _known.clear()
    for path in _tracked(data_dir):
        _known[path.name] = _sha(path.read_text(encoding="utf-8"))


async def restore_files(db, data_dir: Path) -> int:
    """Base -> disque. Retourne le nombre de fichiers réécrits."""
    restored = 0
    async for doc in db[COLLECTION].find({}, {"_id": 0}):
        name, content = doc.get("name", ""), doc.get("content")
        if not name.startswith(PREFIXES) or "/" in name or not isinstance(content, str):
            continue
        path = Path(data_dir) / name
        if not path.exists() or path.read_text(encoding="utf-8") != content:
            path.write_text(content, encoding="utf-8")
            restored += 1
    return restored


async def save_changed_files(db, data_dir: Path) -> int:
    """Disque -> base pour les fichiers nouveaux ou modifiés depuis le
    dernier passage. Retourne le nombre de fichiers copiés."""
    saved = 0
    for path in _tracked(data_dir):
        content = path.read_text(encoding="utf-8")
        digest = _sha(content)
        if _known.get(path.name) == digest:
            continue
        await db[COLLECTION].update_one(
            {"name": path.name},
            {"$set": {"name": path.name, "content": content, "sha": digest,
                      "updated_at": datetime.utcnow()}},
            upsert=True,
        )
        _known[path.name] = digest
        saved += 1
    return saved


async def watch(db, data_dir: Path, logger, interval: float = 15.0) -> None:
    while True:
        await asyncio.sleep(interval)
        try:
            saved = await save_changed_files(db, data_dir)
            if saved:
                logger.info(f"[DataStore] {saved} fichier(s) de données copié(s) en base")
        except Exception as e:  # la boucle ne doit jamais s'arrêter
            logger.warning(f"[DataStore] copie en base impossible: {e}")
