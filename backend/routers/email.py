from fastapi import APIRouter, HTTPException, Header
from typing import Optional, Dict, Any
from datetime import datetime
import base64
import json
from database import db, ROOT_DIR, SMTP_EMAIL, logger
from models import SendCalculationEmailRequest, SendReportEmailRequest
from dependencies import get_current_user, get_optional_user, get_rate_for_term
from services.email_service import send_email
from services.window_sticker import (
    fetch_window_sticker, save_window_sticker_to_db,
    convert_pdf_to_images, WINDOW_STICKER_URLS
)

router = APIRouter()

def generate_lease_email_html(lease_data, freq, freq_label, fmt, fmt2):
    """Génère le HTML pour la section Location SCI dans l'email."""
    if not lease_data:
        return ""
    
    term = lease_data.get('term', 0)
    km_per_year = lease_data.get('km_per_year', 24000)
    residual_pct = lease_data.get('residual_pct', 0)
    residual_value = lease_data.get('residual_value', 0)
    km_adj = lease_data.get('km_adjustment', 0)
    best_lease = lease_data.get('best_lease', '')
    lease_savings = lease_data.get('lease_savings', 0)
    standard = lease_data.get('standard')
    alternative = lease_data.get('alternative')
    
    if not standard and not alternative:
        return ""
    
    def get_payment(option_data):
        if not option_data:
            return 0
        if freq == 'weekly':
            return option_data.get('weekly', 0)
        elif freq == 'biweekly':
            return option_data.get('biweekly', 0)
        return option_data.get('monthly', 0)
    
    # Best choice banner
    best_banner = ""
    if best_lease and standard and alternative:
        best_label = "Std + Lease Cash" if best_lease == 'standard' else "Taux Alternatif"
        savings_text = f"<div style='font-size:13px; color:#F57F17; margin-top:4px;'>Économies de <strong>{fmt(round(lease_savings))} $</strong></div>" if lease_savings > 0 else ""
        best_banner = f"""
        <div style="background:#fffde7; border:2px solid #FFD700; border-radius:8px; padding:12px; text-align:center; margin:10px 0;">
            <div style="font-size:16px; font-weight:bold; color:#F57F17;">🏆 {best_label} = Meilleur choix location!</div>
            {savings_text}
        </div>
        """
    
    # Standard option card
    std_card = ""
    if standard:
        std_payment = get_payment(standard)
        std_winner = "border-color:#FFD700; background:#fffff0;" if best_lease == 'standard' else ""
        std_badge = '<span style="display:inline-block; background:#FFD700; color:#000; font-size:10px; padding:2px 8px; border-radius:10px; margin-left:5px;">✓</span>' if best_lease == 'standard' else ""
        lease_cash_row = f"<div style='display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;'><span style='color:#666;'>Lease Cash:</span><span style='color:#2E7D32; font-weight:600;'>-{fmt(round(standard.get('lease_cash', 0)))} $</span></div>" if standard.get('lease_cash', 0) > 0 else ""
        std_card = f"""
        <div style="flex:1; border:2px solid #ddd; border-radius:8px; padding:15px; background:#fafafa; {std_winner}">
            <div style="font-size:15px; font-weight:bold; color:#E65100; margin-bottom:8px;">Std + Lease Cash {std_badge}</div>
            {lease_cash_row}
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;"><span style="color:#666;">Taux:</span><span style="color:#E65100; font-weight:600;">{standard.get('rate', 0)}%</span></div>
            <div style="background:#fff5ee; border-radius:6px; padding:12px; text-align:center; margin-top:10px; border-top:3px solid #E65100;">
                <div style="font-size:12px; color:#666;">{freq_label}</div>
                <div style="font-size:24px; font-weight:bold; color:#E65100; margin:5px 0;">{fmt2(std_payment)} $</div>
                <div style="font-size:12px; color:#666;">Total ({term} mois): <strong>{fmt(round(standard.get('total', 0)))} $</strong></div>
            </div>
        </div>
        """
    
    # Alternative option card
    alt_card = ""
    if alternative:
        alt_payment = get_payment(alternative)
        alt_winner = "border-color:#FFD700; background:#fffff0;" if best_lease == 'alternative' else ""
        alt_badge = '<span style="display:inline-block; background:#FFD700; color:#000; font-size:10px; padding:2px 8px; border-radius:10px; margin-left:5px;">✓</span>' if best_lease == 'alternative' else ""
        alt_card = f"""
        <div style="flex:1; border:2px solid #ddd; border-radius:8px; padding:15px; background:#fafafa; {alt_winner}">
            <div style="font-size:15px; font-weight:bold; color:#0277BD; margin-bottom:8px;">Taux Alternatif {alt_badge}</div>
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;"><span style="color:#666;">Lease Cash:</span><span>$0</span></div>
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;"><span style="color:#666;">Taux:</span><span style="color:#0277BD; font-weight:600;">{alternative.get('rate', 0)}%</span></div>
            <div style="background:#f0f7ff; border-radius:6px; padding:12px; text-align:center; margin-top:10px; border-top:3px solid #0277BD;">
                <div style="font-size:12px; color:#666;">{freq_label}</div>
                <div style="font-size:24px; font-weight:bold; color:#0277BD; margin:5px 0;">{fmt2(alt_payment)} $</div>
                <div style="font-size:12px; color:#666;">Total ({term} mois): <strong>{fmt(round(alternative.get('total', 0)))} $</strong></div>
            </div>
        </div>
        """
    
    km_adj_text = f" (+{km_adj}%)" if km_adj > 0 else ""
    
    return f"""
    <div style="margin-top:25px; border-top:2px solid #FFD700; padding-top:20px;">
        <div style="font-size:12px; color:#666; text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
            📋 Location SCI
        </div>
        
        <table style="width:100%; border-collapse:collapse; margin-bottom:12px;">
            <tr><td style="padding:8px 0; border-bottom:1px solid #eee; color:#666;">Kilométrage / an</td><td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right; font-weight:600;">{int(km_per_year/1000)}k km</td></tr>
            <tr><td style="padding:8px 0; border-bottom:1px solid #eee; color:#666;">Terme location</td><td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right; font-weight:600;">{term} mois</td></tr>
            <tr><td style="padding:8px 0; border-bottom:1px solid #eee; color:#666;">Résiduel</td><td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right; font-weight:600;">{residual_pct}%{km_adj_text} = {fmt(round(residual_value))} $</td></tr>
        </table>
        
        {best_banner}
        
        <div style="display:flex; gap:10px;">
            {std_card}
            {alt_card}
        </div>
    </div>
    """


def generate_window_sticker_html(vin: str, images: list, pdf_url: str, pdf_bytes: bytes = None) -> str:
    """
    Génère le HTML pour afficher le Window Sticker avec l'image du PDF.
    L'image utilise CID (Content-ID) pour un meilleur support Gmail.
    """
    if not vin or len(vin) != 17:
        return ""
    
    # Si on a des images converties du PDF, les afficher avec CID
    if images and len(images) > 0:
        # Utiliser CID au lieu de data: pour Gmail compatibility
        cid = f"windowsticker_{vin}"
        
        return f'''
            <div style="margin-top: 25px; page-break-inside: avoid;">
                <div style="text-align: center; margin-bottom: 10px;">
                    <span style="font-size: 14px; font-weight: bold; color: #333;">📋 Window Sticker Officiel</span>
                    <br/>
                    <span style="font-size: 12px; color: #666;">VIN: {vin}</span>
                </div>
                <div style="text-align: center; border: 1px solid #ddd; border-radius: 8px; padding: 10px; background: #fff;">
                    <img src="cid:{cid}" 
                         alt="Window Sticker {vin}" 
                         style="max-width: 100%; height: auto; border-radius: 4px;" />
                </div>
                <div style="text-align: center; margin-top: 10px;">
                    <a href="{pdf_url}" 
                       style="display: inline-block; background: #1565C0; color: white; padding: 8px 20px; text-decoration: none; border-radius: 5px; font-size: 13px;">
                        📥 Télécharger le PDF
                    </a>
                </div>
            </div>
        '''
    
    # Fallback: pas d'images, juste le lien
    elif pdf_url:
        return f'''
            <div style="margin-top: 25px;">
                <div style="background: #e8f4fd; border: 1px solid #2196F3; border-radius: 6px; padding: 15px; text-align: center;">
                    <p style="margin: 0 0 10px 0; color: #1565C0; font-weight: bold;">📋 Window Sticker Officiel</p>
                    <p style="margin: 0 0 10px 0; font-size: 12px; color: #666;">VIN: {vin}</p>
                    <a href="{pdf_url}" 
                       style="display: inline-block; background: #1565C0; color: white; padding: 10px 25px; text-decoration: none; border-radius: 5px; font-size: 14px;">
                        📥 Voir le Window Sticker
                    </a>
                </div>
            </div>
        '''
    
    return ""



# ============ WINDOW STICKER ENDPOINT ============

@router.get("/window-sticker/{vin}")
async def get_window_sticker(vin: str, authorization: Optional[str] = Header(None)):
    """
    Récupère le Window Sticker PDF pour un VIN.
    Télécharge depuis Chrysler/Jeep/Dodge/Ram et stocke dans MongoDB.
    """
    user = await get_current_user(authorization)
    
    # Vérifier si déjà en cache dans MongoDB
    cached = await db.window_stickers.find_one({"vin": vin}, {"_id": 0, "pdf_base64": 0})
    if cached:
        logger.info(f"Window Sticker trouvé en cache pour VIN={vin}")
        return {
            "success": True,
            "cached": True,
            "vin": vin,
            "pdf_url": f"/api/window-sticker/{vin}/pdf",
            "size_bytes": cached.get("size_bytes", 0)
        }
    
    # Télécharger depuis Chrysler/Stellantis
    result = await fetch_window_sticker(vin)
    
    if result["success"]:
        # Sauvegarder dans MongoDB
        await save_window_sticker_to_db(vin, result["pdf_base64"], user["id"])
        
        return {
            "success": True,
            "cached": False,
            "vin": vin,
            "pdf_url": f"/api/window-sticker/{vin}/pdf",
            "size_bytes": result["size_bytes"],
            "source": result.get("brand_source", "stellantis")
        }
    
    return {"success": False, "error": result.get("error", "Window Sticker non disponible")}


@router.get("/window-sticker/{vin}/pdf")
async def get_window_sticker_pdf(vin: str):
    """
    Retourne le PDF du Window Sticker (depuis MongoDB).
    """
    from fastapi.responses import Response
    
    doc = await db.window_stickers.find_one({"vin": vin})
    
    if not doc or "pdf_base64" not in doc:
        raise HTTPException(status_code=404, detail="Window Sticker non trouvé")
    
    pdf_bytes = base64.b64decode(doc["pdf_base64"])
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=WindowSticker_{vin}.pdf"
        }
    )


@router.post("/send-calculation-email")
async def send_calculation_email(request: SendCalculationEmailRequest, authorization: Optional[str] = Header(None)):
    """Envoie un calcul de financement par email avec Window Sticker en pièce jointe et CC à l'utilisateur"""
    try:
        # Récupérer l'email de l'utilisateur connecté pour le CC
        user_email = None
        if authorization:
            try:
                user = await get_current_user(authorization)
                if user:
                    user_email = user.get("email")
                    logger.info(f"Email CC sera envoyé à: {user_email}")
            except:
                pass
        
        vehicle = request.vehicle_info
        calc = request.calculation_results
        term = request.selected_term
        freq = request.payment_frequency
        rates = request.rates_table
        fees = request.fees
        trade = request.trade_in
        
        # ============ WINDOW STICKER ============
        window_sticker_pdf = None
        window_sticker_images = []  # Liste des images converties du PDF
        window_sticker_url = None
        vin = request.vin or vehicle.get("vin", "")
        
        if request.include_window_sticker and vin and len(vin) == 17:
            logger.info(f"Récupération Window Sticker pour VIN={vin}")
            
            # Vérifier cache MongoDB
            cached = await db.window_stickers.find_one({"vin": vin})
            
            if cached and "pdf_base64" in cached:
                window_sticker_pdf = base64.b64decode(cached["pdf_base64"])
                logger.info(f"Window Sticker trouvé en cache: {len(window_sticker_pdf)} bytes")
            else:
                # Télécharger depuis Chrysler/Stellantis
                ws_result = await fetch_window_sticker(vin, vehicle.get("brand"))
                if ws_result["success"]:
                    window_sticker_pdf = base64.b64decode(ws_result["pdf_base64"])
                    # Sauvegarder dans MongoDB
                    await save_window_sticker_to_db(vin, ws_result["pdf_base64"], "system")
                    logger.info(f"Window Sticker téléchargé et sauvegardé: {len(window_sticker_pdf)} bytes")
                else:
                    logger.warning(f"Window Sticker non disponible: {ws_result.get('error')}")
            
            # Convertir le PDF en images pour l'email
            if window_sticker_pdf:
                window_sticker_images = convert_pdf_to_images(window_sticker_pdf, max_pages=2, dpi=120)
                logger.info(f"Window Sticker converti en {len(window_sticker_images)} image(s)")
            
            # Construire l'URL du Window Sticker (basé sur la marque)
            brand_lower = vehicle.get("brand", "jeep").lower()
            if "chrysler" in brand_lower:
                window_sticker_url = f"https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin={vin}"
            elif "dodge" in brand_lower:
                window_sticker_url = f"https://www.dodge.com/hostd/windowsticker/getWindowStickerPdf.do?vin={vin}"
            elif "ram" in brand_lower:
                window_sticker_url = f"https://www.ramtrucks.com/hostd/windowsticker/getWindowStickerPdf.do?vin={vin}"
            else:
                window_sticker_url = f"https://www.jeep.com/hostd/windowsticker/getWindowStickerPdf.do?vin={vin}"
        
        # Get comparison data
        comparison = None
        for c in calc.get('comparisons', []):
            if c.get('term_months') == term:
                comparison = c
                break
        
        if not comparison:
            comparison = calc.get('comparisons', [{}])[0] if calc.get('comparisons') else {}
        
        consumer_cash = calc.get('consumer_cash', 0)
        bonus_cash = calc.get('bonus_cash', 0)
        
        option1_rate = comparison.get('option1_rate', 0)
        option2_rate = comparison.get('option2_rate', 0)
        
        principal_option1 = comparison.get('principal_option1', request.vehicle_price - consumer_cash)
        principal_option2 = comparison.get('principal_option2', request.vehicle_price)
        
        total_option1 = comparison.get('option1_total', 0)
        total_option2 = comparison.get('option2_total', 0)
        
        if freq == 'weekly':
            option1_payment = comparison.get('option1_weekly', 0)
            option2_payment = comparison.get('option2_weekly', 0)
            freq_label = "Hebdomadaire"
        elif freq == 'biweekly':
            option1_payment = comparison.get('option1_biweekly', 0)
            option2_payment = comparison.get('option2_biweekly', 0)
            freq_label = "Aux 2 semaines"
        else:
            option1_payment = comparison.get('option1_monthly', 0)
            option2_payment = comparison.get('option2_monthly', 0)
            freq_label = "Mensuel"
        
        best_option = comparison.get('best_option', '1')
        savings = comparison.get('savings', 0)
        # Corrected: Option 2 exists if rate is not None AND payment > 0 (rate can be 0%)
        has_option2 = option2_rate is not None and option2_payment is not None and option2_payment > 0
        
        def fmt(val):
            return f"{val:,.0f}".replace(",", " ")
        
        def fmt2(val):
            return f"{val:,.2f}".replace(",", " ").replace(".", ",")
        
        # Build fees info
        frais_dossier = fees.get('frais_dossier', 0)
        taxe_pneus = fees.get('taxe_pneus', 0)
        frais_rdprm = fees.get('frais_rdprm', 0)
        valeur_echange = trade.get('valeur_echange', 0)
        montant_du = trade.get('montant_du', 0)
        
        # LIGHT THEME EMAIL - PDF STYLE
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {{ font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; color: #333; font-size: 14px; line-height: 1.5; }}
                .container {{ max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; }}
                
                .header {{ background: #1a5f4a; color: #fff; padding: 20px; text-align: center; }}
                .header h1 {{ margin: 0; font-size: 24px; }}
                .header p {{ margin: 5px 0 0; opacity: 0.9; font-size: 13px; }}
                
                .content {{ padding: 25px; }}
                
                .greeting {{ font-size: 15px; margin-bottom: 20px; }}
                
                .section {{ margin-bottom: 20px; }}
                .section-title {{ font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }}
                
                .vehicle-box {{ background: #f8f9fa; border: 2px solid #1a5f4a; border-radius: 8px; padding: 15px; text-align: center; }}
                .vehicle-brand {{ color: #1a5f4a; font-size: 14px; font-weight: bold; }}
                .vehicle-model {{ font-size: 20px; font-weight: bold; color: #333; margin: 5px 0; }}
                .vehicle-price {{ font-size: 28px; font-weight: bold; color: #1a5f4a; }}
                
                .info-table {{ width: 100%; border-collapse: collapse; }}
                .info-table td {{ padding: 8px 0; border-bottom: 1px solid #eee; }}
                .info-table td:first-child {{ color: #666; }}
                .info-table td:last-child {{ text-align: right; font-weight: 600; }}
                
                .rates-table {{ width: 100%; border-collapse: collapse; background: #f8f9fa; border-radius: 6px; overflow: hidden; }}
                .rates-table th {{ background: #1a5f4a; color: #fff; padding: 10px; font-size: 12px; }}
                .rates-table td {{ padding: 8px 10px; text-align: center; border-bottom: 1px solid #e0e0e0; }}
                .rates-table tr:last-child td {{ border-bottom: none; }}
                .rates-table .selected {{ background: #d4edda; font-weight: bold; }}
                .rate-opt1 {{ color: #c0392b; font-weight: 600; }}
                .rate-opt2 {{ color: #1a5f4a; font-weight: 600; }}
                
                .best-choice {{ background: #d4edda; border: 2px solid #1a5f4a; border-radius: 8px; padding: 15px; margin: 20px 0; }}
                .best-choice-title {{ font-size: 18px; font-weight: bold; color: #155724; }}
                .best-choice-savings {{ font-size: 14px; color: #155724; margin-top: 5px; }}
                
                .options-container {{ display: table; width: 100%; border-spacing: 10px 0; }}
                .option-box {{ display: table-cell; width: 50%; vertical-align: top; border: 2px solid #ddd; border-radius: 8px; padding: 15px; background: #fafafa; }}
                .option-box.winner {{ border-color: #1a5f4a; background: #f0fff4; }}
                .option-title {{ font-size: 16px; font-weight: bold; margin-bottom: 10px; }}
                .option-title.opt1 {{ color: #c0392b; }}
                .option-title.opt2 {{ color: #1a5f4a; }}
                
                .option-detail {{ display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 13px; }}
                .option-detail span:first-child {{ color: #666; }}
                
                .payment-highlight {{ background: #f0f0f0; border-radius: 6px; padding: 12px; text-align: center; margin-top: 10px; }}
                .payment-highlight.opt1 {{ background: #fdf2f2; }}
                .payment-highlight.opt2 {{ background: #f0fff4; }}
                .payment-label {{ font-size: 12px; color: #666; }}
                .payment-amount {{ font-size: 24px; font-weight: bold; margin: 5px 0; }}
                .payment-amount.opt1 {{ color: #c0392b; }}
                .payment-amount.opt2 {{ color: #1a5f4a; }}
                .payment-total {{ font-size: 12px; color: #666; }}
                .payment-total strong {{ color: #333; }}
                
                .winner-badge {{ display: inline-block; background: #1a5f4a; color: #fff; font-size: 10px; padding: 3px 8px; border-radius: 10px; margin-left: 5px; }}
                
                .footer {{ background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee; }}
                .footer .dealer {{ font-size: 16px; font-weight: bold; color: #1a5f4a; }}
                .footer .disclaimer {{ font-size: 11px; color: #999; margin-top: 10px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>CalcAuto AiPro</h1>
                    <p>Soumission de financement</p>
                </div>
                
                <div class="content">
                    <p class="greeting">Bonjour{' ' + request.client_name if request.client_name else ''},</p>
                    <p style="color: #666; margin-top: -10px;">Voici le détail de votre soumission de financement:</p>
                    
                    <!-- VEHICLE -->
                    <div class="section">
                        <div class="section-title">Véhicule sélectionné</div>
                        <div class="vehicle-box">
                            <div class="vehicle-brand">{vehicle.get('brand', '')}</div>
                            <div class="vehicle-model">{vehicle.get('model', '')} {vehicle.get('trim', '') or ''} {vehicle.get('year', '')}</div>
                            <div class="vehicle-price">{fmt(request.vehicle_price)} $</div>
                        </div>
                    </div>
                    
                    <!-- RATES TABLE -->
                    <div class="section">
                        <div class="section-title">Tableau des taux</div>
                        <table class="rates-table">
                            <thead>
                                <tr>
                                    <th style="text-align: left;">Terme</th>
                                    <th>Option 1</th>
                                    <th>Option 2</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="{'selected' if term == 36 else ''}"><td style="text-align: left;">36 mois</td><td class="rate-opt1">4,99%</td><td class="rate-opt2">0%</td></tr>
                                <tr class="{'selected' if term == 48 else ''}"><td style="text-align: left;">48 mois</td><td class="rate-opt1">4,99%</td><td class="rate-opt2">0%</td></tr>
                                <tr class="{'selected' if term == 60 else ''}"><td style="text-align: left;">60 mois</td><td class="rate-opt1">4,99%</td><td class="rate-opt2">0%</td></tr>
                                <tr class="{'selected' if term == 72 else ''}"><td style="text-align: left;">72 mois</td><td class="rate-opt1">4,99%</td><td class="rate-opt2">1,49%</td></tr>
                                <tr class="{'selected' if term == 84 else ''}"><td style="text-align: left;">84 mois</td><td class="rate-opt1">4,99%</td><td class="rate-opt2">1,99%</td></tr>
                                <tr class="{'selected' if term == 96 else ''}"><td style="text-align: left;">96 mois</td><td class="rate-opt1">4,99%</td><td class="rate-opt2">3,49%</td></tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- DETAILS -->
                    <div class="section">
                        <div class="section-title">Détails du financement</div>
                        <table class="info-table">
                            <tr><td>Prix du véhicule</td><td>{fmt(request.vehicle_price)} $</td></tr>
                            {f"<tr><td>Rabais (avant taxes)</td><td style='color: #1a5f4a;'>-{fmt(consumer_cash)} $</td></tr>" if consumer_cash > 0 else ""}
                            {f"<tr><td>Bonus Cash (après taxes)</td><td style='color: #1a5f4a;'>-{fmt(bonus_cash)} $</td></tr>" if bonus_cash > 0 else ""}
                            {f"<tr><td>Frais dossier</td><td>{fmt2(frais_dossier)} $</td></tr>" if frais_dossier > 0 else ""}
                            {f"<tr><td>Taxe pneus</td><td>{fmt(taxe_pneus)} $</td></tr>" if taxe_pneus > 0 else ""}
                            {f"<tr><td>Frais RDPRM</td><td>{fmt(frais_rdprm)} $</td></tr>" if frais_rdprm > 0 else ""}
                            {f"<tr><td>Valeur échange</td><td>-{fmt(valeur_echange)} $</td></tr>" if valeur_echange > 0 else ""}
                            <tr><td>Terme sélectionné</td><td><strong>{term} mois</strong></td></tr>
                            <tr><td>Fréquence de paiement</td><td><strong>{freq_label}</strong></td></tr>
                        </table>
                    </div>
                    
                    <!-- BEST CHOICE BANNER -->
                    {"<div class='best-choice'><div class='best-choice-title'>🏆 Option " + best_option + " = Meilleur choix!</div><div class='best-choice-savings'>Économies de <strong>" + fmt(savings) + " $</strong> sur le coût total</div></div>" if has_option2 and savings > 0 else ""}
                    
                    <!-- OPTIONS COMPARISON -->
                    <div class="section">
                        <div class="section-title">Comparaison des options</div>
                        <table style="width: 100%; border-spacing: 10px; border-collapse: separate;">
                            <tr>
                                <td style="width: 50%; vertical-align: top; border: 2px solid {'#1a5f4a' if best_option == '1' else '#ddd'}; border-radius: 8px; padding: 15px; background: {'#f0fff4' if best_option == '1' else '#fafafa'};">
                                    <div class="option-title opt1">Option 1 {"<span class='winner-badge'>✓ MEILLEUR</span>" if best_option == '1' else ""}</div>
                                    <div style="font-size: 12px; color: #666; margin-bottom: 10px;">Rabais + Taux standard</div>
                                    <div class="option-detail"><span>Rabais:</span><span style="color: #1a5f4a; font-weight: 600;">{'-' + fmt(consumer_cash) + ' $' if consumer_cash > 0 else '$0'}</span></div>
                                    <div class="option-detail"><span>Capital financé:</span><span>{fmt(principal_option1)} $</span></div>
                                    <div class="option-detail"><span>Taux:</span><span class="rate-opt1">{option1_rate}%</span></div>
                                    <div class="payment-highlight opt1">
                                        <div class="payment-label">{freq_label}</div>
                                        <div class="payment-amount opt1">{fmt2(option1_payment)} $</div>
                                        <div class="payment-total">Total ({term} mois): <strong>{fmt(total_option1)} $</strong></div>
                                    </div>
                                </td>
                                
                                {"<td style='width: 50%; vertical-align: top; border: 2px solid " + ("#1a5f4a" if best_option == "2" else "#ddd") + "; border-radius: 8px; padding: 15px; background: " + ("#f0fff4" if best_option == "2" else "#fafafa") + ";'><div class='option-title opt2'>Option 2 " + ("<span class='winner-badge'>✓ MEILLEUR</span>" if best_option == "2" else "") + "</div><div style='font-size: 12px; color: #666; margin-bottom: 10px;'>$0 rabais + Taux réduit</div><div class='option-detail'><span>Rabais:</span><span>$0</span></div><div class='option-detail'><span>Capital financé:</span><span>" + fmt(principal_option2) + " $</span></div><div class='option-detail'><span>Taux:</span><span class='rate-opt2'>" + str(option2_rate) + "%</span></div><div class='payment-highlight opt2'><div class='payment-label'>" + freq_label + "</div><div class='payment-amount opt2'>" + fmt2(option2_payment) + " $</div><div class='payment-total'>Total (" + str(term) + " mois): <strong>" + fmt(total_option2) + " $</strong></div></div></td>" if has_option2 else "<td style='width: 50%; vertical-align: top; border: 2px solid #ddd; border-radius: 8px; padding: 15px; background: #f5f5f5; text-align: center; color: #999;'><div class='option-title' style='color: #999;'>Option 2</div><div style='padding: 30px 0;'>Non disponible<br>pour ce véhicule</div></td>"}
                            </tr>
                        </table>
                    </div>
                    
                    {f"<div style='background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 12px; margin-top: 15px;'><span style='color: #856404;'>ℹ️ Bonus Cash de {fmt(bonus_cash)} $ sera déduit après taxes (au comptant)</span></div>" if bonus_cash > 0 else ""}
                    
                    {generate_lease_email_html(request.lease_data, freq, freq_label, fmt, fmt2)}
                    
                    <!-- WINDOW STICKER SECTION WITH IMAGES -->
                    {generate_window_sticker_html(vin, window_sticker_images, window_sticker_url, window_sticker_pdf)}
                </div>
                
                <div class="footer">
                    <div class="dealer">{request.dealer_name}</div>
                    {f"<div style='color: #666; margin-top: 5px;'>{request.dealer_phone}</div>" if request.dealer_phone else ""}
                    <div class="disclaimer">
                        <strong>AVIS IMPORTANT:</strong> Les montants de paiements présentés dans cette soumission sont fournis à titre indicatif seulement et ne constituent en aucun cas une offre de financement ou de location officielle. Les versements réels peuvent différer en fonction de l'évaluation de crédit, des programmes en vigueur au moment de la transaction, des ajustements de résiduel et des frais applicables. Le concessionnaire et ses représentants ne peuvent être tenus responsables de toute erreur de calcul ou d'écart entre la présente estimation et les conditions finales du contrat. Toute transaction est sujette à l'approbation du crédit par l'institution financière.
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
        
        subject = f"Soumission - {vehicle.get('brand', '')} {vehicle.get('model', '')} {vehicle.get('year', '')}"
        
        # Envoyer l'email avec ou sans Window Sticker en pièce jointe
        # Préparer les images inline pour CID
        inline_images = []
        if window_sticker_images and len(window_sticker_images) > 0:
            img = window_sticker_images[0]
            inline_images.append({
                'cid': f'windowsticker_{vin}',
                'data': base64.b64decode(img['base64']),
                'subtype': 'jpeg',
                'filename': f'WindowSticker_{vin}.jpg'
            })
        
        if window_sticker_pdf:
            send_email(
                request.client_email, 
                subject, 
                html_body, 
                attachment_data=window_sticker_pdf,
                attachment_name=f"WindowSticker_{vin}.pdf",
                inline_images=inline_images,
                cc_email=user_email  # CC à l'utilisateur connecté
            )
            return {"success": True, "message": f"Email envoyé à {request.client_email}" + (f" (CC: {user_email})" if user_email else "")}
        else:
            send_email(
                request.client_email, 
                subject, 
                html_body, 
                inline_images=inline_images if inline_images else None,
                cc_email=user_email  # CC à l'utilisateur connecté
            )
            return {"success": True, "message": f"Email envoyé à {request.client_email}" + (f" (CC: {user_email})" if user_email else "")}
        
    except Exception as e:
        logger.error(f"Erreur envoi email: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur d'envoi: {str(e)}")

@router.post("/send-import-report")
async def send_import_report(request: SendReportEmailRequest):
    """Envoie un rapport par email après l'import des programmes"""
    try:
        months_fr = {
            1: "Janvier", 2: "Février", 3: "Mars", 4: "Avril",
            5: "Mai", 6: "Juin", 7: "Juillet", 8: "Août",
            9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre"
        }
        month_name = months_fr.get(request.program_month, str(request.program_month))
        
        # Générer le résumé par marque
        brands_html = ""
        for brand, count in request.brands_summary.items():
            brands_html += f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'>{brand}</td><td style='padding: 8px; border-bottom: 1px solid #eee; text-align: center; font-weight: bold;'>{count}</td></tr>"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
                .header {{ background: linear-gradient(135deg, #4ECDC4 0%, #44a08d 100%); color: white; padding: 30px; text-align: center; }}
                .header h1 {{ margin: 0; font-size: 24px; }}
                .content {{ padding: 30px; }}
                .success-badge {{ background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; text-align: center; margin-bottom: 20px; }}
                .stats-box {{ background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }}
                .big-number {{ font-size: 48px; font-weight: bold; color: #1a1a2e; text-align: center; }}
                .big-label {{ text-align: center; color: #666; }}
                table {{ width: 100%; border-collapse: collapse; margin-top: 15px; }}
                th {{ background: #1a1a2e; color: white; padding: 10px; text-align: left; }}
                .footer {{ background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✅ Import Réussi</h1>
                    <p>CalcAuto AiPro - Rapport d'import</p>
                </div>
                <div class="content">
                    <div class="success-badge">
                        <strong>🎉 Programmes {month_name} {request.program_year} importés avec succès!</strong>
                    </div>
                    
                    <div class="stats-box">
                        <div class="big-number">{request.programs_count}</div>
                        <div class="big-label">programmes de financement</div>
                    </div>
                    
                    <h3>Répartition par marque:</h3>
                    <table>
                        <tr>
                            <th>Marque</th>
                            <th style="text-align: center;">Nombre</th>
                        </tr>
                        {brands_html}
                    </table>
                    
                    <p style="margin-top: 20px; color: #666;">
                        Les nouveaux programmes sont maintenant disponibles dans l'application CalcAuto AiPro.
                    </p>
                </div>
                <div class="footer">
                    <p>Ce rapport a été généré automatiquement après l'import.</p>
                    <p>Date: {datetime.now().strftime('%d/%m/%Y à %H:%M')}</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        subject = f"✅ Import {month_name} {request.program_year} - {request.programs_count} programmes"
        
        send_email(SMTP_EMAIL, subject, html_body)
        
        return {"success": True, "message": "Rapport envoyé par email"}
        
    except Exception as e:
        logger.error(f"Erreur envoi rapport: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur d'envoi: {str(e)}")

@router.post("/test-email")
async def test_email():
    """Teste la configuration email"""
    try:
        html_body = """
        <div style="font-family: Arial; padding: 20px; text-align: center;">
            <h1 style="color: #4ECDC4;">✅ Test Email Réussi!</h1>
            <p>Votre configuration Gmail SMTP fonctionne correctement.</p>
            <p style="color: #666;">CalcAuto AiPro</p>
        </div>
        """
        send_email(SMTP_EMAIL, "🧪 Test CalcAuto AiPro - Email OK", html_body)
        return {"success": True, "message": f"Email de test envoyé à {SMTP_EMAIL}"}
    except Exception as e:
