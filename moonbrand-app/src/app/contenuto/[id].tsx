import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AiStep } from '@moonbrand/shared/ai/steps';
import type { SlotView } from '@moonbrand/shared/api/contract';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import { channelName } from '@moonbrand/shared/domain/catalog';
import { hasScript, hasVideo, supportsFormat, type Content } from '@moonbrand/shared/domain/content';

import { errorMessage } from '../../lib/api';
import { FORMAT_LABELS, FORMAT_NAMES, SOURCE_LABELS, STATUS_LABELS } from '../../lib/labels';
import { useBrand } from '../../lib/session';
import { contentsApi, followJob, StoppedJobError } from '../../lib/services';
import { ContentPreview } from '../../features/contents/content-preview';
import { ContentSchedule } from '../../features/contents/content-schedule';
import { BackHeader } from '../../ui/header';
import { Badge, Button, Card, Chip, IconButton, Spinner, T } from '../../ui/kit';
import { StepList } from '../../ui/steps';
import { colors, fonts, radius } from '../../ui/theme';
import { confirm, useToast } from '../../ui/toast';

// Cosa sta facendo il lavoro in corso: preparare il contenuto (o il copione di un video), ritoccarlo, fare il video,
// scrivere per un canale aggiunto.
type Work = 'prepare' | 'edit' | 'video' | 'channel';

const FAILED: Record<Work, string> = {
  prepare: 'Non sono riuscito a preparare il contenuto. Riprova.',
  edit: 'Non sono riuscito a ritoccare il contenuto. Riprova.',
  video: 'Non sono riuscito a fare il video. Riprova.',
  channel: 'Non sono riuscito ad aggiungere il canale. Riprova.',
};

export default function ContentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useBrand();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState<Content | null>(null);
  const [slot, setSlot] = useState<SlotView | null>(null);
  const [brandChannels, setBrandChannels] = useState<ChannelId[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [work, setWork] = useState<Work>('prepare');
  const [steps, setSteps] = useState<AiStep[]>([]);
  const [instruction, setInstruction] = useState('');
  const [adding, setAdding] = useState<ChannelId | null>(null);
  const [changing, setChanging] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const follow = useCallback(
    async (jobId: string, next: Work, channel: ChannelId | null = null) => {
      setPreparing(true);
      setWork(next);
      setSteps([]);
      try {
        await followJob(jobId, setSteps, { cancelled: () => !alive.current });
        const response = await contentsApi.get(id);
        if (!alive.current) return;
        setContent(response.content);
        setSlot(response.slot);
        if (next === 'edit') setInstruction('');
        if (next === 'channel' && channel) toast(`${channelName(channel)} aggiunto.`);
      } catch (error) {
        if (!(error instanceof StoppedJobError)) toast(errorMessage(error, FAILED[next]));
      } finally {
        if (alive.current) {
          setPreparing(false);
          setAdding(null);
        }
      }
    },
    [id, toast],
  );

  useEffect(() => {
    void (async () => {
      try {
        const response = await contentsApi.get(id);
        setContent(response.content);
        setSlot(response.slot);
        setBrandChannels(response.brandChannels);
        if (response.jobId) void follow(response.jobId, response.content.format === 'video' && hasScript(response.content) ? 'video' : 'prepare');
      } catch (error) {
        toast(errorMessage(error, 'Non trovo questo contenuto.'));
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, follow, toast]);

  useEffect(() => {
    if (content && content.brandId !== brand.id) router.replace('/contenuti');
  }, [brand.id, content]);

  if (loading || !content) {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader title="Contenuto" />
        <Spinner />
      </View>
    );
  }

  const video = content.format === 'video';
  const ready = content.variants.length > 0;
  const scripted = hasScript(content);
  const scriptOnly = video && scripted && !hasVideo(content);
  const addable =
    content.conversationId && !scriptOnly ? [] : brandChannels.filter((channel) => !content.channels.includes(channel) && supportsFormat(content.format, channel));
  const unsupported = brandChannels.filter((channel) => !supportsFormat(content.format, channel)).map(channelName);
  const workLabel =
    work === 'channel' && adding
      ? `Scrivo per ${channelName(adding)} e preparo ${video ? 'il video' : 'le immagini'} nella sua proporzione`
      : work === 'video'
        ? 'Preparo il video: immagini, clip, musica e voce. Ci vuole qualche minuto'
        : work === 'edit'
          ? video && !ready
            ? 'Ritocco il copione'
            : 'Ritocco il contenuto'
          : video
            ? 'Scrivo il copione del video'
            : 'Preparo testo e immagini';

  const toggleApproved = async () => {
    try {
      const updated = await contentsApi.setApproved(content.id, content.status !== 'approved');
      setContent(updated);
      if (slot) setSlot((await contentsApi.get(content.id)).slot);
      toast(updated.status === 'approved' ? 'Contenuto approvato.' : 'Contenuto riaperto.');
    } catch (error) {
      toast(errorMessage(error, 'Non sono riuscito a cambiare lo stato. Riprova.'));
    }
  };

  const send = async () => {
    const text = instruction.trim();
    if (!text || preparing) return;
    try {
      const { jobId } = await contentsApi.edit(content.id, text);
      void follow(jobId, 'edit');
    } catch (error) {
      toast(errorMessage(error, 'Non riesco a chiedere il ritocco. Riprova.'));
    }
  };

  const regenerate = async () => {
    const ok = await confirm({
      title: 'Rigenero il contenuto da zero?',
      message: video
        ? 'Riscrivo il copione partendo dall’idea: il copione e il video fatti finora si perdono e il contenuto torna bozza.'
        : 'Riscrivo testi e immagini partendo dall’idea: i ritocchi fatti finora si perdono e il contenuto torna bozza.',
      confirmLabel: 'Rigenera',
      danger: true,
    });
    if (!ok) return;
    try {
      const { jobId } = await contentsApi.regenerate(content.id);
      void follow(jobId, 'prepare');
    } catch (error) {
      toast(errorMessage(error, 'Non riesco a rigenerare il contenuto. Riprova.'));
    }
  };

  const generateVideo = async () => {
    try {
      const { jobId } = await contentsApi.generateVideo(content.id);
      void follow(jobId, 'video');
    } catch (error) {
      toast(errorMessage(error, 'Non riesco a far partire il video. Riprova.'));
    }
  };

  const addChannel = async (channel: ChannelId) => {
    if (preparing || changing) return;
    setChanging(true);
    try {
      const response = await contentsApi.addChannel(content.id, channel);
      setContent(response.content);
      if (response.jobId) {
        setAdding(channel);
        void follow(response.jobId, 'channel', channel);
      } else {
        toast(`${channelName(channel)} aggiunto.`);
      }
    } catch (error) {
      toast(errorMessage(error, `Non riesco ad aggiungere ${channelName(channel)}. Riprova.`));
    } finally {
      setChanging(false);
    }
  };

  const removeChannel = async (channel: ChannelId) => {
    if (preparing || changing || content.channels.length < 2) return;
    const ok = await confirm({
      title: `Tolgo ${channelName(channel)}?`,
      message: `Il testo per ${channelName(channel)} e le immagini fatte solo per questo canale si perdono.`,
      confirmLabel: 'Togli il canale',
      danger: true,
    });
    if (!ok) return;
    setChanging(true);
    try {
      setContent(await contentsApi.removeChannel(content.id, channel));
    } catch (error) {
      toast(errorMessage(error, `Non riesco a togliere ${channelName(channel)}. Riprova.`));
    } finally {
      setChanging(false);
    }
  };

  const usable = (ready || scripted) && !preparing;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <BackHeader
        title={content.title}
        subtitle={`${FORMAT_LABELS[content.format]} · ${STATUS_LABELS[content.status]}`}
        actions={!content.conversationId && usable ? <IconButton name="refresh-cw" label="Rigenera da zero" onPress={regenerate} /> : null}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.meta}>
          <Badge label={FORMAT_LABELS[content.format]} />
          <Badge label={STATUS_LABELS[content.status]} tone={content.status === 'approved' ? 'mint' : 'neutral'} />
        </View>
        <T variant="title">{content.title}</T>

        {usable ? (
          <Button
            label={content.status === 'approved' ? 'Riapri' : 'Approva'}
            icon={content.status === 'approved' ? 'rotate-ccw' : 'check'}
            kind={content.status === 'approved' ? 'secondary' : 'primary'}
            onPress={toggleApproved}
          />
        ) : null}

        {usable ? (
          <View style={{ gap: 8 }}>
            <T variant="label">Esce su</T>
            <View style={styles.chips}>
              {content.channels.map((channel) => (
                <Chip
                  key={channel}
                  label={channelName(channel)}
                  selected
                  icon={content.channels.length > 1 ? 'x' : undefined}
                  disabled={changing}
                  onPress={content.channels.length > 1 ? () => void removeChannel(channel) : undefined}
                />
              ))}
              {addable.map((channel) => (
                <Chip key={channel} label={channelName(channel)} icon="plus" disabled={changing} onPress={() => void addChannel(channel)} />
              ))}
            </View>
            {unsupported.length > 0 ? <T variant="caption">{`Su ${unsupported.join(' e ')} ${FORMAT_NAMES[content.format]} non c’è.`}</T> : null}
          </View>
        ) : null}

        {usable ? <ContentSchedule content={content} slot={slot} onChange={setSlot} /> : null}

        {preparing ? (
          <Card>
            <T variant="strong">{workLabel}</T>
            <StepList steps={steps} waiting="Rileggo l’idea e il brand" />
          </Card>
        ) : null}

        {ready ? <ContentPreview content={content} editable={!preparing} onUpdated={setContent} /> : null}

        {scripted ? (
          <Card>
            <T variant="label">Copione</T>
            {content.visual.script ? <T variant="ink">{content.visual.script}</T> : null}
            {content.visual.scenes.map((scene, index) => (
              <View key={index} style={styles.scene}>
                <View style={styles.sceneHead}>
                  <T variant="strong" style={{ fontSize: 13 }}>
                    {index + 1}. {scene.seconds}s
                  </T>
                  <Badge label={SOURCE_LABELS[scene.source] ?? scene.source} />
                </View>
                <T variant="ink" style={{ fontSize: 14, lineHeight: 20 }}>
                  {scene.shot}
                </T>
                {scene.onScreen ? <T variant="caption">A schermo: {scene.onScreen}</T> : null}
                {scene.voice ? <T variant="caption">Voce: {scene.voice}</T> : null}
              </View>
            ))}
            {!content.conversationId ? (
              <Button label={hasVideo(content) ? 'Rifai il video dal copione' : 'Fai il video'} icon="film" onPress={generateVideo} disabled={preparing} />
            ) : null}
          </Card>
        ) : null}

        {ready || scripted ? (
          content.conversationId ? (
            <Button label="Ritocca nella conversazione" kind="secondary" icon="message-circle" onPress={() => router.push(`/chat/${content.conversationId}`)} />
          ) : null
        ) : null}
      </ScrollView>
      {(ready || scripted) && !content.conversationId ? (
        <View style={[styles.edit, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            style={styles.editInput}
            value={instruction}
            onChangeText={setInstruction}
            editable={!preparing}
            placeholder={ready ? 'Cosa cambio? es. più corto su Instagram' : 'Cosa cambio nel copione? es. più breve'}
            placeholderTextColor={colors.grey500}
            multiline
          />
          <IconButton name="arrow-up" label="Invia il ritocco" solid onPress={send} disabled={preparing || !instruction.trim()} />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, padding: 20, paddingBottom: 40 },
  meta: { flexDirection: 'row', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scene: { gap: 4, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sceneHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  edit: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  editInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.title,
  },
});
