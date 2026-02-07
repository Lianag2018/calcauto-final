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
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface FinancingRates {
  rate_36: number;
  rate_48: number;
  rate_60: number;
  rate_72: number;
  rate_84: number;
  rate_96: number;
}

interface VehicleProgram {
  id: string;
  brand: string;
  model: string;
  trim: string | null;
  year: number;
  consumer_cash: number;
  option1_rates: FinancingRates;
  option2_rates: FinancingRates | null;
}

interface PaymentComparison {
  term_months: number;
  option1_rate: number;
  option1_monthly: number;
  option1_total: number;
  option1_rebate: number;
  option2_rate: number | null;
  option2_monthly: number | null;
  option2_total: number | null;
  best_option: string | null;
  savings: number | null;
}

interface CalculationResult {
  vehicle_price: number;
  consumer_cash: number;
  brand: string;
  model: string;
  trim: string | null;
  year: number;
  comparisons: PaymentComparison[];
}

// Language translations
const translations = {
  fr: {
    title: 'Calculateur de Financement',
    subtitle: 'Comparez vos options',
    selectVehicle: 'Sélectionner un véhicule',
    enterPrice: 'Prix du véhicule ($)',
    calculate: 'Calculer',
    results: 'Résultats',
    term: 'Terme',
    months: 'mois',
    option1: 'Option 1',
    option1Desc: 'Rabais + Taux 4.99%',
    option2: 'Option 2',
    option2Desc: 'Taux subventionné',
    monthly: 'Mensuel',
    total: 'Total',
    rate: 'Taux',
    rebate: 'Rabais',
    bestOption: 'Meilleure',
    savings: 'Économies',
    managePrograms: 'Gérer',
    noPrograms: 'Aucun programme',
    loadingPrograms: 'Chargement...',
    enterValidPrice: 'Entrez un prix valide',
    noOption2: 'N/A',
    filterByYear: 'Filtrer par année',
    filterByBrand: 'Filtrer par marque',
    all: 'Tous',
    selected: 'Sélectionné',
  },
  en: {
    title: 'Financing Calculator',
    subtitle: 'Compare your options',
    selectVehicle: 'Select a vehicle',
    enterPrice: 'Vehicle Price ($)',
    calculate: 'Calculate',
    results: 'Results',
    term: 'Term',
    months: 'months',
    option1: 'Option 1',
    option1Desc: 'Rebate + 4.99% Rate',
    option2: 'Option 2',
    option2Desc: 'Subvented Rate',
    monthly: 'Monthly',
    total: 'Total',
    rate: 'Rate',
    rebate: 'Rebate',
    bestOption: 'Best',
    savings: 'Savings',
    managePrograms: 'Manage',
    noPrograms: 'No programs',
    loadingPrograms: 'Loading...',
    enterValidPrice: 'Enter a valid price',
    noOption2: 'N/A',
    filterByYear: 'Filter by year',
    filterByBrand: 'Filter by brand',
    all: 'All',
    selected: 'Selected',
  },
};

export default function HomeScreen() {
  const router = useRouter();
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  const t = translations[lang];

  const [programs, setPrograms] = useState<VehicleProgram[]>([]);
  const [filteredPrograms, setFilteredPrograms] = useState<VehicleProgram[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<VehicleProgram | null>(null);
  const [vehiclePrice, setVehiclePrice] = useState('');
  const [results, setResults] = useState<CalculationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [programsLoading, setProgramsLoading] = useState(true);
  
  // Filters
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

  const loadPrograms = useCallback(async () => {
    try {
      await axios.post(`${API_URL}/api/seed`);
      const response = await axios.get(`${API_URL}/api/programs`);
      setPrograms(response.data);
      setFilteredPrograms(response.data);
    } catch (error) {
      console.error('Error loading programs:', error);
    } finally {
      setProgramsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  // Filter programs when year or brand changes
  useEffect(() => {
    let filtered = [...programs];
    if (selectedYear) {
      filtered = filtered.filter(p => p.year === selectedYear);
    }
    if (selectedBrand) {
      filtered = filtered.filter(p => p.brand === selectedBrand);
    }
    setFilteredPrograms(filtered);
  }, [programs, selectedYear, selectedBrand]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPrograms();
    setRefreshing(false);
  }, [loadPrograms]);

  const handleCalculate = async () => {
    const price = parseFloat(vehiclePrice);
    if (isNaN(price) || price <= 0 || !selectedProgram) {
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/calculate`, {
        vehicle_price: price,
        program_id: selectedProgram.id,
      });
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
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCurrencyDecimal = (value: number) => {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  // Get unique years and brands for filters
  const years = [...new Set(programs.map(p => p.year))].sort((a, b) => b - a);
  const brands = [...new Set(programs.map(p => p.brand))].sort();

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{t.title}</Text>
            <Text style={styles.headerSubtitle}>{t.subtitle}</Text>
          </View>
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
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ECDC4" />
          }
          keyboardShouldPersistTaps="handled"
        >
          {/* Year Filter */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>{t.filterByYear}</Text>
            <View style={styles.filterRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.filterChip,
                  !selectedYear && styles.filterChipActive,
                  pressed && styles.filterChipPressed
                ]}
                onPress={() => {
                  console.log('Pressed: Tous (year)');
                  setSelectedYear(null);
                }}
              >
                <Text style={[styles.filterChipText, !selectedYear && styles.filterChipTextActive]}>
                  {t.all}
                </Text>
              </Pressable>
              {years.map(year => (
                <Pressable
                  key={year}
                  style={({ pressed }) => [
                    styles.filterChip,
                    selectedYear === year && styles.filterChipActive,
                    pressed && styles.filterChipPressed
                  ]}
                  onPress={() => {
                    console.log('Pressed year:', year);
                    setSelectedYear(year);
                  }}
                >
                  <Text style={[styles.filterChipText, selectedYear === year && styles.filterChipTextActive]}>
                    {year}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Brand Filter */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>{t.filterByBrand}</Text>
            <View style={styles.filterRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.filterChip,
                  !selectedBrand && styles.filterChipActive,
                  pressed && styles.filterChipPressed
                ]}
                onPress={() => {
                  console.log('Pressed: Tous (brand)');
                  setSelectedBrand(null);
                }}
              >
                <Text style={[styles.filterChipText, !selectedBrand && styles.filterChipTextActive]}>
                  {t.all}
                </Text>
              </Pressable>
              {brands.map(brand => (
                <Pressable
                  key={brand}
                  style={({ pressed }) => [
                    styles.filterChip,
                    selectedBrand === brand && styles.filterChipActive,
                    pressed && styles.filterChipPressed
                  ]}
                  onPress={() => {
                    console.log('Pressed brand:', brand);
                    setSelectedBrand(brand);
                  }}
                >
                  <Text style={[styles.filterChipText, selectedBrand === brand && styles.filterChipTextActive]}>
                    {brand}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Vehicle Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.selectVehicle}</Text>
            {programsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#4ECDC4" />
                <Text style={styles.loadingText}>{t.loadingPrograms}</Text>
              </View>
            ) : filteredPrograms.length === 0 ? (
              <Text style={styles.noDataText}>{t.noPrograms}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.programsScroll}>
                {filteredPrograms.map((program) => (
                  <TouchableOpacity
                    key={program.id}
                    style={[
                      styles.programCard,
                      selectedProgram?.id === program.id && styles.programCardSelected,
                    ]}
                    onPress={() => selectProgram(program)}
                  >
                    <View style={styles.programHeader}>
                      <Text style={styles.programBrand}>{program.brand}</Text>
                      <Text style={styles.programYear}>{program.year}</Text>
                    </View>
                    <Text style={styles.programModel}>{program.model}</Text>
                    {program.trim && (
                      <Text style={styles.programTrim}>{program.trim}</Text>
                    )}
                    {program.consumer_cash > 0 && (
                      <View style={styles.cashBadge}>
                        <Text style={styles.cashBadgeText}>
                          {formatCurrency(program.consumer_cash)}
                        </Text>
                      </View>
                    )}
                    {program.option2_rates && (
                      <View style={styles.option2Badge}>
                        <Text style={styles.option2BadgeText}>
                          {program.option2_rates.rate_36}%
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {selectedProgram && (
              <View style={styles.selectedInfo}>
                <View style={styles.selectedHeader}>
                  <View>
                    <Text style={styles.selectedBrand}>{selectedProgram.brand}</Text>
                    <Text style={styles.selectedTitle}>
                      {selectedProgram.model} {selectedProgram.trim || ''} {selectedProgram.year}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={clearSelection}>
                    <Ionicons name="close-circle" size={28} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
                <View style={styles.optionsPreview}>
                  <View style={styles.optionPreview}>
                    <Text style={styles.optionPreviewLabel}>{t.option1}</Text>
                    <Text style={styles.optionPreviewValue}>
                      {selectedProgram.consumer_cash > 0 
                        ? `${formatCurrency(selectedProgram.consumer_cash)} + 4.99%`
                        : '4.99%'}
                    </Text>
                  </View>
                  {selectedProgram.option2_rates && (
                    <View style={styles.optionPreview}>
                      <Text style={styles.optionPreviewLabel}>{t.option2}</Text>
                      <Text style={styles.optionPreviewValue}>
                        {selectedProgram.option2_rates.rate_36}% - {selectedProgram.option2_rates.rate_96}%
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Price Input */}
          {selectedProgram && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t.enterPrice}</Text>
              <View style={styles.inputContainer}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.priceInput}
                  placeholder="55000"
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
                  <ActivityIndicator size="small" color="#1a1a2e" />
                ) : (
                  <>
                    <Ionicons name="calculator" size={20} color="#1a1a2e" />
                    <Text style={styles.calculateButtonText}>{t.calculate}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Results */}
          {results && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t.results}</Text>
              
              <View style={styles.resultsSummary}>
                <Text style={styles.summaryTitle}>
                  {results.brand} {results.model} {results.trim || ''} {results.year}
                </Text>
                <Text style={styles.summaryPrice}>
                  {formatCurrency(results.vehicle_price)}
                </Text>
                {results.consumer_cash > 0 && (
                  <Text style={styles.summaryCash}>
                    {t.rebate}: {formatCurrency(results.consumer_cash)}
                  </Text>
                )}
              </View>

              {/* Legend */}
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#FF6B6B' }]} />
                  <Text style={styles.legendText}>{t.option1}: {t.option1Desc}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#4ECDC4' }]} />
                  <Text style={styles.legendText}>{t.option2}: {t.option2Desc}</Text>
                </View>
              </View>

              {results.comparisons.map((comp, index) => (
                <View key={index} style={styles.resultCard}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultTerm}>
                      {comp.term_months} {t.months}
                    </Text>
                    {comp.best_option && (
                      <View style={[
                        styles.bestBadge,
                        comp.best_option === '1' ? styles.bestBadgeOption1 : styles.bestBadgeOption2
                      ]}>
                        <Ionicons name="trophy" size={12} color="#1a1a2e" />
                        <Text style={styles.bestBadgeText}>
                          {t.bestOption}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.optionsGrid}>
                    {/* Option 1 */}
                    <View style={[
                      styles.optionCard,
                      styles.optionCard1,
                      comp.best_option === '1' && styles.optionCardBest
                    ]}>
                      <Text style={styles.optionCardTitle}>{t.option1}</Text>
                      <View style={styles.optionDetail}>
                        <Text style={styles.optionDetailLabel}>{t.rebate}:</Text>
                        <Text style={styles.optionDetailValue}>
                          {comp.option1_rebate > 0 ? formatCurrency(comp.option1_rebate) : '-'}
                        </Text>
                      </View>
                      <View style={styles.optionDetail}>
                        <Text style={styles.optionDetailLabel}>{t.rate}:</Text>
                        <Text style={styles.optionDetailValue}>{comp.option1_rate}%</Text>
                      </View>
                      <View style={styles.optionDetail}>
                        <Text style={styles.optionDetailLabel}>{t.monthly}:</Text>
                        <Text style={styles.optionMonthly}>{formatCurrencyDecimal(comp.option1_monthly)}</Text>
                      </View>
                      <View style={styles.optionDetail}>
                        <Text style={styles.optionDetailLabel}>{t.total}:</Text>
                        <Text style={styles.optionDetailValue}>{formatCurrency(comp.option1_total)}</Text>
                      </View>
                    </View>

                    {/* Option 2 */}
                    <View style={[
                      styles.optionCard,
                      styles.optionCard2,
                      comp.best_option === '2' && styles.optionCardBest
                    ]}>
                      <Text style={styles.optionCardTitle}>{t.option2}</Text>
                      {comp.option2_rate !== null ? (
                        <>
                          <View style={styles.optionDetail}>
                            <Text style={styles.optionDetailLabel}>{t.rebate}:</Text>
                            <Text style={styles.optionDetailValue}>-</Text>
                          </View>
                          <View style={styles.optionDetail}>
                            <Text style={styles.optionDetailLabel}>{t.rate}:</Text>
                            <Text style={styles.optionDetailValue}>{comp.option2_rate}%</Text>
                          </View>
                          <View style={styles.optionDetail}>
                            <Text style={styles.optionDetailLabel}>{t.monthly}:</Text>
                            <Text style={styles.optionMonthly}>{formatCurrencyDecimal(comp.option2_monthly!)}</Text>
                          </View>
                          <View style={styles.optionDetail}>
                            <Text style={styles.optionDetailLabel}>{t.total}:</Text>
                            <Text style={styles.optionDetailValue}>{formatCurrency(comp.option2_total!)}</Text>
                          </View>
                        </>
                      ) : (
                        <View style={styles.noOption}>
                          <Text style={styles.noOptionText}>{t.noOption2}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {comp.savings && comp.savings > 0 && (
                    <View style={styles.savingsRow}>
                      <Ionicons name="wallet-outline" size={16} color="#4ECDC4" />
                      <Text style={styles.savingsText}>
                        {t.savings}: {formatCurrency(comp.savings)}
                      </Text>
                    </View>
                  )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  langButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  langButtonText: {
    color: '#1a1a2e',
    fontWeight: 'bold',
    fontSize: 12,
  },
  manageButton: {
    padding: 6,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  filterSection: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 10,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#2d2d44',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
  },
  filterChipPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  filterChipText: {
    color: '#aaa',
    fontSize: 15,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#1a1a2e',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
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
    padding: 12,
    marginRight: 10,
    minWidth: 150,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  programCardSelected: {
    borderColor: '#4ECDC4',
    backgroundColor: '#3d3d54',
  },
  programHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  programBrand: {
    fontSize: 11,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  programYear: {
    fontSize: 11,
    color: '#888',
    fontWeight: '500',
  },
  programModel: {
    fontSize: 14,
    color: '#fff',
    fontWeight: 'bold',
    marginTop: 4,
  },
  programTrim: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 2,
  },
  cashBadge: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  cashBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: 'bold',
  },
  option2Badge: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  option2BadgeText: {
    fontSize: 10,
    color: '#1a1a2e',
    fontWeight: 'bold',
  },
  selectedInfo: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  selectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  selectedBrand: {
    fontSize: 12,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  selectedTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
    marginTop: 2,
  },
  optionsPreview: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 12,
  },
  optionPreview: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 10,
  },
  optionPreviewLabel: {
    fontSize: 11,
    color: '#888',
  },
  optionPreviewValue: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  currencySymbol: {
    fontSize: 22,
    color: '#4ECDC4',
    fontWeight: 'bold',
  },
  priceInput: {
    flex: 1,
    fontSize: 22,
    color: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  calculateButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  calculateButtonDisabled: {
    opacity: 0.5,
  },
  calculateButtonText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultsSummary: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  summaryPrice: {
    fontSize: 24,
    color: '#4ECDC4',
    fontWeight: 'bold',
    marginTop: 4,
  },
  summaryCash: {
    fontSize: 13,
    color: '#FF6B6B',
    marginTop: 4,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 12,
    paddingVertical: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    color: '#888',
  },
  resultCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultTerm: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  bestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  bestBadgeOption1: {
    backgroundColor: '#FF6B6B',
  },
  bestBadgeOption2: {
    backgroundColor: '#4ECDC4',
  },
  bestBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  optionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  optionCard: {
    flex: 1,
    borderRadius: 8,
    padding: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCard1: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
  },
  optionCard2: {
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
  },
  optionCardBest: {
    borderColor: '#4ECDC4',
  },
  optionCardTitle: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    marginBottom: 8,
  },
  optionDetail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  optionDetailLabel: {
    fontSize: 11,
    color: '#888',
  },
  optionDetailValue: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '500',
  },
  optionMonthly: {
    fontSize: 13,
    color: '#4ECDC4',
    fontWeight: 'bold',
  },
  noOption: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  noOptionText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#3d3d54',
    gap: 6,
  },
  savingsText: {
    fontSize: 13,
    color: '#4ECDC4',
    fontWeight: '600',
  },
});
