import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PromptModal } from '@/components/prompt-modal';
import { Button, EmptyState, ErrorState, errorMessage } from '@/components/ui';
import {
  otherParty,
  useFriendships,
  useRemoveFriend,
  useRequestFriend,
  useRespondFriend,
} from '@/hooks/use-friends';
import { useGifts, useRespondGift } from '@/hooks/use-gifts';
import { useAuth } from '@/lib/auth';
import { displayFont, uiFont } from '@/lib/fonts';
import { recipeImageUrl } from '@/lib/images';
import { useTheme } from '@/lib/theme';
import { Image } from 'expo-image';

export default function FriendsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const friends = useFriendships();
  const gifts = useGifts();
  const requestFriend = useRequestFriend();
  const respondFriend = useRespondFriend();
  const removeFriend = useRemoveFriend();
  const respondGift = useRespondGift();
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const incoming = friends.data?.filter((f) => f.status === 'pending' && f.addressee_id === userId) ?? [];
  const outgoing = friends.data?.filter((f) => f.status === 'pending' && f.requester_id === userId) ?? [];
  const accepted = friends.data?.filter((f) => f.status === 'accepted') ?? [];
  const incomingGifts = gifts.data?.filter((g) => g.status === 'pending' && g.to_user_id === userId) ?? [];

  async function refresh() {
    setRefreshing(true);
    await Promise.all([friends.refetch(), gifts.refetch()]);
    setRefreshing(false);
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {friends.isError ? (
        <ErrorState message={errorMessage(friends.error)} onRetry={() => friends.refetch()} />
      ) : null}

      <Button title="Add friend by email" onPress={() => setAdding(true)} />

      {incomingGifts.length > 0 ? (
        <View>
          <Text style={[styles.heading, { color: theme.text }]}>Recipe gifts</Text>
          {incomingGifts.map((gift) => (
            <View key={gift.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Pressable
                style={styles.giftRow}
                onPress={() => router.push(`/recipe/${gift.recipe.id}`)}>
                {gift.recipe.image_path ? (
                  <Image
                    source={{ uri: recipeImageUrl(gift.recipe.image_path) ?? undefined }}
                    style={styles.thumb}
                    contentFit="cover"
                  />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.text }]}>{gift.recipe.title}</Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>
                    From {gift.from.display_name || gift.from.email}
                  </Text>
                  {gift.message ? (
                    <Text style={[styles.meta, { color: theme.textMuted }]}>“{gift.message}”</Text>
                  ) : null}
                </View>
              </Pressable>
              <View style={styles.actions}>
                <Button
                  title="Decline"
                  variant="secondary"
                  onPress={() =>
                    respondGift.mutate(
                      { id: gift.id, accept: false },
                      { onError: (e) => Alert.alert('Could not decline', errorMessage(e)) },
                    )
                  }
                  style={styles.flex}
                />
                <Button
                  title="Add to cookbook"
                  onPress={() =>
                    respondGift.mutate(
                      { id: gift.id, accept: true },
                      {
                        onSuccess: (newId) => {
                          if (newId) router.push(`/recipe/${newId}`);
                        },
                        onError: (e) => Alert.alert('Could not accept gift', errorMessage(e)),
                      },
                    )
                  }
                  loading={respondGift.isPending}
                  style={styles.flex}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View>
        <Text style={[styles.heading, { color: theme.text }]}>Friend requests</Text>
        {incoming.length === 0 && outgoing.length === 0 ? (
          <Text style={[styles.meta, { color: theme.textMuted }]}>No pending requests.</Text>
        ) : null}
        {incoming.map((friendship) => (
          <View key={friendship.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.name, { color: theme.text }]}>
              {friendship.requester.display_name || friendship.requester.email}
            </Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>{friendship.requester.email}</Text>
            <View style={styles.actions}>
              <Button
                title="Decline"
                variant="secondary"
                onPress={() => respondFriend.mutate({ id: friendship.id, accept: false })}
                style={styles.flex}
              />
              <Button
                title="Accept"
                onPress={() => respondFriend.mutate({ id: friendship.id, accept: true })}
                style={styles.flex}
              />
            </View>
          </View>
        ))}
        {outgoing.map((friendship) => (
          <View key={friendship.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.name, { color: theme.text }]}>
              Waiting on {friendship.addressee.display_name || friendship.addressee.email}
            </Text>
            <Button
              title="Cancel request"
              variant="secondary"
              onPress={() => removeFriend.mutate(friendship.id)}
            />
          </View>
        ))}
      </View>

      <View>
        <Text style={[styles.heading, { color: theme.text }]}>Friends</Text>
        {accepted.length === 0 ? (
          <EmptyState title="No friends yet" hint="Add someone by the email they signed up with." />
        ) : (
          accepted.map((friendship) => {
            const friend = otherParty(friendship, userId);
            return (
              <View
                key={friendship.id}
                style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.name, { color: theme.text }]}>{friend.display_name || friend.email}</Text>
                <Text style={[styles.meta, { color: theme.textMuted }]}>{friend.email}</Text>
                <Button
                  title="Remove"
                  variant="danger"
                  onPress={() =>
                    Alert.alert('Remove friend?', friend.display_name || friend.email, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => removeFriend.mutate(friendship.id),
                      },
                    ])
                  }
                />
              </View>
            );
          })
        )}
      </View>

      <PromptModal
        visible={adding}
        title="Add a friend"
        placeholder="friend@example.com"
        submitLabel="Send request"
        autoCapitalize="none"
        keyboardType="email-address"
        error={addError}
        busy={requestFriend.isPending}
        onCancel={() => {
          setAdding(false);
          setAddError(null);
        }}
        onSubmit={async (email) => {
          setAddError(null);
          try {
            await requestFriend.mutateAsync(email);
            setAdding(false);
          } catch (e) {
            setAddError(errorMessage(e));
          }
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 20, fontFamily: displayFont.semibold, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10, gap: 8 },
  name: { fontSize: 16, fontFamily: uiFont.semibold },
  meta: { fontSize: 13, fontFamily: uiFont.regular },
  actions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  giftRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 56, height: 56, borderRadius: 8 },
});
