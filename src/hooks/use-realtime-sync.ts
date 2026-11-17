import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

export function useRealtimeSync(userId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`sync:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, (payload) => {
        const row = (payload.new as { id?: string }) ?? {};
        const old = (payload.old as { id?: string }) ?? {};
        const id = row.id ?? old.id;
        if (id) qc.invalidateQueries({ queryKey: ['recipe', id] });
        qc.invalidateQueries({ queryKey: ['recipes'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        qc.invalidateQueries({ queryKey: ['friends'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gifts' }, () => {
        qc.invalidateQueries({ queryKey: ['gifts'] });
        qc.invalidateQueries({ queryKey: ['recipes'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}
