import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { GaugeMark } from './GaugeMark';

interface AnimatedSplashScreenProps {
  visible: boolean;
  onFinish: () => void;
}

// Ouverture : le compte-tours s'allume, l'aiguille monte, puis le nom apparaît.
export const AnimatedSplashScreen: React.FC<AnimatedSplashScreenProps> = ({ visible, onFinish }) => {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const nameAnim = useRef(new Animated.Value(0)).current;
  const { width, height } = useWindowDimensions();
  // Le cadran remplit presque la largeur du téléphone, sans devenir géant sur un grand écran.
  const gaugeSize = Math.round(Math.max(200, Math.min(width * 0.86, height * 0.5, 380)));

  useEffect(() => {
    if (!visible) return;
    Animated.timing(nameAnim, { toValue: 1, duration: 450, delay: 900, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => onFinish());
    }, 2700);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  const nameStyle = {
    opacity: nameAnim,
    transform: [{ translateY: nameAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <GaugeMark size={gaugeSize} motion="once" />
      <Animated.View style={[styles.nameBlock, nameStyle]}>
        <Text style={styles.name}>
          Calc<Text style={styles.nameGold}>Auto</Text>
        </Text>
        <Text style={styles.by}>par eTradeValue</Text>
      </Animated.View>
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
});
