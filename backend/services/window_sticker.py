import base64
import uuid
from datetime import datetime
from database import db, ROOT_DIR, logger

# ============ WINDOW STICKER CONFIGURATION ============
WINDOW_STICKER_URLS = {
    "chrysler": "https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin=",
    "jeep": "https://www.jeep.com/hostd/windowsticker/getWindowStickerPdf.do?vin=",
    "dodge": "https://www.dodge.com/hostd/windowsticker/getWindowStickerPdf.do?vin=",
    "ram": "https://www.ramtrucks.com/hostd/windowsticker/getWindowStickerPdf.do?vin=",
    "fiat": "https://www.fiatusa.com/hostd/windowsticker/getWindowStickerPdf.do?vin=",
    "alfa": "https://www.alfaromeousa.com/hostd/windowsticker/getWindowStickerPdf.do?vin=",
}


def convert_pdf_to_images(pdf_bytes: bytes, max_pages: int = 2, dpi: int = 100) -> list:
    """
    Convertit un PDF en images JPEG optimisées pour email.
    
    Args:
        pdf_bytes: PDF en bytes
        max_pages: Nombre max de pages à convertir
        dpi: Résolution (100 = optimisé pour email, petite taille)
    
    Returns:
        Liste de dicts avec image_base64, width, height
    """
    try:
        import fitz  # PyMuPDF
        from io import BytesIO
        from PIL import Image
        
        images = []
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        for page_num in range(min(len(doc), max_pages)):
            page = doc[page_num]
            
            # Convertir en image avec le DPI spécifié
            zoom = dpi / 72  # 72 est le DPI par défaut des PDF
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)
            
            # Convertir via PIL pour meilleure compression
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            
            # Redimensionner si trop grand (max 800px de large pour email)
            max_width = 800
            if img.width > max_width:
                ratio = max_width / img.width
                new_size = (max_width, int(img.height * ratio))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
            
            # Compresser en JPEG avec qualité réduite
            buffer = BytesIO()
            img.save(buffer, format="JPEG", quality=70, optimize=True)
            img_bytes = buffer.getvalue()
            img_base64 = base64.b64encode(img_bytes).decode("utf-8")
            
            images.append({
                "base64": img_base64,
                "width": img.width,
                "height": img.height,
                "page": page_num + 1,
                "size_kb": len(img_bytes) // 1024
            })
            
            logger.info(f"Window Sticker page {page_num+1}: {img.width}x{img.height}, {len(img_bytes)//1024}KB")
        
        doc.close()
        return images
        
    except Exception as e:
        logger.error(f"Erreur conversion PDF→Image: {e}")
        return []



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


async def fetch_window_sticker(vin: str, brand: str = None) -> dict:
    """
    Télécharge le Window Sticker PDF pour un VIN donné.
    Approche KenBot: HTTP humain + validation PDF + fallback Playwright
    
    Returns:
        dict avec:
        - success: bool
        - pdf_base64: str (PDF encodé en base64)
        - pdf_url: str (URL directe)
        - size_bytes: int
        - error: str (si échec)
    """
    import requests
    
    MIN_PDF_SIZE = 20_000  # 20 KB minimum pour un vrai sticker
    
    if not vin or len(vin) != 17:
        return {"success": False, "error": "VIN invalide (doit être 17 caractères)"}
    
    def validate_pdf(data: bytes) -> tuple[bool, str]:
        """Valide que les bytes sont un vrai PDF Window Sticker"""
        if len(data) < MIN_PDF_SIZE:
            return False, f"PDF trop petit ({len(data)} bytes) — probablement pas un vrai sticker"
        if not data.startswith(b"%PDF"):
            head = data[:30]
            return False, f"Pas un PDF (head={head!r}) — probablement HTML/Not found/anti-bot"
        return True, "OK"
    
    def download_pdf_human(pdf_url: str, referer: str) -> bytes:
        """Télécharge le PDF avec headers humains"""
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
            "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.8",
            "Referer": referer,
            "Connection": "keep-alive",
            "Cache-Control": "no-cache",
        }
        
        response = requests.get(pdf_url, headers=headers, timeout=30, allow_redirects=True)
        response.raise_for_status()
        return response.content
    
    async def download_pdf_playwright(pdf_url: str) -> bytes:
        """Fallback: télécharge via navigateur headless (async) - OPTIONNEL"""
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.warning("Playwright non installé - fallback désactivé")
            raise RuntimeError("Playwright non disponible")
        
        pdf_bytes = None
        
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                
                async def on_response(resp):
                    nonlocal pdf_bytes
                    ct = (resp.headers.get("content-type") or "").lower()
                    if "application/pdf" in ct:
                        try:
                            pdf_bytes = await resp.body()
                        except:
                            pass
                
                page.on("response", on_response)
                
                try:
                    await page.goto(pdf_url, wait_until="networkidle", timeout=30000)
                    # Attendre un peu si le PDF arrive en retard
                    if pdf_bytes is None:
                        await page.wait_for_timeout(3000)
                except Exception as e:
                    logger.warning(f"Playwright navigation error: {e}")
                
                await browser.close()
        except Exception as e:
            logger.warning(f"Playwright error: {e}")
            raise RuntimeError(f"Playwright failed: {e}")
        
        if not pdf_bytes:
            raise RuntimeError("PDF non capturé via Playwright")
        return pdf_bytes
    
    # Déterminer les URLs à essayer basées sur la marque
    urls_to_try = []
    
    if brand:
        brand_lower = brand.lower()
        for key in WINDOW_STICKER_URLS:
            if key in brand_lower or brand_lower in key:
                urls_to_try.append((key, WINDOW_STICKER_URLS[key] + vin))
                break
    
    # Si pas de marque ou pas trouvé, essayer toutes les URLs Stellantis
    if not urls_to_try:
        priority = ["jeep", "chrysler", "dodge", "ram", "fiat", "alfa"]
        for key in priority:
            urls_to_try.append((key, WINDOW_STICKER_URLS[key] + vin))
    
    # Referers par marque
    referers = {
        "jeep": "https://www.jeep.com/",
        "chrysler": "https://www.chrysler.com/",
        "dodge": "https://www.dodge.com/",
        "ram": "https://www.ramtrucks.com/",
        "fiat": "https://www.fiatusa.com/",
        "alfa": "https://www.alfaromeousa.com/",
    }
    
    last_error = None
    
    for brand_key, url in urls_to_try:
        referer = referers.get(brand_key, "https://www.chrysler.com/")
        
        # === Étape 1: HTTP "humain" ===
        try:
            logger.info(f"Window Sticker HTTP fetch: VIN={vin}, Brand={brand_key}")
            pdf_bytes = download_pdf_human(url, referer)
            
            is_valid, msg = validate_pdf(pdf_bytes)
            if is_valid:
                pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
                logger.info(f"Window Sticker téléchargé (HTTP): VIN={vin}, Size={len(pdf_bytes)} bytes")
                return {
                    "success": True,
                    "pdf_base64": pdf_base64,
                    "pdf_url": url,
                    "size_bytes": len(pdf_bytes),
                    "brand_source": brand_key,
                    "method": "http"
                }
            else:
                logger.warning(f"Window Sticker HTTP invalid: {msg}")
                last_error = msg
        except Exception as e:
            logger.warning(f"Window Sticker HTTP failed for {brand_key}: {e}")
            last_error = str(e)
        
        # === Étape 2: Fallback Playwright ===
        try:
            logger.info(f"Window Sticker Playwright fallback: VIN={vin}, Brand={brand_key}")
            pdf_bytes = await download_pdf_playwright(url)
            
            is_valid, msg = validate_pdf(pdf_bytes)
            if is_valid:
                pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
                logger.info(f"Window Sticker téléchargé (Playwright): VIN={vin}, Size={len(pdf_bytes)} bytes")
                return {
                    "success": True,
                    "pdf_base64": pdf_base64,
                    "pdf_url": url,
                    "size_bytes": len(pdf_bytes),
                    "brand_source": brand_key,
                    "method": "playwright"
                }
            else:
                logger.warning(f"Window Sticker Playwright invalid: {msg}")
                last_error = msg
        except Exception as e:
            logger.warning(f"Window Sticker Playwright failed for {brand_key}: {e}")
            last_error = str(e)
            continue
    
    return {"success": False, "error": f"Window Sticker non trouvé: {last_error}"}


async def save_window_sticker_to_db(vin: str, pdf_base64: str, owner_id: str) -> str:
    """
    Sauvegarde le Window Sticker PDF dans MongoDB.
    
    Returns:
        ID du document créé
    """
    doc_id = str(uuid.uuid4())
    
    await db.window_stickers.update_one(
        {"vin": vin},
        {"$set": {
            "id": doc_id,
            "vin": vin,
            "pdf_base64": pdf_base64,
            "owner_id": owner_id,
            "created_at": datetime.utcnow(),
            "size_bytes": len(base64.b64decode(pdf_base64))
        }},
        upsert=True
    )
    
    return doc_id

