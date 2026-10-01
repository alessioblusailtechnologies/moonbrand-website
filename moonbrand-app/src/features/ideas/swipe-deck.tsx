import * as Haptics from 'expo-haptics';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { IdeasResponse } from '@moonbrand/shared/api/contract';
import type { Idea } from '@moonbrand/shared/domain/idea';

import { SIGNAL_LABELS } from '../../lib/labels';
import { Badge, Button, Icon, T } from '../../ui/kit';
import { colors, fonts, radius, shadow } from '../../ui/theme';

export type Decision = 'saved' | 'discarded';

export interface SwipeDeckHandle {
  swipe(decision: Decision): void;
}

type Theme = IdeasResponse['themes'][number];

// Oltre questa parte della larghezza (o con uno scatto veloce) la carta se ne va; altrimenti torna al centro.
const THRESHOLD = 0.28;
const VELOCITY = 900;

export function signalLabel(idea: Idea): string {
  return [SIGNAL_LABELS[idea.signal.kind] ?? idea.signal.kind, idea.signal.label].filter(Boolean).join(' · ');
}

// Le proposte una sopra l'altra: si trascina la prima a destra per salvarla, a sinistra per scartarla.
// Le due sotto si vedono appena e crescono mentre la prima se ne va.
export const SwipeDeck = forwardRef<
  SwipeDeckHandle,
  {
    ideas: Idea[];
    themes: Theme[];
    onDecide: (idea: Idea, decision: Decision) => void;
    onOpen: (idea: Idea) => void;
    onCreate: (idea: Idea) => void;
  }
>(function SwipeDeck({ ideas, themes, onDecide, onOpen, onCreate }, ref) {
  const progress = useSharedValue(0);
  const top = useRef<SwipeDeckHandle>(null);
  useImperativeHandle(ref, () => ({ swipe: (decision) => top.current?.swipe(decision) }));

  const visible = ideas.slice(0, 3);
  const theme = (idea: Idea) => themes.find((item) => item.id === idea.themeId) ?? null;

  return (
    <View style={styles.deck}>
      {visible
        .map((idea, index) =>
          index === 0 ? (
            <SwipeCard key={idea.id} ref={top} idea={idea} theme={theme(idea)} progress={progress} onDecide={onDecide} onOpen={onOpen} onCreate={onCreate} />
          ) : (
            <BehindCard key={idea.id} idea={idea} theme={theme(idea)} depth={index} progress={progress} />
          ),
        )
        .reverse()}
    </View>
  );
});

const SwipeCard = forwardRef<
  SwipeDeckHandle,
  {
    idea: Idea;
    theme: Theme | null;
    progress: SharedValue<number>;
    onDecide: (idea: Idea, decision: Decision) => void;
    onOpen: (idea: Idea) => void;
    onCreate: (idea: Idea) => void;
  }
>(function SwipeCard({ idea, theme, progress, onDecide, onOpen, onCreate }, ref) {
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const gone = useSharedValue(false);

  useEffect(() => {
    progress.value = 0;
  }, [progress]);

  const decide = (decision: Decision) => {
    void Haptics.impactAsync(decision === 'saved' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    onDecide(idea, decision);
  };

  const flyOut = (decision: Decision, velocity = 0) => {
    'worklet';
    if (gone.value) return;
    gone.value = true;
    const direction = decision === 'saved' ? 1 : -1;
    progress.value = withTiming(1, { duration: 220 });
    x.value = withTiming(direction * width * 1.4, { duration: Math.max(160, 280 - Math.abs(velocity) / 20) }, (finished) => {
      if (finished) scheduleOnRN(decide, decision);
    });
  };

  useImperativeHandle(ref, () => ({ swipe: (decision) => flyOut(decision) }));

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-24, 24])
    .onUpdate((event) => {
      if (gone.value) return;
      x.value = event.translationX;
      y.value = event.translationY * 0.25;
      progress.value = Math.min(1, Math.abs(event.translationX) / (width * THRESHOLD));
    })
    .onEnd((event) => {
      if (gone.value) return;
      if (x.value > width * THRESHOLD || event.velocityX > VELOCITY) return flyOut('saved', event.velocityX);
      if (x.value < -width * THRESHOLD || event.velocityX < -VELOCITY) return flyOut('discarded', event.velocityX);
      x.value = withSpring(0, { damping: 18, stiffness: 180 });
      y.value = withSpring(0, { damping: 18, stiffness: 180 });
      progress.value = withTiming(0, { duration: 180 });
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${interpolate(x.value, [-width, width], [-14, 14])}deg` }],
  }));
  const saveStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [20, width * THRESHOLD], [0, 1], Extrapolation.CLAMP) }));
  const discardStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-width * THRESHOLD, -20], [1, 0], Extrapolation.CLAMP) }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        <IdeaFace idea={idea} theme={theme} onOpen={() => onOpen(idea)} onCreate={() => onCreate(idea)} />
        <Animated.View style={[styles.stamp, styles.stampSave, saveStyle]} pointerEvents="none">
          <Icon name="bookmark" size={18} color={colors.success} />
          <T style={[styles.stampText, { color: colors.success }]}>SALVA</T>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampDiscard, discardStyle]} pointerEvents="none">
          <Icon name="x" size={18} color={colors.danger} />
          <T style={[styles.stampText, { color: colors.danger }]}>SCARTA</T>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
});

function BehindCard({ idea, theme, depth, progress }: { idea: Idea; theme: Theme | null; depth: number; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const step = depth - progress.value;
    return {
      opacity: interpolate(step, [0, 1, 2], [1, 1, 0.6]),
      transform: [{ translateY: step * 14 }, { scale: 1 - step * 0.05 }],
    };
  });
  return (
    <Animated.View style={[styles.card, style]} pointerEvents="none">
      <IdeaFace idea={idea} theme={theme} />
    </Animated.View>
  );
}

function IdeaFace({ idea, theme, onOpen, onCreate }: { idea: Idea; theme: Theme | null; onOpen?: () => void; onCreate?: () => void }) {
  return (
    <View style={styles.face}>
      <Pressable style={{ flex: 1, gap: 14 }} onPress={onOpen} disabled={!onOpen} accessibilityHint="Apre l’idea intera">
        <View style={styles.meta}>
          <Badge label={signalLabel(idea)} tone="accent" />
          {theme ? (
            <View style={styles.theme}>
              <View style={[styles.dot, { backgroundColor: theme.color }]} />
              <T variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
                {theme.name}
              </T>
            </View>
          ) : null}
        </View>
        <View style={{ gap: 6 }}>
          {idea.angleLabel ? <T variant="label">{idea.angleLabel}</T> : null}
          <T style={styles.title} numberOfLines={4}>
            {idea.title}
          </T>
        </View>
        <T variant="body" numberOfLines={5}>
          {idea.angle}
        </T>
        <View style={styles.why}>
          <T variant="label">Perché adesso</T>
          <T variant="ink" numberOfLines={4} style={{ fontSize: 14, lineHeight: 20 }}>
            {idea.rationale}
          </T>
        </View>
        <View style={{ flex: 1 }} />
        <T variant="caption" style={{ textAlign: 'center' }}>
          Tocca per leggerla tutta
        </T>
      </Pressable>
      {onCreate ? <Button label="Crea contenuto" icon="edit-3" onPress={onCreate} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  deck: { flex: 1, marginHorizontal: 20, marginTop: 8, marginBottom: 12 },
  card: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...shadow.lifted,
  },
  face: { flex: 1, gap: 14, padding: 22 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  theme: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, color: colors.title, letterSpacing: -0.3 },
  why: { gap: 6, padding: 14, borderRadius: radius.md, backgroundColor: colors.grey100 },
  stamp: {
    position: 'absolute',
    top: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: colors.white,
  },
  stampSave: { left: 18, borderColor: colors.success, transform: [{ rotate: '-10deg' }] },
  stampDiscard: { right: 18, borderColor: colors.danger, transform: [{ rotate: '10deg' }] },
  stampText: { fontFamily: fonts.bold, fontSize: 16, letterSpacing: 1.5 },
});
