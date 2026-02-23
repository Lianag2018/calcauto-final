#!/usr/bin/env python3
"""
Script pour extraire les codes produits 2025 des PDFs Stellantis/FCA
et les ajouter à la base de données existante.
"""

import pdfplumber
import json
import re
import os
from pathlib import Path

def extract_codes_from_pdf(pdf_path: str, year: str) -> dict:
    """Extrait les codes produits d'un PDF de guide de commande."""
    codes = {}
    
    # Déterminer la marque à partir du nom de fichier
    filename = os.path.basename(pdf_path).lower()
    
    # Mapping des noms de fichiers aux marques
    if 'ram' in filename or 'promaster' in filename:
        brand = 'Ram'
    elif 'wrangler' in filename:
        brand = 'Jeep'
        base_model = 'Wrangler'
    elif 'gladiator' in filename:
        brand = 'Jeep'
        base_model = 'Gladiator'
    elif 'compass' in filename:
        brand = 'Jeep'
        base_model = 'Compass'
    elif 'grandcherokee' in filename or 'grand cherokee' in filename:
        brand = 'Jeep'
        base_model = 'Grand Cherokee'
    elif 'wagoneer' in filename:
        brand = 'Jeep'
        if 'grand' in filename:
            base_model = 'Grand Wagoneer'
        else:
            base_model = 'Wagoneer'
    elif 'durango' in filename:
        brand = 'Dodge'
        base_model = 'Durango'
    elif 'hornet' in filename:
        brand = 'Dodge'
        base_model = 'Hornet'
    elif 'chrysler' in filename:
        brand = 'Chrysler'
        base_model = None
    elif 'fiat' in filename:
        brand = 'Fiat'
        base_model = '500X'
    else:
        brand = 'Unknown'
        base_model = None
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            # Extraire le texte de la première page (table des matières)
            if len(pdf.pages) > 0:
                text = pdf.pages[0].extract_text()
                if text:
                    lines = text.split('\n')
                    
                    for line in lines:
                        # Pattern pour capturer: DESCRIPTION CODE PAGE
                        # Les codes FCA sont de 6 caractères alphanumériques
                        # Ex: "3500BIGHORNCREWCAB4X4(169INWB8FT0INBox) D28H92 54"
                        match = re.search(r'([A-Z0-9\s\(\)\/\-\.]+?)\s+([A-Z][A-Z0-9]{5})\s+\d+\s*$', line)
                        if match:
                            raw_text = match.group(1).strip()
                            code = match.group(2)
                            
                            # Parser les détails
                            parsed = parse_vehicle_details(raw_text, brand, filename)
                            
                            if parsed:
                                codes[code] = {
                                    "year": year,
                                    "brand": brand,
                                    "model": parsed['model'],
                                    "trim": parsed['trim'],
                                    "cab": parsed.get('cab', ''),
                                    "drive": parsed.get('drive', ''),
                                    "raw": raw_text
                                }
    except Exception as e:
        print(f"  ERREUR: {pdf_path}: {e}")
    
    return codes

def parse_vehicle_details(text: str, brand: str, filename: str) -> dict:
    """Parse le texte pour extraire modèle, trim, cab, drive."""
    text_upper = text.upper().replace(' ', '')
    original_text = text.upper()
    
    result = {
        'model': '',
        'trim': '',
        'cab': '',
        'drive': ''
    }
    
    # Détecter le drive
    if '4X4' in text_upper:
        result['drive'] = '4x4'
    elif '4X2' in text_upper or 'FWD' in text_upper:
        result['drive'] = '4x2'
    elif 'AWD' in text_upper:
        result['drive'] = 'AWD'
    
    # Parse selon la marque
    if brand == 'Ram':
        # Format: 3500BIGHORNCREWCAB4X4
        match = re.match(r'(\d+)', text_upper)
        if match:
            model_num = match.group(1)
            result['model'] = f"Ram {model_num}"
            
            # Cab type
            if 'CREWCAB' in text_upper:
                result['cab'] = 'Crew Cab'
            elif 'QUADCAB' in text_upper:
                result['cab'] = 'Quad Cab'
            elif 'MEGACAB' in text_upper:
                result['cab'] = 'Mega Cab'
            elif 'REGULARCAB' in text_upper or 'REGCAB' in text_upper:
                result['cab'] = 'Regular Cab'
            
            # Trim
            trims = ['TRADESMAN', 'BIGHORN', 'LARAMIE', 'LIMITED', 'LONGHORN', 'REBEL', 'TRX', 'TUNGSTEN', 'SPORT', 'SLT']
            for t in trims:
                if t in text_upper:
                    result['trim'] = t.title()
                    break
            
            # ProMaster spécial
            if 'PROMASTER' in text_upper:
                result['model'] = 'ProMaster'
                if 'EV' in text_upper:
                    result['model'] = 'ProMaster EV'
                if 'CARGO' in text_upper:
                    result['trim'] = 'Cargo Van'
        
        # Chassis
        if 'CHASSIS' in text_upper:
            result['model'] += ' Chassis'
    
    elif brand == 'Jeep':
        # Déterminer le modèle de base
        if 'wrangler' in filename:
            result['model'] = 'Wrangler'
            if '4XE' in text_upper:
                result['model'] = 'Wrangler 4xe'
        elif 'gladiator' in filename:
            result['model'] = 'Gladiator'
        elif 'compass' in filename:
            result['model'] = 'Compass'
        elif 'grandcherokee' in filename:
            result['model'] = 'Grand Cherokee'
            if '4XE' in text_upper or '4xe' in filename:
                result['model'] = 'Grand Cherokee 4xe'
            if 'cherokeel' in filename:
                result['model'] = 'Grand Cherokee L'
        elif 'grandwagoneer' in filename:
            result['model'] = 'Grand Wagoneer'
            if 'wagoneerl' in filename:
                result['model'] = 'Grand Wagoneer L'
        elif 'wagoneers' in filename:
            result['model'] = 'Wagoneer S'
        elif 'wagoneerl' in filename:
            result['model'] = 'Wagoneer L'
        elif 'wagoneer' in filename:
            result['model'] = 'Wagoneer'
        
        # Trims Jeep
        jeep_trims = ['SPORT', 'SPORTS', 'ALTITUDE', 'TRAILHAWK', 'SAHARA', 'RUBICON', 'WILLYS', 
                      'HIGHALTITUDE', 'LIMITED', 'OVERLAND', 'SUMMIT', 'SUMMITRESERVE',
                      'SERIESI', 'SERIESII', 'SERIESIII', 'CARBIDE', 'OBSIDIAN', 'HURRICANE',
                      'NORTH', 'LAREDO']
        for t in jeep_trims:
            if t in text_upper:
                # Nettoyer le nom du trim
                trim_name = t.replace('HIGHALTITUDE', 'High Altitude').replace('SUMMITRESERVE', 'Summit Reserve')
                trim_name = trim_name.replace('SERIESI', 'Series I').replace('SERIESII', 'Series II').replace('SERIESIII', 'Series III')
                if trim_name == t:
                    trim_name = t.title()
                result['trim'] = trim_name
                break
    
    elif brand == 'Dodge':
        if 'durango' in filename:
            result['model'] = 'Durango'
        elif 'hornet' in filename:
            result['model'] = 'Hornet'
        
        # Trims Dodge
        dodge_trims = ['SXT', 'GT', 'R/T', 'CITADEL', 'PURSUIT', 'GTPLUS', 'R/TPLUS']
        for t in dodge_trims:
            t_clean = t.replace('/', '')
            if t_clean in text_upper:
                result['trim'] = t
                break
    
    elif brand == 'Chrysler':
        if 'PACIFICA' in text_upper:
            result['model'] = 'Pacifica'
        elif 'VOYAGER' in text_upper:
            result['model'] = 'Voyager'
        elif 'GRANDCARAVAN' in text_upper:
            result['model'] = 'Grand Caravan'
        elif '300' in text_upper:
            result['model'] = '300'
        else:
            result['model'] = 'Chrysler'
        
        # Trims Chrysler
        chrysler_trims = ['TOURING', 'TOURINGL', 'LIMITED', 'PINNACLE', 'S', 'LX', 'SELECT']
        for t in chrysler_trims:
            if t in text_upper:
                result['trim'] = t.title().replace('Touringl', 'Touring L')
                break
    
    elif brand == 'Fiat':
        result['model'] = '500X'
        fiat_trims = ['POP', 'SPORT', 'TREKKING', 'LOUNGE']
        for t in fiat_trims:
            if t in text_upper:
                result['trim'] = t.title()
                break
    
    return result if result['model'] else None

def main():
    """Fonction principale pour extraire et fusionner les codes."""
    backend_dir = Path('/app/backend')
    data_dir = backend_dir / 'data'
    
    # Charger les codes existants (2026)
    existing_file = backend_dir / 'fca_product_codes_2026.json'
    if existing_file.exists():
        with open(existing_file, 'r', encoding='utf-8') as f:
            all_codes = json.load(f)
        print(f"Chargé {len(all_codes)} codes 2026 existants")
    else:
        all_codes = {}
        print("Aucun fichier existant trouvé")
    
    # Traiter les PDFs 2025
    pdfs_2025_dir = data_dir / '2025_pdfs' / '2025'
    if pdfs_2025_dir.exists():
        print(f"\nTraitement des PDFs 2025...")
        new_codes_count = 0
        
        for pdf_file in sorted(pdfs_2025_dir.glob('*.pdf')):
            if 'codeGuidesView' in pdf_file.name:
                continue
            
            print(f"  - {pdf_file.name}")
            codes = extract_codes_from_pdf(str(pdf_file), "2025")
            
            for code, data in codes.items():
                if code not in all_codes:
                    all_codes[code] = data
                    new_codes_count += 1
        
        print(f"\n{new_codes_count} nouveaux codes 2025 ajoutés")
    
    # Sauvegarder le fichier fusionné
    output_file = backend_dir / 'fca_product_codes_2026.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_codes, f, indent=2, ensure_ascii=False)
    
    print(f"\n=== RÉSULTAT FINAL ===")
    print(f"Total: {len(all_codes)} codes")
    print(f"Fichier sauvegardé: {output_file}")
    
    # Stats par année
    years = {}
    brands = {}
    for code, data in all_codes.items():
        year = data.get('year', 'unknown')
        brand = data.get('brand', 'unknown')
        years[year] = years.get(year, 0) + 1
        brands[brand] = brands.get(brand, 0) + 1
    
    print(f"\nPar année: {years}")
    print(f"Par marque: {brands}")
    
    # Exemples
    print("\nExemples de codes 2025:")
    count = 0
    for code, data in all_codes.items():
        if data.get('year') == '2025':
            print(f"  {code}: {data['brand']} {data['model']} {data.get('trim', '')} {data.get('cab', '')} {data.get('drive', '')}")
            count += 1
            if count >= 15:
                break

if __name__ == "__main__":
    main()
