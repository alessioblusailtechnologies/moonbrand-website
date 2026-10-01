import { Link } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { currentServer, saveServer } from '../../lib/api';
import { Wordmark } from '../../ui/brand';
import { Button, Field, T } from '../../ui/kit';
import { colors, radius } from '../../ui/theme';

// La cornice di accesso e registrazione: il blu notte in alto con la luna, il modulo su un foglio avorio.
export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: { text: string; link: string; href: '/login' | '/register' };
}) {
  const [serverOpen, setServerOpen] = useState(false);
  const [server, setServer] = useState(currentServer());

  useEffect(() => setServer(currentServer()), []);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.top}>
        <Wordmark light size={22} />
        <T variant="hero" style={styles.title}>
          {title}
        </T>
        <T style={styles.subtitle}>{subtitle}</T>
      </SafeAreaView>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView style={styles.sheet} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {children}
          <View style={styles.footer}>
            <T variant="caption">{footer.text}</T>
            <Link href={footer.href} replace asChild>
              <Pressable hitSlop={8}>
                <T variant="strong" style={{ color: colors.accentStrong, fontSize: 14 }}>
                  {footer.link}
                </T>
              </Pressable>
            </Link>
          </View>
          <Pressable onPress={() => setServerOpen((open) => !open)} style={styles.serverToggle} hitSlop={6}>
            <T variant="caption">Server: {currentServer().replace(/^https?:\/\//, '')}</T>
          </Pressable>
          {serverOpen ? (
            <View style={{ gap: 10 }}>
              <Field
                label="Indirizzo del server"
                value={server}
                onChangeText={setServer}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                hint="L'API di moonbrand, per esempio http://45.14.185.228:3012"
              />
              <Button
                label="Usa questo server"
                kind="secondary"
                small
                onPress={async () => {
                  await saveServer(server);
                  setServer(currentServer());
                  setServerOpen(false);
                }}
              />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },
  top: { paddingHorizontal: 24, paddingBottom: 28, gap: 10 },
  title: { color: colors.white, marginTop: 28 },
  subtitle: { color: colors.sidebarText },
  sheet: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  form: { gap: 16, padding: 24, paddingBottom: 48 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 8 },
  serverToggle: { alignSelf: 'center', paddingTop: 12 },
});
