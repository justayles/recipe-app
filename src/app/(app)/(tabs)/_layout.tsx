import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useFriendships } from '@/hooks/use-friends';
import { useGifts } from '@/hooks/use-gifts';
import { useAuth } from '@/lib/auth';
import { displayFont, uiFont } from '@/lib/fonts';
import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const friends = useFriendships();
  const gifts = useGifts();

  const incomingFriends =
    friends.data?.filter((f) => f.status === 'pending' && f.addressee_id === userId).length ?? 0;
  const incomingGifts = gifts.data?.filter((g) => g.status === 'pending' && g.to_user_id === userId).length ?? 0;
  const friendsBadge = incomingFriends + incomingGifts;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        headerTitleStyle: { fontFamily: displayFont.semibold, fontSize: 20 },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarLabelStyle: { fontFamily: uiFont.semibold, fontSize: 12 },
      }}>
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Recipes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="import"
        options={{
          title: 'Import',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="link-outline" size={size} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarBadge: friendsBadge > 0 ? friendsBadge : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={String(color)} />
          ),
        }}
      />
    </Tabs>
  );
}
