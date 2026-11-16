"""Un même code de modèle peut changer de version d'une année à l'autre."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from product_code_lookup import codes_for_year, lookup_product_code


def test_cherokee_2027_codes_follow_the_2027_order_guide():
    assert lookup_product_code('KMJM74', 2027)['trim'] == 'Laredo'
    assert lookup_product_code('KMJP74', '2027')['trim'] == 'Limited'
    assert lookup_product_code('KMJP74', 2027, ['23X', 'PW7'])['trim'] == 'Limited Altitude'
    overland = lookup_product_code('KMJS74', 2027)
    assert (overland['model'], overland['trim'], overland['year']) == ('Cherokee', 'Overland', '2027')
    assert overland['full_description'] == 'Jeep Cherokee Overland 4x4'


def test_other_years_keep_the_general_bank():
    assert lookup_product_code('KMJM74', 2026)['trim'] == 'Limited'
    assert lookup_product_code('KMJM74')['trim'] == 'Limited'
    assert lookup_product_code('D28H92', 2027) == lookup_product_code('D28H92')
    assert lookup_product_code('ZZZZ99', 2027) is None


def test_code_only_known_for_2027_is_found_without_a_year():
    assert lookup_product_code('JTJP98')['trim'] == 'Sahara'
    assert lookup_product_code('KMJS74')['year'] == '2027'


def test_package_names_the_grand_cherokee_version():
    assert lookup_product_code('WLJH74', 2027, ['22P'])['trim'] == 'Laredo X'
    assert lookup_product_code('WLJH74', 2027, ['2C1'])['trim'] == 'Limited Reserve'
    assert lookup_product_code('WLJH74', 2027)['trim'] == ''
    assert lookup_product_code('WLJH75', 2027, ['2C6'])['model'] == 'Grand Cherokee L'


def test_reference_for_a_year_overlays_only_that_year():
    base = {'KMJM74': {'trim': 'Limited'}, 'X': {'trim': 'Y'}}
    merged = codes_for_year(base, 2027)
    assert merged['KMJM74']['trim'] == 'Laredo' and merged['X'] == {'trim': 'Y'}
    assert 'KMJS74' in merged and 'KMJS74' not in base
    assert codes_for_year(base, 2026) is base


def test_ram_1500_and_grand_wagoneer_2027():
    express = lookup_product_code('DT6L98', 2027, ['23D', 'PW7'])
    assert (express['trim'], express['cab'], express['box']) == ('Express', 'Crew Cab', "5'7\"")
    assert express['full_description'] == 'Ram 1500 Express Crew Cab 4x4'
    assert lookup_product_code('DT6L98', 2027, ['21B'])['trim'] == 'Warlock'
    assert lookup_product_code('DT6L98', 2027)['trim'] == 'Tradesman'
    assert lookup_product_code('WSJM75', 2027, ['29V'])['trim'] == 'Upland'
    assert lookup_product_code('WSJM76', 2027)['model'] == 'Grand Wagoneer L'
    assert lookup_product_code('WSJM76', 2025)['model'] == 'Wagoneer L'
    assert lookup_product_code('DT6M98', 2027, ['25K'])['trim'] == 'Longhorn'
    assert lookup_product_code('DT6M91', 2027, ['22M'])['trim'] == 'Limited'
    assert lookup_product_code('DT6M98', 2027)['trim'] == 'Limited/Longhorn'
