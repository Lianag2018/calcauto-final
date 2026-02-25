#!/usr/bin/env python3
"""Parse the full SCI Lease Corp Stellantis Residual Guide PDF into JSON."""
import fitz
import json
import re
import sys

TERMS = ["24", "27", "36", "39", "42", "48", "51", "54", "60"]

# Known body style patterns
BODY_STYLES = [
    "4D Wagon AWD", "4D Wagon", "3D Hatchback",
    "2D Coupe AWD", "4D Sedan AWD",
    "4D Utility 4WD", "4D Utility AWD", "4D Utility",
    "2D Utility 4WD", "2D Utility AWD", "2D Utility",
    "Crew Cab LWB 2WD", "Crew Cab LWB 4WD",
    "Crew Cab SWB 2WD", "Crew Cab SWB 4WD",
    "Crew Cab 4WD",
    "Quad Cab SWB 4WD", "Quad Cab SWB 2WD",
    "Mega Cab 4WD", "Mega Cab 2WD",
    "Reg Cab LWB 2WD", "Reg Cab LWB 4WD",
    "Reg Cab 2WD", "Reg Cab 4WD",
]

def is_number(s):
    try:
        int(s)
        return True
    except:
        return False

def is_body_style(s):
    return s in BODY_STYLES

def parse_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    all_vehicles = []
    
    for page_num in range(doc.page_count):
        page = doc[page_num]
        text = page.get_text()
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        
        # Filter out headers/footers
        clean = []
        for l in lines:
            if '675 Cochrane' in l or 'scileasecorp' in l or 'T: 1-888' in l or 'F: 1-866' in l:
                continue
            if l == 'LEASE RESIDUAL VALUES' or l == 'STANDARD' or l == 'FEBRUARY 2026':
                continue
            if l == 'RESIDUAL VALUE GUIDE' or l.startswith('Effective:'):
                continue
            clean.append(l)
        
        if not clean:
            continue
        
        # Detect brand header
        current_brand = None
        current_model = None
        current_year = None
        
        i = 0
        while i < len(clean):
            line = clean[i]
            
            # Brand headers
            if line in ('CHRYSLER', 'DODGE', 'JEEP', 'RAM', 'FIAT'):
                current_brand = line.title()
                if current_brand == 'Ram':
                    current_brand = 'Ram'
                i += 1
                # Skip term headers if next line is "24" or "24 27 36..."
                if i < len(clean) and (clean[i] == '24' or clean[i].startswith('24 27')):
                    if clean[i] == '24':
                        # Individual lines for each term
                        skip = 0
                        while i + skip < len(clean) and clean[i + skip] in TERMS:
                            skip += 1
                        i += skip
                    else:
                        i += 1  # Single line "24 27 36 39 42 48 51 54 60"
                continue
            
            # Model year header like "MODEL YEAR 2026" or "MODEL YEAR 2025"
            if line.startswith('MODEL YEAR'):
                i += 1
                continue
            
            # Year + Model like "2026 1500", "2026 Charger", "2025 Wrangler 4XE"
            year_match = re.match(r'^(20\d{2})\s+(.+)$', line)
            if year_match:
                current_year = int(year_match.group(1))
                model_raw = year_match.group(2).strip()
                
                # Handle multi-line model names like "2026 Grand\nCaravan"
                # Check if next line is NOT a body style and NOT a number and could be continuation
                if i + 1 < len(clean):
                    next_line = clean[i + 1]
                    if (not is_body_style(next_line) and 
                        not is_number(next_line) and 
                        not re.match(r'^(20\d{2})\s+', next_line) and
                        next_line not in ('CHRYSLER', 'DODGE', 'JEEP', 'RAM', 'FIAT') and
                        next_line not in TERMS and
                        not next_line.startswith('24 27')):
                        # Check if the next-next line is a body style (confirms continuation)
                        if i + 2 < len(clean) and (is_body_style(clean[i + 2]) or is_number(clean[i + 2])):
                            # Not a continuation, next_line is a trim
                            current_model = model_raw
                        else:
                            # Could be continuation like "Grand\nCaravan" or "Grand Cherokee L- 3 Row"
                            # Check if next line starts with uppercase and looks like model continuation
                            current_model = model_raw + ' ' + next_line
                            i += 1
                    else:
                        current_model = model_raw
                else:
                    current_model = model_raw
                
                i += 1
                continue
            
            # At this point, line should be a trim name
            # Check pattern: trim, body_style, 9 numbers
            if current_brand and current_model and current_year:
                trim = line
                
                # Special case: multi-word trims that span lines
                # E.g., "SRT Hellcat\nHammerhead" or "SRT Hellcat Silver\nBullet"
                # or "Charger\nDaytona" (sub-model) or "R/T 20th Anniv"
                
                # Look ahead: next should be body_style
                if i + 1 < len(clean):
                    next_line = clean[i + 1]
                    
                    if is_body_style(next_line):
                        body_style = next_line
                        # Read 9 residual values
                        vals = []
                        j = i + 2
                        while j < len(clean) and len(vals) < 9:
                            if is_number(clean[j]):
                                vals.append(int(clean[j]))
                                j += 1
                            else:
                                break
                        
                        if len(vals) == 9:
                            vehicle = {
                                "brand": current_brand,
                                "model_year": current_year,
                                "model_name": current_model,
                                "trim": trim,
                                "body_style": body_style,
                                "residual_percentages": dict(zip(TERMS, vals))
                            }
                            all_vehicles.append(vehicle)
                            i = j
                            continue
                    
                    # Maybe trim is multi-line (e.g., "Charger\nDaytona" becomes sub-model)
                    # Or "SRT Hellcat\nHammerhead"
                    if not is_body_style(next_line) and not is_number(next_line):
                        # Could be trim continuation
                        combined_trim = trim + ' ' + next_line
                        if i + 2 < len(clean) and is_body_style(clean[i + 2]):
                            body_style = clean[i + 2]
                            vals = []
                            j = i + 3
                            while j < len(clean) and len(vals) < 9:
                                if is_number(clean[j]):
                                    vals.append(int(clean[j]))
                                    j += 1
                                else:
                                    break
                            
                            if len(vals) == 9:
                                vehicle = {
                                    "brand": current_brand,
                                    "model_year": current_year,
                                    "model_name": current_model,
                                    "trim": combined_trim,
                                    "body_style": body_style,
                                    "residual_percentages": dict(zip(TERMS, vals))
                                }
                                all_vehicles.append(vehicle)
                                i = j
                                continue
            
            i += 1
    
    doc.close()
    return all_vehicles

if __name__ == '__main__':
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else '/app/sci_residual_guide.pdf'
    vehicles = parse_pdf(pdf_path)
    
    # Build final JSON
    result = {
        "effective_from": "2026-02-03",
        "effective_to": "2026-03-02",
        "source": "SCI Lease Corp Stellantis Residual Guide - February 2026",
        "km_adjustments": {
            "standard_km": 24000,
            "adjustments": {
                "18000": {"24": 1, "27": 1, "36": 2, "39": 2, "42": 2, "48": 3, "51": 3, "54": 3, "60": 4},
                "12000": {"24": 2, "27": 2, "36": 3, "39": 3, "42": 3, "48": 4, "51": 4, "54": 4, "60": 5}
            },
            "max_km_per_year": 36000
        },
        "vehicles": vehicles
    }
    
    print(f"Total vehicles extracted: {len(vehicles)}")
    
    # Count by brand
    brands = {}
    for v in vehicles:
        key = f"{v['brand']} ({v['model_year']})"
        brands[key] = brands.get(key, 0) + 1
    for k, count in sorted(brands.items()):
        print(f"  {k}: {count}")
    
    # Write output
    output_path = '/app/backend/data/sci_residuals_feb2026.json'
    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"\nWritten to {output_path}")
