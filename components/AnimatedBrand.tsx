import { useEffect, useRef } from "react";
import { Animated, AppState, Easing, Image, Text, View } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { AppTheme } from "../lib/theme";

/** Reveal the wordmark once; animate the accent only while real work is pending. */
export default function AnimatedBrand({ theme, width = 240, busy = false, label, showDivider = true }: {
  theme: AppTheme; width?: number; busy?: boolean; label?: string; showDivider?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const entrance = useRef(new Animated.Value(0)).current;
  const travel = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) { entrance.setValue(1); return; }
    const animation = Animated.timing(entrance, {
      toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, reducedMotion]);
  useEffect(() => {
    travel.setValue(0);
    if (!busy || reducedMotion) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(travel, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true, isInteraction: false }),
      Animated.delay(180),
    ]));
    const resume = () => {
      animation.stop();
      animation.reset();
      travel.setValue(0);
      if (AppState.currentState === "active") animation.start();
    };
    resume();
    const subscription = AppState.addEventListener("change", resume);
    return () => { animation.stop(); subscription.remove(); };
  }, [busy, reducedMotion, travel]);
  const imageHeight = width * 0.5625;
  const cropHeight = width * 0.3;
  return (
    <View accessible accessibilityRole={busy ? "progressbar" : "image"}
      accessibilityLabel={label || (busy ? "Connecting to Eluency" : "Eluency")} accessibilityState={{ busy }}
      style={{ alignItems: "center", maxWidth: "100%" }}>
      <Animated.View style={{ width, height: cropHeight, overflow: "hidden", opacity: entrance,
        transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
        <Image accessible={false} accessibilityIgnoresInvertColors
          source={theme.isDark ? require("../assets/wordslogow.png") : require("../assets/wordslogo.png")}
          resizeMode="contain" style={{ width, height: imageHeight, marginTop: -(imageHeight - cropHeight) / 2 }} />
      </Animated.View>
      {showDivider ? <View accessible={false} style={{ width: 72, height: 3, marginTop: 18, borderRadius: 3, overflow: "hidden", backgroundColor: theme.colors.primarySoft }}>
        <Animated.View style={{ width: busy && !reducedMotion ? 28 : 72, height: 3, borderRadius: 3,
          backgroundColor: theme.colors.primary, opacity: busy ? 1 : 0.5,
          transform: [{ translateX: busy && !reducedMotion ? travel.interpolate({ inputRange: [0, 1], outputRange: [-28, 72] }) : 0 }] }} />
      </View>
      : null}
      {label ? <Text accessible={false} style={{ marginTop: 16, fontSize: 13, lineHeight: 20, textAlign: "center", color: theme.colors.textMuted }}>{label}</Text> : null}
    </View>
  );
}
