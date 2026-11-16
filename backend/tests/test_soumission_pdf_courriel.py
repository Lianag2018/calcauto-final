"""La feuille PDF jointe au courriel et le lien de la fiche : seulement ce qui est sûr."""
import base64
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.submission_sheet import listing_link_html, submission_pdf, MAX_SUBMISSION_PDF  # noqa: E402


def test_only_a_real_reasonably_sized_pdf_is_attached():
    pdf = b"%PDF-1.4\n" + b"x" * 200
    assert submission_pdf(base64.b64encode(pdf).decode()) == pdf
    assert submission_pdf("") is None
    assert submission_pdf("pas du base64 !") is None
    assert submission_pdf(base64.b64encode(b"<html>faux</html>").decode()) is None
    assert submission_pdf(base64.b64encode(b"%PDF-" + b"x" * (MAX_SUBMISSION_PDF + 1)).decode()) is None


def test_listing_button_only_for_a_safe_link():
    assert listing_link_html("") == ""
    assert listing_link_html("javascript:alert(1)") == ""
    assert listing_link_html("http://exemple.test/fiche") == ""
    button = listing_link_html("https://www.exemple.test/fiche?a=1&b='2'")
    assert "Voir les photos" in button and "&amp;b=" in button and "'2'" not in button
