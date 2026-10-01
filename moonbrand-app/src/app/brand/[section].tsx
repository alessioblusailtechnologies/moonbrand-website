import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BrandDraft, SectionKey } from '@moonbrand/shared/domain/brand';
import { sectionCopy, sectionError } from '@moonbrand/shared/domain/sections';

import { errorMessage } from '../../lib/api';
import { useBrand, useSession } from '../../lib/session';
import { brandsApi } from '../../lib/services';
import { ChannelsEditor, IdentityEditor, PositioningEditor, ThemesEditor } from '../../features/brand/editors';
import { BackHeader } from '../../ui/header';
import { Button, Spinner, T } from '../../ui/kit';
import { colors } from '../../ui/theme';
import { useToast } from '../../ui/toast';

const SECTIONS: SectionKey[] = ['identity', 'positioning', 'channels', 'themes'];

// Una sezione del brand da modificare: si riscrive tutto il profilo, come fanno le Impostazioni brand dello studio.
export default function BrandSectionScreen() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const key = (SECTIONS.includes(section as SectionKey) ? section : 'identity') as SectionKey;
  const brand = useBrand();
  const { upsertBrand } = useSession();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<BrandDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    brandsApi
      .profile(brand.id)
      .then((profile) => setDraft(profile.draft))
      .catch((error) => {
        toast(errorMessage(error, 'Non riesco a leggere il profilo del brand.'));
        router.back();
      });
  }, [brand.id, toast]);

  const save = async () => {
    if (!draft || saving) return;
    const error = sectionError(key, draft);
    if (error) return toast(error);
    setSaving(true);
    try {
      upsertBrand(await brandsApi.update(brand.id, draft));
      toast('Profilo aggiornato.');
      router.back();
    } catch (reason) {
      toast(errorMessage(reason, 'Non sono riuscito a salvare. Riprova.'));
      setSaving(false);
    }
  };

  const copy = draft ? sectionCopy(key, draft.identity.kind) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior="padding">
      <BackHeader title={copy?.name ?? 'Brand'} subtitle={brand.name} />
      {!draft || !copy ? (
        <Spinner />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 6 }}>
              <T variant="title">{copy.title}</T>
              <T variant="body">{copy.subtitle}</T>
            </View>
            {key === 'identity' ? <IdentityEditor draft={draft} onChange={(identity) => setDraft({ ...draft, identity })} /> : null}
            {key === 'positioning' ? <PositioningEditor draft={draft} onChange={(positioning) => setDraft({ ...draft, positioning })} /> : null}
            {key === 'channels' ? <ChannelsEditor draft={draft} onChange={(channels) => setDraft({ ...draft, channels })} /> : null}
            {key === 'themes' ? <ThemesEditor themes={draft.themes} onChange={(themes) => setDraft({ ...draft, themes })} /> : null}
          </ScrollView>
          <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Button label="Annulla" kind="secondary" onPress={() => router.back()} disabled={saving} style={{ flex: 1 }} />
            <Button label={saving ? 'Salvo…' : 'Salva'} onPress={save} busy={saving} style={{ flex: 1.6 }} />
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { gap: 20, padding: 20, paddingBottom: 40 },
  bottom: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
