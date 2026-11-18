"""
Calcul du paiement de location SCI (Québec), annuité en avance.
Échange, solde reporté, comptant et prime après taxes alignés sur TAQ Auto (17 novembre 2026).
Aucune dépendance : sert au serveur et aux tests.
"""

TPS = 0.05
TVQ = 0.09975
TAUX_TAXE = TPS + TVQ


def pmt_advance(amount, residual_value, annual_rate, term):
    """Paiement avant taxes, versé en début de période."""
    monthly_rate = annual_rate / 100 / 12
    if monthly_rate == 0:
        return (amount - residual_value) / term
    factor = (1 + monthly_rate) ** term
    pmt_arrears = (amount * monthly_rate * factor - residual_value * monthly_rate) / (factor - 1)
    return pmt_arrears / (1 + monthly_rate)


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
    taxable = monthly_before_tax
    if trade_owed > 0:
        taxable = pmt_advance(net_cap_cost - trade_owed, residual_value, annual_rate, term)
    taxable = max(0, taxable)
    tps_on_payment = taxable * TPS
    tvq_on_payment = taxable * TVQ
    return {
        "net_cap_cost": net_cap_cost,
        "monthly_before_tax": monthly_before_tax,
        "finance_charge": finance_charge,
        "tps_on_payment": tps_on_payment,
        "tvq_on_payment": tvq_on_payment,
        "monthly_payment": max(0, monthly_before_tax + tps_on_payment + tvq_on_payment),
    }
