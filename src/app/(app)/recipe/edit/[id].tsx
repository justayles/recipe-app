import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { RecipeForm } from '@/components/recipe-form';
import { Centered, EmptyState, ErrorState, errorMessage } from '@/components/ui';
import { useRecipe, useSaveRecipe } from '@/hooks/use-recipes';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function EditRecipe() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const recipe = useRecipe(id ?? '');
  const save = useSaveRecipe();

  if (recipe.isPending) {
    return (
      <Centered>
        <ActivityIndicator size="large" color={theme.primary} />
      </Centered>
    );
  }
  if (recipe.isError) {
    return <ErrorState message={errorMessage(recipe.error)} onRetry={() => recipe.refetch()} />;
  }
  if (!recipe.data) {
    return <EmptyState title="Recipe not found" />;
  }

  const data = recipe.data;
  return (
    <RecipeForm
      initial={{
        title: data.title,
        description: data.description,
        source_url: data.source_url,
        source_name: data.source_name,
        servings: data.servings,
        prep_minutes: data.prep_minutes,
        cook_minutes: data.cook_minutes,
        notes: data.notes,
        category: data.category,
        cuisine: data.cuisine,
        ingredients: data.ingredients.map((item) => ({
          text: item.item,
          isHeading: item.is_heading,
        })),
        steps: data.steps.map((step) => ({
          text: step.body,
          isHeading: step.is_heading,
        })),
        labelIds: data.labels.map((label) => label.id),
        existingImagePath: data.image_path,
      }}
      busy={save.isPending}
      submitLabel="Save changes"
      onSubmit={async (input) => {
        await save.mutateAsync({ id: data.id, ownerId: session!.user.id, input });
        router.replace(`/recipe/${data.id}`);
      }}
    />
  );
}
