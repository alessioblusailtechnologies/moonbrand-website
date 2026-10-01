import { Image } from 'expo-image';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useAttachments } from '../lib/attachments';
import { Icon, IconButton, Sheet, T } from './kit';
import { colors, fonts, radius } from './theme';
import { useToast } from './toast';

export interface ComposerMessage {
  message: string;
  attachments: string[];
}

export interface ComposerHandle {
  setDraft(text: string): void;
  clear(): void;
  value(): ComposerMessage | null;
  focus(): void;
}

// La casella dell'assistente: il testo, le foto allegate (dalla galleria o dalla fotocamera) e invia o ferma.
// send=false: la casella dentro un'altra finestra, che manda da sé (Crea contenuto); empty: si può mandare anche vuota.
export const Composer = forwardRef<
  ComposerHandle,
  {
    brandId: string;
    placeholder: string;
    onSubmit?: (message: ComposerMessage) => void;
    onStop?: () => void;
    running?: boolean;
    stopping?: boolean;
    busy?: boolean;
    send?: boolean;
    empty?: boolean;
    tall?: boolean;
  }
>(function Composer({ brandId, placeholder, onSubmit, onStop, running = false, stopping = false, busy = false, send = true, empty = false, tall = false }, ref) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [choosing, setChoosing] = useState(false);
  const input = useRef<TextInput>(null);
  const attachments = useAttachments(brandId, toast);

  const value = (): ComposerMessage | null => {
    const message = text.trim();
    if (attachments.uploading) return null;
    if (!message && attachments.files.length === 0 && !empty) return null;
    return { message, attachments: attachments.files };
  };

  useImperativeHandle(ref, () => ({
    setDraft: (draft) => {
      setText(draft);
      input.current?.focus();
    },
    clear: () => {
      setText('');
      attachments.clear();
    },
    value,
    focus: () => input.current?.focus(),
  }));

  const submit = () => {
    const message = value();
    if (message && !busy && !running) onSubmit?.(message);
  };

  const ready = !!value() && !busy;

  return (
    <View style={[styles.box, tall && styles.tall]}>
      {attachments.photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {attachments.photos.map((photo) => (
            <View key={photo.key} style={styles.photo}>
              <Image source={{ uri: photo.localUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              {!photo.uploaded && !photo.failed ? (
                <View style={styles.photoVeil}>
                  <ActivityIndicator color={colors.white} size="small" />
                </View>
              ) : null}
              {photo.failed ? (
                <View style={[styles.photoVeil, { backgroundColor: 'rgba(214,69,40,0.7)' }]}>
                  <Icon name="alert-triangle" size={16} color={colors.white} />
                </View>
              ) : null}
              <Pressable style={styles.photoRemove} onPress={() => attachments.remove(photo.key)} hitSlop={8} accessibilityLabel="Togli la foto">
                <Icon name="x" size={12} color={colors.white} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <TextInput
        ref={input}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.grey500}
        multiline
        style={[styles.input, tall && { minHeight: 72 }]}
        editable={!busy}
      />
      <View style={styles.bar}>
        <IconButton name="image" label="Allega foto" onPress={() => setChoosing(true)} size={38} color={colors.body} disabled={busy} />
        <View style={{ flex: 1 }} />
        {send ? (
          running ? (
            <IconButton name={stopping ? 'loader' : 'square'} label="Ferma" solid onPress={onStop} disabled={stopping} size={40} />
          ) : (
            <IconButton name="arrow-up" label="Invia" solid onPress={submit} disabled={!ready} size={40} />
          )
        ) : null}
      </View>
      <Sheet visible={choosing} onClose={() => setChoosing(false)} title="Allega foto">
        <Pressable
          style={styles.choice}
          onPress={() => {
            setChoosing(false);
            void attachments.add('library');
          }}
        >
          <Icon name="image" />
          <T variant="ink">Dalla galleria</T>
        </Pressable>
        <Pressable
          style={styles.choice}
          onPress={() => {
            setChoosing(false);
            void attachments.add('camera');
          }}
        >
          <Icon name="camera" />
          <T variant="ink">Scatta una foto</T>
        </Pressable>
      </Sheet>
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  tall: { paddingTop: 14 },
  input: { maxHeight: 160, minHeight: 40, paddingHorizontal: 4, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.title, textAlignVertical: 'top' },
  bar: { flexDirection: 'row', alignItems: 'center' },
  photos: { gap: 8, paddingBottom: 6 },
  photo: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.grey100 },
  photoVeil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,19,36,0.45)' },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,19,36,0.75)',
  },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
});
