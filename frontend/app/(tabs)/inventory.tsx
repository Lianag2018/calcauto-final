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

const getApiUrl = (): string => {
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    return 'https://calcauto-final-backend.onrender.com';
  }
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }
  return 'http://localhost:8001';
};
const API_URL = getApiUrl();

interface InventoryVehicle {
  id: string;
  stock_no: string;
  vin: string;
  brand: string;
  model: string;
  trim: string;
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
  const { getToken } = useAuth();
  const [vehicles, setVehicles] = useState<InventoryVehicle[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedData, setScannedData] = useState<any>(null);
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

      if (!result.canceled && result.assets[0].base64) {
        await scanInvoice(result.assets[0].base64);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Platform.OS === 'web'
        ? alert('Erreur lors de la sélection de l\'image')
        : Alert.alert('Erreur', 'Erreur lors de la sélection de l\'image');
    }
  };

  const scanInvoice = async (base64Image: string) => {
    setScanning(true);
    setScannedData(null);
    
    try {
      const token = await getToken();
      const response = await axios.post(
        `${API_URL}/api/inventory/scan-and-save`,
        { image_base64: base64Image },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setScannedData(response.data);
        fetchData(); // Refresh inventory
        Platform.OS === 'web'
          ? alert(`${response.data.message}`)
          : Alert.alert('Succès', response.data.message);
      }
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Erreur lors du scan';
      console.error('Scan error:', error);
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Erreur', msg);
    } finally {
      setScanning(false);
    }
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
      case 'disponible': return '#4ECDC4';
      case 'réservé': return '#FFB347';
      case 'vendu': return '#FF6B6B';
      default: return '#888';
    }
  };

  const renderVehicleCard = ({ item }: { item: InventoryVehicle }) => (
    <View style={styles.vehicleCard}>
      <View style={styles.cardHeader}>
        <View style={styles.stockBadge}>
          <Text style={styles.stockText}>#{item.stock_no}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
        <View style={[styles.typeBadge, { backgroundColor: item.type === 'neuf' ? '#4ECDC4' : '#888' }]}>
          <Text style={styles.typeText}>{item.type.toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.vehicleTitle}>{item.year} {item.brand} {item.model}</Text>
      {item.trim && <Text style={styles.vehicleTrim}>{item.trim}</Text>}

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
          <Ionicons name="checkmark-circle" size={18} color={item.status === 'disponible' ? '#4ECDC4' : '#666'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, item.status === 'réservé' && styles.actionBtnActive]}
          onPress={() => handleStatusChange(item.stock_no, 'réservé')}
        >
          <Ionicons name="time" size={18} color={item.status === 'réservé' ? '#FFB347' : '#666'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, item.status === 'vendu' && styles.actionBtnActive]}
          onPress={() => handleStatusChange(item.stock_no, 'vendu')}
        >
          <Ionicons name="car" size={18} color={item.status === 'vendu' ? '#FF6B6B' : '#666'} />
        </TouchableOpacity>
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
          <ActivityIndicator size="large" color="#4ECDC4" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventaire</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.scanButton} onPress={() => setShowScanModal(true)}>
            <Ionicons name="camera" size={22} color="#1a1a2e" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
            <Ionicons name="add" size={24} color="#1a1a2e" />
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
            <Text style={[styles.statNumber, { color: '#4ECDC4' }]}>{stats.disponible}</Text>
            <Text style={styles.statLabel}>Dispo</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#FFB347' }]}>{stats.reserve}</Text>
            <Text style={styles.statLabel}>Réservé</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: '#4ECDC4' }]}>{formatPrice(stats.potential_profit)}</Text>
            <Text style={styles.statLabel}>Profit pot.</Text>
          </View>
        </View>
      )}

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher (stock, marque, modèle...)"
          placeholderTextColor="#666"
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ECDC4" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="car-outline" size={48} color="#888" />
            <Text style={styles.emptyText}>Aucun véhicule en inventaire</Text>
          </View>
        }
      />

      {/* Add Vehicle Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ajouter un véhicule</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
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
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>VIN</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.vin}
                    onChangeText={(v) => setFormData({ ...formData, vin: v })}
                    placeholder="3C6UR5CL..."
                    placeholderTextColor="#666"
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Marque *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.brand}
                    onChangeText={(v) => setFormData({ ...formData, brand: v })}
                    placeholder="Ram"
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Modèle *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.model}
                    onChangeText={(v) => setFormData({ ...formData, model: v })}
                    placeholder="2500 Express"
                    placeholderTextColor="#666"
                  />
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
                    placeholderTextColor="#666"
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
                    placeholderTextColor="#666"
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
                    placeholderTextColor="#666"
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
                    placeholderTextColor="#666"
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
                    placeholderTextColor="#666"
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
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Couleur</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.color}
                    onChangeText={(v) => setFormData({ ...formData, color: v })}
                    placeholder="Noir cristal"
                    placeholderTextColor="#666"
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

      {/* Scan Invoice Modal */}
      <Modal visible={showScanModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.scanModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📸 Scanner une facture</Text>
              <TouchableOpacity onPress={() => { setShowScanModal(false); setScannedData(null); }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {scanning ? (
              <View style={styles.scanningContainer}>
                <ActivityIndicator size="large" color="#4ECDC4" />
                <Text style={styles.scanningText}>Analyse de la facture en cours...</Text>
                <Text style={styles.scanningSubtext}>L'IA extrait les données du véhicule</Text>
              </View>
            ) : scannedData ? (
              <ScrollView style={styles.scannedDataContainer}>
                <View style={styles.successBanner}>
                  <Ionicons name="checkmark-circle" size={24} color="#4ECDC4" />
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
                      <Text style={[styles.scannedPriceValue, { color: '#4ECDC4' }]}>{formatPrice(scannedData.vehicle?.net_cost || 0)}</Text>
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
                  <Ionicons name="camera" size={20} color="#4ECDC4" />
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
                    <Ionicons name="camera" size={32} color="#4ECDC4" />
                  </View>
                  <View style={styles.scanOptionText}>
                    <Text style={styles.scanOptionTitle}>Prendre une photo</Text>
                    <Text style={styles.scanOptionDesc}>Utilisez l'appareil photo</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color="#666" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.scanOptionBtn} onPress={() => pickImage(false)}>
                  <View style={styles.scanOptionIcon}>
                    <Ionicons name="images" size={32} color="#4ECDC4" />
                  </View>
                  <View style={styles.scanOptionText}>
                    <Text style={styles.scanOptionTitle}>Importer une image</Text>
                    <Text style={styles.scanOptionDesc}>Depuis la galerie ou les fichiers</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color="#666" />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#2d2d44' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  addButton: { backgroundColor: '#4ECDC4', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2d2d44' },
  statCard: { alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', margin: 12, backgroundColor: '#2d2d44', borderRadius: 10, paddingHorizontal: 12 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 44, color: '#fff', fontSize: 15 },
  filterContainer: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 8, gap: 8 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#2d2d44' },
  filterBtnActive: { backgroundColor: '#4ECDC4' },
  filterText: { color: '#888', fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: '#1a1a2e' },
  listContent: { padding: 12, paddingBottom: 100 },
  vehicleCard: { backgroundColor: '#2d2d44', borderRadius: 12, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  stockBadge: { backgroundColor: '#1a1a2e', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  stockText: { color: '#4ECDC4', fontWeight: 'bold', fontSize: 14 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { color: '#fff', fontWeight: 'bold', fontSize: 10 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeText: { color: '#fff', fontWeight: 'bold', fontSize: 10 },
  vehicleTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 2 },
  vehicleTrim: { fontSize: 14, color: '#888', marginBottom: 12 },
  priceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  priceItem: { flex: 1, minWidth: '45%', backgroundColor: '#1a1a2e', padding: 10, borderRadius: 8 },
  priceLabel: { fontSize: 11, color: '#888', marginBottom: 2 },
  priceValue: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  costValue: { color: '#FFB347' },
  profitValue: { color: '#4ECDC4' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, borderTopWidth: 1, borderTopColor: '#3d3d54', paddingTop: 12 },
  actionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' },
  actionBtnActive: { borderWidth: 2, borderColor: '#4ECDC4' },
  deleteBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,107,107,0.1)', justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#888', marginTop: 12, fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#2d2d44' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  formScroll: { padding: 16 },
  formRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  formGroup: { flex: 1 },
  formLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  formInput: { backgroundColor: '#2d2d44', borderRadius: 8, padding: 12, color: '#fff', fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginTop: 8, marginBottom: 12 },
  typeSelector: { flexDirection: 'row', gap: 8 },
  typeBtn: { flex: 1, paddingVertical: 10, backgroundColor: '#2d2d44', borderRadius: 8, alignItems: 'center' },
  typeBtnActive: { backgroundColor: '#4ECDC4' },
  typeBtnText: { color: '#888', fontWeight: '600' },
  typeBtnTextActive: { color: '#1a1a2e' },
  submitBtn: { backgroundColor: '#4ECDC4', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 16, marginBottom: 32 },
  submitBtnText: { color: '#1a1a2e', fontSize: 16, fontWeight: 'bold' },
});
