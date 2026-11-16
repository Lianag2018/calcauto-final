from email.utils import formataddr
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email import encoders
from database import SMTP_EMAIL, SMTP_PASSWORD, SMTP_HOST, SMTP_PORT
from services.mail_transport import SMTP_TIMEOUT, deliver, gmail_config, relay_config  # noqa: F401


def mail_ready() -> bool:
    """Vrai quand un courriel peut partir : adresse d'envoi, et l'API Gmail, le relais d'eTradeValue ou le mot de passe SMTP."""
    return bool(SMTP_EMAIL and (gmail_config(os.environ) or relay_config(os.environ) or SMTP_PASSWORD))


def deliver_message(msg, recipients=None):
    """Envoie un message déjà construit : par le web (API Gmail) si réglé, sinon par SMTP."""
    return deliver(msg, recipients, os.environ,
                   {"host": SMTP_HOST, "port": SMTP_PORT, "username": SMTP_EMAIL, "password": SMTP_PASSWORD})


def send_email(to_email: str, subject: str, html_body: str, attachment_data: bytes = None, attachment_name: str = None, inline_images: list = None, cc_email: str = None, sender_name: str = None, extra_attachments: list = None):
    """
    Envoie un email (API Gmail ou SMTP) avec support pour images inline (CID).
    
    Args:
        to_email: Email du destinataire
        subject: Sujet de l'email
        html_body: Corps HTML de l'email
        attachment_data: Données de la pièce jointe (optionnel)
        attachment_name: Nom de la pièce jointe (optionnel)
        inline_images: Liste de dicts avec 'cid', 'data' (bytes), 'mimetype' (ex: 'image/jpeg')
        cc_email: Email en copie (CC) - optionnel
        sender_name: Nom affiché de l'expéditeur (« William de Kennebec par eTradeValue ») - optionnel
    """
    if not mail_ready():
        raise Exception("Configuration du courriel manquante")
    
    # Utiliser 'related' pour supporter les images CID
    msg = MIMEMultipart('related')
    msg['From'] = formataddr((sender_name or "CalcAuto AiPro", SMTP_EMAIL))
    msg['To'] = to_email
    msg['Subject'] = subject
    
    # Ajouter CC si fourni
    if cc_email:
        msg['Cc'] = cc_email
    
    # Créer une partie alternative pour le HTML
    msg_alternative = MIMEMultipart('alternative')
    msg.attach(msg_alternative)
    
    # Corps HTML
    msg_alternative.attach(MIMEText(html_body, 'html', 'utf-8'))
    
    # Images inline (CID) - pour Window Sticker
    if inline_images:
        for img in inline_images:
            mime_img = MIMEImage(img['data'], _subtype=img.get('subtype', 'jpeg'))
            mime_img.add_header('Content-ID', f"<{img['cid']}>")
            mime_img.add_header('Content-Disposition', 'inline', filename=img.get('filename', 'image.jpg'))
            msg.attach(mime_img)
    
    # Pièce jointe PDF si fournie
    if attachment_data and attachment_name:
        part = MIMEBase('application', 'octet-stream')
        part.set_payload(attachment_data)
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', f'attachment; filename="{attachment_name}"')
        msg.attach(part)

    # Autres pièces jointes : liste de (données, nom de fichier)
    for data, name in extra_attachments or []:
        part = MIMEBase('application', 'pdf' if str(name).lower().endswith('.pdf') else 'octet-stream')
        part.set_payload(data)
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', f'attachment; filename="{name}"')
        msg.attach(part)
    
    # Liste des destinataires (To + CC)
    recipients = [to_email]
    if cc_email:
        recipients.append(cc_email)
    
    deliver_message(msg, recipients)

    return True

