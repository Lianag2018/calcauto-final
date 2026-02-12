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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Contacts from 'expo-contacts';

// Import i18n
import { Language, saveLanguage, loadLanguage } from '../../utils/i18n';
import frTranslations from '../../locales/fr.json';
import enTranslations from '../../locales/en.json';
import { LanguageSelector } from '../../components/LanguageSelector';

const translations = {
  fr: frTranslations,
  en: enTranslations,
};

// Storage keys
const SUBMISSIONS_KEY = 'calcauto_submissions';

interface Submission {
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  vehicle: string;
  price: number;
  term: number;
  payment: number;
  date: string;
  contactId?: string;
}

interface ContactData {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export default function ClientsScreen() {
  const router = useRouter();
  const [lang, setLang] = useState<Language>('fr');
  const t = translations[lang];
  
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [contacts, setContacts] = useState<ContactData[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<ContactData[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // New contact modal
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [savingContact, setSavingContact] = useState(false);

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

  // Request contacts permission
  const requestPermission = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    setHasPermission(status === 'granted');
    if (status === 'granted') {
      loadContacts();
    }
  };

  // Load contacts from device
  const loadContacts = async () => {
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.Emails,
          Contacts.Fields.PhoneNumbers,
        ],
        sort: Contacts.SortTypes.FirstName,
      });

      const formattedContacts: ContactData[] = data
        .filter(c => c.name || c.firstName || c.lastName)
        .map(contact => ({
          id: contact.id || String(Math.random()),
          name: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.emails?.[0]?.email,
          phone: contact.phoneNumbers?.[0]?.number,
        }));

      setContacts(formattedContacts);
      setFilteredContacts(formattedContacts);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  // Load submissions from storage
  const loadSubmissions = async () => {
    try {
      const stored = await AsyncStorage.getItem(SUBMISSIONS_KEY);
      if (stored) {
        setSubmissions(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading submissions:', error);
    }
  };

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      
      // Check permission
      const { status } = await Contacts.getPermissionsAsync();
      setHasPermission(status === 'granted');
      
      if (status === 'granted') {
        await loadContacts();
      }
      
      await loadSubmissions();
      setLoading(false);
    };
    
    init();
  }, []);

  // Filter contacts based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredContacts(contacts);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = contacts.filter(c => 
        c.name.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query) ||
        c.phone?.includes(query)
      );
      setFilteredContacts(filtered);
    }
  }, [searchQuery, contacts]);

  // Refresh
  const onRefresh = async () => {
    setRefreshing(true);
    if (hasPermission) {
      await loadContacts();
    }
    await loadSubmissions();
    setRefreshing(false);
  };

  // Create new contact in device
  const createContact = async () => {
    if (!newFirstName.trim() && !newLastName.trim()) {
      Alert.alert('Erreur', lang === 'fr' ? 'Veuillez entrer un nom' : 'Please enter a name');
      return;
    }
    if (!newPhone.trim()) {
      Alert.alert('Erreur', t.email.invalidPhone);
      return;
    }

    setSavingContact(true);
    try {
      const contact: Contacts.Contact = {
        contactType: Contacts.ContactTypes.Person,
        firstName: newFirstName,
        lastName: newLastName,
        phoneNumbers: newPhone ? [{ number: newPhone, label: 'mobile' }] : undefined,
        emails: newEmail ? [{ email: newEmail, label: 'work' }] : undefined,
      };

      const contactId = await Contacts.addContactAsync(contact);
      
      if (Platform.OS === 'web') {
        alert('✅ ' + t.clients.savedToContacts);
      } else {
        Alert.alert('✅', t.clients.savedToContacts);
      }

      // Reload contacts
      await loadContacts();
      
      // Reset form and close modal
      setNewFirstName('');
      setNewLastName('');
      setNewPhone('');
      setNewEmail('');
      setShowNewContactModal(false);

      // Navigate to calculator with this contact
      router.push({
        pathname: '/(tabs)',
        params: {
          clientName: `${newFirstName} ${newLastName}`.trim(),
          clientEmail: newEmail,
          clientPhone: newPhone,
        },
      });
    } catch (error) {
      console.error('Error creating contact:', error);
      Alert.alert('Erreur', lang === 'fr' ? 'Impossible de créer le contact' : 'Could not create contact');
    } finally {
      setSavingContact(false);
    }
  };

  // Select existing contact and go to calculator
  const selectContact = (contact: ContactData) => {
    router.push({
      pathname: '/(tabs)',
      params: {
        clientName: contact.name,
        clientEmail: contact.email || '',
        clientPhone: contact.phone || '',
        contactId: contact.id,
      },
    });
  };

  // Call contact
  const callContact = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  // Email contact
  const emailContact = (email: string) => {
    Linking.openURL(`mailto:${email}`);
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ECDC4" />
          <Text style={styles.loadingText}>{t.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t.clients.title}</Text>
          <Text style={styles.headerSubtitle}>{t.clients.subtitle}</Text>
        </View>
        <View style={styles.headerActions}>
          <LanguageSelector
            currentLanguage={lang}
            onLanguageChange={handleLanguageChange}
          />
        </View>
      </View>

      {/* Permission required screen */}
      {hasPermission === false && (
        <View style={styles.permissionContainer}>
          <Ionicons name="people-outline" size={64} color="#4ECDC4" />
          <Text style={styles.permissionTitle}>{t.clients.permissionRequired}</Text>
          <Text style={styles.permissionText}>{t.clients.permissionMessage}</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>{t.clients.grantPermission}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main content */}
      {hasPermission && (
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
          {/* Search bar */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#888" />
            <TextInput
              style={styles.searchInput}
              placeholder={t.clients.searchPlaceholder}
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

          {/* Add new contact button */}
          <TouchableOpacity
            style={styles.addContactButton}
            onPress={() => setShowNewContactModal(true)}
          >
            <Ionicons name="person-add" size={24} color="#4ECDC4" />
            <Text style={styles.addContactText}>{t.clients.newContact}</Text>
          </TouchableOpacity>

          {/* Contacts list */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t.clients.selectFromContacts} ({filteredContacts.length})
            </Text>
            
            {filteredContacts.length === 0 ? (
              <Text style={styles.emptyText}>{t.clients.noContacts}</Text>
            ) : (
              filteredContacts.slice(0, 50).map((contact) => (
                <TouchableOpacity
                  key={contact.id}
                  style={styles.contactCard}
                  onPress={() => selectContact(contact)}
                >
                  <View style={styles.contactAvatar}>
                    <Text style={styles.contactInitial}>
                      {contact.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    {contact.phone && (
                      <Text style={styles.contactDetail}>📱 {contact.phone}</Text>
                    )}
                    {contact.email && (
                      <Text style={styles.contactDetail}>✉️ {contact.email}</Text>
                    )}
                  </View>
                  <View style={styles.contactActions}>
                    {contact.phone && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          callContact(contact.phone!);
                        }}
                      >
                        <Ionicons name="call" size={18} color="#4ECDC4" />
                      </TouchableOpacity>
                    )}
                    {contact.email && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          emailContact(contact.email!);
                        }}
                      >
                        <Ionicons name="mail" size={18} color="#4ECDC4" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#666" />
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Recent submissions */}
          {submissions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t.clients.recentSubmissions}</Text>
              {submissions.slice(0, 10).map((sub) => (
                <View key={sub.id} style={styles.submissionCard}>
                  <View style={styles.submissionHeader}>
                    <Text style={styles.submissionName}>{sub.clientName}</Text>
                    <Text style={styles.submissionDate}>{formatDate(sub.date)}</Text>
                  </View>
                  <Text style={styles.submissionVehicle}>{sub.vehicle}</Text>
                  <View style={styles.submissionDetails}>
                    <Text style={styles.submissionPrice}>
                      {formatCurrency(sub.price)} • {sub.term} {t.term.months}
                    </Text>
                    <Text style={styles.submissionPayment}>
                      {formatCurrency(sub.payment)}/mois
                    </Text>
                  </View>
                  <View style={styles.submissionActions}>
                    {sub.clientPhone && (
                      <TouchableOpacity
                        style={styles.submissionActionButton}
                        onPress={() => callContact(sub.clientPhone)}
                      >
                        <Ionicons name="call" size={16} color="#4ECDC4" />
                        <Text style={styles.submissionActionText}>{t.clients.call}</Text>
                      </TouchableOpacity>
                    )}
                    {sub.clientEmail && (
                      <TouchableOpacity
                        style={styles.submissionActionButton}
                        onPress={() => emailContact(sub.clientEmail)}
                      >
                        <Ionicons name="mail" size={16} color="#4ECDC4" />
                        <Text style={styles.submissionActionText}>{t.clients.sendEmail}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* New Contact Modal */}
      <Modal
        visible={showNewContactModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewContactModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t.clients.newContact}</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowNewContactModal(false)}
              >
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>{t.clients.firstName}</Text>
              <TextInput
                style={styles.input}
                placeholder="Jean"
                placeholderTextColor="#666"
                value={newFirstName}
                onChangeText={setNewFirstName}
              />

              <Text style={styles.inputLabel}>{t.clients.lastName}</Text>
              <TextInput
                style={styles.input}
                placeholder="Dupont"
                placeholderTextColor="#666"
                value={newLastName}
                onChangeText={setNewLastName}
              />

              <Text style={styles.inputLabel}>{t.clients.phone} *</Text>
              <TextInput
                style={styles.input}
                placeholder="514-555-1234"
                placeholderTextColor="#666"
                value={newPhone}
                onChangeText={setNewPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>{t.clients.email}</Text>
              <TextInput
                style={styles.input}
                placeholder="client@email.com"
                placeholderTextColor="#666"
                value={newEmail}
                onChangeText={setNewEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowNewContactModal(false)}
              >
                <Text style={styles.cancelButtonText}>{t.email.cancel}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, savingContact && styles.saveButtonDisabled]}
                disabled={savingContact}
                onPress={createContact}
              >
                {savingContact ? (
                  <ActivityIndicator size="small" color="#1a1a2e" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#1a1a2e" />
                    <Text style={styles.saveButtonText}>{t.clients.save}</Text>
                  </>
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
    color: '#888',
    marginTop: 12,
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
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 14,
    color: '#888',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  permissionButtonText: {
    color: '#1a1a2e',
    fontWeight: '600',
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: '#fff',
  },
  addContactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(78, 205, 196, 0.15)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#4ECDC4',
    borderStyle: 'dashed',
  },
  addContactText: {
    color: '#4ECDC4',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
    padding: 20,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactInitial: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  contactDetail: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  contactActions: {
    flexDirection: 'row',
    marginRight: 8,
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  submissionCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  submissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  submissionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  submissionDate: {
    fontSize: 12,
    color: '#888',
  },
  submissionVehicle: {
    fontSize: 14,
    color: '#4ECDC4',
    marginBottom: 8,
  },
  submissionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  submissionPrice: {
    fontSize: 13,
    color: '#aaa',
  },
  submissionPayment: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4ECDC4',
  },
  submissionActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#3d3d54',
    paddingTop: 12,
    gap: 12,
  },
  submissionActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(78, 205, 196, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  submissionActionText: {
    color: '#4ECDC4',
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalClose: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
});
