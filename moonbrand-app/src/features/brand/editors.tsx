import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { AiStep, WebsiteInsights } from '@moonbrand/shared/ai/steps';
import type { BrandDraft, BrandKind, Identity, Positioning, Theme } from '@moonbrand/shared/domain/brand';
import { AUDIENCES, CHANNELS, GOALS, KIND_OPTIONS } from '@moonbrand/shared/domain/catalog';
import { addTheme, MAX_THEMES, removeTheme, setThemeLevel, THEME_LEVELS, themeLevel } from '@moonbrand/shared/domain/themes';
import { normalizeSite } from '@moonbrand/shared/lib/site';

import { readWebsite } from '../../lib/services';
import { Badge, Button, Card, Chip, Field, Icon, IconButton, Segmented, T } from '../../ui/kit';
import { StepList } from '../../ui/steps';
import { colors, fonts, radius } from '../../ui/theme';
import { useToast } from '../../ui/toast';

// Le sezioni del brand, come i passi dell'onboarding dello studio: le usano sia l'onboarding sia la modifica del brand.

export function KindEditor({ kind, onChange }: { kind: BrandKind | null; onChange: (kind: BrandKind) => void }) {
  return (
    <View style={{ gap: 10 }}>
      {KIND_OPTIONS.map((option) => {
        const on = option.kind === kind;
        return (
          <Pressable key={option.kind} onPress={() => onChange(option.kind)} style={[styles.option, on && styles.optionOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="strong">{option.title}</T>
              <T variant="caption">{option.meta}</T>
            </View>
            <View style={[styles.radio, on && styles.radioOn]} />
          </Pressable>
        );
      })}
    </View>
  );
}

type TextField = 'name' | 'role' | 'company' | 'sector';

const FIELDS: Record<BrandKind, { key: TextField; label: string; placeholder: string }[]> = {
  person: [
    { key: 'name', label: 'Nome e cognome', placeholder: 'Marco Sereni' },
    { key: 'role', label: 'Ruolo', placeholder: 'Founder' },
    { key: 'company', label: 'Azienda', placeholder: 'Nodo' },
  ],
  company: [
    { key: 'name', label: 'Nome dell’azienda', placeholder: 'Forno Rinaldi' },
    { key: 'sector', label: 'Settore', placeholder: 'Panificio artigianale' },
  ],
  client: [
    { key: 'name', label: 'Nome del cliente', placeholder: 'Studio Verdi' },
    { key: 'sector', label: 'Settore', placeholder: 'Architettura d’interni' },
  ],
};

const PITCH: Record<BrandKind, { label: string; placeholder: string }> = {
  person: { label: 'In una frase, cosa fai', placeholder: 'Es. metto l’AI nei processi noiosi delle PMI italiane' },
  company: { label: 'In una frase, cosa fate', placeholder: 'Es. pane a lievitazione naturale con grani del territorio' },
  client: { label: 'In una frase, cosa fa il cliente', placeholder: 'Es. progetta case piccole che sembrano grandi' },
};

const SITE_PLACEHOLDER: Record<BrandKind, string> = { person: 'nodo.it', company: 'fornorinaldi.it', client: 'studioverdi.it' };

export function IdentityEditor({
  draft,
  onChange,
  insights,
  onInsights,
}: {
  draft: BrandDraft;
  onChange: (identity: Identity) => void;
  insights?: WebsiteInsights | null;
  onInsights?: (insights: WebsiteInsights) => void;
}) {
  const toast = useToast();
  const [reading, setReading] = useState(false);
  const [steps, setSteps] = useState<AiStep[]>([]);
  const identity = draft.identity;
  const site = normalizeSite(identity.site);
  const alreadyRead = insights?.site === site;
  const canRead = !!onInsights && site.includes('.') && !alreadyRead;
  const update = (key: keyof Identity, text: string) => onChange({ ...identity, [key]: text });

  const read = async () => {
    if (reading || !onInsights) return;
    setReading(true);
    setSteps([]);
    try {
      const result = await readWebsite(identity.site, setSteps);
      onInsights(result);
      toast('Ho letto il sito: temi, pubblico e palette sono già proposti nei prossimi passi.');
    } catch {
      toast('Non riesco a leggere il sito. Riprova tra poco.');
    } finally {
      setReading(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <T variant="label">Sito</T>
        <View style={styles.siteRow}>
          <TextInput
            value={identity.site}
            onChangeText={(text) => update('site', text)}
            placeholder={SITE_PLACEHOLDER[identity.kind]}
            placeholderTextColor={colors.grey500}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.input, { flex: 1 }]}
          />
          {canRead ? <Button label={reading ? 'Leggo…' : 'Leggi'} kind="secondary" small onPress={read} busy={reading} /> : null}
        </View>
      </View>
      {reading ? (
        <Card>
          <T variant="strong">Sto leggendo {site}</T>
          <StepList steps={steps} waiting="Mi collego al sito" />
        </Card>
      ) : alreadyRead && insights?.summary ? (
        <Card>
          <Badge label="Sito letto" tone="mint" />
          <T variant="ink">{insights.summary}</T>
        </Card>
      ) : null}
      {FIELDS[identity.kind].map((field) => (
        <Field key={field.key} label={field.label} value={identity[field.key]} onChangeText={(text) => update(field.key, text)} placeholder={field.placeholder} />
      ))}
      <Field
        label={PITCH[identity.kind].label}
        value={identity.pitch}
        onChangeText={(text) => update('pitch', text)}
        placeholder={reading ? 'La scrivo io appena finisco di leggere il sito…' : PITCH[identity.kind].placeholder}
        multiline
        hint={insights?.pitch && identity.pitch === insights.pitch ? 'L’ho scritta leggendo il sito: cambiala come vuoi.' : undefined}
      />
    </View>
  );
}

const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item]);
const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const GOAL_LABEL: Record<BrandKind, string> = { person: 'Perché pubblichi', company: 'Perché pubblicate', client: 'Perché pubblica' };
const AUDIENCE_LABEL: Record<BrandKind, string> = { person: 'Chi vuoi raggiungere', company: 'Chi volete raggiungere', client: 'Chi vuole raggiungere' };

function frequencyNote(perWeek: number): string {
  if (perWeek <= 2) return 'Ritmo leggero: una sessione di piano ogni tre settimane';
  if (perWeek <= 4) return 'Ritmo consigliato: una sessione di piano ogni due settimane';
  return 'Ritmo alto: serve una sessione di piano a settimana';
}

export function PositioningEditor({ draft, onChange, insights }: { draft: BrandDraft; onChange: (positioning: Positioning) => void; insights?: WebsiteInsights | null }) {
  const [custom, setCustom] = useState('');
  const { kind } = draft.identity;
  const value = draft.positioning;
  const goals = unique([...(insights?.goals ?? []), ...GOALS[kind], ...value.goals]);
  const audiences = unique([...(insights?.audiences ?? []), ...AUDIENCES[kind], ...value.audiences]);
  const set = (patch: Partial<Positioning>) => onChange({ ...value, ...patch });

  const addAudience = () => {
    const text = custom.trim();
    if (!text) return;
    set({ audiences: unique([...value.audiences, text]) });
    setCustom('');
  };

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 8 }}>
        <T variant="label">{GOAL_LABEL[kind]}</T>
        <View style={styles.chips}>
          {goals.map((goal) => (
            <Chip key={goal} label={goal} selected={value.goals.includes(goal)} onPress={() => set({ goals: toggle(value.goals, goal) })} />
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <T variant="label">{AUDIENCE_LABEL[kind]}</T>
        <View style={styles.chips}>
          {audiences.map((audience) => (
            <Chip key={audience} label={audience} selected={value.audiences.includes(audience)} onPress={() => set({ audiences: toggle(value.audiences, audience) })} />
          ))}
        </View>
        <View style={styles.siteRow}>
          <TextInput
            value={custom}
            onChangeText={setCustom}
            placeholder="Aggiungi un pubblico, es. Responsabili acquisti"
            placeholderTextColor={colors.grey500}
            style={[styles.input, { flex: 1 }]}
            onSubmitEditing={addAudience}
          />
          <IconButton name="plus" label="Aggiungi il pubblico" onPress={addAudience} disabled={!custom.trim()} />
        </View>
      </View>
      <Card>
        <T variant="label">Quanto vuoi pubblicare</T>
        <View style={styles.stepper}>
          <IconButton name="minus" label="Meno uscite" onPress={() => set({ postsPerWeek: Math.max(1, value.postsPerWeek - 1) })} disabled={value.postsPerWeek <= 1} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <T variant="title">{value.postsPerWeek}</T>
            <T variant="caption">{value.postsPerWeek === 1 ? 'uscita a settimana' : 'uscite a settimana'}</T>
          </View>
          <IconButton name="plus" label="Più uscite" onPress={() => set({ postsPerWeek: Math.min(7, value.postsPerWeek + 1) })} disabled={value.postsPerWeek >= 7} />
        </View>
        <T variant="caption">{frequencyNote(value.postsPerWeek)}</T>
      </Card>
    </View>
  );
}

export function ChannelsEditor({ draft, onChange }: { draft: BrandDraft; onChange: (channels: BrandDraft['channels']) => void }) {
  return (
    <View style={{ gap: 10 }}>
      {CHANNELS.map(({ id, name }) => {
        const state = draft.channels[id];
        return (
          <Pressable
            key={id}
            onPress={() => onChange({ ...draft.channels, [id]: { ...state, selected: !state.selected } })}
            style={[styles.option, state.selected && styles.optionOn]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: state.selected }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="strong">{name}</T>
              <T variant="caption">{state.handle ? `Collegato come ${state.handle}` : 'Da collegare più avanti, per pubblicare al posto tuo'}</T>
            </View>
            <View style={[styles.check, state.selected && styles.checkOn]}>{state.selected ? <Icon name="check" size={14} color={colors.white} /> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ThemesEditor({ themes, onChange }: { themes: Theme[]; onChange: (themes: Theme[]) => void }) {
  return (
    <View style={{ gap: 12 }}>
      {themes.map((theme, index) => (
        <Card key={theme.id} style={{ gap: 10, padding: 14 }}>
          <View style={styles.themeHead}>
            <View style={[styles.dot, { backgroundColor: theme.color }]} />
            <TextInput
              value={theme.name}
              onChangeText={(name) => onChange(themes.map((item, i) => (i === index ? { ...item, name } : item)))}
              placeholder="Nome del tema"
              placeholderTextColor={colors.grey500}
              style={styles.themeName}
            />
            <IconButton name="trash-2" label={`Togli ${theme.name || 'il tema'}`} onPress={() => onChange(removeTheme(themes, index))} size={34} color={colors.body} />
          </View>
          <Segmented
            options={THEME_LEVELS.map((level) => ({ key: level.value, label: level.label }))}
            value={themeLevel(theme)}
            onChange={(level) => onChange(setThemeLevel(themes, index, level))}
          />
          <T variant="caption">{theme.weight}% delle uscite</T>
        </Card>
      ))}
      {themes.length < MAX_THEMES ? <Button label="Aggiungi un tema" kind="secondary" icon="plus" onPress={() => onChange(addTheme(themes))} /> : <T variant="caption">Al massimo {MAX_THEMES} temi.</T>}
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  optionOn: { borderColor: colors.primary, borderWidth: 1.5 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.grey300 },
  radioOn: { borderColor: colors.primary, borderWidth: 6 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.grey300, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.sunken,
    color: colors.title,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  themeHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  themeName: { flex: 1, minHeight: 40, fontFamily: fonts.semibold, fontSize: 15, color: colors.title, paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
