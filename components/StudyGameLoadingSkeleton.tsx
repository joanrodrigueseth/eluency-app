import { View, useWindowDimensions } from "react-native";

import AnimatedBrand from "./AnimatedBrand";
import type { AppTheme } from "../lib/theme";

export default function StudyGameLoadingSkeleton({ theme, label = "Opening your practice…" }: { theme: AppTheme; label?: string }) {
  const { width } = useWindowDimensions();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
      }}
    >
      <AnimatedBrand theme={theme} width={Math.min(280, width - 64)} busy label={label} />
    </View>
  );
}
