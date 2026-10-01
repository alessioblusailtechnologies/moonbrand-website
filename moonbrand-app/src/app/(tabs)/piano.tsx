import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { ContentSummary, PlanResponse, SlotView } from '@moonbrand/shared/api/contract';
import { channelName } from '@moonbrand/shared/domain/catalog';
import type { Idea } from '@moonbrand/shared/domain/idea';
import { SLOT_STATUS_LABELS } from '@moonbrand/shared/domain/plan';

import { errorMessage } from '../../lib/api';
import { addDays, formatRange, formatWeekdayLong, isDay, planNow, startOfWeek } from '../../lib/dates';
import { FORMAT_LABELS, slotTitle, WEEKDAYS } from '../../lib/labels';
import { useBrand } from '../../lib/session';
import { planApi } from '../../lib/services';
import { PlanSession } from '../../features/plan/plan-session';
import { SlotSheet, type SlotDraftInput } from '../../features/plan/slot-sheet';
import { TabHeader } from '../../ui/header';
import { Badge, Button, Icon, IconButton, Segmented, Spinner, T } from '../../ui/kit';
import { colors, radius, SLOT_TONES } from '../../ui/theme';
import { useToast } from '../../ui/toast';

// Il piano a settimane: la striscia dei sette giorni in alto e sotto le uscite giorno per giorno. Toccando un giorno
// libero si aggiunge un'uscita; in «Da programmare» i contenuti senza data e le idee salvate.
export default function PlanScreen() {
  const brand = useBrand();
  const toast = useToast();
  const { giorno } = useLocalSearchParams<{ giorno?: string }>();
  const [anchor, setAnchor] = useState(planNow().date);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [panel, setPanel] = useState<'week' | 'todo'>('week');
  const [opened, setOpened] = useState<SlotView | null>(null);
  const [drafting, setDrafting] = useState<SlotDraftInput | null>(null);
  const [session, setSession] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    if (giorno && isDay(giorno)) {
      setAnchor(giorno);
      setPanel('week');
    }
  }, [giorno]);

  const from = startOfWeek(anchor);
  const to = addDays(from, 6);

  const load = useCallback(async () => {
    const current = ++request.current;
    try {
      const response = await planApi.get(brand.id, from, to);
      if (current === request.current) setPlan(response);
    } catch (error) {
      toast(errorMessage(error, 'Non riesco a leggere il piano.'));
    } finally {
      setRefreshing(false);
    }
  }, [brand.id, from, to, toast]);

  useEffect(() => setPlan(null), [brand.id]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const today = planNow().date;
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(from, i);
        return { date, number: Number(date.slice(8, 10)), today: date === today, past: date < today, slots: (plan?.slots ?? []).filter((slot) => slot.date === date) };
      }),
    [from, plan, today],
  );

  const themeName = (id: string | null) => plan?.themes.find((theme) => theme.id === id)?.name ?? null;
  const themeColor = (id: string | null) => plan?.themes.find((theme) => theme.id === id)?.color ?? null;
  const planned = plan ? plan.slots.length : 0;
  const ready = plan ? plan.slots.filter((slot) => slot.content).length : 0;
  const todo = plan ? plan.unscheduled.length + plan.ideas.length : 0;

  const add = (date: string, pick: Pick<SlotDraftInput, 'contentId' | 'ideaId'> = {}) => {
    setOpened(null);
    setDrafting({ date, ...pick });
  };

  return (
    <View style={{ flex: 1 }}>
      <TabHeader title="Piano" actions={<IconButton name="plus" label="Nuova uscita" onPress={() => add(addDays(today, 1))} />} />
      <View style={styles.controls}>
        <Segmented
          options={[
            { key: 'week', label: 'Settimana' },
            { key: 'todo', label: `Da programmare · ${todo}` },
          ]}
          value={panel}
          onChange={setPanel}
        />
      </View>

      {plan === null ? (
        <Spinner />
      ) : panel === 'week' ? (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), void load())} colors={[colors.accent]} />}
        >
          <View style={styles.weekBar}>
            <IconButton name="chevron-left" label="Settimana prima" onPress={() => setAnchor(addDays(from, -7))} />
            <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={() => setAnchor(today)}>
              <T variant="strong">{formatRange(from, to)}</T>
              <T variant="caption">{from <= today && today <= to ? 'Questa settimana' : 'Tocca per tornare a oggi'}</T>
            </Pressable>
            <IconButton name="chevron-right" label="Settimana dopo" onPress={() => setAnchor(addDays(from, 7))} />
          </View>

          <View style={styles.strip}>
            {days.map((day, i) => (
              <View key={day.date} style={[styles.stripDay, day.today && styles.stripToday]}>
                <T variant="caption" style={[{ fontSize: 11 }, day.today && { color: colors.white }]}>
                  {WEEKDAYS[i]}
                </T>
                <T variant="strong" style={[day.today && { color: colors.white }, day.past && !day.today && { color: colors.grey500 }]}>
                  {day.number}
                </T>
                <View style={styles.stripDots}>
                  {day.slots.slice(0, 3).map((slot) => (
                    <View key={slot.id} style={[styles.stripDot, { backgroundColor: SLOT_TONES[slot.status] }]} />
                  ))}
                </View>
              </View>
            ))}
          </View>

          <View style={styles.summary}>
            <T variant="caption" style={{ flex: 1 }}>
              {`${planned} ${planned === 1 ? 'uscita' : 'uscite'}, ${ready} con il contenuto · il ritmo è ${plan.postsPerWeek} a settimana`}
            </T>
          </View>
          <Button label="Pianifica le prossime settimane" kind="accent" icon="star" onPress={() => setSession(true)} />

          {days.map((day) => (
            <View key={day.date} style={styles.day}>
              <View style={styles.dayHead}>
                <T variant="strong" style={[{ flex: 1, textTransform: 'capitalize' }, day.past && { color: colors.grey500 }]}>
                  {formatWeekdayLong(day.date)}
                  {day.today ? ' · oggi' : ''}
                </T>
                {!day.past ? <IconButton name="plus" label={`Aggiungi un'uscita ${formatWeekdayLong(day.date)}`} onPress={() => add(day.date)} size={34} /> : null}
              </View>
              {day.slots.length === 0 ? (
                <T variant="caption" style={{ paddingLeft: 2 }}>
                  Nessuna uscita
                </T>
              ) : (
                day.slots.map((slot) => (
                  <SlotRow key={slot.id} slot={slot} title={slotTitle(slot, themeName)} themeColor={themeColor(slot.themeId)} onPress={() => (setDrafting(null), setOpened(slot))} />
                ))
              )}
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <T variant="label">Contenuti senza data</T>
          {plan.unscheduled.length === 0 ? <T variant="caption">Tutti i contenuti hanno un’uscita.</T> : null}
          {plan.unscheduled.map((content) => (
            <TodoRow key={content.id} icon="file-text" title={content.title} meta={todoContentMeta(content)} onPress={() => add(addDays(today, 1), { contentId: content.id })} />
          ))}
          <T variant="label" style={{ marginTop: 12 }}>
            Idee salvate
          </T>
          {plan.ideas.length === 0 ? <T variant="caption">Nessuna idea salvata fuori dal piano: salvane qualcuna dalle Idee.</T> : null}
          {plan.ideas.map((idea) => (
            <TodoRow key={idea.id} icon="zap" title={idea.title} meta={todoIdeaMeta(idea, themeName)} onPress={() => add(addDays(today, 1), { ideaId: idea.id })} />
          ))}
        </ScrollView>
      )}

      {plan ? (
        <>
          <SlotSheet
            brandId={brand.id}
            plan={plan}
            slot={opened}
            draft={drafting}
            onClose={() => {
              setOpened(null);
              setDrafting(null);
            }}
            onSaved={() => {
              setOpened(null);
              setDrafting(null);
              void load();
            }}
          />
          <PlanSession
            visible={session}
            brandId={brand.id}
            plan={plan}
            onClose={() => setSession(false)}
            onConfirmed={(count) => {
              setSession(false);
              toast(`${count} ${count === 1 ? 'uscita aggiunta' : 'uscite aggiunte'} al piano.`);
              void load();
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const todoContentMeta = (content: ContentSummary) => `${FORMAT_LABELS[content.format]} · ${content.channels.map(channelName).join(', ')}`;
const todoIdeaMeta = (idea: Idea, themeName: (id: string | null) => string | null) =>
  [themeName(idea.themeId), idea.channels.map(channelName).join(', ')].filter(Boolean).join(' · ');

function SlotRow({ slot, title, themeColor, onPress }: { slot: SlotView; title: string; themeColor: string | null; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.slot, pressed && { backgroundColor: colors.grey100 }]} onPress={onPress}>
      <View style={[styles.slotBar, { backgroundColor: SLOT_TONES[slot.status] }]} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.slotMeta}>
          <T variant="strong" style={{ fontSize: 13 }}>
            {slot.time}
          </T>
          <T variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
            {slot.channels.map(channelName).join(', ')}
          </T>
        </View>
        <T variant="ink" numberOfLines={2} style={{ fontSize: 14, lineHeight: 20 }}>
          {title}
        </T>
        <View style={styles.slotMeta}>
          <Badge label={SLOT_STATUS_LABELS[slot.status]} tone={slot.status === 'published' ? 'mint' : slot.status === 'toApprove' ? 'accent' : 'neutral'} />
          {slot.content ? <Badge label={FORMAT_LABELS[slot.content.format]} /> : null}
          {themeColor ? <View style={[styles.themeDot, { backgroundColor: themeColor }]} /> : null}
        </View>
      </View>
      <Icon name="chevron-right" size={16} color={colors.grey500} />
    </Pressable>
  );
}

function TodoRow({ icon, title, meta, onPress }: { icon: 'file-text' | 'zap'; title: string; meta: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.slot, pressed && { backgroundColor: colors.grey100 }]} onPress={onPress}>
      <Icon name={icon} size={16} color={colors.body} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="ink" numberOfLines={2} style={{ fontSize: 14, lineHeight: 20 }}>
          {title}
        </T>
        {meta ? <T variant="caption">{meta}</T> : null}
      </View>
      <Icon name="calendar" size={16} color={colors.accentStrong} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: 20, paddingBottom: 4 },
  body: { gap: 12, padding: 20, paddingTop: 12, paddingBottom: 40 },
  weekBar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  strip: { flexDirection: 'row', gap: 4 },
  stripDay: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  stripToday: { backgroundColor: colors.primary, borderColor: colors.primary },
  stripDots: { flexDirection: 'row', gap: 2, height: 6, alignItems: 'center' },
  stripDot: { width: 5, height: 5, borderRadius: 3 },
  summary: { flexDirection: 'row', alignItems: 'center' },
  day: { gap: 8, paddingTop: 8 },
  dayHead: { flexDirection: 'row', alignItems: 'center', minHeight: 34 },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  slotBar: { alignSelf: 'stretch', width: 4, borderRadius: 2 },
  slotMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  themeDot: { width: 8, height: 8, borderRadius: 4 },
});
