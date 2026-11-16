"""Suivis d'une soumission : rappel 2 jours, 7 jours puis 30 jours après l'envoi."""
from datetime import datetime, timedelta
from typing import Optional, Tuple

FOLLOWUP_DAYS = (2, 7, 30)


def first_reminder(now: datetime) -> datetime:
    return now + timedelta(days=FOLLOWUP_DAYS[0])


def next_reminder(sent_at: Optional[datetime], step, now: datetime) -> Optional[Tuple[datetime, int]]:
    """Rappel suivant une fois celui de l'étape `step` fait : (date, étape), ou None après le dernier.

    Les dates se comptent depuis l'envoi. Un rappel fait en retard ne planifie jamais le
    suivant dans le passé : il tombe au plus tôt le lendemain.
    """
    try:
        following = int(step) + 1
    except (TypeError, ValueError):
        return None  # ancienne soumission, sans suite de suivis
    if following < 1 or following >= len(FOLLOWUP_DAYS):
        return None
    planned = (sent_at or now) + timedelta(days=FOLLOWUP_DAYS[following])
    return max(planned, now + timedelta(days=1)), following
