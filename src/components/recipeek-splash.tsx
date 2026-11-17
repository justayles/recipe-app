import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { displayFont } from '@/lib/fonts';

export const RECIPEEK_SPLASH = '#C45C26';
const CREAM = '#FFF6EC';

export function RecipeekSplash({
  ready,
  fontsReady,
  onFinished,
}: {
  ready: boolean;
  fontsReady: boolean;
  onFinished: () => void;
}) {
  const [mark] = useState(() => new Animated.Value(0));
  const [title] = useState(() => new Animated.Value(0));
  const [overlay] = useState(() => new Animated.Value(1));
  const [animDone, setAnimDone] = useState(false);
  const closing = useRef(false);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (!fontsReady) return;
    const ease = Easing.out(Easing.cubic);
    Animated.sequence([
      Animated.timing(mark, { toValue: 1, duration: 480, easing: ease, useNativeDriver: true }),
      Animated.timing(title, { toValue: 1, duration: 360, easing: ease, useNativeDriver: true }),
      Animated.delay(280),
    ]).start(() => setAnimDone(true));
  }, [fontsReady, mark, title]);

  useEffect(() => {
    if (!ready || !animDone || closing.current) return;
    closing.current = true;
    Animated.timing(overlay, {
      toValue: 0,
      duration: 280,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onFinishedRef.current();
    });
  }, [ready, animDone, overlay]);

  const fadeUp = (value: Animated.Value) => ({
    opacity: value,
    transform: [
      { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
      { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
    ],
  });

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={() => {
        SplashScreen.hideAsync();
      }}
      style={[styles.overlay, { opacity: overlay }]}>
      <Animated.View style={[styles.mark, fadeUp(mark)]}>
        <Ionicons name="restaurant" size={72} color={CREAM} />
      </Animated.View>
      <Animated.Text style={[styles.title, fadeUp(title)]}>Recipeek</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    backgroundColor: RECIPEEK_SPLASH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  title: {
    marginTop: 4,
    color: CREAM,
    fontSize: 42,
    fontFamily: displayFont.bold,
    letterSpacing: 0.4,
  },
});
