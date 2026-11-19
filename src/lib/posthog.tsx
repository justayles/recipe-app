import AsyncStorage from '@react-native-async-storage/async-storage';
import { PostHogProvider, useFeatureFlag, usePostHog } from 'posthog-react-native';
import { useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/lib/auth';
import { RECIPE_SCAN_FLAG } from '@/lib/feature-flags';

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

function PostHogIdentity() {
  const posthog = usePostHog();
  const { session, loading } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!posthog || loading) return;
    if (userId) {
      posthog.identify(userId);
      return;
    }
    posthog.reset();
  }, [posthog, loading, userId]);

  return null;
}

export function RecipeekPostHogProvider({ children }: { children: ReactNode }) {
  return (
    <PostHogProvider
      apiKey={apiKey || 'phc_disabled'}
      autocapture={{
        captureScreens: false,
        captureTouches: false,
      }}
      options={{
        host,
        disabled: !apiKey,
        captureAppLifecycleEvents: false,
        customStorage: Platform.OS === 'web' ? AsyncStorage : undefined,
      }}>
      <PostHogIdentity />
      {children}
    </PostHogProvider>
  );
}

/** True only after flags have loaded and `recipe-scan` is on. Hidden while loading. */
export function useRecipeScanEnabled(): boolean {
  return useFeatureFlag(RECIPE_SCAN_FLAG) === true;
}
