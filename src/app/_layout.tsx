import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, useColorScheme, View } from 'react-native';

import { RecipeekSplash } from '@/components/recipeek-splash';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useAppFonts } from '@/lib/fonts';

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

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
