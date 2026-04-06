import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { useAppTheme } from "../lib/theme";

type IconTileProps = {
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  size?: number;
  iconSize?: number;
  radius?: number;
};

export default function IconTile({
  icon,
  color,
  backgroundColor,
  borderColor,
  size = 40,
  iconSize = 20,
  radius = 12,
}: IconTileProps) {
  const theme = useAppTheme();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: backgroundColor ?? theme.colors.primarySoft,
        borderWidth: 1,
        borderColor: borderColor ?? theme.colors.border,
      }}
    >
      <Ionicons
        name={icon}
        size={iconSize}
        color={color ?? theme.colors.primary}
      />
    </View>
  );
}
