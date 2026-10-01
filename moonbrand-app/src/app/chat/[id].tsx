import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AiStep } from '@moonbrand/shared/ai/steps';
import type { ChatAttachment, ConversationSummary, ConversationTurn } from '@moonbrand/shared/api/contract';
import { channelName } from '@moonbrand/shared/domain/catalog';
import type { Content } from '@moonbrand/shared/domain/content';

import { errorMessage, fileUrl } from '../../lib/api';
import { formatWeekdayShort } from '../../lib/dates';
import { FORMAT_LABELS, STATUS_LABELS } from '../../lib/labels';
import { useBrand } from '../../lib/session';
import { chatApi, followJob } from '../../lib/services';
import { ContentPreview, Lightbox } from '../../features/contents/content-preview';
import { Composer, type ComposerHandle, type ComposerMessage } from '../../ui/composer';
import { BackHeader } from '../../ui/header';
import { Badge, Button, Icon, IconButton, Spinner, T } from '../../ui/kit';
import { Markdown } from '../../ui/markdown';
import { StepBlock } from '../../ui/steps';
import { colors, radius } from '../../ui/theme';
import { confirm, useToast } from '../../ui/toast';

// Nella risposta di un turno i testi di Claude si leggono, i tool di fila si raccolgono in un blocco solo.
type Block = { kind: 'text'; id: string; text: string; streaming: boolean } | { kind: 'tools'; id: string; steps: AiStep[] };

// Mentre risponde si legge più spesso: il testo arriva a pezzi.
const LIVE_POLL_MS = 600;

const isActive = (turn: ConversationTurn) => turn.job.status === 'queued' || turn.job.status === 'running';

function blocksOf(steps: AiStep[]): Block[] {
  const blocks: Block[] = [];
  let after = 'start';
  for (const step of steps) {
    if (step.kind === 'text') {
      blocks.push({ kind: 'text', id: step.id, text: step.label, streaming: step.status === 'running' });
      after = step.id;
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.kind === 'tools') last.steps.push(step);
    else blocks.push({ kind: 'tools', id: `tools-${after}`, steps: [step] });
  }
  return blocks;
}

// I tool che salvano o aggiornano un contenuto, già conclusi: a ognuno nuovo si rileggono i contenuti.
function savesOf(steps: AiStep[]): number {
  return steps.filter((step) => step.kind === 'tool' && /contenuto_(salva|aggiorna)$/.test(step.tool ?? step.label) && step.status === 'done').length;
}

// Una conversazione con l'assistente: i messaggi, le risposte con i passaggi e i contenuti salvati nel turno.
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useBrand();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const composer = useRef<ComposerHandle>(null);
  const list = useRef<FlatList>(null);
  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [zoom, setZoom] = useState<{ photos: { url: string; file: string }[]; index: number } | null>(null);
  const live = useRef<string | null>(null);
  const alive = useRef(true);
  // Il filo segue la risposta finché chi legge sta in fondo.
  const stick = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const response = await chatApi.get(id);
    if (!alive.current) return response;
    setConversation(response.conversation);
    setTurns(response.turns);
    setContents(response.contents);
    return response;
  }, [id]);

  const follow = useCallback(
    async (jobId: string, known: AiStep[]) => {
      if (live.current === jobId) return;
      live.current = jobId;
      let saved = savesOf(known);
      const update = (steps: AiStep[]) => {
        if (live.current !== jobId) return;
        const now = savesOf(steps);
        if (now > saved) {
          saved = now;
          void chatApi.get(id).then((response) => alive.current && setContents(response.contents), () => undefined);
        }
        setTurns((current) => current.map((turn) => (turn.job.id === jobId ? { ...turn, job: { ...turn.job, status: 'running', steps } } : turn)));
      };
      try {
        await followJob(jobId, update, { pollMs: LIVE_POLL_MS, cancelled: () => !alive.current });
      } catch {
        // L'errore o lo stop del turno si vedono nel filo, dopo la rilettura.
      }
      if (live.current !== jobId || !alive.current) return;
      await refresh().catch(() => undefined);
      live.current = null;
      setStopping(false);
    },
    [id, refresh],
  );

  useEffect(() => {
    void (async () => {
      try {
        const response = await refresh();
        const active = response.turns.find(isActive);
        if (active) void follow(active.job.id, active.job.steps);
      } catch (error) {
        toast(errorMessage(error, 'Non trovo questa conversazione.'));
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh, follow, toast]);

  // Cambiando brand la conversazione non è più di quello attivo.
  useEffect(() => {
    if (conversation && conversation.brandId !== brand.id) router.replace('/assistente');
  }, [brand.id, conversation]);

  const running = turns.some(isActive);

  const send = async ({ message, attachments }: ComposerMessage) => {
    if (sending || running) return;
    setSending(true);
    try {
      const created = await chatApi.send(id, { message, attachments });
      composer.current?.clear();
      stick.current = true;
      const response = await refresh();
      const turn = response.turns.find((item) => item.job.id === created.jobId);
      void follow(created.jobId, turn?.job.steps ?? []);
    } catch (error) {
      toast(errorMessage(error, 'Non riesco a mandare il messaggio. Riprova.'));
    } finally {
      setSending(false);
    }
  };

  const stop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await chatApi.stop(id);
    } catch (error) {
      setStopping(false);
      toast(errorMessage(error, 'Non riesco a fermarlo. Riprova.'));
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Elimino la conversazione?',
      message: 'I contenuti e le idee salvati restano nelle loro sezioni.',
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      await chatApi.remove(id);
      router.back();
    } catch (error) {
      toast(errorMessage(error, 'Non sono riuscito a eliminarla. Riprova.'));
    }
  };

  // Ogni contenuto sta nella risposta del turno in cui è nato: l'ultimo turno partito prima che venisse creato.
  const view = useMemo(
    () =>
      turns.map((turn, index) => {
        const next = turns[index + 1]?.createdAt;
        return {
          turn,
          blocks: blocksOf(turn.job.steps),
          contents: contents.filter((content) => content.createdAt >= turn.createdAt && (!next || content.createdAt < next)),
        };
      }),
    [turns, contents],
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior="padding">
      <BackHeader
        title={conversation?.title ?? 'Assistente'}
        subtitle={brand.name}
        actions={<IconButton name="trash-2" label="Elimina la conversazione" onPress={remove} disabled={running || !conversation} />}
      />
      {loading ? (
        <Spinner />
      ) : (
        <FlatList
          ref={list}
          data={view}
          keyExtractor={(item) => item.turn.id}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => stick.current && list.current?.scrollToEnd({ animated: true })}
          onScroll={({ nativeEvent }) => {
            stick.current = nativeEvent.contentSize.height - nativeEvent.contentOffset.y - nativeEvent.layoutMeasurement.height < 120;
          }}
          scrollEventThrottle={100}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Turn
              turn={item.turn}
              blocks={item.blocks}
              contents={item.contents}
              onPhoto={(index) =>
                setZoom({ photos: item.turn.attachments.filter((photo: ChatAttachment) => !photo.poster).map((photo: ChatAttachment) => ({ url: photo.url, file: photo.file })), index })
              }
            />
          )}
        />
      )}
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Composer
          ref={composer}
          brandId={brand.id}
          placeholder="Rispondi all’assistente…"
          onSubmit={send}
          onStop={stop}
          running={running}
          stopping={stopping}
          busy={sending}
        />
      </View>
      <Lightbox images={zoom?.photos ?? []} index={zoom?.index ?? null} onClose={() => setZoom(null)} />
    </KeyboardAvoidingView>
  );
}

function Turn({ turn, blocks, contents, onPhoto }: { turn: ConversationTurn; blocks: Block[]; contents: Content[]; onPhoto: (index: number) => void }) {
  const active = isActive(turn);
  const last = blocks[blocks.length - 1];
  const waiting = active && (!last || (last.kind === 'text' && !last.streaming));
  const photos = turn.attachments.filter((photo) => !photo.poster);
  return (
    <View style={styles.turn}>
      {turn.attachments.length > 0 ? (
        <View style={styles.photos}>
          {turn.attachments.map((photo) => {
            const index = photos.indexOf(photo);
            return (
              <Pressable key={photo.file} onPress={() => index >= 0 && onPhoto(index)} style={styles.photo}>
                <Image source={{ uri: fileUrl(photo.poster ?? photo.url) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
                {photo.poster ? (
                  <View style={styles.play}>
                    <Icon name="play" size={16} color={colors.white} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {turn.message ? (
        <View style={styles.mine}>
          <T variant="ink" style={{ color: colors.white }} selectable>
            {turn.message}
          </T>
        </View>
      ) : null}
      {turn.slot ? (
        <Pressable style={styles.mention} onPress={() => router.push({ pathname: '/piano', params: { giorno: turn.slot!.date } })}>
          <Icon name="calendar" size={15} color={colors.body} />
          <View style={{ flex: 1 }}>
            <T variant="label">Uscita del piano</T>
            <T variant="ink" numberOfLines={1} style={{ fontSize: 14 }}>
              {`${formatWeekdayShort(turn.slot.date)} · ${turn.slot.time} · ${turn.slot.channels.map(channelName).join(', ')}`}
            </T>
          </View>
        </Pressable>
      ) : null}
      {turn.idea ? (
        <View style={styles.mention}>
          <Icon name="zap" size={15} color={colors.body} />
          <View style={{ flex: 1 }}>
            <T variant="label">Idea</T>
            <T variant="ink" numberOfLines={2} style={{ fontSize: 14 }}>
              {turn.idea.title}
            </T>
          </View>
        </View>
      ) : null}
      <View style={styles.reply}>
        {blocks.map((block, index) =>
          block.kind === 'text' ? (
            <Markdown key={block.id} text={block.text} />
          ) : (
            <StepBlock key={block.id} steps={block.steps} live={active && index === blocks.length - 1} />
          ),
        )}
        {contents.map((content) => (
          <View key={content.id} style={styles.contentCard}>
            <View style={styles.contentHead}>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Badge label={FORMAT_LABELS[content.format]} />
                  <Badge label={STATUS_LABELS[content.status]} tone={content.status === 'approved' ? 'mint' : 'neutral'} />
                </View>
                <T variant="strong">{content.title}</T>
              </View>
            </View>
            <ContentPreview content={content} compact />
            <Button label="Apri in Contenuti" kind="secondary" small icon="arrow-right" onPress={() => router.push(`/contenuto/${content.id}`)} />
          </View>
        ))}
        {waiting ? (
          <View style={styles.thinking}>
            <ActivityIndicator size="small" color={colors.accent} />
            <T variant="caption">Ci penso</T>
          </View>
        ) : turn.job.status === 'stopped' ? (
          <T variant="caption">Fermato.</T>
        ) : turn.job.status === 'failed' ? (
          <T variant="caption" style={{ color: colors.danger }}>
            Non sono riuscito a finire: {turn.job.error || 'errore sconosciuto'}
          </T>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  thread: { gap: 28, padding: 16, paddingBottom: 24 },
  turn: { gap: 12 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
  photo: { width: 84, height: 84, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.grey100 },
  play: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,19,36,0.35)' },
  mine: { alignSelf: 'flex-end', maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderBottomRightRadius: 6, backgroundColor: colors.primary },
  mention: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '86%',
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  reply: { gap: 12 },
  contentCard: { gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  contentHead: { flexDirection: 'row', gap: 8 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bottom: { paddingHorizontal: 12, paddingTop: 6, backgroundColor: colors.surface },
});
