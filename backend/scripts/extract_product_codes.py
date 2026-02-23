#!/usr/bin/env python3
"""
Script pour extraire les codes produits des PDFs Stellantis/FCA
et créer une base de données JSON pour le décodage des factures.
"""

import pdfplumber
import json
import re
import os
from pathlib import Path

def extract_codes_from_pdf(pdf_path: str, year: str) -> list:
    """Extrait les codes produits d'un PDF de guide de commande."""
    codes = []
    
    # Déterminer la marque à partir du nom de fichier
    filename = os.path.basename(pdf_path).lower()
    
    if 'ram' in filename:
        brand = 'Ram'
    elif 'jeep' in filename or 'wrangler' in filename or 'gladiator' in filename or 'compass' in filename or 'cherokee' in filename or 'wagoneer' in filename:
        brand = 'Jeep'
    elif 'durango' in filename or 'hornet' in filename:
        brand = 'Dodge'
    elif 'chrysler' in filename:
        brand = 'Chrysler'
    elif 'fiat' in filename:
        brand = 'Fiat'
    elif 'alfa' in filename:
        brand = 'Alfa Romeo'
    else:
        brand = 'Unknown'
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            # Extraire le texte de la première page (table des matières)
            if len(pdf.pages) > 0:
                text = pdf.pages[0].extract_text()
                if text:
                    # Pattern pour les codes produits FCA (ex: D23L91, WDXH74, etc.)
                    # Format: MODEL_DESCRIPTION CODE PAGE
                    lines = text.split('\n')
                    
                    for line in lines:
                        # Chercher les patterns de code produit (6 caractères alphanumériques)
                        # Pattern: texte du modèle suivi d'un code de 6 caractères
                        match = re.search(r'([A-Z0-9\s\(\)]+?)\s+([A-Z][A-Z0-9]{5})\s+\d+', line)
                        if match:
                            model_text = match.group(1).strip()
                            code = match.group(2)
                            
                            # Nettoyer le texte du modèle
                            model_text = re.sub(r'\s+', ' ', model_text)
                            
                            # Extraire le modèle et le trim
                            model, trim = parse_model_trim(model_text, brand)
                            
                            if model and code:
                                codes.append({
                                    "code": code,
                                    "year": year,
                                    "brand": brand,
                                    "model": model,
                                    "trim": trim,
                                    "full_description": model_text,
                                    "source_file": os.path.basename(pdf_path)
                                })
    except Exception as e:
        print(f"Erreur lors du traitement de {pdf_path}: {e}")
    
    return codes

def parse_model_trim(text: str, brand: str) -> tuple:
    """Parse le texte pour extraire le modèle et le trim."""
    text = text.upper()
    
    # Patterns pour les modèles Ram
    if brand == 'Ram':
        # Ex: "3500TRADESMANCREWCAB4X2(149INWB6FT4INBox)"
        match = re.match(r'(\d+)\s*([A-Z]+)', text)
        if match:
            model_num = match.group(1)
            trim_start = match.group(2)
            
            # Identifier le trim
            trims = ['TRADESMAN', 'BIGHORN', 'LARAMIE', 'LIMITED', 'LONGHORN', 'REBEL', 'TRX', 'TUNGSTEN', 'SPORT']
            trim = None
            for t in trims:
                if t in text:
                    trim = t.title()
                    break
            
            # Identifier le type de cabine
            cab = ''
            if 'CREWCAB' in text or 'CREW CAB' in text:
                cab = 'Crew Cab'
            elif 'QUADCAB' in text or 'QUAD CAB' in text:
                cab = 'Quad Cab'
            elif 'MEGACAB' in text or 'MEGA CAB' in text:
                cab = 'Mega Cab'
            elif 'REGCAB' in text or 'REG CAB' in text or 'REGULAR' in text:
                cab = 'Regular Cab'
            
            # Identifier 4x4 ou 4x2
            drive = '4x4' if '4X4' in text else '4x2' if '4X2' in text else ''
            
            model = f"Ram {model_num}"
            if cab:
                model += f" {cab}"
            if drive:
                model += f" {drive}"
            
            return model, trim
    
    # Patterns pour les modèles Jeep
    elif brand == 'Jeep':
        jeep_models = {
            'WRANGLER': 'Wrangler',
            'GLADIATOR': 'Gladiator',
            'COMPASS': 'Compass',
            'GRANDCHEROKEE': 'Grand Cherokee',
            'GRAND CHEROKEE': 'Grand Cherokee',
            'WAGONEER': 'Wagoneer',
            'GRANDWAGONEER': 'Grand Wagoneer',
            'GRAND WAGONEER': 'Grand Wagoneer'
        }
        
        model = None
        for key, val in jeep_models.items():
            if key in text.replace(' ', ''):
                model = val
                break
        
        if not model:
            model = 'Jeep'
        
        # Trims Jeep
        jeep_trims = ['SPORT', 'SPORT S', 'ALTITUDE', 'TRAILHAWK', 'SAHARA', 'RUBICON', 'WILLYS', 
                      'HIGH ALTITUDE', 'LIMITED', 'OVERLAND', 'SUMMIT', 'SUMMIT RESERVE',
                      'SERIES I', 'SERIES II', 'SERIES III', 'CARBIDE', 'OBSIDIAN', 'HURRICANE']
        
        trim = None
        for t in jeep_trims:
            if t.replace(' ', '') in text.replace(' ', ''):
                trim = t.title()
                break
        
        # Check for 4xe
        if '4XE' in text:
            model += ' 4xe'
        
        # Check for L (long wheelbase)
        if model and ('CHEROKEEL' in text.replace(' ', '') or text.endswith('L')):
            if 'L' not in model:
                model += ' L'
        
        return model, trim
    
    # Patterns pour Dodge
    elif brand == 'Dodge':
        dodge_models = {
            'DURANGO': 'Durango',
            'HORNET': 'Hornet'
        }
        
        model = None
        for key, val in dodge_models.items():
            if key in text:
                model = val
                break
        
        if not model:
            model = 'Dodge'
        
        # Trims Dodge
        dodge_trims = ['SXT', 'GT', 'R/T', 'CITADEL', 'PURSUIT', 'GT PLUS', 'R/T PLUS']
        
        trim = None
        for t in dodge_trims:
            if t.replace('/', '') in text.replace('/', ''):
                trim = t
                break
        
        return model, trim
    
    # Patterns pour Chrysler
    elif brand == 'Chrysler':
        if 'PACIFICA' in text:
            model = 'Pacifica'
        elif 'VOYAGER' in text:
            model = 'Voyager'
        elif '300' in text:
            model = '300'
        else:
            model = 'Chrysler'
        
        chrysler_trims = ['TOURING', 'TOURING L', 'LIMITED', 'PINNACLE', 'S', 'AWD']
        trim = None
        for t in chrysler_trims:
            if t in text:
                trim = t
                break
        
        return model, trim
    
    # Patterns pour Fiat
    elif brand == 'Fiat':
        if '500' in text:
            model = '500'
        else:
            model = 'Fiat'
        
        fiat_trims = ['POP', 'SPORT', 'LOUNGE', 'ABARTH', 'TURBO']
        trim = None
        for t in fiat_trims:
            if t in text:
                trim = t
                break
        
        return model, trim
    
    return text, None

def main():
    """Fonction principale pour extraire tous les codes."""
    data_dir = Path('/app/backend/data')
    
    all_codes = {}
    
    # Traiter les PDFs 2025
    pdfs_2025_dir = data_dir / '2025_pdfs' / '2025'
    if pdfs_2025_dir.exists():
        print(f"Traitement des PDFs 2025 dans {pdfs_2025_dir}...")
        for pdf_file in pdfs_2025_dir.glob('*.pdf'):
            if 'codeGuidesView' in pdf_file.name:
                continue  # Skip index file
            print(f"  - {pdf_file.name}")
            codes = extract_codes_from_pdf(str(pdf_file), "2025")
            for code_entry in codes:
                code = code_entry['code']
                if code not in all_codes:
                    all_codes[code] = code_entry
                else:
                    # Si le code existe déjà, garder celui avec plus d'info
                    if len(code_entry.get('trim', '') or '') > len(all_codes[code].get('trim', '') or ''):
                        all_codes[code] = code_entry
    
    # Traiter les PDFs 2026 s'ils existent
    pdfs_2026_dir = data_dir / '2026_pdfs'
    if pdfs_2026_dir.exists():
        print(f"\nTraitement des PDFs 2026 dans {pdfs_2026_dir}...")
        for pdf_file in pdfs_2026_dir.glob('*.pdf'):
            print(f"  - {pdf_file.name}")
            codes = extract_codes_from_pdf(str(pdf_file), "2026")
            for code_entry in codes:
                code = code_entry['code']
                if code not in all_codes:
                    all_codes[code] = code_entry
    
    # Sauvegarder le fichier JSON
    output_file = data_dir / 'product_codes.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_codes, f, indent=2, ensure_ascii=False)
    
    print(f"\n=== RÉSULTAT ===")
    print(f"Total: {len(all_codes)} codes extraits")
    print(f"Fichier sauvegardé: {output_file}")
    
    # Afficher quelques exemples
    print("\nExemples de codes extraits:")
    for i, (code, data) in enumerate(list(all_codes.items())[:10]):
        print(f"  {code}: {data['year']} {data['brand']} {data['model']} {data.get('trim', '')}")
    
    return all_codes

if __name__ == "__main__":
    main()
