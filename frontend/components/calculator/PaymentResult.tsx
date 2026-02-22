/**
 * PaymentResult - Composant d'affichage des résultats de paiement
 * 
 * Affiche:
 * - Paiement mensuel/bi-hebdo/hebdo
 * - Total financé
 * - Comparaison Option 1 vs Option 2
 * - Badge "Meilleure option"
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PaymentData {
  option1Monthly: number;
  option1Biweekly: number;
  option1Weekly: number;
  option1Total: number;
  option1Rate: number;
  option2Monthly: number | null;
  option2Biweekly: number | null;
  option2Weekly: number | null;
  option2Total: number | null;
  option2Rate: number | null;
  bestOption: '1' | '2' | null;
  savings: number;
}

interface Props {
  data: PaymentData;
  frequency: 'monthly' | 'biweekly' | 'weekly';
  selectedOption: '1' | '2' | null;
  onSelectOption: (option: '1' | '2' | null) => void;
  formatCurrency: (value: number) => string;
  labels: {
    option1Title: string;
    option2Title: string;
    monthlyLabel: string;
    biweeklyLabel: string;
    weeklyLabel: string;
    totalLabel: string;
    rateLabel: string;
    savingsLabel: string;
    bestOptionBadge: string;
  };
}

export const PaymentResult: React.FC<Props> = ({
  data,
  frequency,
  selectedOption,
  onSelectOption,
  formatCurrency,
  labels,
}) => {
  // Get payment based on frequency
  const getPayment = (option: '1' | '2'): number => {
    if (option === '1') {
      switch (frequency) {
        case 'biweekly': return data.option1Biweekly;
        case 'weekly': return data.option1Weekly;
        default: return data.option1Monthly;
      }
    } else {
      switch (frequency) {
        case 'biweekly': return data.option2Biweekly || 0;
        case 'weekly': return data.option2Weekly || 0;
        default: return data.option2Monthly || 0;
      }
    }
  };

  const frequencyLabel = frequency === 'biweekly' 
    ? labels.biweeklyLabel 
    : frequency === 'weekly' 
      ? labels.weeklyLabel 
      : labels.monthlyLabel;

  const renderOptionCard = (option: '1' | '2') => {
    const isOption1 = option === '1';
    const rate = isOption1 ? data.option1Rate : data.option2Rate;
    const total = isOption1 ? data.option1Total : data.option2Total;
    const payment = getPayment(option);
    const isBest = data.bestOption === option;
    const isSelected = selectedOption === option;
    const isDisabled = !isOption1 && data.option2Monthly === null;

    if (isDisabled) return null;

    return (
      <TouchableOpacity
        key={option}
        style={[
          styles.optionCard,
          isSelected && styles.optionCardSelected,
          isBest && styles.optionCardBest,
        ]}
        onPress={() => onSelectOption(isSelected ? null : option)}
        activeOpacity={0.7}
        data-testid={`payment-option-${option}`}
      >
        {isBest && (
          <View style={styles.bestBadge}>
            <Ionicons name="star" size={12} color="#fff" />
            <Text style={styles.bestBadgeText}>{labels.bestOptionBadge}</Text>
          </View>
        )}

        <Text style={styles.optionTitle}>
          {isOption1 ? labels.option1Title : labels.option2Title}
        </Text>

        <View style={styles.rateRow}>
          <Text style={styles.rateLabel}>{labels.rateLabel}</Text>
          <Text style={styles.rateValue}>{rate?.toFixed(2)}%</Text>
        </View>

        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>{frequencyLabel}</Text>
          <Text style={styles.paymentValue}>{formatCurrency(payment)}</Text>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{labels.totalLabel}</Text>
          <Text style={styles.totalValue}>{formatCurrency(total || 0)}</Text>
        </View>

        {isSelected && (
          <View style={styles.selectedIndicator}>
            <Ionicons name="checkmark-circle" size={24} color="#4ECDC4" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container} data-testid="payment-result">
      <View style={styles.optionsContainer}>
        {renderOptionCard('1')}
        {data.option2Monthly !== null && renderOptionCard('2')}
      </View>

      {data.savings > 0 && data.bestOption && (
        <View style={styles.savingsContainer}>
          <Ionicons name="trending-down" size={20} color="#4ECDC4" />
          <Text style={styles.savingsText}>
            {labels.savingsLabel}: {formatCurrency(data.savings)}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  optionsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  optionCard: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  optionCardSelected: {
    borderColor: '#4ECDC4',
  },
  optionCardBest: {
    backgroundColor: '#1a2a2e',
  },
  bestBadge: {
    position: 'absolute',
    top: -10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  bestBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  optionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rateLabel: {
    color: '#888',
    fontSize: 12,
  },
  rateValue: {
    color: '#4ECDC4',
    fontSize: 14,
    fontWeight: '600',
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  paymentLabel: {
    color: '#888',
    fontSize: 12,
  },
  paymentValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  totalLabel: {
    color: '#888',
    fontSize: 11,
  },
  totalValue: {
    color: '#aaa',
    fontSize: 12,
  },
  selectedIndicator: {
    position: 'absolute',
    bottom: 10,
    right: 10,
  },
  savingsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
    borderRadius: 8,
    gap: 8,
  },
  savingsText: {
    color: '#4ECDC4',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default PaymentResult;
