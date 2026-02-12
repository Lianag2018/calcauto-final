import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Animated,
  Dimensions,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// ============ Loading Animation Component ============
const LoadingBorderAnimation = ({ loading }: { loading: boolean }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: false,
        })
      ).start();
    } else {
      animatedValue.setValue(0);
    }
  }, [loading, animatedValue]);

  if (!loading) return null;

  // Calculate the perimeter for the light to travel
  const perimeter = 2 * (SCREEN_WIDTH + SCREEN_HEIGHT);
  
  // Interpolate position around the border
  const lightPosition = animatedValue.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, SCREEN_WIDTH, SCREEN_WIDTH + SCREEN_HEIGHT, 2 * SCREEN_WIDTH + SCREEN_HEIGHT, perimeter],
  });

  // Calculate X and Y based on position around rectangle
  const translateX = animatedValue.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, SCREEN_WIDTH - 20, SCREEN_WIDTH - 20, 0, 0],
  });
  
  const translateY = animatedValue.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, 0, SCREEN_HEIGHT - 20, SCREEN_HEIGHT - 20, 0],
  });

  return (
    <View style={loadingStyles.container}>
      {/* Border glow effect */}
      <View style={loadingStyles.borderContainer}>
        {/* Top border */}
        <Animated.View 
          style={[
            loadingStyles.topBorder,
            {
              opacity: animatedValue.interpolate({
                inputRange: [0, 0.125, 0.25, 1],
                outputRange: [1, 0.5, 0.2, 0.2],
              }),
            }
          ]} 
        />
        {/* Right border */}
        <Animated.View 
          style={[
            loadingStyles.rightBorder,
            {
              opacity: animatedValue.interpolate({
                inputRange: [0, 0.25, 0.375, 0.5, 1],
                outputRange: [0.2, 1, 0.5, 0.2, 0.2],
              }),
            }
          ]} 
        />
        {/* Bottom border */}
        <Animated.View 
          style={[
            loadingStyles.bottomBorder,
            {
              opacity: animatedValue.interpolate({
                inputRange: [0, 0.5, 0.625, 0.75, 1],
                outputRange: [0.2, 1, 0.5, 0.2, 0.2],
              }),
            }
          ]} 
        />
        {/* Left border */}
        <Animated.View 
          style={[
            loadingStyles.leftBorder,
            {
              opacity: animatedValue.interpolate({
                inputRange: [0, 0.75, 0.875, 1],
                outputRange: [0.2, 1, 0.5, 1],
              }),
            }
          ]} 
        />
      </View>
      
      {/* Moving light dot */}
      <Animated.View
        style={[
          loadingStyles.lightDot,
          {
            transform: [
              { translateX },
              { translateY },
            ],
          },
        ]}
      />
      
      {/* Center loading indicator */}
      <View style={loadingStyles.centerContainer}>
        <View style={loadingStyles.logoContainer}>
          <Text style={loadingStyles.logoText}>CalcAuto</Text>
          <Text style={loadingStyles.logoSubText}>AiPro</Text>
        </View>
        <ActivityIndicator size="large" color="#4ECDC4" style={loadingStyles.spinner} />
        <Text style={loadingStyles.loadingText}>Chargement des programmes...</Text>
      </View>
    </View>
  );
};

const loadingStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a2e',
    zIndex: 1000,
  },
  borderContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  topBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#4ECDC4',
    shadowColor: '#4ECDC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
  rightBorder: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#4ECDC4',
    shadowColor: '#4ECDC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
  bottomBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#4ECDC4',
    shadowColor: '#4ECDC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
  leftBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#4ECDC4',
    shadowColor: '#4ECDC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
  lightDot: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4ECDC4',
    shadowColor: '#4ECDC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  logoSubText: {
    fontSize: 24,
    fontWeight: '300',
    color: '#4ECDC4',
    marginTop: -5,
  },
  spinner: {
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#888',
  },
});

// ============ Interfaces ============

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
    title: 'CalcAuto AiPro',
    subtitle: 'Calculateur de financement automobile',
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
    title: 'CalcAuto AiPro',
    subtitle: 'Vehicle financing calculator',
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
  
  // Email modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [clientEmail, setClientEmail] = useState('');
  const [clientName, setClientName] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  
  // Current program period
  const [currentPeriod, setCurrentPeriod] = useState<{month: number, year: number} | null>(null);
  
  // Selected term for calculation
  const [selectedTerm, setSelectedTerm] = useState<number>(72);
  const availableTerms = [36, 48, 60, 72, 84, 96];
  
  // Payment frequency
  const [paymentFrequency, setPaymentFrequency] = useState<'monthly' | 'biweekly' | 'weekly'>('monthly');
  const frequencyLabels = {
    monthly: { fr: 'Mensuel', en: 'Monthly', factor: 1 },
    biweekly: { fr: 'Aux 2 sem.', en: 'Bi-weekly', factor: 12/26 },
    weekly: { fr: 'Hebdo', en: 'Weekly', factor: 12/52 },
  };
  
  // Selected option (1 or 2) - null means show comparison
  const [selectedOption, setSelectedOption] = useState<'1' | '2' | null>(null);
  
  // Custom bonus cash input (after taxes)
  const [customBonusCash, setCustomBonusCash] = useState('');
  
  // Frais additionnels (taxables)
  const [fraisDossier, setFraisDossier] = useState('259.95');
  const [taxePneus, setTaxePneus] = useState('15');
  const [fraisRDPRM, setFraisRDPRM] = useState('100');
  
  // Échange
  const [prixEchange, setPrixEchange] = useState('');
  const [montantDuEchange, setMontantDuEchange] = useState('');
  
  // Taux de taxe (TPS + TVQ Québec)
  const tauxTaxe = 0.14975; // 5% TPS + 9.975% TVQ
  
  // Local calculation result (calculated on frontend)
  const [localResult, setLocalResult] = useState<{
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
    bestOption: string | null;
    savings: number;
    principalOption1: number;
    principalOption2: number;
    fraisTaxables: number;
    taxes: number;
    echangeNet: number;
  } | null>(null);

  const loadPrograms = useCallback(async () => {
    const startTime = Date.now();
    const MIN_LOADING_TIME = 2000; // Minimum 2 seconds for animation
    
    try {
      await axios.post(`${API_URL}/api/seed`);
      const response = await axios.get(`${API_URL}/api/programs`, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      setPrograms(response.data);
      setFilteredPrograms(response.data);
      
      // Get current period from first program
      if (response.data.length > 0) {
        setCurrentPeriod({
          month: response.data[0].program_month,
          year: response.data[0].program_year
        });
      }
      
      // Ensure minimum loading time for animation effect
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_LOADING_TIME) {
        await new Promise(resolve => setTimeout(resolve, MIN_LOADING_TIME - elapsed));
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
    
    // Frais taxables
    const dossier = parseFloat(fraisDossier) || 0;
    const pneus = parseFloat(taxePneus) || 0;
    const rdprm = parseFloat(fraisRDPRM) || 0;
    const fraisTaxables = dossier + pneus + rdprm;
    
    // Échange
    const valeurEchange = parseFloat(prixEchange) || 0;
    const detteSurEchange = parseFloat(montantDuEchange) || 0;
    const echangeNet = valeurEchange - detteSurEchange; // Positif = réduction, négatif = ajout
    
    // Calcul du montant taxable (prix + frais - échange)
    // Note: Consumer Cash est avant taxes, donc réduit le montant taxable
    
    // Option 1: Prix - Consumer Cash - valeur échange + frais + dette échange + taxes
    const montantAvantTaxesO1 = price - consumerCash - valeurEchange + fraisTaxables;
    const taxesO1 = montantAvantTaxesO1 * tauxTaxe;
    const principalOption1 = montantAvantTaxesO1 + taxesO1 + detteSurEchange;
    const rate1 = getRateForTerm(selectedProgram.option1_rates, selectedTerm);
    const monthly1 = calculateMonthlyPayment(principalOption1, rate1, selectedTerm);
    const biweekly1 = monthly1 * 12 / 26; // 26 paiements par an
    const weekly1 = monthly1 * 12 / 52; // 52 paiements par an
    const total1 = monthly1 * selectedTerm;
    
    // Option 2: Prix complet - valeur échange + frais + dette échange + taxes (pas de Consumer Cash)
    let monthly2: number | null = null;
    let biweekly2: number | null = null;
    let weekly2: number | null = null;
    let total2: number | null = null;
    let rate2: number | null = null;
    let bestOption: string | null = null;
    let savings = 0;
    
    const montantAvantTaxesO2 = price - valeurEchange + fraisTaxables;
    const taxesO2 = montantAvantTaxesO2 * tauxTaxe;
    const principalOption2 = montantAvantTaxesO2 + taxesO2 + detteSurEchange;
    
    if (selectedProgram.option2_rates) {
      rate2 = getRateForTerm(selectedProgram.option2_rates, selectedTerm);
      monthly2 = calculateMonthlyPayment(principalOption2, rate2, selectedTerm);
      biweekly2 = monthly2 * 12 / 26;
      weekly2 = monthly2 * 12 / 52;
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
      option1Biweekly: biweekly1,
      option1Weekly: weekly1,
      option1Total: total1,
      option1Rate: rate1,
      option2Monthly: monthly2,
      option2Biweekly: biweekly2,
      option2Weekly: weekly2,
      option2Total: total2,
      option2Rate: rate2,
      bestOption,
      savings,
      principalOption1,
      principalOption2,
      fraisTaxables,
      taxes: taxesO1,
      echangeNet,
    });
  }, [selectedProgram, vehiclePrice, selectedTerm, customBonusCash, fraisDossier, taxePneus, fraisRDPRM, prixEchange, montantDuEchange, tauxTaxe]);

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
      {/* Loading Animation */}
      <LoadingBorderAnimation loading={programsLoading} />
      
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{t.title}</Text>
            <Text style={styles.headerSubtitle}>
              {currentPeriod ? `${monthNames[lang][currentPeriod.month]} ${currentPeriod.year}` : ''}
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

          {/* Price Input and Calculation */}
          {selectedProgram && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t.enterPrice}</Text>
              
              {/* Prix du véhicule */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Prix du véhicule</Text>
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
              </View>
              
              {/* Bonus Cash optionnel */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t.bonusCash} ({t.afterTax})</Text>
                <View style={styles.inputContainer}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <TextInput
                    style={styles.priceInput}
                    placeholder={String(selectedProgram.bonus_cash || 0)}
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                    value={customBonusCash}
                    onChangeText={setCustomBonusCash}
                  />
                </View>
              </View>

              {/* Frais additionnels (taxables) */}
              <View style={styles.feesSection}>
                <Text style={styles.feesSectionTitle}>Frais additionnels (taxables)</Text>
                <View style={styles.feesRow}>
                  <View style={styles.feeField}>
                    <Text style={styles.feeLabel}>Frais dossier</Text>
                    <View style={styles.feeInputContainer}>
                      <Text style={styles.feeSymbol}>$</Text>
                      <TextInput
                        style={styles.feeInput}
                        placeholder="259.95"
                        placeholderTextColor="#666"
                        keyboardType="decimal-pad"
                        value={fraisDossier}
                        onChangeText={setFraisDossier}
                      />
                    </View>
                  </View>
                  <View style={styles.feeField}>
                    <Text style={styles.feeLabel}>Taxe pneus</Text>
                    <View style={styles.feeInputContainer}>
                      <Text style={styles.feeSymbol}>$</Text>
                      <TextInput
                        style={styles.feeInput}
                        placeholder="15"
                        placeholderTextColor="#666"
                        keyboardType="decimal-pad"
                        value={taxePneus}
                        onChangeText={setTaxePneus}
                      />
                    </View>
                  </View>
                  <View style={styles.feeField}>
                    <Text style={styles.feeLabel}>Frais RDPRM</Text>
                    <View style={styles.feeInputContainer}>
                      <Text style={styles.feeSymbol}>$</Text>
                      <TextInput
                        style={styles.feeInput}
                        placeholder="100"
                        placeholderTextColor="#666"
                        keyboardType="decimal-pad"
                        value={fraisRDPRM}
                        onChangeText={setFraisRDPRM}
                      />
                    </View>
                  </View>
                </View>
              </View>

              {/* Échange */}
              <View style={styles.feesSection}>
                <Text style={styles.feesSectionTitle}>Échange (optionnel)</Text>
                <View style={styles.exchangeRow}>
                  <View style={styles.exchangeField}>
                    <Text style={styles.feeLabel}>Valeur de l'échange</Text>
                    <View style={styles.feeInputContainer}>
                      <Text style={styles.feeSymbol}>$</Text>
                      <TextInput
                        style={styles.feeInput}
                        placeholder="0"
                        placeholderTextColor="#666"
                        keyboardType="numeric"
                        value={prixEchange}
                        onChangeText={setPrixEchange}
                      />
                    </View>
                    <Text style={styles.feeNote}>Réduit le montant</Text>
                  </View>
                  <View style={styles.exchangeField}>
                    <Text style={styles.feeLabel}>Montant dû</Text>
                    <View style={styles.feeInputContainer}>
                      <Text style={styles.feeSymbol}>$</Text>
                      <TextInput
                        style={styles.feeInput}
                        placeholder="0"
                        placeholderTextColor="#666"
                        keyboardType="numeric"
                        value={montantDuEchange}
                        onChangeText={setMontantDuEchange}
                      />
                    </View>
                    <Text style={styles.feeNote}>Ajouté au financement</Text>
                  </View>
                </View>
              </View>

              {/* Sélection du terme */}
              <View style={styles.termSection}>
                <Text style={styles.inputLabel}>Sélectionner le terme</Text>
                <View style={styles.termButtons}>
                  {availableTerms.map(term => (
                    <TouchableOpacity
                      key={term}
                      style={[
                        styles.termButton,
                        selectedTerm === term && styles.termButtonActive
                      ]}
                      onPress={() => setSelectedTerm(term)}
                    >
                      <Text style={[
                        styles.termButtonText,
                        selectedTerm === term && styles.termButtonTextActive
                      ]}>
                        {term} {t.months}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Fréquence de paiement */}
              <View style={styles.termSection}>
                <Text style={styles.inputLabel}>Fréquence de paiement</Text>
                <View style={styles.frequencyButtons}>
                  <TouchableOpacity
                    style={[
                      styles.frequencyButton,
                      paymentFrequency === 'monthly' && styles.frequencyButtonActive
                    ]}
                    onPress={() => setPaymentFrequency('monthly')}
                  >
                    <Text style={[
                      styles.frequencyButtonText,
                      paymentFrequency === 'monthly' && styles.frequencyButtonTextActive
                    ]}>
                      {frequencyLabels.monthly[lang]}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.frequencyButton,
                      paymentFrequency === 'biweekly' && styles.frequencyButtonActive
                    ]}
                    onPress={() => setPaymentFrequency('biweekly')}
                  >
                    <Text style={[
                      styles.frequencyButtonText,
                      paymentFrequency === 'biweekly' && styles.frequencyButtonTextActive
                    ]}>
                      {frequencyLabels.biweekly[lang]}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.frequencyButton,
                      paymentFrequency === 'weekly' && styles.frequencyButtonActive
                    ]}
                    onPress={() => setPaymentFrequency('weekly')}
                  >
                    <Text style={[
                      styles.frequencyButtonText,
                      paymentFrequency === 'weekly' && styles.frequencyButtonTextActive
                    ]}>
                      {frequencyLabels.weekly[lang]}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sélection de l'option */}
              <View style={styles.termSection}>
                <Text style={styles.inputLabel}>Choisir l'option de financement</Text>
                <View style={styles.optionButtons}>
                  <TouchableOpacity
                    style={[
                      styles.optionButton,
                      styles.optionButton1,
                      selectedOption === '1' && styles.optionButtonActive1
                    ]}
                    onPress={() => setSelectedOption(selectedOption === '1' ? null : '1')}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      selectedOption === '1' && styles.optionButtonTextActive
                    ]}>
                      {t.option1}
                    </Text>
                    <Text style={[
                      styles.optionButtonSubtext,
                      selectedOption === '1' && styles.optionButtonTextActive
                    ]}>
                      {selectedProgram.consumer_cash > 0 ? formatCurrency(selectedProgram.consumer_cash) : '$0'} + {localResult?.option1Rate || getRateForTerm(selectedProgram.option1_rates, selectedTerm)}%
                    </Text>
                  </TouchableOpacity>
                  
                  {selectedProgram.option2_rates ? (
                    <TouchableOpacity
                      style={[
                        styles.optionButton,
                        styles.optionButton2,
                        selectedOption === '2' && styles.optionButtonActive2
                      ]}
                      onPress={() => setSelectedOption(selectedOption === '2' ? null : '2')}
                    >
                      <Text style={[
                        styles.optionButtonText,
                        selectedOption === '2' && styles.optionButtonTextActive
                      ]}>
                        {t.option2}
                      </Text>
                      <Text style={[
                        styles.optionButtonSubtext,
                        selectedOption === '2' && styles.optionButtonTextActive
                      ]}>
                        $0 + {localResult?.option2Rate || getRateForTerm(selectedProgram.option2_rates, selectedTerm)}%
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.optionButton, styles.optionButtonDisabled]}>
                      <Text style={styles.optionButtonTextDisabled}>{t.option2}</Text>
                      <Text style={styles.optionButtonTextDisabled}>{t.noOption2}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Results - Real-time calculation */}
          {selectedProgram && localResult && vehiclePrice && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t.results} - {selectedTerm} {t.months}
              </Text>
              
              {/* Summary */}
              <View style={styles.resultsSummary}>
                <Text style={styles.summaryTitle}>
                  {selectedProgram.brand} {selectedProgram.model} {selectedProgram.trim || ''} {selectedProgram.year}
                </Text>
                <Text style={styles.summaryPrice}>
                  {formatCurrency(parseFloat(vehiclePrice))}
                </Text>
              </View>

              {/* Best Option Banner */}
              {localResult.bestOption && (
                <View style={[
                  styles.bestOptionBanner,
                  localResult.bestOption === '1' ? styles.bestOptionBanner1 : styles.bestOptionBanner2
                ]}>
                  <Ionicons name="trophy" size={20} color="#1a1a2e" />
                  <Text style={styles.bestOptionText}>
                    {localResult.bestOption === '1' ? t.option1 : t.option2} = Meilleur choix!
                  </Text>
                  {localResult.savings > 0 && (
                    <Text style={styles.bestOptionSavings}>
                      Économies: {formatCurrency(localResult.savings)}
                    </Text>
                  )}
                </View>
              )}

              {/* Options comparison */}
              <View style={styles.optionsGrid}>
                {/* Option 1 */}
                <View style={[
                  styles.optionCard,
                  styles.optionCard1,
                  localResult.bestOption === '1' && styles.optionCardBest
                ]}>
                  <View style={styles.optionHeader}>
                    <Text style={styles.optionCardTitle}>{t.option1}</Text>
                    {localResult.bestOption === '1' && (
                      <Ionicons name="checkmark-circle" size={18} color="#4ECDC4" />
                    )}
                  </View>
                  <Text style={styles.optionSubtitle}>{t.option1Desc}</Text>
                  
                  {selectedProgram.consumer_cash > 0 && (
                    <View style={styles.optionDetail}>
                      <Text style={styles.optionDetailLabel}>{t.rebate}:</Text>
                      <Text style={styles.optionDetailValue}>{formatCurrency(selectedProgram.consumer_cash)}</Text>
                    </View>
                  )}
                  <View style={styles.optionDetail}>
                    <Text style={styles.optionDetailLabel}>Capital financé:</Text>
                    <Text style={styles.optionDetailValue}>{formatCurrency(localResult.principalOption1)}</Text>
                  </View>
                  <View style={styles.optionDetail}>
                    <Text style={styles.optionDetailLabel}>{t.rate}:</Text>
                    <Text style={styles.optionRateValue}>{localResult.option1Rate}%</Text>
                  </View>
                  <View style={styles.optionMainResult}>
                    <Text style={styles.optionMonthlyLabel}>
                      {paymentFrequency === 'monthly' ? 'Mensuel' : paymentFrequency === 'biweekly' ? 'Aux 2 sem.' : 'Hebdo'}
                    </Text>
                    <Text style={styles.optionMonthlyValue}>
                      {formatCurrencyDecimal(
                        paymentFrequency === 'monthly' ? localResult.option1Monthly :
                        paymentFrequency === 'biweekly' ? localResult.option1Biweekly :
                        localResult.option1Weekly
                      )}
                    </Text>
                  </View>
                  <View style={styles.optionDetail}>
                    <Text style={styles.optionDetailLabel}>{t.total} ({selectedTerm} {t.months}):</Text>
                    <Text style={styles.optionTotalValue}>{formatCurrency(localResult.option1Total)}</Text>
                  </View>
                </View>

                {/* Option 2 */}
                <View style={[
                  styles.optionCard,
                  styles.optionCard2,
                  localResult.bestOption === '2' && styles.optionCardBest
                ]}>
                  <View style={styles.optionHeader}>
                    <Text style={styles.optionCardTitle}>{t.option2}</Text>
                    {localResult.bestOption === '2' && (
                      <Ionicons name="checkmark-circle" size={18} color="#4ECDC4" />
                    )}
                  </View>
                  <Text style={styles.optionSubtitle}>{t.option2Desc}</Text>
                  
                  {localResult.option2Rate !== null ? (
                    <>
                      <View style={styles.optionDetail}>
                        <Text style={styles.optionDetailLabel}>{t.rebate}:</Text>
                        <Text style={styles.optionDetailValue}>$0</Text>
                      </View>
                      <View style={styles.optionDetail}>
                        <Text style={styles.optionDetailLabel}>Capital financé:</Text>
                        <Text style={styles.optionDetailValue}>{formatCurrency(localResult.principalOption2)}</Text>
                      </View>
                      <View style={styles.optionDetail}>
                        <Text style={styles.optionDetailLabel}>{t.rate}:</Text>
                        <Text style={styles.optionRateValue}>{localResult.option2Rate}%</Text>
                      </View>
                      <View style={styles.optionMainResult}>
                        <Text style={styles.optionMonthlyLabel}>
                          {paymentFrequency === 'monthly' ? 'Mensuel' : paymentFrequency === 'biweekly' ? 'Aux 2 sem.' : 'Hebdo'}
                        </Text>
                        <Text style={styles.optionMonthlyValue}>
                          {formatCurrencyDecimal(
                            paymentFrequency === 'monthly' ? localResult.option2Monthly! :
                            paymentFrequency === 'biweekly' ? localResult.option2Biweekly! :
                            localResult.option2Weekly!
                          )}
                        </Text>
                      </View>
                      <View style={styles.optionDetail}>
                        <Text style={styles.optionDetailLabel}>{t.total} ({selectedTerm} {t.months}):</Text>
                        <Text style={styles.optionTotalValue}>{formatCurrency(localResult.option2Total!)}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.noOption}>
                      <Ionicons name="close-circle-outline" size={32} color="#666" />
                      <Text style={styles.noOptionText}>{t.noOption2}</Text>
                      <Text style={styles.noOptionSubtext}>Non disponible pour ce véhicule</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Bonus Cash Note */}
              {(parseFloat(customBonusCash) > 0 || selectedProgram.bonus_cash > 0) && (
                <View style={styles.bonusCashNote}>
                  <Ionicons name="information-circle" size={16} color="#FFD700" />
                  <Text style={styles.bonusCashNoteText}>
                    {t.bonusCash} de {formatCurrency(parseFloat(customBonusCash) || selectedProgram.bonus_cash)} sera déduit après taxes (au comptant)
                  </Text>
                </View>
              )}
              
              {/* Send by Email Button */}
              <TouchableOpacity
                style={styles.sendEmailButton}
                onPress={() => setShowEmailModal(true)}
              >
                <Ionicons name="mail-outline" size={20} color="#fff" />
                <Text style={styles.sendEmailButtonText}>
                  {lang === 'fr' ? 'Envoyer par email' : 'Send by email'}
                </Text>
              </TouchableOpacity>
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

        {/* Email Modal */}
        <Modal
          visible={showEmailModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowEmailModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.emailModalContent}>
              <View style={styles.emailModalHeader}>
                <View style={styles.emailModalIconContainer}>
                  <Ionicons name="mail" size={32} color="#4ECDC4" />
                </View>
                <Text style={styles.emailModalTitle}>
                  {lang === 'fr' ? 'Envoyer par email' : 'Send by email'}
                </Text>
                <TouchableOpacity
                  style={styles.emailModalClose}
                  onPress={() => setShowEmailModal(false)}
                >
                  <Ionicons name="close" size={24} color="#888" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.emailModalBody}>
                <Text style={styles.emailModalLabel}>
                  {lang === 'fr' ? 'Nom du client (optionnel)' : 'Client name (optional)'}
                </Text>
                <TextInput
                  style={styles.emailModalInput}
                  placeholder={lang === 'fr' ? 'Ex: Jean Dupont' : 'Ex: John Doe'}
                  placeholderTextColor="#666"
                  value={clientName}
                  onChangeText={setClientName}
                />
                
                <Text style={styles.emailModalLabel}>
                  {lang === 'fr' ? 'Email du client' : 'Client email'} *
                </Text>
                <TextInput
                  style={styles.emailModalInput}
                  placeholder="client@email.com"
                  placeholderTextColor="#666"
                  value={clientEmail}
                  onChangeText={setClientEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                
                {selectedProgram && localResult && (
                  <View style={styles.emailPreviewBox}>
                    <Text style={styles.emailPreviewTitle}>
                      {lang === 'fr' ? 'Résumé à envoyer:' : 'Summary to send:'}
                    </Text>
                    <Text style={styles.emailPreviewText}>
                      {selectedProgram.brand} {selectedProgram.model} {selectedProgram.year}
                    </Text>
                    <Text style={styles.emailPreviewText}>
                      {formatCurrency(parseFloat(vehiclePrice))} • {selectedTerm} mois
                    </Text>
                    <Text style={styles.emailPreviewPayment}>
                      {formatCurrency(localResult.monthly1 || 0)}/mois
                    </Text>
                  </View>
                )}
              </View>
              
              <View style={styles.emailModalButtons}>
                <TouchableOpacity
                  style={styles.emailModalCancelButton}
                  onPress={() => {
                    setShowEmailModal(false);
                    setClientEmail('');
                    setClientName('');
                  }}
                >
                  <Text style={styles.emailModalCancelText}>
                    {lang === 'fr' ? 'Annuler' : 'Cancel'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.emailModalSendButton, sendingEmail && styles.emailModalSendButtonDisabled]}
                  disabled={sendingEmail}
                  onPress={async () => {
                    if (!clientEmail || !clientEmail.includes('@')) {
                      if (Platform.OS === 'web') {
                        alert(lang === 'fr' ? 'Veuillez entrer un email valide' : 'Please enter a valid email');
                      } else {
                        Alert.alert('Erreur', lang === 'fr' ? 'Veuillez entrer un email valide' : 'Please enter a valid email');
                      }
                      return;
                    }
                    
                    if (!selectedProgram || !localResult) return;
                    
                    setSendingEmail(true);
                    try {
                      const response = await fetch(`${API_URL}/api/send-calculation-email`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          client_email: clientEmail,
                          client_name: clientName,
                          vehicle_info: {
                            brand: selectedProgram.brand,
                            model: selectedProgram.model,
                            trim: selectedProgram.trim,
                            year: selectedProgram.year,
                          },
                          calculation_results: {
                            consumer_cash: selectedProgram.consumer_cash,
                            bonus_cash: parseFloat(customBonusCash) || selectedProgram.bonus_cash,
                            comparisons: localResult.comparisons || [{
                              term_months: selectedTerm,
                              option1_rate: localResult.option1Rate,
                              option1_monthly: localResult.monthly1,
                              option1_total: localResult.total1,
                              option2_rate: localResult.option2Rate,
                              option2_monthly: localResult.monthly2,
                              option2_total: localResult.total2,
                            }],
                          },
                          selected_term: selectedTerm,
                          selected_option: selectedOption || '1',
                          vehicle_price: parseFloat(vehiclePrice),
                          dealer_name: 'CalcAuto AiPro',
                        }),
                      });
                      
                      const data = await response.json();
                      
                      if (data.success) {
                        setShowEmailModal(false);
                        setClientEmail('');
                        setClientName('');
                        if (Platform.OS === 'web') {
                          alert(lang === 'fr' ? '✅ Email envoyé avec succès!' : '✅ Email sent successfully!');
                        } else {
                          Alert.alert('Succès', lang === 'fr' ? 'Email envoyé avec succès!' : 'Email sent successfully!');
                        }
                      } else {
                        throw new Error(data.detail || 'Erreur');
                      }
                    } catch (error: any) {
                      if (Platform.OS === 'web') {
                        alert(lang === 'fr' ? 'Erreur lors de l\'envoi' : 'Error sending email');
                      } else {
                        Alert.alert('Erreur', lang === 'fr' ? 'Erreur lors de l\'envoi' : 'Error sending email');
                      }
                    } finally {
                      setSendingEmail(false);
                    }
                  }}
                >
                  {sendingEmail ? (
                    <ActivityIndicator size="small" color="#1a1a2e" />
                  ) : (
                    <>
                      <Ionicons name="send" size={18} color="#1a1a2e" />
                      <Text style={styles.emailModalSendText}>
                        {lang === 'fr' ? 'Envoyer' : 'Send'}
                      </Text>
                    </>
                  )}
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
  // Input styles
  inputRow: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    color: '#aaa',
    marginBottom: 6,
  },
  // Term selection styles
  termSection: {
    marginTop: 8,
  },
  termButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  termButton: {
    backgroundColor: '#2d2d44',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 90,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  termButtonActive: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
  },
  termButtonText: {
    fontSize: 14,
    color: '#aaa',
    fontWeight: '600',
  },
  termButtonTextActive: {
    color: '#1a1a2e',
  },
  // Fees section styles
  feesSection: {
    marginTop: 16,
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 12,
  },
  feesSectionTitle: {
    fontSize: 13,
    color: '#aaa',
    fontWeight: '600',
    marginBottom: 10,
  },
  feesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  feeField: {
    flex: 1,
    minWidth: 100,
  },
  feeLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  feeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  feeSymbol: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  feeInput: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  feeNote: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
  },
  exchangeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  exchangeField: {
    flex: 1,
  },
  // Frequency buttons
  frequencyButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  frequencyButton: {
    flex: 1,
    backgroundColor: '#2d2d44',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  frequencyButtonActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  frequencyButtonText: {
    fontSize: 13,
    color: '#aaa',
    fontWeight: '600',
  },
  frequencyButtonTextActive: {
    color: '#1a1a2e',
  },
  // Option selection buttons
  optionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  optionButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  optionButton1: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    borderColor: 'rgba(255, 107, 107, 0.3)',
  },
  optionButton2: {
    backgroundColor: 'rgba(78, 205, 196, 0.2)',
    borderColor: 'rgba(78, 205, 196, 0.3)',
  },
  optionButtonActive1: {
    backgroundColor: '#FF6B6B',
    borderColor: '#FF6B6B',
  },
  optionButtonActive2: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
  },
  optionButtonDisabled: {
    backgroundColor: 'rgba(100, 100, 100, 0.2)',
    opacity: 0.5,
  },
  optionButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  optionButtonTextActive: {
    color: '#1a1a2e',
  },
  optionButtonTextDisabled: {
    fontSize: 14,
    color: '#666',
  },
  optionButtonSubtext: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 4,
  },
  // Best option banner
  bestOptionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  bestOptionBanner1: {
    backgroundColor: '#FF6B6B',
  },
  bestOptionBanner2: {
    backgroundColor: '#4ECDC4',
  },
  bestOptionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  bestOptionSavings: {
    fontSize: 12,
    color: '#1a1a2e',
    fontWeight: '600',
  },
  // Option card enhancements
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 10,
    color: '#888',
    marginBottom: 10,
  },
  optionRateValue: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: 'bold',
  },
  optionMainResult: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
    alignItems: 'center',
  },
  optionMonthlyLabel: {
    fontSize: 10,
    color: '#aaa',
  },
  optionMonthlyValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4ECDC4',
  },
  optionTotalValue: {
    fontSize: 13,
    color: '#fff',
    fontWeight: 'bold',
  },
  noOptionSubtext: {
    fontSize: 11,
    color: '#555',
    marginTop: 4,
  },
  // Bonus cash note
  bonusCashNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  bonusCashNoteText: {
    fontSize: 12,
    color: '#FFD700',
    flex: 1,
  },
  // Email button and modal styles
  sendEmailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 8,
  },
  sendEmailButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  emailModalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 30,
    maxHeight: '80%',
  },
  emailModalHeader: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  emailModalIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(78, 205, 196, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emailModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  emailModalClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
  },
  emailModalBody: {
    padding: 20,
  },
  emailModalLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
    marginTop: 12,
  },
  emailModalInput: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  emailPreviewBox: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    alignItems: 'center',
  },
  emailPreviewTitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  emailPreviewText: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 4,
  },
  emailPreviewPayment: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4ECDC4',
    marginTop: 8,
  },
  emailModalButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  emailModalCancelButton: {
    flex: 1,
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  emailModalCancelText: {
    fontSize: 16,
    color: '#fff',
  },
  emailModalSendButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emailModalSendButtonDisabled: {
    opacity: 0.6,
  },
  emailModalSendText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
});
