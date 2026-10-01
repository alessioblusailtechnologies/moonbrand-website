import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { kindLabel } from '@moonbrand/shared/domain/catalog';

import { errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { BrandAvatar } from './brand';
import { Button, Icon, IconButton, Sheet, T } from './kit';
import { colors, radius } from './theme';
import { useToast } from './toast';

// L'intestazione delle schede: il brand attivo (si tocca per cambiarlo), il titolo e le azioni della pagina.
export function TabHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { activeBrand } = useSession();
  const [picking, setPicking] = useState(false);
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        <Pressable style={styles.brand} onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel="Cambia brand" hitSlop={6}>
          {activeBrand ? <BrandAvatar brand={activeBrand} size={30} /> : null}
          <T variant="strong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {activeBrand?.name ?? 'Moonbrand'}
          </T>
          <Icon name="chevron-down" size={16} color={colors.body} />
        </Pressable>
        <View style={styles.actions}>{actions}</View>
      </View>
      <T variant="hero">{title}</T>
      <BrandPicker visible={picking} onClose={() => setPicking(false)} />
    </View>
  );
}

// L'intestazione delle pagine dentro una scheda: indietro, il titolo e le azioni.
export function BackHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.back, { paddingTop: insets.top + 6 }]}>
      <IconButton name="arrow-left" label="Indietro" onPress={() => (router.canGoBack() ? router.back() : router.replace('/idee'))} />
      <View style={{ flex: 1 }}>
        <T variant="strong" numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T variant="caption" numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {actions}
    </View>
  );
}

function BrandPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { brands, activeBrand, setActiveBrand } = useSession();
  const toast = useToast();
  return (
    <Sheet visible={visible} onClose={onClose} title="I tuoi brand">
      <View style={{ gap: 8 }}>
        {brands.map((brand) => {
          const active = brand.id === activeBrand?.id;
          return (
            <Pressable
              key={brand.id}
              style={[styles.option, active && styles.optionActive]}
              onPress={async () => {
                onClose();
                if (active) return;
                try {
                  await setActiveBrand(brand.id);
                } catch (error) {
                  toast(errorMessage(error, 'Non riesco a cambiare brand. Riprova.'));
                }
              }}
            >
              <BrandAvatar brand={brand} size={40} />
              <View style={{ flex: 1 }}>
                <T variant="strong" numberOfLines={1}>
                  {brand.name}
                </T>
                <T variant="caption">{kindLabel(brand.kind)}</T>
              </View>
              {active ? <Icon name="check" size={18} color={colors.accentStrong} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Button
        label="Nuovo brand"
        kind="secondary"
        icon="plus"
        onPress={() => {
          onClose();
          router.push('/onboarding');
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { gap: 14, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  optionActive: { borderColor: colors.accent },
});
