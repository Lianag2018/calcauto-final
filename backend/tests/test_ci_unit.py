"""
Tests unitaires autonomes pour CI/CD (GitHub Actions)
Pas besoin de serveur, MongoDB ou PDF réels.
Teste les fonctions pures du parser et la logique de calcul.
"""
import pytest
import math
import sys
import os

# Ajouter le path backend pour imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


# ═══════════════════════════════════════════════════
# Tests du parser: fonctions pures (regex, détection)
# ═══════════════════════════════════════════════════

class TestDetectBrand:
    """Test la détection de marques Stellantis"""

    def test_detect_ram(self):
        from services.pdfplumber_parser import detect_brand_from_model
        assert detect_brand_from_model("Ram 1500 Big Horn") == "Ram"

    def test_detect_jeep(self):
        from services.pdfplumber_parser import detect_brand_from_model
        assert detect_brand_from_model("Wrangler Sport") == "Jeep"

    def test_detect_dodge(self):
        from services.pdfplumber_parser import detect_brand_from_model
        assert detect_brand_from_model("Charger SXT") == "Dodge"

    def test_detect_chrysler(self):
        from services.pdfplumber_parser import detect_brand_from_model
        assert detect_brand_from_model("Pacifica Touring") == "Chrysler"

    def test_detect_jeep_cherokee(self):
        from services.pdfplumber_parser import detect_brand_from_model
        assert detect_brand_from_model("Grand Cherokee L") == "Jeep"


class TestParseDollar:
    """Test le parsing de valeurs monétaires"""

    def test_parse_dollar_simple(self):
        from services.pdfplumber_parser import parse_dollar
        assert parse_dollar("$6,000") == 6000

    def test_parse_dollar_no_symbol(self):
        from services.pdfplumber_parser import parse_dollar
        assert parse_dollar("6000") == 6000

    def test_parse_dollar_with_comma(self):
        from services.pdfplumber_parser import parse_dollar
        assert parse_dollar("$11,500") == 11500

    def test_parse_dollar_zero(self):
        from services.pdfplumber_parser import parse_dollar
        assert parse_dollar("0") == 0

    def test_parse_dollar_none(self):
        from services.pdfplumber_parser import parse_dollar
        assert parse_dollar(None) == 0


class TestParseRate:
    """Test le parsing de taux"""

    def test_parse_rate_percent(self):
        from services.pdfplumber_parser import parse_rate
        assert parse_rate("4.99%") == 4.99

    def test_parse_rate_zero(self):
        from services.pdfplumber_parser import parse_rate
        assert parse_rate("0%") == 0.0

    def test_parse_rate_no_percent(self):
        from services.pdfplumber_parser import parse_rate
        result = parse_rate("4.99")
        assert result == 4.99 or result is None  # Dépend de l'implémentation


class TestDetectLoyalty:
    """Test la détection du taux de fidélité depuis le texte"""

    def test_loyalty_half_percent(self):
        from services.pdfplumber_parser import _detect_loyalty
        text = "including a 0.5% Loyalty Rate Reduction for eligible customers"
        assert _detect_loyalty(text) == 0.5

    def test_loyalty_one_percent(self):
        from services.pdfplumber_parser import _detect_loyalty
        text = "including a 1% Loyalty Rate Reduction"
        assert _detect_loyalty(text) == 1.0

    def test_no_loyalty(self):
        from services.pdfplumber_parser import _detect_loyalty
        text = "No Finance Payments for 90 Days"
        assert _detect_loyalty(text) == 0.0

    def test_empty_text(self):
        from services.pdfplumber_parser import _detect_loyalty
        assert _detect_loyalty("") == 0.0
        assert _detect_loyalty(None) == 0.0


class TestParseIncentiveText:
    """Test l'extraction d'incentives depuis le texte"""

    def test_rate_and_term(self):
        from services.pdfplumber_parser import _parse_incentive_text
        text = "Get 0% Financing for 72 Months on select models"
        result = _parse_incentive_text(text)
        assert result['rate'] == 0.0
        assert result['term'] == 72

    def test_consumer_cash(self):
        from services.pdfplumber_parser import _parse_incentive_text
        text = "Up to $6,000 Consumer Cash on 2026 Ram 1500"
        result = _parse_incentive_text(text)
        assert result['consumer_cash'] == 6000

    def test_alternative(self):
        from services.pdfplumber_parser import _parse_incentive_text
        text = "0% Financing for 72 Months Or Up to $6,000 Consumer Cash"
        result = _parse_incentive_text(text)
        assert result['has_alternative'] == True


# ═══════════════════════════════════════════════════
# Tests de calcul: logique financement
# ═══════════════════════════════════════════════════

class TestMonthlyPaymentCalculation:
    """Test la formule PMT de calcul de versement mensuel"""

    def pmt(self, principal, annual_rate, months):
        if principal <= 0 or months <= 0:
            return 0
        if annual_rate == 0:
            return principal / months
        r = annual_rate / 100 / 12
        return principal * (r * (1 + r) ** months) / ((1 + r) ** months - 1)

    def test_zero_rate(self):
        """0% sur 72 mois = principal / 72"""
        result = self.pmt(50000, 0, 72)
        assert abs(result - 694.44) < 1  # 50000/72

    def test_standard_rate(self):
        """4.99% sur 84 mois"""
        result = self.pmt(65000, 4.99, 84)
        assert 880 < result < 920  # ~$899/mois

    def test_zero_principal(self):
        assert self.pmt(0, 4.99, 84) == 0


class TestDeferredPaymentCalculation:
    """Test la logique de paiement différé 90 jours"""

    def pmt(self, principal, annual_rate, months):
        if principal <= 0 or months <= 0:
            return 0
        if annual_rate == 0:
            return principal / months
        r = annual_rate / 100 / 12
        return principal * (r * (1 + r) ** months) / ((1 + r) ** months - 1)

    def test_deferred_capitalizes_2_months(self):
        """P_new = P * (1 + r)^2 — 2 mois d'intérêts composés"""
        principal = 65000
        rate = 4.99
        r = rate / 100 / 12

        deferred_principal = principal * (1 + r) ** 2
        interest = deferred_principal - principal

        # ~$542 d'intérêts capitalisés
        assert 500 < interest < 600
        assert deferred_principal > principal

    def test_84_month_eligible(self):
        """Terme 84 mois = éligible au différé"""
        assert 84 <= 84  # canDefer = selectedTerm <= 84

    def test_96_month_ineligible(self):
        """Terme 96 mois = NON éligible au différé"""
        assert not (96 <= 84)

    def test_deferred_increases_payment(self):
        """Le versement avec différé est plus élevé"""
        principal = 65000
        rate = 4.99
        term = 84
        r = rate / 100 / 12

        normal = self.pmt(principal, rate, term)
        deferred_p = principal * (1 + r) ** 2
        deferred = self.pmt(deferred_p, rate, term)

        assert deferred > normal
        diff = deferred - normal
        assert 5 < diff < 20  # ~$7.50 de plus par mois

    def test_zero_rate_no_deferred_effect(self):
        """À 0%, le différé n'a aucun effet"""
        principal = 50000
        r = 0 / 100 / 12

        deferred_p = principal * (1 + r) ** 2  # = principal (car r=0)
        assert deferred_p == principal


class TestCombinedLoyaltyAndDeferred:
    """Test la combinaison fidélité + différé"""

    def pmt(self, principal, annual_rate, months):
        if principal <= 0 or months <= 0:
            return 0
        if annual_rate == 0:
            return principal / months
        r = annual_rate / 100 / 12
        return principal * (r * (1 + r) ** months) / ((1 + r) ** months - 1)

    def test_loyalty_reduces_rate_before_capitalization(self):
        """La fidélité réduit le taux AVANT la capitalisation"""
        principal = 65000
        base_rate = 4.99
        loyalty = 0.5
        term = 84

        adjusted_rate = max(0, base_rate - loyalty)  # 4.49%
        r = adjusted_rate / 100 / 12

        # Capitalisation sur le taux réduit
        deferred_p = principal * (1 + r) ** 2

        combined = self.pmt(deferred_p, adjusted_rate, term)
        deferred_only = self.pmt(
            principal * ((1 + base_rate / 100 / 12) ** 2),
            base_rate,
            term
        )

        # Combiné devrait être moins cher que différé seul
        assert combined < deferred_only

    def test_all_terms_eligibility(self):
        """Vérifie l'éligibilité pour tous les termes"""
        eligible = [36, 48, 60, 72, 84]
        ineligible = [96]

        for t in eligible:
            assert t <= 84, f"{t} devrait être éligible"
        for t in ineligible:
            assert t > 84, f"{t} ne devrait PAS être éligible"


# ═══════════════════════════════════════════════════
# Tests des métadonnées: structure JSON
# ═══════════════════════════════════════════════════

class TestMetadataFileStructure:
    """Test la structure des fichiers program_meta JSON"""

    def test_feb_metadata_structure(self):
        import json
        meta_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'program_meta_feb2026.json')
        if not os.path.exists(meta_path):
            pytest.skip("February metadata file not found")

        with open(meta_path) as f:
            data = json.load(f)

        assert 'event_names' in data
        assert 'loyalty_rate' in data
        assert 'no_payments_days' in data
        assert data['loyalty_rate'] == 0.0
        assert '4X4 Winter Event' in data['event_names']

    def test_mar_metadata_structure(self):
        import json
        meta_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'program_meta_mar2026.json')
        if not os.path.exists(meta_path):
            pytest.skip("March metadata file not found")

        with open(meta_path) as f:
            data = json.load(f)

        assert 'event_names' in data
        assert 'loyalty_rate' in data
        assert 'no_payments_days' in data
        assert 'brands' in data
        assert data['loyalty_rate'] == 0.5
        assert 'Month of Ram' in data['event_names']
        assert 'Ram' in data['brands']
        assert 'Jeep' in data['brands']


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])


# ═══════════════════════════════════════════════════
# Lecture par position des pages Landscape (services/landscape_reader.py)
# Pages fabriquées : aucun PDF de Stellantis n'est nécessaire.
# ═══════════════════════════════════════════════════

class _FakePage:
    """Imite ce que le lecteur demande à une page pdfplumber."""

    def __init__(self, words, rects, width=800, height=600):
        self.words, self.rects, self.width, self.height = words, rects, width, height

    def extract_words(self, **_):
        return [dict(w) for w in self.words]

    def extract_text(self):
        return " ".join(w["text"] for w in self.words)

    def filter(self, _):
        return self

    def within_bbox(self, box):
        x0, top, x1, _ = box
        return _FakePage([w for w in self.words if w["x0"] >= x0 and w["x1"] <= x1 and w["top"] >= top],
                         self.rects, self.width, self.height)


def _word(text, x0, top, centered=False):
    width = len(text) * 4.0
    if centered:
        x0 -= width / 2.0
    return {"text": text, "x0": x0, "x1": x0 + width, "top": top, "bottom": top + 3.5,
            "upright": True, "fontname": "Arial"}


def _landscape_page(year, rows, kind="finance", skip_rates_for=()):
    """rows : (nom ou [lignes du nom], comptant, taux std, comptant alt, taux alt, prime)."""
    terms = [36, 48, 60, 72, 84, 96] if kind == "finance" else [24, 27, 36, 39, 42, 48, 51, 54, 60]
    std_x = [250 + 14 * i for i in range(len(terms))]
    alt_x = [480 + 14 * i for i in range(len(terms))]
    words = [_word(str(year), 300, 20), _word("MODELS", 322, 20), _word("Bonus", 700, 30)]
    for xs in (std_x, alt_x):
        words += [_word(f"{t}M", x, 50, centered=True) for t, x in zip(terms, xs)]
    words += [_word("BEFORE", 180, 60), _word("BEFORE", 410, 60), _word("AFTER", 700, 60)]
    rects = []
    top = 80.0
    for index, (name, cash, std, alt_cash, alt, bonus) in enumerate(rows):
        lines = [name] if isinstance(name, str) else name
        rects.append({"x0": 45, "x1": 170, "top": top - 4, "height": 0.3, "width": 125})
        for offset, line in enumerate(lines):
            x = 50
            for piece in line.split():
                words.append(_word(piece, x, top + 4.5 * offset))
                x += len(piece) * 4.0 + 1
        if cash:
            words.append(_word(cash, 180, top))
        if alt_cash:
            words.append(_word(alt_cash, 410, top))
        if bonus:
            x = 700
            for piece in bonus.split():
                words.append(_word(piece, x, top))
                x += len(piece) * 4.0 + 1
        if index not in skip_rates_for:
            for values, xs in ((std, std_x), (alt, alt_x)):
                values = values or ["-"] * len(terms)
                words += [_word(v, x, top, centered=True) for v, x in zip(values, xs)]
        top += 4.5 * len(lines) + 6
    rects.append({"x0": 45, "x1": 170, "top": top - 4, "height": 0.3, "width": 125})
    return _FakePage(words, rects)


_STD = ["4.99%", "4.99%", "5.49%", "5.99%", "6.49%", "6.99%"]
_ALT = ["0.00%", "0.00%", "0.99%", "1.99%", "2.99%", "3.99%"]


class TestLandscapeReader:
    """Chaque valeur est rangée selon sa position, pour toute année-modèle."""

    def _page(self, **kw):
        from services.landscape_reader import read_landscape_page
        rows = [
            ("Grand Caravan SXT", "$1,000", _STD, None, _ALT, None),
            ("Compass Sport", None, _STD, "$2,500", None, "$1,500 (Loyalty)"),
            (["Wrangler 4-Door (excludes Rubicon", "and 4xe Models)"], "$3,000", None, "$750", _ALT, "$500"),
        ]
        return read_landscape_page(_landscape_page(2027, rows, **kw))

    def test_annee_modele_lue_dans_l_entete(self):
        page = self._page()
        assert page["kind"] == "finance"
        assert page["model_year"] == 2027
        assert [r["model_year"] for r in page["rows"]] == [2027, 2027, 2027]

    def test_taux_ranges_sous_leur_terme(self):
        rows = self._page()["rows"]
        assert rows[0]["standard_rates"] == {"36": 4.99, "48": 4.99, "60": 5.49, "72": 5.99, "84": 6.49, "96": 6.99}
        assert rows[0]["alternative_rates"]["96"] == 3.99

    def test_case_vide_ne_decale_rien(self):
        rows = self._page()["rows"]
        # Pas de comptant standard : le comptant alternatif reste dans sa colonne.
        assert rows[1]["consumer_cash"] == 0
        assert rows[1]["alt_consumer_cash"] == 2500
        assert rows[1]["alternative_rates"] is None
        # Pas de taux standard : les taux alternatifs ne glissent pas à gauche.
        assert rows[2]["standard_rates"] is None
        assert rows[2]["alternative_rates"]["36"] == 0.0

    def test_nom_sur_deux_lignes_reste_dans_sa_case(self):
        page = self._page()
        assert [r["name"] for r in page["rows"]] == [
            "Grand Caravan SXT", "Compass Sport",
            "Wrangler 4-Door (excludes Rubicon and 4xe Models)"]
        assert page["expected_rows"] == 3

    def test_prime_de_fidelite_reconnue(self):
        rows = self._page()["rows"]
        assert rows[1]["bonus_cash"] == 1500 and rows[1]["loyalty_bonus"] is True
        assert rows[2]["bonus_cash"] == 500 and rows[2]["loyalty_bonus"] is False

    def test_page_de_location_reconnue(self):
        from services.landscape_reader import read_landscape_page
        rates = ["8.99%"] * 9
        page = read_landscape_page(_landscape_page(2028, [("Pacifica", "$500", rates, None, None, None)], kind="lease"))
        assert page["kind"] == "lease" and page["model_year"] == 2028
        assert page["rows"][0]["lease_cash"] == 500
        assert page["rows"][0]["standard_rates"]["60"] == 8.99

    def test_controle_refuse_une_ligne_perdue(self):
        from services.landscape_reader import control_report
        page = self._page(skip_rates_for=(1,))
        page["page"] = 20
        assert len(page["rows"]) == 2 and page["expected_rows"] == 3
        report = control_report([page])
        assert report["ok"] is False
        assert any("2 lignes lues pour 3" in e for e in report["errors"])

    def test_page_ordinaire_n_est_pas_une_page_de_taux(self):
        from services.landscape_reader import read_landscape_page
        assert read_landscape_page(_FakePage([_word("General", 50, 50), _word("Rules", 90, 50)], [])) is None


class TestParserUsesLandscapeReader:
    """parse_retail_programs / parse_sci_lease : format inchangé, toute année-modèle."""

    def _patch(self, monkeypatch, errors=()):
        from services import landscape_reader
        row = {"name": "All-New Cherokee Laredo", "model_year": 2027, "consumer_cash": 0,
               "alt_consumer_cash": 2000, "bonus_cash": 1500, "loyalty_bonus": True, "delivery_credit": 1000,
               "standard_rates": {"36": 4.99, "48": 4.99, "60": 5.49, "72": 5.99, "84": 6.49, "96": None},
               "alternative_rates": None, "notes": {"bonus_cash": "(Loyalty)"}}
        lease_row = {"name": "Ram 1500 Big Horn, Sport, Rebel", "model_year": 2027, "lease_cash": 3000,
                     "delivery_credit": 500,
                     "standard_rates": {"24": 8.99}, "alternative_rates": None, "notes": {}}
        result = {"finance": [{"page": 19, "kind": "finance", "model_year": 2027, "rows": [row]}],
                  "lease": [{"page": 25, "kind": "lease", "model_year": 2027, "rows": [lease_row]}],
                  "control": {"ok": not errors, "errors": list(errors)}}
        monkeypatch.setattr(landscape_reader, "read_landscapes", lambda content, pages=None: result)

    def test_programme_d_achat_2027(self, monkeypatch):
        from services.pdfplumber_parser import parse_retail_programs
        self._patch(monkeypatch)
        (program,) = parse_retail_programs(b"pdf", 1, 1)
        assert (program["brand"], program["model"], program["trim"], program["year"]) == ("Jeep", "Cherokee", "Laredo", 2027)
        assert program["option1_rates"] == {"rate_36": 4.99, "rate_48": 4.99, "rate_60": 5.49,
                                            "rate_72": 5.99, "rate_84": 6.49, "rate_96": None}
        assert program["option2_rates"] is None
        assert program["alt_consumer_cash"] == 2000
        # Le crédit de livraison n'est jamais accordé : il ne sort pas du lecteur.
        assert "delivery_credit" not in program
        # La prime de fidélité n'est pas donnée à tous les clients.
        assert program["bonus_cash"] == 0 and program["loyalty_bonus_cash"] == 1500

    def test_location_2027_et_cles_attendues(self, monkeypatch):
        from services.pdfplumber_parser import parse_sci_lease
        self._patch(monkeypatch)
        lease = parse_sci_lease(b"pdf", 1, 1)
        assert lease["vehicles_2026"] == [] and lease["vehicles_2025"] == []
        (vehicle,) = lease["vehicles_2027"]
        assert vehicle["brand"] == "Ram" and vehicle["lease_cash"] == 3000

    def test_controle_en_echec_bloque_l_import(self, monkeypatch):
        from services.pdfplumber_parser import parse_retail_programs, LandscapeControlError
        self._patch(monkeypatch, errors=["page 19 (finance, 2027) : 24 lignes lues pour 25 sur la page"])
        with pytest.raises(LandscapeControlError) as error:
            parse_retail_programs(b"pdf", 1, 1)
        assert "24 lignes lues pour 25" in str(error.value)


# ═══════════════════════════════════════════════════════════════════════════════
# Association véhicule -> ligne de programme (codes de produit, exclusions, CPOS)
# ═══════════════════════════════════════════════════════════════════════════════

def _line(trim, model='1500', brand='Ram', year=2026, cash=0):
    return {'id': f'{brand}|{model}|{trim}|{year}', 'brand': brand, 'model': model,
            'trim': trim, 'year': year, 'consumer_cash': cash}


def _match(programs, **vehicle):
    from services.program_matching import describe_vehicle, match_program
    return match_program(describe_vehicle(**vehicle), programs)


class TestProgramMatching:
    RAM_1500 = [
        _line('Tradesman, Express, Warlock', cash=6500),
        _line('Big Horn (DT6H91)', cash=0),
        _line('Big Horn (excludes DT6H91)', cash=6000),
        _line('Sport, Rebel', cash=8250),
        _line('Laramie, Limited, Longhorn, Tungsten', cash=11500),
    ]
    GRAND_CHEROKEE = [
        _line('Grand Cherokee L Laredo/Laredo X (CPOS 22L/22P)', 'Grand Cherokee', 'Jeep'),
        _line('Grand Cherokee L Altitude (CPOS 2B5)', 'Grand Cherokee', 'Jeep'),
        _line('Grand Cherokee L Limited/85th Anniversary (CPOS 2C6/2C7)', 'Grand Cherokee', 'Jeep'),
        _line('Grand Cherokee L Limited Reserve (CPOS 2C1)', 'Grand Cherokee', 'Jeep'),
        _line('Summit (WLJH75 CPOS 2C3)', 'Grand Cherokee L', 'Jeep'),
        _line('Summit (WLJH74 CPOS 2C3)', 'Grand Cherokee', 'Jeep'),
    ]
    GRAND_CHEROKEE_2025 = [
        _line('Laredo (WLJH74 2*A) (WL)', 'Grand Cherokee', 'Jeep', 2025),
        _line('Altitude (WLJH74 2*B) (WL)', 'Grand Cherokee', 'Jeep', 2025),
        _line('Summit (WLJT74 23S) (WL)', 'Grand Cherokee', 'Jeep', 2025),
        _line('4xe (WL)', 'Grand Cherokee', 'Jeep', 2025),
        _line('(WL) (excludes Laredo (WLJH74 2*A & 2*B), Summit (WLJT74 23S), and 4xe)',
              'Grand Cherokee', 'Jeep', 2025),
    ]
    RAM_HD = [
        _line('Power Wagon Crew Cab (DJ7X91 2UP)', '2500'),
        _line('Gas Models (excl 2500 Power Wagon Crew Cab (DJ7X91 2UP), Chassis Cab Models)',
              '2500/3500'),
        _line('Diesel Models (excl Chassis Cab Models)', '2500/3500'),
    ]

    def test_included_code_gets_its_own_line(self):
        r = _match(self.RAM_1500, brand='Ram', model='1500', trim='Big Horn', year=2026,
                   code='DT6H91')
        assert r['certain'] and r['program']['trim'] == 'Big Horn (DT6H91)'
        assert r['program']['consumer_cash'] == 0

    def test_excluded_code_never_gets_the_other_line(self):
        r = _match(self.RAM_1500, brand='Ram', model='Ram 1500', trim='Bighorn', year=2026,
                   code='DT6H98')
        assert r['certain'] and r['program']['trim'] == 'Big Horn (excludes DT6H91)'
        assert r['program']['consumer_cash'] == 6000

    def test_unknown_code_is_not_guessed(self):
        r = _match(self.RAM_1500, brand='Ram', model='1500', trim='Big Horn', year=2026)
        assert r['program'] is None and not r['certain']
        assert [c['trim'] for c in r['candidates']] == [
            'Big Horn (DT6H91)', 'Big Horn (excludes DT6H91)']
        assert 'code de produit' in r['reason']

    def test_line_without_code_matches_by_trim(self):
        r = _match(self.RAM_1500, brand='Ram', model='1500', trim='Rebel', year=2026)
        assert r['certain'] and r['program']['trim'] == 'Sport, Rebel'

    def test_year_and_brand_must_match(self):
        assert _match(self.RAM_1500, brand='Ram', model='1500', trim='Rebel',
                      year=2025)['candidates'] == []
        assert _match(self.RAM_1500, brand='Jeep', model='1500', trim='Rebel',
                      year=2026)['candidates'] == []

    def test_only_excluded_code_falls_in_catch_all(self):
        lines = [_line('(JTJL98)', 'Gladiator', 'Jeep'),
                 _line('(excluding all JTJL98 models)', 'Gladiator', 'Jeep')]
        hit = _match(lines, brand='Jeep', model='Gladiator', trim='Sport', year=2026, code='JTJL98')
        other = _match(lines, brand='Jeep', model='Gladiator', trim='Rubicon', year=2026,
                       code='JTJS98')
        assert hit['program']['trim'] == '(JTJL98)'
        assert other['program']['trim'] == '(excluding all JTJL98 models)'

    def test_nested_exclusion_with_trim_name(self):
        lines = [_line('Base (KMJL74)', 'Cherokee', 'Jeep'),
                 _line('(excluding Base (KMJL74))', 'Cherokee', 'Jeep')]
        assert _match(lines, brand='Jeep', model='Cherokee', trim='', year=2026,
                      code='KMJL74')['program']['trim'] == 'Base (KMJL74)'
        assert _match(lines, brand='Jeep', model='Cherokee', trim='Limited', year=2026,
                      code='KMJP74')['program']['trim'] == '(excluding Base (KMJL74))'

    def test_cpos_package_decides_between_lines(self):
        r = _match(self.GRAND_CHEROKEE, brand='Jeep', model='Grand Cherokee L', trim='',
                   year=2026, code='WLJH75', options=['2B5', 'PW7'])
        assert r['program']['trim'] == 'Grand Cherokee L Altitude (CPOS 2B5)'
        r = _match(self.GRAND_CHEROKEE, brand='Jeep', model='Grand Cherokee', trim='',
                   year=2026, code='WLJH74', options=['2C3'])
        assert r['program']['trim'] == 'Summit (WLJH74 CPOS 2C3)'
        r = _match(self.GRAND_CHEROKEE, brand='Jeep', model='Grand Cherokee L', trim='',
                   year=2026, code='WLJH75', options=['2C3'])
        assert r['program']['trim'] == 'Summit (WLJH75 CPOS 2C3)'

    def test_unknown_options_and_trim_are_not_guessed(self):
        r = _match(self.GRAND_CHEROKEE, brand='Jeep', model='Grand Cherokee', trim='',
                   year=2026, code='WLJH74')
        assert r['program'] is None and len(r['candidates']) == 5

    def test_trim_name_decides_when_options_unknown(self):
        r = _match(self.GRAND_CHEROKEE, brand='Jeep', model='Grand Cherokee',
                   trim='Limited Reserve', year=2026, code='WLJH74')
        assert r['program']['trim'] == 'Grand Cherokee L Limited Reserve (CPOS 2C1)'

    def test_wildcard_package(self):
        g = self.GRAND_CHEROKEE_2025
        common = dict(brand='Jeep', model='Grand Cherokee', year=2025)
        assert _match(g, trim='Laredo', code='WLJH74', options=['2BA'],
                      **common)['program']['trim'] == 'Laredo (WLJH74 2*A) (WL)'
        assert _match(g, trim='Altitude', code='WLJH74', options=['2BB'],
                      **common)['program']['trim'] == 'Altitude (WLJH74 2*B) (WL)'
        assert _match(g, trim='Limited', code='WLJH74', options=['2BH'],
                      **common)['program']['trim'].startswith('(WL) (excludes')
        assert _match(g, trim='Summit', code='WLJT74', options=['23S'],
                      **common)['program']['trim'] == 'Summit (WLJT74 23S) (WL)'
        assert _match(g, trim='4xe', code='WLXH74', **common)['program']['trim'] == '4xe (WL)'

    def test_code_with_package_and_model_alternatives(self):
        common = dict(brand='Ram', year=2026)
        r = _match(self.RAM_HD, model='2500', trim='Power Wagon', code='DJ7X91',
                   options=['2UP'], **common)
        assert r['program']['trim'] == 'Power Wagon Crew Cab (DJ7X91 2UP)'
        r = _match(self.RAM_HD, model='2500', trim='Rebel', code='DJ7X91', options=['2UR'],
                   option_text='6.4L HEMI V8 ENGINE', **common)
        assert r['program']['trim'].startswith('Gas Models')
        r = _match(self.RAM_HD, model='3500', trim='Big Horn', code='D28H91', options=['ETM'],
                   option_text='6.7L CUMMINS TURBO DIESEL ENGINE', **common)
        assert r['program']['trim'].startswith('Diesel Models')

    def test_unknown_engine_is_not_guessed(self):
        r = _match(self.RAM_HD, brand='Ram', model='3500', trim='Big Horn', year=2026,
                   code='D28H91')
        assert r['program'] is None and len(r['candidates']) == 2
        assert 'motorisation' in r['reason']

    def test_excluded_body_gets_no_line(self):
        r = _match(self.RAM_HD, brand='Ram', model='3500', trim='Chassis Cab SLT', year=2026,
                   code='DD8L63', option_text='6.4L HEMI')
        assert r['candidates'] == []

    def test_engine_number_is_not_a_package(self):
        from services.program_matching import parse_conditions
        c = parse_conditions('4-Door (excludes JLJL74 models, Rubicon w/ 2.0L (JLJS74 22R), '
                             '392 (JLJX74) and 4xe Models)')
        assert c['targets'] == []
        assert [i['targets'] for i in c['exclusions']] == [
            [('JLJL74', ())], [('JLJS74', ('22R',))], [('JLJX74', ())], []]
        assert c['doors'] == {'4'}

    def test_signature_separates_lookalike_lines(self):
        from services.program_matching import condition_signature
        with_code = condition_signature('Big Horn (DT6H91)')
        without = condition_signature('Big Horn (excludes DT6H91)')
        assert with_code != without
        assert condition_signature('Big Horn') not in (with_code, without)
        assert condition_signature('Sport, Rebel (DT)') == condition_signature('Sport, Rebel')


# ═══════════════════════════════════════════════════════════════════════════════
# Guide des valeurs résiduelles (lecture par position, kilométrage, période)
# ═══════════════════════════════════════════════════════════════════════════════

_RES_TERMS = ["24", "27", "36", "39", "42", "48", "51", "54", "60"]
_RES_X = [214 + 17 * i for i in range(9)]


def _residual_page(lines):
    """lines : ('brand', 'DODGE') | ('model', '2025 Charger') | ('more', 'Daytona')
    | ('row', 'R/T', '2D Coupe AWD', [9 valeurs]) | ('wrap', 'Hammerhead')."""
    words, top = [], 93.0

    def put(text, x):
        for piece in text.split():
            words.append(_word(piece, x, top))
            x += len(piece) * 4.0 + 2
    for line in lines:
        kind = line[0]
        if kind == "brand":
            put(line[1], 58)
            words.extend(_word(t, x, top, centered=True) for t, x in zip(_RES_TERMS, _RES_X))
        elif kind in ("model", "more"):
            put(line[1], 58)
        elif kind == "wrap":
            put(line[1], 63)
        else:
            put(line[1], 63)
            put(line[2], 141)
            xs = line[4] if len(line) > 4 else _RES_X
            words.extend(_word(str(v), x, top, centered=True) for v, x in zip(line[3], xs))
        top += 13
    return _FakePage(words, [])


_VALUES = [49, 48, 42, 40, 37, 33, 31, 29, 27]


class TestResidualReader:
    def _read(self, lines):
        from services.residual_reader import read_table_page
        return read_table_page(_residual_page(lines))

    def test_row_is_read_with_year_model_trim_body(self):
        vehicles, problems = self._read([
            ("brand", "DODGE"), ("model", "2025 Durango"),
            ("row", "R/T Plus", "4D Utility AWD", _VALUES)])
        assert problems == []
        assert vehicles == [{
            "brand": "Dodge", "model_year": 2025, "model_name": "Durango", "trim": "R/T Plus",
            "body_style": "4D Utility AWD",
            "residual_percentages": dict(zip(_RES_TERMS, _VALUES))}]

    def test_wrapped_model_and_trim_names(self):
        vehicles, problems = self._read([
            ("brand", "DODGE"), ("model", "2025 Charger"), ("more", "Daytona"),
            ("row", "SRT Hellcat", "2D Coupe AWD", _VALUES), ("wrap", "Hammerhead"),
            ("row", "Scat Pack", "2D Coupe AWD", _VALUES)])
        assert problems == []
        assert [(v["model_name"], v["trim"]) for v in vehicles] == [
            ("Charger Daytona", "SRT Hellcat Hammerhead"), ("Charger Daytona", "Scat Pack")]

    def test_each_model_year_keeps_its_own_values(self):
        newer = [56, 54, 48, 47, 44, 40, 39, 37, 33]
        vehicles, _ = self._read([
            ("brand", "RAM"), ("model", "2027 1500"),
            ("row", "Big Horn", "Crew Cab SWB 4WD", newer),
            ("model", "2026 1500"), ("row", "Big Horn", "Crew Cab SWB 4WD", _VALUES)])
        assert [(v["model_year"], v["residual_percentages"]["24"]) for v in vehicles] == [
            (2027, 56), (2026, 49)]
        assert vehicles[0]["body_style"] == "Crew Cab SWB 4WD"

    def test_value_is_attached_to_the_term_above_it(self):
        # Une valeur manquante ne décale pas les autres : la ligne est refusée
        vehicles, problems = self._read([
            ("brand", "JEEP"), ("model", "2026 Compass"),
            ("row", "North", "4D Utility 4WD", _VALUES[:8], _RES_X[1:])])
        assert vehicles == []
        assert problems and "8 pourcentages" in problems[0]

    def test_increasing_values_are_refused(self):
        vehicles, problems = self._read([
            ("brand", "JEEP"), ("model", "2026 Compass"),
            ("row", "North", "4D Utility 4WD", [40, 48, 42, 40, 37, 33, 31, 29, 27])])
        assert vehicles == [] and "incohérents" in problems[0]

    def test_unknown_line_is_reported(self):
        _, problems = self._read([
            ("brand", "JEEP"), ("model", "2026 Compass"),
            ("row", "North", "Wagon", _VALUES)])
        assert problems and "carrosserie introuvable" in problems[0]

    def test_km_table_french_and_english(self):
        from services.residual_reader import read_km_adjustments
        french = ("Kilométrage et coûts:\n"
                  "L' augmentation 24-27 mois 36-42 mois 48-54 mois 60 mois\n"
                  "24,000 Kilomètres par an +0% +0% +0% +0%\n"
                  "18,000 Kilomètres par an +1% +2% +3% +4%\n"
                  "12,000 Kilomètres par an +2% +3% +4% +5%\n"
                  "* Le kilométrage total NE DOIT PAS dépasser 36,000 km par an.")
        english = (french.replace("mois", "months").replace("Kilomètres par an", "Kilometers per year")
                   .replace("36,000 km par an", "36,000/year"))
        for text in (french, english):
            km = read_km_adjustments(text)
            assert km["adjustments"]["18000"] == {
                "24": 1, "27": 1, "36": 2, "39": 2, "42": 2, "48": 3, "51": 3, "54": 3, "60": 4}
            assert km["adjustments"]["12000"]["24"] == 2 and km["adjustments"]["12000"]["60"] == 5
            assert km["standard_km"] == 24000 and km["max_km_per_year"] == 36000

    def test_incomplete_km_table_is_not_accepted(self):
        from services.residual_reader import read_km_adjustments
        assert read_km_adjustments(
            "Adjustment 24-27 months 36-42 months 48-54 months 60 months\n"
            "24,000 Kilometers per year +0% +0% +0% +0%\n"
            "18,000 Kilometers per year +1% +2% +3%\n"
            "12,000 Kilometers per year +2% +3% +4% +5%") is None

    def test_period_french_and_english(self):
        from services.residual_reader import read_period
        assert read_period("NOVEMBRE 2026\nEn vigueur: 3 novembre 2026 jusqu'au 30 novembre\n2026") == {
            "month": 11, "year": 2026, "end_month": 11, "end_year": 2026}
        assert read_period("OCTOBRE 2026 En vigueur: 1 octobre 2026 jusqu'au 2 novembre 2026") == {
            "month": 10, "year": 2026, "end_month": 11, "end_year": 2026}
        assert read_period("MARCH 2026\nEffective: Mar 01, 2026 - Apr 30, 2026") == {
            "month": 3, "year": 2026, "end_month": 4, "end_year": 2026}
        assert read_period("RESIDUAL VALUE GUIDE FEBRUARY 2026")["month"] == 2
        assert read_period("rien ici")["month"] is None


class TestDataStore:
    """Les fichiers importés sont gardés en base et relus au démarrage."""

    class _Collection:
        def __init__(self):
            self.docs = {}

        async def update_one(self, query, update, upsert=False):
            self.docs[query["name"]] = dict(update["$set"])

        def find(self, *_):
            docs = list(self.docs.values())

            class _Cursor:
                def __aiter__(self):
                    self._items = iter(docs)
                    return self

                async def __anext__(self):
                    try:
                        return next(self._items)
                    except StopIteration:
                        raise StopAsyncIteration
            return _Cursor()

    def test_import_survives_a_wiped_disk(self, tmp_path):
        import asyncio
        from services import data_store
        collection = self._Collection()
        db = {data_store.COLLECTION: collection}
        (tmp_path / "sci_residuals_avril2026.json").write_text('{"from": "repo"}')
        data_store.snapshot(tmp_path)

        # Rien n'a changé : rien n'est copié
        assert asyncio.run(data_store.save_changed_files(db, tmp_path)) == 0
        # Un import écrit deux fichiers ; un fichier étranger est ignoré
        (tmp_path / "sci_residuals_novembre2026.json").write_text('{"from": "import"}')
        (tmp_path / "km_adjustments_nov2026.json").write_text('{"km": 1}')
        (tmp_path / "master_product_codes.json").write_text('{}')
        assert asyncio.run(data_store.save_changed_files(db, tmp_path)) == 2
        assert sorted(collection.docs) == ["km_adjustments_nov2026.json",
                                           "sci_residuals_novembre2026.json"]
        assert asyncio.run(data_store.save_changed_files(db, tmp_path)) == 0

        # Redémarrage : le disque ne contient plus que les fichiers du dépôt
        (tmp_path / "sci_residuals_novembre2026.json").unlink()
        (tmp_path / "km_adjustments_nov2026.json").unlink()
        assert asyncio.run(data_store.restore_files(db, tmp_path)) == 2
        assert (tmp_path / "sci_residuals_novembre2026.json").read_text() == '{"from": "import"}'
        assert asyncio.run(data_store.restore_files(db, tmp_path)) == 0


# ═══════════════════════════════════════════════════════════════════════════════
# Primes : pour tous (programme 2618) ou sous condition (programme 2646)
# ═══════════════════════════════════════════════════════════════════════════════

class TestBonusRules:
    PAGES = [
        "Bonus Cash Program – 2618\nBonus Cash Program Elements\nEligible Customers All\n"
        "2025 FIAT 500e 2618B7 1/L/E $5,000 After Tax\nJuly 2026 For Internal Use Only 8",
        "Loyalty Bonus Cash Program – 2646\nJuly Only - 85th Anniversary Jeep Loyalty Bonus\n"
        "2025 Jeep Grand Cherokee 4xe 2646G1 1/L/E $1,850 After Tax\n"
        "2025/2026 Jeep Compass 2646G1 1/L/E $1,850 After Tax\n"
        "2026 Jeep Wrangler 2646G1 1/L/E $1,850 After Tax",
        "Finance Prime\nRate Landscapes",
    ]

    def _rules(self):
        from services.pdfplumber_parser import read_bonus_rules
        return read_bonus_rules(self.PAGES)

    def test_rules_pages_are_read(self):
        rules = self._rules()
        assert [(r['kind'], r['program'], r['amount']) for r in rules] == [
            ('all', '2618', 5000), ('loyalty', '2646', 1850), ('loyalty', '2646', 1850),
            ('loyalty', '2646', 1850)]
        assert rules[2]['years'] == {2025, 2026} and 'compass' in rules[2]['models']

    def test_loyalty_amount_is_conditional(self):
        from services.pdfplumber_parser import bonus_condition
        assert bonus_condition(self._rules(), 'Jeep', 2026, 1850) == 'loyalty'
        assert bonus_condition(self._rules(), 'Jeep', 2025, 1850) == 'loyalty'

    def test_bonus_for_everyone_stays_for_everyone(self):
        from services.pdfplumber_parser import bonus_condition
        assert bonus_condition(self._rules(), 'Fiat', 2025, 5000) == ''

    def test_unannounced_amount_is_left_alone(self):
        from services.pdfplumber_parser import bonus_condition
        # autre marque, autre montant, autre année, ou PDF sans page de règles
        assert bonus_condition(self._rules(), 'Ram', 2026, 1850) == ''
        assert bonus_condition(self._rules(), 'Jeep', 2026, 1000) == ''
        assert bonus_condition(self._rules(), 'Jeep', 2027, 1850) == ''
        assert bonus_condition([], 'Jeep', 2026, 1850) == ''
        assert bonus_condition(self._rules(), 'Jeep', 2026, 0) == ''

    def test_conquest_program_is_conditional_too(self):
        from services.pdfplumber_parser import read_bonus_rules, bonus_condition
        rules = read_bonus_rules([
            "Conquest Bonus Cash Program – 2646\nJeep Conquest Bonus Cash Program Elements\n"
            "2026 Jeep Wrangler 2646J1 1/L/E $1,250 After Tax"])
        assert bonus_condition(rules, 'Jeep', 2026, 1250) == 'conquest'


# ═══════════════════════════════════════════════════════════════════════════════
# Rabais avant taxes de l'option 2 : même nom à l'import, en base et à l'écran
# ═══════════════════════════════════════════════════════════════════════════════

class TestAlternativeConsumerCash:
    def test_import_pdf_ecrit_le_nom_lu_par_l_ecran(self):
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, "..", "routers", "import_wizard.py"), encoding="utf-8") as handle:
            source = handle.read()
        assert source.count('"alternative_consumer_cash": prog.get("alt_consumer_cash", 0) or 0') == 2
        assert '"alt_consumer_cash": prog.get(' not in source
        # Le crédit de livraison n'est jamais accordé : il n'est pas enregistré.
        assert '"delivery_credit": prog.get(' not in source
        # L'étape « Enregistrer » de l'assistant reçoit les lignes du lecteur : même renommage.
        assert 'legacy_alt = prog_data.pop("alt_consumer_cash", None)' in source

    def test_location_sans_credit_de_livraison(self, monkeypatch):
        from services.pdfplumber_parser import parse_sci_lease
        TestParserUsesLandscapeReader()._patch(monkeypatch)
        lease = parse_sci_lease(b"pdf", 1, 1)
        (vehicle,) = lease["vehicles_2027"]
        assert vehicle["lease_cash"] == 3000 and "delivery_credit" not in vehicle

    def test_prime_de_fidelite_servie_avec_le_programme(self):
        pytest.importorskip("pydantic")
        from models import VehicleProgram
        rates = {"rate_36": 4.99, "rate_48": 4.99, "rate_60": 4.99, "rate_72": 4.99, "rate_84": 4.99, "rate_96": 4.99}
        program = VehicleProgram(brand="Jeep", model="Compass", trim="Sport", year=2026,
                                 option1_rates=rates, bonus_cash=0, loyalty_bonus_cash=1850)
        # Elle reste à part de la prime pour tous : l'écran ne l'applique que si elle est cochée.
        assert program.bonus_cash == 0 and program.loyalty_bonus_cash == 1850

    def test_code_et_nom_du_programme_de_prime(self):
        from services.pdfplumber_parser import read_bonus_rules, bonus_program
        rules = read_bonus_rules(TestBonusRules.PAGES)
        assert bonus_program(rules, "Fiat", 2025, 5000, False) == {
            "code": "2618B7", "name": "Bonus Cash"}
        named = bonus_program(rules, "Jeep", 2026, 1850, True)
        assert named["code"] == "2646G1" and "85th Anniversary Jeep Loyalty Bonus" in named["name"]
        # Une prime sous condition ne prend pas le nom du programme pour tous.
        assert bonus_program(rules, "Jeep", 2026, 1850, False) is None
        assert bonus_program(rules, "Jeep", 2026, 0, True) is None

    def test_code_de_programme_d_une_autre_annee(self):
        from services.pdfplumber_parser import read_bonus_rules
        (rule,) = read_bonus_rules(["Loyalty Bonus Cash – 2746\nJeep Loyalty Bonus Cash Program Elements\n"
                                    "2027 Jeep Wrangler 2746A1 1/L/E $1,850 After Tax"])
        assert (rule["code"], rule["kind"], rule["amount"]) == ("2746A1", "loyalty", 1850)
        assert rule["name"] == "Jeep Loyalty Bonus Cash"

    def test_ancien_document_relu_avec_le_bon_nom(self):
        pytest.importorskip("fastapi")
        pytest.importorskip("motor")
        from routers.programs import _with_alternative_cash
        assert _with_alternative_cash({"alt_consumer_cash": 2000})["alternative_consumer_cash"] == 2000
        # Une correction volontaire à 0 n'est pas écrasée par l'ancien champ.
        assert _with_alternative_cash({"alt_consumer_cash": 2000, "alternative_consumer_cash": 0})["alternative_consumer_cash"] == 0


class TestSpecialOffersTemplate:
    """Gabarit des promotions du mois : toute page « <Nom> – <code> » avec un
    « Discount Type Before/After Tax Discount » devient des offres à cocher.
    Valeurs inventées, même mise en page que les PDF."""

    PAGES = [
        "Bonus Cash Program – 2618\nBonus Cash Program Elements\nEligible Customers All\n"
        "Discount Type After Tax Discount\n2025 FIAT 500e 2618Z9 1/L/E $900 After Tax",
        "Loyalty Bonus Cash Program – 2646\nRam & Jeep Loyalty Bonus Cash Program Elements\n"
        "Customers that currently own or lease a vehicle\nEligible Customers\nregistered before the 1st.\n"
        "Discount Type After Tax Discount\n"
        "Ram 1500 (DT) (excluding Tradesman, Express\n2026 2646Z1 1/L/E $700 After Tax\nWarlock models)\n"
        "2026 Ram 1500 (DT) RHO 2646Z1 1/L/E $2,100 After Tax\n"
        "Ram2500/3500 Diesel (excluding Gas models\n2026 2646Z1 1/L/E $700 After Tax\n& Chassis Cab)\n"
        "2026 Jeep Grand Cherokee/Grand Cherokee L 2646Z1 1/L/E $700 After Tax\n"
        "2026 Jeep Cherokee 2646Z1 1/L/E $300 After Tax",
        "Targeted Inventory Clear-Out Cash Program – 2634Z1\nTargeted Inventory Program Elements\n"
        "Eligible Customers All\nDiscount Type Before Tax Discount\n"
        "(Please refer to dealerships Manifest list)\n"
        "Ram 1500 (DT) Sport with Leather Seats\n2026 2634Z1 1/L/E $600 Before Tax\n(DT6T91/DT6T98 w/ A71)\n"
        "Ram 1500 (DT) Rebel with Leather Seats\n2026 2634Z1 1/L/E $600 Before Tax\n(excluding DT6X98 w/ G7XR)\n"
        "Note: Full value on the certificate must be passed on.",
        "Summer Splash Cash – 2699Z2\nSummer Splash Elements\nEligible Customers All\n"
        "Discount Type After Tax Discount\n2026 Ram 1500 Tradesman, Express & Warlock 2699Z2 L $450 After Tax",
        "Finance Prime\nRate Landscapes",
    ]
    PROGRAMS = [
        {'brand': 'Ram', 'model': '1500', 'trim': 'Sport, Rebel', 'year': 2026},
        {'brand': 'Ram', 'model': '1500', 'trim': 'Tradesman, Express, Warlock', 'year': 2026},
        {'brand': 'Ram', 'model': '1500', 'trim': 'RHO', 'year': 2026},
        {'brand': 'Ram', 'model': '2500/3500', 'trim': 'Diesel Models (excl Chassis Cab Models)', 'year': 2026},
        {'brand': 'Ram', 'model': '2500/3500', 'trim': 'Gas Models (excl Chassis Cab Models)', 'year': 2026},
        {'brand': 'Jeep', 'model': 'Grand Cherokee', 'trim': 'Grand Cherokee L Altitude', 'year': 2026},
        {'brand': 'Jeep', 'model': 'Cherokee', 'trim': 'Base', 'year': 2026},
        {'brand': 'Ram', 'model': '1500', 'trim': 'Sport, Rebel', 'year': 2027},
    ]

    def _offers(self):
        from services.pdfplumber_parser import read_special_offers
        return read_special_offers(self.PAGES)

    def _for(self, index):
        from services.pdfplumber_parser import offers_for_program
        found = offers_for_program(self._offers(), self.PROGRAMS[index], self.PROGRAMS)
        return {o['code']: o for o in found}

    def test_pages_become_offers_whatever_the_name(self):
        offers = self._offers()
        assert {o['code'] for o in offers} == {'2646Z1', '2634Z1', '2699Z2'}   # 2618 : déjà dans les tableaux
        splash = next(o for o in offers if o['code'] == '2699Z2')
        assert (splash['name'], splash['tax'], splash['amount'], splash['sale_types']) == (
            'Summer Splash Cash', 'after', 450, ['L'])
        targeted = [o for o in offers if o['code'] == '2634Z1']
        assert all(o['tax'] == 'before' and o['vin_list'] for o in targeted)
        assert targeted[0]['models'] == 'Ram 1500 (DT) Sport with Leather Seats (DT6T91/DT6T98 w/ A71)'

    def test_wrapped_model_text_is_rebuilt(self):
        loyalty = [o for o in self._offers() if o['code'] == '2646Z1']
        assert loyalty[0]['models'] == 'Ram 1500 (DT) (excluding Tradesman, Express Warlock models)'
        assert loyalty[2]['models'] == 'Ram 2500/3500 Diesel (excluding Gas models & Chassis Cab)'
        assert loyalty[0]['kind'] == 'loyalty' and 'registered before' in loyalty[0]['eligible_customers']

    def test_offers_follow_model_trim_and_year(self):
        sport = self._for(0)
        assert sport['2646Z1']['amount'] == 700 and sport['2634Z1']['tax'] == 'before'
        assert 'Sport with Leather' in sport['2634Z1']['condition'] and 'Rebel with Leather' in sport['2634Z1']['condition']
        assert set(self._for(1)) == {'2699Z2'}                 # version exclue de la fidélité
        assert self._for(2)['2646Z1']['amount'] == 2100        # la ligne qui nomme le RHO l'emporte
        assert set(self._for(3)) == {'2646Z1'} and self._for(4) == {}
        assert self._for(5)['2646Z1']['amount'] == 700         # « Grand Cherokee », pas « Cherokee »
        assert self._for(6)['2646Z1']['amount'] == 300
        assert self._for(7) == {}                              # autre année-modèle

    def test_table_amount_rules_for_loyalty(self):
        from services.pdfplumber_parser import attach_special_offers
        programs = [dict(p) for p in self.PROGRAMS[:2]]
        programs[0].update(loyalty_bonus_cash=800, loyalty_bonus_cash_program={'code': '2646Z1', 'name': 'X'})
        programs[1].update(loyalty_bonus_cash=250, loyalty_bonus_cash_program={'code': '2646Z1', 'name': 'Loyal'})
        attach_special_offers(programs, self._offers())
        first = {o['code']: o for o in programs[0]['special_offers']}
        assert first['2646Z1']['amount'] == 800 and len(programs[0]['special_offers']) == 2
        second = programs[1]['special_offers']
        assert second[0]['code'] == '2646Z1' and second[0]['amount'] == 250 and second[0]['tax'] == 'after'


# ============ Codes de modèle possibles selon la version ============

class TestModelCodeSuggest:
    MASTER = {
        "ZZ6L98": {"brand": "Ram", "model": "1500", "trim": "Tradesman", "cab": "", "drive": "4x4", "year": "2026"},
        "ZZ6L41": {"brand": "Ram", "model": "Ram 1500", "trim": "Tradesman", "cab": "Quad Cab", "drive": "4x4", "year": "2026"},
        "ZZ6L92": {"brand": "Ram", "model": "1500", "trim": "Tradesman", "cab": "Crew Cab", "drive": "4x2", "year": "2026"},
        "ZZ6H98": {"brand": "Ram", "model": "1500", "trim": "Big Horn", "cab": "Crew Cab", "drive": "4x4", "year": "2026"},
        "YY7L98": {"brand": "Ram", "model": "2500", "trim": "Tradesman", "cab": "Crew Cab", "drive": "4x4", "year": "2026"},
    }

    def test_trim_from_title(self):
        from services.model_code_suggest import trim_from_title
        assert trim_from_title("Ram 1500 EXPRESS 2027", "Ram", "1500", 2027) == "EXPRESS"
        assert trim_from_title("2027 Ram 1500 Big Horn", "Ram", "1500", 2027) == "Big Horn"
        assert trim_from_title("Jeep Grand Cherokee L Altitude 2026", "Jeep", "Grand Cherokee L", 2026) == "Altitude"
        assert trim_from_title(None, "Ram", "1500", 2027) == ""
        assert trim_from_title("Ram 1500 2027", "Ram", "1500", 2027) == ""

    def test_codes_for_trim_ignore_year_and_spacing(self):
        from services.model_code_suggest import suggest_codes
        codes = [c["code"] for c in suggest_codes(self.MASTER, "Ram", "1500", ["BIGHORN"])]
        assert codes == ["ZZ6H98"]

    def test_cab_and_drive_rank_and_filter(self):
        from services.model_code_suggest import suggest_codes
        codes = [c["code"] for c in suggest_codes(
            self.MASTER, "Ram", "1500", [None, "Tradesman", "EXPRESS"], "Crew Cab", "4WD/4-Wheel Drive/4x4")]
        # 4x2 écarté, cabine d'équipe d'abord, cabine Quad en dernier, autre modèle exclu
        assert codes == ["ZZ6L98", "ZZ6L41"]

    def test_unknown_trim_gives_nothing(self):
        from services.model_code_suggest import suggest_codes
        assert suggest_codes(self.MASTER, "Ram", "1500", ["Express"]) == []
        assert suggest_codes(self.MASTER, "Ram", "1500", [None, ""]) == []

    def test_trims_of_program(self):
        from services.model_code_suggest import trims_of_program
        assert trims_of_program({"trim": "Tradesman, Express, Warlock"}) == ["Tradesman", "Express", "Warlock"]
        assert trims_of_program({"trim": "Big Horn (excludes DT6H91)"}) == ["Big Horn"]
        assert trims_of_program(None) == []

    def test_known_trims_from_reference_and_programs(self):
        from services.model_code_suggest import known_trims
        programs = [
            {"brand": "Ram", "model": "1500", "trim": "Tradesman, Express, Warlock"},
            {"brand": "Ram", "model": "2500/3500", "trim": "Gas Models (excl Chassis Cab Models)"},
            {"brand": "Jeep", "model": "Compass", "trim": "North"},
        ]
        assert known_trims(self.MASTER, "Ram", "1500", programs) == ["Big Horn", "Express", "Tradesman", "Warlock"]
        assert known_trims(self.MASTER, "Ram", "2500", programs) == ["Tradesman"]
        assert known_trims(self.MASTER, "Jeep", "Compass", programs) == ["North"]

    def test_is_known_code(self):
        from services.model_code_suggest import is_known_code
        assert is_known_code(self.MASTER, "zz6l98")
        assert not is_known_code(self.MASTER, "QQ1A11")


# ============ Inventaire partagé : véhicules sortis du site ============

class TestStaleSharedInventory:
    def _vehicles(self):
        from datetime import datetime, timezone
        return [
            {"stock_no": "A1", "owner_id": "SHARED_KENNEBEC", "last_synced_at": datetime(2026, 11, 14, 3, 30)},
            {"stock_no": "A2", "owner_id": "SHARED_KENNEBEC", "last_synced_at": datetime(2026, 11, 13, 3, 30, tzinfo=timezone.utc)},
            {"stock_no": "OLD", "owner_id": "SHARED_KENNEBEC", "last_synced_at": datetime(2026, 9, 1, 3, 30)},
            {"stock_no": "NODATE", "owner_id": "SHARED_KENNEBEC"},
            {"stock_no": "MINE", "owner_id": "user-1"},
        ]

    def test_vehicles_not_seen_by_last_sync_are_dropped(self):
        from datetime import datetime
        from services.shared_inventory import drop_stale_shared
        kept = [v["stock_no"] for v in drop_stale_shared(self._vehicles(), datetime(2026, 11, 14, 3, 31))]
        assert kept == ["A1", "A2", "MINE"]

    def test_without_any_sync_date_nothing_is_dropped(self):
        from services.shared_inventory import drop_stale_shared
        assert len(drop_stale_shared(self._vehicles(), None)) == 5


class TestCalcPriceFromPdsf:
    """Le calculateur part du PDSF d'un véhicule neuf, jamais du prix déjà réduit."""

    def _price(self, **vehicle):
        from services.shared_inventory import calc_price
        return calc_price(vehicle)

    def test_new_shared_vehicle_uses_pdsf_not_site_price(self):
        got = self._price(owner_id="SHARED_KENNEBEC", type="neuf", asking_price=50000, msrp=61000, pdsf=61000, rabais=11000)
        assert got == {"calc_price": 61000, "pdsf_confirmed": True}

    def test_new_shared_vehicle_without_pdsf_is_flagged(self):
        got = self._price(owner_id="SHARED_KENNEBEC", type="neuf", asking_price=50000, msrp=50000, pdsf=0)
        assert got == {"calc_price": 50000, "pdsf_confirmed": False}

    def test_pdsf_below_site_price_is_not_trusted(self):
        got = self._price(owner_id="SHARED_KENNEBEC", type="neuf", asking_price=50000, msrp=4500, pdsf=4500)
        assert got == {"calc_price": 50000, "pdsf_confirmed": False}

    def test_manual_vehicle_uses_entered_msrp(self):
        got = self._price(owner_id="user-1", type="neuf", asking_price=58000, msrp=60000)
        assert got == {"calc_price": 60000, "pdsf_confirmed": True}

    def test_used_vehicle_keeps_asking_price(self):
        got = self._price(owner_id="SHARED_KENNEBEC", type="occasion", asking_price=21000, msrp=21000, pdsf=0)
        assert got == {"calc_price": 21000, "pdsf_confirmed": True}

    def test_missing_or_bad_amounts_do_not_crash(self):
        got = self._price(owner_id="SHARED_KENNEBEC", asking_price=None, msrp="abc")
        assert got == {"calc_price": 0, "pdsf_confirmed": False}


class TestEtvLink:
    """Lien eTradeValue → CalcAuto : billet d'entrée, isolation par concession, dossiers."""

    SECRET = "cle-inventee-pour-les-tests-0123456789abcdef"

    def _ticket(self, monkeypatch, secret=None, **overrides):
        import base64, json
        from services import etv_link
        monkeypatch.setenv("CALCAUTO_LINK_SECRET", self.SECRET)
        payload = {"v": 1, "sub": "marie", "name": "Marie Essai", "role": "conseiller", "dealer": "kennebec",
                   "exp": 1120, "nonce": "numero-unique-123456", **overrides}
        body = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
        return f"{body}.{etv_link.sign((secret or self.SECRET).encode(), 'ticket:' + body)}"

    def test_valid_ticket_gives_identity(self, monkeypatch):
        from services.etv_link import verify_ticket
        identity = verify_ticket(self._ticket(monkeypatch), now=1000)
        assert (identity["username"], identity["dealer_slug"], identity["role"], identity["name"]) == (
            "marie", "kennebec", "conseiller", "Marie Essai")

    def test_ticket_refused_when_forged_expired_or_malformed(self, monkeypatch):
        from services.etv_link import LinkError, verify_ticket
        good = self._ticket(monkeypatch)
        bad = [self._ticket(monkeypatch, secret="une-autre-cle-inventee-0123456789abcdef"),
               good[:-2] + "xx", good.split(".")[0], "", "n'importe.quoi",
               self._ticket(monkeypatch, role="grossiste"), self._ticket(monkeypatch, dealer=""),
               self._ticket(monkeypatch, dealer="Kia Thetford"), self._ticket(monkeypatch, sub=""),
               self._ticket(monkeypatch, nonce="court"), self._ticket(monkeypatch, v=2),
               self._ticket(monkeypatch, exp=99999)]
        for ticket in bad:
            with pytest.raises(LinkError) as err:
                verify_ticket(ticket, now=1000)
            assert err.value.status == 401
        with pytest.raises(LinkError):
            verify_ticket(good, now=1121)  # expiré

    def test_everything_is_off_without_the_secret(self, monkeypatch):
        from services.etv_link import LinkError, dossiers_request, verify_ticket
        ticket = self._ticket(monkeypatch)
        monkeypatch.delenv("CALCAUTO_LINK_SECRET")
        for call in (lambda: verify_ticket(ticket, now=1000),
                     lambda: dossiers_request({"dealer_slug": "kennebec", "etv_username": "marie", "etv_role": "conseiller"})):
            with pytest.raises(LinkError) as err:
                call()
            assert err.value.status == 503

    def test_accounts_are_separate_per_dealer(self):
        from services.etv_link import account_email
        assert account_email("Marie", "kennebec") != account_email("Marie", "kia-essai")
        assert account_email("Marie", "kennebec") == "marie@kennebec.etradevalue"

    def test_admin_tab_only_for_admins_of_allowed_dealers(self, monkeypatch):
        from services.etv_link import is_calcauto_admin
        monkeypatch.delenv("CALCAUTO_ADMIN_DEALERS", raising=False)
        assert is_calcauto_admin("admin", "kennebec") is True
        assert is_calcauto_admin("directeur", "kennebec") is False
        assert is_calcauto_admin("admin", "kia-essai") is False

    def test_other_dealer_never_sees_shared_kennebec_inventory(self):
        from services.etv_link import inventory_owners, sees_shared_inventory
        from services.shared_inventory import SHARED_OWNER
        assert sees_shared_inventory({"id": "u1"}) and sees_shared_inventory({"id": "u1", "dealer_slug": "kennebec"})
        assert inventory_owners({"id": "u2", "dealer_slug": "kia-essai"}, SHARED_OWNER) == ["u2"]
        assert inventory_owners({"id": "u1", "dealer_slug": "kennebec"}, SHARED_OWNER) == ["u1", SHARED_OWNER]
        assert inventory_owners({"id": "demo"}, SHARED_OWNER) == ["demo", SHARED_OWNER]

    def test_dossiers_request_is_signed_for_this_user_only(self, monkeypatch):
        from services.etv_link import LinkError, dossiers_request, sign
        monkeypatch.setenv("CALCAUTO_LINK_SECRET", self.SECRET)
        req = dossiers_request({"dealer_slug": "kennebec", "etv_username": "marie", "etv_role": "conseiller"}, now=5000)
        assert req["params"] == {"dealer": "kennebec", "username": "marie", "role": "conseiller"}
        assert req["headers"]["X-CalcAuto-Signature"] == sign(self.SECRET.encode(), "dossiers:5000:kennebec:marie:conseiller")
        with pytest.raises(LinkError) as err:
            dossiers_request({"id": "demo"})  # compte Démo : pas relié à eTradeValue
        assert err.value.status == 403

    def test_contact_from_dossier_keeps_client_trade_and_desired_vehicle(self):
        from services.etv_link import contact_from_dossier
        contact = contact_from_dossier({
            "id": "e1", "created_at": "2026-11-10T10:00:00+00:00", "status": "NOUVEAU", "advisor": "marie",
            "client": {"name": " Client Essai ", "phone": "418-555-0100", "email": ""},
            "trade": {"year": "2019", "make": "Ford", "model": "F-150", "trim": "XLT", "vin": "", "km": 98000,
                      "value": 21500, "balance_owed": 4000},
            "desired": [{"stock": "A1", "label": "Ram 1500", "price": 60000}, {"stock": ""}, "texte"]})
        assert contact["name"] == "Client Essai" and contact["source"] == "etradevalue" and contact["etv_eval_id"] == "e1"
        assert contact["trade"]["value"] == 21500 and contact["trade"]["balance_owed"] == 4000
        assert contact["desired"] == [{"stock": "A1", "label": "Ram 1500", "price": 60000}]
        assert contact_from_dossier({"id": "e2", "client": {"name": ""}}) is None
        assert contact_from_dossier("texte") is None


class TestAdminToolsAccess:
    """Outils de l'onglet Admin : l'ancien mot de passe ne passe jamais a vide."""

    def test_empty_password_never_matches(self):
        from services.etv_link import admin_password_matches
        assert admin_password_matches("", "valeur-inventee") is False
        assert admin_password_matches("", "") is False
        assert admin_password_matches("quelque-chose", "") is False
        assert admin_password_matches(None, None) is False

    def test_only_exact_password_matches(self):
        from services.etv_link import admin_password_matches
        assert admin_password_matches("valeur-inventee", "valeur-inventee") is True
        assert admin_password_matches("valeur-inventef", "valeur-inventee") is False
        assert admin_password_matches("Valeur-Inventee", "valeur-inventee") is False


class TestEtvTicketReload:
    """Billet représenté par le même navigateur (page rechargée pendant le réveil du serveur)."""

    def test_same_browser_key_is_recognised(self):
        from services.etv_link import browser_key_hash, same_browser
        stored = browser_key_hash("cle-inventee-du-navigateur-0001")
        assert stored and "cle-inventee" not in stored
        assert same_browser(stored, "cle-inventee-du-navigateur-0001") is True

    def test_other_browser_or_missing_key_is_refused(self):
        from services.etv_link import browser_key_hash, same_browser
        stored = browser_key_hash("cle-inventee-du-navigateur-0001")
        assert same_browser(stored, "cle-inventee-du-navigateur-0002") is False
        assert same_browser(stored, "") is False
        assert same_browser("", "cle-inventee-du-navigateur-0001") is False
        assert browser_key_hash("court") == ""
        assert same_browser(browser_key_hash("court"), "court") is False


class TestEtvAccountLink:
    """Relier l'entrée eTradeValue à un compte CalcAuto existant."""

    KEY = "marie@kennebec.etradevalue"

    def test_only_provisional_etv_accounts_can_start_a_link(self):
        from services.etv_link import is_etv_only_account
        assert is_etv_only_account({"email": self.KEY, "etv_username": "marie"}) is True
        assert is_etv_only_account({"email": "marie@example.com", "etv_username": "marie"}) is False
        assert is_etv_only_account({"email": self.KEY}) is False
        assert is_etv_only_account(None) is False

    def test_personal_account_can_be_linked_once(self):
        from services.etv_link import link_refusal
        assert link_refusal({"email": "marie@example.com"}, self.KEY) == ""
        assert link_refusal({"email": "marie@example.com", "etv_link_key": self.KEY}, self.KEY) == ""

    def test_refused_targets(self):
        from services.etv_link import link_refusal
        assert link_refusal({"email": "marie@example.com", "etv_link_key": "luc@kennebec.etradevalue"}, self.KEY)
        assert link_refusal({"email": "marie@example.com", "is_blocked": True}, self.KEY)
        assert link_refusal({"email": "demo@calcauto.ca"}, self.KEY)
        assert link_refusal({"email": "luc@kia-essai.etradevalue"}, self.KEY)
        assert link_refusal(None, self.KEY)
        assert link_refusal({"email": "marie@example.com"}, "")


class TestEvaluationFollowups:
    """Relances à 2, 7 et 15 jours après une évaluation, et leur calendrier."""

    def test_new_evaluation_gets_three_followups(self):
        from datetime import datetime
        from services.etv_link import followup_plan
        plan = followup_plan("2026-11-10T15:00:00+00:00", datetime(2026, 11, 10, 16, 0))
        assert [step["day"] for step in plan] == [2, 7, 15]
        assert plan[0]["due"] == datetime(2026, 11, 12, 15, 0) and plan[2]["due"] == datetime(2026, 11, 25, 15, 0)
        assert all(step["done"] is False for step in plan)

    def test_old_evaluation_only_gets_future_followups(self):
        from datetime import datetime
        from services.etv_link import followup_plan
        assert [s["day"] for s in followup_plan("2026-11-01T12:00:00Z", datetime(2026, 11, 10, 12, 0))] == [15]
        assert followup_plan("2026-08-01T12:00:00Z", datetime(2026, 11, 10, 12, 0)) == []
        assert followup_plan("pas une date", datetime(2026, 11, 10)) == []
        assert followup_plan("", datetime(2026, 11, 10)) == []

    def test_followups_go_to_the_advisor_of_the_file_only(self):
        from services.etv_link import owns_followups
        assert owns_followups({"etv_username": "Marie"}, "marie") is True
        assert owns_followups({"etv_username": "directeur"}, "marie") is False
        assert owns_followups({"etv_username": ""}, "") is False
        assert owns_followups({}, "marie") is False

    def test_calendar_has_one_event_per_followup_with_the_direct_link(self):
        from datetime import datetime
        from services.etv_link import calendar_feed
        feed = calendar_feed([{"eval_id": "e1", "day": 2, "due": datetime(2026, 11, 12, 15, 0), "name": "Client; Inventé",
                               "phone": "418-555-0100", "trade": "Reprise : 2019 Marque Modèle"}],
                             "https://app.example/", datetime(2026, 11, 10, 16, 0))
        assert feed.startswith("BEGIN:VCALENDAR\r\n") and feed.endswith("END:VCALENDAR\r\n")
        assert feed.count("BEGIN:VEVENT") == 1
        assert "DTSTART;VALUE=DATE:20261112" in feed and "DTEND;VALUE=DATE:20261113" in feed
        assert "URL:https://app.example/?tab=calculateur&ouvrir=1&eval=e1" in feed
        assert "Client\\; Inventé (jour 2)" in feed
        assert all(len(line.encode("utf-8")) <= 75 for line in feed.split("\r\n"))

    def test_calendar_skips_unusable_items(self):
        from datetime import datetime
        from services.etv_link import calendar_feed
        feed = calendar_feed([{"eval_id": "", "day": 2, "due": datetime(2026, 11, 12)},
                              {"eval_id": "e2", "day": 7, "due": "2026-11-12"}], "https://app.example", datetime(2026, 11, 10))
        assert "BEGIN:VEVENT" not in feed


class TestDesiredPairingAndListing:
    """Véhicule jumelé par le conseiller et lien de fiche mis dans le texto."""

    def test_paired_vehicle_wins_over_the_evaluation_and_can_be_removed(self):
        from services.etv_link import effective_desired, pairing
        contact = {"desired": [{"stock": "A1", "label": "Ram 1500", "price": 60000}]}
        assert effective_desired(contact)[0]["stock"] == "A1"
        contact["desired_local"] = pairing(" U7 ", "Jeep Compass 2021", "24995")
        assert effective_desired(contact) == [{"stock": "U7", "label": "Jeep Compass 2021", "price": 24995.0}]
        assert pairing("", "x") is None and pairing(None) is None
        contact.pop("desired_local")
        assert effective_desired(contact)[0]["stock"] == "A1"
        assert effective_desired({}) == [] and effective_desired({"desired": "x"}) == []

    def test_sync_fields_never_touch_the_paired_vehicle(self):
        from services.etv_link import contact_from_dossier
        fields = contact_from_dossier({"id": "e1", "client": {"name": "Client"}, "desired": [{"stock": "A1"}]})
        assert "desired_local" not in fields

    def test_listing_request_is_signed_for_the_advisor_and_needs_a_stock(self, monkeypatch):
        from services.etv_link import LinkError, listing_request
        monkeypatch.setenv("CALCAUTO_LINK_SECRET", "cle-inventee-pour-les-tests-0123456789abcdef")
        user = {"dealer_slug": "kia-essai", "etv_username": "kim", "etv_role": "conseiller"}
        request = listing_request(user, " U7 ", now=1000)
        assert request["params"] == {"dealer": "kia-essai", "username": "kim", "role": "conseiller", "stock": "U7"}
        assert request["headers"]["X-CalcAuto-Signature"]
        with pytest.raises(LinkError):
            listing_request(user, "  ")
        with pytest.raises(LinkError):
            listing_request({"email": "seul@exemple.test"}, "U7")

    def test_only_a_plain_https_link_goes_into_a_text_message(self):
        from services.etv_link import safe_listing_url
        assert safe_listing_url("https://exemple.test/occasion/jeep-id12") == "https://exemple.test/occasion/jeep-id12"
        for bad in ("http://exemple.test/x", "javascript:alert(1)", "https://exemple.test/a b", "https://", "", None,
                    "https://localhost/x", "https://exemple.test/" + "a" * 600):
            assert safe_listing_url(bad) == ""
