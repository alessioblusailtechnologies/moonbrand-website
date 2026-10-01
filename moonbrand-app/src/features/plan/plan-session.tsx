import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PlanResponse } from '@moonbrand/shared/api/contract';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import { channelName } from '@moonbrand/shared/domain/catalog';
import { balanceHint, themeBalance, type SlotDraft } from '@moonbrand/shared/domain/plan';

import { errorMessage } from '../../lib/api';
import { addDays, formatWeekdayShort, planNow, startOfWeek } from '../../lib/dates';
import { planApi } from '../../lib/services';
import { Button, Chip, IconButton, Segmented, Sheet, Spinner, T } from '../../ui/kit';
import { colors, radius } from '../../ui/theme';
import { useToast } from '../../ui/toast';

type Start = 'tomorrow' | 'nextWeek';

// La sessione di piano: da quando, per quante settimane, quante uscite e su quali canali. La proposta arriva dall'API
// (lo scheletro con i temi e le idee salvate) e si conferma tutta insieme.
export function PlanSession({
  visible,
  brandId,
  plan,
  onClose,
  onConfirmed,
}: {
  visible: boolean;
  brandId: string;
  plan: PlanResponse;
  onClose: () => void;
  onConfirmed: (count: number) => void;
}) {
  const toast = useToast();
  const [start, setStart] = useState<Start>('tomorrow');
  const [weeks, setWeeks] = useState(2);
  const [perWeek, setPerWeek] = useState(3);
  const [channels, setChannels] = useState<ChannelId[]>([]);
  const [drafts, setDrafts] = useState<SlotDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPerWeek(Math.max(1, Math.min(7, plan.postsPerWeek || 3)));
    setChannels([...plan.channels]);
  }, [visible]);

  const today = planNow().date;
  const startDate = start === 'tomorrow' ? addDays(today, 1) : addDays(startOfWeek(today), 7);

  useEffect(() => {
    if (!visible) return;
    if (channels.length === 0) {
      setDrafts([]);
      return;
    }
    let current = true;
    setLoading(true);
    planApi
      .propose(brandId, { startDate, weeks, perWeek, channels })
      .then(({ drafts: next }) => current && setDrafts(next))
      .catch((error) => current && toast(errorMessage(error, 'Non riesco a preparare la proposta.')))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [visible, brandId, startDate, weeks, perWeek, channels, toast]);

  const confirm = async () => {
    if (drafts.length === 0 || saving) return;
    setSaving(true);
    try {
      const created = await planApi.confirm(brandId, drafts);
      onConfirmed(created.length);
    } catch (error) {
      toast(errorMessage(error, 'Non sono riuscito a salvare il piano. Riprova.'));
    } finally {
      setSaving(false);
    }
  };

  const theme = (id: string | null) => plan.themes.find((item) => item.id === id) ?? null;
  const idea = (id: string | null) => plan.ideas.find((item) => item.id === id)?.title ?? null;
  const hint = drafts.length > 0 ? balanceHint(themeBalance(plan.themes, drafts)) : null;

  return (
    <Sheet
      visible={visible}
      onClose={() => !saving && onClose()}
      title="Pianifica le prossime settimane"
      footer={
        <Button
          label={saving ? 'Salvo…' : drafts.length > 0 ? `Aggiungi ${drafts.length} ${drafts.length === 1 ? 'uscita' : 'uscite'}` : 'Nessuna uscita da aggiungere'}
          onPress={confirm}
          busy={saving}
          disabled={drafts.length === 0 || loading}
          style={{ flex: 1 }}
        />
      }
    >
      <View style={{ gap: 8 }}>
        <T variant="label">Da quando</T>
        <Segmented
          options={[
            { key: 'tomorrow', label: 'Da domani' },
            { key: 'nextWeek', label: 'Da lunedì prossimo' },
          ]}
          value={start}
          onChange={setStart}
        />
      </View>
      <View style={{ gap: 8 }}>
        <T variant="label">Per quanto</T>
        <Segmented
          options={[1, 2, 4].map((value) => ({ key: String(value), label: value === 1 ? '1 settimana' : `${value} settimane` }))}
          value={String(weeks)}
          onChange={(key) => setWeeks(Number(key))}
        />
      </View>
      <View style={styles.stepper}>
        <T variant="label" style={{ flex: 1 }}>
          Uscite a settimana
        </T>
        <IconButton name="minus" label="Meno uscite" onPress={() => setPerWeek((value) => Math.max(1, value - 1))} disabled={perWeek <= 1} />
        <T variant="heading" style={{ minWidth: 24, textAlign: 'center' }}>
          {perWeek}
        </T>
        <IconButton name="plus" label="Più uscite" onPress={() => setPerWeek((value) => Math.min(7, value + 1))} disabled={perWeek >= 7} />
      </View>
      <View style={{ gap: 8 }}>
        <T variant="label">Canali</T>
        <View style={styles.chips}>
          {plan.channels.map((channel) => (
            <Chip
              key={channel}
              label={channelName(channel)}
              selected={channels.includes(channel)}
              onPress={() => setChannels((list) => (list.includes(channel) ? list.filter((item) => item !== channel) : [...list, channel]))}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <T variant="label">La proposta</T>
        {hint ? <T variant="caption">{hint}</T> : null}
        {loading ? (
          <Spinner />
        ) : drafts.length === 0 ? (
          <T variant="caption">{channels.length === 0 ? 'Scegli almeno un canale.' : 'I giorni di questo periodo hanno già un’uscita.'}</T>
        ) : (
          drafts.map((draft) => {
            const item = theme(draft.themeId);
            return (
              <View key={`${draft.date}-${draft.time}`} style={styles.draft}>
                <View style={[styles.bar, { backgroundColor: item?.color ?? colors.grey300 }]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="strong" style={{ fontSize: 14 }}>
                    {formatWeekdayShort(draft.date)} · {draft.time} · {draft.channels.map(channelName).join(', ')}
                  </T>
                  <T variant="caption" numberOfLines={2}>
                    {idea(draft.ideaId) ?? (item ? `Serve un contenuto su «${item.name}»` : 'Da riempire')}
                  </T>
                </View>
              </View>
            );
          })
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  draft: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  bar: { width: 4, borderRadius: 2 },
});
