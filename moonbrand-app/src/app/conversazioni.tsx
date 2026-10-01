import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';

import type { ConversationSummary } from '@moonbrand/shared/api/contract';

import { errorMessage } from '../lib/api';
import { addDays, planNow } from '../lib/dates';
import { useBrand } from '../lib/session';
import { chatApi } from '../lib/services';
import { BackHeader } from '../ui/header';
import { Empty, Field, Icon, IconButton, Spinner, T } from '../ui/kit';
import { colors, radius } from '../ui/theme';
import { useToast } from '../ui/toast';

// Il giorno di una conversazione, a Roma: oggi, ieri, questa settimana, prima.
function groupOf(updatedAt: string): string {
  const day = planNow(new Date(updatedAt)).date;
  const today = planNow().date;
  if (day === today) return 'Oggi';
  if (day === addDays(today, -1)) return 'Ieri';
  if (day > addDays(today, -7)) return 'Ultimi 7 giorni';
  if (day > addDays(today, -30)) return 'Ultimi 30 giorni';
  return 'Prima';
}

// Tutte le conversazioni del brand, divise per giorno, con la ricerca nei titoli.
export default function ConversationsScreen() {
  const brand = useBrand();
  const toast = useToast();
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await chatApi.list(brand.id));
    } catch (error) {
      toast(errorMessage(error, 'Non riesco a leggere le conversazioni.'));
      setList((current) => current ?? []);
    } finally {
      setRefreshing(false);
    }
  }, [brand.id, toast]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const sections = useMemo(() => {
    const words = query.trim().toLowerCase();
    const found = (list ?? []).filter((item) => !words || item.title.toLowerCase().includes(words));
    const groups = new Map<string, ConversationSummary[]>();
    for (const item of found) groups.set(groupOf(item.updatedAt), [...(groups.get(groupOf(item.updatedAt)) ?? []), item]);
    return [...groups.entries()].map(([title, data]) => ({ title, data }));
  }, [list, query]);

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="Conversazioni" subtitle={brand.name} actions={<IconButton name="plus" label="Nuova chat" onPress={() => router.navigate('/assistente')} />} />
      {list === null ? (
        <Spinner />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), void load())} colors={[colors.accent]} />}
          ListHeaderComponent={<Field value={query} onChangeText={setQuery} placeholder="Cerca tra le conversazioni" autoCorrect={false} />}
          ListEmptyComponent={<Empty title={query ? 'Nessuna conversazione trovata' : 'Ancora nessuna conversazione'} text="Scrivi all’assistente: le conversazioni restano qui." />}
          renderSectionHeader={({ section }) => (
            <T variant="label" style={styles.section}>
              {section.title}
            </T>
          )}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.grey100 }]} onPress={() => router.push(`/chat/${item.id}`)}>
              <Icon name="message-circle" size={16} color={colors.body} />
              <T variant="ink" numberOfLines={1} style={{ flex: 1 }}>
                {item.title}
              </T>
              {item.busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Icon name="chevron-right" size={16} color={colors.grey500} />}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6, padding: 16 },
  section: { marginTop: 14, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
});
