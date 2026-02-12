import AsyncStorage from '@react-native-async-storage/async-storage';
import fr from '../locales/fr.json';
import en from '../locales/en.json';

export type Language = 'fr' | 'en';

export const translations = {
  fr,
  en,
};

export type TranslationKeys = typeof fr;

const LANGUAGE_KEY = 'app_language';

export const saveLanguage = async (lang: Language): Promise<void> => {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  } catch (error) {
    console.error('Error saving language:', error);
  }
};

export const loadLanguage = async (): Promise<Language> => {
  try {
    const lang = await AsyncStorage.getItem(LANGUAGE_KEY);
    return (lang as Language) || 'fr';
  } catch (error) {
    console.error('Error loading language:', error);
    return 'fr';
  }
};

export const getTranslation = (lang: Language): TranslationKeys => {
  return translations[lang];
};
