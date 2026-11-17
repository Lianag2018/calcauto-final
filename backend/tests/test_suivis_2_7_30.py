"""Suivis d'une soumission : 2 jours, 7 jours, 30 jours après l'envoi."""
from datetime import datetime, timedelta

from services.followup import first_reminder, next_reminder

SENT = datetime(2026, 11, 16, 15, 0)


def test_reminders_fall_two_seven_then_thirty_days_after_the_quote():
    assert first_reminder(SENT) == SENT + timedelta(days=2)
    assert next_reminder(SENT, 0, SENT + timedelta(days=2)) == (SENT + timedelta(days=7), 1)
    assert next_reminder(SENT, 1, SENT + timedelta(days=7)) == (SENT + timedelta(days=30), 2)
    assert next_reminder(SENT, 2, SENT + timedelta(days=30)) is None  # dernier suivi fait


def test_a_late_follow_up_never_plans_the_next_one_in_the_past():
    late = SENT + timedelta(days=12)
    assert next_reminder(SENT, 0, late) == (late + timedelta(days=1), 1)


def test_older_quotes_without_a_sequence_are_left_alone():
    assert next_reminder(SENT, None, SENT) is None
    assert next_reminder(SENT, "x", SENT) is None


def test_a_double_click_on_done_counts_once():
    from services.followup import is_repeat_done
    done = SENT + timedelta(days=2)
    assert is_repeat_done(done, done + timedelta(seconds=1)) is True  # deuxième clic
    assert is_repeat_done(done, done + timedelta(minutes=5)) is False  # vrai suivi suivant
    assert is_repeat_done(None, done) is False  # jamais fait
    assert is_repeat_done("2026-11-18", done) is False  # valeur illisible : on ne bloque pas


def test_linking_an_existing_account_copies_every_profile_field_including_the_phone():
    from services.etv_link import ETV_PROFILE_KEYS, etv_profile_fields
    identity = {"dealer_slug": "essai", "username": "alex", "role": "conseiller", "name": "Alex Essai",
                "email": "", "dealer_name": "Concession Essai", "phone": "418 555-0100"}
    fields = etv_profile_fields(identity)
    assert set(fields) == set(ETV_PROFILE_KEYS)
    assert fields["etv_phone"] == "418 555-0100"
