/**
 * usePrograms - Hook pour la gestion des programmes de financement
 * 
 * Gère:
 * - Chargement des programmes depuis l'API
 * - Filtrage par année/marque
 * - Périodes disponibles
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

// Types
export interface FinancingRates {
  rate_36: number;
  rate_48: number;
  rate_60: number;
  rate_72: number;
  rate_84: number;
  rate_96: number;
}

export interface VehicleProgram {
  id: string;
  brand: string;
  model: string;
  trim: string | null;
  year: number;
  consumer_cash: number;
  option1_rates: FinancingRates;
  option2_rates: FinancingRates | null;
  bonus_cash: number;
  program_month: number;
  program_year: number;
}

export interface ProgramPeriod {
  month: number;
  year: number;
  count: number;
}

interface UseProgramsReturn {
  programs: VehicleProgram[];
  filteredPrograms: VehicleProgram[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  
  // Filters
  selectedYear: number | null;
  selectedBrand: string | null;
  availableYears: number[];
  availableBrands: string[];
  setSelectedYear: (year: number | null) => void;
  setSelectedBrand: (brand: string | null) => void;
  
  // Periods
  currentPeriod: { month: number; year: number } | null;
  availablePeriods: ProgramPeriod[];
  setCurrentPeriod: (period: { month: number; year: number }) => void;
  
  // Actions
  loadPrograms: (month?: number, year?: number) => Promise<void>;
  refresh: () => Promise<void>;
}

// Get API URL based on environment
const getApiUrl = (): string => {
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }
  return 'http://localhost:8001';
};

const API_URL = getApiUrl();

export function usePrograms(): UseProgramsReturn {
  const { getToken } = useAuth();
  
  // State
  const [programs, setPrograms] = useState<VehicleProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  
  // Periods
  const [currentPeriod, setCurrentPeriod] = useState<{ month: number; year: number } | null>(null);
  const [availablePeriods, setAvailablePeriods] = useState<ProgramPeriod[]>([]);
  
  // Load programs from API
  const loadPrograms = useCallback(async (month?: number, year?: number) => {
    try {
      setError(null);
      
      // Load available periods
      try {
        const periodsRes = await axios.get(`${API_URL}/api/periods`);
        setAvailablePeriods(periodsRes.data);
      } catch (e) {
        console.log('Could not load periods');
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
      
      // Set current period from first program
      if (response.data.length > 0) {
        setCurrentPeriod({
          month: month || response.data[0].program_month,
          year: year || response.data[0].program_year
        });
      }
    } catch (err) {
      console.error('Error loading programs:', err);
      setError('Erreur lors du chargement des programmes');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Initial load
  useEffect(() => {
    loadPrograms();
  }, [loadPrograms]);
  
  // Filter programs
  const filteredPrograms = useMemo(() => {
    let filtered = [...programs];
    
    if (selectedYear) {
      filtered = filtered.filter(p => p.year === selectedYear);
    }
    
    if (selectedBrand) {
      filtered = filtered.filter(p => p.brand === selectedBrand);
    }
    
    return filtered;
  }, [programs, selectedYear, selectedBrand]);
  
  // Available years and brands for filters
  const availableYears = useMemo(() => {
    return [...new Set(programs.map(p => p.year))].sort((a, b) => b - a);
  }, [programs]);
  
  const availableBrands = useMemo(() => {
    return [...new Set(programs.map(p => p.brand))].sort();
  }, [programs]);
  
  // Refresh
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadPrograms(currentPeriod?.month, currentPeriod?.year);
    setRefreshing(false);
  }, [loadPrograms, currentPeriod]);
  
  return {
    programs,
    filteredPrograms,
    loading,
    refreshing,
    error,
    selectedYear,
    selectedBrand,
    availableYears,
    availableBrands,
    setSelectedYear,
    setSelectedBrand,
    currentPeriod,
    availablePeriods,
    setCurrentPeriod,
    loadPrograms,
    refresh,
  };
}

export default usePrograms;
