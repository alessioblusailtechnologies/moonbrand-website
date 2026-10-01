import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { ContentSummary } from '@moonbrand/shared/api/contract';
import { channelName } from '@moonbrand/shared/domain/catalog';

import { errorMessage, fileUrl } from '../../lib/api';
import { formatWeekdayShort } from '../../lib/dates';
import { aspectRatio, FORMAT_LABELS, STATUS_LABELS } from '../../lib/labels';
import { useBrand } from '../../lib/session';
import { contentsApi } from '../../lib/services';
import { TabHeader } from '../../ui/header';
import { Badge, Button, Empty, Icon, Segmented, Spinner, T } from '../../ui/kit';
import { colors, radius, shadow } from '../../ui/theme';
import { useToast } from '../../ui/toast';

// Mentre un contenuto si prepara, l'elenco si aggiorna da solo.
const REFRESH_MS = 5000;

type Filter = 'all' | 'draft' | 'approved';

// I contenuti del brand in due colonne: ogni card va nella colonna più corta, così le copertine restano intere in ogni proporzione.
export default function ContentsScreen() {
  const brand = useBrand();
  const toast = useToast();
  const [contents, setContents] = useState<ContentSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const brandId = useRef(brand.id);
  brandId.current = brand.id;

  const load = useCallback(
    async (quiet: boolean) => {
      const id = brand.id;
      try {
        const list = await contentsApi.list(id);
        if (brandId.current === id) setContents(list);
      } catch (error) {
        if (!quiet) toast(errorMessage(error, 'Non riesco a caricare i contenuti. Riprova tra poco.'));
        setContents((current) => current ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [brand.id, toast],
  );

  useEffect(() => setContents(null), [brand.id]);
  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  const preparing = contents?.some((content) => content.preparing) ?? false;
  useEffect(() => {
    if (!preparing) return;
    const timer = setInterval(() => void load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [preparing, load]);

  const columns = useMemo(() => {
    const shown = (contents ?? []).filter((content) => filter === 'all' || content.status === filter);
    const result: ContentSummary[][] = [[], []];
    const heights = [0, 0];
    for (const content of shown) {
      const shortest = heights[0] <= heights[1] ? 0 : 1;
      result[shortest].push(content);
      heights[shortest] += 1 / aspectRatio(content.coverAspect) + 0.55;
    }
    return result;
  }, [contents, filter]);

  const empty = columns[0].length === 0;

  return (
    <View style={{ flex: 1 }}>
      <TabHeader title="Contenuti" />
      <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        <Segmented
          options={[
            { key: 'all', label: 'Tutti' },
            { key: 'draft', label: 'Bozze' },
            { key: 'approved', label: 'Approvati' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </View>
      {contents === null ? (
        <Spinner />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), void load(false))} colors={[colors.accent]} />}
        >
          {empty ? (
            <Empty title="Ancora nessun contenuto" text="Parti da un’idea: scegli formato e canali, e l’assistente prepara testo e immagini.">
              <Button label="Vai alle idee" kind="secondary" icon="zap" onPress={() => router.navigate('/idee')} style={{ marginTop: 12 }} />
            </Empty>
          ) : (
            <View style={styles.grid}>
              {columns.map((column, index) => (
                <View key={index} style={styles.column}>
                  {column.map((content) => (
                    <ContentCard key={content.id} content={content} />
                  ))}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ContentCard({ content }: { content: ContentSummary }) {
  const cover = fileUrl(content.coverUrl);
  const channels = content.channels.map(channelName).join(', ');
  const when = content.scheduledFor;
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} onPress={() => router.push(`/contenuto/${content.id}`)}>
      <View style={[styles.cover, { aspectRatio: aspectRatio(content.coverAspect ?? '4:5') }]}>
        {cover ? (
          <>
            <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
            {content.format === 'video' ? (
              <View style={styles.play}>
                <Icon name="play" size={16} color={colors.primary} />
              </View>
            ) : null}
          </>
        ) : (
          <T variant="caption" style={{ textAlign: 'center', padding: 8 }}>
            {content.format === 'video'
              ? content.preparing
                ? 'Preparo il video…'
                : 'Video ancora da fare'
              : content.preparing
                ? 'Preparo testo e immagini…'
                : 'Senza immagine'}
          </T>
        )}
      </View>
      <View style={styles.meta}>
        <Badge label={FORMAT_LABELS[content.format]} />
        {content.preparing ? <Badge label="In preparazione" tone="accent" /> : <Badge label={STATUS_LABELS[content.status]} tone={content.status === 'approved' ? 'mint' : 'neutral'} />}
      </View>
      <T variant="strong" numberOfLines={3} style={{ fontSize: 14, lineHeight: 19 }}>
        {content.title}
      </T>
      <T variant="caption" numberOfLines={2} style={{ fontSize: 12 }}>
        {when ? `${channels} · esce ${formatWeekdayShort(when.date)}, ${when.time}` : channels}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingTop: 8 },
  grid: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  column: { flex: 1, gap: 12 },
  card: { gap: 8, padding: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, ...shadow.card },
  cover: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: radius.md, backgroundColor: colors.sunken },
  play: { position: 'absolute', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
});
