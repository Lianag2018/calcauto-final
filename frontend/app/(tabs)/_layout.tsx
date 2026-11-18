import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';

export default function TabsLayout() {
  const { isAdmin } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#07090e',
          borderTopColor: '#303744',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : Platform.OS === 'web' ? 70 : 65,
          paddingBottom: Platform.OS === 'ios' ? 28 : Platform.OS === 'web' ? 10 : 10,
          // Sur le web la barre est plus basse : avec 10 de marge en haut, les noms des onglets
          // étaient écrasés à 3 px de haut (seul « Admin », rendu comme un lien, restait lisible).
          paddingTop: Platform.OS === 'web' ? 4 : 10,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
        },
        tabBarActiveTintColor: '#e6c65a',
        tabBarInactiveTintColor: '#9aa3b1',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: Platform.OS === 'web' ? 2 : 4,
        },
        tabBarIconStyle: {
          marginTop: Platform.OS === 'web' ? 0 : 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Calcul',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calculator" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventaire',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="car-sport" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'CRM',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark" size={22} color={color} />
          ),
          href: isAdmin ? '/admin' : null,
        }}
      />
      {/* Fichiers du dossier qui ne sont pas des écrans : pas d'onglet */}
      <Tabs.Screen name="index_legacy" options={{ href: null }} />
      <Tabs.Screen name="styles/homeStyles" options={{ href: null }} />
    </Tabs>
  );
}
