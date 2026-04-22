import { PropsWithChildren } from "react";
import { Platform, StyleProp, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { useAppTheme } from "../lib/theme";

type GlassCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  padding?: number;
  variant?: "subtle" | "strong" | "hero";
  blurIntensity?: number;
}>;

export default function GlassCard({
  children,
  style,
  contentStyle,
  padding = 20,
  variant = "subtle",
  blurIntensity,
}: GlassCardProps) {
  const theme = useAppTheme();
  const radius = theme.radii.xl;
  const variantConfig =
    variant === "hero"
      ? {
          borderColor: theme.colors.borderStrong,
          backgroundColor: theme.isDark ? "rgba(23,33,43,0.76)" : "rgba(255,255,255,0.90)",
          intensity: 58,
        }
      : variant === "strong"
        ? {
            borderColor: theme.colors.borderStrong,
            backgroundColor: theme.isDark ? "rgba(23,33,43,0.84)" : "rgba(255,255,255,0.94)",
            intensity: 48,
          }
        : {
            borderColor: theme.colors.border,
            backgroundColor: theme.isDark ? theme.colors.surfaceGlass : "rgba(255,255,255,0.88)",
            intensity: 34,
          };

  return (
    <View
      style={[
        {
          overflow: "hidden",
          borderRadius: radius,
          borderWidth: 1,
          borderColor: variantConfig.borderColor,
          backgroundColor: variantConfig.backgroundColor,
        },
        theme.cardShadow,
        style,
      ]}
    >
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={blurIntensity ?? variantConfig.intensity}
          tint={theme.isDark ? "dark" : "light"}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      <View
        style={[
          {
            padding,
            backgroundColor:
              Platform.OS === "android" ? variantConfig.backgroundColor : "transparent",
          },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

