import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity } from "../lib/hapticPressables";
import { useAppTheme } from "../lib/theme";

type ThemeToggleButtonProps = {
  compact?: boolean;
};

export default function ThemeToggleButton({ compact = false }: ThemeToggleButtonProps) {
  const theme = useAppTheme();
  const buttonSize = compact ? 38 : 44;
  const iconSize = compact ? 16 : 18;
  const borderRadius = compact ? 11 : 12;
  const marginRight = compact ? 0 : 8;
  return (
    <TouchableOpacity
      onPress={theme.toggleDarkMode}
      activeOpacity={0.85}
      style={{
        height: buttonSize,
        width: buttonSize,
        borderRadius,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceGlass,
        alignItems: "center",
        justifyContent: "center",
        marginRight,
      }}
    >
      <Ionicons
        name={theme.isDark ? "sunny-outline" : "moon-outline"}
        size={iconSize}
        color={theme.colors.textMuted}
      />
    </TouchableOpacity>
  );
}
