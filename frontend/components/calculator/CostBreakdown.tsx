/**
 * CostBreakdown - Composant de ventilation des coûts
 * 
 * Affiche:
 * - Prix véhicule
 * - Frais (dossier, pneus, RDPRM)
 * - Taxes
 * - Échange
 * - Comptant
 * - Total financé
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CostBreakdownData {
  vehiclePrice: number;
  consumerCash: number;
  bonusCash: number;
  fraisTaxables: number;
  taxes: number;
  echangeNet: number;
  comptant: number;
  principalOption1: number;
  principalOption2: number;
}

interface Props {
  data: CostBreakdownData;
  selectedOption: '1' | '2' | null;
  formatCurrency: (value: number) => string;
  labels: {
    vehiclePrice: string;
    consumerCash: string;
    bonusCash: string;
    fees: string;
    taxes: string;
    tradeIn: string;
    cashDown: string;
    totalFinanced: string;
    breakdown: string;
  };
}

export const CostBreakdown: React.FC<Props> = ({
  data,
  selectedOption,
  formatCurrency,
  labels,
}) => {
  const principal = selectedOption === '2' ? data.principalOption2 : data.principalOption1;
  const showConsumerCash = selectedOption !== '2' && data.consumerCash > 0;
  const showBonusCash = selectedOption !== '2' && data.bonusCash > 0;

  const rows: { label: string; value: number; isNegative?: boolean; highlight?: boolean }[] = [
    { label: labels.vehiclePrice, value: data.vehiclePrice },
  ];

  if (showConsumerCash) {
    rows.push({ label: labels.consumerCash, value: -data.consumerCash, isNegative: true });
  }

  if (showBonusCash) {
    rows.push({ label: labels.bonusCash, value: -data.bonusCash, isNegative: true });
  }

  rows.push({ label: labels.fees, value: data.fraisTaxables });
  rows.push({ label: labels.taxes, value: data.taxes });

  if (data.echangeNet !== 0) {
    rows.push({ 
      label: labels.tradeIn, 
      value: -data.echangeNet, 
      isNegative: data.echangeNet > 0 
    });
  }

  if (data.comptant > 0) {
    rows.push({ label: labels.cashDown, value: -data.comptant, isNegative: true });
  }

  return (
    <View style={styles.container} data-testid="cost-breakdown">
      <View style={styles.header}>
        <Ionicons name="receipt-outline" size={18} color="#4ECDC4" />
        <Text style={styles.title}>{labels.breakdown}</Text>
      </View>

      <View style={styles.rows}>
        {rows.map((row, index) => (
          <View key={index} style={styles.row}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={[
              styles.rowValue,
              row.isNegative && styles.rowValueNegative
            ]}>
              {row.isNegative ? '-' : ''}{formatCurrency(Math.abs(row.value))}
            </Text>
          </View>
        ))}

        <View style={styles.divider} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{labels.totalFinanced}</Text>
          <Text style={styles.totalValue}>{formatCurrency(Math.max(0, principal))}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  rows: {},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rowLabel: {
    color: '#888',
    fontSize: 13,
  },
  rowValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  rowValueNegative: {
    color: '#4ECDC4',
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  totalLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  totalValue: {
    color: '#4ECDC4',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default CostBreakdown;
