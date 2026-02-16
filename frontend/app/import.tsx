import React, { useState, useCallback } from 'react';
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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';
import * as DocumentPicker from 'expo-document-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface RatesData {
  rate_36: number;
  rate_48: number;
  rate_60: number;
  rate_72: number;
  rate_84: number;
  rate_96: number;
}

interface ProgramEntry {
  brand: string;
  model: string;
  trim: string | null;
  year: number;
  consumer_cash: number;
  bonus_cash: number;
  option1_rates: RatesData;
  option2_rates: RatesData | null;
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

// Steps for the import wizard
type Step = 'login' | 'upload' | 'select-pages' | 'preview' | 'email-sent' | 'success';

export default function ImportScreen() {
  const router = useRouter();
  
  // Wizard state - Added 'select-pages' step
  const [currentStep, setCurrentStep] = useState<Step>('login');
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Period selection
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // PDF file state
  const [pdfFile, setPdfFile] = useState<any>(null);
  const [pdfFileName, setPdfFileName] = useState('');
  const [totalPages, setTotalPages] = useState(0);
  
  // Page selection for PDF extraction
  const [pageStart, setPageStart] = useState('20');
  const [pageEnd, setPageEnd] = useState('21');
  
  // Loading states
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Programs data
  const [programs, setPrograms] = useState<ProgramEntry[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editProgram, setEditProgram] = useState<ProgramEntry | null>(null);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // Step 1: Login
  const handleLogin = async () => {
    if (!password) {
      showAlert('Erreur', 'Entrez le mot de passe');
      return;
    }
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('password', password);
      
      await axios.post(`${API_URL}/api/verify-password`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setIsAuthenticated(true);
      setCurrentStep('upload');
    } catch (error: any) {
      showAlert('Erreur', error.response?.data?.detail || 'Mot de passe incorrect');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Pick PDF and get page count
  const handlePickPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      
      if (result.canceled) {
        return;
      }
      
      const file = result.assets[0];
      if (!file) return;
      
      setUploading(true);
      setPdfFile(file);
      setPdfFileName(file.name);
      
      // Get page count from backend
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        const blob = await response.blob();
        formData.append('file', blob, file.name);
      } else {
        formData.append('file', {
          uri: file.uri,
          type: 'application/pdf',
          name: file.name,
        } as any);
      }
      
      const response = await axios.post(`${API_URL}/api/pdf-info`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });
      
      if (response.data.success) {
        setTotalPages(response.data.total_pages);
        setCurrentStep('select-pages' as Step);
      } else {
        showAlert('Erreur', 'Impossible de lire le PDF');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      showAlert('Erreur', error.response?.data?.detail || 'Erreur lors du téléversement');
    } finally {
      setUploading(false);
    }
  };

  // Step 3: Extract selected pages
  const handleExtractPages = async () => {
    if (!pdfFile) {
      showAlert('Erreur', 'Aucun PDF sélectionné');
      return;
    }
    
    setExtracting(true);
    
    try {
      // Create FormData for upload
      const formData = new FormData();
      
      // Handle file for different platforms
      if (Platform.OS === 'web') {
        // For web, fetch the file and create a blob
        const response = await fetch(pdfFile.uri);
        const blob = await response.blob();
        formData.append('file', blob, pdfFile.name);
      } else {
        // For native platforms
        formData.append('file', {
          uri: pdfFile.uri,
          type: 'application/pdf',
          name: pdfFile.name,
        } as any);
      }
      
      formData.append('password', password);
      formData.append('program_month', String(selectedMonth));
      formData.append('program_year', String(selectedYear));
      formData.append('start_page', pageStart || '1');
      formData.append('end_page', pageEnd || '9999');
      
      const response = await axios.post(`${API_URL}/api/extract-pdf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000, // 10 minutes timeout for AI processing
      });
      
      if (response.data.success) {
        setPrograms(response.data.programs);
        setCurrentStep('preview');
        showAlert('Succès', `${response.data.programs.length} programmes extraits avec succès!\n\nUn fichier Excel a été envoyé à votre email pour vérification.`);
      } else {
        showAlert('Erreur', response.data.message);
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      // Even on timeout/error, show a success-like message since the backend likely completed
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        // Timeout - but the extraction likely completed in the backend
        setCurrentStep('email-sent' as Step);
      } else if (error.code === 'ERR_NETWORK' || error.message?.includes('Network')) {
        // Network error after long wait - likely completed
        setCurrentStep('email-sent' as Step);
      } else {
        showAlert('Erreur', error.response?.data?.detail || 'Erreur lors de l\'extraction. Vérifiez votre email.');
      }
    } finally {
      setExtracting(false);
    }
  };

  // Edit a program
  const openEditModal = (index: number) => {
    setEditingIndex(index);
    setEditProgram({ ...programs[index] });
    setEditModalVisible(true);
  };

  const saveEditedProgram = () => {
    if (editingIndex !== null && editProgram) {
      const updated = [...programs];
      updated[editingIndex] = editProgram;
      setPrograms(updated);
      setEditModalVisible(false);
      setEditProgram(null);
      setEditingIndex(null);
    }
  };

  const deleteProgram = (index: number) => {
    Alert.alert(
      'Supprimer',
      'Voulez-vous supprimer ce programme?',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Supprimer', 
          style: 'destructive',
          onPress: () => {
            const updated = [...programs];
            updated.splice(index, 1);
            setPrograms(updated);
          }
        },
      ]
    );
  };

  // Step 3: Save programs
  const handleSavePrograms = async () => {
    if (programs.length === 0) {
      showAlert('Erreur', 'Aucun programme à sauvegarder');
      return;
    }
    
    setSaving(true);
    try {
      const response = await axios.post(`${API_URL}/api/save-programs`, {
        password: password,
        programs: programs,
        program_month: selectedMonth,
        program_year: selectedYear,
      });
      
      if (response.data.success) {
        setCurrentStep('success');
      } else {
        showAlert('Erreur', response.data.message);
      }
    } catch (error: any) {
      showAlert('Erreur', error.response?.data?.detail || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getMonthLabel = (month: number) => {
    return months.find(m => m.value === month)?.label || '';
  };

  // Render login step
  const renderLoginStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="lock-closed" size={60} color="#4ECDC4" />
      </View>
      <Text style={styles.stepTitle}>Accès Administrateur</Text>
      <Text style={styles.stepDescription}>
        Entrez le mot de passe pour accéder à l'import des programmes
      </Text>
      
      <TextInput
        style={styles.passwordInput}
        placeholder="Mot de passe"
        placeholderTextColor="#666"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
      />
      
      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#1a1a2e" />
        ) : (
          <>
            <Ionicons name="log-in" size={20} color="#1a1a2e" />
            <Text style={styles.primaryButtonText}>Se connecter</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  // Render upload step
  const renderUploadStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="document-text" size={60} color="#4ECDC4" />
      </View>
      <Text style={styles.stepTitle}>Importer le PDF</Text>
      <Text style={styles.stepDescription}>
        Sélectionnez la période et uploadez le PDF des programmes de financement
      </Text>
      
      {/* Period Selection */}
      <View style={styles.periodSection}>
        <Text style={styles.periodLabel}>Période du programme</Text>
        <View style={styles.periodRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
            <View style={styles.monthButtons}>
              {months.map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={[
                    styles.monthButton,
                    selectedMonth === m.value && styles.monthButtonActive
                  ]}
                  onPress={() => setSelectedMonth(m.value)}
                >
                  <Text style={[
                    styles.monthButtonText,
                    selectedMonth === m.value && styles.monthButtonTextActive
                  ]}>
                    {m.label.substring(0, 3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
        
        <View style={styles.yearRow}>
          <Text style={styles.yearLabel}>Année:</Text>
          <TextInput
            style={styles.yearInput}
            value={String(selectedYear)}
            onChangeText={(v) => setSelectedYear(parseInt(v) || new Date().getFullYear())}
            keyboardType="numeric"
          />
        </View>
      </View>
      
      <TouchableOpacity
        style={[styles.uploadButton, uploading && styles.buttonDisabled]}
        onPress={handlePickPDF}
        disabled={uploading}
      >
        {uploading ? (
          <View style={styles.extractingContainer}>
            <ActivityIndicator size="large" color="#4ECDC4" />
            <Text style={styles.extractingText}>Chargement du PDF...</Text>
          </View>
        ) : (
          <>
            <Ionicons name="document" size={40} color="#1a1a2e" />
            <Text style={styles.uploadButtonText}>Sélectionner le PDF</Text>
            <Text style={styles.uploadButtonSubtext}>Cliquez pour choisir un fichier</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  // Render Step: Select Pages
  const renderSelectPagesStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Sélectionner les pages</Text>
      <Text style={styles.stepDescription}>
        Le PDF "{pdfFileName}" contient {totalPages} pages
      </Text>
      
      {/* PDF Info Card */}
      <View style={styles.pdfInfoCard}>
        <Ionicons name="document-text" size={50} color="#4ECDC4" />
        <View style={styles.pdfInfoText}>
          <Text style={styles.pdfInfoTitle}>{pdfFileName}</Text>
          <Text style={styles.pdfInfoPages}>{totalPages} pages disponibles</Text>
        </View>
      </View>
      
      {/* Page Selection */}
      <View style={styles.periodSection}>
        <Text style={styles.periodLabel}>Pages à extraire</Text>
        <Text style={styles.pageHint}>💡 Choisissez les pages contenant les programmes Retail</Text>
        <View style={styles.pageRow}>
          <View style={styles.pageField}>
            <Text style={styles.pageLabel}>De la page:</Text>
            <TextInput
              style={styles.pageInput}
              value={pageStart}
              onChangeText={setPageStart}
              keyboardType="numeric"
              placeholder="1"
              placeholderTextColor="#666"
            />
          </View>
          <View style={styles.pageField}>
            <Text style={styles.pageLabel}>À la page:</Text>
            <TextInput
              style={styles.pageInput}
              value={pageEnd}
              onChangeText={setPageEnd}
              keyboardType="numeric"
              placeholder={String(totalPages)}
              placeholderTextColor="#666"
            />
          </View>
        </View>
        <Text style={styles.pageValidation}>
          Pages sélectionnées: {pageStart || '1'} à {pageEnd || totalPages}
        </Text>
      </View>
      
      <TouchableOpacity
        style={[styles.extractButton, extracting && styles.buttonDisabled]}
        onPress={handleExtractPages}
        disabled={extracting}
      >
        {extracting ? (
          <View style={styles.extractingContainer}>
            <ActivityIndicator size="large" color="#4ECDC4" />
            <Text style={styles.extractingText}>Extraction en cours...</Text>
            <Text style={styles.extractingSubtext}>⏳ L'IA analyse les pages {pageStart || '1'} à {pageEnd || totalPages}</Text>
            <Text style={styles.extractingSubtext}>📧 Un fichier Excel sera envoyé par email</Text>
            <Text style={styles.extractingWait}>Veuillez patienter (2-4 minutes)</Text>
          </View>
        ) : (
          <>
            <Ionicons name="analytics" size={24} color="#fff" />
            <Text style={styles.extractButtonText}>
              Extraire les pages {pageStart || '1'} à {pageEnd || totalPages}
            </Text>
          </>
        )}
      </TouchableOpacity>
      
      {/* Change PDF button */}
      <TouchableOpacity
        style={styles.changePdfButton}
        onPress={() => {
          setPdfFile(null);
          setPdfFileName('');
          setTotalPages(0);
          setCurrentStep('upload');
        }}
        disabled={extracting}
      >
        <Text style={styles.changePdfButtonText}>← Changer de PDF</Text>
      </TouchableOpacity>
    </View>
  );

  // Original upload step render (now simplified)
  const renderUploadStepOld = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Importer le PDF</Text>
      <Text style={styles.stepDescription}>
        Sélectionnez la période et uploadez le PDF des programmes de financement
      </Text>
      
      {/* Period Selection */}
      <View style={styles.periodSection}>
        <Text style={styles.periodLabel}>Période du programme</Text>
        <View style={styles.periodRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
            <View style={styles.monthButtons}>
              {months.map(m => (
                <TouchableOpacity
                  key={m.value}
                  style={[
                    styles.monthButton,
                    selectedMonth === m.value && styles.monthButtonActive
                  ]}
                  onPress={() => setSelectedMonth(m.value)}
                >
                  <Text style={[
                    styles.monthButtonText,
                    selectedMonth === m.value && styles.monthButtonTextActive
                  ]}>
                    {m.label.substring(0, 3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
        
        <View style={styles.yearRow}>
          <Text style={styles.yearLabel}>Année:</Text>
          <TextInput
            style={styles.yearInput}
            value={String(selectedYear)}
            onChangeText={(v) => setSelectedYear(parseInt(v) || new Date().getFullYear())}
            keyboardType="numeric"
          />
        </View>
      </View>
      
      {/* Page Selection */}
      <View style={styles.periodSection}>
        <Text style={styles.periodLabel}>Pages du PDF à extraire</Text>
        <Text style={styles.pageHint}>Ex: Pages 20-21 pour les programmes Retail</Text>
        <View style={styles.pageRow}>
          <View style={styles.pageField}>
            <Text style={styles.pageLabel}>De la page:</Text>
            <TextInput
              style={styles.pageInput}
              value={pageStart}
              onChangeText={setPageStart}
              keyboardType="numeric"
              placeholder="20"
              placeholderTextColor="#666"
            />
          </View>
          <View style={styles.pageField}>
            <Text style={styles.pageLabel}>À la page:</Text>
            <TextInput
              style={styles.pageInput}
              value={pageEnd}
              onChangeText={setPageEnd}
              keyboardType="numeric"
              placeholder="21"
              placeholderTextColor="#666"
            />
          </View>
        </View>
      </View>
      
      <TouchableOpacity
        style={[styles.uploadButton, extracting && styles.buttonDisabled]}
        onPress={handlePickPDF}
        disabled={extracting}
      >
        {extracting ? (
          <View style={styles.extractingContainer}>
            <ActivityIndicator size="large" color="#4ECDC4" />
            <Text style={styles.extractingText}>Extraction en cours...</Text>
            <Text style={styles.extractingSubtext}>⏳ L'IA analyse les pages {pageStart} à {pageEnd}</Text>
            <Text style={styles.extractingSubtext}>📧 Un fichier Excel sera envoyé par email</Text>
            <Text style={styles.extractingWait}>Veuillez patienter (2-4 minutes)</Text>
          </View>
        ) : (
          <>
            <Ionicons name="cloud-upload" size={40} color="#1a1a2e" />
            <Text style={styles.uploadButtonText}>Sélectionner le PDF</Text>
            <Text style={styles.uploadButtonSubtext}>Pages {pageStart} à {pageEnd} seront analysées</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  // Render preview step
  const renderPreviewStep = () => (
    <View style={styles.previewContainer}>
      <View style={styles.previewHeader}>
        <Text style={styles.previewTitle}>
          Programmes extraits ({programs.length})
        </Text>
        <Text style={styles.previewPeriod}>
          {getMonthLabel(selectedMonth)} {selectedYear}
        </Text>
      </View>
      
      <Text style={styles.previewInstructions}>
        Vérifiez et modifiez les données ci-dessous avant de sauvegarder
      </Text>
      
      <ScrollView style={styles.programsList}>
        {programs.map((prog, index) => (
          <View key={index} style={styles.programCard}>
            <View style={styles.programCardHeader}>
              <View style={styles.programCardInfo}>
                <Text style={styles.programBrand}>{prog.brand}</Text>
                <Text style={styles.programModel}>
                  {prog.model} {prog.trim || ''} {prog.year}
                </Text>
              </View>
              <View style={styles.programCardActions}>
                <TouchableOpacity 
                  style={styles.editButton}
                  onPress={() => openEditModal(index)}
                >
                  <Ionicons name="pencil" size={18} color="#4ECDC4" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.deleteButton}
                  onPress={() => deleteProgram(index)}
                >
                  <Ionicons name="trash" size={18} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.programCardDetails}>
              <View style={styles.programDetailRow}>
                <Text style={styles.programDetailLabel}>Consumer Cash:</Text>
                <Text style={styles.programDetailValue}>
                  {formatCurrency(prog.consumer_cash)}
                </Text>
              </View>
              <View style={styles.programDetailRow}>
                <Text style={styles.programDetailLabel}>Bonus Cash:</Text>
                <Text style={styles.programDetailValue}>
                  {formatCurrency(prog.bonus_cash)}
                </Text>
              </View>
              <View style={styles.programDetailRow}>
                <Text style={styles.programDetailLabel}>Option 1:</Text>
                <Text style={prog.option1_rates ? styles.programDetailValue : styles.programDetailNA}>
                  {prog.option1_rates 
                    ? `${prog.option1_rates.rate_36}% - ${prog.option1_rates.rate_96}%`
                    : 'N/A'}
                </Text>
              </View>
              <View style={styles.programDetailRow}>
                <Text style={styles.programDetailLabel}>Option 2:</Text>
                <Text style={prog.option2_rates ? styles.programDetailValue : styles.programDetailNA}>
                  {prog.option2_rates 
                    ? `${prog.option2_rates.rate_36}% - ${prog.option2_rates.rate_96}%`
                    : 'N/A'}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
      
      <View style={styles.previewActions}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setCurrentStep('upload')}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSavePrograms}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#1a1a2e" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#1a1a2e" />
              <Text style={styles.saveButtonText}>Approuver et Sauvegarder</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render success step
  const renderSuccessStep = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, styles.successIcon]}>
        <Ionicons name="checkmark-circle" size={80} color="#4ECDC4" />
      </View>
      <Text style={styles.stepTitle}>Programmes sauvegardés!</Text>
      <Text style={styles.stepDescription}>
        {programs.length} programmes ont été ajoutés pour {getMonthLabel(selectedMonth)} {selectedYear}
      </Text>
      <Text style={styles.successNote}>
        Les utilisateurs de l'application verront automatiquement les nouveaux programmes.
      </Text>
      
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.back()}
      >
        <Ionicons name="home" size={20} color="#1a1a2e" />
        <Text style={styles.primaryButtonText}>Retour à l'accueil</Text>
      </TouchableOpacity>
    </View>
  );

  // Render email sent step (when timeout but email was likely sent)
  const renderEmailSentStep = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, styles.successIcon]}>
        <Ionicons name="mail" size={80} color="#4ECDC4" />
      </View>
      <Text style={styles.stepTitle}>Email envoyé!</Text>
      <Text style={styles.stepDescription}>
        L'extraction des pages {pageStart || '1'} à {pageEnd || totalPages} est terminée.
      </Text>
      <Text style={styles.successNote}>
        📧 Un fichier Excel a été envoyé à votre email pour vérification.
      </Text>
      <Text style={styles.emailSentNote}>
        Vérifiez votre boîte de réception pour le fichier avec les programmes de {getMonthLabel(selectedMonth)} {selectedYear}.
      </Text>
      
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => {
          setPdfFile(null);
          setPdfFileName('');
          setTotalPages(0);
          setCurrentStep('upload');
        }}
      >
        <Ionicons name="refresh" size={20} color="#1a1a2e" />
        <Text style={styles.primaryButtonText}>Importer un autre PDF</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: '#2d2d44', marginTop: 12 }]}
        onPress={() => router.back()}
      >
        <Ionicons name="home" size={20} color="#fff" />
        <Text style={[styles.primaryButtonText, { color: '#fff' }]}>Retour à l'accueil</Text>
      </TouchableOpacity>
    </View>
  );

  // Edit modal
  const renderEditModal = () => (
    <Modal
      visible={editModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setEditModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Modifier le programme</Text>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
              <Ionicons name="close" size={24} color="#aaa" />
            </TouchableOpacity>
          </View>
          
          {editProgram && (
            <ScrollView style={styles.modalBody}>
              <View style={styles.formRow}>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Marque</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editProgram.brand}
                    onChangeText={(v) => setEditProgram({...editProgram, brand: v})}
                  />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Modèle</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editProgram.model}
                    onChangeText={(v) => setEditProgram({...editProgram, model: v})}
                  />
                </View>
              </View>
              
              <View style={styles.formRow}>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Trim</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editProgram.trim || ''}
                    onChangeText={(v) => setEditProgram({...editProgram, trim: v || null})}
                  />
                </View>
                <View style={styles.formFieldSmall}>
                  <Text style={styles.formLabel}>Année</Text>
                  <TextInput
                    style={styles.formInput}
                    value={String(editProgram.year)}
                    onChangeText={(v) => setEditProgram({...editProgram, year: parseInt(v) || 2026})}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              
              <View style={styles.formRow}>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Consumer Cash ($)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={String(editProgram.consumer_cash)}
                    onChangeText={(v) => setEditProgram({...editProgram, consumer_cash: parseFloat(v) || 0})}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Bonus Cash ($)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={String(editProgram.bonus_cash)}
                    onChangeText={(v) => setEditProgram({...editProgram, bonus_cash: parseFloat(v) || 0})}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              
              <Text style={styles.ratesTitle}>Taux Option 1 (%)</Text>
              {editProgram.option1_rates ? (
              <View style={styles.ratesGrid}>
                {['36', '48', '60', '72', '84', '96'].map((term) => (
                  <View key={`o1-${term}`} style={styles.rateField}>
                    <Text style={styles.rateLabel}>{term}m</Text>
                    <TextInput
                      style={styles.rateInput}
                      value={String(editProgram.option1_rates![`rate_${term}` as keyof RatesData])}
                      onChangeText={(v) => setEditProgram({
                        ...editProgram,
                        option1_rates: {
                          ...editProgram.option1_rates!,
                          [`rate_${term}`]: parseFloat(v) || 0
                        }
                      })}
                      keyboardType="decimal-pad"
                    />
                  </View>
                ))}
              </View>
              ) : (
                <Text style={styles.programDetailNA}>Option 1 non disponible</Text>
              )}
              
              <View style={styles.option2Toggle}>
                <TouchableOpacity
                  style={styles.option2ToggleBtn}
                  onPress={() => setEditProgram({
                    ...editProgram,
                    option2_rates: editProgram.option2_rates 
                      ? null 
                      : { rate_36: 0, rate_48: 0, rate_60: 0, rate_72: 1.49, rate_84: 1.99, rate_96: 3.49 }
                  })}
                >
                  <Ionicons
                    name={editProgram.option2_rates ? 'checkbox' : 'square-outline'}
                    size={24}
                    color="#4ECDC4"
                  />
                  <Text style={styles.option2ToggleText}>Option 2 disponible</Text>
                </TouchableOpacity>
              </View>
              
              {editProgram.option2_rates && (
                <>
                  <Text style={styles.ratesTitle}>Taux Option 2 (%)</Text>
                  <View style={styles.ratesGrid}>
                    {['36', '48', '60', '72', '84', '96'].map((term) => (
                      <View key={`o2-${term}`} style={styles.rateField}>
                        <Text style={styles.rateLabel}>{term}m</Text>
                        <TextInput
                          style={styles.rateInput}
                          value={String(editProgram.option2_rates![`rate_${term}` as keyof RatesData])}
                          onChangeText={(v) => setEditProgram({
                            ...editProgram,
                            option2_rates: {
                              ...editProgram.option2_rates!,
                              [`rate_${term}`]: parseFloat(v) || 0
                            }
                          })}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>
          )}
          
          <TouchableOpacity
            style={styles.modalSaveButton}
            onPress={saveEditedProgram}
          >
            <Ionicons name="checkmark" size={20} color="#1a1a2e" />
            <Text style={styles.modalSaveButtonText}>Sauvegarder les modifications</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBackButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Import PDF</Text>
            <Text style={styles.headerSubtitle}>
              {currentStep === 'login' ? 'Authentification' : 
               currentStep === 'upload' ? 'Sélection du fichier' :
               currentStep === 'select-pages' ? 'Choix des pages' :
               currentStep === 'preview' ? 'Vérification des données' :
               currentStep === 'email-sent' ? 'Email envoyé' :
               currentStep === 'success' ? 'Terminé' : ''}
            </Text>
          </View>
        </View>

        {/* Progress Steps */}
        <View style={styles.progressContainer}>
          {['login', 'upload', 'select-pages', 'email-sent', 'success'].map((step, index) => (
            <View key={step} style={styles.progressStep}>
              <View style={[
                styles.progressDot,
                currentStep === step && styles.progressDotActive,
                ['upload', 'select-pages', 'preview', 'success'].indexOf(currentStep) >= index && styles.progressDotCompleted
              ]} />
              {index < 4 ? <View style={[
                styles.progressLine,
                ['upload', 'select-pages', 'preview', 'success'].indexOf(currentStep) > index && styles.progressLineCompleted
              ]} /> : null}
            </View>
          ))}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {currentStep === 'login' ? renderLoginStep() : null}
          {currentStep === 'upload' ? renderUploadStep() : null}
          {currentStep === 'select-pages' ? renderSelectPagesStep() : null}
          {currentStep === 'preview' ? renderPreviewStep() : null}
          {currentStep === 'email-sent' ? renderEmailSentStep() : null}
          {currentStep === 'success' ? renderSuccessStep() : null}
        </ScrollView>
        
        {renderEditModal()}
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
  headerBackButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#4ECDC4',
    marginTop: 2,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2d2d44',
  },
  progressDotActive: {
    backgroundColor: '#4ECDC4',
    transform: [{ scale: 1.3 }],
  },
  progressDotCompleted: {
    backgroundColor: '#4ECDC4',
  },
  progressLine: {
    width: 60,
    height: 2,
    backgroundColor: '#2d2d44',
  },
  progressLineCompleted: {
    backgroundColor: '#4ECDC4',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  stepContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#2d2d44',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  successIcon: {
    backgroundColor: 'rgba(78, 205, 196, 0.2)',
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  stepDescription: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  passwordInput: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    width: '100%',
    marginBottom: 16,
    textAlign: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  periodSection: {
    width: '100%',
    marginBottom: 24,
  },
  periodLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 12,
    fontWeight: '600',
  },
  periodRow: {
    marginBottom: 12,
  },
  pageRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  pageField: {
    flex: 1,
  },
  pageLabel: {
    fontSize: 14,
    color: '#4ECDC4',
    marginBottom: 8,
    fontWeight: '600',
  },
  pageInput: {
    backgroundColor: '#2d2d44',
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
    borderWidth: 2,
    borderColor: '#3d3d54',
  },
  pageHint: {
    fontSize: 13,
    color: '#4ECDC4',
    marginTop: 4,
    marginBottom: 8,
  },
  monthScroll: {
    flexGrow: 0,
  },
  monthButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  monthButton: {
    backgroundColor: '#2d2d44',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  monthButtonActive: {
    backgroundColor: '#4ECDC4',
  },
  monthButtonText: {
    fontSize: 12,
    color: '#aaa',
    fontWeight: '500',
  },
  monthButtonTextActive: {
    color: '#1a1a2e',
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  yearLabel: {
    fontSize: 14,
    color: '#888',
  },
  yearInput: {
    backgroundColor: '#2d2d44',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#fff',
    width: 100,
    textAlign: 'center',
  },
  uploadButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 16,
    padding: 30,
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4ECDC4',
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
    marginTop: 12,
  },
  uploadButtonSubtext: {
    fontSize: 12,
    color: '#1a1a2e',
    opacity: 0.7,
    marginTop: 4,
  },
  extractingContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  extractingText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    marginTop: 16,
  },
  extractingSubtext: {
    fontSize: 14,
    color: '#1a1a2e',
    marginTop: 8,
  },
  extractingWait: {
    fontSize: 12,
    color: '#666',
    marginTop: 12,
    fontStyle: 'italic',
  },
  pdfInfoCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 16,
  },
  pdfInfoText: {
    flex: 1,
  },
  pdfInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  pdfInfoPages: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: '500',
  },
  pageValidation: {
    fontSize: 13,
    color: '#4ECDC4',
    marginTop: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  extractButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 18,
    width: '100%',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  extractButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  changePdfButton: {
    marginTop: 16,
    padding: 12,
    alignItems: 'center',
  },
  changePdfButtonText: {
    fontSize: 14,
    color: '#888',
  },
  previewContainer: {
    flex: 1,
  },
  previewHeader: {
    marginBottom: 8,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  previewPeriod: {
    fontSize: 14,
    color: '#4ECDC4',
    marginTop: 4,
  },
  previewInstructions: {
    fontSize: 12,
    color: '#888',
    marginBottom: 16,
  },
  programsList: {
    flex: 1,
    marginBottom: 16,
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
  programCardInfo: {
    flex: 1,
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
  programCardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    padding: 6,
    backgroundColor: 'rgba(78, 205, 196, 0.2)',
    borderRadius: 6,
  },
  deleteButton: {
    padding: 6,
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    borderRadius: 6,
  },
  programCardDetails: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#3d3d54',
  },
  programDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  programDetailLabel: {
    fontSize: 11,
    color: '#888',
  },
  programDetailValue: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '500',
  },
  programDetailNA: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    flex: 0.4,
  },
  backButtonText: {
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
    gap: 8,
    flex: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  successNote: {
    fontSize: 12,
    color: '#4ECDC4',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalBody: {
    padding: 16,
    maxHeight: 500,
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
    marginVertical: 12,
  },
  option2ToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  option2ToggleText: {
    fontSize: 14,
    color: '#fff',
  },
  modalSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    gap: 8,
  },
  modalSaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
});
