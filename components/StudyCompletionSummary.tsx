import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useReducedMotion } from "../hooks/useReducedMotion";
import type { StudyReviewFocusArea } from "../lib/game/reviewFocus";
import { TouchableOpacity } from "../lib/hapticPressables";
import type { AppTheme } from "../lib/theme";

type Props = {
  percentage: number;
  passed: boolean;
  pendingSync?: boolean;
  requiresReview?: boolean;
  isTest: boolean;
  xpEarned?: number;
  newAchievementTitles?: string[];
  dailyGoalCompleted?: boolean;
  correctCount?: number;
  mistakeCount?: number;
  focusAreas?: StudyReviewFocusArea[];
  onReviewMistakes?: () => void;
  theme: AppTheme;
};

function getSummary({
  percentage,
  passed,
  pendingSync,
  requiresReview,
  isTest,
  correctCount,
  mistakeCount,
}: Omit<Props, "theme">) {
  if (pendingSync) {
    return {
      icon: "cloud-done-outline" as const,
      title: "Your work is safe",
      body: "Keep the app installed and we will verify this result when your connection returns.",
      tone: "primary" as const,
    };
  }
  if (requiresReview) {
    return {
      icon: "chatbox-ellipses-outline" as const,
      title: "Thoughtful work",
      body: "Your responses are with your teacher for review. You can keep studying while you wait.",
      tone: "warning" as const,
    };
  }
  if (percentage === 100) {
    return {
      icon: "sparkles" as const,
      title: "Perfect work!",
      body: isTest
        ? "You answered every question correctly."
        : "You completed a perfect practice session.",
      tone: "success" as const,
    };
  }
  if (isTest ? passed : (passed || percentage >= 80)) {
    return {
      icon: "trophy-outline" as const,
      title: "Great progress!",
      body:
        typeof mistakeCount === "number" && mistakeCount > 0
          ? `Strong work. You secured ${correctCount ?? 0} answers; review ${mistakeCount} to make the next result even stronger.`
          : "That strong result shows your practice is paying off.",
      tone: "success" as const,
    };
  }
  if (percentage >= 60) {
    return {
      icon: "trending-up-outline" as const,
      title: "Good effort—keep going",
      body: "Reviewing the questions below will make the next attempt feel easier.",
      tone: "primary" as const,
    };
  }
  return {
    icon: "leaf-outline" as const,
    title: "Every attempt builds fluency",
    body: "Take a quick look at what was difficult, then try again when you are ready.",
    tone: "primary" as const,
  };
}

export default function StudyCompletionSummary(props: Props) {
  const { theme } = props;
  const reducedMotion = useReducedMotion();
  const summary = getSummary(props);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const color =
    summary.tone === "success"
      ? theme.colors.success
      : summary.tone === "warning"
        ? theme.colors.warning
        : theme.colors.primary;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, reducedMotion, translateY]);

  return (
    <Animated.View
      accessible
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      style={{
        opacity,
        transform: [{ translateY }],
        borderRadius: 16,
        borderWidth: 1,
        borderColor: `${color}35`,
        backgroundColor: `${color}10`,
        padding: 13,
        marginBottom: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${color}18`,
          }}
        >
          <Ionicons name={summary.icon} size={21} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.bodyStrong, { color, fontSize: 14 }]}>
            {summary.title}
          </Text>
          <Text
            style={[
              theme.typography.caption,
              { color: theme.colors.textMuted, lineHeight: 18, marginTop: 3 },
            ]}
          >
            {summary.body}
          </Text>
        </View>
      </View>
      {!props.pendingSync && !props.requiresReview && props.focusAreas?.length ? (
        <View style={{ borderTopWidth: 1, borderTopColor: `${color}28`, marginTop: 12, paddingTop: 11 }}>
          <Text style={{ color: theme.colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.7 }}>
            REVIEW FOCUS
          </Text>
          <View style={{ marginTop: 8, gap: 7 }}>
            {props.focusAreas.map((area) => (
              <View key={area.key} style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
                <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: `${color}15`, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={area.icon} size={14} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 11, fontWeight: "900" }}>
                    {area.label} · {area.count}
                  </Text>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: 2 }}>
                    {area.recommendation}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          {props.onReviewMistakes ? (
            <TouchableOpacity
              onPress={props.onReviewMistakes}
              accessibilityRole="button"
              accessibilityLabel={`Review ${props.mistakeCount ?? 0} mistakes`}
              style={{ minHeight: 40, borderRadius: 11, backgroundColor: `${color}14`, borderWidth: 1, borderColor: `${color}35`, marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <Ionicons name="refresh-outline" size={15} color={color} />
              <Text style={{ color, fontSize: 11, fontWeight: "900" }}>Practise these mistakes</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {!props.pendingSync && (props.xpEarned || props.newAchievementTitles?.length || props.dailyGoalCompleted) ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: `${color}28`,
            marginTop: 12,
            paddingTop: 11,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 7,
          }}
        >
          {props.xpEarned ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                borderRadius: 999,
                paddingHorizontal: 9,
                paddingVertical: 6,
                backgroundColor: theme.colors.primarySoft,
              }}
            >
              <Ionicons name="star-outline" size={14} color={theme.colors.primary} />
              <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: "900" }}>
                +{props.xpEarned} XP
              </Text>
            </View>
          ) : null}
          {props.dailyGoalCompleted ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                borderRadius: 999,
                paddingHorizontal: 9,
                paddingVertical: 6,
                backgroundColor: `${theme.colors.success}16`,
              }}
            >
              <Ionicons name="flag-outline" size={14} color={theme.colors.success} />
              <Text style={{ color: theme.colors.success, fontSize: 11, fontWeight: "900" }}>
                Daily goal complete
              </Text>
            </View>
          ) : null}
          {props.newAchievementTitles?.map((title) => (
            <View
              key={title}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                borderRadius: 999,
                paddingHorizontal: 9,
                paddingVertical: 6,
                backgroundColor: `${theme.colors.violet}16`,
              }}
            >
              <Ionicons name="trophy-outline" size={14} color={theme.colors.violet} />
              <Text style={{ color: theme.colors.violet, fontSize: 11, fontWeight: "900" }}>
                {title}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}
