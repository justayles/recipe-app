import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecipeCard } from '@/components/recipe-card';
import { Centered, EmptyState, ErrorState, errorMessage } from '@/components/ui';
import { useLabels } from '@/hooks/use-labels';
import { useRecipes } from '@/hooks/use-recipes';
import { useAuth } from '@/lib/auth';
import { uiFont } from '@/lib/fonts';
import { useTheme } from '@/lib/theme';

export default function RecipesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { session, signOut } = useAuth();
  const recipes = useRecipes();
  const labels = useLabels();
  const [query, setQuery] = useState('');
  const [labelId, setLabelId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (recipes.data ?? []).filter((recipe) => {
      if (labelId && !recipe.labels.some((label) => label.id === labelId)) return false;
      if (!q) return true;
      return (
        recipe.title.toLowerCase().includes(q) ||
        (recipe.description ?? '').toLowerCase().includes(q) ||
        (recipe.cuisine ?? '').toLowerCase().includes(q) ||
        recipe.labels.some((label) => label.name.toLowerCase().includes(q))
      );
    });
  }, [recipes.data, query, labelId]);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([recipes.refetch(), labels.refetch()]);
    setRefreshing(false);
  }

  const confirmSignOut = useCallback(() => {
    Alert.alert('Sign out?', session?.user.email ?? undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut().catch(() => {}) },
    ]);
  }, [session?.user.email, signOut]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/recipe/new')}
            hitSlop={12}
            accessibilityLabel="New recipe">
            <Ionicons name="add-circle-outline" size={26} color={theme.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={confirmSignOut}
            hitSlop={12}
            accessibilityLabel="Sign out">
            <Ionicons name="log-out-outline" size={24} color={theme.text} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, theme.primary, theme.text, confirmSignOut]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search recipes, labels, cuisine"
        placeholderTextColor={theme.textMuted}
        style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
      />

      <View style={styles.filters}>
        <Pressable
          onPress={() => setLabelId(null)}
          style={[
            styles.filter,
            {
              backgroundColor: !labelId ? theme.primary : theme.surface,
              borderColor: !labelId ? theme.primary : theme.border,
            },
          ]}>
          <Text style={{ color: !labelId ? theme.primaryText : theme.text, fontFamily: uiFont.semibold }}>All</Text>
        </Pressable>
        {(labels.data ?? []).map((label) => {
          const selected = labelId === label.id;
          return (
            <Pressable
              key={label.id}
              onPress={() => setLabelId(selected ? null : label.id)}
              style={[
                styles.filter,
                {
                  backgroundColor: selected ? label.color : theme.surface,
                  borderColor: selected ? label.color : theme.border,
                },
              ]}>
              <Text style={{ color: selected ? '#fff' : theme.text, fontFamily: uiFont.semibold }}>{label.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {recipes.isPending ? (
        <Centered>
          <ActivityIndicator size="large" color={theme.primary} />
        </Centered>
      ) : recipes.isError ? (
        <ErrorState message={errorMessage(recipes.error)} onRetry={() => recipes.refetch()} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={
            <EmptyState
              title={query || labelId ? 'No matching recipes' : 'Your cookbook is empty'}
              hint="Add a recipe by hand or import one from BBC Food."
            />
          }
          renderItem={({ item }) => (
            <RecipeCard recipe={item} onPress={() => router.push(`/recipe/${item.id}`)} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  search: {
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: uiFont.regular,
  },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  filter: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
});
