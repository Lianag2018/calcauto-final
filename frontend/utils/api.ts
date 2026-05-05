import { Platform } from 'react-native';

// 2026-05-05 : bypass Vercel rewrites — pointe DIRECTEMENT sur le backend
// Render officiel `calcauto-aipro` (workspace Daniel). Cela évite les
// désynchronisations entre plusieurs déploiements Vercel (calcauto-final
// vs calcauto-pro) qui peuvent pointer vers des backends différents ou
// suspendus.
//
// Peut toujours être override via `EXPO_PUBLIC_BACKEND_URL` (preview/dev).
const PRODUCTION_BACKEND = 'https://calcauto-aipro-xck3.onrender.com';

export const getApiUrl = (): string => {
  // Override explicite via env var (utile en dev local ou preview)
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    // En dev local (localhost), on utilise le backend localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8001';
    }
    // En production (Vercel ou autre), on tape directement le backend Render
    return PRODUCTION_BACKEND;
  }
  // Mobile / natif
  return PRODUCTION_BACKEND;
};

export const API_URL = getApiUrl();
