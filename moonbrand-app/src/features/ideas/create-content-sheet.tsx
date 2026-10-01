import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ChannelId } from '@moonbrand/shared/domain/brand';
import { channelName } from '@moonbrand/shared/domain/catalog';
import { supportsFormat, type ContentFormat } from '@moonbrand/shared/domain/content';
import type { Idea } from '@moonbrand/shared/domain/idea';

import { errorMessage } from '../../lib/api';
import { FORMAT_NAMES, FORMAT_OPTIONS, FORMAT_REQUEST, listNames } from '../../lib/labels';
import { chatApi } from '../../lib/services';
import { Composer, type ComposerHandle } from '../../ui/composer';
import { Button, Chip, Sheet, T } from '../../ui/kit';
import { colors, radius } from '../../ui/theme';
import { useToast } from '../../ui/toast';

// Crea il contenuto da un'idea: formato, canali e quello che si aggiunge. Nasce in una conversazione nuova con l'assistente,
// che menziona l'idea: il messaggio è lo stesso che scrive lo studio.
export function CreateContentSheet({
  idea,
  brandId,
  channels,
  onClose,
}: {
  idea: Idea | null;
  brandId: string;
  channels: ChannelId[];
  onClose: () => void;
}) {
  const toast = useToast();
  const composer = useRef<ComposerHandle>(null);
  const [format, setFormat] = useState<ContentFormat>('post');
  const [selected, setSelected] = useState<ChannelId[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!idea) return;
    setFormat('post');
    setSelected(channels.filter((channel) => supportsFormat('post', channel)));
  }, [idea, channels]);

  const choose = (next: ContentFormat) => {
    setFormat(next);
    setSelected(channels.filter((channel) => supportsFormat(next, channel)));
  };

  const unsupported = channels.filter((channel) => !supportsFormat(format, channel)).map(channelName);

  const create = async () => {
    const note = composer.current?.value();
    if (!idea || busy || selected.length === 0) return;
    if (!note) {
      toast('Aspetta che le foto finiscano di caricarsi.');
      return;
    }
    setBusy(true);
    try {
      const ask = `Crea ${FORMAT_REQUEST[format]} per ${listNames(selected.map(channelName))} da questa idea.`;
      const extra = note.message.charAt(0).toUpperCase() + note.message.slice(1);
      const message = extra ? `${ask} ${extra}` : ask;
      const { conversationId } = await chatApi.start(brandId, { message, attachments: note.attachments, ideaId: idea.id });
      onClose();
      router.push(`/chat/${conversationId}`);
    } catch (error) {
      toast(errorMessage(error, 'Non sono riuscito ad aprire la chat. Riprova.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={idea !== null}
      onClose={() => !busy && onClose()}
      title="Crea il contenuto"
      footer={
        <>
          <Button label="Annulla" kind="secondary" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
          <Button label={busy ? 'Apro la chat…' : 'Crea in chat'} onPress={create} busy={busy} disabled={selected.length === 0} style={{ flex: 1.4 }} />
        </>
      }
    >
      <View style={{ gap: 4 }}>
        <T variant="ink">{idea?.title}</T>
        <T variant="caption">Si apre una conversazione nuova con l’assistente, che parte da questa idea.</T>
      </View>

      <View style={{ gap: 8 }}>
        <T variant="label">Formato</T>
        <View style={styles.formats}>
          {FORMAT_OPTIONS.map((option) => {
            const on = option.id === format;
            return (
              <Pressable key={option.id} onPress={() => choose(option.id)} style={[styles.format, on && styles.formatOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="strong" style={{ fontSize: 14 }}>
                    {option.label}
                  </T>
                  <T variant="caption">{option.hint}</T>
                </View>
                <View style={[styles.radio, on && styles.radioOn]} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <T variant="label">Canali</T>
        <View style={styles.chips}>
          {channels.map((channel) => (
            <Chip
              key={channel}
              label={channelName(channel)}
              selected={selected.includes(channel)}
              disabled={!supportsFormat(format, channel)}
              onPress={() => setSelected((list) => (list.includes(channel) ? list.filter((item) => item !== channel) : [...list, channel]))}
            />
          ))}
        </View>
        {unsupported.length > 0 ? <T variant="caption">{`Su ${unsupported.join(' e ')} ${FORMAT_NAMES[format]} non c’è.`}</T> : null}
      </View>

      <View style={{ gap: 8 }}>
        <T variant="label">Aggiungi all’idea</T>
        <Composer
          ref={composer}
          brandId={brandId}
          placeholder="Indicazioni, dettagli, cosa evitare… e le tue foto, se vuoi (facoltativo)"
          send={false}
          empty
          tall
          busy={busy}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  formats: { gap: 8 },
  format: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  formatOn: { borderColor: colors.primary },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.grey300 },
  radioOn: { borderColor: colors.primary, borderWidth: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
