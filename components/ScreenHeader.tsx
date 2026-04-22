import {
  ReactNode } from "react";
import { Text,
  View,
} from "react-native";
import { TouchableOpacity } from "../lib/hapticPressables";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAppTheme } from "../lib/theme";

type Props = {
  title: string;
  eyebrow?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightElement?: ReactNode;
};

export default function ScreenHeader({
  title,
  eyebrow,
  showBack = true,
  onBack,
  rightElement,
}: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { spacing, radii } = theme;

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: theme.isDark ? theme.colors.background : "rgba(255,255,255,0.96)",
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        paddingHorizontal: spacing.md,
        paddingTop: Math.max(insets.top, 8),
        paddingBottom: spacing.sm,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      {showBack ? (
        <TouchableOpacity
          onPress={handleBack}
          activeOpacity={0.85}
          style={{
            height: 44,
            width: 44,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceGlass,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 44 }} />
      )}

      <View style={{ flex: 1, paddingHorizontal: spacing.xs }}>
        {eyebrow ? (
          <Text style={theme.typography.label}>{eyebrow}</Text>
        ) : null}
        <Text
          style={[
            theme.typography.title,
            { marginTop: eyebrow ? 2 : 0, fontSize: 19, lineHeight: 24 },
          ]}
        >
          {title}
        </Text>
      </View>

      {rightElement ? rightElement : <View style={{ width: 44 }} />}
    </View>
  );
}

/** Returns the height the header occupies so content can be offset correctly.
 *  Usage:  paddingTop: useScreenHeaderHeight()  */
export function useScreenHeaderHeight() {
  const insets = useSafeAreaInsets();
  return Math.max(insets.top, 8) + 62;
}

