import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TranslationKeys } from '../utils/i18n';

interface EmailModalProps {
  visible: boolean;
  onClose: () => void;
  t: TranslationKeys;
  vehicleSummary: string;
  priceSummary: string;
  paymentSummary: string;
  onSend: (email: string, name: string) => Promise<boolean>;
}

export const EmailModal: React.FC<EmailModalProps> = ({
  visible,
  onClose,
  t,
  vehicleSummary,
  priceSummary,
  paymentSummary,
  onSend,
}) => {
  const [clientEmail, setClientEmail] = useState('');
  const [clientName, setClientName] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!clientEmail || !clientEmail.includes('@')) {
      if (Platform.OS === 'web') {
        alert(t.email.invalidEmail);
      } else {
        Alert.alert('Erreur', t.email.invalidEmail);
      }
      return;
    }

    setSending(true);
    try {
      const success = await onSend(clientEmail, clientName);
      if (success) {
        setClientEmail('');
        setClientName('');
        onClose();
        if (Platform.OS === 'web') {
          alert('✅ ' + t.email.successMessage);
        } else {
          Alert.alert('Succès', t.email.successMessage);
        }
      }
    } catch (error) {
      if (Platform.OS === 'web') {
        alert(t.email.error);
      } else {
        Alert.alert('Erreur', t.email.error);
      }
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setClientEmail('');
    setClientName('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.iconContainer}>
              <Ionicons name="mail" size={32} color="#4ECDC4" />
            </View>
            <Text style={styles.modalTitle}>{t.email.sendByEmail}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={24} color="#888" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.label}>{t.email.clientName}</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Jean Dupont"
              placeholderTextColor="#666"
              value={clientName}
              onChangeText={setClientName}
            />

            <Text style={styles.label}>{t.email.clientEmail} *</Text>
            <TextInput
              style={styles.input}
              placeholder="client@email.com"
              placeholderTextColor="#666"
              value={clientEmail}
              onChangeText={setClientEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>{t.email.summaryToSend}</Text>
              <Text style={styles.previewText}>{vehicleSummary}</Text>
              <Text style={styles.previewText}>{priceSummary}</Text>
              <Text style={styles.previewPayment}>{paymentSummary}</Text>
            </View>
          </View>

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>{t.email.cancel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sendButton, sending && styles.sendButtonDisabled]}
              disabled={sending}
              onPress={handleSend}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#1a1a2e" />
              ) : (
                <>
                  <Ionicons name="send" size={18} color="#1a1a2e" />
                  <Text style={styles.sendButtonText}>{t.email.send}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 30,
  },
  modalHeader: {
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(78, 205, 196, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
  },
  previewBox: {
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  previewTitle: {
    fontSize: 12,
    color: '#4ECDC4',
    marginBottom: 8,
  },
  previewText: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 4,
  },
  previewPayment: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4ECDC4',
    marginTop: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  sendButton: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
});
