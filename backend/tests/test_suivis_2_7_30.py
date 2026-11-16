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
