import { Stack } from 'expo-router';

import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { useAuth } from '@/lib/auth';
import { displayFont } from '@/lib/fonts';
import { useTheme } from '@/lib/theme';

export default function AppLayout() {
  const theme = useTheme();
  const { session } = useAuth();
  useRealtimeSync(session?.user.id);

  return (
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
  );
}
