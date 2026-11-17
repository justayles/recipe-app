import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { displayFont, uiFont } from '@/lib/fonts';
import { useTheme } from '@/lib/theme';

type PromptModalProps = {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  keyboardType?: 'default' | 'email-address';
  onSubmit: (value: string) => void;
  onCancel: () => void;
  error?: string | null;
  busy?: boolean;
};

export function PromptModal(props: PromptModalProps) {
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onCancel}>
      {props.visible ? <PromptBody {...props} /> : null}
    </Modal>
  );
}

function PromptBody({
  title,
  placeholder,
  initialValue = '',
  submitLabel = 'Save',
  autoCapitalize = 'sentences',
  keyboardType,
  onSubmit,
  onCancel,
  error,
  busy,
}: PromptModalProps) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();

  return (
    <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <TextInput
          autoFocus
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCapitalize !== 'none'}
          keyboardType={keyboardType}
          onSubmitEditing={() => trimmed && !busy && onSubmit(trimmed)}
          style={[styles.input, { borderColor: theme.border, color: theme.text }]}
        />
        {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        <View style={styles.actions}>
          <Button title="Cancel" variant="secondary" onPress={onCancel} style={styles.actionBtn} />
          <Button
            title={submitLabel}
            onPress={() => onSubmit(trimmed)}
            disabled={!trimmed}
            loading={busy}
            style={styles.actionBtn}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 16, padding: 20 },
  title: { fontSize: 18, fontFamily: displayFont.semibold, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: uiFont.regular,
  },
  error: { fontSize: 14, marginTop: 8, fontFamily: uiFont.regular },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  actionBtn: { flex: 1 },
});
