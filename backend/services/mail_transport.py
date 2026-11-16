"""Transport des courriels : par le web (port 443) ou par SMTP.

Certains hébergeurs ferment les ports SMTP (25, 465, 587) : le message ne part
jamais. Trois chemins, dans cet ordre :

1. L'API Gmail, quand GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET et
   GMAIL_REFRESH_TOKEN sont présents : même message, même adresse.
2. Le relais d'eTradeValue, quand la clé du lien (CALCAUTO_LINK_SECRET) est
   présente : le message, signé, est remis à eTradeValue qui l'envoie de son
   propre compte de courriel. MAIL_RELAY=0 le désactive.
3. SMTP, comme avant.

Aucune dépendance au reste du service : ce module se teste seul.
"""
import base64
import hashlib
import hmac
import json
import smtplib
import time
import urllib.error
import urllib.parse
import urllib.request

TOKEN_URL = "https://oauth2.googleapis.com/token"
SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
HTTP_TIMEOUT = 20
RELAY_TIMEOUT = 45  # eTradeValue doit lui-même joindre son serveur de courriel
SMTP_TIMEOUT = 10
TOKEN_MARGIN_SECONDS = 60

_token_cache = {"key": None, "token": None, "expires": 0.0}


class MailError(Exception):
    """Envoi refusé ou impossible ; le message ne contient jamais de secret."""


def gmail_config(env):
    """Réglages de l'API Gmail, ou None s'il en manque un."""
    config = {
        "client_id": (env.get("GMAIL_CLIENT_ID") or "").strip(),
        "client_secret": (env.get("GMAIL_CLIENT_SECRET") or "").strip(),
        "refresh_token": (env.get("GMAIL_REFRESH_TOKEN") or "").strip(),
    }
    return config if all(config.values()) else None


def raw_message(msg):
    """Le message complet (pièces jointes et images comprises) au format attendu par Gmail."""
    return base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")


def _post(url, data, headers, opener, timeout=HTTP_TIMEOUT):
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with opener(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as error:
        reason = ""
        try:
            body = json.loads(error.read().decode("utf-8") or "{}")
            detail = body.get("error")
            if isinstance(detail, dict):
                reason = str(detail.get("message") or detail.get("status") or "")
            else:
                reason = str(body.get("error_description") or detail or body.get("detail") or "")
        except Exception:
            reason = ""
        raise MailError(f"Le service de courriel a refusé la demande (code {error.code}) {reason[:200]}".strip()) from None
    except (urllib.error.URLError, OSError, ValueError) as error:
        raise MailError(f"Le service de courriel est injoignable ({type(error).__name__}).") from None


def access_token(config, opener=urllib.request.urlopen, now=time.time):
    """Jeton d'accès d'une heure, gardé en mémoire jusqu'à une minute avant sa fin."""
    key = (config["client_id"], config["refresh_token"])
    if _token_cache["key"] == key and _token_cache["token"] and now() < _token_cache["expires"]:
        return _token_cache["token"]
    form = urllib.parse.urlencode({
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "refresh_token": config["refresh_token"],
        "grant_type": "refresh_token",
    }).encode("ascii")
    answer = _post(TOKEN_URL, form, {"Content-Type": "application/x-www-form-urlencoded"}, opener)
    token = str(answer.get("access_token") or "")
    if not token:
        raise MailError("Le service de courriel n'a pas donné de jeton d'accès.")
    try:
        lifetime = float(answer.get("expires_in") or 0)
    except (TypeError, ValueError):
        lifetime = 0.0
    _token_cache.update(key=key, token=token, expires=now() + max(0.0, lifetime - TOKEN_MARGIN_SECONDS))
    return token


def send_via_gmail(config, msg, opener=urllib.request.urlopen, now=time.time):
    """Envoie le message par l'API Gmail. Les destinataires sont ceux des en-têtes To et Cc."""
    token = access_token(config, opener, now)
    body = json.dumps({"raw": raw_message(msg)}).encode("ascii")
    answer = _post(SEND_URL, body, {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, opener)
    if not answer.get("id"):
        raise MailError("Le service de courriel n'a pas confirmé l'envoi.")
    return answer["id"]


def relay_config(env):
    """Adresse et clé du relais d'eTradeValue, ou None s'il n'est pas disponible."""
    secret = (env.get("CALCAUTO_LINK_SECRET") or "").strip()
    if len(secret) < 32 or (env.get("MAIL_RELAY") or "1").strip() == "0":
        return None
    base = (env.get("ETV_API_URL") or "https://kenbot-dashboard-api.onrender.com").strip().rstrip("/")
    if not base.startswith("https://") and not base.startswith("http://127.0.0.1"):
        return None
    return {"url": f"{base}/api/calcauto/courriel", "secret": secret.encode()}


def relay_signature(secret: bytes, timestamp: int, body: bytes) -> str:
    """Même calcul que du côté d'eTradeValue : la signature couvre tout le message."""
    message = f"courriel:{timestamp}:{hashlib.sha256(body).hexdigest()}".encode()
    return base64.urlsafe_b64encode(hmac.new(secret, message, hashlib.sha256).digest()).rstrip(b"=").decode()


def send_via_relay(config, msg, opener=urllib.request.urlopen, now=time.time):
    """Remet le message à eTradeValue, qui l'envoie aux destinataires des en-têtes To et Cc."""
    body = msg.as_bytes()
    stamp = int(now())
    answer = _post(config["url"], body, {
        "Content-Type": "application/octet-stream",
        "X-CalcAuto-Timestamp": str(stamp),
        "X-CalcAuto-Signature": relay_signature(config["secret"], stamp, body),
    }, opener, RELAY_TIMEOUT)
    if not answer.get("sent"):
        raise MailError("eTradeValue n'a pas confirmé l'envoi du courriel.")
    return True


def send_via_smtp(msg, recipients, host, port, username, password):
    with smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT) as server:
        server.starttls()
        server.login(username, password)
        if recipients:
            server.send_message(msg, to_addrs=recipients)
        else:
            server.send_message(msg)


def deliver(msg, recipients, env, smtp):
    """Envoie par l'API Gmail, sinon par le relais d'eTradeValue, sinon par SMTP. Renvoie le chemin pris."""
    config = gmail_config(env)
    if config:
        send_via_gmail(config, msg)
        return "gmail_api"
    has_smtp = bool(smtp.get("username") and smtp.get("password"))
    relay = relay_config(env)
    if relay:
        try:
            send_via_relay(relay, msg)
            return "relay"
        except MailError:
            if not has_smtp:
                raise
    if not has_smtp:
        raise MailError("Configuration du courriel manquante.")
    send_via_smtp(msg, recipients, smtp["host"], smtp["port"], smtp["username"], smtp["password"])
    return "smtp"
