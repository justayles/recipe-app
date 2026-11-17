import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GiftModal } from '@/components/gift-modal';
import { ReadOnlyLabels } from '@/components/label-chips';
import { Centered, EmptyState, ErrorState, errorMessage } from '@/components/ui';
import { useFriendships } from '@/hooks/use-friends';
import { useDeleteRecipe, useRecipe } from '@/hooks/use-recipes';
import { useAuth } from '@/lib/auth';
import { categoryLabel } from '@/lib/categories';
import { displayFont, uiFont } from '@/lib/fonts';
import { recipeImageUrl } from '@/lib/images';
import { useTheme } from '@/lib/theme';

export default function RecipeDetail() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const recipe = useRecipe(id ?? '');
  const friends = useFriendships();
  const remove = useDeleteRecipe();
  const [gifting, setGifting] = useState(false);

  const data = recipe.data;
  const isOwner = data?.owner_id === userId;
  const image = recipeImageUrl(data?.image_path);
  const times = [
    data?.prep_minutes != null ? `${data.prep_minutes} min prep` : null,
    data?.cook_minutes != null ? `${data.cook_minutes} min cook` : null,
    data?.servings != null ? `${data.servings} servings` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  function confirmDelete() {
    if (!data) return;
    Alert.alert(`Delete “${data.title}”?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(data.id, {
            onSuccess: () => router.back(),
            onError: (e) => Alert.alert('Could not delete', errorMessage(e)),
          }),
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen
        options={{
          title: data?.title ?? 'Recipe',
          headerRight: () =>
            data && isOwner ? (
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setGifting(true)}
                  hitSlop={10}
                  accessibilityLabel="Gift recipe">
                  <Ionicons name="gift-outline" size={22} color={theme.text} />
                </Pressable>
                <Pressable
                  onPress={() => router.push(`/recipe/edit/${data.id}`)}
                  hitSlop={10}
                  accessibilityLabel="Edit recipe">
                  <Ionicons name="create-outline" size={22} color={theme.text} />
                </Pressable>
                <Pressable onPress={confirmDelete} hitSlop={10} accessibilityLabel="Delete recipe">
                  <Ionicons name="trash-outline" size={22} color={theme.danger} />
                </Pressable>
              </View>
            ) : null,
        }}
      />

      {recipe.isPending ? (
        <Centered>
          <ActivityIndicator size="large" color={theme.primary} />
        </Centered>
      ) : recipe.isError ? (
        <ErrorState message={errorMessage(recipe.error)} onRetry={() => recipe.refetch()} />
      ) : !data ? (
        <EmptyState title="Recipe not found" />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}>
          {image ? <Image source={{ uri: image }} style={styles.hero} contentFit="cover" /> : null}
          <View style={styles.body}>
            <Text style={[styles.title, { color: theme.text }]}>{data.title}</Text>
            {times ? <Text style={[styles.meta, { color: theme.textMuted }]}>{times}</Text> : null}
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {[categoryLabel(data.category), data.cuisine].filter(Boolean).join(' · ')}
            </Text>
            <ReadOnlyLabels labels={data.labels} />
            {data.gifter ? (
              <Text style={[styles.gifted, { color: theme.accent }]}>
                Gifted by {data.gifter.display_name || data.gifter.email}
              </Text>
            ) : null}
            {data.description ? <Text style={[styles.copy, { color: theme.text }]}>{data.description}</Text> : null}

            <Text style={[styles.section, { color: theme.text }]}>Ingredients</Text>
            {data.ingredients.map((item) => (
              <Text key={item.id} style={[styles.item, { color: theme.text }]}>
                • {item.item}
              </Text>
            ))}

            <Text style={[styles.section, { color: theme.text }]}>Method</Text>
            {data.steps.map((step, index) => (
              <Text key={step.id} style={[styles.item, { color: theme.text }]}>
                {index + 1}. {step.body}
              </Text>
            ))}

            {data.notes ? (
              <>
                <Text style={[styles.section, { color: theme.text }]}>Notes</Text>
                <Text style={[styles.copy, { color: theme.text }]}>{data.notes}</Text>
              </>
            ) : null}

            {data.source_url ? (
              <Pressable onPress={() => Linking.openURL(data.source_url!)}>
                <Text style={[styles.link, { color: theme.primary }]}>
                  Source{data.source_name ? `: ${data.source_name}` : ''}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      )}

      {data && userId ? (
        <GiftModal
          visible={gifting}
          recipeId={data.id}
          recipeTitle={data.title}
          userId={userId}
          friends={friends.data ?? []}
          onClose={() => setGifting(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  hero: { width: '100%', height: 240 },
  body: { padding: 20, gap: 8 },
  title: { fontSize: 28, fontFamily: displayFont.bold },
  meta: { fontSize: 14, fontFamily: uiFont.regular },
  gifted: { fontSize: 14, fontFamily: uiFont.semibold, marginTop: 4 },
  copy: { fontSize: 16, lineHeight: 24, fontFamily: uiFont.regular, marginTop: 8 },
  section: { fontSize: 20, fontFamily: displayFont.semibold, marginTop: 18, marginBottom: 4 },
  item: { fontSize: 16, lineHeight: 24, fontFamily: uiFont.regular },
  link: { marginTop: 16, fontSize: 15, fontFamily: uiFont.semibold },
});
