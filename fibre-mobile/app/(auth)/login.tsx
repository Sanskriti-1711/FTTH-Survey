import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useThemeStore } from '../../lib/stores/theme';
import { useAuthStore } from '../../lib/stores/auth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Toast } from '../../components/ui/Toast';
import { Spacing, Radius } from '../../lib/theme/colors';
import {
  getApiBaseUrl,
  loadServerUrl,
  saveServerUrl,
  clearServerUrl,
} from '../../lib/utils/constants';
import Cable from 'lucide-react-native/icons/cable';
import Mail from 'lucide-react-native/icons/mail';
import Lock from 'lucide-react-native/icons/lock';
import Server from 'lucide-react-native/icons/server';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import CheckCircle2 from 'lucide-react-native/icons/circle-check';

// ── Login Screen ──────────────────────────────────────────────────────────

export default function LoginScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { login, register, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('error');
  // ── Server settings state ───────────────────────────────────────────────
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [serverUrl, setServerUrl] = useState(getApiBaseUrl());
  const [serverStatus, setServerStatus] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');
  const [serverStatusMsg, setServerStatusMsg] = useState('');

  // Load any persisted runtime override when the screen mounts
  useEffect(() => {
    loadServerUrl().then((stored) => {
      if (stored) setServerUrl(stored);
    });
  }, []);

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

  // ── Server settings handlers ────────────────────────────────────────────
  const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '');

  const handleCheckServer = async () => {
    const base = normalizeUrl(serverUrl);
    if (!base) return;
    setServerStatus('checking');
    setServerStatusMsg('');
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 8000);
    try {
      // Probe the login endpoint — a 4xx/5xx means the server is alive and reachable.
      const res = await fetch(`${base}/api/users/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ping@probe.invalid', password: 'x' }),
        signal: controller.signal,
      });
      clearTimeout(abortTimer);
      if (res.status >= 400) {
        setServerStatus('ok');
        setServerStatusMsg('Server reachable ✓');
      } else {
        setServerStatus('ok');
        setServerStatusMsg('Server responded ✓');
      }
    } catch (err: unknown) {
      clearTimeout(abortTimer);
      setServerStatus('fail');
      // Hermes on Android may throw a plain Error on abort (name not always
      // 'AbortError'), so match on name OR the message to be robust.
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || /abort/i.test(err.message ?? ''));
      const msg = isAbort
        ? 'Timed out — check the IP / network'
        : 'Not reachable — check the IP / Wi-Fi';
      setServerStatusMsg(msg);
    }
  };

  const handleSaveServer = async () => {
    const base = normalizeUrl(serverUrl);
    if (!base) return;
    try {
      await saveServerUrl(base);
      setShowServerSettings(false);
      showToast('Server URL saved', 'success');
    } catch {
      showToast('Could not save server URL');
    }
  };

  const handleResetServer = async () => {
    await clearServerUrl();
    setServerUrl(getApiBaseUrl());
    setServerStatus('idle');
    setServerStatusMsg('');
    showToast('Reset to default server', 'success');
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

            {/* Server settings toggle */}
            <TouchableOpacity
              onPress={() => setShowServerSettings((v) => !v)}
              style={styles.serverToggle}
              activeOpacity={0.6}
            >
              <View style={styles.serverToggleLeft}>
                <Server size={15} stroke={colors.textTertiary} />
                <Text style={[styles.serverToggleText, { color: colors.textTertiary }]}>
                  Server: {getApiBaseUrl()}
                </Text>
              </View>
              {showServerSettings ? (
                <ChevronUp size={16} stroke={colors.textTertiary} />
              ) : (
                <ChevronDown size={16} stroke={colors.textTertiary} />
              )}
            </TouchableOpacity>

            {showServerSettings && (
              <View style={[styles.serverPanel, { backgroundColor: colors.surface, borderColor: colors.outlineLight }]}>
                <Text style={[styles.serverPanelTitle, { color: colors.textPrimary }]}>
                  API Server URL
                </Text>
                <Text style={[styles.serverPanelHint, { color: colors.textSecondary }]}>
                  If login fails with a network error, your backend IP may have changed. Update it here — no rebuild needed.
                </Text>

                <Input
                  label="Server address"
                  placeholder="http://192.168.1.100:8000"
                  value={serverUrl}
                  onChangeText={(t) => {
                    setServerUrl(t);
                    setServerStatus('idle');
                    setServerStatusMsg('');
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  nativeID="server-url"
                  name="serverUrl"
                  icon={<Server size={18} stroke={colors.textSecondary} />}
                />

                {serverStatus !== 'idle' && (
                  <View style={styles.serverStatusRow}>
                    {serverStatus === 'checking' ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : serverStatus === 'ok' ? (
                      <CheckCircle2 size={16} stroke={colors.success} />
                    ) : (
                      <Text style={[styles.serverStatusIcon, { color: colors.error }]}>✕</Text>
                    )}
                    <Text
                      style={[
                        styles.serverStatusText,
                        { color: serverStatus === 'ok' ? colors.success : serverStatus === 'fail' ? colors.error : colors.textSecondary },
                      ]}
                    >
                      {serverStatus === 'checking' ? 'Checking...' : serverStatusMsg}
                    </Text>
                  </View>
                )}

                <View style={styles.serverActions}>
                  <Button
                    title="Test Connection"
                    variant="secondary"
                    size="sm"
                    onPress={handleCheckServer}
                    loading={serverStatus === 'checking'}
                    style={styles.serverActionBtn}
                  />
                  <Button
                    title="Save"
                    variant="primary"
                    size="sm"
                    onPress={handleSaveServer}
                    style={styles.serverActionBtn}
                  />
                  <TouchableOpacity onPress={handleResetServer} style={styles.serverReset} activeOpacity={0.6}>
                    <Text style={[styles.serverResetText, { color: colors.error }]}>Reset</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
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
  serverToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  serverToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  serverToggleText: {
    fontSize: 12,
    flexShrink: 1,
  },
  serverPanel: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  serverPanelTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  serverPanelHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: Spacing.md,
  },
  serverStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  serverStatusIcon: {
    fontSize: 15,
  },
  serverStatusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  serverActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  serverActionBtn: {
    flex: 1,
  },
  serverReset: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  serverResetText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
