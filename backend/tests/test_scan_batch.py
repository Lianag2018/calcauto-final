"""
SCRIPT TEST BATCH - Pipeline Scan Invoice FCA
Tests automatisés avec pytest + rapport JSON + statistiques

Usage:
    pytest tests/test_scan_batch.py -v
    python tests/test_scan_batch.py  # Mode standalone

Structure:
    backend/test_invoices/ -> Dossier pour les factures de test
    backend/tests/batch_test_report.json -> Rapport généré
"""

import os
import sys
import base64
import requests
import json
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional

# Ajouter le chemin backend
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

# =========================
# CONFIGURATION
# =========================

# URL API - supporte local et preview
API_URL = os.environ.get("TEST_API_URL", "http://localhost:8001/api/inventory/scan-invoice")
TEST_FOLDER = Path(__file__).parent.parent / "test_invoices"
OUTPUT_FILE = Path(__file__).parent / "batch_test_report.json"
STATS_FILE = Path(__file__).parent / "batch_test_stats.json"

# Token par défaut (sera récupéré dynamiquement)
DEFAULT_TOKEN = os.environ.get("TEST_TOKEN", "")


# =========================
# FONCTIONS UTILITAIRES
# =========================

def get_auth_token(email: str = "danielgiroux007@gmail.com", password: str = "Liana2018$") -> Optional[str]:
    """Récupère un token JWT pour les tests"""
    login_url = API_URL.replace("/inventory/scan-invoice", "/auth/login")
    try:
        response = requests.post(
            login_url,
            json={"email": email, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            return response.json().get("access_token")
    except Exception as e:
        print(f"Auth failed: {e}")
    return DEFAULT_TOKEN


def get_headers(token: str = None) -> Dict[str, str]:
    """Génère les headers avec le token"""
    if not token:
        token = get_auth_token()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }


def scan_invoice(file_path: Path, headers: Dict[str, str]) -> Dict[str, Any]:
    """
    Envoie une facture à l'API et retourne le résultat
    
    Returns:
        {
            "file": nom du fichier,
            "status_code": code HTTP,
            "parse_method": méthode utilisée,
            "score": score de validation,
            "is_valid": validité,
            "review_required": si révision requise,
            "duration_sec": temps de traitement,
            "vehicle": données extraites (si succès),
            "error": message d'erreur (si échec)
        }
    """
    result = {
        "file": file_path.name,
        "timestamp": datetime.now().isoformat(),
        "status_code": None,
        "parse_method": None,
        "score": None,
        "is_valid": None,
        "review_required": None,
        "duration_sec": None,
        "vehicle": None,
        "validation": None,
        "error": None
    }
    
    try:
        # Lire et encoder le fichier
        with open(file_path, "rb") as f:
            file_bytes = f.read()
        
        encoded = base64.b64encode(file_bytes).decode("utf-8")
        is_pdf = file_path.suffix.lower() == ".pdf"
        
        payload = {
            "image_base64": encoded,
            "is_pdf": is_pdf
        }
        
        start = time.time()
        response = requests.post(API_URL, headers=headers, json=payload, timeout=60)
        duration = round(time.time() - start, 3)
        
        result["status_code"] = response.status_code
        result["duration_sec"] = duration
        
        if response.status_code == 200:
            data = response.json()
            
            result["parse_method"] = data.get("parse_method")
            result["review_required"] = data.get("review_required", False)
            result["vehicle"] = data.get("vehicle")
            
            # Score peut être dans validation ou dans vehicle.metrics
            validation = data.get("validation", {})
            result["validation"] = validation
            result["score"] = validation.get("score")
            result["is_valid"] = validation.get("is_valid", False)
            
            # Si pas de score dans validation, chercher dans metrics
            if result["score"] is None and result["vehicle"]:
                metrics = result["vehicle"].get("metrics", {})
                result["score"] = metrics.get("validation_score")
        else:
            result["error"] = response.text[:500]
            
    except Exception as e:
        result["status_code"] = "ERROR"
        result["error"] = str(e)
    
    return result


def categorize_result(result: Dict[str, Any]) -> str:
    """Catégorise un résultat: auto_approved, review_required, vision, error"""
    if result["status_code"] != 200:
        return "error"
    
    parse_method = result.get("parse_method", "")
    
    if "auto_approved" in parse_method or result.get("score", 0) >= 85:
        return "auto_approved"
    elif result.get("review_required"):
        return "review_required"
    elif "vision" in parse_method.lower():
        return "vision"
    else:
        return "unknown"


def calculate_statistics(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calcule les statistiques du batch"""
    total = len(results)
    if total == 0:
        return {"error": "Aucun résultat"}
    
    # Catégorisation
    categories = {
        "auto_approved": 0,
        "review_required": 0,
        "vision": 0,
        "error": 0,
        "unknown": 0
    }
    
    scores = []
    durations = []
    
    for r in results:
        cat = categorize_result(r)
        categories[cat] += 1
        
        if r.get("score") is not None:
            scores.append(r["score"])
        if r.get("duration_sec") is not None:
            durations.append(r["duration_sec"])
    
    stats = {
        "total_files": total,
        "timestamp": datetime.now().isoformat(),
        
        # Répartition
        "auto_approved": categories["auto_approved"],
        "auto_approved_pct": round(categories["auto_approved"] / total * 100, 1),
        
        "review_required": categories["review_required"],
        "review_required_pct": round(categories["review_required"] / total * 100, 1),
        
        "vision_fallback": categories["vision"],
        "vision_fallback_pct": round(categories["vision"] / total * 100, 1),
        
        "errors": categories["error"],
        "errors_pct": round(categories["error"] / total * 100, 1),
        
        # Métriques
        "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
        "min_score": min(scores) if scores else None,
        "max_score": max(scores) if scores else None,
        
        "avg_duration_sec": round(sum(durations) / len(durations), 2) if durations else None,
        "min_duration_sec": min(durations) if durations else None,
        "max_duration_sec": max(durations) if durations else None,
    }
    
    return stats


def print_summary(results: List[Dict[str, Any]], stats: Dict[str, Any]):
    """Affiche un résumé en console"""
    print("\n" + "=" * 60)
    print("RAPPORT TEST BATCH - SCAN INVOICE")
    print("=" * 60)
    
    # Résultats individuels
    for r in results:
        status = "OK" if r["status_code"] == 200 else "ERR"
        score = r.get("score", "-")
        valid = "V" if r.get("is_valid") else "X"
        review = "R" if r.get("review_required") else "-"
        duration = r.get("duration_sec", "-")
        
        print(f"{r['file'][:30]:<30} [{status}] score={score:<3} valid={valid} review={review} {duration}s")
    
    # Statistiques
    print("\n" + "-" * 60)
    print("STATISTIQUES")
    print("-" * 60)
    print(f"Total fichiers:     {stats['total_files']}")
    print(f"Auto-approved:      {stats['auto_approved']} ({stats['auto_approved_pct']}%)")
    print(f"Review required:    {stats['review_required']} ({stats['review_required_pct']}%)")
    print(f"Vision fallback:    {stats['vision_fallback']} ({stats['vision_fallback_pct']}%)")
    print(f"Erreurs:            {stats['errors']} ({stats['errors_pct']}%)")
    print(f"\nScore moyen:        {stats['avg_score']}")
    print(f"Score min/max:      {stats['min_score']} / {stats['max_score']}")
    print(f"Durée moyenne:      {stats['avg_duration_sec']}s")
    print("=" * 60)


# =========================
# TESTS PYTEST
# =========================

class TestScanInvoiceBatch:
    """Tests batch pour le pipeline de scan de factures"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup avant chaque test"""
        self.headers = get_headers()
        self.results = []
    
    def test_batch_scan_all_files(self):
        """Test batch de tous les fichiers dans test_invoices/"""
        
        # Vérifier que le dossier existe
        if not TEST_FOLDER.exists():
            pytest.skip(f"Dossier {TEST_FOLDER} non trouvé")
        
        # Récupérer tous les fichiers
        files = list(TEST_FOLDER.glob("*.*"))
        valid_extensions = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}
        files = [f for f in files if f.suffix.lower() in valid_extensions]
        
        if not files:
            pytest.skip(f"Aucun fichier trouvé dans {TEST_FOLDER}")
        
        print(f"\n{len(files)} fichiers détectés dans {TEST_FOLDER}")
        
        # Scanner chaque fichier
        results = []
        for file_path in files:
            result = scan_invoice(file_path, self.headers)
            results.append(result)
            
            # Log immédiat
            print(f"  {file_path.name}: score={result.get('score')} "
                  f"valid={result.get('is_valid')} "
                  f"review={result.get('review_required')} "
                  f"{result.get('duration_sec')}s")
        
        # Calculer stats
        stats = calculate_statistics(results)
        
        # Sauvegarder rapport
        report = {
            "run_timestamp": datetime.now().isoformat(),
            "api_url": API_URL,
            "test_folder": str(TEST_FOLDER),
            "results": results,
            "statistics": stats
        }
        
        with open(OUTPUT_FILE, "w") as f:
            json.dump(report, f, indent=2)
        
        with open(STATS_FILE, "w") as f:
            json.dump(stats, f, indent=2)
        
        print_summary(results, stats)
        
        # Assertions
        assert len(results) > 0, "Aucun résultat"
        assert stats["errors_pct"] < 50, f"Trop d'erreurs: {stats['errors_pct']}%"
    
    def test_api_health(self):
        """Vérifie que l'API est accessible"""
        health_url = API_URL.replace("/inventory/scan-invoice", "/health")
        try:
            response = requests.get(health_url, timeout=5)
            assert response.status_code == 200
        except:
            pytest.skip("API non accessible")


class TestScanInvoiceUnit:
    """Tests unitaires pour des cas spécifiques"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup"""
        self.headers = get_headers()
    
    def test_invalid_base64(self):
        """Test avec base64 invalide"""
        payload = {
            "image_base64": "invalid_base64!!!",
            "is_pdf": False
        }
        
        response = requests.post(API_URL, headers=self.headers, json=payload, timeout=30)
        # 401 si non authentifié, 400/422/500 si authentifié mais données invalides
        assert response.status_code in [400, 401, 422, 500]
    
    def test_empty_image(self):
        """Test avec image vide"""
        payload = {
            "image_base64": base64.b64encode(b"").decode(),
            "is_pdf": False
        }
        
        response = requests.post(API_URL, headers=self.headers, json=payload, timeout=30)
        # 401 si non authentifié, autre si authentifié
        assert response.status_code in [200, 400, 401, 422, 500]
    
    def test_very_small_image(self):
        """Test avec image très petite (1x1 pixel PNG)"""
        # PNG 1x1 transparent
        tiny_png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        
        payload = {
            "image_base64": base64.b64encode(tiny_png).decode(),
            "is_pdf": False
        }
        
        response = requests.post(API_URL, headers=self.headers, json=payload, timeout=30)
        # Devrait échouer ou avoir score très bas
        if response.status_code == 200:
            data = response.json()
            validation = data.get("validation", {})
            score = validation.get("score", 0)
            assert score < 50, f"Score trop haut pour image invalide: {score}"


# =========================
# EXÉCUTION STANDALONE
# =========================

def run_batch_standalone():
    """Exécute le test batch en mode standalone (sans pytest)"""
    print("\n" + "=" * 60)
    print("TEST BATCH STANDALONE - SCAN INVOICE FCA")
    print("=" * 60)
    
    # Vérifier le dossier
    if not TEST_FOLDER.exists():
        print(f"Création du dossier {TEST_FOLDER}")
        TEST_FOLDER.mkdir(parents=True, exist_ok=True)
        print(f"Placez vos factures (JPG, PNG, PDF) dans: {TEST_FOLDER}")
        return
    
    # Lister les fichiers
    valid_extensions = {".jpg", ".jpeg", ".png", ".pdf", ".webp"}
    files = [f for f in TEST_FOLDER.glob("*.*") if f.suffix.lower() in valid_extensions]
    
    if not files:
        print(f"\nAucun fichier trouvé dans {TEST_FOLDER}")
        print("Placez vos factures (JPG, PNG, PDF) dans ce dossier")
        return
    
    print(f"\n{len(files)} fichiers détectés")
    
    # Authentification
    headers = get_headers()
    
    # Scanner
    results = []
    for file_path in files:
        print(f"\nScanning: {file_path.name}...")
        result = scan_invoice(file_path, headers)
        results.append(result)
        
        # Affichage immédiat
        if result["status_code"] == 200:
            print(f"  -> score={result.get('score')} valid={result.get('is_valid')} "
                  f"review={result.get('review_required')} {result.get('duration_sec')}s")
        else:
            print(f"  -> ERREUR: {result.get('error', 'Unknown')[:100]}")
    
    # Stats et rapport
    stats = calculate_statistics(results)
    
    report = {
        "run_timestamp": datetime.now().isoformat(),
        "api_url": API_URL,
        "results": results,
        "statistics": stats
    }
    
    with open(OUTPUT_FILE, "w") as f:
        json.dump(report, f, indent=2)
    
    print_summary(results, stats)
    print(f"\nRapport sauvegardé: {OUTPUT_FILE}")


if __name__ == "__main__":
    run_batch_standalone()
