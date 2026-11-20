import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorText, errorMessage } from '@/components/ui';
import { canRetryUrlImport, importedToDraft, importRecipeFromUrl } from '@/lib/import-recipe';
import { displayFont, uiFont } from '@/lib/fonts';
import { isInstagramUrl } from '@/lib/instagram';
import { choosePhotoSource } from '@/lib/pick-photo';
import { useInstagramImportEnabled, useRecipeScanEnabled } from '@/lib/posthog';
import { setRecipeDraft } from '@/lib/recipe-draft';
import { scanRecipeFromImage } from '@/lib/scan-recipe';
import { useTheme } from '@/lib/theme';

export default function ImportScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scanEnabled = useRecipeScanEnabled();
  const instagramEnabled = useInstagramImportEnabled();
  const params = useLocalSearchParams<{ url?: string; auto?: string }>();
  const paramUrl = typeof params.url === 'string' ? params.url : '';
  const [url, setUrl] = useState(paramUrl);
  const [seenParamUrl, setSeenParamUrl] = useState(paramUrl);
  const [busy, setBusy] = useState<'import' | 'scan' | 'ai' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoStartedFor = useRef<string | null>(null);

  if (paramUrl && paramUrl !== seenParamUrl) {
    setSeenParamUrl(paramUrl);
    setUrl(paramUrl);
  }

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

  async function importFrom(raw: string) {
    setBusy('import');
    setError(null);
    try {
      if (isInstagramUrl(raw) && !instagramEnabled) {
        throw new Error('Instagram import is not enabled for this account.');
      }
      setRecipeDraft(importedToDraft(await importRecipeFromUrl(raw)));
      router.push('/recipe/new');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function importNow() {
    await importFrom(url);
  }

  useEffect(() => {
    if (params.auto !== '1' || !instagramEnabled) return;
    const target = (typeof params.url === 'string' ? params.url : url).trim();
    if (!isInstagramUrl(target)) return;
    if (autoStartedFor.current === target) return;
    autoStartedFor.current = target;
    void importFrom(target);
    // importFrom reads the latest flag/url; run once per shared Instagram link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.auto, params.url, url, instagramEnabled]);

  async function importWithAi() {
    setBusy('ai');
    setError(null);
    try {
      setRecipeDraft(importedToDraft(await importRecipeFromUrl(url, { useAi: true })));
      router.push('/recipe/new');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function scanNow() {
    if (!scanEnabled) return;
    const source = await choosePhotoSource({
      title: 'Scan a recipe',
      message:
        'Photograph a magazine or cookbook page, or pick an existing photo from your gallery.',
    });
    if (!source) return;
    setBusy('scan');
    setError(null);
    try {
      const result = await scanRecipeFromImage(source);
      if (!result) return;
      setRecipeDraft(importedToDraft(result));
      router.push('/recipe/new');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const instagramLink = isInstagramUrl(url);

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
        {instagramEnabled ? (
          <Text style={[styles.copy, { color: theme.textMuted }]}>
            Instagram reels and posts work too: share the link to Recipeek, or paste it here. The
            recipe is read from the caption, and the cover photo is used if Instagram shares one.
          </Text>
        ) : null}
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
          {scanEnabled ? (
            <Button
              title="Scan"
              variant="secondary"
              onPress={scanNow}
              loading={busy === 'scan'}
              disabled={busy != null}
              style={styles.flex}
            />
          ) : null}
        </View>
        {busy === 'import' && instagramLink ? (
          <Text style={[styles.copy, { color: theme.textMuted }]}>Reading the post...</Text>
        ) : null}
        {scanEnabled ? (
          <Text style={[styles.copy, { color: theme.textMuted }]}>
            Scan photographs a magazine or cookbook page and reads the ingredients and method. If the
            page has a photo of the dish, that is used; otherwise Recipeek generates one.
          </Text>
        ) : null}
        <ErrorText message={error} />
        {error && canRetryUrlImport(url) ? (
          <>
            <Button
              title="Try with AI"
              variant="secondary"
              onPress={importWithAi}
              loading={busy === 'ai'}
              disabled={busy != null}
            />
            <Text style={[styles.copy, { color: theme.textMuted }]}>
              The scraper could not read that page. AI rereads the HTML and uses your OpenAI quota.
            </Text>
          </>
        ) : null}
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
