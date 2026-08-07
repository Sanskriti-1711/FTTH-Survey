import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { saveTokens } from '../lib/api/client';
import { getProject } from '../lib/api/projects';
import { useProjectStore } from '../lib/stores/project';
import { useSurveyFeaturesStore } from '../lib/stores/survey-features';
import { useAuthStore } from '../lib/stores/auth';

// ── Web Deep-Link Screen ─────────────────────────────────────────────────
// The platform opens the web build as:
//   http://localhost:8081/?token=<jwt>&project=<projectId>
// This screen (web only) saves the token, activates the project and routes
// straight to the Map tab so the engineer sees the same MapLibre views
// (🔵 HLD / 🟠 Survey / 🔀 Overlay) as on the mobile app.
//
// Native: never used — index.tsx only redirects here when the web URL
// carries the query params, so the APK flow is completely untouched.

export default function DeepLinkScreen() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (Platform.OS !== 'web' || typeof window === 'undefined') {
          router.replace('/(auth)/login');
          return;
        }
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const projectId = params.get('project');
        const featureId = params.get('feature');

        if (!token || !projectId) {
          router.replace('/(auth)/login');
          return;
        }

        // 1) Store the JWT so every apiFetch call is authenticated.
        //    Refresh is unknown here; the access token alone is enough to
        //    view the project (restoreSession tolerates a failed refresh).
        await saveTokens(token, '');

        // 2) Decode the JWT payload for the user id so the auth store is not
        //    left with a null user (Home/Profile render a safe fallback but
        //    prefer having the id for assignment lookups).
        let userId = '';
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          userId = String(payload.user_id || '');
        } catch {
          /* malformed token — user stays minimal */
        }
        useAuthStore.setState({
          user: {
            id: userId,
            email: '',
            full_name: 'Engineer',
            role: 'ENGINEER',
            created_by: null,
            created_at: '',
          },
        });

        // 3) Activate the project so the Map screen renders its layers.
        const project = await getProject(projectId);
        if (cancelled) return;
        useProjectStore.getState().setActiveProject(project);

        // 3b) Optional ?feature= focus: open the map in Overlay mode and
        //     highlight the single survey feature the planner clicked on.
        if (featureId) {
          useSurveyFeaturesStore.setState({ displayMode: 'overlay' });
          useSurveyFeaturesStore.getState().setFocusFeature(featureId);
        }

        // 4) Mark the auth session as restored so the Stack settles.
        useAuthStore.setState({ isRestoring: false });

        // 5) Strip the query params (keeps the JWT out of the URL bar) then
        //    go to the Map tab.
        window.history.replaceState({}, '', window.location.pathname);
        router.replace('/(tabs)/map');
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to open project';
        console.warn('[DeepLink] failed:', message);
        if (!cancelled) {
          setError(message);
          setTimeout(() => router.replace('/(auth)/login'), 2500);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0D5CFF" />
      <Text style={styles.title}>Fiber360</Text>
      <Text style={styles.subtitle}>
        {error ? `Could not open project — ${error}` : 'Opening project map…'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D5CFF',
  },
  title: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    color: '#E6EEFF',
  },
});
