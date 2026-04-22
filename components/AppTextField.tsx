import { ReactNode } from "react";
import { Text, TextInput, TextInputProps, View } from "react-native";
import { useAppTheme } from "../lib/theme";

type AppTextFieldProps = TextInputProps & {
  label: string;
  icon?: ReactNode;
  rightElement?: ReactNode;
  error?: string;
  helperText?: string;
};

export default function AppTextField({
  label,
  icon,
  rightElement,
  error,
  helperText,
  onFocus,
  onBlur,
  ...props
}: AppTextFieldProps) {
  const theme = useAppTheme();
  const { spacing, radii } = theme;

  // Keep focus styling static on Android to avoid keyboard/focus flicker loops.
  const borderColor = error ? theme.colors.danger : theme.colors.border;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={theme.typography.fieldLabel}>{label}</Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor,
          backgroundColor: theme.isDark ? theme.colors.surfaceAlt : "#FFFFFF",
          paddingHorizontal: spacing.md,
          paddingVertical: 2,
          shadowColor: theme.colors.shadow,
          shadowOpacity: theme.isDark ? 0.16 : 0.06,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 0,
        }}
      >
        {icon ? <View>{icon}</View> : null}
        <TextInput
          placeholderTextColor={theme.colors.textSoft}
          style={[
            theme.typography.body,
            {
              flex: 1,
              minHeight: 54,
              color: theme.colors.text,
            },
          ]}
          onFocus={(event) => onFocus?.(event)}
          onBlur={(event) => onBlur?.(event)}
          {...props}
        />
        {rightElement ? <View>{rightElement}</View> : null}
      </View>
      {error ? (
        <Text style={[theme.typography.helper, { color: theme.colors.danger }]}>
          {error}
        </Text>
      ) : helperText ? (
        <Text style={theme.typography.helper}>{helperText}</Text>
      ) : null}
    </View>
  );
}

