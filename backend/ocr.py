"""
OCR Pipeline Industriel - OpenCV + Tesseract
Version 100% Open Source pour factures FCA Canada

Pipeline:
Image → Correction Perspective → Segmentation Zones (ROI) → OCR Ciblé → Parsing

Architecture:
- Niveau 1: PDF natif → pdfplumber (100% précision)
- Niveau 2: Images → OpenCV ROI + Tesseract (85-92% précision)  
- Niveau 3: Fallback → GPT-4 Vision (si score < 70)
"""

import cv2
import numpy as np
import pytesseract
from PIL import Image
import io
import logging
from typing import Dict, Tuple, Optional

logger = logging.getLogger(__name__)


# ============ CORRECTION PERSPECTIVE ============

def order_points(pts: np.ndarray) -> np.ndarray:
    """Ordonne les 4 points: top-left, top-right, bottom-right, bottom-left"""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def four_point_transform(image: np.ndarray, pts: np.ndarray) -> np.ndarray:
    """Transformation perspective 4 points → rectangle"""
    rect = order_points(pts)
    (tl, tr, br, bl) = rect
    
    widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    maxWidth = max(int(widthA), int(widthB))
    
    heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    maxHeight = max(int(heightA), int(heightB))
    
    dst = np.array([
        [0, 0],
        [maxWidth - 1, 0],
        [maxWidth - 1, maxHeight - 1],
        [0, maxHeight - 1]], dtype="float32")
    
    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
    return warped


def auto_warp_document(image: np.ndarray) -> np.ndarray:
    """
    Détection automatique des contours + redressement du document
    
    90% des échecs OCR viennent de la perspective.
    Cette fonction corrige automatiquement l'angle.
    """
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edged = cv2.Canny(blur, 75, 200)
        
        contours, _ = cv2.findContours(edged, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
        
        for c in contours:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            
            if len(approx) == 4:
                pts = approx.reshape(4, 2).astype("float32")
                logger.info("Document contour detected, applying perspective correction")
                return four_point_transform(image, pts)
        
        logger.info("No document contour found, using original image")
        return image
        
    except Exception as e:
        logger.warning(f"Auto-warp failed: {e}, using original image")
        return image


# ============ PREPROCESSING OCR ============

def preprocess_for_ocr(zone_img: np.ndarray) -> np.ndarray:
    """
    Prétraitement intelligent avant OCR:
    - Conversion grayscale
    - Débruitage
    - Binarisation Otsu
    
    Tesseract est mauvais avec colonnes multiples,
    mais bon avec texte isolé + prétraité.
    """
    if len(zone_img.shape) == 3:
        gray = cv2.cvtColor(zone_img, cv2.COLOR_BGR2GRAY)
    else:
        gray = zone_img.copy()
    
    # Débruitage léger
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    
    # Binarisation avec Otsu (meilleur que seuillage adaptatif pour photos)
    _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    return binary


# ============ SEGMENTATION ROI ============

def extract_zones(image: np.ndarray) -> Dict[str, np.ndarray]:
    """
    Découpe la facture FCA en zones (ROI - Region of Interest)
    
    Structure fixe des factures FCA:
    - Haut gauche → VIN
    - Haut droite → Codes financiers (EP, PDCO, PREF)
    - Centre → Options
    - Bas → Totaux
    
    OCR par zones = beaucoup plus propre que OCR global
    """
    h, w = image.shape[:2]
    
    zones = {
        # Zone VIN: haut gauche (0-25% hauteur, 0-60% largeur)
        "vin": image[0:int(h*0.25), 0:int(w*0.6)],
        
        # Zone financière: haut droite (0-35% hauteur, 50-100% largeur)
        "finance": image[0:int(h*0.35), int(w*0.5):w],
        
        # Zone options: centre (35-85% hauteur, toute largeur)
        "options": image[int(h*0.35):int(h*0.85), :],
        
        # Zone totaux: bas (75-100% hauteur, toute largeur)
        "totals": image[int(h*0.75):h, :]
    }
    
    return zones


# ============ OCR CIBLÉ PAR ZONE ============

def ocr_zone(zone_img: np.ndarray, lang: str = "eng+fra", psm: int = 6) -> str:
    """
    OCR ciblé sur une zone prétraitée
    
    PSM modes:
    - 6: Assume a single uniform block of text (meilleur pour zones)
    - 4: Assume a single column of text
    - 11: Sparse text
    """
    try:
        processed = preprocess_for_ocr(zone_img)
        text = pytesseract.image_to_string(
            processed,
            lang=lang,
            config=f"--psm {psm} --oem 3"
        )
        return text.strip()
    except Exception as e:
        logger.error(f"OCR zone error: {e}")
        return ""


# ============ PIPELINE COMPLET ============

def load_image_from_bytes(file_bytes: bytes) -> Optional[np.ndarray]:
    """Charge une image depuis bytes"""
    try:
        nparr = np.frombuffer(file_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return image
    except Exception as e:
        logger.error(f"Failed to load image: {e}")
        return None


def resize_if_needed(image: np.ndarray, max_dim: int = 2500) -> np.ndarray:
    """Redimensionne si l'image est trop grande (économise mémoire)"""
    h, w = image.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        logger.info(f"Image resized from {w}x{h} to {image.shape[1]}x{image.shape[0]}")
    return image


def process_image_ocr_pipeline(file_bytes: bytes) -> Dict[str, str]:
    """
    Pipeline OCR complet par zones:
    
    Image → Load → Resize → Warp → Zones → OCR ciblé
    
    Si les zones échouent, fallback sur OCR global.
    
    Returns: Dict avec le texte de chaque zone
    """
    result = {
        "vin_text": "",
        "finance_text": "",
        "options_text": "",
        "totals_text": "",
        "full_text": "",
        "zones_processed": 0,
        "parse_method": "ocr_zones"
    }
    
    # 1. Charger l'image
    image = load_image_from_bytes(file_bytes)
    if image is None:
        logger.error("Failed to decode image")
        return result
    
    # 2. Redimensionner - taille optimale pour OCR
    image = resize_if_needed(image, max_dim=1800)
    
    # 3. Correction perspective (redresser le document)
    warped = auto_warp_document(image)
    
    # 4. Extraire les zones
    zones = extract_zones(warped)
    
    # 5. OCR sur chaque zone
    result["vin_text"] = ocr_zone(zones["vin"], psm=6)
    if result["vin_text"] and len(result["vin_text"]) > 10:
        result["zones_processed"] += 1
    
    result["finance_text"] = ocr_zone(zones["finance"], psm=6)
    if result["finance_text"] and len(result["finance_text"]) > 10:
        result["zones_processed"] += 1
    
    result["options_text"] = ocr_zone(zones["options"], psm=6)
    if result["options_text"] and len(result["options_text"]) > 10:
        result["zones_processed"] += 1
    
    result["totals_text"] = ocr_zone(zones["totals"], psm=6)
    if result["totals_text"] and len(result["totals_text"]) > 10:
        result["zones_processed"] += 1
    
    # 6. OCR global comme backup/complément
    global_text = process_image_global_ocr(file_bytes)
    
    # 7. Combiner: utiliser global_text comme full_text principal si zones pauvres
    if result["zones_processed"] < 2 and len(global_text) > 200:
        result["full_text"] = global_text
        result["parse_method"] = "ocr_global"
        logger.info(f"Using global OCR (zones={result['zones_processed']}, global_len={len(global_text)})")
    else:
        result["full_text"] = "\n".join([
            result["vin_text"],
            result["finance_text"],
            result["options_text"],
            result["totals_text"],
            global_text  # Ajouter aussi le global pour plus de couverture
        ])
    
    logger.info(f"OCR Pipeline: {result['zones_processed']}/4 zones processed")
    
    return result


def process_image_global_ocr(file_bytes: bytes) -> str:
    """
    OCR global sur toute l'image (fallback si ROI ne fonctionne pas)
    Utilise un prétraitement optimisé pour les photos de factures
    """
    try:
        image = load_image_from_bytes(file_bytes)
        if image is None:
            return ""
        
        # Redimensionner à taille optimale pour OCR
        image = resize_if_needed(image, max_dim=1800)
        
        # Convertir en grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Débruitage
        denoised = cv2.fastNlMeansDenoising(gray, h=10)
        
        # Binarisation Otsu
        _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # OCR avec config optimisée pour documents
        text = pytesseract.image_to_string(
            binary,
            lang="eng+fra",
            config="--oem 3 --psm 6"
        )
        
        return text.strip()
        
    except Exception as e:
        logger.error(f"Global OCR error: {e}")
        return ""
