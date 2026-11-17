import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ReadOnlyLabels } from '@/components/label-chips';
import type { RecipeSummary } from '@/hooks/use-recipes';
import { categoryLabel } from '@/lib/categories';
import { displayFont, uiFont } from '@/lib/fonts';
import { recipeImageUrl } from '@/lib/images';
import { useTheme } from '@/lib/theme';

export function RecipeCard({ recipe, onPress }: { recipe: RecipeSummary; onPress: () => void }) {
  const theme = useTheme();
  const image = recipeImageUrl(recipe.image_path);
  const meta = [categoryLabel(recipe.category), recipe.cuisine].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recipe.title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      {image ? (
        <Image source={{ uri: image }} style={styles.image} contentFit="cover" />
      ) : (
        <View style={[styles.image, styles.placeholder, { backgroundColor: theme.badge }]}>
          <Text style={[styles.placeholderText, { color: theme.badgeText }]}>
            {recipe.title.slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {recipe.title}
        </Text>
        {meta ? (
          <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <ReadOnlyLabels labels={recipe.labels} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 108,
  },
  image: { width: 108, height: 108 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 32, fontFamily: displayFont.bold },
  body: { flex: 1, padding: 12, gap: 6, justifyContent: 'center' },
  title: { fontSize: 17, fontFamily: displayFont.semibold },
  meta: { fontSize: 13, fontFamily: uiFont.regular },
});
