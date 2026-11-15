"""Connexion par eTradeValue et dossiers d'évaluation (client, reprise, véhicule convoité)."""
import asyncio
import os
import secrets
import uuid
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from database import db, ADMIN_EMAIL
from dependencies import generate_token, get_current_user, hash_password
from services.etv_link import (LinkError, account_email, browser_key_hash, calendar_feed, contact_from_dossier,
                               dossiers_request, followup_plan, is_calcauto_admin, is_etv_only_account,
                               link_refusal, owns_followups, same_browser, trade_summary, verify_ticket)

router = APIRouter()


class TicketLogin(BaseModel):
    ticket: str
    client: str = ""


class AccountLink(BaseModel):
    email: str
    password: str


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
    etv_fields = {"dealer_slug": identity["dealer_slug"], "etv_username": identity["username"],
                  "etv_role": identity["role"]}
    # Compte CalcAuto que cette personne a relié elle-même (son mot de passe à l'appui) :
    # elle y retrouve ses contacts et ses soumissions, avec ses dossiers d'évaluation.
    linked = await db.users.find_one({"etv_link_key": email})
    if linked:
        public_user = {"name": linked.get("name") or identity["name"], "email": linked["email"],
                       "is_admin": bool(linked.get("is_admin")) or linked["email"] == ADMIN_EMAIL, **etv_fields}
    else:
        public_user = {"name": identity["name"], "email": email, "is_admin": admin, **etv_fields}

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

    profile = {"name": identity["name"], **etv_fields, "is_admin": admin, "last_login": datetime.utcnow()}
    user = linked or await db.users.find_one({"email": email})
    if user and user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Compte bloqué.")
    if linked:
        # Le nom et les droits du compte personnel ne sont pas touchés.
        await db.users.update_one({"id": linked["id"]}, {"$set": {**etv_fields, "last_login": datetime.utcnow()}})
        user_id = linked["id"]
    elif user:
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
        # Relances à 2, 7 et 15 jours, posées une seule fois, pour le conseiller du dossier.
        if (not existing or "followups" not in existing) and owns_followups(user, fields.get("etv_advisor")):
            fields["followups"] = followup_plan(fields.get("etv_created_at"), datetime.utcnow())
        if existing:
            await db.contacts.update_one(key, {"$set": fields})
            updated += 1
        else:
            await db.contacts.insert_one({"id": str(uuid.uuid4()), "owner_id": user["id"],
                                          "created_at": datetime.utcnow(), **fields})
            created += 1
    return {"success": True, "created": created, "updated": updated, "total": created + updated}


@router.post("/etv/link-account")
async def link_account(body: AccountLink, authorization: Optional[str] = Header(None)):
    """Relie l'entrée eTradeValue au compte CalcAuto existant de la personne.

    Elle prouve que le compte est le sien avec son mot de passe CalcAuto. Ensuite,
    l'entrée par eTradeValue ouvre ce compte : contacts, soumissions et dossiers
    d'évaluation au même endroit.
    """
    user = await get_current_user(authorization)
    if not is_etv_only_account(user):
        raise HTTPException(status_code=400, detail="Ouvrez le calculateur à partir d'eTradeValue pour relier votre compte.")
    if not body.password:
        raise HTTPException(status_code=401, detail="Courriel ou mot de passe incorrect")
    target = await db.users.find_one({"email": body.email.strip().lower(),
                                      "password_hash": hash_password(body.password)})
    if not target:
        raise HTTPException(status_code=401, detail="Courriel ou mot de passe incorrect")
    reason = link_refusal(target, user["email"])
    if reason:
        raise HTTPException(status_code=403, detail=reason)

    etv_fields = {"dealer_slug": user.get("dealer_slug"), "etv_username": user.get("etv_username"),
                  "etv_role": user.get("etv_role")}
    await db.users.update_one({"id": target["id"]}, {"$set": {"etv_link_key": user["email"], **etv_fields,
                                                              "last_login": datetime.utcnow()}})
    # Les dossiers déjà recopiés suivent ; le compte provisoire ne sert plus.
    await db.contacts.update_many({"owner_id": user["id"]}, {"$set": {"owner_id": target["id"]}})
    await db.users.update_one({"id": user["id"]}, {"$set": {"linked_to": target["id"]}})
    await db.tokens.delete_many({"user_id": user["id"]})

    token = generate_token()
    await db.tokens.insert_one({"user_id": target["id"], "token": token, "created_at": datetime.utcnow()})
    return {"success": True, "token": token,
            "user": {"id": target["id"], "name": target.get("name"), "email": target["email"],
                     "is_admin": bool(target.get("is_admin")) or target["email"] == ADMIN_EMAIL, **etv_fields}}


def _etv_web_url() -> str:
    return (os.environ.get("ETV_WEB_URL") or "https://app.etradevalue.ca").rstrip("/")


async def _pending_followups(owner_id: str) -> list:
    """Relances non faites de ce compte, de la plus proche à la plus lointaine."""
    contacts = await db.contacts.find({"owner_id": owner_id, "source": "etradevalue"}).to_list(10000)
    items = []
    for contact in contacts:
        for step in contact.get("followups") or []:
            if not isinstance(step, dict) or step.get("done") or not isinstance(step.get("due"), datetime):
                continue
            items.append({"eval_id": contact.get("etv_eval_id"), "day": step.get("day"), "due": step["due"],
                          "name": contact.get("name"), "phone": contact.get("phone"), "email": contact.get("email"),
                          "trade": contact.get("trade"), "desired": contact.get("desired") or [],
                          "advisor": contact.get("etv_advisor")})
    return sorted(items, key=lambda item: item["due"])


@router.get("/etv/followups")
async def list_followups(authorization: Optional[str] = Header(None)):
    """Relances d'évaluation du conseiller : celles qui sont dues et celles qui s'en viennent."""
    user = await get_current_user(authorization)
    now = datetime.utcnow()
    items = [{**item, "due": item["due"].isoformat() + "Z", "overdue": item["due"] <= now,
              "etv_eval_id": item["eval_id"], "etv_advisor": item["advisor"]}
             for item in await _pending_followups(user["id"])]
    return {"followups": items, "due_count": sum(1 for item in items if item["overdue"])}


@router.put("/etv/followups/{eval_id}/{day}/done")
async def complete_followup(eval_id: str, day: int, authorization: Optional[str] = Header(None)):
    """Le conseiller a relancé son client : la relance sort de la liste et du calendrier."""
    user = await get_current_user(authorization)
    key = {"owner_id": user["id"], "etv_eval_id": eval_id}
    contact = await db.contacts.find_one(key)
    steps = (contact or {}).get("followups") or []
    if not any(isinstance(step, dict) and step.get("day") == day for step in steps):
        raise HTTPException(status_code=404, detail="Relance introuvable.")
    steps = [{**step, "done": True} if step.get("day") == day else step for step in steps]
    await db.contacts.update_one(key, {"$set": {"followups": steps}})
    return {"success": True}


@router.post("/etv/calendar-link")
async def calendar_link(authorization: Optional[str] = Header(None)):
    """Adresse privée du calendrier des relances, à abonner une seule fois dans le téléphone."""
    user = await get_current_user(authorization)
    token = user.get("calendar_token")
    if not token:
        token = secrets.token_urlsafe(32)
        await db.users.update_one({"id": user["id"]}, {"$set": {"calendar_token": token}})
    return {"path": f"/api/etv/calendar/{token}.ics"}


@router.get("/etv/calendar/{token}.ics")
async def calendar_file(token: str):
    """Calendrier des relances. L'adresse contient une clé secrète propre à la personne."""
    user = await db.users.find_one({"calendar_token": token}) if len(token) >= 32 else None
    if not user or user.get("is_blocked"):
        raise HTTPException(status_code=404, detail="Calendrier introuvable.")
    items = [{**item, "trade": trade_summary(item.get("trade"))} for item in await _pending_followups(user["id"])]
    return Response(content=calendar_feed(items, _etv_web_url(), datetime.utcnow()),
                    media_type="text/calendar; charset=utf-8", headers={"Cache-Control": "no-store"})
