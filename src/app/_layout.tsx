import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform, useColorScheme, View } from 'react-native';

import { RecipeekSplash } from '@/components/recipeek-splash';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useAppFonts } from '@/lib/fonts';
import { RecipeekPostHogProvider } from '@/lib/posthog';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 200, fade: true });

AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));

function RootNavigator() {
  const { session, loading } = useAuth();
  const fontsReady = useAppFonts();
  const userId = session?.user.id;
  const colorScheme = useColorScheme();
  const [splashVisible, setSplashVisible] = useState(true);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } }),
  );

  useEffect(() => {
    queryClient.clear();
  }, [userId, queryClient]);

  return (
    <View style={{ flex: 1 }}>
      {!loading ? (
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <StatusBar style={splashVisible ? 'light' : 'auto'} />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="auth/callback" />
              <Stack.Protected guard={!!session}>
                <Stack.Screen name="(app)" />
              </Stack.Protected>
              <Stack.Protected guard={!session}>
                <Stack.Screen name="(auth)" />
              </Stack.Protected>
            </Stack>
          </ThemeProvider>
        </QueryClientProvider>
      ) : null}
      {splashVisible ? (
        <RecipeekSplash
          ready={!loading && fontsReady}
          fontsReady={fontsReady}
          onFinished={() => setSplashVisible(false)}
        />
      ) : null}
    </View>
  );
}

const shareIntentDisabled =
  Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export default function RootLayout() {
  return (
    <ShareIntentProvider options={{ disabled: shareIntentDisabled, resetOnBackground: true }}>
      <AuthProvider>
        <RecipeekPostHogProvider>
          <RootNavigator />
        </RecipeekPostHogProvider>
      </AuthProvider>
    </ShareIntentProvider>
  );
}
