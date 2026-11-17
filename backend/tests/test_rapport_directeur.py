"""Vue du directeur : soumissions de l'équipe et véhicules convoités (valeurs inventées)."""
from datetime import datetime, timedelta

from services.team_report import can_see_team, plain_vehicle, team_report

NOW = datetime(2026, 11, 17, 15, 0)


def _sub(owner, name, phone, model="Cherokee (excluding Base (KMJL74))", stock="", days_ago=0, done=False, reminder_in=2):
    state = {"sentBy": "sms"}
    if stock:
        state["selectedInventory"] = {"stock_no": stock, "brand": "Jeep", "model": "Cherokee", "trim": "Limited 4x4", "year": 2026}
    sent = NOW - timedelta(days=days_ago)
    return {"id": f"{owner}-{name}-{days_ago}", "owner_id": owner, "client_name": name, "client_phone": phone,
            "client_email": "", "vehicle_brand": "Jeep", "vehicle_model": model, "vehicle_year": 2026,
            "vehicle_price": 50000, "submission_date": sent, "reminder_date": sent + timedelta(days=reminder_in),
            "reminder_done": done, "status": "pending", "calculator_state": state}


def test_only_a_director_or_admin_of_a_dealership_sees_the_team():
    assert can_see_team({"dealer_slug": "essai", "etv_role": "directeur"})
    assert can_see_team({"dealer_slug": "essai", "etv_role": "Admin"})
    assert not can_see_team({"dealer_slug": "essai", "etv_role": "conseiller"})
    assert not can_see_team({"dealer_slug": "", "etv_role": "directeur"})  # compte sans concession
    assert not can_see_team({"is_admin": True})


def test_program_details_in_parentheses_are_removed_from_the_vehicle_name():
    assert plain_vehicle("Jeep", "Cherokee (excluding Base (KMJL74))", 2026) == "Jeep Cherokee 2026"
    assert plain_vehicle("Ram", "1500 Big Horn", None, 2026) == "Ram 1500 Big Horn 2026"
    assert plain_vehicle("Jeep", "Compass (", 2026) == "Jeep Compass 2026"


def test_report_counts_per_advisor_and_ranks_the_most_wanted_vehicles():
    subs = [
        _sub("a", "Client Un", "418 555-0101", stock="S100"),
        _sub("b", "Client Deux", "418 555-0102", stock="S100", days_ago=1),
        _sub("a", "Client Un", "(418) 555-0101", stock="S100", days_ago=3),  # même client, relancé
        _sub("a", "Client Trois", "418 555-0103", model="Compass North", days_ago=5),
    ]
    report = team_report(subs, {"a": "Alex Essai", "b": "Billie Essai"}, NOW)
    assert report["total"] == 4
    assert [(a["advisor"], a["submissions"], a["clients"], a["late"]) for a in report["advisors"]] == [
        ("Alex Essai", 3, 2, 2), ("Billie Essai", 1, 1, 0)]
    first = report["vehicles"][0]
    assert (first["vehicle"], first["stock"], first["submissions"], first["clients"]) == ("Jeep Cherokee Limited 4x4 2026", "S100", 3, 2)
    assert report["vehicles"][1]["vehicle"] == "Jeep Compass North 2026"
    row = report["submissions"][0]
    assert row["advisor"] == "Alex Essai" and row["sent_by"] == "sms" and row["late"] is False
    assert row["date"] == NOW.isoformat()


def test_a_follow_up_already_done_is_not_late_and_unknown_owner_gets_a_neutral_name():
    report = team_report([_sub("z", "Client", "418 555-0199", days_ago=10, done=True)], {}, NOW)
    assert report["advisors"] == [{"advisor": "Conseiller", "submissions": 1, "late": 0,
                                   "last": (NOW - timedelta(days=10)).isoformat(), "clients": 1}]
