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
  Share,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import html2canvas from 'html2canvas';

// Import components and i18n
import { AnimatedSplashScreen } from '../../components/AnimatedSplashScreen';
import { LanguageSelector } from '../../components/LanguageSelector';
import { Language, saveLanguage, loadLanguage, getTranslation, TranslationKeys } from '../../utils/i18n';
import { useAuth } from '../../contexts/AuthContext';
import frTranslations from '../../locales/fr.json';
import enTranslations from '../../locales/en.json';
// Logique de calcul extraite
import { useCalculator, getRateForTerm, formatCurrency, formatCurrencyDecimal } from '../../hooks/useCalculator';
import type { FinancingRates, VehicleProgram, PaymentComparison, CalculationResult, LocalResult, ProgramPeriod, PaymentFrequency } from '../../types/calculator';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Get API URL from environment
const getApiUrl = (): string => {
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }
  return 'http://localhost:8001';
};
const API_URL = getApiUrl();
const SUBMISSIONS_KEY = 'calcauto_submissions';

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

// Translations are now loaded from locales/*.json files
const translations = {
  fr: frTranslations,
  en: enTranslations,
};

const monthNames = {
  fr: frTranslations.months,
  en: enTranslations.months,
};

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout, getToken } = useAuth();
  const params = useLocalSearchParams<{
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    contactId?: string;
  }>();
  
  const [lang, setLang] = useState<Language>('fr');
  const t = translations[lang];

  // Handle logout
  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Voulez-vous vous déconnecter?')) {
        logout();
      }
    } else {
      Alert.alert(
        'Déconnexion',
        'Voulez-vous vous déconnecter?',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Déconnexion', style: 'destructive', onPress: () => logout() }
        ]
      );
    }
  };

  // Load saved language preference on mount
  useEffect(() => {
    loadLanguage().then((savedLang) => {
      setLang(savedLang);
    });
  }, []);

  // Save language when changed
  const handleLanguageChange = useCallback((newLang: Language) => {
    setLang(newLang);
    saveLanguage(newLang);
  }, []);

  const [programs, setPrograms] = useState<VehicleProgram[]>([]);
  const [filteredPrograms, setFilteredPrograms] = useState<VehicleProgram[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<VehicleProgram | null>(null);
  const [vehiclePrice, setVehiclePrice] = useState('');
  const [results, setResults] = useState<CalculationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [programsLoading, setProgramsLoading] = useState(true);
  
  // Splash screen state
  const [showSplash, setShowSplash] = useState(true);
  
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
  const [clientPhone, setClientPhone] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  
  // SMS Preview modal
  const [showSmsPreview, setShowSmsPreview] = useState(false);
  const [smsPreviewText, setSmsPreviewText] = useState('');
  
  // Current program period
  const [currentPeriod, setCurrentPeriod] = useState<{month: number, year: number} | null>(null);
  
  // Available periods (from API)
  const [availablePeriods, setAvailablePeriods] = useState<{month: number, year: number, count: number}[]>([]);
  const [showPeriodSelector, setShowPeriodSelector] = useState(false);
  
  // Selected term for calculation
  const [selectedTerm, setSelectedTerm] = useState<number>(72);
  const availableTerms = [36, 48, 60, 72, 84, 96];
  
  // Inventory selection for calculator
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [selectedInventory, setSelectedInventory] = useState<any>(null);
  const [showInventoryPicker, setShowInventoryPicker] = useState(false);
  const [manualVin, setManualVin] = useState<string>('');  // VIN manuel si pas d'inventaire
  
  // Auto-detected financing from product code
  const [autoFinancing, setAutoFinancing] = useState<{
    consumer_cash: number;
    bonus_cash: number;
    option1_rates: Record<string, number | null>;
    option2_rates: Record<string, number | null>;
    programme_source: string;
  } | null>(null);
  
  // Payment frequency
  const [paymentFrequency, setPaymentFrequency] = useState<'monthly' | 'biweekly' | 'weekly'>('monthly');
  
  // Pre-fill from contact params
  useEffect(() => {
    if (params.clientName) setClientName(params.clientName);
    if (params.clientEmail) setClientEmail(params.clientEmail);
    if (params.clientPhone) setClientPhone(params.clientPhone);
    // If coming from contacts, auto-open email modal when calculation is ready
  }, [params]);
  const frequencyLabels = {
    monthly: { fr: 'Mensuel', en: 'Monthly', factor: 1 },
    biweekly: { fr: 'Aux 2 sem.', en: 'Bi-weekly', factor: 12/26 },
    weekly: { fr: 'Hebdo', en: 'Weekly', factor: 12/52 },
  };
  
  // Selected option (1 or 2) - null means show comparison
  const [selectedOption, setSelectedOption] = useState<'1' | '2' | null>(null);
  
  // Custom bonus cash input (after taxes)
  const [customBonusCash, setCustomBonusCash] = useState('');
  
  // Comptant (cash down payment, taxes included)
  const [comptantTxInclus, setComptantTxInclus] = useState('');
  
  // Accessoires additionnels (ajoutés au prix avant taxes)
  const [accessories, setAccessories] = useState<Array<{description: string; price: string}>>([]);
  
  // Frais additionnels (taxables)
  const [fraisDossier, setFraisDossier] = useState('259.95');
  const [taxePneus, setTaxePneus] = useState('15');
  const [fraisRDPRM, setFraisRDPRM] = useState('100');
  
  // Échange
  const [prixEchange, setPrixEchange] = useState('');
  const [montantDuEchange, setMontantDuEchange] = useState('');
  
  // ============ LEASE SCI STATE ============
  const [showLease, setShowLease] = useState(false);
  const [leaseKmPerYear, setLeaseKmPerYear] = useState<number>(24000);
  const [leaseTerm, setLeaseTerm] = useState<number>(48);
  const [leaseResiduals, setLeaseResiduals] = useState<any>(null);
  const [leaseRates, setLeaseRates] = useState<any>(null);
  const [leaseResult, setLeaseResult] = useState<any>(null);
  const [leaseLoading, setLeaseLoading] = useState(false);
  const [leasePdsf, setLeasePdsf] = useState('');  // PDSF/PDOC pour calcul résiduel
  const [leaseSoldeReporte, setLeaseSoldeReporte] = useState('');  // Solde reporté (négatif = dette)
  const [leaseRabaisConcess, setLeaseRabaisConcess] = useState('');  // Rabais concessionnaire avant taxes
  const [bestLeaseOption, setBestLeaseOption] = useState<any>(null);  // Meilleur choix calculé
  const [leaseAnalysisGrid, setLeaseAnalysisGrid] = useState<any[]>([]);  // Grille complète d'analyse
  const leaseTerms = [24, 27, 36, 39, 42, 48, 51, 54, 60];
  const leaseKmOptions = [12000, 18000, 24000];

  // Calcul de financement (logique extraite dans useCalculator)
  const { localResult } = useCalculator({
    selectedProgram,
    vehiclePrice,
    selectedTerm,
    customBonusCash,
    comptantTxInclus,
    fraisDossier,
    taxePneus,
    fraisRDPRM,
    prixEchange,
    montantDuEchange,
    accessories,
  });

  const loadPrograms = useCallback(async (month?: number, year?: number) => {
    const startTime = Date.now();
    const MIN_LOADING_TIME = 2000; // Minimum 2 seconds for animation
    
    try {
      // Load available periods
      try {
        const periodsRes = await axios.get(`${API_URL}/api/periods`);
        setAvailablePeriods(periodsRes.data);
      } catch (e) {
        console.log('Could not load periods');
      }
      
      // Load inventory
      try {
        const token = await getToken();
        if (token) {
          const invRes = await axios.get(`${API_URL}/api/inventory`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setInventoryList(invRes.data.filter((v: any) => v.status === 'disponible'));
        }
      } catch (e) {
        console.log('Could not load inventory');
      }
      
      // Build URL with optional month/year params
      let url = `${API_URL}/api/programs`;
      if (month && year) {
        url += `?month=${month}&year=${year}`;
      }
      
      const response = await axios.get(url, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      setPrograms(response.data);
      setFilteredPrograms(response.data);
      
      // Get current period from first program or params
      if (response.data.length > 0) {
        setCurrentPeriod({
          month: month || response.data[0].program_month,
          year: year || response.data[0].program_year
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

  // Load inventory separately when user is authenticated
  useEffect(() => {
    const loadInventory = async () => {
      try {
        const token = await getToken();
        if (token) {
          const invRes = await axios.get(`${API_URL}/api/inventory`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const disponible = invRes.data.filter((v: any) => v.status === 'disponible');
          setInventoryList(disponible);
          console.log('Inventory loaded:', disponible.length, 'vehicles');
        }
      } catch (e) {
        console.log('Could not load inventory:', e);
      }
    };
    loadInventory();
  }, []);

  // Load auto-financing info when inventory vehicle is selected
  useEffect(() => {
    const loadAutoFinancing = async () => {
      if (!selectedInventory?.model_code) {
        setAutoFinancing(null);
        return;
      }
      
      try {
        const response = await axios.get(
          `${API_URL}/api/product-codes/${selectedInventory.model_code}/financing`
        );
        
        if (response.data.success && response.data.financing) {
          setAutoFinancing(response.data.financing);
          console.log('Auto-financing loaded for code:', selectedInventory.model_code, response.data.financing);
        } else {
          setAutoFinancing(null);
        }
      } catch (e) {
        console.log('Could not load auto-financing:', e);
        setAutoFinancing(null);
      }
    };
    
    loadAutoFinancing();
  }, [selectedInventory?.model_code]);

  // Load SCI lease data
  useEffect(() => {
    const loadLeaseData = async () => {
      try {
        const [residualsRes, ratesRes] = await Promise.all([
          axios.get(`${API_URL}/api/sci/residuals`),
          axios.get(`${API_URL}/api/sci/lease-rates`),
        ]);
        setLeaseResiduals(residualsRes.data);
        setLeaseRates(ratesRes.data);
      } catch (e) {
        console.log('Could not load SCI lease data:', e);
      }
    };
    loadLeaseData();
  }, []);

  // Calculate lease when parameters change
  useEffect(() => {
    if (!showLease || !selectedProgram || !vehiclePrice || !leaseResiduals || !leaseRates) {
      setLeaseResult(null);
      return;
    }

    const price = parseFloat(vehiclePrice);
    if (isNaN(price) || price <= 0) return;

    // Find matching residual vehicle
    const brandLower = selectedProgram.brand.toLowerCase();
    const modelLower = selectedProgram.model.toLowerCase();
    const trimLower = (selectedProgram.trim || '').toLowerCase();

    const residualVehicle = leaseResiduals.vehicles?.find((v: any) => {
      const vBrand = v.brand.toLowerCase();
      const vModel = v.model_name.toLowerCase();
      const vTrim = (v.trim || '').toLowerCase();
      return vBrand === brandLower && 
        (vModel.includes(modelLower) || modelLower.includes(vModel)) &&
        (vTrim.includes(trimLower) || trimLower.includes(vTrim) || !trimLower);
    });

    if (!residualVehicle) {
      setLeaseResult(null);
      return;
    }

    const residualPct = residualVehicle.residual_percentages?.[String(leaseTerm)] || 0;
    if (residualPct === 0) {
      setLeaseResult(null);
      return;
    }

    // Find matching lease rate vehicle
    const year = selectedProgram.year;
    const vehicleList = year === 2025 ? leaseRates.vehicles_2025 : leaseRates.vehicles_2026;
    
    // Find best matching rate entry - prioritize trim match
    let rateEntry = vehicleList?.find((v: any) => {
      const vModel = v.model.toLowerCase();
      const vBrand = v.brand.toLowerCase();
      if (vBrand !== brandLower) return false;
      // Must match model AND trim
      const hasModel = vModel.includes(modelLower) || modelLower.includes(vModel);
      if (!hasModel) return false;
      if (!trimLower) return true;
      return vModel.includes(trimLower) || trimLower.split(',').some((t: string) => vModel.includes(t.trim()));
    });
    // Fallback: match just model if no trim match
    if (!rateEntry) {
      rateEntry = vehicleList?.find((v: any) => {
        const vModel = v.model.toLowerCase();
        const vBrand = v.brand.toLowerCase();
        if (vBrand !== brandLower) return false;
        return vModel.includes(modelLower) || modelLower.includes(vModel);
      });
    }

    // Get rates for standard and alternative
    const termKey = String(leaseTerm);
    const standardRate = rateEntry?.standard_rates?.[termKey] ?? null;
    const alternativeRate = rateEntry?.alternative_rates?.[termKey] ?? null;
    const leaseCash = rateEntry?.lease_cash || 0;

    // km adjustment
    const kmAdj = leaseResiduals.km_adjustments?.adjustments;
    let kmAdjustment = 0;
    if (leaseKmPerYear !== 24000 && kmAdj) {
      const kmKey = String(leaseKmPerYear);
      kmAdjustment = kmAdj[kmKey]?.[termKey] || 0;
    }

    const adjustedResidualPct = residualPct + kmAdjustment;
    // PDSF (MSRP) pour calcul résiduel - utiliser le champ PDSF si rempli, sinon vehiclePrice
    const pdsf = parseFloat(leasePdsf) || parseFloat(vehiclePrice);
    const residualValue = pdsf * (adjustedResidualPct / 100);

    // Calculate for both options
    const bonusCash = parseFloat(customBonusCash) || selectedProgram.bonus_cash || 0;
    const comptant = parseFloat(comptantTxInclus) || 0;
    const dossier = parseFloat(fraisDossier) || 0;
    const pneus = parseFloat(taxePneus) || 0;
    const rdprm = parseFloat(fraisRDPRM) || 0;
    const fraisTax = dossier + pneus + rdprm;
    const tradeVal = parseFloat(prixEchange) || 0;
    const tradeOwed = parseFloat(montantDuEchange) || 0;
    const soldeReporte = parseFloat(leaseSoldeReporte) || 0; // négatif = dette
    const totalAccessoires = accessories.reduce((sum: number, acc: {description: string; price: string}) => sum + (parseFloat(acc.price) || 0), 0);

    const calcLease = (rate: number, cash: number) => {
      const tps = 0.05;
      const tvq = 0.09975;
      const tauxTaxe = tps + tvq; // 14.975%
      const rabaisConcess = parseFloat(leaseRabaisConcess) || 0;
      const sellingPrice = price + totalAccessoires - rabaisConcess;
      
      // === CALCUL LOCATION SCI QUÉBEC ===
      // 1. Coût capitalisé = prix vente + frais de dossier - lease cash
      //    NOTE: Seul le frais de dossier est capitalisé dans une location SCI
      //    La taxe pneus et le RDPRM sont payés à la livraison, pas capitalisés
      const fraisDossierOnly = parseFloat(fraisDossier) || 0;
      const capCost = sellingPrice + fraisDossierOnly - cash;
      
      // 2. Solde reporté = montant à AJOUTER au prix de vente (balance à reporter)
      //    Positif = ajouter au cap cost (solde à financer)
      //    Négatif = dette, ajouter avec taxes
      let soldeNet = 0;
      if (soldeReporte < 0) {
        soldeNet = Math.abs(soldeReporte) * (1 + tauxTaxe); // dette avec taxes
      } else if (soldeReporte > 0) {
        soldeNet = soldeReporte; // solde à reporter = augmente le cap cost
      }
      
      // 3. Net cap cost = cap + solde + montant_dû - échange - comptant
      const netCapCost = capCost + soldeNet + tradeOwed - tradeVal - comptant - bonusCash;
      
      // 4. Résiduel sur PDSF
      // residualValue already calculated above
      
      // 5. Paiement avant taxes
      const depreciation = (netCapCost - residualValue) / leaseTerm;
      const moneyFactor = rate / 2400;
      const financeCharge = (netCapCost + residualValue) * moneyFactor;
      const monthlyBeforeTax = depreciation + financeCharge;
      
      // 6. Taxes SUR le paiement (pas capitalisées!)
      const tpsOnPayment = monthlyBeforeTax * tps;
      const tvqOnPayment = monthlyBeforeTax * tvq;
      const taxesMensuelles = tpsOnPayment + tvqOnPayment;
      
      // 7. Crédit taxe échange: réparti sur les paiements
      // crédit = (valeur échange / terme) × taux_taxe, limité aux taxes du paiement
      let creditTaxeParMois = 0;
      let creditPerdu = 0;
      if (tradeVal > 0) {
        const tradeDepreciation = tradeVal / leaseTerm;
        const creditPotentiel = tradeDepreciation * tauxTaxe;
        creditTaxeParMois = Math.min(creditPotentiel, taxesMensuelles);
        creditPerdu = Math.max(0, creditPotentiel - taxesMensuelles);
      }
      
      // 8. Paiement mensuel total
      const monthlyAfterTax = monthlyBeforeTax + taxesMensuelles - creditTaxeParMois;
      
      const weeklyBeforeTax = monthlyBeforeTax * 12 / 52;
      const biweeklyBeforeTax = monthlyBeforeTax * 12 / 26;
      
      const weeklyAfterTax = monthlyAfterTax * 12 / 52;
      const biweeklyAfterTax = monthlyAfterTax * 12 / 26;
      
      return {
        monthly: Math.max(0, monthlyAfterTax),
        biweekly: Math.max(0, biweeklyAfterTax),
        weekly: Math.max(0, weeklyAfterTax),
        monthlyBeforeTax: Math.max(0, monthlyBeforeTax),
        weeklyBeforeTax: Math.max(0, weeklyBeforeTax),
        biweeklyBeforeTax: Math.max(0, biweeklyBeforeTax),
        total: Math.max(0, monthlyAfterTax * leaseTerm),
        rate,
        netCapCost: Math.max(0, netCapCost),
        residualValue,
        leaseCash: cash,
        capCost,
        tpsOnPayment: Math.round(tpsOnPayment * 100) / 100,
        tvqOnPayment: Math.round(tvqOnPayment * 100) / 100,
        creditTaxeParMois: Math.round(creditTaxeParMois * 100) / 100,
        creditPerdu: Math.round(creditPerdu * 100) / 100,
        pdsf,
        rabaisConcess,
        coutEmprunt: Math.round(financeCharge * leaseTerm * 100) / 100,
        fraisDossierOnly,
      };
    };

    const results: any = {
      vehicleName: `${residualVehicle.brand} ${residualVehicle.model_name} ${residualVehicle.trim}`,
      residualPct: adjustedResidualPct,
      residualValue,
      kmAdjustment,
      term: leaseTerm,
      kmPerYear: leaseKmPerYear,
    };

    // Standard option (with lease cash)
    if (standardRate !== null) {
      results.standard = calcLease(standardRate, leaseCash);
    }

    // Alternative option (lower rate, no lease cash typically)
    if (alternativeRate !== null) {
      results.alternative = calcLease(alternativeRate, 0);
    }

    // Determine best lease option
    if (results.standard && results.alternative) {
      results.bestLease = results.standard.total < results.alternative.total ? 'standard' : 'alternative';
      results.leaseSavings = Math.abs(results.standard.total - results.alternative.total);
    } else if (results.standard) {
      results.bestLease = 'standard';
    } else if (results.alternative) {
      results.bestLease = 'alternative';
    }

    setLeaseResult(results);

    // === CALCUL MEILLEUR CHOIX: toutes combinaisons km × terme × option ===
    const availableTerms = [24, 27, 36, 39, 42, 48, 51, 54, 60];
    const availableKms = [12000, 18000, 24000];
    let bestOption: any = null;
    const grid: any[] = [];

    for (const km of availableKms) {
      for (const t of availableTerms) {
        const resPct = residualVehicle.residual_percentages?.[String(t)] || 0;
        if (resPct === 0) continue;

        let kmAdj2 = 0;
        if (km !== 24000 && kmAdj) {
          kmAdj2 = kmAdj[String(km)]?.[String(t)] || 0;
        }
        const adjResPct = resPct + kmAdj2;
        const resVal = pdsf * (adjResPct / 100);

        const stdRate = rateEntry?.standard_rates?.[String(t)] ?? null;
        const altRate = rateEntry?.alternative_rates?.[String(t)] ?? null;

        const calcForTerm = (rate: number, cash: number, termLen: number) => {
          const rabaisC = parseFloat(leaseRabaisConcess) || 0;
          const sp = price + totalAccessoires - rabaisC;
          const dossierOnly = parseFloat(fraisDossier) || 0;
          const cc = sp + dossierOnly - cash;
          let sn = 0;
          if (soldeReporte < 0) sn = Math.abs(soldeReporte) * 1.14975;
          else if (soldeReporte > 0) sn = soldeReporte;
          const ncc = cc + sn + tradeOwed - tradeVal - comptant - bonusCash;
          const dep = (ncc - resVal) / termLen;
          const mf = rate / 2400;
          const fc = (ncc + resVal) * mf;
          const bt = dep + fc;
          const monthly = bt + bt * 0.05 + bt * 0.09975;
          return { monthly, monthlyBeforeTax: bt, rate, term: termLen, residualPct: adjResPct, residualValue: resVal, coutEmprunt: fc * termLen, leaseCash: cash, kmPerYear: km };
        };

        if (altRate !== null) {
          const r = calcForTerm(altRate, 0, t);
          grid.push({ ...r, option: 'alt', optionLabel: 'Alt' });
          if (!bestOption || r.monthly < bestOption.monthly) {
            bestOption = { ...r, option: 'alternative', optionLabel: 'Taux Alternatif' };
          }
        }
        if (stdRate !== null) {
          const r = calcForTerm(stdRate, leaseCash, t);
          grid.push({ ...r, option: 'std', optionLabel: 'Std' });
          if (!bestOption || r.monthly < bestOption.monthly) {
            bestOption = { ...r, option: 'standard', optionLabel: 'Std + Lease Cash' };
          }
        }
      }
    }

    setBestLeaseOption(bestOption);
    setLeaseAnalysisGrid(grid);
  }, [showLease, selectedProgram, vehiclePrice, leaseTerm, leaseKmPerYear, leaseResiduals, leaseRates, 
      customBonusCash, comptantTxInclus, fraisDossier, taxePneus, fraisRDPRM, prixEchange, montantDuEchange, accessories, leasePdsf, leaseSoldeReporte, leaseRabaisConcess]);

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
    // localResult se réinitialise automatiquement via useCalculator quand selectedProgram = null
  };

  // Generate submission text for sharing
  const generateSubmissionText = () => {
    if (!selectedProgram || !localResult || !vehiclePrice) return '';
    
    const vehicle = `${selectedProgram.brand} ${selectedProgram.model} ${selectedProgram.trim || ''} ${selectedProgram.year}`.trim();
    const option = selectedOption === '2' ? '2' : '1';
    const rate = option === '1' ? localResult.option1Rate : localResult.option2Rate;
    
    let payment: number;
    if (paymentFrequency === 'biweekly') {
      payment = option === '1' ? localResult.option1Biweekly : (localResult.option2Biweekly || 0);
    } else if (paymentFrequency === 'weekly') {
      payment = option === '1' ? localResult.option1Weekly : (localResult.option2Weekly || 0);
    } else {
      payment = option === '1' ? localResult.option1Monthly : (localResult.option2Monthly || 0);
    }
    
    const frequencyText = paymentFrequency === 'biweekly' 
      ? (lang === 'fr' ? 'aux 2 sem.' : 'bi-weekly')
      : paymentFrequency === 'weekly'
        ? (lang === 'fr' ? 'hebdo' : 'weekly')
        : (lang === 'fr' ? 'mensuel' : 'monthly');
    
    const vin = selectedInventory?.vin || (manualVin && manualVin.length === 17 ? manualVin : '');
    
    // Build lease section for SMS
    let leaseSection = '';
    if (showLease && leaseResult && (leaseResult.standard || leaseResult.alternative)) {
      const bestLease = leaseResult.bestLease === 'standard' ? leaseResult.standard : leaseResult.alternative;
      const bestLeaseLabel = leaseResult.bestLease === 'standard' 
        ? (lang === 'fr' ? 'Std + Lease Cash' : 'Std + Lease Cash')
        : (lang === 'fr' ? 'Taux Alternatif' : 'Alt. Rate');
      const bestLeasePayment = paymentFrequency === 'biweekly' ? bestLease.biweekly :
        paymentFrequency === 'weekly' ? bestLease.weekly : bestLease.monthly;
      
      leaseSection = lang === 'fr'
        ? `\n\n📋 LOCATION SCI (${bestLeaseLabel})\n` +
          `Terme: ${leaseTerm} mois • ${leaseKmPerYear/1000}k km/an\n` +
          `Résiduel: ${leaseResult.residualPct}% (${formatCurrency(leaseResult.residualValue)})\n` +
          `Taux: ${bestLease.rate}%\n` +
          `Paiement ${frequencyText}: ${formatCurrencyDecimal(bestLeasePayment)}`
        : `\n\n📋 SCI LEASE (${bestLeaseLabel})\n` +
          `Term: ${leaseTerm} mo • ${leaseKmPerYear/1000}k km/yr\n` +
          `Residual: ${leaseResult.residualPct}% (${formatCurrency(leaseResult.residualValue)})\n` +
          `Rate: ${bestLease.rate}%\n` +
          `${frequencyText} payment: ${formatCurrencyDecimal(bestLeasePayment)}`;
    }
    
    const text = lang === 'fr' 
      ? `SOUMISSION CalcAuto AiPro\n\n` +
        `Véhicule: ${vehicle}\n` +
        `Prix: ${formatCurrency(parseFloat(vehiclePrice))}\n` +
        (vin ? `VIN: ${vin}\n` : '') +
        `\nFINANCEMENT Option ${option}\n` +
        `Terme: ${selectedTerm} mois\n` +
        `Taux: ${rate}%\n` +
        `Paiement ${frequencyText}: ${formatCurrencyDecimal(payment)}\n` +
        (selectedProgram.consumer_cash > 0 ? `Rabais: ${formatCurrency(selectedProgram.consumer_cash)}\n` : '') +
        leaseSection +
        `\n\nEnvoyé via CalcAuto AiPro`
      : `CalcAuto AiPro SUBMISSION\n\n` +
        `Vehicle: ${vehicle}\n` +
        `Price: ${formatCurrency(parseFloat(vehiclePrice))}\n` +
        (vin ? `VIN: ${vin}\n` : '') +
        `\nFINANCING Option ${option}\n` +
        `Term: ${selectedTerm} months\n` +
        `Rate: ${rate}%\n` +
        `${frequencyText} payment: ${formatCurrencyDecimal(payment)}\n` +
        (selectedProgram.consumer_cash > 0 ? `Rebate: ${formatCurrency(selectedProgram.consumer_cash)}\n` : '') +
        leaseSection +
        `\n\nSent via CalcAuto AiPro`;
    
    return text;
  };

  // Handle Share via SMS - Open preview modal
  const handleShareSMS = async () => {
    if (!selectedProgram || !localResult || !vehiclePrice) {
      if (Platform.OS === 'web') {
        alert(lang === 'fr' ? 'Aucune soumission à partager' : 'No submission to share');
      } else {
        Alert.alert('Erreur', lang === 'fr' ? 'Aucune soumission à partager' : 'No submission to share');
      }
      return;
    }

    try {
      // Show loading state
      setSmsPreviewText(lang === 'fr' ? 'Génération de la soumission...' : 'Generating submission...');
      setShowSmsPreview(true);

      // 1. Generate the print HTML (reuse existing template)
      const vehicle = `${selectedProgram.brand} ${selectedProgram.model} ${selectedProgram.trim || ''} ${selectedProgram.year}`.trim();
      const vin = selectedInventory?.vin || (manualVin && manualVin.length === 17 ? manualVin : '');
      const price = parseFloat(vehiclePrice) || 0;
      const fmt = (v: number) => v.toLocaleString('fr-CA', { maximumFractionDigits: 0 });
      const fmt2 = (v: number) => v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // Build window sticker URL
      const brand = selectedProgram.brand?.toLowerCase() || '';
      const stickerBaseUrls: Record<string, string> = {
        chrysler: 'https://www.chrysler.com/hostd/windowsticker/getWindowStickerPdf.do?vin=',
        jeep: 'https://www.jeep.com/hostd/windowsticker/getWindowStickerPdf.do?vin=',
        dodge: 'https://www.dodge.com/hostd/windowsticker/getWindowStickerPdf.do?vin=',
        ram: 'https://www.ramtrucks.com/hostd/windowsticker/getWindowStickerPdf.do?vin=',
        fiat: 'https://www.fiatusa.com/hostd/windowsticker/getWindowStickerPdf.do?vin=',
      };
      const stickerUrl = vin ? (stickerBaseUrls[brand] || stickerBaseUrls['ram']) + vin : '';

      // 2. Fetch window sticker image from our API
      let stickerImageUrl = '';
      if (vin) {
        try {
          const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
          const stickerResp = await axios.get(`${API_URL}/api/window-sticker/${vin}`);
          if (stickerResp.data?.images?.length > 0) {
            stickerImageUrl = stickerResp.data.images[0];
          }
        } catch (e) {
          console.log('Window sticker not available');
        }
      }

      // 3. Build full HTML for screenshot capture
      const consumerCash = selectedProgram.consumer_cash || 0;
      const bonusCash2 = parseFloat(customBonusCash) || selectedProgram.bonus_cash || 0;
      const dossier = parseFloat(fraisDossier) || 0;
      const pneus = parseFloat(taxePneus) || 0;
      const rdprm = parseFloat(fraisRDPRM) || 0;
      const valeurEchange = parseFloat(prixEchange) || 0;
      const comptant = parseFloat(comptantTxInclus) || 0;
      const hasOption2 = selectedProgram.option2_rates !== null && localResult.option2Monthly !== null;
      const payLabel = paymentFrequency === 'biweekly' ? (lang === 'fr' ? 'Aux 2 sem.' : 'Bi-weekly') : paymentFrequency === 'weekly' ? (lang === 'fr' ? 'Hebdo' : 'Weekly') : (lang === 'fr' ? 'Mensuel' : 'Monthly');

      const o1Pay = paymentFrequency === 'biweekly' ? localResult.option1Biweekly : paymentFrequency === 'weekly' ? localResult.option1Weekly : localResult.option1Monthly;
      const o2Pay = paymentFrequency === 'biweekly' ? (localResult.option2Biweekly || 0) : paymentFrequency === 'weekly' ? (localResult.option2Weekly || 0) : (localResult.option2Monthly || 0);

      const screenshotHtml = `
        <div id="capture" style="width:640px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;color:#333;">
          <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:20px;text-align:center;">
            <div style="color:#fff;font-size:24px;font-weight:700;">CalcAuto <span style="color:#4ECDC4;">AiPro</span></div>
            <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:4px;">${lang === 'fr' ? 'Soumission de financement' : 'Financing Submission'}</div>
          </div>
          <div style="padding:16px;">
            <div style="background:#f8f9fa;border-radius:10px;padding:14px;border-left:4px solid #4ECDC4;margin-bottom:14px;">
              <div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;">${selectedProgram.brand}</div>
              <div style="font-size:20px;font-weight:700;color:#1a1a2e;margin:4px 0;">${selectedProgram.model} ${selectedProgram.trim || ''} ${selectedProgram.year}</div>
              <div style="font-size:18px;color:#4ECDC4;font-weight:700;">${fmt(price)} $</div>
              ${vin ? `<div style="font-size:10px;color:#888;font-family:monospace;margin-top:4px;">VIN: ${vin}</div>` : ''}
            </div>
            
            <div style="display:flex;gap:8px;margin-bottom:14px;">
              <div style="flex:1;border:2px solid ${localResult.bestOption === '1' ? '#4CAF50' : '#ddd'};border-radius:10px;padding:12px;">
                <div style="font-size:14px;font-weight:700;color:#c0392b;margin-bottom:6px;">Option 1 ${localResult.bestOption === '1' ? '<span style="background:#4CAF50;color:#fff;font-size:10px;padding:2px 6px;border-radius:8px;">✓</span>' : ''}</div>
                <div style="font-size:11px;color:#666;margin-bottom:4px;">${lang === 'fr' ? 'Rabais:' : 'Rebate:'} ${consumerCash > 0 ? '-' + fmt(consumerCash) + ' $' : '$0'}</div>
                <div style="font-size:11px;color:#666;margin-bottom:4px;">${lang === 'fr' ? 'Taux:' : 'Rate:'} <span style="color:#c0392b;">${localResult.option1Rate}%</span></div>
                <div style="background:#f8f9fa;border-radius:6px;padding:8px;text-align:center;border-top:3px solid #c0392b;margin-top:6px;">
                  <div style="font-size:10px;color:#666;">${payLabel}</div>
                  <div style="font-size:22px;font-weight:700;color:#c0392b;">${fmt2(o1Pay)} $</div>
                  <div style="font-size:10px;color:#666;">Total (${selectedTerm}m): ${fmt(localResult.option1Total)} $</div>
                </div>
              </div>
              ${hasOption2 ? `
              <div style="flex:1;border:2px solid ${localResult.bestOption === '2' ? '#4CAF50' : '#ddd'};border-radius:10px;padding:12px;">
                <div style="font-size:14px;font-weight:700;color:#1565C0;margin-bottom:6px;">Option 2 ${localResult.bestOption === '2' ? '<span style="background:#4CAF50;color:#fff;font-size:10px;padding:2px 6px;border-radius:8px;">✓</span>' : ''}</div>
                <div style="font-size:11px;color:#666;margin-bottom:4px;">${lang === 'fr' ? 'Rabais:' : 'Rebate:'} $0</div>
                <div style="font-size:11px;color:#666;margin-bottom:4px;">${lang === 'fr' ? 'Taux:' : 'Rate:'} <span style="color:#1565C0;">${localResult.option2Rate}%</span></div>
                <div style="background:#f8f9fa;border-radius:6px;padding:8px;text-align:center;border-top:3px solid #1565C0;margin-top:6px;">
                  <div style="font-size:10px;color:#666;">${payLabel}</div>
                  <div style="font-size:22px;font-weight:700;color:#1565C0;">${fmt2(o2Pay)} $</div>
                  <div style="font-size:10px;color:#666;">Total (${selectedTerm}m): ${fmt(localResult.option2Total || 0)} $</div>
                </div>
              </div>` : ''}
            </div>
            
            ${showLease && leaseResult && (leaseResult.standard || leaseResult.alternative) ? `
            <div style="border-top:2px solid #FFD700;padding-top:12px;margin-bottom:14px;">
              <div style="font-size:13px;font-weight:700;color:#F57F17;margin-bottom:10px;">LOCATION SCI - ${leaseTerm} mois / ${(leaseKmPerYear/1000).toFixed(0)}k km</div>
              <div style="font-size:11px;color:#666;margin-bottom:8px;">Résiduel: ${leaseResult.residualPct}% = ${fmt(Math.round(leaseResult.residualValue))} $</div>
              <div style="display:flex;gap:8px;">
                ${leaseResult.standard ? `
                <div style="flex:1;border:2px solid ${leaseResult.bestLease === 'standard' ? '#FFD700' : '#ddd'};border-radius:10px;padding:10px;">
                  <div style="font-size:12px;font-weight:700;color:#E65100;">Std + Lease Cash ${leaseResult.bestLease === 'standard' ? '<span style="background:#FFD700;color:#000;font-size:9px;padding:1px 5px;border-radius:6px;">✓</span>' : ''}</div>
                  <div style="font-size:10px;color:#666;">Taux: ${leaseResult.standard.rate}% | Cash: -${fmt(leaseResult.standard.leaseCash)} $</div>
                  <div style="background:#fff8e1;border-radius:6px;padding:8px;text-align:center;margin-top:6px;">
                    <div style="font-size:10px;color:#666;">Avant taxes: ${fmt2(leaseResult.standard.monthlyBeforeTax)} $</div>
                    <div style="font-size:10px;color:#666;">TPS: ${fmt2(leaseResult.standard.tpsOnPayment)} $ | TVQ: ${fmt2(leaseResult.standard.tvqOnPayment)} $</div>
                    <div style="font-size:20px;font-weight:700;color:#E65100;">${fmt2(leaseResult.standard.monthly)} $</div>
                    <div style="font-size:10px;color:#c00;">Coût emprunt: ${fmt2(leaseResult.standard.coutEmprunt)} $</div>
                  </div>
                </div>` : ''}
                ${leaseResult.alternative ? `
                <div style="flex:1;border:2px solid ${leaseResult.bestLease === 'alternative' ? '#FFD700' : '#ddd'};border-radius:10px;padding:10px;">
                  <div style="font-size:12px;font-weight:700;color:#0277BD;">Taux Alternatif ${leaseResult.bestLease === 'alternative' ? '<span style="background:#FFD700;color:#000;font-size:9px;padding:1px 5px;border-radius:6px;">✓</span>' : ''}</div>
                  <div style="font-size:10px;color:#666;">Taux: ${leaseResult.alternative.rate}% | Cash: $0</div>
                  <div style="background:#e3f2fd;border-radius:6px;padding:8px;text-align:center;margin-top:6px;">
                    <div style="font-size:10px;color:#666;">Avant taxes: ${fmt2(leaseResult.alternative.monthlyBeforeTax)} $</div>
                    <div style="font-size:10px;color:#666;">TPS: ${fmt2(leaseResult.alternative.tpsOnPayment)} $ | TVQ: ${fmt2(leaseResult.alternative.tvqOnPayment)} $</div>
                    <div style="font-size:20px;font-weight:700;color:#0277BD;">${fmt2(leaseResult.alternative.monthly)} $</div>
                    <div style="font-size:10px;color:#c00;">Coût emprunt: ${fmt2(leaseResult.alternative.coutEmprunt)} $</div>
                  </div>
                </div>` : ''}
              </div>
            </div>` : ''}

            ${stickerImageUrl ? `
            <div style="margin-top:10px;text-align:center;">
              <div style="font-size:11px;font-weight:700;color:#666;margin-bottom:6px;">WINDOW STICKER</div>
              <img src="${stickerImageUrl}" style="max-width:100%;border-radius:8px;border:1px solid #ddd;" crossorigin="anonymous" />
            </div>` : ''}

            ${stickerUrl ? `
            <div style="text-align:center;margin-top:8px;">
              <a href="${stickerUrl}" style="font-size:11px;color:#4ECDC4;">Window Sticker PDF</a>
            </div>` : ''}

            <div style="text-align:center;margin-top:14px;padding-top:10px;border-top:1px solid #eee;">
              <div style="font-size:10px;color:#999;">Généré le ${new Date().toLocaleDateString('fr-CA')} - CalcAuto AiPro</div>
            </div>
          </div>
        </div>
      `;

      // 4. Render HTML in hidden div, capture with html2canvas
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.innerHTML = screenshotHtml;
      document.body.appendChild(container);

      // Wait for images to load
      const images = container.querySelectorAll('img');
      if (images.length > 0) {
        await Promise.all(Array.from(images).map(img => 
          new Promise<void>((resolve) => {
            if (img.complete) resolve();
            else { img.onload = () => resolve(); img.onerror = () => resolve(); }
          })
        ));
      }

      const captureDiv = container.querySelector('#capture') as HTMLElement;
      const canvas = await html2canvas(captureDiv, { 
        scale: 2, 
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });
      document.body.removeChild(container);

      // Convert canvas to blob
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b: any) => resolve(b), 'image/png'));
      const file = new File([blob], `soumission_${vehicle.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
      
      const filesToShare: File[] = [file];
      
      // Build text message with sticker link
      let shareText = `${vehicle} - ${fmt(price)} $\n`;
      shareText += `${payLabel}: Option 1 = ${fmt2(o1Pay)} $ (${selectedTerm}m)`;
      if (hasOption2) shareText += ` | Option 2 = ${fmt2(o2Pay)} $`;
      if (showLease && leaseResult) {
        const bestLease = leaseResult.bestLease === 'standard' ? leaseResult.standard : leaseResult.alternative;
        if (bestLease) shareText += `\nLocation ${leaseTerm}m: ${fmt2(bestLease.monthly)} $/mois`;
      }
      if (stickerUrl) shareText += `\n\nWindow Sticker: ${stickerUrl}`;
      shareText += `\n\n- CalcAuto AiPro`;

      // 5. Share via native share sheet
      if (navigator.share && navigator.canShare && navigator.canShare({ files: filesToShare })) {
        await navigator.share({
          text: shareText,
          files: filesToShare,
        });
      } else {
        // Fallback: download image + copy text
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        
        try {
          await navigator.clipboard.writeText(shareText);
          alert(lang === 'fr' ? 'Image téléchargée et texte copié!' : 'Image downloaded and text copied!');
        } catch {
          alert(lang === 'fr' ? 'Image téléchargée!' : 'Image downloaded!');
        }
      }
      
      setShowSmsPreview(false);
    } catch (error: any) {
      console.error('Share error:', error);
      setShowSmsPreview(false);
      // Fallback to text-only SMS
      const message = generateSubmissionText();
      setSmsPreviewText(message);
      setShowSmsPreview(true);
    }
  };

  // Send the SMS message after preview
  const handleSendSms = async () => {
    try {
      if (Platform.OS === 'web') {
        // On web, use the Web Share API if available, otherwise copy to clipboard
        if (navigator.share) {
          await navigator.share({
            title: 'CalcAuto AiPro - Soumission',
            text: smsPreviewText,
          });
        } else {
          // Fallback: open SMS link
          const smsBody = encodeURIComponent(smsPreviewText);
          window.open(`sms:?body=${smsBody}`, '_blank');
        }
      } else {
        // On mobile, use React Native's Share API
        const result = await Share.share({
          message: smsPreviewText,
        });
        
        if (result.action === Share.sharedAction) {
          if (result.activityType) {
            console.log('Shared with activity type:', result.activityType);
          }
        }
      }
      setShowSmsPreview(false);
    } catch (error: any) {
      console.error('Share error:', error);
      if (error.message !== 'User did not share') {
        if (Platform.OS === 'web') {
          alert(lang === 'fr' ? 'Erreur lors du partage' : 'Error sharing');
        } else {
          Alert.alert('Erreur', lang === 'fr' ? 'Erreur lors du partage' : 'Error sharing');
        }
      }
    }
  };

  // Handle Print
  const handlePrint = async () => {
    if (!selectedProgram || !localResult || !vehiclePrice) {
      if (Platform.OS === 'web') {
        alert(lang === 'fr' ? 'Aucune soumission à imprimer' : 'No submission to print');
      } else {
        Alert.alert('Erreur', lang === 'fr' ? 'Aucune soumission à imprimer' : 'No submission to print');
      }
      return;
    }

    const vehicle = `${selectedProgram.brand} ${selectedProgram.model} ${selectedProgram.trim || ''} ${selectedProgram.year}`.trim();
    const option = selectedOption === '2' ? '2' : '1';
    const rate = option === '1' ? localResult.option1Rate : localResult.option2Rate;
    
    let payment: number;
    let paymentLabel: string;
    if (paymentFrequency === 'biweekly') {
      payment = option === '1' ? localResult.option1Biweekly : (localResult.option2Biweekly || 0);
      paymentLabel = lang === 'fr' ? 'Aux 2 semaines' : 'Bi-weekly';
    } else if (paymentFrequency === 'weekly') {
      payment = option === '1' ? localResult.option1Weekly : (localResult.option2Weekly || 0);
      paymentLabel = lang === 'fr' ? 'Hebdomadaire' : 'Weekly';
    } else {
      payment = option === '1' ? localResult.option1Monthly : (localResult.option2Monthly || 0);
      paymentLabel = lang === 'fr' ? 'Mensuel' : 'Monthly';
    }
    
    const vin = selectedInventory?.vin || (manualVin && manualVin.length === 17 ? manualVin : '');
    const consumerCash = selectedProgram.consumer_cash;
    const bonusCash = parseFloat(customBonusCash) || selectedProgram.bonus_cash || 0;
    const price = parseFloat(vehiclePrice) || 0;
    const dossier = parseFloat(fraisDossier) || 0;
    const pneus = parseFloat(taxePneus) || 0;
    const rdprm = parseFloat(fraisRDPRM) || 0;
    const valeurEchange = parseFloat(prixEchange) || 0;
    const comptant = parseFloat(comptantTxInclus) || 0;
    const hasOption2 = selectedProgram.option2_rates !== null && localResult.option2Monthly !== null;
    const bestOpt = localResult.bestOption;
    const savingsAmt = localResult.savings || 0;

    // Format currency helper for inline HTML
    const fmt = (v: number) => v.toLocaleString('fr-CA', { maximumFractionDigits: 0 });
    const fmt2 = (v: number) => v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Build rates table rows
    const terms = [36, 48, 60, 72, 84, 96];
    const ratesRows = terms.map(t => {
      const r1 = getRateForTerm(selectedProgram.option1_rates, t);
      const r2 = selectedProgram.option2_rates ? getRateForTerm(selectedProgram.option2_rates, t) : null;
      const isSelected = t === selectedTerm;
      return `<tr style="${isSelected ? 'background:#e8f5e9; font-weight:bold;' : ''}">
        <td style="text-align:left; padding:8px; border-bottom:1px solid #eee;">${t} ${lang === 'fr' ? 'mois' : 'mo'}${isSelected ? ' ✓' : ''}</td>
        <td style="text-align:center; padding:8px; border-bottom:1px solid #eee; color:#c0392b;">${r1.toFixed(2)}%</td>
        ${hasOption2 ? `<td style="text-align:center; padding:8px; border-bottom:1px solid #eee; color:#1565C0;">${r2 !== null ? r2.toFixed(2) + '%' : '-'}</td>` : ''}
      </tr>`;
    }).join('');

    // Option 1 payment details
    const o1Monthly = localResult.option1Monthly;
    const o1Biweekly = localResult.option1Biweekly;
    const o1Weekly = localResult.option1Weekly;
    const o1Total = localResult.option1Total;
    const o1Payment = paymentFrequency === 'biweekly' ? o1Biweekly : paymentFrequency === 'weekly' ? o1Weekly : o1Monthly;

    // Option 2 payment details
    const o2Monthly = localResult.option2Monthly || 0;
    const o2Biweekly = localResult.option2Biweekly || 0;
    const o2Weekly = localResult.option2Weekly || 0;
    const o2Total = localResult.option2Total || 0;
    const o2Payment = paymentFrequency === 'biweekly' ? o2Biweekly : paymentFrequency === 'weekly' ? o2Weekly : o2Monthly;

    // Create full professional print HTML (matching email format)
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CalcAuto AiPro - Soumission</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
          .container { max-width: 640px; margin: 0 auto; background: #fff; }
          .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 25px 20px; text-align: center; }
          .header h1 { color: #fff; font-size: 26px; margin: 0; }
          .header h1 span { color: #4ECDC4; }
          .header p { color: rgba(255,255,255,0.7); font-size: 13px; margin-top: 4px; }
          .content { padding: 20px; }
          .section { margin-bottom: 20px; }
          .section-title { font-size: 13px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; border-bottom: 2px solid #4ECDC4; padding-bottom: 5px; display: inline-block; }
          
          .vehicle-box { background: #f8f9fa; border-radius: 10px; padding: 15px; border-left: 4px solid #4ECDC4; }
          .vehicle-brand { font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
          .vehicle-model { font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 4px 0; }
          .vehicle-price { font-size: 20px; color: #4ECDC4; font-weight: 700; }
          .vehicle-vin { font-size: 11px; color: #888; font-family: monospace; margin-top: 4px; }
          
          .rates-table { width: 100%; border-collapse: collapse; font-size: 13px; }
          .rates-table th { background: #1a1a2e; color: #fff; padding: 10px; font-size: 12px; }
          .rates-table td { padding: 8px; border-bottom: 1px solid #eee; }
          
          .info-table { width: 100%; font-size: 13px; }
          .info-table td { padding: 8px 4px; border-bottom: 1px solid #f0f0f0; }
          .info-table td:last-child { text-align: right; font-weight: 600; }
          
          .best-choice { background: #e8f5e9; border: 2px solid #4CAF50; border-radius: 10px; padding: 12px; text-align: center; margin-bottom: 20px; }
          .best-choice-title { font-size: 16px; font-weight: 700; color: #2E7D32; }
          .best-choice-savings { font-size: 13px; color: #388E3C; margin-top: 4px; }
          
          .options-grid { display: flex; gap: 10px; }
          .option-card { flex: 1; border-radius: 10px; padding: 15px; border: 2px solid #ddd; }
          .option-card.winner { border-color: #4CAF50; background: #f0fff4; }
          .option-title { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
          .option-title.opt1 { color: #c0392b; }
          .option-title.opt2 { color: #1565C0; }
          .option-detail { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; color: #555; }
          .winner-badge { display: inline-block; background: #4CAF50; color: #fff; font-size: 10px; padding: 2px 8px; border-radius: 10px; margin-left: 5px; }
          
          .payment-box { background: #f8f9fa; border-radius: 8px; padding: 12px; margin-top: 10px; text-align: center; }
          .payment-box.opt1 { border-top: 3px solid #c0392b; }
          .payment-box.opt2 { border-top: 3px solid #1565C0; }
          .payment-label { font-size: 11px; color: #666; }
          .payment-amount { font-size: 24px; font-weight: 700; margin: 4px 0; }
          .payment-amount.opt1 { color: #c0392b; }
          .payment-amount.opt2 { color: #1565C0; }
          .payment-total { font-size: 11px; color: #666; }
          
          .bonus-note { background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 10px; font-size: 12px; color: #856404; margin-top: 15px; }
          
          .footer { background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee; margin-top: 20px; }
          .footer .disclaimer { font-size: 10px; color: #999; margin-top: 8px; line-height: 1.4; }
          
          @media print {
            body { background: #fff; }
            .container { box-shadow: none; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>CalcAuto <span>AiPro</span></h1>
            <p>${lang === 'fr' ? 'Soumission de financement' : 'Financing Submission'}</p>
          </div>
          
          <div class="content">
            <!-- VEHICLE -->
            <div class="section">
              <div class="section-title">${lang === 'fr' ? 'Véhicule' : 'Vehicle'}</div>
              <div class="vehicle-box">
                <div class="vehicle-brand">${selectedProgram.brand}</div>
                <div class="vehicle-model">${selectedProgram.model} ${selectedProgram.trim || ''} ${selectedProgram.year}</div>
                <div class="vehicle-price">${fmt(price)} $</div>
                ${vin ? `<div class="vehicle-vin">VIN: ${vin}</div>` : ''}
              </div>
            </div>
            
            <!-- RATES TABLE -->
            <div class="section">
              <div class="section-title">${lang === 'fr' ? 'Tableau des taux' : 'Rate Table'}</div>
              <table class="rates-table">
                <thead>
                  <tr>
                    <th style="text-align:left;">${lang === 'fr' ? 'Terme' : 'Term'}</th>
                    <th>Option 1</th>
                    ${hasOption2 ? '<th>Option 2</th>' : ''}
                  </tr>
                </thead>
                <tbody>${ratesRows}</tbody>
              </table>
            </div>
            
            <!-- FINANCING DETAILS -->
            <div class="section">
              <div class="section-title">${lang === 'fr' ? 'Détails du financement' : 'Financing Details'}</div>
              <table class="info-table">
                <tr><td>${lang === 'fr' ? 'Prix du véhicule' : 'Vehicle price'}</td><td>${fmt(price)} $</td></tr>
                ${consumerCash > 0 ? `<tr><td>${lang === 'fr' ? 'Rabais (avant taxes)' : 'Rebate (before tax)'}</td><td style="color:#2E7D32;">-${fmt(consumerCash)} $</td></tr>` : ''}
                ${bonusCash > 0 ? `<tr><td>Bonus Cash ${lang === 'fr' ? '(après taxes)' : '(after tax)'}</td><td style="color:#2E7D32;">-${fmt(bonusCash)} $</td></tr>` : ''}
                ${dossier > 0 ? `<tr><td>${lang === 'fr' ? 'Frais dossier' : 'Admin fees'}</td><td>${fmt2(dossier)} $</td></tr>` : ''}
                ${pneus > 0 ? `<tr><td>${lang === 'fr' ? 'Taxe pneus' : 'Tire tax'}</td><td>${fmt(pneus)} $</td></tr>` : ''}
                ${rdprm > 0 ? `<tr><td>RDPRM</td><td>${fmt(rdprm)} $</td></tr>` : ''}
                ${valeurEchange > 0 ? `<tr><td>${lang === 'fr' ? 'Valeur échange' : 'Trade-in value'}</td><td style="color:#2E7D32;">-${fmt(valeurEchange)} $</td></tr>` : ''}
                ${comptant > 0 ? `<tr><td>${lang === 'fr' ? 'Comptant (tx inclus)' : 'Down payment (tax incl.)'}</td><td>-${fmt(comptant)} $</td></tr>` : ''}
                <tr><td>${lang === 'fr' ? 'Terme sélectionné' : 'Selected term'}</td><td><strong>${selectedTerm} ${lang === 'fr' ? 'mois' : 'months'}</strong></td></tr>
                <tr><td>${lang === 'fr' ? 'Fréquence' : 'Frequency'}</td><td><strong>${paymentLabel}</strong></td></tr>
              </table>
            </div>

            <!-- BEST CHOICE BANNER -->
            ${hasOption2 && savingsAmt > 0 ? `
            <div class="best-choice">
              <div class="best-choice-title">Option ${bestOpt} = ${lang === 'fr' ? 'Meilleur choix!' : 'Best choice!'}</div>
              <div class="best-choice-savings">${lang === 'fr' ? 'Économies de' : 'Savings of'} <strong>${fmt(savingsAmt)} $</strong> ${lang === 'fr' ? 'sur le coût total' : 'on total cost'}</div>
            </div>` : ''}

            <!-- OPTIONS COMPARISON -->
            <div class="section">
              <div class="section-title">${lang === 'fr' ? 'Comparaison des options' : 'Options Comparison'}</div>
              <div class="options-grid">
                <!-- OPTION 1 -->
                <div class="option-card ${bestOpt === '1' ? 'winner' : ''}">
                  <div class="option-title opt1">Option 1 ${bestOpt === '1' ? '<span class="winner-badge">✓</span>' : ''}</div>
                  <div style="font-size:11px; color:#666; margin-bottom:8px;">${lang === 'fr' ? 'Rabais + Taux standard' : 'Rebate + Standard rate'}</div>
                  <div class="option-detail"><span>${lang === 'fr' ? 'Rabais:' : 'Rebate:'}</span><span style="color:#2E7D32; font-weight:600;">${consumerCash > 0 ? '-' + fmt(consumerCash) + ' $' : '$0'}</span></div>
                  <div class="option-detail"><span>${lang === 'fr' ? 'Capital:' : 'Principal:'}</span><span>${fmt(localResult.principalOption1 || 0)} $</span></div>
                  <div class="option-detail"><span>${lang === 'fr' ? 'Taux:' : 'Rate:'}</span><span style="color:#c0392b;">${localResult.option1Rate}%</span></div>
                  <div class="payment-box opt1">
                    <div class="payment-label">${paymentLabel}</div>
                    <div class="payment-amount opt1">${fmt2(o1Payment)} $</div>
                    <div class="payment-total">Total (${selectedTerm} ${lang === 'fr' ? 'mois' : 'mo'}): <strong>${fmt(o1Total)} $</strong></div>
                  </div>
                </div>
                
                <!-- OPTION 2 -->
                ${hasOption2 ? `
                <div class="option-card ${bestOpt === '2' ? 'winner' : ''}">
                  <div class="option-title opt2">Option 2 ${bestOpt === '2' ? '<span class="winner-badge">✓</span>' : ''}</div>
                  <div style="font-size:11px; color:#666; margin-bottom:8px;">$0 ${lang === 'fr' ? 'rabais + Taux réduit' : 'rebate + Reduced rate'}</div>
                  <div class="option-detail"><span>${lang === 'fr' ? 'Rabais:' : 'Rebate:'}</span><span>$0</span></div>
                  <div class="option-detail"><span>${lang === 'fr' ? 'Capital:' : 'Principal:'}</span><span>${fmt(localResult.principalOption2 || 0)} $</span></div>
                  <div class="option-detail"><span>${lang === 'fr' ? 'Taux:' : 'Rate:'}</span><span style="color:#1565C0;">${localResult.option2Rate}%</span></div>
                  <div class="payment-box opt2">
                    <div class="payment-label">${paymentLabel}</div>
                    <div class="payment-amount opt2">${fmt2(o2Payment)} $</div>
                    <div class="payment-total">Total (${selectedTerm} ${lang === 'fr' ? 'mois' : 'mo'}): <strong>${fmt(o2Total)} $</strong></div>
                  </div>
                </div>
                ` : `
                <div class="option-card" style="background:#f5f5f5; text-align:center; color:#999;">
                  <div class="option-title" style="color:#999;">Option 2</div>
                  <div style="padding:30px 0;">${lang === 'fr' ? 'Non disponible' : 'Not available'}<br/>${lang === 'fr' ? 'pour ce véhicule' : 'for this vehicle'}</div>
                </div>
                `}
              </div>
            </div>
            
            ${bonusCash > 0 ? `<div class="bonus-note">Bonus Cash de ${fmt(bonusCash)} $ ${lang === 'fr' ? 'sera déduit après taxes (au comptant)' : 'will be deducted after tax (as cash)'}</div>` : ''}
            
            ${showLease && leaseResult && (leaseResult.standard || leaseResult.alternative) ? `
            <!-- LOCATION SCI -->
            <div class="section" style="margin-top:20px;">
              <div class="section-title" style="border-color:#FFD700;">
                ${lang === 'fr' ? 'Location SCI' : 'SCI Lease'}
              </div>
              
              <table class="info-table" style="margin-bottom:12px;">
                <tr><td>${lang === 'fr' ? 'Kilométrage / an' : 'Km / year'}</td><td><strong>${(leaseKmPerYear/1000).toFixed(0)}k km</strong></td></tr>
                <tr><td>${lang === 'fr' ? 'Terme location' : 'Lease term'}</td><td><strong>${leaseTerm} ${lang === 'fr' ? 'mois' : 'months'}</strong></td></tr>
                <tr><td>${lang === 'fr' ? 'Résiduel' : 'Residual'}</td><td><strong>${leaseResult.residualPct}%${leaseResult.kmAdjustment ? ` (+${leaseResult.kmAdjustment}%)` : ''} = ${fmt(Math.round(leaseResult.residualValue))} $</strong></td></tr>
              </table>
              
              ${leaseResult.bestLease && leaseResult.standard && leaseResult.alternative ? `
              <div class="best-choice" style="border-color:#FFD700; background:#fffde7;">
                <div class="best-choice-title" style="color:#F57F17;">
                  ${leaseResult.bestLease === 'standard' ? 'Std + Lease Cash' : (lang === 'fr' ? 'Taux Alternatif' : 'Alt. Rate')} = ${lang === 'fr' ? 'Meilleur choix location!' : 'Best lease choice!'}
                </div>
                ${leaseResult.leaseSavings > 0 ? `<div class="best-choice-savings" style="color:#F9A825;">${lang === 'fr' ? 'Économies de' : 'Savings of'} <strong>${fmt(Math.round(leaseResult.leaseSavings))} $</strong></div>` : ''}
              </div>
              ` : ''}
              
              <div class="options-grid">
                ${leaseResult.standard ? `
                <div class="option-card ${leaseResult.bestLease === 'standard' ? 'winner' : ''}">
                  <div class="option-title" style="color:#E65100;">Std + Lease Cash ${leaseResult.bestLease === 'standard' ? '<span class="winner-badge" style="background:#FFD700;color:#000;">✓</span>' : ''}</div>
                  ${leaseResult.standard.leaseCash > 0 ? `<div class="option-detail"><span>Lease Cash:</span><span style="color:#2E7D32; font-weight:600;">-${fmt(leaseResult.standard.leaseCash)} $</span></div>` : ''}
                  <div class="option-detail"><span>${lang === 'fr' ? 'Taux:' : 'Rate:'}</span><span style="color:#E65100;">${leaseResult.standard.rate}%</span></div>
                  <div class="payment-box" style="border-top:3px solid #E65100;">
                    <div class="payment-label">${paymentLabel}</div>
                    <div class="payment-amount" style="color:#E65100;">${fmt2(paymentFrequency === 'biweekly' ? leaseResult.standard.biweekly : paymentFrequency === 'weekly' ? leaseResult.standard.weekly : leaseResult.standard.monthly)} $</div>
                    <div class="payment-total">${lang === 'fr' ? 'Avant taxes' : 'Before tax'}: ${fmt2(leaseResult.standard.monthlyBeforeTax)} $ | TPS: ${fmt2(leaseResult.standard.tpsOnPayment)} $ | TVQ: ${fmt2(leaseResult.standard.tvqOnPayment)} $</div>
                    <div class="payment-total">Total (${leaseTerm} ${lang === 'fr' ? 'mois' : 'mo'}): <strong>${fmt(Math.round(leaseResult.standard.total))} $</strong></div>
                    <div class="payment-total" style="color:#c00;">${lang === 'fr' ? "Coût d'emprunt" : 'Borrowing cost'}: <strong>${fmt2(leaseResult.standard.coutEmprunt)} $</strong></div>
                  </div>
                </div>
                ` : ''}
                
                ${leaseResult.alternative ? `
                <div class="option-card ${leaseResult.bestLease === 'alternative' ? 'winner' : ''}">
                  <div class="option-title" style="color:#0277BD;">${lang === 'fr' ? 'Taux Alternatif' : 'Alt. Rate'} ${leaseResult.bestLease === 'alternative' ? '<span class="winner-badge" style="background:#FFD700;color:#000;">✓</span>' : ''}</div>
                  <div class="option-detail"><span>Lease Cash:</span><span>$0</span></div>
                  <div class="option-detail"><span>${lang === 'fr' ? 'Taux:' : 'Rate:'}</span><span style="color:#0277BD;">${leaseResult.alternative.rate}%</span></div>
                  <div class="payment-box" style="border-top:3px solid #0277BD;">
                    <div class="payment-label">${paymentLabel}</div>
                    <div class="payment-amount" style="color:#0277BD;">${fmt2(paymentFrequency === 'biweekly' ? leaseResult.alternative.biweekly : paymentFrequency === 'weekly' ? leaseResult.alternative.weekly : leaseResult.alternative.monthly)} $</div>
                    <div class="payment-total">${lang === 'fr' ? 'Avant taxes' : 'Before tax'}: ${fmt2(leaseResult.alternative.monthlyBeforeTax)} $ | TPS: ${fmt2(leaseResult.alternative.tpsOnPayment)} $ | TVQ: ${fmt2(leaseResult.alternative.tvqOnPayment)} $</div>
                    <div class="payment-total">Total (${leaseTerm} ${lang === 'fr' ? 'mois' : 'mo'}): <strong>${fmt(Math.round(leaseResult.alternative.total))} $</strong></div>
                    <div class="payment-total" style="color:#c00;">${lang === 'fr' ? "Coût d'emprunt" : 'Borrowing cost'}: <strong>${fmt2(leaseResult.alternative.coutEmprunt)} $</strong></div>
                  </div>
                </div>
                ` : ''}
              </div>
              
              <!-- Lease vs Finance summary -->
              <div style="margin-top:15px; background:#f8f9fa; border-radius:10px; padding:15px; text-align:center;">
                <div style="font-size:14px; font-weight:700; color:#F57F17; margin-bottom:10px;">${lang === 'fr' ? 'Location vs Financement' : 'Lease vs Finance'}</div>
                <div style="display:flex; gap:20px; justify-content:center;">
                  <div>
                    <div style="font-size:11px; color:#666;">${lang === 'fr' ? 'Meilleure Location' : 'Best Lease'}</div>
                    <div style="font-size:20px; font-weight:700; color:#E65100;">${fmt2(paymentFrequency === 'biweekly' ? (leaseResult.bestLease === 'standard' ? leaseResult.standard?.biweekly : leaseResult.alternative?.biweekly) || 0 : paymentFrequency === 'weekly' ? (leaseResult.bestLease === 'standard' ? leaseResult.standard?.weekly : leaseResult.alternative?.weekly) || 0 : (leaseResult.bestLease === 'standard' ? leaseResult.standard?.monthly : leaseResult.alternative?.monthly) || 0)} $</div>
                    <div style="font-size:10px; color:#999;">${leaseTerm} ${lang === 'fr' ? 'mois' : 'mo'}</div>
                  </div>
                  <div style="width:1px; background:#ddd;"></div>
                  <div>
                    <div style="font-size:11px; color:#666;">${lang === 'fr' ? 'Meilleur Financement' : 'Best Finance'}</div>
                    <div style="font-size:20px; font-weight:700; color:#4ECDC4;">${fmt2(paymentFrequency === 'biweekly' ? (localResult.bestOption === '2' && localResult.option2Biweekly ? localResult.option2Biweekly : localResult.option1Biweekly) : paymentFrequency === 'weekly' ? (localResult.bestOption === '2' && localResult.option2Weekly ? localResult.option2Weekly : localResult.option1Weekly) : (localResult.bestOption === '2' && localResult.option2Monthly ? localResult.option2Monthly : localResult.option1Monthly))} $</div>
                    <div style="font-size:10px; color:#999;">${selectedTerm} ${lang === 'fr' ? 'mois' : 'mo'}</div>
                  </div>
                </div>
              </div>
            </div>
            ` : ''}
          </div>
          
          <div class="footer">
            <div style="font-size:12px; color:#666;">${lang === 'fr' ? 'Généré le' : 'Generated on'} ${new Date().toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA')}</div>
            <div class="disclaimer">
              ${lang === 'fr' 
                ? 'Ce calcul est une estimation et ne constitue pas une offre de financement officielle. Les taux et conditions peuvent varier selon votre dossier de crédit.'
                : 'This calculation is an estimate and does not constitute an official financing offer. Rates and conditions may vary based on your credit file.'}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    if (Platform.OS === 'web') {
      // On web, open print dialog
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 250);
      }
    } else {
      // On mobile, use expo-print for native print dialog
      try {
        await Print.printAsync({
          html: printContent,
        });
      } catch (e) {
        // User cancelled print or error - silently ignore
        console.log('Print cancelled or error:', e);
      }
    }
  };

  // Handle Export Excel
  const handleExportExcel = async () => {
    if (!selectedInventory && !selectedProgram) {
      if (Platform.OS === 'web') {
        alert(lang === 'fr' ? 'Aucune donnée à exporter' : 'No data to export');
      } else {
        Alert.alert('Erreur', lang === 'fr' ? 'Aucune donnée à exporter' : 'No data to export');
      }
      return;
    }

    try {
      const exportData = {
        vin: selectedInventory?.vin || manualVin || '',
        model_code: selectedInventory?.model_code || selectedProgram?.code || '',
        brand: selectedInventory?.brand || selectedProgram?.brand || '',
        model: selectedInventory?.model || selectedProgram?.model || '',
        trim: selectedInventory?.trim || selectedProgram?.trim || '',
        year: selectedInventory?.year?.toString() || selectedProgram?.year || '',
        stock_no: selectedInventory?.stock_no || '',
        ep_cost: selectedInventory?.ep_cost || 0,
        pdco: selectedInventory?.pdco || selectedInventory?.msrp || 0,
        pref: selectedInventory?.pref || 0,
        holdback: selectedInventory?.holdback || 0,
        subtotal: selectedInventory?.subtotal || 0,
        total: selectedInventory?.total || 0,
        options: selectedInventory?.options || []
      };

      const response = await fetch(`${API_URL}/api/invoice/export-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify(exportData)
      });

      const result = await response.json();

      if (result.success && result.excel_base64) {
        if (Platform.OS === 'web') {
          // Download the file on web
          const byteCharacters = atob(result.excel_base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = result.filename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          alert(lang === 'fr' ? `Fichier téléchargé: ${result.filename}` : `File downloaded: ${result.filename}`);
        } else {
          // Mobile: sauvegarder et partager le fichier
          const filename = result.filename || 'facture_export.xlsx';
          const fileUri = FileSystem.documentDirectory + filename;
          await FileSystem.writeAsStringAsync(fileUri, result.excel_base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: lang === 'fr' ? 'Exporter Excel' : 'Export Excel',
          });
        }
      } else {
        throw new Error(result.detail || 'Export failed');
      }
    } catch (error: any) {
      console.error('Excel export error:', error);
      if (Platform.OS === 'web') {
        alert(lang === 'fr' ? `Erreur export: ${error.message}` : `Export error: ${error.message}`);
      } else {
        Alert.alert('Erreur', error.message);
      }
    }
  };

  // Calculate monthly payment
  // Get unique years and brands for filters
  const years = [...new Set(programs.map(p => p.year))].sort((a, b) => b - a);
  const brands = [...new Set(programs.map(p => p.brand))].sort();

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
      {/* Animated Splash Screen */}
      <AnimatedSplashScreen 
        visible={showSplash} 
        onFinish={() => setShowSplash(false)} 
      />
      
      {/* Loading Animation */}
      <LoadingBorderAnimation loading={programsLoading && !showSplash} />
      
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{flex: 1}}>
            <Text style={styles.headerTitle}>{t.title}</Text>
            <TouchableOpacity 
              style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#2d2d44', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 4}}
              onPress={() => setShowPeriodSelector(true)}
            >
              <Ionicons name="calendar-outline" size={14} color="#4ECDC4" />
              <Text style={{color: '#4ECDC4', fontSize: 13, fontWeight: '600', marginLeft: 6}}>
                {currentPeriod ? `${monthNames[lang][currentPeriod.month]} ${currentPeriod.year}` : 'Période'}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#4ECDC4" style={{marginLeft: 4}} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerActions}>
            <LanguageSelector
              currentLanguage={lang}
              onLanguageChange={handleLanguageChange}
            />
            <TouchableOpacity
              style={styles.importButton}
              onPress={() => setShowImportModal(true)}
            >
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.importButton, {backgroundColor: '#e74c3c', marginLeft: 8}]}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Period Selector Modal */}
        <Modal
          visible={showPeriodSelector}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPeriodSelector(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.periodModal}>
              <View style={styles.periodModalHeader}>
                <Text style={styles.periodModalTitle}>
                  {lang === 'fr' ? 'Choisir la période' : 'Select Period'}
                </Text>
                <TouchableOpacity onPress={() => setShowPeriodSelector(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.periodList}>
                {availablePeriods.map((period, index) => (
                  <TouchableOpacity
                    key={`${period.month}-${period.year}`}
                    style={[
                      styles.periodItem,
                      currentPeriod?.month === period.month && currentPeriod?.year === period.year && styles.periodItemActive
                    ]}
                    onPress={() => {
                      setProgramsLoading(true);
                      loadPrograms(period.month, period.year);
                      setShowPeriodSelector(false);
                    }}
                  >
                    <Text style={[
                      styles.periodItemText,
                      currentPeriod?.month === period.month && currentPeriod?.year === period.year && styles.periodItemTextActive
                    ]}>
                      {monthNames[lang][period.month]} {period.year}
                    </Text>
                    <Text style={styles.periodItemCount}>
                      {period.count} {lang === 'fr' ? 'véhicules' : 'vehicles'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

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
            <Text style={styles.filterLabel}>{t.filters.year}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              <View style={styles.filterRow}>
                <FilterButton 
                  active={selectedYear === null} 
                  onPress={() => handleYearPress(null)} 
                  label={t.filters.all} 
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
            <Text style={styles.filterLabel}>{t.filters.brand}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              <View style={styles.filterRow}>
                <FilterButton 
                  active={selectedBrand === null} 
                  onPress={() => handleBrandPress(null)} 
                  label={t.filters.all} 
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
              {t.vehicle.selectVehicle} ({filteredPrograms.length})
            </Text>
            {programsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#4ECDC4" />
                <Text style={styles.loadingText}>{t.loadingPrograms}</Text>
              </View>
            ) : filteredPrograms.length === 0 ? (
              <Text style={styles.noDataText}>{t.vehicle.noPrograms}</Text>
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
                    <Text style={styles.ratesHeaderCell}>{t.term.selectTerm}</Text>
                    <Text style={styles.ratesHeaderCell}>{t.options.option1}</Text>
                    {selectedProgram.option2_rates && (
                      <Text style={styles.ratesHeaderCell}>{t.options.option2}</Text>
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
                        {term} {t.term.months}
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
                      <Text style={styles.rebateLabel}>{t.results.rebate} ({t.results.beforeTax}):</Text>
                      <Text style={styles.rebateValue}>{formatCurrency(selectedProgram.consumer_cash)}</Text>
                    </View>
                  )}
                  {selectedProgram.bonus_cash > 0 && (
                    <View style={styles.rebateItem}>
                      <Ionicons name="gift-outline" size={14} color="#FFD700" />
                      <Text style={styles.rebateLabelBonus}>{t.results.bonusCash} ({t.results.afterTax}):</Text>
                      <Text style={styles.rebateValueBonus}>{formatCurrency(selectedProgram.bonus_cash)}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            
            {/* Section Accessoires */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="add-circle-outline" size={20} color="#4CAF50" />
                <Text style={styles.sectionTitle}>
                  {lang === 'fr' ? 'Accessoires' : 'Accessories'}
                </Text>
              </View>
              
              {accessories.map((acc, index) => (
                <View key={index} style={styles.accessoryRow}>
                  <TextInput
                    style={[styles.input, styles.accessoryDescInput]}
                    placeholder={lang === 'fr' ? 'Description' : 'Description'}
                    placeholderTextColor="#666"
                    value={acc.description}
                    onChangeText={(text) => {
                      const newAcc = [...accessories];
                      newAcc[index].description = text;
                      setAccessories(newAcc);
                    }}
                  />
                  <TextInput
                    style={[styles.input, styles.accessoryPriceInput]}
                    placeholder="$"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                    value={acc.price}
                    onChangeText={(text) => {
                      const newAcc = [...accessories];
                      newAcc[index].price = text;
                      setAccessories(newAcc);
                    }}
                  />
                  <TouchableOpacity
                    style={styles.removeAccessoryBtn}
                    onPress={() => {
                      const newAcc = accessories.filter((_, i) => i !== index);
                      setAccessories(newAcc);
                    }}
                  >
                    <Ionicons name="close-circle" size={24} color="#FF5252" />
                  </TouchableOpacity>
                </View>
              ))}
              
              <TouchableOpacity
                style={styles.addAccessoryBtn}
                onPress={() => setAccessories([...accessories, { description: '', price: '' }])}
              >
                <Ionicons name="add" size={20} color="#4CAF50" />
                <Text style={styles.addAccessoryText}>
                  {lang === 'fr' ? 'Ajouter un accessoire' : 'Add accessory'}
                </Text>
              </TouchableOpacity>
              
              {accessories.length > 0 && (
                <View style={styles.accessoriesTotalRow}>
                  <Text style={styles.accessoriesTotalLabel}>
                    {lang === 'fr' ? 'Total accessoires:' : 'Total accessories:'}
                  </Text>
                  <Text style={styles.accessoriesTotalValue}>
                    {formatCurrency(accessories.reduce((sum, acc) => sum + (parseFloat(acc.price) || 0), 0))}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Inventory Selection - Filtered by selected brand */}
          {selectedProgram && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {lang === 'fr' ? '📦 Inventaire disponible' : '📦 Available Inventory'} ({inventoryList.length})
              </Text>
              <Text style={styles.inventorySubtitle}>
                {lang === 'fr' 
                  ? `Véhicules ${selectedProgram.brand} ${selectedProgram.year} en stock`
                  : `${selectedProgram.brand} ${selectedProgram.year} vehicles in stock`}
              </Text>
              {inventoryList.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.inventoryScroll}>
                  {inventoryList
                    .filter(v => v.brand?.toLowerCase() === selectedProgram.brand?.toLowerCase() && String(v.year) === String(selectedProgram.year))
                    .map((vehicle) => (
                      <TouchableOpacity
                        key={vehicle.id}
                        style={[
                          styles.inventoryCard,
                          selectedInventory?.id === vehicle.id && styles.inventoryCardSelected
                        ]}
                        onPress={() => {
                          setSelectedInventory(vehicle);
                          setManualVin('');  // Clear manual VIN when selecting from inventory
                          setVehiclePrice(String(vehicle.asking_price || vehicle.msrp || ''));
                        }}
                      >
                        <Text style={styles.inventoryStock}>#{vehicle.stock_no}</Text>
                        <Text style={styles.inventoryModel}>
                          {vehicle.year} {vehicle.model}
                        </Text>
                        <Text style={styles.inventoryTrim}>{vehicle.trim}</Text>
                        {vehicle.vin && (
                          <Text style={styles.inventoryVin}>VIN: {vehicle.vin}</Text>
                        )}
                        <Text style={styles.inventoryPrice}>
                          {formatCurrency(vehicle.asking_price || vehicle.msrp)}
                        </Text>
                        {vehicle.net_cost && (
                          <Text style={styles.inventoryProfit}>
                            Profit: {formatCurrency((vehicle.asking_price || vehicle.msrp) - vehicle.net_cost)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  {inventoryList.filter(v => v.brand?.toLowerCase() === selectedProgram.brand?.toLowerCase() && String(v.year) === String(selectedProgram.year)).length === 0 && (
                    <View style={styles.noInventoryContainer}>
                      <Text style={styles.noInventoryText}>
                        {lang === 'fr' 
                          ? `Aucun véhicule ${selectedProgram.brand} ${selectedProgram.year} en inventaire`
                          : `No ${selectedProgram.brand} ${selectedProgram.year} vehicles in inventory`}
                      </Text>
                      <View style={styles.manualVinContainer}>
                        <Text style={styles.manualVinLabel}>
                          {lang === 'fr' ? 'VIN manuel (optionnel):' : 'Manual VIN (optional):'}
                        </Text>
                        <TextInput
                          style={styles.manualVinInput}
                          value={manualVin}
                          onChangeText={(text) => setManualVin(text.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                          placeholder="Ex: 1C4RJKBG5S8806267"
                          placeholderTextColor="#666"
                          maxLength={17}
                          autoCapitalize="characters"
                        />
                        {manualVin.length > 0 && manualVin.length !== 17 && (
                          <Text style={styles.manualVinError}>
                            {lang === 'fr' ? `${manualVin.length}/17 caractères` : `${manualVin.length}/17 characters`}
                          </Text>
                        )}
                        {manualVin.length === 17 && (
                          <Text style={styles.manualVinSuccess}>
                            ✓ {lang === 'fr' ? 'VIN valide - Window Sticker sera inclus' : 'Valid VIN - Window Sticker will be included'}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                </ScrollView>
              ) : (
                <Text style={styles.noInventoryText}>
                  {lang === 'fr' ? 'Chargement de l\'inventaire...' : 'Loading inventory...'}
                </Text>
              )}
            </View>
          )}

          {/* Price Input and Calculation */}
          {selectedProgram && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t.vehicle.vehiclePrice}</Text>
              
              {/* Selected inventory info */}
              {selectedInventory && (
                <View style={styles.selectedInventoryBanner}>
                  <View style={styles.selectedInventoryInfo}>
                    <Ionicons name="car-sport" size={20} color="#4ECDC4" />
                    <Text style={styles.selectedInventoryText}>
                      Stock #{selectedInventory.stock_no} - {selectedInventory.year} {selectedInventory.brand} {selectedInventory.model} {selectedInventory.trim}
                    </Text>
                  </View>
                  {selectedInventory.vin && (
                    <Text style={styles.selectedInventoryVin}>VIN: {selectedInventory.vin}</Text>
                  )}
                  <TouchableOpacity onPress={() => { setSelectedInventory(null); setVehiclePrice(''); setAutoFinancing(null); }}>
                    <Ionicons name="close-circle" size={22} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              )}
              
              {/* Promotions automatiques détectées */}
              {autoFinancing && (selectedInventory || selectedProgram) && (
                <View style={styles.autoFinancingBanner}>
                  <View style={styles.autoFinancingHeader}>
                    <Ionicons name="flash" size={18} color="#FFD700" />
                    <Text style={styles.autoFinancingTitle}>
                      {lang === 'fr' ? 'Promotions détectées automatiquement' : 'Auto-detected Promotions'}
                    </Text>
                  </View>
                  <View style={styles.autoFinancingContent}>
                    {autoFinancing.consumer_cash > 0 && (
                      <View style={styles.autoFinancingItem}>
                        <Text style={styles.autoFinancingLabel}>Consumer Cash:</Text>
                        <Text style={styles.autoFinancingValue}>{formatCurrency(autoFinancing.consumer_cash)}</Text>
                      </View>
                    )}
                    {autoFinancing.bonus_cash > 0 && (
                      <View style={styles.autoFinancingItem}>
                        <Text style={styles.autoFinancingLabel}>Bonus Cash:</Text>
                        <Text style={styles.autoFinancingValueBonus}>+{formatCurrency(autoFinancing.bonus_cash)}</Text>
                      </View>
                    )}
                    {(autoFinancing.consumer_cash > 0 || autoFinancing.bonus_cash > 0) && (
                      <View style={styles.autoFinancingItem}>
                        <Text style={styles.autoFinancingLabelTotal}>
                          {lang === 'fr' ? 'Total rabais:' : 'Total rebates:'}
                        </Text>
                        <Text style={styles.autoFinancingValueTotal}>
                          {formatCurrency(autoFinancing.consumer_cash + autoFinancing.bonus_cash)}
                        </Text>
                      </View>
                    )}
                    {autoFinancing.option2_rates && Object.values(autoFinancing.option2_rates).some(v => v !== null && v < 5) && (
                      <View style={styles.autoFinancingItem}>
                        <Text style={styles.autoFinancingLabel}>Option 2:</Text>
                        <Text style={styles.autoFinancingValueRate}>
                          {lang === 'fr' ? 'Taux réduits disponibles' : 'Reduced rates available'}
                        </Text>
                      </View>
                    )}
                  </View>
                  {autoFinancing.programme_source && (
                    <Text style={styles.autoFinancingSource}>
                      Source: {autoFinancing.programme_source}
                    </Text>
                  )}
                </View>
              )}
              
              {/* Prix du véhicule */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t.vehicle.vehiclePrice}</Text>
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
                <Text style={styles.inputLabel}>{t.results.bonusCash} ({t.results.afterTax})</Text>
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

              {/* Comptant (tx inclus) */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{lang === 'fr' ? 'Comptant (tx inclus)' : 'Cash Down (tax incl.)'}</Text>
                <View style={styles.inputContainer}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="0"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                    value={comptantTxInclus}
                    onChangeText={setComptantTxInclus}
                  />
                </View>
              </View>

              {/* Frais additionnels (taxables) */}
              <View style={styles.feesSection}>
                <Text style={styles.feesSectionTitle}>{t.fees.title}</Text>
                <View style={styles.feesRow}>
                  <View style={styles.feeField}>
                    <Text style={styles.feeLabel}>{t.fees.dossier}</Text>
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
                    <Text style={styles.feeLabel}>{t.fees.tires}</Text>
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
                    <Text style={styles.feeLabel}>{t.fees.rdprm}</Text>
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
                <Text style={styles.feesSectionTitle}>{t.exchange.title}</Text>
                <View style={styles.exchangeRow}>
                  <View style={styles.exchangeField}>
                    <Text style={styles.feeLabel}>{t.exchange.value}</Text>
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
                    <Text style={styles.feeNote}>{t.exchange.reducesAmount}</Text>
                  </View>
                  <View style={styles.exchangeField}>
                    <Text style={styles.feeLabel}>{t.exchange.owed}</Text>
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
                    <Text style={styles.feeNote}>{t.exchange.addedToFinancing}</Text>
                  </View>
                </View>
              </View>

              {/* Sélection du terme */}
              <View style={styles.termSection}>
                <Text style={styles.inputLabel}>{t.term.selectTerm}</Text>
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
                        {term} {t.term.months}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Fréquence de paiement */}
              <View style={styles.termSection}>
                <Text style={styles.inputLabel}>{t.frequency.title}</Text>
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
                <Text style={styles.inputLabel}>{t.options.chooseOption}</Text>
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
                      {t.options.option1}
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
                        {t.options.option2}
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
                      <Text style={styles.optionButtonTextDisabled}>{t.options.option2}</Text>
                      <Text style={styles.optionButtonTextDisabled}>{t.options.notAvailable}</Text>
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
                {t.results.title} - {selectedTerm} {t.term.months}
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
                    {localResult.bestOption === '1' ? t.options.option1 : t.options.option2} = {t.results.bestChoice}
                  </Text>
                  {localResult.savings > 0 && (
                    <Text style={styles.bestOptionSavings}>
                      {t.results.savings}: {formatCurrency(localResult.savings)}
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
                    <Text style={styles.optionCardTitle}>{t.options.option1}</Text>
                    {localResult.bestOption === '1' && (
                      <Ionicons name="checkmark-circle" size={18} color="#4ECDC4" />
                    )}
                  </View>
                  <Text style={styles.optionSubtitle}>{t.options.option1Desc}</Text>
                  
                  {selectedProgram.consumer_cash > 0 && (
                    <View style={styles.optionDetail}>
                      <Text style={styles.optionDetailLabel}>{t.results.rebate}:</Text>
                      <Text style={styles.optionDetailValue}>{formatCurrency(selectedProgram.consumer_cash)}</Text>
                    </View>
                  )}
                  <View style={styles.optionDetail}>
                    <Text style={styles.optionDetailLabel}>{t.results.financedCapital}:</Text>
                    <Text style={styles.optionDetailValue}>{formatCurrency(localResult.principalOption1)}</Text>
                  </View>
                  <View style={styles.optionDetail}>
                    <Text style={styles.optionDetailLabel}>{t.results.rate}:</Text>
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
                    <Text style={styles.optionDetailLabel}>{t.results.total} ({selectedTerm} {t.term.months}):</Text>
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
                    <Text style={styles.optionCardTitle}>{t.options.option2}</Text>
                    {localResult.bestOption === '2' && (
                      <Ionicons name="checkmark-circle" size={18} color="#4ECDC4" />
                    )}
                  </View>
                  <Text style={styles.optionSubtitle}>{t.options.option2Desc}</Text>
                  
                  {localResult.option2Rate !== null ? (
                    <>
                      <View style={styles.optionDetail}>
                        <Text style={styles.optionDetailLabel}>{t.results.rebate}:</Text>
                        <Text style={styles.optionDetailValue}>$0</Text>
                      </View>
                      <View style={styles.optionDetail}>
                        <Text style={styles.optionDetailLabel}>{t.results.financedCapital}:</Text>
                        <Text style={styles.optionDetailValue}>{formatCurrency(localResult.principalOption2)}</Text>
                      </View>
                      <View style={styles.optionDetail}>
                        <Text style={styles.optionDetailLabel}>{t.results.rate}:</Text>
                        <Text style={styles.optionRateValue}>{localResult.option2Rate}%</Text>
                      </View>
                      <View style={styles.optionMainResult}>
                        <Text style={styles.optionMonthlyLabel}>
                          {paymentFrequency === 'monthly' ? t.frequency.monthly : paymentFrequency === 'biweekly' ? t.frequency.biweekly : t.frequency.weekly}
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
                        <Text style={styles.optionDetailLabel}>{t.results.total} ({selectedTerm} {t.term.months}):</Text>
                        <Text style={styles.optionTotalValue}>{formatCurrency(localResult.option2Total!)}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.noOption}>
                      <Ionicons name="close-circle-outline" size={32} color="#666" />
                      <Text style={styles.noOptionText}>{t.options.notAvailable}</Text>
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
                    {t.results.bonusCash} de {formatCurrency(parseFloat(customBonusCash) || selectedProgram.bonus_cash)} sera déduit après taxes (au comptant)
                  </Text>
                </View>
              )}
              
              {/* Send by Email Button */}
              <TouchableOpacity
                style={styles.sendEmailButton}
                onPress={() => setShowEmailModal(true)}
                data-testid="send-email-btn"
              >
                <Ionicons name="mail-outline" size={20} color="#fff" />
                <Text style={styles.sendEmailButtonText}>
                  {lang === 'fr' ? 'Envoyer par email' : 'Send by email'}
                </Text>
              </TouchableOpacity>
              
              {/* Share Actions Row */}
              <View style={styles.shareActionsRow}>
                {/* Share via SMS Button */}
                <TouchableOpacity
                  style={styles.shareSmsButton}
                  onPress={handleShareSMS}
                  data-testid="share-sms-btn"
                >
                  <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                  <Text style={styles.shareButtonText}>
                    {lang === 'fr' ? 'Texto' : 'SMS'}
                  </Text>
                </TouchableOpacity>
                
                {/* Print Button */}
                <TouchableOpacity
                  style={styles.printButton}
                  onPress={handlePrint}
                  data-testid="print-btn"
                >
                  <Ionicons name="print-outline" size={18} color="#fff" />
                  <Text style={styles.shareButtonText}>
                    {lang === 'fr' ? 'Imprimer' : 'Print'}
                  </Text>
                </TouchableOpacity>
                
                {/* Export Excel Button */}
                <TouchableOpacity
                  style={styles.exportExcelButton}
                  onPress={handleExportExcel}
                  data-testid="export-excel-btn"
                >
                  <Ionicons name="document-outline" size={18} color="#fff" />
                  <Text style={styles.shareButtonText}>
                    Excel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ============ LOCATION SCI ============ */}
          {selectedProgram && vehiclePrice && (
            <View style={styles.section} data-testid="lease-section">
              {/* Toggle Lease */}
              <TouchableOpacity
                style={[styles.leaseToggle, showLease && styles.leaseToggleActive]}
                onPress={() => setShowLease(!showLease)}
                data-testid="lease-toggle-btn"
              >
                <Ionicons name="car-sport" size={20} color={showLease ? '#fff' : '#4ECDC4'} />
                <Text style={[styles.leaseToggleText, showLease && styles.leaseToggleTextActive]}>
                  {lang === 'fr' ? 'Location SCI' : 'SCI Lease'}
                </Text>
                <Ionicons name={showLease ? 'chevron-up' : 'chevron-down'} size={18} color={showLease ? '#fff' : '#4ECDC4'} />
              </TouchableOpacity>

              {showLease && (
                <View style={styles.leaseContent}>
                  {/* PDSF / PDOC */}
                  <View style={styles.leaseInputRow}>
                    <Text style={styles.leaseInputLabel}>{lang === 'fr' ? 'PDSF / PDOC' : 'MSRP'}</Text>
                    <TextInput
                      style={styles.leaseInput}
                      value={leasePdsf}
                      onChangeText={setLeasePdsf}
                      placeholder={vehiclePrice || '71580'}
                      placeholderTextColor="#555"
                      keyboardType="numeric"
                      data-testid="lease-pdsf-input"
                    />
                  </View>
                  
                  {/* Rabais concessionnaire */}
                  <View style={styles.leaseInputRow}>
                    <Text style={styles.leaseInputLabel}>{lang === 'fr' ? 'Rabais concess.' : 'Dealer discount'}</Text>
                    <TextInput
                      style={[styles.leaseInput, { borderColor: leaseRabaisConcess ? '#4ECDC4' : '#333' }]}
                      value={leaseRabaisConcess}
                      onChangeText={setLeaseRabaisConcess}
                      placeholder="0"
                      placeholderTextColor="#555"
                      keyboardType="numeric"
                      data-testid="lease-rabais-input"
                    />
                    <Text style={styles.leaseInputHint}>{lang === 'fr' ? 'Avant taxes' : 'Before tax'}</Text>
                  </View>

                  {/* Solde reporté */}
                  <View style={styles.leaseInputRow}>
                    <Text style={styles.leaseInputLabel}>{lang === 'fr' ? 'Solde reporté' : 'Carried balance'}</Text>
                    <TextInput
                      style={styles.leaseInput}
                      value={leaseSoldeReporte}
                      onChangeText={setLeaseSoldeReporte}
                      placeholder="0"
                      placeholderTextColor="#555"
                      keyboardType="numeric"
                      data-testid="lease-solde-input"
                    />
                    <Text style={styles.leaseInputHint}>{lang === 'fr' ? '(-) si dette' : '(-) if owed'}</Text>
                  </View>

                  {/* Km per year selection */}
                  <View style={styles.leaseRow}>
                    <Text style={styles.leaseLabel}>{lang === 'fr' ? 'Kilométrage / an' : 'Km / year'}</Text>
                    <View style={styles.leaseKmButtons}>
                      {leaseKmOptions.map(km => (
                        <TouchableOpacity
                          key={km}
                          style={[styles.leaseKmBtn, leaseKmPerYear === km && styles.leaseKmBtnActive]}
                          onPress={() => setLeaseKmPerYear(km)}
                          data-testid={`lease-km-${km}`}
                        >
                          <Text style={[styles.leaseKmBtnText, leaseKmPerYear === km && styles.leaseKmBtnTextActive]}>
                            {(km / 1000).toFixed(0)}k
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Lease term selection */}
                  <View style={styles.leaseRow}>
                    <Text style={styles.leaseLabel}>{lang === 'fr' ? 'Terme location' : 'Lease term'}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leaseTermScroll}>
                      {leaseTerms.map(t => (
                        <TouchableOpacity
                          key={t}
                          style={[styles.leaseTermBtn, leaseTerm === t && styles.leaseTermBtnActive]}
                          onPress={() => setLeaseTerm(t)}
                          data-testid={`lease-term-${t}`}
                        >
                          <Text style={[styles.leaseTermBtnText, leaseTerm === t && styles.leaseTermBtnTextActive]}>
                            {t}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Residual by km/year table */}
                  {(() => {
                    if (!selectedProgram || !leaseResiduals?.vehicles) return null;
                    const brandL = selectedProgram.brand.toLowerCase();
                    const modelL = selectedProgram.model.toLowerCase();
                    const trimL = (selectedProgram.trim || '').toLowerCase();
                    const rv = leaseResiduals.vehicles?.find((v: any) => {
                      const vB = v.brand.toLowerCase();
                      const vM = v.model_name.toLowerCase();
                      const vT = (v.trim || '').toLowerCase();
                      return vB === brandL && (vM.includes(modelL) || modelL.includes(vM)) &&
                        (vT.includes(trimL) || trimL.includes(vT) || !trimL);
                    });
                    if (!rv) return null;
                    const basePct = rv.residual_percentages?.[String(leaseTerm)] || 0;
                    if (basePct === 0) return null;
                    const kmAdj = leaseResiduals.km_adjustments?.adjustments || {};
                    const pdsf = parseFloat(leasePdsf) || parseFloat(vehiclePrice) || 0;
                    
                    return (
                      <View style={styles.residualKmTable} data-testid="residual-km-table">
                        <Text style={styles.residualKmTitle}>
                          {lang === 'fr' ? 'Résiduel selon kilométrage' : 'Residual by mileage'}
                          {rv.body_style ? ` — ${rv.body_style}` : ''}
                        </Text>
                        <View style={styles.residualKmRow}>
                          <View style={styles.residualKmHeader}>
                            <Text style={styles.residualKmHeaderText}>km/an</Text>
                          </View>
                          <View style={styles.residualKmHeader}>
                            <Text style={styles.residualKmHeaderText}>%</Text>
                          </View>
                          <View style={styles.residualKmHeader}>
                            <Text style={styles.residualKmHeaderText}>$</Text>
                          </View>
                        </View>
                        {[12000, 18000, 24000].map(km => {
                          const adj = km === 24000 ? 0 : (kmAdj[String(km)]?.[String(leaseTerm)] || 0);
                          const pct = basePct + adj;
                          const val = pdsf * (pct / 100);
                          const isSelected = km === leaseKmPerYear;
                          return (
                            <TouchableOpacity
                              key={km}
                              style={[styles.residualKmRow, isSelected && styles.residualKmRowSelected]}
                              onPress={() => setLeaseKmPerYear(km)}
                              data-testid={`residual-km-row-${km}`}
                            >
                              <View style={styles.residualKmCell}>
                                <Text style={[styles.residualKmText, isSelected && styles.residualKmTextSelected]}>
                                  {(km / 1000).toFixed(0)}k
                                </Text>
                              </View>
                              <View style={styles.residualKmCell}>
                                <Text style={[styles.residualKmText, isSelected && styles.residualKmTextSelected]}>
                                  {pct}%{adj !== 0 ? ` (+${adj})` : ''}
                                </Text>
                              </View>
                              <View style={styles.residualKmCell}>
                                <Text style={[styles.residualKmValue, isSelected && styles.residualKmValueSelected]}>
                                  {formatCurrency(val)}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })()}

                  {/* Info: only frais de dossier capitalized in lease */}
                  <View style={styles.leaseInfoBar}>
                    <Ionicons name="information-circle" size={14} color="#4ECDC4" />
                    <Text style={styles.leaseInfoText}>
                      {lang === 'fr' 
                        ? `Capitalisé: ${formatCurrency(parseFloat(fraisDossier) || 0)} dossier | Pneus (${formatCurrency(parseFloat(taxePneus) || 0)}) + RDPRM (${formatCurrency(parseFloat(fraisRDPRM) || 0)}) payés à la livraison`
                        : `Capitalized: ${formatCurrency(parseFloat(fraisDossier) || 0)} admin | Tires (${formatCurrency(parseFloat(taxePneus) || 0)}) + RDPRM (${formatCurrency(parseFloat(fraisRDPRM) || 0)}) paid at delivery`}
                    </Text>
                  </View>

                  {/* Lease Results */}
                  {leaseResult ? (
                    <View style={styles.leaseResults}>
                      {/* Residual info */}
                      <View style={styles.leaseResidualInfo}>
                        <View>
                          <Text style={styles.leaseResidualLabel}>
                            {lang === 'fr' ? 'PDSF' : 'MSRP'}: {formatCurrency(leaseResult.standard?.pdsf || leaseResult.alternative?.pdsf || 0)}
                          </Text>
                          <Text style={styles.leaseResidualLabel}>
                            {lang === 'fr' ? 'Résiduel' : 'Residual'}: {leaseResult.residualPct}%
                            {leaseResult.kmAdjustment !== 0 ? ` (${leaseResult.kmAdjustment > 0 ? '+' : ''}${leaseResult.kmAdjustment}%)` : ''}
                          </Text>
                        </View>
                        <Text style={styles.leaseResidualValue}>
                          {formatCurrency(leaseResult.residualValue)}
                        </Text>
                      </View>

                      {/* Tax credit warning for trade-in */}
                      {(leaseResult.standard?.creditPerdu > 0 || leaseResult.alternative?.creditPerdu > 0) && (
                        <View style={styles.leaseWarningBar}>
                          <Ionicons name="warning" size={14} color="#FF6B6B" />
                          <Text style={styles.leaseWarningText}>
                            {lang === 'fr' 
                              ? `Crédit taxe échange: surplus perdu de ${formatCurrency((leaseResult.standard || leaseResult.alternative).creditPerdu)} / mois`
                              : `Trade tax credit: lost surplus of ${formatCurrency((leaseResult.standard || leaseResult.alternative).creditPerdu)} / mo`}
                          </Text>
                        </View>
                      )}

                      {/* Best lease banner */}
                      {leaseResult.bestLease && leaseResult.standard && leaseResult.alternative && (
                        <View style={styles.leaseBestBanner}>
                          <Ionicons name="trophy" size={16} color="#1a1a2e" />
                          <Text style={styles.leaseBestText}>
                            {leaseResult.bestLease === 'standard' 
                              ? (lang === 'fr' ? 'Std + Lease Cash' : 'Std + Lease Cash')
                              : (lang === 'fr' ? 'Taux Alternatif' : 'Alternative Rate')
                            } = {lang === 'fr' ? 'Meilleur choix' : 'Best choice'}
                          </Text>
                          {leaseResult.leaseSavings > 0 && (
                            <Text style={styles.leaseBestSavings}>
                              {lang === 'fr' ? 'Économie' : 'Savings'}: {formatCurrency(leaseResult.leaseSavings)}
                            </Text>
                          )}
                        </View>
                      )}

                      {/* Lease options cards */}
                      <View style={styles.leaseCardsRow}>
                        {/* Standard Rate + Lease Cash */}
                        {leaseResult.standard && (
                          <View style={[
                            styles.leaseCard,
                            leaseResult.bestLease === 'standard' && styles.leaseCardBest
                          ]}>
                            <View style={styles.leaseCardHeader}>
                              <Text style={styles.leaseCardTitle}>
                                {lang === 'fr' ? 'Std + Lease Cash' : 'Std + Lease Cash'}
                              </Text>
                              {leaseResult.bestLease === 'standard' && (
                                <Ionicons name="checkmark-circle" size={16} color="#4ECDC4" />
                              )}
                            </View>
                            {leaseResult.standard.leaseCash > 0 && (
                              <View style={styles.leaseCardDetail}>
                                <Text style={styles.leaseCardDetailLabel}>Lease Cash:</Text>
                                <Text style={styles.leaseCardDetailValue}>{formatCurrency(leaseResult.standard.leaseCash)}</Text>
                              </View>
                            )}
                            <View style={styles.leaseCardDetail}>
                              <Text style={styles.leaseCardDetailLabel}>{lang === 'fr' ? 'Taux' : 'Rate'}:</Text>
                              <Text style={styles.leaseCardRateValue}>{leaseResult.standard.rate}%</Text>
                            </View>
                            <View style={styles.leaseCardMainResult}>
                              <Text style={styles.leaseCardPaymentLabel}>
                                {paymentFrequency === 'monthly' ? (lang === 'fr' ? 'Mensuel' : 'Monthly') : 
                                 paymentFrequency === 'biweekly' ? (lang === 'fr' ? 'Aux 2 sem.' : 'Bi-weekly') : 
                                 (lang === 'fr' ? 'Hebdo' : 'Weekly')}
                              </Text>
                              <Text style={styles.leaseCardPaymentValue}>
                                {formatCurrencyDecimal(
                                  paymentFrequency === 'monthly' ? leaseResult.standard.monthly :
                                  paymentFrequency === 'biweekly' ? leaseResult.standard.biweekly :
                                  leaseResult.standard.weekly
                                )}
                              </Text>
                              <Text style={styles.leaseCardTaxDetail}>
                                {lang === 'fr' ? 'Avant taxes' : 'Before tax'}: {formatCurrencyDecimal(
                                  paymentFrequency === 'monthly' ? leaseResult.standard.monthlyBeforeTax :
                                  paymentFrequency === 'biweekly' ? leaseResult.standard.biweeklyBeforeTax :
                                  leaseResult.standard.weeklyBeforeTax
                                )}
                              </Text>
                              {paymentFrequency === 'monthly' && (
                                <View style={styles.leaseCardTaxBreakdown}>
                                  <Text style={styles.leaseCardTaxLine}>TPS (5%): {formatCurrencyDecimal(leaseResult.standard.tpsOnPayment)}</Text>
                                  <Text style={styles.leaseCardTaxLine}>TVQ (9.975%): {formatCurrencyDecimal(leaseResult.standard.tvqOnPayment)}</Text>
                                </View>
                              )}
                              {leaseResult.standard.rabaisConcess > 0 && (
                                <Text style={styles.leaseCardRabaisLine}>
                                  {lang === 'fr' ? 'Rabais concess.' : 'Dealer disc.'}: -{formatCurrency(leaseResult.standard.rabaisConcess)}
                                </Text>
                              )}
                            </View>
                            <View style={styles.leaseCardDetail}>
                              <Text style={styles.leaseCardDetailLabel}>Total ({leaseTerm} {lang === 'fr' ? 'mois' : 'mo'}):</Text>
                              <Text style={styles.leaseCardTotalValue}>{formatCurrency(leaseResult.standard.total)}</Text>
                            </View>
                            <View style={styles.leaseCardDetail}>
                              <Text style={[styles.leaseCardDetailLabel, { color: '#FF6B6B' }]}>{lang === 'fr' ? "Coût d'emprunt:" : 'Cost of borrowing:'}</Text>
                              <Text style={[styles.leaseCardTotalValue, { color: '#FF6B6B' }]}>{formatCurrencyDecimal(leaseResult.standard.coutEmprunt)}</Text>
                            </View>
                          </View>
                        )}

                        {/* Alternative Rate */}
                        {leaseResult.alternative && (
                          <View style={[
                            styles.leaseCard,
                            styles.leaseCardAlt,
                            leaseResult.bestLease === 'alternative' && styles.leaseCardBest
                          ]}>
                            <View style={styles.leaseCardHeader}>
                              <Text style={styles.leaseCardTitle}>
                                {lang === 'fr' ? 'Taux Alternatif' : 'Alt. Rate'}
                              </Text>
                              {leaseResult.bestLease === 'alternative' && (
                                <Ionicons name="checkmark-circle" size={16} color="#4ECDC4" />
                              )}
                            </View>
                            <View style={styles.leaseCardDetail}>
                              <Text style={styles.leaseCardDetailLabel}>Lease Cash:</Text>
                              <Text style={styles.leaseCardDetailValue}>$0</Text>
                            </View>
                            <View style={styles.leaseCardDetail}>
                              <Text style={styles.leaseCardDetailLabel}>{lang === 'fr' ? 'Taux' : 'Rate'}:</Text>
                              <Text style={styles.leaseCardRateValue}>{leaseResult.alternative.rate}%</Text>
                            </View>
                            <View style={styles.leaseCardMainResult}>
                              <Text style={styles.leaseCardPaymentLabel}>
                                {paymentFrequency === 'monthly' ? (lang === 'fr' ? 'Mensuel' : 'Monthly') : 
                                 paymentFrequency === 'biweekly' ? (lang === 'fr' ? 'Aux 2 sem.' : 'Bi-weekly') : 
                                 (lang === 'fr' ? 'Hebdo' : 'Weekly')}
                              </Text>
                              <Text style={styles.leaseCardPaymentValue}>
                                {formatCurrencyDecimal(
                                  paymentFrequency === 'monthly' ? leaseResult.alternative.monthly :
                                  paymentFrequency === 'biweekly' ? leaseResult.alternative.biweekly :
                                  leaseResult.alternative.weekly
                                )}
                              </Text>
                              <Text style={styles.leaseCardTaxDetail}>
                                {lang === 'fr' ? 'Avant taxes' : 'Before tax'}: {formatCurrencyDecimal(
                                  paymentFrequency === 'monthly' ? leaseResult.alternative.monthlyBeforeTax :
                                  paymentFrequency === 'biweekly' ? leaseResult.alternative.biweeklyBeforeTax :
                                  leaseResult.alternative.weeklyBeforeTax
                                )}
                              </Text>
                              {paymentFrequency === 'monthly' && (
                                <View style={styles.leaseCardTaxBreakdown}>
                                  <Text style={styles.leaseCardTaxLine}>TPS (5%): {formatCurrencyDecimal(leaseResult.alternative.tpsOnPayment)}</Text>
                                  <Text style={styles.leaseCardTaxLine}>TVQ (9.975%): {formatCurrencyDecimal(leaseResult.alternative.tvqOnPayment)}</Text>
                                </View>
                              )}
                              {leaseResult.alternative.rabaisConcess > 0 && (
                                <Text style={styles.leaseCardRabaisLine}>
                                  {lang === 'fr' ? 'Rabais concess.' : 'Dealer disc.'}: -{formatCurrency(leaseResult.alternative.rabaisConcess)}
                                </Text>
                              )}
                            </View>
                            <View style={styles.leaseCardDetail}>
                              <Text style={styles.leaseCardDetailLabel}>Total ({leaseTerm} {lang === 'fr' ? 'mois' : 'mo'}):</Text>
                              <Text style={styles.leaseCardTotalValue}>{formatCurrency(leaseResult.alternative.total)}</Text>
                            </View>
                            <View style={styles.leaseCardDetail}>
                              <Text style={[styles.leaseCardDetailLabel, { color: '#FF6B6B' }]}>{lang === 'fr' ? "Coût d'emprunt:" : 'Cost of borrowing:'}</Text>
                              <Text style={[styles.leaseCardTotalValue, { color: '#FF6B6B' }]}>{formatCurrencyDecimal(leaseResult.alternative.coutEmprunt)}</Text>
                            </View>
                          </View>
                        )}
                      </View>

                      {/* No lease options available */}
                      {!leaseResult.standard && !leaseResult.alternative && (
                        <View style={styles.leaseNoOption}>
                          <Ionicons name="information-circle" size={24} color="#666" />
                          <Text style={styles.leaseNoOptionText}>
                            {lang === 'fr' ? 'Aucun taux de location disponible pour ce véhicule' : 'No lease rates available for this vehicle'}
                          </Text>
                        </View>
                      )}

                      {/* Comparison with financing */}
                      {localResult && (leaseResult.standard || leaseResult.alternative) && (
                        <View style={styles.leaseVsFinance}>
                          <Text style={styles.leaseVsFinanceTitle}>
                            {lang === 'fr' ? 'Location vs Financement' : 'Lease vs Finance'}
                          </Text>
                          <View style={styles.leaseVsFinanceRow}>
                            <View style={styles.leaseVsFinanceCol}>
                              <Text style={styles.leaseVsFinanceLabel}>
                                {lang === 'fr' ? 'Meilleure Location' : 'Best Lease'}
                              </Text>
                              <Text style={styles.leaseVsFinanceValue}>
                                {formatCurrencyDecimal(
                                  paymentFrequency === 'monthly' 
                                    ? (leaseResult.bestLease === 'standard' ? leaseResult.standard?.monthly : leaseResult.alternative?.monthly) || 0
                                    : paymentFrequency === 'biweekly'
                                    ? (leaseResult.bestLease === 'standard' ? leaseResult.standard?.biweekly : leaseResult.alternative?.biweekly) || 0
                                    : (leaseResult.bestLease === 'standard' ? leaseResult.standard?.weekly : leaseResult.alternative?.weekly) || 0
                                )}
                              </Text>
                              <Text style={styles.leaseVsFinanceSub}>{leaseTerm} {lang === 'fr' ? 'mois' : 'mo'}</Text>
                            </View>
                            <View style={styles.leaseVsFinanceDivider} />
                            <View style={styles.leaseVsFinanceCol}>
                              <Text style={styles.leaseVsFinanceLabel}>
                                {lang === 'fr' ? 'Meilleur Financement' : 'Best Finance'}
                              </Text>
                              <Text style={styles.leaseVsFinanceValue}>
                                {formatCurrencyDecimal(
                                  paymentFrequency === 'monthly' 
                                    ? (localResult.bestOption === '2' && localResult.option2Monthly ? localResult.option2Monthly : localResult.option1Monthly)
                                    : paymentFrequency === 'biweekly'
                                    ? (localResult.bestOption === '2' && localResult.option2Biweekly ? localResult.option2Biweekly : localResult.option1Biweekly)
                                    : (localResult.bestOption === '2' && localResult.option2Weekly ? localResult.option2Weekly : localResult.option1Weekly)
                                )}
                              </Text>
                              <Text style={styles.leaseVsFinanceSub}>{selectedTerm} {lang === 'fr' ? 'mois' : 'mo'}</Text>
                            </View>
                          </View>
                        </View>
                      )}

                      {/* ANALYSE COMPLÈTE - Grille de tous les paiements */}
                      {leaseAnalysisGrid.length > 0 && (
                        <View style={styles.analysisSection}>
                          <Text style={styles.analysisSectionTitle}>
                            {lang === 'fr' ? 'ANALYSE COMPLÈTE - Paiements mensuels' : 'FULL ANALYSIS - Monthly payments'}
                          </Text>
                          {[12000, 18000, 24000].map(km => {
                            const kmRows = leaseAnalysisGrid.filter(r => r.kmPerYear === km);
                            if (kmRows.length === 0) return null;
                            const terms = [...new Set(kmRows.map(r => r.term))].sort((a,b) => a-b);
                            return (
                              <View key={km} style={styles.analysisKmBlock}>
                                <Text style={styles.analysisKmTitle}>{(km/1000).toFixed(0)}k km / {lang === 'fr' ? 'an' : 'yr'}</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                                  <View>
                                    <View style={styles.analysisHeaderRow}>
                                      <Text style={[styles.analysisCell, styles.analysisCellHeader, { width: 52 }]}>{lang === 'fr' ? 'Terme' : 'Term'}</Text>
                                      <Text style={[styles.analysisCell, styles.analysisCellHeader, { width: 45 }]}>Rés%</Text>
                                      <Text style={[styles.analysisCell, styles.analysisCellHeader, { width: 82, color: '#E65100' }]}>Std</Text>
                                      <Text style={[styles.analysisCell, styles.analysisCellHeader, { width: 82, color: '#0277BD' }]}>Alt</Text>
                                    </View>
                                    {terms.map(t => {
                                      const stdRow = kmRows.find(r => r.term === t && r.option === 'std');
                                      const altRow = kmRows.find(r => r.term === t && r.option === 'alt');
                                      const isBestStd = bestLeaseOption && bestLeaseOption.term === t && bestLeaseOption.kmPerYear === km && bestLeaseOption.option === 'standard';
                                      const isBestAlt = bestLeaseOption && bestLeaseOption.term === t && bestLeaseOption.kmPerYear === km && bestLeaseOption.option === 'alternative';
                                      return (
                                        <TouchableOpacity 
                                          key={t} 
                                          style={[styles.analysisDataRow, (isBestStd || isBestAlt) && styles.analysisBestRow]}
                                          onPress={() => { setLeaseTerm(t); setLeaseKmPerYear(km); }}
                                        >
                                          <Text style={[styles.analysisCell, { width: 52, fontWeight: '600' }]}>{t}m</Text>
                                          <Text style={[styles.analysisCell, { width: 45, color: '#888' }]}>{stdRow?.residualPct || altRow?.residualPct}%</Text>
                                          <Text style={[styles.analysisCell, { width: 82, color: isBestStd ? '#FFD700' : '#E65100', fontWeight: isBestStd ? '800' : '500' }]}>
                                            {stdRow ? `${stdRow.monthly.toFixed(0)}$` : '-'}
                                          </Text>
                                          <Text style={[styles.analysisCell, { width: 82, color: isBestAlt ? '#FFD700' : '#0277BD', fontWeight: isBestAlt ? '800' : '500' }]}>
                                            {altRow ? `${altRow.monthly.toFixed(0)}$` : '-'}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                </ScrollView>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* MEILLEUR CHOIX */}
                      {bestLeaseOption && (
                        <TouchableOpacity 
                          style={styles.bestLeaseBox}
                          onPress={() => {
                            setLeaseTerm(bestLeaseOption.term);
                            setLeaseKmPerYear(bestLeaseOption.kmPerYear);
                          }}
                          data-testid="best-lease-option"
                        >
                          <View style={styles.bestLeaseHeader}>
                            <Ionicons name="trophy" size={18} color="#FFD700" />
                            <Text style={styles.bestLeaseTitle}>
                              {lang === 'fr' ? 'MEILLEUR CHOIX LOCATION' : 'BEST LEASE OPTION'}
                            </Text>
                            <Ionicons name="trophy" size={18} color="#FFD700" />
                          </View>
                          <View style={styles.bestLeaseContent}>
                            <View style={styles.bestLeaseRow}>
                              <Text style={styles.bestLeaseLabel}>{lang === 'fr' ? 'Terme:' : 'Term:'}</Text>
                              <Text style={styles.bestLeaseValue}>{bestLeaseOption.term} {lang === 'fr' ? 'mois' : 'mo'}</Text>
                            </View>
                            <View style={styles.bestLeaseRow}>
                              <Text style={styles.bestLeaseLabel}>{lang === 'fr' ? 'Kilométrage:' : 'Mileage:'}</Text>
                              <Text style={styles.bestLeaseValue}>{(bestLeaseOption.kmPerYear / 1000).toFixed(0)}k km / {lang === 'fr' ? 'an' : 'yr'}</Text>
                            </View>
                            <View style={styles.bestLeaseRow}>
                              <Text style={styles.bestLeaseLabel}>Option:</Text>
                              <Text style={[styles.bestLeaseValue, { color: bestLeaseOption.option === 'standard' ? '#E65100' : '#0277BD' }]}>
                                {bestLeaseOption.optionLabel}
                              </Text>
                            </View>
                            <View style={styles.bestLeaseRow}>
                              <Text style={styles.bestLeaseLabel}>{lang === 'fr' ? 'Taux:' : 'Rate:'}</Text>
                              <Text style={styles.bestLeaseValue}>{bestLeaseOption.rate}%</Text>
                            </View>
                            {bestLeaseOption.leaseCash > 0 && (
                              <View style={styles.bestLeaseRow}>
                                <Text style={styles.bestLeaseLabel}>Lease Cash:</Text>
                                <Text style={styles.bestLeaseValue}>{formatCurrency(bestLeaseOption.leaseCash)}</Text>
                              </View>
                            )}
                            <View style={styles.bestLeaseRow}>
                              <Text style={styles.bestLeaseLabel}>{lang === 'fr' ? 'Résiduel:' : 'Residual:'}</Text>
                              <Text style={styles.bestLeaseValue}>{bestLeaseOption.residualPct}% ({formatCurrency(bestLeaseOption.residualValue)})</Text>
                            </View>
                            <View style={[styles.bestLeaseRow, { borderTopWidth: 1, borderTopColor: '#444', paddingTop: 6, marginTop: 4 }]}>
                              <Text style={[styles.bestLeaseLabel, { fontSize: 13 }]}>{lang === 'fr' ? 'Avant taxes:' : 'Before tax:'}</Text>
                              <Text style={[styles.bestLeaseValue, { fontSize: 13 }]}>{formatCurrencyDecimal(bestLeaseOption.monthlyBeforeTax)} / {lang === 'fr' ? 'mois' : 'mo'}</Text>
                            </View>
                            <View style={styles.bestLeaseRow}>
                              <Text style={[styles.bestLeaseLabel, { fontSize: 16, fontWeight: '700' }]}>{lang === 'fr' ? 'MENSUEL:' : 'MONTHLY:'}</Text>
                              <Text style={[styles.bestLeaseValue, { fontSize: 16, fontWeight: '700', color: '#4ECDC4' }]}>{formatCurrencyDecimal(bestLeaseOption.monthly)} / {lang === 'fr' ? 'mois' : 'mo'}</Text>
                            </View>
                          </View>
                          <Text style={styles.bestLeaseTap}>
                            {lang === 'fr' ? 'Toucher pour sélectionner ce terme et km' : 'Tap to select this term and km'}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.sendEmailButton}
                        onPress={() => setShowEmailModal(true)}
                        data-testid="lease-send-email-btn"
                      >
                        <Ionicons name="mail-outline" size={20} color="#fff" />
                        <Text style={styles.sendEmailButtonText}>
                          {lang === 'fr' ? 'Envoyer par email' : 'Send by email'}
                        </Text>
                      </TouchableOpacity>
                      
                      <View style={styles.shareActionsRow}>
                        <TouchableOpacity
                          style={styles.shareSmsButton}
                          onPress={handleShareSMS}
                          data-testid="lease-share-sms-btn"
                        >
                          <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                          <Text style={styles.shareButtonText}>
                            {lang === 'fr' ? 'Texto' : 'SMS'}
                          </Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          style={styles.printButton}
                          onPress={handlePrint}
                          data-testid="lease-print-btn"
                        >
                          <Ionicons name="print-outline" size={18} color="#fff" />
                          <Text style={styles.shareButtonText}>
                            {lang === 'fr' ? 'Imprimer' : 'Print'}
                          </Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          style={styles.exportExcelButton}
                          onPress={handleExportExcel}
                          data-testid="lease-export-excel-btn"
                        >
                          <Ionicons name="document-outline" size={18} color="#fff" />
                          <Text style={styles.shareButtonText}>
                            Excel
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : showLease ? (
                    <View style={styles.leaseNoOption}>
                      <Ionicons name="alert-circle" size={24} color="#FF6B6B" />
                      <Text style={styles.leaseNoOptionText}>
                        {lang === 'fr' 
                          ? 'Données de location non disponibles pour ce véhicule. Vérifiez la marque/modèle.'
                          : 'Lease data not available for this vehicle. Check brand/model.'}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          )}
        </ScrollView>
        <Modal
          visible={showImportModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowImportModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t.import.title}</Text>
              <Text style={styles.modalSubtitle}>
                {t.import.enterAdminPassword}
              </Text>
              <TextInput
                style={styles.passwordInput}
                placeholder={t.import.password}
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
                  <Text style={styles.modalButtonCancelText}>{t.import.cancel}</Text>
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
                        alert(t.import.incorrectPassword);
                      } else {
                        Alert.alert('Erreur', t.import.incorrectPassword);
                      }
                    }
                  }}
                >
                  <Text style={styles.modalButtonConfirmText}>{t.import.confirm}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* SMS Preview Modal */}
        <Modal
          visible={showSmsPreview}
          transparent
          animationType="slide"
          onRequestClose={() => setShowSmsPreview(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.smsPreviewModalContent}>
              <View style={styles.smsPreviewHeader}>
                <View style={styles.smsPreviewIconContainer}>
                  <Ionicons name="chatbubble-ellipses" size={32} color="#4ECDC4" />
                </View>
                <Text style={styles.smsPreviewTitle}>
                  {lang === 'fr' ? 'Aperçu du message' : 'Message Preview'}
                </Text>
                <TouchableOpacity
                  style={styles.smsPreviewClose}
                  onPress={() => setShowSmsPreview(false)}
                >
                  <Ionicons name="close" size={24} color="#888" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.smsPreviewBody}>
                <Text style={styles.smsPreviewLabel}>
                  {lang === 'fr' ? 'Modifiez le message si nécessaire:' : 'Edit the message if needed:'}
                </Text>
                <TextInput
                  style={styles.smsPreviewTextInput}
                  multiline
                  numberOfLines={12}
                  value={smsPreviewText}
                  onChangeText={setSmsPreviewText}
                  placeholder={lang === 'fr' ? 'Message...' : 'Message...'}
                  placeholderTextColor="#666"
                  textAlignVertical="top"
                />
                <Text style={styles.smsPreviewCharCount}>
                  {smsPreviewText.length} {lang === 'fr' ? 'caractères' : 'characters'}
                </Text>
              </View>
              
              <View style={styles.smsPreviewButtons}>
                <TouchableOpacity
                  style={styles.smsPreviewCancelButton}
                  onPress={() => setShowSmsPreview(false)}
                >
                  <Text style={styles.smsPreviewCancelText}>
                    {lang === 'fr' ? 'Annuler' : 'Cancel'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.smsPreviewSendButton}
                  onPress={handleSendSms}
                  data-testid="sms-preview-send-btn"
                >
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.smsPreviewSendText}>
                    {lang === 'fr' ? 'Envoyer' : 'Send'}
                  </Text>
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
                  {t.email.sendByEmail}
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
                  {t.email.clientName}
                </Text>
                <TextInput
                  style={styles.emailModalInput}
                  placeholder="Ex: Jean Dupont"
                  placeholderTextColor="#666"
                  value={clientName}
                  onChangeText={setClientName}
                />
                
                <Text style={styles.emailModalLabel}>
                  {t.email.clientPhone} *
                </Text>
                <TextInput
                  style={styles.emailModalInput}
                  placeholder="514-555-1234"
                  placeholderTextColor="#666"
                  value={clientPhone}
                  onChangeText={setClientPhone}
                  keyboardType="phone-pad"
                />
                
                <Text style={styles.emailModalLabel}>
                  {t.email.clientEmail} *
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
                
                {selectedProgram && (
                  <View style={styles.emailPreviewBox}>
                    <Text style={styles.emailPreviewTitle}>
                      {t.email.summaryToSend}
                    </Text>
                    <Text style={styles.emailPreviewText}>
                      {selectedProgram.brand} {selectedProgram.model} {selectedProgram.year}
                    </Text>
                    <Text style={styles.emailPreviewText}>
                      {formatCurrency(parseFloat(vehiclePrice) || 0)} • {selectedTerm} mois
                    </Text>
                    <Text style={styles.emailPreviewPayment}>
                      {localResult ? formatCurrency(
                        paymentFrequency === 'weekly' ? localResult.option1Weekly :
                        paymentFrequency === 'biweekly' ? localResult.option1Biweekly :
                        localResult.option1Monthly || 0
                      ) : formatCurrency(0)}{paymentFrequency === 'weekly' ? '/sem.' : paymentFrequency === 'biweekly' ? '/2 sem.' : '/mois'}
                    </Text>
                    {showLease && leaseResult && (leaseResult.standard || leaseResult.alternative) && (
                      <Text style={[styles.emailPreviewText, {color: '#FFD700', marginTop: 6}]}>
                        + Location SCI: {formatCurrencyDecimal(
                          paymentFrequency === 'monthly' 
                            ? (leaseResult.bestLease === 'standard' ? leaseResult.standard?.monthly : leaseResult.alternative?.monthly) || 0
                            : paymentFrequency === 'biweekly'
                            ? (leaseResult.bestLease === 'standard' ? leaseResult.standard?.biweekly : leaseResult.alternative?.biweekly) || 0
                            : (leaseResult.bestLease === 'standard' ? leaseResult.standard?.weekly : leaseResult.alternative?.weekly) || 0
                        )}{paymentFrequency === 'weekly' ? '/sem.' : paymentFrequency === 'biweekly' ? '/2 sem.' : '/mois'} ({leaseTerm} mois)
                      </Text>
                    )}
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
                    setClientPhone('');
                  }}
                >
                  <Text style={styles.emailModalCancelText}>
                    {t.email.cancel}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.emailModalSendButton, sendingEmail && styles.emailModalSendButtonDisabled]}
                  disabled={sendingEmail}
                  onPress={async () => {
                    // Validate phone (required)
                    if (!clientPhone || clientPhone.trim().length < 7) {
                      if (Platform.OS === 'web') {
                        alert(t.email.invalidPhone);
                      } else {
                        Alert.alert('Erreur', t.email.invalidPhone);
                      }
                      return;
                    }
                    
                    if (!clientEmail || !clientEmail.includes('@')) {
                      if (Platform.OS === 'web') {
                        alert(t.email.invalidEmail);
                      } else {
                        Alert.alert('Erreur', t.email.invalidEmail);
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
                          client_phone: clientPhone,
                          vehicle_info: {
                            brand: selectedProgram.brand,
                            model: selectedProgram.model,
                            trim: selectedProgram.trim,
                            year: selectedProgram.year,
                            vin: selectedInventory?.vin || (manualVin && manualVin.length === 17 ? manualVin : ''),
                          },
                          calculation_results: {
                            consumer_cash: selectedProgram.consumer_cash,
                            bonus_cash: parseFloat(customBonusCash) || selectedProgram.bonus_cash,
                            comparisons: [{
                              term_months: selectedTerm,
                              option1_rate: localResult.option1Rate,
                              option1_monthly: localResult.option1Monthly,
                              option1_biweekly: localResult.option1Biweekly,
                              option1_weekly: localResult.option1Weekly,
                              option1_total: localResult.option1Total,
                              option2_rate: localResult.option2Rate,
                              option2_monthly: localResult.option2Monthly,
                              option2_biweekly: localResult.option2Biweekly,
                              option2_weekly: localResult.option2Weekly,
                              option2_total: localResult.option2Total,
                              best_option: localResult.bestOption,
                              savings: localResult.savings,
                              principal_option1: localResult.principalOption1,
                              principal_option2: localResult.principalOption2,
                            }],
                          },
                          selected_term: selectedTerm,
                          selected_option: selectedOption || '1',
                          vehicle_price: parseFloat(vehiclePrice),
                          payment_frequency: paymentFrequency,
                          dealer_name: 'CalcAuto AiPro',
                          // Window Sticker - inclus si VIN disponible (inventaire OU manuel)
                          include_window_sticker: !!(selectedInventory?.vin || (manualVin && manualVin.length === 17)),
                          vin: selectedInventory?.vin || (manualVin && manualVin.length === 17 ? manualVin : ''),
                          // Frais et échange
                          fees: {
                            frais_dossier: parseFloat(fraisDossier) || 0,
                            taxe_pneus: parseFloat(taxePneus) || 0,
                            frais_rdprm: parseFloat(fraisRDPRM) || 0,
                          },
                          trade_in: {
                            valeur_echange: parseFloat(prixEchange) || 0,
                            montant_du: parseFloat(montantDuEchange) || 0,
                          },
                          rates_table: {},
                          // Lease SCI data
                          lease_data: showLease && leaseResult && (leaseResult.standard || leaseResult.alternative) ? {
                            term: leaseTerm,
                            km_per_year: leaseKmPerYear,
                            residual_pct: leaseResult.residualPct,
                            residual_value: leaseResult.residualValue,
                            km_adjustment: leaseResult.kmAdjustment || 0,
                            best_lease: leaseResult.bestLease,
                            lease_savings: leaseResult.leaseSavings || 0,
                            standard: leaseResult.standard ? {
                              rate: leaseResult.standard.rate,
                              lease_cash: leaseResult.standard.leaseCash,
                              monthly: leaseResult.standard.monthly,
                              biweekly: leaseResult.standard.biweekly,
                              weekly: leaseResult.standard.weekly,
                              total: leaseResult.standard.total,
                            } : null,
                            alternative: leaseResult.alternative ? {
                              rate: leaseResult.alternative.rate,
                              monthly: leaseResult.alternative.monthly,
                              biweekly: leaseResult.alternative.biweekly,
                              weekly: leaseResult.alternative.weekly,
                              total: leaseResult.alternative.total,
                            } : null,
                          } : null,
                        }),
                      });
                      
                      const data = await response.json();
                      
                      if (data.success) {
                        // Get auth token
                        const token = await getToken();
                        const authHeaders: Record<string, string> = token 
                          ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } 
                          : { 'Content-Type': 'application/json' };
                        
                        // Track contact status for notification
                        let contactStatus = '';
                        
                        // 1. Check if contact exists and update/create
                        try {
                          const contactsResponse = await fetch(`${API_URL}/api/contacts`, { headers: authHeaders });
                          const existingContacts = await contactsResponse.json();
                          
                          const existingContact = existingContacts.find((c: any) => 
                            c.name?.toLowerCase() === (clientName || '').toLowerCase() ||
                            (c.phone && c.phone === clientPhone) ||
                            (c.email && c.email === clientEmail)
                          );
                          
                          if (existingContact) {
                            // Update existing contact with new info if provided
                            const updateData: any = {};
                            if (clientEmail && clientEmail !== existingContact.email) updateData.email = clientEmail;
                            if (clientPhone && clientPhone !== existingContact.phone) updateData.phone = clientPhone;
                            if (clientName && clientName !== existingContact.name) updateData.name = clientName;
                            
                            if (Object.keys(updateData).length > 0) {
                              await fetch(`${API_URL}/api/contacts/${existingContact.id}`, {
                                method: 'PUT',
                                headers: authHeaders,
                                body: JSON.stringify(updateData),
                              });
                              contactStatus = `Contact "${clientName || existingContact.name}" mis à jour`;
                            } else {
                              contactStatus = `Contact "${clientName || existingContact.name}" existant`;
                            }
                          } else {
                            // Create new contact
                            await fetch(`${API_URL}/api/contacts`, {
                              method: 'POST',
                              headers: authHeaders,
                              body: JSON.stringify({
                                name: clientName || 'Client',
                                phone: clientPhone,
                                email: clientEmail,
                                source: 'submission'
                              }),
                            });
                            contactStatus = `Nouveau contact "${clientName || 'Client'}" créé`;
                          }
                        } catch (contactErr) {
                          console.log('Error managing contact:', contactErr);
                          contactStatus = 'Contact non géré';
                        }
                        
                        // 2. Save submission to server database
                        try {
                          const payment = paymentFrequency === 'monthly' ? localResult.option1Monthly :
                                         paymentFrequency === 'biweekly' ? localResult.option1Biweekly :
                                         localResult.option1Weekly;
                          
                          await fetch(`${API_URL}/api/submissions`, {
                            method: 'POST',
                            headers: authHeaders,
                            body: JSON.stringify({
                              client_name: clientName || 'Client',
                              client_email: clientEmail,
                              client_phone: clientPhone,
                              vehicle_brand: selectedProgram.brand,
                              vehicle_model: selectedProgram.model,
                              vehicle_year: selectedProgram.year,
                              vehicle_price: parseFloat(vehiclePrice) || 0,
                              term: selectedTerm,
                              payment_monthly: localResult.option1Monthly,
                              payment_biweekly: localResult.option1Biweekly,
                              payment_weekly: localResult.option1Weekly,
                              selected_option: selectedOption || '1',
                              rate: localResult.option1Rate,
                              program_month: currentPeriod?.month || 2,
                              program_year: currentPeriod?.year || 2026,
                            }),
                          });
                          console.log('Submission saved to server');
                        } catch (subErr) {
                          console.log('Error saving submission to server:', subErr);
                        }
                        
                        // 3. Also save locally for offline access
                        try {
                          const submission = {
                            id: Date.now().toString(),
                            clientName: clientName || 'Client',
                            clientEmail: clientEmail,
                            clientPhone: clientPhone,
                            vehicle: `${selectedProgram.brand} ${selectedProgram.model} ${selectedProgram.year}`,
                            price: parseFloat(vehiclePrice) || 0,
                            term: selectedTerm,
                            payment: paymentFrequency === 'monthly' ? localResult.option1Monthly :
                                     paymentFrequency === 'biweekly' ? localResult.option1Biweekly :
                                     localResult.option1Weekly,
                            date: new Date().toISOString(),
                            contactId: params.contactId,
                          };
                          
                          const storedSubmissions = await AsyncStorage.getItem(SUBMISSIONS_KEY);
                          const existingSubmissions = storedSubmissions ? JSON.parse(storedSubmissions) : [];
                          existingSubmissions.unshift(submission);
                          await AsyncStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(existingSubmissions.slice(0, 100)));
                        } catch (e) {
                          console.log('Error saving submission locally:', e);
                        }
                        
                        setShowEmailModal(false);
                        setClientEmail('');
                        setClientName('');
                        setClientPhone('');
                        
                        // Show detailed success message with contact status
                        const successMsg = lang === 'fr' 
                          ? `✅ Email envoyé!\n\n📋 ${contactStatus}\n📊 Soumission enregistrée`
                          : `✅ Email sent!\n\n📋 ${contactStatus}\n📊 Submission saved`;
                        
                        if (Platform.OS === 'web') {
                          alert(successMsg);
                        } else {
                          Alert.alert('Succès', successMsg);
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
  periodSelector: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  periodModal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    width: '85%',
    maxHeight: '60%',
    padding: 0,
    overflow: 'hidden',
  },
  periodModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  periodModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  periodList: {
    maxHeight: 300,
  },
  periodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  periodItemActive: {
    backgroundColor: '#4ECDC4',
  },
  periodItemText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  periodItemTextActive: {
    color: '#1a1a2e',
  },
  periodItemCount: {
    fontSize: 12,
    color: '#888',
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
    paddingBottom: 200,
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
  // Share actions row (SMS + Print)
  shareActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  shareSmsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5C6BC0',
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  printButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#78909C',
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  exportExcelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#217346',
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // SMS Preview Modal styles
  smsPreviewModalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 30,
    maxHeight: '85%',
  },
  smsPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  smsPreviewIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(78, 205, 196, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  smsPreviewTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  smsPreviewClose: {
    padding: 8,
  },
  smsPreviewBody: {
    padding: 20,
  },
  smsPreviewLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
  },
  smsPreviewTextInput: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    color: '#fff',
    minHeight: 200,
    maxHeight: 300,
    textAlignVertical: 'top',
  },
  smsPreviewCharCount: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 8,
  },
  smsPreviewButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  smsPreviewCancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#2d2d44',
    alignItems: 'center',
  },
  smsPreviewCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
  },
  smsPreviewSendButton: {
    flex: 1,
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#5C6BC0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  smsPreviewSendText: {
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
  // Inventory styles
  inventorySubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
  },
  inventoryScroll: {
    marginHorizontal: -8,
  },
  inventoryCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 6,
    minWidth: 160,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inventoryCardSelected: {
    borderColor: '#4ECDC4',
    backgroundColor: '#3d3d54',
  },
  inventoryStock: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4ECDC4',
    marginBottom: 4,
  },
  inventoryModel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  inventoryTrim: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  inventoryVin: {
    fontSize: 10,
    color: '#4ECDC4',
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  inventoryPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFB347',
  },
  inventoryProfit: {
    fontSize: 11,
    color: '#4ECDC4',
    marginTop: 4,
  },
  noInventoryText: {
    color: '#888',
    fontStyle: 'italic',
    padding: 16,
    textAlign: 'center',
  },
  noInventoryContainer: {
    padding: 12,
  },
  manualVinContainer: {
    marginTop: 12,
    backgroundColor: '#1e1e2e',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  manualVinLabel: {
    color: '#4ECDC4',
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '500',
  },
  manualVinInput: {
    backgroundColor: '#2d2d44',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 15,
    fontFamily: 'monospace',
    borderWidth: 1,
    borderColor: '#444',
  },
  manualVinError: {
    color: '#ff6b6b',
    fontSize: 11,
    marginTop: 6,
  },
  manualVinSuccess: {
    color: '#4ECDC4',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  selectedInventoryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#4ECDC4',
  },
  selectedInventoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  selectedInventoryText: {
    fontSize: 13,
    color: '#4ECDC4',
    flex: 1,
  },
  selectedInventoryVin: {
    fontSize: 11,
    color: '#888',
    fontFamily: 'monospace',
    marginLeft: 28,
    marginTop: 2,
  },
  // Styles Auto-financing banner
  autoFinancingBanner: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  autoFinancingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  autoFinancingTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  autoFinancingContent: {
    gap: 4,
  },
  autoFinancingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autoFinancingLabel: {
    fontSize: 13,
    color: '#aaa',
  },
  autoFinancingLabelTotal: {
    fontSize: 13,
    color: '#fff',
    fontWeight: 'bold',
  },
  autoFinancingValue: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: 'bold',
  },
  autoFinancingValueBonus: {
    fontSize: 14,
    color: '#9b59b6',
    fontWeight: 'bold',
  },
  autoFinancingValueTotal: {
    fontSize: 15,
    color: '#FFD700',
    fontWeight: 'bold',
  },
  autoFinancingValueRate: {
    fontSize: 13,
    color: '#4CAF50',
    fontStyle: 'italic',
  },
  autoFinancingSource: {
    fontSize: 10,
    color: '#666',
    marginTop: 6,
    fontStyle: 'italic',
  },
  // Styles Accessoires
  accessoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  accessoryDescInput: {
    flex: 2,
    backgroundColor: '#2a2a3e',
    borderColor: '#4CAF50',
    color: '#ffffff',
    fontSize: 16,
  },
  accessoryPriceInput: {
    flex: 1,
    textAlign: 'right',
    backgroundColor: '#2a2a3e',
    borderColor: '#4CAF50',
    color: '#ffffff',
    fontSize: 16,
  },
  removeAccessoryBtn: {
    padding: 4,
  },
  addAccessoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderStyle: 'dashed',
    gap: 6,
  },
  addAccessoryText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  accessoriesTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  accessoriesTotalLabel: {
    color: '#aaa',
    fontSize: 14,
  },
  accessoriesTotalValue: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Base input style for accessories
  input: {
    backgroundColor: '#2d2d44',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#444',
    color: '#ffffff',
    fontSize: 15,
  },
  // Section header for accessories
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  // ============ LEASE SCI STYLES ============
  leaseToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#4ECDC4',
    backgroundColor: 'transparent',
  },
  leaseToggleActive: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
  },
  leaseToggleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4ECDC4',
  },
  leaseToggleTextActive: {
    color: '#fff',
  },
  leaseContent: {
    marginTop: 12,
    gap: 12,
  },
  leaseInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leaseInputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ccc',
    minWidth: 100,
  },
  leaseInput: {
    flex: 1,
    backgroundColor: '#2d2d44',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#3d3d5c',
  },
  leaseInputHint: {
    fontSize: 11,
    color: '#888',
    minWidth: 55,
  },
  // Residual by km table
  residualKmTable: {
    backgroundColor: '#1e2a3a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d3d54',
  },
  residualKmTitle: {
    fontSize: 12,
    color: '#8899aa',
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase' as any,
    letterSpacing: 0.5,
  },
  residualKmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 2,
  },
  residualKmRowSelected: {
    backgroundColor: 'rgba(78, 205, 196, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.3)',
  },
  residualKmHeader: {
    flex: 1,
    alignItems: 'center' as any,
  },
  residualKmHeaderText: {
    fontSize: 10,
    color: '#556677',
    fontWeight: '700',
    textTransform: 'uppercase' as any,
  },
  residualKmCell: {
    flex: 1,
    alignItems: 'center' as any,
  },
  residualKmText: {
    fontSize: 13,
    color: '#aabbcc',
    fontWeight: '500',
  },
  residualKmTextSelected: {
    color: '#4ECDC4',
    fontWeight: '700',
  },
  residualKmValue: {
    fontSize: 13,
    color: '#aabbcc',
    fontWeight: '500',
  },
  residualKmValueSelected: {
    color: '#4ECDC4',
    fontWeight: '700',
  },
  leaseInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1e2a3a',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#2d4a6c',
  },
  leaseInfoText: {
    fontSize: 11,
    color: '#88aabb',
    flex: 1,
  },
  leaseWarningBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3a1e1e',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#6c2d2d',
  },
  leaseWarningText: {
    fontSize: 11,
    color: '#FF6B6B',
    flex: 1,
  },
  leaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  leaseLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ccc',
    minWidth: 100,
  },
  leaseKmButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  leaseKmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2d2d44',
    borderWidth: 1,
    borderColor: '#3d3d5c',
  },
  leaseKmBtnActive: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
  },
  leaseKmBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
  },
  leaseKmBtnTextActive: {
    color: '#1a1a2e',
  },
  leaseTermScroll: {
    flexGrow: 0,
  },
  leaseTermBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2d2d44',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#3d3d5c',
  },
  leaseTermBtnActive: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
  },
  leaseTermBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
  },
  leaseTermBtnTextActive: {
    color: '#1a1a2e',
  },
  leaseResults: {
    gap: 10,
  },
  leaseResidualInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2d2d44',
    borderRadius: 10,
    padding: 12,
  },
  leaseResidualLabel: {
    fontSize: 13,
    color: '#aaa',
    fontWeight: '500',
  },
  leaseResidualValue: {
    fontSize: 15,
    color: '#4ECDC4',
    fontWeight: '700',
  },
  leaseBestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFD700',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  leaseBestText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1a2e',
    flex: 1,
  },
  leaseBestSavings: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  leaseCardsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  leaseCard: {
    flex: 1,
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3d3d5c',
    gap: 6,
  },
  leaseCardAlt: {
    backgroundColor: '#1e2a3a',
    borderColor: '#2d4a6c',
  },
  leaseCardBest: {
    borderColor: '#4ECDC4',
    borderWidth: 2,
  },
  leaseCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  leaseCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  leaseCardDetail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leaseCardDetailLabel: {
    fontSize: 11,
    color: '#888',
  },
  leaseCardDetailValue: {
    fontSize: 11,
    color: '#ccc',
    fontWeight: '500',
  },
  leaseCardRateValue: {
    fontSize: 13,
    color: '#4ECDC4',
    fontWeight: '700',
  },
  leaseCardMainResult: {
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
  },
  leaseCardPaymentLabel: {
    fontSize: 10,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  leaseCardPaymentValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4ECDC4',
    marginTop: 2,
  },
  leaseCardTaxDetail: {
    fontSize: 10,
    color: '#777',
    marginTop: 2,
  },
  leaseCardTaxBreakdown: {
    marginTop: 3,
    paddingTop: 3,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  leaseCardTaxLine: {
    fontSize: 9,
    color: '#666',
    lineHeight: 14,
  },
  leaseCardRabaisLine: {
    fontSize: 9,
    color: '#4ECDC4',
    marginTop: 2,
    fontWeight: '500',
  },
  bestLeaseBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
    padding: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  bestLeaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  bestLeaseTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFD700',
    letterSpacing: 1,
  },
  bestLeaseContent: {
    gap: 4,
  },
  bestLeaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bestLeaseLabel: {
    fontSize: 11,
    color: '#999',
  },
  bestLeaseValue: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  bestLeaseTap: {
    fontSize: 9,
    color: '#666',
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic',
  },
  leaseCardTotalValue: {
    fontSize: 12,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  leaseNoOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    backgroundColor: '#2d2d44',
    borderRadius: 10,
  },
  leaseNoOptionText: {
    fontSize: 13,
    color: '#888',
    flex: 1,
  },
  leaseVsFinance: {
    backgroundColor: '#1e1e3a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#3d3d5c',
  },
  leaseVsFinanceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 10,
  },
  leaseVsFinanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leaseVsFinanceCol: {
    flex: 1,
    alignItems: 'center',
  },
  leaseVsFinanceLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  leaseVsFinanceValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4ECDC4',
  },
  leaseVsFinanceSub: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  leaseVsFinanceDivider: {
    width: 1,
    height: 50,
    backgroundColor: '#3d3d5c',
    marginHorizontal: 8,
  },
});
// Last update: Thu Feb 19 19:47:53 UTC 2026
