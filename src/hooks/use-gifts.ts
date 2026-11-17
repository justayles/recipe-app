import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { friendKeys } from './use-friends';
import { recipeKeys } from './use-recipes';

export type Gift = Tables<'gifts'> & {
  recipe: { id: string; title: string; image_path: string | null; description: string | null };
  from: { id: string; email: string; display_name: string | null };
  to: { id: string; email: string; display_name: string | null };
};

export const giftKeys = {
  all: ['gifts'] as const,
};

function asOne<T>(value: T | T[] | null | undefined, fallback: T): T {
  if (!value) return fallback;
  return Array.isArray(value) ? (value[0] ?? fallback) : value;
}

export function useGifts() {
  return useQuery({
    queryKey: giftKeys.all,
    queryFn: async (): Promise<Gift[]> => {
      const { data, error } = await supabase
        .from('gifts')
        .select(
          '*, recipe:recipes!gifts_recipe_id_fkey(id, title, image_path, description), from:profiles!gifts_from_user_id_fkey(id, email, display_name), to:profiles!gifts_to_user_id_fkey(id, email, display_name)',
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        recipe: asOne(row.recipe as Gift['recipe'] | Gift['recipe'][], {
          id: '',
          title: 'Recipe',
          image_path: null,
          description: null,
        }),
        from: asOne(row.from as Gift['from'] | Gift['from'][], { id: '', email: '', display_name: null }),
        to: asOne(row.to as Gift['to'] | Gift['to'][], { id: '', email: '', display_name: null }),
      }));
    },
  });
}

export function useGiftRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recipeId,
      toUserId,
      message,
    }: {
      recipeId: string;
      toUserId: string;
      message?: string;
    }) => {
      const { error } = await supabase.rpc('gift_recipe', {
        p_recipe_id: recipeId,
        p_to_user_id: toUserId,
        p_message: message ?? '',
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: giftKeys.all }),
  });
}

export function useRespondGift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { data, error } = await supabase.rpc('respond_gift', {
        p_gift_id: id,
        p_accept: accept,
      });
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: giftKeys.all });
      qc.invalidateQueries({ queryKey: recipeKeys.all });
      qc.invalidateQueries({ queryKey: friendKeys.all });
    },
  });
}
