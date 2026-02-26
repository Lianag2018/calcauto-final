"""
Script to extract trim orders from Stellantis/FCA code guide PDFs 
and store them in MongoDB. Also cleans duplicate programs and 
sets sort_order on each program.
"""
import os
import sys
import re
import fitz  # PyMuPDF
import pymongo
from datetime import datetime

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

client = pymongo.MongoClient(MONGO_URL)
db = client[DB_NAME]


def extract_trims_from_pdf(pdf_path):
    """Extract trim names in order from a Stellantis code guide PDF."""
    doc = fitz.open(pdf_path)
    text = doc[0].get_text()
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    doc.close()

    # Find the brand/model from the header
    brand = None
    model = None
    for line in lines:
        if 'GUIDE DE COMMANDE' in line or 'ORDER GUIDE' in line:
            break
        # Detect brand from page header
        upper = line.upper()
        if upper in ('JEEP', 'RAM', 'DODGE', 'CHRYSLER', 'FIAT'):
            brand = upper.title()
        # The model name typically appears just before "GUIDE DE COMMANDE"
        if any(c.isalpha() for c in line) and line == line.upper() and len(line) > 3:
            model = line

    # Extract trim entries from table of contents
    trims = []
    found_model_header = False
    for i, line in enumerate(lines):
        if 'GUIDE DE COMMANDE' in line or 'ORDER GUIDE' in line:
            found_model_header = True
            continue
        if found_model_header and ('MODELE' in line or 'MODEL' in line):
            found_model_header = True
            continue
        if found_model_header:
            if 'CONTENU' in line or 'EQUIPEMENT' in line or 'ETAPE' in line or 'CONTENT' in line or 'STEP' in line:
                break
            if 'CODE' in line and 'PAGES' in line:
                continue
            # Skip page numbers and short codes
            if line.isdigit() or (len(line) <= 8 and not ' ' in line):
                continue
            if any(c.isalpha() for c in line) and len(line) > 3:
                trims.append(line)

    return brand, trims


def parse_trim_name(raw_trim):
    """Normalize a raw trim name from the code guide to match program trims."""
    t = raw_trim.upper()
    # Remove common suffixes
    for suffix in ['4X4', '4X2', 'AWD', 'FWD', 'RWD', '4WD', 'BEV', 'PHEV']:
        t = t.replace(suffix, '')
    # Remove WB/box info
    t = re.sub(r'\(\d+.*?\)', '', t)
    # Remove model prefix (e.g., "COMPASS ", "WRANGLER ", "DURANGO ")
    for prefix in ['COMPASS', 'CHEROKEE', 'WRANGLER', 'GLADIATOR', 'GRAND CHEROKEE',
                    'GRAND WAGONEER', 'WAGONEER', 'DURANGO', 'CHARGER', 'HORNET',
                    'PACIFICA', 'GRAND CARAVAN', '500E', 'PROMASTER',
                    '1500', '2500', '3500', '4500', '5500']:
        if t.strip().startswith(prefix):
            t = t.strip()[len(prefix):]
    return t.strip()


def build_trim_orders():
    """Build comprehensive trim order map from official code guides and industry knowledge."""

    # This is the definitive trim hierarchy extracted from the PDFs
    # Order = from base model to most premium
    trim_orders = {
        # CHRYSLER
        ("Chrysler", "Grand Caravan"): [
            "SXT", "Canada Value Package"
        ],
        ("Chrysler", "Pacifica"): [
            "Select", "Limited", "Pinnacle",
            "Select Hybride", "Pinnacle Hybride",
            "PHEV", "excluding PHEV", "Hybrid",
            "Select Models (excl. Hybrid)", "Select Models (excludes Hybrid)",
            "(excl. Select & Hybrid)", "excludes Select & Hybrid Models",
            "(excluding PHEV)"
        ],

        # JEEP COMPASS - from code guide: Sport, North, Trailhawk, Limited
        ("Jeep", "Compass"): [
            "Sport",
            "North",
            "North w/ Altitude Package (ADZ)",
            "Altitude", "Altitude, Trailhawk, Trailhawk Elite",
            "Trailhawk",
            "Limited"
        ],

        # JEEP CHEROKEE - from code guide: Base, Laredo, Limited, Overland
        ("Jeep", "Cherokee"): [
            "Base (KMJL74)", "Base",
            "(excluding Base)", "excluding Base (KMJL74)",
            "Laredo", "Limited", "Overland"
        ],

        # JEEP WRANGLER - from code guide: Sport, Sahara, Rubicon, 392
        ("Jeep", "Wrangler"): [
            "2-Door (JL) non Rubicon", "2-Door (JL) (JLJL72) (non Rubicon models)",
            "4-Door (excl. 392 et 4xe)", "4-Door (excluding 392 and 4xe Models)",
            "4-Door (JL) 4xe (JLXL74)",
            "4-Door (JL) 4xe (excl. JLXL74)", "4-Door (JL) 4xe (excludes JLXL74)",
            "4-Door (JL) (excl. Rubicon 2.0L & 4xe)", "4-Door (JL) (excluding Rubicon w/ 2.0L(JLJS74 22R) and 4xe)",
            "2-Door Rubicon (JL)", "2-Door Rubicon (JL) (JLJS72)",
            "4-Door Rubicon w/ 2.0L", "4-Door Rubicon w/ 2.0L (JLJS74 22R)",
            "4-Door MOAB 392", "4-Door MOAB 392 (JLJX74)"
        ],

        # JEEP GLADIATOR - from code guide: Sport, Mojave, Rubicon
        ("Jeep", "Gladiator"): [
            None,
            "Sport S, Willys, Sahara, Willys '41", "Sport S, Willys, Sahara, Willys '41 (JTJL98)",
            "(excl. Sport S, Willys, Sahara, Willys '41)", "excluding Sport S, Willys, Sahara, Willys '41 (JTJL98)",
            "Mojave", "Rubicon"
        ],

        # JEEP GRAND CHEROKEE - from code guide: Laredo, Altitude, Limited, Summit
        ("Jeep", "Grand Cherokee/L"): [
            "Laredo/Laredo X", "Laredo/Laredo X (CPOS 22L/22P)",
            "Altitude", "Altitude (CPOS 2B5)",
            "Limited/Limited Reserve/Summit", "Limited/Limited Reserve/Summit (CPOS 2C6/2C1/2C3)"
        ],
        ("Jeep", "Grand Cherokee/Grand Cherokee L"): [
            "Laredo/Laredo X", "Laredo/Laredo X (CPOS 22L/22P)",
            "Altitude", "Altitude (CPOS 2B5)",
            "Limited/Limited Reserve/Summit", "Limited/Limited Reserve/Summit (CPOS 2C6/2C1/2C3)"
        ],
        ("Jeep", "Grand Cherokee"): [
            "4xe (WL)",
            "Laredo", "Laredo (WLJH74 2*A)", "Laredo (WLJH74 2*A) (WL)",
            "Altitude", "Altitude (WLJH74 2*B)", "Altitude (WLJH74 2*B) (WL)",
            "(WL) (excl. Laredo, Altitude, Summit, 4xe)", "(WL) (excludes Laredo (WLJH74 2*A & 2*B), Summit (WLJT74 23S), and 4xe)",
            "excludes Laredo (WLJH74 2*A & 2*B), Summit (WLJT74 23S), and 4xe",
            "Summit", "Summit (WLJT74 23S)", "Summit (WLJT74 23S) (WL)"
        ],
        ("Jeep", "Grand Cherokee L"): [
            "Laredo", "Laredo (WLJH75 2*A)", "Laredo (WLJH75 2*A) (WL)",
            "Altitude", "Altitude (WLJH75 2*B)", "Altitude (WLJH75 2*B) (WL)",
            "Overland", "Overland (WLJS75)", "Overland (WLJS75) (WL)",
            "(WL) (excl. Laredo, Altitude, Overland)", "(WL) (excludes Laredo (WLJH75 2*A & 2*B) and Overland (WLJS75))",
            "excludes Laredo (WLJH75 2*A & 2*B) and Overland (WLJS75)"
        ],

        # JEEP WAGONEER
        ("Jeep", "Wagoneer/L"): [None],
        ("Jeep", "Wagoneer / Wagoneer L"): [None],
        ("Jeep", "Grand Wagoneer/L"): [None],
        ("Jeep", "Grand Wagoneer / Grand Wagoneer L"): [None, "/ Grand Wagoneer L"],
        ("Jeep", "Grand Wagoneer"): [None, "/ Grand Wagoneer L"],
        ("Jeep", "Wagoneer"): [None, "/ Wagoneer L"],
        ("Jeep", "Wagoneer S"): ["Limited & Premium (BEV)"],

        # DODGE DURANGO - from code guide: Enforcer, (base), GT Hemi V8, SRT Hellcat
        ("Dodge", "Durango"): [
            "SXT", "SXT, GT, GT Plus",
            "GT", "GT, GT Plus",
            "GT Plus",
            "GT Hemi V8 Plus, GT Hemi V8 Premium",
            "R/T", "R/T, R/T Plus, R/T 20th Anniversary", "R/T, R/T Plus, R/T 20th Anniversary, R/T Plus 20th Anniversary",
            "SRT Hellcat"
        ],

        # DODGE CHARGER
        ("Dodge", "Charger"): [
            "2-Door & 4-Door (ICE)",
            "R/T", "R/T Plus", "Scat Pack"
        ],
        ("Dodge", "Charger Daytona"): [
            "R/T (BEV)", "Daytona R/T (BEV)",
            "R/T Plus (BEV)", "Daytona R/T Plus (BEV)",
            "Scat Pack (BEV)", "Daytona Scat Pack (BEV)"
        ],

        # DODGE HORNET - from code guide: GT, R/T
        ("Dodge", "Hornet"): [
            "GT (Gas)", "GT Plus (Gas)",
            "RT (PHEV)", "RT Plus (PHEV)"
        ],

        # RAM 1500 - from code guide: Tradesman, Big Horn, Sport, Rebel, Laramie, Limited/Longhorn
        ("Ram", "1500"): [
            "Tradesman", "Tradesman, Express, Warlock", "Tradesman, Warlock, Express (DT)",
            "Express", "Warlock",
            "Big Horn", "Big Horn (DT) with Off-Roader Value Package (4KF)",
            "Big Horn (DT) (excludes Big Horn with Off-Roader Value Package (4KF))",
            "Big Horn (DT) (excl. Off-Roader)",
            "Sport", "Sport, Rebel", "Sport, Rebel (DT)",
            "Rebel",
            "Laramie", "Laramie (DT6P98)",
            "Laramie, Limited, Longhorn, Tungsten, RHO (excl. DT6P98)",
            "Laramie, Limited, Longhorn, Tungsten, RHO (excluding Laramie (DT6P98))",
            "Laramie, Limited, Longhorn, Tungsten, RHO (DT)",
            "Limited", "Longhorn", "Tungsten", "RHO"
        ],

        # RAM 2500/3500
        ("Ram", "2500 Power Wagon Crew Cab"): [
            "(DJ7X91 2UP)"
        ],
        ("Ram", "2500"): [
            "Tradesman", "Big Horn", "Rebel", "Power Wagon",
            "Laramie", "Limited"
        ],
        ("Ram", "2500/3500"): [
            "Gas Models", "Gas Models (excl 2500 Power Wagon Crew Cab (DJ7X91 2UP), Chassis Cab Models)",
            "Gas Models (Excludes Chassis Cab models, Diesel Engine models)",
            "Diesel Models", "Diesel Models (excl Chassis Cab Models)",
            "6.7L High Output Diesel Models (ETM) (excludes Chassis Cab models)",
            "6.7L High Output Diesel (ETM)"
        ],

        # RAM utility
        ("Ram", "ProMaster"): [None],
        ("Ram", "ProMaster EV"): [None],
        ("Ram", "Chassis Cab"): [None],

        # FIAT
        ("Fiat", "500e"): ["BEV"],
    }

    return trim_orders


def get_sort_order(brand, model, trim, trim_orders):
    """Get the sort_order for a program based on the trim hierarchy."""
    key = (brand, model)
    if key in trim_orders:
        order_list = trim_orders[key]
        # Try exact match first
        if trim in order_list:
            return order_list.index(trim)
        # Try partial match (trim contains or is contained by an entry)
        if trim:
            for i, entry in enumerate(order_list):
                if entry and trim and (entry.lower() in trim.lower() or trim.lower() in entry.lower()):
                    return i
        # If trim is None and None is in the list
        if trim is None and None in order_list:
            return order_list.index(None)
    # Fallback: try to find partial model match
    for (b, m), order_list in trim_orders.items():
        if b == brand and (m in model or model in m):
            if trim in order_list:
                return order_list.index(trim)
            if trim:
                for i, entry in enumerate(order_list):
                    if entry and (entry.lower() in trim.lower() or trim.lower() in entry.lower()):
                        return i
            if trim is None and None in order_list:
                return order_list.index(None)
    return 999  # Unknown trim goes to end


def get_model_sort_order(brand, model):
    """Get a sort order for the model within a brand."""
    model_orders = {
        "Chrysler": ["Grand Caravan", "Pacifica"],
        "Jeep": ["Compass", "Cherokee", "Wrangler", "Gladiator",
                  "Grand Cherokee", "Grand Cherokee L", "Grand Cherokee/L",
                  "Grand Cherokee/Grand Cherokee L",
                  "Wagoneer/L", "Wagoneer / Wagoneer L", "Wagoneer S",
                  "Grand Wagoneer/L", "Grand Wagoneer / Grand Wagoneer L",
                  "Grand Wagoneer", "Wagoneer", "Recon"],
        "Dodge": ["Charger", "Charger Daytona", "Durango", "Hornet"],
        "Ram": ["ProMaster", "ProMaster EV", "1500", "2500", "2500 Power Wagon Crew Cab",
                 "2500/3500", "3500", "Chassis Cab"],
        "Fiat": ["500e"],
    }
    brand_models = model_orders.get(brand, [])
    # Exact match
    if model in brand_models:
        return brand_models.index(model)
    # Partial match
    for i, bm in enumerate(brand_models):
        if bm in model or model in bm:
            return i
    return 999


def get_brand_sort_order(brand):
    """Get a sort order for the brand."""
    brand_order = ["Chrysler", "Jeep", "Dodge", "Ram", "Fiat"]
    if brand in brand_order:
        return brand_order.index(brand)
    return 999


def clean_duplicates():
    """Remove duplicate programs, keeping only one per unique combination."""
    pipeline = [
        {"$group": {
            "_id": {"brand": "$brand", "model": "$model", "trim": "$trim", "year": "$year",
                    "program_month": "$program_month", "program_year": "$program_year"},
            "count": {"$sum": 1},
            "ids": {"$push": "$_id"},
            "prog_ids": {"$push": "$id"}
        }},
        {"$match": {"count": {"$gt": 1}}}
    ]
    dupes = list(db.programs.aggregate(pipeline))
    removed = 0
    for d in dupes:
        # Keep the first, remove the rest
        ids_to_remove = d["ids"][1:]
        for oid in ids_to_remove:
            db.programs.delete_one({"_id": oid})
            removed += 1
    print(f"Removed {removed} duplicate programs")
    return removed


def update_sort_orders():
    """Update sort_order field for all programs."""
    trim_orders = build_trim_orders()

    # Store trim orders in MongoDB
    db.trim_orders.drop()
    for (brand, model), trims in trim_orders.items():
        db.trim_orders.insert_one({
            "brand": brand,
            "model": model,
            "trims": [t if t else "__none__" for t in trims],
            "updated_at": datetime.utcnow()
        })
    print(f"Stored {db.trim_orders.count_documents({})} trim order entries in MongoDB")

    # Update sort_order for each program
    programs = list(db.programs.find({}))
    updated = 0
    for prog in programs:
        brand = prog.get("brand", "")
        model = prog.get("model", "")
        trim = prog.get("trim")

        brand_order = get_brand_sort_order(brand)
        model_order = get_model_sort_order(brand, model)
        trim_order = get_sort_order(brand, model, trim, trim_orders)

        # Composite sort_order: brand * 10000 + model * 100 + trim
        sort_order = brand_order * 10000 + model_order * 100 + trim_order

        db.programs.update_one(
            {"_id": prog["_id"]},
            {"$set": {"sort_order": sort_order}}
        )
        updated += 1

    print(f"Updated sort_order for {updated} programs")


def verify_sort_order():
    """Print the programs sorted by the new sort_order for verification."""
    programs = list(db.programs.find(
        {},
        {"_id": 0, "brand": 1, "model": 1, "trim": 1, "year": 1, "sort_order": 1}
    ).sort("sort_order", 1))

    current_brand = None
    current_model = None
    for p in programs:
        brand = p.get("brand")
        model = p.get("model")
        if brand != current_brand:
            print(f"\n{'='*60}")
            print(f"  {brand}")
            print(f"{'='*60}")
            current_brand = brand
        if model != current_model:
            print(f"\n  {model}:")
            current_model = model
        print(f"    [{p.get('sort_order', '?'):>5}] {p.get('year')} - {p.get('trim', 'N/A')}")


if __name__ == "__main__":
    print("=" * 60)
    print("  CalcAuto - Setup Trim Orders")
    print("=" * 60)

    print("\n1. Cleaning duplicate programs...")
    clean_duplicates()

    print("\n2. Building and storing trim orders...")
    update_sort_orders()

    print("\n3. Verifying sort order...")
    verify_sort_order()

    total = db.programs.count_documents({})
    print(f"\n\nDone! Total programs: {total}")
