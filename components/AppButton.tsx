import { ReactNode } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { triggerLightImpact } from "../lib/haptics";
import { useAppTheme } from "../lib/theme";

type AppButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "violet" | "dangerSoft";
  icon?: ReactNode;
  fullWidth?: boolean;
};

export default function AppButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
  icon,
  fullWidth = true,
}: AppButtonProps) {
  const theme = useAppTheme();
  const { spacing, radii } = theme;
  const isSecondary = variant === "secondary";
  const isDangerSoft = variant === "dangerSoft";
  const isDisabled = disabled || loading;

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

  const textColor = isSecondary ? theme.colors.text : isDangerSoft ? theme.colors.danger : theme.colors.primaryText;

  return (
    <TouchableOpacity
      onPress={() => {
        triggerLightImpact();
        onPress();
      }}
      disabled={isDisabled}
      activeOpacity={0.9}
      style={{
        alignSelf: fullWidth ? "stretch" : "flex-start",
        borderRadius: radii.pill,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        backgroundColor: isDisabled ? theme.colors.borderStrong : backgroundColor,
        borderWidth: 1,
        borderColor: isSecondary ? theme.colors.border : isDangerSoft ? "rgba(229, 91, 107, 0.28)" : "transparent",
        minHeight: 56,
        shadowColor: isSecondary || isDangerSoft ? "transparent" : theme.colors.shadow,
        shadowOpacity: isSecondary || isDangerSoft || isDisabled ? 0 : theme.isDark ? 0.28 : 0.18,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 12 },
        elevation: isSecondary || isDangerSoft || isDisabled ? 0 : 6,
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
              color: textColor,
              fontSize: 14,
              lineHeight: 18,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              textAlign: "center",
              flexShrink: 1,
            },
          ]}
        >
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

