import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { WelcomeResponse } from '@moonbrand/shared/api/contract';

import { errorMessage } from '../../lib/api';
import { useBrand, useSession } from '../../lib/session';
import { chatApi, followJob } from '../../lib/services';
import { fallbackGreeting, pickGreeting, SUGGESTIONS, WELCOME_ICON } from '../../features/chat/greeting';
import { Composer, type ComposerHandle, type ComposerMessage } from '../../ui/composer';
import { TabHeader } from '../../ui/header';
import { Icon, IconButton, T } from '../../ui/kit';
import { colors, radius } from '../../ui/theme';
import { useToast } from '../../ui/toast';

const WELCOME_POLL_MS = 2000;

// L'assistente senza conversazione aperta: il saluto e gli spunti del giorno, e la casella per cominciare.
// Il primo messaggio apre una conversazione nuova.
export default function AssistantScreen() {
  const brand = useBrand();
  const { account } = useSession();
  const toast = useToast();
  const composer = useRef<ComposerHandle>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [welcome, setWelcome] = useState<WelcomeResponse | null>(null);
  const [sending, setSending] = useState(false);
  const load = useRef(0);
  const name = account?.name ?? '';

  // Il benvenuto si rilegge ogni volta che si torna qui; se lo sta ancora scrivendo, si aspetta il suo.
  useFocusEffect(
    useCallback(() => {
      const current = ++load.current;
      const alive = () => current === load.current;
      const show = (value: WelcomeResponse) => {
        setWelcome(value);
        setGreeting(pickGreeting(brand.id, value.greetings, name));
      };
      void (async () => {
        try {
          const value = await chatApi.welcome(brand.id);
          if (!alive()) return;
          show(value);
          if (!value.jobId) return;
          await followJob(value.jobId, undefined, { pollMs: WELCOME_POLL_MS, cancelled: () => !alive() });
          const ready = await chatApi.welcome(brand.id);
          if (alive() && ready.greetings.length > 0) show(ready);
        } catch {
          if (alive()) setGreeting((text) => text ?? fallbackGreeting(name));
        }
      })();
      return () => {
        load.current++;
      };
    }, [brand.id, name]),
  );

  const send = async ({ message, attachments }: ComposerMessage) => {
    if (sending) return;
    setSending(true);
    try {
      const created = await chatApi.start(brand.id, { message, attachments });
      composer.current?.clear();
      router.push(`/chat/${created.conversationId}`);
    } catch (error) {
      toast(errorMessage(error, 'Non riesco a mandare il messaggio. Riprova.'));
    } finally {
      setSending(false);
    }
  };

  const suggestions = welcome?.suggestions.length ? welcome.suggestions : SUGGESTIONS;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <TabHeader title="Assistente" actions={<IconButton name="clock" label="Conversazioni" onPress={() => router.push('/conversazioni')} />} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          {greeting ? (
            <Animated.View key={greeting} entering={FadeIn.duration(260)}>
              <T variant="title" style={styles.greeting}>
                {greeting}
              </T>
            </Animated.View>
          ) : (
            <View style={{ height: 34 }} />
          )}
          <T variant="body">
            Chiedimi idee, domande sul brand o un contenuto per {brand.name}, anche dalle tue foto. Quello che salvo finisce in Idee e Contenuti.
          </T>
        </View>
        <View style={styles.suggestions}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion.label}
              style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.grey100 }]}
              onPress={() => composer.current?.setDraft(suggestion.draft)}
            >
              <View style={styles.suggestionIcon}>
                <Icon name={WELCOME_ICON[suggestion.icon] ?? 'star'} size={16} color={colors.accentStrong} />
              </View>
              <T variant="ink" style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
                {suggestion.label}
              </T>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={styles.bottom}>
        <Composer ref={composer} brandId={brand.id} placeholder="Chiedi un’idea, un contenuto, un parere…" onSubmit={send} busy={sending} tall />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { gap: 20, padding: 20, paddingTop: 4 },
  intro: { gap: 8 },
  greeting: { fontSize: 24, lineHeight: 30 },
  suggestions: { gap: 10 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  suggestionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentTint },
  bottom: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 6 },
});
