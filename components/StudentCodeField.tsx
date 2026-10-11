import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { TouchableOpacity } from "../lib/hapticPressables";
import { useAppTheme } from "../lib/theme";

export default function StudentCodeField({ value, disabled, onChange, onSubmit, onError }: {
  value: string; disabled: boolean; onChange: (value: string) => void;
  onSubmit: () => void; onError: (message: string) => void;
}) {
  const theme = useAppTheme();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [pasting, setPasting] = useState(false);
  const paste = async () => {
    if (disabled || pasting) return;
    setPasting(true);
    try {
      const code = (await Clipboard.getStringAsync()).trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) {
        onError("Copy the six-character code from your teacher, then tap Paste code.");
        return;
      }
      onChange(code);
      input.current?.focus();
    } catch {
      onError("Couldn't paste your code. You can type it into the boxes instead.");
    } finally {
      setPasting(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={[theme.typography.body, { fontSize: 18, lineHeight: 24, fontWeight: "600", color: theme.colors.text }]}>Enter your access code</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Paste access code"
          accessibilityState={{ disabled: disabled || pasting, busy: pasting }} disabled={disabled || pasting}
          onPress={() => void paste()} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name="copy" size={16} color={theme.colors.primary} />
          <Text style={[theme.typography.body, { color: theme.colors.primary, fontSize: 14, fontWeight: "600" }]}>{pasting ? "Pasting..." : "Paste code"}</Text>
        </TouchableOpacity>
      </View>
      <View style={{ position: "relative" }}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={{ width: "100%", maxWidth: 350, alignSelf: "center", flexDirection: "row", gap: 10 }}>
          {Array.from({ length: 6 }, (_, index) => {
            const active = focused && index === Math.min(value.length, 5);
            return <View key={index} style={{ flex: 1, minWidth: 0, height: 52, borderRadius: 12,
              borderWidth: active ? 2 : 1, borderColor: active ? theme.colors.primary : theme.colors.border,
              backgroundColor: theme.colors.surface,
              alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: theme.colors.text }}>{value[index] ?? ""}</Text>
            </View>;
          })}
        </View>
        {/* One native input preserves paste, backspace, keyboard and screen-reader behaviour. */}
        <TextInput ref={input} value={value} editable={!disabled} accessibilityLabel="Student access code"
          accessibilityHint="Enter six letters or numbers from your teacher" maxLength={6}
          autoCapitalize="characters" autoCorrect={false} autoComplete="off" textContentType="none"
          caretHidden selectionColor="transparent" returnKeyType="go"
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onChangeText={(text) => onChange(text.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
          onSubmitEditing={onSubmit}
          style={{ position: "absolute", inset: 0, color: "transparent", backgroundColor: "transparent", fontSize: 24 }} />
      </View>
    </View>
  );
}
