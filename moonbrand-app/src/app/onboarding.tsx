import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AiStep } from '@moonbrand/shared/ai/steps';
import type { BrandDraft, SectionKey } from '@moonbrand/shared/domain/brand';
import { sectionCopy, sectionError, sectionSummary } from '@moonbrand/shared/domain/sections';

import { errorMessage } from '../lib/api';
import { useSession } from '../lib/session';
import { brandsApi, followJob } from '../lib/services';
import { ChannelsEditor, IdentityEditor, KindEditor, PositioningEditor, ThemesEditor } from '../features/brand/editors';
import {
  applyInsights,
  chooseKind,
  clearState,
  readState,
  STEPS,
  withStartingThemes,
  writeState,
  type OnboardingState,
} from '../features/brand/onboarding-state';
import { Moon } from '../ui/brand';
import { Button, Card, IconButton, Spinner, T } from '../ui/kit';
import { StepList } from '../ui/steps';
import { colors, radius } from '../ui/theme';
import { useToast } from '../ui/toast';

const SUMMARY_KEYS: SectionKey[] = ['identity', 'positioning', 'channels', 'themes'];

function copyFor(state: OnboardingState): { title: string; subtitle: string } {
  const step = STEPS[state.step];
  const kind = state.draft?.identity.kind ?? 'person';
  if (step === 'kind') {
    return { title: 'Ciao, costruiamo la tua presenza', subtitle: 'Prima di generare qualsiasi cosa mi serve sapere per chi scrivo e come. Poi lavoro da solo.' };
  }
  if (step === 'summary') {
    const first = state.draft?.identity.name.trim().split(/\s+/)[0];
    return { title: kind === 'person' && first ? `Tutto pronto, ${first}` : 'Tutto pronto', subtitle: 'Ecco cosa ho capito. Controlla e creiamo il profilo.' };
  }
  const { title, subtitle } = sectionCopy(step, kind);
  return { title, subtitle };
}

// La creazione di un brand, un passo alla volta: per chi, chi è, perché pubblica, dove, di cosa parla. Poi il brand
// si crea e si aspettano i lavori che lo preparano (lo stile, le prime idee), e si apre l'assistente.
export default function Onboarding() {
  const { account, brands, upsertBrand } = useSession();
  const toast = useToast();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [creating, setCreating] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [steps, setSteps] = useState<AiStep[]>([]);
  const scroll = useRef<ScrollView>(null);
  // Chi va all'app mentre si prepara il brand non viene riportato all'assistente alla fine.
  const left = useRef(false);
  const accountId = account?.id ?? 'anon';

  useEffect(() => {
    void readState(accountId).then(setState);
  }, [accountId]);

  const update = (next: OnboardingState) => {
    setState(next);
    writeState(accountId, next);
  };

  if (!state) return <Spinner />;

  const step = STEPS[state.step];
  const draft = state.draft;
  const copy = copyFor(state);
  const error = draft && step !== 'kind' && step !== 'summary' ? sectionError(step, draft) : null;
  const patchDraft = (patch: Partial<BrandDraft>, themesEdited = state.themesEdited) => draft && update({ ...state, draft: { ...draft, ...patch }, themesEdited });

  const go = (index: number) => {
    let next: OnboardingState = { ...state, step: Math.max(0, Math.min(STEPS.length - 1, index)) };
    if (STEPS[next.step] === 'themes') next = withStartingThemes(next);
    update(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  const primary = () => {
    if (step === 'kind' && !draft) return toast('Scegli per chi costruiamo la presenza.');
    if (step === 'summary') return void create();
    if (error) return toast(error);
    go(state.step + 1);
  };

  const create = async () => {
    if (!draft || !state.brandId || creating) return;
    setCreating(true);
    let jobs: string[];
    try {
      const created = await brandsApi.create(state.brandId, draft);
      const { setupJobs, ...brand } = created;
      jobs = setupJobs;
      clearState(accountId);
      upsertBrand(brand, true);
    } catch (reason) {
      toast(errorMessage(reason, 'Non sono riuscito a creare il profilo. Riprova.'));
      setCreating(false);
      return;
    }
    // Il brand esiste già: si resta qui finché stile e prime idee sono pronti. Se un lavoro non riesce si va avanti lo stesso.
    setPreparing(true);
    const byJob = new Map<string, AiStep[]>(jobs.map((id) => [id, []]));
    const failures = await Promise.all(
      jobs.map((id) =>
        followJob(id, (current) => {
          byJob.set(id, current);
          setSteps([...byJob.values()].flat());
        }).then(
          () => false,
          () => true,
        ),
      ),
    );
    if (failures.some(Boolean)) toast('Il profilo è pronto, ma una parte della preparazione non è riuscita: la rifaccio quando serve.');
    if (!left.current) router.replace('/assistente');
  };

  if (preparing) {
    return (
      <SafeAreaView style={styles.preparing}>
        <Moon size={56} shade={colors.surface} />
        <T variant="title" style={{ textAlign: 'center' }}>
          Preparo {draft?.identity.name || 'il brand'}
        </T>
        <T variant="body" style={{ textAlign: 'center' }}>
          Studio lo stile e scrivo le prime idee. Ci vuole qualche minuto: poi si apre l’assistente.
        </T>
        <Card style={{ alignSelf: 'stretch' }}>
          <StepList steps={steps} waiting="Rileggo il brand" />
        </Card>
        <Button label="Vai all’app intanto" kind="secondary" onPress={() => ((left.current = true), router.replace('/idee'))} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={styles.top}>
        <View style={styles.progress}>
          {STEPS.slice(1).map((_, i) => (
            <View key={i} style={[styles.segment, i < state.step && styles.segmentOn]} />
          ))}
        </View>
        {brands.length > 0 ? <IconButton name="x" label="Chiudi" onPress={() => (router.canGoBack() ? router.back() : router.replace('/idee'))} /> : null}
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView ref={scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Animated.View key={step} entering={FadeInRight.duration(220)} style={{ gap: 20 }}>
            <View style={{ gap: 8 }}>
              <T variant="hero">{copy.title}</T>
              <T variant="body">{copy.subtitle}</T>
            </View>
            {step === 'kind' ? <KindEditor kind={draft?.identity.kind ?? null} onChange={(kind) => update(chooseKind(state, kind))} /> : null}
            {step === 'identity' && draft ? (
              <IdentityEditor draft={draft} onChange={(identity) => patchDraft({ identity })} insights={state.insights} onInsights={(insights) => update(applyInsights(state, insights))} />
            ) : null}
            {step === 'positioning' && draft ? <PositioningEditor draft={draft} insights={state.insights} onChange={(positioning) => patchDraft({ positioning })} /> : null}
            {step === 'channels' && draft ? <ChannelsEditor draft={draft} onChange={(channels) => patchDraft({ channels })} /> : null}
            {step === 'themes' && draft ? <ThemesEditor themes={draft.themes} onChange={(themes) => patchDraft({ themes }, true)} /> : null}
            {step === 'summary' && draft ? (
              <View style={{ gap: 10 }}>
                {SUMMARY_KEYS.map((key, index) => (
                  <Card key={key} style={{ gap: 4, padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <T variant="label" style={{ flex: 1 }}>
                        {sectionCopy(key, draft.identity.kind).name}
                      </T>
                      <Button label="Modifica" kind="ghost" small onPress={() => go(index + 1)} />
                    </View>
                    <T variant="ink">{sectionSummary(key, draft)}</T>
                  </Card>
                ))}
                <T variant="caption">Voce e identità visiva si completano dopo, dal brand: intanto scrivo con quello che so.</T>
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>
        <View style={styles.bottom}>
          {state.step > 0 ? <Button label="Indietro" kind="secondary" onPress={() => go(state.step - 1)} disabled={creating} style={{ flex: 1 }} /> : null}
          <Button
            label={step === 'kind' ? 'Iniziamo' : step === 'summary' ? (creating ? 'Creo il profilo…' : 'Crea il profilo') : 'Continua'}
            onPress={primary}
            busy={creating}
            style={{ flex: 1.6 }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, minHeight: 48 },
  progress: { flex: 1, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.grey300 },
  segmentOn: { backgroundColor: colors.accent },
  body: { padding: 20, paddingBottom: 40 },
  bottom: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  preparing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: colors.surface, borderRadius: radius.lg },
});
