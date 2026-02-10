import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface ProgramEntry {
  brand: string;
  model: string;
  trim: string;
  year: number;
  consumer_cash: number;
  bonus_cash: number;
  option1_rates: {
    rate_36: number;
    rate_48: number;
    rate_60: number;
    rate_72: number;
    rate_84: number;
    rate_96: number;
  };
  option2_rates: {
    rate_36: number;
    rate_48: number;
    rate_60: number;
    rate_72: number;
    rate_84: number;
    rate_96: number;
  } | null;
}

const months = [
  { value: 1, label: 'Janvier' },
  { value: 2, label: 'Février' },
  { value: 3, label: 'Mars' },
  { value: 4, label: 'Avril' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Juin' },
  { value: 7, label: 'Juillet' },
  { value: 8, label: 'Août' },
  { value: 9, label: 'Septembre' },
  { value: 10, label: 'Octobre' },
  { value: 11, label: 'Novembre' },
  { value: 12, label: 'Décembre' },
];

export default function ImportScreen() {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [programs, setPrograms] = useState<ProgramEntry[]>([]);
  
  // Form state for adding new program
  const [showAddForm, setShowAddForm] = useState(false);
  const [formBrand, setFormBrand] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formTrim, setFormTrim] = useState('');
  const [formYear, setFormYear] = useState('2026');
  const [formConsumerCash, setFormConsumerCash] = useState('0');
  const [formBonusCash, setFormBonusCash] = useState('0');
  
  // Option 1 rates
  const [formO1R36, setFormO1R36] = useState('4.99');
  const [formO1R48, setFormO1R48] = useState('4.99');
  const [formO1R60, setFormO1R60] = useState('4.99');
  const [formO1R72, setFormO1R72] = useState('4.99');
  const [formO1R84, setFormO1R84] = useState('4.99');
  const [formO1R96, setFormO1R96] = useState('4.99');
  
  // Option 2 rates
  const [formHasOption2, setFormHasOption2] = useState(false);
  const [formO2R36, setFormO2R36] = useState('0');
  const [formO2R48, setFormO2R48] = useState('0');
  const [formO2R60, setFormO2R60] = useState('0');
  const [formO2R72, setFormO2R72] = useState('0');
  const [formO2R84, setFormO2R84] = useState('0');
  const [formO2R96, setFormO2R96] = useState('0');

  const addProgram = () => {
    if (!formBrand || !formModel) {
      showAlert('Erreur', 'Marque et modèle sont requis');
      return;
    }

    const newProgram: ProgramEntry = {
      brand: formBrand,
      model: formModel,
      trim: formTrim,
      year: parseInt(formYear) || 2026,
      consumer_cash: parseFloat(formConsumerCash) || 0,
      bonus_cash: parseFloat(formBonusCash) || 0,
      option1_rates: {
        rate_36: parseFloat(formO1R36) || 4.99,
        rate_48: parseFloat(formO1R48) || 4.99,
        rate_60: parseFloat(formO1R60) || 4.99,
        rate_72: parseFloat(formO1R72) || 4.99,
        rate_84: parseFloat(formO1R84) || 4.99,
        rate_96: parseFloat(formO1R96) || 4.99,
      },
      option2_rates: formHasOption2 ? {
        rate_36: parseFloat(formO2R36) || 0,
        rate_48: parseFloat(formO2R48) || 0,
        rate_60: parseFloat(formO2R60) || 0,
        rate_72: parseFloat(formO2R72) || 0,
        rate_84: parseFloat(formO2R84) || 0,
        rate_96: parseFloat(formO2R96) || 0,
      } : null,
    };

    setPrograms([...programs, newProgram]);
    resetForm();
    setShowAddForm(false);
  };

  const resetForm = () => {
    setFormBrand('');
    setFormModel('');
    setFormTrim('');
    setFormYear('2026');
    setFormConsumerCash('0');
    setFormBonusCash('0');
    setFormO1R36('4.99');
    setFormO1R48('4.99');
    setFormO1R60('4.99');
    setFormO1R72('4.99');
    setFormO1R84('4.99');
    setFormO1R96('4.99');
    setFormHasOption2(false);
    setFormO2R36('0');
    setFormO2R48('0');
    setFormO2R60('0');
    setFormO2R72('0');
    setFormO2R84('0');
    setFormO2R96('0');
  };

  const removeProgram = (index: number) => {
    const updated = [...programs];
    updated.splice(index, 1);
    setPrograms(updated);
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleImport = async () => {
    if (programs.length === 0) {
      showAlert('Erreur', 'Ajoutez au moins un programme');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/import`, {
        password: 'Admin',
        programs: programs,
        program_month: selectedMonth,
        program_year: selectedYear,
      });
      
      showAlert('Succès', response.data.message);
      router.back();
    } catch (error: any) {
      showAlert('Erreur', error.response?.data?.detail || 'Erreur lors de l\'import');
    } finally {
      setLoading(false);
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Importer un programme</Text>
            <Text style={styles.headerSubtitle}>Ajouter des véhicules manuellement</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Period Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Période du programme</Text>
            <View style={styles.periodRow}>
              <View style={styles.periodPicker}>
                <Text style={styles.periodLabel}>Mois</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.periodOptions}>
                    {months.map(m => (
                      <TouchableOpacity
                        key={m.value}
                        style={[
                          styles.periodOption,
                          selectedMonth === m.value && styles.periodOptionActive
                        ]}
                        onPress={() => setSelectedMonth(m.value)}
                      >
                        <Text style={[
                          styles.periodOptionText,
                          selectedMonth === m.value && styles.periodOptionTextActive
                        ]}>
                          {m.label.substring(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
              <View style={styles.yearInput}>
                <Text style={styles.periodLabel}>Année</Text>
                <TextInput
                  style={styles.yearTextInput}
                  value={String(selectedYear)}
                  onChangeText={(v) => setSelectedYear(parseInt(v) || 2026)}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          {/* Programs List */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Programmes ({programs.length})</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddForm(true)}
              >
                <Ionicons name="add" size={20} color="#1a1a2e" />
                <Text style={styles.addButtonText}>Ajouter</Text>
              </TouchableOpacity>
            </View>

            {programs.length === 0 ? (
              <Text style={styles.emptyText}>
                Aucun programme ajouté. Cliquez sur "Ajouter" pour commencer.
              </Text>
            ) : (
              programs.map((prog, index) => (
                <View key={index} style={styles.programCard}>
                  <View style={styles.programCardHeader}>
                    <View>
                      <Text style={styles.programBrand}>{prog.brand}</Text>
                      <Text style={styles.programModel}>
                        {prog.model} {prog.trim} {prog.year}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeProgram(index)}>
                      <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.programDetails}>
                    <Text style={styles.programDetail}>
                      Consumer Cash: {formatCurrency(prog.consumer_cash)}
                    </Text>
                    <Text style={styles.programDetail}>
                      Bonus Cash: {formatCurrency(prog.bonus_cash)}
                    </Text>
                    <Text style={styles.programDetail}>
                      Option 1: {prog.option1_rates.rate_36}% - {prog.option1_rates.rate_96}%
                    </Text>
                    {prog.option2_rates ? (
                      <Text style={styles.programDetail}>
                        Option 2: {prog.option2_rates.rate_36}% - {prog.option2_rates.rate_96}%
                      </Text>
                    ) : (
                      <Text style={styles.programDetailNA}>Option 2: N/A</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Add Form */}
          {showAddForm && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Nouveau véhicule</Text>
                <TouchableOpacity onPress={() => setShowAddForm(false)}>
                  <Ionicons name="close" size={24} color="#aaa" />
                </TouchableOpacity>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Marque *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formBrand}
                    onChangeText={setFormBrand}
                    placeholder="Jeep"
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Modèle *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formModel}
                    onChangeText={setFormModel}
                    placeholder="Grand Cherokee"
                    placeholderTextColor="#666"
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Trim</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formTrim}
                    onChangeText={setFormTrim}
                    placeholder="Laredo"
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.formFieldSmall}>
                  <Text style={styles.formLabel}>Année</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formYear}
                    onChangeText={setFormYear}
                    keyboardType="numeric"
                    placeholderTextColor="#666"
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Consumer Cash ($)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formConsumerCash}
                    onChangeText={setFormConsumerCash}
                    keyboardType="numeric"
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Bonus Cash ($)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formBonusCash}
                    onChangeText={setFormBonusCash}
                    keyboardType="numeric"
                    placeholderTextColor="#666"
                  />
                </View>
              </View>

              {/* Option 1 Rates */}
              <Text style={styles.ratesTitle}>Taux Option 1 (%)</Text>
              <View style={styles.ratesGrid}>
                <View style={styles.rateField}>
                  <Text style={styles.rateLabel}>36m</Text>
                  <TextInput
                    style={styles.rateInput}
                    value={formO1R36}
                    onChangeText={setFormO1R36}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.rateField}>
                  <Text style={styles.rateLabel}>48m</Text>
                  <TextInput
                    style={styles.rateInput}
                    value={formO1R48}
                    onChangeText={setFormO1R48}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.rateField}>
                  <Text style={styles.rateLabel}>60m</Text>
                  <TextInput
                    style={styles.rateInput}
                    value={formO1R60}
                    onChangeText={setFormO1R60}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.rateField}>
                  <Text style={styles.rateLabel}>72m</Text>
                  <TextInput
                    style={styles.rateInput}
                    value={formO1R72}
                    onChangeText={setFormO1R72}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.rateField}>
                  <Text style={styles.rateLabel}>84m</Text>
                  <TextInput
                    style={styles.rateInput}
                    value={formO1R84}
                    onChangeText={setFormO1R84}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.rateField}>
                  <Text style={styles.rateLabel}>96m</Text>
                  <TextInput
                    style={styles.rateInput}
                    value={formO1R96}
                    onChangeText={setFormO1R96}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              {/* Option 2 Toggle */}
              <TouchableOpacity
                style={styles.option2Toggle}
                onPress={() => setFormHasOption2(!formHasOption2)}
              >
                <Ionicons
                  name={formHasOption2 ? 'checkbox' : 'square-outline'}
                  size={24}
                  color="#4ECDC4"
                />
                <Text style={styles.option2ToggleText}>Option 2 disponible</Text>
              </TouchableOpacity>

              {/* Option 2 Rates */}
              {formHasOption2 && (
                <>
                  <Text style={styles.ratesTitle}>Taux Option 2 (%)</Text>
                  <View style={styles.ratesGrid}>
                    <View style={styles.rateField}>
                      <Text style={styles.rateLabel}>36m</Text>
                      <TextInput
                        style={styles.rateInput}
                        value={formO2R36}
                        onChangeText={setFormO2R36}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.rateField}>
                      <Text style={styles.rateLabel}>48m</Text>
                      <TextInput
                        style={styles.rateInput}
                        value={formO2R48}
                        onChangeText={setFormO2R48}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.rateField}>
                      <Text style={styles.rateLabel}>60m</Text>
                      <TextInput
                        style={styles.rateInput}
                        value={formO2R60}
                        onChangeText={setFormO2R60}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.rateField}>
                      <Text style={styles.rateLabel}>72m</Text>
                      <TextInput
                        style={styles.rateInput}
                        value={formO2R72}
                        onChangeText={setFormO2R72}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.rateField}>
                      <Text style={styles.rateLabel}>84m</Text>
                      <TextInput
                        style={styles.rateInput}
                        value={formO2R84}
                        onChangeText={setFormO2R84}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.rateField}>
                      <Text style={styles.rateLabel}>96m</Text>
                      <TextInput
                        style={styles.rateInput}
                        value={formO2R96}
                        onChangeText={setFormO2R96}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                </>
              )}

              <TouchableOpacity
                style={styles.saveButton}
                onPress={addProgram}
              >
                <Ionicons name="checkmark" size={20} color="#1a1a2e" />
                <Text style={styles.saveButtonText}>Ajouter ce véhicule</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Import Button */}
          {programs.length > 0 && (
            <TouchableOpacity
              style={[styles.importButton, loading && styles.importButtonDisabled]}
              onPress={handleImport}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#1a1a2e" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={20} color="#1a1a2e" />
                  <Text style={styles.importButtonText}>
                    Importer {programs.length} programme(s)
                  </Text>
                </>
              )}
            </TouchableOpacity>
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  periodRow: {
    flexDirection: 'row',
    gap: 12,
  },
  periodPicker: {
    flex: 1,
  },
  periodLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  periodOptions: {
    flexDirection: 'row',
    gap: 6,
  },
  periodOption: {
    backgroundColor: '#2d2d44',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  periodOptionActive: {
    backgroundColor: '#4ECDC4',
  },
  periodOptionText: {
    fontSize: 12,
    color: '#aaa',
    fontWeight: '500',
  },
  periodOptionTextActive: {
    color: '#1a1a2e',
  },
  yearInput: {
    width: 100,
  },
  yearTextInput: {
    backgroundColor: '#2d2d44',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  emptyText: {
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  programCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  programCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  programBrand: {
    fontSize: 11,
    color: '#4ECDC4',
    fontWeight: '600',
  },
  programModel: {
    fontSize: 14,
    color: '#fff',
    fontWeight: 'bold',
    marginTop: 2,
  },
  programDetails: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#3d3d54',
  },
  programDetail: {
    fontSize: 11,
    color: '#aaa',
    marginBottom: 2,
  },
  programDetailNA: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  formField: {
    flex: 1,
  },
  formFieldSmall: {
    width: 100,
  },
  formLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: '#2d2d44',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#fff',
  },
  ratesTitle: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 10,
  },
  ratesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  rateField: {
    width: '30%',
  },
  rateLabel: {
    fontSize: 10,
    color: '#888',
    marginBottom: 4,
    textAlign: 'center',
  },
  rateInput: {
    backgroundColor: '#2d2d44',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
  },
  option2Toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  option2ToggleText: {
    fontSize: 14,
    color: '#fff',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  importButtonDisabled: {
    opacity: 0.5,
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
});
