import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity } from "../../lib/hapticPressables";

export default function StudentWorkspaceActions({ colors, onClassrooms, onSettings, disabled = false }: {
  colors: { border: string; muted: string; card: string };
  onClassrooms: () => void;
  onSettings: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {([
        { label: "Open classrooms", icon: "people-outline", onPress: onClassrooms },
        { label: "Open settings", icon: "settings-outline", onPress: onSettings },
      ] as const).map((action) => (
        <TouchableOpacity key={action.label} onPress={action.onPress} disabled={disabled}
          accessibilityRole="button" accessibilityLabel={action.label} accessibilityState={{ disabled }}
          style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
            backgroundColor: colors.card, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.45 : 1 }}>
          <Ionicons name={action.icon} size={19} color={colors.muted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}
