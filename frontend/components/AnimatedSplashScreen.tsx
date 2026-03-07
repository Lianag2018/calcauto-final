import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';

interface AnimatedSplashScreenProps {
  visible: boolean;
  onFinish: () => void;
}

export const AnimatedSplashScreen: React.FC<AnimatedSplashScreenProps> = ({ visible, onFinish }) => {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Animations pour les particules de traînée (décalées)
  const trailAnims = Array.from({ length: 4 }).map(() => useRef(new Animated.Value(0)).current);

  useEffect(() => {
    if (visible) {
      // Animation de rotation principale
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();

      // Animations décalées pour les particules de traînée
      trailAnims.forEach((anim, index) => {
        Animated.loop(
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.linear,
            delay: (index + 1) * 100, // Décalage progressif pour l'effet queue
            useNativeDriver: true,
          })
        ).start();
      });

      // Fade out après 2.5s
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onFinish();
        });
      }, 2500);
    }
  }, [visible]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Rotations décalées pour les particules
  const trailRotations = trailAnims.map(anim =>
    anim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    })
  );

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Animated.View style={[styles.logoContainer, { transform: [{ scale: scaleAnim }] }]}>
        {/* Anneau rotatif avec point principal */}
        <Animated.View style={[styles.rotatingRing, { transform: [{ rotate: rotation }] }]}>
          <View style={styles.glowDot} /> {/* Point principal plus fin */}
        </Animated.View>

        {/* Particules de traînée (comète) */}
        {trailRotations.map((trailRotation, index) => (
          <Animated.View
            key={`trail-${index}`}
            style={[
              styles.rotatingRing,
              { transform: [{ rotate: trailRotation }] },
            ]}
          >
            <View
              style={[
                styles.trailParticle,
                {
                  opacity: 0.8 - index * 0.2, // Opacité décroissante
                  transform: [{ scale: 0.8 - index * 0.2 }], // Taille décroissante
                },
              ]}
            />
          </Animated.View>
        ))}

        {/* Anneau statique */}
        <View style={styles.ringBackground} />

        {/* Centre du logo */}
        <View style={styles.logoCenter}>
          <Text style={styles.logoText}>CalcAuto</Text>
          <Text style={styles.logoSubtext}>AiPro</Text>
        </View>
      </Animated.View>

      <Text style={styles.loadingText}>Chargement...</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  logoContainer: {
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rotatingRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  glowDot: {
    width: 8, // Point plus fin
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ECDC4',
    shadowColor: '#4ECDC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20, // Glow plus étendu pour effet comète
    elevation: 20,
    marginTop: -5,
  },
  trailParticle: {
    width: 6, // Particules plus petites
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ECDC4',
    shadowColor: '#4ECDC4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 15,
    marginTop: -5,
  },
  ringBackground: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 4,
    borderColor: 'rgba(78, 205, 196, 0.3)',
  },
  logoCenter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#2d2d44',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#4ECDC4',
  },
  logoText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4ECDC4',
    fontStyle: 'italic',
  },
  logoSubtext: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginTop: -2,
  },
  loadingText: {
    marginTop: 30,
    fontSize: 14,
    color: '#888',
  },
});
