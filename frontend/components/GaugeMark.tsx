import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing, AccessibilityInfo } from 'react-native';

// Le cadran de CalcAuto : un compteur dont l'aiguille monte jusqu'au paiement.
// Dessiné avec des vues simples (aucune dépendance graphique), sur une grille
// de 160 unités identique à celle de l'icône de l'application.

const GRID = 160;
const CENTER_X = 80;
const CENTER_Y = 92;
const RADIUS = 48;
const STROKE = 12;
const START_DEG = 150; // bas gauche
const TRACK_SWEEP = 240; // jusqu'en bas à droite
const VALUE_SWEEP = 150; // portion dorée
const STEP_DEG = 3;

const TRACK_COLOR = '#303744';
const GOLD = '#e6c65a';
const CREAM = '#f4f1ea';

type Props = {
  size?: number;
  /** 'once' : l'aiguille monte une fois. 'loop' : elle recommence. 'none' : image fixe. */
  motion?: 'once' | 'loop' | 'none';
  duration?: number;
};

const pointAt = (deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: CENTER_X + RADIUS * Math.cos(rad), y: CENTER_Y + RADIUS * Math.sin(rad) };
};

export const GaugeMark: React.FC<Props> = ({ size = 150, motion = 'once', duration = 1400 }) => {
  const progress = useRef(new Animated.Value(motion === 'none' ? 1 : 0)).current;
  const unit = size / GRID;

  const trackDots = useMemo(() => {
    const dots = [];
    for (let d = 0; d <= TRACK_SWEEP; d += STEP_DEG) dots.push(pointAt(START_DEG + d));
    return dots;
  }, []);

  const valueDots = useMemo(() => {
    const dots = [];
    for (let d = 0; d <= VALUE_SWEEP; d += STEP_DEG) dots.push({ ...pointAt(START_DEG + d), at: d / VALUE_SWEEP });
    return dots;
  }, []);

  useEffect(() => {
    if (motion === 'none') return;
    let stopped = false;
    let running: Animated.CompositeAnimation | null = null;

    const start = (reduced: boolean) => {
      if (stopped) return;
      if (reduced) {
        progress.setValue(1);
        return;
      }
      const sweep = Animated.timing(progress, {
        toValue: 1,
        duration,
        easing: Easing.bezier(0.5, 0, 0.2, 1),
        useNativeDriver: true,
      });
      running =
        motion === 'loop'
          ? Animated.loop(
              Animated.sequence([
                sweep,
                Animated.delay(900),
                Animated.timing(progress, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.delay(200),
              ])
            )
          : sweep;
      running.start();
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then(start)
      .catch(() => start(false));

    return () => {
      stopped = true;
      running?.stop();
    };
  }, [motion, duration, progress]);

  const needleRotation = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-120deg', '30deg'],
  });

  const dot = (x: number, y: number, color: string) => ({
    position: 'absolute' as const,
    left: (x - STROKE / 2) * unit,
    top: (y - STROKE / 2) * unit,
    width: STROKE * unit,
    height: STROKE * unit,
    borderRadius: (STROKE / 2) * unit,
    backgroundColor: color,
  });

  const needleLength = 36 * unit;
  const needleWidth = 7 * unit;
  const hub = 18 * unit;

  return (
    <View style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants">
      {trackDots.map((p, i) => (
        <View key={`t${i}`} style={dot(p.x, p.y, TRACK_COLOR)} />
      ))}
      {valueDots.map((p, i) => (
        <Animated.View
          key={`v${i}`}
          style={[
            dot(p.x, p.y, GOLD),
            {
              opacity: progress.interpolate({
                inputRange: [Math.max(0, p.at - 0.02), Math.max(0.001, p.at)],
                outputRange: [p.at === 0 ? 1 : 0, 1],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
      ))}
      {/* L'aiguille tourne autour du centre du cadran */}
      <Animated.View
        style={{
          position: 'absolute',
          left: CENTER_X * unit - needleLength,
          top: CENTER_Y * unit - needleLength,
          width: needleLength * 2,
          height: needleLength * 2,
          alignItems: 'center',
          transform: [{ rotate: needleRotation }],
        }}
      >
        <View style={{ width: needleWidth, height: needleLength, borderRadius: needleWidth / 2, backgroundColor: CREAM }} />
      </Animated.View>
      <View
        style={{
          position: 'absolute',
          left: CENTER_X * unit - hub / 2,
          top: CENTER_Y * unit - hub / 2,
          width: hub,
          height: hub,
          borderRadius: hub / 2,
          backgroundColor: CREAM,
        }}
      />
    </View>
  );
};

export default GaugeMark;
