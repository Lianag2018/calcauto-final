"""Feuille de soumission jointe au courriel et lien de la fiche du véhicule."""
import base64
import html
from typing import Optional

from services.etv_link import safe_listing_url

MAX_SUBMISSION_PDF = 4 * 1024 * 1024


def submission_pdf(encoded: str) -> Optional[bytes]:
    """La feuille envoyée par l'application : un vrai PDF de taille raisonnable, sinon rien."""
    if not encoded or len(encoded) > MAX_SUBMISSION_PDF * 4 // 3 + 16:
        return None
    try:
        data = base64.b64decode(encoded, validate=True)
    except Exception:
        return None
    return data if data.startswith(b"%PDF-") and len(data) <= MAX_SUBMISSION_PDF else None


def listing_link_html(url: str) -> str:
    """Bouton vers la fiche du site (photos du véhicule) ; rien si le lien n'est pas sûr."""
    safe = safe_listing_url(url)
    if not safe:
        return ""
    return ("<div style='text-align:center; margin: 18px 0;'><a href='" + html.escape(safe, quote=True) + "' "
            "style='display:inline-block; background:#10182B; color:#ffffff; text-decoration:none; font-weight:bold; "
            "padding:12px 22px; border-radius:6px;'>Voir les photos du véhicule</a></div>")
