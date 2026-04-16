import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity } from "../lib/hapticPressables";
import { useAppTheme } from "../lib/theme";

export default function ThemeToggleButton() {
  const theme = useAppTheme();
  return (
    <TouchableOpacity
      onPress={theme.toggleDarkMode}
      activeOpacity={0.85}
      style={{
        height: 44,
        width: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceGlass,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 8,
      }}
    >
      <Ionicons
        name={theme.isDark ? "sunny-outline" : "moon-outline"}
        size={18}
        color={theme.colors.textMuted}
      />
    </TouchableOpacity>
  );
}
