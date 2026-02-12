import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { TranslationKeys } from '../utils/i18n';

interface FilterBarProps {
  t: TranslationKeys;
  years: number[];
  brands: string[];
  selectedYear: number | null;
  selectedBrand: string | null;
  onYearChange: (year: number | null) => void;
  onBrandChange: (brand: string | null) => void;
}

const FilterButton = ({
  active,
  onPress,
  label,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
}) => (
  <TouchableOpacity
    style={[styles.filterChip, active && styles.filterChipActive]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

export const FilterBar: React.FC<FilterBarProps> = ({
  t,
  years,
  brands,
  selectedYear,
  selectedBrand,
  onYearChange,
  onBrandChange,
}) => {
  return (
    <View>
      {/* Year Filter */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>{t.filters.year}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <View style={styles.filterRow}>
            <FilterButton
              active={selectedYear === null}
              onPress={() => onYearChange(null)}
              label={t.filters.all}
            />
            {years.map((year) => (
              <FilterButton
                key={year}
                active={selectedYear === year}
                onPress={() => onYearChange(year)}
                label={String(year)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Brand Filter */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>{t.filters.brand}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <View style={styles.filterRow}>
            <FilterButton
              active={selectedBrand === null}
              onPress={() => onBrandChange(null)}
              label={t.filters.all}
            />
            {brands.map((brand) => (
              <FilterButton
                key={brand}
                active={selectedBrand === brand}
                onPress={() => onBrandChange(brand)}
                label={brand}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
    marginLeft: 4,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
  },
  filterChip: {
    backgroundColor: '#2d2d44',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterChipActive: {
    backgroundColor: '#4ECDC4',
  },
  filterChipText: {
    fontSize: 12,
    color: '#aaa',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#1a1a2e',
  },
});
