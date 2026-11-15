import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Language } from '../utils/i18n';

interface LanguageSelectorProps {
  currentLanguage: Language;
  onLanguageChange: (lang: Language) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  currentLanguage,
  onLanguageChange,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.langButton,
          currentLanguage === 'fr' && styles.langButtonActive,
        ]}
        onPress={() => onLanguageChange('fr')}
      >
        <Text
          style={[
            styles.langButtonText,
            currentLanguage === 'fr' && styles.langButtonTextActive,
          ]}
        >
          FR
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.langButton,
          currentLanguage === 'en' && styles.langButtonActive,
        ]}
        onPress={() => onLanguageChange('en')}
      >
        <Text
          style={[
            styles.langButtonText,
            currentLanguage === 'en' && styles.langButtonTextActive,
          ]}
        >
          EN
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#111722',
    borderRadius: 8,
    padding: 2,
  },
  langButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  langButtonActive: {
    backgroundColor: '#e6c65a',
  },
  langButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9aa3b1',
  },
  langButtonTextActive: {
    color: '#07090e',
  },
});
