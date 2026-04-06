import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

const supportsHaptics = Platform.OS === "ios" || Platform.OS === "android";

export function triggerLightImpact() {
  if (!supportsHaptics) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function triggerSuccessHaptic() {
  if (!supportsHaptics) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
