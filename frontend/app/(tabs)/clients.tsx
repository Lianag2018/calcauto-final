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

// Import i18n
import { Language, saveLanguage, loadLanguage } from '../../utils/i18n';
import frTranslations from '../../locales/fr.json';
import enTranslations from '../../locales/en.json';
import { LanguageSelector } from '../../components/LanguageSelector';

const translations = {
  fr: frTranslations,
  en: enTranslations,
};

// API URL
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

// Types - adaptés au backend
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
  status: string; // pending, contacted, converted, lost
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

// CRM Translations
const crmTranslations = {
  fr: {
    title: 'CRM - Clients',
    subtitle: 'Suivi des soumissions',
    search: 'Rechercher par nom ou téléphone...',
    noResults: 'Aucun résultat trouvé',
    submissions: 'soumissions',
    lastContact: 'Dernier contact',
    viewDetails: 'Voir détails',
    call: 'Appeler',
    email: 'Email',
    newQuote: 'Nouvelle soumission',
    followUp: 'Suivi',
    followUpDue: 'Suivi à faire',
    followUpScheduled: 'Suivi planifié',
    markDone: 'Marquer comme fait',
    scheduleNew: 'Planifier un suivi',
    scheduleDate: 'Date du suivi',
    addNotes: 'Ajouter des notes...',
    save: 'Sauvegarder',
    cancel: 'Annuler',
    today: 'Aujourd\'hui',
    tomorrow: 'Demain',
    inDays: 'Dans {n} jours',
    overdue: 'En retard',
    vehicle: 'Véhicule',
    payment: 'Paiement',
    months: 'mois',
    option: 'Option',
    sentOn: 'Envoyé le',
    noSubmissions: 'Aucune soumission enregistrée',
    startByCalculator: 'Commencez par créer une soumission dans le calculateur',
    loading: 'Chargement...',
    error: 'Erreur de chargement',
    retry: 'Réessayer',
    status: 'Statut',
    pending: 'En attente',
    contacted: 'Contacté',
    converted: 'Converti',
    lost: 'Perdu',
    reminderDue: 'rappels à faire',
    reminderUpcoming: 'rappels à venir',
  },
  en: {
    title: 'CRM - Clients',
    subtitle: 'Submissions tracking',
    search: 'Search by name or phone...',
    noResults: 'No results found',
    submissions: 'submissions',
    lastContact: 'Last contact',
    viewDetails: 'View details',
    call: 'Call',
    email: 'Email',
    newQuote: 'New submission',
    followUp: 'Follow-up',
    followUpDue: 'Follow-up due',
    followUpScheduled: 'Follow-up scheduled',
    markDone: 'Mark as done',
    scheduleNew: 'Schedule follow-up',
    scheduleDate: 'Follow-up date',
    addNotes: 'Add notes...',
    save: 'Save',
    cancel: 'Cancel',
    today: 'Today',
    tomorrow: 'Tomorrow',
    inDays: 'In {n} days',
    overdue: 'Overdue',
    vehicle: 'Vehicle',
    payment: 'Payment',
    months: 'months',
    option: 'Option',
    sentOn: 'Sent on',
    noSubmissions: 'No submissions recorded',
    startByCalculator: 'Start by creating a submission in the calculator',
    loading: 'Loading...',
    error: 'Loading error',
    retry: 'Retry',
    status: 'Status',
    pending: 'Pending',
    contacted: 'Contacted',
    converted: 'Converted',
    lost: 'Lost',
    reminderDue: 'reminders due',
    reminderUpcoming: 'upcoming reminders',
  }
};

export default function ClientsScreen() {
  const router = useRouter();
  const [lang, setLang] = useState<Language>('fr');
  const t = translations[lang];
  const crm = crmTranslations[lang];
  
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Selected client for details view
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientModal, setShowClientModal] = useState(false);
  
  // Follow-up modal
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  // Load language preference
  useEffect(() => {
    loadLanguage().then((savedLang) => {
      setLang(savedLang);
    });
  }, []);

  const handleLanguageChange = useCallback((newLang: Language) => {
    setLang(newLang);
    saveLanguage(newLang);
  }, []);

  // Load submissions from API
  const loadSubmissions = async () => {
    try {
      setError(null);
      const response = await axios.get(`${API_URL}/api/submissions`);
      
      // Group submissions by client
      const submissionsMap = new Map<string, Submission[]>();
      
      for (const sub of response.data) {
        const key = sub.client_phone || sub.client_email || sub.client_name;
        if (!submissionsMap.has(key)) {
          submissionsMap.set(key, []);
        }
        submissionsMap.get(key)!.push(sub);
      }
      
      // Create clients array
      const clientsArray: Client[] = [];
      submissionsMap.forEach((subs, key) => {
        // Sort submissions by date (newest first)
        const sortedSubs = subs.sort((a, b) => 
          new Date(b.submission_date).getTime() - new Date(a.submission_date).getTime()
        );
        const latestSub = sortedSubs[0];
        
        // Find the next pending reminder
        const pendingReminders = subs.filter(s => s.reminder_date && !s.reminder_done);
        const nextReminder = pendingReminders.length > 0 
          ? pendingReminders.sort((a, b) => 
              new Date(a.reminder_date!).getTime() - new Date(b.reminder_date!).getTime()
            )[0].reminder_date
          : null;
        
        clientsArray.push({
          name: latestSub.client_name,
          email: latestSub.client_email,
          phone: latestSub.client_phone,
          submissions: sortedSubs,
          last_submission_date: latestSub.submission_date,
          next_reminder: nextReminder,
          has_pending_reminder: pendingReminders.length > 0,
        });
      });
      
      // Sort by most recent
      clientsArray.sort((a, b) => 
        new Date(b.last_submission_date).getTime() - new Date(a.last_submission_date).getTime()
      );
      
      setClients(clientsArray);
      setFilteredClients(clientsArray);
    } catch (err) {
      console.error('Error loading submissions:', err);
      setError(crm.error);
      // If API fails, show empty state
      setClients([]);
      setFilteredClients([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadSubmissions();
  }, []);

  // Filter clients based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredClients(clients);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = clients.filter(c => 
        c.name.toLowerCase().includes(query) ||
        c.phone?.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query)
      );
      setFilteredClients(filtered);
    }
  }, [searchQuery, clients]);

  // Refresh
  const onRefresh = () => {
    setRefreshing(true);
    loadSubmissions();
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Get days until follow-up
  const getDaysUntil = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // Get follow-up status text
  const getFollowUpText = (days: number) => {
    if (days < 0) return crm.overdue;
    if (days === 0) return crm.today;
    if (days === 1) return crm.tomorrow;
    return crm.inDays.replace('{n}', String(days));
  };

  // Check if client has pending follow-up
  const hasPendingFollowUp = (client: Client) => {
    return client.has_pending_reminder;
  };

  // Get next follow-up date for client
  const getNextReminderDate = (client: Client): string | null => {
    return client.next_reminder;
  };

  // Call contact
  const callContact = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  // Email contact
  const emailContact = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };

  // Open client details
  const openClientDetails = (client: Client) => {
    setSelectedClient(client);
    setShowClientModal(true);
  };

  // Schedule follow-up
  const openFollowUpModal = (submission: Submission) => {
    setSelectedSubmission(submission);
    // Default to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setFollowUpDate(tomorrow.toISOString().split('T')[0]);
    setFollowUpNotes(submission.notes || '');
    setShowFollowUpModal(true);
  };

  // Save follow-up - utilise l'endpoint backend correct
  const saveFollowUp = async () => {
    if (!selectedSubmission || !followUpDate) return;
    
    setSavingFollowUp(true);
    try {
      // Utiliser l'endpoint PUT pour mettre à jour le reminder
      await axios.put(`${API_URL}/api/submissions/${selectedSubmission.id}/reminder`, {
        reminder_date: new Date(followUpDate).toISOString(),
        notes: followUpNotes,
      });
      
      // Reload data
      await loadSubmissions();
      setShowFollowUpModal(false);
      
      if (Platform.OS === 'web') {
        alert('✅ Suivi planifié!');
      } else {
        Alert.alert('✅', 'Suivi planifié!');
      }
    } catch (err) {
      console.error('Error saving follow-up:', err);
      if (Platform.OS === 'web') {
        alert('❌ Impossible de sauvegarder le suivi');
      } else {
        Alert.alert('Erreur', 'Impossible de sauvegarder le suivi');
      }
    } finally {
      setSavingFollowUp(false);
    }
  };

  // Mark follow-up as done - utilise l'endpoint backend correct
  const markReminderDone = async (submissionId: string, scheduleNew: boolean = false) => {
    try {
      const params = scheduleNew ? `?new_reminder_date=${new Date(Date.now() + 86400000 * 3).toISOString()}` : '';
      await axios.put(`${API_URL}/api/submissions/${submissionId}/done${params}`);
      
      // Reload data
      await loadSubmissions();
      
      if (Platform.OS === 'web') {
        alert('✅ Suivi complété!');
      } else {
        Alert.alert('✅', 'Suivi complété!');
      }
    } catch (err) {
      console.error('Error marking reminder done:', err);
    }
  };

  // Navigate to calculator with client info
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{crm.title}</Text>
          <Text style={styles.headerSubtitle}>{crm.subtitle}</Text>
        </View>
        <View style={styles.headerActions}>
          <LanguageSelector
            currentLanguage={lang}
            onLanguageChange={handleLanguageChange}
          />
        </View>
      </View>

      {/* Search bar */}
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

      {/* Error state */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadSubmissions}>
            <Text style={styles.retryButtonText}>{crm.retry}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Empty state */}
      {!error && clients.length === 0 && (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color="#4ECDC4" />
          <Text style={styles.emptyTitle}>{crm.noSubmissions}</Text>
          <Text style={styles.emptyText}>{crm.startByCalculator}</Text>
          <TouchableOpacity 
            style={styles.goToCalculatorButton}
            onPress={() => router.push('/(tabs)')}
          >
            <Ionicons name="calculator" size={20} color="#1a1a2e" />
            <Text style={styles.goToCalculatorText}>
              {lang === 'fr' ? 'Aller au calculateur' : 'Go to calculator'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Clients list */}
      {!error && clients.length > 0 && (
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
        >
          {filteredClients.length === 0 ? (
            <View style={styles.noResultsContainer}>
              <Ionicons name="search" size={48} color="#666" />
              <Text style={styles.noResultsText}>{crm.noResults}</Text>
            </View>
          ) : (
            filteredClients.map((client, index) => {
              const nextReminderDate = getNextReminderDate(client);
              const daysUntil = nextReminderDate ? getDaysUntil(nextReminderDate) : null;
              
              return (
                <TouchableOpacity
                  key={index}
                  style={styles.clientCard}
                  onPress={() => openClientDetails(client)}
                >
                  <View style={styles.clientHeader}>
                    <View style={styles.clientInfo}>
                      <Text style={styles.clientName}>{client.name}</Text>
                      <Text style={styles.clientPhone}>{client.phone}</Text>
                    </View>
                    <View style={styles.clientBadge}>
                      <Text style={styles.clientBadgeText}>
                        {client.submissions.length} {crm.submissions}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Follow-up indicator */}
                  {nextReminderDate && daysUntil !== null && (
                    <View style={[
                      styles.followUpIndicator,
                      daysUntil < 0 && styles.followUpOverdue,
                      daysUntil === 0 && styles.followUpToday,
                    ]}>
                      <Ionicons 
                        name={daysUntil <= 0 ? "alarm" : "time-outline"} 
                        size={16} 
                        color={daysUntil < 0 ? "#FF6B6B" : daysUntil === 0 ? "#FFD93D" : "#4ECDC4"} 
                      />
                      <Text style={[
                        styles.followUpText,
                        daysUntil < 0 && styles.followUpTextOverdue,
                      ]}>
                        {crm.followUp}: {getFollowUpText(daysUntil)}
                      </Text>
                    </View>
                  )}
                  
                  <View style={styles.clientFooter}>
                    <Text style={styles.lastContactText}>
                      {crm.lastContact}: {formatDate(client.last_submission_date)}
                    </Text>
                    <View style={styles.clientActions}>
                      {client.phone && (
                        <TouchableOpacity 
                          style={styles.actionButton}
                          onPress={(e) => { e.stopPropagation(); callContact(client.phone); }}
                        >
                          <Ionicons name="call" size={18} color="#4ECDC4" />
                        </TouchableOpacity>
                      )}
                      {client.email && (
                        <TouchableOpacity 
                          style={styles.actionButton}
                          onPress={(e) => { e.stopPropagation(); emailContact(client.email); }}
                        >
                          <Ionicons name="mail" size={18} color="#4ECDC4" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Client Details Modal */}
      <Modal
        visible={showClientModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowClientModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedClient?.name}</Text>
              <TouchableOpacity onPress={() => setShowClientModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {/* Client contact info */}
            <View style={styles.modalContactInfo}>
              {selectedClient?.phone && (
                <TouchableOpacity 
                  style={styles.modalContactButton}
                  onPress={() => callContact(selectedClient.phone)}
                >
                  <Ionicons name="call" size={20} color="#4ECDC4" />
                  <Text style={styles.modalContactText}>{selectedClient.phone}</Text>
                </TouchableOpacity>
              )}
              {selectedClient?.email && (
                <TouchableOpacity 
                  style={styles.modalContactButton}
                  onPress={() => emailContact(selectedClient.email)}
                >
                  <Ionicons name="mail" size={20} color="#4ECDC4" />
                  <Text style={styles.modalContactText}>{selectedClient.email}</Text>
                </TouchableOpacity>
              )}
            </View>
            
            {/* New quote button */}
            <TouchableOpacity 
              style={styles.newQuoteButton}
              onPress={() => selectedClient && newQuoteForClient(selectedClient)}
            >
              <Ionicons name="add-circle" size={20} color="#1a1a2e" />
              <Text style={styles.newQuoteButtonText}>{crm.newQuote}</Text>
            </TouchableOpacity>
            
            {/* Submissions list */}
            <Text style={styles.modalSectionTitle}>
              {lang === 'fr' ? 'Historique des soumissions' : 'Submission History'}
            </Text>
            
            <ScrollView style={styles.submissionsList}>
              {selectedClient?.submissions.map((sub, idx) => (
                <View key={idx} style={styles.submissionCard}>
                  <View style={styles.submissionHeader}>
                    <Text style={styles.submissionVehicle}>
                      {sub.vehicle_brand} {sub.vehicle_model} {sub.vehicle_year}
                    </Text>
                    <Text style={styles.submissionDate}>
                      {formatDate(sub.submission_date)}
                    </Text>
                  </View>
                  
                  <View style={styles.submissionDetails}>
                    <View style={styles.submissionDetail}>
                      <Text style={styles.submissionLabel}>{crm.payment}:</Text>
                      <Text style={styles.submissionValue}>
                        {formatCurrency(sub.monthly_payment)}/{crm.months.substring(0,2)}
                      </Text>
                    </View>
                    <View style={styles.submissionDetail}>
                      <Text style={styles.submissionLabel}>{crm.option}:</Text>
                      <Text style={styles.submissionValue}>{sub.option_type}</Text>
                    </View>
                    <View style={styles.submissionDetail}>
                      <Text style={styles.submissionLabel}>Terme:</Text>
                      <Text style={styles.submissionValue}>{sub.term} {crm.months}</Text>
                    </View>
                  </View>
                  
                  {/* Follow-ups */}
                  {sub.follow_ups?.length > 0 && (
                    <View style={styles.followUpsSection}>
                      {sub.follow_ups.filter(f => !f.completed).map((followUp, fIdx) => (
                        <View key={fIdx} style={styles.followUpItem}>
                          <Ionicons name="time" size={16} color="#FFD93D" />
                          <Text style={styles.followUpItemText}>
                            {crm.followUpScheduled}: {formatDate(followUp.scheduled_date)}
                          </Text>
                          <TouchableOpacity
                            style={styles.markDoneButton}
                            onPress={() => markFollowUpDone(sub.id, followUp.id)}
                          >
                            <Ionicons name="checkmark" size={16} color="#4ECDC4" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  
                  {/* Schedule follow-up button */}
                  <TouchableOpacity
                    style={styles.scheduleButton}
                    onPress={() => openFollowUpModal(sub)}
                  >
                    <Ionicons name="calendar" size={16} color="#4ECDC4" />
                    <Text style={styles.scheduleButtonText}>{crm.scheduleNew}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Follow-up Modal */}
      <Modal
        visible={showFollowUpModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowFollowUpModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.followUpModalContent}>
            <Text style={styles.followUpModalTitle}>{crm.scheduleNew}</Text>
            
            <Text style={styles.followUpLabel}>{crm.scheduleDate}</Text>
            <TextInput
              style={styles.followUpInput}
              value={followUpDate}
              onChangeText={setFollowUpDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#666"
            />
            
            {/* Quick date buttons */}
            <View style={styles.quickDateButtons}>
              <TouchableOpacity
                style={styles.quickDateButton}
                onPress={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  setFollowUpDate(d.toISOString().split('T')[0]);
                }}
              >
                <Text style={styles.quickDateText}>{crm.tomorrow}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickDateButton}
                onPress={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 3);
                  setFollowUpDate(d.toISOString().split('T')[0]);
                }}
              >
                <Text style={styles.quickDateText}>+3 {lang === 'fr' ? 'jours' : 'days'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickDateButton}
                onPress={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  setFollowUpDate(d.toISOString().split('T')[0]);
                }}
              >
                <Text style={styles.quickDateText}>+7 {lang === 'fr' ? 'jours' : 'days'}</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.followUpLabel}>Notes</Text>
            <TextInput
              style={[styles.followUpInput, styles.notesInput]}
              value={followUpNotes}
              onChangeText={setFollowUpNotes}
              placeholder={crm.addNotes}
              placeholderTextColor="#666"
              multiline
            />
            
            <View style={styles.followUpActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowFollowUpModal(false)}
              >
                <Text style={styles.cancelButtonText}>{crm.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={saveFollowUp}
                disabled={savingFollowUp}
              >
                {savingFollowUp ? (
                  <ActivityIndicator size="small" color="#1a1a2e" />
                ) : (
                  <Text style={styles.saveButtonText}>{crm.save}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
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
    fontSize: 24,
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
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    marginHorizontal: 20,
    marginVertical: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    marginLeft: 10,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  retryButtonText: {
    color: '#1a1a2e',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  goToCalculatorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  goToCalculatorText: {
    color: '#1a1a2e',
    fontWeight: '600',
    fontSize: 16,
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  noResultsText: {
    color: '#666',
    fontSize: 16,
    marginTop: 12,
  },
  clientCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  clientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  clientPhone: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  clientBadge: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  clientBadgeText: {
    color: '#1a1a2e',
    fontSize: 12,
    fontWeight: '600',
  },
  followUpIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  followUpOverdue: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
  },
  followUpToday: {
    backgroundColor: 'rgba(255, 217, 61, 0.1)',
  },
  followUpText: {
    color: '#4ECDC4',
    fontSize: 13,
  },
  followUpTextOverdue: {
    color: '#FF6B6B',
  },
  clientFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#3d3d54',
  },
  lastContactText: {
    color: '#888',
    fontSize: 12,
  },
  clientActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
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
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalContactInfo: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 16,
  },
  modalContactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d2d44',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  modalContactText: {
    color: '#fff',
    fontSize: 14,
  },
  newQuoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ECDC4',
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  newQuoteButtonText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '600',
  },
  modalSectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  submissionsList: {
    paddingHorizontal: 20,
  },
  submissionCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  submissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  submissionVehicle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  submissionDate: {
    color: '#888',
    fontSize: 12,
  },
  submissionDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 16,
  },
  submissionDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  submissionLabel: {
    color: '#888',
    fontSize: 12,
  },
  submissionValue: {
    color: '#4ECDC4',
    fontSize: 14,
    fontWeight: '500',
  },
  followUpsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#3d3d54',
  },
  followUpItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  followUpItemText: {
    color: '#FFD93D',
    fontSize: 13,
    flex: 1,
  },
  markDoneButton: {
    padding: 6,
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4ECDC4',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 12,
    gap: 6,
  },
  scheduleButtonText: {
    color: '#4ECDC4',
    fontSize: 14,
  },
  followUpModalContent: {
    backgroundColor: '#1a1a2e',
    margin: 20,
    borderRadius: 16,
    padding: 24,
  },
  followUpModalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  followUpLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  followUpInput: {
    backgroundColor: '#2d2d44',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  quickDateButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  quickDateButton: {
    flex: 1,
    backgroundColor: '#2d2d44',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  quickDateText: {
    color: '#4ECDC4',
    fontSize: 13,
  },
  followUpActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#2d2d44',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#4ECDC4',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '600',
  },
});
