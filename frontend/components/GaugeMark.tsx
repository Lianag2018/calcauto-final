import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, Animated, Easing, AccessibilityInfo } from 'react-native';

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

// ----- Compte-tours (grandes tailles) -----
// Un vrai cadran de tableau de bord : chiffres de 0 à 7, zone rouge à partir
// de 6, arc bleu qui suit l'aiguille et « RPM x1000 » au centre.
const TACH_CX = 80;
const TACH_CY = 82;
const TACH_MAX = 7;
const TACH_REDLINE = 6;
const TACH_IDLE = 1.7; // ralenti : où l'aiguille se pose après le démarrage
const TACH_REV = 5.5; // pendant l'attente du serveur, le moteur monte jusqu'ici
const TACH_DEG_PER_UNIT = TRACK_SWEEP / TACH_MAX;
const TACH_MIN_SIZE = 60; // en dessous, on garde le petit cadran simple
const BLUE = '#3d8bff';
const RED = '#ff453a';

const tachPoint = (value: number, radius: number) => {
  const rad = ((START_DEG + value * TACH_DEG_PER_UNIT) * Math.PI) / 180;
  return { x: TACH_CX + radius * Math.cos(rad), y: TACH_CY + radius * Math.sin(rad) };
};

const pointAt = (deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: CENTER_X + RADIUS * Math.cos(rad), y: CENTER_Y + RADIUS * Math.sin(rad) };
};

export const GaugeMark: React.FC<Props> = ({ size = 150, motion = 'once', duration = 1400 }) => {
  const isTach = size >= TACH_MIN_SIZE;
  // Compte-tours : progress = régime / 7. Petit cadran : progress = portion dorée.
  const rest = isTach ? TACH_IDLE / TACH_MAX : 1;
  const progress = useRef(new Animated.Value(motion === 'none' ? rest : 0)).current;
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
        progress.setValue(rest);
        return;
      }
      if (isTach) {
        const to = (rpm: number, ms: number, easing: (t: number) => number) =>
          Animated.timing(progress, { toValue: rpm / TACH_MAX, duration: ms, easing, useNativeDriver: true });
        running =
          motion === 'loop'
            ? // Attente : le moteur monte et redescend, comme un coup d'accélérateur.
              Animated.loop(
                Animated.sequence([
                  to(TACH_REV, 900, Easing.out(Easing.cubic)),
                  Animated.delay(150),
                  to(1.2, 850, Easing.inOut(Easing.quad)),
                  Animated.delay(250),
                ])
              )
            : // Démarrage : l'aiguille balaie tout le cadran, revient, puis se pose au ralenti.
              Animated.sequence([
                to(TACH_MAX, 700, Easing.out(Easing.cubic)),
                Animated.delay(120),
                to(1, 750, Easing.inOut(Easing.quad)),
                to(TACH_IDLE, 450, Easing.out(Easing.quad)),
              ]);
        running.start();
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
  }, [motion, duration, progress, isTach, rest]);

  const needleRotation = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['-120deg', '30deg'],
  });

  const tachArc = useMemo(() => {
    const dots = [];
    for (let v = 0; v <= TACH_REDLINE + 0.001; v += 0.05) dots.push({ ...tachPoint(v, 66), at: v / TACH_MAX });
    return dots;
  }, []);

  const tachRedline = useMemo(() => {
    const dots = [];
    for (let v = TACH_REDLINE; v <= TACH_MAX + 0.001; v += 0.05) dots.push(tachPoint(v, 66));
    return dots;
  }, []);

  if (isTach) {
    const numbers = size >= 100;
    const ring = (radius: number, opacity: number) => ({
      position: 'absolute' as const,
      left: (TACH_CX - radius) * unit,
      top: (TACH_CY - radius) * unit,
      width: radius * 2 * unit,
      height: radius * 2 * unit,
      borderRadius: radius * unit,
      borderWidth: Math.max(1, 1.2 * unit),
      borderColor: `rgba(244,241,234,${opacity})`,
    });
    const bead = (x: number, y: number, width: number, color: string) => ({
      position: 'absolute' as const,
      left: (x - width / 2) * unit,
      top: (y - width / 2) * unit,
      width: width * unit,
      height: width * unit,
      borderRadius: (width / 2) * unit,
      backgroundColor: color,
    });
    const reach = 71 * unit; // l'aiguille part de l'anneau extérieur
    const tachRotation = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [`${START_DEG + 90 - 360}deg`, `${START_DEG + 90 - 360 + TACH_MAX * TACH_DEG_PER_UNIT}deg`],
    });
    return (
      <View style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={ring(71, 0.55)} />
        <View style={ring(61, 0.3)} />
        {tachRedline.map((p, i) => (
          <View key={`r${i}`} style={bead(p.x, p.y, 3, RED)} />
        ))}
        {tachArc.map((p, i) => (
          <Animated.View
            key={`b${i}`}
            style={[
              bead(p.x, p.y, 8.4, BLUE),
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
        {Array.from({ length: TACH_MAX + 1 }, (_, value) => {
          const red = value >= TACH_REDLINE;
          const tick = tachPoint(value, 55.5);
          const label = tachPoint(value, 42.5);
          return (
            <React.Fragment key={`n${value}`}>
              <View
                style={{
                  position: 'absolute',
                  left: (tick.x - 1.8) * unit,
                  top: (tick.y - 1.8) * unit,
                  width: 3.6 * unit,
                  height: 3.6 * unit,
                  backgroundColor: red ? RED : CREAM,
                }}
              />
              {numbers && (
                <Text
                  allowFontScaling={false}
                  style={{
                    position: 'absolute',
                    left: (label.x - 12) * unit,
                    top: (label.y - 10) * unit,
                    width: 24 * unit,
                    height: 20 * unit,
                    lineHeight: 20 * unit,
                    textAlign: 'center',
                    fontSize: 16.5 * unit,
                    fontWeight: '600',
                    color: red ? RED : CREAM,
                  }}
                >
                  {value}
                </Text>
              )}
            </React.Fragment>
          );
        })}
        {numbers && (
          <View style={{ position: 'absolute', left: 0, right: 0, top: (TACH_CY + 12) * unit, alignItems: 'center' }}>
            <Text allowFontScaling={false} style={{ color: CREAM, fontWeight: '800', fontSize: 12 * unit, lineHeight: 14 * unit }}>RPM</Text>
            <Text allowFontScaling={false} style={{ color: CREAM, fontSize: 6.5 * unit, lineHeight: 8 * unit }}>x1000</Text>
          </View>
        )}
        {/* L'aiguille : un trait fin qui part de l'anneau, comme sur un tableau de bord */}
        <Animated.View
          style={{
            position: 'absolute',
            left: TACH_CX * unit - reach,
            top: TACH_CY * unit - reach,
            width: reach * 2,
            height: reach * 2,
            alignItems: 'center',
            transform: [{ rotate: tachRotation }],
          }}
        >
          <View
            style={{
              width: Math.max(2, 2.4 * unit),
              height: 46 * unit,
              borderRadius: 1.2 * unit,
              backgroundColor: '#ffffff',
              shadowColor: '#ffffff',
              shadowOpacity: 0.55,
              shadowRadius: 3 * unit,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        </Animated.View>
      </View>
    );
  }

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
