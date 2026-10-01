import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, shadow } from './theme';

export type IconName = ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 18, color = colors.title }: { name: IconName; size?: number; color?: string }) {
  return <Feather name={name} size={size} color={color} />;
}

type Variant = 'hero' | 'title' | 'heading' | 'strong' | 'body' | 'ink' | 'caption' | 'label';

const TEXT: Record<Variant, TextStyle> = {
  hero: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 34, color: colors.title, letterSpacing: -0.5 },
  title: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, color: colors.title, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23, color: colors.title },
  strong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, color: colors.title },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.body },
  ink: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.title },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.body },
  label: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, color: colors.body, letterSpacing: 0.8, textTransform: 'uppercase' },
};

export function T({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  return <Text {...props} style={[TEXT[variant], style]} />;
}

type ButtonKind = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  kind = 'primary',
  small = false,
  disabled = false,
  busy = false,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  small?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = BUTTONS[kind];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && { opacity: 0.85 },
        off && { opacity: 0.45 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={palette.fg} /> : icon ? <Icon name={icon} size={small ? 15 : 17} color={palette.fg} /> : null}
      <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

const BUTTONS: Record<ButtonKind, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
  accent: { bg: colors.accent, fg: colors.primary, border: colors.accent },
  secondary: { bg: colors.white, fg: colors.title, border: colors.borderField },
  ghost: { bg: 'transparent', fg: colors.title, border: 'transparent' },
  danger: { bg: colors.danger, fg: colors.white, border: colors.danger },
};

export function IconButton({
  name,
  onPress,
  label,
  solid = false,
  disabled = false,
  size = 40,
  color,
}: {
  name: IconName;
  onPress?: () => void;
  label: string;
  solid?: boolean;
  disabled?: boolean;
  size?: number;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2 },
        solid && { backgroundColor: colors.primary },
        pressed && { backgroundColor: solid ? colors.primarySoft : colors.grey100 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Icon name={name} size={Math.round(size * 0.45)} color={color ?? (solid ? colors.white : colors.title)} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
  color,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  color?: string;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
    >
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      {icon ? <Icon name={icon} size={14} color={selected ? colors.white : colors.title} /> : null}
      <Text numberOfLines={1} style={[styles.chipText, selected && { color: colors.white }, disabled && { color: colors.grey300 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'mint' | 'accent' | 'dark' }) {
  const palette = {
    neutral: { bg: colors.grey100, fg: colors.title },
    mint: { bg: colors.mintTint, fg: colors.success },
    accent: { bg: colors.accentTint, fg: colors.accentStrong },
    dark: { bg: colors.primary, fg: colors.white },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text numberOfLines={1} style={[styles.badgeText, { color: palette.fg }]}>
        {label}
      </Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field({ label, hint, style, ...props }: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <T variant="label">{label}</T> : null}
      <TextInput placeholderTextColor={colors.grey500} {...props} style={[styles.input, props.multiline && styles.inputMultiline, style]} />
      {hint ? <T variant="caption">{hint}</T> : null}
    </View>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <View style={styles.spinner}>
      <ActivityIndicator color={colors.accent} />
      {label ? <T variant="caption">{label}</T> : null}
    </View>
  );
}

export function Empty({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <T variant="strong" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {text ? (
        <T variant="caption" style={{ textAlign: 'center' }}>
          {text}
        </T>
      ) : null}
      {children}
    </View>
  );
}

// Una segmented control come quella dello studio: le schede Proposte / Salvate, i canali.
export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.key)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text numberOfLines={1} style={[styles.segmentText, selected && { color: colors.title, fontFamily: fonts.semibold }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// La finestra dal basso: un foglio bianco sopra il velo, che scorre se è lungo.
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.sheetRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Chiudi" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.sheetHead}>
              <T variant="heading" style={{ flex: 1 }}>
                {title}
              </T>
              <IconButton name="x" label="Chiudi" onPress={onClose} size={36} />
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingBottom: 8 }}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  buttonSmall: { minHeight: 36, paddingHorizontal: 14 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 15 },
  buttonTextSmall: { fontSize: 13 },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    maxWidth: 260,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderField,
    backgroundColor: colors.white,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDisabled: { borderColor: colors.grey100 },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.title, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, maxWidth: 240 },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11 },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...shadow.card,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.sunken,
    color: colors.title,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  spinner: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 24 },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: radius.pill, backgroundColor: colors.grey100 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 34, paddingHorizontal: 12, borderRadius: radius.pill },
  segmentSelected: { backgroundColor: colors.white, ...shadow.card },
  segmentText: { fontFamily: fonts.medium, fontSize: 13, color: colors.body },
  sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  sheet: {
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingTop: 8,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    backgroundColor: colors.surface,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, marginBottom: 8, borderRadius: 2, backgroundColor: colors.grey300 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sheetFooter: { flexDirection: 'row', gap: 10, paddingTop: 12 },
});
