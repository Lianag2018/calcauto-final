"""Connexion par eTradeValue et dossiers d'évaluation (client, reprise, véhicule convoité)."""
import asyncio
import os
import uuid
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from database import db
from dependencies import generate_token, get_current_user
from services.etv_link import (LinkError, account_email, browser_key_hash, contact_from_dossier,
                               dossiers_request, is_calcauto_admin, same_browser, verify_ticket)

router = APIRouter()


class TicketLogin(BaseModel):
    ticket: str
    client: str = ""


def _etv_api_url() -> str:
    return (os.environ.get("ETV_API_URL") or "https://kenbot-dashboard-api.onrender.com").rstrip("/")


def _http_error(err: LinkError) -> HTTPException:
    return HTTPException(status_code=err.status, detail=err.detail)


@router.post("/auth/etv-login")
async def etv_login(body: TicketLogin):
    """Échange un billet d'eTradeValue contre une session au nom du conseiller."""
    try:
        identity = verify_ticket(body.ticket)
    except LinkError as err:
        raise _http_error(err) from None

    email = account_email(identity["username"], identity["dealer_slug"])
    admin = is_calcauto_admin(identity["role"], identity["dealer_slug"])
    public_user = {"name": identity["name"], "email": email, "is_admin": admin,
                   "dealer_slug": identity["dealer_slug"], "etv_username": identity["username"],
                   "etv_role": identity["role"]}

    # Un billet ne sert qu'une fois : son numéro est retenu jusqu'à son expiration.
    # Seule exception : le même navigateur qui le représente (page rechargée pendant
    # le réveil du serveur) retrouve la session déjà ouverte, sans en créer une autre.
    used = await db.etv_nonces.find_one({"nonce": identity["nonce"]})
    if used:
        if not same_browser(used.get("client_hash"), body.client):
            raise HTTPException(status_code=401, detail="Billet déjà utilisé. Rouvrez le calculateur à partir d'eTradeValue.")
        for _ in range(20):
            session = await db.tokens.find_one({"token": used.get("token")})
            if session:
                return {"success": True, "token": session["token"], "user": {"id": session["user_id"], **public_user}}
            await asyncio.sleep(0.25)
        raise HTTPException(status_code=401, detail="Billet déjà utilisé. Rouvrez le calculateur à partir d'eTradeValue.")
    token = generate_token()
    await db.etv_nonces.insert_one({"nonce": identity["nonce"], "token": token,
                                    "client_hash": browser_key_hash(body.client),
                                    "expires_at": datetime.utcfromtimestamp(identity["expires"])})
    await db.etv_nonces.delete_many({"expires_at": {"$lt": datetime.utcnow()}})

    profile = {"name": identity["name"], "dealer_slug": identity["dealer_slug"],
               "etv_username": identity["username"], "etv_role": identity["role"],
               "is_admin": admin, "last_login": datetime.utcnow()}
    user = await db.users.find_one({"email": email})
    if user and user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Compte bloqué.")
    if user:
        await db.users.update_one({"email": email}, {"$set": profile})
        user_id = user["id"]
    else:
        user_id = str(uuid.uuid4())
        # Aucun mot de passe utilisable : ce compte n'entre que par eTradeValue.
        await db.users.insert_one({"id": user_id, "email": email, "password_hash": "", "is_blocked": False,
                                   "created_at": datetime.utcnow(), **profile})

    await db.tokens.insert_one({"user_id": user_id, "token": token, "created_at": datetime.utcnow()})
    return {"success": True, "token": token, "user": {"id": user_id, **public_user}}


async def _fetch_dossiers(user: dict) -> list:
    try:
        request = dossiers_request(user)
    except LinkError as err:
        raise _http_error(err) from None
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(f"{_etv_api_url()}/api/calcauto/dossiers",
                                        params=request["params"], headers=request["headers"])
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="eTradeValue ne répond pas. Réessayez dans un instant.") from None
    if response.status_code in (401, 403):
        raise HTTPException(status_code=403, detail="eTradeValue refuse l'accès à ces dossiers.")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="eTradeValue ne répond pas. Réessayez dans un instant.")
    data = response.json()
    return data.get("dossiers") if isinstance(data, dict) and isinstance(data.get("dossiers"), list) else []


@router.post("/etv/sync")
async def sync_dossiers(authorization: Optional[str] = Header(None)):
    """Recopie dans les contacts du conseiller les évaluations qu'il a le droit de voir."""
    user = await get_current_user(authorization)
    dossiers = await _fetch_dossiers(user)
    created = updated = 0
    for dossier in dossiers:
        fields = contact_from_dossier(dossier)
        if not fields:
            continue
        key = {"owner_id": user["id"], "etv_eval_id": fields["etv_eval_id"]}
        fields["dealer_slug"] = user.get("dealer_slug") or ""
        existing = await db.contacts.find_one(key)
        if existing:
            await db.contacts.update_one(key, {"$set": fields})
            updated += 1
        else:
            await db.contacts.insert_one({"id": str(uuid.uuid4()), "owner_id": user["id"],
                                          "created_at": datetime.utcnow(), **fields})
            created += 1
    return {"success": True, "created": created, "updated": updated, "total": created + updated}
