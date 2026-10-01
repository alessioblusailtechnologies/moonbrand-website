import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, shadow } from './theme';

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

type Show = (text: string, action?: Toast['action']) => void;

const ToastContext = createContext<Show>(() => undefined);

const DURATION_MS = 3600;

// Un avviso alla volta in fondo allo schermo, come il toast dello studio; con un'azione (Annulla) resta un po' di più.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insets = useSafeAreaInsets();

  const show = useCallback<Show>((text, action) => {
    clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, text, action });
    timer.current = setTimeout(() => setToast((current) => (current?.id === id ? null : current)), action ? DURATION_MS * 1.5 : DURATION_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.duration(180)}
          exiting={FadeOutDown.duration(160)}
          style={[styles.toast, { bottom: insets.bottom + 78 }]}
          pointerEvents="box-none"
        >
          <Text style={styles.text}>{toast.text}</Text>
          {toast.action ? (
            <Pressable
              hitSlop={8}
              onPress={() => {
                toast.action?.run();
                setToast(null);
              }}
            >
              <Text style={styles.action}>{toast.action.label}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  return useContext(ToastContext);
}

// La conferma prima di un'azione che non si annulla: il dialogo del sistema.
export function confirm({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Annulla',
  danger = false,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: danger ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    ...shadow.lifted,
  },
  text: { flex: 1, color: colors.white, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  action: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 14 },
});
