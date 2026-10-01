import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { AiStep } from '@moonbrand/shared/ai/steps';

import { Icon, T } from './kit';
import { colors } from './theme';

function StepRow({ step }: { step: AiStep }) {
  return (
    <View style={styles.row}>
      <View style={styles.mark}>
        {step.status === 'running' ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : step.status === 'failed' ? (
          <Icon name="x-circle" size={16} color={colors.danger} />
        ) : (
          <Icon name="check-circle" size={16} color={colors.success} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <T variant={step.status === 'running' ? 'ink' : 'body'} style={styles.label}>
          {step.label}
        </T>
        {step.detail ? (
          <T variant="caption" numberOfLines={2}>
            {step.detail}
          </T>
        ) : null}
      </View>
    </View>
  );
}

// I passaggi di un lavoro AI mentre si svolge; finché non ce n'è nessuno, quello che si sta aspettando.
export function StepList({ steps, waiting }: { steps: AiStep[]; waiting: string }) {
  const visible = steps.filter((step) => step.kind !== 'text');
  if (visible.length === 0) {
    return <StepRow step={{ id: 'waiting', label: waiting, status: 'running' }} />;
  }
  return (
    <View style={styles.list}>
      {visible.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}
    </View>
  );
}

// Nella chat i passaggi di fila stanno in un blocco che si apre: chiuso mostra solo l'ultimo.
export function StepBlock({ steps, live }: { steps: AiStep[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;
  const last = steps[steps.length - 1];
  const running = live && steps.some((step) => step.status === 'running');
  const failed = steps.filter((step) => step.status === 'failed').length;
  return (
    <View style={styles.block}>
      <Pressable style={styles.blockHead} onPress={() => setOpen((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={styles.mark}>
          {running ? <ActivityIndicator size="small" color={colors.accent} /> : <Icon name="layers" size={15} color={colors.body} />}
        </View>
        <T variant="caption" numberOfLines={1} style={{ flex: 1, color: running ? colors.title : colors.body }}>
          {running ? last.label : `${steps.length} ${steps.length === 1 ? 'passaggio' : 'passaggi'}${failed ? `, ${failed} non riusciti` : ''}`}
        </T>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.body} />
      </Pressable>
      {open ? (
        <View style={[styles.list, { paddingTop: 4 }]}>
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  mark: { width: 20, height: 22, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, lineHeight: 20 },
  block: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: 12, paddingVertical: 8 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
});
