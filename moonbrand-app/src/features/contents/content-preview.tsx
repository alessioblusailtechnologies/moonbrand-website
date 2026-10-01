import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChannelId } from '@moonbrand/shared/domain/brand';
import { channelName } from '@moonbrand/shared/domain/catalog';
import { cleanHashtags, FORMAT_ASPECT, HASHTAGS, postText, TEXT_LIMIT, type Content, type ContentFile } from '@moonbrand/shared/domain/content';

import { errorMessage, fileUrl } from '../../lib/api';
import { aspectRatio, FOLD } from '../../lib/labels';
import { useSession } from '../../lib/session';
import { contentsApi } from '../../lib/services';
import { BrandAvatar } from '../../ui/brand';
import { Button, Field, Icon, IconButton, Segmented, T } from '../../ui/kit';
import { colors, fonts, radius } from '../../ui/theme';
import { useToast } from '../../ui/toast';

const HASHTAG = /(#[\p{L}\p{N}_]+)/u;
const numbers = (value: number) => value.toLocaleString('it-IT');

// Il contenuto come si vede sul canale scelto: chi pubblica, il testo piegato a «…altro», le immagini (le slide si scorrono)
// o il video nella proporzione del canale; sotto il testo intero, da copiare o, se editable, da correggere a mano.
export function ContentPreview({ content, editable = false, compact = false, onUpdated }: { content: Content; editable?: boolean; compact?: boolean; onUpdated?: (content: Content) => void }) {
  const toast = useToast();
  const { activeBrand } = useSession();
  const [channel, setChannel] = useState<ChannelId | null>(content.channels[0] ?? null);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [saving, setSaving] = useState(false);

  // Il canale scelto resta finché il contenuto lo ha ancora.
  useEffect(() => {
    setChannel((current) => (current && content.channels.includes(current) ? current : (content.channels[0] ?? null)));
  }, [content.channels]);
  useEffect(() => setExpanded(false), [channel]);

  const variant = content.variants.find((item) => item.channel === channel) ?? null;
  const aspect = channel ? FORMAT_ASPECT[content.format][channel] : null;
  const files = content.visual.files ?? [];

  const images = useMemo<ContentFile[]>(() => {
    const slides = files.filter((file) => file.role === 'slide');
    if (slides.length > 0) {
      const fitting = slides.filter((file) => file.aspect === aspect);
      return fitting.length > 0 ? fitting : slides.filter((file) => file.aspect === slides[0].aspect);
    }
    const covers = files.filter((file) => file.role === 'cover');
    return [covers.find((file) => file.aspect === aspect) ?? covers[0]].filter((file): file is ContentFile => Boolean(file));
  }, [files, aspect]);

  const video = useMemo(() => {
    const videos = files.filter((file) => file.role === 'video');
    const found = videos.find((file) => file.aspect === aspect) ?? videos[0];
    if (!found) return null;
    const poster = files.find((file) => file.role === 'cover' && file.aspect === found.aspect);
    return { file: found, poster: poster?.url ?? null };
  }, [files, aspect]);

  const document = channel === 'linkedin' ? (files.find((file) => file.role === 'document') ?? null) : null;

  const counted = editing && channel ? { text: draftText.trim(), hashtags: cleanHashtags(draftTags.split(/[\s,]+/), channel) } : variant;
  const count = counted ? [...postText(counted)].length : 0;
  const limit = channel ? TEXT_LIMIT[channel] : 0;
  const maxTags = channel ? HASHTAGS[channel] : 0;

  const caption = useMemo(() => {
    if (!variant || !channel) return { parts: [] as { text: string; tag: boolean }[], folded: false };
    const full = postText(variant);
    const fold = FOLD[channel];
    const split = (text: string) => text.split(HASHTAG).map((part, index) => ({ text: part, tag: index % 2 === 1 }));
    if (expanded || fold === null || full.length <= fold + 20) return { parts: split(full), folded: false };
    const cut = full.slice(0, fold);
    return { parts: split(cut.slice(0, Math.max(cut.lastIndexOf(' '), fold / 2)).replace(/[\s.,;:!?]+$/, '')), folded: true };
  }, [variant, channel, expanded]);

  const copy = async () => {
    if (!variant) return;
    await Clipboard.setStringAsync(postText(variant));
    toast('Testo copiato.');
  };

  const startEdit = () => {
    if (!variant) return;
    setDraftText(variant.text);
    setDraftTags(variant.hashtags.join(' '));
    setEditing(true);
  };

  const saveEdit = async () => {
    const text = draftText.trim();
    if (!channel || !text || saving) return;
    setSaving(true);
    try {
      const saved = await contentsApi.saveVariant(content.id, channel, { text, hashtags: draftTags.split(/[\s,]+/).filter(Boolean) });
      setEditing(false);
      onUpdated?.(saved);
      toast(`Testo per ${channelName(channel)} salvato.`);
    } catch (error) {
      toast(errorMessage(error, 'Non sono riuscito a salvare il testo. Riprova.'));
    } finally {
      setSaving(false);
    }
  };

  const author = activeBrand ?? { name: 'Il tuo brand', logoUri: null, color: colors.primary, kind: 'company' as const };
  const handle =
    author.name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'brand';

  return (
    <View style={{ gap: 14 }}>
      {content.channels.length > 1 ? (
        <Segmented options={content.channels.map((item) => ({ key: item, label: channelName(item) }))} value={channel ?? content.channels[0]} onChange={(key) => !editing && setChannel(key)} />
      ) : null}

      <View style={styles.post}>
        <View style={styles.postHead}>
          <BrandAvatar brand={author} size={36} />
          <View style={{ flex: 1 }}>
            <T variant="strong" style={{ fontSize: 14 }}>
              {channel === 'instagram' || channel === 'tiktok' ? handle : author.name}
            </T>
            <T variant="caption" style={{ fontSize: 12 }}>
              {channel ? `${channelName(channel)} · adesso` : 'adesso'}
            </T>
          </View>
        </View>
        {channel !== 'instagram' && channel !== 'tiktok' ? <Caption parts={caption.parts} folded={caption.folded} onExpand={() => setExpanded(true)} channel={channel} /> : null}
        <Media images={images} video={video} />
        {channel === 'instagram' || channel === 'tiktok' ? (
          <Caption parts={caption.parts} folded={caption.folded} onExpand={() => setExpanded(true)} channel={channel} lead={handle} />
        ) : null}
      </View>

      {variant && !compact ? (
        <View style={styles.textPanel}>
          <View style={styles.textHead}>
            <T variant="label" style={{ flex: 1 }}>
              Testo per {channelName(variant.channel)}
            </T>
            <T variant="caption" style={count > limit ? { color: colors.danger } : undefined}>
              {numbers(count)} / {numbers(limit)}
            </T>
          </View>
          {editing ? (
            <>
              <Field value={draftText} onChangeText={setDraftText} multiline editable={!saving} style={{ minHeight: 180 }} />
              <Field value={draftTags} onChangeText={setDraftTags} placeholder="#hashtag #altro" autoCapitalize="none" editable={!saving} />
              <T variant="caption">
                Su {channelName(variant.channel)} al massimo {maxTags} hashtag.
                {count > limit ? ' Il testo supera i caratteri che il canale accetta.' : ''}
              </T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="Annulla" kind="secondary" small onPress={() => setEditing(false)} disabled={saving} style={{ flex: 1 }} />
                <Button label={saving ? 'Salvo…' : 'Salva il testo'} small onPress={saveEdit} busy={saving} disabled={!draftText.trim()} style={{ flex: 1 }} />
              </View>
            </>
          ) : (
            <>
              <T variant="ink" selectable>
                {variant.text}
              </T>
              {variant.hashtags.length > 0 ? (
                <T variant="caption" selectable style={{ color: colors.accentStrong }}>
                  {variant.hashtags.join(' ')}
                </T>
              ) : null}
              <View style={styles.tools}>
                <Button label="Copia testo" icon="copy" kind="secondary" small onPress={copy} />
                {editable ? <Button label="Modifica" icon="edit-2" kind="secondary" small onPress={startEdit} /> : null}
                {document?.url ? <Button label="PDF per LinkedIn" icon="download" kind="secondary" small onPress={() => void Linking.openURL(fileUrl(document.url)!)} /> : null}
              </View>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

function Caption({
  parts,
  folded,
  onExpand,
  channel,
  lead,
}: {
  parts: { text: string; tag: boolean }[];
  folded: boolean;
  onExpand: () => void;
  channel: ChannelId | null;
  lead?: string;
}) {
  if (parts.length === 0) return null;
  return (
    <Text style={styles.caption}>
      {lead ? <Text style={{ fontFamily: fonts.semibold }}>{lead} </Text> : null}
      {parts.map((part, index) => (part.tag ? <Text key={index} style={{ color: colors.accentStrong }}>{part.text}</Text> : part.text))}
      {folded ? (
        <Text style={{ color: colors.body }} onPress={onExpand}>
          {channel === 'facebook' ? '… Altro' : '…altro'}
        </Text>
      ) : null}
    </Text>
  );
}

// La larghezza si misura: la stessa anteprima sta a tutta pagina e dentro le card della chat.
function Media({ images, video }: { images: ContentFile[]; video: { file: ContentFile; poster: string | null } | null }) {
  const [width, setWidth] = useState(0);
  if (!video && images.length === 0) return null;
  return (
    <View style={{ alignSelf: 'stretch' }} onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}>
      {width === 0 ? null : video ? <Clip file={video.file} width={width} /> : <Slides images={images} width={width} />}
    </View>
  );
}

function Slides({ images, width }: { images: ContentFile[]; width: number }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => setIndex(0), [images]);
  const ratio = aspectRatio(images[0].aspect);
  const height = Math.min(width / ratio, width * 1.5);

  return (
    <View>
      <FlatList
        data={images}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(file) => file.file}
        onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
        style={{ width, height }}
        renderItem={({ item, index: i }) => (
          <Pressable onPress={() => setZoom(i)}>
            <Image source={{ uri: fileUrl(item.url) ?? undefined }} style={{ width, height, backgroundColor: colors.grey100 }} contentFit="cover" transition={150} />
          </Pressable>
        )}
      />
      {images.length > 1 ? (
        <>
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {index + 1} / {images.length}
            </Text>
          </View>
          <View style={styles.dots}>
            {images.map((file, i) => (
              <View key={file.file} style={[styles.dot, i === index && styles.dotOn]} />
            ))}
          </View>
        </>
      ) : null}
      <Lightbox images={images} index={zoom} onClose={() => setZoom(null)} />
    </View>
  );
}

function Clip({ file, width }: { file: ContentFile; width: number }) {
  const player = useVideoPlayer(fileUrl(file.url) ?? null, (instance) => {
    instance.loop = false;
  });
  const ratio = aspectRatio(file.aspect);
  const height = Math.min(width / ratio, width * 1.6);
  return (
    <View style={{ width, height, backgroundColor: colors.primary }}>
      <VideoView player={player} style={{ width, height }} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />
    </View>
  );
}

// Le immagini a tutto schermo, da scorrere.
export function Lightbox({ images, index, onClose }: { images: { url?: string; file: string }[]; index: number | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={index !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {index !== null ? (
          <FlatList
            data={images}
            horizontal
            pagingEnabled
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(file) => file.file}
            renderItem={({ item }) => <Image source={{ uri: fileUrl(item.url) ?? undefined }} style={{ width, height }} contentFit="contain" />}
          />
        ) : null}
        <View style={{ position: 'absolute', top: insets.top + 8, right: 12 }}>
          <IconButton name="x" label="Chiudi" onPress={onClose} color={colors.white} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  post: { gap: 12, paddingVertical: 14, paddingHorizontal: 0, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, overflow: 'hidden', alignItems: 'center' },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', paddingHorizontal: 14 },
  caption: { alignSelf: 'stretch', paddingHorizontal: 14, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.title },
  textPanel: { gap: 10, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  textHead: { flexDirection: 'row', alignItems: 'center' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  counter: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(11,19,36,0.7)' },
  counterText: { color: colors.white, fontFamily: fonts.semibold, fontSize: 11 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.grey300 },
  dotOn: { backgroundColor: colors.accent },
});
