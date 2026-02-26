from fastapi import APIRouter, HTTPException, Header, UploadFile, File
from fastapi.responses import FileResponse
from typing import Optional, List, Dict, Any
from datetime import datetime
from pathlib import Path
from database import db, ADMIN_EMAIL, ROOT_DIR, logger
from dependencies import get_current_user, require_admin

router = APIRouter()


# ============ Other Admin Endpoints ============

@router.get("/admin/users")
async def get_all_users(authorization: Optional[str] = Header(None)):
    """Récupère tous les utilisateurs (admin seulement)"""
    await require_admin(authorization)
    
    users = []
    async for user in db.users.find({}, {"_id": 0, "password_hash": 0}):
        user_id = user.get("id")
        
        # Count contacts and submissions for this user
        contacts_count = await db.contacts.count_documents({"owner_id": user_id})
        submissions_count = await db.submissions.count_documents({"owner_id": user_id})
        
        users.append({
            "id": user_id,
            "name": user.get("name", ""),
            "email": user.get("email", ""),
            "created_at": user.get("created_at", datetime.utcnow()).isoformat() if user.get("created_at") else None,
            "last_login": user.get("last_login").isoformat() if user.get("last_login") else None,
            "is_blocked": user.get("is_blocked", False),
            "is_admin": user.get("is_admin", False) or user.get("email") == ADMIN_EMAIL,
            "contacts_count": contacts_count,
            "submissions_count": submissions_count
        })
    
    return users

@router.put("/admin/users/{user_id}/block")
async def block_user(user_id: str, authorization: Optional[str] = Header(None)):
    """Bloque un utilisateur (admin seulement)"""
    admin = await require_admin(authorization)
    
    # Cannot block yourself
    if admin.get("id") == user_id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous bloquer vous-même")
    
    # Find user
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Cannot block an admin
    if user.get("email") == ADMIN_EMAIL or user.get("is_admin", False):
        raise HTTPException(status_code=400, detail="Impossible de bloquer un administrateur")
    
    # Block user
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_blocked": True}}
    )
    
    # Delete all tokens for this user (force logout)
    await db.tokens.delete_many({"user_id": user_id})
    
    return {"success": True, "message": f"Utilisateur {user.get('name')} bloqué"}

@router.put("/admin/users/{user_id}/unblock")
async def unblock_user(user_id: str, authorization: Optional[str] = Header(None)):
    """Débloque un utilisateur (admin seulement)"""
    await require_admin(authorization)
    
    # Find user
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Unblock user
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_blocked": False}}
    )
    
    return {"success": True, "message": f"Utilisateur {user.get('name')} débloqué"}

@router.get("/admin/stats")
async def get_admin_stats(authorization: Optional[str] = Header(None)):
    """Récupère les statistiques globales (admin seulement)"""
    await require_admin(authorization)
    
    total_users = await db.users.count_documents({})
    blocked_users = await db.users.count_documents({"is_blocked": True})
    total_contacts = await db.contacts.count_documents({})
    total_submissions = await db.submissions.count_documents({})
    
    return {
        "total_users": total_users,
        "active_users": total_users - blocked_users,
        "blocked_users": blocked_users,
        "total_contacts": total_contacts,
        "total_submissions": total_submissions
    }


# ============ Parsing Metrics & Monitoring ============

@router.get("/admin/parsing-stats")
async def get_parsing_stats(authorization: Optional[str] = Header(None)):
    """
    Statistiques de parsing en temps réel (admin seulement)
    
    Retourne:
    - total_scans: nombre total de scans
    - auto_rate: % auto-approved (score >= 85)
    - review_rate: % review required (60-84)
    - vision_rate: % vision fallback (< 60)
    - avg_score: score moyen
    - avg_time_sec: temps moyen de traitement
    - quality_alert: True si qualité en baisse
    """
    await require_admin(authorization)
    
    try:
        total = await db.parsing_metrics.count_documents({})
        
        if total == 0:
            return {
                "total_scans": 0,
                "auto_rate": 0,
                "review_rate": 0,
                "vision_rate": 0,
                "avg_score": 0,
                "avg_time_sec": 0,
                "quality_alert": False,
                "message": "Aucun scan enregistré"
            }
        
        auto = await db.parsing_metrics.count_documents({"status": "auto"})
        review = await db.parsing_metrics.count_documents({"status": "review"})
        vision = await db.parsing_metrics.count_documents({"status": "vision"})
        
        # Aggregations pour moyennes
        avg_score_result = await db.parsing_metrics.aggregate([
            {"$group": {"_id": None, "avg": {"$avg": "$score"}}}
        ]).to_list(1)
        
        avg_time_result = await db.parsing_metrics.aggregate([
            {"$group": {"_id": None, "avg": {"$avg": "$duration_sec"}}}
        ]).to_list(1)
        
        avg_score = round(avg_score_result[0]["avg"], 2) if avg_score_result else 0
        avg_time = round(avg_time_result[0]["avg"], 2) if avg_time_result else 0
        
        auto_rate = round(auto / total * 100, 2)
        review_rate = round(review / total * 100, 2)
        vision_rate = round(vision / total * 100, 2)
        
        # Détection dérive qualité
        quality_alert = auto_rate < 70 or avg_score < 80
        
        return {
            "total_scans": total,
            "auto_rate": auto_rate,
            "review_rate": review_rate,
            "vision_rate": vision_rate,
            "avg_score": avg_score,
            "avg_time_sec": avg_time,
            "quality_alert": quality_alert,
            "breakdown": {
                "auto_approved": auto,
                "review_required": review,
                "vision_fallback": vision
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting parsing stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/parsing-history")
async def get_parsing_history(
    days: int = 7,
    authorization: Optional[str] = Header(None)
):
    """
    Historique des métriques de parsing sur N jours (admin seulement)
    
    Retourne les stats agrégées par jour
    """
    await require_admin(authorization)
    
    try:
        from_date = datetime.now() - timedelta(days=days)
        
        pipeline = [
            {"$match": {"timestamp": {"$gte": from_date}}},
            {"$group": {
                "_id": {
                    "year": {"$year": "$timestamp"},
                    "month": {"$month": "$timestamp"},
                    "day": {"$dayOfMonth": "$timestamp"}
                },
                "total": {"$sum": 1},
                "avg_score": {"$avg": "$score"},
                "avg_duration": {"$avg": "$duration_sec"},
                "auto_count": {"$sum": {"$cond": [{"$eq": ["$status", "auto"]}, 1, 0]}},
                "review_count": {"$sum": {"$cond": [{"$eq": ["$status", "review"]}, 1, 0]}},
                "vision_count": {"$sum": {"$cond": [{"$eq": ["$status", "vision"]}, 1, 0]}}
            }},
            {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}}
        ]
        
        results = await db.parsing_metrics.aggregate(pipeline).to_list(100)
        
        history = []
        for r in results:
            date_str = f"{r['_id']['year']}-{r['_id']['month']:02d}-{r['_id']['day']:02d}"
            history.append({
                "date": date_str,
                "total": r["total"],
                "avg_score": round(r["avg_score"], 2) if r["avg_score"] else 0,
                "avg_duration_sec": round(r["avg_duration"], 2) if r["avg_duration"] else 0,
                "auto_rate": round(r["auto_count"] / r["total"] * 100, 2) if r["total"] else 0,
                "review_rate": round(r["review_count"] / r["total"] * 100, 2) if r["total"] else 0,
                "vision_rate": round(r["vision_count"] / r["total"] * 100, 2) if r["total"] else 0
            })
        
        return {
            "period_days": days,
            "history": history
        }
        
    except Exception as e:
        logger.error(f"Error getting parsing history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ User Scan History Endpoints (Non-Admin) ============

@router.get("/scans/history")
async def get_user_scan_history(
    limit: int = 50,
    authorization: Optional[str] = Header(None)
):
    """
    Historique des scans de factures pour l'utilisateur connecté
    
    Retourne les derniers scans avec détails (VIN, score, méthode, coût)
    """
    user = await get_current_user(authorization)
    
    try:
        # Récupérer les derniers scans de l'utilisateur
        cursor = db.parsing_metrics.find(
            {"owner_id": user["id"]},
            {"_id": 0}
        ).sort("timestamp", -1).limit(limit)
        
        scans = []
        async for scan in cursor:
            scans.append({
                "timestamp": scan.get("timestamp").isoformat() if scan.get("timestamp") else None,
                "vin": scan.get("vin", ""),
                "stock_no": scan.get("stock_no", ""),
                "brand": scan.get("brand", ""),
                "model": scan.get("model", ""),
                "ep_cost": scan.get("ep_cost", 0),
                "pdco": scan.get("pdco", 0),
                "score": scan.get("score", 0),
                "status": scan.get("status", "unknown"),
                "parse_method": scan.get("parse_method", "unknown"),
                "duration_sec": round(scan.get("duration_sec", 0), 2),
                "cost_estimate": scan.get("cost_estimate", 0),
                "vin_valid": scan.get("vin_valid", False),
                "success": scan.get("success", True)
            })
        
        return {
            "count": len(scans),
            "scans": scans
        }
        
    except Exception as e:
        logger.error(f"Error getting user scan history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scans/stats")

@router.get("/scans/stats")
async def get_user_scan_stats(
    days: int = 30,
    authorization: Optional[str] = Header(None)
):
    """
    Statistiques de scans pour l'utilisateur connecté
    
    Retourne:
    - total_scans: nombre total de scans
    - success_rate: % de scans réussis (score >= 70)
    - avg_score: score de confiance moyen
    - avg_duration: temps moyen de traitement
    - total_cost: coût estimé total
    - methods_breakdown: répartition par méthode (tesseract, google_vision)
    """
    user = await get_current_user(authorization)
    
    try:
        from_date = datetime.now() - timedelta(days=days)
        
        # Filtrer par utilisateur et période
        match_filter = {
            "owner_id": user["id"],
            "timestamp": {"$gte": from_date}
        }
        
        # Compter total
        total = await db.parsing_metrics.count_documents(match_filter)
        
        if total == 0:
            return {
                "period_days": days,
                "total_scans": 0,
                "success_rate": 0,
                "avg_score": 0,
                "avg_duration_sec": 0,
                "total_cost_estimate": 0,
                "methods_breakdown": {},
                "message": "Aucun scan dans cette période"
            }
        
        # Aggregation pour statistiques
        pipeline = [
            {"$match": match_filter},
            {"$group": {
                "_id": None,
                "total": {"$sum": 1},
                "avg_score": {"$avg": "$score"},
                "avg_duration": {"$avg": "$duration_sec"},
                "total_cost": {"$sum": {"$ifNull": ["$cost_estimate", 0]}},
                "success_count": {"$sum": {"$cond": [{"$gte": ["$score", 70]}, 1, 0]}},
                "google_vision_count": {"$sum": {"$cond": [{"$regexMatch": {"input": {"$ifNull": ["$parse_method", ""]}, "regex": "google_vision"}}, 1, 0]}},
                "tesseract_count": {"$sum": {"$cond": [{"$regexMatch": {"input": {"$ifNull": ["$parse_method", ""]}, "regex": "tesseract|pdfplumber"}}, 1, 0]}},
                "gpt4_vision_count": {"$sum": {"$cond": [{"$regexMatch": {"input": {"$ifNull": ["$parse_method", ""]}, "regex": "vision_optimized"}}, 1, 0]}}
            }}
        ]
        
        results = await db.parsing_metrics.aggregate(pipeline).to_list(1)
        
        if results:
            r = results[0]
            return {
                "period_days": days,
                "total_scans": r["total"],
                "success_rate": round(r["success_count"] / r["total"] * 100, 1) if r["total"] else 0,
                "avg_score": round(r["avg_score"], 1) if r["avg_score"] else 0,
                "avg_duration_sec": round(r["avg_duration"], 2) if r["avg_duration"] else 0,
                "total_cost_estimate": round(r["total_cost"], 4),
                "cost_savings_vs_gpt4": round(r["google_vision_count"] * 0.0185, 2),  # Économie par rapport à GPT-4
                "methods_breakdown": {
                    "google_vision_hybrid": r["google_vision_count"],
                    "tesseract_pdfplumber": r["tesseract_count"],
                    "gpt4_vision": r["gpt4_vision_count"]
                },
                "free_quota_remaining": max(0, 1000 - r["google_vision_count"])  # 1000 gratuits/mois Google
            }
        
        return {"period_days": days, "total_scans": 0, "message": "Pas de données"}
        
    except Exception as e:
        logger.error(f"Error getting user scan stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/debug/camscanner-preview")
async def get_camscanner_preview():
    """Retourne l'image prétraitée par CamScanner"""
    file_path = Path(__file__).parent / "static" / "facture_camscanner.jpg"
    if file_path.exists():
        return FileResponse(file_path, media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="Image not found")

@router.get("/debug/original-preview")
async def get_original_preview():
    """Retourne l'image originale"""
    file_path = Path(__file__).parent / "static" / "facture_originale.jpg"
    if file_path.exists():
        return FileResponse(file_path, media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="Image not found")

