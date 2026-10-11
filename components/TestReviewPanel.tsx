import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import AppButton from "./AppButton";
import GlassCard from "./GlassCard";
import { TouchableOpacity } from "../lib/hapticPressables";
import type { AppTheme } from "../lib/theme";
import StudentWorkspaceActions from "./study/StudentWorkspaceActions";

export type TestReviewItem = {
  wordIndex: number;
  questionNumber: number;
  prompt: string;
  answer: string;
  status: "answered" | "skipped" | "unanswered";
  formatLabel: string;
};

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export default function TestReviewPanel({
  theme,
  topInset,
  bottomInset,
  title,
  items,
  timeRemainingSeconds,
  submitting,
  submissionError,
  onExit,
  onSettings,
  onClassrooms,
  onEdit,
  onBackToQuestions,
  onSubmit,
}: {
  theme: AppTheme;
  topInset: number;
  bottomInset: number;
  title: string;
  items: TestReviewItem[];
  timeRemainingSeconds?: number | null;
  submitting: boolean;
  submissionError?: string | null;
  onExit: () => void;
  onSettings: () => void;
  onClassrooms: () => void;
  onEdit: (wordIndex: number) => void;
  onBackToQuestions: () => void;
  onSubmit: () => void;
}) {
  const answeredCount = items.filter((item) => item.status === "answered").length;
  const skippedCount = items.filter((item) => item.status === "skipped").length;
  const unansweredCount = items.length - answeredCount - skippedCount;
  const completion = items.length > 0 ? Math.round(((answeredCount + skippedCount) / items.length) * 100) : 0;
  const warningColor = theme.colors.warning;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ paddingTop: Math.max(topInset, 8), paddingHorizontal: 16, alignItems: "flex-end" }}>
        <StudentWorkspaceActions colors={{ border: theme.colors.border, card: theme.colors.surface, muted: theme.colors.textMuted }}
          onSettings={onSettings} onClassrooms={onClassrooms} disabled={submitting} />
      </View>
      <View
        style={{
          paddingTop: 8,
          paddingHorizontal: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <TouchableOpacity
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel="Exit test"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="close" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[theme.typography.title, { fontSize: 18 }]} numberOfLines={1}>
            Review your test
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {timeRemainingSeconds != null ? (
          <View
            accessible
            accessibilityLabel={`${formatTime(timeRemainingSeconds)} remaining`}
            style={{
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 7,
              backgroundColor: `${timeRemainingSeconds <= 60 ? theme.colors.danger : theme.colors.primary}14`,
              borderWidth: 1,
              borderColor: `${timeRemainingSeconds <= 60 ? theme.colors.danger : theme.colors.primary}44`,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Ionicons
              name="timer-outline"
              size={14}
              color={timeRemainingSeconds <= 60 ? theme.colors.danger : theme.colors.primary}
            />
            <Text
              style={{
                color: timeRemainingSeconds <= 60 ? theme.colors.danger : theme.colors.primary,
                fontWeight: "900",
                fontSize: 12,
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatTime(timeRemainingSeconds)}
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard style={{ borderRadius: 20, marginBottom: 14 }} padding={16} variant="hero">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 15,
                backgroundColor: theme.colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="checkmark-done-outline" size={23} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.title, { fontSize: 18 }]}>Check before submitting</Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 3 }]}>
                Tap any question to change your response.
              </Text>
            </View>
            <Text style={[theme.typography.title, { color: theme.colors.primary, fontSize: 22 }]}>{completion}%</Text>
          </View>
          <View
            style={{
              height: 7,
              borderRadius: 999,
              backgroundColor: theme.colors.border,
              overflow: "hidden",
              marginTop: 14,
            }}
          >
            <View
              style={{
                width: `${completion}%`,
                height: "100%",
                borderRadius: 999,
                backgroundColor: theme.colors.primary,
              }}
            />
          </View>
          {unansweredCount > 0 || skippedCount > 0 ? (
            <View
              style={{
                marginTop: 12,
                borderRadius: 12,
                backgroundColor: `${warningColor}12`,
                borderWidth: 1,
                borderColor: `${warningColor}35`,
                paddingHorizontal: 11,
                paddingVertical: 9,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="alert-circle-outline" size={17} color={warningColor} />
              <Text style={[theme.typography.caption, { color: warningColor, flex: 1, fontWeight: "700" }]}>
                {unansweredCount > 0 ? `${unansweredCount} unanswered` : ""}
                {unansweredCount > 0 && skippedCount > 0 ? " • " : ""}
                {skippedCount > 0 ? `${skippedCount} skipped` : ""}
              </Text>
            </View>
          ) : null}
        </GlassCard>

        {submissionError ? (
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            style={{
              marginBottom: 14,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: `${theme.colors.danger}45`,
              backgroundColor: `${theme.colors.danger}10`,
              paddingHorizontal: 13,
              paddingVertical: 12,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 9,
            }}
          >
            <Ionicons name="alert-circle-outline" size={19} color={theme.colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.bodyStrong, { color: theme.colors.danger, fontSize: 13 }]}>Test not submitted yet</Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, lineHeight: 18, marginTop: 3 }]}>
                {submissionError}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={[theme.typography.label, { marginBottom: 9 }]}>QUESTIONS</Text>
        <View style={{ gap: 9 }}>
          {items.map((item) => {
            const statusColor =
              item.status === "answered"
                ? theme.colors.success
                : item.status === "skipped"
                  ? warningColor
                  : theme.colors.textMuted;
            const statusLabel =
              item.status === "answered" ? "Answered" : item.status === "skipped" ? "Skipped" : "Unanswered";
            return (
              <TouchableOpacity
                key={`${item.questionNumber}-${item.wordIndex}`}
                onPress={() => onEdit(item.wordIndex)}
                accessibilityRole="button"
                accessibilityLabel={`Question ${item.questionNumber}, ${statusLabel}. Edit response`}
                activeOpacity={0.84}
              >
                <GlassCard style={{ borderRadius: 15 }} padding={12} variant="strong">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 11,
                        backgroundColor: `${statusColor}12`,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: statusColor, fontSize: 12, fontWeight: "900" }}>
                        {item.questionNumber}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]} numberOfLines={2}>
                        {item.prompt || `Question ${item.questionNumber}`}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <Text style={[theme.typography.caption, { color: statusColor, fontWeight: "800" }]}>
                          {statusLabel}
                        </Text>
                        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>•</Text>
                        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                          {item.formatLabel}
                        </Text>
                      </View>
                      {item.answer ? (
                        <Text
                          style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 3 }]}
                          numberOfLines={1}
                        >
                          {item.answer}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
                  </View>
                </GlassCard>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: Math.max(bottomInset, 14),
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          gap: 8,
        }}
      >
        <AppButton
          label={submitting ? "Submitting securely..." : submissionError ? "Retry Submit" : "Submit Test"}
          onPress={onSubmit}
          loading={submitting}
          disabled={submitting}
          icon={!submitting ? <Ionicons name="paper-plane-outline" size={17} color={theme.colors.primaryText} /> : undefined}
        />
        <AppButton label="Back to Questions" variant="secondary" size="compact" onPress={onBackToQuestions} />
      </View>
    </View>
  );
}
