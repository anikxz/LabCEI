import React from 'react';
import { Platform, TextInput, StyleSheet } from 'react-native';
import { colors } from '../../lib/theme';

type Props = {
  value: string;                       // 'YYYY-MM-DD' or ''
  onChange: (v: string) => void;
  placeholder?: string;
};

/**
 * Cross-platform date input.
 *
 * On web (the primary PWA target) it renders a real `<input type="date">`, which
 * gives the browser's built-in clickable calendar picker. On native it falls
 * back to a plain text field (YYYY-MM-DD) so no extra native dependency is needed.
 */
export default function DateField({ value, onChange, placeholder }: Props) {
  if (Platform.OS === 'web') {
    // Raw DOM element — react-native-web renders through React DOM, so a native
    // date input (with its calendar popover) is available here.
    return React.createElement('input', {
      type: 'date',
      value: value || '',
      onChange: (e: any) => onChange(e.target.value),
      style: {
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 14,
        color: colors.text,
        backgroundColor: '#fff',
        width: '100%',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
        outline: 'none',
      },
    });
  }

  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder || 'YYYY-MM-DD'}
      placeholderTextColor={colors.textLight}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text,
    backgroundColor: '#fff',
  },
});
