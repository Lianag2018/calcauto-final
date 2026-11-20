from fastapi import APIRouter, Body, HTTPException, Header
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import re
import uuid
import json
from database import db, logger
from models import (
    InventoryVehicle, InventoryCreate, InventoryUpdate,
    VehicleOption, ProductCode
)
from dependencies import get_current_user, require_admin, ADMIN_EMAIL
from services.window_sticker import fetch_window_sticker, save_window_sticker_to_db
from routers.invoice import get_full_vehicle_info, _CODE_PROGRAM_MAPPING
from product_code_lookup import codes_for_year, dated_identity, lookup_product_code
from services.program_matching import describe_vehicle, match_program, is_model_code
from services.model_code_suggest import (
    trim_from_title, suggest_codes, trims_of_program, known_trims, is_known_code)
import httpx
from services.shared_inventory import SHARED_OWNER, calc_price, drop_stale_shared
from services.etv_link import can_edit_vehicle_identity, inventory_owners, sees_shared_inventory

router = APIRouter()

# Inventaire Kennebec partagé : Kenbot le recopie du site kennebecdodge.ca
# (véhicules neufs et d'occasion) dans la même collection, sous ce propriétaire.


def _owners(user: Dict[str, Any]) -> Dict[str, Any]:
    """Véhicules de l'utilisateur + inventaire Kennebec partagé, sauf pour un
    compte d'une autre concession, qui ne voit que les siens."""
    return {"$in": inventory_owners(user, SHARED_OWNER)}


# Champs descriptifs qu'on peut corriger sur une fiche partagée. Kenbot réécrit
# la fiche à chaque synchronisation du site : la correction est donc gardée à
# part (inventory_overrides) et réappliquée à la lecture.
SHARED_EDITABLE = ("model_code", "trim", "body_style", "color")


async def _apply_overrides(vehicles: List[Dict[str, Any]]) -> None:
    stocks = [v.get("stock_no") for v in vehicles if v.get("owner_id") == SHARED_OWNER and v.get("stock_no")]
    if not stocks:
        return
    overrides = {o["stock_no"]: o async for o in db.inventory_overrides.find({"stock_no": {"$in": stocks}}, {"_id": 0})}
    for vehicle in vehicles:
        override = overrides.get(vehicle.get("stock_no")) if vehicle.get("owner_id") == SHARED_OWNER else None
        if not override:
            continue
        # Même numéro de stock réattribué à un autre véhicule : la correction ne vaut plus
        if override.get("vin") and vehicle.get("vin") and override["vin"] != vehicle["vin"]:
            continue
        for field, value in (override.get("fields") or {}).items():
            if field in SHARED_EDITABLE and value:
                vehicle[field] = value
                if field == "trim":
                    vehicle["trim_manual"] = True  # correction faite à la main : elle prime


async def _on_site_only(vehicles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    latest = await db.inventory.find_one(
        {"owner_id": SHARED_OWNER, "last_synced_at": {"$type": "date"}},
        {"_id": 0, "last_synced_at": 1}, sort=[("last_synced_at", -1)])
    return drop_stale_shared(vehicles, (latest or {}).get("last_synced_at"))


def _dedupe_by_stock(vehicles: List[Dict[str, Any]], user_id: str) -> List[Dict[str, Any]]:
    """Un même numéro de stock peut exister en version partagée et en version
    personnelle (facture numérisée) : la version personnelle, plus complète, gagne."""
    by_stock: Dict[str, Dict[str, Any]] = {}
    for vehicle in vehicles:
        stock = vehicle.get("stock_no") or ""
        if not stock:
            continue
        kept = by_stock.get(stock)
        if kept is None or (kept.get("owner_id") == SHARED_OWNER and vehicle.get("owner_id") == user_id):
            by_stock[stock] = vehicle
    return list(by_stock.values())


async def _add_dealerconnect(vehicles: List[Dict[str, Any]], user: Dict[str, Any], type: Optional[str],
                            status: Optional[str], year: Optional[int], brand: Optional[str]) -> None:
    """Complète l'inventaire avec la liste DealerConnect de la concession : étape et couleur
    sur les fiches existantes, et une fiche pour chaque véhicule jamais vu à l'inventaire
    (arrivé mais pas encore sur le site, en route, en construction)."""
    from services import dealerconnect_inventory as dc
    if not sees_shared_inventory(user):
        return
    rows = await db.dealerconnect_vehicles.find({"owner_id": SHARED_OWNER}, {"_id": 0}).to_list(dc.MAX_LIST)
    if not rows:
        return
    dc.attach(vehicles, {r["vin"]: r for r in rows if r.get("vin")})
    if (type and type != "neuf") or (status and status != "disponible"):
        return
    # Tout NIV déjà passé à l'inventaire, même sorti du site : un véhicule vendu ne revient pas.
    known = [v.get("vin") async for v in db.inventory.find(
        {"owner_id": {"$in": [SHARED_OWNER, user["id"]]}, "vin": {"$nin": [None, ""]}}, {"_id": 0, "vin": 1})]
    new_cards = dc.cards(rows, known, SHARED_OWNER, await _reference_codes())
    if year:
        new_cards = [c for c in new_cards if c.get("year") == year]
    if brand:
        new_cards = [c for c in new_cards if brand.lower() in str(c.get("brand") or "").lower()]
    vehicles.extend(new_cards)


# ============ Association véhicule -> ligne de programme ============

async def _latest_programs() -> List[Dict[str, Any]]:
    """Programmes de la période la plus récente (celle que l'écran affiche)."""
    latest = await db.programs.find_one(sort=[("program_year", -1), ("program_month", -1)])
    if not latest:
        return []
    query = {"program_month": latest.get("program_month"),
             "program_year": latest.get("program_year")}
    return await db.programs.find(query, {"_id": 0}).to_list(2000)


async def _options_by_stock(stock_numbers: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    if not stock_numbers:
        return grouped
    cursor = db.vehicle_options.find({"stock_no": {"$in": stock_numbers}}, {"_id": 0}).sort("order", 1)
    async for option in cursor:
        grouped.setdefault(option.get("stock_no"), []).append(option)
    return grouped


async def _reference_codes() -> Dict[str, Dict[str, Any]]:
    """Référentiel des codes de produit : le fichier de base, complété par les
    codes que les utilisateurs ont entrés une fois pour une version inconnue."""
    try:
        with open('data/master_product_codes.json', 'r') as f:
            reference = json.load(f)
    except Exception:
        reference = {}
    async for learned in db.learned_model_codes.find({}, {"_id": 0}):
        code = (learned.get("code") or "").upper()
        if code and code not in reference:
            reference[code] = learned
    return reference


async def _learn_code(vehicle: Dict[str, Any], code: str, user: Dict[str, Any]) -> bool:
    """Un code entré à la main pour une version que le référentiel ne connaît
    pas est retenu : il sera proposé pour les prochains véhicules de cette version."""
    code = (code or "").upper().strip()
    if not is_model_code(code) or not vehicle.get("brand") or not vehicle.get("model"):
        return False
    reference = await _reference_codes()
    if is_known_code(reference, code):
        return False
    decoded = await _decode_vin(vehicle.get("vin"))
    trim = vehicle.get("trim") or decoded.get("trim") or _title_trim(vehicle)
    if not trim:
        return False
    cab = vehicle.get("body_style") or decoded.get("cab") or ""
    drive = "4x4" if any(k in (decoded.get("drive") or "").lower() for k in ("4x4", "4wd", "awd")) else ""
    await db.learned_model_codes.update_one({"code": code}, {"$set": {
        "code": code, "brand": vehicle.get("brand"), "model": vehicle.get("model"), "trim": trim,
        "cab": cab, "drive": drive, "year": str(vehicle.get("year") or ""),
        "full_description": " ".join(str(x) for x in (vehicle.get("brand"), vehicle.get("model"), trim, cab, drive) if x),
        "added_by": user.get("email") or user.get("id"), "added_from_stock": vehicle.get("stock_no"),
        "created_at": datetime.utcnow(),
    }}, upsert=True)
    return True


def _title_trim(vehicle: Dict[str, Any]) -> str:
    """Version lue dans le titre de l'annonce quand la fiche n'en a pas."""
    return trim_from_title(vehicle.get("title_scraped"), vehicle.get("brand"),
                           vehicle.get("model"), vehicle.get("year"))


def _vehicle_for_matching(vehicle: Dict[str, Any], options: List[Dict[str, Any]]) -> Dict[str, Any]:
    code = (vehicle.get("model_code") or "").upper().strip()
    codes = [str(o.get("product_code") or "").upper().strip() for o in options]
    if not code:
        # Sur la facture, la première ligne d'options est le code de produit
        code = next((c for c in codes[:1] if is_model_code(c)), "")
    master = lookup_product_code(code, vehicle.get("year"), codes) if code else None
    # Fiche datée : le code dit le modèle, et écarte une version qu'il ne peut pas être
    sure = dated_identity(code, vehicle.get("year"), codes, vehicle.get("trim") or "",
                          bool(vehicle.get("trim_manual"))) or {}
    return describe_vehicle(
        brand=sure.get("brand") or vehicle.get("brand") or (master or {}).get("brand", ""),
        model=sure.get("model") or vehicle.get("model") or (master or {}).get("model", ""),
        trim=sure.get("trim") or vehicle.get("trim") or (master or {}).get("trim", "") or _title_trim(vehicle),
        year=vehicle.get("year"),
        body_style=vehicle.get("body_style", ""),
        code=code,
        options=[c for c in codes if c and c != code],
        option_text=" ; ".join(str(o.get("description") or "") for o in options),
    )


def _match_summary(result: Dict[str, Any], programs: List[Dict[str, Any]]) -> Dict[str, Any]:
    period = programs[0] if programs else {}
    return {
        "program_id": (result["program"] or {}).get("id"),
        "candidate_ids": [c.get("id") for c in result["candidates"]],
        "certain": result["certain"],
        "reason": result["reason"],
        "program_month": period.get("program_month"),
        "program_year": period.get("program_year"),
    }


async def _attach_program_matches(vehicles: List[Dict[str, Any]]) -> None:
    """Ajoute à chaque véhicule la ligne de programme qui s'applique à lui,
    en respectant les codes de produit et les exclusions de la ligne."""
    programs = await _latest_programs()
    if not programs or not vehicles:
        return
    options = await _options_by_stock([v.get("stock_no") for v in vehicles if v.get("stock_no")])
    for vehicle in vehicles:
        described = _vehicle_for_matching(vehicle, options.get(vehicle.get("stock_no"), []))
        vehicle["program_match"] = _match_summary(match_program(described, programs), programs)


async def _save_options(stock_no: str, options: List[Dict[str, Any]]) -> None:
    if not options:
        return
    await db.vehicle_options.delete_many({"stock_no": stock_no})
    for index, option in enumerate(options):
        await db.vehicle_options.insert_one({
            "id": str(uuid.uuid4()),
            "stock_no": stock_no,
            "product_code": str(option.get("product_code", option.get("code", "")) or ""),
            "order": index,
            "description": str(option.get("description", "") or ""),
            "amount": option.get("amount", 0) or 0,
        })


def _rates_by_term(rates: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    terms = ("36", "48", "60", "72", "84", "96")
    rates = rates or {}
    return {t: rates.get(f"rate_{t}", rates.get(t)) for t in terms}


def _financing_from_program(program: Dict[str, Any]) -> Dict[str, Any]:
    months = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet",
              "août", "septembre", "octobre", "novembre", "décembre"]
    month = program.get("program_month") or 0
    period = f"{months[month] if 0 < month < 13 else month} {program.get('program_year', '')}".strip()
    line = " ".join(str(x) for x in (program.get("model"), program.get("trim")) if x)
    return {
        "consumer_cash": program.get("consumer_cash", 0) or 0,
        "bonus_cash": program.get("bonus_cash", 0) or 0,
        "option1_rates": _rates_by_term(program.get("option1_rates")),
        "option2_rates": _rates_by_term(program.get("option2_rates")),
        "programme_model": program.get("model"),
        "programme_trim": program.get("trim"),
        "program_id": program.get("id"),
        "programme_source": f"Programme {period} — {line}",
    }

# ============ Inventory Endpoints ============

@router.get("/inventory")
async def get_inventory(
    authorization: Optional[str] = Header(None),
    type: Optional[str] = None,
    status: Optional[str] = None,
    year: Optional[int] = None,
    brand: Optional[str] = None
):
    """Inventaire de l'utilisateur + inventaire Kennebec partagé (neuf et occasion)."""
    user = await get_current_user(authorization)
    
    query = {"owner_id": _owners(user)}
    if type:
        query["type"] = type
    if status:
        query["status"] = status
    if year:
        query["year"] = year
    if brand:
        query["brand"] = {"$regex": brand, "$options": "i"}
    
    vehicles = []
    async for vehicle in db.inventory.find(query, {"_id": 0}).sort("stock_no", 1):
        vehicles.append(vehicle)
    vehicles = _dedupe_by_stock(await _on_site_only(vehicles), user["id"])
    await _apply_overrides(vehicles)
    try:
        await _add_dealerconnect(vehicles, user, type, status, year, brand)
    except Exception as e:
        logger.warning(f"Liste DealerConnect indisponible: {e}")
    for vehicle in vehicles:
        vehicle["shared"] = vehicle.get("owner_id") == SHARED_OWNER
        if not vehicle.get("trim"):
            vehicle["trim"] = _title_trim(vehicle)
        vehicle.update(calc_price(vehicle))

    try:
        await _attach_program_matches(vehicles)
    except Exception as e:
        logger.warning(f"Association inventaire -> programme impossible: {e}")

    return vehicles

@router.get("/inventory/{stock_no}")
async def get_inventory_vehicle(stock_no: str, authorization: Optional[str] = Header(None)):
    """Récupère un véhicule par numéro de stock"""
    user = await get_current_user(authorization)
    
    found = await db.inventory.find(
        {"stock_no": stock_no, "owner_id": _owners(user)},
        {"_id": 0}
    ).to_list(10)
    found = _dedupe_by_stock(found, user["id"])
    await _apply_overrides(found)
    vehicle = found[0] if found else None
    
    if not vehicle:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    vehicle["shared"] = vehicle.get("owner_id") == SHARED_OWNER
    
    # Get options for this vehicle
    options = []
    async for opt in db.vehicle_options.find({"stock_no": stock_no}, {"_id": 0}).sort("order", 1):
        options.append(opt)
    
    vehicle["options"] = options
    return vehicle

@router.post("/inventory")
async def create_inventory_vehicle(vehicle: InventoryCreate, authorization: Optional[str] = Header(None)):
    """Ajoute un véhicule à l'inventaire et télécharge le Window Sticker automatiquement"""
    user = await get_current_user(authorization)
    
    # Check if stock_no already exists
    existing = await db.inventory.find_one({"stock_no": vehicle.stock_no, "owner_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail=f"Le numéro de stock {vehicle.stock_no} existe déjà dans l'inventaire")
    
    # Check if VIN already exists (if provided)
    if vehicle.vin:
        existing_vin = await db.inventory.find_one({"vin": vehicle.vin, "owner_id": user["id"]})
        if existing_vin:
            raise HTTPException(status_code=400, detail=f"Le VIN {vehicle.vin} existe déjà (Stock #{existing_vin.get('stock_no')})")
    
    # Calculate net_cost
    # NOTE: E.P. FCA inclut DÉJÀ la déduction du holdback, donc net_cost = E.P.
    net_cost = vehicle.ep_cost if vehicle.ep_cost else 0
    
    # ===== TÉLÉCHARGER LE WINDOW STICKER AUTOMATIQUEMENT =====
    window_sticker_available = False
    if vehicle.vin and len(vehicle.vin) == 17:
        try:
            logger.info(f"Téléchargement Window Sticker pour VIN={vehicle.vin}")
            ws_result = await fetch_window_sticker(vehicle.vin, vehicle.brand)
            if ws_result["success"]:
                await save_window_sticker_to_db(vehicle.vin, ws_result["pdf_base64"], user["id"])
                window_sticker_available = True
                logger.info(f"Window Sticker sauvegardé pour VIN={vehicle.vin}")
        except Exception as e:
            logger.warning(f"Erreur téléchargement Window Sticker: {e}")
    
    vehicle_data = InventoryVehicle(
        owner_id=user["id"],
        stock_no=vehicle.stock_no,
        vin=vehicle.vin,
        brand=vehicle.brand,
        model=vehicle.model,
        trim=vehicle.trim,
        body_style=vehicle.body_style,
        year=vehicle.year,
        type=vehicle.type,
        pdco=vehicle.pdco,
        ep_cost=vehicle.ep_cost,
        holdback=vehicle.holdback,
        net_cost=net_cost,
        msrp=vehicle.msrp,
        asking_price=vehicle.asking_price,
        km=vehicle.km,
        color=vehicle.color,
        model_code=(vehicle.model_code or "").upper().strip()
    )
    
    await db.inventory.insert_one(vehicle_data.dict())
    await _save_options(vehicle.stock_no, vehicle.options)
    return {
        "success": True, 
        "vehicle": vehicle_data.dict(), 
        "message": f"Véhicule {vehicle.stock_no} ajouté",
        "window_sticker_available": window_sticker_available
    }

@router.post("/inventory/bulk")
async def create_inventory_bulk(vehicles: List[InventoryCreate], authorization: Optional[str] = Header(None)):
    """Import en masse de véhicules"""
    user = await get_current_user(authorization)
    
    added = 0
    updated = 0
    errors = []
    
    for vehicle in vehicles:
        try:
            # Calculate net_cost
            # NOTE: E.P. FCA inclut DÉJÀ la déduction du holdback, donc net_cost = E.P.
            net_cost = vehicle.ep_cost if vehicle.ep_cost else 0
            
            vehicle_data = {
                "id": str(uuid.uuid4()),
                "owner_id": user["id"],
                "stock_no": vehicle.stock_no,
                "vin": vehicle.vin,
                "brand": vehicle.brand,
                "model": vehicle.model,
                "trim": vehicle.trim,
                "year": vehicle.year,
                "type": vehicle.type,
                "pdco": vehicle.pdco,
                "ep_cost": vehicle.ep_cost,
                "holdback": vehicle.holdback,
                "net_cost": net_cost,
                "msrp": vehicle.msrp,
                "asking_price": vehicle.asking_price,
                "km": vehicle.km,
                "color": vehicle.color,
                "status": "disponible",
                "sold_price": None,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            if (vehicle.model_code or "").strip():
                vehicle_data["model_code"] = vehicle.model_code.upper().strip()

            # Upsert: update if exists, insert if not
            result = await db.inventory.update_one(
                {"stock_no": vehicle.stock_no, "owner_id": user["id"]},
                {"$set": vehicle_data},
                upsert=True
            )
            
            if result.upserted_id:
                added += 1
            else:
                updated += 1
                
        except Exception as e:
            errors.append({"stock_no": vehicle.stock_no, "error": str(e)})
    
    return {
        "success": True,
        "added": added,
        "updated": updated,
        "errors": errors,
        "message": f"{added} ajoutés, {updated} mis à jour"
    }

@router.post("/inventory/shared/model-codes")
async def apply_shared_model_codes(payload: dict = Body(...), dry_run: bool = False,
                                   authorization: Optional[str] = Header(None),
                                   x_admin_password: str = Header(""), x_veille_key: str = Header("")):
    """Corrige le code de modèle et la couleur de l'inventaire Kennebec partagé d'après DealerConnect.

    Chaque entrée : {stock_no, vin (17), model_code et/ou color}. Tout ce qui ne correspond pas exactement (stock + NIV) ou
    n'a pas la forme d'un code est refusé et rapporté ; le reste est appliqué (ou seulement validé si dry_run).
    La correction est gardée dans inventory_overrides : la synchronisation du site ne l'écrase pas.
    """
    from routers.sci import _require_veille
    from services.shared_inventory import plan_code_updates, is_dealerconnect_code
    await _require_veille(authorization, x_admin_password, x_veille_key)
    entries = payload.get("codes")
    if not isinstance(entries, list) or not entries or len(entries) > 500:
        raise HTTPException(status_code=422, detail="codes : liste de 1 à 500 entrées attendue")
    shared = await db.inventory.find({"owner_id": SHARED_OWNER}, {"_id": 0}).to_list(5000)
    await _apply_overrides(shared)
    plan = plan_code_updates(shared, entries, is_dealerconnect_code)
    if not dry_run:
        for change in plan["changes"]:
            field = change["field"]
            await db.inventory.update_one({"stock_no": change["stock_no"], "owner_id": SHARED_OWNER},
                                          {"$set": {field: change["new"], "updated_at": datetime.utcnow()}})
            await db.inventory_overrides.update_one(
                {"stock_no": change["stock_no"]},
                {"$set": {"stock_no": change["stock_no"], "vin": change["vin"], f"fields.{field}": change["new"],
                          "updated_by": "relevé DealerConnect", "updated_at": datetime.utcnow()}}, upsert=True)
    return {"ok": True, "written": not dry_run, "changed": len(plan["changes"]), "unchanged": plan["unchanged"],
            "refused": plan["refused"], "changes": plan["changes"][:200]}


@router.post("/inventory/shared/dealerconnect")
async def replace_dealerconnect_list(payload: dict = Body(...), dry_run: bool = False,
                                     authorization: Optional[str] = Header(None),
                                     x_admin_password: str = Header(""), x_veille_key: str = Header("")):
    """Reçoit la liste complète de DealerConnect (en stock, en route, en construction).

    Chaque entrée : {vin (17), year, model_code, status, description, package, paint, interior,
    paint_name, interior_name, pdsf}. Tout ou rien : la moindre entrée douteuse fait refuser
    la liste, et une liste de moins de 20 véhicules est tenue pour une lecture ratée. Acceptée,
    elle remplace la précédente : un véhicule qui n'y est plus disparaît.
    """
    from routers.sci import _require_veille
    from services import dealerconnect_inventory as dc
    from services.shared_inventory import is_dealerconnect_code
    from vin_utils import validate_vin_checksum
    await _require_veille(authorization, x_admin_password, x_veille_key)
    entries = payload.get("vehicles")
    if not isinstance(entries, list) or not entries or len(entries) > dc.MAX_LIST:
        raise HTTPException(status_code=422, detail=f"vehicles : liste de 1 à {dc.MAX_LIST} entrées attendue")
    plan = dc.plan_list(entries, validate_vin_checksum, is_dealerconnect_code)
    accepted = not plan["refused"] and len(plan["vehicles"]) >= dc.MIN_COMPLETE_LIST
    previous = await db.dealerconnect_vehicles.count_documents({"owner_id": SHARED_OWNER})
    stages: Dict[str, int] = {}
    for vehicle in plan["vehicles"]:
        stages[vehicle["stage"]] = stages.get(vehicle["stage"], 0) + 1
    result = {"ok": accepted, "written": False, "vehicles": len(plan["vehicles"]), "previous_vehicles": previous,
              "stages": stages, "refused": plan["refused"][:200]}
    if not accepted:
        result["reason"] = ("entrées refusées" if plan["refused"]
                            else f"moins de {dc.MIN_COMPLETE_LIST} véhicules : lecture douteuse")
        return result
    if not dry_run:
        now = datetime.utcnow()
        documents = [{**vehicle, "owner_id": SHARED_OWNER, "updated_at": now} for vehicle in plan["vehicles"]]
        await db.dealerconnect_vehicles.delete_many({"owner_id": SHARED_OWNER})
        await db.dealerconnect_vehicles.insert_many(documents)
        result["written"] = True
    return result

@router.put("/inventory/{stock_no}")
async def update_inventory_vehicle(stock_no: str, update: InventoryUpdate, authorization: Optional[str] = Header(None)):
    """Met à jour un véhicule"""
    user = await get_current_user(authorization)
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    if "model_code" in update_data:
        update_data["model_code"] = update_data["model_code"].upper().strip()
    if any(update_data.get(field) for field in SHARED_EDITABLE) and not can_edit_vehicle_identity(user, ADMIN_EMAIL):
        raise HTTPException(status_code=403, detail="Seul un administrateur ou un directeur peut modifier le code de modèle, la version, la carrosserie ou la couleur")
    if update_data.get("trim"):
        # Version choisie à la main : la banque de codes ne la remplacera pas
        update_data["trim_manual"] = True
    update_data["updated_at"] = datetime.utcnow()
    
    # Recalculate net_cost if ep_cost changed
    # NOTE: E.P. FCA inclut DÉJÀ la déduction du holdback, donc net_cost = E.P.
    if "ep_cost" in update_data:
        update_data["net_cost"] = update_data.get("ep_cost", 0)
    
    result = await db.inventory.update_one(
        {"stock_no": stock_no, "owner_id": user["id"]},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        # Fiche de l'inventaire Kennebec partagé : seuls le code de modèle, la
        # version, la carrosserie et la couleur se corrigent, pour tout le monde.
        shared = (await db.inventory.find_one({"stock_no": stock_no, "owner_id": SHARED_OWNER})
                  if sees_shared_inventory(user) else None)
        if not shared:
            raise HTTPException(status_code=404, detail="Véhicule non trouvé")
        fields = {k: v for k, v in update_data.items() if k in SHARED_EDITABLE and v}
        if not fields:
            raise HTTPException(status_code=400, detail="Sur une fiche partagée, seuls le code de modèle, la version, la carrosserie et la couleur se modifient")
        await db.inventory.update_one({"stock_no": stock_no, "owner_id": SHARED_OWNER},
                                      {"$set": {**fields, "updated_at": datetime.utcnow()}})
        await db.inventory_overrides.update_one(
            {"stock_no": stock_no},
            {"$set": {"stock_no": stock_no, "vin": shared.get("vin") or "",
                      **{f"fields.{k}": v for k, v in fields.items()},
                      "updated_by": user.get("email") or user["id"], "updated_at": datetime.utcnow()}},
            upsert=True)

    # Le code ou la version vient de changer : on renvoie la ligne de programme
    # qui s'applique maintenant, pour que le calculateur prenne les bons rabais.
    response: Dict[str, Any] = {"success": True, "message": f"Véhicule {stock_no} mis à jour"}
    try:
        current = _dedupe_by_stock(await db.inventory.find(
            {"stock_no": stock_no, "owner_id": _owners(user)}, {"_id": 0}).to_list(10), user["id"])
        await _apply_overrides(current)
        if current:
            if update_data.get("model_code"):
                response["code_learned"] = await _learn_code(current[0], update_data["model_code"], user)
            await _attach_program_matches(current)
            response["program_match"] = current[0].get("program_match")
            response["model_code"] = current[0].get("model_code")
            response["trim"] = current[0].get("trim") or _title_trim(current[0])
    except Exception as e:
        logger.warning(f"Jumelage après mise à jour impossible: {e}")
    return response

@router.delete("/inventory/{stock_no}")
async def delete_inventory_vehicle(stock_no: str, authorization: Optional[str] = Header(None)):
    """Supprime un véhicule de l'inventaire"""
    user = await get_current_user(authorization)
    
    result = await db.inventory.delete_one({"stock_no": stock_no, "owner_id": user["id"]})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    # Also delete associated options
    await db.vehicle_options.delete_many({"stock_no": stock_no})
    
    return {"success": True, "message": f"Véhicule {stock_no} supprimé"}

@router.put("/inventory/{stock_no}/status")
async def update_vehicle_status(stock_no: str, status: str, sold_price: Optional[float] = None, authorization: Optional[str] = Header(None)):
    """Change le statut d'un véhicule (disponible/réservé/vendu)"""
    user = await get_current_user(authorization)
    
    if status not in ["disponible", "réservé", "vendu"]:
        raise HTTPException(status_code=400, detail="Statut invalide")
    
    update_data = {"status": status, "updated_at": datetime.utcnow()}
    if status == "vendu" and sold_price:
        update_data["sold_price"] = sold_price
    
    result = await db.inventory.update_one(
        {"stock_no": stock_no, "owner_id": user["id"]},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    return {"success": True, "message": f"Statut mis à jour: {status}"}

# Vehicle Options endpoints
@router.post("/inventory/{stock_no}/options")
async def add_vehicle_option(stock_no: str, option: VehicleOption, authorization: Optional[str] = Header(None)):
    """Ajoute une option à un véhicule"""
    user = await get_current_user(authorization)
    
    # Verify vehicle exists and belongs to user
    vehicle = await db.inventory.find_one({"stock_no": stock_no, "owner_id": user["id"]})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    option_data = option.dict()
    option_data["stock_no"] = stock_no
    
    await db.vehicle_options.insert_one(option_data)
    return {"success": True, "message": "Option ajoutée"}

@router.get("/inventory/stats/summary")
async def get_inventory_stats(authorization: Optional[str] = Header(None)):
    """Statistiques d'inventaire"""
    user = await get_current_user(authorization)
    
    vehicles = _dedupe_by_stock(await _on_site_only(
        await db.inventory.find({"owner_id": _owners(user)}, {"_id": 0}).to_list(10000)), user["id"])
    count = lambda key, value: sum(1 for v in vehicles if v.get(key) == value)
    total = len(vehicles)
    disponible = count("status", "disponible")
    reserve = count("status", "réservé")
    vendu = count("status", "vendu")
    neuf = count("type", "neuf")
    occasion = count("type", "occasion")
    available = [v for v in vehicles if v.get("status") == "disponible"]
    totals = {"total_msrp": sum(v.get("msrp") or 0 for v in available),
              "total_cost": sum(v.get("net_cost") or 0 for v in available)}
    
    return {
        "total": total,
        "disponible": disponible,
        "reserve": reserve,
        "vendu": vendu,
        "neuf": neuf,
        "occasion": occasion,
        "total_msrp": totals.get("total_msrp", 0),
        "total_cost": totals.get("total_cost", 0),
        "potential_profit": totals.get("total_msrp", 0) - totals.get("total_cost", 0)
    }

@router.get("/programs/{program_id}/model-codes")
async def get_program_model_codes(program_id: str, authorization: Optional[str] = Header(None)):
    """Codes de modèle qu'une ligne de programme couvre, pour la liste de choix
    du calculateur : codes des véhicules en inventaire associés à cette ligne,
    complétés par le référentiel des codes de produit."""
    user = await get_current_user(authorization)
    program = await db.programs.find_one({"id": program_id}, {"_id": 0})
    if not program:
        raise HTTPException(status_code=404, detail="Programme non trouvé")
    programs = await db.programs.find(
        {"program_month": program.get("program_month"), "program_year": program.get("program_year")},
        {"_id": 0}).to_list(2000)

    def covers(described: Dict[str, Any]) -> bool:
        result = match_program(described, programs)
        if result["program"]:
            return result["program"].get("id") == program_id
        return program_id in [c.get("id") for c in result["candidates"]]

    codes: Dict[str, Dict[str, Any]] = {}

    # 1. Véhicules en inventaire (personnel + Kennebec partagé)
    query = {"owner_id": _owners(user), "status": "disponible", "type": "neuf",
             "year": program.get("year")}
    vehicles = _dedupe_by_stock(await _on_site_only(
        await db.inventory.find(query, {"_id": 0}).to_list(5000)), user["id"])
    await _apply_overrides(vehicles)
    options = await _options_by_stock([v.get("stock_no") for v in vehicles])
    for vehicle in vehicles:
        described = _vehicle_for_matching(vehicle, options.get(vehicle.get("stock_no"), []))
        code = (described.get("code") or "").upper()
        if not code or not covers(described):
            continue
        entry = codes.setdefault(code, {"code": code, "description": "", "in_stock": 0})
        entry["in_stock"] += 1
        if not entry["description"]:
            entry["description"] = " ".join(
                str(x) for x in (vehicle.get("model"), vehicle.get("trim"), vehicle.get("body_style")) if x)

    # 2. Référentiel des codes de produit
    master = codes_for_year(await _reference_codes(), program.get("year"))
    # Le référentiel n'a pas toujours l'année du programme (2027) : les codes
    # se reportent d'une année à l'autre, on prend alors toutes les années.
    brand_low = (program.get("brand") or "").lower()
    has_year = any(str(i.get("year") or "") == str(program.get("year"))
                   and (i.get("brand") or "").lower() == brand_low for i in master.values())
    for code, info in master.items():
        code = code.upper()
        if has_year and str(info.get("year") or "") != str(program.get("year")):
            continue
        if (info.get("brand") or "").lower() != brand_low:
            continue
        described = describe_vehicle(brand=info.get("brand", ""), model=info.get("model", ""),
                                     trim=info.get("trim", ""), year=program.get("year"),
                                     body_style=info.get("cab", ""), code=code, options=[], option_text="")
        if not covers(described):
            continue
        entry = codes.setdefault(code, {"code": code, "description": "", "in_stock": 0})
        if info.get("full_description"):
            entry["description"] = info["full_description"]

    return sorted(codes.values(), key=lambda c: (-c["in_stock"], c["code"]))


async def _decode_vin(vin: str) -> Dict[str, str]:
    """Version, cabine et traction selon le décodeur public de NIV (NHTSA).
    Le résultat est gardé : un NIV ne change pas."""
    vin = (vin or "").upper().strip()
    if len(vin) != 17:
        return {}
    cached = await db.vin_decodes.find_one({"vin": vin}, {"_id": 0})
    if cached:
        return cached
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                f"https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}", params={"format": "json"})
        row = (response.json().get("Results") or [{}])[0]
    except Exception as e:
        logger.warning(f"Décodage du NIV impossible: {e}")
        return {}
    decoded = {
        "vin": vin,
        "trim": (row.get("Trim") or row.get("Series") or "").strip(),
        "cab": (row.get("Series2") if "cab" in (row.get("Series2") or "").lower() else row.get("BodyCabType") or "").strip(),
        "drive": (row.get("DriveType") or "").strip(),
    }
    if decoded["trim"] or decoded["cab"] or decoded["drive"]:
        await db.vin_decodes.update_one({"vin": vin}, {"$set": decoded}, upsert=True)
    return decoded


@router.get("/inventory/{stock_no}/code-suggestions")
async def get_code_suggestions(stock_no: str, trim: Optional[str] = None,
                               authorization: Optional[str] = Header(None)):
    """Codes de modèle possibles pour un véhicule, toutes marques : version lue
    sur la fiche, dans le titre de l'annonce et dans le NIV (ou `trim`, la
    version que l'utilisateur vient de choisir), puis codes de cette version
    dans le référentiel. `needs_code` : aucune possibilité connue, le code est
    à entrer une fois et sera retenu."""
    user = await get_current_user(authorization)
    found = _dedupe_by_stock(await db.inventory.find(
        {"stock_no": stock_no, "owner_id": _owners(user)}, {"_id": 0}).to_list(10), user["id"])
    if not found:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    await _apply_overrides(found)
    vehicle = found[0]
    decoded = await _decode_vin(vehicle.get("vin"))
    title_trim = _title_trim(vehicle)
    master = codes_for_year(await _reference_codes(), vehicle.get("year"))
    programs = await _latest_programs()
    cab = vehicle.get("body_style") or decoded.get("cab") or ""
    drive = decoded.get("drive") or ""
    chosen = (trim or "").strip()
    trims = [chosen] if chosen else [vehicle.get("trim"), decoded.get("trim"), title_trim]
    codes = suggest_codes(master, vehicle.get("brand"), vehicle.get("model"), trims, cab, drive)
    source = "version"
    if not codes:
        # Version absente du référentiel (Express, Warlock...) : codes des
        # versions de la même ligne de programme.
        described = dict(vehicle, trim=chosen) if chosen else vehicle
        result = match_program(_vehicle_for_matching(described, []), programs)
        line = result["program"] or (result["candidates"][0] if len(result["candidates"]) == 1 else None)
        if line:
            codes = suggest_codes(master, vehicle.get("brand"), vehicle.get("model"),
                                  trims_of_program(line), cab, drive)
            source = "programme"
    return {
        "stock_no": stock_no,
        "trim": chosen or vehicle.get("trim") or decoded.get("trim") or title_trim,
        "title_trim": title_trim,
        "vin_trim": decoded.get("trim") or "",
        "cab": decoded.get("cab") or vehicle.get("body_style") or "",
        "drive": drive,
        "source": source,
        "codes": [{"code": c["code"], "description": c["description"]} for c in codes],
        "needs_code": not codes,
        "known_trims": known_trims(master, vehicle.get("brand"), vehicle.get("model"), programs),
    }


# Product codes reference
@router.get("/product-codes")
async def get_product_codes():
    """Récupère le référentiel des codes produits (depuis fichier JSON + DB)"""
    # D'abord, charger depuis le fichier JSON master
    all_codes = {}
    
    try:
        import json
        with open('data/master_product_codes.json', 'r') as f:
            master_codes = json.load(f)
            for code, info in master_codes.items():
                all_codes[code] = {
                    "code": code,
                    "brand": info.get("brand", ""),
                    "model": info.get("model", ""),
                    "trim": info.get("trim", ""),
                    "year": info.get("year", ""),
                    "cab": info.get("cab", ""),
                    "drive": info.get("drive", ""),
                    "full_description": info.get("full_description", "")
                }
    except Exception as e:
        print(f"Erreur chargement master_product_codes.json: {e}")
    
    # Ensuite, charger depuis MongoDB (priorité aux données DB)
    try:
        async for code_doc in db.product_codes.find({}, {"_id": 0}):
            code = code_doc.get("code")
            if code:
                all_codes[code] = code_doc
    except Exception as e:
        print(f"Erreur chargement DB: {e}")
    
    return list(all_codes.values())

@router.post("/product-codes")
async def add_product_code(code: ProductCode, authorization: Optional[str] = Header(None)):
    """Ajoute un code produit au référentiel"""
    await require_admin(authorization)
    
    await db.product_codes.update_one(
        {"code": code.code},
        {"$set": code.dict()},
        upsert=True
    )
    return {"success": True, "message": f"Code {code.code} ajouté"}

@router.get("/product-codes/{code}/financing")
async def get_product_code_financing(
    code: str,
    year: Optional[int] = None,
    brand: Optional[str] = None,
    model: Optional[str] = None,
    trim: Optional[str] = None,
    stock_no: Optional[str] = None,
):
    """
    Promotions qui s'appliquent à un code de produit, lues dans le programme
    du mois en cours (codes inclus, codes exclus et forfaits CPOS respectés).
    Si plusieurs lignes restent possibles, aucune promotion n'est retournée
    et les lignes candidates sont listées.
    """
    code = code.upper().strip()

    programs = await _latest_programs()
    if programs:
        options = (await _options_by_stock([stock_no])).get(stock_no, []) if stock_no else []
        master = lookup_product_code(code, year, [o.get("product_code") for o in options]) or {}
        vehicle = _vehicle_for_matching({
            "model_code": code,
            "brand": brand or master.get("brand", ""),
            "model": model or master.get("model", ""),
            "trim": trim if trim is not None else master.get("trim", ""),
            "year": year or master.get("year"),
        }, options)
        result = match_program(vehicle, programs)
        financing = _financing_from_program(result["program"]) if result["program"] else None
        return {
            "success": True,
            "code": code,
            "vehicle": {k: master.get(k, "") for k in ("brand", "model", "trim", "year", "cab", "drive")},
            "financing": financing,
            "has_financing": financing is not None,
            "certain": result["certain"],
            "reason": result["reason"],
            "candidates": [
                {"id": c.get("id"), "model": c.get("model"), "trim": c.get("trim"),
                 "consumer_cash": c.get("consumer_cash", 0)} for c in result["candidates"]
            ],
        }

    # Aucun programme en base : ancien fichier figé (février 2026)
    full_info = get_full_vehicle_info(code)
    
    if not full_info:
        raise HTTPException(status_code=404, detail=f"Code produit '{code}' non trouvé")
    
    return {
        "success": True,
        "code": code,
        "vehicle": full_info.get("vehicle", {}),
        "financing": full_info.get("financing"),
        "has_financing": full_info.get("financing") is not None
    }

@router.get("/financing/lookup")
async def lookup_financing_by_vehicle(
    brand: Optional[str] = None,
    model: Optional[str] = None,
    trim: Optional[str] = None,
    year: Optional[str] = None
):
    """
    Recherche les programmes de financement par marque/modèle/trim/année.
    Retourne tous les codes produits correspondants avec leurs promotions.
    """
    results = []
    
    for code, data in _CODE_PROGRAM_MAPPING.items():
        vehicle = data.get("vehicle", {})
        financing = data.get("financing", {})
        
        # Filtrer par critères
        if brand and vehicle.get("brand", "").lower() != brand.lower():
            continue
        if model and model.lower() not in vehicle.get("model", "").lower():
            continue
        if trim and trim.lower() not in vehicle.get("trim", "").lower():
            continue
        if year and vehicle.get("year") != year:
            continue
        
        results.append({
            "code": code,
            "vehicle": vehicle,
            "financing": {
                "consumer_cash": financing.get("consumer_cash", 0),
                "bonus_cash": financing.get("bonus_cash", 0),
                "total_rebates": financing.get("consumer_cash", 0) + financing.get("bonus_cash", 0),
                "option1_available": any(v for v in financing.get("option1_rates", {}).values() if v is not None),
                "option2_available": any(v for v in financing.get("option2_rates", {}).values() if v is not None)
            }
        })
    
    # Trier par total rebates (descending)
    results.sort(key=lambda x: x["financing"]["total_rebates"], reverse=True)
    
    return {
        "success": True,
        "count": len(results),
        "results": results[:50]  # Limiter à 50 résultats
    }

@router.get("/financing/summary")
async def get_financing_summary():
    """
    Retourne un résumé des programmes de financement disponibles.
    Utile pour afficher les meilleures offres.
    """
    by_brand = {}
    best_deals = []
    
    for code, data in _CODE_PROGRAM_MAPPING.items():
        vehicle = data.get("vehicle", {})
        financing = data.get("financing", {})
        brand = vehicle.get("brand", "Unknown")
        
        if brand not in by_brand:
            by_brand[brand] = {
                "count": 0,
                "max_consumer_cash": 0,
                "max_bonus_cash": 0,
                "models": set()
            }
        
        by_brand[brand]["count"] += 1
        by_brand[brand]["max_consumer_cash"] = max(
            by_brand[brand]["max_consumer_cash"],
            financing.get("consumer_cash", 0)
        )
        by_brand[brand]["max_bonus_cash"] = max(
            by_brand[brand]["max_bonus_cash"],
            financing.get("bonus_cash", 0)
        )
        by_brand[brand]["models"].add(vehicle.get("model", ""))
        
        # Collecter les meilleures offres
        total_rebate = financing.get("consumer_cash", 0) + financing.get("bonus_cash", 0)
        if total_rebate > 5000:
            best_deals.append({
                "code": code,
                "brand": brand,
                "model": vehicle.get("model", ""),
                "trim": vehicle.get("trim", ""),
                "total_rebate": total_rebate,
                "consumer_cash": financing.get("consumer_cash", 0),
                "bonus_cash": financing.get("bonus_cash", 0)
            })
    
    # Convertir les sets en listes
    for brand in by_brand:
        by_brand[brand]["models"] = list(by_brand[brand]["models"])
    
    # Trier les meilleures offres
    best_deals.sort(key=lambda x: x["total_rebate"], reverse=True)
    
    return {
        "success": True,
        "total_codes": len(_CODE_PROGRAM_MAPPING),
        "by_brand": by_brand,
        "best_deals": best_deals[:10]
    }

