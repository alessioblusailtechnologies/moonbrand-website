import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { AiStep } from '@moonbrand/shared/ai/steps';
import type { IdeasResponse } from '@moonbrand/shared/api/contract';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import type { Idea, IdeaStatus } from '@moonbrand/shared/domain/idea';

import { errorMessage } from '../../lib/api';
import { formatWeekdayLong } from '../../lib/dates';
import { useBrand } from '../../lib/session';
import { followJob, ideasApi, planApi, StoppedJobError } from '../../lib/services';
import { CreateContentSheet } from '../../features/ideas/create-content-sheet';
import { signalLabel, SwipeDeck, type Decision, type SwipeDeckHandle } from '../../features/ideas/swipe-deck';
import { TabHeader } from '../../ui/header';
import { Badge, Button, Card, Chip, Empty, Icon, IconButton, Segmented, Sheet, Spinner, T } from '../../ui/kit';
import { StepList } from '../../ui/steps';
import { colors, radius } from '../../ui/theme';
import { useToast } from '../../ui/toast';

type View_ = 'new' | 'saved';

// Le idee del brand: le proposte si decidono con lo swipe (destra salva, sinistra scarta), le salvate si mettono nel piano
// o diventano un contenuto in chat. «Proponi altre idee» chiede al worker un nuovo giro, che tiene conto delle scelte.
export default function IdeasScreen() {
  const brand = useBrand();
  const toast = useToast();
  const deck = useRef<SwipeDeckHandle>(null);
  const [view, setView] = useState<View_>('new');
  const [themeId, setThemeId] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [themes, setThemes] = useState<IdeasResponse['themes']>([]);
  const [channels, setChannels] = useState<ChannelId[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [steps, setSteps] = useState<AiStep[]>([]);
  const [opened, setOpened] = useState<Idea | null>(null);
  const [creatingFrom, setCreatingFrom] = useState<Idea | null>(null);
  const [planning, setPlanning] = useState<string | null>(null);
  const [last, setLast] = useState<{ idea: Idea; previous: IdeaStatus } | null>(null);
  const following = useRef<string | null>(null);
  const brandId = brand.id;
  const current = useRef(brandId);
  current.current = brandId;

  const follow = useCallback(
    async (jobId: string) => {
      if (following.current === jobId) return;
      following.current = jobId;
      setPreparing(true);
      setSteps([]);
      try {
        await followJob(jobId, setSteps, { cancelled: () => current.current !== brandId });
        const response = await ideasApi.list(brandId);
        if (current.current !== brandId) return;
        setIdeas(response.ideas);
        setView('new');
      } catch (error) {
        if (!(error instanceof StoppedJobError)) toast(errorMessage(error, 'Non sono riuscito a preparare le idee. Riprova.'));
      } finally {
        if (following.current === jobId) {
          following.current = null;
          setPreparing(false);
        }
      }
    },
    [brandId, toast],
  );

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const response = await ideasApi.list(brandId);
        if (current.current !== brandId) return;
        setIdeas(response.ideas);
        setThemes(response.themes);
        setChannels(response.channels);
        if (response.jobId) void follow(response.jobId);
      } catch (error) {
        toast(errorMessage(error, 'Non riesco a caricare le idee. Riprova tra poco.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [brandId, follow, toast],
  );

  useEffect(() => {
    setThemeId(null);
    setLast(null);
    void load();
  }, [load]);

  // Tornando sulla scheda si rilegge in silenzio: le idee salvate in chat compaiono qui.
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) void load(true);
      focused.current = true;
    }, [load]),
  );

  const more = async () => {
    if (preparing) return;
    try {
      const { id } = await ideasApi.generate(brandId);
      void follow(id);
    } catch (error) {
      toast(errorMessage(error, 'Non riesco a chiedere nuove idee. Riprova.'));
    }
  };

  // La scelta si vede subito; se il server non la prende, l'idea torna com'era.
  const decide = useCallback(
    async (idea: Idea, status: IdeaStatus, undoable = true) => {
      const previous = idea.status;
      setIdeas((list) => list.map((item) => (item.id === idea.id ? { ...item, status } : item)));
      if (undoable) {
        setLast({ idea: { ...idea, status }, previous });
        toast(status === 'saved' ? 'Idea salvata.' : status === 'discarded' ? 'Idea scartata.' : 'Idea rimessa tra le proposte.', {
          label: 'Annulla',
          run: () => void decide({ ...idea, status }, previous, false),
        });
      } else {
        setLast(null);
      }
      try {
        const updated = await ideasApi.setStatus(idea.id, status);
        setIdeas((list) => list.map((item) => (item.id === updated.id ? updated : item)));
      } catch (error) {
        setIdeas((list) => list.map((item) => (item.id === idea.id ? { ...item, status: previous } : item)));
        toast(errorMessage(error, 'Non sono riuscito a salvare la scelta. Riprova.'));
      }
    },
    [toast],
  );

  const undo = () => {
    if (!last) return;
    void decide(last.idea, last.previous, false);
  };

  const addToPlan = async (idea: Idea) => {
    if (planning) return;
    setPlanning(idea.id);
    try {
      const slot = await planApi.addIdea(brandId, idea.id);
      toast(`Nel piano: ${formatWeekdayLong(slot.date)} alle ${slot.time}.`);
    } catch (error) {
      toast(errorMessage(error, 'Non sono riuscito ad aggiungerla al piano. Riprova.'));
    } finally {
      setPlanning(null);
    }
  };

  const counts = useMemo(
    () => ({ new: ideas.filter((idea) => idea.status === 'new').length, saved: ideas.filter((idea) => idea.status === 'saved').length }),
    [ideas],
  );
  const visible = useMemo(() => ideas.filter((idea) => idea.status === view && (!themeId || idea.themeId === themeId)), [ideas, view, themeId]);
  const theme = (idea: Idea) => themes.find((item) => item.id === idea.themeId) ?? null;

  return (
    <View style={{ flex: 1 }}>
      <TabHeader
        title="Idee"
        actions={<IconButton name={preparing ? 'loader' : 'zap'} label="Proponi altre idee" onPress={more} disabled={preparing} />}
      />
      <View style={styles.controls}>
        <Segmented
          options={[
            { key: 'new', label: `Proposte · ${counts.new}` },
            { key: 'saved', label: `Salvate · ${counts.saved}` },
          ]}
          value={view}
          onChange={setView}
        />
        {themes.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <Chip label="Tutti i temi" selected={!themeId} onPress={() => setThemeId(null)} />
            {themes.map((item) => (
              <Chip key={item.id} label={item.name} color={item.color} selected={themeId === item.id} onPress={() => setThemeId(item.id)} />
            ))}
          </ScrollView>
        ) : null}
      </View>

      {preparing ? (
        <Card style={styles.preparing}>
          <T variant="strong">{ideas.length > 0 ? 'Preparo altre idee' : 'Preparo le prime idee dal tuo brand'}</T>
          <StepList steps={steps} waiting="Rileggo il brand" />
        </Card>
      ) : null}

      {loading ? (
        <Spinner />
      ) : view === 'new' ? (
        visible.length === 0 ? (
          preparing ? null : (
            <Empty
              title={themeId ? 'Nessuna proposta su questo tema' : 'Hai visto tutte le proposte'}
              text="Chiedine altre: tengo conto di quelle che hai salvato e scartato."
            >
              <Button label="Proponi altre idee" icon="zap" onPress={more} style={{ marginTop: 12 }} />
            </Empty>
          )
        ) : (
          <>
            <SwipeDeck
              ref={deck}
              ideas={visible}
              themes={themes}
              onDecide={(idea, decision: Decision) => void decide(idea, decision)}
              onOpen={setOpened}
              onCreate={setCreatingFrom}
            />
            <View style={styles.actions}>
              <RoundButton icon="x" label="Scarta" tone={colors.danger} onPress={() => deck.current?.swipe('discarded')} />
              <RoundButton icon="rotate-ccw" label="Annulla l’ultima scelta" tone={colors.body} small onPress={undo} disabled={!last} />
              <RoundButton icon="bookmark" label="Salva" tone={colors.success} onPress={() => deck.current?.swipe('saved')} />
            </View>
          </>
        )
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(idea) => idea.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), void load(true))} colors={[colors.accent]} />}
          ListEmptyComponent={
            <Empty
              title={themeId ? 'Nessuna idea salvata su questo tema' : 'Nessuna idea salvata'}
              text="Salva le proposte che ti convincono: le ritrovi qui."
            />
          }
          renderItem={({ item }) => (
            <Card>
              <Pressable onPress={() => setOpened(item)} style={{ gap: 8 }}>
                <View style={styles.meta}>
                  <Badge label={signalLabel(item)} />
                  {theme(item) ? (
                    <View style={styles.theme}>
                      <View style={[styles.dot, { backgroundColor: theme(item)!.color }]} />
                      <T variant="caption" numberOfLines={1}>
                        {theme(item)!.name}
                      </T>
                    </View>
                  ) : null}
                </View>
                <T variant="heading">{item.title}</T>
                <T variant="body" numberOfLines={3}>
                  {item.angle}
                </T>
              </Pressable>
              <View style={styles.cardActions}>
                <Button label="Crea contenuto" small onPress={() => setCreatingFrom(item)} style={{ flex: 1 }} />
                <Button
                  label={planning === item.id ? 'Aggiungo…' : 'Nel piano'}
                  kind="secondary"
                  small
                  icon="calendar"
                  busy={planning === item.id}
                  onPress={() => void addToPlan(item)}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          )}
        />
      )}

      <IdeaSheet
        idea={opened}
        theme={opened ? theme(opened) : null}
        onClose={() => setOpened(null)}
        onDecide={(idea, status) => {
          setOpened(null);
          void decide(idea, status);
        }}
        onCreate={(idea) => {
          setOpened(null);
          setCreatingFrom(idea);
        }}
        onPlan={(idea) => {
          setOpened(null);
          void addToPlan(idea);
        }}
      />
      <CreateContentSheet idea={creatingFrom} brandId={brandId} channels={channels} onClose={() => setCreatingFrom(null)} />
    </View>
  );
}

function RoundButton({
  icon,
  label,
  tone,
  onPress,
  small = false,
  disabled = false,
}: {
  icon: 'x' | 'bookmark' | 'rotate-ccw';
  label: string;
  tone: string;
  onPress: () => void;
  small?: boolean;
  disabled?: boolean;
}) {
  const size = small ? 48 : 64;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.round,
        { width: size, height: size, borderRadius: size / 2, borderColor: tone },
        pressed && { backgroundColor: colors.grey100 },
        disabled && { opacity: 0.35 },
      ]}
    >
      <Icon name={icon} size={small ? 20 : 28} color={tone} />
    </Pressable>
  );
}

// L'idea intera, con tutte le azioni.
function IdeaSheet({
  idea,
  theme,
  onClose,
  onDecide,
  onCreate,
  onPlan,
}: {
  idea: Idea | null;
  theme: IdeasResponse['themes'][number] | null;
  onClose: () => void;
  onDecide: (idea: Idea, status: IdeaStatus) => void;
  onCreate: (idea: Idea) => void;
  onPlan: (idea: Idea) => void;
}) {
  return (
    <Sheet visible={idea !== null} onClose={onClose}>
      {idea ? (
        <>
          <View style={styles.meta}>
            <Badge label={signalLabel(idea)} tone="accent" />
            {theme ? (
              <View style={styles.theme}>
                <View style={[styles.dot, { backgroundColor: theme.color }]} />
                <T variant="caption">{theme.name}</T>
              </View>
            ) : null}
          </View>
          <View style={{ gap: 6 }}>
            {idea.angleLabel ? <T variant="label">{idea.angleLabel}</T> : null}
            <T variant="title">{idea.title}</T>
          </View>
          <T variant="body">{idea.angle}</T>
          <View style={styles.why}>
            <T variant="label">Perché adesso</T>
            <T variant="ink">{idea.rationale}</T>
          </View>
          {idea.signal.sourceUrl ? (
            <Pressable onPress={() => void Linking.openURL(idea.signal.sourceUrl!)} style={styles.source}>
              <Icon name="external-link" size={15} color={colors.accentStrong} />
              <T variant="strong" style={{ color: colors.accentStrong, fontSize: 14 }}>
                Apri la fonte
              </T>
            </Pressable>
          ) : null}
          <Button label="Crea contenuto" icon="edit-3" onPress={() => onCreate(idea)} />
          {idea.status === 'new' ? (
            <View style={styles.cardActions}>
              <Button label="Scarta" kind="secondary" icon="x" onPress={() => onDecide(idea, 'discarded')} style={{ flex: 1 }} />
              <Button label="Salva" kind="secondary" icon="bookmark" onPress={() => onDecide(idea, 'saved')} style={{ flex: 1 }} />
            </View>
          ) : (
            <View style={styles.cardActions}>
              <Button label="Tra le proposte" kind="secondary" icon="corner-up-left" onPress={() => onDecide(idea, 'new')} style={{ flex: 1 }} />
              <Button label="Nel piano" kind="secondary" icon="calendar" onPress={() => onPlan(idea)} style={{ flex: 1 }} />
            </View>
          )}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  controls: { gap: 12, paddingHorizontal: 20, paddingBottom: 4 },
  filters: { gap: 8, paddingRight: 20 },
  preparing: { marginHorizontal: 20, marginTop: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, paddingBottom: 16 },
  round: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, backgroundColor: colors.white },
  list: { gap: 12, padding: 20, paddingTop: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  theme: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cardActions: { flexDirection: 'row', gap: 8 },
  why: { gap: 6, padding: 14, borderRadius: radius.md, backgroundColor: colors.grey100 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
