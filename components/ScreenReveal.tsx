import { PropsWithChildren, useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";

type ScreenRevealProps = PropsWithChildren<{
  delay?: number;
  distance?: number;
  scaleFrom?: number;
  duration?: number;
  style?: import("react-native").ViewStyle;
}>;

export default function ScreenReveal({
  children,
  delay = 0,
  distance = 14,
  scaleFrom = 0.985,
  duration = 360,
  style,
}: ScreenRevealProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;
  const scale = useRef(new Animated.Value(scaleFrom)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      scale.setValue(1);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: Math.max(220, duration - 60),
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [delay, distance, duration, opacity, reducedMotion, scale, translateY]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }, { scale }] }, style]}>
      {children}
    </Animated.View>
  );
}
