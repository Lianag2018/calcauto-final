import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

// Force the production backend URL for Vercel deployments
const getApiUrl = (): string => {
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    return 'https://calcauto-final-backend.onrender.com';
  }
  if (process.env.EXPO_PUBLIC_BACKEND_URL) {
    return process.env.EXPO_PUBLIC_BACKEND_URL;
  }
  return 'http://localhost:8001';
};
const API_URL = getApiUrl();

interface AdminUser {
  id: string;
  name: string;
  email: string;
  created_at: string | null;
  last_login: string | null;
  is_blocked: boolean;
  is_admin: boolean;
  contacts_count: number;
  submissions_count: number;
}

interface AdminStats {
  total_users: number;
  active_users: number;
  blocked_users: number;
  total_contacts: number;
  total_submissions: number;
}

export default function AdminScreen() {
  const { user, getToken } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [usersRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/users`, { headers }),
        axios.get(`${API_URL}/api/admin/stats`, { headers }),
      ]);

      setUsers(usersRes.data);
      setStats(statsRes.data);
    } catch (error: any) {
      console.error('Error fetching admin data:', error);
      if (Platform.OS === 'web') {
        alert('Erreur lors du chargement des données admin');
      } else {
        Alert.alert('Erreur', 'Erreur lors du chargement des données admin');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleBlockUser = async (userId: string, userName: string) => {
    const confirmBlock = () => {
      return new Promise<boolean>((resolve) => {
        if (Platform.OS === 'web') {
          resolve(window.confirm(`Voulez-vous vraiment bloquer ${userName} ?`));
        } else {
          Alert.alert(
            'Confirmer',
            `Voulez-vous vraiment bloquer ${userName} ?`,
            [
              { text: 'Annuler', onPress: () => resolve(false), style: 'cancel' },
              { text: 'Bloquer', onPress: () => resolve(true), style: 'destructive' },
            ]
          );
        }
      });
    };

    const confirmed = await confirmBlock();
    if (!confirmed) return;

    setActionLoading(userId);
    try {
      const token = await getToken();
      await axios.put(
        `${API_URL}/api/admin/users/${userId}/block`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update local state
      setUsers(users.map(u => u.id === userId ? { ...u, is_blocked: true } : u));
      setStats(stats ? { ...stats, active_users: stats.active_users - 1, blocked_users: stats.blocked_users + 1 } : null);
      
      if (Platform.OS === 'web') {
        alert(`${userName} a été bloqué`);
      } else {
        Alert.alert('Succès', `${userName} a été bloqué`);
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erreur lors du blocage';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Erreur', message);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnblockUser = async (userId: string, userName: string) => {
    setActionLoading(userId);
    try {
      const token = await getToken();
      await axios.put(
        `${API_URL}/api/admin/users/${userId}/unblock`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update local state
      setUsers(users.map(u => u.id === userId ? { ...u, is_blocked: false } : u));
      setStats(stats ? { ...stats, active_users: stats.active_users + 1, blocked_users: stats.blocked_users - 1 } : null);
      
      if (Platform.OS === 'web') {
        alert(`${userName} a été débloqué`);
      } else {
        Alert.alert('Succès', `${userName} a été débloqué`);
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erreur lors du déblocage';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Erreur', message);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Jamais';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderUserCard = ({ item }: { item: AdminUser }) => {
    const isCurrentUser = item.id === user?.id;
    
    return (
      <View style={[styles.userCard, item.is_blocked && styles.userCardBlocked]}>
        <View style={styles.userHeader}>
          <View style={styles.userAvatar}>
            <Text style={styles.avatarText}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
            {item.is_admin && (
              <View style={styles.adminBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#FFD700" />
              </View>
            )}
          </View>
          <View style={styles.userInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{item.name}</Text>
              {item.is_blocked && (
                <View style={styles.blockedBadge}>
                  <Text style={styles.blockedText}>BLOQUÉ</Text>
                </View>
              )}
            </View>
            <Text style={styles.userEmail}>{item.email}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="people-outline" size={16} color="#4ECDC4" />
            <Text style={styles.statText}>{item.contacts_count} contacts</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="document-text-outline" size={16} color="#4ECDC4" />
            <Text style={styles.statText}>{item.submissions_count} soumissions</Text>
          </View>
        </View>

        <View style={styles.datesRow}>
          <Text style={styles.dateLabel}>Inscrit: {formatDate(item.created_at)}</Text>
          <Text style={styles.dateLabel}>Dernière connexion: {formatDate(item.last_login)}</Text>
        </View>

        {!item.is_admin && !isCurrentUser && (
          <View style={styles.actionsRow}>
            {actionLoading === item.id ? (
              <ActivityIndicator size="small" color="#4ECDC4" />
            ) : item.is_blocked ? (
              <TouchableOpacity
                style={styles.unblockButton}
                onPress={() => handleUnblockUser(item.id, item.name)}
              >
                <Ionicons name="checkmark-circle" size={18} color="#4ECDC4" />
                <Text style={styles.unblockButtonText}>Débloquer</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.blockButton}
                onPress={() => handleBlockUser(item.id, item.name)}
              >
                <Ionicons name="ban" size={18} color="#FF6B6B" />
                <Text style={styles.blockButtonText}>Bloquer</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ECDC4" />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Administration</Text>
        <View style={styles.adminBadgeHeader}>
          <Ionicons name="shield-checkmark" size={20} color="#FFD700" />
        </View>
      </View>

      {stats && (
        <View style={styles.statsContainer}>
          <View style={styles.statsCard}>
            <Text style={styles.statsNumber}>{stats.total_users}</Text>
            <Text style={styles.statsLabel}>Utilisateurs</Text>
          </View>
          <View style={styles.statsCard}>
            <Text style={[styles.statsNumber, { color: '#4ECDC4' }]}>{stats.active_users}</Text>
            <Text style={styles.statsLabel}>Actifs</Text>
          </View>
          <View style={styles.statsCard}>
            <Text style={[styles.statsNumber, { color: '#FF6B6B' }]}>{stats.blocked_users}</Text>
            <Text style={styles.statsLabel}>Bloqués</Text>
          </View>
          <View style={styles.statsCard}>
            <Text style={styles.statsNumber}>{stats.total_contacts}</Text>
            <Text style={styles.statsLabel}>Contacts</Text>
          </View>
        </View>
      )}

      <FlatList
        data={users}
        renderItem={renderUserCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4ECDC4"
            colors={['#4ECDC4']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color="#888" />
            <Text style={styles.emptyText}>Aucun utilisateur</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  adminBadgeHeader: {
    marginLeft: 10,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  statsCard: {
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  statsNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  statsLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  userCard: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  userCardBlocked: {
    borderWidth: 1,
    borderColor: '#FF6B6B',
    opacity: 0.8,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  adminBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 2,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  userEmail: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  blockedBadge: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  blockedText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 13,
    color: '#ccc',
  },
  datesRow: {
    marginBottom: 12,
  },
  dateLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#3d3d54',
    paddingTop: 12,
  },
  blockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  blockButtonText: {
    color: '#FF6B6B',
    fontWeight: '600',
  },
  unblockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4ECDC4',
  },
  unblockButtonText: {
    color: '#4ECDC4',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
  },
});
