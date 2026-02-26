"""
Mechanical extraction script for server.py refactoring.
Extracts line ranges from server.py into separate router/service files.
"""
import os

with open('/app/backend/server.py', 'r') as f:
    all_lines = f.readlines()

def extract_lines(start, end):
    """Extract lines (1-indexed, inclusive)"""
    return ''.join(all_lines[start-1:end])

# ============================================================
# AUTH ROUTER (lines 878-962)
# ============================================================
auth_imports = '''from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from datetime import datetime
from database import db, ADMIN_EMAIL
from models import UserRegister, UserLogin, User
from dependencies import hash_password, generate_token, get_current_user

router = APIRouter()

'''
auth_body = extract_lines(878, 962)
# Replace @api_router with @router
auth_body = auth_body.replace('@api_router.', '@router.')

with open('/app/backend/routers/auth.py', 'w') as f:
    f.write(auth_imports + auth_body)
print("Created routers/auth.py")

# ============================================================
# PROGRAMS ROUTER (lines 964-1602)
# Includes: pdf-info, periods, programs CRUD, import, calculate, seed
# ============================================================
programs_imports = '''from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import List, Optional
from datetime import datetime
import uuid
from database import db, ADMIN_PASSWORD, logger
from models import (
    VehicleProgram, VehicleProgramCreate, VehicleProgramUpdate,
    CalculationRequest, PaymentComparison, CalculationResponse,
    ProgramPeriod, ImportRequest, FinancingRates
)
from dependencies import calculate_monthly_payment, get_rate_for_term
import pypdf
import io

router = APIRouter()

'''
programs_body = extract_lines(964, 1602)
programs_body = programs_body.replace('@api_router.', '@router.')

with open('/app/backend/routers/programs.py', 'w') as f:
    f.write(programs_imports + programs_body)
print("Created routers/programs.py")

# ============================================================
# CONTACTS ROUTER (lines 3921-4035)
# ============================================================
contacts_imports = '''from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from database import db
from models import Contact, ContactCreate, ContactBulkCreate
from dependencies import get_current_user

router = APIRouter()

'''
contacts_body = extract_lines(3921, 4035)
contacts_body = contacts_body.replace('@api_router.', '@router.')

with open('/app/backend/routers/contacts.py', 'w') as f:
    f.write(contacts_imports + contacts_body)
print("Created routers/contacts.py")

# ============================================================
# SCI LEASE ROUTER (lines 7107-7274)
# ============================================================
sci_imports = '''from fastapi import APIRouter, HTTPException
from database import db, ROOT_DIR, logger
import json

router = APIRouter()

'''
sci_body = extract_lines(7107, 7274)
sci_body = sci_body.replace('@api_router.', '@router.')

with open('/app/backend/routers/sci.py', 'w') as f:
    f.write(sci_imports + sci_body)
print("Created routers/sci.py")

# ============================================================
# SUBMISSIONS / CRM ROUTER (lines 3424-3920)
# ============================================================
submissions_imports = '''from fastapi import APIRouter, HTTPException, Header
from typing import Optional, List
from datetime import datetime, timedelta
from database import db, SMTP_EMAIL, logger
from models import Submission, SubmissionCreate, ReminderUpdate
from dependencies import get_current_user, calculate_monthly_payment

router = APIRouter()

'''
submissions_body = extract_lines(3424, 3920)
submissions_body = submissions_body.replace('@api_router.', '@router.')
# The send_email and send_better_offers_notification/send_client_better_offer_email are used inline
# We need to add the import for send_email
submissions_imports_extra = "from services.email_service import send_email\n\n"

with open('/app/backend/routers/submissions.py', 'w') as f:
    f.write(submissions_imports + submissions_imports_extra + submissions_body)
print("Created routers/submissions.py")

# ============================================================
# INVENTORY ROUTER (lines 4036-4495)
# Includes inventory CRUD, options, stats, product-codes, financing lookup/summary
# ============================================================
inventory_imports = '''from fastapi import APIRouter, HTTPException, Header
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
import json
from database import db, logger
from models import (
    InventoryVehicle, InventoryCreate, InventoryUpdate,
    VehicleOption, ProductCode
)
from dependencies import get_current_user

router = APIRouter()

'''
inventory_body = extract_lines(4036, 4495)
inventory_body = inventory_body.replace('@api_router.', '@router.')

with open('/app/backend/routers/inventory.py', 'w') as f:
    f.write(inventory_imports + inventory_body)
print("Created routers/inventory.py")

# ============================================================
# ADMIN ROUTER 
# Lines 6413-6434 (admin endpoints header, excel export/import section)
# Lines 6744-7012 (parsing stats, user scan history, admin users, admin stats)
# Lines 7013-7106 (other admin endpoints)
# Lines 7294-7309 (debug endpoints)
# ============================================================
admin_imports = '''from fastapi import APIRouter, HTTPException, Header, UploadFile, File
from fastapi.responses import FileResponse
from typing import Optional, List, Dict, Any
from datetime import datetime
from pathlib import Path
from database import db, ADMIN_EMAIL, ROOT_DIR, logger
from dependencies import get_current_user

router = APIRouter()


async def require_admin(authorization):
    """Verify user is admin"""
    user = await get_current_user(authorization)
    if not user.get("is_admin") and user.get("email") != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

'''
# Admin users + stats (lines 7013-7106)
admin_body = extract_lines(7013, 7106)
admin_body = admin_body.replace('@api_router.', '@router.')

# Parsing stats + history (lines 6744-6877)
parsing_stats = extract_lines(6744, 6928)
parsing_stats = parsing_stats.replace('@api_router.', '@router.')

# Scan stats (lines 6928-7012)  
scan_stats = extract_lines(6928, 7012)
scan_stats = scan_stats.replace('@api_router.', '@router.')

# Debug endpoints (lines 7294-7309)
debug_body = extract_lines(7294, 7309)
debug_body = debug_body.replace('@api_router.', '@router.')

with open('/app/backend/routers/admin.py', 'w') as f:
    f.write(admin_imports + admin_body + "\n" + parsing_stats + "\n" + scan_stats + "\n" + debug_body)
print("Created routers/admin.py")

# ============================================================
# EMAIL SERVICE (send_email function + helpers)
# Lines 2824-2895 (send_email)
# ============================================================
email_service_imports = '''import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email import encoders
from database import SMTP_EMAIL, SMTP_PASSWORD, SMTP_HOST, SMTP_PORT

'''
email_service_body = extract_lines(2834, 2895)

with open('/app/backend/services/email_service.py', 'w') as f:
    f.write(email_service_imports + email_service_body)
print("Created services/email_service.py")

# ============================================================
# WINDOW STICKER SERVICE (lines 45-470)
# ============================================================
ws_imports = '''import base64
import uuid
from datetime import datetime
from database import db, ROOT_DIR, logger

'''
ws_config = extract_lines(45, 54)  # WINDOW_STICKER_URLS
ws_body = extract_lines(56, 470)  # All functions

with open('/app/backend/services/window_sticker.py', 'w') as f:
    f.write(ws_imports + ws_config + "\n" + ws_body)
print("Created services/window_sticker.py")

# ============================================================
# EMAIL ROUTES (lines 2926-3420)
# Includes: window-sticker endpoints, send-calculation-email, send-import-report, test-email
# Also needs generate_lease_email_html (lines 119-218) and generate_window_sticker_html (lines 221-271)
# ============================================================
email_routes_imports = '''from fastapi import APIRouter, HTTPException, Header
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

'''
# Need to include generate_lease_email_html and generate_window_sticker_html
lease_email_html = extract_lines(119, 218)
ws_html = extract_lines(221, 271)
email_routes_body = extract_lines(2926, 3420)
email_routes_body = email_routes_body.replace('@api_router.', '@router.')

with open('/app/backend/routers/email.py', 'w') as f:
    f.write(email_routes_imports + lease_email_html + "\n\n" + ws_html + "\n\n" + email_routes_body)
print("Created routers/email.py")

# ============================================================
# IMPORT WIZARD ROUTER
# Lines 1603-2823 (excel generation, PDF import, residual guide upload, save programs, cleanup)
# ============================================================
import_imports = '''from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Header
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
import json
import re
import io
import pypdf
import pdfplumber
from database import db, ADMIN_PASSWORD, OPENAI_API_KEY, SMTP_EMAIL, ROOT_DIR, logger
from models import (
    PDFExtractRequest, ProgramPreview, ExtractedDataResponse,
    SaveProgramsRequest, FinancingRates, VehicleProgram
)
from dependencies import get_current_user

try:
    import openpyxl
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    EXCEL_AVAILABLE = True
except ImportError:
    EXCEL_AVAILABLE = False

router = APIRouter()

'''
import_body = extract_lines(1603, 2823)
import_body = import_body.replace('@api_router.', '@router.')

with open('/app/backend/routers/import_wizard.py', 'w') as f:
    f.write(import_imports + import_body)
print("Created routers/import_wizard.py")

# ============================================================
# INVOICE SCANNER ROUTER (lines 4496-6412)
# Plus Excel export/import (lines 6435-6743)
# ============================================================
invoice_imports = '''from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Header
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
import json
import re
import os
import io
import base64
import hashlib
import time
import tempfile
from database import db, OPENAI_API_KEY, ROOT_DIR, logger
from models import InventoryVehicle
from dependencies import get_current_user
from services.window_sticker import fetch_window_sticker, save_window_sticker_to_db

# OCR imports
import pytesseract
from PIL import Image
import cv2
import numpy as np

try:
    import openpyxl
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    EXCEL_AVAILABLE = True
except ImportError:
    EXCEL_AVAILABLE = False

router = APIRouter()

'''
invoice_body = extract_lines(4496, 6412)
invoice_body = invoice_body.replace('@api_router.', '@router.')

# Excel export/import (lines 6435-6743)
excel_body = extract_lines(6435, 6743)
excel_body = excel_body.replace('@api_router.', '@router.')

with open('/app/backend/routers/invoice.py', 'w') as f:
    f.write(invoice_imports + invoice_body + "\n\n" + excel_body)
print("Created routers/invoice.py")

print("\n=== All router files created! ===")
print("Now need to update server.py to wire everything together.")
