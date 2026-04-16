import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

const supportsHaptics = Platform.OS === "ios" || Platform.OS === "android";
const LIGHT_IMPACT_DEDUPE_MS = 40;
let lastLightImpactAt = 0;

export function triggerLightImpact() {
  if (!supportsHaptics) return;
  const now = Date.now();
  if (now - lastLightImpactAt < LIGHT_IMPACT_DEDUPE_MS) return;
  lastLightImpactAt = now;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function triggerSuccessHaptic() {
  if (!supportsHaptics) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
