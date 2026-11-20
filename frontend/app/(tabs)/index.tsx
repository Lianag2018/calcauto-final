import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
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
  Share,
  Linking,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import html2canvas from 'html2canvas';

// Import components and i18n
import { AnimatedSplashScreen } from '../../components/AnimatedSplashScreen';
import { GaugeMark } from '../../components/GaugeMark';
import { Dossier, dossierFromContact, takeQueuedDossier, takeEvalId, syncDossiers, fetchListingUrl, usedQuoteSms, smsHref, windowStickerUrl, smsLinks, tradeDetail, dossierFeeForMode, otherFees, DOSSIER_FEE, WINDSHIELD_FEE } from '../../utils/etvDossier';
import { newQuoteSms, plainVehicle, hasNameAndPhone } from '../../utils/quoteSms';
import { findMatchingContact, contactChanges } from '../../utils/contactMatch';
import { STAGE_COLORS, colorLabel, stageLabel, stockLabel } from '../../utils/vehicleCard';
import { LanguageSelector } from '../../components/LanguageSelector';
import { Language, saveLanguage, loadLanguage, getTranslation, TranslationKeys } from '../../utils/i18n';
import { useAuth } from '../../contexts/AuthContext';
import frTranslations from '../../locales/fr.json';
import enTranslations from '../../locales/en.json';
// Logique de calcul extraite
import { useCalculator, resolveBonus, offersOf, offerKey, checkedOffersTotal, getRateForTerm, formatCurrency, formatCurrencyDecimal } from '../../hooks/useCalculator';
import { 
  computeLeasePayment, computeLeaseForGrid, leaseCashFor, 
  findResidualVehicle, findRateEntry, getKmAdjustment, residualCandidates,
  extraKmReduction, HIGH_KM_OPTIONS,
  LeaseInputs 
} from '../../utils/leaseCalculator';
import type { FinancingRates, VehicleProgram, PaymentComparison, CalculationResult, LocalResult, ProgramPeriod, PaymentFrequency } from '../../types/calculator';
// Extracted components and styles
import { EventBanner } from '../../components/EventBanner';
import { styles, loadingStyles } from './styles/homeStyles';

import { API_URL } from '../../utils/api';
import { ETV_LOGO, fetchDealerBranding, DealerBranding } from '../../utils/printBranding';
import { jpegToLetterPdf, blobToBase64 } from '../../utils/simplePdf';

const SUBMISSIONS_KEY = 'calcauto_submissions';

const translations = {
  fr: frTranslations,
  en: enTranslations,
};

const monthNames = {
  fr: frTranslations.months,
  en: enTranslations.months,
};

// Prix de départ d'un véhicule neuf : le PDSF, jamais le prix du site déjà réduit.
const newVehicleBasePrice = (vehicle: any): number =>
  Number(vehicle?.calc_price ?? Math.max(Number(vehicle?.msrp) || 0, Number(vehicle?.asking_price) || 0)) || 0;

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
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [dealerBranding, setDealerBranding] = useState<DealerBranding | null>(null);
  const [stickerDetails, setStickerDetails] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    fetchDealerBranding(user?.dealer_slug).then((b) => { if (alive) setDealerBranding(b); });
    return () => { alive = false; };
  }, [user?.dealer_slug]);
  const [printNotice, setPrintNotice] = useState('');
  const [printBusy, setPrintBusy] = useState(false);
  const [printReadyFile, setPrintReadyFile] = useState<any>(null);
  const [clientAskFor, setClientAskFor] = useState<'print' | 'sms'>('print');
  const [clientEmail, setClientEmail] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  
  // SMS Preview modal
  const [showSmsPreview, setShowSmsPreview] = useState(false);
  const [smsPreviewText, setSmsPreviewText] = useState('');
  
  // Current program period
  const [currentPeriod, setCurrentPeriod] = useState<{month: number, year: number} | null>(null);
  
  // Program event metadata (from cover page parsing)
  const [programMeta, setProgramMeta] = useState<{
    event_names: string[];
    program_period: string;
    program_month: string;
    loyalty_rate: number;
    no_payments_days: number;
    featured_rate: number | null;
    featured_term: number | null;
    key_message: string;
    brands?: string[];
  } | null>(null);
  
  // Loyalty rate toggle (from event metadata)
  const [loyaltyChecked, setLoyaltyChecked] = useState(false);
  // Prime de fidélité (après taxes) : le vendeur coche quand le client y a droit
  // Promotions du mois cochées pour ce client (fidélité, liquidation ciblée, vendredi fou…)
  const [checkedOffers, setCheckedOffers] = useState<Record<string, boolean>>({});
  // Version et carrosserie choisies pour le résiduel de location (rien = à confirmer)
  const [residualPick, setResidualPick] = useState<{ version?: string; body?: string }>({});
  
  // 90 days deferred payment toggle
  const [deferredPayment, setDeferredPayment] = useState(false);
  
  // Available periods (from API)
  const [availablePeriods, setAvailablePeriods] = useState<{month: number, year: number, count: number}[]>([]);
  const [showPeriodSelector, setShowPeriodSelector] = useState(false);
  
  // Selected term for calculation
  const [selectedTerm, setSelectedTerm] = useState<number>(72);
  // Véhicule neuf (programmes du fabricant) ou d'occasion (taux entré par le conseiller)
  const [vehicleMode, setVehicleMode] = useState<'neuf' | 'usage'>('neuf');
  const [usedRate, setUsedRate] = useState<string>('8.99');
  const [usedSearch, setUsedSearch] = useState<string>('');
  const isUsed = vehicleMode === 'usage';
  const availableTerms = isUsed ? [24, 36, 48, 60, 72, 84, 96] : [36, 48, 60, 72, 84, 96];
  
  // Inventory selection for calculator
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState<any>(null);
  const [showInventoryPicker, setShowInventoryPicker] = useState(false);
  // Codes de modèle couverts par le programme choisi (liste de choix)
  const [modelCodes, setModelCodes] = useState<{ code: string; description: string; in_stock: number }[]>([]);
  const [pickedCode, setPickedCode] = useState<string>('');
  const [showCodeList, setShowCodeList] = useState(false);
  const [manualVin, setManualVin] = useState<string>('');  // VIN manuel si pas d'inventaire
  
  // Intelligent inventory-to-program matching
  const matchesInventoryToProgram = useCallback((vehicle: any, program: any) => {
    if (!vehicle || !program) return false;
    // Le serveur associe chaque véhicule à sa ligne en respectant les codes de
    // produit et les exclusions (DT6H91, CPOS...). On s'y fie pour la période
    // qu'il a calculée ; sinon, ancienne association par nom de version.
    const match = vehicle.program_match;
    if (match && program.id && match.program_month === program.program_month
        && match.program_year === program.program_year) {
      if (match.program_id) return match.program_id === program.id;
      return (match.candidate_ids || []).includes(program.id);
    }
    // Brand must match
    if (vehicle.brand?.toLowerCase() !== program.brand?.toLowerCase()) return false;
    // Year must match
    if (String(vehicle.year) !== String(program.year)) return false;
    
    const invModel = (vehicle.model || '').toLowerCase().replace(/\s+/g, '');
    const progModel = (program.model || '').toLowerCase().replace(/\s+/g, '');
    const invTrim = (vehicle.trim || '').toLowerCase();
    const progTrim = (program.trim || '').toLowerCase();
    
    // Model must match (handle "2500/3500" matching "2500" or "3500")
    const progModels = progModel.split('/');
    const modelMatch = progModels.some((pm: string) => pm === invModel) || invModel === progModel;
    if (!modelMatch) return false;
    
    // Check if program has exclusions (e.g., "Gas Models (excl Power Wagon, Chassis Cab)")
    const hasExclusion = progTrim.includes('excl') || progTrim.includes('excludes');
    
    // Check if program is specifically for a single named trim (e.g., "Power Wagon Crew Cab")
    const isSpecificTrim = !hasExclusion && !progTrim.includes('models') && !progTrim.includes(',');
    
    if (isSpecificTrim) {
      // Program is for a specific trim like "Power Wagon" - inventory trim must contain it
      const progTrimWords = progTrim.split(/[\s(]/)[0]; // first significant word
      return invTrim.includes(progTrimWords) || progTrim.includes(invTrim.split(' ')[0]);
    }
    
    if (hasExclusion) {
      // Extract exclusion list
      const exclMatch = progTrim.match(/(?:excl(?:udes?)?)\s+(.+?)(?:\)|$)/i);
      if (exclMatch) {
        const exclusions = exclMatch[1].toLowerCase();
        // Check if inventory trim matches any exclusion
        if (exclusions.includes('power wagon') && invTrim.includes('power wagon')) return false;
        if (exclusions.includes('chassis cab') && invTrim.includes('chassis cab')) return false;
      }
      return true;
    }
    
    // Comma-separated trim list (e.g., "Tradesman, Express, Warlock")
    const progTrims = progTrim.split(',').map((t: string) => t.trim());
    if (progTrims.length > 1) {
      const invFirstWord = invTrim.split(' ')[0];
      return progTrims.some((pt: string) => pt.includes(invFirstWord) || invTrim.includes(pt));
    }
    
    return true;
  }, []);
  
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
  
  // Solde reporté location (ajouté au prix avant taxes)
  const [soldeReporteLocation, setSoldeReporteLocation] = useState('');
  
  // Comptant (cash down payment, taxes included)
  const [comptantTxInclus, setComptantTxInclus] = useState('');
  
  // Accessoires additionnels (ajoutés au prix avant taxes)
  const [accessories, setAccessories] = useState<Array<{description: string; price: string}>>([]);
  
  // Frais additionnels (taxables)
  const [fraisDossier, setFraisDossier] = useState('259.95');
  const [taxePneus, setTaxePneus] = useState('15');
  const [fraisRDPRM, setFraisRDPRM] = useState('100');
  const [assurancePareBrise, setAssurancePareBrise] = useState<string>(WINDSHIELD_FEE);
  const [fraisDivers, setFraisDivers] = useState('');
  const fraisAutres = otherFees(assurancePareBrise, fraisDivers);
  // Reprise du dossier eTradeValue chargé : décrite dans la section Échange.
  const [tradeInfo, setTradeInfo] = useState<{ client: string; vehicle: string } | null>(null);
  
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
  const leaseKmOptions = [12000, 18000, 24000, ...HIGH_KM_OPTIONS];

  // Calcul de financement (logique extraite dans useCalculator)
  const specialOffers = offersOf(selectedProgram);
  // Certains véhicules n'ont pas d'option 1 dans le PDF : elle n'est alors pas offerte.
  const hasOption1 = !selectedProgram || !!selectedProgram.option1_rates;
  // Lease Cash du taux standard (colonne 261QLB du PDF) : offert en case à cocher,
  // seulement pour la location au taux standard, jamais ajouté d'office.
  const leaseRateEntry = useMemo(() => (selectedProgram && leaseRates)
    ? findRateEntry(leaseRates[`vehicles_${selectedProgram.year}`] || [], selectedProgram.brand, selectedProgram.model, selectedProgram.trim || '')
    : null, [selectedProgram, leaseRates]);
  const STD_RATE_CASH_KEY = 'standard-rate-lease-cash';
  const stdRateLeaseCash = leaseRateEntry?.standard_rate_lease_cash || 0;
  const stdRateCashChecked = !!checkedOffers[STD_RATE_CASH_KEY];
  // Après taxes : déduit du solde, à part du comptant. Avant taxes : réduit le prix taxable.
  const loyaltyBonus = checkedOffersTotal(specialOffers, checkedOffers, 'after', 'E');
  const offersBeforeTax = checkedOffersTotal(specialOffers, checkedOffers, 'before', 'E');
  const leaseOffersAfterTax = checkedOffersTotal(specialOffers, checkedOffers, 'after', 'L');
  const leaseOffersBeforeTax = checkedOffersTotal(specialOffers, checkedOffers, 'before', 'L');
  const offerLabel = (o: any) => `${o.name}${o.code ? ` — ${o.code}` : ''}`;
  const beforeTaxRebates: { label: string; amount: number }[] = specialOffers
    .filter((o: any) => o.tax === 'before' && checkedOffers[offerKey(o)])
    .map((o: any) => ({ label: offerLabel(o), amount: o.amount }));
  // Rabais après taxes, un par programme : inscrits à part du comptant réel du client,
  // avec le nom et le code du programme (« … Loyalty Bonus Cash — 2646G1 »).
  const rebateName = (fallback: string, program?: { code: string; name: string } | null) =>
    program?.name ? `${program.name}${program.code ? ` — ${program.code}` : ''}` : fallback;
  // Un montant tapé à la main remplace la prime du programme, même 0 ; il ne porte pas le code du programme.
  const programBonus = resolveBonus(customBonusCash, selectedProgram?.bonus_cash || 0);
  const bonusIsTyped = programBonus !== (selectedProgram?.bonus_cash || 0);
  const afterTaxRebates: { label: string; amount: number }[] = [
    ...(programBonus > 0 ? [{ label: bonusIsTyped ? (lang === 'fr' ? 'Bonus Cash (montant saisi)' : 'Bonus Cash (entered amount)') : rebateName('Bonus Cash', selectedProgram?.bonus_cash_program), amount: programBonus }] : []),
    ...specialOffers
      .filter((o: any) => o.tax === 'after' && checkedOffers[offerKey(o)])
      .map((o: any) => ({ label: offerLabel(o), amount: o.amount })),
  ];
  const activeLoyaltyRate = loyaltyChecked && programMeta?.loyalty_rate ? programMeta.loyalty_rate : 0;
  const { localResult } = useCalculator({
    selectedProgram,
    vehiclePrice,
    selectedTerm,
    customBonusCash,
    comptantTxInclus,
    fraisDossier,
    taxePneus,
    fraisRDPRM,
    fraisAutres,
    prixEchange,
    montantDuEchange,
    accessories,
    rabaisConcess: leaseRabaisConcess,
    loyaltyRate: activeLoyaltyRate,
    loyaltyBonus,
    offersBeforeTax,
    deferredPayment,
    soldeReporteLocation,
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
      // Sort programs by sort_order (logical trim hierarchy from manufacturer)
      const sorted = [...response.data].sort((a: any, b: any) => {
        return (a.sort_order || 0) - (b.sort_order || 0);
      });
      setFilteredPrograms(sorted);
      
      // Get current period from first program or params
      if (response.data.length > 0) {
        const periodMonth = month || response.data[0].program_month;
        const periodYear = year || response.data[0].program_year;
        setCurrentPeriod({ month: periodMonth, year: periodYear });
        
        // Load program metadata (event info from cover page)
        try {
          const metaRes = await axios.get(`${API_URL}/api/program-meta`, {
            params: { month: periodMonth, year: periodYear }
          });
          if (metaRes.data && metaRes.data.event_names) {
            setProgramMeta(metaRes.data);
            // Reset loyalty checkbox when switching periods
            setLoyaltyChecked(false);
            setDeferredPayment(false);
          }
        } catch (e) {
          console.log('Could not load program meta');
          setProgramMeta(null);
        }
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

  // Au retour sur l'écran (après un import, ou depuis un autre onglet) : si la liste
  // des périodes a changé, on recharge. Sans cela, un mois fraîchement importé
  // n'apparaît qu'après un rechargement complet de la page.
  // Retour de l'écran d'import : toujours recharger (même mois réimporté).
  const { refresh: refreshParam } = useLocalSearchParams<{ refresh?: string }>();
  useEffect(() => {
    if (refreshParam) loadPrograms();
  }, [refreshParam, loadPrograms]);
  const knownPeriods = useRef<string | null>(null);
  useEffect(() => {
    if (availablePeriods.length) knownPeriods.current = JSON.stringify(availablePeriods);
  }, [availablePeriods]);
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    let cancelled = false;
    axios.get(`${API_URL}/api/periods`).then(res => {
      if (cancelled || JSON.stringify(res.data) === knownPeriods.current) return;
      loadPrograms();
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [loadPrograms]));

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
      } finally {
        setInventoryLoaded(true);
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
          `${API_URL}/api/product-codes/${selectedInventory.model_code}/financing`,
          { params: {
            year: selectedInventory.year,
            brand: selectedInventory.brand,
            model: selectedInventory.model,
            trim: selectedInventory.trim || '',
            stock_no: selectedInventory.stock_no,
          } }
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

  // Liste des codes de modèle du programme choisi
  useEffect(() => {
    setModelCodes([]);
    setPickedCode('');
    setShowCodeList(false);
    if (!selectedProgram?.id || selectedProgram.id === 'used') return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await axios.get(`${API_URL}/api/programs/${selectedProgram.id}/model-codes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && Array.isArray(res.data)) setModelCodes(res.data);
      } catch (e) {
        console.log('Could not load model codes');
      }
    })();
    return () => { cancelled = true; };
  }, [selectedProgram?.id]);

  // Véhicules neufs en inventaire pour le programme (et le code) choisis
  const programInventory = useMemo(() => inventoryList.filter((v: any) =>
    v.type !== 'occasion'
    && matchesInventoryToProgram(v, selectedProgram)
    // Un véhicule sans code reste visible : le code choisi lui sera donné
    && (!pickedCode || !v.model_code || (v.model_code || '').toUpperCase() === pickedCode)
  ), [inventoryList, selectedProgram, pickedCode, matchesInventoryToProgram]);

  // Nombre de véhicules neufs en inventaire pour chaque ligne de programme affichée
  const stockByProgram = useMemo(() => {
    const counts: Record<string, number> = {};
    const fresh = inventoryList.filter((v: any) => v.type !== 'occasion');
    filteredPrograms.forEach((program: any) => {
      counts[program.id] = fresh.filter((v: any) => matchesInventoryToProgram(v, program)).length;
    });
    return counts;
  }, [inventoryList, filteredPrograms, matchesInventoryToProgram]);

  // Le conseiller choisit un code pour un véhicule dont la fiche n'en a pas :
  // on l'inscrit sur la fiche, pour les prochains calculs de tout le monde.
  const [codeSavedFor, setCodeSavedFor] = useState<string>('');
  useEffect(() => {
    const vehicle = selectedInventory;
    if (!vehicle?.stock_no || vehicle.model_code || !pickedCode) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const saved = await axios.put(`${API_URL}/api/inventory/${encodeURIComponent(vehicle.stock_no)}`,
          { model_code: pickedCode }, { headers: { Authorization: `Bearer ${token}` } });
        if (cancelled) return;
        const match = saved.data?.program_match;
        const patch = (v: any) => ({ ...v, model_code: pickedCode, ...(match ? { program_match: match } : {}) });
        setInventoryList(list => list.map((v: any) => v.stock_no === vehicle.stock_no ? patch(v) : v));
        setSelectedInventory((v: any) => v && v.stock_no === vehicle.stock_no ? patch(v) : v);
        // Le code détermine la ligne de programme : on passe à la bonne ligne
        // pour que les rabais admissibles soient ceux de ce code.
        const rightProgram = match?.program_id && match.program_id !== selectedProgram?.id
          ? programs.find((p: any) => p.id === match.program_id) : null;
        if (rightProgram) selectProgram(rightProgram);
        setCodeSavedFor(`${vehicle.stock_no} · ${pickedCode}`
          + (rightProgram ? (lang === 'fr' ? ` — programme ajusté : ${rightProgram.trim || rightProgram.model}` : ` — program adjusted: ${rightProgram.trim || rightProgram.model}`) : '')
          + (saved.data?.code_learned ? (lang === 'fr' ? ' — code retenu pour les prochains véhicules de cette version' : ' — code kept for future vehicles of this trim') : ''));
      } catch (e) {
        console.log('Could not save model code on vehicle');
      }
    })();
    return () => { cancelled = true; };
  }, [selectedInventory?.stock_no, selectedInventory?.model_code, pickedCode]);

  // Véhicule sans code : le serveur lit la version (fiche, annonce, NIV) et
  // propose les codes de cette version.
  const [codeSuggest, setCodeSuggest] = useState<any>(null);
  const [typedCode, setTypedCode] = useState<string>('');
  useEffect(() => {
    const vehicle = selectedInventory;
    setCodeSuggest(null);
    if (!vehicle?.stock_no || vehicle.model_code || vehicle.type === 'occasion') return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await axios.get(
          `${API_URL}/api/inventory/${encodeURIComponent(vehicle.stock_no)}/code-suggestions`,
          { headers: { Authorization: `Bearer ${token}` } });
        if (!cancelled) setCodeSuggest(res.data);
      } catch (e) {
        console.log('Could not load code suggestions');
      }
    })();
    return () => { cancelled = true; };
  }, [selectedInventory?.stock_no, selectedInventory?.model_code]);

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

  // Fiche technique du véhicule (Window Sticker) pour la soumission imprimée : lue dès que le NIV est connu.
  const stickerVin = selectedInventory?.vin || (manualVin && manualVin.length === 17 ? manualVin : '');
  useEffect(() => {
    setStickerDetails(null);
    if (!stickerVin || stickerVin.length !== 17) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await axios.get(`${API_URL}/api/window-sticker/${stickerVin}/details`, {
          headers: { Authorization: `Bearer ${token}` }, timeout: 30000,
        });
        if (!cancelled && res.data?.success && res.data.details) setStickerDetails(res.data.details);
      } catch (e) {
        // Sans fiche, la soumission s'imprime comme avant.
      }
    })();
    return () => { cancelled = true; };
  }, [stickerVin]);

  // Check for submission state to restore (from CRM "Ouvrir" button).
  // À chaque retour sur l'écran, pas seulement à son premier affichage : l'onglet Calcul reste en
  // mémoire, et la soumission demandée depuis le CRM n'y était alors jamais chargée.
  useFocusEffect(useCallback(() => {
    const checkForRestore = async () => {
      try {
        const stateJson = await AsyncStorage.getItem('calcauto_restore_state');
        if (!stateJson) return;
        await AsyncStorage.removeItem('calcauto_restore_state');
        const s = JSON.parse(stateJson);
        
        // Restore all calculator fields
        if (s.selectedProgram) setSelectedProgram(s.selectedProgram);
        setCheckedOffers(s.checkedOffers && typeof s.checkedOffers === 'object' ? s.checkedOffers : {});
        if (s.vehiclePrice !== undefined) setVehiclePrice(s.vehiclePrice);
        if (s.selectedTerm) setSelectedTerm(s.selectedTerm);
        if (s.selectedOption) setSelectedOption(s.selectedOption);
        if (s.paymentFrequency) setPaymentFrequency(s.paymentFrequency);
        if (s.customBonusCash !== undefined) setCustomBonusCash(s.customBonusCash);
        if (s.comptantTxInclus !== undefined) setComptantTxInclus(s.comptantTxInclus);
        if (s.fraisDossier !== undefined) setFraisDossier(s.fraisDossier);
        if (s.taxePneus !== undefined) setTaxePneus(s.taxePneus);
        if (s.fraisRDPRM !== undefined) setFraisRDPRM(s.fraisRDPRM);
        // Soumission d'avant ces frais : ils n'en faisaient pas partie.
        setAssurancePareBrise(s.assurancePareBrise !== undefined ? s.assurancePareBrise : '');
        setFraisDivers(s.fraisDivers !== undefined ? s.fraisDivers : '');
        if (s.prixEchange !== undefined) setPrixEchange(s.prixEchange);
        if (s.montantDuEchange !== undefined) setMontantDuEchange(s.montantDuEchange);
        if (s.accessories) setAccessories(s.accessories);
        if (s.leaseRabaisConcess !== undefined) setLeaseRabaisConcess(s.leaseRabaisConcess);
        if (s.leasePdsf !== undefined) setLeasePdsf(s.leasePdsf);
        if (s.leaseSoldeReporte !== undefined) setLeaseSoldeReporte(s.leaseSoldeReporte);
        if (s.leaseTerm) setLeaseTerm(s.leaseTerm);
        if (s.leaseKmPerYear) setLeaseKmPerYear(s.leaseKmPerYear);
        if (s.showLease !== undefined) setShowLease(s.showLease);
        if (s.manualVin !== undefined) setManualVin(s.manualVin);
        if (s.selectedYear) setSelectedYear(s.selectedYear);
        if (s.selectedBrand) setSelectedBrand(s.selectedBrand);
        if (s.selectedInventory) setSelectedInventory(s.selectedInventory);
        if (s.vehicleMode === 'usage') setVehicleMode('usage');
        if (s.usedRate) setUsedRate(String(s.usedRate));
        // Le client de la fiche CRM d'où vient la soumission
        if (s.clientName) setClientName(String(s.clientName));
        if (s.clientEmail) setClientEmail(String(s.clientEmail));
        if (s.clientPhone) setClientPhone(String(s.clientPhone));
        
        console.log('Calculator state restored from submission');
      } catch (e) {
        console.log('Error restoring calculator state:', e);
      }
    };
    checkForRestore();
  }, []));

  // Résiduel du véhicule choisi. Le guide contient plusieurs années-modèles
  // (2025, 2026, 2027) avec des pourcentages différents : on ne cherche que
  // dans l'année du programme, et le calcul et le tableau du kilométrage
  // utilisent la même ligne.
  // Un programme couvre souvent plusieurs versions et carrosseries dont le
  // résiduel diffère : on les liste toutes, et la ligne retenue est celle du
  // véhicule d'inventaire, sinon celle que le vendeur choisit.
  const residualOptions = useMemo(() => {
    if (!selectedProgram || !leaseResiduals?.vehicles) return [];
    const sameYear = leaseResiduals.vehicles.filter(
      (v: any) => String(v.model_year) === String(selectedProgram.year)
    );
    return residualCandidates(sameYear, selectedProgram.brand, selectedProgram.model, selectedProgram.trim || '');
  }, [selectedProgram, leaseResiduals]);

  const residualVersionOf = (v: any) =>
    residualOptions.some((o: any) => o.model_name !== v.model_name) ? `${v.model_name} ${v.trim}` : v.trim;

  const residualVehicle = useMemo(() => {
    if (!selectedProgram || residualOptions.length === 0) return null;
    let pool = residualOptions;
    const narrow = (test: (v: any) => boolean) => {
      const found = pool.filter(test);
      if (found.length) pool = found;
    };
    const invTrim = (selectedInventory?.trim || '').toLowerCase().trim();
    if (residualPick.version) narrow((v: any) => residualVersionOf(v) === residualPick.version);
    else if (invTrim) narrow((v: any) => (v.trim || '').toLowerCase() === invTrim);
    const body = (residualPick.body || selectedInventory?.body_style || '').toLowerCase();
    if (body) narrow((v: any) => (v.body_style || '').toLowerCase() === body);
    return findResidualVehicle(
      pool,
      selectedProgram.brand,
      selectedProgram.model,
      selectedProgram.trim || '',
      selectedInventory?.body_style
    ) || pool[0];
  }, [selectedProgram, residualOptions, residualPick, selectedInventory?.body_style, selectedInventory?.trim]);

  // Calculate lease when parameters change
  useEffect(() => {
    if (!showLease || !selectedProgram || !vehiclePrice || !leaseResiduals || !leaseRates) {
      setLeaseResult(null);
      return;
    }

    const price = parseFloat(vehiclePrice);
    if (isNaN(price) || price <= 0) return;

    if (!residualVehicle) { setLeaseResult(null); return; }

    const residualPct = residualVehicle.residual_percentages?.[String(leaseTerm)] || 0;
    if (residualPct === 0) { setLeaseResult(null); return; }

    // Find matching rate entry
    const year = selectedProgram.year;
    // Taux de l'année-modèle du programme (2027 compris), jamais ceux d'une autre année
    const vehicleList = leaseRates[`vehicles_${year}`];
    const rateEntry = findRateEntry(vehicleList || [], selectedProgram.brand, selectedProgram.model, selectedProgram.trim || '');

    const termKey = String(leaseTerm);
    const standardRate = rateEntry?.standard_rates?.[termKey] ?? null;
    const alternativeRate = rateEntry?.alternative_rates?.[termKey] ?? null;
    // Les promotions avant taxes cochées s'ajoutent au Lease Cash des deux options
    const leaseCashVal = leaseCashFor(rateEntry, 'standard', stdRateCashChecked) + leaseOffersBeforeTax;
    const altLeaseCashVal = leaseCashFor(rateEntry, 'alternative') + leaseOffersBeforeTax;

    // km adjustment + residual
    const kmAdj = leaseResiduals.km_adjustments?.adjustments;
    const kmAdjustment = getKmAdjustment(kmAdj, leaseKmPerYear, leaseTerm);
    const adjustedResidualPct = residualPct + kmAdjustment;
    const pdsf = parseFloat(leasePdsf) || parseFloat(vehiclePrice);

    // Shared inputs for both options
    const bonusCash = programBonus + leaseOffersAfterTax;
    const comptant = parseFloat(comptantTxInclus) || 0;
    const tradeVal = parseFloat(prixEchange) || 0;
    const tradeOwed = parseFloat(montantDuEchange) || 0;
    const soldeReporte = parseFloat(leaseSoldeReporte) || 0;
    const totalAccessoires = accessories.reduce((sum: number, acc: {description: string; price: string}) => sum + (parseFloat(acc.price) || 0), 0);

    const baseInputs: Omit<LeaseInputs, 'rate' | 'leaseCash'> = {
      price,
      pdsf,
      term: leaseTerm,
      residualPct: adjustedResidualPct,
      kmPerYear: leaseKmPerYear,
      fraisDossier: parseFloat(fraisDossier) || 0,
      totalAccessoires,
      rabaisConcess: parseFloat(leaseRabaisConcess) || 0,
      soldeReporte,
      tradeValue: tradeVal,
      tradeOwed,
      comptant,
      bonusCash,
    };

    const results: any = {
      vehicleName: `${residualVehicle.brand} ${residualVehicle.model_name} ${residualVehicle.trim}`,
      residualPct: adjustedResidualPct,
      residualValue: pdsf * (adjustedResidualPct / 100) - extraKmReduction(leaseKmPerYear, leaseTerm),
      kmAdjustment,
      // Promotions avant taxes cochées : comprises dans le montant déduit, affichées à part
      offersBeforeTax: leaseOffersBeforeTax,
      term: leaseTerm,
      kmPerYear: leaseKmPerYear,
    };

    // Standard option (with lease cash)
    if (standardRate !== null) {
      results.standard = computeLeasePayment({ ...baseInputs, rate: standardRate, leaseCash: leaseCashVal });
    }
    // Alternative option (lower rate, Alternative Lease Cash when the program has one)
    if (alternativeRate !== null) {
      results.alternative = computeLeasePayment({ ...baseInputs, rate: alternativeRate, leaseCash: altLeaseCashVal });
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

    // === CALCUL MEILLEUR CHOIX: itère TOUS les termes × TOUS les km ===
    const availableTerms = [24, 27, 36, 39, 42, 48, 51, 54, 60];
    let bestOption: any = null;
    const grid: any[] = [];

    for (const km of [12000, 18000, 24000]) {
      for (const t of availableTerms) {
        const resPct = residualVehicle.residual_percentages?.[String(t)] || 0;
        if (resPct === 0) continue;

        const kmAdj2 = getKmAdjustment(kmAdj, km, t);
        const adjResPct = resPct + kmAdj2;

        const stdRate = rateEntry?.standard_rates?.[String(t)] ?? null;
        const altRate = rateEntry?.alternative_rates?.[String(t)] ?? null;

        const gridInputs: Omit<LeaseInputs, 'rate' | 'leaseCash' | 'term' | 'residualPct'> = {
          price, pdsf,
          fraisDossier: parseFloat(fraisDossier) || 0,
          totalAccessoires,
          rabaisConcess: parseFloat(leaseRabaisConcess) || 0,
          soldeReporte,
          tradeValue: tradeVal,
          tradeOwed,
          comptant,
          bonusCash,
        };

        if (altRate !== null) {
          const r = computeLeaseForGrid({ ...gridInputs, rate: altRate, leaseCash: altLeaseCashVal, term: t, residualPct: adjResPct });
          const entry = { ...r, kmPerYear: km, option: 'alt', optionLabel: 'Alt' };
          grid.push(entry);
          if (!bestOption || r.monthly < bestOption.monthly) {
            bestOption = { ...entry, option: 'alternative', optionLabel: 'Taux Alternatif' };
          }
        }
        if (stdRate !== null) {
          const r = computeLeaseForGrid({ ...gridInputs, rate: stdRate, leaseCash: leaseCashVal, term: t, residualPct: adjResPct });
          const entry = { ...r, kmPerYear: km, option: 'std', optionLabel: 'Std' };
          grid.push(entry);
          if (!bestOption || r.monthly < bestOption.monthly) {
            bestOption = { ...entry, option: 'standard', optionLabel: 'Std + Lease Cash' };
          }
        }
      }
    }

    setBestLeaseOption(bestOption);
    setLeaseAnalysisGrid(grid);
  }, [showLease, selectedProgram, vehiclePrice, leaseTerm, leaseKmPerYear, leaseResiduals, leaseRates, residualVehicle, 
      programBonus, leaseOffersAfterTax, leaseOffersBeforeTax, stdRateCashChecked, comptantTxInclus, fraisDossier, taxePneus, fraisRDPRM, prixEchange, montantDuEchange, accessories, leasePdsf, leaseSoldeReporte, leaseRabaisConcess, selectedInventory?.body_style]);

  // Filter programs when year or brand changes
  useEffect(() => {
    let filtered = [...programs];
    if (selectedYear) {
      filtered = filtered.filter(p => p.year === selectedYear);
    }
    if (selectedBrand) {
      filtered = filtered.filter(p => p.brand === selectedBrand);
    }
    // Sort by sort_order (logical trim hierarchy from manufacturer)
    filtered.sort((a, b) => {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
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
    // La prime de fidélité se recoche pour chaque véhicule : jamais reportée d'un client à l'autre.
    setCheckedOffers({});
    setResidualPick({});
    setResults(null);
  };

  // ----- Dossier d'évaluation eTradeValue -----
  // Le CRM (bouton « Calculer ») ou l'arrivée depuis une évaluation dépose un
  // dossier : client, reprise et véhicule convoité remplissent le calculateur.
  const [pendingDossier, setPendingDossier] = useState<Dossier | null>(null);
  const [dossierNote, setDossierNote] = useState('');

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    takeQueuedDossier().then(d => { if (d && !cancelled) setPendingDossier(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []));

  useEffect(() => {
    if (!user?.etv_username) return;
    let cancelled = false;
    (async () => {
      const evalId = await takeEvalId();
      const token = await getToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      await syncDossiers(headers);
      if (!evalId || cancelled) return;
      try {
        const res = await axios.get(`${API_URL}/api/contacts`, { headers });
        const contact = (res.data || []).find((c: any) => c.etv_eval_id === evalId);
        const dossier = dossierFromContact(contact);
        if (dossier && !cancelled) setPendingDossier(dossier);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user?.etv_username]);

  useEffect(() => {
    if (!pendingDossier) return;
    const wanted = pendingDossier.desired[0];
    // Le véhicule convoité se cherche dans l'inventaire et les programmes : on attend qu'ils soient chargés.
    if (wanted && (programsLoading || !inventoryLoaded)) return;
    const d = pendingDossier;
    setPendingDossier(null);
    setClientName(d.name);
    setClientPhone(d.phone);
    setClientEmail(d.email);
    setPrixEchange(d.trade?.value ? String(Math.round(d.trade.value)) : '');
    setMontantDuEchange(d.trade?.balance_owed ? String(Math.round(d.trade.balance_owed)) : '');
    setTradeInfo(d.trade ? { client: d.name, vehicle: tradeDetail(d) } : null);
    const fr = lang === 'fr';
    let note = fr ? `Dossier de ${d.name} chargé.` : `${d.name}'s file loaded.`;
    if (wanted) {
      const vehicle = inventoryList.find((v: any) => String(v.stock_no).toUpperCase() === wanted.stock.toUpperCase());
      if (!vehicle) {
        note += fr ? ` Le véhicule convoité #${wanted.stock} n'est plus dans l'inventaire.` : ` Wanted vehicle #${wanted.stock} is no longer in stock.`;
      } else if (vehicle.type === 'occasion') {
        setVehicleMode('usage');
        setFraisDossier(current => dossierFeeForMode(current, 'usage'));
        setCheckedOffers({});
        setResults(null);
        setSelectedInventory(vehicle);
        setManualVin('');
        setVehiclePrice(String(vehicle.asking_price || vehicle.msrp || ''));
      } else {
        const program = programs.find(p => matchesInventoryToProgram(vehicle, p));
        setVehicleMode('neuf');
        setFraisDossier(current => dossierFeeForMode(current, 'neuf'));
        if (program) {
          selectProgram(program);
          setSelectedInventory(vehicle);
          setManualVin('');
          setVehiclePrice(String(newVehicleBasePrice(vehicle) || ''));
        } else {
          note += fr ? ` Aucun programme trouvé pour le #${wanted.stock} : choisissez-le dans la liste.` : ` No program found for #${wanted.stock}: pick it from the list.`;
        }
      }
    }
    setDossierNote(note);
  }, [pendingDossier, programsLoading, inventoryLoaded, inventoryList, programs]);

  // ----- Véhicule d'occasion -----
  // Pas de programme du fabricant : on fabrique une « ligne » sans rabais dont le
  // taux, le même pour tous les termes, est celui que le conseiller entre.
  const usedVehicles = useMemo(() => {
    const words = usedSearch.toLowerCase().split(/\s+/).filter(Boolean);
    return inventoryList.filter((v: any) => v.type === 'occasion').filter((v: any) => {
      const text = `${v.stock_no} ${v.year} ${v.brand} ${v.model} ${v.trim || ''}`.toLowerCase();
      return words.every(w => text.includes(w));
    });
  }, [inventoryList, usedSearch]);

  useEffect(() => {
    if (!isUsed) return;
    const rate = Math.max(0, parseFloat((usedRate || '').replace(',', '.')) || 0);
    const vehicle = selectedInventory?.type === 'occasion' ? selectedInventory : null;
    const rates: any = {};
    [24, 36, 48, 60, 72, 84, 96].forEach(term => { rates[`rate_${term}`] = rate; });
    setSelectedProgram({
      id: 'used',
      brand: vehicle?.brand || (lang === 'fr' ? "Véhicule d'occasion" : 'Used vehicle'),
      model: vehicle?.model || '',
      trim: vehicle?.trim || '',
      year: vehicle?.year || '',
      consumer_cash: 0, alternative_consumer_cash: 0, bonus_cash: 0,
      option1_rates: rates, option2_rates: null, special_offers: [],
    } as any);
  }, [isUsed, usedRate, selectedInventory, lang]);

  const switchVehicleMode = (mode: 'neuf' | 'usage') => {
    if (mode === vehicleMode) return;
    setVehicleMode(mode);
    setFraisDossier(current => dossierFeeForMode(current, mode));
    setSelectedProgram(null);
    setSelectedInventory(null);
    setVehiclePrice('');
    setCheckedOffers({});
    setResidualPick({});
    setResults(null);
    setLoyaltyChecked(false);
    setDeferredPayment(false);
    setAutoFinancing(null);
    setSelectedOption(null);
    setShowLease(false);
    if (mode === 'neuf' && selectedTerm === 24) setSelectedTerm(72);
  };

  const clearSelection = () => {
    setSelectedProgram(null);
    setCheckedOffers({});
    setResidualPick({});
    setResults(null);
    // localResult se réinitialise automatiquement via useCalculator quand selectedProgram = null
  };

  // Nom du véhicule tel qu'un client le lit : celui de l'inventaire choisi, sinon
  // celui du programme sans ses précisions entre parenthèses.
  const clientVehicleName = (): string => {
    const unit = selectedInventory;
    if (unit?.brand && unit?.model) return plainVehicle(unit.brand, unit.model, unit.trim, unit.year);
    return plainVehicle(selectedProgram?.brand, selectedProgram?.model, selectedProgram?.trim, selectedProgram?.year);
  };

  // Le texto d'une soumission de véhicule neuf, écrit pour le client.
  const buildQuoteSms = (links: string): string => {
    if (!selectedProgram || !localResult || !vehiclePrice) return '';
    const two = selectedOption === '2' || !hasOption1;
    const pick = (monthly: number | null, biweekly: number | null, weekly: number | null) =>
      (paymentFrequency === 'biweekly' ? biweekly : paymentFrequency === 'weekly' ? weekly : monthly) || 0;
    const payment = two
      ? pick(localResult.option2Monthly, localResult.option2Biweekly, localResult.option2Weekly)
      : pick(localResult.option1Monthly, localResult.option1Biweekly, localResult.option1Weekly);
    const bestLease = showLease && leaseResult
      ? (leaseResult.bestLease === 'standard' ? leaseResult.standard : leaseResult.alternative)
      : null;
    return newQuoteSms({
      clientName,
      vehicle: clientVehicleName(),
      price: parseFloat(vehiclePrice) || 0,
      frequency: paymentFrequency,
      financing: payment > 0 ? { payment, term: selectedTerm, rate: (two ? localResult.option2Rate : localResult.option1Rate) || 0 } : null,
      lease: bestLease ? { payment: pick(bestLease.monthly, bestLease.biweekly, bestLease.weekly), term: leaseTerm, kmPerYear: leaseKmPerYear } : null,
      advisorName: user?.name || undefined,
      links,
      lang,
    });
  };

  // Un texto envoyé devient un suivi : la soumission est enregistrée au CRM,
  // avec son rappel de relance, au nom du client du calcul.
  const recordSmsFollowup = async (sentBy: 'sms' | 'print' = 'sms'): Promise<boolean> => {
    try {
      const token = await getToken();
      if (!token || !selectedProgram || !localResult || !vehiclePrice) return false;
      const two = !isUsed && (selectedOption === '2' || !hasOption1);
      await axios.post(`${API_URL}/api/submissions`, {
        client_name: clientName || 'Client',
        client_phone: clientPhone || '',
        client_email: clientEmail || '',
        vehicle_brand: String(selectedProgram.brand || ''),
        vehicle_model: [selectedProgram.model, selectedProgram.trim].filter(Boolean).join(' '),
        vehicle_year: parseInt(String(selectedProgram.year), 10) || new Date().getFullYear(),
        vehicle_price: parseFloat(vehiclePrice) || 0,
        term: selectedTerm,
        payment_monthly: (two ? localResult.option2Monthly : localResult.option1Monthly) || 0,
        payment_biweekly: (two ? localResult.option2Biweekly : localResult.option1Biweekly) || 0,
        payment_weekly: (two ? localResult.option2Weekly : localResult.option1Weekly) || 0,
        selected_option: two ? '2' : '1',
        rate: (two ? localResult.option2Rate : localResult.option1Rate) || 0,
        program_month: currentPeriod?.month || 0,
        program_year: currentPeriod?.year || 0,
        calculator_state: {
          sentBy,
          vehicleMode,
          usedRate,
          ...(isUsed ? {} : { selectedProgram, checkedOffers, selectedOption, customBonusCash }),
          vehiclePrice, selectedTerm, paymentFrequency, comptantTxInclus,
          fraisDossier, taxePneus, fraisRDPRM, assurancePareBrise, fraisDivers, prixEchange, montantDuEchange, manualVin,
          selectedInventory: selectedInventory ? {
            id: selectedInventory.id, stock_no: selectedInventory.stock_no, vin: selectedInventory.vin,
            type: selectedInventory.type, brand: selectedInventory.brand, model: selectedInventory.model,
            trim: selectedInventory.trim, year: selectedInventory.year, km: selectedInventory.km,
            asking_price: selectedInventory.asking_price, msrp: selectedInventory.msrp,
          } : null,
        },
      }, { headers: { Authorization: `Bearer ${token}` } });
      return true;
    } catch {
      return false;
    }
  };

  // Texto d'un calcul d'occasion : le texte du paiement, puis le lien de la fiche
  // du site en dernière ligne (Messages en tire l'aperçu avec la photo principale).
  const handleUsedSms = async () => {
    if (!localResult || !vehiclePrice) return;
    setSmsPreviewText(lang === 'fr' ? 'Préparation du message…' : 'Preparing the message…');
    setShowSmsPreview(true);
    const vehicle = selectedInventory?.type === 'occasion' ? selectedInventory : null;
    let listingUrl = '';
    if (vehicle?.stock_no) {
      const token = await getToken();
      if (token) listingUrl = await fetchListingUrl({ Authorization: `Bearer ${token}` }, String(vehicle.stock_no));
    }
    const payment = paymentFrequency === 'biweekly' ? localResult.option1Biweekly
      : paymentFrequency === 'weekly' ? localResult.option1Weekly : localResult.option1Monthly;
    setSmsPreviewText(usedQuoteSms({
      vehicle: vehicle
        ? `${vehicle.year} ${vehicle.brand} ${vehicle.model} ${vehicle.trim || ''}`.replace(/\s+/g, ' ').trim()
        : (lang === 'fr' ? "Véhicule d'occasion" : 'Used vehicle'),
      stock: vehicle?.stock_no ? String(vehicle.stock_no) : undefined,
      km: vehicle?.km || undefined,
      price: parseFloat(vehiclePrice) || 0,
      term: selectedTerm,
      rate: localResult.option1Rate,
      payment: payment || 0,
      frequency: paymentFrequency,
      tradeValue: parseFloat(prixEchange) || undefined,
      advisorName: user?.name || undefined,
      listingUrl,
      stickerUrl: windowStickerUrl(vehicle?.brand, vehicle?.vin),
      lang,
    }));
  };

  // Lien de la fiche du site pour le véhicule d'inventaire choisi (vide si aucun ou hors vente).
  const listingUrlForSelection = async (): Promise<string> => {
    const stock = selectedInventory?.stock_no;
    if (!stock || selectedInventory?.stock_pending) return '';
    const token = await getToken();
    const fromEtv = token ? await fetchListingUrl({ Authorization: `Bearer ${token}` }, String(stock)) : '';
    if (fromEtv) return fromEtv;
    // Sans réponse d'eTradeValue : l'adresse de la fiche déjà notée dans l'inventaire
    const known = String((selectedInventory as any)?.source_url || '');
    return /^https:\/\//i.test(known) ? known : '';
  };

  // Texto : le nom et le téléphone du client d'abord, pour que la soumission
  // entre au CRM à son nom (suivis du conseiller, vue du directeur).
  const handleShareSMS = () => {
    const ready = isUsed ? !!localResult && !!vehiclePrice : !!selectedProgram && !!localResult && !!vehiclePrice;
    if (ready && !hasNameAndPhone(clientName, clientPhone)) {
      setPrintNotice('');
      setClientAskFor('sms');
      setShowPrintModal(true);
      return;
    }
    return shareSms();
  };

  const shareSms = async () => {
    if (isUsed) return handleUsedSms();
    if (!selectedProgram || !localResult || !vehiclePrice) {
      if (Platform.OS === 'web') {
        alert(lang === 'fr' ? 'Aucune soumission à partager' : 'No submission to share');
      } else {
        Alert.alert('Erreur', lang === 'fr' ? 'Aucune soumission à partager' : 'No submission to share');
      }
      return;
    }

    // Demandé tout de suite, pendant que l'image de la soumission se prépare.
    const listingPromise = listingUrlForSelection().catch(() => '');
    let endLinks = '';
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
      // Window Sticker, puis la fiche du site en dernière ligne (aperçu avec photo).
      endLinks = smsLinks(stickerUrl, await listingPromise, lang === 'en' ? 'en' : 'fr');

      // 2. Fetch window sticker image from our API
      let stickerImageUrl = '';
      if (vin) {
        try {
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
      const dossier = parseFloat(fraisDossier) || 0;
      const pneus = parseFloat(taxePneus) || 0;
      const rdprm = parseFloat(fraisRDPRM) || 0;
      const pareBrise = otherFees(assurancePareBrise, '');
      const divers = otherFees('', fraisDivers);
      const valeurEchange = parseFloat(prixEchange) || 0;
      const comptant = parseFloat(comptantTxInclus) || 0;
      const altConsumerCash = selectedProgram.alternative_consumer_cash || 0;
      const hasOption2 = selectedProgram.option2_rates !== null && localResult.option2Monthly !== null;
      const payLabel = paymentFrequency === 'biweekly' ? (lang === 'fr' ? 'Aux 2 sem.' : 'Bi-weekly') : paymentFrequency === 'weekly' ? (lang === 'fr' ? 'Hebdo' : 'Weekly') : (lang === 'fr' ? 'Mensuel' : 'Monthly');

      const o1Pay = paymentFrequency === 'biweekly' ? localResult.option1Biweekly : paymentFrequency === 'weekly' ? localResult.option1Weekly : localResult.option1Monthly;
      const o2Pay = paymentFrequency === 'biweekly' ? (localResult.option2Biweekly || 0) : paymentFrequency === 'weekly' ? (localResult.option2Weekly || 0) : (localResult.option2Monthly || 0);

      const screenshotHtml = `
        <div id="capture" style="width:800px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;color:#333;">
          <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:24px;text-align:center;">
            <div style="color:#fff;font-size:28px;font-weight:700;">CalcAuto <span style="color:#4ECDC4;">AiPro</span></div>
            <div style="color:rgba(255,255,255,0.7);font-size:14px;margin-top:4px;">${lang === 'fr' ? 'Soumission de financement' : 'Financing Submission'}</div>
          </div>
          <div style="padding:20px;">
            <div style="background:#f8f9fa;border-radius:10px;padding:16px;border-left:4px solid #4ECDC4;margin-bottom:16px;">
              <div style="font-size:14px;color:#666;text-transform:uppercase;letter-spacing:1px;">${selectedProgram.brand}</div>
              <div style="font-size:24px;font-weight:700;color:#1a1a2e;margin:6px 0;">${selectedProgram.model} ${selectedProgram.trim || ''} ${selectedProgram.year}</div>
              <div style="font-size:22px;color:#4ECDC4;font-weight:700;">${fmt(price)} $</div>
              ${vin ? `<div style="font-size:10px;color:#888;font-family:monospace;margin-top:4px;">VIN: ${vin}</div>` : ''}
            </div>

            <!-- RATES TABLE -->
            <div style="margin-bottom:14px;">
              <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Tableau des taux</div>
              <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                  <tr style="background:#1a1a2e;color:#fff;">
                    <th style="padding:6px 8px;text-align:left;">Terme</th>
                    ${hasOption1 ? '<th style="padding:6px 8px;text-align:center;">Option 1</th>' : ''}
                    ${hasOption2 ? '<th style="padding:6px 8px;text-align:center;">Option 2</th>' : ''}
                  </tr>
                </thead>
                <tbody>
                  ${availableTerms.map(t => {
                    const opt1 = selectedProgram.option1_rates?.['rate_' + String(t)];
                    const opt2 = selectedProgram.option2_rates?.['rate_' + String(t)];
                    const isSelected = t === selectedTerm;
                    return `<tr style="background:${isSelected ? '#e8f5e9' : (t % 2 === 0 ? '#f8f9fa' : '#fff')};${isSelected ? 'font-weight:700;' : ''}">
                      <td style="padding:5px 8px;">${t} mois</td>
                      ${hasOption1 ? `<td style="padding:5px 8px;text-align:center;color:#c0392b;">${opt1 != null ? String(opt1).replace('.', ',') + '%' : '-'}</td>` : ''}
                      ${hasOption2 ? `<td style="padding:5px 8px;text-align:center;color:#1565C0;">${opt2 != null ? String(opt2).replace('.', ',') + '%' : '-'}</td>` : ''}
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <!-- DETAILS -->
            <div style="margin-bottom:14px;">
              <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Détails</div>
              <table style="width:100%;font-size:12px;border-collapse:collapse;">
                <tr style="border-bottom:1px solid #eee;"><td style="padding:4px 0;color:#666;">Prix</td><td style="padding:4px 0;text-align:right;font-weight:600;">${fmt(price)} $</td></tr>
                ${consumerCash > 0 ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:4px 0;color:#666;">Rabais</td><td style="padding:4px 0;text-align:right;color:#1a5f4a;font-weight:600;">-${fmt(consumerCash)} $</td></tr>` : ''}
                ${beforeTaxRebates.map(r => `<tr style="border-bottom:1px solid #eee;"><td style="padding:4px 0;color:#666;">${r.label} ${lang === 'fr' ? '(avant taxes)' : '(before tax)'}</td><td style="padding:4px 0;text-align:right;color:#1a5f4a;font-weight:600;">-${fmt(r.amount)} $</td></tr>`).join('')}
                ${afterTaxRebates.map(r => `<tr style="border-bottom:1px solid #eee;"><td style="padding:4px 0;color:#666;">${r.label} ${lang === 'fr' ? '(après taxes)' : '(after tax)'}</td><td style="padding:4px 0;text-align:right;color:#1a5f4a;font-weight:600;">-${fmt(r.amount)} $</td></tr>`).join('')}
                ${dossier > 0 ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:4px 0;color:#666;">Frais dossier</td><td style="padding:4px 0;text-align:right;">${fmt(dossier)} $</td></tr>` : ''}
                ${pneus > 0 ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:4px 0;color:#666;">Taxe pneus</td><td style="padding:4px 0;text-align:right;">${fmt(pneus)} $</td></tr>` : ''}
                ${rdprm > 0 ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:4px 0;color:#666;">Frais RDPRM</td><td style="padding:4px 0;text-align:right;">${fmt(rdprm)} $</td></tr>` : ''}
                ${pareBrise > 0 ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:4px 0;color:#666;">Assurance pare-brise</td><td style="padding:4px 0;text-align:right;">${fmt(pareBrise)} $</td></tr>` : ''}
                ${divers > 0 ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:4px 0;color:#666;">Frais divers</td><td style="padding:4px 0;text-align:right;">${fmt(divers)} $</td></tr>` : ''}
                ${valeurEchange > 0 ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:4px 0;color:#666;">Échange</td><td style="padding:4px 0;text-align:right;">-${fmt(valeurEchange)} $</td></tr>` : ''}
                <tr><td style="padding:4px 0;color:#666;">Terme</td><td style="padding:4px 0;text-align:right;font-weight:700;">${selectedTerm} mois</td></tr>
                <tr><td style="padding:4px 0;color:#666;">Fréquence</td><td style="padding:4px 0;text-align:right;font-weight:700;">${payLabel}</td></tr>
              </table>
            </div>

            <!-- OPTIONS COMPARISON -->
            <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Comparaison</div>
            <div style="display:flex;gap:8px;margin-bottom:14px;">
              <div style="flex:1;border:2px solid ${localResult.bestOption === '1' ? '#4CAF50' : '#ddd'};border-radius:10px;padding:12px;${hasOption1 ? '' : 'display:none;'}">
                <div style="font-size:14px;font-weight:700;color:#c0392b;margin-bottom:6px;">Option 1 ${localResult.bestOption === '1' ? '<span style="background:#4CAF50;color:#fff;font-size:10px;padding:2px 6px;border-radius:8px;">✓</span>' : ''}</div>
                <div style="font-size:11px;color:#666;margin-bottom:4px;">${lang === 'fr' ? 'Rabais:' : 'Rebate:'} ${consumerCash > 0 ? '-' + fmt(consumerCash) + ' $' : '$0'}</div>
                <div style="font-size:11px;color:#666;margin-bottom:4px;">${lang === 'fr' ? 'Capital:' : 'Principal:'} ${fmt(localResult.principalOption1)} $</div>
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
                <div style="font-size:11px;color:#666;margin-bottom:4px;">${lang === 'fr' ? 'Rabais:' : 'Rebate:'} ${altConsumerCash > 0 ? '-' + fmt(altConsumerCash) + ' $' : '$0'}</div>
                <div style="font-size:11px;color:#666;margin-bottom:4px;">${lang === 'fr' ? 'Capital:' : 'Principal:'} ${fmt(localResult.principalOption2)} $</div>
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
                    <div style="font-size:10px;color:#666;">Avant taxes: ${fmt2(paymentFrequency === 'weekly' ? leaseResult.standard.weeklyBeforeTax : paymentFrequency === 'biweekly' ? leaseResult.standard.biweeklyBeforeTax : leaseResult.standard.monthlyBeforeTax)} $</div>
                    <div style="font-size:10px;color:#666;">TPS: ${fmt2(paymentFrequency === 'weekly' ? leaseResult.standard.tpsOnPayment * 12/52 : paymentFrequency === 'biweekly' ? leaseResult.standard.tpsOnPayment * 12/26 : leaseResult.standard.tpsOnPayment)} $ | TVQ: ${fmt2(paymentFrequency === 'weekly' ? leaseResult.standard.tvqOnPayment * 12/52 : paymentFrequency === 'biweekly' ? leaseResult.standard.tvqOnPayment * 12/26 : leaseResult.standard.tvqOnPayment)} $</div>
                    <div style="font-size:20px;font-weight:700;color:#E65100;">${fmt2(paymentFrequency === 'weekly' ? leaseResult.standard.weekly : paymentFrequency === 'biweekly' ? leaseResult.standard.biweekly : leaseResult.standard.monthly)} $</div>
                    <div style="font-size:10px;color:#c00;">Coût emprunt: ${fmt2(leaseResult.standard.coutEmprunt)} $</div>
                  </div>
                </div>` : ''}
                ${leaseResult.alternative ? `
                <div style="flex:1;border:2px solid ${leaseResult.bestLease === 'alternative' ? '#FFD700' : '#ddd'};border-radius:10px;padding:10px;">
                  <div style="font-size:12px;font-weight:700;color:#0277BD;">Taux Alternatif ${leaseResult.bestLease === 'alternative' ? '<span style="background:#FFD700;color:#000;font-size:9px;padding:1px 5px;border-radius:6px;">✓</span>' : ''}</div>
                  <div style="font-size:10px;color:#666;">Taux: ${leaseResult.alternative.rate}% | Cash: ${leaseResult.alternative.leaseCash > 0 ? `-${fmt(leaseResult.alternative.leaseCash)} $` : '$0'}</div>
                  <div style="background:#e3f2fd;border-radius:6px;padding:8px;text-align:center;margin-top:6px;">
                    <div style="font-size:10px;color:#666;">Avant taxes: ${fmt2(paymentFrequency === 'weekly' ? leaseResult.alternative.weeklyBeforeTax : paymentFrequency === 'biweekly' ? leaseResult.alternative.biweeklyBeforeTax : leaseResult.alternative.monthlyBeforeTax)} $</div>
                    <div style="font-size:10px;color:#666;">TPS: ${fmt2(paymentFrequency === 'weekly' ? leaseResult.alternative.tpsOnPayment * 12/52 : paymentFrequency === 'biweekly' ? leaseResult.alternative.tpsOnPayment * 12/26 : leaseResult.alternative.tpsOnPayment)} $ | TVQ: ${fmt2(paymentFrequency === 'weekly' ? leaseResult.alternative.tvqOnPayment * 12/52 : paymentFrequency === 'biweekly' ? leaseResult.alternative.tvqOnPayment * 12/26 : leaseResult.alternative.tvqOnPayment)} $</div>
                    <div style="font-size:20px;font-weight:700;color:#0277BD;">${fmt2(paymentFrequency === 'weekly' ? leaseResult.alternative.weekly : paymentFrequency === 'biweekly' ? leaseResult.alternative.biweekly : leaseResult.alternative.monthly)} $</div>
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
              <div style="font-size:8px;color:#999;margin-top:6px;line-height:1.3;text-align:justify;padding:0 8px;">
                ${lang === 'fr' 
                  ? 'AVIS IMPORTANT: Les montants présentés sont à titre indicatif seulement et ne constituent pas une offre officielle. Les versements réels peuvent différer selon l\'évaluation de crédit, les programmes en vigueur et les frais applicables. Le concessionnaire ne peut être tenu responsable de toute erreur de calcul. Sujet à l\'approbation du crédit.'
                  : 'IMPORTANT: Amounts shown are for informational purposes only and do not constitute an official offer. Actual payments may differ. Subject to credit approval.'}
              </div>
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
        scale: 3, 
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });
      document.body.removeChild(container);

      // Convert canvas to blob
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b: any) => resolve(b), 'image/png'));
      const fileLabel = clientVehicleName().replace(/\s+/g, '_');
      const file = new File([blob], `soumission_${fileLabel}.png`, { type: 'image/png' });
      
      // La feuille d'une page en PDF prend la place de l'image quand le téléphone l'accepte
      const pdfBlob = await buildSubmissionPdf();
      const pdfFile = pdfBlob ? new File([pdfBlob], `Soumission_${fileLabel}.pdf`, { type: 'application/pdf' }) : null;
      const pdfShareable = !!pdfFile && !!navigator.canShare && navigator.canShare({ files: [pdfFile] });
      const filesToShare: File[] = pdfShareable && pdfFile ? [pdfFile] : [file];
      
      // Le message écrit pour le client, liens à la fin
      const shareText = buildQuoteSms(endLinks);

      // 5. Share via native share sheet
      if (navigator.share && navigator.canShare && navigator.canShare({ files: filesToShare })) {
        await navigator.share({
          text: shareText,
          files: filesToShare,
        });
        recordSmsFollowup();
      } else {
        // Fallback: download image + copy text
        const url = URL.createObjectURL(pdfBlob || blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pdfFile ? pdfFile.name : file.name;
        a.click();
        URL.revokeObjectURL(url);
        
        try {
          await navigator.clipboard.writeText(shareText);
          alert(lang === 'fr' ? 'Soumission téléchargée et texte copié!' : 'Submission downloaded and text copied!');
        } catch {
          alert(lang === 'fr' ? 'Soumission téléchargée!' : 'Submission downloaded!');
        }
      }
      
      setShowSmsPreview(false);
    } catch (error: any) {
      console.error('Share error:', error);
      setShowSmsPreview(false);
      // Fallback to text-only SMS
      setSmsPreviewText(buildQuoteSms(endLinks));
      setShowSmsPreview(true);
    }
  };

  // Send the SMS message after preview
  const handleSendSms = async () => {
    try {
      if (isUsed) {
        // Occasion : l'application de textos s'ouvre, déjà adressée au client.
        const href = smsHref(clientPhone, smsPreviewText);
        if (Platform.OS === 'web') window.location.href = href;
        else await Linking.openURL(href);
        const saved = await recordSmsFollowup();
        setShowSmsPreview(false);
        setDossierNote(saved
          ? (lang === 'fr' ? 'Texto préparé. Le calcul est dans vos suivis, avec un rappel de relance demain.' : 'Text ready. The quote is in your follow-ups, with a reminder tomorrow.')
          : (lang === 'fr' ? "Texto préparé, mais le suivi n'a pas pu être enregistré." : 'Text ready, but the follow-up could not be saved.'));
        return;
      }
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
      recordSmsFollowup();
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

  // Imprimer : on demande d'abord à qui va la soumission, pour qu'elle soit au CRM
  const openPrint = () => {
    if (!selectedProgram || !localResult || !vehiclePrice) { handlePrint(); return; }
    setPrintNotice('');
    setClientAskFor('print');
    setShowPrintModal(true);
  };
  const smsForClient = () => {
    if (!hasNameAndPhone(clientName, clientPhone)) {
      setPrintNotice(lang === 'fr'
        ? 'Pour le texto : le nom du client et son téléphone à 10 chiffres.'
        : 'For the text: the client name and a 10-digit phone number.');
      return;
    }
    setShowPrintModal(false);
    shareSms();
  };
  const printForClient = (save: boolean) => {
    if (save) {
      const hasContact = (clientPhone || '').trim().length >= 7 || (clientEmail || '').includes('@');
      if (!(clientName || '').trim() || !hasContact) {
        setPrintNotice(lang === 'fr'
          ? 'Pour enregistrer au CRM : le nom, et un téléphone ou un courriel.'
          : 'To save to the CRM: a name, and a phone or an email.');
        return;
      }
    }
    setShowPrintModal(false);
    // La fenêtre d'impression s'ouvre tout de suite (sinon le navigateur la bloque) ;
    // l'enregistrement au CRM se fait en même temps.
    handlePrint();
    if (save) {
      recordSmsFollowup('print').then((ok) => {
        if (!ok) {
          const msg = lang === 'fr' ? "La soumission est imprimée, mais elle n'a pas pu être enregistrée au CRM." : 'Printed, but the submission could not be saved to the CRM.';
          Platform.OS === 'web' ? alert(msg) : Alert.alert('CRM', msg);
        }
      });
    }
  };

  // La feuille d'une page : la même pour l'impression, le texto et le courriel
  const buildPrintHtml = (opts: { description?: boolean } = {}): string | null => {
    const withDescription = opts.description !== false;
    if (!selectedProgram || !localResult || !vehiclePrice) return null;

    const vehicle = `${selectedProgram.brand} ${selectedProgram.model} ${selectedProgram.trim || ''} ${selectedProgram.year}`.trim();
    // Sous le nom de la concession : le conseiller qui prépare la soumission et son téléphone
    // (celui de son compte eTradeValue) ; sans téléphone connu, celui de la concession.
    const advisorName = String(user?.etv_name || user?.name || '').trim();
    const advisorPhone = String(user?.etv_phone || '').trim();
    const option = selectedOption === '2' || !hasOption1 ? '2' : '1';
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
    const price = parseFloat(vehiclePrice) || 0;
    const dossier = parseFloat(fraisDossier) || 0;
    const pneus = parseFloat(taxePneus) || 0;
    const rdprm = parseFloat(fraisRDPRM) || 0;
    const pareBrise = otherFees(assurancePareBrise, '');
    const divers = otherFees('', fraisDivers);
    const valeurEchange = parseFloat(prixEchange) || 0;
    const comptant = parseFloat(comptantTxInclus) || 0;
    const tradeOwed = parseFloat(montantDuEchange) || 0;
    const altConsumerCashPrint = selectedProgram.alternative_consumer_cash || 0;
    const hasOption2 = selectedProgram.option2_rates !== null && localResult.option2Monthly !== null;
    const bestOpt = localResult.bestOption;
    // Montants de l'option retenue : la feuille doit s'additionner de haut en bas
    const principalChosen = option === '1' ? (localResult.principalOption1 || 0) : (localResult.principalOption2 || 0);
    const taxesChosen = option === '1' ? (localResult.taxes || 0) : (localResult.taxesOption2 || 0);
    const accessoriesTotal = accessories.reduce((sum: number, acc: any) => sum + (parseFloat(acc.price) || 0), 0);
    const savingsAmt = localResult.savings || 0;

    // Format currency helper for inline HTML
    const fmt = (v: number) => v.toLocaleString('fr-CA', { maximumFractionDigits: 0 });
    const fmt2 = (v: number) => v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const terms = availableTerms;

    // Option 1 payment details
    const o1Monthly = localResult.option1Monthly;
    const o1Biweekly = localResult.option1Biweekly;
    const o1Weekly = localResult.option1Weekly;
    const o1Payment = paymentFrequency === 'biweekly' ? o1Biweekly : paymentFrequency === 'weekly' ? o1Weekly : o1Monthly;

    // Option 2 payment details
    const o2Monthly = localResult.option2Monthly || 0;
    const o2Biweekly = localResult.option2Biweekly || 0;
    const o2Weekly = localResult.option2Weekly || 0;
    const o2Payment = paymentFrequency === 'biweekly' ? o2Biweekly : paymentFrequency === 'weekly' ? o2Weekly : o2Monthly;

    // Feuille d'une seule page (format lettre) : client, véhicule, paiement retenu,
    // détails, taux, options de financement et location côte à côte.
    const F = lang === 'fr';
    const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
    const mo = F ? 'mois' : 'mo';
    const perFreq = (o: any) => (paymentFrequency === 'biweekly' ? o.biweekly : paymentFrequency === 'weekly' ? o.weekly : o.monthly) || 0;
    const perFreqBeforeTax = (o: any) => (paymentFrequency === 'weekly' ? o.weeklyBeforeTax : paymentFrequency === 'biweekly' ? o.biweeklyBeforeTax : o.monthlyBeforeTax) || 0;
    const taxPerFreq = (v: number) => (paymentFrequency === 'weekly' ? v * 12 / 52 : paymentFrequency === 'biweekly' ? v * 12 / 26 : v) || 0;
    const hasLeasePrint = !!(showLease && leaseResult && (leaseResult.standard || leaseResult.alternative));
    const bestLeaseOpt: any = hasLeasePrint ? (leaseResult.bestLease === 'standard' ? leaseResult.standard : leaseResult.alternative) || leaseResult.standard || leaseResult.alternative : null;
    const bestFinPayment = bestOpt === '2' && hasOption2 ? o2Payment : o1Payment;
    const clientLines = [clientName, clientPhone, clientEmail].map((v) => (v || '').trim()).filter(Boolean);
    // Pas de numéro de stock imprimé tant que le véhicule n'en a pas (repère interne DealerConnect).
    const stockNo = selectedInventory?.stock_pending ? '' : (selectedInventory?.stock_no || '');
    const ratesHead = terms.map((t) => `<th class="${t === selectedTerm ? 'sel' : ''}">${t} ${mo}</th>`).join('');
    const ratesLine = (label: string, rates: any) => `<tr><td class="lbl">${label}</td>${terms.map((t) => {
      const r = rates ? getRateForTerm(rates, t) : null;
      return `<td class="${t === selectedTerm ? 'sel' : ''}">${r !== null && r !== undefined ? Number(r).toFixed(2) + ' %' : '–'}</td>`;
    }).join('')}</tr>`;
    const row = (label: string, value: string, cls = '') => `<tr><td>${label}</td><td class="${cls}">${value}</td></tr>`;
    const finCard = (n: '1' | '2', title: string, rebate: number, principal: number, rateV: any, pay: number) => `
      <div class="card ${bestOpt === n && hasOption2 ? 'best' : ''} ${option === n ? 'chosen' : ''}">
        <div class="card-top"><span class="card-name">Option ${n}</span>${bestOpt === n && hasOption2 ? `<span class="tag">${F ? 'Meilleur choix' : 'Best choice'}</span>` : ''}</div>
        <div class="card-sub">${title}</div>
        <div class="pay">${fmt2(pay)} $<small>${paymentLabel.toLowerCase()}</small></div>
        <table class="mini">
          ${row(F ? 'Rabais' : 'Rebate', rebate > 0 ? '−' + fmt(rebate) + ' $' : '0 $', rebate > 0 ? 'good' : '')}
          ${row(F ? 'Capital financé' : 'Principal', fmt(principal) + ' $')}
          ${row(F ? 'Taux' : 'Rate', rateV + ' %')}
        </table>
      </div>`;
    const leaseCard = (key: 'standard' | 'alternative', title: string) => {
      const o: any = (leaseResult as any)[key];
      if (!o) return '';
      const cash = o.leaseCash - leaseResult.offersBeforeTax;
      const isBest = leaseResult.bestLease === key && leaseResult.standard && leaseResult.alternative;
      return `
      <div class="card lease ${isBest ? 'best' : ''}">
        <div class="card-top"><span class="card-name">${title}</span>${isBest ? `<span class="tag">${F ? 'Meilleur choix' : 'Best choice'}</span>` : ''}</div>
        <div class="card-sub">${F ? 'Location' : 'Lease'} ${leaseTerm} ${mo}</div>
        <div class="pay">${fmt2(perFreq(o))} $<small>${paymentLabel.toLowerCase()}</small></div>
        <table class="mini">
          ${row('Lease Cash', cash > 0 ? '−' + fmt(cash) + ' $' : '0 $', cash > 0 ? 'good' : '')}
          ${leaseResult.offersBeforeTax > 0 ? row(F ? 'Promos avant taxes' : 'Before-tax offers', '−' + fmt(leaseResult.offersBeforeTax) + ' $', 'good') : ''}
          ${row(F ? 'Taux' : 'Rate', o.rate + ' %')}
          ${row(F ? 'Avant taxes' : 'Before tax', fmt2(perFreqBeforeTax(o)) + ' $')}
          ${row('TPS + TVQ', fmt2(taxPerFreq(o.tpsOnPayment) + taxPerFreq(o.tvqOnPayment)) + ' $')}
        </table>
      </div>`;
    };

    const bandHtml = `
<div class="band">
            <div class="dealer">
              ${dealerBranding?.logoUrl ? `<img src="${esc(dealerBranding.logoUrl)}" alt="${esc(dealerBranding.name)}" />` : ''}
              <div>
                ${dealerBranding?.name ? `<div class="dn" style="${dealerBranding.logoUrl ? 'font-size:14px;' : ''}">${esc(dealerBranding.name)}</div>` : ''}
                ${advisorName ? `<div class="da">${esc(advisorName)}</div>` : ''}
                ${(advisorPhone || dealerBranding?.phone) ? `<div class="dp">${esc(advisorPhone || dealerBranding?.phone || '')}</div>` : ''}
              </div>
            </div>
            <div class="etv">
              <div class="by"><b>CalcAuto AiPro</b>${F ? 'par eTradeValue' : 'by eTradeValue'}</div>
              <img src="${ETV_LOGO}" alt="eTradeValue" />
            </div>
          </div>
`;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CalcAuto AiPro - Soumission</title>
        <style>
          @page { size: letter portrait; margin: 9mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { font-family: 'Avenir Next', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; line-height: 1.35; color: #0B1220; background: #E9ECF1; font-variant-numeric: tabular-nums; }
          .sheet { width: 7.75in; margin: 16px auto; background: #fff; padding: 22px 24px 16px; }
          .band { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding-bottom: 10px; border-bottom: 3px solid #10182B; }
          .dealer { display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1 1 auto; }
          .dealer > div { min-width: 0; }
          .dealer img { height: 54px; max-width: 2.5in; object-fit: contain; flex-shrink: 0; }
          .dealer .dn { font-size: 21px; font-weight: 700; line-height: 1.12; letter-spacing: -0.3px; }
          .dealer .da { font-size: 13px; font-weight: 700; margin-top: 4px; white-space: nowrap; }
          .dealer .dp { font-size: 12px; color: #333D4F; margin-top: 1px; white-space: nowrap; }
          .etv { display: flex; flex-direction: column-reverse; align-items: flex-end; gap: 3px; text-align: right; flex-shrink: 0; }
          .etv img { height: 54px; width: auto; border-radius: 5px; display: block; }
          .etv .by b { margin-right: 4px; }
          .etv .by { font-size: 10.5px; color: #333D4F; line-height: 1.3; }
          .etv .by b { display: block; font-size: 13px; color: #10182B; }
          .top { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; }
          .top h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.4px; line-height: 1.1; }
          .top .meta { text-align: right; font-size: 11px; color: #333D4F; }
          .hero { display: flex; gap: 14px; margin-top: 12px; }
          .veh { flex: 1.25; }
          .veh .make { font-size: 11px; color: #333D4F; }
          .veh .model { font-size: 21px; font-weight: 700; line-height: 1.15; margin: 1px 0 4px; }
          .veh .ids { font-size: 10.5px; color: #333D4F; font-family: Menlo, Consolas, monospace; }
          .veh .price { font-size: 15px; font-weight: 700; margin-top: 4px; }
          .who { flex: 0.9; border-left: 1px solid #D9DEE7; padding-left: 14px; font-size: 11.5px; }
          .who .t, .h2 { font-size: 10.5px; font-weight: 700; color: #333D4F; margin-bottom: 3px; }
          .who .name { font-size: 14px; font-weight: 700; }
          .who .blank { border-bottom: 1px solid #9AA3B1; height: 17px; margin-bottom: 3px; }
          .chosen-box { flex: 1; background: #10182B; color: #fff; border-radius: 6px; padding: 10px 14px; }
          .chosen-box .t { font-size: 11.5px; color: #E3E8F0; }
          .chosen-box .amt { font-size: 34px; font-weight: 700; line-height: 1.1; letter-spacing: -0.5px; }
          .chosen-box .d { font-size: 12px; color: #F0F3F8; }
          .cols { display: flex; gap: 16px; margin-top: 12px; }
          .cols > div { flex: 1; min-width: 0; }
          .h2 { border-bottom: 1px solid #10182B; padding-bottom: 2px; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; }
          .det td { padding: 3px 0; border-bottom: 1px solid #D9DEE7; font-size: 12.5px; }
          .det td:last-child, .mini td:last-child { text-align: right; font-weight: 600; white-space: nowrap; }
          .good { color: #0E7C4A; }
          .det tr.grand td { font-size: 13.5px; font-weight: 700; padding: 5px 0 4px; border-top: 2px solid #10182B; border-bottom: 2px solid #10182B; }
          .rates th, .rates td { text-align: center; padding: 3px 2px; font-size: 11.5px; border-bottom: 1px solid #D9DEE7; }
          .rates th { font-weight: 700; color: #333D4F; }
          .rates td.lbl { text-align: left; font-weight: 700; }
          .rates .sel { background: #10182B; color: #fff; font-weight: 700; }
          .cards { display: flex; gap: 10px; margin-top: 6px; }
          .card { flex: 1; border: 1px solid #D9DEE7; border-top: 3px solid #5B6577; border-radius: 4px; padding: 7px 9px 5px; min-width: 0; }
          .card.chosen { border-top-color: #10182B; }
          .card.best { border-color: #0E7C4A; border-top-color: #0E7C4A; background: #F3FAF6; }
          .card.lease { border-top-color: #B4690E; }
          .card.lease.best { border-color: #B4690E; background: #FDF8F0; }
          .card-top { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
          .card-name { font-size: 12.5px; font-weight: 700; }
          .tag { font-size: 9.5px; font-weight: 700; color: #fff; background: #0E7C4A; border-radius: 3px; padding: 1px 6px; white-space: nowrap; }
          .card.lease .tag { background: #B4690E; }
          .card-sub { font-size: 11px; color: #333D4F; }
          .pay { font-size: 22px; font-weight: 700; margin: 3px 0 3px; letter-spacing: -0.3px; white-space: nowrap; line-height: 1.15; }
          .pay small { display: block; font-size: 11px; font-weight: 400; color: #333D4F; letter-spacing: 0; }
          .mini td { padding: 2px 0; font-size: 11.5px; border-top: 1px solid #D9DEE7; }
          .na { display: flex; align-items: center; justify-content: center; text-align: center; color: #9AA3B1; font-size: 11px; background: #F6F7F9; }
          .lease-line { display: flex; gap: 18px; font-size: 11.5px; margin: 2px 0 0; }
          .lease-line b { font-weight: 700; }
          .versus { display: flex; margin-top: 10px; border: 1px solid #10182B; border-radius: 4px; }
          .versus > div { flex: 1; padding: 6px 12px; }
          .versus > div + div { border-left: 1px solid #10182B; }
          .versus .t { font-size: 10.5px; color: #333D4F; }
          .versus .v { font-size: 17px; font-weight: 700; }
          .versus .v small { font-size: 10px; font-weight: 400; color: #333D4F; margin-left: 5px; }
          .note { font-size: 10.5px; color: #7A4B00; background: #FFF6DF; border-left: 3px solid #B4690E; padding: 3px 8px; margin-top: 6px; }
          .foot { margin-top: 10px; border-top: 1px solid #9AA3B1; padding-top: 5px; font-size: 8.5px; line-height: 1.3; color: #3E4757; }
          .seepage { margin-top: 6px; font-size: 11px; font-style: italic; color: #333D4F; }
          .page2 { page-break-before: always; break-before: page; margin-top: 16px; }
          .page2 img.desc { display: block; width: 100%; height: auto; margin-top: 8px; border: 1px solid #9AA3B1; }
          .page2 .cap { font-size: 11px; color: #333D4F; margin-top: 6px; }
          .eq { list-style: none; columns: 2; column-gap: 14px; font-size: 12px; }
          .eq li { padding: 1.5px 0 1.5px 14px; position: relative; break-inside: avoid; }
          .eq li::before { content: '✓'; position: absolute; left: 0; color: #0E7C4A; font-weight: 700; }
          .back-btn { display: block; margin: 14px auto; padding: 10px 26px; background: #10182B; color: #fff; border: 0; border-radius: 6px; font-size: 15px; font-weight: 700; cursor: pointer; }
          @media print {
            body { background: #fff; }
            .sheet { margin: 0 auto; padding: 0; width: 100%; }
            .page2 { margin-top: 0; }
            .no-print { display: none !important; }
            .card, .versus, .cols, .hero { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="sheet" id="sheet">
          ${bandHtml}
          <div class="top">
            <h1>${F ? 'Soumission de financement' : 'Financing submission'}</h1>
            <div class="meta">${F ? 'Préparée le' : 'Prepared on'} ${new Date().toLocaleDateString(F ? 'fr-CA' : 'en-CA')}</div>
          </div>

          <div class="hero">
            <div class="veh">
              <div class="make">${esc(selectedProgram.brand)} ${esc(selectedProgram.year)}</div>
              <div class="model">${esc(selectedProgram.model)} ${esc(selectedProgram.trim || '')}</div>
              ${vin || stockNo ? `<div class="ids">${stockNo ? (F ? 'Inventaire ' : 'Stock ') + esc(stockNo) : ''}${vin && stockNo ? ' &nbsp; ' : ''}${vin ? 'NIV ' + esc(vin) : ''}</div>` : ''}
              <div class="price">${fmt(price)} $</div>
            </div>
            <div class="who">
              <div class="t">${F ? 'Préparée pour' : 'Prepared for'}</div>
              ${clientLines.length
                ? `<div class="name">${esc(clientLines[0])}</div>${clientLines.slice(1).map((l) => `<div>${esc(l)}</div>`).join('')}`
                : '<div class="blank"></div><div class="blank"></div>'}
            </div>
            <div class="chosen-box">
              <div class="t">${F ? 'Paiement retenu' : 'Selected payment'} (Option ${option})</div>
              <div class="amt">${fmt2(payment)} $</div>
              <div class="d">${paymentLabel}, ${selectedTerm} ${mo} ${F ? 'à' : 'at'} ${rate} %</div>
            </div>
          </div>

          <div class="cols">
            <div>
              <div class="h2">${F ? 'Détails du financement' : 'Financing details'}</div>
              <table class="det">
                ${row(F ? 'Prix du véhicule' : 'Vehicle price', fmt(price) + ' $')}
                ${consumerCash > 0 ? row(F ? 'Rabais (avant taxes)' : 'Rebate (before tax)', '−' + fmt(consumerCash) + ' $', 'good') : ''}
                ${beforeTaxRebates.map(r => row(`${esc(r.label)} ${F ? '(avant taxes)' : '(before tax)'}`, '−' + fmt(r.amount) + ' $', 'good')).join('')}
                ${afterTaxRebates.map(r => row(`${esc(r.label)} ${F ? '(après taxes)' : '(after tax)'}`, '−' + fmt(r.amount) + ' $', 'good')).join('')}
                ${accessoriesTotal > 0 ? row(F ? 'Accessoires' : 'Accessories', fmt2(accessoriesTotal) + ' $') : ''}
                ${dossier > 0 ? row(F ? 'Frais de dossier' : 'Admin fees', fmt2(dossier) + ' $') : ''}
                ${pneus > 0 ? row(F ? 'Taxe sur les pneus' : 'Tire tax', fmt(pneus) + ' $') : ''}
                ${rdprm > 0 ? row('RDPRM', fmt(rdprm) + ' $') : ''}
                ${pareBrise > 0 ? row(F ? 'Assurance pare-brise' : 'Windshield insurance', fmt2(pareBrise) + ' $') : ''}
                ${divers > 0 ? row(F ? 'Frais divers' : 'Other fees', fmt2(divers) + ' $') : ''}
                ${valeurEchange > 0 ? row(F ? "Valeur d'échange" : 'Trade-in value', '−' + fmt(valeurEchange) + ' $', 'good') : ''}
                ${taxesChosen > 0 ? row(F ? 'Taxes (TPS + TVQ)' : 'Taxes (GST + QST)', fmt2(taxesChosen) + ' $') : ''}
                ${tradeOwed > 0 ? row(F ? "Solde dû sur l'échange (ajouté au financement)" : 'Trade-in balance owing (added to financing)', fmt2(tradeOwed) + ' $') : ''}
                ${comptant > 0 ? row(F ? 'Comptant (taxes incluses)' : 'Down payment (tax incl.)', '−' + fmt(comptant) + ' $') : ''}
                <tr class="grand"><td>${F ? 'Montant financé' : 'Amount financed'}</td><td>${fmt2(principalChosen)} $</td></tr>
                ${row(F ? 'Terme et fréquence' : 'Term and frequency', `${selectedTerm} ${mo}, ${paymentLabel.toLowerCase()}`)}
              </table>
            </div>
            <div>
              <div class="h2">${F ? 'Taux selon le terme' : 'Rates by term'}</div>
              <table class="rates">
                <tr><th></th>${ratesHead}</tr>
                ${hasOption1 ? ratesLine('Option 1', selectedProgram.option1_rates) : ''}
                ${hasOption2 ? ratesLine('Option 2', selectedProgram.option2_rates) : ''}
              </table>
              <div class="cards">
                ${hasOption1 ? finCard('1', F ? 'Rabais et taux standard' : 'Rebate and standard rate', consumerCash, localResult.principalOption1 || 0, localResult.option1Rate, o1Payment) : ''}
                ${hasOption2
                  ? finCard('2', F ? 'Taux réduit' : 'Reduced rate', altConsumerCashPrint, localResult.principalOption2 || 0, localResult.option2Rate, o2Payment)
                  : `<div class="card na">Option 2<br/>${F ? 'non offerte pour ce véhicule' : 'not offered for this vehicle'}</div>`}
              </div>
              ${hasOption2 && savingsAmt > 0 ? `<div class="note" style="color:#0B5A37;background:#EAF6EF;border-color:#0E7C4A;">Option ${bestOpt} : ${F ? 'paiement plus bas de' : 'payment lower by'} <b>${fmt2(Math.abs(o1Payment - o2Payment))} $</b> ${paymentLabel.toLowerCase()}</div>` : ''}
            </div>
          </div>

          ${(() => {
            const sd: any = stickerDetails;
            if (!sd) return '';
            const onPage2 = withDescription && !!sd.description_image;
            const items: string[] = (sd.highlights || []).slice(0, hasLeasePrint ? 8 : 16);
            const opts: any[] = [...(sd.options || [])];
            const col1 = opts.map((o: any) => `<tr><td>${esc(o.label)}</td><td>${fmt(o.price)} $</td></tr>`).join('')
              + (sd.unlabeled_options_total ? `<tr><td>${F ? "Autres options d'usine" : 'Other factory options'}</td><td>${fmt(sd.unlabeled_options_total)} $</td></tr>` : '');
            const fuel = sd.fuel_l100;
            const spec: string[] = [];
            if (fuel?.combined) spec.push(`<tr><td>${F ? 'Consommation' : 'Fuel use'}</td><td>${String(fuel.combined).replace('.', ',')} L/100 km</td></tr>`);
            if (fuel?.city && fuel?.highway) spec.push(`<tr><td>${F ? 'Ville / route' : 'City / highway'}</td><td>${String(fuel.city).replace('.', ',')} / ${String(fuel.highway).replace('.', ',')}</td></tr>`);
            if (sd.fuel_annual_cost) spec.push(`<tr><td>${F ? 'Coût annuel en carburant' : 'Annual fuel cost'}</td><td>${fmt(sd.fuel_annual_cost)} $</td></tr>`);
            if (sd.powertrain_warranty) spec.push(`<tr><td>${F ? 'Garantie groupe motopropulseur' : 'Powertrain warranty'}</td><td>${sd.powertrain_warranty.years} ${F ? 'ans' : 'yr'} / ${fmt(sd.powertrain_warranty.km)} km</td></tr>`);
            if (onPage2) {
              // La description complète est en page 2 : ici, seulement l'essentiel, en une bande.
              if (!col1 && !spec.length) return '';
              return `<div class="cols tech">
                <div>${col1 ? `<div class="h2">${F ? "Options d'usine" : 'Factory options'}</div><table class="det">${col1}</table>` : ''}</div>
                <div>${spec.length ? `<div class="h2">${F ? 'Fiche technique' : 'Specifications'}</div><table class="det">${spec.join('')}</table>` : ''}
                <div class="seepage">${F ? 'Description complète du véhicule en page 2.' : 'Full vehicle description on page 2.'}</div></div>
              </div>`;
            }
            if (!items.length && !col1 && !spec.length) return '';
            return `<div class="cols tech">
              <div>
                <div class="h2">${F ? 'Équipement principal' : 'Key equipment'}</div>
                <ul class="eq">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
              </div>
              <div>
                ${col1 ? `<div class="h2">${F ? "Options d'usine" : 'Factory options'}</div><table class="det">${col1}</table>` : ''}
                ${spec.length ? `<div class="h2" style="margin-top:8px;">${F ? 'Fiche technique' : 'Specifications'}</div><table class="det">${spec.join('')}</table>` : ''}
              </div>
            </div>`;
          })()}

          ${afterTaxRebates.map(r => `<div class="note">${esc(r.label)} : ${fmt(r.amount)} $ ${F ? 'déduit après taxes, à part du comptant du client' : 'deducted after tax, separate from the customer\'s cash down'}</div>`).join('')}

          ${hasLeasePrint ? `
          <div class="cols">
            <div>
              <div class="h2">${F ? 'Location SCI' : 'SCI lease'}</div>
              <div class="lease-line">
                <span>${F ? 'Kilométrage' : 'Mileage'} <b>${(leaseKmPerYear/1000).toFixed(0)} 000 km/${F ? 'an' : 'yr'}</b></span>
                <span>${F ? 'Terme' : 'Term'} <b>${leaseTerm} ${mo}</b></span>
              </div>
              <div class="lease-line">
                <span>${F ? 'Résiduel' : 'Residual'} <b>${leaseResult.residualPct} %${leaseResult.kmAdjustment ? ` (+${leaseResult.kmAdjustment} %)` : ''}, ${fmt(Math.round(leaseResult.residualValue))} $</b></span>
              </div>
              ${leaseResult.leaseSavings > 0 && leaseResult.standard && leaseResult.alternative ? `<div class="note">${leaseResult.bestLease === 'standard' ? 'Std + Lease Cash' : (F ? 'Taux alternatif' : 'Alt. rate')} : ${F ? 'paiement plus bas de' : 'payment lower by'} <b>${fmt2(Math.abs(perFreq(leaseResult.standard) - perFreq(leaseResult.alternative)))} $</b> ${paymentLabel.toLowerCase()}</div>` : ''}
              <div class="versus">
                <div><div class="t">${F ? 'Meilleure location' : 'Best lease'}</div><div class="v">${fmt2(perFreq(bestLeaseOpt))} $<small>${leaseTerm} ${mo}</small></div></div>
                <div><div class="t">${F ? 'Meilleur financement' : 'Best financing'}</div><div class="v">${fmt2(bestFinPayment)} $<small>${selectedTerm} ${mo}</small></div></div>
              </div>
            </div>
            <div>
              <div class="cards" style="margin-top:0;">
                ${leaseCard('standard', 'Std + Lease Cash')}
                ${leaseCard('alternative', F ? 'Taux alternatif' : 'Alt. rate')}
              </div>
            </div>
          </div>` : ''}

          <div class="foot">
            ${F
              ? 'AVIS IMPORTANT : Les montants de paiements présentés dans cette soumission sont fournis à titre indicatif seulement et ne constituent en aucun cas une offre de financement ou de location officielle. Les versements réels peuvent différer en fonction de l\'évaluation de crédit, des programmes en vigueur au moment de la transaction, des ajustements de résiduel et des frais applicables. Le concessionnaire et ses représentants ne peuvent être tenus responsables de toute erreur de calcul ou d\'écart entre la présente estimation et les conditions finales du contrat. Toute transaction est sujette à l\'approbation du crédit par l\'institution financière.'
              : 'IMPORTANT NOTICE: Payment amounts shown in this submission are provided for informational purposes only and do not constitute an official financing or lease offer. Actual payments may differ based on credit evaluation, programs in effect at the time of transaction, residual adjustments and applicable fees. The dealer and its representatives cannot be held responsible for any calculation errors or discrepancies between this estimate and the final contract terms. All transactions are subject to credit approval by the financial institution.'}
          </div>
        </div>
        ${withDescription && stickerDetails?.description_image ? `
        <div class="sheet page2">
          ${bandHtml}
          <div class="top">
            <h1>${F ? 'Description du véhicule' : 'Vehicle description'}</h1>
            <div class="meta">${esc(selectedProgram.brand)} ${esc(selectedProgram.model)} ${esc(selectedProgram.trim || '')} ${esc(selectedProgram.year)}${stockNo ? ' · ' + (F ? 'Inventaire ' : 'Stock ') + esc(stockNo) : ''}${vin ? ' · NIV ' + esc(vin) : ''}</div>
          </div>
          <img class="desc" src="${esc(stickerDetails.description_image)}" alt="${F ? 'Description du véhicule, fiche du fabricant' : 'Vehicle description, manufacturer sticker'}" />
          <div class="cap">${F ? "Équipement de série et accessoires optionnels, tels que publiés par le fabricant sur la fiche du véhicule (Window Sticker). Frais d'immatriculation, taxes et accessoires installés par le concessionnaire en sus." : 'Standard equipment and optional accessories as published by the manufacturer on the vehicle sticker. Registration fees, taxes and dealer-installed accessories extra.'}</div>
        </div>` : ''}
        <button class="back-btn no-print" onclick="window.close(); if(!window.closed) history.back();">${F ? 'Retour au calculateur' : 'Back to calculator'}</button>
        <script>
          // Toujours une seule page : la feuille est réduite si elle dépasse la hauteur utile.
          (function () {
            var fit = function () {
              var s = document.getElementById('sheet'); if (!s) return;
              s.style.zoom = 1;
              var max = 1010, h = s.scrollHeight;
              if (h > max) s.style.zoom = (max / h).toFixed(3);
            };
            window.addEventListener('beforeprint', fit); window.addEventListener('load', fit); fit();
          })();
        </script>
      </body>
      </html>
    `;

    return printContent;
  };

  // La feuille en PDF (navigateur seulement) : jointe au texto et au courriel.
  const buildSubmissionPdf = async (): Promise<Blob | null> => {
    const html = buildPrintHtml({ description: false });   // le PDF joint reste d'une page
    if (!html || Platform.OS !== 'web' || typeof document === 'undefined') return null;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:816px;height:1056px;border:0;';
    document.body.appendChild(frame);
    try {
      const doc = frame.contentDocument;
      if (!doc) return null;
      doc.open(); doc.write(html); doc.close();
      const started = Date.now();
      while (Array.from(doc.images).some((im) => !im.complete) && Date.now() - started < 2500) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const sheet = doc.getElementById('sheet');
      if (!sheet) return null;
      sheet.style.margin = '0';
      (sheet.style as any).zoom = '1';
      const canvas = await html2canvas(sheet, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const jpeg: Blob | null = await new Promise((resolve) => canvas.toBlob((b: any) => resolve(b), 'image/jpeg', 0.9));
      if (!jpeg) return null;
      return jpegToLetterPdf(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height);
    } catch {
      return null;
    } finally {
      document.body.removeChild(frame);
    }
  };

  // Vrai dans un cadre sur un téléphone ou une tablette (Bureau web de l'application eTradeValue) :
  // là, window.open() vide l'écran et window.print() ne fait rien.
  const printNeedsShareSheet = (): boolean => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    let framed = true;
    try { framed = window.self !== window.top; } catch { framed = true; }
    const ua = navigator.userAgent || '';
    const handheld = /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
    return framed && handheld;
  };

  // Handle Print
  const handlePrint = async () => {
    const printContent = buildPrintHtml();
    if (!printContent) {
      if (Platform.OS === 'web') {
        alert(lang === 'fr' ? 'Aucune soumission à imprimer' : 'No submission to print');
      } else {
        Alert.alert('Erreur', lang === 'fr' ? 'Aucune soumission à imprimer' : 'No submission to print');
      }
      return;
    }

    if (Platform.OS === 'web' && printNeedsShareSheet()) {
      // Dans l'application du cellulaire, une nouvelle fenêtre remplace tout l'écran par une
      // page blanche. La feuille part donc en PDF par la feuille de partage (« Imprimer » y est).
      setPrintBusy(true);
      try {
        const pdf = await buildSubmissionPdf();
        const label = (clientName || 'client').trim().replace(/[^\p{L}\p{N}]+/gu, '_') || 'client';
        const file = pdf ? new File([pdf], `Soumission_${label}.pdf`, { type: 'application/pdf' }) : null;
        if (!file || !navigator.share || !navigator.canShare || !navigator.canShare({ files: [file] })) {
          alert(lang === 'fr'
            ? "L'impression n'est pas offerte dans cette application. Envoyez la soumission par courriel, ou ouvrez CalcAuto dans Safari pour l'imprimer."
            : 'Printing is not available in this app. Email the submission, or open CalcAuto in Safari to print it.');
          return;
        }
        try {
          await navigator.share({ files: [file] });
        } catch (e: any) {
          // Le téléphone exige un toucher juste avant le partage : on garde le PDF et on le redemande.
          if (e && e.name !== 'AbortError') setPrintReadyFile(file);
        }
      } finally {
        setPrintBusy(false);
      }
      return;
    }

    if (Platform.OS === 'web') {
      // On web, open print dialog
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        // On attend les logos (2 s au plus) pour qu'ils sortent sur la feuille
        const started = Date.now();
        const whenReady = () => {
          const imgs = Array.from(printWindow.document.images || []);
          if (imgs.every((im) => im.complete) || Date.now() - started > 2000) printWindow.print();
          else setTimeout(whenReady, 100);
        };
        setTimeout(whenReady, 250);
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
        model_code: selectedInventory?.model_code || pickedCode || selectedProgram?.code || '',
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
        hold={programsLoading}
        onFinish={() => setShowSplash(false)} 
      />
      
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{flex: 1}}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <GaugeMark size={26} motion="none" />
              <Text style={styles.headerTitle} accessibilityLabel={t.title}>
                Calc<Text style={{ color: '#e6c65a' }}>Auto</Text>
              </Text>
            </View>
            <TouchableOpacity 
              style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#111722', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 4}}
              onPress={() => setShowPeriodSelector(true)}
            >
              <Ionicons name="calendar-outline" size={14} color="#e6c65a" />
              <Text style={{color: '#e6c65a', fontSize: 13, fontWeight: '600', marginLeft: 6}}>
                {currentPeriod ? `${monthNames[lang][currentPeriod.month]} ${currentPeriod.year}` : 'Période'}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#e6c65a" style={{marginLeft: 4}} />
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
              <Ionicons name="cloud-upload-outline" size={20} color="#f4f1ea" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.importButton, {backgroundColor: '#e74c3c', marginLeft: 8}]}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={20} color="#f4f1ea" />
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
                  <Ionicons name="close" size={24} color="#f4f1ea" />
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e6c65a" />
          }
          keyboardShouldPersistTaps="handled"
        >
          {/* Véhicule neuf ou d'occasion */}
          <View
            style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 4, padding: 3, borderRadius: 12, borderWidth: 1, borderColor: '#303744', backgroundColor: '#07090e' }}
            accessibilityRole="tablist"
            data-testid="vehicle-mode"
          >
            {(['neuf', 'usage'] as const).map(mode => (
              <TouchableOpacity
                key={mode}
                onPress={() => switchVehicleMode(mode)}
                accessibilityRole="tab"
                accessibilityState={{ selected: vehicleMode === mode }}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: vehicleMode === mode ? '#e6c65a' : 'transparent' }}
                data-testid={`vehicle-mode-${mode}`}
              >
                <Text numberOfLines={1} style={{ color: vehicleMode === mode ? '#11130f' : '#b9c0cc', fontSize: 15, fontWeight: '700' }}>
                  {mode === 'neuf' ? (lang === 'fr' ? 'Neuf' : 'New') : (lang === 'fr' ? 'Occasion' : 'Used')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {!!dossierNote && (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, marginBottom: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e6c65a', backgroundColor: 'rgba(230, 198, 90, 0.1)' }}
              data-testid="dossier-note"
            >
              <Ionicons name="person-circle-outline" size={18} color="#e6c65a" />
              <Text style={{ flex: 1, color: '#f4f1ea', fontSize: 13, lineHeight: 18 }}>{dossierNote}</Text>
              <TouchableOpacity onPress={() => setDossierNote('')} accessibilityLabel={lang === 'fr' ? 'Fermer' : 'Close'} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={18} color="#b9c0cc" />
              </TouchableOpacity>
            </View>
          )}
          {isUsed && (
            <View style={styles.section} data-testid="used-section">
              <Text style={styles.sectionTitle}>
                {lang === 'fr' ? "Véhicules d'occasion en inventaire" : 'Used vehicles in stock'} ({usedVehicles.length})
              </Text>
              <TextInput
                style={[styles.input, { marginBottom: 10 }]}
                value={usedSearch}
                onChangeText={setUsedSearch}
                placeholder={lang === 'fr' ? 'Chercher : no de stock, marque, modèle…' : 'Search: stock #, make, model…'}
                placeholderTextColor="#8a93a1"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.inventoryScroll}>
                {usedVehicles.slice(0, 60).map((vehicle: any) => (
                  <TouchableOpacity
                    key={vehicle.id || vehicle.stock_no}
                    style={[styles.inventoryCard, selectedInventory?.stock_no === vehicle.stock_no && styles.inventoryCardSelected]}
                    onPress={() => {
                      setSelectedInventory(vehicle);
                      setManualVin('');
                      setVehiclePrice(String(vehicle.asking_price || vehicle.msrp || ''));
                    }}
                  >
                    <Text style={styles.inventoryStock}>#{vehicle.stock_no}</Text>
                    <Text style={styles.inventoryModel}>{vehicle.year} {vehicle.brand} {vehicle.model}</Text>
                    <Text style={styles.inventoryTrim}>{vehicle.trim}</Text>
                    {colorLabel(vehicle) !== '' && (
                      <Text style={[styles.inventoryVin, { color: '#e5e7eb' }]}>{colorLabel(vehicle)}</Text>
                    )}
                    {vehicle.km > 0 && (
                      <Text style={styles.inventoryVin}>{Number(vehicle.km).toLocaleString('fr-CA')} km</Text>
                    )}
                    <Text style={styles.inventoryPrice}>{formatCurrency(vehicle.asking_price || vehicle.msrp)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {usedVehicles.length === 0 && (
                <Text style={styles.noInventoryText}>
                  {lang === 'fr'
                    ? "Aucun véhicule d'occasion trouvé. Tu peux quand même entrer un prix plus bas."
                    : 'No used vehicle found. You can still type a price below.'}
                </Text>
              )}
              <View style={[styles.inputRow, { marginTop: 14 }]}>
                <Text style={styles.inputLabel}>{lang === 'fr' ? "Taux d'intérêt" : 'Interest rate'}</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="8.99"
                    placeholderTextColor="#8a93a1"
                    keyboardType="decimal-pad"
                    value={usedRate}
                    onChangeText={(v) => setUsedRate(v.replace(/[^0-9.,]/g, ''))}
                    data-testid="used-rate-input"
                  />
                  <Text style={styles.currencySymbol}>%</Text>
                </View>
              </View>
            </View>
          )}

          {/* Event Banner - Dynamic from PDF cover page */}
          {!isUsed && programMeta && programMeta.event_names?.length > 0 && programMeta.event_names[0] && (
            <EventBanner
              meta={programMeta}
              lang={lang}
              loyaltyChecked={loyaltyChecked}
              onToggleLoyalty={() => setLoyaltyChecked(prev => !prev)}
              deferredChecked={deferredPayment}
              onToggleDeferred={() => setDeferredPayment(prev => !prev)}
              selectedTerm={selectedTerm}
            />
          )}

          {!isUsed && (<>
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

          </>)}

          {/* Vehicle Selection */}
          <View style={styles.section}>
            {!isUsed && (<>
            <Text style={styles.sectionTitle}>
              {t.vehicle.selectVehicle} ({filteredPrograms.length})
            </Text>
            {programsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#e6c65a" />
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
                    {inventoryLoaded && (
                      <Text
                        style={{ marginTop: 6, fontSize: 12, fontWeight: '600', color: (stockByProgram[program.id] || 0) > 0 ? '#4ECDC4' : '#6b7280' }}
                        data-testid={`program-stock-${program.id}`}
                      >
                        {stockByProgram[program.id] || 0} {lang === 'fr' ? 'en stock' : 'in stock'}
                      </Text>
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
                        {hasOption1 ? `${getRateForTerm(selectedProgram.option1_rates, term)}%` : '-'}
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
                      <Text style={styles.rebateLabel}>{t.results.rebate} Opt.1 ({t.results.beforeTax}):</Text>
                      <Text style={styles.rebateValue}>{formatCurrency(selectedProgram.consumer_cash)}</Text>
                    </View>
                  )}
                  {selectedProgram.alternative_consumer_cash > 0 && (
                    <View style={styles.rebateItem}>
                      <Text style={styles.rebateLabel}>{t.results.rebate} Opt.2 ({t.results.beforeTax}):</Text>
                      <Text style={styles.rebateValue}>{formatCurrency(selectedProgram.alternative_consumer_cash)}</Text>
                    </View>
                  )}
                  {selectedProgram.bonus_cash > 0 && (
                    <View style={styles.rebateItem}>
                      <Ionicons name="gift-outline" size={14} color="#f0d879" />
                      <Text style={styles.rebateLabelBonus}>{rebateName(t.results.bonusCash, selectedProgram.bonus_cash_program)} ({t.results.afterTax}):</Text>
                      <Text style={styles.rebateValueBonus}>{formatCurrency(selectedProgram.bonus_cash)}</Text>
                    </View>
                  )}
                  {stdRateLeaseCash > 0 && (
                    <TouchableOpacity
                      style={styles.rebateItem}
                      onPress={() => setCheckedOffers(prev => ({ ...prev, [STD_RATE_CASH_KEY]: !prev[STD_RATE_CASH_KEY] }))}
                      testID="offer-toggle-standard-rate-lease-cash"
                    >
                      <Ionicons name={stdRateCashChecked ? 'checkbox' : 'square-outline'} size={18} color="#f0d879" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rebateLabelBonus}>SCI Standard Rate Lease Cash — 261QLB ({t.results.beforeTax}):</Text>
                        <Text style={{ color: '#9aa3b1', fontSize: 11 }}>
                          {lang === 'fr' ? 'Location au taux standard seulement, s\'ajoute au Lease Cash' : 'Standard-rate lease only, stacks with Lease Cash'}
                        </Text>
                      </View>
                      <Text style={styles.rebateValueBonus}>{formatCurrency(stdRateLeaseCash)}</Text>
                    </TouchableOpacity>
                  )}
                  {specialOffers.map((offer: any) => {
                    const key = offerKey(offer);
                    const isChecked = !!checkedOffers[key];
                    return (
                      <TouchableOpacity
                        key={key}
                        style={styles.rebateItem}
                        onPress={() => setCheckedOffers(prev => ({ ...prev, [key]: !prev[key] }))}
                        testID={offer.kind === 'loyalty' ? 'loyalty-bonus-toggle' : `offer-toggle-${offer.code}`}
                      >
                        <Ionicons name={isChecked ? 'checkbox' : 'square-outline'} size={18} color="#f0d879" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rebateLabelBonus}>
                            {offerLabel(offer)} ({offer.tax === 'before' ? t.results.beforeTax : t.results.afterTax}):
                          </Text>
                          {(offer.condition || offer.vin_list) ? (
                            <Text style={{ color: '#9aa3b1', fontSize: 11 }}>
                              {offer.condition}{offer.vin_list ? (lang === 'fr' ? ' · véhicule sur la liste de NIV' : ' · VIN on the manifest list') : ''}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.rebateValueBonus}>{formatCurrency(offer.amount)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
            </>)}
            
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
                    placeholderTextColor="#8a93a1"
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
                    placeholderTextColor="#8a93a1"
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
          {selectedProgram && !isUsed && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {lang === 'fr' ? '📦 Inventaire disponible' : '📦 Available Inventory'} ({programInventory.length})
              </Text>
              <Text style={styles.inventorySubtitle}>
                {lang === 'fr' 
                  ? `${selectedProgram.brand} ${selectedProgram.model} ${selectedProgram.year} en stock`
                  : `${selectedProgram.brand} ${selectedProgram.model} ${selectedProgram.year} in stock`}
              </Text>
              {modelCodes.length > 0 && (
                <View style={{ marginBottom: 10 }} data-testid="model-code-picker">
                  <TouchableOpacity
                    onPress={() => setShowCodeList(!showCodeList)}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111722', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 }}
                    data-testid="model-code-toggle"
                  >
                    <Text style={{ color: '#f4f1ea', fontSize: 14, fontWeight: '600', flex: 1 }}>
                      {lang === 'fr' ? 'Code de modèle : ' : 'Model code: '}
                      <Text style={{ color: '#FFB347' }}>
                        {pickedCode || (lang === 'fr' ? `Tous (${modelCodes.length})` : `All (${modelCodes.length})`)}
                      </Text>
                    </Text>
                    <Text style={{ color: '#e6c65a', fontSize: 14 }}>{showCodeList ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  {showCodeList && (
                    <View style={{ backgroundColor: '#24243a', borderRadius: 10, marginTop: 4 }}>
                      {[{ code: '', description: lang === 'fr' ? 'Tous les codes' : 'All codes', in_stock: -1 }, ...modelCodes].map(item => (
                        <TouchableOpacity
                          key={item.code || 'all'}
                          onPress={() => {
                            setPickedCode(item.code);
                            setShowCodeList(false);
                            if (item.code && selectedInventory?.model_code && selectedInventory.model_code.toUpperCase() !== item.code) {
                              setSelectedInventory(null);
                            }
                          }}
                          style={{ paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#303744', backgroundColor: pickedCode === item.code ? '#303744' : 'transparent' }}
                          data-testid={`model-code-${item.code || 'all'}`}
                        >
                          <Text style={{ color: '#f4f1ea', fontSize: 14 }}>
                            {item.code ? <Text style={{ color: '#FFB347', fontWeight: '700' }}>{item.code}  </Text> : null}
                            {item.description}
                          </Text>
                          {item.in_stock >= 0 && (
                            <Text style={{ color: item.in_stock > 0 ? '#e6c65a' : '#9aa3b1', fontSize: 12, marginTop: 2 }}>
                              {item.in_stock > 0
                                ? (lang === 'fr' ? `${item.in_stock} en inventaire` : `${item.in_stock} in stock`)
                                : (lang === 'fr' ? 'Aucun en inventaire' : 'None in stock')}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
              {codeSavedFor ? (
                <Text style={{ color: '#e6c65a', fontSize: 12, marginBottom: 8 }} data-testid="model-code-saved">
                  {lang === 'fr' ? `Code inscrit sur la fiche #${codeSavedFor}` : `Code saved on vehicle #${codeSavedFor}`}
                </Text>
              ) : null}
              {selectedInventory && !selectedInventory.model_code && !pickedCode ? (
                <View style={{ marginBottom: 8 }} data-testid="model-code-missing">
                  <Text style={{ color: '#FFB347', fontSize: 12 }}>
                    {lang === 'fr'
                      ? `La fiche #${selectedInventory.stock_no} n'a pas de code.`
                      : `Vehicle #${selectedInventory.stock_no} has no code.`}
                    {codeSuggest && codeSuggest.stock_no === selectedInventory.stock_no && (codeSuggest.trim || codeSuggest.cab)
                      ? (lang === 'fr' ? ' Version décodée : ' : ' Decoded trim: ')
                        + [codeSuggest.vin_trim || codeSuggest.trim,
                           codeSuggest.title_trim && codeSuggest.title_trim.toLowerCase() !== (codeSuggest.vin_trim || codeSuggest.trim || '').toLowerCase() ? `(${codeSuggest.title_trim})` : '',
                           codeSuggest.cab, /4x4|4wd/i.test(codeSuggest.drive || '') ? '4x4' : ''].filter(Boolean).join(' · ')
                      : ''}
                  </Text>
                  {codeSuggest && codeSuggest.stock_no === selectedInventory.stock_no && (codeSuggest.codes || []).length > 0 ? (
                    <View>
                      <Text style={{ color: '#b9c0cc', fontSize: 12, marginTop: 6 }}>
                        {lang === 'fr' ? 'Codes possibles (touche le bon, il sera retenu sur la fiche) :' : 'Possible codes (tap the right one, it will be kept):'}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                        {codeSuggest.codes.map((c: any) => (
                          <TouchableOpacity
                            key={c.code}
                            onPress={() => setPickedCode(c.code)}
                            style={{ backgroundColor: '#111722', borderColor: '#FFB347', borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginRight: 8, marginBottom: 8 }}
                            data-testid={`code-suggestion-${c.code}`}
                          >
                            <Text style={{ color: '#FFB347', fontWeight: '700', fontSize: 14 }}>{c.code}</Text>
                            <Text style={{ color: '#cfd4dc', fontSize: 11 }}>{c.description}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View>
                      <Text style={{ color: '#b9c0cc', fontSize: 12, marginTop: 4 }}>
                        {lang === 'fr'
                          ? 'Aucun code connu pour cette version. Entre-le une fois : il sera retenu pour les prochains véhicules.'
                          : 'No known code for this trim. Enter it once: it will be kept for future vehicles.'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                        <TextInput
                          style={{ flex: 1, backgroundColor: '#111722', color: '#f4f1ea', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, fontSize: 15, marginRight: 8 }}
                          value={typedCode}
                          onChangeText={(v) => setTypedCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                          placeholder={lang === 'fr' ? 'Code (6 caractères)' : 'Code (6 characters)'}
                          placeholderTextColor="#8a93a1"
                          autoCapitalize="characters"
                          data-testid="model-code-input"
                        />
                        <TouchableOpacity
                          disabled={typedCode.length !== 6}
                          onPress={() => { setPickedCode(typedCode); setTypedCode(''); }}
                          style={{ backgroundColor: typedCode.length === 6 ? '#e6c65a' : '#3a3a55', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 }}
                          data-testid="model-code-keep"
                        >
                          <Text style={{ color: '#07090e', fontWeight: '700' }}>{lang === 'fr' ? 'Retenir' : 'Keep'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ) : null}
              {inventoryList.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.inventoryScroll}>
                  {programInventory
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
                          // Un véhicule neuf part du PDSF : les rabais du programme s'appliquent ensuite.
                          setVehiclePrice(String(newVehicleBasePrice(vehicle) || ''));
                        }}
                      >
                        <Text style={styles.inventoryStock}>{stockLabel(vehicle, lang)}</Text>
                        {stageLabel(vehicle, lang) && (
                          <Text style={[styles.inventoryVin, { color: STAGE_COLORS[stageLabel(vehicle, lang)!.tone], fontWeight: '700' }]}>
                            {stageLabel(vehicle, lang)!.text}
                          </Text>
                        )}
                        <Text style={styles.inventoryModel}>
                          {vehicle.year} {vehicle.model}
                        </Text>
                        <Text style={styles.inventoryTrim}>
                          {vehicle.trim}{vehicle.model_code ? <Text style={{ color: '#FFB347', fontWeight: '700' }}>  [{vehicle.model_code}]</Text> : null}
                        </Text>
                        {colorLabel(vehicle) !== '' && (
                          <Text style={[styles.inventoryVin, { color: '#e5e7eb' }]}>{colorLabel(vehicle)}</Text>
                        )}
                        {vehicle.vin && (
                          <Text style={styles.inventoryVin}>VIN: {vehicle.vin}</Text>
                        )}
                        <Text style={styles.inventoryPrice}>
                          {formatCurrency(newVehicleBasePrice(vehicle))}
                        </Text>
                        <Text style={[styles.inventoryVin, vehicle.pdsf_confirmed === false && { color: '#FFB347' }]}>
                          {vehicle.pdsf_confirmed === false
                            ? (lang === 'fr' ? 'PDSF à vérifier' : 'Check MSRP')
                            : (lang === 'fr' ? 'PDSF avant rabais' : 'MSRP before rebates')}
                        </Text>
                        {vehicle.net_cost > 0 && (
                          <Text style={styles.inventoryProfit}>
                            Profit: {formatCurrency((vehicle.asking_price || vehicle.msrp) - vehicle.net_cost)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  {programInventory.length === 0 && (
                    <View style={styles.noInventoryContainer}>
                      <Text style={styles.noInventoryText}>
                        {lang === 'fr' 
                          ? `Aucun ${selectedProgram.brand} ${selectedProgram.model} ${selectedProgram.year} en inventaire`
                          : `No ${selectedProgram.brand} ${selectedProgram.model} ${selectedProgram.year} vehicles in inventory`}
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
                          placeholderTextColor="#8a93a1"
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
                  {lang === 'fr' ? 'Aucun véhicule en inventaire' : 'No vehicle in inventory'}
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
                    <Ionicons name="car-sport" size={20} color="#e6c65a" />
                    <Text style={styles.selectedInventoryText}>
                      {selectedInventory.stock_pending ? stockLabel(selectedInventory, lang) : `Stock #${selectedInventory.stock_no}`} - {selectedInventory.year} {selectedInventory.brand} {selectedInventory.model} {selectedInventory.trim}
                    </Text>
                  </View>
                  {(colorLabel(selectedInventory) !== '' || stageLabel(selectedInventory, lang)) && (
                    <Text style={styles.selectedInventoryVin}>
                      {[colorLabel(selectedInventory), stageLabel(selectedInventory, lang)?.text].filter(Boolean).join(' · ')}
                    </Text>
                  )}
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
                    <Ionicons name="flash" size={18} color="#f0d879" />
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
                    placeholderTextColor="#8a93a1"
                    keyboardType="numeric"
                    value={vehiclePrice}
                    onChangeText={setVehiclePrice}
                  />
                </View>
              </View>

              {/* Rabais concessionnaire (partagé financement + location) */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{lang === 'fr' ? 'Rabais concess.' : 'Dealer discount'}</Text>
                <View style={styles.inputContainer}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="0"
                    placeholderTextColor="#8a93a1"
                    keyboardType="numeric"
                    value={leaseRabaisConcess}
                    onChangeText={setLeaseRabaisConcess}
                    data-testid="rabais-concess-input"
                  />
                </View>
              </View>
              
              {/* Bonus Cash optionnel */}
              <View style={[styles.inputRow, isUsed && { display: 'none' }]}>
                <Text style={styles.inputLabel}>{t.results.bonusCash} ({t.results.afterTax})</Text>
                <View style={styles.inputContainer}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <TextInput
                    style={styles.priceInput}
                    placeholder={String(selectedProgram.bonus_cash || 0)}
                    placeholderTextColor="#8a93a1"
                    keyboardType="numeric"
                    value={customBonusCash}
                    onChangeText={setCustomBonusCash}
                  />
                </View>
              </View>

              {/* Solde reporté location (taxable) */}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{lang === 'fr' ? 'Solde reporté location' : 'Lease Carried Balance'}</Text>
                <View style={styles.inputContainer}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="0"
                    placeholderTextColor="#8a93a1"
                    keyboardType="numeric"
                    value={soldeReporteLocation}
                    onChangeText={setSoldeReporteLocation}
                    data-testid="solde-reporte-input"
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
                    placeholderTextColor="#8a93a1"
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
                        placeholder={DOSSIER_FEE[vehicleMode]}
                        placeholderTextColor="#8a93a1"
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
                        placeholderTextColor="#8a93a1"
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
                        placeholderTextColor="#8a93a1"
                        keyboardType="decimal-pad"
                        value={fraisRDPRM}
                        onChangeText={setFraisRDPRM}
                      />
                    </View>
                  </View>
                </View>
                <View style={[styles.feesRow, { marginTop: 10 }]}>
                  <View style={styles.feeField}>
                    <Text style={styles.feeLabel}>{lang === 'fr' ? 'Ass. pare-brise' : 'Windshield ins.'}</Text>
                    <View style={styles.feeInputContainer}>
                      <Text style={styles.feeSymbol}>$</Text>
                      <TextInput
                        style={styles.feeInput}
                        placeholder="0"
                        placeholderTextColor="#8a93a1"
                        keyboardType="decimal-pad"
                        value={assurancePareBrise}
                        onChangeText={setAssurancePareBrise}
                        data-testid="fee-windshield"
                      />
                    </View>
                  </View>
                  <View style={styles.feeField}>
                    <Text style={styles.feeLabel}>{lang === 'fr' ? 'Frais divers' : 'Other fees'}</Text>
                    <View style={styles.feeInputContainer}>
                      <Text style={styles.feeSymbol}>$</Text>
                      <TextInput
                        style={styles.feeInput}
                        placeholder="0"
                        placeholderTextColor="#8a93a1"
                        keyboardType="decimal-pad"
                        value={fraisDivers}
                        onChangeText={setFraisDivers}
                        data-testid="fee-misc"
                      />
                    </View>
                  </View>
                  <View style={styles.feeField} />
                </View>
              </View>

              {/* Échange */}
              <View style={styles.feesSection}>
                <Text style={styles.feesSectionTitle}>{t.exchange.title}</Text>
                {tradeInfo && (
                  <Text style={[styles.feeNote, { marginBottom: 8, fontSize: 13 }]} data-testid="trade-info">
                    {lang === 'fr' ? 'Reprise de ' : 'Trade-in from '}{tradeInfo.client}{tradeInfo.vehicle ? ` : ${tradeInfo.vehicle}` : ''}
                  </Text>
                )}
                <View style={styles.exchangeRow}>
                  <View style={styles.exchangeField}>
                    <Text style={styles.feeLabel}>{t.exchange.value}</Text>
                    <View style={styles.feeInputContainer}>
                      <Text style={styles.feeSymbol}>$</Text>
                      <TextInput
                        style={styles.feeInput}
                        placeholder="0"
                        placeholderTextColor="#8a93a1"
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
                        placeholderTextColor="#8a93a1"
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
              <View style={[styles.termSection, isUsed && { display: 'none' }]}>
                <Text style={styles.inputLabel}>{t.options.chooseOption}</Text>
                <View style={styles.optionButtons}>
                  {!hasOption1 && (
                    <View style={[styles.optionButton, styles.optionButtonDisabled]} data-testid="option1-not-available">
                      <Text style={styles.optionButtonTextDisabled}>{t.options.option1}</Text>
                      <Text style={styles.optionButtonTextDisabled}>{t.options.notAvailable}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.optionButton,
                      styles.optionButton1,
                      selectedOption === '1' && styles.optionButtonActive1,
                      !hasOption1 && { display: 'none' }
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
                        {selectedProgram.alternative_consumer_cash > 0 ? formatCurrency(selectedProgram.alternative_consumer_cash) : '$0'} + {localResult?.option2Rate || getRateForTerm(selectedProgram.option2_rates, selectedTerm)}%
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
              {localResult.bestOption && hasOption1 && !isUsed && (
                <View style={[
                  styles.bestOptionBanner,
                  localResult.bestOption === '1' ? styles.bestOptionBanner1 : styles.bestOptionBanner2
                ]}>
                  <Ionicons name="trophy" size={20} color="#07090e" />
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
                  localResult.bestOption === '1' && styles.optionCardBest,
                  !hasOption1 && { display: 'none' }
                ]}>
                  <View style={styles.optionHeader}>
                    <Text style={styles.optionCardTitle}>{isUsed ? (lang === 'fr' ? 'Financement' : 'Financing') : t.options.option1}</Text>
                    {localResult.bestOption === '1' && !isUsed && (
                      <Ionicons name="checkmark-circle" size={18} color="#e6c65a" />
                    )}
                  </View>
                  <Text style={styles.optionSubtitle}>{isUsed ? (lang === 'fr' ? "Véhicule d'occasion" : 'Used vehicle') : t.options.option1Desc}</Text>
                  
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
                  localResult.bestOption === '2' && styles.optionCardBest,
                  isUsed && { display: 'none' }
                ]}>
                  <View style={styles.optionHeader}>
                    <Text style={styles.optionCardTitle}>{t.options.option2}</Text>
                    {localResult.bestOption === '2' && (
                      <Ionicons name="checkmark-circle" size={18} color="#e6c65a" />
                    )}
                  </View>
                  <Text style={styles.optionSubtitle}>{t.options.option2Desc}</Text>
                  
                  {localResult.option2Rate !== null ? (
                    <>
                      <View style={styles.optionDetail}>
                        <Text style={styles.optionDetailLabel}>{t.results.rebate}:</Text>
                        <Text style={styles.optionDetailValue}>{selectedProgram.alternative_consumer_cash > 0 ? formatCurrency(selectedProgram.alternative_consumer_cash) : '$0'}</Text>
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
                      <Ionicons name="close-circle-outline" size={32} color="#8a93a1" />
                      <Text style={styles.noOptionText}>{t.options.notAvailable}</Text>
                      <Text style={styles.noOptionSubtext}>Non disponible pour ce véhicule</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Promotions avant taxes cochées */}
              {beforeTaxRebates.map(rebate => (
                <View key={rebate.label} style={styles.bonusCashNote}>
                  <Ionicons name="information-circle" size={16} color="#f0d879" />
                  <Text style={styles.bonusCashNoteText}>
                    {rebate.label} : {formatCurrency(rebate.amount)} {lang === 'fr' ? 'déduit avant taxes' : 'deducted before tax'}
                  </Text>
                </View>
              ))}
              {/* Bonus Cash Note */}
              {afterTaxRebates.map(rebate => (
                <View key={rebate.label} style={styles.bonusCashNote}>
                  <Ionicons name="information-circle" size={16} color="#f0d879" />
                  <Text style={styles.bonusCashNoteText}>
                    {rebate.label} : {formatCurrency(rebate.amount)} {lang === 'fr' ? 'déduit après taxes, à part du comptant du client' : 'deducted after tax, separate from the cash down'}
                  </Text>
                </View>
              ))}
              
              {/* Send by Email Button */}
              <TouchableOpacity
                style={styles.sendEmailButton}
                onPress={() => setShowEmailModal(true)}
                data-testid="send-email-btn"
              >
                <Ionicons name="mail-outline" size={20} color="#f4f1ea" />
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
                  <Ionicons name="chatbubble-outline" size={18} color="#f4f1ea" />
                  <Text style={styles.shareButtonText}>
                    {lang === 'fr' ? 'Texto' : 'SMS'}
                  </Text>
                </TouchableOpacity>
                
                {/* Print Button */}
                <TouchableOpacity
                  style={styles.printButton}
                  onPress={openPrint}
                  data-testid="print-btn"
                >
                  <Ionicons name="print-outline" size={18} color="#f4f1ea" />
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
                  <Ionicons name="document-outline" size={18} color="#f4f1ea" />
                  <Text style={styles.shareButtonText}>
                    Excel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ============ LOCATION SCI ============ */}
          {selectedProgram && vehiclePrice && !isUsed && (
            <View style={styles.section} data-testid="lease-section">
              {/* Toggle Lease */}
              <TouchableOpacity
                style={[styles.leaseToggle, showLease && styles.leaseToggleActive]}
                onPress={() => setShowLease(!showLease)}
                data-testid="lease-toggle-btn"
              >
                <Ionicons name="car-sport" size={20} color={showLease ? '#f4f1ea' : '#e6c65a'} />
                <Text style={[styles.leaseToggleText, showLease && styles.leaseToggleTextActive]}>
                  {lang === 'fr' ? 'Location SCI' : 'SCI Lease'}
                </Text>
                <Ionicons name={showLease ? 'chevron-up' : 'chevron-down'} size={18} color={showLease ? '#f4f1ea' : '#e6c65a'} />
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
                      placeholderTextColor="#5a6372"
                      keyboardType="numeric"
                      data-testid="lease-pdsf-input"
                    />
                  </View>
                  
                  {/* Solde reporté */}
                  <View style={styles.leaseInputRow}>
                    <Text style={styles.leaseInputLabel}>{lang === 'fr' ? 'Solde reporté' : 'Carried balance'}</Text>
                    <TextInput
                      style={styles.leaseInput}
                      value={leaseSoldeReporte}
                      onChangeText={setLeaseSoldeReporte}
                      placeholder="0"
                      placeholderTextColor="#5a6372"
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
                    // Même ligne du guide que celle utilisée pour le calcul du paiement
                    const rv = residualVehicle;
                    if (!rv) return null;
                    const basePct = rv.residual_percentages?.[String(leaseTerm)] || 0;
                    if (basePct === 0) return null;
                    const kmAdj = leaseResiduals.km_adjustments?.adjustments || {};
                    const pdsf = parseFloat(leasePdsf) || parseFloat(vehiclePrice) || 0;
                    
                    // Versions et carrosseries possibles : le résiduel change de l'une à l'autre
                    const term = String(leaseTerm);
                    const versions = Array.from(new Set(residualOptions.map(residualVersionOf)));
                    const bodies = Array.from(new Set(residualOptions
                      .filter((o: any) => residualVersionOf(o) === residualVersionOf(rv))
                      .map((o: any) => o.body_style).filter(Boolean)));
                    const pcts = residualOptions.map((o: any) => o.residual_percentages?.[term] || 0).filter((x: number) => x > 0);
                    const spread = pcts.length ? [Math.min(...pcts), Math.max(...pcts)] : [0, 0];
                    const confirmed = !!selectedInventory || !!residualPick.version || versions.length <= 1;
                    const chip = (label: string, active: boolean, onPress: () => void, testID: string) => (
                      <TouchableOpacity
                        key={testID}
                        onPress={onPress}
                        data-testid={testID}
                        style={{
                          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, marginRight: 6, marginBottom: 6,
                          backgroundColor: active ? '#e6c65a' : '#303744',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#07090e' : '#cfd8e3' }}>{label}</Text>
                      </TouchableOpacity>
                    );

                    return (
                      <View style={styles.residualKmTable} data-testid="residual-km-table">
                        {(versions.length > 1 || bodies.length > 1) && (
                          <View style={{ marginBottom: 10 }} data-testid="residual-version-picker">
                            <Text style={styles.residualKmTitle}>
                              {lang === 'fr' ? 'Version exacte du véhicule' : 'Exact vehicle version'}
                            </Text>
                            {!confirmed && spread[0] !== spread[1] && (
                              <Text style={{ fontSize: 12, color: '#FFB347', marginBottom: 8 }} data-testid="residual-version-warning">
                                {lang === 'fr'
                                  ? `À confirmer : le résiduel va de ${spread[0]} % à ${spread[1]} % selon la version. Calcul fait avec « ${residualVersionOf(rv)} ».`
                                  : `To confirm: residual ranges from ${spread[0]}% to ${spread[1]}% by version. Calculated with "${residualVersionOf(rv)}".`}
                              </Text>
                            )}
                            {versions.length > 1 && (
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                {versions.map((name: string) => chip(
                                  name,
                                  residualVersionOf(rv) === name,
                                  () => setResidualPick({ version: name }),
                                  `residual-version-${name}`
                                ))}
                              </View>
                            )}
                            {bodies.length > 1 && (
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                                {bodies.map((name: string) => chip(
                                  name,
                                  rv.body_style === name,
                                  () => setResidualPick({ version: residualVersionOf(rv), body: name }),
                                  `residual-body-${name}`
                                ))}
                              </View>
                            )}
                          </View>
                        )}
                        <Text style={styles.residualKmTitle}>
                          {lang === 'fr' ? 'Résiduel selon kilométrage' : 'Residual by mileage'}
                          {` — ${residualVersionOf(rv)}`}{rv.body_style ? ` ${rv.body_style}` : ''}
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
                        {[12000, 18000, 24000, ...(leaseKmPerYear > 24000 ? [leaseKmPerYear] : [])].map(km => {
                          const adj = km >= 24000 ? 0 : (kmAdj[String(km)]?.[String(leaseTerm)] || 0);
                          const pct = basePct + adj;
                          // Plus de 24 000 km : même pourcentage, moins 0,12 $ par km de plus sur la durée
                          const kmCut = extraKmReduction(km, leaseTerm);
                          const val = pdsf * (pct / 100) - kmCut;
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
                                  {pct}%{adj !== 0 ? ` (+${adj})` : ''}{kmCut > 0 ? ` (−${formatCurrency(kmCut)})` : ''}
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
                    <Ionicons name="information-circle" size={14} color="#e6c65a" />
                    <Text style={styles.leaseInfoText}>
                      {lang === 'fr' 
                        ? `Capitalisé: ${formatCurrency(parseFloat(fraisDossier) || 0)} dossier | Pneus (${formatCurrency(parseFloat(taxePneus) || 0)}) + RDPRM (${formatCurrency(parseFloat(fraisRDPRM) || 0)})${fraisAutres > 0 ? ` + pare-brise et divers (${formatCurrency(fraisAutres)})` : ''} payés à la livraison`
                        : `Capitalized: ${formatCurrency(parseFloat(fraisDossier) || 0)} admin | Tires (${formatCurrency(parseFloat(taxePneus) || 0)}) + RDPRM (${formatCurrency(parseFloat(fraisRDPRM) || 0)})${fraisAutres > 0 ? ` + windshield and other (${formatCurrency(fraisAutres)})` : ''} paid at delivery`}
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
                          <Ionicons name="trophy" size={16} color="#07090e" />
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
                                <Ionicons name="checkmark-circle" size={16} color="#e6c65a" />
                              )}
                            </View>
                            {leaseResult.standard.leaseCash - leaseResult.offersBeforeTax > 0 && (
                              <View style={styles.leaseCardDetail}>
                                <Text style={styles.leaseCardDetailLabel}>Lease Cash:</Text>
                                <Text style={styles.leaseCardDetailValue}>{formatCurrency(leaseResult.standard.leaseCash - leaseResult.offersBeforeTax)}</Text>
                              </View>
                            )}
                            {leaseResult.offersBeforeTax > 0 && (
                              <View style={styles.leaseCardDetail} data-testid="lease-offers-before-tax">
                                <Text style={styles.leaseCardDetailLabel}>{lang === 'fr' ? 'Promos avant taxes:' : 'Before-tax offers:'}</Text>
                                <Text style={styles.leaseCardDetailValue}>{formatCurrency(leaseResult.offersBeforeTax)}</Text>
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
                                <Ionicons name="checkmark-circle" size={16} color="#e6c65a" />
                              )}
                            </View>
                            <View style={styles.leaseCardDetail}>
                              <Text style={styles.leaseCardDetailLabel}>Lease Cash:</Text>
                              <Text style={styles.leaseCardDetailValue}>{formatCurrency(leaseResult.alternative.leaseCash - leaseResult.offersBeforeTax)}</Text>
                            </View>
                            {leaseResult.offersBeforeTax > 0 && (
                              <View style={styles.leaseCardDetail} data-testid="lease-offers-before-tax">
                                <Text style={styles.leaseCardDetailLabel}>{lang === 'fr' ? 'Promos avant taxes:' : 'Before-tax offers:'}</Text>
                                <Text style={styles.leaseCardDetailValue}>{formatCurrency(leaseResult.offersBeforeTax)}</Text>
                              </View>
                            )}
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
                          <Ionicons name="information-circle" size={24} color="#8a93a1" />
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
                            {lang === 'fr' ? `ANALYSE COMPLÈTE - Paiements ${paymentFrequency === 'weekly' ? 'hebdo' : paymentFrequency === 'biweekly' ? 'aux 2 sem.' : 'mensuels'}` : `FULL ANALYSIS - ${paymentFrequency === 'weekly' ? 'Weekly' : paymentFrequency === 'biweekly' ? 'Bi-weekly' : 'Monthly'} payments`}
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
                                          <Text style={[styles.analysisCell, { width: 45, color: '#9aa3b1' }]}>{stdRow?.residualPct || altRow?.residualPct}%</Text>
                                          <Text style={[styles.analysisCell, { width: 82, color: isBestStd ? '#f0d879' : '#E65100', fontWeight: isBestStd ? '800' : '500' }]}>
                                            {stdRow ? `${(paymentFrequency === 'weekly' ? stdRow.monthly * 12/52 : paymentFrequency === 'biweekly' ? stdRow.monthly * 12/26 : stdRow.monthly).toFixed(0)}$` : '-'}
                                          </Text>
                                          <Text style={[styles.analysisCell, { width: 82, color: isBestAlt ? '#f0d879' : '#0277BD', fontWeight: isBestAlt ? '800' : '500' }]}>
                                            {altRow ? `${(paymentFrequency === 'weekly' ? altRow.monthly * 12/52 : paymentFrequency === 'biweekly' ? altRow.monthly * 12/26 : altRow.monthly).toFixed(0)}$` : '-'}
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
                            <Ionicons name="trophy" size={18} color="#f0d879" />
                            <Text style={styles.bestLeaseTitle}>
                              {lang === 'fr' ? 'MEILLEUR CHOIX LOCATION' : 'BEST LEASE OPTION'}
                            </Text>
                            <Ionicons name="trophy" size={18} color="#f0d879" />
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
                            {bestLeaseOption.leaseCash - (leaseResult?.offersBeforeTax || 0) > 0 && (
                              <View style={styles.bestLeaseRow}>
                                <Text style={styles.bestLeaseLabel}>Lease Cash:</Text>
                                <Text style={styles.bestLeaseValue}>{formatCurrency(bestLeaseOption.leaseCash - (leaseResult?.offersBeforeTax || 0))}</Text>
                              </View>
                            )}
                            {(leaseResult?.offersBeforeTax || 0) > 0 && (
                              <View style={styles.bestLeaseRow}>
                                <Text style={styles.bestLeaseLabel}>{lang === 'fr' ? 'Promos avant taxes:' : 'Pre-tax offers:'}</Text>
                                <Text style={styles.bestLeaseValue}>{formatCurrency(leaseResult.offersBeforeTax)}</Text>
                              </View>
                            )}
                            <View style={styles.bestLeaseRow}>
                              <Text style={styles.bestLeaseLabel}>{lang === 'fr' ? 'Résiduel:' : 'Residual:'}</Text>
                              <Text style={styles.bestLeaseValue}>{bestLeaseOption.residualPct}% ({formatCurrency(bestLeaseOption.residualValue)})</Text>
                            </View>
                            <View style={[styles.bestLeaseRow, { borderTopWidth: 1, borderTopColor: '#303744', paddingTop: 6, marginTop: 4 }]}>
                              <Text style={[styles.bestLeaseLabel, { fontSize: 13 }]}>{lang === 'fr' ? 'Avant taxes:' : 'Before tax:'}</Text>
                              <Text style={[styles.bestLeaseValue, { fontSize: 13 }]}>{formatCurrencyDecimal(
                                paymentFrequency === 'monthly' ? bestLeaseOption.monthlyBeforeTax :
                                paymentFrequency === 'biweekly' ? bestLeaseOption.monthlyBeforeTax * 12 / 26 :
                                bestLeaseOption.monthlyBeforeTax * 12 / 52
                              )} / {paymentFrequency === 'monthly' ? (lang === 'fr' ? 'mois' : 'mo') : paymentFrequency === 'biweekly' ? (lang === 'fr' ? '2 sem.' : 'bi-wk') : (lang === 'fr' ? 'sem.' : 'wk')}</Text>
                            </View>
                            <View style={styles.bestLeaseRow}>
                              <Text style={[styles.bestLeaseLabel, { fontSize: 16, fontWeight: '700' }]}>{paymentFrequency === 'monthly' ? (lang === 'fr' ? 'MENSUEL:' : 'MONTHLY:') : paymentFrequency === 'biweekly' ? (lang === 'fr' ? 'AUX 2 SEM.:' : 'BI-WEEKLY:') : (lang === 'fr' ? 'HEBDO:' : 'WEEKLY:')}</Text>
                              <Text style={[styles.bestLeaseValue, { fontSize: 16, fontWeight: '700', color: '#e6c65a' }]}>{formatCurrencyDecimal(
                                paymentFrequency === 'monthly' ? bestLeaseOption.monthly :
                                paymentFrequency === 'biweekly' ? bestLeaseOption.monthly * 12 / 26 :
                                bestLeaseOption.monthly * 12 / 52
                              )} / {paymentFrequency === 'monthly' ? (lang === 'fr' ? 'mois' : 'mo') : paymentFrequency === 'biweekly' ? (lang === 'fr' ? '2 sem.' : 'bi-wk') : (lang === 'fr' ? 'sem.' : 'wk')}</Text>
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
                        <Ionicons name="mail-outline" size={20} color="#f4f1ea" />
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
                          <Ionicons name="chatbubble-outline" size={18} color="#f4f1ea" />
                          <Text style={styles.shareButtonText}>
                            {lang === 'fr' ? 'Texto' : 'SMS'}
                          </Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          style={styles.printButton}
                          onPress={openPrint}
                          data-testid="lease-print-btn"
                        >
                          <Ionicons name="print-outline" size={18} color="#f4f1ea" />
                          <Text style={styles.shareButtonText}>
                            {lang === 'fr' ? 'Imprimer' : 'Print'}
                          </Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          style={styles.exportExcelButton}
                          onPress={handleExportExcel}
                          data-testid="lease-export-excel-btn"
                        >
                          <Ionicons name="document-outline" size={18} color="#f4f1ea" />
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
                placeholderTextColor="#8a93a1"
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
                  <Ionicons name="chatbubble-ellipses" size={32} color="#e6c65a" />
                </View>
                <Text style={styles.smsPreviewTitle}>
                  {lang === 'fr' ? 'Aperçu du message' : 'Message Preview'}
                </Text>
                <TouchableOpacity
                  style={styles.smsPreviewClose}
                  onPress={() => setShowSmsPreview(false)}
                >
                  <Ionicons name="close" size={24} color="#9aa3b1" />
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
                  placeholderTextColor="#8a93a1"
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
                  <Ionicons name="send" size={18} color="#f4f1ea" />
                  <Text style={styles.smsPreviewSendText}>
                    {lang === 'fr' ? 'Envoyer' : 'Send'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Impression dans l'application : le PDF est prêt, un toucher l'envoie à la feuille de partage */}
        <Modal visible={printBusy || !!printReadyFile} transparent animationType="fade" onRequestClose={() => setPrintReadyFile(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
            <View testID="print-share-modal" style={{ backgroundColor: '#1b202a', borderRadius: 12, width: '90%', maxWidth: 420, padding: 20 }}>
              <Text style={{ color: '#f4f1ea', fontSize: 16, fontWeight: '700', marginBottom: 14 }}>
                {printReadyFile
                  ? (lang === 'fr' ? 'La soumission est prête.' : 'The submission is ready.')
                  : (lang === 'fr' ? 'Préparation de la soumission…' : 'Preparing the submission…')}
              </Text>
              {printReadyFile ? (
                <>
                  <TouchableOpacity
                    testID="print-share-go"
                    style={{ backgroundColor: '#e6c65a', borderRadius: 8, paddingVertical: 12, alignItems: 'center' }}
                    onPress={async () => {
                      const file = printReadyFile;
                      try { await (navigator as any).share({ files: [file] }); setPrintReadyFile(null); }
                      catch (e: any) { if (e && e.name === 'AbortError') setPrintReadyFile(null); }
                    }}
                  >
                    <Text style={{ color: '#07090e', fontSize: 15, fontWeight: '700' }}>{lang === 'fr' ? 'Imprimer ou partager le PDF' : 'Print or share the PDF'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ paddingVertical: 12, alignItems: 'center' }} onPress={() => setPrintReadyFile(null)}>
                    <Text style={{ color: '#9aa3b1', fontSize: 14 }}>{lang === 'fr' ? 'Fermer' : 'Close'}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <ActivityIndicator color="#e6c65a" />
              )}
            </View>
          </View>
        </Modal>

        {/* Email Modal */}
        <Modal
          visible={showPrintModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPrintModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
            <View testID="print-client-modal" style={{ backgroundColor: '#1b202a', borderRadius: 12, width: '90%', maxWidth: 420, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#303744' }}>
                <Ionicons name={clientAskFor === 'sms' ? 'chatbubble-ellipses' : 'print'} size={22} color="#e6c65a" style={{ marginRight: 10 }} />
                <Text style={{ fontSize: 17, fontWeight: 'bold', color: '#f4f1ea', flex: 1 }}>
                  {lang === 'fr' ? 'Pour qui est cette soumission ?' : 'Who is this submission for?'}
                </Text>
                <TouchableOpacity onPress={() => setShowPrintModal(false)} style={{ padding: 4 }}>
                  <Ionicons name="close" size={22} color="#9aa3b1" />
                </TouchableOpacity>
              </View>
              <View style={styles.emailModalBody}>
                <Text style={styles.emailModalLabel}>{t.email.clientName}</Text>
                <TextInput testID="print-client-name" style={styles.emailModalInput} placeholder="Ex: Jean Dupont" placeholderTextColor="#8a93a1" value={clientName} onChangeText={setClientName} />
                <Text style={styles.emailModalLabel}>{t.email.clientPhone}</Text>
                <TextInput testID="print-client-phone" style={styles.emailModalInput} placeholder="514-555-1234" placeholderTextColor="#8a93a1" value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" />
                <Text style={styles.emailModalLabel}>{t.email.clientEmail}</Text>
                <TextInput testID="print-client-email" style={styles.emailModalInput} placeholder="client@email.com" placeholderTextColor="#8a93a1" value={clientEmail} onChangeText={setClientEmail} keyboardType="email-address" autoCapitalize="none" />
                {!!printNotice && <Text testID="print-client-notice" style={{ color: '#ff8a80', fontSize: 13, marginTop: 8 }}>{printNotice}</Text>}
                {clientAskFor === 'sms' ? (
                  <TouchableOpacity testID="sms-save-and-send" onPress={smsForClient} style={{ backgroundColor: '#e6c65a', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14, marginBottom: 12 }}>
                    <Text style={{ color: '#1b202a', fontWeight: 'bold', fontSize: 15 }}>{lang === 'fr' ? 'Enregistrer au CRM et préparer le texto' : 'Save to CRM and prepare the text'}</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity testID="print-save-and-print" onPress={() => printForClient(true)} style={{ backgroundColor: '#e6c65a', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 }}>
                      <Text style={{ color: '#1b202a', fontWeight: 'bold', fontSize: 15 }}>{lang === 'fr' ? 'Enregistrer au CRM et imprimer' : 'Save to CRM and print'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID="print-without-saving" onPress={() => printForClient(false)} style={{ paddingVertical: 12, alignItems: 'center' }}>
                      <Text style={{ color: '#9aa3b1', fontSize: 14 }}>{lang === 'fr' ? 'Imprimer sans enregistrer' : 'Print without saving'}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showEmailModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowEmailModal(false)}
        >
          <View style={[styles.modalOverlay, { justifyContent: 'center' }]}>
            <View style={{
              backgroundColor: '#07090e',
              borderRadius: 16,
              width: '90%',
              maxWidth: 420,
              maxHeight: Math.round(Dimensions.get('window').height * 0.6),
              flexDirection: 'column',
              overflow: 'hidden',
            }}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#303744',
              }}>
                <Ionicons name="mail" size={22} color="#e6c65a" style={{ marginRight: 10 }} />
                <Text style={{ fontSize: 17, fontWeight: 'bold', color: '#f4f1ea', flex: 1 }}>
                  {t.email.sendByEmail}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowEmailModal(false)}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close" size={22} color="#9aa3b1" />
                </TouchableOpacity>
              </View>
              
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true} bounces={false}>
              <View style={styles.emailModalBody}>
                <Text style={styles.emailModalLabel}>
                  {t.email.clientName}
                </Text>
                <TextInput
                  style={styles.emailModalInput}
                  placeholder="Ex: Jean Dupont"
                  placeholderTextColor="#8a93a1"
                  value={clientName}
                  onChangeText={setClientName}
                />
                
                <Text style={styles.emailModalLabel}>
                  {t.email.clientPhone} *
                </Text>
                <TextInput
                  style={styles.emailModalInput}
                  placeholder="514-555-1234"
                  placeholderTextColor="#8a93a1"
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
                  placeholderTextColor="#8a93a1"
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
                      <Text style={[styles.emailPreviewText, {color: '#f0d879', marginTop: 6}]}>
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
              </ScrollView>
              
              <View style={{
                flexDirection: 'row',
                paddingHorizontal: 16,
                paddingVertical: 12,
                gap: 10,
                borderTopWidth: 1,
                borderTopColor: '#303744',
              }}>
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
                    // Le nom est requis : sans lui, la fiche du CRM serait anonyme.
                    if (!(clientName || '').trim()) {
                      const message = lang === 'fr'
                        ? 'Le nom du client est requis pour l\'enregistrer au CRM.'
                        : 'The client name is required to save to the CRM.';
                      if (Platform.OS === 'web') {
                        alert(message);
                      } else {
                        Alert.alert(lang === 'fr' ? 'Erreur' : 'Error', message);
                      }
                      return;
                    }
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
                      const [pdfForEmail, listingForEmail] = await Promise.all([
                        buildSubmissionPdf().then((b) => (b ? blobToBase64(b) : '')).catch(() => ''),
                        listingUrlForSelection().catch(() => ''),
                      ]);
                      const response = await fetch(`${API_URL}/api/send-calculation-email`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          submission_pdf_base64: pdfForEmail,
                          listing_url: listingForEmail,
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
                            bonus_cash: programBonus + loyaltyBonus,
                            after_tax_rebates: afterTaxRebates,
                            before_tax_rebates: beforeTaxRebates,
                            alternative_consumer_cash: selectedProgram.alternative_consumer_cash || 0,
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
                            assurance_pare_brise: otherFees(assurancePareBrise, ''),
                            frais_divers: otherFees('', fraisDivers),
                          },
                          trade_in: {
                            valeur_echange: parseFloat(prixEchange) || 0,
                            montant_du: parseFloat(montantDuEchange) || 0,
                          },
                          rates_table: {
                            option1_rates: selectedProgram.option1_rates,
                            option2_rates: selectedProgram.option2_rates,
                          },
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
                              lease_cash: leaseResult.alternative.leaseCash,
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
                          
                          const client = { name: clientName, phone: clientPhone, email: clientEmail };
                          const existingContact: any = findMatchingContact(existingContacts, client);
                          
                          if (existingContact) {
                            // Coordonnées nouvelles seulement ; un vrai nom déjà au CRM n'est pas remplacé.
                            const updateData = contactChanges(existingContact, client);
                            
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
                          // Le CRM garde l'option réellement choisie, pas toujours l'option 1.
                          const two = selectedOption === '2' || !hasOption1;
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
                              payment_monthly: (two ? localResult.option2Monthly : localResult.option1Monthly) || 0,
                              payment_biweekly: (two ? localResult.option2Biweekly : localResult.option1Biweekly) || 0,
                              payment_weekly: (two ? localResult.option2Weekly : localResult.option1Weekly) || 0,
                              selected_option: two ? '2' : '1',
                              rate: (two ? localResult.option2Rate : localResult.option1Rate) || 0,
                              program_month: currentPeriod?.month || 2,
                              program_year: currentPeriod?.year || 2026,
                              calculator_state: {
                                selectedProgram,
                                vehiclePrice,
                                selectedTerm,
                                selectedOption,
                                paymentFrequency,
                                customBonusCash,
                                comptantTxInclus,
                                fraisDossier,
                                taxePneus,
                                fraisRDPRM,
                                assurancePareBrise,
                                fraisDivers,
                                prixEchange,
                                montantDuEchange,
                                accessories,
                                leaseRabaisConcess,
                                leasePdsf,
                                leaseSoldeReporte,
                                leaseTerm,
                                leaseKmPerYear,
                                showLease,
                                manualVin,
                                selectedYear,
                                selectedBrand,
                                checkedOffers,
                                selectedInventory: selectedInventory ? {
                                  id: selectedInventory.id,
                                  vin: selectedInventory.vin,
                                  brand: selectedInventory.brand,
                                  model: selectedInventory.model,
                                  trim: selectedInventory.trim,
                                  year: selectedInventory.year,
                                  body_style: selectedInventory.body_style,
                                  asking_price: selectedInventory.asking_price,
                                  msrp: selectedInventory.msrp,
                                  pdco: selectedInventory.pdco,
                                } : null,
                              },
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
                    <ActivityIndicator size="small" color="#07090e" />
                  ) : (
                    <>
                      <Ionicons name="send" size={18} color="#07090e" />
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

