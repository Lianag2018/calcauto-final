import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { API_URL } from '../../utils/api';

interface InventoryVehicle {
  id: string;
  stock_no: string;
  vin: string;
  brand: string;
  model: string;
  trim: string;
  body_style: string;
  year: number;
  type: 'neuf' | 'occasion';
  pdco: number;
  ep_cost: number;
  holdback: number;
  net_cost: number;
  msrp: number;
  asking_price: number;
  sold_price: number | null;
  status: 'disponible' | 'réservé' | 'vendu';
  km: number;
  color: string;
  model_code?: string;
  shared?: boolean;
}

interface InventoryStats {
  total: number;
  disponible: number;
  reserve: number;
  vendu: number;
  neuf: number;
  occasion: number;
  total_msrp: number;
  total_cost: number;
  potential_profit: number;
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0 }).format(price);
};

export default function InventoryScreen() {
  const { getToken, user } = useAuth();
  // Le code et la version décident des taux : administrateur ou directeur seulement
  const canEditIdentity = !!user?.is_admin || ['admin', 'directeur'].includes((user?.etv_role || '').toLowerCase());
  const [vehicles, setVehicles] = useState<InventoryVehicle[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedData, setScannedData] = useState<any>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewData, setReviewData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  // Batch PDF scanning
  const [scanQueue, setScanQueue] = useState<any[]>([]);  // résultats en attente de révision
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, scanning: false });
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const [filter, setFilter] = useState<'tous' | 'neuf' | 'occasion'>('tous');
  const [statusFilter, setStatusFilter] = useState<'tous' | 'disponible' | 'réservé' | 'vendu'>('tous');
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    stock_no: '',
    vin: '',
    brand: '',
    model: '',
    trim: '',
    body_style: '',
    year: new Date().getFullYear().toString(),
    type: 'neuf',
    pdco: '',
    ep_cost: '',
    holdback: '',
    msrp: '',
    asking_price: '',
    km: '0',
    color: '',
  });

  // SCI vehicle hierarchy for cascading dropdowns
  const [sciHierarchy, setSciHierarchy] = useState<any>(null);

  // Fiche d'un véhicule : correction du code de modèle, de la version, etc.
  const [editVehicle, setEditVehicle] = useState<InventoryVehicle | null>(null);
  const [editForm, setEditForm] = useState({ model_code: '', trim: '', body_style: '', color: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [productCodes, setProductCodes] = useState<any[]>([]);
  // Version décodée, versions connues et codes possibles pour la fiche ouverte
  const [editSuggest, setEditSuggest] = useState<any>(null);

  const loadEditSuggest = async (stockNo: string, trim?: string) => {
    try {
      const token = await getToken();
      const res = await axios.get(`${API_URL}/api/inventory/${encodeURIComponent(stockNo)}/code-suggestions`, {
        headers: { Authorization: `Bearer ${token}` },
        params: trim ? { trim } : {},
      });
      setEditSuggest(res.data);
    } catch (e) {
      console.log('Could not load code suggestions');
    }
  };

  const pickTrim = (trim: string) => {
    setEditForm(form => ({ ...form, trim }));
    if (editVehicle) loadEditSuggest(editVehicle.stock_no, trim);
  };

  const openEdit = async (vehicle: InventoryVehicle) => {
    setEditVehicle(vehicle);
    setEditError('');
    setEditSuggest(null);
    if (vehicle.type !== 'occasion') loadEditSuggest(vehicle.stock_no);
    setEditForm({
      model_code: vehicle.model_code || '', trim: vehicle.trim || '',
      body_style: vehicle.body_style || '', color: vehicle.color || '',
    });
    if (productCodes.length === 0) {
      try {
        const res = await axios.get(`${API_URL}/api/product-codes`);
        if (Array.isArray(res.data)) setProductCodes(res.data);
      } catch (e) {
        console.log('Could not load product codes');
      }
    }
  };

  const codeSuggestions = editVehicle ? productCodes.filter((c: any) =>
    (c.brand || '').toLowerCase() === (editVehicle.brand || '').toLowerCase()
    && (c.model || '').toLowerCase().replace(/\s+/g, '') === (editVehicle.model || '').toLowerCase().replace(/\s+/g, '')
    // Recherche au clavier dans tout le référentiel, dès deux caractères
    && editForm.model_code.length >= 2
    && !(editSuggest?.codes || []).some((x: any) => x.code === (c.code || '').toUpperCase())
    && (c.code || '').toUpperCase().startsWith(editForm.model_code.toUpperCase())
    && (c.code || '').toUpperCase() !== editForm.model_code.toUpperCase()
  ).slice(0, 8) : [];

  const saveEdit = async () => {
    if (!editVehicle) return;
    const changes: any = {};
    (['model_code', 'trim', 'body_style', 'color'] as const).forEach(key => {
      const value = (editForm[key] || '').trim();
      if (value && value !== ((editVehicle as any)[key] || '')) changes[key] = key === 'model_code' ? value.toUpperCase() : value;
    });
    if (Object.keys(changes).length === 0) { setEditVehicle(null); return; }
    setEditSaving(true);
    setEditError('');
    try {
      const token = await getToken();
      await axios.put(`${API_URL}/api/inventory/${encodeURIComponent(editVehicle.stock_no)}`, changes, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEditVehicle(null);
      fetchData();
    } catch (e: any) {
      setEditError(e?.response?.data?.detail || "La fiche n'a pas pu être enregistrée");
    } finally {
      setEditSaving(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const params: any = {};
      if (filter !== 'tous') params.type = filter;
      if (statusFilter !== 'tous') params.status = statusFilter;

      const [vehiclesRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/api/inventory`, { headers, params }),
        axios.get(`${API_URL}/api/inventory/stats/summary`, { headers }),
      ]);

      setVehicles(vehiclesRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken, filter, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load SCI vehicle hierarchy for cascading dropdowns
  useEffect(() => {
    const loadHierarchy = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/sci/vehicle-hierarchy`);
        setSciHierarchy(res.data);
      } catch (e) {
        console.log('Could not load SCI hierarchy:', e);
      }
    };
    loadHierarchy();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleAddVehicle = async () => {
    if (!formData.stock_no || !formData.brand || !formData.model) {
      Platform.OS === 'web' 
        ? alert('Stock #, Marque et Modèle sont requis')
        : Alert.alert('Erreur', 'Stock #, Marque et Modèle sont requis');
      return;
    }

    try {
      const token = await getToken();
      await axios.post(`${API_URL}/api/inventory`, {
        stock_no: formData.stock_no,
        vin: formData.vin,
        brand: formData.brand,
        model: formData.model,
        trim: formData.trim,
        body_style: formData.body_style,
        year: parseInt(formData.year) || new Date().getFullYear(),
        type: formData.type,
        pdco: parseFloat(formData.pdco) || 0,
        ep_cost: parseFloat(formData.ep_cost) || 0,
        holdback: parseFloat(formData.holdback) || 0,
        msrp: parseFloat(formData.msrp) || 0,
        asking_price: parseFloat(formData.asking_price) || 0,
        km: parseInt(formData.km) || 0,
        color: formData.color,
      }, { headers: { Authorization: `Bearer ${token}` } });

      setShowAddModal(false);
      resetForm();
      fetchData();
      Platform.OS === 'web' 
        ? alert('Véhicule ajouté!')
        : Alert.alert('Succès', 'Véhicule ajouté!');
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Erreur lors de l\'ajout';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Erreur', msg);
    }
  };

  const resetForm = () => {
    setFormData({
      stock_no: '',
      vin: '',
      brand: '',
      model: '',
      trim: '',
      body_style: '',
      year: new Date().getFullYear().toString(),
      type: 'neuf',
      pdco: '',
      ep_cost: '',
      holdback: '',
      msrp: '',
      asking_price: '',
      km: '0',
      color: '',
    });
  };

  const handleStatusChange = async (stockNo: string, newStatus: string) => {
    try {
      const token = await getToken();
      await axios.put(
        `${API_URL}/api/inventory/${stockNo}/status?status=${newStatus}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  // Invoice scanning functions
  const pickImage = async (useCamera: boolean) => {
    try {
      let result;
      
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Platform.OS === 'web'
            ? alert('Permission caméra requise')
            : Alert.alert('Erreur', 'Permission caméra requise');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          base64: true,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          base64: true,
        });
      }

      console.log('Image picker result:', result?.canceled, result?.assets?.[0]?.base64?.length);

      if (!result.canceled && result.assets?.[0]) {
        const base64 = result.assets[0].base64;
        if (base64 && base64.length > 0) {
          await scanInvoice(base64, false);
        } else {
          Platform.OS === 'web'
            ? alert('Erreur: Image non chargée correctement')
            : Alert.alert('Erreur', 'Image non chargée correctement');
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Platform.OS === 'web'
        ? alert('Erreur lors de la sélection de l\'image')
        : Alert.alert('Erreur', 'Erreur lors de la sélection de l\'image');
    }
  };

  // Upload PDF file(s) (web only) - supporte multi-fichiers
  const pickPdfFile = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Info', 'Upload PDF disponible uniquement sur le web');
      return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    input.multiple = true;  // Permettre la sélection multiple
    
    input.onchange = async (e: any) => {
      const files = Array.from(e.target.files || []) as File[];
      if (files.length === 0) return;
      
      if (files.length === 1) {
        // Un seul fichier: comportement classique
        try {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = (reader.result as string).split(',')[1];
            await scanInvoice(base64, true);
          };
          reader.readAsDataURL(files[0]);
        } catch (error) {
          console.error('Error reading PDF:', error);
          alert('Erreur lors de la lecture du PDF');
        }
      } else {
        // Plusieurs fichiers: batch scanning
        await batchScanPdfs(files);
      }
    };
    
    input.click();
  };

  // Batch scan: traiter plusieurs PDFs séquentiellement
  const batchScanPdfs = async (files: File[]) => {
    setShowScanModal(false);
    setScanProgress({ current: 0, total: files.length, scanning: true });
    setBatchErrors([]);
    const results: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      setScanProgress({ current: i + 1, total: files.length, scanning: true });
      
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(files[i]);
        });

        const token = await getToken();
        const response = await axios.post(
          `${API_URL}/api/inventory/scan-invoice`,
          { image_base64: base64, is_pdf: true },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 90000 }
        );

        if (response.data.success || response.data.review_required) {
          const vehicle = response.data.vehicle || {};
          results.push({
            filename: files[i].name,
            stock_no: vehicle.stock_no || '',
            vin: vehicle.vin || '',
            brand: vehicle.brand || '',
            model: vehicle.model || '',
            trim: vehicle.trim || '',
            body_style: vehicle.body_style || '',
            year: vehicle.year || new Date().getFullYear(),
            type: vehicle.type || 'neuf',
            ep_cost: vehicle.ep_cost || 0,
            pdco: vehicle.pdco || 0,
            holdback: vehicle.holdback || 0,
            net_cost: vehicle.net_cost || 0,
            msrp: vehicle.msrp || 0,
            asking_price: vehicle.asking_price || vehicle.msrp || 0,
            color: vehicle.color || '',
            model_code: vehicle.model_code || '',
            options: vehicle.options || [],
            parse_method: response.data.parse_method || 'unknown',
            blocking_errors: response.data.blocking_errors || [],
          });
        } else {
          errors.push(`${files[i].name}: ${response.data.message || 'Scan échoué'}`);
        }
      } catch (err: any) {
        errors.push(`${files[i].name}: ${err.response?.data?.detail || err.message || 'Erreur'}`);
      }
    }

    setScanProgress({ current: files.length, total: files.length, scanning: false });
    setBatchErrors(errors);

    if (results.length > 0) {
      // Mettre tout sauf le premier dans la file d'attente
      setScanQueue(results.slice(1));
      // Ouvrir la révision du premier résultat
      setReviewData(results[0]);
      setShowReviewModal(true);
    } else {
      alert(`Aucun PDF n'a pu être analysé.\n${errors.join('\n')}`);
    }
  };

  const scanInvoice = async (base64Data: string, isPdf: boolean = false) => {
    setScanning(true);
    setScannedData(null);
    
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Non authentifié - veuillez vous reconnecter');
      }
      
      console.log(`Scanning invoice: ${base64Data.length} chars, isPdf: ${isPdf}`);
      
      // Appeler scan-invoice (SANS sauvegarde) pour obtenir les données à réviser
      const response = await axios.post(
        `${API_URL}/api/inventory/scan-invoice`,
        { image_base64: base64Data, is_pdf: isPdf },
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 60000  // 60 secondes timeout
        }
      );

      console.log('Scan response:', response.data);

      // Accepter les scans réussis OU les scans partiels nécessitant révision
      if (response.data.success || response.data.review_required) {
        // Préparer les données pour révision/correction
        const vehicle = response.data.vehicle || {};
        
        // Si révision requise, afficher les erreurs bloquantes
        const blockingErrors = response.data.blocking_errors || [];
        if (blockingErrors.length > 0) {
          console.log('Blocking errors:', blockingErrors);
          // On continue quand même pour permettre la correction manuelle
        }
        
        setReviewData({
          stock_no: vehicle.stock_no || '',
          vin: vehicle.vin || '',
          brand: vehicle.brand || 'Ram',
          model: vehicle.model || '',
          trim: vehicle.trim || '',
          body_style: vehicle.body_style || '',
          year: vehicle.year || new Date().getFullYear(),
          type: vehicle.type || 'neuf',
          ep_cost: vehicle.ep_cost || 0,
          pdco: vehicle.pdco || 0,
          holdback: vehicle.holdback || 0,
          net_cost: vehicle.net_cost || 0,
          msrp: vehicle.msrp || 0,
          asking_price: vehicle.asking_price || vehicle.msrp || 0,
          color: vehicle.color || '',
          model_code: vehicle.model_code || '',
          options: vehicle.options || [],
          parse_method: response.data.parse_method || 'unknown',
          blocking_errors: blockingErrors  // Garder pour affichage dans le modal
        });
        setShowScanModal(false);
        setShowReviewModal(true);
      } else {
        throw new Error(response.data.message || 'Scan échoué');
      }
    } catch (error: any) {
      console.error('Scan error:', error);
      const msg = error.response?.data?.detail || error.message || 'Erreur lors du scan';
      Platform.OS === 'web' ? alert(`Erreur: ${msg}`) : Alert.alert('Erreur', msg);
    } finally {
      setScanning(false);
    }
  };

  const saveReviewedVehicle = async () => {
    if (!reviewData.stock_no || !reviewData.brand || !reviewData.model) {
      Platform.OS === 'web'
        ? alert('Stock #, Marque et Modèle sont requis')
        : Alert.alert('Erreur', 'Stock #, Marque et Modèle sont requis');
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      
      const ep = parseFloat(reviewData.ep_cost) || 0;
      const hb = parseFloat(reviewData.holdback) || 0;
      const netCost = reviewData.net_cost ? parseFloat(reviewData.net_cost) : (ep - hb);

      await axios.post(`${API_URL}/api/inventory`, {
        stock_no: reviewData.stock_no,
        vin: reviewData.vin,
        brand: reviewData.brand,
        model: reviewData.model,
        trim: reviewData.trim,
        body_style: reviewData.body_style || '',
        year: parseInt(reviewData.year) || new Date().getFullYear(),
        type: reviewData.type,
        pdco: parseFloat(reviewData.pdco) || 0,
        ep_cost: ep,
        holdback: hb,
        net_cost: netCost,
        msrp: parseFloat(reviewData.msrp) || 0,
        asking_price: parseFloat(reviewData.asking_price) || 0,
        km: 0,
        color: reviewData.color,
        // Code de produit et options de la facture : ils départagent les lignes
        // de programme (ex. « Big Horn (DT6H91) » et « Big Horn (excludes DT6H91) »)
        model_code: reviewData.model_code || '',
        options: reviewData.options || [],
      }, { headers: { Authorization: `Bearer ${token}` } });

      // Vérifier s'il y a d'autres véhicules dans la file d'attente
      if (scanQueue.length > 0) {
        const next = scanQueue[0];
        const remaining = scanQueue.slice(1);
        setScanQueue(remaining);
        setReviewData(next);
        // Rester dans le review modal pour le prochain
        Platform.OS === 'web'
          ? null  // pas d'alert pour ne pas bloquer le flux
          : null;
      } else {
        setShowReviewModal(false);
        setReviewData(null);
        setScanProgress({ current: 0, total: 0, scanning: false });
        setBatchErrors([]);
      }
      
      fetchData();
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Erreur lors de la sauvegarde';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Erreur', msg);
    } finally {
      setSaving(false);
    }
  };

  // Passer au prochain véhicule sans sauvegarder celui-ci
  const skipReviewedVehicle = () => {
    if (scanQueue.length > 0) {
      const next = scanQueue[0];
      setScanQueue(scanQueue.slice(1));
      setReviewData(next);
    } else {
      setShowReviewModal(false);
      setReviewData(null);
      setScanProgress({ current: 0, total: 0, scanning: false });
      setBatchErrors([]);
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    if (!reviewData) {
      Platform.OS === 'web' 
        ? alert('Aucune donnée à exporter') 
        : Alert.alert('Erreur', 'Aucune donnée à exporter');
      return;
    }

    try {
      const token = await getToken();
      const exportData = {
        vin: reviewData.vin || '',
        model_code: reviewData.model_code || '',
        brand: reviewData.brand || '',
        model: reviewData.model || '',
        trim: reviewData.trim || '',
        year: reviewData.year?.toString() || '',
        stock_no: reviewData.stock_no || '',
        ep_cost: parseFloat(reviewData.ep_cost) || 0,
        pdco: parseFloat(reviewData.pdco) || parseFloat(reviewData.msrp) || 0,
        pref: parseFloat(reviewData.pref) || 0,
        holdback: parseFloat(reviewData.holdback) || 0,
        subtotal: parseFloat(reviewData.subtotal) || 0,
        total: parseFloat(reviewData.total) || 0,
        options: reviewData.options || []
      };

      const response = await axios.post(`${API_URL}/api/invoice/export-excel`, exportData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success && response.data.excel_base64) {
        if (Platform.OS === 'web') {
          // Download file
          const byteCharacters = atob(response.data.excel_base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = response.data.filename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          alert(`Fichier téléchargé: ${response.data.filename}`);
        } else {
          // Mobile: sauvegarder et partager le fichier
          const filename = response.data.filename || 'facture_export.xlsx';
          const fileUri = FileSystem.documentDirectory + filename;
          await FileSystem.writeAsStringAsync(fileUri, response.data.excel_base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Exporter Excel',
          });
        }
      }
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || 'Erreur export';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Erreur', msg);
    }
  };

  // Import from Excel (fichier corrigé manuellement)
  const handleImportExcel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setScanning(true);
      const token = await getToken();
      const file = result.assets[0];

      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'import.xlsx',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      } as any);

      const response = await axios.post(`${API_URL}/api/invoice/import-excel`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        const data = response.data.data;
        // Ouvrir le modal review avec les données importées (pas de re-parsing)
        setReviewData({
          vin: data.vin || '',
          model_code: data.model_code || '',
          brand: data.brand || '',
          model: data.model || '',
          trim: data.trim || '',
          year: data.year || new Date().getFullYear(),
          stock_no: data.stock_no || '',
          ep_cost: data.ep_cost || 0,
          pdco: data.pdco || 0,
          msrp: data.pdco || 0,
          pref: data.pref || 0,
          holdback: data.holdback || 0,
          net_cost: data.ep_cost || 0,
          subtotal: data.subtotal || 0,
          total: data.total || 0,
          color: data.color || '',
          options: data.options || [],
          import_source: 'excel',
        });
        setShowReviewModal(true);
        setShowScanModal(false);
        Alert.alert(
          'Import Excel',
          `${response.data.options_count} options importées. Vérifiez et confirmez.`
        );
      }
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message || 'Erreur import';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Erreur Import', msg);
    } finally {
      setScanning(false);
    }
  };

  const updateReviewField = (field: string, value: string | number) => {
    setReviewData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleDelete = async (stockNo: string) => {
    const confirm = Platform.OS === 'web'
      ? window.confirm(`Supprimer le véhicule ${stockNo}?`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert('Confirmer', `Supprimer le véhicule ${stockNo}?`, [
            { text: 'Annuler', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Supprimer', onPress: () => resolve(true), style: 'destructive' },
          ]);
        });

    if (!confirm) return;

    try {
      const token = await getToken();
      await axios.delete(`${API_URL}/api/inventory/${stockNo}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchData();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
    }
  };

  const filteredVehicles = vehicles.filter(v => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      v.stock_no.toLowerCase().includes(query) ||
      v.brand.toLowerCase().includes(query) ||
      v.model.toLowerCase().includes(query) ||
      v.vin.toLowerCase().includes(query)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'disponible': return '#e6c65a';
      case 'réservé': return '#FFB347';
      case 'vendu': return '#FF6B6B';
      default: return '#9aa3b1';
    }
  };

  // ===================== SCI Cascading Dropdown Helpers =====================
  
  const getSciOptions = (level: 'brand' | 'model' | 'trim' | 'body_style', formOrReview: any) => {
    if (!sciHierarchy) return [];
    
    if (level === 'brand') {
      return Object.keys(sciHierarchy).sort();
    }
    
    const brand = formOrReview.brand || '';
    if (level === 'model') {
      if (!brand || !sciHierarchy[brand]) return [];
      return Object.keys(sciHierarchy[brand]).sort();
    }
    
    const model = formOrReview.model || '';
    const modelData = sciHierarchy[brand]?.[model];
    if (!modelData) return [];
    
    if (level === 'trim') {
      return Object.keys(modelData.trims || {}).sort();
    }
    
    if (level === 'body_style') {
      const trim = formOrReview.trim || '';
      return (modelData.trims?.[trim] || []).sort();
    }
    
    return [];
  };

  // State for picker modal
  const [pickerConfig, setPickerConfig] = useState<{
    visible: boolean;
    label: string;
    options: string[];
    onSelect: (value: string) => void;
  }>({ visible: false, label: '', options: [], onSelect: () => {} });

  const openPicker = (label: string, options: string[], onSelect: (v: string) => void) => {
    if (options.length === 0) return;
    setPickerConfig({ visible: true, label, options, onSelect });
  };

  const renderSciDropdown = (
    label: string,
    field: 'brand' | 'model' | 'trim' | 'body_style',
    currentValue: string,
    onSelect: (value: string) => void,
    formOrReview: any,
    testIdPrefix: string
  ) => {
    const options = getSciOptions(field, formOrReview);
    const hasOptions = options.length > 0;
    
    return (
      <View data-testid={`${testIdPrefix}-${field}-container`}>
        <Text style={styles.formLabel}>{label}</Text>
        <TouchableOpacity
          style={[sciStyles.dropdownButton, !hasOptions && sciStyles.dropdownDisabled]}
          onPress={() => {
            if (hasOptions) {
              openPicker(label, options, onSelect);
            }
          }}
          data-testid={`${testIdPrefix}-${field}-button`}
        >
          <Text style={[sciStyles.dropdownButtonText, !currentValue && sciStyles.dropdownPlaceholder]} numberOfLines={1}>
            {currentValue || (hasOptions ? `Choisir...` : `Choisir ${field === 'brand' ? 'marque' : field === 'model' ? 'modèle' : field === 'trim' ? 'trim' : 'carrosserie'}`)}
          </Text>
          <Text style={sciStyles.dropdownArrow}>{'\u25BC'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Handlers for form cascading - reset child fields when parent changes
  const handleFormSciSelect = (field: 'brand' | 'model' | 'trim' | 'body_style', value: string) => {
    if (field === 'brand') {
      setFormData(prev => ({ ...prev, brand: value, model: '', trim: '', body_style: '' }));
    } else if (field === 'model') {
      setFormData(prev => ({ ...prev, model: value, trim: '', body_style: '' }));
    } else if (field === 'trim') {
      // Auto-select body_style if only one option
      const bodyOpts = sciHierarchy?.[formData.brand]?.[formData.model]?.trims?.[value] || [];
      if (bodyOpts.length === 1) {
        setFormData(prev => ({ ...prev, trim: value, body_style: bodyOpts[0] }));
      } else {
        setFormData(prev => ({ ...prev, trim: value, body_style: '' }));
      }
    } else if (field === 'body_style') {
      setFormData(prev => ({ ...prev, body_style: value }));
    }
  };

  // Handlers for review modal cascading
  const handleReviewSciSelect = (field: 'brand' | 'model' | 'trim' | 'body_style', value: string) => {
    if (field === 'brand') {
      updateReviewField('brand', value);
      updateReviewField('model', '');
      updateReviewField('trim', '');
      updateReviewField('body_style', '');
    } else if (field === 'model') {
      updateReviewField('model', value);
      updateReviewField('trim', '');
      updateReviewField('body_style', '');
    } else if (field === 'trim') {
      updateReviewField('trim', value);
      const brand = reviewData?.brand || '';
      const model = reviewData?.model || '';
      const bodyOpts = sciHierarchy?.[brand]?.[model]?.trims?.[value] || [];
      if (bodyOpts.length === 1) {
        updateReviewField('body_style', bodyOpts[0]);
      } else {
        updateReviewField('body_style', '');
      }
    } else if (field === 'body_style') {
      updateReviewField('body_style', value);
    }
  };
  // ===================== End SCI Dropdown =====================

  const renderVehicleCard = ({ item }: { item: InventoryVehicle }) => (
    <View style={styles.vehicleCard}>
      <View style={styles.cardHeader}>
        <View style={styles.stockBadge}>
          <Text style={styles.stockText}>#{item.stock_no}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
        <View style={[styles.typeBadge, { backgroundColor: item.type === 'neuf' ? '#e6c65a' : '#9aa3b1' }]}>
          <Text style={styles.typeText}>{item.type.toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.vehicleTitle}>{item.year} {item.brand} {item.model}</Text>
      {item.trim && <Text style={styles.vehicleTrim}>{item.trim}{item.body_style ? ` - ${item.body_style}` : ''}</Text>}
      {item.vin && <Text style={styles.vehicleVin}>VIN: {item.vin}</Text>}
      <Text style={[styles.vehicleVin, { color: item.model_code ? '#FFB347' : '#FF6B6B' }]} data-testid={`inv-code-${item.stock_no}`}>
        Code : {item.model_code || 'à entrer'}{item.shared ? '  ·  Inventaire Kennebec' : ''}
      </Text>

      <View style={styles.priceGrid}>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>PDSF</Text>
          <Text style={styles.priceValue}>{formatPrice(item.msrp)}</Text>
        </View>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>Prix affiché</Text>
          <Text style={styles.priceValue}>{formatPrice(item.asking_price)}</Text>
        </View>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>Coût net</Text>
          <Text style={[styles.priceValue, styles.costValue]}>{formatPrice(item.net_cost)}</Text>
        </View>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>Profit pot.</Text>
          <Text style={[styles.priceValue, styles.profitValue]}>
            {formatPrice(item.asking_price - item.net_cost)}
          </Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionBtn, item.status === 'disponible' && styles.actionBtnActive]}
          onPress={() => handleStatusChange(item.stock_no, 'disponible')}
        >
          <Ionicons name="checkmark-circle" size={18} color={item.status === 'disponible' ? '#e6c65a' : '#8a93a1'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, item.status === 'réservé' && styles.actionBtnActive]}
          onPress={() => handleStatusChange(item.stock_no, 'réservé')}
        >
          <Ionicons name="time" size={18} color={item.status === 'réservé' ? '#FFB347' : '#8a93a1'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, item.status === 'vendu' && styles.actionBtnActive]}
          onPress={() => handleStatusChange(item.stock_no, 'vendu')}
        >
          <Ionicons name="car" size={18} color={item.status === 'vendu' ? '#FF6B6B' : '#8a93a1'} />
        </TouchableOpacity>
        {canEditIdentity && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)} data-testid={`inv-edit-${item.stock_no}`}>
            <Ionicons name="create-outline" size={18} color="#e6c65a" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.stock_no)}>
          <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e6c65a" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventaire</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={styles.scanButton} 
            onPress={() => setShowScanModal(true)}
            testID="scan-invoice-button"
          >
            <Ionicons name="camera" size={22} color="#07090e" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.addButton} 
            onPress={() => setShowAddModal(true)}
            testID="add-vehicle-button"
          >
            <Ionicons name="add" size={24} color="#07090e" />
          </TouchableOpacity>
        </View>
      </View>

      {stats && (
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#e6c65a' }]}>{stats.disponible}</Text>
            <Text style={styles.statLabel}>Dispo</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#FFB347' }]}>{stats.reserve}</Text>
            <Text style={styles.statLabel}>Réservé</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#9aa3b1' }]}>{stats.vendu || 0}</Text>
            <Text style={styles.statLabel}>Vendu</Text>
          </View>
        </View>
      )}

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9aa3b1" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher (stock, marque, modèle...)"
          placeholderTextColor="#8a93a1"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.filterContainer}>
        {(['tous', 'neuf', 'occasion'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredVehicles}
        renderItem={renderVehicleCard}
        keyExtractor={(item) => item.stock_no}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e6c65a" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="car-outline" size={48} color="#9aa3b1" />
            <Text style={styles.emptyText}>Aucun véhicule en inventaire</Text>
          </View>
        }
      />

      {/* Add Vehicle Modal */}
      <Modal visible={!!editVehicle} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Fiche #{editVehicle?.stock_no}</Text>
              <TouchableOpacity onPress={() => setEditVehicle(null)}>
                <Ionicons name="close" size={24} color="#f4f1ea" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.formScroll}>
              <Text style={{ color: '#b9c0cc', marginBottom: 12 }}>
                {editVehicle?.year} {editVehicle?.brand} {editVehicle?.model}
                {editVehicle?.shared ? "  ·  Inventaire Kennebec (la correction vaut pour tous)" : ''}
              </Text>
              <Text style={styles.formLabel}>Version</Text>
              {editSuggest && (editSuggest.vin_trim || editSuggest.cab) ? (
                <Text style={{ color: '#e6c65a', fontSize: 12, marginBottom: 6 }} data-testid="edit-decoded">
                  NIV décodé : {[editSuggest.vin_trim, editSuggest.cab, /4x4|4wd/i.test(editSuggest.drive || '') ? '4x4' : ''].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
                {(editSuggest?.known_trims || []).map((trim: string) => {
                  const active = trim.toLowerCase() === (editForm.trim || '').toLowerCase();
                  return (
                    <TouchableOpacity
                      key={trim}
                      onPress={() => pickTrim(trim)}
                      style={{ backgroundColor: active ? '#e6c65a' : '#111722', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12, marginRight: 6, marginBottom: 6 }}
                      data-testid={`edit-trim-${trim}`}
                    >
                      <Text style={{ color: active ? '#07090e' : '#f4f1ea', fontWeight: active ? '700' : '400' }}>{trim}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput style={styles.formInput} value={editForm.trim}
                onChangeText={(v) => setEditForm({ ...editForm, trim: v })}
                onBlur={() => { if (editVehicle && editForm.trim.trim()) loadEditSuggest(editVehicle.stock_no, editForm.trim.trim()); }}
                placeholder="Ex : Big Horn" placeholderTextColor="#8a93a1" />

              <Text style={[styles.formLabel, { marginTop: 14 }]}>Code de modèle</Text>
              {editSuggest && (editSuggest.codes || []).length > 0 ? (
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ color: '#b9c0cc', fontSize: 12, marginBottom: 6 }}>Codes possibles pour cette version :</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {editSuggest.codes.map((c: any) => {
                      const active = c.code === editForm.model_code;
                      return (
                        <TouchableOpacity
                          key={c.code}
                          onPress={() => setEditForm({ ...editForm, model_code: c.code })}
                          style={{ backgroundColor: active ? '#FFB347' : '#111722', borderColor: '#FFB347', borderWidth: 1, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 11, marginRight: 6, marginBottom: 6 }}
                          data-testid={`edit-code-${c.code}`}
                        >
                          <Text style={{ color: active ? '#07090e' : '#FFB347', fontWeight: '700' }}>{c.code}</Text>
                          <Text style={{ color: active ? '#07090e' : '#cfd4dc', fontSize: 11 }}>{c.description}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : editSuggest && editSuggest.needs_code && !editVehicle?.model_code ? (
                <Text style={{ color: '#FFB347', fontSize: 12, marginBottom: 6 }} data-testid="edit-needs-code">
                  Aucun code connu pour cette version. Entre-le une fois : il sera retenu pour les prochains véhicules de cette version.
                </Text>
              ) : null}
              <TextInput
                style={styles.formInput}
                value={editForm.model_code}
                onChangeText={(v) => setEditForm({ ...editForm, model_code: v.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                placeholder="Ex : DT6H98"
                placeholderTextColor="#8a93a1"
                autoCapitalize="characters"
                maxLength={8}
              />
              {codeSuggestions.map((c: any) => (
                <TouchableOpacity
                  key={c.code}
                  onPress={() => setEditForm({ ...editForm, model_code: c.code, trim: editForm.trim || c.trim || '' })}
                  style={{ paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#303744' }}
                >
                  <Text style={{ color: '#f4f1ea' }}>
                    <Text style={{ color: '#FFB347', fontWeight: '700' }}>{c.code}  </Text>{c.full_description}
                  </Text>
                </TouchableOpacity>
              ))}
              <Text style={[styles.formLabel, { marginTop: 14 }]}>Carrosserie</Text>
              <TextInput style={styles.formInput} value={editForm.body_style}
                onChangeText={(v) => setEditForm({ ...editForm, body_style: v })} placeholder="Ex : Crew Cab 4x4" placeholderTextColor="#8a93a1" />
              <Text style={[styles.formLabel, { marginTop: 14 }]}>Couleur</Text>
              <TextInput style={styles.formInput} value={editForm.color}
                onChangeText={(v) => setEditForm({ ...editForm, color: v })} placeholderTextColor="#8a93a1" />
              {editError ? <Text style={{ color: '#FF6B6B', marginTop: 12 }}>{editError}</Text> : null}
              <TouchableOpacity style={styles.submitBtn} onPress={saveEdit} disabled={editSaving}>
                <Text style={styles.submitBtnText}>{editSaving ? 'Enregistrement…' : 'Enregistrer la fiche'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ajouter un véhicule</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#f4f1ea" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formScroll}>
              <View style={styles.formRow}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Stock # *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.stock_no}
                    onChangeText={(v) => setFormData({ ...formData, stock_no: v })}
                    placeholder="46093"
                    placeholderTextColor="#8a93a1"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>VIN</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.vin}
                    onChangeText={(v) => setFormData({ ...formData, vin: v })}
                    placeholder="3C6UR5CL..."
                    placeholderTextColor="#8a93a1"
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formGroup}>
                  {renderSciDropdown('Marque *', 'brand', formData.brand, (v) => handleFormSciSelect('brand', v), formData, 'add')}
                </View>
                <View style={styles.formGroup}>
                  {renderSciDropdown('Modèle *', 'model', formData.model, (v) => handleFormSciSelect('model', v), formData, 'add')}
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formGroup}>
                  {renderSciDropdown('Trim', 'trim', formData.trim, (v) => handleFormSciSelect('trim', v), formData, 'add')}
                </View>
                <View style={styles.formGroup}>
                  {renderSciDropdown('Carrosserie', 'body_style', formData.body_style, (v) => handleFormSciSelect('body_style', v), formData, 'add')}
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Année</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.year}
                    onChangeText={(v) => setFormData({ ...formData, year: v })}
                    keyboardType="numeric"
                    placeholder="2025"
                    placeholderTextColor="#8a93a1"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Type</Text>
                  <View style={styles.typeSelector}>
                    <TouchableOpacity
                      style={[styles.typeBtn, formData.type === 'neuf' && styles.typeBtnActive]}
                      onPress={() => setFormData({ ...formData, type: 'neuf' })}
                    >
                      <Text style={[styles.typeBtnText, formData.type === 'neuf' && styles.typeBtnTextActive]}>Neuf</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.typeBtn, formData.type === 'occasion' && styles.typeBtnActive]}
                      onPress={() => setFormData({ ...formData, type: 'occasion' })}
                    >
                      <Text style={[styles.typeBtnText, formData.type === 'occasion' && styles.typeBtnTextActive]}>Occasion</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <Text style={styles.sectionTitle}>💰 Prix & Coûts</Text>

              <View style={styles.formRow}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>PDCO (Prix dealer)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.pdco}
                    onChangeText={(v) => setFormData({ ...formData, pdco: v })}
                    keyboardType="numeric"
                    placeholder="94305"
                    placeholderTextColor="#8a93a1"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>EP (Coût réel)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.ep_cost}
                    onChangeText={(v) => setFormData({ ...formData, ep_cost: v })}
                    keyboardType="numeric"
                    placeholder="86630"
                    placeholderTextColor="#8a93a1"
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Holdback (facture)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.holdback}
                    onChangeText={(v) => setFormData({ ...formData, holdback: v })}
                    keyboardType="numeric"
                    placeholder="2829"
                    placeholderTextColor="#8a93a1"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>PDSF</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.msrp}
                    onChangeText={(v) => setFormData({ ...formData, msrp: v })}
                    keyboardType="numeric"
                    placeholder="99500"
                    placeholderTextColor="#8a93a1"
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Prix affiché</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.asking_price}
                    onChangeText={(v) => setFormData({ ...formData, asking_price: v })}
                    keyboardType="numeric"
                    placeholder="95995"
                    placeholderTextColor="#8a93a1"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Couleur</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.color}
                    onChangeText={(v) => setFormData({ ...formData, color: v })}
                    placeholder="Noir cristal"
                    placeholderTextColor="#8a93a1"
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleAddVehicle}>
                <Text style={styles.submitBtnText}>Ajouter le véhicule</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Batch Scan Progress Overlay */}
      {scanProgress.scanning && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxWidth: 400, maxHeight: 250 }]}>
              <View style={{ alignItems: 'center', padding: 30 }}>
                <ActivityIndicator size="large" color="#e6c65a" />
                <Text style={{ color: '#f4f1ea', fontSize: 18, fontWeight: '700', marginTop: 16 }} data-testid="batch-progress-text">
                  Analyse {scanProgress.current} / {scanProgress.total}
                </Text>
                <Text style={{ color: '#b9c0cc', fontSize: 13, marginTop: 8 }}>
                  Traitement des PDFs en cours...
                </Text>
                <View style={{ width: '100%', height: 6, backgroundColor: '#333', borderRadius: 3, marginTop: 16 }}>
                  <View style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%`, height: 6, backgroundColor: '#e6c65a', borderRadius: 3 }} />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Scan Invoice Modal */}
      <Modal visible={showScanModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.scanModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📸 Scanner une facture</Text>
              <TouchableOpacity onPress={() => { setShowScanModal(false); setScannedData(null); }}>
                <Ionicons name="close" size={24} color="#f4f1ea" />
              </TouchableOpacity>
            </View>

            {scanning ? (
              <View style={styles.scanningContainer}>
                <ActivityIndicator size="large" color="#e6c65a" />
                <Text style={styles.scanningText}>Analyse de la facture en cours...</Text>
                <Text style={styles.scanningSubtext}>L'IA extrait les données du véhicule</Text>
              </View>
            ) : scannedData ? (
              <ScrollView style={styles.scannedDataContainer}>
                <View style={styles.successBanner}>
                  <Ionicons name="checkmark-circle" size={24} color="#e6c65a" />
                  <Text style={styles.successText}>{scannedData.message}</Text>
                </View>
                
                <View style={styles.scannedVehicle}>
                  <Text style={styles.scannedTitle}>
                    {scannedData.vehicle?.year} {scannedData.vehicle?.brand} {scannedData.vehicle?.model}
                  </Text>
                  {scannedData.vehicle?.trim && (
                    <Text style={styles.scannedTrim}>{scannedData.vehicle.trim}</Text>
                  )}
                  <Text style={styles.scannedStock}>Stock #{scannedData.vehicle?.stock_no}</Text>
                  
                  <View style={styles.scannedPrices}>
                    <View style={styles.scannedPriceItem}>
                      <Text style={styles.scannedPriceLabel}>EP Cost</Text>
                      <Text style={styles.scannedPriceValue}>{formatPrice(scannedData.vehicle?.ep_cost || 0)}</Text>
                    </View>
                    <View style={styles.scannedPriceItem}>
                      <Text style={styles.scannedPriceLabel}>Holdback</Text>
                      <Text style={styles.scannedPriceValue}>{formatPrice(scannedData.vehicle?.holdback || 0)}</Text>
                    </View>
                    <View style={styles.scannedPriceItem}>
                      <Text style={styles.scannedPriceLabel}>Net Cost</Text>
                      <Text style={[styles.scannedPriceValue, { color: '#e6c65a' }]}>{formatPrice(scannedData.vehicle?.net_cost || 0)}</Text>
                    </View>
                  </View>
                  
                  {scannedData.options_count > 0 && (
                    <Text style={styles.optionsCount}>{scannedData.options_count} options extraites</Text>
                  )}
                </View>

                <TouchableOpacity 
                  style={styles.scanAgainBtn}
                  onPress={() => setScannedData(null)}
                >
                  <Ionicons name="camera" size={20} color="#e6c65a" />
                  <Text style={styles.scanAgainText}>Scanner une autre facture</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <View style={styles.scanOptionsContainer}>
                <Text style={styles.scanInstructions}>
                  Prenez une photo de votre facture FCA ou importez une image existante.
                </Text>
                
                <TouchableOpacity style={styles.scanOptionBtn} onPress={() => pickImage(true)}>
                  <View style={styles.scanOptionIcon}>
                    <Ionicons name="camera" size={32} color="#e6c65a" />
                  </View>
                  <View style={styles.scanOptionText}>
                    <Text style={styles.scanOptionTitle}>Prendre une photo</Text>
                    <Text style={styles.scanOptionDesc}>Utilisez l'appareil photo</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color="#8a93a1" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.scanOptionBtn} onPress={() => pickImage(false)}>
                  <View style={styles.scanOptionIcon}>
                    <Ionicons name="images" size={32} color="#e6c65a" />
                  </View>
                  <View style={styles.scanOptionText}>
                    <Text style={styles.scanOptionTitle}>Importer une image</Text>
                    <Text style={styles.scanOptionDesc}>Depuis la galerie ou les fichiers</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color="#8a93a1" />
                </TouchableOpacity>

                {Platform.OS === 'web' && (
                  <TouchableOpacity style={[styles.scanOptionBtn, styles.pdfOptionBtn]} onPress={pickPdfFile}>
                    <View style={[styles.scanOptionIcon, styles.pdfIcon]}>
                      <Ionicons name="document-text" size={32} color="#FF6B6B" />
                    </View>
                    <View style={styles.scanOptionText}>
                      <Text style={styles.scanOptionTitle}>Importer des PDFs</Text>
                      <Text style={styles.scanOptionDesc}>Un ou plusieurs PDFs de factures</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color="#8a93a1" />
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={[styles.scanOptionBtn, { borderColor: '#217346' }]} onPress={handleImportExcel}>
                  <View style={[styles.scanOptionIcon, { backgroundColor: 'rgba(33, 115, 70, 0.1)' }]}>
                    <Ionicons name="grid-outline" size={32} color="#217346" />
                  </View>
                  <View style={styles.scanOptionText}>
                    <Text style={styles.scanOptionTitle}>Importer un Excel</Text>
                    <Text style={styles.scanOptionDesc}>Fichier .xlsx corrigé manuellement</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color="#8a93a1" />
                </TouchableOpacity>

                <View style={styles.scanTips}>
                  <Text style={styles.scanTipsTitle}>💡 Conseils pour un meilleur scan:</Text>
                  <Text style={styles.scanTip}>• Photo bien éclairée</Text>
                  <Text style={styles.scanTip}>• Toute la facture visible</Text>
                  <Text style={styles.scanTip}>• Image nette et stable</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Review/Edit Modal - Révision des données scannées */}
      <Modal visible={showReviewModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Verifier et corriger</Text>
                {scanQueue.length > 0 && (
                  <Text style={{ color: '#e6c65a', fontSize: 12, marginTop: 2 }} data-testid="queue-counter">
                    + {scanQueue.length} en attente
                  </Text>
                )}
                {reviewData?.filename && (
                  <Text style={{ color: '#9aa3b1', fontSize: 11, marginTop: 2 }}>{reviewData.filename}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => { setShowReviewModal(false); setReviewData(null); setScanQueue([]); setScanProgress({ current: 0, total: 0, scanning: false }); }}>
                <Ionicons name="close" size={24} color="#f4f1ea" />
              </TouchableOpacity>
            </View>

            {reviewData && (
              <ScrollView style={styles.formScroll}>
                {/* Afficher les erreurs bloquantes si présentes */}
                {reviewData.blocking_errors && reviewData.blocking_errors.length > 0 ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="warning" size={20} color="#FF6B6B" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.errorBannerTitle}>Données incomplètes - Correction requise:</Text>
                      {reviewData.blocking_errors.map((err: string, idx: number) => (
                        <Text key={idx} style={styles.errorBannerItem}>• {err}</Text>
                      ))}
                    </View>
                  </View>
                ) : (
                  <View style={styles.reviewBanner}>
                    <Ionicons name="information-circle" size={20} color="#FFB347" />
                    <Text style={styles.reviewBannerText}>
                      Vérifiez les données extraites et corrigez si nécessaire
                    </Text>
                  </View>
                )}

                <View style={styles.formRow}>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Stock # *</Text>
                    <TextInput
                      style={styles.formInput}
                      value={reviewData.stock_no?.toString()}
                      onChangeText={(v) => updateReviewField('stock_no', v)}
                      placeholder="46093"
                      placeholderTextColor="#8a93a1"
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>VIN</Text>
                    <TextInput
                      style={styles.formInput}
                      value={reviewData.vin}
                      onChangeText={(v) => updateReviewField('vin', v)}
                      placeholder="3C6UR5CL..."
                      placeholderTextColor="#8a93a1"
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formGroup}>
                    {renderSciDropdown('Marque *', 'brand', reviewData.brand || '', (v) => handleReviewSciSelect('brand', v), reviewData, 'review')}
                  </View>
                  <View style={styles.formGroup}>
                    {renderSciDropdown('Modèle *', 'model', reviewData.model || '', (v) => handleReviewSciSelect('model', v), reviewData, 'review')}
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formGroup}>
                    {renderSciDropdown('Trim', 'trim', reviewData.trim || '', (v) => handleReviewSciSelect('trim', v), reviewData, 'review')}
                  </View>
                  <View style={styles.formGroup}>
                    {renderSciDropdown('Carrosserie', 'body_style', reviewData.body_style || '', (v) => handleReviewSciSelect('body_style', v), reviewData, 'review')}
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Année</Text>
                    <TextInput
                      style={styles.formInput}
                      value={reviewData.year?.toString()}
                      onChangeText={(v) => updateReviewField('year', v)}
                      keyboardType="numeric"
                      placeholder="2025"
                      placeholderTextColor="#8a93a1"
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Type</Text>
                    <View style={styles.typeSelector}>
                      <TouchableOpacity
                        style={[styles.typeBtn, reviewData.type === 'neuf' && styles.typeBtnActive]}
                        onPress={() => updateReviewField('type', 'neuf')}
                      >
                        <Text style={[styles.typeBtnText, reviewData.type === 'neuf' && styles.typeBtnTextActive]}>Neuf</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.typeBtn, reviewData.type === 'occasion' && styles.typeBtnActive]}
                        onPress={() => updateReviewField('type', 'occasion')}
                      >
                        <Text style={[styles.typeBtnText, reviewData.type === 'occasion' && styles.typeBtnTextActive]}>Occasion</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>💰 Coûts (modifiables)</Text>

                <View style={styles.formRow}>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>E.P. (Coût réel) $</Text>
                    <TextInput
                      style={[styles.formInput, styles.costInput]}
                      value={reviewData.ep_cost?.toString()}
                      onChangeText={(v) => updateReviewField('ep_cost', v)}
                      keyboardType="numeric"
                      placeholder="86630"
                      placeholderTextColor="#8a93a1"
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>PDCO (Prix dealer) $</Text>
                    <TextInput
                      style={[styles.formInput, styles.costInput]}
                      value={reviewData.pdco?.toString()}
                      onChangeText={(v) => updateReviewField('pdco', v)}
                      keyboardType="numeric"
                      placeholder="94305"
                      placeholderTextColor="#8a93a1"
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Holdback $</Text>
                    <TextInput
                      style={[styles.formInput, styles.costInput]}
                      value={reviewData.holdback?.toString()}
                      onChangeText={(v) => updateReviewField('holdback', v)}
                      keyboardType="numeric"
                      placeholder="2829"
                      placeholderTextColor="#8a93a1"
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Coût Net $</Text>
                    <TextInput
                      style={[styles.formInput, styles.costInput]}
                      value={reviewData.net_cost?.toString() || String((parseFloat(reviewData.ep_cost) || 0) - (parseFloat(reviewData.holdback) || 0))}
                      onChangeText={(v) => updateReviewField('net_cost', v)}
                      keyboardType="numeric"
                      placeholder="51620"
                      placeholderTextColor="#8a93a1"
                    />
                    <Text style={styles.costHint}>Ajustez si augmentation non écrite</Text>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>🏷️ Prix de vente</Text>

                <View style={styles.formRow}>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>PDSF $</Text>
                    <TextInput
                      style={styles.formInput}
                      value={reviewData.msrp?.toString()}
                      onChangeText={(v) => updateReviewField('msrp', v)}
                      keyboardType="numeric"
                      placeholder="99500"
                      placeholderTextColor="#8a93a1"
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Prix affiché $</Text>
                    <TextInput
                      style={styles.formInput}
                      value={reviewData.asking_price?.toString()}
                      onChangeText={(v) => updateReviewField('asking_price', v)}
                      keyboardType="numeric"
                      placeholder="95995"
                      placeholderTextColor="#8a93a1"
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Couleur</Text>
                    <TextInput
                      style={styles.formInput}
                      value={reviewData.color}
                      onChangeText={(v) => updateReviewField('color', v)}
                      placeholder="Noir cristal"
                      placeholderTextColor="#8a93a1"
                    />
                  </View>
                </View>

                {reviewData.options && reviewData.options.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>📦 Options extraites ({reviewData.options.length})</Text>
                    <View style={[styles.optionsList, { maxHeight: 300 }]}>
                      <ScrollView nestedScrollEnabled={true}>
                        {reviewData.options.map((opt: any, idx: number) => (
                          <View key={idx} style={styles.optionItem}>
                            <Text style={styles.optionDesc} numberOfLines={2}>{opt.description}</Text>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  </>
                )}

                <View style={styles.reviewActions}>
                  <TouchableOpacity 
                    style={styles.exportExcelBtn}
                    onPress={handleExportExcel}
                  >
                    <Ionicons name="document-outline" size={18} color="#f4f1ea" />
                    <Text style={styles.exportExcelBtnText}>Excel</Text>
                  </TouchableOpacity>
                  {scanQueue.length > 0 ? (
                    <TouchableOpacity 
                      style={[styles.cancelBtn, { borderColor: '#FFB347' }]} 
                      onPress={skipReviewedVehicle}
                      data-testid="skip-vehicle-btn"
                    >
                      <Text style={[styles.cancelBtnText, { color: '#FFB347' }]}>Passer</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity 
                      style={styles.cancelBtn} 
                      onPress={() => { setShowReviewModal(false); setReviewData(null); }}
                    >
                      <Text style={styles.cancelBtnText}>Annuler</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity 
                    style={[styles.submitBtn, saving && styles.submitBtnDisabled]} 
                    onPress={saveReviewedVehicle}
                    disabled={saving}
                    data-testid="confirm-save-btn"
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#07090e" />
                    ) : (
                      <Text style={styles.submitBtnText}>
                        {scanQueue.length > 0 ? `Confirmer (${scanQueue.length} restants)` : 'Confirmer et ajouter'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* SCI Picker Modal */}
      <Modal visible={pickerConfig.visible} transparent animationType="slide">
        <View style={sciStyles.pickerOverlay}>
          <View style={sciStyles.pickerContainer}>
            <View style={sciStyles.pickerHeader}>
              <Text style={sciStyles.pickerTitle}>{pickerConfig.label}</Text>
              <TouchableOpacity onPress={() => setPickerConfig(p => ({ ...p, visible: false }))}>
                <Ionicons name="close" size={24} color="#f4f1ea" />
              </TouchableOpacity>
            </View>
            <ScrollView style={sciStyles.pickerScroll}>
              {pickerConfig.options.map((opt: string) => (
                <TouchableOpacity
                  key={opt}
                  style={sciStyles.pickerItem}
                  onPress={() => {
                    pickerConfig.onSelect(opt);
                    setPickerConfig(p => ({ ...p, visible: false }));
                  }}
                >
                  <Text style={sciStyles.pickerItemText}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07090e' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#303744' },
  headerButtons: { flexDirection: 'row', gap: 10 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#f4f1ea' },
  scanButton: { backgroundColor: '#FFB347', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  addButton: { backgroundColor: '#e6c65a', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#303744' },
  statCard: { alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: 'bold', color: '#f4f1ea' },
  statLabel: { fontSize: 11, color: '#9aa3b1', marginTop: 2 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: '#111722', borderRadius: 10, paddingHorizontal: 12 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 44, color: '#f4f1ea', fontSize: 15 },
  filterContainer: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 8, gap: 8 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#111722' },
  filterBtnActive: { backgroundColor: '#e6c65a' },
  filterText: { color: '#9aa3b1', fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: '#07090e' },
  listContent: { padding: 12, paddingBottom: 100 },
  vehicleCard: { backgroundColor: '#111722', borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  stockBadge: { backgroundColor: '#07090e', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  stockText: { color: '#e6c65a', fontWeight: 'bold', fontSize: 14 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { color: '#f4f1ea', fontWeight: 'bold', fontSize: 10 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeText: { color: '#f4f1ea', fontWeight: 'bold', fontSize: 10 },
  vehicleTitle: { fontSize: 18, fontWeight: 'bold', color: '#f4f1ea', marginBottom: 2 },
  vehicleTrim: { fontSize: 14, color: '#9aa3b1', marginBottom: 4 },
  vehicleVin: { fontSize: 12, color: '#e6c65a', marginBottom: 12, fontFamily: 'monospace' },
  priceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  priceItem: { flex: 1, minWidth: '45%', backgroundColor: '#07090e', padding: 10, borderRadius: 8 },
  priceLabel: { fontSize: 11, color: '#9aa3b1', marginBottom: 2 },
  priceValue: { fontSize: 15, fontWeight: 'bold', color: '#f4f1ea' },
  costValue: { color: '#FFB347' },
  profitValue: { color: '#e6c65a' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, borderTopWidth: 1, borderTopColor: '#303744', paddingTop: 12 },
  actionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#07090e', justifyContent: 'center', alignItems: 'center' },
  actionBtnActive: { borderWidth: 2, borderColor: '#e6c65a' },
  deleteBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,107,107,0.1)', justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#9aa3b1', marginTop: 12, fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#07090e', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#303744' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#f4f1ea' },
  formScroll: { padding: 16 },
  formRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  formGroup: { flex: 1 },
  formLabel: { fontSize: 12, color: '#9aa3b1', marginBottom: 4 },
  formInput: { backgroundColor: '#111722', borderRadius: 8, padding: 12, color: '#f4f1ea', fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#f4f1ea', marginTop: 8, marginBottom: 12 },
  typeSelector: { flexDirection: 'row', gap: 8 },
  typeBtn: { flex: 1, paddingVertical: 10, backgroundColor: '#111722', borderRadius: 8, alignItems: 'center' },
  typeBtnActive: { backgroundColor: '#e6c65a' },
  typeBtnText: { color: '#9aa3b1', fontWeight: '600' },
  typeBtnTextActive: { color: '#07090e' },
  submitBtn: { backgroundColor: '#e6c65a', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 16, marginBottom: 32 },
  submitBtnText: { color: '#07090e', fontSize: 16, fontWeight: 'bold' },
  // Scan modal styles
  scanModalContent: { backgroundColor: '#07090e', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', minHeight: 400 },
  scanningContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  scanningText: { color: '#f4f1ea', fontSize: 18, fontWeight: '600', marginTop: 20 },
  scanningSubtext: { color: '#9aa3b1', fontSize: 14, marginTop: 8 },
  scanOptionsContainer: { padding: 20 },
  scanInstructions: { color: '#9aa3b1', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  scanOptionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111722', borderRadius: 12, padding: 16, marginBottom: 12 },
  scanOptionIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(230, 198, 90, 0.1)', justifyContent: 'center', alignItems: 'center' },
  scanOptionText: { flex: 1, marginLeft: 16 },
  scanOptionTitle: { color: '#f4f1ea', fontSize: 16, fontWeight: '600' },
  scanOptionDesc: { color: '#9aa3b1', fontSize: 13, marginTop: 2 },
  scanTips: { marginTop: 20, padding: 16, backgroundColor: '#111722', borderRadius: 12 },
  scanTipsTitle: { color: '#FFB347', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  scanTip: { color: '#9aa3b1', fontSize: 13, marginBottom: 4 },
  scannedDataContainer: { padding: 20 },
  successBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(230, 198, 90, 0.1)', padding: 16, borderRadius: 12, marginBottom: 20 },
  successText: { color: '#e6c65a', fontSize: 15, fontWeight: '600', marginLeft: 10, flex: 1 },
  scannedVehicle: { backgroundColor: '#111722', borderRadius: 12, padding: 16 },
  scannedTitle: { color: '#f4f1ea', fontSize: 20, fontWeight: 'bold' },
  scannedTrim: { color: '#9aa3b1', fontSize: 15, marginTop: 4 },
  scannedStock: { color: '#e6c65a', fontSize: 14, fontWeight: '600', marginTop: 8 },
  scannedPrices: { flexDirection: 'row', marginTop: 16, gap: 10 },
  scannedPriceItem: { flex: 1, backgroundColor: '#07090e', padding: 12, borderRadius: 8, alignItems: 'center' },
  scannedPriceLabel: { color: '#9aa3b1', fontSize: 11, marginBottom: 4 },
  scannedPriceValue: { color: '#f4f1ea', fontSize: 16, fontWeight: 'bold' },
  optionsCount: { color: '#FFB347', fontSize: 13, marginTop: 12, textAlign: 'center' },
  scanAgainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, padding: 16, borderWidth: 1, borderColor: '#e6c65a', borderRadius: 10 },
  scanAgainText: { color: '#e6c65a', fontSize: 15, fontWeight: '600', marginLeft: 8 },
  // PDF option button styles
  pdfOptionBtn: { borderWidth: 1, borderColor: '#FF6B6B', borderStyle: 'dashed' },
  pdfIcon: { backgroundColor: 'rgba(255, 107, 107, 0.1)' },
  // Review modal styles
  reviewBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 179, 71, 0.1)', padding: 12, borderRadius: 10, marginBottom: 16 },
  reviewBannerText: { color: '#FFB347', fontSize: 13, marginLeft: 8, flex: 1 },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(255, 107, 107, 0.15)', padding: 12, borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: '#FF6B6B' },
  errorBannerTitle: { color: '#FF6B6B', fontSize: 13, fontWeight: 'bold', marginBottom: 4 },
  errorBannerItem: { color: '#FF9999', fontSize: 12, marginLeft: 4 },
  costInput: { borderWidth: 1, borderColor: '#e6c65a' },
  calculatedField: { backgroundColor: '#07090e', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#e6c65a' },
  calculatedValue: { color: '#e6c65a', fontSize: 16, fontWeight: 'bold' },
  optionsList: { backgroundColor: '#111722', borderRadius: 10, padding: 12 },
  optionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#303744' },
  optionCode: { color: '#e6c65a', fontSize: 12, fontWeight: 'bold', width: 70 },
  optionDesc: { color: '#f4f1ea', fontSize: 12, flex: 1, marginHorizontal: 8 },
  optionAmount: { color: '#FFB347', fontSize: 12, fontWeight: '600' },
  moreOptions: { color: '#9aa3b1', fontSize: 12, textAlign: 'center', marginTop: 8 },
  reviewActions: { flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 32 },
  exportExcelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#217346', padding: 16, borderRadius: 10, gap: 6, minWidth: 80 },
  exportExcelBtnText: { color: '#f4f1ea', fontSize: 14, fontWeight: '600' },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#8a93a1', alignItems: 'center' },
  cancelBtnText: { color: '#9aa3b1', fontSize: 16, fontWeight: '600' },
  submitBtnDisabled: { opacity: 0.6 },
  costHint: { fontSize: 10, color: '#FFB347', marginTop: 4, fontStyle: 'italic' },
});

const sciStyles = StyleSheet.create({
  dropdownButton: {
    backgroundColor: '#111722',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#303744',
  },
  dropdownDisabled: {
    opacity: 0.5,
  },
  dropdownButtonText: {
    color: '#f4f1ea',
    fontSize: 14,
    flex: 1,
  },
  dropdownPlaceholder: {
    color: '#8a93a1',
  },
  dropdownArrow: {
    color: '#e6c65a',
    fontSize: 10,
    marginLeft: 8,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#07090e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%' as any,
    paddingBottom: 30,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#303744',
  },
  pickerTitle: {
    color: '#f4f1ea',
    fontSize: 18,
    fontWeight: '600',
  },
  pickerScroll: {
    maxHeight: 400,
  },
  pickerItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#303744',
  },
  pickerItemText: {
    color: '#f4f1ea',
    fontSize: 16,
  },
});
