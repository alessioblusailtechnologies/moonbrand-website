import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PlanResponse, SlotView } from '@moonbrand/shared/api/contract';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import { channelName } from '@moonbrand/shared/domain/catalog';
import { bestChannelFor, SLOT_STATUS_LABELS } from '@moonbrand/shared/domain/plan';

import { errorMessage } from '../../lib/api';
import { formatWeekdayLong, isPast, planNow } from '../../lib/dates';
import { canMove, FORMAT_LABELS, slotTitle, timeFor } from '../../lib/labels';
import { chatApi, planApi } from '../../lib/services';
import { Badge, Button, Chip, Icon, Sheet, T } from '../../ui/kit';
import { colors, radius, SLOT_TONES } from '../../ui/theme';
import { confirm, useToast } from '../../ui/toast';
import { pickDate, pickTime } from './pick-when';

// Un'uscita da creare: il giorno e, se arriva da «Da programmare», il contenuto o l'idea da metterci.
export interface SlotDraftInput {
  date: string;
  contentId?: string;
  ideaId?: string;
}

type What = { kind: 'empty' } | { kind: 'idea'; id: string } | { kind: 'content'; id: string };

// L'uscita dal basso: per crearla, spostarla, cambiarne canali, tema e idea, toglierla, o preparare il contenuto in chat.
export function SlotSheet({
  brandId,
  plan,
  slot,
  draft,
  onClose,
  onSaved,
}: {
  brandId: string;
  plan: PlanResponse;
  slot: SlotView | null;
  draft: SlotDraftInput | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const visible = slot !== null || draft !== null;
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [channels, setChannels] = useState<ChannelId[]>([]);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const [what, setWhat] = useState<What>({ kind: 'empty' });
  const [saving, setSaving] = useState(false);

  const contentOf = (choice: What) => (choice.kind === 'content' ? (plan.unscheduled.find((item) => item.id === choice.id) ?? null) : null);

  // Canali, ora e tema seguono quello che si sceglie di mettere nell'uscita.
  const fit = (choice: What, day: string) => {
    const content = contentOf(choice);
    const idea = choice.kind === 'idea' ? plan.ideas.find((item) => item.id === choice.id) : undefined;
    const best = bestChannelFor(plan.channels, day);
    const next = content ? content.channels : idea && idea.channels.length ? idea.channels.filter((c) => plan.channels.includes(c)) : best ? [best] : [];
    setChannels(next.length ? next : best ? [best] : []);
    setThemeId(idea?.themeId ?? null);
    setTime(timeFor(next.length ? next : plan.channels, day));
  };

  useEffect(() => {
    if (slot) {
      setDate(slot.date);
      setTime(slot.time);
      setChannels([...slot.channels]);
      setThemeId(slot.themeId);
      setIdeaId(slot.ideaId);
      return;
    }
    if (!draft) return;
    const choice: What = draft.contentId ? { kind: 'content', id: draft.contentId } : draft.ideaId ? { kind: 'idea', id: draft.ideaId } : { kind: 'empty' };
    setDate(draft.date);
    setWhat(choice);
    fit(choice, draft.date);
  }, [slot, draft]);

  const content = slot ? slot.content : contentOf(what);
  const locked = slot !== null && !canMove(slot);
  const themeName = (id: string | null) => plan.themes.find((theme) => theme.id === id)?.name ?? null;
  const heading = slot ? slotTitle(slot, themeName) : 'Nuova uscita';
  const valid = !!date && !!time && (content !== null || channels.length > 0) && !isPast(date, time);
  const ideas = useMemo(() => {
    const own = slot?.idea;
    const list = plan.ideas.map((idea) => ({ id: idea.id, title: idea.title }));
    return own && !list.some((idea) => idea.id === own.id) ? [own, ...list] : list;
  }, [plan.ideas, slot]);

  const chooseDate = async () => {
    const next = await pickDate(date, planNow().date);
    if (next) setDate(next);
  };
  const chooseTime = async () => {
    const next = await pickTime(date, time);
    if (next) setTime(next);
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      if (slot) {
        await planApi.update(slot.id, { date, time, ...(!slot.content && { channels, themeId, ideaId }) });
        toast('Uscita aggiornata.');
      } else {
        await planApi.create(brandId, {
          date,
          time,
          ...(what.kind === 'content' ? { contentId: what.id } : { channels, themeId }),
          ...(what.kind === 'idea' && { ideaId: what.id }),
        });
        toast('Uscita aggiunta al piano.');
      }
      onSaved();
    } catch (error) {
      toast(errorMessage(error, 'Non sono riuscito a salvare l’uscita. Riprova.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!slot) return;
    const ok = await confirm({
      title: 'Tolgo l’uscita dal piano?',
      message: slot.content ? 'Il contenuto resta tra i Contenuti, senza data.' : 'L’idea resta tra le idee salvate.',
      confirmLabel: 'Togli dal piano',
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await planApi.remove(slot.id);
      toast('Uscita tolta dal piano.');
      onSaved();
    } catch (error) {
      toast(errorMessage(error, 'Non sono riuscito a toglierla. Riprova.'));
    } finally {
      setSaving(false);
    }
  };

  // Un'uscita senza contenuto si prepara in una chat nuova che la menziona, con la sua idea.
  const prepare = async () => {
    if (!slot) return;
    setSaving(true);
    try {
      const { conversationId } = await chatApi.start(brandId, { message: 'Prepara il contenuto di questa uscita.', slotId: slot.id });
      onClose();
      router.push(`/chat/${conversationId}`);
    } catch (error) {
      toast(errorMessage(error, 'Non riesco ad aprire la chat. Riprova.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => !saving && onClose()}
      title={heading}
      footer={
        locked ? null : (
          <>
            {slot ? <Button label="Togli" kind="secondary" icon="trash-2" onPress={remove} disabled={saving} style={{ flex: 1 }} /> : null}
            <Button label={slot ? 'Salva' : 'Aggiungi al piano'} onPress={save} busy={saving} disabled={!valid} style={{ flex: 1.4 }} />
          </>
        )
      }
    >
      {slot ? (
        <View style={[styles.status, { borderLeftColor: SLOT_TONES[slot.status] }]}>
          <T variant="caption" style={{ color: colors.title }}>
            {SLOT_STATUS_LABELS[slot.status]}
          </T>
        </View>
      ) : null}

      <View style={styles.when}>
        <Pressable style={styles.whenBox} onPress={chooseDate} disabled={locked}>
          <Icon name="calendar" size={16} />
          <T variant="ink" style={{ flex: 1 }}>
            {date ? formatWeekdayLong(date) : 'Scegli il giorno'}
          </T>
        </Pressable>
        <Pressable style={[styles.whenBox, { flex: 0, minWidth: 96 }]} onPress={chooseTime} disabled={locked}>
          <Icon name="clock" size={16} />
          <T variant="ink">{time || '--:--'}</T>
        </Pressable>
      </View>
      {date && time && isPast(date, time) && !locked ? (
        <T variant="caption" style={{ color: colors.danger }}>
          Scegli un giorno e un’ora da adesso in poi.
        </T>
      ) : null}

      {!slot && (plan.unscheduled.length > 0 || plan.ideas.length > 0) ? (
        <View style={{ gap: 8 }}>
          <T variant="label">Cosa esce</T>
          <View style={styles.chips}>
            <Chip
              label="Da decidere"
              selected={what.kind === 'empty'}
              onPress={() => {
                setWhat({ kind: 'empty' });
                fit({ kind: 'empty' }, date);
              }}
            />
            {plan.unscheduled.map((item) => (
              <Chip
                key={item.id}
                icon="file-text"
                label={item.title}
                selected={what.kind === 'content' && what.id === item.id}
                onPress={() => {
                  const choice: What = { kind: 'content', id: item.id };
                  setWhat(choice);
                  fit(choice, date);
                }}
              />
            ))}
            {plan.ideas.map((idea) => (
              <Chip
                key={idea.id}
                icon="zap"
                label={idea.title}
                selected={what.kind === 'idea' && what.id === idea.id}
                onPress={() => {
                  const choice: What = { kind: 'idea', id: idea.id };
                  setWhat(choice);
                  fit(choice, date);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      {content ? (
        <Pressable style={styles.content} onPress={() => (onClose(), router.push(`/contenuto/${content.id}`))}>
          <View style={{ flex: 1, gap: 4 }}>
            <Badge label={FORMAT_LABELS[content.format]} />
            <T variant="strong">{content.title}</T>
            <T variant="caption">{content.channels.map(channelName).join(', ')}</T>
          </View>
          <Icon name="chevron-right" color={colors.body} />
        </Pressable>
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <T variant="label">Canali</T>
            <View style={styles.chips}>
              {plan.channels.map((channel) => (
                <Chip
                  key={channel}
                  label={channelName(channel)}
                  selected={channels.includes(channel)}
                  disabled={locked}
                  onPress={() => setChannels((list) => (list.includes(channel) ? list.filter((item) => item !== channel) : [...list, channel]))}
                />
              ))}
            </View>
          </View>
          {plan.themes.length > 0 ? (
            <View style={{ gap: 8 }}>
              <T variant="label">Tema</T>
              <View style={styles.chips}>
                <Chip label="Nessuno" selected={themeId === null} disabled={locked} onPress={() => setThemeId(null)} />
                {plan.themes.map((theme) => (
                  <Chip key={theme.id} label={theme.name} color={theme.color} selected={themeId === theme.id} disabled={locked} onPress={() => setThemeId(theme.id)} />
                ))}
              </View>
            </View>
          ) : null}
          {slot && ideas.length > 0 ? (
            <View style={{ gap: 8 }}>
              <T variant="label">Idea</T>
              <View style={styles.chips}>
                <Chip label="Nessuna" selected={ideaId === null} disabled={locked} onPress={() => setIdeaId(null)} />
                {ideas.map((idea) => (
                  <Chip key={idea.id} icon="zap" label={idea.title} selected={ideaId === idea.id} disabled={locked} onPress={() => setIdeaId(idea.id)} />
                ))}
              </View>
            </View>
          ) : null}
          {slot && !locked ? <Button label="Prepara in chat" icon="message-circle" kind="accent" onPress={prepare} disabled={saving} /> : null}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  status: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderLeftWidth: 3, borderRadius: 4, backgroundColor: colors.sunken },
  when: { flexDirection: 'row', gap: 8 },
  whenBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
});
