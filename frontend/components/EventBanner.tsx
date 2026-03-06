import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ProgramMeta {
  event_names: string[];
  program_period: string;
  program_month: string;
  loyalty_rate: number;
  no_payments_days: number;
  featured_rate: number | null;
  featured_term: number | null;
  key_message: string;
  brands?: string[];
}

interface EventBannerProps {
  meta: ProgramMeta;
  lang: 'fr' | 'en';
  loyaltyChecked: boolean;
  onToggleLoyalty: () => void;
  deferredChecked: boolean;
  onToggleDeferred: () => void;
  selectedTerm: number;
}

const brandColors: Record<string, { bg: string; text: string; accent: string }> = {
  Ram:      { bg: '#1a1a1a', text: '#C0C0C0', accent: '#8B0000' },
  Jeep:     { bg: '#2B4A1E', text: '#C8D9A0', accent: '#4A7A3E' },
  Dodge:    { bg: '#2A0A12', text: '#FF4D6D', accent: '#BA0C2F' },
  Chrysler: { bg: '#0C1A2E', text: '#7EB3E0', accent: '#1565C0' },
  Fiat:     { bg: '#2A1010', text: '#E8A0A0', accent: '#8B0000' },
};

function BrandBadge({ brand }: { brand: string }) {
  const colors = brandColors[brand] || { bg: '#2d2d44', text: '#fff', accent: '#666' };
  return (
    <View style={[bs.badge, { backgroundColor: colors.bg, borderColor: colors.accent }]} data-testid={`brand-badge-${brand.toLowerCase()}`}>
      <View style={[bs.dot, { backgroundColor: colors.accent }]} />
      <Text style={[bs.badgeText, { color: colors.text }]}>{brand}</Text>
    </View>
  );
}

export function EventBanner({ meta, lang, loyaltyChecked, onToggleLoyalty, deferredChecked, onToggleDeferred, selectedTerm }: EventBannerProps) {
  const eventName = meta.event_names?.[0] || '';
  if (!eventName) return null;

  const hasLoyalty = meta.loyalty_rate > 0;
  const hasNoPayments = meta.no_payments_days > 0;
  const hasFeaturedRate = meta.featured_rate !== null && meta.featured_rate !== undefined;
  const brands = meta.brands || [];
  const termEligible = selectedTerm <= 84;

  return (
    <View style={s.container} data-testid="event-banner">
      {/* Event Name */}
      <View style={s.titleRow}>
        <Ionicons name="megaphone" size={18} color="#FFD700" />
        <Text style={s.eventName} data-testid="event-banner-name">{eventName}</Text>
      </View>

      {/* Period */}
      <Text style={s.period}>{meta.program_period}</Text>

      {/* Brand Logos Row */}
      {brands.length > 0 && (
        <View style={s.brandsRow} data-testid="brand-logos-row">
          {brands.map(brand => (
            <BrandBadge key={brand} brand={brand} />
          ))}
        </View>
      )}

      {/* Highlights row */}
      <View style={s.highlightsRow}>
        {hasFeaturedRate && meta.featured_term && (
          <View style={s.chip}>
            <Ionicons name="trending-down" size={14} color="#4ECDC4" />
            <Text style={s.chipText}>
              {meta.featured_rate}% / {meta.featured_term} {lang === 'fr' ? 'mois' : 'mo'}
            </Text>
          </View>
        )}
        {hasNoPayments && (
          <View style={s.chip}>
            <Ionicons name="calendar" size={14} color="#FFD700" />
            <Text style={s.chipText}>
              {lang === 'fr'
                ? `${meta.no_payments_days}j sans paiement`
                : `${meta.no_payments_days}d no payments`}
            </Text>
          </View>
        )}
      </View>

      {/* Toggles row */}
      <View style={s.togglesSection}>
        {/* 90 days deferred payment toggle */}
        {hasNoPayments && (
          <TouchableOpacity
            style={[s.toggleRow, deferredChecked && termEligible && s.toggleRowActiveDeferred]}
            onPress={onToggleDeferred}
            activeOpacity={0.7}
            data-testid="deferred-toggle"
          >
            <View style={[s.checkbox, deferredChecked && termEligible ? s.checkboxActiveDeferred : null]}>
              {deferredChecked && termEligible && <Ionicons name="checkmark" size={14} color="#1a1a2e" />}
            </View>
            <View style={s.toggleTextWrap}>
              <Text style={[s.toggleLabel, { color: '#FFD700' }]}>
                {meta.no_payments_days}j {lang === 'fr' ? 'sans versement' : 'no payment'}
              </Text>
              <Text style={s.toggleDesc}>
                {!termEligible
                  ? (lang === 'fr' ? 'Non disponible pour 96 mois (max 84)' : 'Not available for 96mo (max 84)')
                  : (lang === 'fr'
                    ? '1er versement au 90e jour, interets capitalises'
                    : '1st payment on day 90, interest capitalized')}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Loyalty rate toggle */}
        {hasLoyalty && (
          <TouchableOpacity
            style={[s.toggleRow, loyaltyChecked && s.toggleRowActiveLoyalty]}
            onPress={onToggleLoyalty}
            activeOpacity={0.7}
            data-testid="loyalty-toggle"
          >
            <View style={[s.checkbox, loyaltyChecked && s.checkboxActiveLoyalty]}>
              {loyaltyChecked && <Ionicons name="checkmark" size={14} color="#1a1a2e" />}
            </View>
            <View style={s.toggleTextWrap}>
              <Text style={[s.toggleLabel, { color: '#4ECDC4' }]}>
                {lang === 'fr' ? 'Fidelite' : 'Loyalty'} -{meta.loyalty_rate}%
              </Text>
              <Text style={s.toggleDesc}>
                {lang === 'fr'
                  ? 'Reduction de taux appliquee aux calculs'
                  : 'Rate reduction applied to calculations'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const bs = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

const s = StyleSheet.create({
  container: {
    marginBottom: 12,
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFD700',
    flexShrink: 1,
  },
  period: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 10,
    marginLeft: 26,
  },
  brandsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  highlightsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  togglesSection: {
    gap: 8,
    marginTop: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1a1a2e',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  toggleRowActiveDeferred: {
    borderColor: '#FFD700',
    backgroundColor: 'rgba(255,215,0,0.08)',
  },
  toggleRowActiveLoyalty: {
    borderColor: '#4ECDC4',
    backgroundColor: 'rgba(78,205,196,0.08)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4ECDC4',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  checkboxActiveDeferred: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  checkboxActiveLoyalty: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
  },
  toggleTextWrap: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  toggleDesc: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },
});
