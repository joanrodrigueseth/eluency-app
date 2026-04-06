import { useEffect, useRef } from "react";
import { Animated, Easing, View, ViewStyle } from "react-native";
import { useAppTheme } from "../lib/theme";

export function SkeletonBox({ width, height, radius = 10, style }: { width: number | string; height: number; radius?: number; style?: ViewStyle }) {
  const theme = useAppTheme();
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: theme.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)", opacity: pulse },
        style,
      ]}
    />
  );
}

function SkeletonCard({ theme }: { theme: ReturnType<typeof useAppTheme> }) {
  return (
    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, padding: 16, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <SkeletonBox width={44} height={44} radius={14} />
        <View style={{ flex: 1, gap: 8 }}>
          <SkeletonBox width="70%" height={14} radius={7} />
          <SkeletonBox width="45%" height={11} radius={6} />
        </View>
      </View>
    </View>
  );
}

export default function SkeletonLoader({ count = 5 }: { count?: number }) {
  const theme = useAppTheme();
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} theme={theme} />
      ))}
    </View>
  );
}
