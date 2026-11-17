"""Vue du directeur : les soumissions de sa concession, par conseiller, et les
véhicules les plus convoités. Aucune concession n'est nommée ici."""
import re
from datetime import datetime
from typing import Any, Dict, Iterable, List

TEAM_ROLES = ("admin", "directeur")
MAX_ROWS = 300


def can_see_team(user: Dict[str, Any]) -> bool:
    """Seuls le directeur et l'administrateur d'une concession voient l'équipe."""
    dealer = str(user.get("dealer_slug") or "").strip()
    return bool(dealer) and str(user.get("etv_role") or "").strip().lower() in TEAM_ROLES


def plain_vehicle(*parts: Any) -> str:
    """Nom lisible : sans les précisions de programme entre parenthèses
    (« Cherokee (excluding Base (KMJL74)) » devient « Cherokee »)."""
    text = " ".join(str(p) for p in parts if p not in (None, ""))
    previous = None
    while previous != text:
        previous = text
        text = re.sub(r"\([^()]*\)", " ", text)
    return re.sub(r"\s+", " ", text.replace("(", " ").replace(")", " ")).strip()


def _iso(value: Any) -> str:
    return value.isoformat() if isinstance(value, datetime) else str(value or "")


def _vehicle(sub: Dict[str, Any]) -> Dict[str, str]:
    state = sub.get("calculator_state") or {}
    unit = state.get("selectedInventory") or {}
    if unit.get("brand") and unit.get("model"):
        label = plain_vehicle(unit.get("brand"), unit.get("model"), unit.get("trim"), unit.get("year"))
    else:
        label = plain_vehicle(sub.get("vehicle_brand"), sub.get("vehicle_model"), sub.get("vehicle_year"))
    return {"label": label or "Véhicule", "stock": str(unit.get("stock_no") or "")}


def _client_key(sub: Dict[str, Any]) -> str:
    phone = re.sub(r"\D", "", str(sub.get("client_phone") or ""))
    return phone or str(sub.get("client_email") or "").strip().lower() or str(sub.get("client_name") or "").strip().lower()


def team_report(submissions: Iterable[Dict[str, Any]], advisors: Dict[str, str], now: datetime) -> Dict[str, Any]:
    """`submissions` : de la plus récente à la plus ancienne. `advisors` : id du compte -> nom."""
    rows: List[Dict[str, Any]] = []
    by_vehicle: Dict[str, Dict[str, Any]] = {}
    by_advisor: Dict[str, Dict[str, Any]] = {}
    for sub in submissions:
        owner = str(sub.get("owner_id") or "")
        advisor = advisors.get(owner) or "Conseiller"
        vehicle = _vehicle(sub)
        client = _client_key(sub)
        reminder = sub.get("reminder_date")
        late = (not sub.get("reminder_done")) and isinstance(reminder, datetime) and reminder <= now
        date = _iso(sub.get("submission_date"))

        key = vehicle["stock"] or vehicle["label"].lower()
        wanted = by_vehicle.setdefault(key, {"vehicle": vehicle["label"], "stock": vehicle["stock"],
                                             "submissions": 0, "last": date, "_clients": set()})
        wanted["submissions"] += 1
        wanted["_clients"].add(client)

        team = by_advisor.setdefault(owner, {"advisor": advisor, "submissions": 0, "late": 0,
                                             "last": date, "_clients": set()})
        team["submissions"] += 1
        team["late"] += 1 if late else 0
        team["_clients"].add(client)

        if len(rows) < MAX_ROWS:
            rows.append({
                "id": str(sub.get("id") or ""), "date": date, "advisor": advisor,
                "client_name": str(sub.get("client_name") or ""),
                "client_phone": str(sub.get("client_phone") or ""),
                "client_email": str(sub.get("client_email") or ""),
                "vehicle": vehicle["label"], "stock": vehicle["stock"],
                "price": sub.get("vehicle_price") or 0,
                "sent_by": str((sub.get("calculator_state") or {}).get("sentBy") or "courriel"),
                "reminder_date": _iso(reminder), "late": late,
                "status": str(sub.get("status") or ""),
            })

    def closed(group: Dict[str, Any]) -> Dict[str, Any]:
        out = {k: v for k, v in group.items() if not k.startswith("_")}
        out["clients"] = len(group["_clients"] - {""})
        return out

    vehicles = sorted((closed(v) for v in by_vehicle.values()), key=lambda v: (-v["clients"], -v["submissions"], v["vehicle"]))
    team_rows = sorted((closed(a) for a in by_advisor.values()), key=lambda a: (-a["submissions"], a["advisor"]))
    return {"total": sum(a["submissions"] for a in team_rows), "advisors": team_rows,
            "vehicles": vehicles, "submissions": rows}
