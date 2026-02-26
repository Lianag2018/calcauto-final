import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';

import { API_URL } from '../utils/api';

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

const translations = {
  fr: {
    title: 'Gérer les Programmes',
    back: 'Retour',
    addProgram: 'Ajouter un Programme',
    editProgram: 'Modifier le Programme',
    brand: 'Marque',
    model: 'Modèle',
    year: 'Année',
    consumerCash: 'Rabais Consommateur ($)',
    specialNotes: 'Notes Spéciales',
    financingTerms: 'Termes de Financement',
    termMonths: 'Mois',
    interestRate: 'Taux (%)',
    rebateAmount: 'Rabais ($)',
    addTerm: 'Ajouter un terme',
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    confirmDelete: 'Confirmer la suppression',
    deleteMessage: 'Êtes-vous sûr de vouloir supprimer ce programme?',
    noPrograms: 'Aucun programme disponible',
    loading: 'Chargement...',
  },
  en: {
    title: 'Manage Programs',
    back: 'Back',
    addProgram: 'Add Program',
    editProgram: 'Edit Program',
    brand: 'Brand',
    model: 'Model',
    year: 'Year',
    consumerCash: 'Consumer Cash ($)',
    specialNotes: 'Special Notes',
    financingTerms: 'Financing Terms',
    termMonths: 'Months',
    interestRate: 'Rate (%)',
    rebateAmount: 'Rebate ($)',
    addTerm: 'Add term',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    confirmDelete: 'Confirm Delete',
    deleteMessage: 'Are you sure you want to delete this program?',
    noPrograms: 'No programs available',
    loading: 'Loading...',
  },
};

const DEFAULT_TERMS: FinancingTerm[] = [
  { term_months: 36, interest_rate: 0, rebate_amount: 0 },
  { term_months: 48, interest_rate: 0, rebate_amount: 0 },
  { term_months: 60, interest_rate: 0, rebate_amount: 0 },
  { term_months: 72, interest_rate: 1.99, rebate_amount: 0 },
  { term_months: 84, interest_rate: 2.99, rebate_amount: 0 },
  { term_months: 96, interest_rate: 4.99, rebate_amount: 0 },
];

export default function ManageScreen() {
  const router = useRouter();
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  const t = translations[lang];

  const [programs, setPrograms] = useState<VehicleProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProgram, setEditingProgram] = useState<VehicleProgram | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [consumerCash, setConsumerCash] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');
  const [financingTerms, setFinancingTerms] = useState<FinancingTerm[]>(DEFAULT_TERMS);

  const loadPrograms = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/programs`);
      setPrograms(response.data);
    } catch (error) {
      console.error('Error loading programs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);

  const resetForm = () => {
    setBrand('');
    setModel('');
    setYear('');
    setConsumerCash('');
    setSpecialNotes('');
    setFinancingTerms(DEFAULT_TERMS);
    setEditingProgram(null);
  };

  const openAddModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (program: VehicleProgram) => {
    setEditingProgram(program);
    setBrand(program.brand);
    setModel(program.model);
    setYear(program.year.toString());
    setConsumerCash(program.consumer_cash.toString());
    setSpecialNotes(program.special_notes);
    setFinancingTerms(program.financing_terms);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!brand || !model || !year) {
      return;
    }

    setSaving(true);
    try {
      const programData = {
        brand,
        model,
        year: parseInt(year),
        consumer_cash: parseFloat(consumerCash) || 0,
        special_notes: specialNotes,
        financing_terms: financingTerms,
      };

      if (editingProgram) {
        await axios.put(`${API_URL}/api/programs/${editingProgram.id}`, programData);
      } else {
        await axios.post(`${API_URL}/api/programs`, programData);
      }

      await loadPrograms();
      setModalVisible(false);
      resetForm();
    } catch (error) {
      console.error('Error saving program:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (program: VehicleProgram) => {
    if (Platform.OS === 'web') {
      if (window.confirm(t.deleteMessage)) {
        deleteProgram(program.id);
      }
    } else {
      Alert.alert(t.confirmDelete, t.deleteMessage, [
        { text: t.cancel, style: 'cancel' },
        { text: t.delete, style: 'destructive', onPress: () => deleteProgram(program.id) },
      ]);
    }
  };

  const deleteProgram = async (programId: string) => {
    try {
      await axios.delete(`${API_URL}/api/programs/${programId}`);
      await loadPrograms();
    } catch (error) {
      console.error('Error deleting program:', error);
    }
  };

  const updateTerm = (index: number, field: keyof FinancingTerm, value: string) => {
    const newTerms = [...financingTerms];
    newTerms[index] = {
      ...newTerms[index],
      [field]: parseFloat(value) || 0,
    };
    setFinancingTerms(newTerms);
  };

  const addTerm = () => {
    const lastTerm = financingTerms[financingTerms.length - 1];
    setFinancingTerms([
      ...financingTerms,
      {
        term_months: lastTerm ? lastTerm.term_months + 12 : 36,
        interest_rate: 4.99,
        rebate_amount: 0,
      },
    ]);
  };

  const removeTerm = (index: number) => {
    if (financingTerms.length > 1) {
      setFinancingTerms(financingTerms.filter((_, i) => i !== index));
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
          <Text style={styles.backText}>{t.back}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.title}</Text>
        <TouchableOpacity
          style={styles.langButton}
          onPress={() => setLang(lang === 'fr' ? 'en' : 'fr')}
        >
          <Text style={styles.langButtonText}>{lang === 'fr' ? 'EN' : 'FR'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ECDC4" />
          <Text style={styles.loadingText}>{t.loading}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Add Button */}
          <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
            <Ionicons name="add-circle" size={24} color="#1a1a2e" />
            <Text style={styles.addButtonText}>{t.addProgram}</Text>
          </TouchableOpacity>

          {/* Programs List */}
          {programs.length === 0 ? (
            <Text style={styles.noDataText}>{t.noPrograms}</Text>
          ) : (
            programs.map((program) => (
              <View key={program.id} style={styles.programCard}>
                <View style={styles.programHeader}>
                  <View>
                    <Text style={styles.programBrand}>{program.brand}</Text>
                    <Text style={styles.programModel}>
                      {program.model} {program.year}
                    </Text>
                  </View>
                  <View style={styles.programActions}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => openEditModal(program)}
                    >
                      <Ionicons name="pencil" size={20} color="#4ECDC4" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDelete(program)}
                    >
                      <Ionicons name="trash" size={20} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                </View>

                {program.consumer_cash > 0 && (
                  <Text style={styles.programCash}>
                    {t.consumerCash}: {formatCurrency(program.consumer_cash)}
                  </Text>
                )}

                {program.special_notes && (
                  <Text style={styles.programNotes}>{program.special_notes}</Text>
                )}

                <View style={styles.termsGrid}>
                  {program.financing_terms.map((term, idx) => (
                    <View key={idx} style={styles.termBadge}>
                      <Text style={styles.termMonths}>{term.term_months}m</Text>
                      <Text style={styles.termRate}>{term.interest_rate}%</Text>
                      {term.rebate_amount > 0 && (
                        <Text style={styles.termRebate}>
                          -{formatCurrency(term.rebate_amount)}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingProgram ? t.editProgram : t.addProgram}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll}>
                {/* Basic Info */}
                <View style={styles.formRow}>
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>{t.brand}</Text>
                    <TextInput
                      style={styles.formInput}
                      value={brand}
                      onChangeText={setBrand}
                      placeholder="Ram, Jeep, Dodge..."
                      placeholderTextColor="#666"
                    />
                  </View>
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>{t.model}</Text>
                    <TextInput
                      style={styles.formInput}
                      value={model}
                      onChangeText={setModel}
                      placeholder="1500 DT, Wrangler..."
                      placeholderTextColor="#666"
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>{t.year}</Text>
                    <TextInput
                      style={styles.formInput}
                      value={year}
                      onChangeText={setYear}
                      placeholder="2026"
                      placeholderTextColor="#666"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>{t.consumerCash}</Text>
                    <TextInput
                      style={styles.formInput}
                      value={consumerCash}
                      onChangeText={setConsumerCash}
                      placeholder="10000"
                      placeholderTextColor="#666"
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.formFieldFull}>
                  <Text style={styles.formLabel}>{t.specialNotes}</Text>
                  <TextInput
                    style={[styles.formInput, styles.textArea]}
                    value={specialNotes}
                    onChangeText={setSpecialNotes}
                    placeholder="No Finance Payments for 90 Days..."
                    placeholderTextColor="#666"
                    multiline
                  />
                </View>

                {/* Financing Terms */}
                <Text style={styles.sectionTitle}>{t.financingTerms}</Text>
                {financingTerms.map((term, index) => (
                  <View key={index} style={styles.termRow}>
                    <View style={styles.termField}>
                      <Text style={styles.termLabel}>{t.termMonths}</Text>
                      <TextInput
                        style={styles.termInput}
                        value={term.term_months.toString()}
                        onChangeText={(v) => updateTerm(index, 'term_months', v)}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.termField}>
                      <Text style={styles.termLabel}>{t.interestRate}</Text>
                      <TextInput
                        style={styles.termInput}
                        value={term.interest_rate.toString()}
                        onChangeText={(v) => updateTerm(index, 'interest_rate', v)}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.termField}>
                      <Text style={styles.termLabel}>{t.rebateAmount}</Text>
                      <TextInput
                        style={styles.termInput}
                        value={term.rebate_amount.toString()}
                        onChangeText={(v) => updateTerm(index, 'rebate_amount', v)}
                        keyboardType="numeric"
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.removeTermButton}
                      onPress={() => removeTerm(index)}
                    >
                      <Ionicons name="close-circle" size={24} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity style={styles.addTermButton} onPress={addTerm}>
                  <Ionicons name="add" size={20} color="#4ECDC4" />
                  <Text style={styles.addTermText}>{t.addTerm}</Text>
                </TouchableOpacity>
              </ScrollView>

              {/* Modal Actions */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelButtonText}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#1a1a2e" />
                  ) : (
                    <Text style={styles.saveButtonText}>{t.save}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    color: '#fff',
    marginLeft: 4,
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  addButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 8,
  },
  addButtonText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: 'bold',
  },
  noDataText: {
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 20,
  },
  programCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  programHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  programBrand: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  programModel: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
    marginTop: 2,
  },
  programActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    padding: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
  },
  deleteButton: {
    padding: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
  },
  programCash: {
    fontSize: 14,
    color: '#FF6B6B',
    marginTop: 8,
    fontWeight: '600',
  },
  programNotes: {
    fontSize: 13,
    color: '#888',
    marginTop: 8,
    fontStyle: 'italic',
  },
  termsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  termBadge: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    minWidth: 70,
  },
  termMonths: {
    fontSize: 14,
    color: '#fff',
    fontWeight: 'bold',
  },
  termRate: {
    fontSize: 12,
    color: '#4ECDC4',
  },
  termRebate: {
    fontSize: 10,
    color: '#FF6B6B',
    marginTop: 2,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    maxHeight: '90%',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '100%',
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
  modalScroll: {
    padding: 20,
    maxHeight: 500,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  formField: {
    flex: 1,
  },
  formFieldFull: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: '#2d2d44',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
    marginBottom: 12,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 12,
  },
  termField: {
    flex: 1,
  },
  termLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  termInput: {
    backgroundColor: '#2d2d44',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  removeTermButton: {
    padding: 8,
  },
  addTermButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#4ECDC4',
    borderRadius: 8,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addTermText: {
    color: '#4ECDC4',
    marginLeft: 8,
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d2d44',
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#2d2d44',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#4ECDC4',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
