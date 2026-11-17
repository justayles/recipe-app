import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, ErrorText, errorMessage } from '@/components/ui';
import { otherParty, type Friendship } from '@/hooks/use-friends';
import { useGiftRecipe } from '@/hooks/use-gifts';
import { displayFont, uiFont } from '@/lib/fonts';
import { useTheme } from '@/lib/theme';

export function GiftModal({
  visible,
  recipeId,
  recipeTitle,
  userId,
  friends,
  onClose,
}: {
  visible: boolean;
  recipeId: string;
  recipeTitle: string;
  userId: string;
  friends: Friendship[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const gift = useGiftRecipe();
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const accepted = friends.filter((f) => f.status === 'accepted');

  async function send() {
    if (!selected) return;
    setError(null);
    try {
      await gift.mutateAsync({ recipeId, toUserId: selected, message });
      setSelected(null);
      setMessage('');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.surface }]} onPress={() => {}}>
          <Text style={[styles.title, { color: theme.text }]}>Gift this recipe</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Send a copy of “{recipeTitle}” to a friend. They can accept it into their cookbook.
          </Text>
          {accepted.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              Add a friend first — you can only gift recipes to people you are friends with.
            </Text>
          ) : (
            <ScrollView style={styles.list}>
              {accepted.map((friendship) => {
                const friend = otherParty(friendship, userId);
                const active = selected === friend.id;
                return (
                  <Pressable
                    key={friendship.id}
                    onPress={() => setSelected(friend.id)}
                    style={[
                      styles.friend,
                      {
                        borderColor: active ? theme.primary : theme.border,
                        backgroundColor: active ? theme.badge : theme.background,
                      },
                    ]}>
                    <Text style={[styles.friendName, { color: theme.text }]}>
                      {friend.display_name || friend.email}
                    </Text>
                    <Text style={[styles.friendEmail, { color: theme.textMuted }]}>{friend.email}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Optional note"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { borderColor: theme.border, color: theme.text }]}
          />
          <ErrorText message={error} />
          <View style={styles.actions}>
            <Button title="Cancel" variant="secondary" onPress={onClose} style={styles.action} />
            <Button
              title="Send gift"
              onPress={send}
              disabled={!selected}
              loading={gift.isPending}
              style={styles.action}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 16, padding: 20, maxHeight: '80%' },
  title: { fontSize: 20, fontFamily: displayFont.semibold },
  subtitle: { fontSize: 14, marginTop: 6, marginBottom: 12, fontFamily: uiFont.regular },
  empty: { fontSize: 14, marginVertical: 12, fontFamily: uiFont.regular },
  list: { maxHeight: 240, marginBottom: 8 },
  friend: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  friendName: { fontSize: 16, fontFamily: uiFont.semibold },
  friendEmail: { fontSize: 13, fontFamily: uiFont.regular },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: uiFont.regular,
    marginTop: 4,
  },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  action: { flex: 1 },
});
