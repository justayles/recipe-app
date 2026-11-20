import { Stack, router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect } from 'react';

import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { useAuth } from '@/lib/auth';
import { displayFont } from '@/lib/fonts';
import { extractUrlFromShareText } from '@/lib/import-recipe';
import { useTheme } from '@/lib/theme';

function ShareIntentHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent) return;
    const raw = shareIntent.webUrl ?? shareIntent.text ?? '';
    const url = extractUrlFromShareText(raw) ?? raw.trim();
    resetShareIntent();
    if (!url) return;
    router.push({ pathname: '/import', params: { url, auto: '1' } });
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  return null;
}

export default function AppLayout() {
  const theme = useTheme();
  const { session } = useAuth();
  useRealtimeSync(session?.user.id);

  return (
    <>
      <ShareIntentHandler />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.text,
          headerTitleStyle: { fontFamily: displayFont.semibold, fontSize: 20 },
          contentStyle: { backgroundColor: theme.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="recipe/[id]" options={{ title: 'Recipe' }} />
        <Stack.Screen name="recipe/new" options={{ title: 'New recipe' }} />
        <Stack.Screen name="recipe/edit/[id]" options={{ title: 'Edit recipe' }} />
      </Stack>
    </>
  );
}
