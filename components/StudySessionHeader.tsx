import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";

import { TouchableOpacity } from "../lib/hapticPressables";
import { useReducedMotion } from "../hooks/useReducedMotion";
import StudentWorkspaceActions from "./study/StudentWorkspaceActions";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type StudySessionHeaderColors = {
  card: string;
  text: string;
  muted: string;
  border: string;
  borderSoft: string;
  primary: string;
  warning: string;
  danger: string;
};

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default function StudySessionHeader({
  colors,
  topInset,
  title,
  subtitle,
  streak,
  index,
  total,
  timeRemainingSeconds,
  assignmentLabel,
  teacherInstructions,
  teacherName,
  learningObjective,
  languageDirection,
  onExit,
  onSettings,
  onClassrooms,
  navigationDisabled,
}: {
  colors: StudySessionHeaderColors;
  topInset: number;
  title: string;
  subtitle: string;
  streak: number;
  index: number;
  total: number;
  timeRemainingSeconds?: number | null;
  assignmentLabel?: string | null;
  teacherInstructions?: string | null;
  teacherName?: string | null;
  learningObjective?: string | null;
  languageDirection?: string | null;
  onExit: () => void;
  onSettings: () => void;
  onClassrooms: () => void;
  navigationDisabled?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const ring = 2 * Math.PI * 17;
  const progress = Math.min(index + 1, total) / Math.max(total, 1);
  const ringProgress = useRef(new Animated.Value(progress)).current;
  const streakScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) {
      ringProgress.setValue(progress);
      return;
    }
    Animated.timing(ringProgress, {
      toValue: progress,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, reducedMotion, ringProgress]);

  useEffect(() => {
    if (streak < 2 || reducedMotion) return;
    streakScale.setValue(0.92);
    Animated.spring(streakScale, {
      toValue: 1,
      friction: 5,
      tension: 170,
      useNativeDriver: true,
    }).start();
  }, [reducedMotion, streak, streakScale]);

  useEffect(() => {
    setDetailsExpanded(false);
  }, [assignmentLabel, learningObjective, teacherInstructions, title]);

  const strokeDashoffset = ringProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [ring, 0],
  });
  const timerColor =
    timeRemainingSeconds != null && timeRemainingSeconds <= 30
      ? colors.danger
      : timeRemainingSeconds != null && timeRemainingSeconds <= 300
        ? colors.warning
        : colors.primary;

  return (
    <View
      style={{
        paddingTop: Math.max(topInset, 5),
        paddingBottom: 5,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 6 }}>
        <StudentWorkspaceActions colors={colors} onSettings={onSettings} onClassrooms={onClassrooms} disabled={navigationDisabled} />
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
        }}
      >
      <TouchableOpacity
        onPress={onExit}
        accessibilityRole="button"
        accessibilityLabel="Exit study session"
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="close" size={16} color={colors.muted} />
      </TouchableOpacity>

      <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 8 }}>
        <Text
          style={{ color: colors.text, fontSize: 14, fontWeight: "800", textAlign: "center" }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={{
            color: colors.muted,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.1,
            marginTop: 1,
          }}
          numberOfLines={1}
        >
          {subtitle.toUpperCase()}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {timeRemainingSeconds != null ? (
          <View
            accessible
            accessibilityLabel={`${formatTime(timeRemainingSeconds)} remaining`}
            style={{
              minWidth: 56,
              minHeight: 30,
              paddingHorizontal: 8,
              borderRadius: 999,
              backgroundColor: `${timerColor}14`,
              borderWidth: 1,
              borderColor: `${timerColor}55`,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <Ionicons name="timer-outline" size={13} color={timerColor} />
            <Text style={{ color: timerColor, fontSize: 11, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
              {formatTime(timeRemainingSeconds)}
            </Text>
          </View>
        ) : streak >= 2 ? (
          <Animated.View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: `${colors.warning}14`,
              borderWidth: 1,
              borderColor: `${colors.warning}55`,
              transform: [{ scale: streakScale }],
            }}
          >
            <Ionicons name="flame" size={12} color={colors.warning} />
            <Text style={{ fontSize: 11, fontWeight: "800", color: colors.warning, marginLeft: 2 }}>{streak}</Text>
          </Animated.View>
        ) : null}

        <View
          accessible
          accessibilityLabel={`Question ${index + 1} of ${total}`}
          style={{ width: 44, height: 44 }}
        >
          <Svg width={44} height={44} style={{ position: "absolute" }}>
            <Circle cx={22} cy={22} r={17} stroke={colors.borderSoft} strokeWidth={3} fill="none" />
            <AnimatedCircle
              cx={22}
              cy={22}
              r={17}
              stroke={colors.primary}
              strokeWidth={3}
              fill="none"
              strokeDasharray={`${ring.toFixed(2)}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              rotation="-90"
              origin="22,22"
            />
          </Svg>
          <View
            style={{
              position: "absolute",
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 9, fontWeight: "900", color: colors.primary }}>
              {index + 1}/{total}
            </Text>
          </View>
        </View>
      </View>
      </View>

      {assignmentLabel || teacherInstructions || learningObjective || languageDirection ? (
        <View
          style={{
            marginTop: 4,
            marginBottom: 2,
            borderRadius: 11,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            overflow: "hidden",
          }}
        >
          <TouchableOpacity
            onPress={() => setDetailsExpanded((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={`${detailsExpanded ? "Hide" : "Show"} assignment details`}
            accessibilityState={{ expanded: detailsExpanded }}
            style={{ minHeight: 40, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <Ionicons name="person-outline" size={14} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 10, fontWeight: "900" }} numberOfLines={1}>
                {teacherName ? `From ${teacherName}` : "Assignment details"}
              </Text>
              {assignmentLabel ? (
                <Text style={{ color: colors.primary, fontSize: 9, fontWeight: "800", marginTop: 1 }} numberOfLines={1}>
                  {assignmentLabel}
                </Text>
              ) : null}
            </View>
            <Ionicons name={detailsExpanded ? "chevron-up" : "chevron-down"} size={14} color={colors.muted} />
          </TouchableOpacity>
          {detailsExpanded ? (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingHorizontal: 10, paddingVertical: 9, gap: 7 }}>
              {teacherInstructions ? (
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 7 }}>
                  <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.primary} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 9, fontWeight: "900" }}>Teacher instructions</Text>
                    <Text style={{ color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2 }}>{teacherInstructions}</Text>
                  </View>
                </View>
              ) : null}
              {learningObjective ? (
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 7 }}>
                  <Ionicons name="flag-outline" size={13} color={colors.primary} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 9, fontWeight: "900" }}>Learning goal</Text>
                    <Text style={{ color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2 }}>{learningObjective}</Text>
                  </View>
                </View>
              ) : null}
              {languageDirection ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Ionicons name="swap-horizontal-outline" size={13} color={colors.primary} />
                  <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800" }}>{languageDirection}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Ionicons name="eye-outline" size={13} color={colors.primary} />
                <Text style={{ flex: 1, color: colors.muted, fontSize: 10, lineHeight: 14 }}>
                  Your teacher can see completion and results for assigned work.
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
