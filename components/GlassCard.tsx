import { PropsWithChildren } from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { useAppTheme } from "../lib/theme";

type GlassCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  padding?: number;
  variant?: "subtle" | "strong" | "hero";
  /** Kept for call-site compatibility; cards now use solid composited surfaces. */
  blurIntensity?: number;
}>;

export default function GlassCard({
  children,
  style,
  contentStyle,
  padding = 20,
  variant = "subtle",
}: GlassCardProps) {
  const theme = useAppTheme();
  const radius = theme.radii.xl;
  const variantConfig =
    variant === "hero"
      ? {
          borderColor: theme.colors.borderStrong,
          backgroundColor: theme.colors.surface,
        }
      : variant === "strong"
        ? {
            borderColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surface,
          }
        : {
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
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
        variant === "hero" ? theme.cardShadow : null,
        style,
      ]}
    >
      <View
        style={[
          {
            padding,
            backgroundColor: "transparent",
          },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

