import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  Modal,
  Linking,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Language, saveLanguage, loadLanguage } from '../../utils/i18n';
import { LanguageSelector } from '../../components/LanguageSelector';
import { useAuth } from '../../contexts/AuthContext';
import { Dossier, dossierFromContact, tradeLabel, desiredLabel, queueDossier, syncDossiers, pairDesired, DossierDesired, Followup, fetchFollowups, completeFollowup, followupCalendarUrl } from '../../utils/etvDossier';

import { API_URL } from '../../utils/api';

interface Submission {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  vehicle_brand: string;
  vehicle_model: string;
  vehicle_year: number;
  vehicle_price: number;
  term: number;
  payment_monthly: number;
  payment_biweekly: number;
  payment_weekly: number;
  selected_option: string;
  rate: number;
  submission_date: string;
  reminder_date: string | null;
  reminder_done: boolean;
  status: string;
  notes: string;
  program_month: number;
  program_year: number;
  calculator_state: any | null;
}

interface Client {
  name: string;
  email: string;
  phone: string;
  submissions: Submission[];
  last_submission_date: string;
  next_reminder: string | null;
  has_pending_reminder: boolean;
  dossier?: Dossier | null;
}

interface ImportedContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  etv_eval_id?: string | null;
  trade?: any;
  desired?: any;
}

interface PaymentByTerm {
  opt1_rate: number;
  opt1_delta: number;
  opt2_rate: number | null;
  opt2_delta: number | null;
}

interface BetterOffer {
  submission_id: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  vehicle: string;
  vehicle_brand: string;
  vehicle_model: string;
  vehicle_year: number;
  vehicle_price: number;
  old_payment: number;
  new_payment: number;
  old_rate: number;
  new_rate: number;
  old_consumer_cash: number;
  new_consumer_cash: number;
  savings_monthly: number;
  savings_total: number;
  term: number;
  old_program: string;
  new_program: string;
  old_selected_option?: string;
  approved: boolean;
  email_sent: boolean;
  calculator_state: any;
  new_program_data: {
    consumer_cash: number;
    bonus_cash: number;
    alt_consumer_cash: number;
    option1_rates: any;
    option2_rates: any;
  };
  payments_by_term?: Record<string, PaymentByTerm>;
}

const crmTranslations = {
  fr: {
    title: 'CRM',
    remindersCount: 'rappel(s) à faire',
    tabs: { clients: 'Clients', reminders: 'Rappels', offers: 'Offres', history: 'Hist.' },
    search: 'Rechercher par nom ou téléphone...',
    add: 'Ajouter',
    import: 'Importer',
    noClients: 'Aucun client',
    noReminders: 'Aucun rappel en attente',
    noSubmissions: 'Aucune soumission enregistrée',
    startByCalculator: 'Commencez par créer une soumission dans le calculateur',
    dueToday: "Aujourd'hui",
    dueTomorrow: 'Demain',
    overdue: 'En retard',
    inDays: 'Dans {n} jours',
    markDone: 'Fait',
    call: 'Appeler',
    edit: 'Modifier',
    delete: 'Supprimer',
    loading: 'Chargement...',
    noData: 'Aucune donnée',
    goToCalculator: 'Aller au calculateur',
    submissions: 'soumissions',
    lastContact: 'Dernier contact',
    vehicle: 'Véhicule',
    payment: 'Paiement',
    months: 'mois',
    newQuote: 'Nouvelle soumission',
    scheduleFollowUp: 'Planifier un suivi',
    followUpDate: 'Date du suivi',
    notes: 'Notes',
    save: 'Sauvegarder',
    cancel: 'Annuler',
    close: 'Fermer',
    // Import modal translations
    importTitle: 'Importer des contacts',
    importDescription: 'Exportez vos contacts depuis iCloud ou Google, puis importez le fichier ici.',
    iCloudOption: 'iCloud (vCard)',
    iCloudDesc: 'Fichier .vcf exporté depuis iCloud',
    googleOption: 'Google (CSV)',
    googleDesc: 'Fichier .csv exporté depuis Google Contacts',
    howToExport: 'Comment exporter?',
    iCloudInstructions: '1. Aller sur icloud.com/contacts\n2. Sélectionner tous les contacts\n3. Exporter en vCard',
    googleInstructions: '1. Aller sur contacts.google.com\n2. Exporter → Format vCard ou CSV',
    importSuccess: 'contacts importés avec succès!',
    importError: 'Erreur lors de l\'import',
    selectFile: 'Sélectionner un fichier',
    contactsImported: 'Contacts importés',
    noContactsFound: 'Aucun contact trouvé dans le fichier',
    // Better offers translations
    noOffers: 'Aucune offre disponible',
    offersDesc: 'Quand de nouveaux programmes arrivent, les clients avec de meilleurs taux apparaîtront ici.',
    checkNewPrograms: 'Vérifier nouveaux programmes',
    checking: 'Vérification...',
    oldPayment: 'Ancien paiement',
    newPayment: 'Nouveau paiement',
    savings: 'Économie',
    perMonth: '/mois',
    total: 'total',
    approve: 'Approuver & Envoyer',
    reject: 'Ignorer',
    approving: 'Envoi...',
    emailSent: 'Email envoyé!',
    offerIgnored: 'Offre ignorée',
    offersFound: 'offre(s) trouvée(s)!',
    noNewOffers: 'Aucune nouvelle offre trouvée',
  },
  en: {
    title: 'CRM',
    remindersCount: 'reminder(s) to do',
    tabs: { clients: 'Clients', reminders: 'Reminders', offers: 'Offers', history: 'Hist.' },
    search: 'Search by name or phone...',
    add: 'Add',
    import: 'Import',
    noClients: 'No clients',
    noReminders: 'No pending reminders',
    noSubmissions: 'No submissions recorded',
    startByCalculator: 'Start by creating a submission in the calculator',
    dueToday: 'Today',
    dueTomorrow: 'Tomorrow',
    overdue: 'Overdue',
    inDays: 'In {n} days',
    markDone: 'Done',
    call: 'Call',
    edit: 'Edit',
    delete: 'Delete',
    loading: 'Loading...',
    noData: 'No data',
    goToCalculator: 'Go to calculator',
    submissions: 'submissions',
    lastContact: 'Last contact',
    vehicle: 'Vehicle',
    payment: 'Payment',
    months: 'months',
    newQuote: 'New submission',
    scheduleFollowUp: 'Schedule follow-up',
    followUpDate: 'Follow-up date',
    notes: 'Notes',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    // Import modal translations
    importTitle: 'Import contacts',
    importDescription: 'Export your contacts from iCloud or Google, then import the file here.',
    iCloudOption: 'iCloud (vCard)',
    iCloudDesc: '.vcf file exported from iCloud',
    googleOption: 'Google (CSV)',
    googleDesc: '.csv file exported from Google Contacts',
    howToExport: 'How to export?',
    iCloudInstructions: '1. Go to icloud.com/contacts\n2. Select all contacts\n3. Export as vCard',
    googleInstructions: '1. Go to contacts.google.com\n2. Export → vCard or CSV format',
    importSuccess: 'contacts imported successfully!',
    importError: 'Error importing contacts',
    selectFile: 'Select a file',
    contactsImported: 'Contacts imported',
    noContactsFound: 'No contacts found in file',
    // Better offers translations
    noOffers: 'No offers available',
    offersDesc: 'When new programs arrive, clients with better rates will appear here.',
    checkNewPrograms: 'Check new programs',
    checking: 'Checking...',
    oldPayment: 'Old payment',
    newPayment: 'New payment',
    savings: 'Savings',
    perMonth: '/month',
    total: 'total',
    approve: 'Approve & Send',
    reject: 'Ignore',
    approving: 'Sending...',
    emailSent: 'Email sent!',
    offerIgnored: 'Offer ignored',
    offersFound: 'offer(s) found!',
    noNewOffers: 'No new offers found',
  }
};

type TabType = 'clients' | 'reminders' | 'offers' | 'history';

export default function ClientsScreen() {
  const router = useRouter();
  const { getToken, user, linkEtvAccount } = useAuth();
  // Compte provisoire créé par l'entrée eTradeValue : on propose de le relier au compte existant.
  const canLinkAccount = !!user?.etv_username && !!user?.email?.endsWith('.etradevalue');
  // Relances d'évaluation (2, 7 et 15 jours) et leur calendrier
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [calendarUrl, setCalendarUrl] = useState('');
  const openFollowup = async (followup: Followup) => {
    const dossier = dossierFromContact(followup);
    if (!dossier) return;
    await queueDossier(dossier);
    router.push('/(tabs)');
  };
  const finishFollowup = async (followup: Followup) => {
    const headers = await getAuthHeaders();
    if (await completeFollowup(headers as Record<string, string>, followup)) {
      setFollowups(prev => prev.filter(f => !(f.etv_eval_id === followup.etv_eval_id && f.day === followup.day)));
    }
  };
  const subscribeCalendar = async () => {
    const headers = await getAuthHeaders();
    const url = await followupCalendarUrl(headers as Record<string, string>);
    if (!url) return;
    setCalendarUrl(url);
    // « webcal » fait proposer l'abonnement par le calendrier du téléphone ou de l'ordinateur.
    Linking.openURL(url.replace(/^https?:/, 'webcal:')).catch(() => {});
  };
  // Import de contacts : on choisit lesquels garder avant d'enregistrer
  const [importSelection, setImportSelection] = useState<Set<number>>(new Set());
  const [savingImport, setSavingImport] = useState(false);
  const toggleImported = (index: number) => setImportSelection(prev => {
    const next = new Set(prev);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState('');
  const submitLink = async () => {
    if (!linkEmail || !linkPassword || linkBusy) return;
    setLinkBusy(true);
    setLinkError('');
    const result = await linkEtvAccount(linkEmail, linkPassword);
    setLinkBusy(false);
    setLinkPassword('');
    if (!result.success) { setLinkError(result.error || 'Le lien a échoué.'); return; }
    await loadData();
  };
  const [lang, setLang] = useState<Language>('fr');
  const crm = crmTranslations[lang];
  
  const [activeTab, setActiveTab] = useState<TabType>('clients');
  const [clients, setClients] = useState<Client[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  // Filtre « contacts d'évaluation » et jumelage d'un véhicule convoité
  const [evalOnly, setEvalOnly] = useState(false);
  const [pairClient, setPairClient] = useState<Client | null>(null);
  const [pairVehicles, setPairVehicles] = useState<any[]>([]);
  const [pairSearch, setPairSearch] = useState('');
  const [pairBusy, setPairBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Reminders
  const [reminders, setReminders] = useState<Submission[]>([]);
  const [remindersCount, setRemindersCount] = useState(0);
  
  // Better offers
  const [betterOffers, setBetterOffers] = useState<BetterOffer[]>([]);
  const [checkingOffers, setCheckingOffers] = useState(false);
  const [approvingOffer, setApprovingOffer] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<BetterOffer | null>(null);
  
  // Import contacts modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importedContacts, setImportedContacts] = useState<ImportedContact[]>([]);
  const [showImportedContactsModal, setShowImportedContactsModal] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  
  // Client details modal
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientModal, setShowClientModal] = useState(false);
  
  // Follow-up modal
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  // Add contact manually
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  const handleCreateContact = async () => {
    if (!newContactName.trim()) return;
    setSavingContact(true);
    try {
      const headers = await getAuthHeaders();
      await axios.post(`${API_URL}/api/contacts`, {
        name: newContactName.trim(),
        phone: newContactPhone.trim(),
        email: newContactEmail.trim(),
        source: 'manual'
      }, { headers });
      setShowAddContactModal(false);
      setNewContactName('');
      setNewContactPhone('');
      setNewContactEmail('');
      loadData();
    } catch (e) {
      console.error('Error creating contact:', e);
    } finally {
      setSavingContact(false);
    }
  };

  // Ouvre le choix du véhicule à jumeler à ce contact d'évaluation
  const openPairing = async (client: Client) => {
    setPairClient(client);
    setPairSearch('');
    if (pairVehicles.length) return;
    try {
      const response = await axios.get(`${API_URL}/api/inventory`, { headers: await getAuthHeaders() });
      setPairVehicles((response.data || []).filter((v: any) => v.status === 'disponible'));
    } catch {
      setPairVehicles([]);
    }
  };

  const savePairing = async (vehicle: DossierDesired | null) => {
    const client = pairClient;
    if (!client?.dossier || pairBusy) return;
    setPairBusy(true);
    const saved = await pairDesired(await getAuthHeaders() as Record<string, string>, client.dossier.evalId, vehicle);
    setPairBusy(false);
    if (!saved) {
      const message = lang === 'fr' ? "Le jumelage n'a pas été enregistré. Réessayez." : 'The match was not saved. Try again.';
      Platform.OS === 'web' ? alert(message) : Alert.alert('Erreur', message);
      return;
    }
    const evalId = client.dossier.evalId;
    setClients(prev => prev.map(c => c.dossier?.evalId === evalId
      ? { ...c, dossier: { ...c.dossier, desired: saved.desired, paired: saved.paired } } : c));
    setPairClient(null);
  };

  const pairChoices = useMemo(() => {
    const words = pairSearch.toLowerCase().split(/\s+/).filter(Boolean);
    return pairVehicles.filter((v: any) => {
      const text = `${v.stock_no} ${v.year} ${v.brand} ${v.model} ${v.trim || ''}`.toLowerCase();
      return words.every(w => text.includes(w));
    }).slice(0, 60);
  }, [pairVehicles, pairSearch]);

  // Helper function to get auth headers
  const getAuthHeaders = async () => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => { loadLanguage().then(setLang); }, []);
  const handleLanguageChange = useCallback((newLang: Language) => { setLang(newLang); saveLanguage(newLang); }, []);

  const loadData = async () => {
    try {
      const headers = await getAuthHeaders();
      
      // Load submissions
      const response = await axios.get(`${API_URL}/api/submissions`, { headers });
      const allSubmissions: Submission[] = response.data;
      setSubmissions(allSubmissions);
      
      // Load better offers
      try {
        const offersResponse = await axios.get(`${API_URL}/api/better-offers`, { headers });
        setBetterOffers(offersResponse.data);
      } catch (err) {
        console.log('Could not load better offers:', err);
      }
      
      // Compte relié à eTradeValue : on recopie d'abord ses évaluations en contacts
      if (user?.etv_username) {
        await syncDossiers(headers as Record<string, string>);
        setFollowups(await fetchFollowups(headers as Record<string, string>));
      }

      // Load saved contacts from database
      let savedContacts: ImportedContact[] = [];
      try {
        const contactsResponse = await axios.get(`${API_URL}/api/contacts`, { headers });
        savedContacts = contactsResponse.data;
        console.log(`Loaded ${savedContacts.length} saved contacts`);
      } catch (contactErr) {
        console.log('Could not load saved contacts:', contactErr);
      }
      
      // Build clients from submissions
      const clientsMap = new Map<string, Submission[]>();
      for (const sub of allSubmissions) {
        const key = sub.client_phone || sub.client_email || sub.client_name;
        if (!clientsMap.has(key)) clientsMap.set(key, []);
        clientsMap.get(key)!.push(sub);
      }
      
      const clientsArray: Client[] = [];
      
      // Add clients from submissions
      clientsMap.forEach((subs) => {
        const sortedSubs = subs.sort((a, b) => new Date(b.submission_date).getTime() - new Date(a.submission_date).getTime());
        const latestSub = sortedSubs[0];
        const pendingReminders = subs.filter(s => s.reminder_date && !s.reminder_done);
        const nextReminder = pendingReminders.length > 0 
          ? pendingReminders.sort((a, b) => new Date(a.reminder_date!).getTime() - new Date(b.reminder_date!).getTime())[0].reminder_date 
          : null;
        clientsArray.push({
          name: latestSub.client_name,
          email: latestSub.client_email,
          phone: latestSub.client_phone,
          submissions: sortedSubs,
          last_submission_date: latestSub.submission_date,
          next_reminder: nextReminder,
          has_pending_reminder: pendingReminders.length > 0
        });
      });
      
      // Add imported contacts that are not already in clients list
      const existingKeys = new Set(clientsArray.map(c => (c.phone || c.email || c.name).toLowerCase()));
      for (const contact of savedContacts) {
        const key = (contact.phone || contact.email || contact.name).toLowerCase();
        const dossier = dossierFromContact(contact);
        if (dossier && existingKeys.has(key)) {
          // Client déjà connu par ses soumissions : on lui rattache son dossier d'évaluation
          const known = clientsArray.find(c => (c.phone || c.email || c.name).toLowerCase() === key);
          if (known && !known.dossier) known.dossier = dossier;
        }
        if (!existingKeys.has(key)) {
          clientsArray.push({
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            submissions: [],
            last_submission_date: contact.created_at || new Date().toISOString(),
            next_reminder: null,
            has_pending_reminder: false,
            dossier,
          });
          existingKeys.add(key);
        }
      }
      
      clientsArray.sort((a, b) => a.name.localeCompare(b.name));
      setClients(clientsArray);
      setFilteredClients(clientsArray);
      
      // Get pending reminders
      const pendingReminders = allSubmissions.filter(s => s.reminder_date && !s.reminder_done);
      setReminders(pendingReminders.sort((a, b) => new Date(a.reminder_date!).getTime() - new Date(b.reminder_date!).getTime()));
      setRemindersCount(pendingReminders.length);
      
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);
  
  useEffect(() => {
    const pool = evalOnly ? clients.filter(c => !!c.dossier) : clients;
    if (!searchQuery.trim()) {
      setFilteredClients(pool);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredClients(pool.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.phone?.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query)
      ));
    }
  }, [searchQuery, clients, evalOnly]);

  const onRefresh = () => { setRefreshing(true); loadData(); };
  
  const getDaysUntil = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    return Math.ceil((date.getTime() - today.getTime()) / 86400000);
  };
  
  const getDueDateText = (days: number) => {
    if (days < 0) return crm.overdue;
    if (days === 0) return crm.dueToday;
    if (days === 1) return crm.dueTomorrow;
    return crm.inDays.replace('{n}', String(days));
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short', year: 'numeric' });
  const formatCurrency = (amount: number) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(amount);
  
  const callContact = (phone: string) => Linking.openURL(`tel:${phone}`);
  const emailContact = (email: string) => Linking.openURL(`mailto:${email}`);

  // ============================================
  // PARSE vCard FILE
  // ============================================
  const parseVCard = (content: string): ImportedContact[] => {
    const contacts: ImportedContact[] = [];
    const vcards = content.split('END:VCARD');
    
    for (const vcard of vcards) {
      if (!vcard.includes('BEGIN:VCARD')) continue;
      
      let name = '';
      let phone = '';
      let email = '';
      
      const lines = vcard.split(/\r?\n/);
      for (const line of lines) {
        // Parse name (FN = Full Name)
        if (line.startsWith('FN:') || line.startsWith('FN;')) {
          name = line.split(':').slice(1).join(':').trim();
        }
        // Parse phone
        if (line.startsWith('TEL') || line.includes('TEL;') || line.includes('TEL:')) {
          const phoneMatch = line.match(/:([\d\s\-\+\(\)]+)/);
          if (phoneMatch) {
            phone = phoneMatch[1].trim();
          }
        }
        // Parse email
        if (line.startsWith('EMAIL') || line.includes('EMAIL;') || line.includes('EMAIL:')) {
          const emailMatch = line.match(/:(.+@.+)/);
          if (emailMatch) {
            email = emailMatch[1].trim();
          }
        }
      }
      
      if (name) {
        contacts.push({
          id: `import_${Date.now()}_${contacts.length}`,
          name,
          phone,
          email,
        });
      }
    }
    
    return contacts;
  };

  // ============================================
  // PARSE CSV FILE
  // ============================================
  const parseCSV = (content: string): ImportedContact[] => {
    const contacts: ImportedContact[] = [];
    const lines = content.split(/\r?\n/);
    
    if (lines.length < 2) return contacts;
    
    // Parse header to find column indices
    const header = lines[0].toLowerCase();
    const headers = header.split(',').map(h => h.trim().replace(/"/g, ''));
    
    const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('nom'));
    const firstNameIdx = headers.findIndex(h => h.includes('first') || h.includes('prénom') || h.includes('prenom'));
    const lastNameIdx = headers.findIndex(h => h.includes('last') || h.includes('family') || h.includes('nom de famille'));
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('téléphone') || h.includes('telephone') || h.includes('mobile'));
    const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('mail') || h.includes('courriel'));
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      // Simple CSV parsing (doesn't handle all edge cases but works for most exports)
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      
      let name = '';
      if (nameIdx >= 0 && values[nameIdx]) {
        name = values[nameIdx];
      } else if (firstNameIdx >= 0 || lastNameIdx >= 0) {
        const firstName = firstNameIdx >= 0 ? values[firstNameIdx] || '' : '';
        const lastName = lastNameIdx >= 0 ? values[lastNameIdx] || '' : '';
        name = `${firstName} ${lastName}`.trim();
      }
      
      const phone = phoneIdx >= 0 ? values[phoneIdx] || '' : '';
      const email = emailIdx >= 0 ? values[emailIdx] || '' : '';
      
      if (name) {
        contacts.push({
          id: `import_${Date.now()}_${contacts.length}`,
          name,
          phone,
          email,
        });
      }
    }
    
    return contacts;
  };

  // ============================================
  // IMPORT FILE (vCard or CSV)
  // ============================================
  const importFile = async (type: 'vcard' | 'csv') => {
    setImportingFile(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: type === 'vcard' ? ['text/vcard', 'text/x-vcard', '*/*'] : ['text/csv', 'text/comma-separated-values', '*/*'],
        copyToCacheDirectory: true,
      });
      
      if (result.canceled || !result.assets || result.assets.length === 0) {
        setImportingFile(false);
        return;
      }
      
      const file = result.assets[0];
      console.log('Selected file:', file.name, file.uri);
      
      // Read file content
      let content = '';
      if (Platform.OS === 'web') {
        // For web, fetch the file
        const response = await fetch(file.uri);
        content = await response.text();
      } else {
        // For native, use FileSystem
        const FileSystem = require('expo-file-system');
        content = await FileSystem.readAsStringAsync(file.uri);
      }
      
      // Parse based on file type
      let contacts: ImportedContact[] = [];
      if (type === 'vcard' || file.name?.toLowerCase().endsWith('.vcf')) {
        contacts = parseVCard(content);
      } else {
        contacts = parseCSV(content);
      }
      
      console.log(`Parsed ${contacts.length} contacts`);
      
      if (contacts.length === 0) {
        Platform.OS === 'web' 
          ? alert(crm.noContactsFound)
          : Alert.alert('Info', crm.noContactsFound);
        setImportingFile(false);
        return;
      }
      
      // On montre d'abord la liste : la personne choisit lesquels importer (tous cochés au départ).
      setImportSelection(new Set(contacts.map((_, index) => index)));
      setImportedContacts(contacts);
      setShowImportModal(false);
      setShowImportedContactsModal(true);
    } catch (err) {
      console.error('Error importing file:', err);
      Platform.OS === 'web'
        ? alert(crm.importError)
        : Alert.alert('Erreur', crm.importError);
    } finally {
      setImportingFile(false);
    }
  };

  // Enregistre seulement les contacts cochés
  const saveSelectedContacts = async () => {
    const contacts = importedContacts.filter((_, index) => importSelection.has(index));
    if (contacts.length === 0 || savingImport) return;
    setSavingImport(true);
    try {
      try {
        const headers = await getAuthHeaders();
        const contactsToSave = contacts.map(c => ({
          name: c.name,
          phone: c.phone,
          email: c.email,
          source: 'import'
        }));
        
        const saveResponse = await axios.post(`${API_URL}/api/contacts/bulk`, {
          contacts: contactsToSave
        }, { headers });
        
        console.log('Save response:', saveResponse.data);
        
        const { imported, skipped } = saveResponse.data;
        
        Platform.OS === 'web'
          ? alert(`✅ ${imported} ${crm.importSuccess}${skipped > 0 ? ` (${skipped} doublons ignorés)` : ''}`)
          : Alert.alert('✅', `${imported} ${crm.importSuccess}${skipped > 0 ? `\n(${skipped} doublons ignorés)` : ''}`);
        
      } catch (saveErr) {
        console.error('Error saving contacts:', saveErr);
        Platform.OS === 'web' ? alert(crm.importError) : Alert.alert('Erreur', crm.importError);
        return;
      }
      setShowImportedContactsModal(false);
      await loadData();
    } finally {
      setSavingImport(false);
    }
  };

  // Select imported contact and go to calculator
  const selectImportedContact = (contact: ImportedContact) => {
    setShowImportedContactsModal(false);
    router.push({
      pathname: '/(tabs)',
      params: {
        clientName: contact.name,
        clientEmail: contact.email,
        clientPhone: contact.phone,
      },
    });
  };

  // ============================================
  // OTHER ACTIONS
  // ============================================
  
  const markReminderDone = async (submissionId: string) => {
    try {
      const headers = await getAuthHeaders();
      await axios.put(`${API_URL}/api/submissions/${submissionId}/done`, {}, { headers });
      await loadData();
      Platform.OS === 'web' ? alert('✅ Rappel complété!') : Alert.alert('✅', 'Rappel complété!');
    } catch (err) {
      console.error('Error marking done:', err);
    }
  };

  const deleteReminder = async (submissionId: string) => {
    const confirmDelete = () => {
      return new Promise((resolve) => {
        if (Platform.OS === 'web') {
          resolve(window.confirm('Supprimer ce rappel?'));
        } else {
          Alert.alert(
            'Confirmer',
            'Supprimer ce rappel?',
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) }
            ]
          );
        }
      });
    };

    const confirmed = await confirmDelete();
    if (!confirmed) return;

    try {
      const headers = await getAuthHeaders();
      await axios.delete(`${API_URL}/api/submissions/${submissionId}/reminder`, { headers });
      await loadData();
      Platform.OS === 'web' ? alert('✅ Rappel supprimé!') : Alert.alert('✅', 'Rappel supprimé!');
    } catch (err) {
      console.error('Error deleting reminder:', err);
    }
  };

  const deleteSubmission = async (submissionId: string) => {
    const confirmDelete = () => {
      return new Promise((resolve) => {
        if (Platform.OS === 'web') {
          resolve(window.confirm('Supprimer cette soumission? Cette action est irréversible.'));
        } else {
          Alert.alert(
            'Confirmer',
            'Supprimer cette soumission? Cette action est irréversible.',
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) }
            ]
          );
        }
      });
    };

    const confirmed = await confirmDelete();
    if (!confirmed) return;

    try {
      const headers = await getAuthHeaders();
      await axios.delete(`${API_URL}/api/submissions/${submissionId}`, { headers });
      await loadData();
      Platform.OS === 'web' ? alert('✅ Soumission supprimée!') : Alert.alert('✅', 'Soumission supprimée!');
    } catch (err) {
      console.error('Error deleting submission:', err);
    }
  };

  const deleteContactHistory = async (contactId: string) => {
    const confirmDelete = () => {
      return new Promise((resolve) => {
        if (Platform.OS === 'web') {
          resolve(window.confirm('Supprimer tout l\'historique de ce contact? Cette action est irréversible.'));
        } else {
          Alert.alert(
            'Confirmer',
            'Supprimer tout l\'historique de ce contact? Cette action est irréversible.',
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Supprimer tout', style: 'destructive', onPress: () => resolve(true) }
            ]
          );
        }
      });
    };

    const confirmed = await confirmDelete();
    if (!confirmed) return;

    try {
      const headers = await getAuthHeaders();
      await axios.delete(`${API_URL}/api/contacts/${contactId}/history`, { headers });
      await loadData();
      Platform.OS === 'web' ? alert('✅ Historique supprimé!') : Alert.alert('✅', 'Historique supprimé!');
    } catch (err) {
      console.error('Error deleting history:', err);
    }
  };

  const deleteBetterOffer = async (submissionId: string) => {
    try {
      const headers = await getAuthHeaders();
      await axios.delete(`${API_URL}/api/better-offers/${submissionId}`, { headers });
      await loadData();
    } catch (err) {
      console.error('Error deleting offer:', err);
    }
  };

  const openClientDetails = (client: Client) => {
    setSelectedClient(client);
    setShowClientModal(true);
  };

  const openFollowUpModal = (submission: Submission) => {
    setSelectedSubmission(submission);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setFollowUpDate(tomorrow.toISOString().split('T')[0]);
    setFollowUpNotes(submission.notes || '');
    setShowFollowUpModal(true);
  };

  const saveFollowUp = async () => {
    if (!selectedSubmission || !followUpDate) return;
    setSavingFollowUp(true);
    try {
      const headers = await getAuthHeaders();
      await axios.put(`${API_URL}/api/submissions/${selectedSubmission.id}/reminder`, {
        reminder_date: new Date(followUpDate).toISOString(),
        notes: followUpNotes
      }, { headers });
      await loadData();
      setShowFollowUpModal(false);
      Platform.OS === 'web' ? alert('✅ Suivi planifié!') : Alert.alert('✅', 'Suivi planifié!');
    } catch (err) {
      Platform.OS === 'web' ? alert('❌ Erreur') : Alert.alert('Erreur');
    } finally {
      setSavingFollowUp(false);
    }
  };

  const newQuoteForClient = (client: Client) => {
    setShowClientModal(false);
    router.push({
      pathname: '/(tabs)',
      params: {
        clientName: client.name,
        clientEmail: client.email,
        clientPhone: client.phone,
      },
    });
  };

  // Check for better offers (compare new programs with past submissions)
  const checkForBetterOffers = async () => {
    setCheckingOffers(true);
    try {
      const headers = await getAuthHeaders();
      const response = await axios.post(`${API_URL}/api/compare-programs`, {}, { headers });
      const { better_offers, count } = response.data;
      setBetterOffers(better_offers || []);
      
      if (count > 0) {
        Platform.OS === 'web'
          ? alert(`✅ ${count} ${crm.offersFound}`)
          : Alert.alert('✅', `${count} ${crm.offersFound}`);
      } else {
        Platform.OS === 'web'
          ? alert(crm.noNewOffers)
          : Alert.alert('Info', crm.noNewOffers);
      }
    } catch (err) {
      console.error('Error checking offers:', err);
    } finally {
      setCheckingOffers(false);
    }
  };

  // Approve and send better offer email to client
  const approveOffer = async (submissionId: string) => {
    setApprovingOffer(submissionId);
    try {
      const headers = await getAuthHeaders();
      await axios.post(`${API_URL}/api/better-offers/${submissionId}/approve`, {}, { headers });
      
      // Reload offers
      const offersResponse = await axios.get(`${API_URL}/api/better-offers`, { headers });
      setBetterOffers(offersResponse.data);
      
      Platform.OS === 'web'
        ? alert(`✅ ${crm.emailSent}`)
        : Alert.alert('✅', crm.emailSent);
    } catch (err) {
      console.error('Error approving offer:', err);
      Platform.OS === 'web'
        ? alert('❌ Erreur')
        : Alert.alert('Erreur', "Impossible d'envoyer l'email");
    } finally {
      setApprovingOffer(null);
    }
  };

  // Ignore/reject better offer
  const ignoreOffer = async (submissionId: string) => {
    try {
      const headers = await getAuthHeaders();
      await axios.post(`${API_URL}/api/better-offers/${submissionId}/ignore`, {}, { headers });
      
      // Remove from local state
      setBetterOffers(prev => prev.filter(o => o.submission_id !== submissionId));
      
      Platform.OS === 'web'
        ? alert(crm.offerIgnored)
        : Alert.alert('Info', crm.offerIgnored);
    } catch (err) {
      console.error('Error ignoring offer:', err);
    }
  };

  // Delete contact from database
  const deleteContact = async (client: Client) => {
    const confirmDelete = Platform.OS === 'web'
      ? window.confirm(`Supprimer ${client.name}?`)
      : await new Promise<boolean>(resolve => 
          Alert.alert(
            'Supprimer le contact',
            `Êtes-vous sûr de vouloir supprimer ${client.name}?`,
            [
              { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) }
            ]
          )
        );
    
    if (!confirmDelete) return;
    
    try {
      const headers = await getAuthHeaders();
      // Find contact by phone or email to delete from contacts collection
      const contactKey = client.phone || client.email || client.name;
      
      // Try to delete from contacts collection
      const contactsResponse = await axios.get(`${API_URL}/api/contacts`, { headers });
      const contacts = contactsResponse.data;
      const contactToDelete = contacts.find((c: any) => 
        c.phone === client.phone || c.email === client.email || c.name === client.name
      );
      
      if (contactToDelete) {
        await axios.delete(`${API_URL}/api/contacts/${contactToDelete.id}`, { headers });
      }
      
      // Reload data to refresh the list
      await loadData();
      
      Platform.OS === 'web' 
        ? alert('✅ Contact supprimé!')
        : Alert.alert('✅', 'Contact supprimé!');
    } catch (err) {
      console.error('Error deleting contact:', err);
      Platform.OS === 'web'
        ? alert('❌ Erreur lors de la suppression')
        : Alert.alert('Erreur', 'Impossible de supprimer le contact');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e6c65a" />
          <Text style={styles.loadingText}>{crm.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ============================================
  // TAB CONTENT RENDERERS
  // ============================================
  
  const renderClientsTab = () => (
    <ScrollView 
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e6c65a" />}
    >
      {filteredClients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color="#e6c65a" />
          <Text style={styles.emptyText}>{crm.noClients}</Text>
          <Text style={styles.emptySubtext}>{crm.startByCalculator}</Text>
          <TouchableOpacity style={styles.goToCalcButton} onPress={() => router.push('/(tabs)')}>
            <Text style={styles.goToCalcText}>{crm.goToCalculator}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        filteredClients.map((client, index) => (
          <TouchableOpacity key={index} style={styles.clientCard} onPress={() => openClientDetails(client)}>
            <View style={styles.clientRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{client.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>{client.name.toUpperCase()}</Text>
                {client.phone && <Text style={styles.clientPhone}>{client.phone}</Text>}
                {client.email && <Text style={styles.clientEmail}>{client.email}</Text>}
              </View>
              <View style={styles.clientActions}>
                {client.phone && (
                  <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); callContact(client.phone); }}>
                    <Ionicons name="call" size={18} color="#e6c65a" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.actionBtn} onPress={(e) => { e.stopPropagation(); newQuoteForClient(client); }}>
                  <Ionicons name="add-circle" size={18} color="#e6c65a" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtnDelete} onPress={(e) => { e.stopPropagation(); deleteContact(client); }}>
                  <Ionicons name="trash" size={18} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            </View>
            {client.dossier && (
              <View style={styles.dossierBox} data-testid="client-dossier">
                <View>
                  <Text style={styles.dossierTag}>{lang === 'fr' ? 'Évaluation eTradeValue' : 'eTradeValue appraisal'}</Text>
                  {!!client.dossier.advisor && user?.etv_role !== 'conseiller' && (
                    <Text style={styles.dossierLine} data-testid="client-dossier-advisor">
                      {lang === 'fr' ? 'Conseiller : ' : 'Advisor: '}{client.dossier.advisor}
                    </Text>
                  )}
                  {!!tradeLabel(client.dossier) && (
                    <Text style={styles.dossierLine}>
                      {lang === 'fr' ? 'Reprise : ' : 'Trade-in: '}{tradeLabel(client.dossier)}
                    </Text>
                  )}
                  {!!desiredLabel(client.dossier) && (
                    <Text style={styles.dossierLine} data-testid="client-dossier-desired">
                      {lang === 'fr' ? 'Convoité : ' : 'Wants: '}{desiredLabel(client.dossier)}
                      {client.dossier.paired ? (lang === 'fr' ? ' (jumelé)' : ' (matched)') : ''}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.importPickBtn}
                  onPress={(e) => { e.stopPropagation(); openPairing(client); }}
                  data-testid="client-dossier-pair"
                >
                  <Text style={styles.importPickText}>
                    {client.dossier.desired.length ? (lang === 'fr' ? 'Changer le véhicule' : 'Change vehicle') : (lang === 'fr' ? 'Jumeler un véhicule' : 'Match a vehicle')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dossierBtn}
                  onPress={async (e) => { e.stopPropagation(); await queueDossier(client.dossier!); router.push('/(tabs)'); }}
                  data-testid="client-dossier-open"
                >
                  <Ionicons name="calculator" size={16} color="#11130f" />
                  <Text style={styles.dossierBtnText}>{lang === 'fr' ? 'Calculer' : 'Calculate'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {client.has_pending_reminder && (
              <View style={styles.clientReminderBadge}>
                <Ionicons name="notifications" size={12} color="#f0d879" />
                <Text style={styles.clientReminderText}>Rappel: {formatDate(client.next_reminder!)}</Text>
              </View>
            )}
            <Text style={styles.clientSubmissions}>{client.submissions.length} {crm.submissions}</Text>
          </TouchableOpacity>
        ))
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderRemindersTab = () => (
    <ScrollView 
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e6c65a" />}
    >
      {!!user?.etv_username && (
        <View style={styles.linkBox} data-testid="etv-followups">
          <Text style={styles.dossierTag}>{lang === 'fr' ? 'Relances d\'évaluation (2, 7 et 15 jours)' : 'Appraisal follow-ups (2, 7 and 15 days)'}</Text>
          {followups.length === 0 && (
            <Text style={styles.dossierLine}>{lang === 'fr' ? 'Aucune relance à faire pour l\'instant.' : 'No follow-up due right now.'}</Text>
          )}
          {followups.map((followup) => (
            <View key={`${followup.etv_eval_id}-${followup.day}`} style={styles.followupRow}>
              <Text style={[styles.followupName, followup.overdue && { color: '#f0d879' }]}>
                {followup.name} · {lang === 'fr' ? 'jour' : 'day'} {followup.day} · {formatDate(followup.due)}
              </Text>
              {!!dossierFromContact(followup) && !!tradeLabel(dossierFromContact(followup)!) && (
                <Text style={styles.dossierLine}>{lang === 'fr' ? 'Reprise : ' : 'Trade-in: '}{tradeLabel(dossierFromContact(followup)!)}</Text>
              )}
              <View style={styles.importPickRow}>
                {!!followup.phone && (
                  <TouchableOpacity style={styles.importPickBtn} onPress={() => callContact(followup.phone!)}>
                    <Text style={styles.importPickText}>{lang === 'fr' ? 'Appeler' : 'Call'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.importPickBtn} onPress={() => openFollowup(followup)} data-testid="followup-open">
                  <Text style={styles.importPickText}>{lang === 'fr' ? 'Calculer' : 'Calculate'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.importPickBtn} onPress={() => finishFollowup(followup)} data-testid="followup-done">
                  <Text style={styles.importPickText}>{lang === 'fr' ? 'Fait' : 'Done'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.dossierBtn} onPress={subscribeCalendar} data-testid="followup-calendar">
            <Ionicons name="calendar" size={16} color="#11130f" />
            <Text style={styles.dossierBtnText}>{lang === 'fr' ? 'Ajouter à mon calendrier' : 'Add to my calendar'}</Text>
          </TouchableOpacity>
          {!!calendarUrl && (
            <Text style={styles.dossierLine} selectable>
              {lang === 'fr' ? 'Adresse privée à abonner dans votre calendrier : ' : 'Private address to subscribe in your calendar: '}{calendarUrl}
            </Text>
          )}
        </View>
      )}
      {reminders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-off-outline" size={64} color="#9aa3b1" />
          <Text style={styles.emptyText}>{crm.noReminders}</Text>
        </View>
      ) : (
        reminders.map((reminder, index) => {
          const days = getDaysUntil(reminder.reminder_date!);
          return (
            <View key={index} style={[styles.reminderCard, days < 0 && styles.reminderOverdue, days === 0 && styles.reminderToday]}>
              <View style={styles.reminderHeader}>
                <Text style={styles.reminderClient}>{reminder.client_name}</Text>
                <Text style={[styles.reminderDue, days < 0 && styles.reminderDueOverdue]}>
                  {getDueDateText(days)}
                </Text>
              </View>
              <Text style={styles.reminderVehicle}>
                {reminder.vehicle_brand} {reminder.vehicle_model} {reminder.vehicle_year}
              </Text>
              <Text style={styles.reminderPayment}>
                {formatCurrency(reminder.payment_monthly)}/{crm.months} • {reminder.term} {crm.months}
              </Text>
              {reminder.notes && <Text style={styles.reminderNotes}>{reminder.notes}</Text>}
              <View style={styles.reminderActions}>
                {reminder.client_phone && (
                  <TouchableOpacity style={styles.reminderBtn} onPress={() => callContact(reminder.client_phone)}>
                    <Ionicons name="call" size={16} color="#e6c65a" />
                    <Text style={styles.reminderBtnText}>{crm.call}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.reminderBtn, styles.reminderBtnDone]} onPress={() => markReminderDone(reminder.id)}>
                  <Ionicons name="checkmark" size={16} color="#07090e" />
                  <Text style={styles.reminderBtnTextDone}>{crm.markDone}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.reminderBtn, styles.reminderBtnDelete]} onPress={() => deleteReminder(reminder.id)}>
                  <Ionicons name="trash" size={16} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderOffersTab = () => (
    <ScrollView 
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e6c65a" />}
    >
      {/* Button to check for new offers */}
      <TouchableOpacity 
        style={styles.checkOffersButton}
        onPress={checkForBetterOffers}
        disabled={checkingOffers}
      >
        {checkingOffers ? (
          <ActivityIndicator size="small" color="#07090e" />
        ) : (
          <>
            <Ionicons name="refresh" size={20} color="#07090e" />
            <Text style={styles.checkOffersButtonText}>{crm.checkNewPrograms}</Text>
          </>
        )}
      </TouchableOpacity>

      {betterOffers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="pricetag-outline" size={64} color="#9aa3b1" />
          <Text style={styles.emptyText}>{crm.noOffers}</Text>
          <Text style={styles.emptySubtext}>{crm.offersDesc}</Text>
        </View>
      ) : (
        betterOffers.map((offer, index) => (
          <TouchableOpacity key={index} style={styles.offerCard} onPress={() => setSelectedOffer(offer)} activeOpacity={0.7}>
            <View style={styles.offerHeader}>
              <Text style={styles.offerClient}>{offer.client_name}</Text>
              {offer.email_sent && (
                <View style={styles.emailSentBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#e6c65a" />
                  <Text style={styles.emailSentText}>Envoyé</Text>
                </View>
              )}
            </View>
            <Text style={styles.offerVehicle}>{offer.vehicle}</Text>
            
            {/* Payment comparison */}
            <View style={styles.offerComparison}>
              <View style={styles.offerOld}>
                <Text style={styles.offerLabel}>{crm.oldPayment}</Text>
                <Text style={styles.offerOldPrice}>{formatCurrency(offer.old_payment)}{crm.perMonth}</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color="#e6c65a" />
              <View style={styles.offerNew}>
                <Text style={styles.offerLabel}>{crm.newPayment}</Text>
                <Text style={styles.offerNewPrice}>{formatCurrency(offer.new_payment)}{crm.perMonth}</Text>
              </View>
            </View>
            
            {/* Savings */}
            <View style={styles.offerSavings}>
              <Ionicons name="trending-down" size={18} color="#e6c65a" />
              <Text style={styles.offerSavingsText}>
                {crm.savings}: {formatCurrency(offer.savings_monthly)}{crm.perMonth} • {formatCurrency(offer.savings_total)} {crm.total}
              </Text>
            </View>
            
            {/* Action buttons */}
            {!offer.email_sent && (
              <View style={styles.offerActions}>
                <TouchableOpacity 
                  style={styles.ignoreBtn}
                  onPress={() => ignoreOffer(offer.submission_id)}
                >
                  <Ionicons name="close" size={18} color="#9aa3b1" />
                  <Text style={styles.ignoreBtnText}>{crm.reject}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.ignoreBtn, { borderColor: '#FF6B6B' }]}
                  onPress={() => deleteBetterOffer(offer.submission_id)}
                >
                  <Ionicons name="trash" size={18} color="#FF6B6B" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.approveBtn}
                  onPress={() => approveOffer(offer.submission_id)}
                  disabled={approvingOffer === offer.submission_id}
                >
                  {approvingOffer === offer.submission_id ? (
                    <ActivityIndicator size="small" color="#07090e" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#07090e" />
                      <Text style={styles.approveBtnText}>{crm.approve}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        ))
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  // Offer detail modal
  const renderOfferDetailModal = () => {
    if (!selectedOffer) return null;
    const o = selectedOffer;
    const cs = (o.calculator_state && typeof o.calculator_state === 'object') ? o.calculator_state : {};
    const prixEchange = parseFloat(cs.prixEchange || '0');
    const balanceDue = parseFloat(cs.montantDuEchange || '0');
    const comptant = parseFloat(cs.comptantTxInclus || '0');
    const equite = prixEchange - balanceDue;
    const fraisDossier = parseFloat(cs.fraisDossier || '0');
    const fmtCur = (n: number) => `$${Math.abs(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    const npd = o.new_program_data || {};
    const pbt = o.payments_by_term || {};
    const allTerms = [36, 48, 60, 72, 84, 96];
    const hasOpt2 = npd.option2_rates != null;
    const clientTerm = o.term;
    const isFr = lang === 'fr';
    
    return (
      <Modal visible={!!selectedOffer} transparent animationType="fade" onRequestClose={() => setSelectedOffer(null)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 12}}>
          <View style={{
            backgroundColor: '#07090e', borderRadius: 16, width: '100%', maxWidth: 500,
            maxHeight: Math.round(Dimensions.get('window').height * 0.9), flexDirection: 'column' as const, overflow: 'hidden' as const,
          }}>
            {/* Header */}
            <View style={{flexDirection: 'row' as const, alignItems: 'center' as const, padding: 14, borderBottomWidth: 1, borderBottomColor: '#303744'}}>
              <Ionicons name="pricetag" size={22} color="#e6c65a" style={{marginRight: 10}} />
              <View style={{flex: 1}}>
                <Text style={{color: '#f4f1ea', fontSize: 16, fontWeight: 'bold'}}>{o.client_name}</Text>
                <Text style={{color: '#9aa3b1', fontSize: 13}}>{o.vehicle_brand} {o.vehicle_model} {o.vehicle_year}{o.vehicle_price > 0 ? ` | ${fmtCur(o.vehicle_price)}` : ''}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedOffer(null)} style={{padding: 4}} data-testid="close-offer-modal">
                <Ionicons name="close" size={22} color="#9aa3b1" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={true} bounces={false}>
              <View style={{padding: 14}}>

                {/* Old deal summary */}
                <View style={{backgroundColor: '#111722', borderRadius: 10, padding: 12, marginBottom: 10}}>
                  <Text style={{color: '#FF6B6B', fontSize: 12, fontWeight: 'bold', marginBottom: 6}}>
                    {isFr ? 'ANCIEN DEAL' : 'OLD DEAL'} ({o.old_program})
                  </Text>
                  <View style={{flexDirection: 'row' as const, justifyContent: 'space-between' as const}}>
                    <View>
                      <Text style={{color: '#9aa3b1', fontSize: 11}}>{isFr ? 'Paiement' : 'Payment'}</Text>
                      <Text style={{color: '#FF6B6B', fontSize: 18, fontWeight: 'bold', textDecorationLine: 'line-through'}}>{fmtCur(o.old_payment)}/m</Text>
                    </View>
                    <View style={{alignItems: 'center' as const}}>
                      <Text style={{color: '#9aa3b1', fontSize: 11}}>{isFr ? 'Taux' : 'Rate'}</Text>
                      <Text style={{color: '#FF6B6B', fontSize: 16, fontWeight: 'bold'}}>{o.old_rate}%</Text>
                    </View>
                    <View style={{alignItems: 'flex-end' as const}}>
                      <Text style={{color: '#9aa3b1', fontSize: 11}}>{isFr ? 'Terme' : 'Term'}</Text>
                      <Text style={{color: '#cfd4dc', fontSize: 16, fontWeight: 'bold'}}>{clientTerm}m</Text>
                    </View>
                  </View>
                  {o.old_consumer_cash > 0 && (
                    <Text style={{color: '#9aa3b1', fontSize: 12, marginTop: 4}}>
                      {isFr ? 'Rabais' : 'Rebate'}: {fmtCur(o.old_consumer_cash)}
                    </Text>
                  )}
                  {(o.old_selected_option || '1') !== '1' && (
                    <Text style={{color: '#9aa3b1', fontSize: 12}}>Option {o.old_selected_option}</Text>
                  )}
                </View>

                {/* Trade-in section */}
                {(prixEchange > 0 || balanceDue > 0) && (
                  <View style={{backgroundColor: '#111722', borderRadius: 10, padding: 12, marginBottom: 10}}>
                    <Text style={{color: '#FF9F43', fontSize: 12, fontWeight: 'bold', marginBottom: 6}}>
                      {isFr ? 'ECHANGE' : 'TRADE-IN'}
                    </Text>
                    <View style={{flexDirection: 'row' as const, justifyContent: 'space-between' as const}}>
                      <View>
                        <Text style={{color: '#9aa3b1', fontSize: 11}}>{isFr ? 'Valeur' : 'Value'}</Text>
                        <Text style={{color: '#e6c65a', fontSize: 16, fontWeight: 'bold'}}>{fmtCur(prixEchange)}</Text>
                      </View>
                      <View style={{alignItems: 'center' as const}}>
                        <Text style={{color: '#9aa3b1', fontSize: 11}}>{isFr ? 'Balance' : 'Balance'}</Text>
                        <Text style={{color: '#FF6B6B', fontSize: 16, fontWeight: 'bold'}}>{fmtCur(balanceDue)}</Text>
                      </View>
                      <View style={{alignItems: 'flex-end' as const}}>
                        <Text style={{color: '#9aa3b1', fontSize: 11}}>{isFr ? 'Equite' : 'Equity'}</Text>
                        <Text style={{color: equite >= 0 ? '#e6c65a' : '#FF6B6B', fontSize: 16, fontWeight: 'bold'}}>
                          {equite >= 0 ? '+' : '-'}{fmtCur(equite)}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* New program info */}
                <View style={{backgroundColor: '#1e3a2e', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e6c65a'}}>
                  <Text style={{color: '#e6c65a', fontSize: 12, fontWeight: 'bold', marginBottom: 6}}>
                    {isFr ? 'NOUVEAU PROGRAMME' : 'NEW PROGRAM'} ({o.new_program})
                  </Text>
                  <View style={{flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8}}>
                    {npd.consumer_cash > 0 && (
                      <View style={{backgroundColor: '#0d2a1e', borderRadius: 6, padding: 6, paddingHorizontal: 10}}>
                        <Text style={{color: '#9aa3b1', fontSize: 10}}>Opt.1 {isFr ? 'Rabais' : 'Rebate'}</Text>
                        <Text style={{color: '#e6c65a', fontSize: 14, fontWeight: 'bold'}}>{fmtCur(npd.consumer_cash)}</Text>
                      </View>
                    )}
                    {hasOpt2 && npd.alt_consumer_cash > 0 && (
                      <View style={{backgroundColor: '#0d2a1e', borderRadius: 6, padding: 6, paddingHorizontal: 10}}>
                        <Text style={{color: '#9aa3b1', fontSize: 10}}>Opt.2 {isFr ? 'Rabais' : 'Rebate'}</Text>
                        <Text style={{color: '#e6c65a', fontSize: 14, fontWeight: 'bold'}}>{fmtCur(npd.alt_consumer_cash)}</Text>
                      </View>
                    )}
                    {npd.bonus_cash > 0 && (
                      <View style={{backgroundColor: '#0d2a1e', borderRadius: 6, padding: 6, paddingHorizontal: 10}}>
                        <Text style={{color: '#9aa3b1', fontSize: 10}}>Bonus</Text>
                        <Text style={{color: '#f0d879', fontSize: 14, fontWeight: 'bold'}}>{fmtCur(npd.bonus_cash)}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Payment comparison table for all terms */}
                <View style={{backgroundColor: '#111722', borderRadius: 10, overflow: 'hidden' as const, marginBottom: 10}}>
                  <Text style={{color: '#f0d879', fontSize: 12, fontWeight: 'bold', padding: 10, paddingBottom: 6}}>
                    {isFr ? 'COMPARAISON PAR TERME' : 'COMPARISON BY TERM'}
                  </Text>
                  {/* Table header */}
                  <View style={{flexDirection: 'row' as const, backgroundColor: '#07090e', paddingVertical: 6, paddingHorizontal: 10}}>
                    <Text style={{color: '#9aa3b1', fontSize: 10, width: 42, fontWeight: 'bold'}}>{isFr ? 'Terme' : 'Term'}</Text>
                    <Text style={{color: '#e6c65a', fontSize: 10, flex: 1, textAlign: 'center' as const, fontWeight: 'bold'}}>
                      {isFr ? 'Economie Opt.1' : 'Savings Opt.1'}
                    </Text>
                    {hasOpt2 && <Text style={{color: '#e6c65a', fontSize: 10, flex: 1, textAlign: 'center' as const, fontWeight: 'bold'}}>
                      {isFr ? 'Economie Opt.2' : 'Savings Opt.2'}
                    </Text>}
                    <Text style={{color: '#9aa3b1', fontSize: 10, width: 50, textAlign: 'center' as const, fontWeight: 'bold'}}>
                      {isFr ? 'Taux' : 'Rate'}
                    </Text>
                  </View>
                  {/* Table rows */}
                  {allTerms.map((t) => {
                    const termData = pbt[String(t)];
                    const isClientTerm = t === clientTerm;
                    const o1Delta = termData?.opt1_delta ?? 0;
                    const o2Delta = termData?.opt2_delta;
                    return (
                      <View key={t} style={{
                        flexDirection: 'row' as const, paddingVertical: 7, paddingHorizontal: 10,
                        backgroundColor: isClientTerm ? 'rgba(230, 198, 90,0.1)' : 'transparent',
                        borderLeftWidth: isClientTerm ? 3 : 0, borderLeftColor: '#e6c65a',
                      }}>
                        <Text style={{color: isClientTerm ? '#e6c65a' : '#cfd4dc', fontSize: 12, width: 42, fontWeight: isClientTerm ? 'bold' : 'normal'}}>
                          {t}m{isClientTerm ? ' *' : ''}
                        </Text>
                        <Text style={{color: o1Delta > 0 ? '#e6c65a' : '#9aa3b1', fontSize: 12, flex: 1, textAlign: 'center' as const, fontWeight: isClientTerm ? 'bold' : 'normal'}}>
                          {o1Delta > 0 ? `-${fmtCur(o1Delta)}/m` : '-'}
                        </Text>
                        {hasOpt2 && (
                          <Text style={{color: (o2Delta ?? 0) > 0 ? '#e6c65a' : '#9aa3b1', fontSize: 12, flex: 1, textAlign: 'center' as const, fontWeight: isClientTerm ? 'bold' : 'normal'}}>
                            {o2Delta != null && o2Delta > 0 ? `-${fmtCur(o2Delta)}/m` : '-'}
                          </Text>
                        )}
                        <Text style={{color: '#9aa3b1', fontSize: 11, width: 50, textAlign: 'center' as const}}>
                          {termData?.opt1_rate ?? '-'}%
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Savings highlight */}
                <View style={{backgroundColor: '#1e3a2e', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e6c65a'}}>
                  <Text style={{color: '#e6c65a', fontSize: 12, fontWeight: 'bold', marginBottom: 8}}>
                    {isFr ? 'ECONOMIE DU CLIENT' : 'CLIENT SAVINGS'} ({clientTerm}m)
                  </Text>
                  <View style={{flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const}}>
                    <View>
                      <Text style={{color: '#9aa3b1', fontSize: 11}}>{isFr ? 'Ancien' : 'Old'}</Text>
                      <Text style={{color: '#FF6B6B', fontSize: 20, fontWeight: 'bold', textDecorationLine: 'line-through'}}>{fmtCur(o.old_payment)}/m</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={20} color="#e6c65a" />
                    <View style={{alignItems: 'flex-end' as const}}>
                      <Text style={{color: '#9aa3b1', fontSize: 11}}>{isFr ? 'Nouveau' : 'New'}</Text>
                      <Text style={{color: '#e6c65a', fontSize: 20, fontWeight: 'bold'}}>{fmtCur(o.new_payment)}/m</Text>
                    </View>
                  </View>
                  <View style={{backgroundColor: '#0d2a1e', borderRadius: 8, padding: 10, marginTop: 10, alignItems: 'center' as const}}>
                    <Text style={{color: '#e6c65a', fontSize: 24, fontWeight: 'bold'}}>-{fmtCur(o.savings_monthly)}/m</Text>
                    <Text style={{color: '#e6c65a', fontSize: 14, marginTop: 2}}>
                      {isFr ? 'Total sur' : 'Total over'} {clientTerm}m: -{fmtCur(o.savings_total)}
                    </Text>
                  </View>
                </View>

                {/* Extra info */}
                {comptant > 0 && (
                  <Text style={{color: '#9aa3b1', fontSize: 12, marginBottom: 4}}>
                    {isFr ? 'Comptant' : 'Down payment'}: {fmtCur(comptant)}
                  </Text>
                )}
                {fraisDossier > 0 && (
                  <Text style={{color: '#9aa3b1', fontSize: 12, marginBottom: 4}}>
                    {isFr ? 'Frais de dossier' : 'Admin fees'}: {fmtCur(fraisDossier)}
                  </Text>
                )}
              </View>
            </ScrollView>
            
            {/* Action buttons */}
            <View style={{flexDirection: 'row' as const, padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: '#303744'}}>
              <TouchableOpacity 
                style={{flex: 1, backgroundColor: '#111722', borderRadius: 10, padding: 12, alignItems: 'center' as const}}
                onPress={() => setSelectedOffer(null)}
                data-testid="offer-modal-close-btn"
              >
                <Text style={{color: '#cfd4dc', fontWeight: 'bold'}}>{isFr ? 'Fermer' : 'Close'}</Text>
              </TouchableOpacity>
              {!o.email_sent && (
                <TouchableOpacity 
                  style={{flex: 2, backgroundColor: '#e6c65a', borderRadius: 10, padding: 12, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8}}
                  onPress={() => { setSelectedOffer(null); approveOffer(o.submission_id); }}
                  data-testid="offer-modal-approve-btn"
                >
                  <Ionicons name="send" size={18} color="#07090e" />
                  <Text style={{color: '#07090e', fontWeight: 'bold'}}>
                    {isFr ? 'Approuver & Envoyer' : 'Approve & Send'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const openSubmissionInCalculator = async (sub: Submission) => {
    if (sub.calculator_state && typeof sub.calculator_state === 'object') {
      await AsyncStorage.setItem('calcauto_restore_state', JSON.stringify(sub.calculator_state));
      router.push('/(tabs)');
    } else {
      // Old submission without full state - reconstruct partial state from available fields
      try {
        const headers = await getAuthHeaders();
        // Try to find a matching program to get rate data
        let matchedProgram = null;
        try {
          const progResp = await axios.get(`${API_URL}/api/programs`, { headers });
          const allProgs = progResp.data || [];
          matchedProgram = allProgs.find((p: any) =>
            p.brand === sub.vehicle_brand && p.model === sub.vehicle_model && p.year === sub.vehicle_year
          );
        } catch (e) {
          console.log('Could not fetch programs for restore:', e);
        }
        
        const partialState: any = {
          vehiclePrice: String(sub.vehicle_price || ''),
          selectedTerm: sub.term || 72,
          selectedOption: sub.selected_option || '1',
          paymentFrequency: 'monthly',
          selectedBrand: sub.vehicle_brand || '',
          selectedModel: sub.vehicle_model || '',
          selectedYear: sub.vehicle_year || 2025,
        };
        
        if (matchedProgram) {
          partialState.selectedProgram = matchedProgram;
        } else {
          // Construct a minimal program-like object 
          partialState.selectedProgram = {
            brand: sub.vehicle_brand,
            model: sub.vehicle_model,
            year: sub.vehicle_year,
            consumer_cash: 0,
            bonus_cash: 0,
            option1_rates: { rate_36: sub.rate || 0, rate_48: sub.rate || 0, rate_60: sub.rate || 0, rate_72: sub.rate || 0, rate_84: sub.rate || 0, rate_96: sub.rate || 0 },
          };
        }
        
        await AsyncStorage.setItem('calcauto_restore_state', JSON.stringify(partialState));
        router.push('/(tabs)');
      } catch (e) {
        console.error('Error restoring old submission:', e);
        if (Platform.OS === 'web') {
          alert(lang === 'fr' ? 'Erreur lors de la restauration.' : 'Error restoring submission.');
        } else {
          Alert.alert(lang === 'fr' ? 'Erreur' : 'Error', lang === 'fr' ? 'Erreur lors de la restauration.' : 'Error restoring submission.');
        }
      }
    }
  };

  const renderHistoryTab = () => (
    <ScrollView 
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e6c65a" />}
    >
      {submissions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color="#9aa3b1" />
          <Text style={styles.emptyText}>{crm.noSubmissions}</Text>
        </View>
      ) : (
        submissions.map((sub, index) => (
          <View key={index} style={styles.historyCard}>
            <TouchableOpacity onPress={() => openFollowUpModal(sub)}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyClient}>{sub.client_name}</Text>
                <Text style={styles.historyDate}>{formatDate(sub.submission_date)}</Text>
              </View>
              <Text style={styles.historyVehicle}>
                {sub.vehicle_brand} {sub.vehicle_model} {sub.vehicle_year}
              </Text>
              <Text style={styles.historyPayment}>
                {formatCurrency(sub.payment_monthly)}/{crm.months} • {sub.term} {crm.months}
              </Text>
              {sub.reminder_date && !sub.reminder_done && (
                <View style={styles.historyReminderBadge}>
                  <Ionicons name="notifications" size={12} color="#f0d879" />
                  <Text style={styles.historyReminderText}>{formatDate(sub.reminder_date)}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.openCalcBtn}
              onPress={() => openSubmissionInCalculator(sub)}
              data-testid={`open-submission-${index}`}
            >
              <Ionicons name="calculator-outline" size={16} color="#07090e" />
              <Text style={styles.openCalcBtnText}>{lang === 'fr' ? 'Ouvrir le calcul' : 'Open calculation'}</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{crm.title}</Text>
          {remindersCount > 0 && (
            <View style={styles.remindersBadge}>
              <Ionicons name="warning" size={14} color="#f0d879" />
              <Text style={styles.remindersBadgeText}>{remindersCount} {crm.remindersCount}</Text>
            </View>
          )}
        </View>
        <LanguageSelector currentLanguage={lang} onLanguageChange={handleLanguageChange} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'clients' && styles.tabActive]}
          onPress={() => setActiveTab('clients')}
        >
          <Ionicons name="people" size={18} color={activeTab === 'clients' ? '#e6c65a' : '#9aa3b1'} />
          <Text style={[styles.tabText, activeTab === 'clients' && styles.tabTextActive]}>{crm.tabs.clients}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'reminders' && styles.tabActive]}
          onPress={() => setActiveTab('reminders')}
        >
          <Ionicons name="notifications" size={18} color={activeTab === 'reminders' ? '#e6c65a' : '#9aa3b1'} />
          <Text style={[styles.tabText, activeTab === 'reminders' && styles.tabTextActive]}>
            {crm.tabs.reminders} {remindersCount > 0 && `(${remindersCount})`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'offers' && styles.tabActive]}
          onPress={() => setActiveTab('offers')}
        >
          <Ionicons name="pricetag" size={18} color={activeTab === 'offers' ? '#e6c65a' : '#9aa3b1'} />
          <Text style={[styles.tabText, activeTab === 'offers' && styles.tabTextActive]}>{crm.tabs.offers}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons name="document-text" size={18} color={activeTab === 'history' ? '#e6c65a' : '#9aa3b1'} />
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>{crm.tabs.history}</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9aa3b1" />
          <TextInput
            style={styles.searchInput}
            placeholder={crm.search}
            placeholderTextColor="#8a93a1"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#9aa3b1" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {activeTab === 'clients' && clients.some(c => !!c.dossier) && (
        <View style={[styles.importPickRow, { paddingHorizontal: 16, marginTop: 10, marginBottom: 0 }]}>
          <TouchableOpacity
            style={[styles.importPickBtn, !evalOnly && { borderColor: '#e6c65a' }]}
            onPress={() => setEvalOnly(false)}
            data-testid="filter-all-contacts"
          >
            <Text style={styles.importPickText}>{lang === 'fr' ? 'Tous' : 'All'} ({clients.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.importPickBtn, evalOnly && { borderColor: '#e6c65a' }]}
            onPress={() => setEvalOnly(true)}
            data-testid="filter-eval-contacts"
          >
            <Text style={styles.importPickText}>
              {lang === 'fr' ? 'Contacts d\'évaluation' : 'Appraisal contacts'} ({clients.filter(c => !!c.dossier).length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => setShowAddContactModal(true)}
          data-testid="add-contact-btn"
        >
          <Ionicons name="add" size={20} color="#07090e" />
          <Text style={styles.addButtonText}>{crm.add}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.importButton}
          onPress={() => setShowImportModal(true)}
        >
          <Ionicons name="cloud-download-outline" size={20} color="#FF9F43" />
          <Text style={styles.importButtonText}>{crm.import}</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {canLinkAccount && activeTab === 'clients' && (
        <View style={styles.linkBox} data-testid="etv-link-account">
          <Text style={styles.dossierTag}>{lang === 'fr' ? 'Vous avez déjà un compte CalcAuto ?' : 'Already have a CalcAuto account?'}</Text>
          <Text style={styles.dossierLine}>
            {lang === 'fr'
              ? 'Reliez-le une seule fois : vos contacts et vos soumissions apparaîtront ici avec vos évaluations.'
              : 'Link it once: your contacts and quotes will appear here with your appraisals.'}
          </Text>
          <TextInput
            style={styles.linkInput}
            placeholder={lang === 'fr' ? 'Courriel du compte CalcAuto' : 'CalcAuto account email'}
            placeholderTextColor="#8a93a1"
            autoCapitalize="none"
            keyboardType="email-address"
            value={linkEmail}
            onChangeText={setLinkEmail}
            data-testid="etv-link-email"
          />
          <TextInput
            style={styles.linkInput}
            placeholder={lang === 'fr' ? 'Mot de passe CalcAuto' : 'CalcAuto password'}
            placeholderTextColor="#8a93a1"
            secureTextEntry
            value={linkPassword}
            onChangeText={setLinkPassword}
            onSubmitEditing={submitLink}
            data-testid="etv-link-password"
          />
          {!!linkError && <Text style={styles.linkError}>{linkError}</Text>}
          <TouchableOpacity style={[styles.dossierBtn, linkBusy && { opacity: 0.6 }]} onPress={submitLink} disabled={linkBusy} data-testid="etv-link-submit">
            <Text style={styles.dossierBtnText}>{linkBusy ? (lang === 'fr' ? 'Un instant…' : 'One moment…') : (lang === 'fr' ? 'Relier mon compte' : 'Link my account')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {activeTab === 'clients' && renderClientsTab()}
      {activeTab === 'reminders' && renderRemindersTab()}
      {activeTab === 'offers' && renderOffersTab()}
      {activeTab === 'history' && renderHistoryTab()}
      
      {/* Offer Detail Modal */}
      {renderOfferDetailModal()}

      {/* ============================================ */}
      {/* ADD CONTACT MODAL */}
      {/* ============================================ */}
      <Modal visible={showAddContactModal} animationType="slide" transparent={true} onRequestClose={() => setShowAddContactModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#07090e', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#333' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: '#f4f1ea', fontSize: 20, fontWeight: '700' }}>Nouveau contact</Text>
              <TouchableOpacity onPress={() => setShowAddContactModal(false)} data-testid="close-add-contact-modal">
                <Ionicons name="close" size={24} color="#9aa3b1" />
              </TouchableOpacity>
            </View>

            <Text style={{ color: '#b9c0cc', fontSize: 13, marginBottom: 6 }}>Nom *</Text>
            <TextInput
              style={{ backgroundColor: '#0d1118', borderRadius: 10, padding: 14, color: '#f4f1ea', fontSize: 16, marginBottom: 14, borderWidth: 1, borderColor: '#333' }}
              value={newContactName}
              onChangeText={setNewContactName}
              placeholder="Nom complet"
              placeholderTextColor="#5a6372"
              data-testid="new-contact-name-input"
            />

            <Text style={{ color: '#b9c0cc', fontSize: 13, marginBottom: 6 }}>Téléphone</Text>
            <TextInput
              style={{ backgroundColor: '#0d1118', borderRadius: 10, padding: 14, color: '#f4f1ea', fontSize: 16, marginBottom: 14, borderWidth: 1, borderColor: '#333' }}
              value={newContactPhone}
              onChangeText={setNewContactPhone}
              placeholder="(418) 555-1234"
              placeholderTextColor="#5a6372"
              keyboardType="phone-pad"
              data-testid="new-contact-phone-input"
            />

            <Text style={{ color: '#b9c0cc', fontSize: 13, marginBottom: 6 }}>Courriel</Text>
            <TextInput
              style={{ backgroundColor: '#0d1118', borderRadius: 10, padding: 14, color: '#f4f1ea', fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#333' }}
              value={newContactEmail}
              onChangeText={setNewContactEmail}
              placeholder="email@exemple.com"
              placeholderTextColor="#5a6372"
              keyboardType="email-address"
              autoCapitalize="none"
              data-testid="new-contact-email-input"
            />

            <TouchableOpacity
              style={{ backgroundColor: savingContact ? '#5a6372' : '#e6c65a', borderRadius: 12, padding: 16, alignItems: 'center' }}
              onPress={handleCreateContact}
              disabled={savingContact || !newContactName.trim()}
              data-testid="save-new-contact-btn"
            >
              <Text style={{ color: '#07090e', fontSize: 16, fontWeight: '700' }}>
                {savingContact ? 'Enregistrement...' : 'Enregistrer'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ============================================ */}
      {/* IMPORT CONTACTS MODAL - vCard/CSV Options */}
      {/* ============================================ */}
      <Modal visible={showImportModal} animationType="slide" transparent={true} onRequestClose={() => setShowImportModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.importModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{crm.importTitle}</Text>
              <TouchableOpacity onPress={() => setShowImportModal(false)}>
                <Ionicons name="close" size={24} color="#f4f1ea" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.importModalBody}>
              <Text style={styles.importDescription}>{crm.importDescription}</Text>
              
              {/* iCloud Option */}
              <TouchableOpacity 
                style={styles.importOption} 
                onPress={() => importFile('vcard')}
                disabled={importingFile}
              >
                <View style={styles.importOptionIcon}>
                  <Ionicons name="cloud-outline" size={28} color="#e6c65a" />
                </View>
                <View style={styles.importOptionInfo}>
                  <Text style={styles.importOptionTitle}>{crm.iCloudOption}</Text>
                  <Text style={styles.importOptionDesc}>{crm.iCloudDesc}</Text>
                </View>
                {importingFile ? (
                  <ActivityIndicator size="small" color="#e6c65a" />
                ) : (
                  <Ionicons name="chevron-forward" size={24} color="#9aa3b1" />
                )}
              </TouchableOpacity>
              
              {/* Google Option */}
              <TouchableOpacity 
                style={styles.importOption} 
                onPress={() => importFile('csv')}
                disabled={importingFile}
              >
                <View style={[styles.importOptionIcon, { backgroundColor: 'rgba(66, 133, 244, 0.1)' }]}>
                  <Ionicons name="logo-google" size={28} color="#4285F4" />
                </View>
                <View style={styles.importOptionInfo}>
                  <Text style={styles.importOptionTitle}>{crm.googleOption}</Text>
                  <Text style={styles.importOptionDesc}>{crm.googleDesc}</Text>
                </View>
                {importingFile ? (
                  <ActivityIndicator size="small" color="#4285F4" />
                ) : (
                  <Ionicons name="chevron-forward" size={24} color="#9aa3b1" />
                )}
              </TouchableOpacity>
              
              {/* Instructions */}
              <View style={styles.importInstructions}>
                <Text style={styles.importInstructionsTitle}>{crm.howToExport}</Text>
                <Text style={styles.importInstructionsText}>{crm.iCloudInstructions}</Text>
                <Text style={[styles.importInstructionsText, { marginTop: 12 }]}>{crm.googleInstructions}</Text>
              </View>
            </View>
            
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowImportModal(false)}>
              <Text style={styles.closeButtonText}>{crm.close}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ============================================ */}
      {/* IMPORTED CONTACTS LIST MODAL */}
      {/* ============================================ */}
      <Modal visible={showImportedContactsModal} animationType="slide" transparent={true} onRequestClose={() => setShowImportedContactsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.contactsModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {lang === 'fr' ? 'Choisir les contacts' : 'Choose contacts'} ({importSelection.size}/{importedContacts.length})
              </Text>
              <TouchableOpacity onPress={() => setShowImportedContactsModal(false)}>
                <Ionicons name="close" size={24} color="#f4f1ea" />
              </TouchableOpacity>
            </View>
            <View style={styles.importPickRow}>
              <TouchableOpacity style={styles.importPickBtn} onPress={() => setImportSelection(new Set(importedContacts.map((_, i) => i)))} data-testid="import-select-all">
                <Text style={styles.importPickText}>{lang === 'fr' ? 'Tout cocher' : 'Select all'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.importPickBtn} onPress={() => setImportSelection(new Set())} data-testid="import-select-none">
                <Text style={styles.importPickText}>{lang === 'fr' ? 'Tout décocher' : 'Select none'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dossierBtn, { flex: 1 }, (importSelection.size === 0 || savingImport) && { opacity: 0.5 }]}
                onPress={saveSelectedContacts}
                disabled={importSelection.size === 0 || savingImport}
                data-testid="import-save-selected"
              >
                <Text style={styles.dossierBtnText}>
                  {savingImport ? (lang === 'fr' ? 'Un instant…' : 'One moment…') : `${lang === 'fr' ? 'Importer' : 'Import'} (${importSelection.size})`}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.contactsList}>
              {importedContacts.map((contact, index) => (
                <TouchableOpacity key={contact.id || index} style={styles.contactItem} onPress={() => toggleImported(index)}>
                  <Ionicons
                    name={importSelection.has(index) ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={importSelection.has(index) ? '#e6c65a' : '#9aa3b1'}
                    style={{ marginRight: 10 }}
                  />
                  <View style={styles.contactDetails}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    {contact.phone && <Text style={styles.contactPhone}>{contact.phone}</Text>}
                    {contact.email && <Text style={styles.contactEmail}>{contact.email}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9aa3b1" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Jumelage d'un véhicule convoité */}
      <Modal visible={!!pairClient} animationType="slide" transparent={true} onRequestClose={() => setPairClient(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.contactsModalContent} data-testid="pair-modal">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {lang === 'fr' ? 'Véhicule convoité' : 'Wanted vehicle'}{pairClient ? ` · ${pairClient.name}` : ''}
              </Text>
              <TouchableOpacity onPress={() => setPairClient(null)}>
                <Ionicons name="close" size={24} color="#f4f1ea" />
              </TouchableOpacity>
            </View>
            <View style={[styles.searchContainer, { marginBottom: 10, marginHorizontal: 16 }]}>
              <Ionicons name="search" size={20} color="#9aa3b1" />
              <TextInput
                style={styles.searchInput}
                placeholder={lang === 'fr' ? 'Numéro, année, marque ou modèle' : 'Stock, year, make or model'}
                placeholderTextColor="#8a93a1"
                value={pairSearch}
                onChangeText={setPairSearch}
                data-testid="pair-search"
              />
            </View>
            {!!pairClient?.dossier?.paired && (
              <View style={styles.importPickRow}>
                <TouchableOpacity style={styles.importPickBtn} onPress={() => savePairing(null)} disabled={pairBusy} data-testid="pair-remove">
                  <Text style={styles.importPickText}>{lang === 'fr' ? 'Enlever le jumelage' : 'Remove the match'}</Text>
                </TouchableOpacity>
              </View>
            )}
            <ScrollView style={styles.contactsList}>
              {pairChoices.length === 0 && (
                <Text style={styles.dossierLine}>
                  {lang === 'fr' ? "Aucun véhicule disponible ne correspond dans l'inventaire." : 'No available vehicle matches in the inventory.'}
                </Text>
              )}
              {pairChoices.map((v: any) => {
                const label = `${v.year} ${v.brand} ${v.model} ${v.trim || ''}`.replace(/\s+/g, ' ').trim();
                const price = v.type === 'occasion' ? (v.asking_price || v.msrp) : (v.msrp || v.asking_price);
                return (
                  <TouchableOpacity
                    key={v.id || v.stock_no}
                    style={styles.contactItem}
                    disabled={pairBusy}
                    onPress={() => savePairing({ stock: String(v.stock_no), label, price: price || null })}
                    data-testid={`pair-pick-${v.stock_no}`}
                  >
                    <View style={styles.contactDetails}>
                      <Text style={styles.contactName}>#{v.stock_no} · {label}</Text>
                      <Text style={styles.contactPhone}>
                        {v.type === 'occasion' ? (lang === 'fr' ? 'Occasion' : 'Used') : (lang === 'fr' ? 'Neuf' : 'New')}
                        {price ? ` · ${Math.round(price).toLocaleString('fr-CA')} $` : ''}
                        {v.km ? ` · ${Number(v.km).toLocaleString('fr-CA')} km` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#9aa3b1" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Client Details Modal */}
      <Modal visible={showClientModal} animationType="slide" transparent={true} onRequestClose={() => setShowClientModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.clientModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedClient?.name}</Text>
              <TouchableOpacity onPress={() => setShowClientModal(false)}>
                <Ionicons name="close" size={24} color="#f4f1ea" />
              </TouchableOpacity>
            </View>
            {selectedClient && (
              <ScrollView style={styles.clientModalBody}>
                <View style={styles.clientModalInfo}>
                  {selectedClient.phone && (
                    <TouchableOpacity style={styles.clientModalContact} onPress={() => callContact(selectedClient.phone)}>
                      <Ionicons name="call" size={20} color="#e6c65a" />
                      <Text style={styles.clientModalContactText}>{selectedClient.phone}</Text>
                    </TouchableOpacity>
                  )}
                  {selectedClient.email && (
                    <TouchableOpacity style={styles.clientModalContact} onPress={() => emailContact(selectedClient.email)}>
                      <Ionicons name="mail" size={20} color="#e6c65a" />
                      <Text style={styles.clientModalContactText}>{selectedClient.email}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity style={styles.newQuoteButton} onPress={() => newQuoteForClient(selectedClient)}>
                  <Ionicons name="add-circle" size={20} color="#07090e" />
                  <Text style={styles.newQuoteButtonText}>{crm.newQuote}</Text>
                </TouchableOpacity>
                <Text style={styles.clientModalSectionTitle}>{crm.submissions} ({selectedClient.submissions.length})</Text>
                {selectedClient.submissions.map((sub, idx) => (
                  <TouchableOpacity key={idx} style={styles.submissionCard} onPress={() => { setShowClientModal(false); openFollowUpModal(sub); }}>
                    <View style={styles.submissionCardRow}>
                      <View style={styles.submissionCardInfo}>
                        <Text style={styles.submissionVehicle}>{sub.vehicle_brand} {sub.vehicle_model} {sub.vehicle_year}</Text>
                        <Text style={styles.submissionPayment}>{formatCurrency(sub.payment_monthly)}/{crm.months}</Text>
                        <Text style={styles.submissionDate}>{formatDate(sub.submission_date)}</Text>
                      </View>
                      <TouchableOpacity 
                        style={styles.deleteSubmissionBtn} 
                        onPress={(e) => { e.stopPropagation(); deleteSubmission(sub.id); }}
                      >
                        <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
                {selectedClient.submissions.length > 0 && (
                  <TouchableOpacity 
                    style={styles.deleteHistoryButton} 
                    onPress={() => { setShowClientModal(false); deleteContactHistory(selectedClient.id); }}
                  >
                    <Ionicons name="trash" size={18} color="#FF6B6B" />
                    <Text style={styles.deleteHistoryButtonText}>Supprimer tout l'historique</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Follow-up Modal */}
      <Modal visible={showFollowUpModal} animationType="slide" transparent={true} onRequestClose={() => setShowFollowUpModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.followUpModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{crm.scheduleFollowUp}</Text>
              <TouchableOpacity onPress={() => setShowFollowUpModal(false)}>
                <Ionicons name="close" size={24} color="#f4f1ea" />
              </TouchableOpacity>
            </View>
            <View style={styles.followUpForm}>
              <Text style={styles.followUpLabel}>{crm.followUpDate}</Text>
              <TextInput
                style={styles.followUpInput}
                value={followUpDate}
                onChangeText={setFollowUpDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#8a93a1"
              />
              <Text style={styles.followUpLabel}>{crm.notes}</Text>
              <TextInput
                style={[styles.followUpInput, styles.followUpTextarea]}
                value={followUpNotes}
                onChangeText={setFollowUpNotes}
                placeholder={crm.notes}
                placeholderTextColor="#8a93a1"
                multiline
                numberOfLines={4}
              />
              <View style={styles.followUpButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setShowFollowUpModal(false)}>
                  <Text style={styles.cancelButtonText}>{crm.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={saveFollowUp} disabled={savingFollowUp}>
                  {savingFollowUp ? (
                    <ActivityIndicator size="small" color="#07090e" />
                  ) : (
                    <Text style={styles.saveButtonText}>{crm.save}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07090e' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#9aa3b1', marginTop: 12, fontSize: 16 },
  
  // Header
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#303744',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#f4f1ea' },
  remindersBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(240, 216, 121, 0.15)', 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    borderRadius: 20,
    gap: 6,
  },
  remindersBadgeText: { color: '#f0d879', fontSize: 12, fontWeight: '600' },
  
  // Tabs
  tabsContainer: { 
    flexDirection: 'row', 
    backgroundColor: '#111722',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
  },
  tab: { 
    flex: 1, 
    flexDirection: 'row',
    alignItems: 'center', 
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    gap: 4,
  },
  tabActive: { backgroundColor: '#07090e' },
  tabText: { color: '#9aa3b1', fontSize: 11, fontWeight: '600' },
  tabTextActive: { color: '#e6c65a' },
  
  // Search
  searchRow: { paddingHorizontal: 16, marginTop: 16 },
  searchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#111722', 
    borderRadius: 12, 
    paddingHorizontal: 16, 
    paddingVertical: 12,
  },
  searchInput: { flex: 1, color: '#f4f1ea', fontSize: 16, marginLeft: 10 },
  
  // Action Buttons
  actionsRow: { 
    flexDirection: 'row', 
    paddingHorizontal: 16, 
    marginTop: 12,
    gap: 12,
  },
  addButton: { 
    flex: 1,
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: '#e6c65a', 
    paddingVertical: 12, 
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: { color: '#07090e', fontSize: 16, fontWeight: '600' },
  importButton: { 
    flex: 1,
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#FF9F43',
    paddingVertical: 10, 
    borderRadius: 12,
    gap: 8,
  },
  importButtonText: { color: '#FF9F43', fontSize: 16, fontWeight: '600' },
  
  // Tab Content
  tabContent: { flex: 1, paddingHorizontal: 16, marginTop: 12 },
  
  // Empty State
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: '#9aa3b1', fontSize: 18, marginTop: 16, fontWeight: '600' },
  emptySubtext: { color: '#8a93a1', fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
  goToCalcButton: { 
    backgroundColor: '#e6c65a', 
    paddingHorizontal: 24, 
    paddingVertical: 14, 
    borderRadius: 12, 
    marginTop: 20,
  },
  goToCalcText: { color: '#07090e', fontWeight: '600', fontSize: 16 },
  
  // Client Card
  clientCard: { 
    backgroundColor: '#111722', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 10,
  },
  clientRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    backgroundColor: '#e6c65a', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  avatarText: { color: '#07090e', fontSize: 20, fontWeight: 'bold' },
  clientInfo: { flex: 1, marginLeft: 14 },
  clientName: { color: '#f4f1ea', fontSize: 16, fontWeight: '700' },
  clientPhone: { color: '#9aa3b1', fontSize: 14, marginTop: 2 },
  clientEmail: { color: '#8a93a1', fontSize: 12, marginTop: 1 },
  clientActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    backgroundColor: 'rgba(255,255,255,0.1)', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  actionBtnDelete: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    backgroundColor: 'rgba(255,107,107,0.15)', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  clientReminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(240, 216, 121, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 10,
    alignSelf: 'flex-start',
    gap: 6,
  },
  clientReminderText: { color: '#f0d879', fontSize: 12 },
  clientSubmissions: { color: '#8a93a1', fontSize: 12, marginTop: 8 },
  
  // Better Offers
  checkOffersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e6c65a',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  checkOffersButtonText: { color: '#07090e', fontSize: 16, fontWeight: '600' },
  offerCard: {
    backgroundColor: '#111722',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#e6c65a',
  },
  offerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  offerClient: { color: '#f4f1ea', fontSize: 16, fontWeight: '700' },
  offerVehicle: { color: '#e6c65a', fontSize: 14, marginBottom: 12 },
  emailSentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(230, 198, 90, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  emailSentText: { color: '#e6c65a', fontSize: 12, fontWeight: '600' },
  offerComparison: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#07090e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  offerOld: { alignItems: 'center', flex: 1 },
  offerNew: { alignItems: 'center', flex: 1 },
  offerLabel: { color: '#9aa3b1', fontSize: 11, marginBottom: 4 },
  offerOldPrice: { color: '#FF6B6B', fontSize: 16, fontWeight: '600', textDecorationLine: 'line-through' },
  offerNewPrice: { color: '#e6c65a', fontSize: 18, fontWeight: '700' },
  offerSavings: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(230, 198, 90, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  offerSavingsText: { color: '#e6c65a', fontSize: 13, fontWeight: '600' },
  offerActions: { flexDirection: 'row', gap: 12 },
  ignoreBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#9aa3b1',
    gap: 6,
  },
  ignoreBtnText: { color: '#9aa3b1', fontSize: 14, fontWeight: '600' },
  approveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e6c65a',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  approveBtnText: { color: '#07090e', fontSize: 14, fontWeight: '600' },
  
  // Reminder Card
  reminderCard: { 
    backgroundColor: '#111722', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#e6c65a',
  },
  reminderOverdue: { borderLeftColor: '#FF6B6B' },
  reminderToday: { borderLeftColor: '#f0d879' },
  reminderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reminderClient: { color: '#f4f1ea', fontSize: 16, fontWeight: '700' },
  reminderDue: { color: '#e6c65a', fontSize: 13, fontWeight: '600' },
  reminderDueOverdue: { color: '#FF6B6B' },
  reminderVehicle: { color: '#e6c65a', fontSize: 14, marginTop: 6 },
  reminderPayment: { color: '#9aa3b1', fontSize: 13, marginTop: 4 },
  reminderNotes: { color: '#b9c0cc', fontSize: 13, marginTop: 8, fontStyle: 'italic' },
  reminderActions: { flexDirection: 'row', marginTop: 12, gap: 10 },
  reminderBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e6c65a',
    gap: 6,
  },
  reminderBtnText: { color: '#e6c65a', fontSize: 13, fontWeight: '600' },
  reminderBtnDone: { backgroundColor: '#e6c65a', borderColor: '#e6c65a' },
  reminderBtnDelete: { borderColor: '#FF6B6B', paddingHorizontal: 10 },
  reminderBtnTextDone: { color: '#07090e', fontSize: 13, fontWeight: '600' },
  
  // History Card
  historyCard: { 
    backgroundColor: '#111722', 
    borderRadius: 12, 
    padding: 14, 
    marginBottom: 8,
  },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyClient: { color: '#f4f1ea', fontSize: 15, fontWeight: '600' },
  historyDate: { color: '#9aa3b1', fontSize: 12 },
  historyVehicle: { color: '#e6c65a', fontSize: 14, marginTop: 4 },
  historyPayment: { color: '#9aa3b1', fontSize: 13, marginTop: 4 },
  historyReminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(240, 216, 121, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 4,
  },
  historyReminderText: { color: '#f0d879', fontSize: 11 },
  dossierBox: {
    gap: 8, marginTop: 10, padding: 10,
    borderRadius: 10, borderWidth: 1, borderColor: '#303744', backgroundColor: '#0d1118',
  },
  dossierTag: { color: '#e6c65a', fontSize: 11, fontWeight: '700', marginBottom: 2 },
  linkBox: {
    gap: 8, marginHorizontal: 16, marginTop: 8, marginBottom: 12, padding: 12,
    borderRadius: 10, borderWidth: 1, borderColor: '#303744', backgroundColor: '#0d1118',
  },
  linkInput: {
    backgroundColor: '#07090e', color: '#f4f1ea', borderRadius: 8, borderWidth: 1, borderColor: '#303744',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  },
  linkError: { color: '#f87171', fontSize: 13 },
  followupRow: { gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#303744' },
  followupName: { color: '#f4f1ea', fontSize: 14, fontWeight: '600' },
  importPickRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 0, marginBottom: 8 },
  importPickBtn: { borderWidth: 1, borderColor: '#303744', borderRadius: 9, paddingVertical: 9, paddingHorizontal: 12 },
  importPickText: { color: '#f4f1ea', fontSize: 13, fontWeight: '600' },
  dossierLine: { color: '#b9c0cc', fontSize: 13, lineHeight: 18 },
  dossierBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#e6c65a',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 9,
  },
  dossierBtnText: { color: '#11130f', fontSize: 13, fontWeight: '700' },
  openCalcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#e6c65a',
    borderRadius: 8,
    paddingVertical: 8,
    marginTop: 10,
  },
  openCalcBtnText: { color: '#07090e', fontSize: 13, fontWeight: '700' },
  
  // Modal Common
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    borderBottomWidth: 1, 
    borderBottomColor: '#303744',
  },
  modalTitle: { color: '#f4f1ea', fontSize: 20, fontWeight: 'bold' },
  
  // Import Modal
  importModalContent: { 
    backgroundColor: '#07090e', 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  importModalBody: { padding: 20 },
  importDescription: { color: '#9aa3b1', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  importOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111722',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  importOptionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(230, 198, 90, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  importOptionInfo: { flex: 1, marginLeft: 14 },
  importOptionTitle: { color: '#f4f1ea', fontSize: 16, fontWeight: '600' },
  importOptionDesc: { color: '#9aa3b1', fontSize: 13, marginTop: 2 },
  importInstructions: {
    backgroundColor: '#111722',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  importInstructionsTitle: { color: '#e6c65a', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  importInstructionsText: { color: '#9aa3b1', fontSize: 13, lineHeight: 20 },
  closeButton: {
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#9aa3b1',
    alignItems: 'center',
  },
  closeButtonText: { color: '#9aa3b1', fontSize: 16, fontWeight: '600' },
  
  // Contacts Modal
  contactsModalContent: { 
    backgroundColor: '#07090e', 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    maxHeight: '85%', 
    paddingBottom: 40,
  },
  contactsList: { paddingHorizontal: 20 },
  contactItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#111722', 
    borderRadius: 12, 
    padding: 12, 
    marginBottom: 8,
  },
  contactAvatar: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: '#e6c65a', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  contactAvatarText: { color: '#07090e', fontSize: 18, fontWeight: 'bold' },
  contactDetails: { flex: 1, marginLeft: 12 },
  contactName: { color: '#f4f1ea', fontSize: 16, fontWeight: '600' },
  contactPhone: { color: '#9aa3b1', fontSize: 13, marginTop: 2 },
  contactEmail: { color: '#8a93a1', fontSize: 12, marginTop: 1 },
  
  // Client Modal
  clientModalContent: {
    backgroundColor: '#07090e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 40,
  },
  clientModalBody: { padding: 20 },
  clientModalInfo: { marginBottom: 20 },
  clientModalContact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  clientModalContactText: { color: '#e6c65a', fontSize: 16 },
  newQuoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e6c65a',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  newQuoteButtonText: { color: '#07090e', fontSize: 16, fontWeight: '600' },
  clientModalSectionTitle: { color: '#f4f1ea', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  submissionCard: {
    backgroundColor: '#111722',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  submissionCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  submissionCardInfo: {
    flex: 1,
  },
  deleteSubmissionBtn: {
    padding: 8,
    marginLeft: 8,
  },
  submissionVehicle: { color: '#e6c65a', fontSize: 14, fontWeight: '600' },
  submissionPayment: { color: '#f4f1ea', fontSize: 14, marginTop: 4 },
  submissionDate: { color: '#9aa3b1', fontSize: 12, marginTop: 4 },
  deleteHistoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderWidth: 1,
    borderColor: '#FF6B6B',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    gap: 8,
  },
  deleteHistoryButtonText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Follow-up Modal
  followUpModalContent: {
    backgroundColor: '#07090e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  followUpForm: { padding: 20 },
  followUpLabel: { color: '#f4f1ea', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  followUpInput: {
    backgroundColor: '#111722',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#f4f1ea',
    fontSize: 16,
    marginBottom: 16,
  },
  followUpTextarea: { minHeight: 100, textAlignVertical: 'top' },
  followUpButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#9aa3b1',
    alignItems: 'center',
  },
  cancelButtonText: { color: '#9aa3b1', fontSize: 16, fontWeight: '600' },
  saveButton: {
    flex: 1,
    backgroundColor: '#e6c65a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: { color: '#07090e', fontSize: 16, fontWeight: '600' },
});
