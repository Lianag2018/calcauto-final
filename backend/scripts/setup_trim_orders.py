"""
Direct sort_order mapping aligned EXACTLY with FCA QBC Incentive PDF.
Uses exact (brand, model, trim) tuples from the database.
"""
import pymongo
import os
from datetime import datetime

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

client = pymongo.MongoClient(MONGO_URL)
db = client[DB_NAME]

# ============================================================
# EXACT sort_order matching PDF page 20 - 2026 MODELS
# Key = (brand, model, trim)  Value = sort_order (PDF line position)
# ============================================================
SORT_MAP_2026 = {
    # CHRYSLER
    ("Chrysler", "Grand Caravan", "SXT"): 0,
    ("Chrysler", "Pacifica", "PHEV"): 1,
    ("Chrysler", "Pacifica", "excluding PHEV"): 2,
    # JEEP - Compass
    ("Jeep", "Compass", "Sport"): 3,
    ("Jeep", "Compass", "North"): 4,
    ("Jeep", "Compass", "North w/ Altitude Package (ADZ)"): 5,
    ("Jeep", "Compass", "Trailhawk"): 6,
    ("Jeep", "Compass", "Limited"): 7,
    # JEEP - Cherokee
    ("Jeep", "Cherokee", "Base (KMJL74)"): 8,
    ("Jeep", "Cherokee", "excluding Base (KMJL74)"): 9,
    # JEEP - Wrangler (PDF: 2-Door, 2-Door Rubicon, 4-Door, 4-Door MOAB)
    ("Jeep", "Wrangler", "2-Door (JL) (JLJL72) (non Rubicon models)"): 10,
    ("Jeep", "Wrangler", "2-Door Rubicon (JL) (JLJS72)"): 11,
    ("Jeep", "Wrangler", "4-Door (excluding 392 and 4xe Models)"): 12,
    ("Jeep", "Wrangler", "4-Door MOAB 392 (JLJX74)"): 13,
    # JEEP - Gladiator
    ("Jeep", "Gladiator", "Sport S, Willys, Sahara, Willys '41 (JTJL98)"): 14,
    ("Jeep", "Gladiator", "excluding Sport S, Willys, Sahara, Willys '41 (JTJL98)"): 15,
    # JEEP - Grand Cherokee/L
    ("Jeep", "Grand Cherokee/Grand Cherokee L", "Laredo/Laredo X (CPOS 22L/22P)"): 16,
    ("Jeep", "Grand Cherokee/Grand Cherokee L", "Altitude (CPOS 2B5)"): 17,
    ("Jeep", "Grand Cherokee/Grand Cherokee L", "Limited/Limited Reserve/Summit (CPOS 2C6/2C1/2C3)"): 18,
    # JEEP - Grand Wagoneer
    ("Jeep", "Grand Wagoneer / Grand Wagoneer L", None): 19,
    # DODGE
    ("Dodge", "Durango", "SXT, GT, GT Plus"): 20,
    ("Dodge", "Durango", "GT Hemi V8 Plus, GT Hemi V8 Premium"): 21,
    ("Dodge", "Durango", "SRT Hellcat"): 22,
    ("Dodge", "Charger", "2-Door & 4-Door (ICE)"): 23,
    # RAM
    ("Ram", "ProMaster", None): 24,
    ("Ram", "1500", "Tradesman, Express, Warlock"): 25,
    ("Ram", "1500", "Big Horn"): 26,
    ("Ram", "1500", "Sport, Rebel"): 27,
    ("Ram", "1500", "Laramie (DT6P98)"): 28,
    ("Ram", "1500", "Laramie, Limited, Longhorn, Tungsten, RHO (excluding Laramie (DT6P98))"): 29,
    ("Ram", "2500", "Power Wagon Crew Cab (DJ7X91 2UP)"): 30,
    ("Ram", "2500/3500", "Gas Models (excl 2500 Power Wagon Crew Cab (DJ7X91 2UP), Chassis Cab Models)"): 31,
    ("Ram", "2500/3500", "Diesel Models (excl Chassis Cab Models)"): 32,
    ("Ram", "Chassis Cab", None): 33,
    # Handle extra DB entries (same model different period)
    ("Dodge", "Durango", "GT, GT Plus"): 20,  # Alias for SXT, GT, GT Plus position
}

# ============================================================
# EXACT sort_order matching PDF page 21 - 2025 MODELS
# ============================================================
SORT_MAP_2025 = {
    # CHRYSLER
    ("Chrysler", "Grand Caravan", "SXT"): 0,
    ("Chrysler", "Pacifica", "Hybrid"): 1,
    ("Chrysler", "Pacifica", "Select Models (excludes Hybrid)"): 2,
    ("Chrysler", "Pacifica", "excludes Select & Hybrid Models"): 3,
    # JEEP - Compass
    ("Jeep", "Compass", "Sport"): 4,
    ("Jeep", "Compass", "North"): 5,
    ("Jeep", "Compass", "Altitude, Trailhawk, Trailhawk Elite"): 6,
    ("Jeep", "Compass", "Limited"): 7,
    # JEEP - Wrangler (PDF: 4xe first, then 2-Door, Rubicon, 4-Door)
    ("Jeep", "Wrangler", "4-Door (JL) 4xe (JLXL74)"): 8,
    ("Jeep", "Wrangler", "4-Door (JL) 4xe (excludes JLXL74)"): 9,
    ("Jeep", "Wrangler", "2-Door (JL) (JLJL72) (non Rubicon models)"): 10,
    ("Jeep", "Wrangler", "2-Door Rubicon (JL) (JLJS72)"): 11,
    ("Jeep", "Wrangler", "4-Door Rubicon w/ 2.0L (JLJS74 22R)"): 12,
    ("Jeep", "Wrangler", "4-Door (JL) (excluding Rubicon w/ 2.0L(JLJS74 22R) and 4xe)"): 13,
    # JEEP - Gladiator
    ("Jeep", "Gladiator", None): 14,
    # JEEP - Grand Cherokee
    ("Jeep", "Grand Cherokee", "4xe (WL)"): 15,
    ("Jeep", "Grand Cherokee", "Laredo (WLJH74 2*A) (WL)"): 16,
    ("Jeep", "Grand Cherokee", "Altitude (WLJH74 2*B) (WL)"): 17,
    ("Jeep", "Grand Cherokee", "Summit (WLJT74 23S) (WL)"): 18,
    ("Jeep", "Grand Cherokee", "excludes Laredo (WLJH74 2*A & 2*B), Summit (WLJT74 23S), and 4xe"): 19,
    # Also handle the alternate trim name in DB
    ("Jeep", "Grand Cherokee", "(WL) (excludes Laredo (WLJH74 2*A & 2*B), Summit (WLJT74 23S), and 4xe)"): 19,
    # JEEP - Grand Cherokee L
    ("Jeep", "Grand Cherokee L", "Laredo (WLJH75 2*A) (WL)"): 20,
    ("Jeep", "Grand Cherokee L", "Altitude (WLJH75 2*B) (WL)"): 21,
    ("Jeep", "Grand Cherokee L", "Overland (WLJS75) (WL)"): 22,
    ("Jeep", "Grand Cherokee L", "excludes Laredo (WLJH75 2*A & 2*B) and Overland (WLJS75)"): 23,
    # Also handle alternate trim name in DB
    ("Jeep", "Grand Cherokee L", "(WL) (excludes Laredo (WLJH75 2*A & 2*B) and Overland (WLJS75))"): 23,
    # JEEP - Wagoneer
    ("Jeep", "Wagoneer / Wagoneer L", None): 24,
    ("Jeep", "Wagoneer", "/ Wagoneer L"): 24,  # Alternate DB entry
    ("Jeep", "Grand Wagoneer / Grand Wagoneer L", None): 25,
    ("Jeep", "Grand Wagoneer", "/ Grand Wagoneer L"): 25,  # Alternate DB entry
    ("Jeep", "Wagoneer S", "Limited & Premium (BEV)"): 26,
    # DODGE
    ("Dodge", "Durango", "GT, GT Plus"): 27,
    ("Dodge", "Durango", "R/T, R/T Plus, R/T 20th Anniversary, R/T Plus 20th Anniversary"): 28,
    ("Dodge", "Durango", "SRT Hellcat"): 29,
    ("Dodge", "Charger", "Daytona R/T (BEV)"): 30,
    ("Dodge", "Charger", "Daytona R/T Plus (BEV)"): 31,
    ("Dodge", "Charger", "Daytona Scat Pack (BEV)"): 32,
    ("Dodge", "Hornet", "RT (PHEV)"): 33,
    ("Dodge", "Hornet", "RT Plus (PHEV)"): 34,
    ("Dodge", "Hornet", "GT (Gas)"): 35,
    ("Dodge", "Hornet", "GT Plus (Gas)"): 36,
    # RAM
    ("Ram", "ProMaster", None): 37,
    ("Ram", "1500", "Tradesman, Warlock, Express (DT)"): 38,
    ("Ram", "1500", "Big Horn (DT) with Off-Roader Value Package (4KF)"): 39,
    ("Ram", "1500", "Big Horn (DT) (excludes Big Horn with Off-Roader Value Package (4KF))"): 40,
    ("Ram", "1500", "Sport, Rebel (DT)"): 41,
    ("Ram", "1500", "Laramie, Limited, Longhorn, Tungsten, RHO (DT)"): 42,
    ("Ram", "2500/3500", "Gas Models (Excludes Chassis Cab models, Diesel Engine models)"): 43,
    ("Ram", "2500/3500", "6.7L High Output Diesel Models (ETM) (excludes Chassis Cab models)"): 44,
    ("Ram", "Chassis Cab", None): 45,
    # FIAT
    ("Fiat", "500e", "BEV"): 46,
}


def update_sort_orders():
    """Update sort_order for ALL programs using EXACT key matching."""
    programs = list(db.programs.find({}))
    updated = 0
    unmatched = []

    for prog in programs:
        year = prog.get("year")
        brand = prog.get("brand", "")
        model = prog.get("model", "")
        trim = prog.get("trim")

        sort_map = SORT_MAP_2026 if year == 2026 else SORT_MAP_2025
        key = (brand, model, trim)

        if key in sort_map:
            sort_order = sort_map[key]
            db.programs.update_one(
                {"_id": prog["_id"]},
                {"$set": {"sort_order": sort_order}}
            )
            updated += 1
        else:
            unmatched.append(f"{year} | {brand} | {model} | {trim}")
            db.programs.update_one(
                {"_id": prog["_id"]},
                {"$set": {"sort_order": 999}}
            )

    print(f"Updated sort_order for {updated} programs")
    if unmatched:
        print(f"\nUnmatched ({len(unmatched)}):")
        for u in unmatched:
            print(f"  - {u}")


def update_trim_orders_collection():
    """Update trim_orders collection matching PDF exactly."""
    db.trim_orders.drop()
    
    for year, sort_map in [(2026, SORT_MAP_2026), (2025, SORT_MAP_2025)]:
        models = {}
        for (brand, model, trim), order in sorted(sort_map.items(), key=lambda x: x[1]):
            key = (brand, model)
            if key not in models:
                models[key] = []
            models[key].append({"trim": trim, "sort_order": order})
        
        for (brand, model), trims in models.items():
            db.trim_orders.insert_one({
                "brand": brand,
                "model": model,
                "year": year,
                "trims": [t["trim"] if t["trim"] else "__none__" for t in trims],
                "source": "February 2026 QBC Retail Incentive Programs PDF",
                "updated_at": datetime.utcnow()
            })

    total = db.trim_orders.count_documents({})
    print(f"Updated trim_orders: {total} entries")


def verify():
    """Print programs to verify exact PDF alignment."""
    for year in [2026, 2025]:
        print(f"\n{'='*70}")
        print(f"  {year} MODELS (PDF page {20 if year == 2026 else 21})")
        print(f"{'='*70}")

        programs = list(db.programs.find(
            {"program_month": 2, "program_year": 2026, "year": year},
            {"_id": 0, "brand": 1, "model": 1, "trim": 1, "sort_order": 1,
             "consumer_cash": 1}
        ).sort("sort_order", 1))

        for p in programs:
            trim_str = p.get("trim") or "(all)"
            cash = p.get("consumer_cash", 0)
            cash_str = f"${cash:,.0f}" if cash > 0 else ""
            print(f"  [{p.get('sort_order', '?'):>3}] {p.get('brand')} {p.get('model')} - {trim_str} {cash_str}")


if __name__ == "__main__":
    print("=" * 70)
    print("  EXACT PDF Alignment - FCA QBC Incentive Programs")
    print("=" * 70)

    print("\n1. Updating trim_orders...")
    update_trim_orders_collection()

    print("\n2. Updating sort_orders (exact match)...")
    update_sort_orders()

    print("\n3. Verification...")
    verify()
