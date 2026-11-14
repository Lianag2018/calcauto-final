from fastapi import APIRouter, HTTPException, Header
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
import json
from database import db, logger
from models import (
    InventoryVehicle, InventoryCreate, InventoryUpdate,
    VehicleOption, ProductCode
)
from dependencies import get_current_user, require_admin
from services.window_sticker import fetch_window_sticker, save_window_sticker_to_db
from routers.invoice import get_full_vehicle_info, _CODE_PROGRAM_MAPPING
from product_code_lookup import lookup_product_code
from services.program_matching import describe_vehicle, match_program, is_model_code

router = APIRouter()


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


def _vehicle_for_matching(vehicle: Dict[str, Any], options: List[Dict[str, Any]]) -> Dict[str, Any]:
    code = (vehicle.get("model_code") or "").upper().strip()
    codes = [str(o.get("product_code") or "").upper().strip() for o in options]
    if not code:
        # Sur la facture, la première ligne d'options est le code de produit
        code = next((c for c in codes[:1] if is_model_code(c)), "")
    master = lookup_product_code(code) if code else None
    return describe_vehicle(
        brand=vehicle.get("brand") or (master or {}).get("brand", ""),
        model=vehicle.get("model") or (master or {}).get("model", ""),
        trim=vehicle.get("trim") or (master or {}).get("trim", ""),
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
    """Récupère l'inventaire de l'utilisateur avec filtres optionnels"""
    user = await get_current_user(authorization)
    
    query = {"owner_id": user["id"]}
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

    try:
        await _attach_program_matches(vehicles)
    except Exception as e:
        logger.warning(f"Association inventaire -> programme impossible: {e}")

    return vehicles

@router.get("/inventory/{stock_no}")
async def get_inventory_vehicle(stock_no: str, authorization: Optional[str] = Header(None)):
    """Récupère un véhicule par numéro de stock"""
    user = await get_current_user(authorization)
    
    vehicle = await db.inventory.find_one(
        {"stock_no": stock_no, "owner_id": user["id"]},
        {"_id": 0}
    )
    
    if not vehicle:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
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

@router.put("/inventory/{stock_no}")
async def update_inventory_vehicle(stock_no: str, update: InventoryUpdate, authorization: Optional[str] = Header(None)):
    """Met à jour un véhicule"""
    user = await get_current_user(authorization)
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    if "model_code" in update_data:
        update_data["model_code"] = update_data["model_code"].upper().strip()
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
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    return {"success": True, "message": f"Véhicule {stock_no} mis à jour"}

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
    
    total = await db.inventory.count_documents({"owner_id": user["id"]})
    disponible = await db.inventory.count_documents({"owner_id": user["id"], "status": "disponible"})
    reserve = await db.inventory.count_documents({"owner_id": user["id"], "status": "réservé"})
    vendu = await db.inventory.count_documents({"owner_id": user["id"], "status": "vendu"})
    neuf = await db.inventory.count_documents({"owner_id": user["id"], "type": "neuf"})
    occasion = await db.inventory.count_documents({"owner_id": user["id"], "type": "occasion"})
    
    # Calculate total value
    pipeline = [
        {"$match": {"owner_id": user["id"], "status": "disponible"}},
        {"$group": {"_id": None, "total_msrp": {"$sum": "$msrp"}, "total_cost": {"$sum": "$net_cost"}}}
    ]
    result = await db.inventory.aggregate(pipeline).to_list(1)
    totals = result[0] if result else {"total_msrp": 0, "total_cost": 0}
    
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
        master = lookup_product_code(code) or {}
        options = (await _options_by_stock([stock_no])).get(stock_no, []) if stock_no else []
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

