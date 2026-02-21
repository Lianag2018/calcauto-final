"""
STRESS TEST PARALLÈLE - Pipeline Scan Invoice FCA
Test de charge avec requêtes simultanées

Usage:
    python tests/test_stress_parallel.py --requests 50 --concurrent 10
    python tests/test_stress_parallel.py  # Défaut: 20 requêtes, 5 concurrent

Requires: pip install aiohttp
"""

import asyncio
import aiohttp
import argparse
import base64
import json
import time
import sys
from pathlib import Path
from datetime import datetime

# Configuration
DEFAULT_API_URL = "http://localhost:8001/api"
DEFAULT_REQUESTS = 20
DEFAULT_CONCURRENT = 5

# Credentials
EMAIL = "danielgiroux007@gmail.com"
PASSWORD = "Liana2018$"


async def get_token(session: aiohttp.ClientSession, api_url: str) -> str:
    """Authentification et récupération du token"""
    async with session.post(
        f"{api_url}/auth/login",
        json={"email": EMAIL, "password": PASSWORD}
    ) as response:
        data = await response.json()
        return data.get("token", "")


async def send_scan_request(
    session: aiohttp.ClientSession,
    api_url: str,
    token: str,
    payload: dict,
    request_id: int
) -> dict:
    """Envoie une requête de scan et retourne les métriques"""
    start_time = time.time()
    
    try:
        headers = {"Authorization": f"Bearer {token}"}
        async with session.post(
            f"{api_url}/inventory/scan-invoice",
            json=payload,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=60)
        ) as response:
            duration = time.time() - start_time
            data = await response.json()
            
            return {
                "request_id": request_id,
                "status_code": response.status,
                "duration_sec": round(duration, 3),
                "success": data.get("success", False),
                "score": data.get("validation", {}).get("score"),
                "parse_method": data.get("parse_method"),
                "error": None
            }
            
    except asyncio.TimeoutError:
        return {
            "request_id": request_id,
            "status_code": 0,
            "duration_sec": round(time.time() - start_time, 3),
            "success": False,
            "error": "Timeout"
        }
    except Exception as e:
        return {
            "request_id": request_id,
            "status_code": 0,
            "duration_sec": round(time.time() - start_time, 3),
            "success": False,
            "error": str(e)
        }


async def run_stress_test(
    api_url: str,
    total_requests: int,
    concurrent: int,
    test_file: Path = None
):
    """
    Exécute le stress test avec N requêtes et M concurrent
    """
    print(f"\n{'='*60}")
    print(f"🔥 STRESS TEST PARALLÈLE - Scan Invoice FCA")
    print(f"{'='*60}")
    print(f"API: {api_url}")
    print(f"Requêtes: {total_requests}")
    print(f"Concurrent: {concurrent}")
    print(f"{'='*60}\n")
    
    # Préparer le payload
    if test_file and test_file.exists():
        with open(test_file, "rb") as f:
            file_bytes = f.read()
        encoded = base64.b64encode(file_bytes).decode("utf-8")
        is_pdf = test_file.suffix.lower() == ".pdf"
        print(f"📄 Fichier test: {test_file.name} ({len(file_bytes)} bytes)")
    else:
        # Image test minimale (1x1 PNG)
        encoded = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        is_pdf = False
        print("📄 Utilisation d'une image test minimale")
    
    payload = {
        "image_base64": encoded,
        "is_pdf": is_pdf
    }
    
    # Session HTTP
    connector = aiohttp.TCPConnector(limit=concurrent)
    async with aiohttp.ClientSession(connector=connector) as session:
        
        # Authentification
        print("\n🔐 Authentification...")
        token = await get_token(session, api_url)
        if not token:
            print("❌ Échec authentification")
            return
        print("✅ Token obtenu")
        
        # Lancement des requêtes
        print(f"\n🚀 Lancement de {total_requests} requêtes...")
        start_time = time.time()
        
        # Créer les tâches par lots
        results = []
        semaphore = asyncio.Semaphore(concurrent)
        
        async def bounded_request(req_id):
            async with semaphore:
                return await send_scan_request(session, api_url, token, payload, req_id)
        
        tasks = [bounded_request(i) for i in range(total_requests)]
        
        # Exécuter avec progress
        for i, coro in enumerate(asyncio.as_completed(tasks)):
            result = await coro
            results.append(result)
            
            # Progress
            status = "✅" if result["success"] else "❌"
            print(f"  [{i+1}/{total_requests}] {status} ID={result['request_id']} "
                  f"t={result['duration_sec']}s score={result.get('score', '-')}")
        
        total_duration = time.time() - start_time
    
    # Statistiques
    print(f"\n{'='*60}")
    print("📊 RÉSULTATS")
    print(f"{'='*60}")
    
    successful = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]
    durations = [r["duration_sec"] for r in results]
    scores = [r["score"] for r in results if r.get("score") is not None]
    
    print(f"\n⏱  Durée totale:     {total_duration:.2f}s")
    print(f"📊 Requêtes/sec:     {total_requests/total_duration:.2f}")
    print(f"\n✅ Succès:           {len(successful)}/{total_requests} ({len(successful)/total_requests*100:.1f}%)")
    print(f"❌ Échecs:           {len(failed)}/{total_requests}")
    
    if durations:
        print(f"\n⏱  Temps moyen:      {sum(durations)/len(durations):.3f}s")
        print(f"⏱  Temps min:        {min(durations):.3f}s")
        print(f"⏱  Temps max:        {max(durations):.3f}s")
    
    if scores:
        print(f"\n📈 Score moyen:      {sum(scores)/len(scores):.1f}")
        print(f"📈 Score min:        {min(scores)}")
        print(f"📈 Score max:        {max(scores)}")
    
    # Parse methods
    methods = {}
    for r in successful:
        m = r.get("parse_method", "unknown")
        methods[m] = methods.get(m, 0) + 1
    
    if methods:
        print(f"\n📋 Méthodes de parsing:")
        for m, count in methods.items():
            print(f"   {m}: {count}")
    
    # Erreurs
    if failed:
        print(f"\n⚠️  Erreurs:")
        for r in failed[:5]:  # Max 5 erreurs
            print(f"   ID={r['request_id']}: {r.get('error', 'Unknown')}")
    
    print(f"\n{'='*60}")
    
    # Évaluation
    success_rate = len(successful) / total_requests * 100
    avg_time = sum(durations) / len(durations) if durations else 0
    
    print("\n🎯 ÉVALUATION:")
    if success_rate >= 95 and avg_time < 3:
        print("   ✅ EXCELLENT - Production ready")
    elif success_rate >= 90 and avg_time < 5:
        print("   🟡 BON - Acceptable pour production")
    elif success_rate >= 80:
        print("   🟠 MOYEN - Optimisation recommandée")
    else:
        print("   🔴 PROBLÈME - Debug requis")
    
    print(f"\n{'='*60}\n")
    
    # Sauvegarder rapport
    report = {
        "timestamp": datetime.now().isoformat(),
        "config": {
            "api_url": api_url,
            "total_requests": total_requests,
            "concurrent": concurrent
        },
        "summary": {
            "total_duration_sec": round(total_duration, 2),
            "requests_per_sec": round(total_requests/total_duration, 2),
            "success_rate": round(success_rate, 2),
            "avg_duration_sec": round(avg_time, 3),
            "avg_score": round(sum(scores)/len(scores), 1) if scores else 0
        },
        "results": results
    }
    
    report_file = Path(__file__).parent / "stress_test_report.json"
    with open(report_file, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"📄 Rapport sauvegardé: {report_file}")


def main():
    parser = argparse.ArgumentParser(description="Stress Test Parallèle - Scan Invoice")
    parser.add_argument("--api", default=DEFAULT_API_URL, help="URL de l'API")
    parser.add_argument("--requests", "-n", type=int, default=DEFAULT_REQUESTS, help="Nombre total de requêtes")
    parser.add_argument("--concurrent", "-c", type=int, default=DEFAULT_CONCURRENT, help="Requêtes simultanées")
    parser.add_argument("--file", "-f", type=str, help="Fichier image/PDF à utiliser pour le test")
    
    args = parser.parse_args()
    
    test_file = Path(args.file) if args.file else None
    
    asyncio.run(run_stress_test(
        api_url=args.api,
        total_requests=args.requests,
        concurrent=args.concurrent,
        test_file=test_file
    ))


if __name__ == "__main__":
    main()
