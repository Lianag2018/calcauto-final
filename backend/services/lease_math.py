"""
Calcul du paiement de location SCI (Québec), annuité en avance.
Échange, solde reporté, comptant et prime après taxes alignés sur TAQ Auto (17 novembre 2026).
Paiements aux deux semaines et à la semaine, et kilométrage de plus de 24 000 km : alignés le même jour.
Aucune dépendance : sert au serveur et aux tests.
"""
import math

TPS = 0.05
TVQ = 0.09975
TAUX_TAXE = TPS + TVQ


# Kilométrage : la base est 24 000 km par année. Au-delà, le pourcentage ne change pas :
# le résiduel baisse de 0,12 $ par kilomètre de plus, sur toute la durée.
STANDARD_KM = 24000
EXTRA_KM_RATE = 0.12
MAX_KM = 36000


def extra_km_reduction(km_per_year, term):
    """Baisse du résiduel, en dollars, pour un kilométrage de plus de 24 000 km par année."""
    extra = (km_per_year or STANDARD_KM) - STANDARD_KM
    return extra * (term / 12) * EXTRA_KM_RATE if extra > 0 else 0


def payment_count(term, periods_per_year=12):
    """Nombre de paiements : 12, 26 ou 52 par année ; une fraction de période compte pour un paiement."""
    if periods_per_year == 12:
        return term
    return math.ceil(term * periods_per_year / 12 - 1e-9)


def pmt_advance(amount, residual_value, annual_rate, term, periods_per_year=12):
    """Paiement avant taxes, versé en début de période (12, 26 ou 52 périodes par année)."""
    period_rate = annual_rate / 100 / periods_per_year
    count = payment_count(term, periods_per_year)
    if period_rate == 0:
        return (amount - residual_value) / count
    factor = (1 + period_rate) ** count
    pmt_arrears = (amount * period_rate * factor - residual_value * period_rate) / (factor - 1)
    return pmt_arrears / (1 + period_rate)


def lease_payment(cap_cost, residual_value, annual_rate, term, *, bonus_cash=0, cash_down=0,
                  trade_value=0, trade_owed=0, solde_reporte=0):
    # Solde reporté : une dette s'ajoute telle quelle, entrée en positif ou en négatif.
    # Comptant : remis taxes incluses, seule sa part avant taxes réduit le montant financé.
    # Prime après taxes : réduit le montant financé de sa pleine valeur.
    net_cap_cost = (cap_cost + abs(solde_reporte) + trade_owed - trade_value
                    - cash_down / (1 + TAUX_TAXE) - bonus_cash)
    monthly_before_tax = pmt_advance(net_cap_cost, residual_value, annual_rate, term)
    finance_charge = 0 if annual_rate == 0 else monthly_before_tax - (net_cap_cost - residual_value) / term

    # L'échange a déjà baissé le paiement, donc ses taxes : aucun autre crédit de taxe.
    # La part du paiement qui rembourse le montant dû sur l'échange n'est pas taxée.
    def taxable_for(periods_per_year, before_tax):
        if trade_owed > 0:
            before_tax = pmt_advance(net_cap_cost - trade_owed, residual_value, annual_rate, term, periods_per_year)
        return max(0, before_tax)

    def with_tax(periods_per_year):
        # Aux deux semaines et à la semaine : même calcul refait sur 26 ou 52 périodes par année.
        before_tax = pmt_advance(net_cap_cost, residual_value, annual_rate, term, periods_per_year)
        return max(0, before_tax + taxable_for(periods_per_year, before_tax) * TAUX_TAXE)

    taxable = taxable_for(12, monthly_before_tax)
    tps_on_payment = taxable * TPS
    tvq_on_payment = taxable * TVQ
    return {
        "biweekly_payment": with_tax(26),
        "weekly_payment": with_tax(52),
        "net_cap_cost": net_cap_cost,
        "monthly_before_tax": monthly_before_tax,
        "finance_charge": finance_charge,
        "tps_on_payment": tps_on_payment,
        "tvq_on_payment": tvq_on_payment,
        "monthly_payment": max(0, monthly_before_tax + tps_on_payment + tvq_on_payment),
    }
