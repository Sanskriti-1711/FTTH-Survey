import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore } from '../../lib/stores/theme';
import { useAuthStore } from '../../lib/stores/auth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Toast } from '../../components/ui/Toast';
import { Spacing, Radius } from '../../lib/theme/colors';
import { Cable, Mail, Lock } from 'lucide-react-native';

// ── Login Screen ──────────────────────────────────────────────────────────

export default function LoginScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { login, register, isLoading, error, clearError, setDemoMode } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('error');

  const validateEmail = (e: string) => /\S+@\S+\.\S+/.test(e);

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  };

  const handleSubmit = async () => {
    if (!email.trim()) return showToast('Please enter your email');
    if (!validateEmail(email)) return showToast('Please enter a valid email');
    if (!password.trim()) return showToast('Please enter your password');
    if (isRegistering && !fullName.trim()) return showToast('Please enter your full name');

    try {
      if (isRegistering) {
        await register(email, password, fullName);
        showToast('Account created successfully!', 'success');
      } else {
        await login(email, password);
        showToast('Welcome back!', 'success');
      }
      router.replace('/(tabs)/home');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      showToast(msg);
    }
  };

  const handleDemoMode = () => {
    setDemoMode(true);
    router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
              <Cable size={36} stroke={colors.onPrimary} />
            </View>
            <Text style={[styles.appName, { color: colors.textPrimary }]}>Fiber360</Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>
              FTTH Field Survey Platform
            </Text>
          </View>

          {/* Form */}
          {/* DOM warnings are suppressed at the HTML level (see patch-html.mjs) */}
          <View style={styles.form}>
            <Text style={[styles.formTitle, { color: colors.textPrimary }]}>
              {isRegistering ? 'Create Account' : 'Sign In'}
            </Text>

            <Input
              label="Email"
              placeholder="engineer@fibre360.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              nativeID="login-email"
              name="email"
              icon={<Mail size={18} stroke={colors.textSecondary} />}
            />

            {isRegistering && (
              <Input
                label="Full Name"
                placeholder="John Doe"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                nativeID="login-name"
                name="fullName"
              />
            )}

            <Input
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              isPassword
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
              nativeID="login-password"
              name="password"
              icon={<Lock size={18} stroke={colors.textSecondary} />}
            />

            <Button
              title={isRegistering ? 'Create Account' : 'Sign In'}
              onPress={handleSubmit}
              loading={isLoading}
              size="lg"
              style={styles.submitBtn}
            />

            {/* Switch auth mode */}
            <TouchableOpacity
              onPress={() => {
                setIsRegistering(!isRegistering);
                clearError();
              }}
              style={styles.switchBtn}
            >
              <Text style={[styles.switchText, { color: colors.primary }]}>
                {isRegistering
                  ? 'Already have an account? Sign In'
                  : "Don't have an account? Create one"}
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: colors.outline }]} />
              <Text style={[styles.dividerText, { color: colors.textTertiary }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.outline }]} />
            </View>

            {/* Demo mode */}
            <Button
              title="Continue in Demo Mode"
              variant="secondary"
              onPress={handleDemoMode}
              size="md"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onDismiss={() => setToastVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: '#0D5CFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 14,
    marginTop: Spacing.xs,
  },
  form: {
    width: '100%',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: Spacing.xl,
  },
  submitBtn: {
    marginTop: Spacing.sm,
  },
  switchBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  switchText: {
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: Spacing.lg,
    fontSize: 13,
  },
});
