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
  Modal,
  Alert,
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
  bonus_cash: number;
  program_month: number;
  program_year: number;
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
  bonus_cash: number;
  brand: string;
  model: string;
  trim: string | null;
  year: number;
  comparisons: PaymentComparison[];
}

interface ProgramPeriod {
  month: number;
  year: number;
  count: number;
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
    option1Desc: 'Rabais + Taux',
    option2: 'Option 2',
    option2Desc: 'Taux réduits',
    monthly: 'Mensuel',
    total: 'Total',
    rate: 'Taux',
    rebate: 'Rabais',
    bonusCash: 'Bonus',
    bestOption: 'Meilleure',
    savings: 'Économies',
    managePrograms: 'Gérer',
    noPrograms: 'Aucun programme',
    loadingPrograms: 'Chargement...',
    enterValidPrice: 'Entrez un prix valide',
    noOption2: 'N/A',
    filterByYear: 'Année modèle',
    filterByBrand: 'Marque',
    all: 'Tous',
    selected: 'Sélectionné',
    importProgram: 'Importer',
    password: 'Mot de passe',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    importTitle: 'Importer un programme',
    periodLabel: 'Période du programme',
    beforeTax: 'avant taxes',
    afterTax: 'après taxes',
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
    option1Desc: 'Rebate + Rate',
    option2: 'Option 2',
    option2Desc: 'Reduced rates',
    monthly: 'Monthly',
    total: 'Total',
    rate: 'Rate',
    rebate: 'Rebate',
    bonusCash: 'Bonus',
    bestOption: 'Best',
    savings: 'Savings',
    managePrograms: 'Manage',
    noPrograms: 'No programs',
    loadingPrograms: 'Loading...',
    enterValidPrice: 'Enter a valid price',
    noOption2: 'N/A',
    filterByYear: 'Model year',
    filterByBrand: 'Brand',
    all: 'All',
    selected: 'Selected',
    importProgram: 'Import',
    password: 'Password',
    cancel: 'Cancel',
    confirm: 'Confirm',
    importTitle: 'Import program',
    periodLabel: 'Program period',
    beforeTax: 'before tax',
    afterTax: 'after tax',
  },
};

const monthNames = {
  fr: ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
  en: ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
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
  
  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPassword, setImportPassword] = useState('');
  
  // Current program period
  const [currentPeriod, setCurrentPeriod] = useState<{month: number, year: number} | null>(null);
  
  // Selected term for calculation
  const [selectedTerm, setSelectedTerm] = useState<number>(72);
  const availableTerms = [36, 48, 60, 72, 84, 96];
  
  // Custom bonus cash input (after taxes)
  const [customBonusCash, setCustomBonusCash] = useState('');
  
  // Local calculation result (calculated on frontend)
  const [localResult, setLocalResult] = useState<{
    option1Monthly: number;
    option1Total: number;
    option1Rate: number;
    option2Monthly: number | null;
    option2Total: number | null;
    option2Rate: number | null;
    bestOption: string | null;
    savings: number;
    principalOption1: number;
    principalOption2: number;
  } | null>(null);

  const loadPrograms = useCallback(async () => {
    try {
      await axios.post(`${API_URL}/api/seed`);
      const response = await axios.get(`${API_URL}/api/programs`);
      setPrograms(response.data);
      setFilteredPrograms(response.data);
      
      // Get current period from first program
      if (response.data.length > 0) {
        setCurrentPeriod({
          month: response.data[0].program_month,
          year: response.data[0].program_year
        });
      }
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
    setLocalResult(null);
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

  // Calculate monthly payment
  const calculateMonthlyPayment = (principal: number, annualRate: number, months: number): number => {
    if (principal <= 0 || months <= 0) return 0;
    if (annualRate === 0) return principal / months;
    const monthlyRate = annualRate / 100 / 12;
    return principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  };

  // Calculate financing for selected term
  const calculateForTerm = useCallback(() => {
    if (!selectedProgram || !vehiclePrice) {
      setLocalResult(null);
      return;
    }
    
    const price = parseFloat(vehiclePrice);
    if (isNaN(price) || price <= 0) {
      setLocalResult(null);
      return;
    }
    
    const bonusCash = parseFloat(customBonusCash) || selectedProgram.bonus_cash || 0;
    const consumerCash = selectedProgram.consumer_cash;
    
    // Option 1: Prix - Consumer Cash (avant taxes), puis taux Option 1
    const principalOption1 = price - consumerCash;
    const rate1 = getRateForTerm(selectedProgram.option1_rates, selectedTerm);
    const monthly1 = calculateMonthlyPayment(principalOption1, rate1, selectedTerm);
    const total1 = monthly1 * selectedTerm;
    
    // Option 2: Prix complet, taux réduits (si disponible)
    let monthly2: number | null = null;
    let total2: number | null = null;
    let rate2: number | null = null;
    let bestOption: string | null = null;
    let savings = 0;
    const principalOption2 = price;
    
    if (selectedProgram.option2_rates) {
      rate2 = getRateForTerm(selectedProgram.option2_rates, selectedTerm);
      monthly2 = calculateMonthlyPayment(principalOption2, rate2, selectedTerm);
      total2 = monthly2 * selectedTerm;
      
      // Comparer les totaux
      if (total1 < total2) {
        bestOption = '1';
        savings = total2 - total1;
      } else if (total2 < total1) {
        bestOption = '2';
        savings = total1 - total2;
      } else {
        bestOption = '1'; // Égalité, on préfère l'option avec rabais
        savings = 0;
      }
    }
    
    setLocalResult({
      option1Monthly: monthly1,
      option1Total: total1,
      option1Rate: rate1,
      option2Monthly: monthly2,
      option2Total: total2,
      option2Rate: rate2,
      bestOption,
      savings,
      principalOption1,
      principalOption2,
    });
  }, [selectedProgram, vehiclePrice, selectedTerm, customBonusCash]);

  // Recalculate when inputs change
  useEffect(() => {
    calculateForTerm();
  }, [calculateForTerm]);

  // Get unique years and brands for filters
  const years = [...new Set(programs.map(p => p.year))].sort((a, b) => b - a);
  const brands = [...new Set(programs.map(p => p.brand))].sort();

  // Get rate for a specific term
  const getRateForTerm = (rates: FinancingRates, term: number): number => {
    const rateMap: { [key: number]: number } = {
      36: rates.rate_36,
      48: rates.rate_48,
      60: rates.rate_60,
      72: rates.rate_72,
      84: rates.rate_84,
      96: rates.rate_96,
    };
    return rateMap[term] ?? 4.99;
  };

  // Handle year filter press
  const handleYearPress = (year: number | null) => {
    console.log('Year pressed:', year);
    setSelectedYear(year);
  };

  // Handle brand filter press
  const handleBrandPress = (brand: string | null) => {
    console.log('Brand pressed:', brand);
    setSelectedBrand(brand);
  };

  // Filter button component
  const FilterButton = ({ active, onPress, label }: { active: boolean; onPress: () => void; label: string }) => (
    <TouchableOpacity
      style={[styles.filterChip, active && styles.filterChipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

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
            <Text style={styles.headerSubtitle}>
              {currentPeriod && `${monthNames[lang][currentPeriod.month]} ${currentPeriod.year}`}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.langButton}
              onPress={() => setLang(lang === 'fr' ? 'en' : 'fr')}
            >
              <Text style={styles.langButtonText}>{lang === 'fr' ? 'EN' : 'FR'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.importButton}
              onPress={() => setShowImportModal(true)}
            >
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              <View style={styles.filterRow}>
                <FilterButton 
                  active={selectedYear === null} 
                  onPress={() => handleYearPress(null)} 
                  label={t.all} 
                />
                {years.map(year => (
                  <FilterButton 
                    key={year}
                    active={selectedYear === year} 
                    onPress={() => handleYearPress(year)} 
                    label={String(year)} 
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Brand Filter */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>{t.filterByBrand}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              <View style={styles.filterRow}>
                <FilterButton 
                  active={selectedBrand === null} 
                  onPress={() => handleBrandPress(null)} 
                  label={t.all} 
                />
                {brands.map(brand => (
                  <FilterButton 
                    key={brand}
                    active={selectedBrand === brand} 
                    onPress={() => handleBrandPress(brand)} 
                    label={brand} 
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Vehicle Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t.selectVehicle} ({filteredPrograms.length})
            </Text>
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
                    activeOpacity={0.7}
                  >
                    <View style={styles.programHeader}>
                      <Text style={styles.programBrand}>{program.brand}</Text>
                      <Text style={styles.programYear}>{program.year}</Text>
                    </View>
                    <Text style={styles.programModel}>{program.model}</Text>
                    {program.trim && (
                      <Text style={styles.programTrim} numberOfLines={2}>{program.trim}</Text>
                    )}
                    <View style={styles.badgeRow}>
                      {program.consumer_cash > 0 && (
                        <View style={styles.cashBadge}>
                          <Text style={styles.cashBadgeText}>
                            {formatCurrency(program.consumer_cash)}
                          </Text>
                        </View>
                      )}
                      {program.bonus_cash > 0 && (
                        <View style={styles.bonusBadge}>
                          <Text style={styles.bonusBadgeText}>
                            +{formatCurrency(program.bonus_cash)}
                          </Text>
                        </View>
                      )}
                    </View>
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
                  <View style={styles.selectedTitleContainer}>
                    <Text style={styles.selectedBrand}>{selectedProgram.brand}</Text>
                    <Text style={styles.selectedTitle}>
                      {selectedProgram.model} {selectedProgram.year}
                    </Text>
                    {selectedProgram.trim && (
                      <Text style={styles.selectedTrim}>{selectedProgram.trim}</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={clearSelection} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                    <Ionicons name="close-circle" size={28} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
                
                {/* Rates table by term */}
                <View style={styles.ratesTable}>
                  <View style={styles.ratesHeader}>
                    <Text style={styles.ratesHeaderCell}>{t.term}</Text>
                    <Text style={styles.ratesHeaderCell}>{t.option1}</Text>
                    {selectedProgram.option2_rates && (
                      <Text style={styles.ratesHeaderCell}>{t.option2}</Text>
                    )}
                  </View>
                  {availableTerms.map(term => (
                    <TouchableOpacity 
                      key={term} 
                      style={[
                        styles.ratesRow,
                        selectedTerm === term && styles.ratesRowSelected
                      ]}
                      onPress={() => setSelectedTerm(term)}
                    >
                      <Text style={[styles.ratesCell, selectedTerm === term && styles.ratesCellSelected]}>
                        {term} {t.months}
                      </Text>
                      <Text style={[styles.ratesCell, styles.ratesCellOption1, selectedTerm === term && styles.ratesCellSelected]}>
                        {getRateForTerm(selectedProgram.option1_rates, term)}%
                      </Text>
                      {selectedProgram.option2_rates && (
                        <Text style={[styles.ratesCell, styles.ratesCellOption2, selectedTerm === term && styles.ratesCellSelected]}>
                          {getRateForTerm(selectedProgram.option2_rates, term)}%
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Rebates summary */}
                <View style={styles.rebatesSummary}>
                  {selectedProgram.consumer_cash > 0 && (
                    <View style={styles.rebateItem}>
                      <Text style={styles.rebateLabel}>{t.rebate} ({t.beforeTax}):</Text>
                      <Text style={styles.rebateValue}>{formatCurrency(selectedProgram.consumer_cash)}</Text>
                    </View>
                  )}
                  {selectedProgram.bonus_cash > 0 && (
                    <View style={styles.rebateItem}>
                      <Ionicons name="gift-outline" size={14} color="#FFD700" />
                      <Text style={styles.rebateLabelBonus}>{t.bonusCash} ({t.afterTax}):</Text>
                      <Text style={styles.rebateValueBonus}>{formatCurrency(selectedProgram.bonus_cash)}</Text>
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
                activeOpacity={0.7}
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
                <View style={styles.summaryDetails}>
                  {results.consumer_cash > 0 && (
                    <Text style={styles.summaryCash}>
                      {t.rebate}: {formatCurrency(results.consumer_cash)} ({t.beforeTax})
                    </Text>
                  )}
                  {results.bonus_cash > 0 && (
                    <Text style={styles.summaryBonus}>
                      {t.bonusCash}: {formatCurrency(results.bonus_cash)} ({t.afterTax})
                    </Text>
                  )}
                </View>
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

        {/* Import Modal */}
        <Modal
          visible={showImportModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowImportModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t.importTitle}</Text>
              <Text style={styles.modalSubtitle}>
                Entrez le mot de passe administrateur
              </Text>
              <TextInput
                style={styles.passwordInput}
                placeholder={t.password}
                placeholderTextColor="#666"
                secureTextEntry
                value={importPassword}
                onChangeText={setImportPassword}
                autoCapitalize="none"
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => {
                    setShowImportModal(false);
                    setImportPassword('');
                  }}
                >
                  <Text style={styles.modalButtonCancelText}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonConfirm}
                  onPress={() => {
                    if (importPassword === 'Admin') {
                      setShowImportModal(false);
                      setImportPassword('');
                      router.push('/import');
                    } else {
                      if (Platform.OS === 'web') {
                        alert('Mot de passe incorrect');
                      } else {
                        Alert.alert('Erreur', 'Mot de passe incorrect');
                      }
                    }
                  }}
                >
                  <Text style={styles.modalButtonConfirmText}>{t.confirm}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
    color: '#4ECDC4',
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
  importButton: {
    padding: 6,
    backgroundColor: '#2d2d44',
    borderRadius: 8,
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
  filterScroll: {
    marginHorizontal: -16,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#2d2d44',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
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
    minWidth: 160,
    maxWidth: 180,
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
    fontSize: 10,
    color: '#aaa',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  cashBadge: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cashBadgeText: {
    fontSize: 9,
    color: '#fff',
    fontWeight: 'bold',
  },
  bonusBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  bonusBadgeText: {
    fontSize: 9,
    color: '#1a1a2e',
    fontWeight: 'bold',
  },
  option2Badge: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  option2BadgeText: {
    fontSize: 9,
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
  selectedTitleContainer: {
    flex: 1,
    marginRight: 10,
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
  selectedTrim: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 2,
  },
  optionsPreview: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
  },
  optionPreview: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 10,
  },
  optionPreviewDisabled: {
    opacity: 0.5,
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
  optionPreviewValueNA: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    marginTop: 4,
  },
  optionPreviewNote: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
  },
  bonusCashInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#3d3d54',
    gap: 6,
  },
  bonusCashText: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '500',
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
    textAlign: 'center',
  },
  summaryPrice: {
    fontSize: 24,
    color: '#4ECDC4',
    fontWeight: 'bold',
    marginTop: 4,
  },
  summaryDetails: {
    marginTop: 8,
  },
  summaryCash: {
    fontSize: 12,
    color: '#FF6B6B',
    textAlign: 'center',
  },
  summaryBonus: {
    fontSize: 12,
    color: '#FFD700',
    textAlign: 'center',
    marginTop: 2,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#2d2d44',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 20,
  },
  passwordInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonCancel: {
    flex: 1,
    backgroundColor: '#3d3d54',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  modalButtonCancelText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonConfirm: {
    flex: 1,
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  modalButtonConfirmText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '600',
  },
  // Rates table styles
  ratesTable: {
    marginTop: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    overflow: 'hidden',
  },
  ratesHeader: {
    flexDirection: 'row',
    backgroundColor: '#3d3d54',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  ratesHeaderCell: {
    flex: 1,
    fontSize: 11,
    color: '#aaa',
    fontWeight: '600',
    textAlign: 'center',
  },
  ratesRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  ratesRowSelected: {
    backgroundColor: '#4ECDC4',
  },
  ratesCell: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
    textAlign: 'center',
  },
  ratesCellSelected: {
    color: '#1a1a2e',
    fontWeight: 'bold',
  },
  ratesCellOption1: {
    color: '#FF6B6B',
  },
  ratesCellOption2: {
    color: '#4ECDC4',
  },
  rebatesSummary: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#3d3d54',
    gap: 6,
  },
  rebateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rebateLabel: {
    fontSize: 12,
    color: '#FF6B6B',
  },
  rebateValue: {
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: 'bold',
  },
  rebateLabelBonus: {
    fontSize: 12,
    color: '#FFD700',
  },
  rebateValueBonus: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: 'bold',
  },
});
