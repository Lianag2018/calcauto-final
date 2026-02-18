import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';

// Import contacts only for native platforms
let Contacts: any = null;
if (Platform.OS !== 'web') {
  Contacts = require('expo-contacts');
}

import { Language, saveLanguage, loadLanguage } from '../../utils/i18n';
import { LanguageSelector } from '../../components/LanguageSelector';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

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
}

interface Client {
  name: string;
  email: string;
  phone: string;
  submissions: Submission[];
  last_submission_date: string;
  next_reminder: string | null;
  has_pending_reminder: boolean;
}

interface PhoneContact {
  id: string;
  name: string;
  phone: string;
  email: string;
}

const crmTranslations = {
  fr: {
    title: 'CRM',
    remindersCount: 'rappel(s) à faire',
    tabs: {
      clients: 'Clients',
      reminders: 'Rappels',
      offers: 'Offres',
      history: 'Hist.',
    },
    search: 'Rechercher par nom ou téléphone...',
    add: 'Ajouter',
    import: 'Importer',
    noClients: 'Aucun client',
    noReminders: 'Aucun rappel',
    reminderFor: 'Rappel pour',
    dueToday: "Aujourd'hui",
    dueTomorrow: 'Demain',
    overdue: 'En retard',
    inDays: 'Dans {n} jours',
    markDone: 'Marquer comme fait',
    call: 'Appeler',
    edit: 'Modifier',
    delete: 'Supprimer',
    loading: 'Chargement...',
    noData: 'Aucune donnée',
    goToCalculator: 'Aller au calculateur',
    webNotSupported: 'Import de contacts non disponible sur le web',
    permissionDenied: 'Permission refusée',
    selectContact: 'Sélectionner un contact',
    phoneContacts: 'Contacts téléphone',
    noContactsFound: 'Aucun contact trouvé',
  },
  en: {
    title: 'CRM',
    remindersCount: 'reminder(s) to do',
    tabs: {
      clients: 'Clients',
      reminders: 'Reminders',
      offers: 'Offers',
      history: 'Hist.',
    },
    search: 'Search by name or phone...',
    add: 'Add',
    import: 'Import',
    noClients: 'No clients',
    noReminders: 'No reminders',
    reminderFor: 'Reminder for',
    dueToday: 'Today',
    dueTomorrow: 'Tomorrow',
    overdue: 'Overdue',
    inDays: 'In {n} days',
    markDone: 'Mark as done',
    call: 'Call',
    edit: 'Edit',
    delete: 'Delete',
    loading: 'Loading...',
    noData: 'No data',
    goToCalculator: 'Go to calculator',
    webNotSupported: 'Contact import not available on web',
    permissionDenied: 'Permission denied',
    selectContact: 'Select a contact',
    phoneContacts: 'Phone contacts',
    noContactsFound: 'No contacts found',
  }
};

type TabType = 'clients' | 'reminders' | 'offers' | 'history';

export default function ClientsScreen() {
  const router = useRouter();
  const [lang, setLang] = useState<Language>('fr');
  const crm = crmTranslations[lang];
  
  const [activeTab, setActiveTab] = useState<TabType>('clients');
  const [clients, setClients] = useState<Client[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Reminders
  const [reminders, setReminders] = useState<Submission[]>([]);
  const [remindersCount, setRemindersCount] = useState(0);
  
  // Contact import
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<PhoneContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactSearch, setContactSearch] = useState('');

  useEffect(() => { loadLanguage().then(setLang); }, []);
  const handleLanguageChange = useCallback((newLang: Language) => { setLang(newLang); saveLanguage(newLang); }, []);

  const loadData = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/submissions`);
      const allSubmissions: Submission[] = response.data;
      setSubmissions(allSubmissions);
      
      // Build clients from submissions
      const clientsMap = new Map<string, Submission[]>();
      for (const sub of allSubmissions) {
        const key = sub.client_phone || sub.client_email || sub.client_name;
        if (!clientsMap.has(key)) clientsMap.set(key, []);
        clientsMap.get(key)!.push(sub);
      }
      
      const clientsArray: Client[] = [];
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
      
      clientsArray.sort((a, b) => a.name.localeCompare(b.name));
      setClients(clientsArray);
      setFilteredClients(clientsArray);
      
      // Get pending reminders
      const pendingReminders = allSubmissions.filter(s => s.reminder_date && !s.reminder_done);
      setReminders(pendingReminders);
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
    if (!searchQuery.trim()) {
      setFilteredClients(clients);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredClients(clients.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.phone?.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query)
      ));
    }
  }, [searchQuery, clients]);

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

  const callContact = (phone: string) => Linking.openURL(`tel:${phone}`);
  const emailContact = (email: string) => Linking.openURL(`mailto:${email}`);

  const markReminderDone = async (submissionId: string) => {
    try {
      await axios.put(`${API_URL}/api/submissions/${submissionId}/done`);
      await loadData();
      Platform.OS === 'web' ? alert('✅ Rappel complété!') : Alert.alert('✅', 'Rappel complété!');
    } catch (err) {
      console.error('Error marking done:', err);
    }
  };

  const deleteClient = async (clientPhone: string) => {
    const confirm = Platform.OS === 'web' 
      ? window.confirm('Supprimer ce client?')
      : await new Promise(resolve => Alert.alert('Supprimer', 'Supprimer ce client?', [
          { text: 'Annuler', onPress: () => resolve(false) },
          { text: 'Supprimer', style: 'destructive', onPress: () => resolve(true) }
        ]));
    
    if (confirm) {
      // In real app, would delete from API
      setClients(prev => prev.filter(c => c.phone !== clientPhone));
      setFilteredClients(prev => prev.filter(c => c.phone !== clientPhone));
    }
  };

  // Import contacts from phone
  const importContacts = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Info', crm.webNotSupported);
      return;
    }
    
    if (!Contacts) return;
    
    setLoadingContacts(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission', crm.permissionDenied);
        setLoadingContacts(false);
        return;
      }
      
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
      });
      
      const formattedContacts: PhoneContact[] = data
        .filter((c: any) => c.name && (c.phoneNumbers?.length > 0 || c.emails?.length > 0))
        .map((c: any) => ({
          id: c.id,
          name: c.name || '',
          phone: c.phoneNumbers?.[0]?.number || '',
          email: c.emails?.[0]?.email || '',
        }))
        .sort((a: PhoneContact, b: PhoneContact) => a.name.localeCompare(b.name));
      
      setPhoneContacts(formattedContacts);
      setShowContactsModal(true);
    } catch (err) {
      console.error('Error loading contacts:', err);
    } finally {
      setLoadingContacts(false);
    }
  };

  const selectContact = (contact: PhoneContact) => {
    setShowContactsModal(false);
    router.push({
      pathname: '/(tabs)',
      params: {
        clientName: contact.name,
        clientEmail: contact.email,
        clientPhone: contact.phone,
      },
    });
  };

  const filteredPhoneContacts = contactSearch.trim()
    ? phoneContacts.filter(c =>
        c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
        c.phone.includes(contactSearch)
      )
    : phoneContacts;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ECDC4" />
          <Text style={styles.loadingText}>{crm.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderClientsTab = () => (
    <ScrollView 
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ECDC4" />}
    >
      {filteredClients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color="#4ECDC4" />
          <Text style={styles.emptyText}>{crm.noClients}</Text>
          <TouchableOpacity style={styles.goToCalcButton} onPress={() => router.push('/(tabs)')}>
            <Text style={styles.goToCalcText}>{crm.goToCalculator}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        filteredClients.map((client, index) => (
          <View key={index} style={styles.clientCard}>
            <View style={styles.clientRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{client.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>{client.name.toUpperCase()}</Text>
                <Text style={styles.clientPhone}>{client.phone}</Text>
              </View>
              <View style={styles.clientActions}>
                {client.phone && (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => callContact(client.phone)}>
                    <Ionicons name="call" size={18} color="#4ECDC4" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.actionBtn} onPress={() => router.push({ pathname: '/(tabs)', params: { clientName: client.name, clientEmail: client.email, clientPhone: client.phone }})}>
                  <Ionicons name="pencil" size={18} color="#888" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => deleteClient(client.phone)}>
                  <Ionicons name="trash" size={18} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderRemindersTab = () => (
    <ScrollView 
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ECDC4" />}
    >
      {reminders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-off-outline" size={64} color="#888" />
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
              {reminder.notes && <Text style={styles.reminderNotes}>{reminder.notes}</Text>}
              <View style={styles.reminderActions}>
                {reminder.client_phone && (
                  <TouchableOpacity style={styles.reminderBtn} onPress={() => callContact(reminder.client_phone)}>
                    <Ionicons name="call" size={16} color="#4ECDC4" />
                    <Text style={styles.reminderBtnText}>{crm.call}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.reminderBtn, styles.reminderBtnDone]} onPress={() => markReminderDone(reminder.id)}>
                  <Ionicons name="checkmark" size={16} color="#1a1a2e" />
                  <Text style={styles.reminderBtnTextDone}>{crm.markDone}</Text>
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
    <ScrollView style={styles.tabContent}>
      <View style={styles.emptyContainer}>
        <Ionicons name="pricetag-outline" size={64} color="#888" />
        <Text style={styles.emptyText}>{crm.noData}</Text>
      </View>
    </ScrollView>
  );

  const renderHistoryTab = () => (
    <ScrollView 
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ECDC4" />}
    >
      {submissions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color="#888" />
          <Text style={styles.emptyText}>{crm.noData}</Text>
        </View>
      ) : (
        submissions.slice(0, 20).map((sub, index) => (
          <View key={index} style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyClient}>{sub.client_name}</Text>
              <Text style={styles.historyDate}>
                {new Date(sub.submission_date).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
              </Text>
            </View>
            <Text style={styles.historyVehicle}>
              {sub.vehicle_brand} {sub.vehicle_model} {sub.vehicle_year}
            </Text>
            <Text style={styles.historyPayment}>
              ${sub.payment_monthly.toFixed(0)}/mois • {sub.term} mois
            </Text>
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
              <Ionicons name="warning" size={14} color="#FFD93D" />
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
          <Ionicons name="people" size={18} color={activeTab === 'clients' ? '#4ECDC4' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'clients' && styles.tabTextActive]}>{crm.tabs.clients}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'reminders' && styles.tabActive]}
          onPress={() => setActiveTab('reminders')}
        >
          <Ionicons name="notifications" size={18} color={activeTab === 'reminders' ? '#4ECDC4' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'reminders' && styles.tabTextActive]}>
            {crm.tabs.reminders} {remindersCount > 0 && `(${remindersCount})`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'offers' && styles.tabActive]}
          onPress={() => setActiveTab('offers')}
        >
          <Ionicons name="pricetag" size={18} color={activeTab === 'offers' ? '#4ECDC4' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'offers' && styles.tabTextActive]}>{crm.tabs.offers}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons name="document-text" size={18} color={activeTab === 'history' ? '#4ECDC4' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>{crm.tabs.history}</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder={crm.search}
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => router.push('/(tabs)')}
        >
          <Ionicons name="add" size={20} color="#1a1a2e" />
          <Text style={styles.addButtonText}>{crm.add}</Text>
        </TouchableOpacity>
        {Platform.OS !== 'web' && (
          <TouchableOpacity 
            style={styles.importButton}
            onPress={importContacts}
            disabled={loadingContacts}
          >
            {loadingContacts ? (
              <ActivityIndicator size="small" color="#1a1a2e" />
            ) : (
              <>
                <Ionicons name="cloud-download" size={20} color="#1a1a2e" />
                <Text style={styles.importButtonText}>{crm.import}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Tab Content */}
      {activeTab === 'clients' && renderClientsTab()}
      {activeTab === 'reminders' && renderRemindersTab()}
      {activeTab === 'offers' && renderOffersTab()}
      {activeTab === 'history' && renderHistoryTab()}

      {/* Contacts Import Modal */}
      <Modal visible={showContactsModal} animationType="slide" transparent={true} onRequestClose={() => setShowContactsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.contactsModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{crm.phoneContacts}</Text>
              <TouchableOpacity onPress={() => setShowContactsModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.contactSearchContainer}>
              <Ionicons name="search" size={20} color="#888" />
              <TextInput
                style={styles.contactSearchInput}
                placeholder={crm.search}
                placeholderTextColor="#666"
                value={contactSearch}
                onChangeText={setContactSearch}
              />
            </View>
            <ScrollView style={styles.contactsList}>
              {filteredPhoneContacts.length === 0 ? (
                <View style={styles.noContactsContainer}>
                  <Ionicons name="people-outline" size={48} color="#666" />
                  <Text style={styles.noContactsText}>{crm.noContactsFound}</Text>
                </View>
              ) : (
                filteredPhoneContacts.map((contact, index) => (
                  <TouchableOpacity key={contact.id || index} style={styles.contactItem} onPress={() => selectContact(contact)}>
                    <View style={styles.contactAvatar}>
                      <Text style={styles.contactAvatarText}>{contact.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.contactDetails}>
                      <Text style={styles.contactName}>{contact.name}</Text>
                      {contact.phone && <Text style={styles.contactPhone}>{contact.phone}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#888" />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#888', marginTop: 12, fontSize: 16 },
  
  // Header
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  remindersBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(255, 217, 61, 0.15)', 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    borderRadius: 20,
    gap: 6,
  },
  remindersBadgeText: { color: '#FFD93D', fontSize: 12, fontWeight: '600' },
  
  // Tabs
  tabsContainer: { 
    flexDirection: 'row', 
    backgroundColor: '#2d2d44',
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
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 6,
  },
  tabActive: { backgroundColor: '#1a1a2e' },
  tabText: { color: '#888', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#4ECDC4' },
  
  // Search
  searchRow: { paddingHorizontal: 16, marginTop: 16 },
  searchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#2d2d44', 
    borderRadius: 12, 
    paddingHorizontal: 16, 
    paddingVertical: 12,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, marginLeft: 10 },
  
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
    backgroundColor: '#4ECDC4', 
    paddingVertical: 12, 
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: { color: '#1a1a2e', fontSize: 16, fontWeight: '600' },
  importButton: { 
    flex: 1,
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: '#FF9F43', 
    paddingVertical: 12, 
    borderRadius: 12,
    gap: 8,
  },
  importButtonText: { color: '#1a1a2e', fontSize: 16, fontWeight: '600' },
  
  // Tab Content
  tabContent: { flex: 1, paddingHorizontal: 16, marginTop: 12 },
  
  // Empty State
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: '#888', fontSize: 16, marginTop: 12 },
  goToCalcButton: { 
    backgroundColor: '#4ECDC4', 
    paddingHorizontal: 24, 
    paddingVertical: 14, 
    borderRadius: 12, 
    marginTop: 20,
  },
  goToCalcText: { color: '#1a1a2e', fontWeight: '600', fontSize: 16 },
  
  // Client Card
  clientCard: { 
    backgroundColor: '#2d2d44', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 10,
  },
  clientRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    backgroundColor: '#4ECDC4', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  avatarText: { color: '#1a1a2e', fontSize: 20, fontWeight: 'bold' },
  clientInfo: { flex: 1, marginLeft: 14 },
  clientName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  clientPhone: { color: '#888', fontSize: 14, marginTop: 2 },
  clientActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    backgroundColor: 'rgba(255,255,255,0.1)', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  
  // Reminder Card
  reminderCard: { 
    backgroundColor: '#2d2d44', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
  },
  reminderOverdue: { borderLeftColor: '#FF6B6B' },
  reminderToday: { borderLeftColor: '#FFD93D' },
  reminderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reminderClient: { color: '#fff', fontSize: 16, fontWeight: '700' },
  reminderDue: { color: '#4ECDC4', fontSize: 13, fontWeight: '600' },
  reminderDueOverdue: { color: '#FF6B6B' },
  reminderVehicle: { color: '#888', fontSize: 14, marginTop: 6 },
  reminderNotes: { color: '#aaa', fontSize: 13, marginTop: 8, fontStyle: 'italic' },
  reminderActions: { flexDirection: 'row', marginTop: 12, gap: 10 },
  reminderBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 14, 
    paddingVertical: 8, 
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4ECDC4',
    gap: 6,
  },
  reminderBtnText: { color: '#4ECDC4', fontSize: 13, fontWeight: '600' },
  reminderBtnDone: { backgroundColor: '#4ECDC4', borderColor: '#4ECDC4' },
  reminderBtnTextDone: { color: '#1a1a2e', fontSize: 13, fontWeight: '600' },
  
  // History Card
  historyCard: { 
    backgroundColor: '#2d2d44', 
    borderRadius: 12, 
    padding: 14, 
    marginBottom: 8,
  },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyClient: { color: '#fff', fontSize: 15, fontWeight: '600' },
  historyDate: { color: '#888', fontSize: 12 },
  historyVehicle: { color: '#4ECDC4', fontSize: 14, marginTop: 4 },
  historyPayment: { color: '#888', fontSize: 13, marginTop: 4 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  contactsModalContent: { 
    backgroundColor: '#1a1a2e', 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    maxHeight: '85%', 
    paddingBottom: 40,
  },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    borderBottomWidth: 1, 
    borderBottomColor: '#2d2d44',
  },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  contactSearchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#2d2d44', 
    borderRadius: 12, 
    marginHorizontal: 20, 
    marginVertical: 16, 
    paddingHorizontal: 16, 
    paddingVertical: 12,
  },
  contactSearchInput: { flex: 1, color: '#fff', fontSize: 16, marginLeft: 10 },
  contactsList: { paddingHorizontal: 20 },
  noContactsContainer: { alignItems: 'center', paddingVertical: 60 },
  noContactsText: { color: '#666', fontSize: 16, marginTop: 12 },
  contactItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#2d2d44', 
    borderRadius: 12, 
    padding: 12, 
    marginBottom: 8,
  },
  contactAvatar: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: '#4ECDC4', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  contactAvatarText: { color: '#1a1a2e', fontSize: 18, fontWeight: 'bold' },
  contactDetails: { flex: 1, marginLeft: 12 },
  contactName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  contactPhone: { color: '#888', fontSize: 13, marginTop: 2 },
});
