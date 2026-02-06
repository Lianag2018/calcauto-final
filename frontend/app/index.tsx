import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface FinancingTerm {
  term_months: number;
  interest_rate: number;
  rebate_amount: number;
}

interface VehicleProgram {
  id: string;
  brand: string;
  model: string;
  year: number;
  financing_terms: FinancingTerm[];
  consumer_cash: number;
  special_notes: string;
}

interface PaymentOption {
  term_months: number;
  option_a_rate: number;
  option_a_monthly: number;
  option_a_total: number;
  option_b_rate: number;
  option_b_monthly: number;
  option_b_total: number;
  option_b_down_payment: number;
  best_option: string;
  savings: number;
}

interface CalculationResult {
  vehicle_price: number;
  consumer_cash: number;
  payment_options: PaymentOption[];
}

// Language translations
const translations = {
  fr: {
    title: 'Calculateur de Financement',
    selectVehicle: 'Sélectionner un véhicule',
    orEnterPrice: 'ou entrer un prix',
    vehiclePrice: 'Prix du véhicule ($)',
    calculate: 'Calculer',
    results: 'Résultats',
    term: 'Terme',
    months: 'mois',
    optionA: 'Option A - Taux Réduit',
    optionB: 'Option B - 10% Comptant + 4.99%',
    monthly: 'Mensuel',
    total: 'Total',
    rate: 'Taux',
    downPayment: 'Comptant',
    bestOption: 'Meilleure Option',
    savings: 'Économies',
    consumerCash: 'Rabais Consommateur',
    managePrograms: 'Gérer Programmes',
    noPrograms: 'Aucun programme disponible',
    loadingPrograms: 'Chargement des programmes...',
    enterValidPrice: 'Entrez un prix valide',
    specialNotes: 'Notes',
    loading: 'Chargement...',
    refresh: 'Actualiser',
  },
  en: {
    title: 'Financing Calculator',
    selectVehicle: 'Select a vehicle',
    orEnterPrice: 'or enter a price',
    vehiclePrice: 'Vehicle Price ($)',
    calculate: 'Calculate',
    results: 'Results',
    term: 'Term',
    months: 'months',
    optionA: 'Option A - Reduced Rate',
    optionB: 'Option B - 10% Down + 4.99%',
    monthly: 'Monthly',
    total: 'Total',
    rate: 'Rate',
    downPayment: 'Down Payment',
    bestOption: 'Best Option',
    savings: 'Savings',
    consumerCash: 'Consumer Cash',
    managePrograms: 'Manage Programs',
    noPrograms: 'No programs available',
    loadingPrograms: 'Loading programs...',
    enterValidPrice: 'Enter a valid price',
    specialNotes: 'Notes',
    loading: 'Loading...',
    refresh: 'Refresh',
  },
};

export default function HomeScreen() {
  const router = useRouter();
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  const t = translations[lang];

  const [programs, setPrograms] = useState<VehicleProgram[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<VehicleProgram | null>(null);
  const [vehiclePrice, setVehiclePrice] = useState('');
  const [results, setResults] = useState<CalculationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [programsLoading, setProgramsLoading] = useState(true);

  const loadPrograms = useCallback(async () => {
    try {
      // First seed data if needed
      await axios.post(`${API_URL}/api/seed`);
      // Then fetch programs
      const response = await axios.get(`${API_URL}/api/programs`);
      setPrograms(response.data);
    } catch (error) {
      console.error('Error loading programs:', error);
    } finally {
      setProgramsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPrograms();
    setRefreshing(false);
  }, [loadPrograms]);

  const handleCalculate = async () => {
    const price = parseFloat(vehiclePrice);
    if (isNaN(price) || price <= 0) {
      return;
    }

    setLoading(true);
    try {
      const requestData: any = {
        vehicle_price: price,
        consumer_cash: selectedProgram?.consumer_cash || 0,
      };

      if (selectedProgram) {
        requestData.program_id = selectedProgram.id;
      } else {
        // Default terms for manual price entry
        requestData.custom_rates = [
          { term_months: 36, interest_rate: 0, rebate_amount: 0 },
          { term_months: 48, interest_rate: 0, rebate_amount: 0 },
          { term_months: 60, interest_rate: 0, rebate_amount: 0 },
          { term_months: 72, interest_rate: 1.99, rebate_amount: 0 },
          { term_months: 84, interest_rate: 2.99, rebate_amount: 0 },
          { term_months: 96, interest_rate: 4.99, rebate_amount: 0 },
        ];
      }

      const response = await axios.post(`${API_URL}/api/calculate`, requestData);
      setResults(response.data);
    } catch (error) {
      console.error('Error calculating:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectProgram = (program: VehicleProgram) => {
    setSelectedProgram(program);
    setResults(null);
  };

  const clearSelection = () => {
    setSelectedProgram(null);
    setResults(null);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t.title}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.langButton}
              onPress={() => setLang(lang === 'fr' ? 'en' : 'fr')}
            >
              <Text style={styles.langButtonText}>{lang === 'fr' ? 'EN' : 'FR'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.manageButton}
              onPress={() => router.push('/manage')}
            >
              <Ionicons name="settings-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4ECDC4"
            />
          }
          keyboardShouldPersistTaps="handled"
        >
          {/* Vehicle Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.selectVehicle}</Text>
            {programsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#4ECDC4" />
                <Text style={styles.loadingText}>{t.loadingPrograms}</Text>
              </View>
            ) : programs.length === 0 ? (
              <Text style={styles.noDataText}>{t.noPrograms}</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.programsScroll}
              >
                {programs.map((program) => (
                  <TouchableOpacity
                    key={program.id}
                    style={[
                      styles.programCard,
                      selectedProgram?.id === program.id && styles.programCardSelected,
                    ]}
                    onPress={() => selectProgram(program)}
                  >
                    <Text style={styles.programBrand}>{program.brand}</Text>
                    <Text style={styles.programModel}>{program.model}</Text>
                    <Text style={styles.programYear}>{program.year}</Text>
                    {program.consumer_cash > 0 && (
                      <Text style={styles.programCash}>
                        {formatCurrency(program.consumer_cash)}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {selectedProgram && (
              <View style={styles.selectedInfo}>
                <Text style={styles.selectedTitle}>
                  {selectedProgram.brand} {selectedProgram.model} {selectedProgram.year}
                </Text>
                {selectedProgram.special_notes && (
                  <Text style={styles.selectedNotes}>
                    {t.specialNotes}: {selectedProgram.special_notes}
                  </Text>
                )}
                <TouchableOpacity style={styles.clearButton} onPress={clearSelection}>
                  <Ionicons name="close-circle" size={20} color="#FF6B6B" />
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Price Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {selectedProgram ? t.vehiclePrice : t.orEnterPrice}
            </Text>
            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="50000"
                placeholderTextColor="#666"
                keyboardType="numeric"
                value={vehiclePrice}
                onChangeText={setVehiclePrice}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.calculateButton,
                (!vehiclePrice || loading) && styles.calculateButtonDisabled,
              ]}
              onPress={handleCalculate}
              disabled={!vehiclePrice || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="calculator" size={20} color="#fff" />
                  <Text style={styles.calculateButtonText}>{t.calculate}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Results */}
          {results && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t.results}</Text>
              
              <View style={styles.resultsSummary}>
                <Text style={styles.summaryText}>
                  {t.vehiclePrice}: {formatCurrency(results.vehicle_price)}
                </Text>
                {results.consumer_cash > 0 && (
                  <Text style={styles.summaryText}>
                    {t.consumerCash}: {formatCurrency(results.consumer_cash)}
                  </Text>
                )}
              </View>

              {results.payment_options.map((option, index) => (
                <View key={index} style={styles.resultCard}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultTerm}>
                      {option.term_months} {t.months}
                    </Text>
                    <View
                      style={[
                        styles.bestBadge,
                        option.best_option === 'A'
                          ? styles.bestBadgeA
                          : styles.bestBadgeB,
                      ]}
                    >
                      <Text style={styles.bestBadgeText}>
                        {t.bestOption}: {option.best_option === 'A' ? t.optionA.split(' - ')[1] : t.optionB.split(' - ')[1]}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.optionsContainer}>
                    {/* Option A */}
                    <View
                      style={[
                        styles.optionBox,
                        option.best_option === 'A' && styles.optionBoxBest,
                      ]}
                    >
                      <Text style={styles.optionTitle}>{t.optionA}</Text>
                      <View style={styles.optionRow}>
                        <Text style={styles.optionLabel}>{t.rate}:</Text>
                        <Text style={styles.optionValue}>{option.option_a_rate}%</Text>
                      </View>
                      <View style={styles.optionRow}>
                        <Text style={styles.optionLabel}>{t.monthly}:</Text>
                        <Text style={styles.optionValueLarge}>
                          {formatCurrency(option.option_a_monthly)}
                        </Text>
                      </View>
                      <View style={styles.optionRow}>
                        <Text style={styles.optionLabel}>{t.total}:</Text>
                        <Text style={styles.optionValue}>
                          {formatCurrency(option.option_a_total)}
                        </Text>
                      </View>
                    </View>

                    {/* Option B */}
                    <View
                      style={[
                        styles.optionBox,
                        option.best_option === 'B' && styles.optionBoxBest,
                      ]}
                    >
                      <Text style={styles.optionTitle}>{t.optionB}</Text>
                      <View style={styles.optionRow}>
                        <Text style={styles.optionLabel}>{t.downPayment}:</Text>
                        <Text style={styles.optionValue}>
                          {formatCurrency(option.option_b_down_payment)}
                        </Text>
                      </View>
                      <View style={styles.optionRow}>
                        <Text style={styles.optionLabel}>{t.rate}:</Text>
                        <Text style={styles.optionValue}>{option.option_b_rate}%</Text>
                      </View>
                      <View style={styles.optionRow}>
                        <Text style={styles.optionLabel}>{t.monthly}:</Text>
                        <Text style={styles.optionValueLarge}>
                          {formatCurrency(option.option_b_monthly)}
                        </Text>
                      </View>
                      <View style={styles.optionRow}>
                        <Text style={styles.optionLabel}>{t.total}:</Text>
                        <Text style={styles.optionValue}>
                          {formatCurrency(option.option_b_total)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.savingsContainer}>
                    <Ionicons name="trending-down" size={16} color="#4ECDC4" />
                    <Text style={styles.savingsText}>
                      {t.savings}: {formatCurrency(option.savings)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  langButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  langButtonText: {
    color: '#1a1a2e',
    fontWeight: 'bold',
    fontSize: 14,
  },
  manageButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    color: '#888',
    marginLeft: 8,
  },
  noDataText: {
    color: '#888',
    fontStyle: 'italic',
    padding: 16,
  },
  programsScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  programCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    minWidth: 140,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  programCardSelected: {
    borderColor: '#4ECDC4',
    backgroundColor: '#3d3d54',
  },
  programBrand: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  programModel: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
    marginTop: 4,
  },
  programYear: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  programCash: {
    fontSize: 13,
    color: '#FF6B6B',
    marginTop: 8,
    fontWeight: '600',
  },
  selectedInfo: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  selectedTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  selectedNotes: {
    fontSize: 13,
    color: '#4ECDC4',
    marginTop: 8,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  clearButtonText: {
    color: '#FF6B6B',
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  currencySymbol: {
    fontSize: 24,
    color: '#4ECDC4',
    fontWeight: 'bold',
  },
  priceInput: {
    flex: 1,
    fontSize: 24,
    color: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  calculateButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  calculateButtonDisabled: {
    opacity: 0.5,
  },
  calculateButtonText: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resultsSummary: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 4,
  },
  resultCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  resultTerm: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  bestBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  bestBadgeA: {
    backgroundColor: '#4ECDC4',
  },
  bestBadgeB: {
    backgroundColor: '#FF6B6B',
  },
  bestBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  optionsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  optionBox: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionBoxBest: {
    borderColor: '#4ECDC4',
  },
  optionTitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
    fontWeight: '600',
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  optionLabel: {
    fontSize: 12,
    color: '#888',
  },
  optionValue: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  optionValueLarge: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: 'bold',
  },
  savingsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#3d3d54',
  },
  savingsText: {
    color: '#4ECDC4',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
});
