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

def remove_shadows(image: np.ndarray) -> np.ndarray:
    """
    Suppression des ombres - Technique CamScanner
    
    Divise l'image en blocs et normalise l'éclairage local
    pour obtenir un fond blanc uniforme.
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
    
    # Créer un fond estimé avec un gros flou
    # Plus le kernel est grand, plus les ombres larges sont supprimées
    kernel_size = max(gray.shape[0], gray.shape[1]) // 8
    if kernel_size % 2 == 0:
        kernel_size += 1
    kernel_size = max(kernel_size, 51)  # Minimum 51
    
    # Filtre morphologique pour estimer le fond
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    background = cv2.morphologyEx(gray, cv2.MORPH_DILATE, kernel)
    
    # Diviser l'image par le fond pour normaliser l'éclairage
    # Éviter division par zéro
    background = np.maximum(background, 1)
    normalized = cv2.divide(gray, background, scale=255)
    
    return normalized


def enhance_contrast_adaptive(image: np.ndarray) -> np.ndarray:
    """
    Amélioration du contraste avec CLAHE
    (Contrast Limited Adaptive Histogram Equalization)
    
    Meilleur que l'égalisation standard car évite la sur-amplification.
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
    
    # CLAHE avec clip limit modéré
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    
    return enhanced


def adaptive_binarization(image: np.ndarray) -> np.ndarray:
    """
    Binarisation adaptative - Texte noir, fond blanc
    
    Utilise le seuillage adaptatif gaussien qui est
    meilleur que Otsu pour les documents avec éclairage inégal.
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
    
    # Seuillage adaptatif - meilleur pour documents
    binary = cv2.adaptiveThreshold(
        gray, 
        255, 
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY,
        blockSize=21,  # Taille du bloc local
        C=10  # Constante soustraite de la moyenne
    )
    
    return binary


def clean_document_edges(image: np.ndarray) -> np.ndarray:
    """
    Nettoie les bords du document (supprime le bruit de bordure)
    """
    h, w = image.shape[:2]
    
    # Créer un masque avec bordure noire (5% de chaque côté)
    border = int(min(h, w) * 0.02)
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[border:h-border, border:w-border] = 255
    
    # Appliquer le masque (fond blanc à l'extérieur)
    if len(image.shape) == 3:
        result = cv2.bitwise_and(image, image, mask=mask)
        result[mask == 0] = 255
    else:
        result = image.copy()
        result[mask == 0] = 255
    
    return result


def camscanner_preprocess(image: np.ndarray) -> np.ndarray:
    """
    🎯 PRÉTRAITEMENT STYLE CAMSCANNER - Pipeline complet
    
    Transforme une photo de document en scan propre:
    1. Détection et correction de perspective
    2. Suppression des ombres
    3. Amélioration du contraste
    4. Binarisation adaptative
    5. Nettoyage final
    
    Input: Image BGR (photo de document)
    Output: Image binaire optimisée pour OCR (noir sur blanc)
    """
    logger.info("CamScanner preprocess: Démarrage du pipeline")
    
    # Étape 1: Redimensionner si trop grand
    h, w = image.shape[:2]
    max_dim = 2000
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        logger.info(f"  Redimensionné: {w}x{h} → {image.shape[1]}x{image.shape[0]}")
    
    # Étape 2: Correction de perspective (redressement)
    warped = auto_warp_document(image)
    logger.info(f"  Perspective corrigée: {warped.shape[1]}x{warped.shape[0]}")
    
    # Étape 3: Conversion en niveaux de gris
    if len(warped.shape) == 3:
        gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    else:
        gray = warped.copy()
    
    # Étape 4: Suppression des ombres
    no_shadows = remove_shadows(gray)
    logger.info("  Ombres supprimées")
    
    # Étape 5: Amélioration du contraste (CLAHE)
    enhanced = enhance_contrast_adaptive(no_shadows)
    logger.info("  Contraste amélioré")
    
    # Étape 6: Débruitage léger
    denoised = cv2.fastNlMeansDenoising(enhanced, h=8)
    
    # Étape 7: Binarisation adaptative (texte noir, fond blanc)
    binary = adaptive_binarization(denoised)
    logger.info("  Binarisation appliquée")
    
    # Étape 8: Nettoyage morphologique (supprime petits bruits)
    kernel = np.ones((2, 2), np.uint8)
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel)
    
    # Étape 9: Nettoyage des bords
    final = clean_document_edges(cleaned)
    logger.info("  Nettoyage terminé")
    
    logger.info("CamScanner preprocess: Pipeline terminé avec succès")
    
    return final


def camscanner_preprocess_for_vision(image: np.ndarray) -> np.ndarray:
    """
    Version du prétraitement optimisée pour GPT-4 Vision.
    
    GPT-4 Vision préfère des images avec un peu de contexte,
    donc on garde les niveaux de gris au lieu de binaire pur.
    """
    logger.info("CamScanner preprocess (Vision): Démarrage")
    
    # Redimensionner si trop grand
    h, w = image.shape[:2]
    max_dim = 2000
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    
    # Correction de perspective
    warped = auto_warp_document(image)
    
    # Conversion en niveaux de gris
    if len(warped.shape) == 3:
        gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    else:
        gray = warped.copy()
    
    # Suppression des ombres
    no_shadows = remove_shadows(gray)
    
    # Amélioration du contraste
    enhanced = enhance_contrast_adaptive(no_shadows)
    
    # Débruitage
    denoised = cv2.fastNlMeansDenoising(enhanced, h=8)
    
    # Pour Vision: on garde en niveaux de gris avec contraste amélioré
    # (pas de binarisation complète)
    
    # Augmenter le contraste final
    # Étirer l'histogramme pour maximiser le contraste
    min_val = np.percentile(denoised, 2)
    max_val = np.percentile(denoised, 98)
    stretched = np.clip((denoised - min_val) * 255 / (max_val - min_val), 0, 255).astype(np.uint8)
    
    logger.info("CamScanner preprocess (Vision): Terminé")
    
    return stretched


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
    
    Structure des factures FCA Canada:
    - Haut droite → VIN + Model code
    - Centre → Options (liste des équipements)
    - Bas gauche → Codes financiers (EP, PDCO, PREF)
    - Bas droite → Totaux (Subtotal, Total)
    
    OCR par zones = beaucoup plus propre que OCR global
    """
    h, w = image.shape[:2]
    
    zones = {
        # Zone VIN: haut droite (0-35% hauteur, 40-100% largeur)
        "vin": image[0:int(h*0.35), int(w*0.4):w],
        
        # Zone options: centre (30-75% hauteur, toute largeur)
        "options": image[int(h*0.30):int(h*0.75), :],
        
        # Zone financière: BAS GAUCHE (65-95% hauteur, 0-50% largeur)
        # C'est là que EP, PDCO, PREF sont situés
        "finance": image[int(h*0.65):int(h*0.95), 0:int(w*0.5)],
        
        # Zone totaux: bas droite (70-100% hauteur, 50-100% largeur)
        "totals": image[int(h*0.70):h, int(w*0.5):w]
    }
    
    return zones


# ============ OCR CIBLÉ PAR ZONE ============

def ocr_zone(zone_img: np.ndarray, lang: str = "eng+fra", psm: int = 6) -> str:
    """
    OCR ciblé sur une zone prétraitée
    
    PSM modes:
    - 6: Assume a single uniform block of text (défaut pour zones)
    - 7: Treat the image as a single text line (meilleur pour VIN)
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
    h, w = image.shape[:2]
    
    # 3. Correction perspective (redresser le document)
    warped = auto_warp_document(image)
    
    # 4. Extraire les zones
    zones = extract_zones(warped)
    
    # 5. OCR sur chaque zone avec PSM optimisé
    
    # Zone VIN: utiliser PSM=7 (single line) pour meilleure précision VIN
    result["vin_text"] = ocr_zone(zones["vin"], psm=7)
    
    # AMÉLIORATION: Fallback avec zone élargie si VIN trop court
    if len(result["vin_text"]) < 10:
        logger.info("VIN zone trop courte, élargissement de la zone")
        enlarged_vin_zone = warped[0:int(h*0.45), int(w*0.3):w]
        result["vin_text"] = ocr_zone(enlarged_vin_zone, psm=7)
    
    if result["vin_text"] and len(result["vin_text"]) > 10:
        result["zones_processed"] += 1
    
    # Zone finance: PSM=6 (block)
    result["finance_text"] = ocr_zone(zones["finance"], psm=6)
    if result["finance_text"] and len(result["finance_text"]) > 10:
        result["zones_processed"] += 1
    
    # Zone options: PSM=6 (block)
    result["options_text"] = ocr_zone(zones["options"], psm=6)
    if result["options_text"] and len(result["options_text"]) > 10:
        result["zones_processed"] += 1
    
    # Zone totaux: PSM=6 (block)
    result["totals_text"] = ocr_zone(zones["totals"], psm=6)
    if result["totals_text"] and len(result["totals_text"]) > 10:
        result["zones_processed"] += 1
    
    # 6. AMÉLIORATION: OCR global seulement si zones insuffisantes
    if result["zones_processed"] >= 2:
        # Zones suffisantes, pas besoin de global (évite duplication/bruit)
        result["full_text"] = "\n".join([
            result["vin_text"],
            result["finance_text"],
            result["options_text"],
            result["totals_text"]
        ])
        logger.info(f"Using zones only (zones={result['zones_processed']})")
    else:
        # Zones insuffisantes, ajouter OCR global
        global_text = process_image_global_ocr(file_bytes)
        result["full_text"] = global_text
        result["parse_method"] = "ocr_global"
        logger.info(f"Using global OCR fallback (zones={result['zones_processed']}, global_len={len(global_text)})")
    
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
