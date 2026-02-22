/**
 * CalculatorInputs - Composant regroupant tous les inputs du calculateur
 * 
 * Inclut:
 * - Prix du véhicule
 * - Bonus cash
 * - Comptant
 * - Frais (dossier, pneus, RDPRM)
 * - Échange
 * - Sélection terme
 * - Fréquence de paiement
 * - Sélection option
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FinancingRates } from '../../hooks/useFinancingCalculation';

interface SelectedInventory {
  stock_no: string;
  year: number;
  brand: string;
  model: string;
  trim?: string;
}

interface Props {
  // Values
  vehiclePrice: string;
  customBonusCash: string;
  comptantTxInclus: string;
  fraisDossier: string;
  taxePneus: string;
  fraisRDPRM: string;
  prixEchange: string;
  montantDuEchange: string;
  selectedTerm: number;
  paymentFrequency: 'monthly' | 'biweekly' | 'weekly';
  selectedOption: '1' | '2' | null;
  
  // Setters
  onVehiclePriceChange: (value: string) => void;
  onBonusCashChange: (value: string) => void;
  onComptantChange: (value: string) => void;
  onFraisDossierChange: (value: string) => void;
  onTaxePneusChange: (value: string) => void;
  onFraisRDPRMChange: (value: string) => void;
  onPrixEchangeChange: (value: string) => void;
  onMontantDuEchangeChange: (value: string) => void;
  onTermChange: (term: number) => void;
  onFrequencyChange: (freq: 'monthly' | 'biweekly' | 'weekly') => void;
  onOptionChange: (option: '1' | '2' | null) => void;
  
  // Program data
  defaultBonusCash: number;
  consumerCash: number;
  option1Rates: FinancingRates;
  option2Rates: FinancingRates | null;
  currentOption1Rate: number;
  currentOption2Rate: number | null;
  
  // Inventory
  selectedInventory: SelectedInventory | null;
  onClearInventory: () => void;
  
  // Localization
  labels: {
    vehiclePrice: string;
    bonusCash: string;
    afterTax: string;
    cashDown: string;
    feesTitle: string;
    dossier: string;
    tires: string;
    rdprm: string;
    exchangeTitle: string;
    exchangeValue: string;
    exchangeOwed: string;
    reducesAmount: string;
    addedToFinancing: string;
    selectTerm: string;
    months: string;
    frequencyTitle: string;
    monthly: string;
    biweekly: string;
    weekly: string;
    chooseOption: string;
    option1: string;
    option2: string;
    notAvailable: string;
  };
  
  formatCurrency: (value: number) => string;
}

const AVAILABLE_TERMS = [36, 48, 60, 72, 84, 96];

export const CalculatorInputs: React.FC<Props> = ({
  vehiclePrice,
  customBonusCash,
  comptantTxInclus,
  fraisDossier,
  taxePneus,
  fraisRDPRM,
  prixEchange,
  montantDuEchange,
  selectedTerm,
  paymentFrequency,
  selectedOption,
  onVehiclePriceChange,
  onBonusCashChange,
  onComptantChange,
  onFraisDossierChange,
  onTaxePneusChange,
  onFraisRDPRMChange,
  onPrixEchangeChange,
  onMontantDuEchangeChange,
  onTermChange,
  onFrequencyChange,
  onOptionChange,
  defaultBonusCash,
  consumerCash,
  option1Rates,
  option2Rates,
  currentOption1Rate,
  currentOption2Rate,
  selectedInventory,
  onClearInventory,
  labels,
  formatCurrency,
}) => {
  return (
    <View style={styles.container} data-testid="calculator-inputs">
      {/* Selected inventory banner */}
      {selectedInventory && (
        <View style={styles.inventoryBanner}>
          <View style={styles.inventoryInfo}>
            <Ionicons name="car-sport" size={20} color="#4ECDC4" />
            <Text style={styles.inventoryText}>
              Stock #{selectedInventory.stock_no} - {selectedInventory.year} {selectedInventory.brand} {selectedInventory.model} {selectedInventory.trim || ''}
            </Text>
          </View>
          <TouchableOpacity onPress={onClearInventory}>
            <Ionicons name="close-circle" size={22} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      )}

      {/* Prix du véhicule */}
      <View style={styles.inputRow}>
        <Text style={styles.inputLabel}>{labels.vehiclePrice}</Text>
        <View style={styles.inputContainer}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.input}
            placeholder="55000"
            placeholderTextColor="#666"
            keyboardType="numeric"
            value={vehiclePrice}
            onChangeText={onVehiclePriceChange}
            data-testid="vehicle-price-input"
          />
        </View>
      </View>

      {/* Bonus Cash */}
      <View style={styles.inputRow}>
        <Text style={styles.inputLabel}>{labels.bonusCash} ({labels.afterTax})</Text>
        <View style={styles.inputContainer}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.input}
            placeholder={String(defaultBonusCash || 0)}
            placeholderTextColor="#666"
            keyboardType="numeric"
            value={customBonusCash}
            onChangeText={onBonusCashChange}
            data-testid="bonus-cash-input"
          />
        </View>
      </View>

      {/* Comptant */}
      <View style={styles.inputRow}>
        <Text style={styles.inputLabel}>{labels.cashDown}</Text>
        <View style={styles.inputContainer}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor="#666"
            keyboardType="numeric"
            value={comptantTxInclus}
            onChangeText={onComptantChange}
            data-testid="cash-down-input"
          />
        </View>
      </View>

      {/* Frais Section */}
      <View style={styles.feesSection}>
        <Text style={styles.sectionTitle}>{labels.feesTitle}</Text>
        <View style={styles.feesRow}>
          <View style={styles.feeField}>
            <Text style={styles.feeLabel}>{labels.dossier}</Text>
            <View style={styles.feeInputContainer}>
              <Text style={styles.feeSymbol}>$</Text>
              <TextInput
                style={styles.feeInput}
                placeholder="259.95"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
                value={fraisDossier}
                onChangeText={onFraisDossierChange}
              />
            </View>
          </View>
          <View style={styles.feeField}>
            <Text style={styles.feeLabel}>{labels.tires}</Text>
            <View style={styles.feeInputContainer}>
              <Text style={styles.feeSymbol}>$</Text>
              <TextInput
                style={styles.feeInput}
                placeholder="15"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
                value={taxePneus}
                onChangeText={onTaxePneusChange}
              />
            </View>
          </View>
          <View style={styles.feeField}>
            <Text style={styles.feeLabel}>{labels.rdprm}</Text>
            <View style={styles.feeInputContainer}>
              <Text style={styles.feeSymbol}>$</Text>
              <TextInput
                style={styles.feeInput}
                placeholder="100"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
                value={fraisRDPRM}
                onChangeText={onFraisRDPRMChange}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Échange Section */}
      <View style={styles.feesSection}>
        <Text style={styles.sectionTitle}>{labels.exchangeTitle}</Text>
        <View style={styles.exchangeRow}>
          <View style={styles.exchangeField}>
            <Text style={styles.feeLabel}>{labels.exchangeValue}</Text>
            <View style={styles.feeInputContainer}>
              <Text style={styles.feeSymbol}>$</Text>
              <TextInput
                style={styles.feeInput}
                placeholder="0"
                placeholderTextColor="#666"
                keyboardType="numeric"
                value={prixEchange}
                onChangeText={onPrixEchangeChange}
              />
            </View>
            <Text style={styles.feeNote}>{labels.reducesAmount}</Text>
          </View>
          <View style={styles.exchangeField}>
            <Text style={styles.feeLabel}>{labels.exchangeOwed}</Text>
            <View style={styles.feeInputContainer}>
              <Text style={styles.feeSymbol}>$</Text>
              <TextInput
                style={styles.feeInput}
                placeholder="0"
                placeholderTextColor="#666"
                keyboardType="numeric"
                value={montantDuEchange}
                onChangeText={onMontantDuEchangeChange}
              />
            </View>
            <Text style={styles.feeNote}>{labels.addedToFinancing}</Text>
          </View>
        </View>
      </View>

      {/* Terme Selection */}
      <View style={styles.termSection}>
        <Text style={styles.inputLabel}>{labels.selectTerm}</Text>
        <View style={styles.termButtons}>
          {AVAILABLE_TERMS.map(term => (
            <TouchableOpacity
              key={term}
              style={[styles.termButton, selectedTerm === term && styles.termButtonActive]}
              onPress={() => onTermChange(term)}
              data-testid={`term-${term}`}
            >
              <Text style={[styles.termButtonText, selectedTerm === term && styles.termButtonTextActive]}>
                {term} {labels.months}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Fréquence de paiement */}
      <View style={styles.termSection}>
        <Text style={styles.inputLabel}>{labels.frequencyTitle}</Text>
        <View style={styles.frequencyButtons}>
          {(['monthly', 'biweekly', 'weekly'] as const).map(freq => (
            <TouchableOpacity
              key={freq}
              style={[styles.frequencyButton, paymentFrequency === freq && styles.frequencyButtonActive]}
              onPress={() => onFrequencyChange(freq)}
              data-testid={`freq-${freq}`}
            >
              <Text style={[styles.frequencyButtonText, paymentFrequency === freq && styles.frequencyButtonTextActive]}>
                {freq === 'monthly' ? labels.monthly : freq === 'biweekly' ? labels.biweekly : labels.weekly}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Option Selection */}
      <View style={styles.termSection}>
        <Text style={styles.inputLabel}>{labels.chooseOption}</Text>
        <View style={styles.optionButtons}>
          <TouchableOpacity
            style={[styles.optionButton, styles.optionButton1, selectedOption === '1' && styles.optionButtonActive1]}
            onPress={() => onOptionChange(selectedOption === '1' ? null : '1')}
            data-testid="option-1-btn"
          >
            <Text style={[styles.optionButtonText, selectedOption === '1' && styles.optionButtonTextActive]}>
              {labels.option1}
            </Text>
            <Text style={[styles.optionButtonSubtext, selectedOption === '1' && styles.optionButtonTextActive]}>
              {consumerCash > 0 ? formatCurrency(consumerCash) : '$0'} + {currentOption1Rate}%
            </Text>
          </TouchableOpacity>

          {option2Rates ? (
            <TouchableOpacity
              style={[styles.optionButton, styles.optionButton2, selectedOption === '2' && styles.optionButtonActive2]}
              onPress={() => onOptionChange(selectedOption === '2' ? null : '2')}
              data-testid="option-2-btn"
            >
              <Text style={[styles.optionButtonText, selectedOption === '2' && styles.optionButtonTextActive]}>
                {labels.option2}
              </Text>
              <Text style={[styles.optionButtonSubtext, selectedOption === '2' && styles.optionButtonTextActive]}>
                $0 + {currentOption2Rate}%
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.optionButton, styles.optionButtonDisabled]}>
              <Text style={styles.optionButtonTextDisabled}>{labels.option2}</Text>
              <Text style={styles.optionButtonTextDisabled}>{labels.notAvailable}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
  inventoryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2d2d44',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  inventoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  inventoryText: {
    color: '#4ECDC4',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  inputRow: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#888',
    fontSize: 13,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d2d44',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  currencySymbol: {
    color: '#4ECDC4',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    color: '#fff',
    fontSize: 16,
  },
  feesSection: {
    backgroundColor: '#252542',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#4ECDC4',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  feesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  feeField: {
    flex: 1,
  },
  feeLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 6,
  },
  feeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  feeSymbol: {
    color: '#4ECDC4',
    fontSize: 14,
    marginRight: 6,
  },
  feeInput: {
    flex: 1,
    height: 40,
    color: '#fff',
    fontSize: 14,
  },
  feeNote: {
    color: '#666',
    fontSize: 10,
    marginTop: 4,
  },
  exchangeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  exchangeField: {
    flex: 1,
  },
  termSection: {
    marginBottom: 16,
  },
  termButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  termButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#2d2d44',
    minWidth: 60,
    alignItems: 'center',
  },
  termButtonActive: {
    backgroundColor: '#4ECDC4',
  },
  termButtonText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  termButtonTextActive: {
    color: '#1a1a2e',
    fontWeight: '600',
  },
  frequencyButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  frequencyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2d2d44',
    alignItems: 'center',
  },
  frequencyButtonActive: {
    backgroundColor: '#4ECDC4',
  },
  frequencyButtonText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  frequencyButtonTextActive: {
    color: '#1a1a2e',
    fontWeight: '600',
  },
  optionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  optionButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
  },
  optionButton1: {
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
    borderColor: 'rgba(78, 205, 196, 0.3)',
  },
  optionButton2: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderColor: 'rgba(255, 107, 107, 0.3)',
  },
  optionButtonActive1: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
  },
  optionButtonActive2: {
    backgroundColor: '#FF6B6B',
    borderColor: '#FF6B6B',
  },
  optionButtonDisabled: {
    backgroundColor: '#1a1a2e',
    borderColor: '#333',
    opacity: 0.5,
  },
  optionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  optionButtonTextActive: {
    color: '#1a1a2e',
  },
  optionButtonSubtext: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  optionButtonTextDisabled: {
    color: '#555',
    fontSize: 12,
  },
});

export default CalculatorInputs;
