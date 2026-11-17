import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LabelChips } from '@/components/label-chips';
import { PromptModal } from '@/components/prompt-modal';
import { Button, ErrorText, errorMessage } from '@/components/ui';
import { useCreateLabel, useLabels } from '@/hooks/use-labels';
import type { RecipeInput } from '@/hooks/use-recipes';
import { LABEL_COLORS, RECIPE_CATEGORIES } from '@/lib/categories';
import { displayFont, uiFont } from '@/lib/fonts';
import { recipeImageUrl } from '@/lib/images';
import { useTheme } from '@/lib/theme';

export type RecipeFormValue = RecipeInput & {
  existingImagePath?: string | null;
};

export function RecipeForm({
  initial,
  busy,
  submitLabel,
  onSubmit,
}: {
  initial: RecipeFormValue;
  busy: boolean;
  submitLabel: string;
  onSubmit: (value: RecipeInput) => Promise<void>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const labels = useLabels();
  const createLabel = useCreateLabel();

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? '');
  const [sourceUrl, setSourceUrl] = useState(initial.source_url ?? '');
  const [sourceName, setSourceName] = useState(initial.source_name ?? '');
  const [servings, setServings] = useState(initial.servings ? String(initial.servings) : '');
  const [prep, setPrep] = useState(initial.prep_minutes ? String(initial.prep_minutes) : '');
  const [cook, setCook] = useState(initial.cook_minutes ? String(initial.cook_minutes) : '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [category, setCategory] = useState(initial.category);
  const [cuisine, setCuisine] = useState(initial.cuisine ?? '');
  const [ingredients, setIngredients] = useState(initial.ingredients.length ? initial.ingredients : ['']);
  const [steps, setSteps] = useState(initial.steps.length ? initial.steps : ['']);
  const [labelIds, setLabelIds] = useState(initial.labelIds);
  const [imageUri, setImageUri] = useState(initial.imageUri ?? null);
  const [imageBase64] = useState(initial.imageBase64 ?? null);
  const [imageContentType] = useState(initial.imageContentType ?? null);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview =
    imageUri ??
    (imageBase64 ? `data:${imageContentType || 'image/jpeg'};base64,${imageBase64}` : null) ??
    recipeImageUrl(initial.existingImagePath);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  function updateList(list: string[], index: number, value: string, setter: (next: string[]) => void) {
    const next = [...list];
    next[index] = value;
    setter(next);
  }

  async function submit() {
    if (!title.trim()) {
      setError('Give the recipe a title');
      return;
    }
    setError(null);
    try {
      await onSubmit({
        title,
        description: description || null,
        source_url: sourceUrl || null,
        source_name: sourceName || null,
        servings: servings ? Number(servings) : null,
        prep_minutes: prep ? Number(prep) : null,
        cook_minutes: cook ? Number(cook) : null,
        notes: notes || null,
        category,
        cuisine: cuisine || null,
        ingredients,
        steps,
        labelIds,
        imageUri,
        imageBase64,
        imageContentType,
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const inputStyle = [styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom, gap: 12 }}
        keyboardShouldPersistTaps="handled">
        <Pressable onPress={pickImage} style={[styles.imageWrap, { backgroundColor: theme.badge }]}>
          {preview ? (
            <Image source={{ uri: preview }} style={styles.image} contentFit="cover" />
          ) : (
            <Text style={[styles.imageHint, { color: theme.badgeText }]}>Tap to add a photo</Text>
          )}
        </Pressable>

        <TextInput style={inputStyle} placeholder="Title" placeholderTextColor={theme.textMuted} value={title} onChangeText={setTitle} />
        <TextInput
          style={[inputStyle, styles.multiline]}
          placeholder="Short description"
          placeholderTextColor={theme.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={[styles.section, { color: theme.text }]}>Classify</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {RECIPE_CATEGORIES.map((item) => {
            const selected = category === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setCategory(selected ? null : item.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.primary : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}>
                <Text style={{ color: selected ? theme.primaryText : theme.text, fontFamily: uiFont.semibold }}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <TextInput
          style={inputStyle}
          placeholder="Cuisine (optional)"
          placeholderTextColor={theme.textMuted}
          value={cuisine}
          onChangeText={setCuisine}
        />

        <LabelChips
          labels={labels.data ?? []}
          selectedIds={labelIds}
          onToggle={(id) =>
            setLabelIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
          }
          onCreate={() => setCreatingLabel(true)}
        />

        <View style={styles.row}>
          <TextInput
            style={[inputStyle, styles.flex]}
            placeholder="Servings"
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            value={servings}
            onChangeText={setServings}
          />
          <TextInput
            style={[inputStyle, styles.flex]}
            placeholder="Prep min"
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            value={prep}
            onChangeText={setPrep}
          />
          <TextInput
            style={[inputStyle, styles.flex]}
            placeholder="Cook min"
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            value={cook}
            onChangeText={setCook}
          />
        </View>

        <Text style={[styles.section, { color: theme.text }]}>Ingredients</Text>
        {ingredients.map((item, index) => (
          <View key={`ing-${index}`} style={styles.listRow}>
            <TextInput
              style={[inputStyle, styles.flex]}
              placeholder={`Ingredient ${index + 1}`}
              placeholderTextColor={theme.textMuted}
              value={item}
              onChangeText={(value) => updateList(ingredients, index, value, setIngredients)}
            />
            <Pressable onPress={() => setIngredients(ingredients.filter((_, i) => i !== index))} hitSlop={8}>
              <Text style={{ color: theme.danger, fontFamily: uiFont.semibold }}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <Button title="Add ingredient" variant="secondary" onPress={() => setIngredients([...ingredients, ''])} />

        <Text style={[styles.section, { color: theme.text }]}>Steps</Text>
        {steps.map((item, index) => (
          <View key={`step-${index}`} style={styles.listRow}>
            <TextInput
              style={[inputStyle, styles.flex, styles.multiline]}
              placeholder={`Step ${index + 1}`}
              placeholderTextColor={theme.textMuted}
              value={item}
              onChangeText={(value) => updateList(steps, index, value, setSteps)}
              multiline
            />
            <Pressable onPress={() => setSteps(steps.filter((_, i) => i !== index))} hitSlop={8}>
              <Text style={{ color: theme.danger, fontFamily: uiFont.semibold }}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <Button title="Add step" variant="secondary" onPress={() => setSteps([...steps, ''])} />

        <TextInput
          style={inputStyle}
          placeholder="Source URL"
          placeholderTextColor={theme.textMuted}
          value={sourceUrl}
          onChangeText={setSourceUrl}
          autoCapitalize="none"
        />
        <TextInput
          style={inputStyle}
          placeholder="Source name"
          placeholderTextColor={theme.textMuted}
          value={sourceName}
          onChangeText={setSourceName}
        />
        <TextInput
          style={[inputStyle, styles.multiline]}
          placeholder="Notes for next time"
          placeholderTextColor={theme.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <ErrorText message={error} />
        <Button title={submitLabel} onPress={submit} loading={busy} disabled={!title.trim()} />
      </ScrollView>

      <PromptModal
        visible={creatingLabel}
        title="New label"
        placeholder="e.g. vegetarian"
        submitLabel="Add"
        autoCapitalize="none"
        busy={createLabel.isPending}
        onCancel={() => setCreatingLabel(false)}
        onSubmit={async (name) => {
          const color = LABEL_COLORS[(labels.data?.length ?? 0) % LABEL_COLORS.length];
          const created = await createLabel.mutateAsync({ name, color });
          setLabelIds((current) => [...current, created.id]);
          setCreatingLabel(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  imageWrap: { height: 180, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  imageHint: { fontFamily: uiFont.semibold, fontSize: 15 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: uiFont.regular,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  section: { fontSize: 18, fontFamily: displayFont.semibold, marginTop: 8 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  listRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
