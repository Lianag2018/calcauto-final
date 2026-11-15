import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { GaugeMark } from '../components/GaugeMark';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    
    if (!email.trim() || !password.trim()) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    if (!isLogin) {
      if (!name.trim()) {
        setError('Veuillez entrer votre nom');
        return;
      }
      if (password !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas');
        return;
      }
      if (password.length < 6) {
        setError('Le mot de passe doit contenir au moins 6 caractères');
        return;
      }
    }

    setLoading(true);

    try {
      let result;
      if (isLogin) {
        result = await login(email, password);
      } else {
        result = await register(name, email, password);
      }

      if (!result.success) {
        setError(result.error || 'Une erreur est survenue');
      }
    } catch (err) {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <GaugeMark size={104} motion="once" />
            </View>
            <Text style={styles.logoText}>
              Calc<Text style={styles.logoTextGold}>Auto</Text>
            </Text>
            <Text style={styles.logoSubText}>par eTradeValue</Text>
            <Text style={styles.subtitle}>
              {isLogin ? 'Connexion' : 'Créer un compte'}
            </Text>
            <Text style={styles.description}>
              {isLogin ? 'Connectez-vous pour accéder à vos données' : 'Créez votre compte pour commencer'}
            </Text>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#FF6B6B" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color="#9aa3b1" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Nom complet"
                  placeholderTextColor="#8a93a1"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color="#9aa3b1" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#8a93a1"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#9aa3b1" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Mot de passe"
                placeholderTextColor="#8a93a1"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#9aa3b1" />
              </TouchableOpacity>
            </View>

            {!isLogin && (
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color="#9aa3b1" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirmer le mot de passe"
                  placeholderTextColor="#8a93a1"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                />
              </View>
            )}

            <TouchableOpacity 
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#07090e" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isLogin ? 'Se connecter' : "S'inscrire"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.switchContainer}>
            <Text style={styles.switchText}>
              {isLogin ? "Pas encore de compte ?" : "Déjà un compte ?"}
            </Text>
            <TouchableOpacity onPress={switchMode}>
              <Text style={styles.switchLink}>
                {isLogin ? "S'inscrire" : "Se connecter"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 27,
    backgroundColor: '#0d1118',
    borderWidth: 1,
    borderColor: '#303744',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: '#f4f1ea',
  },
  logoTextGold: {
    color: '#e6c65a',
  },
  logoSubText: {
    fontSize: 13,
    color: '#b9c0cc',
    marginTop: 2,
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f4f1ea',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#9aa3b1',
    textAlign: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    gap: 8,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    flex: 1,
  },
  form: {
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111722',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#f4f1ea',
    fontSize: 16,
    paddingVertical: 16,
  },
  eyeIcon: {
    padding: 8,
  },
  submitButton: {
    backgroundColor: '#e6c65a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#07090e',
    fontSize: 18,
    fontWeight: '600',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  switchText: {
    color: '#9aa3b1',
    fontSize: 14,
  },
  switchLink: {
    color: '#e6c65a',
    fontSize: 14,
    fontWeight: '600',
  },
});
