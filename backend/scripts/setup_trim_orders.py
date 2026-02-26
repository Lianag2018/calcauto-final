"""
Align sort_order EXACTLY with the FCA QBC Incentive PDF landscape.
Each program gets a sort_order matching its line position in the PDF.
"""
import pymongo
import os
from datetime import datetime

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

client = pymongo.MongoClient(MONGO_URL)
db = client[DB_NAME]

# ============================================================
# EXACT order from PDF page 20 - 2026 MODELS
# ============================================================
PDF_ORDER_2026 = [
    # CHRYSLER
    ("Chrysler", "Grand Caravan", "SXT"),
    ("Chrysler", "Pacifica", "PHEV"),
    ("Chrysler", "Pacifica", "excluding PHEV"),
    # JEEP - Compass
    ("Jeep", "Compass", "Sport"),
    ("Jeep", "Compass", "North"),
    ("Jeep", "Compass", "North w/ Altitude Package (ADZ)"),
    ("Jeep", "Compass", "Trailhawk"),
    ("Jeep", "Compass", "Limited"),
    # JEEP - Cherokee
    ("Jeep", "Cherokee", "Base (KMJL74)"),
    ("Jeep", "Cherokee", "excluding Base (KMJL74)"),
    # JEEP - Wrangler (IMPORTANT: 2-Door non-Rubicon, 2-Door Rubicon, 4-Door, 4-Door MOAB)
    ("Jeep", "Wrangler", "2-Door (JL) (JLJL72) (non Rubicon models)"),
    ("Jeep", "Wrangler", "2-Door Rubicon (JL) (JLJS72)"),
    ("Jeep", "Wrangler", "4-Door (excluding 392 and 4xe Models)"),
    ("Jeep", "Wrangler", "4-Door MOAB 392 (JLJX74)"),
    # JEEP - Gladiator
    ("Jeep", "Gladiator", "Sport S, Willys, Sahara, Willys '41 (JTJL98)"),
    ("Jeep", "Gladiator", "excluding Sport S, Willys, Sahara, Willys '41 (JTJL98)"),
    # JEEP - Grand Cherokee/L
    ("Jeep", "Grand Cherokee/Grand Cherokee L", "Laredo/Laredo X (CPOS 22L/22P)"),
    ("Jeep", "Grand Cherokee/Grand Cherokee L", "Altitude (CPOS 2B5)"),
    ("Jeep", "Grand Cherokee/Grand Cherokee L", "Limited/Limited Reserve/Summit (CPOS 2C6/2C1/2C3)"),
    # JEEP - Grand Wagoneer
    ("Jeep", "Grand Wagoneer / Grand Wagoneer L", None),
    # DODGE
    ("Dodge", "Durango", "SXT, GT, GT Plus"),
    ("Dodge", "Durango", "GT Hemi V8 Plus, GT Hemi V8 Premium"),
    ("Dodge", "Durango", "SRT Hellcat"),
    ("Dodge", "Charger", "2-Door & 4-Door (ICE)"),
    # RAM
    ("Ram", "ProMaster", None),
    ("Ram", "1500", "Tradesman, Express, Warlock"),
    ("Ram", "1500", "Big Horn"),
    ("Ram", "1500", "Sport, Rebel"),
    ("Ram", "1500", "Laramie (DT6P98)"),
    ("Ram", "1500", "Laramie, Limited, Longhorn, Tungsten, RHO (excluding Laramie (DT6P98))"),
    ("Ram", "2500", "Power Wagon Crew Cab (DJ7X91 2UP)"),
    ("Ram", "2500/3500", "Gas Models (excl 2500 Power Wagon Crew Cab (DJ7X91 2UP), Chassis Cab Models)"),
    ("Ram", "2500/3500", "Diesel Models (excl Chassis Cab Models)"),
    ("Ram", "Chassis Cab", None),
]

# ============================================================
# EXACT order from PDF page 21 - 2025 MODELS
# ============================================================
PDF_ORDER_2025 = [
    # CHRYSLER
    ("Chrysler", "Grand Caravan", "SXT"),
    ("Chrysler", "Pacifica", "Hybrid"),
    ("Chrysler", "Pacifica", "Select Models (excludes Hybrid)"),
    ("Chrysler", "Pacifica", "excludes Select & Hybrid Models"),
    # JEEP - Compass
    ("Jeep", "Compass", "Sport"),
    ("Jeep", "Compass", "North"),
    ("Jeep", "Compass", "Altitude, Trailhawk, Trailhawk Elite"),
    ("Jeep", "Compass", "Limited"),
    # JEEP - Wrangler (PDF order: 4xe first, then 2-door, then Rubicon variants)
    ("Jeep", "Wrangler", "4-Door (JL) 4xe (JLXL74)"),
    ("Jeep", "Wrangler", "4-Door (JL) 4xe (excludes JLXL74)"),
    ("Jeep", "Wrangler", "2-Door (JL) (JLJL72) (non Rubicon models)"),
    ("Jeep", "Wrangler", "2-Door Rubicon (JL) (JLJS72)"),
    ("Jeep", "Wrangler", "4-Door Rubicon w/ 2.0L (JLJS74 22R)"),
    ("Jeep", "Wrangler", "4-Door (JL) (excluding Rubicon w/ 2.0L(JLJS74 22R) and 4xe)"),
    # JEEP - Gladiator
    ("Jeep", "Gladiator", None),
    # JEEP - Grand Cherokee
    ("Jeep", "Grand Cherokee", "4xe (WL)"),
    ("Jeep", "Grand Cherokee", "Laredo (WLJH74 2*A) (WL)"),
    ("Jeep", "Grand Cherokee", "Altitude (WLJH74 2*B) (WL)"),
    ("Jeep", "Grand Cherokee", "Summit (WLJT74 23S) (WL)"),
    ("Jeep", "Grand Cherokee", "excludes Laredo (WLJH74 2*A & 2*B), Summit (WLJT74 23S), and 4xe"),
    # JEEP - Grand Cherokee L
    ("Jeep", "Grand Cherokee L", "Laredo (WLJH75 2*A) (WL)"),
    ("Jeep", "Grand Cherokee L", "Altitude (WLJH75 2*B) (WL)"),
    ("Jeep", "Grand Cherokee L", "Overland (WLJS75) (WL)"),
    ("Jeep", "Grand Cherokee L", "excludes Laredo (WLJH75 2*A & 2*B) and Overland (WLJS75)"),
    # JEEP - Wagoneer
    ("Jeep", "Wagoneer / Wagoneer L", None),
    ("Jeep", "Grand Wagoneer / Grand Wagoneer L", None),
    ("Jeep", "Wagoneer S", "Limited & Premium (BEV)"),
    # DODGE
    ("Dodge", "Durango", "GT, GT Plus"),
    ("Dodge", "Durango", "R/T, R/T Plus, R/T 20th Anniversary, R/T Plus 20th Anniversary"),
    ("Dodge", "Durango", "SRT Hellcat"),
    ("Dodge", "Charger", "Daytona R/T (BEV)"),
    ("Dodge", "Charger", "Daytona R/T Plus (BEV)"),
    ("Dodge", "Charger", "Daytona Scat Pack (BEV)"),
    ("Dodge", "Hornet", "RT (PHEV)"),
    ("Dodge", "Hornet", "RT Plus (PHEV)"),
    ("Dodge", "Hornet", "GT (Gas)"),
    ("Dodge", "Hornet", "GT Plus (Gas)"),
    # RAM
    ("Ram", "ProMaster", None),
    ("Ram", "1500", "Tradesman, Warlock, Express (DT)"),
    ("Ram", "1500", "Big Horn (DT) with Off-Roader Value Package (4KF)"),
    ("Ram", "1500", "Big Horn (DT) (excludes Big Horn with Off-Roader Value Package (4KF))"),
    ("Ram", "1500", "Sport, Rebel (DT)"),
    ("Ram", "1500", "Laramie, Limited, Longhorn, Tungsten, RHO (DT)"),
    ("Ram", "2500/3500", "Gas Models (Excludes Chassis Cab models, Diesel Engine models)"),
    ("Ram", "2500/3500", "6.7L High Output Diesel Models (ETM) (excludes Chassis Cab models)"),
    ("Ram", "Chassis Cab", None),
    # FIAT
    ("Fiat", "500e", "BEV"),
]


def normalize(s):
    """Normalize a string for comparison."""
    if s is None:
        return None
    return s.lower().strip()


def match_program(prog, pdf_entry):
    """Check if a MongoDB program matches a PDF entry."""
    p_brand = normalize(prog.get("brand", ""))
    p_model = normalize(prog.get("model", ""))
    p_trim = normalize(prog.get("trim"))

    e_brand = normalize(pdf_entry[0])
    e_model = normalize(pdf_entry[1])
    e_trim = normalize(pdf_entry[2])

    if p_brand != e_brand:
        return False
    if p_model != e_model:
        return False
    if p_trim == e_trim:
        return True
    # Partial match for trims
    if p_trim is None and e_trim is None:
        return True
    if p_trim and e_trim:
        if p_trim in e_trim or e_trim in p_trim:
            return True
    return False


def update_sort_orders():
    """Update sort_order for all programs based on PDF line position."""
    programs = list(db.programs.find({}))
    updated = 0
    unmatched = []

    for prog in programs:
        year = prog.get("year")
        brand = prog.get("brand", "")
        model = prog.get("model", "")
        trim = prog.get("trim")

        pdf_order = PDF_ORDER_2026 if year == 2026 else PDF_ORDER_2025
        matched = False

        for idx, entry in enumerate(pdf_order):
            if match_program(prog, entry):
                sort_order = idx
                db.programs.update_one(
                    {"_id": prog["_id"]},
                    {"$set": {"sort_order": sort_order}}
                )
                updated += 1
                matched = True
                break

        if not matched:
            unmatched.append(f"{year} {brand} {model} - {trim}")
            # Give unmatched programs a high sort_order
            db.programs.update_one(
                {"_id": prog["_id"]},
                {"$set": {"sort_order": 999}}
            )

    print(f"Updated sort_order for {updated} programs")
    if unmatched:
        print(f"\nUnmatched programs ({len(unmatched)}):")
        for u in unmatched:
            print(f"  - {u}")


def update_trim_orders_collection():
    """Update the trim_orders collection to match the PDF exactly."""
    db.trim_orders.drop()

    # 2026 model order
    models_2026 = []
    seen = set()
    for brand, model, trim in PDF_ORDER_2026:
        key = (brand, model)
        if key not in seen:
            seen.add(key)
            models_2026.append({"brand": brand, "model": model, "trims": []})
        for entry in models_2026:
            if entry["brand"] == brand and entry["model"] == model:
                entry["trims"].append(trim if trim else "__none__")
                break

    for entry in models_2026:
        db.trim_orders.insert_one({
            "brand": entry["brand"],
            "model": entry["model"],
            "year": 2026,
            "trims": entry["trims"],
            "source": "February 2026 QBC Retail Incentive Programs PDF",
            "updated_at": datetime.utcnow()
        })

    # 2025 model order
    models_2025 = []
    seen = set()
    for brand, model, trim in PDF_ORDER_2025:
        key = (brand, model)
        if key not in seen:
            seen.add(key)
            models_2025.append({"brand": brand, "model": model, "trims": []})
        for entry in models_2025:
            if entry["brand"] == brand and entry["model"] == model:
                entry["trims"].append(trim if trim else "__none__")
                break

    for entry in models_2025:
        db.trim_orders.insert_one({
            "brand": entry["brand"],
            "model": entry["model"],
            "year": 2025,
            "trims": entry["trims"],
            "source": "February 2026 QBC Retail Incentive Programs PDF",
            "updated_at": datetime.utcnow()
        })

    total = db.trim_orders.count_documents({})
    print(f"Updated trim_orders collection: {total} entries")


def verify():
    """Print programs in sort_order to verify alignment with PDF."""
    for year in [2026, 2025]:
        print(f"\n{'='*60}")
        print(f"  {year} MODELS (should match PDF page {20 if year == 2026 else 21})")
        print(f"{'='*60}")

        programs = list(db.programs.find(
            {"program_month": 2, "program_year": 2026, "year": year},
            {"_id": 0, "brand": 1, "model": 1, "trim": 1, "year": 1, "sort_order": 1,
             "consumer_cash": 1}
        ).sort("sort_order", 1))

        for p in programs:
            trim_str = p.get("trim") or "(all)"
            cash = p.get("consumer_cash", 0)
            cash_str = f"${cash:,.0f}" if cash > 0 else ""
            print(f"  [{p.get('sort_order', '?'):>3}] {p.get('brand')} {p.get('model')} {trim_str} {cash_str}")


if __name__ == "__main__":
    print("=" * 60)
    print("  Aligning sort_order with FCA QBC Incentive PDF")
    print("=" * 60)

    print("\n1. Updating trim_orders collection...")
    update_trim_orders_collection()

    print("\n2. Updating program sort_orders...")
    update_sort_orders()

    print("\n3. Verifying alignment...")
    verify()
