import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

export type Label = Tables<'labels'>;

export const labelKeys = {
  all: ['labels'] as const,
};

export function useLabels() {
  return useQuery({
    queryKey: labelKeys.all,
    queryFn: async (): Promise<Label[]> => {
      const { data, error } = await supabase.from('labels').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { data, error } = await supabase
        .from('labels')
        .insert({ name: name.trim(), color })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: labelKeys.all }),
  });
}
