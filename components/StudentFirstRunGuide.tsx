import { useEffect, useMemo, useState } from "react";
import { Modal, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import AppButton from "./AppButton";
import { TouchableOpacity } from "../lib/hapticPressables";
import { useAppTheme } from "../lib/theme";

export type StudentGuideSection = "home" | "classrooms" | "lessons" | "practice" | "tests";

type StudentFirstRunGuideProps = {
  visible: boolean;
  studentName: string;
  teacherName: string;
  hasLessons: boolean;
  hasTests: boolean;
  onSectionChange: (section: StudentGuideSection) => void;
  onFinish: () => void;
};

export default function StudentFirstRunGuide({
  visible,
  studentName,
  teacherName,
  hasLessons,
  hasTests,
  onSectionChange,
  onFinish,
}: StudentFirstRunGuideProps) {
  const theme = useAppTheme();
  const { height } = useWindowDimensions();
  const compact = height < 700;
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(
    () => [
      {
        section: "home" as const,
        menuLabel: "Home",
        eyebrow: "YOUR LEARNING SPACE",
        title: `Hi ${studentName.trim() || "there"}! This is your Eluency home.`,
        description: `${teacherName.trim() || "Your teacher"} sets up your learning. Your assignments, practice progress, scores, and achievements all live here.`,
        icon: "sparkles-outline" as const,
        accent: theme.colors.primary,
        tip: "Your work saves automatically, so you can leave and continue later.",
      },
      {
        section: "classrooms" as const,
        menuLabel: "Classroom",
        eyebrow: "YOUR CLASSES",
        title: "Choose your classroom first.",
        description: "Open a classroom to see only its lessons and tests. Switch classes using Classroom in the bottom menu or the people icon at the top.",
        icon: "people-outline" as const,
        accent: theme.colors.primary,
        tip: "Work assigned outside a classroom is available under Direct assignments. Settings is the gear in the top-right.",
      },
      {
        section: "lessons" as const,
        menuLabel: "Lessons",
        eyebrow: "LESSONS",
        title: hasLessons ? "Start with what your teacher assigned." : "Your lessons will appear here.",
        description: hasLessons
          ? "After choosing your classroom, open a lesson to review its words, hear pronunciation, and choose how you want to practise."
          : "When your teacher assigns your first lesson, it will show up here automatically.",
        icon: "book-outline" as const,
        accent: theme.colors.success,
        tip: "Look for the action label on each lesson—it tells you what to do next.",
      },
      {
        section: "practice" as const,
        menuLabel: "Play",
        eyebrow: "PRACTICE",
        title: "The Play button is your practice shortcut.",
        description: "Choose typing, listening, review, or image practice. Eluency adapts to the words that need more attention.",
        icon: "play" as const,
        accent: theme.colors.violet,
        tip: "Mistakes are part of practice. Use hints, listen again, and keep going.",
      },
      {
        section: "tests" as const,
        menuLabel: "Tests",
        eyebrow: "TESTS & PROGRESS",
        title: hasTests ? "Tests show when you are ready to check your learning." : "Tests will appear when your teacher assigns them.",
        description: "Read the instructions before starting. Some answers may wait for teacher review before your final result appears.",
        icon: "clipboard-outline" as const,
        accent: theme.colors.violet,
        tip: "Need this guide again? Open Settings and tap “Show app guide.”",
      },
    ],
    [hasLessons, hasTests, studentName, teacherName, theme.colors.primary, theme.colors.success, theme.colors.violet]
  );

  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  useEffect(() => {
    if (!visible) {
      setStepIndex(0);
      return;
    }
    onSectionChange(step.section);
  }, [onSectionChange, step.section, visible]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onFinish}>
      <View
        accessibilityViewIsModal
        accessibilityLabel={`Student app guide, step ${stepIndex + 1} of ${steps.length}`}
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 16,
          backgroundColor: theme.isDark ? "rgba(2,6,12,0.24)" : "rgba(15,23,42,0.16)",
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 440,
            maxHeight: height - 32,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surface,
            paddingHorizontal: compact ? 14 : 18,
            paddingTop: compact ? 12 : 16,
            paddingBottom: compact ? 12 : 16,
            shadowColor: "#000000",
            shadowOpacity: theme.isDark ? 0.32 : 0.16,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[theme.typography.label, { color: step.accent }]}>QUICK TOUR · {stepIndex + 1} OF {steps.length}</Text>
            <TouchableOpacity
              onPress={onFinish}
              accessibilityRole="button"
              accessibilityLabel="Skip app guide"
              style={{ minWidth: 52, minHeight: compact ? 34 : 38, alignItems: "flex-end", justifyContent: "center" }}
            >
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, fontWeight: "800" }]}>Skip</Text>
            </TouchableOpacity>
          </View>

          <View>
            <View style={{ width: compact ? 40 : 46, height: compact ? 40 : 46, borderRadius: compact ? 13 : 15, marginTop: compact ? 3 : 5, alignItems: "center", justifyContent: "center", backgroundColor: `${step.accent}1C` }}>
              <Ionicons name={step.icon} size={compact ? 20 : 23} color={step.accent} />
            </View>
            <Text style={[theme.typography.label, { marginTop: compact ? 9 : 12, color: step.accent, fontSize: compact ? 10 : undefined }]}>{step.eyebrow}</Text>
            <Text style={[theme.typography.title, { marginTop: 4, fontSize: compact ? 18 : 20, lineHeight: compact ? 23 : 26 }]}>{step.title}</Text>
            <Text style={[theme.typography.body, { marginTop: compact ? 5 : 7, color: theme.colors.textMuted, fontSize: compact ? 13 : 14, lineHeight: compact ? 18 : 20 }]}>{step.description}</Text>

            <View style={{ marginTop: compact ? 10 : 13, borderRadius: 14, borderWidth: 1, borderColor: `${step.accent}55`, backgroundColor: `${step.accent}12`, padding: compact ? 10 : 12, flexDirection: "row", alignItems: "flex-start", gap: compact ? 8 : 10 }}>
              <Ionicons name="locate-outline" size={compact ? 17 : 19} color={step.accent} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={[theme.typography.caption, { color: theme.colors.text, fontWeight: "800", fontSize: compact ? 11 : 12, lineHeight: compact ? 16 : 18 }]}>Look for the highlighted {step.menuLabel} button below.</Text>
                <Text style={[theme.typography.caption, { marginTop: 2, color: theme.colors.textMuted, fontSize: compact ? 11 : 12, lineHeight: compact ? 16 : 18 }]}>{step.tip}</Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "center", gap: 7, marginVertical: compact ? 9 : 11 }}>
            {steps.map((item, index) => (
              <View
                key={item.section}
                style={{
                  width: index === stepIndex ? 24 : 7,
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: index === stepIndex ? step.accent : theme.colors.borderStrong,
                }}
              />
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            {stepIndex > 0 ? (
              <View style={{ flex: 0.7 }}>
                <AppButton label="Back" size="compact" variant="secondary" onPress={() => setStepIndex((current) => Math.max(0, current - 1))} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <AppButton
                label={isLastStep ? (hasLessons ? "Show my lessons" : "Start exploring") : "Next"}
                size="compact"
                onPress={() => {
                  if (isLastStep) {
                    onFinish();
                    return;
                  }
                  setStepIndex((current) => Math.min(steps.length - 1, current + 1));
                }}
                icon={<Ionicons name={isLastStep ? "checkmark" : "arrow-forward"} size={18} color={theme.colors.primaryText} />}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
