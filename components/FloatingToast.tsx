import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAppTheme } from "../lib/theme";

type FloatingToastProps = {
  visible: boolean;
  message: string;
  tone?: "success" | "info" | "danger";
  bottom?: number;
};

const toneConfig = {
  success: { icon: "checkmark-circle" as const, color: "#1F8A54", bg: "rgba(225,248,235,0.96)" },
  info: { icon: "information-circle" as const, color: "#2E7ABF", bg: "rgba(234,243,251,0.96)" },
  danger: { icon: "alert-circle" as const, color: "#C24141", bg: "rgba(254,238,238,0.96)" },
};

export default function FloatingToast({
  visible,
  message,
  tone = "success",
  bottom = 28,
}: FloatingToastProps) {
  const theme = useAppTheme();
  const translateY = useRef(new Animated.Value(28)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 180 : 140,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: visible ? 0 : 28,
        useNativeDriver: true,
        speed: 24,
        bounciness: 5,
      }),
    ]).start();
  }, [opacity, translateY, visible]);

  if (!message) return null;

  const config = toneConfig[tone];

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 20,
        right: 20,
        bottom,
        opacity,
        transform: [{ translateY }],
        zIndex: 200,
      }}
    >
      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: theme.colors.borderStrong,
          backgroundColor: config.bg,
          paddingHorizontal: 16,
          paddingVertical: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 5,
        }}
      >
        <Ionicons name={config.icon} size={18} color={config.color} />
        <Text style={{ flex: 1, color: "#10202D", fontSize: 13, fontWeight: "700" }}>{message}</Text>
      </View>
    </Animated.View>
  );
}
