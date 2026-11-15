import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import LoginScreen from './login';
import { GaugeMark } from '../components/GaugeMark';

function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useAuth();
  const [isClient, setIsClient] = useState(false);

  // Le serveur dort après une période sans visite : son réveil peut prendre
  // jusqu'à une minute. On l'explique au lieu de laisser une roue muette.
  const [slowStart, setSlowStart] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const timer = setTimeout(() => setSlowStart(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  // Wait for client-side hydration
  if (!isClient || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <GaugeMark size={180} motion="loop" />
        {slowStart && (
          <Text style={styles.loadingText}>
            Le serveur se réveille…{'\n'}Ça peut prendre jusqu'à une minute. Ne fermez pas la page.
          </Text>
        )}
      </View>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#07090e' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="import" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingText: {
    color: '#b9c0cc',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#07090e',
  },
});
