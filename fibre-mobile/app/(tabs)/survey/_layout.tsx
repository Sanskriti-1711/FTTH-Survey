import React from 'react';
import { Stack } from 'expo-router';

// ── Survey Stack Layout ───────────────────────────────────────────────────

export default function SurveyStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
