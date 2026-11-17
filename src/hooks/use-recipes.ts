import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '@/lib/database.types';
import { uploadRecipeImage } from '@/lib/images';
import { supabase } from '@/lib/supabase';

export type RecipeLabel = { id: string; name: string; color: string };
export type RecipeIngredient = Tables<'recipe_ingredients'>;
export type RecipeStep = Tables<'recipe_steps'>;

export type RecipeSummary = Tables<'recipes'> & {
  labels: RecipeLabel[];
};

export type RecipeDetail = RecipeSummary & {
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  gifter?: { display_name: string | null; email: string } | null;
};

export type RecipeInput = {
  title: string;
  description: string | null;
  source_url: string | null;
  source_name: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  notes: string | null;
  category: string | null;
  cuisine: string | null;
  ingredients: string[];
  steps: string[];
  labelIds: string[];
  imageUri?: string | null;
  imageBase64?: string | null;
  imageContentType?: string | null;
};

export const recipeKeys = {
  all: ['recipes'] as const,
  detail: (id: string) => ['recipe', id] as const,
};

function mapLabels(
  rows: { labels: { id: string; name: string; color: string } | { id: string; name: string; color: string }[] | null }[],
): RecipeLabel[] {
  return rows.flatMap((row) => {
    const label = row.labels;
    if (!label) return [];
    return Array.isArray(label) ? label : [label];
  });
}

export function useRecipes() {
  return useQuery({
    queryKey: recipeKeys.all,
    queryFn: async (): Promise<RecipeSummary[]> => {
      const { data, error } = await supabase
        .from('recipes')
        .select('*, recipe_labels(labels(*))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const { recipe_labels, ...recipe } = row;
        return {
          ...(recipe as Tables<'recipes'>),
          labels: mapLabels(recipe_labels ?? []),
        };
      });
    },
  });
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: recipeKeys.detail(id),
    enabled: !!id,
    queryFn: async (): Promise<RecipeDetail | null> => {
      const { data, error } = await supabase
        .from('recipes')
        .select(
          '*, recipe_labels(labels(*)), recipe_ingredients(*), recipe_steps(*), gifter:profiles!recipes_gifted_from_user_id_fkey(display_name, email)',
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { recipe_labels, recipe_ingredients, recipe_steps, gifter, ...recipe } = data;
      return {
        ...(recipe as Tables<'recipes'>),
        labels: mapLabels(recipe_labels ?? []),
        ingredients: [...(recipe_ingredients ?? [])].sort((a, b) => a.position - b.position),
        steps: [...(recipe_steps ?? [])].sort((a, b) => a.position - b.position),
        gifter: Array.isArray(gifter) ? (gifter[0] ?? null) : gifter,
      };
    },
  });
}

async function replaceChildren(recipeId: string, input: RecipeInput) {
  const { error: delIng } = await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
  if (delIng) throw delIng;
  const { error: delSteps } = await supabase.from('recipe_steps').delete().eq('recipe_id', recipeId);
  if (delSteps) throw delSteps;
  const { error: delLabels } = await supabase.from('recipe_labels').delete().eq('recipe_id', recipeId);
  if (delLabels) throw delLabels;

  const ingredients = input.ingredients
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, position) => ({ recipe_id: recipeId, position, item }));
  if (ingredients.length) {
    const { error } = await supabase.from('recipe_ingredients').insert(ingredients);
    if (error) throw error;
  }

  const steps = input.steps
    .map((body) => body.trim())
    .filter(Boolean)
    .map((body, position) => ({ recipe_id: recipeId, position, body }));
  if (steps.length) {
    const { error } = await supabase.from('recipe_steps').insert(steps);
    if (error) throw error;
  }

  if (input.labelIds.length) {
    const { error } = await supabase
      .from('recipe_labels')
      .insert(input.labelIds.map((label_id) => ({ recipe_id: recipeId, label_id })));
    if (error) throw error;
  }
}

export function useSaveRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ownerId, input }: { id?: string; ownerId: string; input: RecipeInput }) => {
      const payload = {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        source_url: input.source_url?.trim() || null,
        source_name: input.source_name?.trim() || null,
        servings: Number.isFinite(input.servings) ? input.servings : null,
        prep_minutes: Number.isFinite(input.prep_minutes) ? input.prep_minutes : null,
        cook_minutes: Number.isFinite(input.cook_minutes) ? input.cook_minutes : null,
        notes: input.notes?.trim() || null,
        category: input.category?.trim() || null,
        cuisine: input.cuisine?.trim() || null,
      };

      let recipeId = id;
      if (recipeId) {
        const { error } = await supabase.from('recipes').update(payload).eq('id', recipeId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('recipes')
          .insert({ ...payload, owner_id: ownerId })
          .select('id')
          .single();
        if (error) throw error;
        recipeId = data.id;
      }

      if (input.imageUri || input.imageBase64) {
        const imagePath = await uploadRecipeImage({
          userId: ownerId,
          recipeId,
          uri: input.imageUri,
          base64: input.imageBase64,
          contentType: input.imageContentType,
        });
        const { error } = await supabase.from('recipes').update({ image_path: imagePath }).eq('id', recipeId);
        if (error) throw error;
      }

      await replaceChildren(recipeId, input);
      return recipeId;
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: recipeKeys.all });
      if (vars.id) qc.invalidateQueries({ queryKey: recipeKeys.detail(vars.id) });
    },
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recipes').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: recipeKeys.all }),
  });
}
