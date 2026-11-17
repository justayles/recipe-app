import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { uiFont } from '@/lib/fonts';
import { useTheme } from '@/lib/theme';
import type { Label } from '@/hooks/use-labels';

export function LabelChips({
  labels,
  selectedIds,
  onToggle,
  onCreate,
}: {
  labels: Label[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onCreate?: () => void;
}) {
  const theme = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {labels.map((label) => {
        const selected = selectedIds.includes(label.id);
        return (
          <Pressable
            key={label.id}
            onPress={() => onToggle(label.id)}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? label.color : theme.surface,
                borderColor: selected ? label.color : theme.border,
              },
            ]}>
            <Text style={[styles.chipText, { color: selected ? '#fff' : theme.text }]}>{label.name}</Text>
          </Pressable>
        );
      })}
      {onCreate ? (
        <Pressable
          onPress={onCreate}
          style={[styles.chip, { borderColor: theme.primary, backgroundColor: theme.surface }]}>
          <Text style={[styles.chipText, { color: theme.primary }]}>+ label</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

export function ReadOnlyLabels({ labels }: { labels: { id: string; name: string; color: string }[] }) {
  const theme = useTheme();
  if (labels.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {labels.map((label) => (
        <View key={label.id} style={[styles.chip, { backgroundColor: label.color, borderColor: label.color }]}>
          <Text style={[styles.chipText, { color: '#fff' }]}>{label.name}</Text>
        </View>
      ))}
      {labels.length === 0 ? <Text style={{ color: theme.textMuted }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontSize: 13, fontFamily: uiFont.semibold },
});
