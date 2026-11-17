import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorText, errorMessage } from '@/components/ui';
import { importedToDraft, importRecipeFromUrl, type ImportResult } from '@/lib/import-recipe';
import { displayFont, uiFont } from '@/lib/fonts';
import { setRecipeDraft } from '@/lib/recipe-draft';
import { scanRecipeFromImage } from '@/lib/scan-recipe';
import { useTheme } from '@/lib/theme';

export default function ImportScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string }>();
  const [url, setUrl] = useState(typeof params.url === 'string' ? params.url : '');
  const [busy, setBusy] = useState<'import' | 'scan' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url: incoming }) => {
      const parsed = Linking.parse(incoming);
      const shared = (parsed.queryParams?.url as string | undefined) ?? incoming;
      if (shared) setUrl(shared);
    });
    Linking.getInitialURL().then((incoming) => {
      if (!incoming) return;
      const parsed = Linking.parse(incoming);
      const shared = parsed.queryParams?.url as string | undefined;
      if (shared) setUrl(shared);
    });
    return () => sub.remove();
  }, []);

  async function paste() {
    const text = await Clipboard.getStringAsync();
    if (text) setUrl(text.trim());
  }

  function openDraft(result: ImportResult) {
    setRecipeDraft(importedToDraft(result));
    router.push('/recipe/new');
  }

  async function importNow() {
    setBusy('import');
    setError(null);
    try {
      openDraft(await importRecipeFromUrl(url));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function chooseScanSource(): Promise<'camera' | 'library' | null> {
    if (Platform.OS === 'web') return Promise.resolve('library');
    return new Promise((resolve) => {
      Alert.alert(
        'Scan a recipe',
        'Photograph a magazine or cookbook page. The photo is kept as the recipe image.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          { text: 'Photo library', onPress: () => resolve('library') },
          { text: 'Camera', onPress: () => resolve('camera') },
        ],
      );
    });
  }

  async function scanNow() {
    const source = await chooseScanSource();
    if (!source) return;
    setBusy('scan');
    setError(null);
    try {
      const result = await scanRecipeFromImage(source);
      if (!result) return;
      openDraft(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: 32 + insets.bottom }]}
        keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: theme.text }]}>Bring a recipe in</Text>
        <Text style={[styles.copy, { color: theme.textMuted }]}>
          Paste a recipe page URL from BBC Food, BBC Good Food, or most sites that publish a Recipe
          schema. On a phone you can also copy the link from the browser and paste it here.
        </Text>
        <Text style={[styles.copy, { color: theme.textMuted }]}>
          Bookmarklet for later: recipeek://import?url= then the page address.
        </Text>

        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="https://www.bbc.co.uk/food/recipes/..."
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        />
        <View style={styles.row}>
          <Button title="Paste" variant="secondary" onPress={paste} disabled={busy != null} style={styles.flex} />
          <Button
            title="Import"
            onPress={importNow}
            loading={busy === 'import'}
            disabled={!url.trim() || busy != null}
            style={styles.flex}
          />
          <Button
            title="Scan"
            variant="secondary"
            onPress={scanNow}
            loading={busy === 'scan'}
            disabled={busy != null}
            style={styles.flex}
          />
        </View>
        <Text style={[styles.copy, { color: theme.textMuted }]}>
          Scan photographs a magazine or cookbook page, reads the ingredients and method, and keeps
          the photo as the recipe image.
        </Text>
        <ErrorText message={error} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontFamily: displayFont.semibold },
  copy: { fontSize: 15, lineHeight: 22, fontFamily: uiFont.regular },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: uiFont.regular,
  },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
