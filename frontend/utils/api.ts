import { Platform } from 'react-native';

export const getApiUrl = (): string => {
  // On web, use the current origin (works with Vercel rewrites and any deployment)
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }
  return 'http://localhost:8001';
};

export const API_URL = getApiUrl();
