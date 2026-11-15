/**
 * ProgramSelector - Composant de sélection de programme de financement
 * 
 * Affiche:
 * - Liste filtrable des programmes
 * - Filtres année/marque
 * - Sélecteur de période
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface VehicleProgram {
  id: string;
  brand: string;
  model: string;
  trim: string | null;
  year: number;
  consumer_cash: number;
  bonus_cash: number;
}

interface Props {
  programs: VehicleProgram[];
  selectedProgram: VehicleProgram | null;
  onSelectProgram: (program: VehicleProgram) => void;
  onClearSelection: () => void;
  
  // Filters
  years: number[];
  brands: string[];
  selectedYear: number | null;
  selectedBrand: string | null;
  onYearChange: (year: number | null) => void;
  onBrandChange: (brand: string | null) => void;
  
  // Period selector
  currentPeriod: { month: number; year: number } | null;
  availablePeriods: { month: number; year: number; count: number }[];
  onPeriodChange: (month: number, year: number) => void;
  monthNames: string[];
  
  // Labels
  labels: {
    searchPlaceholder: string;
    allYears: string;
    allBrands: string;
    selectVehicle: string;
    consumerCash: string;
    bonusCash: string;
    clearSelection: string;
    programs: string;
  };
  
  formatCurrency: (value: number) => string;
}

export const ProgramSelector: React.FC<Props> = ({
  programs,
  selectedProgram,
  onSelectProgram,
  onClearSelection,
  years,
  brands,
  selectedYear,
  selectedBrand,
  onYearChange,
  onBrandChange,
  currentPeriod,
  availablePeriods,
  onPeriodChange,
  monthNames,
  labels,
  formatCurrency,
}) => {
  const [searchText, setSearchText] = useState('');
  const [showPeriodModal, setShowPeriodModal] = useState(false);

  // Filter programs by search text
  const filteredPrograms = programs.filter(p => {
    if (!searchText) return true;
    const search = searchText.toLowerCase();
    return (
      p.brand.toLowerCase().includes(search) ||
      p.model.toLowerCase().includes(search) ||
      (p.trim && p.trim.toLowerCase().includes(search))
    );
  });

  // Selected program card
  if (selectedProgram) {
    return (
      <View style={styles.selectedCard} data-testid="selected-program">
        <View style={styles.selectedHeader}>
          <View>
            <Text style={styles.selectedBrand}>{selectedProgram.brand}</Text>
            <Text style={styles.selectedModel}>
              {selectedProgram.year} {selectedProgram.model}
              {selectedProgram.trim && ` ${selectedProgram.trim}`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClearSelection}
            style={styles.clearButton}
            data-testid="clear-program-btn"
          >
            <Ionicons name="close-circle" size={24} color="#ff6b6b" />
          </TouchableOpacity>
        </View>

        <View style={styles.cashRow}>
          {selectedProgram.consumer_cash > 0 && (
            <View style={styles.cashBadge}>
              <Text style={styles.cashLabel}>{labels.consumerCash}</Text>
              <Text style={styles.cashValue}>
                {formatCurrency(selectedProgram.consumer_cash)}
              </Text>
            </View>
          )}
          {selectedProgram.bonus_cash > 0 && (
            <View style={[styles.cashBadge, styles.bonusBadge]}>
              <Text style={styles.cashLabel}>{labels.bonusCash}</Text>
              <Text style={styles.cashValue}>
                {formatCurrency(selectedProgram.bonus_cash)}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} data-testid="program-selector">
      {/* Period selector */}
      {currentPeriod && (
        <TouchableOpacity
          style={styles.periodButton}
          onPress={() => setShowPeriodModal(true)}
          data-testid="period-selector-btn"
        >
          <Ionicons name="calendar-outline" size={18} color="#e6c65a" />
          <Text style={styles.periodText}>
            {monthNames[currentPeriod.month - 1]} {currentPeriod.year}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#9aa3b1" />
        </TouchableOpacity>
      )}

      {/* Filters row */}
      <View style={styles.filtersRow}>
        {/* Year filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterChip, !selectedYear && styles.filterChipActive]}
            onPress={() => onYearChange(null)}
          >
            <Text style={[styles.filterChipText, !selectedYear && styles.filterChipTextActive]}>
              {labels.allYears}
            </Text>
          </TouchableOpacity>
          {years.map(year => (
            <TouchableOpacity
              key={year}
              style={[styles.filterChip, selectedYear === year && styles.filterChipActive]}
              onPress={() => onYearChange(year)}
            >
              <Text style={[styles.filterChipText, selectedYear === year && styles.filterChipTextActive]}>
                {year}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Brand filter */}
      <View style={styles.filtersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterChip, !selectedBrand && styles.filterChipActive]}
            onPress={() => onBrandChange(null)}
          >
            <Text style={[styles.filterChipText, !selectedBrand && styles.filterChipTextActive]}>
              {labels.allBrands}
            </Text>
          </TouchableOpacity>
          {brands.map(brand => (
            <TouchableOpacity
              key={brand}
              style={[styles.filterChip, selectedBrand === brand && styles.filterChipActive]}
              onPress={() => onBrandChange(brand)}
            >
              <Text style={[styles.filterChipText, selectedBrand === brand && styles.filterChipTextActive]}>
                {brand}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Search input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#9aa3b1" />
        <TextInput
          style={styles.searchInput}
          placeholder={labels.searchPlaceholder}
          placeholderTextColor="#8a93a1"
          value={searchText}
          onChangeText={setSearchText}
          data-testid="program-search-input"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')}>
            <Ionicons name="close-circle" size={18} color="#9aa3b1" />
          </TouchableOpacity>
        )}
      </View>

      {/* Programs count */}
      <Text style={styles.programsCount}>
        {filteredPrograms.length} {labels.programs}
      </Text>

      {/* Programs list */}
      <ScrollView style={styles.programsList} showsVerticalScrollIndicator={false}>
        {filteredPrograms.map(program => (
          <TouchableOpacity
            key={program.id}
            style={styles.programItem}
            onPress={() => onSelectProgram(program)}
            data-testid={`program-item-${program.id}`}
          >
            <View style={styles.programInfo}>
              <Text style={styles.programBrand}>{program.brand}</Text>
              <Text style={styles.programModel}>
                {program.year} {program.model}
                {program.trim && ` ${program.trim}`}
              </Text>
            </View>
            {program.consumer_cash > 0 && (
              <Text style={styles.programCash}>
                {formatCurrency(program.consumer_cash)}
              </Text>
            )}
            <Ionicons name="chevron-forward" size={18} color="#8a93a1" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Period Modal */}
      <Modal
        visible={showPeriodModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPeriodModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sélectionner une période</Text>
            <ScrollView style={styles.periodList}>
              {availablePeriods.map(period => (
                <TouchableOpacity
                  key={`${period.year}-${period.month}`}
                  style={[
                    styles.periodItem,
                    currentPeriod?.month === period.month &&
                    currentPeriod?.year === period.year &&
                    styles.periodItemActive
                  ]}
                  onPress={() => {
                    onPeriodChange(period.month, period.year);
                    setShowPeriodModal(false);
                  }}
                >
                  <Text style={styles.periodItemText}>
                    {monthNames[period.month - 1]} {period.year}
                  </Text>
                  <Text style={styles.periodItemCount}>
                    {period.count} programmes
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowPeriodModal(false)}
            >
              <Text style={styles.modalCloseBtnText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  periodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#07090e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
    gap: 8,
  },
  periodText: {
    color: '#f4f1ea',
    fontSize: 14,
    fontWeight: '600',
  },
  filtersRow: {
    marginBottom: 8,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#07090e',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#e6c65a',
  },
  filterChipText: {
    color: '#9aa3b1',
    fontSize: 13,
  },
  filterChipTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#07090e',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#f4f1ea',
    fontSize: 14,
  },
  programsCount: {
    color: '#8a93a1',
    fontSize: 12,
    marginBottom: 8,
  },
  programsList: {
    maxHeight: 300,
  },
  programItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#07090e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  programInfo: {
    flex: 1,
  },
  programBrand: {
    color: '#e6c65a',
    fontSize: 12,
    fontWeight: '600',
  },
  programModel: {
    color: '#f4f1ea',
    fontSize: 14,
  },
  programCash: {
    color: '#e6c65a',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  // Selected card
  selectedCard: {
    backgroundColor: '#07090e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e6c65a',
  },
  selectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  selectedBrand: {
    color: '#e6c65a',
    fontSize: 12,
    fontWeight: '600',
  },
  selectedModel: {
    color: '#f4f1ea',
    fontSize: 18,
    fontWeight: '600',
  },
  clearButton: {
    padding: 4,
  },
  cashRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cashBadge: {
    backgroundColor: 'rgba(230, 198, 90, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  bonusBadge: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
  },
  cashLabel: {
    color: '#9aa3b1',
    fontSize: 10,
  },
  cashValue: {
    color: '#e6c65a',
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#07090e',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxHeight: '80%',
  },
  modalTitle: {
    color: '#f4f1ea',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  periodList: {
    maxHeight: 300,
  },
  periodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#111722',
  },
  periodItemActive: {
    backgroundColor: 'rgba(230, 198, 90, 0.2)',
    borderWidth: 1,
    borderColor: '#e6c65a',
  },
  periodItemText: {
    color: '#f4f1ea',
    fontSize: 15,
  },
  periodItemCount: {
    color: '#9aa3b1',
    fontSize: 13,
  },
  modalCloseBtn: {
    backgroundColor: '#e6c65a',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 16,
  },
  modalCloseBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default ProgramSelector;
