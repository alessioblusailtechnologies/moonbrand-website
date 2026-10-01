import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { BrandDraft, SectionKey } from '@moonbrand/shared/domain/brand';
import { kindLabel } from '@moonbrand/shared/domain/catalog';
import { sectionCopy, sectionStatus, sectionSummary } from '@moonbrand/shared/domain/sections';

import { currentServer, errorMessage } from '../../lib/api';
import { useBrand, useSession } from '../../lib/session';
import { brandsApi } from '../../lib/services';
import { BrandAvatar } from '../../ui/brand';
import { TabHeader } from '../../ui/header';
import { Button, Card, Icon, Spinner, T, type IconName } from '../../ui/kit';
import { colors, radius } from '../../ui/theme';
import { confirm, useToast } from '../../ui/toast';

// Le sezioni che si modificano dal telefono; voce, identità visiva e riferimenti si curano dallo studio.
const EDITABLE: SectionKey[] = ['identity', 'positioning', 'channels', 'themes'];
const READ_ONLY: SectionKey[] = ['voice', 'visual', 'references'];

export default function MoreScreen() {
  const brand = useBrand();
  const { account, signOut } = useSession();
  const toast = useToast();
  const [draft, setDraft] = useState<BrandDraft | null>(null);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      brandsApi
        .profile(brand.id)
        .then((profile) => current && setDraft(profile.draft))
        .catch((error) => current && toast(errorMessage(error, 'Non riesco a leggere il profilo del brand.')));
      return () => {
        current = false;
      };
    }, [brand.id, toast]),
  );

  const leave = async () => {
    const ok = await confirm({ title: 'Esci da Moonbrand?', message: 'Per rientrare servono email e password.', confirmLabel: 'Esci' });
    if (ok) await signOut();
  };

  return (
    <View style={{ flex: 1 }}>
      <TabHeader title="Altro" />
      <ScrollView contentContainerStyle={styles.body}>
        <Card style={styles.brand}>
          <BrandAvatar brand={brand} size={52} />
          <View style={{ flex: 1 }}>
            <T variant="heading">{brand.name}</T>
            <T variant="caption">{kindLabel(brand.kind)} · il profilo che l’assistente usa per scrivere</T>
          </View>
        </Card>

        <T variant="label">Profilo del brand</T>
        {draft === null ? (
          <Spinner />
        ) : (
          <View style={styles.group}>
            {EDITABLE.map((key) => (
              <Row
                key={key}
                title={sectionCopy(key, draft.identity.kind).name}
                text={sectionSummary(key, draft)}
                status={sectionStatus(key, draft)}
                onPress={() => router.push(`/brand/${key}`)}
              />
            ))}
            {READ_ONLY.map((key) => (
              <Row key={key} title={sectionCopy(key, draft.identity.kind).name} text={sectionSummary(key, draft)} status={sectionStatus(key, draft)} note="Si cura dallo studio" />
            ))}
          </View>
        )}

        <T variant="label">Lavoro</T>
        <View style={styles.group}>
          <Row icon="message-circle" title="Conversazioni" text="Tutte le chat con l’assistente" onPress={() => router.push('/conversazioni')} />
          <Row icon="plus-circle" title="Nuovo brand" text="Per te, per la tua azienda o per un cliente" onPress={() => router.push('/onboarding')} />
        </View>

        <T variant="label">Account</T>
        <Card style={{ gap: 4 }}>
          <T variant="strong">{account?.name || 'Il tuo account'}</T>
          <T variant="caption">{account?.email}</T>
          <Button label="Esci" kind="secondary" icon="log-out" small onPress={leave} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
        </Card>
        <T variant="caption" style={{ textAlign: 'center' }}>
          Moonbrand {Constants.expoConfig?.version ?? ''} · {currentServer().replace(/^https?:\/\//, '')}
        </T>
      </ScrollView>
    </View>
  );
}

function Row({
  title,
  text,
  status,
  icon,
  note,
  onPress,
}: {
  title: string;
  text: string;
  status?: 'complete' | 'partial' | 'missing';
  icon?: IconName;
  note?: string;
  onPress?: () => void;
}) {
  const tone = status === 'complete' ? colors.mint : status === 'partial' ? colors.accent : colors.grey300;
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && onPress && { backgroundColor: colors.grey100 }]} onPress={onPress} disabled={!onPress}>
      {icon ? <Icon name={icon} size={18} color={colors.body} /> : <View style={[styles.status, { backgroundColor: tone }]} />}
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="strong" style={{ fontSize: 14 }}>
          {title}
        </T>
        <T variant="caption" numberOfLines={2}>
          {text}
        </T>
        {note ? (
          <T variant="caption" style={{ fontSize: 11, color: colors.grey500 }}>
            {note}
          </T>
        ) : null}
      </View>
      {onPress ? <Icon name="chevron-right" size={16} color={colors.grey500} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, padding: 20, paddingTop: 8, paddingBottom: 40 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  group: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  status: { width: 10, height: 10, borderRadius: 5 },
});
