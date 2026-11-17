import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type Profile = Pick<Tables<'profiles'>, 'id' | 'email' | 'display_name'>;

export type Friendship = Tables<'friendships'> & {
  requester: Profile;
  addressee: Profile;
};

export const friendKeys = {
  all: ['friends'] as const,
};

function asProfile(value: Profile | Profile[] | null | undefined): Profile {
  if (!value) return { id: '', email: '', display_name: null };
  return Array.isArray(value) ? (value[0] ?? { id: '', email: '', display_name: null }) : value;
}

export function useFriendships() {
  return useQuery({
    queryKey: friendKeys.all,
    queryFn: async (): Promise<Friendship[]> => {
      const { data, error } = await supabase
        .from('friendships')
        .select(
          '*, requester:profiles!friendships_requester_id_fkey(id, email, display_name), addressee:profiles!friendships_addressee_id_fkey(id, email, display_name)',
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        requester: asProfile(row.requester as Profile | Profile[] | null),
        addressee: asProfile(row.addressee as Profile | Profile[] | null),
      }));
    },
  });
}

export function otherParty(friendship: Friendship, userId: string): Profile {
  return friendship.requester_id === userId ? friendship.addressee : friendship.requester;
}

export function useRequestFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.rpc('request_friend', { p_email: email.trim() });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: friendKeys.all }),
  });
}

export function useRespondFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await supabase.rpc('respond_friend', {
        p_friendship_id: id,
        p_accept: accept,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: friendKeys.all }),
  });
}

export function useRemoveFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('friendships').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: friendKeys.all }),
  });
}
