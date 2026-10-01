import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SlotView } from '@moonbrand/shared/api/contract';
import { SLOT_STATUS_LABELS } from '@moonbrand/shared/domain/plan';
import type { Content } from '@moonbrand/shared/domain/content';

import { errorMessage } from '../../lib/api';
import { addDays, formatWeekdayLong, isPast, planNow } from '../../lib/dates';
import { timeFor } from '../../lib/labels';
import { contentsApi } from '../../lib/services';
import { Button, Icon, T } from '../../ui/kit';
import { colors, radius, SLOT_TONES } from '../../ui/theme';
import { confirm, useToast } from '../../ui/toast';
import { pickDate, pickTime } from '../plan/pick-when';

// Quando esce il contenuto: la sua uscita nel piano, da spostare o togliere, oppure giorno e ora per programmarlo.
export function ContentSchedule({ content, slot, onChange }: { content: Content; slot: SlotView | null; onChange: (slot: SlotView | null) => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const schedule = async () => {
    const today = planNow().date;
    const date = await pickDate(slot?.date ?? addDays(today, 1), today);
    if (!date) return;
    const time = await pickTime(date, slot?.date === date ? slot.time : timeFor(content.channels, date));
    if (!time) return;
    if (isPast(date, time)) {
      toast('Scegli un giorno e un’ora da adesso in poi.');
      return;
    }
    setSaving(true);
    try {
      const saved = await contentsApi.schedule(content.id, date, time);
      onChange(saved);
      toast(`Esce ${formatWeekdayLong(saved.date)} alle ${saved.time}.`);
    } catch (error) {
      toast(errorMessage(error, 'Non sono riuscito a programmarlo. Riprova.'));
    } finally {
      setSaving(false);
    }
  };

  const unschedule = async () => {
    const ok = await confirm({
      title: 'Tolgo il contenuto dal piano?',
      message: 'Resta tra i Contenuti, senza data: puoi programmarlo di nuovo quando vuoi.',
      confirmLabel: 'Togli dal piano',
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await contentsApi.unschedule(content.id);
      onChange(null);
    } catch (error) {
      toast(errorMessage(error, 'Non sono riuscito a toglierlo dal piano. Riprova.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Icon name="calendar" size={16} />
        {slot ? (
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="strong" style={{ fontSize: 14 }}>
              Esce {formatWeekdayLong(slot.date)} alle {slot.time}
            </T>
            <View style={[styles.status, { borderLeftColor: SLOT_TONES[slot.status] }]}>
              <T variant="caption" style={{ fontSize: 11, color: colors.title }}>
                {SLOT_STATUS_LABELS[slot.status]}
              </T>
            </View>
          </View>
        ) : (
          <T variant="body" style={{ flex: 1 }}>
            Non è ancora nel piano.
          </T>
        )}
      </View>
      <View style={styles.actions}>
        {slot ? (
          <>
            <Button label="Nel piano" kind="secondary" small onPress={() => router.navigate({ pathname: '/piano', params: { giorno: slot.date } })} />
            {slot.status !== 'published' ? (
              <>
                <Button label="Sposta" kind="secondary" small onPress={schedule} busy={saving} />
                <Button label="Togli" kind="ghost" small onPress={unschedule} disabled={saving} />
              </>
            ) : null}
          </>
        ) : (
          <Button label="Programma" icon="clock" small onPress={schedule} busy={saving} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 1, borderLeftWidth: 3, borderRadius: 4, backgroundColor: colors.sunken },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
