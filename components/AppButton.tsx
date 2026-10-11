import { ReactNode, useRef } from "react";
import { ActivityIndicator, Animated, Text, TouchableOpacity, View } from "react-native";
import { triggerLightImpact } from "../lib/haptics";
import { useAppTheme } from "../lib/theme";
import { useReducedMotion } from "../hooks/useReducedMotion";

type AppButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "violet" | "dangerSoft";
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
  size?: "default" | "compact";
  preserveCase?: boolean;
};

export default function AppButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
  icon,
  trailingIcon,
  fullWidth = true,
  size = "default",
  preserveCase = false,
}: AppButtonProps) {
  const theme = useAppTheme();
  const reducedMotion = useReducedMotion();
  const pressScale = useRef(new Animated.Value(1)).current;
  const { spacing, radii } = theme;
  const isSecondary = variant === "secondary";
  const isDangerSoft = variant === "dangerSoft";
  const isDisabled = disabled || loading;
  const isCompact = size === "compact";

  const backgroundColor =
    isSecondary
      ? theme.colors.surfaceAlt
      : isDangerSoft
        ? theme.isDark
          ? "rgba(229, 91, 107, 0.18)"
          : "rgba(229, 91, 107, 0.12)"
      : variant === "violet"
        ? theme.colors.violet
        : theme.colors.primary;

  const textColor = isSecondary
    ? theme.colors.text
    : isDangerSoft
      ? theme.colors.danger
      : theme.colors.primaryText;

  const animatePress = (toValue: number) => {
    if (reducedMotion) {
      pressScale.setValue(1);
      return;
    }
    Animated.spring(pressScale, {
      toValue,
      friction: 7,
      tension: 220,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={{
        alignSelf: fullWidth ? "stretch" : "flex-start",
        transform: [{ scale: pressScale }],
      }}
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        onPress={() => {
          triggerLightImpact();
          onPress();
        }}
        onPressIn={() => {
          if (!isDisabled) animatePress(0.985);
        }}
        onPressOut={() => animatePress(1)}
        disabled={isDisabled}
        activeOpacity={0.92}
        style={{
          borderRadius: radii.pill,
          paddingHorizontal: isCompact ? spacing.md : spacing.lg,
          paddingVertical: isCompact ? spacing.sm : spacing.md,
          backgroundColor: disabled && !loading ? theme.colors.surfaceAlt : backgroundColor,
          borderWidth: 1,
          borderColor: isSecondary
            ? theme.colors.border
            : isDangerSoft
              ? "rgba(229, 91, 107, 0.28)"
              : "transparent",
          minHeight: isCompact ? 44 : 56,
          shadowColor: isSecondary || isDangerSoft ? "transparent" : theme.isDark ? "#000" : theme.colors.shadow,
          shadowOpacity: isSecondary || isDangerSoft || isDisabled ? 0 : theme.isDark ? 0.08 : 0.18,
          shadowRadius: theme.isDark ? 10 : 20,
          shadowOffset: { width: 0, height: 12 },
          elevation: isSecondary || isDangerSoft || isDisabled ? 0 : theme.isDark ? 3 : 6,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: spacing.xs,
          }}
        >
          {loading ? (
            <ActivityIndicator color={textColor} />
          ) : icon ? (
            <View>{icon}</View>
          ) : null}
          <Text
            style={[
              theme.typography.bodyStrong,
              {
                color: disabled && !loading ? theme.colors.textMuted : textColor,
                fontSize: isCompact ? 12 : 14,
                lineHeight: isCompact ? 16 : 18,
                textTransform: preserveCase ? "none" : "uppercase",
                letterSpacing: preserveCase ? 0.1 : 1.2,
                textAlign: "center",
                flexShrink: 1,
              },
            ]}
          >
            {label}
          </Text>
          {trailingIcon ? <View>{trailingIcon}</View> : null}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

