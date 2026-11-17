import { router } from 'expo-router';
import { useMemo } from 'react';

import { RecipeForm, type RecipeFormValue } from '@/components/recipe-form';
import { useSaveRecipe } from '@/hooks/use-recipes';
import { useAuth } from '@/lib/auth';
import { takeRecipeDraft } from '@/lib/recipe-draft';

const empty: RecipeFormValue = {
  title: '',
  description: null,
  source_url: null,
  source_name: null,
  servings: null,
  prep_minutes: null,
  cook_minutes: null,
  notes: null,
  category: 'main',
  cuisine: null,
  ingredients: [''],
  steps: [''],
  labelIds: [],
};

export default function NewRecipe() {
  const { session } = useAuth();
  const save = useSaveRecipe();
  const initial = useMemo(() => takeRecipeDraft() ?? empty, []);

  return (
    <RecipeForm
      initial={initial}
      busy={save.isPending}
      submitLabel="Save recipe"
      onSubmit={async (input) => {
        const id = await save.mutateAsync({ ownerId: session!.user.id, input });
        router.replace(`/recipe/${id}`);
      }}
    />
  );
}
