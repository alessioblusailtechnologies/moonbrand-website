import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { BrandSummary } from '@moonbrand/shared/api/contract';

import { fileUrl } from '../lib/api';
import { colors, fonts } from './theme';

// La luna di Moonbrand: un disco arancio con la parte in ombra del colore di fondo.
export function Moon({ size = 28, shade = colors.primary }: { size?: number; shade?: string }) {
  const inner = size * 0.85;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.accent }}>
      <View
        style={{
          position: 'absolute',
          top: -size * 0.12,
          left: -size * 0.27,
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: shade,
        }}
      />
    </View>
  );
}

export function Wordmark({ light = false, size = 20 }: { light?: boolean; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.5 }}>
      <Moon size={size * 1.35} shade={light ? colors.primary : colors.surface} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: size, color: light ? colors.white : colors.title, letterSpacing: -0.3 }}>Moonbrand</Text>
    </View>
  );
}

// Il logo del brand o la sua iniziale sul suo colore.
export function BrandAvatar({ brand, size = 32 }: { brand: Pick<BrandSummary, 'name' | 'logoUri' | 'color'>; size?: number }) {
  const logo = fileUrl(brand.logoUri);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: logo ? colors.white : brand.color || colors.primary }]}>
      {logo ? (
        <Image source={{ uri: logo }} style={{ width: size * 0.82, height: size * 0.82 }} contentFit="contain" />
      ) : (
        <Text style={{ color: colors.white, fontFamily: fonts.semibold, fontSize: size * 0.45 }}>{brand.name.charAt(0).toUpperCase() || 'M'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
});
