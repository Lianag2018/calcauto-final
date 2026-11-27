from motor.motor_asyncio import AsyncIOMotorClient
from pathlib import Path
from dotenv import load_dotenv
import os
import logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Configuration
# 27 nov. 2026 : aucun mot de passe par défaut dans le code. Sans la variable, l'ancien mot de
# passe des outils Admin n'est plus accepté ; la session d'un administrateur suffit.
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', '').strip()
# Compte d'essai « claude » (remplace l'entrée démo sans mot de passe). Fermé sans la variable.
CLAUDE_TEST_PASSWORD = os.environ.get('CLAUDE_TEST_PASSWORD', '').strip()
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
ADMIN_EMAIL = "danielgiroux007@gmail.com"

# Gmail SMTP Configuration
SMTP_EMAIL = os.environ.get('SMTP_EMAIL', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("calcauto")
