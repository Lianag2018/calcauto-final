import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { GaugeMark } from './GaugeMark';

// Un seul écran d'ouverture, du premier instant jusqu'au calculateur prêt : le même
// compte-tours, à la même taille et à la même place, avec le nom dessous.
export const OpeningMark: React.FC<{ motion?: 'once' | 'loop'; note?: string }> = ({ motion = 'loop', note }) => {
  const { width, height } = useWindowDimensions();
  // Le cadran remplit presque la largeur du téléphone, sans devenir géant sur un grand écran.
  const gaugeSize = Math.round(Math.max(200, Math.min(width * 0.86, height * 0.5, 380)));
  return (
    <View style={styles.mark}>
      <GaugeMark size={gaugeSize} motion={motion} />
      <View style={styles.nameBlock}>
        <Text style={styles.name}>
          Calc<Text style={styles.nameGold}>Auto</Text>
        </Text>
        <Text style={styles.by}>par eTradeValue</Text>
      </View>
      {/* La place de la note est toujours réservée : le cadran ne bouge pas quand elle apparaît. */}
      <Text style={styles.note}>{note || ' '}</Text>
    </View>
  );
};

interface AnimatedSplashScreenProps {
  visible: boolean;
  onFinish: () => void;
  // Tant que « hold » est vrai (programmes en chargement), l'écran reste affiché.
  hold?: boolean;
}

export const AnimatedSplashScreen: React.FC<AnimatedSplashScreenProps> = ({ visible, onFinish, hold = false }) => {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [minimumShown, setMinimumShown] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setMinimumShown(true), 1200);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible || !minimumShown || hold) return;
    Animated.timing(fadeAnim, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => onFinish());
  }, [visible, minimumShown, hold]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <OpeningMark motion="loop" />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#07090e',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  mark: {
    alignItems: 'center',
  },
  nameBlock: {
    alignItems: 'center',
    marginTop: 14,
  },
  name: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: '#f4f1ea',
  },
  nameGold: {
    color: '#e6c65a',
  },
  by: {
    marginTop: 4,
    fontSize: 13,
    color: '#b9c0cc',
  },
  note: {
    color: '#b9c0cc',
    fontSize: 14,
    lineHeight: 20,
    minHeight: 40,
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: 32,
  },
});
