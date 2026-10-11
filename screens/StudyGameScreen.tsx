import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  AppState,
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Pressable, TouchableOpacity } from "../lib/hapticPressables";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset } from "expo-asset";
import { NavigationProp, RouteProp, useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import * as Speech from "expo-speech";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import Svg, { Circle } from "react-native-svg";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import FloatingToast from "../components/FloatingToast";
import LessonPdfViewerModal from "../components/LessonPdfViewerModal";
import LessonAudioPlayer from "../components/LessonAudioPlayer";
import GlassCard from "../components/GlassCard";
import AppButton from "../components/AppButton";
import IconTile from "../components/IconTile";
import ScreenReveal from "../components/ScreenReveal";
import RemoteLessonImage from "../components/RemoteLessonImage";
import StudySessionHeader from "../components/StudySessionHeader";
import StudyCompletionSummary from "../components/StudyCompletionSummary";
import AchievementGalleryModal from "../components/AchievementGalleryModal";
import StudentFirstRunGuide, { type StudentGuideSection } from "../components/StudentFirstRunGuide";
import TestReviewPanel, { type TestReviewItem } from "../components/TestReviewPanel";
import StudyGameLoadingSkeleton from "../components/StudyGameLoadingSkeleton";
import StudentSettingsTab from "../components/study/StudentSettingsTab";
import StudentDashboardHeader from "../components/study/StudentDashboardHeader";
import StudentClassroomsTab from "../components/study/StudentClassroomsTab";
import StudentWorkspaceActions from "../components/study/StudentWorkspaceActions";
import type { StudyUi } from "../types/study-ui";
import { useFeedbackToast } from "../hooks/useFeedbackToast";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useDeferredStudyNotification } from "../hooks/useDeferredStudyNotification";
import { useTestDeadline } from "../hooks/useTestDeadline";
import { useAppTheme, type AppTheme } from "../lib/theme";
import { getApiBaseUrl } from "../lib/api/config";
import { waitForDraftSave } from "../lib/api/request";
import { bindStudentDataIdentity, restoreStudentDataIdentity, studentDataScope } from "../lib/studentDataStorage";
import { getClassroomNamesForAssignment, scopeStudentCatalog } from "../lib/classroomContracts";
import { cacheBustAssetUrl } from "../lib/imageCacheBust";
import { clearStoredStudentSessionId, getStoredStudentSessionId } from "../lib/studentSession";
import { endStudentSession } from "../lib/endStudentSession";
import {
  getAssignedLessons,
  getAssignedTests,
  getStudentFocusInterventions,
  getStudentSession,
  getStudentClassrooms,
  isRetryableStudyApiError,
  notifyLessonCompletion,
  recordResultEvent,
  requestTtsBase64,
  saveTestAttemptDraft,
  startTestAttempt,
  StudyApiError,
  submitTestAttempt,
  updateStudentFocusIntervention,
  type StudentFocusIntervention,
  type SubmitTestAttemptInput,
} from "../lib/api/study";
import {
  calculateStreak,
  createRecord,
  gradePercentage,
  pickSessionWords,
  unlockAchievements,
  updateUserStats,
  updateWordStats,
} from "../lib/game/engine";
import {
  ACHIEVEMENTS,
  calculateSessionXp,
  calculateTodayWords,
  calculateTotalXp,
  getLevelInfo,
  localDateKey,
  normalizeAchievementIds,
} from "../lib/game/engagement";
import {
  flushProgressSync,
  flushPendingTestAttempts,
  flushQueuedProgressSync,
  hydrateProgress,
  loadLocalProgress,
  mergeStudyProgress,
  queuePendingTestAttempt,
  removePendingTestAttempt,
  saveLocalProgress,
  scheduleProgressSync,
} from "../lib/game/progress";
import { getLanguageColor } from "../lib/game/languageColors";
import { countStudyReviewFocus } from "../lib/game/reviewFocus";
import { getStudentTestResultPresentation } from "../lib/game/resultPresentation";
import {
  firstUnansweredTestWordIndex,
  issuesToTestAnswers,
  testAnswersToIssues,
} from "../lib/game/testAttempts";
import {
  expandConjugationTablesForMode,
  getDisplayPrompt,
  getExpectedAnswer,
  normalizeLessonsToWords,
  normalizeTestsToWords,
} from "../lib/game/normalizers";
import {
  attachAssignmentDetails,
  compareAssignmentPriority,
  getAssignmentDueState,
  getAssignmentExpectationLabel,
  getLessonAssignmentProgress,
  getTestAssignmentProgress,
  normalizeStudentAssignmentDetails,
  type StudentAssignmentProgress,
} from "../lib/game/assignmentStatus";
import {
  PROMPT_ICON_OPTIONS,
  normalizePromptBuilderActivity,
  type PromptBuilderItem,
  type PromptElement,
} from "../lib/promptBuilder";
import { getDisplayLanguageMeta, historyDirectionLabel, labelDirectionForward, labelDirectionReverse, studySpeechLanguage, ttsLangFromShort } from "../lib/game/languagePair";
import {
  downloadLessonForOffline,
  getOfflineLessonSummaries,
  isDownloadedLessonStale,
  loadOfflineStudyCatalog,
  loadOfflineSessionSnapshot,
  saveOfflineSessionSnapshot,
  type OfflineLessonSummary,
} from "../lib/offline/offlineLessons";
import type {
  ActiveTestAttemptSession,
  GameWord,
  LessonGamePayload,
  StudentAssignmentDetail,
  StudentSessionPayload,
  StudyDirection,
  StudyProgress,
  StudyRecord,
  StudyRecordIssue,
  StudySessionMode,
  StudySessionType,
  TestGamePayload,
  VerifiedTestAttempt,
} from "../types/study-game";
import type { StudentMobileStackParamList } from "../lib/studentMobileNavigation";

type BottomTab = "home" | "lessons" | "practice" | "tests" | "classrooms" | "settings";
type RuntimeScreen = "dashboard" | "lesson-detail" | "test-detail" | "session" | "test-review" | "results";
type SessionIssue = StudyRecordIssue;
type ReviewableGameWord = GameWord & {
  reviewMode?: StudySessionMode;
  reviewIssue?: SessionIssue;
};
type LessonDownloadState = "downloading" | "removing" | "success";
type LessonStatusFilter = "action" | "completed" | "all";
type TestStatusFilter = "action" | "review" | "completed" | "all";
type AnswerFeedback = {
  state: "correct" | "close" | "wrong" | "recorded";
  text: string;
};

const REQUIRED_FOLLOW_UP_MODES = ["multiple-choice", "typing", "listening"] as const;
type FollowUpMode = (typeof REQUIRED_FOLLOW_UP_MODES)[number];

const FOLLOW_UP_MODE_LABELS: Record<FollowUpMode, string> = {
  "multiple-choice": "Multiple choice",
  typing: "Writing",
  listening: "Listening",
};

function getCompletedFollowUpModes(
  interventions: StudentFocusIntervention[]
): FollowUpMode[] {
  if (interventions.length === 0) return [];
  return REQUIRED_FOLLOW_UP_MODES.filter((mode) =>
    interventions.every((item) => item.completedModes?.includes(mode))
  );
}

function getNextFollowUpMode(
  interventions: StudentFocusIntervention[]
): FollowUpMode | null {
  const completed = getCompletedFollowUpModes(interventions);
  return REQUIRED_FOLLOW_UP_MODES.find((mode) => !completed.includes(mode)) ?? null;
}

type SavedResumeData = {
  version: 3;
  lessonId: string;
  lessonName: string;
  contentUpdatedAt: string | null;
  idx: number;
  correctCount: number;
  activeWords: GameWord[];
  sessionType: Exclude<StudySessionType, "test">;
  sessionMode: StudySessionMode;
  direction: StudyDirection;
  pool: GameWord[];
  sessionIssues?: SessionIssue[];
  sessionStreak?: number;
  mistakeWordIds?: string[];
  startedAt?: string | null;
  input?: string;
  useNativeAnswerKeyboard?: boolean;
  feedback?: AnswerFeedback | null;
  mcqChoiceTexts?: string[];
  mcqChoiceOptions?: Array<{ id: string; text: string }> | null;
  mcqSelection?: { key: string; correct: boolean | null } | null;
  conjugationInputs?: string[];
  conjugationRowFeedback?: Array<boolean | null>;
  showHint?: boolean;
  needsRetype?: boolean;
  showInfinitiveNote?: boolean;
  geminiCorrection?: string;
};

const studyApiBaseUrl = getApiBaseUrl();
const studyResumeStorageKey = (sessionId: string) => `eluency_lesson_resume:${studentDataScope(sessionId)}`;
const STUDY_SESSION_MODES = new Set<StudySessionMode>(["typing", "multiple-choice", "listening", "image"]);
const RESUMABLE_SESSION_TYPES = new Set<Exclude<StudySessionType, "test">>([
  "practice",
  "daily-challenge",
  "review-mistakes",
  "smart-review",
]);

function parseSavedResumeData(raw: string | null): SavedResumeData | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Omit<Partial<SavedResumeData>, "version"> & { version?: number };
    if (
      (value.version !== 2 && value.version !== 3) ||
      !RESUMABLE_SESSION_TYPES.has(value.sessionType as Exclude<StudySessionType, "test">) ||
      !STUDY_SESSION_MODES.has(value.sessionMode as StudySessionMode) ||
      (value.direction !== "pt-en" && value.direction !== "en-pt") ||
      typeof value.lessonId !== "string" ||
      !value.lessonId ||
      typeof value.lessonName !== "string" ||
      !Array.isArray(value.activeWords) ||
      value.activeWords.length === 0 ||
      !Array.isArray(value.pool) ||
      !Number.isInteger(value.idx) ||
      (value.idx as number) < 0 ||
      (value.idx as number) >= value.activeWords.length ||
      typeof value.correctCount !== "number"
    ) {
      return null;
    }
    return { ...value, version: 3 } as SavedResumeData;
  } catch {
    return null;
  }
}

function createAttemptKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}

type StudentEmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
};

type ContinueSuggestion =
  | {
      kind: "resume";
      title: string;
      subtitle: string;
      meta: string;
      ctaLabel: string;
      assignment?: StudentAssignmentDetail | null;
    }
  | {
      kind: "lesson";
      title: string;
      subtitle: string;
      meta: string;
      ctaLabel: string;
      lessonId: string;
      assignment?: StudentAssignmentDetail | null;
    }
  | {
      kind: "test";
      title: string;
      subtitle: string;
      meta: string;
      ctaLabel: string;
      testId: string;
      assignment?: StudentAssignmentDetail | null;
    };


const studyRadii = {
  card: 16,
  hero: 20,
  row: 12,
  control: 12,
  pill: 999,
};

const studyMetrics = {
  footerInputHeight: 48,
  footerButtonHeight: 46,
};

function assignmentStatusColor(status: StudentAssignmentProgress["status"], ui: StudyUi): string {
  if (status === "mastered" || status === "completed") return ui.success;
  if (status === "awaiting-review" || status === "retry-available") return ui.warning;
  if (status === "not-started") return ui.muted;
  return ui.primary;
}

function AssignmentStatusPill({
  progress,
  ui,
}: {
  progress: StudentAssignmentProgress;
  ui: StudyUi;
}) {
  const color = assignmentStatusColor(progress.status, ui);
  const icon = progress.status === "mastered" || progress.status === "completed"
    ? "checkmark-circle-outline"
    : progress.status === "awaiting-review"
      ? "time-outline"
      : progress.status === "retry-available"
        ? "refresh-outline"
        : progress.status === "in-progress"
          ? "play-circle-outline"
          : "ellipse-outline";
  return (
    <View
      accessible
      accessibilityLabel={`Status: ${progress.label}`}
      style={{
        height: 28,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: `${color}30`,
        backgroundColor: `${color}14`,
        paddingHorizontal: 7,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
    >
      <Ionicons name={icon} size={11} color={color} />
      <Text style={{ color, fontSize: 10.5, fontWeight: "700" }}>{progress.label}</Text>
    </View>
  );
}

function AssignmentExpectationBadge({
  assignment,
  ui,
}: {
  assignment?: StudentAssignmentDetail | null;
  ui: StudyUi;
}) {
  if (!assignment) return null;
  const due = getAssignmentDueState(assignment);
  const color = due.status === "overdue"
    ? ui.danger
    : due.status === "due-soon"
      ? ui.warning
      : assignment.required === false
        ? ui.secondary
        : ui.muted;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, minWidth: 0 }}>
      <Ionicons
        name={due.status === "overdue" ? "alert-circle-outline" : due.label ? "calendar-outline" : "flag-outline"}
        size={10}
        color={color}
      />
      <Text style={{ color, fontSize: 10, fontWeight: "500", flexShrink: 1 }} numberOfLines={1}>
        {getAssignmentExpectationLabel(assignment)}
      </Text>
    </View>
  );
}

function isIncompleteClassroomLesson(lesson: {
  classroomNames?: string[];
  assignmentProgress: StudentAssignmentProgress;
}) {
  return Boolean(lesson.classroomNames?.length) && lesson.assignmentProgress.actionRequired;
}

function ClassroomAssignmentPill({ classroomNames, ui }: { classroomNames?: string[]; ui: StudyUi }) {
  if (!Array.isArray(classroomNames) || classroomNames.length === 0) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Classroom assignment from ${classroomNames.join(", ")}`}
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: ui.classroomBorder,
        backgroundColor: ui.classroomSoft,
        paddingHorizontal: 6,
        paddingVertical: 2.5,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
    >
      <Ionicons name="people-outline" size={11} color={ui.classroomText} />
      <Text style={{ color: ui.classroomText, fontSize: 9.5, fontWeight: "700" }}>Classroom assignment</Text>
    </View>
  );
}

function AssignmentInformationCard({
  assignment,
  teacherName,
  ui,
}: {
  assignment?: StudentAssignmentDetail | null;
  teacherName?: string | null;
  ui: StudyUi;
}) {
  if (!assignment) return null;
  return (
    <GlassCard
      style={{
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: `${ui.primary}35`,
      }}
      padding={13}
      variant="strong"
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: ui.primarySoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="person-outline" size={18} color={ui.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: ui.text, fontSize: 14, fontWeight: "900" }}>
            {teacherName ? `From ${teacherName}` : "From your teacher"}
          </Text>
          <View style={{ marginTop: 5, alignSelf: "flex-start" }}>
            <AssignmentExpectationBadge assignment={assignment} ui={ui} />
          </View>
          {assignment.instructions ? (
            <Text style={{ color: ui.muted, fontSize: 13, lineHeight: 19, marginTop: 8 }}>
              {assignment.instructions}
            </Text>
          ) : null}
        </View>
      </View>
    </GlassCard>
  );
}

function CatalogFilterBar({
  value,
  options,
  onChange,
  ui,
  label,
}: {
  value: string;
  options: Array<{ value: string; label: string; count?: number }>;
  onChange: (value: string) => void;
  ui: StudyUi;
  label: string;
}) {
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: ui.muted, letterSpacing: 0.65, marginBottom: 7 }}>
        {label.toUpperCase()}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -16 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      >
        {options.map((option) => {
          const active = value === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              hitSlop={{ top: 2, bottom: 2, left: 0, right: 0 }}
              style={{
                height: 40,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: active ? ui.primary : ui.border,
                backgroundColor: active ? ui.primarySoft : ui.card,
                paddingHorizontal: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
              }}
            >
              <Text style={{ color: active ? ui.primary : ui.muted, fontSize: 11.5, fontWeight: active ? "700" : "600" }}>
                {option.label}
              </Text>
              {typeof option.count === "number" ? (
                <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: active ? ui.primary : ui.borderSoft, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                  <Text style={{ color: active ? ui.primaryText : ui.muted, fontSize: 9.5, fontWeight: "800" }}>{option.count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const CLOSE_MATCH_THRESHOLD = 85;
const CORRECT_DING_ASSET = require("../assets/Correct.mp3");
const QUICK_PLAY_COUNTS = [10, 15, 25, 50, 100] as const;

function AnimatedNumber({
  value,
  suffix = "",
  style,
  duration = 520,
}: {
  value: number;
  suffix?: string;
  style?: import("react-native").StyleProp<import("react-native").TextStyle>;
  duration?: number;
}) {
  const reducedMotion = useReducedMotion();
  const animated = useRef(new Animated.Value(value)).current;
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (reducedMotion) {
      animated.setValue(value);
      setDisplayValue(Math.round(value));
      return;
    }
    const listenerId = animated.addListener(({ value: nextValue }) => {
      setDisplayValue(Math.round(nextValue));
    });
    const animation = Animated.timing(animated, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => { animation.stop(); animated.removeListener(listenerId); };
  }, [animated, duration, reducedMotion, value]);

  return <Text style={style}>{displayValue}{suffix}</Text>;
}

function AnimatedProgressFill({
  progress,
  color,
}: {
  progress: number;
  color: string;
}) {
  const reducedMotion = useReducedMotion();
  const animated = useRef(new Animated.Value(Math.min(100, Math.max(0, progress)))).current;

  useEffect(() => {
    if (reducedMotion) {
      animated.setValue(Math.min(100, Math.max(0, progress)));
      return;
    }
    const animation = Animated.timing(animated, {
      toValue: Math.min(100, Math.max(0, progress)),
      duration: 560,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [animated, progress, reducedMotion]);

  const width = animated.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return <Animated.View style={{ height: "100%", width, backgroundColor: color }} />;
}

function PreparingChoicesPulse({ color }: { color: string }) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0.46)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(0.82);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 560, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.46, duration: 560, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reducedMotion]);

  return (
    <View style={{ gap: 8 }}>
      {[0, 1, 2].map((item) => (
        <Animated.View
          key={item}
          style={{
            height: 48,
            borderRadius: 12,
            backgroundColor: color,
            opacity,
          }}
        />
      ))}
    </View>
  );
}

function StudyTabMotion({ active, children }: { active: boolean; children: import("react").ReactNode }) {
  const reducedMotion = useReducedMotion();
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) { lift.setValue(0); return; }
    const animation = Animated.spring(lift, {
      toValue: active ? -3 : 0, stiffness: 260, damping: 24, mass: 0.7, useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [active, lift, reducedMotion]);
  return <Animated.View style={{ flex: 1, transform: [{ translateY: lift }] }}>{children}</Animated.View>;
}

function VoiceLoadingIcon({ size, color }: { size: number; color: string }) {
  const reducedMotion = useReducedMotion();
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) { rotation.setValue(0); return; }
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 720,
        isInteraction: false,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Ionicons name="sync-outline" size={size} color={color} />
    </Animated.View>
  );
}

function StudentEmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
}: StudentEmptyStateProps) {
  const theme = useAppTheme();
  const ui = theme.colors;
  const iconScale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.spring(iconScale, {
      toValue: 1,
      friction: 6,
      tension: 150,
      useNativeDriver: true,
    }).start();
  }, [iconScale]);

  return (
    <GlassCard style={{ borderRadius: 20 }} padding={18} variant="hero">
      <View style={{ alignItems: "center" }}>
        <Animated.View
          style={{
            width: 60,
            height: 60,
            borderRadius: 18,
            backgroundColor: ui.primarySoft,
            borderWidth: 1,
            borderColor: ui.borderStrong,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
            transform: [{ scale: iconScale }],
          }}
        >
          <Ionicons name={icon} size={26} color={ui.primary} />
        </Animated.View>
        <Text style={{ color: ui.text, fontSize: 20, fontWeight: "800", textAlign: "center" }}>{title}</Text>
        <Text style={{ color: ui.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8 }}>{body}</Text>
        {actionLabel && onAction ? (
          <TouchableOpacity
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            activeOpacity={0.88}
            style={{
              marginTop: 16,
              minWidth: 170,
              borderRadius: 14,
              backgroundColor: ui.primary,
              paddingHorizontal: 18,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: ui.primaryText, fontSize: 14, fontWeight: "800" }}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
        {secondaryLabel && onSecondaryAction ? (
          <TouchableOpacity
            onPress={onSecondaryAction}
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
            activeOpacity={0.8}
            style={{ marginTop: 10, padding: 4 }}
          >
            <Text style={{ color: ui.primary, fontSize: 13, fontWeight: "700" }}>{secondaryLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </GlassCard>
  );
}

function DetailTopBar({
  ui,
  topInset,
  title,
  onBack,
  onSettings,
  onClassrooms,
}: {
  ui: StudyUi;
  topInset: number;
  title: string;
  onBack: () => void;
  onSettings: () => void;
  onClassrooms: () => void;
}) {
  const iconButtonStyle = {
    width: 40,
    height: 40,
    borderRadius: studyRadii.control,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.card,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: ui.card,
        borderBottomWidth: 1,
        borderBottomColor: ui.border,
        paddingTop: Math.max(topInset, 8),
        paddingBottom: 10,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <TouchableOpacity
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={[iconButtonStyle, { marginRight: 12 }]}
      >
        <Ionicons name="chevron-back" size={18} color={ui.muted} />
      </TouchableOpacity>
      <Text style={{ flex: 1, fontWeight: "800", fontSize: 18, color: ui.text }}>{title}</Text>
      <StudentWorkspaceActions colors={ui} onSettings={onSettings} onClassrooms={onClassrooms} />
    </View>
  );
}

function FeedbackPanel({
  ui,
  feedback,
}: {
  ui: StudyUi;
  feedback: AnswerFeedback;
}) {
  const color =
    feedback.state === "correct"
      ? ui.success
      : feedback.state === "close"
        ? ui.warning
        : feedback.state === "recorded"
          ? ui.primary
          : ui.danger;
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scale.setValue(feedback.state === "correct" ? 0.98 : 1);
    translateX.setValue(0);
    if (feedback.state === "correct") {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.025, friction: 5, tension: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 150, useNativeDriver: true }),
      ]).start();
      return;
    }
    if (feedback.state === "recorded") return;
    Animated.sequence([
      Animated.timing(translateX, { toValue: -4, duration: 45, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 4, duration: 70, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  }, [feedback.state, feedback.text, scale, translateX]);

  return (
    <Animated.View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={feedback.text}
      style={{ padding: 11, borderRadius: studyRadii.row, borderWidth: 1, borderColor: color, backgroundColor: `${color}12`, transform: [{ translateX }, { scale }] }}
    >
      <Text style={{ fontWeight: "800", fontSize: 13, lineHeight: 18, color }}>
        {feedback.text}
      </Text>
    </Animated.View>
  );
}

function CorrectAnswerCelebration({
  ui,
  label = "Correct!",
}: {
  ui: StudyUi;
  label?: string;
}) {
  const scale = useRef(new Animated.Value(0.82)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(18)).current;
  const ringScale = useRef(new Animated.Value(0.72)).current;
  const ringOpacity = useRef(new Animated.Value(0.42)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 165,
        useNativeDriver: true,
      }),
      Animated.timing(lift, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 1.18,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [lift, opacity, ringOpacity, ringScale, scale]);

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 30,
        paddingHorizontal: 24,
      }}
    >
      <Animated.View
        style={{
          alignItems: "center",
          opacity,
          transform: [{ translateY: lift }, { scale }],
        }}
      >
        <View style={{ width: 108, height: 108, alignItems: "center", justifyContent: "center" }}>
          <Animated.View
            style={{
              position: "absolute",
              width: 108,
              height: 108,
              borderRadius: 54,
              borderWidth: 2,
              borderColor: `${ui.success}88`,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            }}
          />
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: ui.success,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: ui.success,
              shadowOpacity: 0.26,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }}
          >
            <Ionicons name="checkmark" size={40} color={ui.primaryText} />
          </View>
        </View>
        <Text
          style={{
            marginTop: 8,
            color: ui.success,
            fontSize: 34,
            lineHeight: 40,
            fontWeight: "900",
            textAlign: "center",
            textShadowColor: "rgba(0,0,0,0.10)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 2,
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}

const ANSWER_PAD_QWERTY_ROWS = [
  Array.from("qwertyuiop"),
  Array.from("asdfghjkl"),
  Array.from("zxcvbnm"),
];
const ANSWER_PAD_QWERTY_KEY_SET = new Set(ANSWER_PAD_QWERTY_ROWS.flat());

function buildAnswerPadExtraKeys(target: string) {
  const targetChars = Array.from(target.toLocaleLowerCase()).filter((char) => {
    if (/\s/u.test(char)) return false;
    return /[\p{L}\p{N}]/u.test(char) || char === "'" || char === "-" || char.charCodeAt(0) === 0x2019;
  });

  return Array.from(new Set(targetChars)).filter((char) => !ANSWER_PAD_QWERTY_KEY_SET.has(char));
}

function appendAnswerPadText(value: string, text: string, target: string) {
  if (/\s/u.test(text)) return `${value}${text}`;
  const template = Array.from(target.trim());
  let next = value;
  let nextIndex = Array.from(next).length;
  while (nextIndex < template.length && /\s/u.test(template[nextIndex])) {
    next += template[nextIndex];
    nextIndex += 1;
  }
  return `${next}${text}`;
}

function isStudySessionMode(value: unknown): value is StudySessionMode {
  return typeof value === "string" && STUDY_SESSION_MODES.has(value as StudySessionMode);
}

function getIssueReviewMode(issue?: SessionIssue): StudySessionMode | undefined {
  if (!issue) return undefined;
  if (issue.answerFormat === "mcq" || (issue.mcqOptions?.length ?? 0) >= 2) return "multiple-choice";
  return isStudySessionMode(issue.mode) ? issue.mode : undefined;
}

function testQuestionFormatLabel(word: GameWord): string {
  if (word.answerFormat === "mcq") return "Multiple choice";
  if (word.promptFormat === "fill_blank") return "Fill in the blank";
  if (word.promptFormat === "audio") return "Listening";
  if (word.promptFormat === "image") return "Image response";
  if (word.answerFormat === "open") return "Written response";
  return "Short answer";
}

function AnswerSlot({
  value,
  active,
  ui,
}: {
  value: string;
  active: boolean;
  ui: StudyUi;
}) {
  const scale = useRef(new Animated.Value(value ? 1 : 0.98)).current;
  const opacity = useRef(new Animated.Value(active ? 0.55 : 1)).current;

  useEffect(() => {
    if (value) {
      opacity.stopAnimation();
      opacity.setValue(1);
      scale.setValue(0.9);
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 180,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!active) {
      opacity.stopAnimation();
      opacity.setValue(1);
      scale.setValue(0.98);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, opacity, scale, value]);

  return (
    <Animated.View style={{ minWidth: 18, alignItems: "center", opacity, transform: [{ scale }] }}>
      <Text style={{ color: value ? ui.text : active ? ui.primary : ui.muted, fontSize: 21, lineHeight: 24, fontWeight: "900" }}>
        {value || "_"}
      </Text>
    </Animated.View>
  );
}

function StudyAnswerPad({
  ui,
  value,
  target,
  disabled,
  feedback,
  onChange,
}: {
  ui: StudyUi;
  value: string;
  target: string;
  disabled: boolean;
  feedback: AnswerFeedback | null;
  onChange: (value: string) => void;
}) {
  const extraKeys = useMemo(() => buildAnswerPadExtraKeys(target), [target]);
  const answerSlots = useMemo(() => {
    const template = Array.from(target.trim() || value);
    const typed = Array.from(value);
    return template.map((char, index) => ({
      key: `${char}-${index}`,
      isSpace: /\s/u.test(char),
      value: typed[index] ?? "",
    }));
  }, [target, value]);
  const activeSlotIndex = useMemo(
    () => answerSlots.findIndex((slot) => !slot.isSpace && !slot.value),
    [answerSlots]
  );
  const addText = (text: string) => {
    if (disabled) return;
    onChange(appendAnswerPadText(value, text, target));
  };
  const removeLast = () => {
    if (disabled || !value) return;
    onChange(Array.from(value).slice(0, -1).join(""));
  };
  const clear = () => {
    if (disabled || !value) return;
    onChange("");
  };
  const answerPadOpacity = disabled ? 0.72 : 1;

  return (
    <View style={{ gap: 8 }}>
      {feedback ? <FeedbackPanel ui={ui} feedback={feedback} /> : null}

      <View
        style={{
          minHeight: 58,
          borderWidth: 1,
          borderColor: ui.border,
          borderRadius: studyRadii.control,
          backgroundColor: ui.card,
          paddingHorizontal: 12,
          paddingVertical: 10,
          alignItems: "center",
          justifyContent: "center",
          opacity: answerPadOpacity,
        }}
      >
        {answerSlots.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", rowGap: 8, columnGap: 7 }}>
            {answerSlots.map((slot) =>
              slot.isSpace ? (
                <View key={slot.key} style={{ width: 13 }} />
              ) : (
                <AnswerSlot key={slot.key} value={slot.value} active={activeSlotIndex === -1 ? false : answerSlots[activeSlotIndex]?.key === slot.key} ui={ui} />
              )
            )}
          </View>
        ) : (
          <Text style={{ color: "#98A0B2", fontSize: 16, fontWeight: "600" }}>Tap letters to answer</Text>
        )}
        {value.length > answerSlots.length && answerSlots.length > 0 ? (
          <Text numberOfLines={1} style={{ marginTop: 5, color: ui.muted, fontSize: 12, fontWeight: "700" }}>
            {value}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 7, opacity: answerPadOpacity }}>
        {ANSWER_PAD_QWERTY_ROWS.map((row, rowIndex) => (
          <View
            key={`qwerty-row-${rowIndex}`}
            style={{
              flexDirection: "row",
              gap: 5,
              justifyContent: "center",
              paddingHorizontal: rowIndex === 1 ? 12 : rowIndex === 2 ? 8 : 0,
            }}
          >
            {row.map((key) => (
              <TouchableOpacity
                key={key}
                onPress={() => addText(key)}
                accessibilityRole="button"
                accessibilityLabel={`Letter ${key}`}
                disabled={disabled}
                style={{
                  flex: 1,
                  height: 46,
                  minWidth: 0,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: ui.border,
                  backgroundColor: ui.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: ui.text, fontSize: 21, fontWeight: "900" }}>{key}</Text>
              </TouchableOpacity>
            ))}
            {rowIndex === 2 ? (
              <TouchableOpacity
                onPress={removeLast}
                accessibilityRole="button"
                accessibilityLabel="Delete last character"
                disabled={disabled || !value}
                style={{
                  flex: 1.18,
                  height: 46,
                  minWidth: 0,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: ui.border,
                  backgroundColor: ui.card,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: value ? 1 : 0.5,
                }}
              >
                <Ionicons name="backspace-outline" size={21} color={ui.text} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        {extraKeys.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
            {extraKeys.map((key) => (
              <TouchableOpacity
                key={key}
                onPress={() => addText(key)}
                accessibilityRole="button"
                accessibilityLabel={`Character ${key}`}
                disabled={disabled}
                style={{
                  minWidth: 46,
                  height: 46,
                  paddingHorizontal: 12,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: ui.borderStrong,
                  backgroundColor: ui.primarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: ui.primary, fontSize: 21, fontWeight: "900" }}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: 7, opacity: answerPadOpacity }}>
        <TouchableOpacity
          onPress={() => addText(" ")}
          accessibilityRole="button"
          accessibilityLabel="Space"
          disabled={disabled}
          style={{
            flex: 1,
            minHeight: 42,
            borderRadius: 11,
            borderWidth: 1,
            borderColor: ui.border,
            backgroundColor: ui.card,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: ui.text, fontSize: 13, fontWeight: "800" }}>Space</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={clear}
          accessibilityRole="button"
          accessibilityLabel="Clear answer"
          disabled={disabled || !value}
          style={{
            width: 72,
            minHeight: 42,
            borderRadius: 11,
            borderWidth: 1,
            borderColor: ui.border,
            backgroundColor: ui.card,
            alignItems: "center",
            justifyContent: "center",
            opacity: value ? 1 : 0.5,
          }}
        >
          <Text style={{ color: ui.muted, fontSize: 13, fontWeight: "800" }}>Clear</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SessionFooter({
  ui,
  bottomInset,
  showInput,
  input,
  onInputChange,
  useAnswerPad,
  answerPadTarget,
  answerPadDisabled,
  needsRetype,
  feedback,
  showSubmit,
  submitDisabled,
  onSubmit,
  showSkip,
  onSkip,
  skipFullWidth,
}: {
  ui: StudyUi;
  bottomInset: number;
  showInput: boolean;
  input: string;
  onInputChange: (value: string) => void;
  useAnswerPad: boolean;
  answerPadTarget: string;
  answerPadDisabled: boolean;
  needsRetype: boolean;
  feedback: AnswerFeedback | null;
  showSubmit: boolean;
  submitDisabled: boolean;
  onSubmit: () => void;
  showSkip: boolean;
  onSkip: () => void;
  skipFullWidth: boolean;
}) {
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: Math.max(bottomInset, 6),
        borderTopWidth: 1,
        borderTopColor: ui.border,
        backgroundColor: ui.bg,
        gap: 8,
      }}
    >
      {showInput && useAnswerPad ? (
        <StudyAnswerPad
          ui={ui}
          value={input}
          target={answerPadTarget}
          disabled={answerPadDisabled}
          feedback={feedback}
          onChange={onInputChange}
        />
      ) : showInput ? (
        <TextInput
          value={input}
          onChangeText={onInputChange}
          placeholder={needsRetype ? "Type the exact answer..." : "Type your answer..."}
          placeholderTextColor="#98A0B2"
          returnKeyType="done"
          onSubmitEditing={submitDisabled ? undefined : onSubmit}
          accessibilityLabel="Your answer"
          accessibilityHint="Enter the answer, then activate Submit"
          style={{
            minHeight: studyMetrics.footerInputHeight,
            borderWidth: 1,
            borderColor: ui.border,
            borderRadius: studyRadii.control,
            backgroundColor: ui.card,
            color: ui.text,
            paddingHorizontal: 14,
            paddingVertical: 11,
            fontSize: 16,
          }}
        />
      ) : null}

      {feedback && !useAnswerPad ? <FeedbackPanel ui={ui} feedback={feedback} /> : null}

      <View style={{ flexDirection: "row", gap: 8 }}>
        {showSkip ? (
          <TouchableOpacity
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip question"
            style={{
              minHeight: studyMetrics.footerButtonHeight,
              borderRadius: studyRadii.control,
              borderWidth: 1,
              borderColor: ui.border,
              backgroundColor: ui.card,
              paddingHorizontal: 16,
              justifyContent: "center",
              alignItems: "center",
              flex: skipFullWidth ? 1 : undefined,
            }}
          >
            <Text style={{ color: ui.muted, fontWeight: "700", fontSize: 14 }}>Skip</Text>
          </TouchableOpacity>
        ) : null}
        {showSubmit ? (
          <TouchableOpacity
            onPress={onSubmit}
            accessibilityRole="button"
            accessibilityLabel={needsRetype ? "Confirm corrected answer" : "Submit answer"}
            accessibilityState={{ disabled: submitDisabled }}
            disabled={submitDisabled}
            style={{
              flex: 1,
              minHeight: studyMetrics.footerButtonHeight,
              borderRadius: studyRadii.control,
              backgroundColor: ui.primary,
              opacity: submitDisabled ? 0.45 : 1,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 7,
            }}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color={ui.primaryText} />
            <Text style={{ color: ui.primaryText, fontSize: 15, fontWeight: "800" }}>Submit</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function ReviewIssueCard({
  issue,
  index,
  theme,
  showExpected = true,
}: {
  issue: SessionIssue;
  index: number;
  theme: AppTheme;
  showExpected?: boolean;
}) {
  const isMcqReview = issue.answerFormat === "mcq" || issue.mode === "multiple-choice" || (issue.mcqOptions?.length ?? 0) >= 2;
  const formatLabel = isMcqReview
    ? "Multiple choice"
    : issue.promptFormat === "fill_blank"
      ? "Fill in the blank"
      : issue.mode === "listening"
        ? "Listening"
        : issue.mode === "image"
          ? "Image"
          : "Typing";
  const selectedAnswerNorm = typeof issue.answer === "string" ? normalizeText(issue.answer) : "";
  const expectedNorm = typeof issue.expected === "string" ? normalizeText(issue.expected) : "";
  const entryOpacity = useRef(new Animated.Value(0)).current;
  const entryY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entryOpacity, {
        toValue: 1,
        duration: 260,
        delay: Math.min(index * 28, 180),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(entryY, {
        toValue: 0,
        duration: 300,
        delay: Math.min(index * 28, 180),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [entryOpacity, entryY, index]);

  return (
    <Animated.View
      key={`${issue.id}-${index}`}
      style={{
        borderRadius: studyRadii.row,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceGlass,
        padding: 12,
        opacity: entryOpacity,
        transform: [{ translateY: entryY }],
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name={reviewIssueIcon(issue.kind)} size={14} color={reviewIssueColor(theme, issue.kind)} />
        <Text style={[theme.typography.bodyStrong, { fontSize: 11.5 }]}>
          {reviewIssueLabel(issue.kind)}
        </Text>
        <View style={{ borderRadius: 999, backgroundColor: theme.colors.primarySoft, paddingHorizontal: 7, paddingVertical: 2 }}>
          <Text style={{ color: theme.colors.primary, fontSize: 10, fontWeight: "800" }}>{formatLabel}</Text>
        </View>
        {issue.kind === "correct" ? (
          <View style={{ borderRadius: 999, backgroundColor: `${theme.colors.success}16`, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: theme.colors.success, fontSize: 10, fontWeight: "900" }}>Fixed</Text>
          </View>
        ) : null}
      </View>
      <Text style={[theme.typography.body, { marginTop: 6, fontSize: 12, lineHeight: 18 }]}>
        Prompt: {typeof issue.prompt === "string" ? issue.prompt || "Untitled" : "Untitled"}
      </Text>
      {isMcqReview && (issue.mcqOptions?.length ?? 0) >= 2 ? (
        <View style={{ marginTop: 8, gap: 6 }}>
          {issue.mcqOptions?.map((option, optionIndex) => {
            const optionNorm = normalizeText(option.text);
            const correct = showExpected && (Boolean(option.correct) || (!!expectedNorm && optionNorm === expectedNorm));
            const selected =
              issue.selectedOptionId != null && option.id != null
                ? String(issue.selectedOptionId) === String(option.id)
                : !!selectedAnswerNorm && optionNorm === selectedAnswerNorm;
            const borderColor = correct ? theme.colors.success : selected ? theme.colors.danger : theme.colors.border;
            const bg = correct
              ? `${theme.colors.success}12`
              : selected
                ? `${theme.colors.danger}10`
                : theme.colors.surfaceAlt;
            return (
              <View
                key={`${option.text}-${optionIndex}`}
                style={{
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: bg,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Text style={{ flex: 1, color: theme.colors.text, fontSize: 12, fontWeight: "700" }}>{option.text}</Text>
                {correct ? <Ionicons name="checkmark-circle" size={15} color={theme.colors.success} /> : null}
                {!correct && selected ? <Ionicons name="close-circle" size={15} color={theme.colors.danger} /> : null}
              </View>
            );
          })}
        </View>
      ) : showExpected && typeof issue.expected === "string" && issue.expected ? (
        <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted, lineHeight: 18 }]}>
          Expected: {issue.expected}
        </Text>
      ) : null}
      {typeof issue.answer === "string" && issue.answer ? (
        <Text style={[theme.typography.caption, { marginTop: 3, color: theme.colors.textMuted, lineHeight: 18 }]}>
          Answer: {issue.answer}
        </Text>
      ) : null}
    </Animated.View>
  );
}

function CompletionBadge({ passed, theme }: { passed: boolean; theme: AppTheme }) {
  const scale = useRef(new Animated.Value(0.82)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  const color = passed ? theme.colors.success : theme.colors.primary;

  return (
    <Animated.View
      style={{
        width: 38,
        height: 38,
        borderRadius: 13,
        backgroundColor: `${color}16`,
        borderWidth: 1,
        borderColor: `${color}44`,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale }],
      }}
    >
      <Ionicons name={passed ? "checkmark-circle" : "trending-up"} size={20} color={color} />
    </Animated.View>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type LessonWordRow = NonNullable<LessonGamePayload["words"]>[number];

/** Raw lesson row terms for detail UI (en-pt uses pt/en; other pairs use term_a/term_b). */
function lessonListRowTerms(word: LessonWordRow, pair: string | undefined) {
  const legacy = !pair || pair === "en-pt";
  const termA = legacy ? String(word.pt ?? "").trim() : String(word.term_a ?? word.pt ?? "").trim();
  const termB = legacy ? String(word.en ?? "").trim() : String(word.term_b ?? word.en ?? "").trim();
  const ctxA = legacy
    ? typeof word.sp === "string"
      ? word.sp.trim()
      : ""
    : String(word.context_a ?? "").trim();
  const ctxB = legacy
    ? typeof word.se === "string"
      ? word.se.trim()
      : ""
    : String(word.context_b ?? "").trim();
  return { termA, termB, ctxA, ctxB };
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function localAnswerFallback(expected: string, answer: string, alternatives: string[]) {
  const expNorm = normalizeText(expected);
  const ansNorm = normalizeText(answer);
  const alts = alternatives.map(normalizeText).filter(Boolean);
  if (!ansNorm) return { isCorrect: false, close: false };
  if (ansNorm === expNorm || alts.includes(ansNorm)) return { isCorrect: true, close: false };
  const dist = levenshtein(ansNorm, expNorm);
  const maxLen = Math.max(ansNorm.length, expNorm.length);
  const similarity = maxLen > 0 ? ((maxLen - dist) / maxLen) * 100 : 100;
  const closeBySingleTypo = expNorm.length >= 4 && dist <= 1;
  const closeBySimilarity = similarity >= CLOSE_MATCH_THRESHOLD;
  const close = expNorm.length > 0 && (closeBySingleTypo || closeBySimilarity);
  return { isCorrect: false, close };
}

function PromptBuilderElementView({ element, ui, compact = false }: { element: PromptElement; ui: any; compact?: boolean }) {
  const size = compact ? 56 : 80;
  if (element.kind === "image") {
    return element.image_url ? (
      <RemoteLessonImage uri={element.image_url} style={{ width: size, height: size, borderRadius: compact ? 14 : 19 }} resizeMode="cover" />
    ) : <Ionicons name="image-outline" size={compact ? 25 : 34} color={ui.muted} />;
  }
  if (element.kind === "icon") {
    const icon = PROMPT_ICON_OPTIONS.find((option) => option.value === element.value);
    return <Ionicons name={(icon?.ionicon ?? "shapes-outline") as any} size={compact ? 28 : 38} color={ui.primary} />;
  }
  return (
    <Text style={{ maxWidth: compact ? 110 : 145, textAlign: "center", color: ui.text, fontSize: element.kind === "emoji" ? (compact ? 30 : 40) : (compact ? 15 : 19), lineHeight: element.kind === "emoji" ? (compact ? 36 : 46) : (compact ? 20 : 24), fontWeight: "900" }}>
      {element.value}
    </Text>
  );
}

function PromptBuilderFormulaView({ item, instruction, ui, compact = false, revealAnswer = false }: { item: PromptBuilderItem; instruction?: string; ui: any; compact?: boolean; revealAnswer?: boolean }) {
  const boxSize = compact ? 70 : 96;
  return (
    <View>
      {instruction ? <Text style={{ color: ui.text, fontSize: compact ? 12 : 14, lineHeight: compact ? 17 : 20, fontWeight: "700", textAlign: compact ? "left" : "center", marginBottom: 10 }}>{instruction}</Text> : null}
      <View style={{ width: "100%", maxWidth: compact ? 270 : 320, alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: compact ? 6 : 8 }}>
        <View style={{ flex: 1, minWidth: 0, maxWidth: compact ? 116 : 140, minHeight: boxSize, padding: 6, borderWidth: 1, borderColor: ui.border, borderRadius: compact ? 12 : 16, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}><PromptBuilderElementView element={item.a} ui={ui} compact={compact} /></View>
        <Text style={{ color: ui.primary, fontSize: compact ? 19 : 24, fontWeight: "900" }}>+</Text>
        <View style={{ flex: 1, minWidth: 0, maxWidth: compact ? 116 : 140, minHeight: boxSize, padding: 6, borderWidth: 1, borderColor: ui.border, borderRadius: compact ? 12 : 16, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}><PromptBuilderElementView element={item.b} ui={ui} compact={compact} /></View>
      </View>
      {revealAnswer ? <View style={{ width: "100%", maxWidth: compact ? 270 : 320, alignSelf: "center", alignItems: "center", gap: 4, marginTop: 6 }}><Ionicons name="arrow-down" size={compact ? 13 : 16} color={ui.primary} /><View style={{ width: "100%", minHeight: compact ? 38 : 44, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: ui.primary, borderRadius: compact ? 10 : 12, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}><Text style={{ color: ui.primary, fontSize: compact ? 12 : 14, fontWeight: "900", textAlign: "center" }}>{item.expectedAnswer}</Text></View></View> : !compact ? <View style={{ width: "100%", maxWidth: 320, alignSelf: "center", alignItems: "center", gap: 4, marginTop: 6 }}><Ionicons name="arrow-down" size={15} color={ui.primary} /><View style={{ width: "100%", minHeight: 38, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderStyle: "dashed", borderColor: ui.primary, borderRadius: 11, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}><Text style={{ color: ui.primary, fontSize: 10, fontWeight: "900", textAlign: "center" }}>Type your answer below</Text></View></View> : null}
    </View>
  );
}

function getAcceptedAnswers(target: string, current: GameWord | undefined, direction: StudyDirection) {
  const t = typeof target === "string" ? target.trim() : "";
  const accepted = [t, ...(current?.acceptedAnswers ?? [])];
  const enAlt = Array.isArray((current as { en_alt?: string[] } | undefined)?.en_alt)
    ? (current as { en_alt?: string[] }).en_alt ?? []
    : [];
  if (direction === "pt-en" && enAlt.length) {
    accepted.push(...enAlt.filter(Boolean));
  }
  if (direction === "en-pt" && current?.pt_alt?.length) {
    accepted.push(...current.pt_alt.filter(Boolean));
  }
  if (t && /^\s*to\s+/i.test(t)) {
    const bare = t.replace(/^\s*to\s+/i, "").trim();
    if (bare && !accepted.includes(bare)) accepted.push(bare);
  }
  return accepted;
}

function isInfinitiveWord(current: GameWord | undefined, target: string, source: string, targetLang: "pt" | "en") {
  if (!target || typeof target !== "string") return false;
  /** Conjugation/preposition prompts contain the infinitive in text; do not treat as EN infinitive gloss. */
  if (current?.practiceKind === "conjugation" || current?.practiceKind === "conjugation-table" || current?.practiceKind === "preposition" || current?.practiceKind === "prompt-builder")
    return false;
  if (/^\s*to\s+/i.test(target.trim())) return true;
  if (targetLang !== "en") return false;
  return /(ar|er|ir)$/i.test(String(source || "").trim());
}

function titleCaseVerb(s: string) {
  const t = (s ?? "").trim();
  if (!t) return "-";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function maskWord(sentence: string, wordToHide: string) {
  const words = String(wordToHide || "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean);
  return String(sentence || "")
    .split(" ")
    .map((word) => {
      const cleanWord = word.toLowerCase().replace(/[.,!?;:'"()]/g, "");
      if (words.some((w) => cleanWord === w || cleanWord.includes(w))) {
        const punct = word.match(/[.,!?;:'"()]+$/)?.[0] || "";
        const base = word.replace(/[.,!?;:'"()]+$/, "");
        if (!base) return word;
        return `${base[0]} ${Array(Math.max(base.length - 1, 0)).fill("_").join(" ")}${punct}`;
      }
      return word;
    })
    .join(" ");
}

function safeLength(value: unknown) {
  return Array.isArray(value) || typeof value === "string" ? value.length : 0;
}

function reviewIssueLabel(kind: SessionIssue["kind"]) {
  if (kind === "correct") return "Correct";
  if (kind === "open_review") return "Review";
  if (kind === "skip") return "Skipped";
  if (kind === "close") return "Close";
  return "Wrong";
}

function reviewIssueIcon(kind: SessionIssue["kind"]) {
  if (kind === "correct") return "checkmark-circle" as const;
  if (kind === "open_review") return "document-text-outline" as const;
  if (kind === "close") return "alert-circle-outline" as const;
  return "close-circle" as const;
}

function reviewIssueColor(theme: AppTheme, kind: SessionIssue["kind"]) {
  if (kind === "correct") return theme.colors.success;
  if (kind === "open_review") return theme.colors.primary;
  if (kind === "close") return theme.colors.warning;
  return theme.colors.danger;
}

function LessonDownloadStatusIcon({
  state,
  downloaded,
  stale,
  ui,
  size = 18,
}: {
  state?: LessonDownloadState;
  downloaded: boolean;
  stale: boolean;
  ui: StudyUi;
  size?: number;
}) {
  const scale = useRef(new Animated.Value(0.92)).current;
  const iconKey = state === "success" ? "success" : downloaded && !stale ? "downloaded" : stale ? "stale" : "download";

  useEffect(() => {
    scale.setValue(0.86);
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [iconKey, scale]);

  if (state === "downloading" || state === "removing") {
    return <ActivityIndicator size="small" color={state === "removing" ? ui.muted : ui.primary} />;
  }

  const name: keyof typeof Ionicons.glyphMap =
    state === "success"
      ? "thumbs-up"
      : downloaded && !stale
        ? "checkmark"
        : stale
          ? "cloud-download-outline"
          : "download-outline";
  const color = state === "success" || (downloaded && !stale) ? ui.success : ui.primary;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

function normalizeAbsoluteDocumentUrl(sourceUrl: string) {
  if (/^(file|content|asset):\/\//i.test(sourceUrl.trim())) return sourceUrl.trim();
  if (/^https?:\/\//i.test(sourceUrl)) return sourceUrl;
  const host = studyApiBaseUrl.replace(/\/$/, "");
  if (sourceUrl.startsWith("/")) return `${host}${sourceUrl}`;
  return `${host}/${sourceUrl}`;
}

export default function StudyGameScreen() {
  const theme = useAppTheme();
  const { width: viewportWidth, fontScale } = useWindowDimensions();
  const tinyStudentHome = viewportWidth < 350;
  const largeStudentText = fontScale > 1.15;
  const compactStudentHome = viewportWidth < 390 || largeStudentText;
  const studentHeroRingSize = tinyStudentHome ? 68 : compactStudentHome ? 76 : viewportWidth < 410 ? 82 : viewportWidth < 450 ? 86 : 90;
  const studentHeroRingRadius = (studentHeroRingSize - 16) / 2;
  const studentHeroCtaWidth = tinyStudentHome ? 90 : compactStudentHome ? 106 : viewportWidth < 410 ? 114 : viewportWidth < 480 ? 134 : 148;
  const studentHeroCtaHeight = tinyStudentHome ? 104 : compactStudentHome ? 108 : viewportWidth < 410 ? 114 : viewportWidth < 450 ? 120 : 124;
  const studentHeroHeadlineSize = tinyStudentHome ? 20 : 24;
  const reducedMotion = useReducedMotion();
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const hasContentEnteredRef = useRef(false);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<StudentMobileStackParamList>>();
  const route = useRoute<RouteProp<StudentMobileStackParamList, "StudyGame">>();
  const routeSessionId = route.params?.sessionId?.trim() || null;
  const [sessionId, setResolvedSessionId] = useState<string | null>(null);
  const [sessionBootstrapComplete, setSessionBootstrapComplete] = useState(false);
  /** Login persists the canonical session id; route params can lag behind (e.g. Stack initialParams). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getStoredStudentSessionId();
        if (cancelled) return;
        const effectiveSessionId = stored?.trim() || null;
        setResolvedSessionId(effectiveSessionId);
        setSessionBootstrapComplete(true);
        if (effectiveSessionId && effectiveSessionId !== routeSessionId) {
          navigation.setParams({ sessionId: effectiveSessionId });
        }
      } catch {
        if (!cancelled) {
          setResolvedSessionId(null);
          setSessionBootstrapComplete(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigation, routeSessionId]);

  const [loading, setLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [initialLoadRetry, setInitialLoadRetry] = useState(0);
  const [runtimeScreen, setRuntimeScreen] = useState<RuntimeScreen>("dashboard");
  const [activeTab, setActiveTab] = useState<BottomTab>("home");
  const [studentName, setStudentName] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [studentSession, setStudentSession] = useState<StudentSessionPayload | null>(null);
  const studentSessionRef = useRef(studentSession);
  studentSessionRef.current = studentSession;
  const [catalogLessonsData, setLessonsData] = useState<LessonGamePayload[]>([]);
  const [catalogTestsData, setTestsData] = useState<TestGamePayload[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);
  const selectedClassroomIdRef = useRef(selectedClassroomId);
  selectedClassroomIdRef.current = selectedClassroomId;
  const [studentGuideVisible, setStudentGuideVisible] = useState(false);
  const [studentGuideSection, setStudentGuideSection] = useState<StudentGuideSection>("home");
  const studentGuideMenuPulse = useRef(new Animated.Value(0)).current;
  const studentGuideResolvedIdRef = useRef<string | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [downloadedLessons, setDownloadedLessons] = useState<Record<string, OfflineLessonSummary>>({});
  const [lessonDownloadState, setLessonDownloadState] = useState<Record<string, LessonDownloadState>>({});
  /** Bumps on each successful lesson/test catalog load so image URLs change (cache bust + expo-image). */
  const assetCatalogEpochRef = useRef(0);
  const [assetRefreshEpoch, setAssetRefreshEpoch] = useState(0);
  const [catalogLessonsWords, setLessonsWords] = useState<GameWord[]>([]);
  const [catalogTestsWords, setTestsWords] = useState<GameWord[]>([]);
  const [progress, setProgress] = useState<StudyProgress | null>(null);

  const classrooms = useMemo(() => studentSession?.student.classrooms ?? [], [studentSession]);
  const selectedClassroom = classrooms.find((item) => item.id === selectedClassroomId) ?? null;
  const lessonsData = useMemo(() => scopeStudentCatalog(catalogLessonsData, "lesson", selectedClassroom,
    studentSession?.student.classrooms, studentSession?.student.classroom_assignments ?? []), [catalogLessonsData, selectedClassroom, studentSession]);
  const testsData = useMemo(() => scopeStudentCatalog(catalogTestsData, "test", selectedClassroom,
    studentSession?.student.classrooms, studentSession?.student.classroom_assignments ?? []), [catalogTestsData, selectedClassroom, studentSession]);
  const lessonsWords = useMemo(() => {
    const ids = new Set(lessonsData.map((item) => item.id));
    return catalogLessonsWords.filter((word) => word.lessonId && ids.has(word.lessonId));
  }, [catalogLessonsWords, lessonsData]);
  const testsWords = useMemo(() => {
    const ids = new Set(testsData.map((item) => item.id));
    return catalogTestsWords.filter((word) => word.testId && ids.has(word.testId));
  }, [catalogTestsWords, testsData]);
  const scopedTestHistory = useMemo(() => {
    const ids = new Set([...lessonsData, ...testsData].map((item) => item.id));
    return (progress?.testHistory ?? []).filter((record) => record.lessonId && ids.has(record.lessonId));
  }, [lessonsData, testsData, progress?.testHistory]);

  useEffect(() => {
    if (selectedClassroomId && studentSession?.student.classrooms && !selectedClassroom && runtimeScreen === "dashboard") {
      setSelectedClassroomId(null);
      setActiveTab("classrooms");
    }
  }, [selectedClassroomId, selectedClassroom, runtimeScreen, studentSession]);

  const studentGuideStorageKey = useCallback(
    (studentId: string) => `eluency-student-guide-v1:${studentId}`,
    []
  );

  useEffect(() => {
    studentGuideMenuPulse.stopAnimation();
    if (!studentGuideVisible || reducedMotion) {
      studentGuideMenuPulse.setValue(0);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(studentGuideMenuPulse, {
          toValue: 1,
          duration: 720,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(studentGuideMenuPulse, {
          toValue: 0,
          duration: 720,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [reducedMotion, studentGuideMenuPulse, studentGuideVisible]);

  const studentGuideMenuScale = studentGuideMenuPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1.02, 1.1],
  });

  useEffect(() => {
    const studentId = studentSession?.student.id?.trim();
    if (!studentId || studentGuideResolvedIdRef.current === studentId) return;

    studentGuideResolvedIdRef.current = studentId;
    let cancelled = false;
    AsyncStorage.getItem(studentGuideStorageKey(studentId))
      .then((completed) => {
        if (!cancelled && completed !== "completed") setStudentGuideVisible(true);
      })
      .catch(() => {
        if (!cancelled) setStudentGuideVisible(true);
      });

    return () => {
      cancelled = true;
    };
  }, [studentGuideStorageKey, studentSession?.student.id]);

  const showStudentGuideSection = useCallback((section: StudentGuideSection) => {
    setStudentGuideSection(section);
    setRuntimeScreen("dashboard");
    setActiveTab(section);
  }, []);

  const finishStudentGuide = useCallback(() => {
    const studentId = studentSession?.student.id?.trim();
    setStudentGuideVisible(false);
    setRuntimeScreen("dashboard");
    setActiveTab(classrooms.length > 0 ? "classrooms" : lessonsData.length > 0 ? "lessons" : "home");
    if (studentId) {
      AsyncStorage.setItem(studentGuideStorageKey(studentId), "completed").catch(() => {});
    }
  }, [classrooms.length, lessonsData.length, studentGuideStorageKey, studentSession?.student.id]);

  const replayStudentGuide = useCallback(() => {
    setStudentGuideSection("home");
    setRuntimeScreen("dashboard");
    setActiveTab("home");
    setStudentGuideVisible(true);
  }, []);

  useEffect(() => {
    if (!sessionBootstrapComplete || loading || !progress || hasContentEnteredRef.current) return;
    hasContentEnteredRef.current = true;
    if (reducedMotion) {
      contentOpacity.setValue(1);
      return;
    }
    contentOpacity.setValue(0);
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [contentOpacity, loading, progress, reducedMotion, sessionBootstrapComplete]);
  const [focusInterventions, setFocusInterventions] = useState<StudentFocusIntervention[]>([]);

  const [quickPlayCount, setQuickPlayCount] = useState<number>(15);
  const [quickPlayDirection, setQuickPlayDirection] = useState<StudyDirection>("pt-en");
  const [quickPlayLanguageKey, setQuickPlayLanguageKey] = useState<string | null>(null);
  const [lessonLanguageKey, setLessonLanguageKey] = useState<string | null>(null);
  const [lessonStatusFilter, setLessonStatusFilter] = useState<LessonStatusFilter>("action");
  const [testStatusFilter, setTestStatusFilter] = useState<TestStatusFilter>("action");
  const [quickPlayShuffleSeed, setQuickPlayShuffleSeed] = useState(0);

  const [sessionType, setSessionType] = useState<StudySessionType>("practice");
  const [sessionMode, setSessionMode] = useState<StudySessionMode>("typing");
  const [direction, setDirection] = useState<StudyDirection>("pt-en");
  const [activeWords, setActiveWords] = useState<GameWord[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [useNativeAnswerKeyboard, setUseNativeAnswerKeyboard] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [mistakeWordIds, setMistakeWordIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [isResolvingAnswer, setIsResolvingAnswer] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [studyAudioLoadingKey, setStudyAudioLoadingKey] = useState<string | null>(null);
  const [lessonPdfViewerVisible, setLessonPdfViewerVisible] = useState(false);
  const [lessonPdfViewerUri, setLessonPdfViewerUri] = useState<string | null>(null);
  const [resultRecord, setResultRecord] = useState<{
    resultKey?: string;
    score: number;
    total: number;
    percentage: number;
    passed: boolean;
    issues: SessionIssue[];
    verified?: boolean;
    requiresReview?: boolean;
    reviewStatus?: "not_required" | "pending" | "finalized";
    teacherFeedback?: string | null;
    reviewedAt?: string | null;
    pendingSync?: boolean;
    xpEarned?: number;
    earnedPoints?: number;
    totalPoints?: number;
    passingPercentage?: number;
    newAchievementIds?: string[];
    dailyGoalCompleted?: boolean;
    followUp?: {
      saved: boolean;
      completedMode: FollowUpMode;
      completedModes: FollowUpMode[];
      nextMode: FollowUpMode | null;
      completed: boolean;
    };
  } | null>(null);
  const [showAllResultIssues, setShowAllResultIssues] = useState(false);
  const resultReviewSourceRef = useRef<{ resultKey: string; resultType: "lesson" | "test" } | null>(null);
  const activeFocusInterventionIdsRef = useRef<string[]>([]);
  const activeFocusModeRef = useRef<FollowUpMode | null>(null);
  const [achievementGalleryVisible, setAchievementGalleryVisible] = useState(false);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<StudyRecord | null>(null);
  const [selectedLessonDetail, setSelectedLessonDetail] = useState<LessonGamePayload | null>(null);
  const [selectedTestDetail, setSelectedTestDetail] = useState<{ type: "test"; test: TestGamePayload } | null>(null);
  const [lessonDetailMode, setLessonDetailMode] = useState<StudySessionMode>("typing");
  const [showHint, setShowHint] = useState(false);
  const [needsRetype, setNeedsRetype] = useState(false);
  const [showInfinitiveNote, setShowInfinitiveNote] = useState(false);
  const [geminiCorrection, setGeminiCorrection] = useState("");
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [mcqChoiceTexts, setMcqChoiceTexts] = useState<string[]>([]);
  const [mcqChoiceOptions, setMcqChoiceOptions] = useState<{ id: string; text: string }[] | null>(null);
  const [mcqSelection, setMcqSelection] = useState<{ key: string; correct: boolean | null } | null>(null);
  /** Full conjugation table (typing mode), aligned with web `rowType === 'conjugation'`. */
  const [conjugationInputs, setConjugationInputs] = useState<string[]>([]);
  const [conjugationRowFeedback, setConjugationRowFeedback] = useState<(boolean | null)[]>([]);
  const [sessionContext, setSessionContext] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [sessionPool, setSessionPool] = useState<GameWord[]>([]);
  const [savedResume, setSavedResume] = useState<SavedResumeData | null>(null);
  const [sessionIssues, setSessionIssues] = useState<SessionIssue[]>([]);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [testTimeRemainingSeconds, setTestTimeRemainingSeconds] = useState<number | null>(null);
  const [testSubmitting, setTestSubmitting] = useState(false);
  const [testSubmissionError, setTestSubmissionError] = useState<string | null>(null);
  const [testStarting, setTestStarting] = useState(false);
  const audioPlayerRef = useRef<any>(null);
  const audioTempFileRef = useRef<string | null>(null);
  const promptAudioLoadingRef = useRef(false);
  const studyAudioLoadingRef = useRef(false);
  const correctDingPlayerRef = useRef<any>(null);
  const correctDingUriRef = useRef<string | null>(null);
  const initialCatalogLoadedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(sessionId);
  const catalogRequestGenerationRef = useRef(0);
  const catalogAbortControllerRef = useRef<AbortController | null>(null);
  const catalogRequestPromiseRef = useRef<Promise<void> | null>(null);
  const catalogLastCompletedAtRef = useRef(0);
  sessionIdRef.current = sessionId;
  /** Clear catalog when session changes so we never flash another student's lessons or stale rows. */
  useEffect(() => {
    if (!sessionId) return;
    sessionIdRef.current = sessionId;
    catalogRequestGenerationRef.current += 1;
    catalogAbortControllerRef.current?.abort();
    catalogRequestPromiseRef.current = null;
    catalogLastCompletedAtRef.current = 0;
    initialCatalogLoadedRef.current = false;
    progressRef.current = null;
    setProgress(null);
    setStudentSession(null);
    setSelectedClassroomId(null);
    setSavedResume(null);
    setLessonsData([]);
    setTestsData([]);
    setLessonsWords([]);
    setTestsWords([]);
    setSelectedLessonDetail(null);
    setSelectedTestDetail(null);
    setRuntimeScreen("dashboard");
    sessionAttemptKeyRef.current = null;
    sessionStartedAtRef.current = null;
    testDeadlineAtRef.current = null;
    testAutoSubmitTriggeredRef.current = false;
    testTimerAnnouncementRef.current = null;
    returnToTestReviewAfterAnswerRef.current = false;
    setTestTimeRemainingSeconds(null);
    setTestSubmitting(false);
    setTestSubmissionError(null);
    setTestStarting(false);
    activeTestAttemptRef.current = null;
  }, [sessionId]);

  useEffect(() => () => {
    catalogAbortControllerRef.current?.abort();
    catalogRequestPromiseRef.current = null;
  }, []);
  const refreshCatalogRef = useRef<(options?: { force?: boolean }) => Promise<void>>(async () => {});
  const progressRef = useRef<StudyProgress | null>(null);
  const correctCountRef = useRef(0);
  const sessionIssuesRef = useRef<SessionIssue[]>([]);
  const sessionStreakRef = useRef(0);
  const sessionAttemptKeyRef = useRef<string | null>(null);
  const sessionStartedAtRef = useRef<string | null>(null);
  const testDeadlineAtRef = useRef<number | null>(null);
  const testAutoSubmitTriggeredRef = useRef(false);
  const testTimerAnnouncementRef = useRef<300 | 60 | 30 | 10 | 0 | null>(null);
  const activeTestAttemptRef = useRef<
    (ActiveTestAttemptSession & { testId: string }) | null
  >(null);
  const testDraftSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveTestDraftRef = useRef<(issues: SessionIssue[]) => void>(() => {});
  const returnToTestReviewAfterAnswerRef = useRef(false);
  const resumeInteractionRef = useRef<SavedResumeData | null>(null);
  const answerTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mcqCorrectScale = useRef(new Animated.Value(1)).current;
  const downloadSuccessTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const finishingSessionRef = useRef(false);
  const runtimeScreenRef = useRef<RuntimeScreen>("dashboard");
  const saveResumeDataRef = useRef<() => void>(() => {});
  progressRef.current = progress;
  const runtimeToastBottom =
    runtimeScreen === "dashboard" || runtimeScreen === "lesson-detail" || runtimeScreen === "test-detail"
      ? Math.max(insets.bottom, 20) + 88
      : Math.max(insets.bottom, 20) + 12;
  const { showToast, toastProps } = useFeedbackToast({ bottom: runtimeToastBottom });

  const consumeCanonicalProgress = useCallback((canonical: StudyProgress) => {
    if (!sessionId || sessionIdRef.current !== sessionId) return;
    progressRef.current = canonical;
    setProgress(canonical);
  }, [sessionId]);

  const flushPendingAttemptsAndRefreshProgress = useCallback(async () => {
    if (!sessionId) return;
    const result = await flushPendingTestAttempts(sessionId, studentSession?.student.id);
    if (result.synced <= 0 || sessionIdRef.current !== sessionId) return;
    const hydrated = await hydrateProgress(sessionId);
    if (sessionIdRef.current !== sessionId) return;
    progressRef.current = hydrated;
    setProgress(hydrated);
    await refreshCatalogRef.current?.({ force: true }).catch(() => {});
    showToast("A saved test result has been verified.", "success");
  }, [sessionId, showToast, studentSession?.student.id]);

  const clearAnswerTimers = useCallback((resetResolving = true) => {
    for (const timer of answerTimersRef.current) clearTimeout(timer);
    answerTimersRef.current = [];
    if (resetResolving) setIsResolvingAnswer(false);
  }, []);

  const scheduleAnswerResolution = useCallback((callback: () => void, delay: number) => {
    setIsResolvingAnswer(true);
    const timer = setTimeout(() => {
      answerTimersRef.current = answerTimersRef.current.filter((item) => item !== timer);
      setIsResolvingAnswer(false);
      callback();
    }, delay);
    answerTimersRef.current.push(timer);
  }, []);

  useEffect(() => () => clearAnswerTimers(false), [clearAnswerTimers]);

  useEffect(
    () => () => {
      Object.values(downloadSuccessTimersRef.current).forEach((timer) => clearTimeout(timer));
      downloadSuccessTimersRef.current = {};
    },
    []
  );

  const bumpAssetCatalogEpoch = useCallback(() => {
    assetCatalogEpochRef.current += 1;
    const n = assetCatalogEpochRef.current;
    setAssetRefreshEpoch(n);
    return n;
  }, []);

  const refreshDownloadedLessons = useCallback(async () => {
    if (!sessionId) return;
    const summaries = await getOfflineLessonSummaries(sessionId);
    setDownloadedLessons(summaries);
  }, [sessionId]);

  const refreshCatalog = useCallback(async (options?: { force?: boolean }) => {
    if (!sessionId) return;
    if (catalogRequestPromiseRef.current) return catalogRequestPromiseRef.current;
    if (
      !options?.force &&
      initialCatalogLoadedRef.current &&
      Date.now() - catalogLastCompletedAtRef.current < 30_000
    ) return;
    const controller = new AbortController();
    catalogAbortControllerRef.current = controller;
    const requestGeneration = ++catalogRequestGenerationRef.current;
    const requestedSessionId = sessionId;
    const request = (async () => {
      try {
        const session = await getStudentSession(sessionId, controller.signal);
        const [lessons, tests, nextFocusInterventions, classroomResult] = await Promise.all([
          getAssignedLessons(sessionId, session.student.assigned_lessons ?? [], controller.signal),
          getAssignedTests(sessionId, session.student.assigned_tests ?? [], controller.signal),
          getStudentFocusInterventions(sessionId, controller.signal).catch(() => null),
          getStudentClassrooms(sessionId, controller.signal)
            .then((classrooms) => ({ classrooms, error: null }))
            .catch((error: unknown) => ({ classrooms: null, error: error instanceof Error ? error.message : "Your classrooms could not be loaded." })),
        ]);
        const assignmentDetails = normalizeStudentAssignmentDetails(session.student.assignment_details);
        const classroomAssignments = Array.isArray(session.student.classroom_assignments)
          ? session.student.classroom_assignments
          : [];
        const normalizedSession: StudentSessionPayload = {
          ...session,
          student: {
            ...session.student,
            assignment_details: assignmentDetails,
            classroom_assignments: classroomAssignments,
            classrooms: classroomResult.classrooms ?? (studentSessionRef.current?.student.id === session.student.id ? studentSessionRef.current.student.classrooms : undefined),
            classrooms_error: classroomResult.error,
          },
        };
        const assignedLessons = attachAssignmentDetails(lessons, "lesson", assignmentDetails).map((lesson) => ({
          ...lesson,
          classroomNames: getClassroomNamesForAssignment(classroomAssignments, "lesson", lesson.id),
        }));
        const assignedTests = attachAssignmentDetails(tests, "test", assignmentDetails).map((test) => ({
          ...test,
          classroomNames: getClassroomNamesForAssignment(classroomAssignments, "test", test.id),
        }));
        if (
          controller.signal.aborted ||
          requestGeneration !== catalogRequestGenerationRef.current ||
          requestedSessionId !== sessionIdRef.current
        ) return;
        if (__DEV__) {
          console.log(
            "[StudyGame] refreshCatalog lessons:",
            lessons.map((lesson) => ({
              id: lesson.id,
              name: lesson.name,
              cover_image_url: lesson.cover_image_url,
              updated_at: lesson.updated_at,
              words: lesson.words?.length ?? 0,
            }))
          );
        }
        const epoch = bumpAssetCatalogEpoch();
        await saveOfflineSessionSnapshot(sessionId, normalizedSession).catch(() => {});
        setStudentSession(normalizedSession);
        setOfflineMode(false);
        setLessonsData(assignedLessons);
        setTestsData(assignedTests);
        if (nextFocusInterventions) setFocusInterventions(nextFocusInterventions);
        setLessonsWords(normalizeLessonsToWords(assignedLessons, epoch));
        setTestsWords(normalizeTestsToWords(assignedTests, epoch));
        setStudentName(session.student.name);
        setTeacherName(session.teacher?.name ?? "Teacher");
        refreshDownloadedLessons().catch(() => {});
        const currentClassroom = normalizedSession.student.classrooms?.find((item) => item.id === selectedClassroomIdRef.current) ?? null;
        const scopedLessons = scopeStudentCatalog(assignedLessons, "lesson", currentClassroom, normalizedSession.student.classrooms, classroomAssignments);
        const scopedTests = scopeStudentCatalog(assignedTests, "test", currentClassroom, normalizedSession.student.classrooms, classroomAssignments);
        setSelectedLessonDetail((previous) => previous
          ? scopedLessons.find((lesson) => lesson.id === previous.id) ?? null
          : previous);
        setSelectedTestDetail((previous) => {
          if (!previous) return previous;
          const test = scopedTests.find((item) => item.id === previous.test.id);
          return test ? { type: "test", test } : null;
        });
        catalogLastCompletedAtRef.current = Date.now();
      } catch (error) {
        if (
          !controller.signal.aborted &&
          requestedSessionId === sessionIdRef.current &&
          error instanceof StudyApiError && error.status === 401
        ) {
          await clearStoredStudentSessionId();
          return;
        }
        throw error;
      } finally {
        if (catalogAbortControllerRef.current === controller) catalogAbortControllerRef.current = null;
        if (catalogRequestGenerationRef.current === requestGeneration) {
          catalogRequestPromiseRef.current = null;
        }
      }
    })();
    catalogRequestPromiseRef.current = request;
    return request;
  }, [sessionId, bumpAssetCatalogEpoch, refreshDownloadedLessons]);

  refreshCatalogRef.current = refreshCatalog;

  const openNotificationTab = useCallback((tab: "home" | "tests") => {
    setRuntimeScreen("dashboard");
    setActiveTab(tab === "tests" && !selectedClassroomIdRef.current && studentSessionRef.current?.student.classrooms?.length ? "classrooms" : tab);
    if (!sessionId || !initialCatalogLoadedRef.current) return;
    refreshCatalog({ force: true }).catch(() => {});
    hydrateProgress(sessionId).then(consumeCanonicalProgress).catch(() => {});
  }, [consumeCanonicalProgress, refreshCatalog, sessionId]);
  const announceDeferredNotification = useCallback(() => {
    if (loading) return;
    showToast("Notification saved. Finish your current session to open it.", "info");
  }, [loading, showToast]);
  useDeferredStudyNotification({
    notificationId: route.params?.notificationId,
    initialTab: route.params?.initialTab,
    busy: loading || ["session", "test-review", "results"].includes(runtimeScreen),
    onOpen: openNotificationTab,
    onDeferred: announceDeferredNotification,
  });

  const onCatalogPullRefresh = useCallback(async () => {
    setCatalogRefreshing(true);
    try {
      await refreshCatalog({ force: true });
      if (sessionId && progress) {
        await flushQueuedProgressSync(sessionId, progress, consumeCanonicalProgress).catch(() => false);
      }
      showToast("Lessons and tests updated.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not refresh lessons and tests.", "danger");
    } finally {
      setCatalogRefreshing(false);
    }
  }, [consumeCanonicalProgress, progress, refreshCatalog, sessionId, showToast]);

  const downloadLesson = useCallback(
    async (lesson: LessonGamePayload) => {
      if (!sessionId) return;
      const existingTimer = downloadSuccessTimersRef.current[lesson.id];
      if (existingTimer) {
        clearTimeout(existingTimer);
        delete downloadSuccessTimersRef.current[lesson.id];
      }
      setLessonDownloadState((prev) => ({ ...prev, [lesson.id]: "downloading" }));
      try {
        const summary = await downloadLessonForOffline(sessionId, lesson, studentSession);
        const catalog = await loadOfflineStudyCatalog(sessionId);
        setDownloadedLessons((prev) => ({ ...prev, [lesson.id]: summary }));
        const offlineLesson = catalog.lessons.find((item) => item.id === lesson.id);
        if (offlineLesson) {
          const nextLessons = offlineMode
            ? catalog.lessons
            : catalogLessonsData.map((item) => (item.id === lesson.id ? offlineLesson : item));
          const epoch = bumpAssetCatalogEpoch();
          setLessonsData(nextLessons);
          setLessonsWords(normalizeLessonsToWords(nextLessons, epoch));
          setSelectedLessonDetail((prev) => {
            if (!prev || prev.id !== lesson.id) return prev;
            return offlineLesson;
          });
        }
        setLessonDownloadState((prev) => ({ ...prev, [lesson.id]: "success" }));
        downloadSuccessTimersRef.current[lesson.id] = setTimeout(() => {
          setLessonDownloadState((prev) => {
            const next = { ...prev };
            delete next[lesson.id];
            return next;
          });
          delete downloadSuccessTimersRef.current[lesson.id];
        }, 850);
        showToast("Lesson downloaded for offline play.", "success");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not download this lesson.", "danger");
        setLessonDownloadState((prev) => {
          const next = { ...prev };
          delete next[lesson.id];
          return next;
        });
      }
    },
    [bumpAssetCatalogEpoch, catalogLessonsData, offlineMode, sessionId, showToast, studentSession]
  );

  const allWords = useMemo(() => [...lessonsWords, ...testsWords], [lessonsWords, testsWords]);

  // Distinct language groups from lessons, keyed by "pair::language"
  const quickPlayLanguageGroups = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; short: string; lesson: LessonGamePayload }>();
    for (const lesson of lessonsData) {
      const meta = getDisplayLanguageMeta(lesson.language_pair, lesson.language);
      const label = lesson.language?.trim() || meta.labelA;
      const key = `${lesson.language_pair ?? ""}::${label}`;
      if (!seen.has(key)) seen.set(key, { key, label, short: meta.shortA, lesson });
    }
    return Array.from(seen.values());
  }, [lessonsData]);

  const activeQuickPlayLanguageKey = quickPlayLanguageKey ?? quickPlayLanguageGroups[0]?.key ?? null;

  useEffect(() => {
    if (!quickPlayLanguageKey) return;
    if (!quickPlayLanguageGroups.some((group) => group.key === quickPlayLanguageKey)) {
      setQuickPlayLanguageKey(null);
    }
  }, [quickPlayLanguageGroups, quickPlayLanguageKey]);

  // Words filtered to the selected language group (or all lessons words if none selected)
  const quickPlayWords = useMemo(() => {
    if (!activeQuickPlayLanguageKey || quickPlayLanguageGroups.length < 2) return lessonsWords;
    return lessonsWords.filter((w) => {
      const meta = getDisplayLanguageMeta(w.lessonLanguagePair, w.lessonLanguage);
      const label = w.lessonLanguage?.trim() || meta.labelA;
      return `${w.lessonLanguagePair ?? ""}::${label}` === activeQuickPlayLanguageKey;
    });
  }, [activeQuickPlayLanguageKey, quickPlayLanguageGroups.length, lessonsWords]);

  const lessonLanguageGroups = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; short: string }>();
    for (const lesson of lessonsData) {
      const meta = getDisplayLanguageMeta(lesson.language_pair, lesson.language);
      const label = lesson.language?.trim() || meta.labelA;
      const key = `${lesson.language_pair ?? ""}::${label}`;
      if (!seen.has(key)) {
        seen.set(key, { key, label, short: meta.shortA });
      }
    }
    return Array.from(seen.values());
  }, [lessonsData]);

  useEffect(() => {
    if (!lessonLanguageKey) return;
    if (!lessonLanguageGroups.some((group) => group.key === lessonLanguageKey)) {
      setLessonLanguageKey(null);
    }
  }, [lessonLanguageGroups, lessonLanguageKey]);

  const lessonsWithProgress = useMemo(() => lessonsData.map((lesson) => ({
    ...lesson,
    assignmentProgress: getLessonAssignmentProgress({
      lessonId: lesson.id,
      wordIds: lessonsWords
        .filter((word) => word.lessonId === lesson.id)
        .map((word) => word.id),
      wordStats: progress?.wordStats ?? {},
      practiceHistory: progress?.practiceHistory ?? [],
      savedResume,
    }),
  })), [lessonsData, lessonsWords, progress?.practiceHistory, progress?.wordStats, savedResume]);

  const filteredLessonsData = useMemo(() => lessonsWithProgress
    .filter((lesson) => {
      if (lessonLanguageKey && lessonLanguageGroups.length >= 2) {
        const meta = getDisplayLanguageMeta(lesson.language_pair, lesson.language);
        const label = lesson.language?.trim() || meta.labelA;
        if (`${lesson.language_pair ?? ""}::${label}` !== lessonLanguageKey) return false;
      }
      if (lessonStatusFilter === "action") return lesson.assignmentProgress.actionRequired;
      if (lessonStatusFilter === "completed") return !lesson.assignmentProgress.actionRequired;
      return true;
    })
    .sort((left, right) => (
      Number(isIncompleteClassroomLesson(right)) - Number(isIncompleteClassroomLesson(left))
      || Number(right.assignmentProgress.actionRequired) - Number(left.assignmentProgress.actionRequired)
      || compareAssignmentPriority(left, right)
    )), [lessonLanguageGroups.length, lessonLanguageKey, lessonStatusFilter, lessonsWithProgress]);

  const testsWithProgress = useMemo(() => testsData.map((test) => ({
    ...test,
    assignmentProgress: getTestAssignmentProgress({
      testId: test.id,
      testHistory: progress?.testHistory ?? [],
      attemptsRemaining: test.attempts_remaining,
      hasActiveAttempt: Boolean(test.active_attempt),
      serverStatus: test.assignment_status ?? null,
    }),
  })), [progress?.testHistory, testsData]);

  const filteredTestsData = useMemo(() => testsWithProgress
    .filter((test) => {
      const status = test.assignmentProgress.status;
      if (testStatusFilter === "action") return test.assignmentProgress.actionRequired;
      if (testStatusFilter === "review") return status === "awaiting-review";
      if (testStatusFilter === "completed") {
        return !test.assignmentProgress.actionRequired && status !== "awaiting-review";
      }
      return true;
    })
    .sort((left, right) => (
      Number(right.assignmentProgress.actionRequired) - Number(left.assignmentProgress.actionRequired)
      || compareAssignmentPriority(left, right)
    )), [testStatusFilter, testsWithProgress]);

  const selectedTestAssignmentProgress = useMemo(() => {
    if (!selectedTestDetail) return null;
    return testsWithProgress.find((test) => test.id === selectedTestDetail.test.id)?.assignmentProgress
      ?? getTestAssignmentProgress({
        testId: selectedTestDetail.test.id,
        testHistory: progress?.testHistory ?? [],
        attemptsRemaining: selectedTestDetail.test.attempts_remaining,
        hasActiveAttempt: Boolean(selectedTestDetail.test.active_attempt),
        serverStatus: selectedTestDetail.test.assignment_status ?? null,
      });
  }, [progress?.testHistory, selectedTestDetail, testsWithProgress]);

  const selectedTestCanStart = selectedTestAssignmentProgress == null || [
    "not-started",
    "in-progress",
    "retry-available",
  ].includes(selectedTestAssignmentProgress.status);
  const selectedTestLatestResult = selectedTestAssignmentProgress?.latestResult ?? null;

  const selectedLessonAssignmentProgress = useMemo(() => {
    if (!selectedLessonDetail) return null;
    return lessonsWithProgress.find((lesson) => lesson.id === selectedLessonDetail.id)?.assignmentProgress
      ?? null;
  }, [lessonsWithProgress, selectedLessonDetail]);

  const activeSessionAssignment = useMemo(() => {
    if (!sessionContext.id) return null;
    if (sessionType === "test") {
      return testsData.find((test) => test.id === sessionContext.id)?.assignment ?? null;
    }
    return lessonsData.find((lesson) => lesson.id === sessionContext.id)?.assignment ?? null;
  }, [lessonsData, sessionContext.id, sessionType, testsData]);

  const activeSessionLesson = useMemo(
    () => sessionType === "test" || !sessionContext.id
      ? null
      : lessonsData.find((lesson) => lesson.id === sessionContext.id) ?? null,
    [lessonsData, sessionContext.id, sessionType]
  );

  const quickPlayShuffledPool = useMemo(() => {
    const pool = quickPlayWords.length ? quickPlayWords : lessonsWords;
    return shuffle(pool);
  }, [quickPlayDirection, quickPlayShuffleSeed, quickPlayWords, lessonsWords]);

  const current = activeWords[idx] as ReviewableGameWord | undefined;
  const currentSessionMode = isStudySessionMode(current?.reviewMode) ? current.reviewMode : sessionMode;
  const isConjugationDrill = current?.practiceKind === "conjugation";
  const isConjugationTable = current?.practiceKind === "conjugation-table";
  const isPromptBuilder = current?.practiceKind === "prompt-builder";

  useEffect(() => {
    if (!current || current.practiceKind !== "conjugation-table" || !current.conjugationTable) {
      setConjugationInputs([]);
      setConjugationRowFeedback([]);
      return;
    }
    const restored = resumeInteractionRef.current;
    if (restored && restored.idx === idx && restored.activeWords[restored.idx]?.id === current.id) {
      setConjugationInputs(Array.isArray(restored.conjugationInputs) ? restored.conjugationInputs : []);
      setConjugationRowFeedback(Array.isArray(restored.conjugationRowFeedback) ? restored.conjugationRowFeedback : []);
      return;
    }
    const n = Array.isArray(current.conjugationTable.entries) ? current.conjugationTable.entries.length : 0;
    setConjugationInputs(Array.from({ length: n }, () => ""));
    setConjugationRowFeedback([]);
  }, [current?.id, idx]);

  useEffect(() => {
    const restored = resumeInteractionRef.current;
    if (restored && restored.idx === idx && restored.activeWords[restored.idx]?.id === current?.id) {
      setInput(typeof restored.input === "string" ? restored.input : "");
      setUseNativeAnswerKeyboard(restored.useNativeAnswerKeyboard === true);
      setFeedback(restored.feedback ?? null);
      setMcqSelection(restored.mcqSelection ?? null);
      setShowHint(restored.showHint === true);
      setNeedsRetype(restored.needsRetype === true);
      setShowInfinitiveNote(restored.showInfinitiveNote === true);
      setGeminiCorrection(typeof restored.geminiCorrection === "string" ? restored.geminiCorrection : "");
      mcqCorrectScale.setValue(1);
      return;
    }
    const existingResponse =
      sessionType === "test" && Number.isInteger(current?.questionIndex)
        ? sessionIssuesRef.current.find(
            (issue) => issue.questionIndex === current?.questionIndex
          )
        : null;
    setInput(existingResponse?.answer ?? "");
    setMcqSelection(
      existingResponse?.selectedOptionId != null
        ? { key: `option:${existingResponse.selectedOptionId}`, correct: null }
        : null
    );
    mcqCorrectScale.setValue(1);
  }, [current?.id, current?.questionIndex, idx, mcqCorrectScale, sessionType]);

  const activeLanguagePair = useMemo(() => {
    if (current?.lessonLanguagePair) return current.lessonLanguagePair;
    if (sessionContext.id) return lessonsData.find((l) => l.id === sessionContext.id)?.language_pair ?? "en-pt";
    return lessonsData[0]?.language_pair ?? "en-pt";
  }, [current?.lessonLanguagePair, lessonsData, sessionContext.id]);
  const activeLessonLanguage = useMemo(() => {
    if (current?.lessonLanguage != null && String(current.lessonLanguage).trim()) return String(current.lessonLanguage).trim();
    if (sessionContext.id) return lessonsData.find((l) => l.id === sessionContext.id)?.language?.trim() || null;
    return null;
  }, [current?.lessonLanguage, lessonsData, sessionContext.id]);
  const activeSessionLanguageDirection = historyDirectionLabel(
    direction,
    activeLanguagePair,
    activeLessonLanguage
  );
  const isFillBlank = current?.promptFormat === "fill_blank";
  const prompt = useMemo(() => {
    if (!current) return "";
    if (isFillBlank) return current.en || "";
    return getDisplayPrompt(current, direction);
  }, [current, direction, isFillBlank]);
  const expected = useMemo(() => {
    if (!current) return "";
    if (isFillBlank) return current.pt || "";
    return getExpectedAnswer(current, direction);
  }, [current, direction, isFillBlank]);
  const testReviewItems = useMemo<TestReviewItem[]>(() => {
    if (sessionType !== "test") return [];
    return activeWords.map((word, wordIndex) => {
      const questionIndex = Number.isInteger(word.questionIndex)
        ? (word.questionIndex as number)
        : wordIndex;
      const issue = sessionIssues.find((item) => item.questionIndex === questionIndex);
      const answer = typeof issue?.answer === "string" ? issue.answer.trim() : "";
      const status: TestReviewItem["status"] =
        issue?.kind === "skip"
          ? "skipped"
          : issue && answer
            ? "answered"
            : "unanswered";
      return {
        wordIndex,
        questionNumber: wordIndex + 1,
        prompt: word.en || word.sp || `Question ${wordIndex + 1}`,
        answer,
        status,
        formatLabel: testQuestionFormatLabel(word),
      };
    });
  }, [activeWords, sessionIssues, sessionType]);
  const resultMistakeCount = useMemo(
    () => {
      if (!resultRecord) return 0;
      return new Set(
        resultRecord.issues
          .filter(
            (issue) =>
              issue.kind === "wrong" ||
              issue.kind === "close" ||
              issue.kind === "skip"
          )
          .map((issue) => issue.id)
      ).size;
    },
    [resultRecord]
  );
  const resultIssuesNeedingAttention = useMemo(
    () => (resultRecord?.issues ?? []).filter((issue) => issue.kind !== "correct"),
    [resultRecord]
  );
  const resultFocusAreas = useMemo(
    () => countStudyReviewFocus(resultIssuesNeedingAttention, sessionPool),
    [resultIssuesNeedingAttention, sessionPool]
  );
  const reviewMistakeWordIds = useMemo(() => {
    const ids = new Set<string>();
    for (const record of [...(progress?.practiceHistory ?? []), ...(progress?.testHistory ?? [])]) {
      for (const issue of record.issues ?? []) {
        if (issue.kind === "wrong" || issue.kind === "close" || issue.kind === "skip") ids.add(issue.id);
      }
    }
    return ids;
  }, [progress?.practiceHistory, progress?.testHistory]);
  const visibleResultIssues = showAllResultIssues
    ? resultIssuesNeedingAttention
    : resultIssuesNeedingAttention.slice(0, 3);
  const selectedHistoryPresentation = useMemo(
    () => getStudentTestResultPresentation(selectedHistoryRecord),
    [selectedHistoryRecord]
  );
  const recommendedNextLesson = useMemo(() => {
    if (!lessonsWithProgress.length) return null;
    const candidates = lessonsWithProgress.filter(
      (lesson) => lesson.assignmentProgress.actionRequired && Array.isArray(lesson.words) && lesson.words.length > 0
    );
    const lessonMastery = (lesson: LessonGamePayload) => {
      const attempts = lesson.words
        .map((word) => (word.id ? progress?.wordStats?.[word.id] : undefined))
        .filter((stats): stats is NonNullable<typeof stats> => Boolean(stats?.total));
      if (!attempts.length) return 0;
      return attempts.reduce((sum, stats) => sum + stats.correct / Math.max(stats.total, 1), 0) / attempts.length;
    };
    return (
      candidates
        .filter((lesson) => lesson.id !== sessionContext.id)
        .sort((left, right) => lessonMastery(left) - lessonMastery(right))[0] ??
      candidates.sort((left, right) => lessonMastery(left) - lessonMastery(right))[0] ??
      null
    );
  }, [lessonsWithProgress, progress?.wordStats, sessionContext.id]);

  /** Label to show after wrong MCQ / Skip - test MCQ correct answer lives in option text, not always pt/en. */
  const feedbackExpected = useMemo(() => {
    if (!current) return "";
    if (isFillBlank) return current.pt || "";
    if (current.practiceKind === "conjugation-table" && current.conjugationTable) {
      return current.conjugationTable.entries.map((e) => `${e.pronoun}: ${e.form_a || e.form_b || "-"}`).join("; ");
    }
    if (
      current.answerFormat === "mcq" &&
      Array.isArray(current.mcqOptions) &&
      current.mcqOptions.length > 0 &&
      current.mcqCorrectOptionId != null &&
      String(current.mcqCorrectOptionId).length > 0
    ) {
      const id = String(current.mcqCorrectOptionId);
      const opt = current.mcqOptions.find((o) => String(o.id) === id);
      const label = typeof opt?.text === "string" ? opt.text.trim() : "";
      if (label) return label;
    }
    return getExpectedAnswer(current, direction);
  }, [current, direction, isFillBlank]);

  const sourceLang = isFillBlank ? "en" : direction === "pt-en" ? "pt" : "en";
  const targetLang = isFillBlank ? "pt" : direction === "pt-en" ? "en" : "pt";
  const acceptedAnswers = useMemo(() => getAcceptedAnswers(expected, current, direction), [current, direction, expected]);
  const sentenceHint = useMemo(() => {
    if (!current) return null;
    if (current.practiceKind === "conjugation-table" || current.practiceKind === "prompt-builder") return null;
    const sentence = direction === "pt-en" ? current.se : current.sp;
    if (!sentence) return null;
    return maskWord(sentence, expected);
  }, [current, direction, expected]);

  const showMcq =
    runtimeScreen === "session" &&
    !!current &&
    !isFillBlank &&
    (currentSessionMode === "multiple-choice" ||
      (current.answerFormat === "mcq" && (current.mcqOptions?.length ?? 0) >= 2));
  const canUseAnswerPad =
    runtimeScreen === "session" &&
    !!current &&
    !showMcq &&
    !isConjugationTable &&
    sessionType !== "test" &&
    current.answerFormat !== "open" &&
    (currentSessionMode === "typing" || currentSessionMode === "listening" || currentSessionMode === "image");
  const useAnswerPad = canUseAnswerPad && !useNativeAnswerKeyboard;

  useEffect(() => {
    if (useAnswerPad) Keyboard.dismiss();
  }, [idx, useAnswerPad]);

  /** Match web: no big emoji block for conjugation / preposition when there is no image. */
  const hidePlaceholderIllustration =
    current?.practiceKind === "conjugation" ||
    current?.practiceKind === "conjugation-table" ||
    current?.practiceKind === "preposition" ||
    current?.practiceKind === "prompt-builder";
  const showSessionIllustration =
    currentSessionMode === "image" ||
    (currentSessionMode === "listening" && !!current?.imageUrl) ||
    (currentSessionMode !== "listening" && (!!current?.imageUrl || (!showMcq && !hidePlaceholderIllustration)));
  const sessionHeaderLabel = isPromptBuilder
    ? "Build the Answer"
    : isConjugationTable
    ? "Conjugate"
    : isConjugationDrill
      ? (currentSessionMode === "listening" ? "Listen" : showMcq ? "Multiple Choice" : "Conjugate")
      : currentSessionMode === "listening"
        ? "Listen"
        : currentSessionMode === "image"
          ? "Look"
          : isFillBlank
            ? "Fill Blank"
            : showMcq
              ? "Multiple Choice"
              : "Translate";
  const hidePromptHeaderForImageMode =
    currentSessionMode === "image" &&
    sessionType !== "test" &&
    !isConjugationTable &&
    !isConjugationDrill;

  const getWordStat = useCallback(
    (word: GameWord) => {
      const stats = progress?.wordStats ?? {};
      const byId = stats[word.id];
      if (byId) return byId;
      const byPt = word.pt ? stats[word.pt] : undefined;
      if (byPt) return byPt;
      const byEn = word.en ? stats[word.en] : undefined;
      if (byEn) return byEn;
      return undefined;
    },
    [progress?.wordStats]
  );

  const wordsLearned = useMemo(
    () =>
      lessonsWords.reduce((count, word) => {
        const stat = getWordStat(word);
        return count + (stat && stat.total >= 1 ? 1 : 0);
      }, 0),
    [getWordStat, lessonsWords]
  );
  const masteredWords = useMemo(
    () =>
      lessonsWords.reduce((count, word) => {
        const stat = getWordStat(word);
        return count + (stat && stat.total >= 3 && stat.correct / stat.total >= 0.8 ? 1 : 0);
      }, 0),
    [getWordStat, lessonsWords]
  );
  const practicedWords = useMemo(
    () =>
      lessonsWords.reduce((count, word) => {
        const stat = getWordStat(word);
        return count + (stat && stat.total >= 1 ? 1 : 0);
      }, 0),
    [getWordStat, lessonsWords]
  );
  const totalWordsAvailable = lessonsWords.length;
  const overallProgress = totalWordsAvailable > 0 ? Math.round((practicedWords / totalWordsAvailable) * 100) : 0;
  const currentStreak = calculateStreak(progress?.practiceHistory ?? [], progress?.testHistory ?? []);
  const totalXP = useMemo(
    () => (progress ? calculateTotalXp(progress) : 0),
    [progress]
  );
  const levelInfo = getLevelInfo(totalXP);
  const dailyGoalWords = progress?.preferences.dailyGoalWords ?? 20;
  const todayWords = useMemo(
    () =>
      calculateTodayWords(
        progress?.practiceHistory ?? [],
        progress?.testHistory ?? []
      ),
    [progress?.practiceHistory, progress?.testHistory]
  );
  const dailyGoalProgress = Math.min(100, Math.round((todayWords / dailyGoalWords) * 100));
  const dailyGoalComplete = todayWords >= dailyGoalWords;
  const unlockedAchievementIds = useMemo(
    () => normalizeAchievementIds(progress?.achievements ?? []),
    [progress?.achievements]
  );

  const lessonDetailDisplayMeta = useMemo(
    () =>
      selectedLessonDetail
        ? getDisplayLanguageMeta(selectedLessonDetail.language_pair, selectedLessonDetail.language)
        : getDisplayLanguageMeta("en-pt", null),
    [selectedLessonDetail]
  );

  const testDetailDisplayMeta = useMemo(
    () => getDisplayLanguageMeta("en-pt", null),
    []
  );

  const lessonsOverview = useMemo(() => {
    const fullLessonsById = new Map(lessonsWithProgress.map((lesson) => [lesson.id, lesson]));
    const map = new Map<
      string,
      { id: string; name: string; cover?: string; total: number; practiced: number; mastered: number }
    >();
    for (const w of lessonsWords) {
      const id = w.lessonId ?? "unknown";
      const key = id;
      const prev = map.get(key) ?? {
        id,
        name: w.lessonName || "Lesson",
        cover: w.imageUrl,
        total: 0,
        practiced: 0,
        mastered: 0,
      };
      prev.total += 1;
      if (!prev.cover && w.imageUrl) prev.cover = w.imageUrl;
      const stat = getWordStat(w);
      if (stat && stat.total > 0) {
        prev.practiced += 1;
        if (stat.total >= 3 && stat.correct / stat.total >= 0.8) prev.mastered += 1;
      }
      map.set(key, prev);
    }
    // Dashboard edits apply to lessons.title / cover_image_url - not always mirrored on word rows.
    return Array.from(map.values()).map((row) => {
      const full = fullLessonsById.get(row.id);
      if (!full) return row;
      const lessonCover = full.cover_image_url?.trim();
      return {
        ...row,
        name: full.name?.trim() || row.name,
        cover: lessonCover || row.cover,
      };
    }).sort((left, right) => {
      const leftLesson = fullLessonsById.get(left.id);
      const rightLesson = fullLessonsById.get(right.id);
      return Number(Boolean(rightLesson && isIncompleteClassroomLesson(rightLesson)))
        - Number(Boolean(leftLesson && isIncompleteClassroomLesson(leftLesson)));
    });
  }, [getWordStat, lessonsWithProgress, lessonsWords]);

  const latestLearningRecord = useMemo(() => {
    const records = [...(progress?.practiceHistory ?? []), ...(progress?.testHistory ?? [])];
    if (!records.length) return null;
    return [...records].sort((a, b) => {
      const leftRaw = typeof (a as any).date === "string" ? (a as any).date : typeof (a as any).timestamp === "string" ? (a as any).timestamp : "";
      const rightRaw = typeof (b as any).date === "string" ? (b as any).date : typeof (b as any).timestamp === "string" ? (b as any).timestamp : "";
      return (Date.parse(rightRaw) || 0) - (Date.parse(leftRaw) || 0);
    })[0];
  }, [progress?.practiceHistory, progress?.testHistory]);

  const continueSuggestion = useMemo<ContinueSuggestion | null>(() => {
    if (savedResume && lessonsData.some((item) => item.id === savedResume.lessonId)) {
      const resumedLesson = lessonsData.find((item) => item.id === savedResume.lessonId);
      return {
        kind: "resume",
        title: savedResume.lessonName,
        subtitle: `${savedResume.sessionMode.replace("-", " ")} session`,
        meta: `Word ${savedResume.idx + 1} of ${savedResume.activeWords.length}`,
        ctaLabel: "Resume session",
        assignment: resumedLesson?.assignment,
      };
    }

    if (!latestLearningRecord) return null;

    const rawId =
      typeof (latestLearningRecord as any).lessonId === "string"
        ? (latestLearningRecord as any).lessonId
        : typeof (latestLearningRecord as any).lesson_id === "string"
          ? (latestLearningRecord as any).lesson_id
          : "";
    const rawName =
      typeof (latestLearningRecord as any).lessonName === "string"
        ? (latestLearningRecord as any).lessonName
        : typeof (latestLearningRecord as any).lesson_name === "string"
          ? (latestLearningRecord as any).lesson_name
          : "Recent activity";
    const percentage = typeof (latestLearningRecord as any).percentage === "number" ? (latestLearningRecord as any).percentage : 0;
    const mode =
      typeof (latestLearningRecord as any).mode === "string"
        ? String((latestLearningRecord as any).mode).replace("-", " ")
        : "practice";
    const isTestRecord = ((latestLearningRecord as any).type as StudySessionType | undefined) === "test";

    if (isTestRecord) {
      const matchedTest = testsData.find((item) => item.id === rawId) ?? testsData.find((item) => item.name === rawName);
      if (matchedTest) {
        return {
          kind: "test",
          title: matchedTest.name,
          subtitle: "Revisit your latest test",
          meta: getStudentTestResultPresentation(latestLearningRecord)?.state === "final"
            ? `${percentage}% last score - ${mode}`
            : getStudentTestResultPresentation(latestLearningRecord)?.label ?? "Result syncing",
          ctaLabel: "Open test",
          testId: matchedTest.id,
          assignment: matchedTest.assignment,
        };
      }
    }

    const matchedLesson = lessonsData.find((item) => item.id === rawId) ?? lessonsData.find((item) => item.name === rawName);
    if (matchedLesson) {
      return {
        kind: "lesson",
        title: matchedLesson.name,
        subtitle: "Pick up your latest lesson",
        meta: `${percentage}% last run - ${mode}`,
        ctaLabel: "Open lesson",
        lessonId: matchedLesson.id,
        assignment: matchedLesson.assignment,
      };
    }

    return null;
  }, [latestLearningRecord, lessonsData, savedResume, testsData]);


  const latestTestByLesson = useMemo(() => {
    const map = new Map<string, { percentage: number; date: string }>();
    for (const rec of progress?.testHistory ?? []) {
      const lessonId = (rec as any).lessonId ?? (rec as any).lesson_id ?? (rec as any).lesson?.id ?? "";
      if (!lessonId) continue;
      if (!map.has(lessonId)) {
        map.set(lessonId, {
          percentage: typeof (rec as any).percentage === "number" ? (rec as any).percentage : 0,
          date: typeof (rec as any).date === "string" ? (rec as any).date : typeof (rec as any).timestamp === "string" ? (rec as any).timestamp : "",
        });
      }
    }
    return map;
  }, [progress?.testHistory]);

  const selectedLessonWords = useMemo(() => {
    if (!selectedLessonDetail) return [];
    return lessonsWords.filter((word) => word.lessonId === selectedLessonDetail.id);
  }, [lessonsWords, selectedLessonDetail]);

  useEffect(() => {
    if (!initialCatalogLoadedRef.current) return;
    if (runtimeScreen === "lesson-detail" && !selectedLessonDetail) {
      setActiveTab("lessons");
      setRuntimeScreen("dashboard");
      showToast("This lesson is no longer assigned.", "info");
    } else if (runtimeScreen === "test-detail" && !selectedTestDetail) {
      setActiveTab("tests");
      setRuntimeScreen("dashboard");
      showToast("This test is no longer assigned.", "info");
    }
  }, [runtimeScreen, selectedLessonDetail, selectedTestDetail, showToast]);

  const hasStudyContent = lessonsData.length > 0 || testsData.length > 0 || allWords.length > 0;

  const applyProgress = useCallback(
    (next: StudyProgress) => {
      progressRef.current = next;
      setProgress(next);
      if (sessionId) {
        saveLocalProgress(sessionId, next).catch(() => {});
        scheduleProgressSync(sessionId, next, 1200, (canonical) => {
          if (sessionIdRef.current !== sessionId) return;
          progressRef.current = canonical;
          setProgress(canonical);
        });
      }
    },
    [sessionId]
  );

  useEffect(() => {
    const savedCount = progress?.preferences.practiceLength;
    if (savedCount && QUICK_PLAY_COUNTS.some((count) => count === savedCount)) {
      setQuickPlayCount(savedCount);
    }
  }, [progress?.preferences.practiceLength]);

  const setCorrectCountValue = useCallback((value: number) => {
    correctCountRef.current = value;
    setCorrectCount(value);
  }, []);

  const incrementCorrectCount = useCallback(() => {
    const next = correctCountRef.current + 1;
    correctCountRef.current = next;
    setCorrectCount(next);
  }, []);

  const clearSessionIssues = useCallback(() => {
    sessionIssuesRef.current = [];
    setSessionIssues([]);
  }, []);

  const getCurrentMcqReviewOptions = useCallback((): SessionIssue["mcqOptions"] => {
    if (!showMcq) return undefined;
    if (mcqChoiceOptions && mcqChoiceOptions.length >= 2) {
      const correctId = current?.mcqCorrectOptionId != null ? String(current.mcqCorrectOptionId) : null;
      return mcqChoiceOptions.map((option) => ({
        id: option.id,
        text: option.text,
        correct: correctId != null
          ? String(option.id) === correctId
          : acceptedAnswers.some((answer) => normalizeText(String(answer)) === normalizeText(option.text)),
      }));
    }
    if (mcqChoiceTexts.length >= 2) {
      return mcqChoiceTexts.map((text) => ({
        text,
        correct: acceptedAnswers.some((answer) => normalizeText(String(answer)) === normalizeText(text)),
      }));
    }
    return undefined;
  }, [acceptedAnswers, current?.mcqCorrectOptionId, mcqChoiceOptions, mcqChoiceTexts, showMcq]);

  const recordSessionIssue = useCallback((issue: SessionIssue) => {
    const enriched: SessionIssue = {
      ...issue,
      questionIndex: issue.questionIndex ?? current?.questionIndex,
      mode: issue.mode ?? currentSessionMode,
      promptFormat: issue.promptFormat ?? current?.promptFormat,
      answerFormat: issue.answerFormat ?? current?.answerFormat,
      mcqOptions: issue.mcqOptions ?? getCurrentMcqReviewOptions(),
      mcqCorrectOptionId: issue.mcqCorrectOptionId ?? current?.mcqCorrectOptionId ?? null,
    };
    const shouldReplaceTestResponse =
      sessionType === "test" && Number.isInteger(enriched.questionIndex);
    const next = shouldReplaceTestResponse
      ? [
          ...sessionIssuesRef.current.filter(
            (item) => item.questionIndex !== enriched.questionIndex
          ),
          enriched,
        ]
      : [...sessionIssuesRef.current, enriched];
    sessionIssuesRef.current = next;
    setSessionIssues(next);
    if (shouldReplaceTestResponse) {
      saveTestDraftRef.current(next);
    }
  }, [current?.answerFormat, current?.mcqCorrectOptionId, current?.promptFormat, current?.questionIndex, currentSessionMode, getCurrentMcqReviewOptions, sessionType]);

  const queueTestDraftSave = useCallback((issues: SessionIssue[]) => {
    const attempt = activeTestAttemptRef.current;
    if (!sessionId || !attempt) return;
    const answers = issuesToTestAnswers(issues);
    testDraftSaveChainRef.current = testDraftSaveChainRef.current
      .catch(() => {})
      .then(() =>
        saveTestAttemptDraft({
          sessionId,
          testId: attempt.testId,
          attemptKey: attempt.attemptKey,
          answers,
        })
      )
      .catch(() => {
        // The final submit includes the complete local answer set and the
        // offline queue retries it. Draft sync must never interrupt answering.
      });
  }, [sessionId]);
  saveTestDraftRef.current = queueTestDraftSave;

  useEffect(() => {
    correctCountRef.current = correctCount;
  }, [correctCount]);

  useEffect(() => {
    sessionIssuesRef.current = sessionIssues;
  }, [sessionIssues]);

  const triggerHaptic = useCallback(
    async (type: "success" | "warning" | "error") => {
      if (!progress?.preferences.hapticEnabled) return;
      try {
        if (type === "success") {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        }
        if (type === "warning") {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          return;
        }
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {
        // ignore haptic failures
      }
    },
    [progress?.preferences.hapticEnabled]
  );

  const playCorrectDing = useCallback(async () => {
    if (progressRef.current?.preferences.soundEnabled === false) return;
    try {
      if (!correctDingUriRef.current) {
        const asset = Asset.fromModule(CORRECT_DING_ASSET);
        await asset.downloadAsync();
        correctDingUriRef.current = asset.localUri ?? asset.uri;
      }
      if (!correctDingUriRef.current) return;
      try {
        correctDingPlayerRef.current?.pause?.();
        correctDingPlayerRef.current?.remove?.();
      } catch {}
      const player = createAudioPlayer(correctDingUriRef.current);
      correctDingPlayerRef.current = player;
      player.play();
    } catch {
      // Correct-answer audio is decorative; never block gameplay.
    }
  }, []);

  const openLessonDetail = useCallback((lesson: LessonGamePayload) => {
    setSelectedTestDetail(null);
    setSelectedLessonDetail(lesson);
    setLessonDetailMode("typing");
    setRuntimeScreen("lesson-detail");
  }, []);

  const saveResumeData = useCallback(() => {
    // Graded tests are intentionally non-resumable until a server-backed draft
    // exists. This prevents answer snapshots from surviving an expired assignment.
    if (sessionType === "test" || !sessionId || !sessionContext.id || !activeWords.length) return;
    const lesson = lessonsData.find((item) => item.id === sessionContext.id);
    if (!lesson) return;
    const data: SavedResumeData = {
      version: 3,
      lessonId: sessionContext.id,
      lessonName: sessionContext.name || "Lesson",
      contentUpdatedAt: lesson.updated_at ?? null,
      idx,
      correctCount,
      activeWords,
      sessionType: sessionType as Exclude<StudySessionType, "test">,
      sessionMode,
      direction,
      pool: sessionPool,
      sessionIssues,
      sessionStreak,
      mistakeWordIds,
      startedAt: sessionStartedAtRef.current,
      input,
      useNativeAnswerKeyboard,
      feedback,
      mcqChoiceTexts,
      mcqChoiceOptions,
      mcqSelection,
      conjugationInputs,
      conjugationRowFeedback,
      showHint,
      needsRetype,
      showInfinitiveNote,
      geminiCorrection,
    };
    AsyncStorage.setItem(studyResumeStorageKey(sessionId), JSON.stringify(data)).catch(() => {});
    setSavedResume(data);
  }, [activeWords, conjugationInputs, conjugationRowFeedback, correctCount, direction, feedback, geminiCorrection, idx, input, lessonsData, mcqChoiceOptions, mcqChoiceTexts, mcqSelection, mistakeWordIds, needsRetype, sessionContext.id, sessionContext.name, sessionId, sessionIssues, sessionMode, sessionPool, sessionStreak, sessionType, showHint, showInfinitiveNote, useNativeAnswerKeyboard]);

  const exitCurrentSession = useCallback(() => {
    clearAnswerTimers();
    finishingSessionRef.current = false;
    if (sessionType === "test") {
      testDeadlineAtRef.current = null;
      testAutoSubmitTriggeredRef.current = false;
      testTimerAnnouncementRef.current = null;
      returnToTestReviewAfterAnswerRef.current = false;
      setTestTimeRemainingSeconds(null);
      setTestSubmitting(false);
    }
    if (sessionType === "test" && selectedTestDetail) {
      setRuntimeScreen("test-detail");
      return;
    }
    if (selectedLessonDetail) {
      saveResumeData();
      setActiveTab("practice");
      setRuntimeScreen("dashboard");
      return;
    }
    if (selectedTestDetail) {
      setRuntimeScreen("test-detail");
      return;
    }
    setActiveTab("practice");
    setRuntimeScreen("dashboard");
  }, [clearAnswerTimers, saveResumeData, selectedLessonDetail, selectedTestDetail, sessionType]);

  const requestExitCurrentSession = useCallback(() => {
    Alert.alert(
      "Exit Session?",
      sessionType === "test"
        ? "Your recorded answers are saved. The active test timer will continue, and you can resume before it expires."
        : "Your session will be saved so you can return to this lesson.",
      [
        { text: "Keep Going", style: "cancel" },
        { text: "Exit", style: "destructive", onPress: exitCurrentSession },
      ]
    );
  }, [exitCurrentSession, sessionType]);

  const openWorkspaceTab = useCallback((tab: "settings" | "classrooms") => {
    if (testSubmitting || finishingSessionRef.current) return;
    const navigate = () => {
      if (runtimeScreen === "session" || runtimeScreen === "test-review") exitCurrentSession();
      Keyboard.dismiss();
      setResultRecord(null); setSelectedHistoryRecord(null);
      setRuntimeScreen("dashboard"); setActiveTab(tab);
    };
    if (runtimeScreen === "session" || runtimeScreen === "test-review") {
      Alert.alert("Leave this session?", sessionType === "test"
        ? "Your recorded answers are saved, but the test timer will continue. Resume before it expires."
        : "Your practice session will be saved so you can continue later.", [
        { text: "Keep going", style: "cancel" },
        { text: "Save and leave", onPress: navigate },
      ]);
    } else navigate();
  }, [exitCurrentSession, runtimeScreen, sessionType, testSubmitting]);

  useEffect(() => {
    return navigation.addListener("beforeRemove", (event) => {
      if (
        runtimeScreenRef.current !== "session" &&
        runtimeScreenRef.current !== "test-review"
      ) {
        return;
      }
      event.preventDefault();
      requestExitCurrentSession();
    });
  }, [navigation, requestExitCurrentSession]);

  const resumeSession = useCallback(() => {
    if (!savedResume) return;
    clearAnswerTimers();
    finishingSessionRef.current = false;
    const lesson = lessonsData.find((l) => l.id === savedResume.lessonId) ?? null;
    if (!lesson || (savedResume.contentUpdatedAt ?? null) !== (lesson.updated_at ?? null)) {
      setSavedResume(null);
      if (sessionId) AsyncStorage.removeItem(studyResumeStorageKey(sessionId)).catch(() => {});
      showToast("This lesson changed, so the previous saved session was cleared.", "info");
      return;
    }
    setSelectedLessonDetail(lesson);
    setSessionType(savedResume.sessionType);
    setSessionMode(savedResume.sessionMode);
    resumeInteractionRef.current = savedResume;
    sessionAttemptKeyRef.current = null;
    sessionStartedAtRef.current = savedResume.startedAt || new Date().toISOString();
    setDirection(savedResume.direction);
    setActiveWords(savedResume.activeWords);
    setIdx(savedResume.idx);
    setInput(typeof savedResume.input === "string" ? savedResume.input : "");
    setUseNativeAnswerKeyboard(savedResume.useNativeAnswerKeyboard === true);
    setCorrectCountValue(savedResume.correctCount);
    setSessionIssues(savedResume.sessionIssues ?? []);
    sessionIssuesRef.current = savedResume.sessionIssues ?? [];
    sessionStreakRef.current = savedResume.sessionStreak ?? 0;
    setSessionStreak(savedResume.sessionStreak ?? 0);
    setMistakeWordIds(savedResume.mistakeWordIds ?? []);
    setFeedback(savedResume.feedback ?? null);
    setMcqSelection(savedResume.mcqSelection ?? null);
    setMcqChoiceTexts(Array.isArray(savedResume.mcqChoiceTexts) ? savedResume.mcqChoiceTexts : []);
    setMcqChoiceOptions(Array.isArray(savedResume.mcqChoiceOptions) ? savedResume.mcqChoiceOptions : null);
    setConjugationInputs(Array.isArray(savedResume.conjugationInputs) ? savedResume.conjugationInputs : []);
    setConjugationRowFeedback(Array.isArray(savedResume.conjugationRowFeedback) ? savedResume.conjugationRowFeedback : []);
    mcqCorrectScale.setValue(1);
    setShowHint(savedResume.showHint === true);
    setNeedsRetype(savedResume.needsRetype === true);
    setShowInfinitiveNote(savedResume.showInfinitiveNote === true);
    setGeminiCorrection(typeof savedResume.geminiCorrection === "string" ? savedResume.geminiCorrection : "");
    setSessionContext({ id: savedResume.lessonId, name: savedResume.lessonName });
    setSessionPool(savedResume.pool);
    setRuntimeScreen("session");
  }, [clearAnswerTimers, lessonsData, mcqCorrectScale, savedResume, sessionId, setCorrectCountValue, showToast]);

  const openLessonDocument = useCallback(() => {
    const documentUrl = selectedLessonDetail?.document_url?.trim();
    if (!documentUrl) {
      showToast("No lesson PDF is attached to this lesson yet.", "info");
      return;
    }
    const absoluteDocumentUrl = normalizeAbsoluteDocumentUrl(documentUrl);
    if (Platform.OS === "web") {
      Linking.openURL(absoluteDocumentUrl).catch(() => {
        showToast("Could not open the lesson PDF in the browser.", "danger");
      });
      return;
    }
    setLessonPdfViewerUri(absoluteDocumentUrl);
    setLessonPdfViewerVisible(true);
  }, [selectedLessonDetail?.document_url, showToast]);

  const openTestDetailFromTest = useCallback((test: TestGamePayload) => {
    setSelectedLessonDetail(null);
    setSelectedTestDetail({ type: "test", test });
    setRuntimeScreen("test-detail");
  }, []);

  const openContinueSuggestion = useCallback(() => {
    if (!continueSuggestion) return;
    if (continueSuggestion.kind === "resume") {
      resumeSession();
      return;
    }
    if (continueSuggestion.kind === "lesson") {
      const lesson = lessonsData.find((item) => item.id === continueSuggestion.lessonId);
      if (lesson) openLessonDetail(lesson);
      return;
    }
    const test = testsData.find((item) => item.id === continueSuggestion.testId);
    if (test) openTestDetailFromTest(test);
  }, [continueSuggestion, lessonsData, openLessonDetail, openTestDetailFromTest, resumeSession, testsData]);

  const getReviewMistakeIssuesById = useCallback(() => {
    const issuesById = new Map<string, SessionIssue>();
    const rememberIssue = (issue: SessionIssue | undefined) => {
      if (!issue || !issue.id) return;
      if (issue.kind !== "wrong" && issue.kind !== "close" && issue.kind !== "skip") return;
      if (!issuesById.has(issue.id)) issuesById.set(issue.id, issue);
    };

    for (const issue of [...sessionIssuesRef.current].reverse()) {
      rememberIssue(issue);
    }

    const records = [...(progress?.practiceHistory ?? []), ...(progress?.testHistory ?? [])].sort((a, b) => {
      const left = typeof a.timestamp === "number" ? a.timestamp : Date.parse(a.date || "");
      const right = typeof b.timestamp === "number" ? b.timestamp : Date.parse(b.date || "");
      return (right || 0) - (left || 0);
    });
    for (const record of records) {
      for (const issue of [...(record.issues ?? [])].reverse()) {
        rememberIssue(issue);
      }
    }

    return issuesById;
  }, [progress?.practiceHistory, progress?.testHistory]);

  const startSession = useCallback(
    (
      type: StudySessionType,
      mode: StudySessionMode,
      dir: StudyDirection,
      scopedWords?: GameWord[],
      context?: {
        id?: string | null;
        name?: string | null;
        focusInterventionIds?: string[];
        focusMode?: FollowUpMode;
      },
      attemptSession?: ActiveTestAttemptSession
    ) => {
      if (!progress) return;
      if (type === "test" && (!context?.id || !attemptSession)) {
        showToast("A secure test session could not be started.", "danger");
        return;
      }
      clearAnswerTimers();
      finishingSessionRef.current = false;
      resumeInteractionRef.current = null;
      activeFocusInterventionIdsRef.current = context?.focusInterventionIds ?? [];
      activeFocusModeRef.current = context?.focusMode ?? null;
      const baseWords = scopedWords !== undefined ? scopedWords : allWords;
      const expandedBase = expandConjugationTablesForMode(baseWords, mode);
      const reviewIssuesById =
        type === "review-mistakes" && !context?.focusInterventionIds?.length
          ? getReviewMistakeIssuesById()
          : null;
      const effectiveMistakeWordIds = reviewIssuesById
        ? Array.from(reviewIssuesById.keys())
        : mistakeWordIds;
      const requestedLength =
        type === "daily-challenge"
          ? 20
          : scopedWords !== undefined
          ? expandedBase.length
          : progress.preferences.practiceLength || 15;
      const selected = context?.focusInterventionIds?.length
        ? expandedBase.slice(0, requestedLength)
        : pickSessionWords(
            expandedBase,
            type,
            mode,
            requestedLength,
            effectiveMistakeWordIds,
            progress.wordStats
          );
      if (!selected.length) {
        showToast("No activities are available for this mode yet.", "info");
        return;
      }
      const selectedWords: GameWord[] =
        reviewIssuesById == null
          ? selected
          : selected.map((word) => {
              const issue = reviewIssuesById.get(word.id);
              return {
                ...word,
                reviewMode: getIssueReviewMode(issue) ?? "typing",
                reviewIssue: issue,
              } as ReviewableGameWord;
            });
      const deadlineAt =
        type === "test" && attemptSession?.expiresAt
          ? Date.parse(attemptSession.expiresAt)
          : null;
      const timeLimitSeconds =
        deadlineAt != null && Number.isFinite(deadlineAt)
          ? Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000))
          : null;
      const restoredIssues =
        type === "test" && attemptSession
          ? testAnswersToIssues(selectedWords, attemptSession.answers)
          : [];
      const firstUnansweredIndex =
        type === "test" && attemptSession
          ? firstUnansweredTestWordIndex(selectedWords, attemptSession.answers)
          : 0;
      setSessionType(type);
      sessionAttemptKeyRef.current =
        type === "test" ? attemptSession?.attemptKey ?? null : null;
      sessionStartedAtRef.current =
        type === "test" ? attemptSession?.startedAt ?? null : new Date().toISOString();
      activeTestAttemptRef.current =
        type === "test" && context?.id && attemptSession
          ? { ...attemptSession, testId: context.id }
          : null;
      testDeadlineAtRef.current =
        deadlineAt != null && Number.isFinite(deadlineAt) ? deadlineAt : null;
      testAutoSubmitTriggeredRef.current = false;
      testTimerAnnouncementRef.current = null;
      returnToTestReviewAfterAnswerRef.current = false;
      setTestTimeRemainingSeconds(timeLimitSeconds);
      setTestSubmitting(false);
      setTestSubmissionError(null);
      setSessionMode(mode);
      setDirection(dir);
      setActiveWords(selectedWords);
      setIdx(firstUnansweredIndex ?? Math.max(0, selectedWords.length - 1));
      setInput("");
      setUseNativeAnswerKeyboard(false);
      setCorrectCountValue(0);
      setFeedback(null);
      setMcqSelection(null);
      mcqCorrectScale.setValue(1);
      setShowHint(false);
      setNeedsRetype(false);
      setShowInfinitiveNote(false);
      setGeminiCorrection("");
      setConjugationInputs([]);
      setConjugationRowFeedback([]);
      if (type === "test") {
        sessionIssuesRef.current = restoredIssues;
        setSessionIssues(restoredIssues);
      } else {
        clearSessionIssues();
      }
      setMistakeWordIds([]);
      sessionStreakRef.current = 0;
      setSessionStreak(0);
      setSessionContext({ id: context?.id ?? null, name: context?.name ?? null });
      setSessionPool(expandedBase);
      setRuntimeScreen(
        type === "test" && firstUnansweredIndex == null
          ? "test-review"
          : "session"
      );
    },
    [allWords, clearAnswerTimers, clearSessionIssues, getReviewMistakeIssuesById, mcqCorrectScale, mistakeWordIds, progress, setCorrectCountValue, showToast]
  );

  const activeFocusInterventions = useMemo(
    () => focusInterventions.filter(
      (item) => (item.status === "assigned" || item.status === "in_progress")
        && (!item.lessonId || [...lessonsData, ...testsData].some((content) => content.id === item.lessonId))
    ),
    [focusInterventions, lessonsData, testsData]
  );
  const completedFocusModes = useMemo(
    () => getCompletedFollowUpModes(activeFocusInterventions),
    [activeFocusInterventions]
  );
  const nextFocusMode = useMemo(
    () => getNextFollowUpMode(activeFocusInterventions),
    [activeFocusInterventions]
  );

  const startTeacherFocusPractice = useCallback(() => {
    const active = activeFocusInterventions;
    const wordMatchesIntervention = (word: GameWord, item: StudentFocusIntervention) => {
      const prompt = normalizeText(item.focusPrompt);
      const answer = normalizeText(item.focusAnswer ?? "");
      const values = [word.pt, word.en, word.sp ?? "", word.se ?? ""].map(normalizeText);
      return values.includes(prompt) && (!answer || values.includes(answer));
    };
    const playableInterventions = active.filter((item) =>
      lessonsWords.some((word) => wordMatchesIntervention(word, item))
    );
    const matchedWords = lessonsWords.filter((word) =>
      playableInterventions.some((item) => wordMatchesIntervention(word, item))
    );
    if (matchedWords.length === 0) {
      showToast(
        "These focus words are not in your current assignments. Ask your teacher to reassign the lesson.",
        "info"
      );
      return;
    }

    const first = playableInterventions[0];
    const directionForFocus: StudyDirection =
      normalizeText(first?.focusPrompt ?? "") === normalizeText(matchedWords[0]?.en ?? "")
        ? "en-pt"
        : "pt-en";
    const nextMode = getNextFollowUpMode(playableInterventions);
    if (!nextMode) {
      showToast("Your teacher follow-up is already complete.", "success");
      return;
    }
    if (sessionId) {
      Promise.all(playableInterventions.map((item) => updateStudentFocusIntervention({
        sessionId,
        interventionId: item.id,
        status: "in_progress",
      }))).catch(() => {});
      const sources = new Map<string, "lesson" | "test">();
      playableInterventions.forEach((item) => {
        if (!item.sourceResultKey) return;
        const resultType = progressRef.current?.testHistory.some(
          (record) => String(record.id) === item.sourceResultKey
        ) ? "test" : "lesson";
        sources.set(item.sourceResultKey, resultType);
      });
      Promise.all(Array.from(sources).map(([resultKey, resultType]) => (
        recordResultEvent({
          sessionId,
          resultKey,
          resultType,
          eventType: "follow_up_started",
          metadata: {
            mode: nextMode,
            interventionIds: playableInterventions.map((item) => item.id),
          },
        })
      ))).catch(() => {});
    }
    const playableIds = new Set(playableInterventions.map((item) => item.id));
    setFocusInterventions((current) =>
      current.map((item) => (
        playableIds.has(item.id) ? { ...item, status: "in_progress" } : item
      ))
    );
    resultReviewSourceRef.current = null;
    startSession(
      "review-mistakes",
      nextMode,
      directionForFocus,
      matchedWords,
      {
        id: null,
        name: `Follow-up: ${FOLLOW_UP_MODE_LABELS[nextMode]}`,
        focusInterventionIds: playableInterventions.map((item) => item.id),
        focusMode: nextMode,
      }
    );
  }, [activeFocusInterventions, lessonsWords, sessionId, showToast, startSession]);

  const openTestHistoryRecord = useCallback((record: StudyRecord) => {
    setSelectedHistoryRecord(record);
    if (sessionId && record.id) {
      recordResultEvent({
        sessionId,
        resultKey: String(record.id),
        resultType: "test",
        eventType: "result_opened",
      }).catch(() => {});
    }
  }, [sessionId]);

  const beginAssignedTest = useCallback(async (test: TestGamePayload) => {
    if (!sessionId || testStarting) return;
    const currentProgress = testsWithProgress.find((item) => item.id === test.id)?.assignmentProgress;
    if (currentProgress && !["not-started", "in-progress", "retry-available"].includes(currentProgress.status)) {
      showToast(
        currentProgress.status === "awaiting-review"
          ? "This test is awaiting teacher review."
          : currentProgress.status === "completed"
            ? "This test has already been completed."
            : "This test does not have another attempt available.",
        "info"
      );
      return;
    }
    if (offlineMode) {
      showToast("Connect to the internet to start or resume a graded test.", "info");
      return;
    }
    const testWords = normalizeTestsToWords([test], assetRefreshEpoch)
      .filter((word) => word.sourceType === "test");
    if (!testWords.length) {
      showToast("This test does not have any available questions.", "info");
      return;
    }

    setTestStarting(true);
    try {
      const attemptSession = await startTestAttempt({
        sessionId,
        testId: test.id,
        mode: "typing",
        direction: "en-pt",
      });
      startSession(
        "test",
        "typing",
        "en-pt",
        testWords,
        { id: test.id, name: test.name },
        attemptSession
      );
      if (attemptSession.resumed) {
        showToast(
          attemptSession.answers.length > 0
            ? "Your saved answers have been restored."
            : "Your active test timer has been restored.",
          "success"
        );
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "This test could not be started.",
        "danger"
      );
      await refreshCatalogRef.current?.({ force: true }).catch(() => {});
    } finally {
      setTestStarting(false);
    }
  }, [assetRefreshEpoch, offlineMode, sessionId, showToast, startSession, testStarting, testsWithProgress]);

  const startResultMistakeReview = useCallback(() => {
    if (resultMistakeCount === 0 || resultRecord?.pendingSync || resultRecord?.requiresReview) return;
    const resultKey = resultRecord?.resultKey;
    if (resultKey) {
      resultReviewSourceRef.current = {
        resultKey,
        resultType: sessionType === "test" ? "test" : "lesson",
      };
      if (sessionId) {
        recordResultEvent({
          sessionId,
          resultKey,
          resultType: sessionType === "test" ? "test" : "lesson",
          eventType: "review_started",
        }).catch(() => {});
      }
    }
    setResultRecord(null);
    startSession(
      "review-mistakes",
      sessionMode,
      direction,
      sessionPool,
      {
        id: sessionContext.id,
        name: sessionContext.name
          ? `${sessionContext.name} review`
          : "Mistake review",
      }
    );
  }, [direction, resultMistakeCount, resultRecord, sessionContext.id, sessionContext.name, sessionId, sessionMode, sessionPool, sessionType, startSession]);

  const openRecommendedNextLesson = useCallback(() => {
    if (!recommendedNextLesson) return;
    setResultRecord(null);
    setActiveTab("lessons");
    openLessonDetail(recommendedNextLesson);
  }, [openLessonDetail, recommendedNextLesson]);

  const consumeTestAttemptAvailability = useCallback((testId: string, attempt: VerifiedTestAttempt) => {
    const consume = (test: TestGamePayload): TestGamePayload => {
      if (test.id !== testId) return test;
      const attemptsRemaining = test.attempts_remaining == null
        ? null
        : Math.max(0, test.attempts_remaining - 1);
      const assignmentStatus = attempt.requiresReview
        ? "awaiting-review"
        : attempt.passed
          ? "completed"
          : attemptsRemaining === 0
            ? "attempts-exhausted"
            : "retry-available";
      return {
        ...test,
        attempts_used: (test.attempts_used ?? 0) + 1,
        attempts_remaining: attemptsRemaining,
        assignment_status: assignmentStatus,
        active_attempt: null,
      };
    };
    setTestsData((previous) => previous.map(consume));
    setSelectedTestDetail((previous) =>
      previous ? { ...previous, test: consume(previous.test) } : previous
    );
  }, []);

  const isInvalidTestAttemptSubmissionError = useCallback((error: unknown) => {
    if (isRetryableStudyApiError(error)) return false;
    const status = error instanceof StudyApiError ? error.status : null;
    if (status != null && ![400, 404, 409].includes(status)) return false;
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    return (
      message.includes("invalid test attempt") ||
      message.includes("invalid_test_attempt") ||
      message.includes("could not be validated") ||
      message.includes("no longer active") ||
      message.includes("must be started") ||
      message.includes("test session")
    );
  }, []);

  const recoverActiveTestAttemptSession = useCallback(async () => {
    if (!sessionId || !sessionContext.id) return null;
    const attemptSession = await startTestAttempt({
      sessionId,
      testId: sessionContext.id,
      mode: sessionMode as SubmitTestAttemptInput["mode"],
      direction,
    });
    sessionAttemptKeyRef.current = attemptSession.attemptKey;
    sessionStartedAtRef.current = attemptSession.startedAt ?? new Date().toISOString();
    activeTestAttemptRef.current = { ...attemptSession, testId: sessionContext.id };
    const deadlineAt = attemptSession.expiresAt ? Date.parse(attemptSession.expiresAt) : Number.NaN;
    testDeadlineAtRef.current = Number.isFinite(deadlineAt) ? deadlineAt : null;
    setTestTimeRemainingSeconds(
      Number.isFinite(deadlineAt)
        ? Math.max(0, Math.ceil(((deadlineAt as number) - Date.now()) / 1000))
        : null
    );
    return attemptSession;
  }, [direction, sessionContext.id, sessionId, sessionMode]);

  const finishSession = useCallback(async () => {
    const latestProgress = progressRef.current;
    if (!latestProgress || finishingSessionRef.current) return;
    finishingSessionRef.current = true;
    if (sessionType === "test") {
      setTestSubmitting(true);
    }
    clearAnswerTimers();
    let total = activeWords.length;
    let finalCorrectCount = correctCountRef.current;
    let finalIssues = [...sessionIssuesRef.current];
    let percentage = gradePercentage(finalCorrectCount, total);
    let passingPercentage = sessionType === "test"
      ? Math.min(100, Math.max(1, Number(
          testsData.find((test) => test.id === sessionContext.id)?.passing_percentage
        ) || 80))
      : 80;
    let earnedPoints: number | undefined;
    let totalPoints: number | undefined;
    let verifiedHistoryRecord: StudyRecord | null = null;
    const allQuestionsAreOpenResponse =
      sessionType === "test" &&
      activeWords.length > 0 &&
      activeWords.every((word) => word.answerFormat === "open");
    let passed =
      sessionType === "test"
        ? (allQuestionsAreOpenResponse ? finalCorrectCount === activeWords.length : percentage >= passingPercentage)
        : percentage >= 80;
    let attemptSubmitted = false;
    let requiresReview = false;
    if (sessionType === "test") {
      if (!sessionId || !sessionContext.id || !sessionAttemptKeyRef.current) {
        const message = "This test attempt is missing required session information. Your answers are still available.";
        setTestSubmissionError(message);
        showToast(message, "danger");
        finishingSessionRef.current = false;
        setTestSubmitting(false);
        setRuntimeScreen("test-review");
        return;
      }
      const answers = finalIssues.flatMap((issue) =>
        Number.isInteger(issue.questionIndex)
          ? [{
              questionIndex: issue.questionIndex as number,
              answer: issue.answer ?? "",
              selectedOptionId: issue.selectedOptionId ?? null,
            }]
          : []
      );
      let attemptInput: SubmitTestAttemptInput = {
        sessionId,
        testId: sessionContext.id,
        attemptKey: sessionAttemptKeyRef.current,
        mode: sessionMode,
        direction,
        startedAt: sessionStartedAtRef.current,
        completedAt: new Date().toISOString(),
        answers,
      };
      try {
        await waitForDraftSave(testDraftSaveChainRef.current);
        let attempt = await submitTestAttempt(attemptInput);
        if (!attempt) {
          throw new Error("Test attempt could not be submitted");
        }
        await removePendingTestAttempt(sessionId, attemptInput.attemptKey).catch(() => {});
        consumeTestAttemptAvailability(sessionContext.id, attempt);
        attemptSubmitted = true;
        requiresReview = attempt.requiresReview;
        total = attempt.totalQuestions;
        finalCorrectCount = attempt.score;
        percentage = attempt.percentage;
        passed = attempt.passed;
        passingPercentage = Number(attempt.passingPercentage ?? attempt.historyRecord.passingPercentage) || passingPercentage;
        earnedPoints = attempt.earnedPoints ?? attempt.historyRecord.earnedPoints;
        totalPoints = attempt.totalPoints ?? attempt.historyRecord.totalPoints;
        verifiedHistoryRecord = attempt.historyRecord;
        finalIssues = attempt.historyRecord.issues ?? finalIssues;
        activeTestAttemptRef.current = null;
        testDeadlineAtRef.current = null;
        setTestTimeRemainingSeconds(null);
        setTestSubmissionError(null);
        if (requiresReview) {
          showToast("Open responses were submitted for teacher review.", "info");
        }
        refreshCatalogRef.current?.({ force: true }).catch(() => {});
      } catch (error) {
        if (isInvalidTestAttemptSubmissionError(error)) {
          try {
            const recovered = await recoverActiveTestAttemptSession();
            if (recovered?.attemptKey) {
              attemptInput = {
                ...attemptInput,
                attemptKey: recovered.attemptKey,
                startedAt: recovered.startedAt ?? attemptInput.startedAt,
                completedAt: new Date().toISOString(),
              };
              const recoveredAttempt = await submitTestAttempt(attemptInput);
              await removePendingTestAttempt(sessionId, attemptInput.attemptKey).catch(() => {});
              consumeTestAttemptAvailability(sessionContext.id, recoveredAttempt);
              attemptSubmitted = true;
              requiresReview = recoveredAttempt.requiresReview;
              total = recoveredAttempt.totalQuestions;
              finalCorrectCount = recoveredAttempt.score;
              percentage = recoveredAttempt.percentage;
              passed = recoveredAttempt.passed;
              passingPercentage = Number(recoveredAttempt.passingPercentage ?? recoveredAttempt.historyRecord.passingPercentage) || passingPercentage;
              earnedPoints = recoveredAttempt.earnedPoints ?? recoveredAttempt.historyRecord.earnedPoints;
              totalPoints = recoveredAttempt.totalPoints ?? recoveredAttempt.historyRecord.totalPoints;
              verifiedHistoryRecord = recoveredAttempt.historyRecord;
              finalIssues = recoveredAttempt.historyRecord.issues ?? finalIssues;
              activeTestAttemptRef.current = null;
              testDeadlineAtRef.current = null;
              setTestTimeRemainingSeconds(null);
              setTestSubmissionError(null);
              if (requiresReview) {
                showToast("Open responses were submitted for teacher review.", "info");
              }
              refreshCatalogRef.current?.({ force: true }).catch(() => {});
              error = null;
            }
          } catch (recoveryError) {
            error = recoveryError;
          }
        }
        if (attemptSubmitted) {
          // Recovery retry already succeeded and populated result state.
        } else if (!isRetryableStudyApiError(error)) {
          const message = error instanceof Error
            ? error.message
            : "This test could not be submitted. Your answers are still available; please try again.";
          setTestSubmissionError(message);
          showToast(message, "danger");
          finishingSessionRef.current = false;
          setTestSubmitting(false);
          setRuntimeScreen("test-review");
          return;
        }
        if (!attemptSubmitted) {
          const queued = await queuePendingTestAttempt(
            attemptInput,
            studentSession?.student.id
          ).catch(() => false);
          if (!queued) {
            showToast(
              "This device already has too many unsynced tests. Reconnect before leaving this result.",
              "danger"
            );
            setTestSubmissionError("This device already has too many unsynced tests. Reconnect, then try submitting again.");
            finishingSessionRef.current = false;
            setTestSubmitting(false);
            setRuntimeScreen("test-review");
            return;
          }
          testDeadlineAtRef.current = null;
          setTestTimeRemainingSeconds(null);
          showToast("Your answers are saved and will sync when your connection is ready.", "info");
          setResultRecord({
            resultKey: attemptInput.attemptKey,
            score: 0,
            total,
            percentage: 0,
            passed: false,
            issues: finalIssues,
            verified: false,
            requiresReview: false,
            pendingSync: true,
            passingPercentage,
          });
          finishingSessionRef.current = false;
          setTestSubmitting(false);
          setRuntimeScreen("results");
          return;
        }
      }
    }
    const sessionLesson = sessionContext.id != null ? lessonsData.find((l) => l.id === sessionContext.id) : null;
    const closeCount = sessionType === "test"
      ? 0
      : finalIssues.filter((issue) => issue.kind === "close").length;
    const xpEarned = requiresReview
      ? 0
      : calculateSessionXp({
          correct: Math.max(0, finalCorrectCount - closeCount),
          close: closeCount,
          percentage,
          type: sessionType,
          passingPercentage,
        });
    const localRecord = createRecord({
      type: sessionType,
      mode: sessionMode,
      direction,
      lessonId: sessionContext.id,
      lessonName: sessionContext.name,
      languagePair: sessionLesson?.language_pair ?? null,
      lessonLanguage: sessionLesson?.language?.trim() || null,
      correct: finalCorrectCount,
      total,
      passedOverride: passed,
      issues: finalIssues,
    });
    const rec = {
      ...localRecord,
      id: verifiedHistoryRecord?.id || sessionAttemptKeyRef.current || createAttemptKey(),
      date: verifiedHistoryRecord?.date || localRecord.date,
      timestamp: verifiedHistoryRecord?.timestamp ?? localRecord.timestamp,
      verified: sessionType === "test" ? attemptSubmitted && !requiresReview : undefined,
      requiresReview: sessionType === "test" ? requiresReview : undefined,
      reviewStatus: sessionType === "test"
        ? verifiedHistoryRecord?.reviewStatus ?? (requiresReview ? "pending" : "not_required")
        : undefined,
      teacherFeedback: verifiedHistoryRecord?.teacherFeedback ?? null,
      reviewedAt: verifiedHistoryRecord?.reviewedAt ?? null,
      xpEarned,
      passingPercentage: sessionType === "test" ? passingPercentage : undefined,
      earnedPoints: sessionType === "test" ? earnedPoints : undefined,
      totalPoints: sessionType === "test" ? totalPoints : undefined,
    };

    const practiceHistory =
      sessionType === "test"
        ? latestProgress.practiceHistory
        : [rec, ...latestProgress.practiceHistory].slice(0, 250);
    const testHistory =
      sessionType === "test"
        ? [rec, ...latestProgress.testHistory].slice(0, 250)
        : latestProgress.testHistory;
    const streak = calculateStreak(practiceHistory, testHistory);
    const userStats = updateUserStats(latestProgress.userStats, rec, streak, practiceHistory);
    const achievements = unlockAchievements(userStats, latestProgress.achievements);
    const previousAchievements = new Set(normalizeAchievementIds(latestProgress.achievements));
    const newAchievementIds = achievements.filter((id) => !previousAchievements.has(id));
    const dailyGoalTarget = latestProgress.preferences.dailyGoalWords ?? 20;
    const previousTodayWords = calculateTodayWords(
      latestProgress.practiceHistory,
      latestProgress.testHistory
    );
    const nextTodayWords = calculateTodayWords(practiceHistory, testHistory);

    const nextProgress: StudyProgress = {
      ...latestProgress,
      preferences: {
        ...latestProgress.preferences,
        totalXP: Math.max(
          calculateTotalXp(latestProgress),
          latestProgress.preferences.totalXP ?? 0
        ) + xpEarned,
      },
      practiceHistory,
      testHistory,
      userStats,
      achievements,
      dailyChallenge:
        sessionType === "daily-challenge"
          ? { date: localDateKey(), completed: true, score: percentage }
          : latestProgress.dailyChallenge,
    };
    progressRef.current = nextProgress;
    setProgress(nextProgress);
    let progressSynced = false;
    if (sessionId) {
      await saveLocalProgress(sessionId, nextProgress);
      try {
        const canonical = await flushProgressSync(sessionId, nextProgress);
        progressRef.current = canonical;
        setProgress(canonical);
        progressSynced = true;
      } catch {
        showToast("Result saved on this device. Sync will retry when your connection is ready.", "info");
      }
    }
    if (progressSynced && sessionId) {
      if (sessionType === "practice" && sessionContext.id) {
        notifyLessonCompletion({
          sessionId,
          attemptId: String(rec.id),
          contentName: sessionContext.name || null,
          score: percentage,
          passed,
        }).catch(() => {});
      }
    }
    setResultRecord({
      resultKey: String(rec.id),
      score: finalCorrectCount,
      total,
      percentage,
      passed,
      issues: finalIssues,
      verified: sessionType === "test" ? attemptSubmitted && !requiresReview : undefined,
      requiresReview: sessionType === "test" ? requiresReview : undefined,
      reviewStatus: sessionType === "test" ? (requiresReview ? "pending" : "not_required") : undefined,
      xpEarned,
      passingPercentage: sessionType === "test" ? passingPercentage : undefined,
      earnedPoints: sessionType === "test" ? earnedPoints : undefined,
      totalPoints: sessionType === "test" ? totalPoints : undefined,
      newAchievementIds,
      dailyGoalCompleted:
        previousTodayWords < dailyGoalTarget && nextTodayWords >= dailyGoalTarget,
    });
    setShowAllResultIssues(false);
    if (sessionId && rec.id) {
      recordResultEvent({
        sessionId,
        resultKey: String(rec.id),
        resultType: sessionType === "test" ? "test" : "lesson",
        eventType: "result_opened",
      }).catch(() => {});
    }
    if (
      sessionId &&
      sessionType === "review-mistakes" &&
      resultReviewSourceRef.current &&
      activeFocusInterventionIdsRef.current.length === 0
    ) {
      const source = resultReviewSourceRef.current;
      Promise.all([
        recordResultEvent({
          sessionId,
          resultKey: source.resultKey,
          resultType: source.resultType,
          eventType: "review_completed",
        }),
        recordResultEvent({
          sessionId,
          resultKey: source.resultKey,
          resultType: source.resultType,
          eventType: "follow_up_completed",
        }),
      ]).catch(() => {});
      resultReviewSourceRef.current = null;
    }
    if (
      sessionId &&
      sessionType === "review-mistakes" &&
      activeFocusInterventionIdsRef.current.length > 0 &&
      activeFocusModeRef.current &&
      idx >= activeWords.length - 1
    ) {
      const completedIds = [...activeFocusInterventionIdsRef.current];
      const completedMode = activeFocusModeRef.current;
      activeFocusInterventionIdsRef.current = [];
      activeFocusModeRef.current = null;
      try {
        const updated = await Promise.all(completedIds.map((interventionId) => (
          updateStudentFocusIntervention({
            sessionId,
            interventionId,
            completedMode,
          })
        )));
        const nextMode = getNextFollowUpMode(updated);
        const completedModes = getCompletedFollowUpModes(updated);
        setFocusInterventions((current) => {
          const updatedById = new Map(updated.map((item) => [item.id, item]));
          return current
            .map((item) => updatedById.get(item.id) ?? item)
            .filter((item) => item.status !== "completed");
        });
        setResultRecord((current) => current ? {
          ...current,
          followUp: {
            saved: true,
            completedMode,
            completedModes,
            nextMode,
            completed: nextMode === null,
          },
        } : current);
        if (nextMode === null) {
          const sources = new Map<string, "lesson" | "test">();
          updated.forEach((item) => {
            if (!item.sourceResultKey) return;
            const resultType = nextProgress.testHistory.some(
              (record) => String(record.id) === item.sourceResultKey
            ) ? "test" : "lesson";
            sources.set(item.sourceResultKey, resultType);
          });
          await Promise.all(Array.from(sources).flatMap(([resultKey, resultType]) => [
            recordResultEvent({
              sessionId,
              resultKey,
              resultType,
              eventType: "review_completed",
            }),
            recordResultEvent({
              sessionId,
              resultKey,
              resultType,
              eventType: "follow_up_completed",
            }),
          ])).catch(() => {});
        }
      } catch {
        setResultRecord((current) => current ? {
          ...current,
          followUp: {
            saved: false,
            completedMode,
            completedModes: [],
            nextMode: completedMode,
            completed: false,
          },
        } : current);
        showToast(
          "This stage finished, but its progress was not saved. Reopen the follow-up to try again.",
          "info"
        );
        getStudentFocusInterventions(sessionId)
          .then(setFocusInterventions)
          .catch(() => {});
      }
    }
    if (sessionType !== "test") {
      setSavedResume(null);
      if (sessionId) AsyncStorage.removeItem(studyResumeStorageKey(sessionId)).catch(() => {});
    }
    setTestSubmitting(false);
    setRuntimeScreen("results");
  }, [
    activeWords,
    clearAnswerTimers,
    consumeTestAttemptAvailability,
    direction,
    idx,
    isInvalidTestAttemptSubmissionError,
    lessonsData,
    recoverActiveTestAttemptSession,
    sessionContext.id,
    sessionContext.name,
    sessionId,
    sessionMode,
    sessionType,
    showToast,
    studentSession?.student.id,
    testsData,
  ]);

  const advanceAfterRecordedTestAnswer = useCallback(() => {
    setFeedback(null);
    setInput("");
    setMcqSelection(null);
    setShowHint(false);
    setNeedsRetype(false);
    setShowInfinitiveNote(false);
    setGeminiCorrection("");
    const shouldReturnToReview =
      returnToTestReviewAfterAnswerRef.current || idx + 1 >= activeWords.length;
    returnToTestReviewAfterAnswerRef.current = false;
    if (shouldReturnToReview) {
      setRuntimeScreen("test-review");
    } else {
      setIdx((value) => value + 1);
    }
  }, [activeWords.length, idx]);

  const openTestQuestionForEditing = useCallback(
    (wordIndex: number) => {
      if (wordIndex < 0 || wordIndex >= activeWords.length) return;
      clearAnswerTimers();
      setFeedback(null);
      setShowHint(false);
      setNeedsRetype(false);
      setShowInfinitiveNote(false);
      setGeminiCorrection("");
      returnToTestReviewAfterAnswerRef.current = true;
      setIdx(wordIndex);
      setRuntimeScreen("session");
    },
    [activeWords.length, clearAnswerTimers]
  );

  const returnToTestQuestions = useCallback(() => {
    const firstIncomplete = testReviewItems.find(
      (item) => item.status !== "answered"
    );
    openTestQuestionForEditing(firstIncomplete?.wordIndex ?? Math.max(0, activeWords.length - 1));
  }, [activeWords.length, openTestQuestionForEditing, testReviewItems]);

  const confirmTestSubmission = useCallback(() => {
    if (testSubmitting) return;
    const incompleteCount = testReviewItems.filter(
      (item) => item.status !== "answered"
    ).length;
    Alert.alert(
      "Submit Test?",
      incompleteCount > 0
        ? `${incompleteCount} question${incompleteCount === 1 ? " is" : "s are"} unanswered or skipped. You cannot change answers after submitting.`
        : "Your answers are complete. You cannot change them after submitting.",
      [
        { text: "Keep Reviewing", style: "cancel" },
        {
          text: "Submit",
          onPress: () => {
            setTestSubmissionError(null);
            finishSession().catch(() => {});
          },
        },
      ]
    );
  }, [finishSession, testReviewItems, testSubmitting]);

  useTestDeadline({
    active: sessionType === "test" && (runtimeScreen === "session" || runtimeScreen === "test-review"),
    deadline: testDeadlineAtRef.current,
    submitted: testAutoSubmitTriggeredRef,
    announcement: testTimerAnnouncementRef,
    onRemaining: setTestTimeRemainingSeconds,
    onWarning: (message, haptic) => {
      if (haptic) triggerHaptic("warning").catch(() => {});
      AccessibilityInfo.announceForAccessibility(message);
      showToast(message, "info");
    },
    onExpire: () => {
      const draftAnswer = input.trim();
      if (runtimeScreen === "session" && current && !showMcq && draftAnswer) {
        recordSessionIssue({ id: current.id, questionIndex: current.questionIndex, prompt,
          expected: "", answer: draftAnswer, kind: "open_review" });
      }
      AccessibilityInfo.announceForAccessibility("Time is up. Submitting your saved answers.");
      showToast("Time is up. Submitting your saved answers.", "info");
      finishSession().catch(() => {});
    },
  });

  const answerCurrent = useCallback(async () => {
    if (!current || !progress || isResolvingAnswer || finishingSessionRef.current) return;
    const userAnswer = input.trim();
    if (!userAnswer) return;

    if (sessionType === "test") {
      recordSessionIssue({
        id: current.id,
        questionIndex: current.questionIndex,
        prompt,
        expected: "",
        answer: userAnswer,
        kind: "open_review",
      });
      setFeedback({ state: "recorded", text: "Answer recorded" });
      scheduleAnswerResolution(advanceAfterRecordedTestAnswer, 500);
      return;
    }

    const isOpenAnswer = current.answerFormat === "open";
    if (isOpenAnswer) {
      applyProgress({ ...progress, wordStats: updateWordStats(progress.wordStats, current.id, true) });
      triggerHaptic("success").catch(() => {});
      playCorrectDing().catch(() => {});
      incrementCorrectCount();
      sessionStreakRef.current += 1;
      setSessionStreak(sessionStreakRef.current);
      recordSessionIssue({
        id: current.id,
        prompt,
        expected: feedbackExpected || expected,
        answer: userAnswer,
        kind: "open_review",
      });
      setFeedback({ state: "correct", text: "Answer submitted." });
      scheduleAnswerResolution(() => {
        setFeedback(null);
        setInput("");
        setShowHint(false);
        setNeedsRetype(false);
        setShowInfinitiveNote(false);
        setGeminiCorrection("");
        if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
        else setIdx((v) => v + 1);
      }, 700);
      return;
    }

    if (needsRetype) {
      const matched = acceptedAnswers.some((item) => normalizeText(String(item)) === normalizeText(userAnswer));
      if (!matched) {
        triggerHaptic("error").catch(() => {});
        setInput("");
        setFeedback({ state: "wrong", text: "Type the expected answer to continue." });
        return;
      }
      triggerHaptic("success").catch(() => {});
      playCorrectDing().catch(() => {});
      setFeedback(null);
      setInput("");
      setShowHint(false);
      setNeedsRetype(false);
      setShowInfinitiveNote(false);
      setGeminiCorrection("");
      if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
      else setIdx((v) => v + 1);
      return;
    }

    const fallback = localAnswerFallback(expected, userAnswer, acceptedAnswers.filter((value) => value !== expected));
    const result: "correct" | "close" | "wrong" = fallback.isCorrect
      ? "correct"
      : current.practiceKind === "prompt-builder"
        ? "wrong"
        : fallback.close
          ? "close"
          : "wrong";
    const exactMatch = fallback.isCorrect;
    const infinitiveNote = fallback.isCorrect && isInfinitiveWord(current, expected, prompt, targetLang);
    const correction = "";

    const closeCountsForScore = true;
    const correctForStats = result === "correct" || (result === "close" && closeCountsForScore);
    applyProgress({ ...progress, wordStats: updateWordStats(progress.wordStats, current.id, correctForStats) });
    setShowInfinitiveNote(infinitiveNote);
    setGeminiCorrection(correction);

    if (result === "correct") {
      triggerHaptic("success").catch(() => {});
      playCorrectDing().catch(() => {});
      incrementCorrectCount();
      sessionStreakRef.current += 1;
      setSessionStreak(sessionStreakRef.current);
      recordSessionIssue({ id: current.id, prompt, expected: feedbackExpected || expected, answer: userAnswer, kind: "correct" });
      setFeedback({ state: "correct", text: "Correct!" });
    } else if (result === "close") {
      triggerHaptic("warning").catch(() => {});
      if (closeCountsForScore) incrementCorrectCount();
      sessionStreakRef.current = 0;
      setSessionStreak(0);
      setFeedback({ state: "close", text: "Almost there. Type the expected answer to continue." });
      setMistakeWordIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
      recordSessionIssue({ id: current.id, prompt, expected: feedbackExpected, answer: userAnswer, kind: "close" });
    } else {
      triggerHaptic("error").catch(() => {});
      sessionStreakRef.current = 0;
      setSessionStreak(0);
      setFeedback({ state: "wrong", text: `Expected: ${feedbackExpected}` });
      setMistakeWordIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
      recordSessionIssue({ id: current.id, prompt, expected: feedbackExpected, answer: userAnswer, kind: "wrong" });
    }

    if (exactMatch) {
      scheduleAnswerResolution(() => {
        setFeedback(null);
        setInput("");
        setShowHint(false);
        setNeedsRetype(false);
        setShowInfinitiveNote(false);
        setGeminiCorrection("");
        if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
        else setIdx((v) => v + 1);
      }, 700);
      return;
    }

    setNeedsRetype(true);
    setInput("");
  }, [
    acceptedAnswers,
    activeWords.length,
    applyProgress,
    current,
    expected,
    feedbackExpected,
    finishSession,
    idx,
    input,
    isResolvingAnswer,
    needsRetype,
    playCorrectDing,
    progress,
    prompt,
    recordSessionIssue,
    scheduleAnswerResolution,
    targetLang,
    triggerHaptic,
    sessionType,
  ]);

  const submitConjugationTable = useCallback(async () => {
    if (!current || !progress || isResolvingAnswer || finishingSessionRef.current || current.practiceKind !== "conjugation-table" || !current.conjugationTable) return;
    if (conjugationRowFeedback.length > 0) return;
    const entries = current.conjugationTable.entries;
    const results = entries.map((entry, i) => {
      const userVal = normalizeText(conjugationInputs[i] ?? "");
      const correct = normalizeText(String(entry.form_a || entry.form_b || "").trim());
      return userVal.length > 0 && correct.length > 0 && userVal === correct;
    });
    const done = results.length > 0 && results.every(Boolean);
    const anyRight = results.some(Boolean);
    setConjugationRowFeedback(results);
    applyProgress({ ...progress, wordStats: updateWordStats(progress.wordStats, current.id, done) });
    if (done) {
      triggerHaptic("success").catch(() => {});
      playCorrectDing().catch(() => {});
      incrementCorrectCount();
      recordSessionIssue({
        id: current.id,
        prompt: current.conjugationTable.infinitive,
        expected: entries.map((e) => `${e.pronoun}: ${e.form_a || e.form_b || "-"}`).join("; "),
        answer: conjugationInputs.join("; "),
        kind: "correct",
      });
      setFeedback({ state: "correct", text: "Correct!" });
    } else if (anyRight) {
      triggerHaptic("warning").catch(() => {});
      recordSessionIssue({
        id: current.id,
        prompt: current.conjugationTable.infinitive,
        expected: entries.map((e) => `${e.pronoun}: ${e.form_a || e.form_b || "-"}`).join("; "),
        answer: conjugationInputs.join("; "),
        kind: "close",
      });
      setFeedback({ state: "close", text: "Some forms need correction. Check the highlighted rows." });
    } else {
      triggerHaptic("error").catch(() => {});
      setMistakeWordIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
      const lines = entries.map((e) => `${e.pronoun}: ${e.form_a || e.form_b || "-"}`).join("; ");
      setFeedback({ state: "wrong", text: `Expected: ${lines}` });
      recordSessionIssue({ id: current.id, prompt: current.conjugationTable.infinitive, expected: lines, kind: "wrong" });
    }
    scheduleAnswerResolution(() => {
      setFeedback(null);
      setConjugationRowFeedback([]);
      if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
      else setIdx((v) => v + 1);
    }, done ? 900 : 2200);
  }, [
    activeWords.length,
    applyProgress,
    conjugationInputs,
    conjugationRowFeedback.length,
    current,
    finishSession,
    incrementCorrectCount,
    idx,
    isResolvingAnswer,
    progress,
    playCorrectDing,
    recordSessionIssue,
    scheduleAnswerResolution,
    triggerHaptic,
  ]);

  useEffect(() => {
    if (runtimeScreen !== "session" || !current) {
      setMcqChoiceTexts([]);
      setMcqChoiceOptions(null);
      return;
    }
    const restored = resumeInteractionRef.current;
    if (restored && restored.idx === idx && restored.activeWords[restored.idx]?.id === current.id) {
      setMcqChoiceTexts(Array.isArray(restored.mcqChoiceTexts) ? restored.mcqChoiceTexts : []);
      setMcqChoiceOptions(Array.isArray(restored.mcqChoiceOptions) ? restored.mcqChoiceOptions : null);
      resumeInteractionRef.current = null;
      return;
    }
    if (current.practiceKind === "conjugation-table") {
      setMcqChoiceTexts([]);
      setMcqChoiceOptions(null);
      return;
    }
    const structuredMcq = current.answerFormat === "mcq" && Array.isArray(current.mcqOptions) && current.mcqOptions.length >= 2;
    const modeMcq = currentSessionMode === "multiple-choice";
    if (structuredMcq && current.mcqOptions) {
      const options = current.mcqOptions.map((o) => ({ id: String(o.id), text: String(o.text ?? "") }));
      setMcqChoiceOptions(sessionType === "test" ? options : shuffle(options));
      setMcqChoiceTexts([]);
      return;
    }
    if (!modeMcq) {
      setMcqChoiceTexts([]);
      setMcqChoiceOptions(null);
      return;
    }
    const correct = getExpectedAnswer(current, direction);
    if (!String(correct).trim()) {
      setMcqChoiceTexts([]);
      setMcqChoiceOptions(null);
      return;
    }
    const pool = sessionPool.length >= 2 ? sessionPool : activeWords;
    const others = pool.filter((w) => w.id !== current.id);
    const wrongCandidates = shuffle(others)
      .map((w) => getExpectedAnswer(w, direction))
      .filter((t) => t && normalizeText(String(t)) !== normalizeText(String(correct)));
    const wrong: string[] = [];
    for (const w of wrongCandidates) {
      if (wrong.length >= 3) break;
      if (!wrong.some((x) => normalizeText(x) === normalizeText(w))) wrong.push(w);
    }
    let choices = shuffle([correct, ...wrong].filter((x) => String(x ?? "").trim()));
    if (choices.length < 2) {
      const fillers = ["?", "-", "..."].filter((f) => !choices.some((c) => normalizeText(c) === normalizeText(f)));
      for (const f of fillers) {
        if (choices.length >= 4) break;
        choices.push(f);
      }
      choices = shuffle(choices);
    }
    setMcqChoiceOptions(null);
    setMcqChoiceTexts(choices);
  }, [activeWords, current, currentSessionMode, direction, idx, runtimeScreen, sessionPool, sessionType]);

  const handleMcqPick = useCallback(
    async (choiceText: string, optionId?: string, selectionKey?: string) => {
      if (!current || !progress || feedback || isResolvingAnswer || finishingSessionRef.current) return;
      if (sessionType === "test") {
        if (selectionKey) setMcqSelection({ key: selectionKey, correct: null });
        recordSessionIssue({
          id: current.id,
          questionIndex: current.questionIndex,
          prompt,
          expected: "",
          answer: choiceText,
          kind: "open_review",
          selectedOptionId: optionId ?? null,
        });
        setFeedback({ state: "recorded", text: "Answer recorded" });
        scheduleAnswerResolution(advanceAfterRecordedTestAnswer, 500);
        return;
      }
      const isOpen = current.answerFormat === "open";
      if (isOpen) {
        if (selectionKey) {
          setMcqSelection({ key: selectionKey, correct: true });
          mcqCorrectScale.setValue(0.98);
          Animated.sequence([
            Animated.spring(mcqCorrectScale, { toValue: 1.035, friction: 4, tension: 180, useNativeDriver: true }),
            Animated.spring(mcqCorrectScale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
          ]).start();
        }
        applyProgress({ ...progress, wordStats: updateWordStats(progress.wordStats, current.id, true) });
        triggerHaptic("success").catch(() => {});
        playCorrectDing().catch(() => {});
        incrementCorrectCount();
        recordSessionIssue({
          id: current.id,
          prompt,
          expected: feedbackExpected || expected,
          answer: choiceText,
          kind: "open_review",
          selectedOptionId: optionId ?? null,
        });
        setFeedback({ state: "correct", text: "Answer submitted." });
        scheduleAnswerResolution(() => {
          setFeedback(null);
          setInput("");
          setShowHint(false);
          setNeedsRetype(false);
          setShowInfinitiveNote(false);
          setGeminiCorrection("");
          if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
          else setIdx((v) => v + 1);
        }, 700);
        return;
      }

      let isCorrect = false;
      if (
        optionId != null &&
        current.mcqCorrectOptionId != null &&
        String(current.mcqCorrectOptionId).length > 0
      ) {
        isCorrect = String(optionId) === String(current.mcqCorrectOptionId);
      } else {
        const accepted = getAcceptedAnswers(expected, current, direction);
        isCorrect = accepted.some((a) => normalizeText(String(a)) === normalizeText(choiceText));
      }

      if (selectionKey) {
        setMcqSelection({ key: selectionKey, correct: isCorrect });
      }
      applyProgress({ ...progress, wordStats: updateWordStats(progress.wordStats, current.id, isCorrect) });

      if (isCorrect) {
        mcqCorrectScale.setValue(0.98);
        Animated.sequence([
          Animated.spring(mcqCorrectScale, { toValue: 1.035, friction: 4, tension: 180, useNativeDriver: true }),
          Animated.spring(mcqCorrectScale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
        ]).start();
        setShowInfinitiveNote(isInfinitiveWord(current, expected, prompt, targetLang));
        triggerHaptic("success").catch(() => {});
        playCorrectDing().catch(() => {});
        incrementCorrectCount();
        recordSessionIssue({ id: current.id, prompt, expected: feedbackExpected || expected, answer: choiceText, kind: "correct", selectedOptionId: optionId ?? null });
        setFeedback({ state: "correct", text: "Correct!" });
      } else {
        setShowInfinitiveNote(false);
        triggerHaptic("error").catch(() => {});
        setFeedback({ state: "wrong", text: `Expected: ${feedbackExpected}` });
        setMistakeWordIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
        recordSessionIssue({ id: current.id, prompt, expected: feedbackExpected, answer: choiceText, kind: "wrong", selectedOptionId: optionId ?? null });
      }

      setInput("");
      const delay = isCorrect ? 700 : 1500;
      scheduleAnswerResolution(() => {
        setFeedback(null);
        setShowHint(false);
        setNeedsRetype(false);
        setShowInfinitiveNote(false);
        setGeminiCorrection("");
        if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
        else setIdx((v) => v + 1);
      }, delay);
    },
    [
      activeWords.length,
      applyProgress,
      current,
      expected,
      feedbackExpected,
      feedback,
      finishSession,
      incrementCorrectCount,
      idx,
      isResolvingAnswer,
      mcqCorrectScale,
      progress,
      playCorrectDing,
      prompt,
      recordSessionIssue,
      scheduleAnswerResolution,
      sessionType,
      targetLang,
      triggerHaptic,
    ]
  );

  const playPromptAudio = useCallback(async () => {
    if (!current || !sessionId || promptAudioLoadingRef.current) return;
    promptAudioLoadingRef.current = true;
    setTtsLoading(true);

    const clearPlayer = async () => {
      try {
        audioPlayerRef.current?.pause?.();
      } catch {}
      try {
        audioPlayerRef.current?.remove?.();
      } catch {}
      audioPlayerRef.current = null;
      if (audioTempFileRef.current) {
        await FileSystem.deleteAsync(audioTempFileRef.current, { idempotent: true }).catch(() => {});
        audioTempFileRef.current = null;
      }
    };

    const playUri = async (uri: string) => {
      const player = createAudioPlayer(uri);
      audioPlayerRef.current = player;
      player.play();
    };

    let speakText = prompt || current.pt || current.en;
    if (current.practiceKind === "conjugation-table" && current.conjugationTable?.infinitive) {
      speakText = current.conjugationTable.infinitive;
    } else if (current.practiceKind === "conjugation" && current.conjugationInfinitive) {
      speakText = current.conjugationInfinitive;
    }
    const text = speakText;
    try {
      await clearPlayer();
      if (current.audioUrl) {
        await playUri(current.audioUrl);
        return;
      }
      if (!text) return;

      const lang = studySpeechLanguage(activeLanguagePair, activeLessonLanguage, direction);
      const generated = await requestTtsBase64(text, sessionId, lang);
      if (generated?.url) {
        await playUri(generated.url);
        return;
      }
      if (!generated?.data) {
        await Speech.speak(text, { language: lang, pitch: 1, rate: 0.95 });
        return;
      }

      const extension = generated.mimeType.includes("mpeg")
        ? "mp3"
        : generated.mimeType.includes("wav")
          ? "wav"
          : "m4a";
      const tempUri = `${FileSystem.cacheDirectory}gemini-tts-${Date.now()}.${extension}`;
      await FileSystem.writeAsStringAsync(tempUri, generated.data, { encoding: "base64" as any });
      audioTempFileRef.current = tempUri;

      const player = createAudioPlayer(tempUri);
      audioPlayerRef.current = player;
      const eventPlayer = player as typeof player & {
        addListener?: (
          event: "playbackStatusUpdate",
          listener: (status: { didJustFinish?: boolean }) => void
        ) => { remove: () => void };
      };
      eventPlayer.addListener?.("playbackStatusUpdate", (status) => {
        if (status?.didJustFinish) {
          clearPlayer().catch(() => {});
        }
      });
      player.play();
    } catch (error) {
      try {
        await Speech.speak(text, { language: studySpeechLanguage(activeLanguagePair, activeLessonLanguage, direction), pitch: 1, rate: 0.95 });
      } catch {
        showToast("Audio unavailable right now.", "danger");
      }
    } finally {
      promptAudioLoadingRef.current = false;
      setTtsLoading(false);
    }
  }, [activeLanguagePair, activeLessonLanguage, current, direction, prompt, sessionId, showToast]);

  const playStudyTextAudio = useCallback(
    async (text: string, lang: "a" | "b" = "a", loadingKey?: string) => {
      const trimmed = text.trim();
      if (!trimmed || studyAudioLoadingRef.current) return;
      studyAudioLoadingRef.current = true;
      setStudyAudioLoadingKey(loadingKey ?? `${lang}:${trimmed}`);
      const meta = getDisplayLanguageMeta(activeLanguagePair, activeLessonLanguage);
      const speechLang = ttsLangFromShort(lang === "a" ? meta.shortA : meta.shortB);

      try {
        if (!sessionId) {
          await Speech.speak(trimmed, { language: speechLang, pitch: 1, rate: 0.95 });
          return;
        }
        const generated = await requestTtsBase64(trimmed, sessionId, speechLang);
        if (generated?.url) {
          const player = createAudioPlayer(generated.url);
          audioPlayerRef.current = player;
          player.play();
          return;
        }
        if (generated?.data) {
          const extension = generated.mimeType.includes("mpeg") ? "mp3" : generated.mimeType.includes("wav") ? "wav" : "m4a";
          const tempUri = `${FileSystem.cacheDirectory}study-text-${Date.now()}.${extension}`;
          await FileSystem.writeAsStringAsync(tempUri, generated.data, { encoding: "base64" as any });
          audioTempFileRef.current = tempUri;
          const player = createAudioPlayer(tempUri);
          audioPlayerRef.current = player;
          player.play();
          return;
        }
        await Speech.speak(trimmed, { language: speechLang, pitch: 1, rate: 0.95 });
      } catch {
        try {
          await Speech.speak(trimmed, { language: speechLang, pitch: 1, rate: 0.95 });
        } catch {
          showToast("This audio hint is unavailable right now.", "danger");
        }
      } finally {
        studyAudioLoadingRef.current = false;
        setStudyAudioLoadingKey(null);
      }
    },
    [activeLanguagePair, activeLessonLanguage, sessionId, showToast]
  );

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "doNotMix",
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sessionBootstrapComplete) return;
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      if (!sessionId) {
        await clearStoredStudentSessionId();
        return;
      }
      setLoading(true);
      setInitialLoadError(null);
      try {
        await restoreStudentDataIdentity(sessionId);
        const session = await getStudentSession(sessionId, controller.signal);
        await bindStudentDataIdentity(sessionId, session.student.id, mergeStudyProgress);
        // Keep verified-attempt ordering for progress, but do not make lesson and test
        // catalog requests wait for that maintenance work.
        const progressPromise = (async () => {
          await flushPendingTestAttempts(
            sessionId,
            session.student.id
          ).catch(() => ({ synced: 0, remaining: 0 }));
          return hydrateProgress(sessionId);
        })();
        const [lessons, tests, hydrated, nextFocusInterventions, savedResumeRaw, classroomResult] = await Promise.all([
          getAssignedLessons(sessionId, session.student.assigned_lessons ?? [], controller.signal),
          getAssignedTests(sessionId, session.student.assigned_tests ?? [], controller.signal),
          progressPromise,
          getStudentFocusInterventions(sessionId, controller.signal).catch(() => []),
          AsyncStorage.getItem(studyResumeStorageKey(sessionId)).catch(() => null),
          getStudentClassrooms(sessionId, controller.signal)
            .then((classrooms) => ({ classrooms, error: null }))
            .catch((error: unknown) => ({ classrooms: null, error: error instanceof Error ? error.message : "Your classrooms could not be loaded." })),
        ]);
        if (!mounted || controller.signal.aborted || sessionId !== sessionIdRef.current) return;
        const cachedSession = classroomResult.classrooms == null ? await loadOfflineSessionSnapshot(sessionId) : null;
        if (!mounted || controller.signal.aborted || sessionId !== sessionIdRef.current) return;
        const assignmentDetails = normalizeStudentAssignmentDetails(session.student.assignment_details);
        const classroomAssignments = Array.isArray(session.student.classroom_assignments)
          ? session.student.classroom_assignments
          : [];
        const normalizedSession: StudentSessionPayload = {
          ...session,
          student: {
            ...session.student,
            assignment_details: assignmentDetails,
            classroom_assignments: classroomAssignments,
            classrooms: classroomResult.classrooms ?? (cachedSession?.student.id === session.student.id ? cachedSession.student.classrooms : undefined),
            classrooms_error: classroomResult.error,
          },
        };
        const assignedLessons = attachAssignmentDetails(lessons, "lesson", assignmentDetails).map((lesson) => ({
          ...lesson,
          classroomNames: getClassroomNamesForAssignment(classroomAssignments, "lesson", lesson.id),
        }));
        const assignedTests = attachAssignmentDetails(tests, "test", assignmentDetails).map((test) => ({
          ...test,
          classroomNames: getClassroomNamesForAssignment(classroomAssignments, "test", test.id),
        }));
        if (__DEV__) {
          console.log(
            "[StudyGame] initial load lessons:",
            assignedLessons.map((l) => ({
              id: l.id,
              name: l.name,
              cover_image_url: l.cover_image_url,
              updated_at: l.updated_at,
              words: l.words?.length ?? 0,
            }))
          );
        }
        setStudentName(normalizedSession.student.name);
        setTeacherName(normalizedSession.teacher?.name ?? "Teacher");
        setStudentSession(normalizedSession);
        setOfflineMode(false);
        assetCatalogEpochRef.current += 1;
        const epoch = assetCatalogEpochRef.current;
        setAssetRefreshEpoch(epoch);
        setLessonsData(assignedLessons);
        setTestsData(assignedTests);
        setFocusInterventions(nextFocusInterventions);
        setLessonsWords(normalizeLessonsToWords(assignedLessons, epoch));
        setTestsWords(normalizeTestsToWords(assignedTests, epoch));
        progressRef.current = hydrated;
        setProgress(hydrated);
        initialCatalogLoadedRef.current = true;
        catalogLastCompletedAtRef.current = Date.now();
        saveOfflineSessionSnapshot(sessionId, normalizedSession).catch(() => {});
        refreshDownloadedLessons().catch(() => {});
        if (savedResumeRaw && mounted) {
          const parsedResume = parseSavedResumeData(savedResumeRaw);
          setSavedResume(parsedResume);
          if (!parsedResume) {
            AsyncStorage.removeItem(studyResumeStorageKey(sessionId)).catch(() => {});
          }
        }
      } catch (e) {
        if (!mounted || controller.signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
        if (e instanceof StudyApiError && e.status === 401) {
          await clearStoredStudentSessionId();
          return;
        }
        const [offlineCatalog, localProgress, downloaded] = await Promise.all([
          loadOfflineStudyCatalog(sessionId).catch(() => ({ session: null, lessons: [], tests: [] })),
          loadLocalProgress(sessionId),
          getOfflineLessonSummaries(sessionId).catch(() => ({})),
        ]);
        if (offlineCatalog.session) {
          const epoch = bumpAssetCatalogEpoch();
          const assignmentDetails = normalizeStudentAssignmentDetails(
            offlineCatalog.session.student.assignment_details
          );
          const classroomAssignments = Array.isArray(offlineCatalog.session.student.classroom_assignments)
            ? offlineCatalog.session.student.classroom_assignments
            : [];
          const offlineSession: StudentSessionPayload = {
            ...offlineCatalog.session,
            student: {
              ...offlineCatalog.session.student,
              assignment_details: assignmentDetails,
              classroom_assignments: classroomAssignments,
            },
          };
          const offlineLessons = attachAssignmentDetails(
            offlineCatalog.lessons,
            "lesson",
            assignmentDetails
          ).map((lesson) => ({
            ...lesson,
            classroomNames: getClassroomNamesForAssignment(classroomAssignments, "lesson", lesson.id),
          }));
          const offlineTests = attachAssignmentDetails(
            offlineCatalog.tests,
            "test",
            assignmentDetails
          ).map((test) => ({
            ...test,
            classroomNames: getClassroomNamesForAssignment(classroomAssignments, "test", test.id),
          }));
          setOfflineMode(true);
          setStudentSession(offlineSession);
          setStudentName(offlineSession.student.name ?? "Student");
          setTeacherName(offlineSession.teacher?.name ?? "Teacher");
          setDownloadedLessons(downloaded);
          setLessonsData(offlineLessons);
          setTestsData(offlineTests);
          setLessonsWords(normalizeLessonsToWords(offlineLessons, epoch));
          setTestsWords(normalizeTestsToWords(offlineTests, epoch));
          progressRef.current = localProgress;
          setProgress(localProgress);
          initialCatalogLoadedRef.current = true;
          const raw = await AsyncStorage.getItem(studyResumeStorageKey(sessionId)).catch(() => null);
          if (raw && mounted) {
            const parsedResume = parseSavedResumeData(raw);
            setSavedResume(parsedResume);
            if (!parsedResume) {
              AsyncStorage.removeItem(studyResumeStorageKey(sessionId)).catch(() => {});
            }
          }
          showToast("Offline mode: saved assignments are ready.", "info");
        } else {
          setInitialLoadError(
            e instanceof Error
              ? e.message
              : "Your assignments could not be loaded. Check your connection and try again."
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
      try {
        audioPlayerRef.current?.pause?.();
        audioPlayerRef.current?.remove?.();
        correctDingPlayerRef.current?.pause?.();
        correctDingPlayerRef.current?.remove?.();
      } catch {}
    };
  }, [bumpAssetCatalogEpoch, initialLoadRetry, refreshDownloadedLessons, sessionBootstrapComplete, sessionId, showToast]);

  useEffect(() => {
    if (!sessionId) return;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") {
        const latestProgress = progressRef.current;
        if (latestProgress) flushProgressSync(sessionId, latestProgress).catch(() => {});
        if (runtimeScreenRef.current === "session") {
          saveResumeDataRef.current();
        }
        return;
      }
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        flushQueuedProgressSync(sessionId, progressRef.current ?? undefined, consumeCanonicalProgress)
          .then(() => flushPendingAttemptsAndRefreshProgress())
          .catch(() => false);
        refreshCatalogRef.current?.().catch(() => {});
        resumeTimer = null;
      }, 400);
    });
    return () => {
      sub.remove();
      if (resumeTimer) clearTimeout(resumeTimer);
    };
  }, [consumeCanonicalProgress, flushPendingAttemptsAndRefreshProgress, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const retryTimer = setInterval(() => {
      flushQueuedProgressSync(sessionId, progressRef.current ?? undefined, consumeCanonicalProgress)
        .then(() => flushPendingAttemptsAndRefreshProgress())
        .catch(() => false);
    }, 30000);
    return () => clearInterval(retryTimer);
  }, [consumeCanonicalProgress, flushPendingAttemptsAndRefreshProgress, sessionId]);

  useFocusEffect(
    useCallback(() => {
      if (!sessionId || !initialCatalogLoadedRef.current) return;
      const t = setTimeout(() => {
        refreshCatalogRef.current?.().catch(() => {});
      }, 200);
      return () => clearTimeout(t);
    }, [sessionId])
  );

  useEffect(() => {
    if (runtimeScreen !== "session" || !current) return;
    if (currentSessionMode === "listening") {
      playPromptAudio().catch(() => {});
    }
  }, [current, currentSessionMode, playPromptAudio, runtimeScreen]);

  useEffect(() => {
    return () => {
      const latestProgress = progressRef.current;
      if (sessionId && latestProgress) flushProgressSync(sessionId, latestProgress).catch(() => {});
    };
  }, [sessionId]);

  useEffect(() => {
    if (!selectedLessonDetail) return;
    const validModes: StudySessionMode[] = ["typing", "multiple-choice", "listening", "image"];
    AsyncStorage.getItem(`eluency_lesson_mode_${selectedLessonDetail.id}`)
      .then((saved) => {
        if (saved && validModes.includes(saved as StudySessionMode)) {
          setLessonDetailMode(saved as StudySessionMode);
        }
      })
      .catch(() => {});
  }, [selectedLessonDetail?.id]);

  // Keep refs in sync with current render values so callbacks/effects can read them safely
  runtimeScreenRef.current = runtimeScreen;
  saveResumeDataRef.current = saveResumeData;

  useEffect(() => {
    if (runtimeScreen !== "session" || sessionType === "test") return;
    const timer = setTimeout(() => {
      saveResumeDataRef.current();
    }, 300);
    return () => clearTimeout(timer);
  }, [runtimeScreen, saveResumeData, sessionType]);

  if (!sessionBootstrapComplete || loading || (!progress && !initialLoadError)) {
    return <StudyGameLoadingSkeleton theme={theme} />;
  }

  if (!progress) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          paddingTop: Math.max(insets.top, 24),
          paddingBottom: Math.max(insets.bottom, 24),
          paddingHorizontal: 24,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View style={{ width: 58, height: 58, borderRadius: 18, backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="cloud-offline-outline" size={28} color={theme.colors.primary} />
        </View>
        <Text style={{ color: theme.colors.text, fontWeight: "900", fontSize: 22, marginTop: 16, textAlign: "center" }}>
          We could not load your assignments
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 8, textAlign: "center" }}>
          {initialLoadError || "Check your connection and try again."}
        </Text>
        <TouchableOpacity
          onPress={() => setInitialLoadRetry((value) => value + 1)}
          accessibilityRole="button"
          accessibilityLabel="Retry loading assignments"
          style={{ minHeight: 48, borderRadius: 14, backgroundColor: theme.colors.primary, paddingHorizontal: 24, marginTop: 20, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: theme.colors.primaryText, fontSize: 15, fontWeight: "900" }}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const dailyCompleted =
    progress.dailyChallenge.date === localDateKey() && progress.dailyChallenge.completed;
  const uiIsDark = theme.isDark;
  const ui = uiIsDark
    ? {
        bg: theme.colors.background,
        card: theme.colors.surface,
        cardStrong: theme.colors.surface,
        text: theme.colors.text,
        muted: theme.colors.textMuted,
        border: theme.colors.border,
        borderStrong: theme.colors.borderStrong,
        borderSoft: "rgba(255,255,255,0.08)",
        primary: theme.colors.primary,
        primarySoft: theme.colors.primarySoft,
        primaryText: theme.colors.primaryText,
        classroomSoft: "#463A2C",
        classroomBorder: "#806B51",
        classroomText: "#F2D9B8",
        secondary: theme.colors.violet,
        success: theme.colors.success,
        warning: theme.colors.warning,
        danger: theme.colors.danger,
      }
    : {
        bg: theme.colors.background,
        card: theme.colors.surface,
        cardStrong: theme.colors.surface,
        text: theme.colors.text,
        muted: theme.colors.textMuted,
        border: theme.colors.border,
        borderStrong: theme.colors.borderStrong,
        borderSoft: "rgba(15,23,42,0.06)",
        primary: theme.colors.primary,
        primarySoft: theme.colors.primarySoft,
        primaryText: theme.colors.primaryText,
        classroomSoft: "#F5E9D8",
        classroomBorder: "#D9BE98",
        classroomText: "#795633",
        secondary: theme.colors.violet,
        success: theme.colors.success,
        warning: theme.colors.warning,
        danger: theme.colors.danger,
      };
  const reviewViewportMaxHeight = 488;
  const renderMcqChoice = (choiceText: string, selectionKey: string, optionId?: string) => {
    const selected = mcqSelection?.key === selectionKey;
    const selectedCorrect = selected && mcqSelection?.correct === true;
    const selectedWrong = selected && mcqSelection?.correct === false && !!feedback;
    const selectedRecorded = selected && mcqSelection?.correct == null && feedback?.state === "recorded";
    const settled = !!feedback || isResolvingAnswer;
    const borderColor = selectedCorrect ? ui.success : selectedWrong ? ui.danger : selectedRecorded ? ui.primary : ui.border;
    const textColor = selectedCorrect ? ui.success : selectedWrong ? ui.danger : selectedRecorded ? ui.primary : ui.text;
    const backgroundColor = selectedCorrect
      ? `${ui.success}14`
      : selectedWrong
        ? `${ui.danger}10`
        : selectedRecorded
          ? ui.primarySoft
        : ui.card;

    return (
      <Animated.View
        key={selectionKey}
        style={{
          transform: [{ scale: selectedCorrect ? mcqCorrectScale : 1 }],
          opacity: settled && !selected ? 0.62 : 1,
        }}
      >
        <TouchableOpacity
          onPress={() => handleMcqPick(choiceText, optionId, selectionKey)}
          accessibilityRole="button"
          accessibilityLabel={`Answer ${choiceText}`}
          accessibilityState={{ disabled: settled, selected }}
          disabled={settled}
          activeOpacity={0.85}
          style={{
            borderRadius: 12,
            borderWidth: selectedCorrect || selectedWrong ? 1.5 : 1,
            borderColor,
            backgroundColor,
            paddingVertical: 14,
            paddingHorizontal: 14,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Text style={{ color: textColor, fontWeight: "700", fontSize: 16, textAlign: isConjugationDrill ? "left" : "center", flexShrink: 1 }}>
              {choiceText}
            </Text>
            {selectedCorrect ? <Ionicons name="checkmark-circle" size={18} color={ui.success} /> : null}
            {selectedWrong ? <Ionicons name="close-circle" size={18} color={ui.danger} /> : null}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Animated.View className="flex-1" style={{ backgroundColor: ui.bg, opacity: contentOpacity }}>
      {runtimeScreen === "dashboard" ? (
        <>
          <StudentDashboardHeader ui={ui} topInset={insets.top}
            onSettings={() => openWorkspaceTab("settings")} onClassrooms={() => openWorkspaceTab("classrooms")} />

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: Math.max(insets.top, 8) + 60,
              paddingBottom: Math.max(insets.bottom, 0) + 92,
              width: "100%",
              maxWidth: 760,
              alignSelf: "center",
            }}
            refreshControl={<RefreshControl refreshing={catalogRefreshing} onRefresh={() => onCatalogPullRefresh()} tintColor={ui.primary} colors={[ui.primary]} />}
          >
            <ScreenReveal key={`dashboard-${activeTab}`} delay={12} distance={16} scaleFrom={0.992}>
            {selectedClassroom && (activeTab === "lessons" || activeTab === "tests" || activeTab === "practice") ? (
              <View style={{ marginBottom: 14, padding: 12, borderRadius: 14, backgroundColor: ui.classroomSoft }}>
                <Text style={{ color: ui.classroomText, fontSize: 14, fontWeight: "700" }}>
                  {selectedClassroom.name}
                </Text>
                <TouchableOpacity onPress={() => openWorkspaceTab("classrooms")} accessibilityRole="button"
                  accessibilityLabel="Choose classroom" style={{ minHeight: 44, justifyContent: "center" }}>
                  <Text style={{ color: ui.classroomText, fontSize: 12 }}>Change classroom →</Text>
                </TouchableOpacity>
                {selectedClassroom ? <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["lessons", "tests"] as const).map((tab) => <TouchableOpacity key={tab}
                    onPress={() => setActiveTab(tab)} accessibilityRole="button" accessibilityState={{ selected: activeTab === tab }}
                    accessibilityLabel={`Open classroom ${tab}`} style={{ flex: 1, minHeight: 44, borderRadius: 10,
                      backgroundColor: activeTab === tab ? ui.card : "transparent", justifyContent: "center", alignItems: "center" }}>
                    <Text style={{ color: ui.classroomText, fontSize: 13, fontWeight: "700" }}>
                      {tab === "lessons" ? `Lessons (${lessonsData.length})` : `Tests (${offlineMode ? selectedClassroom.assignments.filter((item) => item.type === "test").length : testsData.length})`}
                    </Text>
                  </TouchableOpacity>)}
                </View> : null}
              </View>
            ) : null}
            {activeTab === "classrooms" ? (
              <StudentClassroomsTab ui={ui} classrooms={classrooms} teacherName={teacherName}
                error={studentSession?.student.classrooms_error ?? (studentSession?.student.classrooms ? null : "Refresh to load your classrooms.")}
                refreshing={catalogRefreshing} offline={offlineMode}
                onRetry={() => { void onCatalogPullRefresh(); }}
                onSelect={(classroom) => {
                  setSelectedClassroomId(classroom.id);
                  setLessonStatusFilter("all"); setTestStatusFilter("all"); setLessonLanguageKey(null);
                  setSelectedLessonDetail(null); setSelectedTestDetail(null);
                  setActiveTab("lessons");
                }}
                onDirectAssignments={() => {
                  setSelectedClassroomId(null); setLessonStatusFilter("all"); setTestStatusFilter("all");
                  setActiveTab("lessons");
                }} />
            ) : null}
            {activeTab === "home" ? (
              <>
                <ScreenReveal delay={20}>
                <GlassCard style={{ borderRadius: 20, marginBottom: 12, borderColor: ui.border }} padding={14} variant="strong">
                  <View style={{ flexDirection: "row", alignItems: "stretch" }}>
                    <View style={{ flex: 1, minWidth: 0, paddingRight: 14 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontWeight: "800", fontSize: 18, lineHeight: 22, color: ui.text }} numberOfLines={1}>
                        {`Level ${levelInfo.current.level} \u2013 ${levelInfo.current.name}`}
                      </Text>
                      <Text style={{ fontSize: 12, lineHeight: 16, color: ui.muted, marginTop: 2 }} numberOfLines={1}>
                        {levelInfo.next
                          ? `${levelInfo.xpInLevel} / ${levelInfo.xpForLevel} XP to Level ${levelInfo.next.level}`
                          : "Max Level"}
                      </Text>
                        </View>
                        <AnimatedNumber value={totalXP} suffix=" XP" style={{ color: ui.text, fontWeight: "800", fontSize: 16, marginLeft: 10 }} />
                      </View>
                      <View accessibilityRole="progressbar" accessibilityLabel="Progress to next level" accessibilityValue={{ min: 0, max: 100, now: Math.round(levelInfo.progress) }} style={{ height: 6, backgroundColor: ui.borderSoft, borderRadius: 999, overflow: "hidden", marginTop: 10 }}>
                        <AnimatedProgressFill progress={levelInfo.progress} color={ui.primary} />
                      </View>
                    </View>
                    <View style={{ width: 1, backgroundColor: ui.border, marginRight: 12 }} />
                    <View style={{ width: 70, alignItems: "center", justifyContent: "center" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <Ionicons name="flame" size={21} color="#F59E0B" />
                        <Text style={{ fontSize: 19, lineHeight: 22, fontWeight: "900", color: ui.text }}>{currentStreak}</Text>
                      </View>
                      <Text style={{ fontSize: 9, lineHeight: 12, fontWeight: "800", color: ui.muted, textAlign: "center", marginTop: 3 }}>DAY STREAK</Text>
                    </View>
                  </View>
                </GlassCard>
                </ScreenReveal>

                <ScreenReveal delay={32}>
                <GlassCard
                  style={{
                    height: largeStudentText ? undefined : tinyStudentHome ? 148 : compactStudentHome ? 156 : 145,
                    minHeight: largeStudentText ? 172 : undefined,
                    borderRadius: 21,
                    marginBottom: 12,
                    borderColor: `${ui.primary}20`,
                    backgroundColor: uiIsDark ? ui.card : "#F7FBFF",
                  }}
                  contentStyle={{ flex: 1, justifyContent: "center", paddingVertical: 1 }}
                  padding={8}
                  variant="hero"
                >
                  <View pointerEvents="none" style={{ position: "absolute", top: -44, right: -24, width: 88, height: 88, borderRadius: 44, backgroundColor: uiIsDark ? `${ui.primary}12` : "#E9F5FF" }} />
                  <View pointerEvents="none" style={{ position: "absolute", bottom: -58, left: -44, width: 108, height: 108, borderRadius: 54, backgroundColor: uiIsDark ? `${ui.primary}0D` : "#EAF5FF" }} />
                  <View pointerEvents="none" style={{ position: "absolute", bottom: -66, right: 18, width: 156, height: 112, borderRadius: 78, backgroundColor: uiIsDark ? `${ui.primary}0A` : "rgba(219, 239, 255, 0.52)" }} />
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ width: studentHeroRingSize, height: studentHeroRingSize, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
                      <Svg width={studentHeroRingSize} height={studentHeroRingSize} style={{ position: "absolute" }}>
                        <Circle cx={studentHeroRingSize / 2} cy={studentHeroRingSize / 2} r={studentHeroRingRadius} stroke={ui.borderSoft} strokeWidth={7} fill="none" />
                        <Circle
                          cx={studentHeroRingSize / 2}
                          cy={studentHeroRingSize / 2}
                          r={studentHeroRingRadius}
                          stroke={ui.primary}
                          strokeWidth={7}
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * studentHeroRingRadius}`}
                          strokeDashoffset={`${2 * Math.PI * studentHeroRingRadius * (1 - Math.min(100, Math.max(0, overallProgress)) / 100)}`}
                          strokeLinecap="round"
                          rotation="-90"
                          origin={`${studentHeroRingSize / 2},${studentHeroRingSize / 2}`}
                        />
                      </Svg>
                      <AnimatedNumber value={overallProgress} suffix="%" style={{ color: ui.text, fontWeight: "900", fontSize: compactStudentHome ? 16 : 18 }} />
                      <Text style={{ color: ui.muted, fontSize: 8, lineHeight: 10, fontWeight: "800", marginTop: 1 }}>COMPLETE</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0, flexShrink: 1, paddingHorizontal: 1 }}>
                      <Text style={{ color: ui.text, fontSize: tinyStudentHome ? 13 : compactStudentHome ? 14 : 15, lineHeight: tinyStudentHome ? 17 : 19, fontWeight: "600" }} numberOfLines={2} ellipsizeMode="tail">
                        Welcome{"\u00A0"}back, {studentName || "Student"}!
                      </Text>
                      <Text
                        style={{ color: ui.text, fontSize: studentHeroHeadlineSize, lineHeight: studentHeroHeadlineSize + 3, fontWeight: "900", marginTop: 2 }}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.82}
                      >
                        {overallProgress >= 80 ? "Almost there!" : overallProgress >= 50 ? "Keep it up!" : overallProgress > 0 ? "Great start!" : "Let's begin!"}
                      </Text>
                      <Text style={{ fontSize: tinyStudentHome ? 12 : 14, lineHeight: tinyStudentHome ? 16 : 18, color: ui.muted, fontWeight: "500", marginTop: 3 }} numberOfLines={1}>{wordsLearned} words learned</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => !dailyCompleted && lessonsWords.length > 0 && startSession("daily-challenge", "typing", "pt-en", lessonsWords, { id: null, name: "Daily Challenge" })}
                      disabled={dailyCompleted || lessonsWords.length === 0}
                      accessibilityRole="button"
                      accessibilityLabel={dailyCompleted ? "Daily challenge complete" : lessonsWords.length === 0 ? "Daily challenge available after a lesson is assigned" : "Start daily challenge"}
                      accessibilityState={{ disabled: dailyCompleted || lessonsWords.length === 0 }}
                      activeOpacity={0.84}
                      style={{ width: studentHeroCtaWidth, height: studentHeroCtaHeight, flexShrink: 0, borderRadius: 19, backgroundColor: dailyCompleted ? `${ui.success}18` : ui.primary, paddingHorizontal: compactStudentHome ? 11 : 14, paddingVertical: 9, justifyContent: "center", opacity: !dailyCompleted && lessonsWords.length === 0 ? 0.55 : 1 }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Ionicons name={dailyCompleted ? "checkmark-circle" : "flash"} size={compactStudentHome ? 21 : 24} color={dailyCompleted ? ui.success : ui.primaryText} />
                        <Ionicons name="arrow-forward" size={16} color={dailyCompleted ? ui.success : ui.primaryText} />
                      </View>
                      <Text style={{ color: dailyCompleted ? ui.success : ui.primaryText, fontSize: compactStudentHome ? 14 : 16, lineHeight: compactStudentHome ? 17 : 20, fontWeight: "800", marginTop: 6 }} numberOfLines={2}>{dailyCompleted ? "Completed" : "Daily Practice"}</Text>
                      {!dailyCompleted ? <Text style={{ color: ui.primaryText, fontSize: 12, lineHeight: 15, fontWeight: "600", opacity: 0.86, marginTop: 2 }}>+50 XP</Text> : null}
                    </TouchableOpacity>
                  </View>
                </GlassCard>
                </ScreenReveal>

                <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.84}
                    accessibilityRole="button"
                    accessibilityLabel={`Daily goal, ${todayWords} of ${dailyGoalWords} words studied`}
                    onPress={() => hasStudyContent ? setActiveTab("lessons") : classrooms.length ? openWorkspaceTab("classrooms") : onCatalogPullRefresh().catch(() => {})}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <GlassCard style={{ height: 74, borderRadius: 18, borderColor: ui.border }} contentStyle={{ flex: 1, justifyContent: "center", paddingVertical: tinyStudentHome ? 4.8 : 6.4 }} padding={tinyStudentHome ? 6 : 8} variant="strong">
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <IconTile
                          icon={dailyGoalComplete ? "checkmark-circle-outline" : "flag-outline"}
                          size={tinyStudentHome ? 32 : compactStudentHome ? 34 : 38}
                          iconSize={tinyStudentHome ? 16 : compactStudentHome ? 17 : 19}
                          radius={12}
                          backgroundColor={dailyGoalComplete ? `${ui.success}16` : ui.primarySoft}
                          borderColor="transparent"
                          color={dailyGoalComplete ? ui.success : ui.primary}
                        />
                        <View style={{ flex: 1, minWidth: 0, marginLeft: tinyStudentHome ? 6 : compactStudentHome ? 8 : 10 }}>
                          <Text style={{ color: ui.text, fontWeight: "700", fontSize: tinyStudentHome ? 13 : 14, lineHeight: 18 }} numberOfLines={1}>Daily goal</Text>
                          <Text style={{ color: ui.muted, fontSize: tinyStudentHome ? 10 : 11, lineHeight: 15, marginTop: 2 }} numberOfLines={1}>{todayWords} of {dailyGoalWords} words</Text>
                        </View>
                        <Text style={{ color: dailyGoalComplete ? ui.success : ui.primary, fontWeight: "800", fontSize: tinyStudentHome ? 12 : 13, marginLeft: 4 }}>{dailyGoalComplete ? "Done" : `${dailyGoalProgress}%`}</Text>
                      </View>
                      <View style={{ height: 5, backgroundColor: ui.borderSoft, borderRadius: 999, overflow: "hidden", marginTop: 6 }}>
                        <AnimatedProgressFill progress={dailyGoalProgress} color={dailyGoalComplete ? ui.success : ui.primary} />
                      </View>
                    </GlassCard>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.84}
                    accessibilityRole="button"
                    accessibilityLabel={`${unlockedAchievementIds.length} achievements unlocked`}
                    onPress={() => setAchievementGalleryVisible(true)}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <GlassCard style={{ height: 74, borderRadius: 18, borderColor: ui.border }} contentStyle={{ flex: 1, justifyContent: "center", paddingVertical: tinyStudentHome ? 4.8 : 6.4 }} padding={tinyStudentHome ? 6 : 8} variant="strong">
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <IconTile icon="trophy-outline" size={tinyStudentHome ? 32 : compactStudentHome ? 34 : 38} iconSize={tinyStudentHome ? 16 : compactStudentHome ? 17 : 19} radius={12} backgroundColor={`${ui.secondary}15`} borderColor="transparent" color={ui.secondary} />
                        <View style={{ flex: 1, minWidth: 0, marginLeft: tinyStudentHome ? 6 : compactStudentHome ? 8 : 10 }}>
                          <Text style={{ color: ui.text, fontWeight: "700", fontSize: tinyStudentHome ? 13 : 14, lineHeight: 18 }} numberOfLines={1}>Badges</Text>
                          <Text style={{ color: ui.muted, fontSize: tinyStudentHome ? 10 : 11, lineHeight: 15, marginTop: 2 }} numberOfLines={1}>{unlockedAchievementIds.length} of {ACHIEVEMENTS.length} unlocked</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={tinyStudentHome ? 14 : 16} color={ui.secondary} />
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={() => openWorkspaceTab("classrooms")}
                  activeOpacity={0.84}
                  accessibilityRole="button"
                  accessibilityLabel="Open classrooms"
                  style={{ marginBottom: 16 }}
                >
                  <GlassCard style={{ borderRadius: 18, borderColor: ui.border, backgroundColor: uiIsDark ? ui.card : "#FFFCF7" }} padding={12} variant="strong">
                    <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center" }}>
                      <IconTile icon="people-outline" size={40} iconSize={19} radius={12} backgroundColor={ui.classroomSoft} borderColor="transparent" color={ui.classroomText} />
                      <View style={{ flex: 1, minWidth: 0, marginLeft: 11 }}>
                        <Text style={{ color: ui.text, fontSize: 15, lineHeight: 19, fontWeight: "700" }}>Classroom</Text>
                        <Text style={{ color: ui.muted, fontSize: 12, lineHeight: 16, marginTop: 3 }} numberOfLines={2}>
                          {classrooms.length ? `${classrooms.length} ${classrooms.length === 1 ? "classroom" : "classrooms"} · Open your assigned lessons and tests` : "View your classroom memberships"}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={ui.muted} />
                    </View>
                  </GlassCard>
                </TouchableOpacity>

                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontWeight: "800", fontSize: 28, lineHeight: 32, color: ui.text }}>Lessons</Text>
                  <TouchableOpacity onPress={() => setActiveTab("lessons")} activeOpacity={0.76} accessibilityRole="button" accessibilityLabel="View all lessons" style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Text style={{ fontWeight: "700", fontSize: 16, color: ui.primary }}>View All</Text>
                    <Ionicons name="chevron-forward" size={16} color={ui.primary} />
                  </TouchableOpacity>
                </View>

                {lessonsOverview.length === 0 ? (
                  <StudentEmptyState
                    icon="book-outline"
                    title="No lessons yet"
                    body="Assigned lessons will show up here as soon as your teacher shares them."
                    actionLabel={testsData.length > 0 ? "Open tests" : "Refresh"}
                    onAction={
                      testsData.length > 0
                        ? () => setActiveTab("tests")
                        : () => {
                            onCatalogPullRefresh().catch(() => {});
                          }
                    }
                  />
                ) : null}

                {lessonsOverview.slice(0, 5).map((lesson, index) => {
                  const pct = lesson.total > 0 ? Math.round((lesson.practiced / lesson.total) * 100) : 0;
                  const fullLesson = lessonsWithProgress.find((l) => l.id === lesson.id);
                  return (
                    <ScreenReveal key={lesson.id} delay={130 + index * 28} distance={14} scaleFrom={0.994}>
                  <TouchableOpacity activeOpacity={0.84} onPress={() => fullLesson && openLessonDetail(fullLesson)} accessibilityRole="button" accessibilityLabel={`Open ${lesson.name}`}>
                      <GlassCard style={{ minHeight: 96, borderRadius: 18, marginBottom: 8, borderColor: ui.border, backgroundColor: ui.card }} padding={11}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          {lesson.cover ? (
                            <RemoteLessonImage
                              uri={cacheBustAssetUrl(lesson.cover, fullLesson?.updated_at, assetRefreshEpoch) ?? lesson.cover}
                              style={{ width: 58, height: 58, borderRadius: 14, backgroundColor: ui.borderSoft }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={{ width: 58, height: 58, borderRadius: 14, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}>
                              <Ionicons name="book-outline" size={23} color={ui.primary} />
                            </View>
                          )}
                          <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                            <Text style={{ fontWeight: "700", fontSize: 16, lineHeight: 20, color: ui.text }} numberOfLines={1}>{lesson.name}</Text>
                            {fullLesson ? (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 }}>
                                <AssignmentStatusPill progress={fullLesson.assignmentProgress} ui={ui} />
                                {fullLesson.assignment ? (
                                  <View style={{ flex: 1, minWidth: 0 }}>
                                    <AssignmentExpectationBadge assignment={fullLesson.assignment} ui={ui} />
                                  </View>
                                ) : null}
                              </View>
                            ) : null}
                            <View style={{ marginTop: 7, height: 4, borderRadius: 999, backgroundColor: ui.borderSoft, overflow: "hidden" }}>
                              <View style={{ width: `${pct}%`, height: "100%", backgroundColor: ui.primary }} />
                            </View>
                          </View>
                          <View style={{ width: 45, marginLeft: 7, alignItems: "flex-end" }}>
                            <Text style={{ fontWeight: "800", fontSize: 18, lineHeight: 22, color: ui.primary }}>{pct}%</Text>
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                              <Text style={{ color: ui.muted, fontSize: 12, lineHeight: 16 }}>{lesson.practiced}/{lesson.total}</Text>
                              <Ionicons name="chevron-forward" size={15} color={ui.muted} style={{ marginLeft: 2 }} />
                            </View>
                          </View>
                        </View>
                      </GlassCard>
                    </TouchableOpacity>
                    </ScreenReveal>
                  );
                })}

                {continueSuggestion ? (
                  <TouchableOpacity onPress={openContinueSuggestion} activeOpacity={0.86} style={{ marginTop: 2, marginBottom: 8 }} accessibilityRole="button" accessibilityLabel={`${continueSuggestion.ctaLabel}: ${continueSuggestion.title}`}>
                    <GlassCard style={{ borderRadius: 16, borderColor: `${ui.primary}38` }} padding={10} variant="strong">
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name={continueSuggestion.kind === "test" ? "clipboard-outline" : "play"} size={17} color={ui.primary} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 9, lineHeight: 12, fontWeight: "800", color: ui.primary, letterSpacing: 0.6 }}>
                            {continueSuggestion.kind === "resume" ? "CONTINUE WHERE YOU LEFT OFF" : "PICK UP WHERE YOU LEFT OFF"}
                          </Text>
                          <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: "700", color: ui.text, marginTop: 1 }} numberOfLines={1}>{continueSuggestion.title}</Text>
                          <Text style={{ fontSize: 10, lineHeight: 13, color: ui.muted, marginTop: 1 }} numberOfLines={1}>{continueSuggestion.subtitle} {"\u00B7"} {continueSuggestion.meta}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={ui.primary} />
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                ) : null}

                {activeFocusInterventions.length > 0 ? (
                  <TouchableOpacity
                    onPress={startTeacherFocusPractice}
                    activeOpacity={0.86}
                    accessibilityRole="button"
                    accessibilityLabel="Start focus practice assigned by your teacher"
                    style={{ marginBottom: 8 }}
                  >
                    <GlassCard style={{ borderRadius: 16, borderColor: `${ui.warning}42` }} padding={10} variant="strong">
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                        <IconTile icon="locate-outline" size={38} iconSize={18} radius={11} backgroundColor={`${ui.warning}14`} borderColor="transparent" color={ui.warning} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 9, lineHeight: 12, fontWeight: "800", color: ui.warning, letterSpacing: 0.6 }}>FROM YOUR TEACHER</Text>
                          <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: "700", color: ui.text, marginTop: 1 }}>Teacher follow-up</Text>
                          <Text style={{ fontSize: 10, lineHeight: 13, color: ui.muted, marginTop: 1 }} numberOfLines={1}>
                            {completedFocusModes.length} of {REQUIRED_FOLLOW_UP_MODES.length} activities complete
                          </Text>
                        </View>
                        <View style={{ borderRadius: 999, backgroundColor: ui.primarySoft, paddingHorizontal: 9, paddingVertical: 5 }}>
                          <Text style={{ color: ui.primary, fontSize: 10, fontWeight: "800" }}>{completedFocusModes.length > 0 ? "Continue" : "Start"}</Text>
                        </View>
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}

            {activeTab === "lessons" ? (
              <>
                <GlassCard style={{ borderRadius: 18, marginBottom: 12, borderColor: ui.border }} padding={9} variant="strong">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <IconTile icon="book-outline" size={36} iconSize={19} radius={11} backgroundColor={ui.primarySoft} borderColor="transparent" color={ui.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "800", fontSize: 21, lineHeight: 25, color: ui.text }}>Lessons</Text>
                      <Text style={{ color: ui.muted, fontSize: 12.5, lineHeight: 17, marginTop: 2 }}>
                        {offlineMode ? "Offline mode: downloaded lessons are available now." : "Select a lesson to study and practice."}
                      </Text>
                    </View>
                  </View>
                </GlassCard>
                {lessonsData.length === 0 ? (
                  <StudentEmptyState
                    icon="book-outline"
                    title={selectedClassroom ? "No lessons in this classroom" : "No direct lessons assigned"}
                    body={selectedClassroom ? "Your teacher has not assigned active lessons in this classroom yet." : "Choose Classroom to see your class work, or pull down to refresh direct assignments."}
                    actionLabel="Refresh"
                    onAction={() => {
                      onCatalogPullRefresh().catch(() => {});
                    }}
                    secondaryLabel={testsData.length > 0 ? "Open tests" : undefined}
                    onSecondaryAction={testsData.length > 0 ? () => setActiveTab("tests") : undefined}
                  />
                ) : null}
                {lessonsData.length > 0 ? (
                  <CatalogFilterBar
                    label="Show lessons"
                    value={lessonStatusFilter}
                    onChange={(value) => setLessonStatusFilter(value as LessonStatusFilter)}
                    ui={ui}
                    options={[
                      { value: "action", label: "Needs action", count: lessonsWithProgress.filter((lesson) => lesson.assignmentProgress.actionRequired).length },
                      { value: "completed", label: "Completed", count: lessonsWithProgress.filter((lesson) => !lesson.assignmentProgress.actionRequired).length },
                      { value: "all", label: "All", count: lessonsWithProgress.length },
                    ]}
                  />
                ) : null}
                {lessonLanguageGroups.length >= 2 ? (
                  <View style={{ marginBottom: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: ui.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Filter by language</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginHorizontal: -16 }}
                      contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
                    >
                      <TouchableOpacity
                        onPress={() => setLessonLanguageKey(null)}
                        activeOpacity={0.85}
                        style={{
                          height: 44,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          backgroundColor: lessonLanguageKey == null ? ui.primary : ui.card,
                          borderColor: lessonLanguageKey == null ? ui.primary : ui.border,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "700", color: lessonLanguageKey == null ? ui.primaryText : ui.muted }}>All</Text>
                      </TouchableOpacity>
                      {lessonLanguageGroups.map((group) => {
                        const active = lessonLanguageKey === group.key;
                        const palette = getLanguageColor(group.short, theme.isDark);
                        return (
                          <TouchableOpacity
                            key={group.key}
                            onPress={() => setLessonLanguageKey(group.key)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`${group.label} lessons${active ? ", selected" : ""}`}
                            activeOpacity={0.85}
                            style={{
                              height: 44,
                              paddingHorizontal: 10,
                              borderRadius: 999,
                              borderWidth: 1,
                              backgroundColor: active ? ui.primarySoft : ui.card,
                              borderColor: active ? ui.primary : ui.border,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 7,
                            }}
                          >
                            <View style={{
                              minWidth: 22,
                              height: 22,
                              borderRadius: 11,
                              backgroundColor: active ? `${ui.primary}1C` : `${palette.text}12`,
                              alignItems: "center",
                              justifyContent: "center",
                              paddingHorizontal: 6,
                            }}>
                              <Text style={{ fontSize: 9.5, fontWeight: "800", color: active ? ui.primary : palette.text }}>{group.short}</Text>
                            </View>
                            <Text style={{ fontSize: 12, fontWeight: active ? "700" : "600", color: active ? ui.primary : ui.muted }}>{group.label}</Text>
                            {active ? <Ionicons name="checkmark" size={12} color={ui.primary} /> : null}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
                {filteredLessonsData.map((lesson) => {
                  const lessonMeta = getDisplayLanguageMeta(lesson.language_pair, lesson.language);
                  const lessonLanguageLabel = lesson.language?.trim() || lessonMeta.labelA;
                  const offlineSummary = downloadedLessons[lesson.id];
                  const downloadState = lessonDownloadState[lesson.id];
                  const downloadBusy = downloadState === "downloading" || downloadState === "success";
                  const staleDownload = isDownloadedLessonStale(lesson, offlineSummary);
                  const normalizedLessonName = lesson.name.toLowerCase();
                  const fallbackIcon: keyof typeof Ionicons.glyphMap = normalizedLessonName.includes("gaming") || normalizedLessonName.includes("game")
                    ? "game-controller-outline"
                    : normalizedLessonName.includes("cooking") || normalizedLessonName.includes("food")
                      ? "restaurant-outline"
                      : normalizedLessonName.includes("mechanical") || normalizedLessonName.includes("shop")
                        ? "construct-outline"
                        : "book-outline";
                  const fallbackColor = fallbackIcon === "game-controller-outline"
                    ? ui.success
                    : fallbackIcon === "restaurant-outline"
                      ? ui.warning
                      : fallbackIcon === "construct-outline"
                        ? ui.secondary
                        : ui.primary;
                  return (
                    <GlassCard
                    key={`${lesson.id}-${lesson.updated_at ?? ""}-${assetRefreshEpoch}`}
                    style={{ minHeight: 120, borderRadius: 18, marginBottom: 8, borderColor: ui.border }}
                    contentStyle={{ paddingHorizontal: 16, paddingVertical: 14 }}
                    padding={0}
                    variant="strong"
                  >
                    <TouchableOpacity
                      onPress={() => openLessonDetail(lesson)}
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      {lesson.cover_image_url ? (
                        <RemoteLessonImage
                          uri={cacheBustAssetUrl(lesson.cover_image_url, lesson.updated_at, assetRefreshEpoch) ?? lesson.cover_image_url}
                          style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: ui.borderSoft }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: `${fallbackColor}14`, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name={fallbackIcon} size={23} color={fallbackColor} />
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                          <Text style={{ flex: 1, minWidth: 0, fontWeight: "700", fontSize: 15, lineHeight: 18, color: ui.text }} numberOfLines={2}>{lesson.name}</Text>
                          <View style={{ alignItems: "flex-end", minWidth: 34 }}>
                            <Text style={{ color: ui.primary, fontWeight: "800", fontSize: 13.5, lineHeight: 16 }}>{lesson.assignmentProgress.progressPercent}%</Text>
                            <Text style={{ color: ui.muted, fontSize: 9.5, lineHeight: 11 }}>{lesson.assignmentProgress.practicedCount}/{lesson.assignmentProgress.totalWords}</Text>
                          </View>
                        </View>
                        <Text style={{ color: ui.muted, fontSize: 11, lineHeight: 14, fontWeight: "400", marginTop: 1 }} numberOfLines={1}>{lessonsWords.filter((word) => word.lessonId === lesson.id).length} activities · {lessonLanguageLabel}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, marginTop: 3 }}>
                          <ClassroomAssignmentPill classroomNames={lesson.classroomNames} ui={ui} />
                          <AssignmentStatusPill progress={lesson.assignmentProgress} ui={ui} />
                        </View>
                        <View style={{ marginTop: 2 }}>
                          <AssignmentExpectationBadge assignment={lesson.assignment} ui={ui} />
                        </View>
                        <View style={{ height: 3, borderRadius: 999, backgroundColor: ui.borderSoft, overflow: "hidden", marginTop: 4 }}>
                          <View
                            style={{
                              width: `${lesson.assignmentProgress.progressPercent}%`,
                              height: "100%",
                              backgroundColor: assignmentStatusColor(lesson.assignmentProgress.status, ui),
                            }}
                          />
                        </View>
                      </View>
                      <TouchableOpacity
                        disabled={downloadBusy || (Boolean(offlineSummary) && !staleDownload)}
                        onPress={(event) => {
                          event.stopPropagation?.();
                          downloadLesson(lesson);
                        }}
                        activeOpacity={0.85}
                        style={{
                          width: 42,
                          height: 42,
                          marginLeft: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: offlineSummary && !staleDownload ? "rgba(34,197,94,0.20)" : ui.border,
                          backgroundColor: offlineSummary && !staleDownload ? "rgba(34,197,94,0.09)" : `${ui.primary}0D`,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: downloadState === "downloading" ? 0.9 : 1,
                        }}
                        accessibilityLabel={offlineSummary && !staleDownload ? "Lesson downloaded" : staleDownload ? "Update downloaded lesson" : "Download lesson"}
                      >
                        <LessonDownloadStatusIcon state={downloadState} downloaded={Boolean(offlineSummary)} stale={staleDownload} ui={ui} size={16} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                    </GlassCard>
                  );
                })}
                {lessonsData.length > 0 && filteredLessonsData.length === 0 ? (
                  <GlassCard style={{ borderRadius: 16, marginBottom: 10 }} padding={14} variant="strong">
                    <View style={{ alignItems: "center" }}>
                      <Ionicons name="filter-outline" size={22} color={ui.muted} />
                      <Text style={{ color: ui.text, fontSize: 15, fontWeight: "900", marginTop: 7 }}>No lessons in this view</Text>
                      <Text style={{ color: ui.muted, fontSize: 12, textAlign: "center", marginTop: 4 }}>Try another status or language filter.</Text>
                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => { setLessonStatusFilter("all"); setLessonLanguageKey(null); }}
                        style={{ marginTop: 10, minHeight: 40, borderRadius: 12, backgroundColor: ui.primarySoft, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }}
                      >
                        <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "900" }}>Show all lessons</Text>
                      </TouchableOpacity>
                    </View>
                  </GlassCard>
                ) : null}
              </>
            ) : null}

            {activeTab === "practice" ? (
              <>
                {allWords.length === 0 ? (
                  <StudentEmptyState
                    icon="play-circle-outline"
                    title="Practice opens after your first lesson"
                    body="Once lesson words are assigned, you will be able to use typing, listening, review, and image practice here."
                    actionLabel="Refresh"
                    onAction={() => { onCatalogPullRefresh().catch(() => {}); }}
                    secondaryLabel={lessonsData.length > 0 ? "Open lessons" : undefined}
                    onSecondaryAction={lessonsData.length > 0 ? () => setActiveTab("lessons") : undefined}
                  />
                ) : (
                  <>
                    {/* ── Quick Play Card ── */}
                    <GlassCard style={{ borderRadius: 18, marginBottom: 12, borderColor: ui.border }} padding={14} variant="strong">
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="play" size={18} color={ui.primary} />
                        </View>
                        <View>
                          <Text style={{ fontWeight: "800", fontSize: 17, color: ui.text }}>Quick Play</Text>
                          <Text style={{ fontSize: 11.5, color: ui.muted, marginTop: 1 }}>All lessons · random words</Text>
                        </View>
                      </View>

                      {/* Language selector - only shown when 2+ distinct languages */}
                      {quickPlayLanguageGroups.length >= 2 && (
                        <>
                          <Text style={{ fontSize: 10.5, fontWeight: "700", color: ui.muted, textTransform: "uppercase", letterSpacing: 0.75, marginBottom: 7 }}>Language</Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={{ marginHorizontal: -14, marginBottom: 12 }}
                            contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}
                          >
                            {quickPlayLanguageGroups.map((group) => {
                              const active = activeQuickPlayLanguageKey === group.key;
                              const palette = getLanguageColor(group.short, theme.isDark);
                              return (
                                <TouchableOpacity
                                  key={group.key}
                                  onPress={() => setQuickPlayLanguageKey(group.key)}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: active }}
                                  accessibilityLabel={`${group.label} language${active ? ", selected" : ""}`}
                                  activeOpacity={0.85}
                                  style={{
                                    height: 44,
                                    paddingHorizontal: 10,
                                    borderRadius: 11,
                                    borderWidth: 1,
                                    backgroundColor: active ? ui.primarySoft : ui.card,
                                    borderColor: active ? ui.primary : ui.border,
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: palette.accent || palette.text }} />
                                  <Text style={{ fontSize: 11.5, fontWeight: active ? "700" : "600", color: active ? ui.primary : ui.muted }}>{group.label}</Text>
                                  {active ? <Ionicons name="checkmark" size={12} color={ui.primary} /> : null}
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </>
                      )}

                      {/* Direction */}
                      <Text style={{ fontSize: 10.5, fontWeight: "700", color: ui.muted, textTransform: "uppercase", letterSpacing: 0.75, marginBottom: 7 }}>Direction</Text>
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                        {(["pt-en", "en-pt"] as StudyDirection[]).map((dir) => {
                          const activeKey = activeQuickPlayLanguageKey;
                          const fwd = quickPlayLanguageGroups.find((g) => g.key === activeKey)?.lesson ?? lessonsData[0];
                          const label = dir === "pt-en"
                            ? labelDirectionForward(fwd?.language_pair, fwd?.language)
                            : labelDirectionReverse(fwd?.language_pair, fwd?.language);
                          const active = quickPlayDirection === dir;
                          return (
                            <TouchableOpacity
                              key={dir}
                              onPress={() => {
                                setQuickPlayDirection(dir);
                                setQuickPlayShuffleSeed((prev) => prev + 1);
                              }}
                              activeOpacity={0.85}
                              style={{
                                flex: 1,
                                height: 54,
                                borderRadius: 11,
                                borderWidth: 1,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: active ? ui.primarySoft : ui.card,
                                borderColor: active ? ui.primary : ui.border,
                                flexDirection: "row",
                                gap: 6,
                              }}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: active ? "700" : "600", color: active ? ui.primary : ui.muted }}>{label}</Text>
                              {active ? <Ionicons name="checkmark-circle" size={14} color={ui.primary} /> : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Word count slider */}
                      <Text style={{ fontSize: 10.5, fontWeight: "700", color: ui.muted, textTransform: "uppercase", letterSpacing: 0.75, marginBottom: 7 }}>Words</Text>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {QUICK_PLAY_COUNTS.map((n) => {
                          const active = quickPlayCount === n;
                          const label = String(n);
                          return (
                            <TouchableOpacity
                              key={n}
                              onPress={() => {
                                setQuickPlayCount(n);
                                setQuickPlayShuffleSeed((previous) => previous + 1);
                                applyProgress({
                                  ...progress,
                                  preferences: { ...progress.preferences, practiceLength: n },
                                });
                              }}
                              activeOpacity={0.85}
                              style={{
                                flex: 1,
                                height: 52,
                                borderRadius: 10,
                                borderWidth: 1,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: active ? ui.primary : ui.borderSoft,
                                borderColor: active ? ui.primary : ui.border,
                              }}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              accessibilityLabel={`${n} words per session${active ? ", selected" : ""}`}
                            >
                              <Text style={{ fontSize: 12, fontWeight: active ? "700" : "600", color: active ? ui.primaryText : ui.muted }}>{label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                    </GlassCard>

                    {/* ── Session mode list ── */}
                    <Text style={{ fontSize: 10.5, color: ui.muted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700", marginBottom: 8 }}>Study modes</Text>
                    {[
                      {
                        label: "Typing Practice",
                        description: "Write the answer from memory",
                        type: "practice" as StudySessionType,
                        mode: "typing" as StudySessionMode,
                        iconBg: theme.colors.primarySoft,
                        iconColor: theme.colors.primary,
                      },
                      {
                        label: "Multiple Choice",
                        description: "Choose the best answer",
                        type: "practice" as StudySessionType,
                        mode: "multiple-choice" as StudySessionMode,
                        iconBg: theme.colors.violetSoft,
                        iconColor: theme.colors.violet,
                      },
                      {
                        label: "Listening",
                        description: "Build recall from pronunciation",
                        type: "practice" as StudySessionType,
                        mode: "listening" as StudySessionMode,
                        iconBg: theme.colors.successSoft,
                        iconColor: theme.colors.success,
                      },
                      {
                        label: "Image Mode",
                        description: "Connect words with visual prompts",
                        type: "practice" as StudySessionType,
                        mode: "image" as StudySessionMode,
                        iconBg: theme.colors.warningSoft,
                        iconColor: theme.colors.warning,
                      },
                      {
                        label: "Review Mistakes",
                        description: "Revisit words that need another look",
                        type: "review-mistakes" as StudySessionType,
                        mode: "typing" as StudySessionMode,
                        iconBg: theme.colors.dangerSoft,
                        iconColor: theme.colors.danger,
                      },
                      {
                        label: "Smart Review",
                        description: "Prioritize your least-practised words",
                        type: "smart-review" as StudySessionType,
                        mode: "typing" as StudySessionMode,
                        iconBg: theme.colors.violetSoft,
                        iconColor: theme.colors.violet,
                      },
                    ].map((item, itemIndex) => {
                      const modeEligibleWords = quickPlayShuffledPool.filter((word) => {
                        if (item.mode === "listening") return Boolean(word.audioUrl);
                        if (item.mode === "image") return Boolean(word.imageUrl);
                        if (item.type === "review-mistakes") return reviewMistakeWordIds.has(word.id);
                        return true;
                      });
                      const words = modeEligibleWords.slice(0, quickPlayCount);
                      const disabled = words.length === 0;
                      const availabilityLabel = disabled
                        ? item.type === "review-mistakes"
                          ? "No mistakes ready to review"
                          : `No ${item.label.toLowerCase()} content yet`
                        : `${Math.min(words.length, quickPlayCount)} word${Math.min(words.length, quickPlayCount) === 1 ? "" : "s"} ready`;
                      return (
                        <ScreenReveal key={item.label} delay={40 + itemIndex * 26} distance={10} scaleFrom={0.994} duration={260}>
                          <GlassCard style={{ borderRadius: 18, marginBottom: 9, borderColor: ui.border, opacity: disabled ? 0.72 : 1 }} padding={8} variant="strong">
                            <TouchableOpacity
                              disabled={disabled}
                              accessibilityRole="button"
                              accessibilityState={{ disabled }}
                              accessibilityLabel={`${item.label}. ${item.description}. ${availabilityLabel}`}
                              onPress={() => {
                                startSession(item.type, item.mode, quickPlayDirection, words, { id: null, name: "Quick Play" });
                              }}
                              style={{ flexDirection: "row", alignItems: "center" }}
                            >
                              <View style={{ width: 56, height: 56, borderRadius: 13, backgroundColor: item.iconBg, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                                <Ionicons
                                  name={
                                    item.mode === "multiple-choice"
                                      ? "checkmark-done-outline"
                                      : item.mode === "image"
                                      ? "image-outline"
                                      : item.mode === "listening"
                                      ? "headset-outline"
                                      : item.type === "review-mistakes"
                                      ? "refresh-circle-outline"
                                      : item.type === "smart-review"
                                      ? "sparkles-outline"
                                      : "keypad-outline"
                                  }
                                  size={22}
                                  color={disabled ? ui.muted : item.iconColor}
                                />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontWeight: "700", fontSize: 16, lineHeight: 19, color: disabled ? ui.muted : ui.text }}>{item.label}</Text>
                                <Text style={{ color: ui.muted, fontSize: 12.5, lineHeight: 17, marginTop: 1 }}>{item.description}</Text>
                                <Text style={{ color: disabled ? ui.muted : ui.primary, fontSize: 13, lineHeight: 17, fontWeight: "600", marginTop: 1 }}>{availabilityLabel}</Text>
                              </View>
                              <Ionicons name={disabled ? "lock-closed-outline" : "chevron-forward"} size={16} color={disabled ? ui.muted : ui.primary} />
                            </TouchableOpacity>
                          </GlassCard>
                        </ScreenReveal>
                      );
                    })}
                  </>
                )}
              </>
            ) : null}

            {activeTab === "tests" ? (
              <>
                <GlassCard style={{ borderRadius: 18, marginBottom: 14 }} padding={16} variant="hero">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <IconTile icon="clipboard-outline" size={42} iconSize={22} radius={12} backgroundColor={ui.primarySoft} borderColor={ui.borderStrong} color={ui.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "800", fontSize: 24, color: ui.text }}>Tests</Text>
                      <Text style={{ color: ui.muted, fontSize: 14, marginTop: 4 }}>
                    {testsData.length > 0 ? "Test your knowledge. Select a test or lesson:" : "Test your knowledge without hints. Select a lesson to test:"}
                      </Text>
                    </View>
                  </View>
                </GlassCard>

                {testsData.length === 0 && scopedTestHistory.length === 0 ? (
                  <StudentEmptyState
                    icon="clipboard-outline"
                    title={offlineMode ? "Tests need a connection" : selectedClassroom ? "No tests in this classroom" : "No direct tests assigned"}
                    body={offlineMode ? "Reconnect and pull down to refresh your assigned tests. Your downloaded lessons are still available." : selectedClassroom ? "Active tests assigned to you in this classroom will appear here." : "Choose Classroom to open class tests, or check back for direct assignments."}
                    actionLabel={lessonsData.length > 0 ? "Open lessons" : "Refresh"}
                    onAction={
                      lessonsData.length > 0
                        ? () => setActiveTab("lessons")
                        : () => {
                            onCatalogPullRefresh().catch(() => {});
                          }
                    }
                  />
                ) : null}

                {testsData.length > 0 ? (
                  <>
                    <CatalogFilterBar
                      label="Show tests"
                      value={testStatusFilter}
                      onChange={(value) => setTestStatusFilter(value as TestStatusFilter)}
                      ui={ui}
                      options={[
                        { value: "action", label: "Needs action", count: testsWithProgress.filter((test) => test.assignmentProgress.actionRequired).length },
                        { value: "review", label: "Awaiting review", count: testsWithProgress.filter((test) => test.assignmentProgress.status === "awaiting-review").length },
                        { value: "completed", label: "Results", count: testsWithProgress.filter((test) => !test.assignmentProgress.actionRequired && test.assignmentProgress.status !== "awaiting-review").length },
                        { value: "all", label: "All", count: testsWithProgress.length },
                      ]}
                    />
                    {filteredTestsData.map((item, index) => (
                      <GlassCard key={`${item.id ?? "test"}-${index}`} style={{ borderRadius: 16, marginBottom: 10 }} padding={12} variant="strong">
                        <TouchableOpacity
                          onPress={() => openTestDetailFromTest(item)}
                          accessibilityRole="button"
                          accessibilityLabel={`${item.assignmentProgress.ctaLabel} ${item.name}`}
                          style={{ flexDirection: "row", alignItems: "center" }}
                        >
                          {item.cover_image_url ? (
                            <RemoteLessonImage
                              uri={cacheBustAssetUrl(item.cover_image_url, item.updated_at, assetRefreshEpoch) ?? item.cover_image_url}
                              style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: ui.borderSoft }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: 22 }}>📝</Text>
                            </View>
                          )}
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={{ fontWeight: "800", color: ui.text, fontSize: 15 }}>{item.name}</Text>
                            <Text style={{ fontSize: 12, color: ui.muted, marginTop: 2 }}>
                              {safeLength(item.words)} questions
                              {item.time_limit_minutes ? ` - ${item.time_limit_minutes} min` : ""}
                              {` - ${item.teacher_name || teacherName}`}
                            </Text>
                            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7, marginTop: 7 }}>
                              <AssignmentStatusPill progress={item.assignmentProgress} ui={ui} />
                              <AssignmentExpectationBadge assignment={item.assignment} ui={ui} />
                            </View>
                            {item.assignmentProgress.latestResult ? (
                              <Text style={{ color: ui.muted, fontSize: 11, fontWeight: "700", marginTop: 6 }}>
                                {getStudentTestResultPresentation(item.assignmentProgress.latestResult)?.state === "final"
                                  ? `Latest score: ${item.assignmentProgress.latestResult.percentage}%`
                                  : getStudentTestResultPresentation(item.assignmentProgress.latestResult)?.label}
                                {item.assignmentProgress.attemptsRemaining == null
                                  ? ""
                                  : ` - ${item.assignmentProgress.attemptsRemaining} attempt${item.assignmentProgress.attemptsRemaining === 1 ? "" : "s"} left`}
                              </Text>
                            ) : null}
                            {item.assignment?.instructions ? (
                              <Text style={{ color: ui.muted, fontSize: 11, lineHeight: 16, marginTop: 6 }} numberOfLines={2}>
                                {item.assignment.instructions}
                              </Text>
                            ) : null}
                          </View>
                          <View style={{ minHeight: 34, borderRadius: 11, backgroundColor: ui.primarySoft, borderWidth: 1, borderColor: ui.borderStrong, paddingHorizontal: 9, marginLeft: 8, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ color: ui.primary, fontSize: 10, fontWeight: "900" }} numberOfLines={2}>
                              {item.assignmentProgress.ctaLabel}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </GlassCard>
                    ))}
                    {filteredTestsData.length === 0 ? (
                      <GlassCard style={{ borderRadius: 16, marginBottom: 10 }} padding={14} variant="strong">
                        <View style={{ alignItems: "center" }}>
                          <Ionicons name="filter-outline" size={22} color={ui.muted} />
                          <Text style={{ color: ui.text, fontSize: 15, fontWeight: "900", marginTop: 7 }}>No tests in this view</Text>
                          <TouchableOpacity
                            accessibilityRole="button"
                            onPress={() => setTestStatusFilter("all")}
                            style={{ marginTop: 10, minHeight: 40, borderRadius: 12, backgroundColor: ui.primarySoft, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }}
                          >
                            <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "900" }}>Show all tests</Text>
                          </TouchableOpacity>
                        </View>
                      </GlassCard>
                    ) : null}
                  </>
                ) : null}

                {scopedTestHistory.length > 0 ? (
                  <>
                    <Text style={{ fontSize: 11, color: ui.muted, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700", marginTop: 10, marginBottom: 10 }}>Test history</Text>
                    {scopedTestHistory.slice(0, 5).map((record, index) => {
                      const recordPresentation = getStudentTestResultPresentation(record);
                      const recordPassed = recordPresentation?.passed === true;
                      return (
                      <GlassCard key={`${record.id ?? record.lessonId ?? "history"}-${index}`} style={{ borderRadius: 14, marginBottom: 10 }} padding={12} variant="strong">
                        <TouchableOpacity
                          activeOpacity={0.84}
                          onPress={() => openTestHistoryRecord(record)}
                          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                        >
                          <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={{ fontWeight: "600", color: ui.text }} numberOfLines={1}>{record.lessonName || "Lesson test"}</Text>
                            <Text style={{ color: ui.muted, fontSize: 12, marginTop: 2 }}>
                              {record.date ? new Date(record.date).toLocaleDateString() : ""} -{" "}
                              {historyDirectionLabel(record.direction, record.languagePair, record.lessonLanguage)}
                            </Text>
                            <Text style={{ color: ui.primary, fontSize: 11, fontWeight: "700", marginTop: 5 }}>
                              Review questions and answers
                            </Text>
                          </View>
                          <View style={{ alignItems: "flex-end", gap: 8 }}>
                            <View
                              style={{
                                backgroundColor: recordPresentation?.state === "awaiting-review"
                                  ? `${ui.warning}20`
                                  : recordPresentation?.state !== "final"
                                    ? ui.borderSoft
                                    : recordPassed ? `${ui.success}20` : record.percentage >= 50 ? `${ui.warning}20` : `${ui.danger}18`,
                                borderRadius: 999,
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                              }}
                            >
                              <Text style={{ fontWeight: "800", color: recordPresentation?.state === "awaiting-review" ? ui.warning : recordPresentation?.state !== "final" ? ui.muted : recordPassed ? ui.success : record.percentage >= 50 ? ui.warning : ui.danger }}>
                                {recordPresentation?.state === "final"
                                  ? `${recordPresentation.percentage}%`
                                  : recordPresentation?.label ?? "Result syncing"}
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={ui.primary} />
                          </View>
                        </TouchableOpacity>
                      </GlassCard>
                      );
                    })}
                  </>
                ) : null}
              </>
            ) : null}

            {activeTab === "settings" ? (
              <StudentSettingsTab ui={ui} theme={theme} progress={progress}
                studentName={studentName} teacherName={teacherName}
                learningLanguages={quickPlayLanguageGroups.map((group) => group.label)}
                dailyGoalWords={dailyGoalWords} applyProgress={applyProgress}
                replayStudentGuide={replayStudentGuide} onLogout={() => { void endStudentSession(sessionId); }} />
            ) : null}
            </ScreenReveal>
          </ScrollView>
        </>
      ) : null}

      {runtimeScreen === "lesson-detail" && selectedLessonDetail ? (
        <>
          <DetailTopBar
            ui={ui}
            topInset={insets.top}
            title="Lesson"
            onBack={() => { setRuntimeScreen("dashboard"); setActiveTab("lessons"); }}
            onSettings={() => openWorkspaceTab("settings")}
            onClassrooms={() => openWorkspaceTab("classrooms")}
          />

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: Math.max(insets.top, 8) + 62, paddingBottom: 108 }}
            refreshControl={<RefreshControl refreshing={catalogRefreshing} onRefresh={() => onCatalogPullRefresh()} tintColor={ui.primary} colors={[ui.primary]} />}
          >
            <ScreenReveal key={`lesson-detail-${selectedLessonDetail.id}`} delay={18} distance={18} scaleFrom={0.992}>
            <GlassCard style={{ borderRadius: 18, backgroundColor: ui.card, marginBottom: 12 }} padding={14}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {selectedLessonDetail.cover_image_url ? (
                  <RemoteLessonImage
                    uri={
                      cacheBustAssetUrl(selectedLessonDetail.cover_image_url, selectedLessonDetail.updated_at, assetRefreshEpoch) ??
                      selectedLessonDetail.cover_image_url
                    }
                    style={{ width: 66, height: 66, borderRadius: 14, backgroundColor: ui.borderSoft }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ width: 66, height: 66, borderRadius: 14, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 24 }}>📚</Text>
                  </View>
                )}
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ color: ui.text, fontWeight: "700", fontSize: 23, lineHeight: 29 }}>{selectedLessonDetail.name}</Text>
                  <Text style={{ color: ui.muted, marginTop: 4, fontSize: 14, lineHeight: 20 }}>{selectedLessonWords.length} activities</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7, marginTop: 8 }}>
                    <ClassroomAssignmentPill classroomNames={selectedLessonDetail.classroomNames} ui={ui} />
                    {selectedLessonAssignmentProgress ? (
                      <AssignmentStatusPill progress={selectedLessonAssignmentProgress} ui={ui} />
                    ) : null}
                  </View>
                </View>
              </View>
            </GlassCard>

            <AssignmentInformationCard
              assignment={selectedLessonDetail.assignment}
              teacherName={teacherName}
              ui={ui}
            />

            {(selectedLessonDetail.description ||
              selectedLessonDetail.estimated_minutes ||
              (selectedLessonDetail.learning_objectives?.length ?? 0) > 0) ? (
              <GlassCard style={{ borderRadius: 18, backgroundColor: ui.card, marginBottom: 12 }} padding={14} variant="strong">
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="flag-outline" size={18} color={ui.primary} />
                    <Text style={{ color: ui.text, fontSize: 15, fontWeight: "900" }}>What you will learn</Text>
                  </View>
                  {selectedLessonDetail.estimated_minutes ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, backgroundColor: ui.primarySoft, paddingHorizontal: 9, paddingVertical: 5 }}>
                      <Ionicons name="time-outline" size={13} color={ui.primary} />
                      <Text style={{ color: ui.primary, fontSize: 11, fontWeight: "900" }}>{selectedLessonDetail.estimated_minutes} min</Text>
                    </View>
                  ) : null}
                </View>
                {selectedLessonDetail.description ? (
                  <Text style={{ color: ui.muted, fontSize: 13, lineHeight: 19, marginTop: 10 }}>{selectedLessonDetail.description}</Text>
                ) : null}
                {(selectedLessonDetail.learning_objectives ?? []).map((objective, objectiveIndex) => (
                  <View key={`${selectedLessonDetail.id}-objective-${objectiveIndex}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: 9, marginTop: 10 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: ui.primary, fontSize: 10, fontWeight: "900" }}>{objectiveIndex + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, color: ui.text, fontSize: 13, lineHeight: 19, fontWeight: "600" }}>{objective}</Text>
                  </View>
                ))}
              </GlassCard>
            ) : null}

            {selectedLessonDetail.document_url ? (
              <GlassCard style={{ borderRadius: 18, backgroundColor: ui.card, marginBottom: 12 }} padding={14} variant="strong">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 16,
                      backgroundColor: ui.primarySoft,
                      borderWidth: 1,
                      borderColor: ui.borderStrong,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="document-text-outline" size={24} color={ui.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 }}>LESSON PDF</Text>
                    <Text style={{ color: ui.text, fontWeight: "800", fontSize: 16, marginTop: 4 }} numberOfLines={1}>
                      {selectedLessonDetail.document_name || `${selectedLessonDetail.name} PDF`}
                    </Text>
                    <Text style={{ color: ui.muted, fontSize: 13, marginTop: 4 }} numberOfLines={2}>
                      Open the teacher's attached PDF for lesson notes and extra study material.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={openLessonDocument}
                  activeOpacity={0.85}
                  style={{
                    marginTop: 14,
                    borderRadius: 14,
                    backgroundColor: ui.primary,
                    paddingHorizontal: 16,
                    paddingVertical: 13,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="document-attach-outline" size={18} color={ui.primaryText} />
                  <Text style={{ color: ui.primaryText, fontSize: 14, fontWeight: "800" }}>View Lesson PDF</Text>
                </TouchableOpacity>
                {(() => {
                  const offlineSummary = downloadedLessons[selectedLessonDetail.id];
                  const downloadState = lessonDownloadState[selectedLessonDetail.id];
                  const staleDownload = isDownloadedLessonStale(selectedLessonDetail, offlineSummary);
                  const isBusy = downloadState === "downloading" || downloadState === "success";
                  const label =
                    downloadState === "downloading"
                      ? "Downloading"
                      : downloadState === "success"
                        ? "Saved"
                        : offlineSummary && !staleDownload
                          ? "Downloaded"
                          : staleDownload
                            ? "Update Download"
                            : "Download Lesson";
                  return (
                    <TouchableOpacity
                      disabled={isBusy || (Boolean(offlineSummary) && !staleDownload)}
                      onPress={() => downloadLesson(selectedLessonDetail)}
                      activeOpacity={0.85}
                      style={{
                        marginTop: 10,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: offlineSummary && !staleDownload ? "rgba(34,197,94,0.28)" : ui.borderStrong,
                        backgroundColor: offlineSummary && !staleDownload ? "rgba(34,197,94,0.12)" : ui.primarySoft,
                        paddingHorizontal: 16,
                        paddingVertical: 13,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        opacity: downloadState === "downloading" ? 0.9 : 1,
                      }}
                    >
                      <LessonDownloadStatusIcon state={downloadState} downloaded={Boolean(offlineSummary)} stale={staleDownload} ui={ui} />
                      <Text style={{ color: offlineSummary && !staleDownload ? ui.success : ui.primary, fontSize: 14, fontWeight: "900" }}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
              </GlassCard>
            ) : null}

            {selectedLessonDetail.audio_url ? (
              <GlassCard style={{ borderRadius: 18, backgroundColor: ui.card, marginBottom: 12 }} padding={14} variant="strong">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 11 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="headset-outline" size={18} color={ui.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: ui.primary, fontSize: 11, fontWeight: "900", letterSpacing: 0.7 }}>LISTEN FIRST</Text>
                    <Text style={{ color: ui.muted, fontSize: 12, marginTop: 2 }}>Hear your teacher's lesson audio before you practise.</Text>
                  </View>
                </View>
                <LessonAudioPlayer
                  uri={selectedLessonDetail.audio_url}
                  title={selectedLessonDetail.audio_name || `${selectedLessonDetail.name} audio`}
                />
              </GlassCard>
            ) : null}

            {/*
            {false && selectedLessonDetail?.document_url ? (
              <GlassCard style={{ borderRadius: 16, backgroundColor: ui.card, marginBottom: 12 }} padding={12}>
                <TouchableOpacity
                  onPress={() => Linking.openURL(selectedLessonDetail?.document_url ?? "").catch(() => {})}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  <Text style={{ color: ui.primary, fontWeight: "700", fontSize: 16 }} numberOfLines={1}>
                    📄 {selectedLessonDetail.document_name || "Lesson document"}
                  </Text>
                  <Text style={{ color: ui.primary, fontSize: 20 }}>-></Text>
                </TouchableOpacity>
              </GlassCard>
            ) : null}
            */}

            {savedResume && savedResume.lessonId === selectedLessonDetail?.id ? (
              <TouchableOpacity onPress={resumeSession} activeOpacity={0.85} style={{ marginBottom: 14 }}>
                <GlassCard style={{ borderRadius: 16, backgroundColor: ui.primarySoft, borderWidth: 1, borderColor: ui.primary }} padding={14}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: ui.primary, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="play" size={20} color={ui.primaryText} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: ui.primary, letterSpacing: 1, marginBottom: 2 }}>CONTINUE WHERE YOU LEFT OFF</Text>
                      <Text style={{ fontSize: 15, fontWeight: "800", color: ui.text }}>Word {savedResume.idx + 1} of {savedResume.activeWords.length}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={ui.primary} />
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ) : null}

            <GlassCard style={{ borderRadius: 18, backgroundColor: ui.card, marginBottom: 14 }} padding={12}>
              <Text style={{ color: ui.text, textAlign: "center", fontWeight: "600", marginBottom: 10 }}>Choose how you want to study</Text>
              <View style={{ flexDirection: "row", borderWidth: 1, borderColor: ui.border, borderRadius: 12, padding: 4, marginBottom: 12 }}>
                {[
                  { key: "typing" as StudySessionMode, label: "Typing" },
                  { key: "multiple-choice" as StudySessionMode, label: "Choice" },
                  { key: "listening" as StudySessionMode, label: "Listen" },
                  { key: "image" as StudySessionMode, label: "Images" },
                ].map((mode) => {
                  const selected = lessonDetailMode === mode.key;
                  const unavailable = mode.key === "listening"
                    ? !selectedLessonWords.some((word) => word.practiceKind !== "prompt-builder" && !!word.audioUrl)
                    : mode.key === "image"
                      ? !selectedLessonWords.some((word) => word.practiceKind !== "prompt-builder" && !!word.imageUrl)
                      : false;
                  return (
                    <TouchableOpacity
                      key={mode.key}
                      disabled={unavailable}
                      onPress={() => {
                        setLessonDetailMode(mode.key);
                        if (selectedLessonDetail) {
                          AsyncStorage.setItem(`eluency_lesson_mode_${selectedLessonDetail.id}`, mode.key).catch(() => {});
                        }
                      }}
                      style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: selected ? ui.primarySoft : "transparent", opacity: unavailable ? 0.35 : 1 }}
                    >
                      <Text style={{ fontWeight: "700", color: selected ? ui.primary : ui.muted, fontSize: 13 }}>{mode.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ color: ui.text, textAlign: "center", fontWeight: "600", marginBottom: 10 }}>Choose a direction to begin the lesson</Text>
              {selectedLessonWords.some((word) => word.practiceKind === "prompt-builder") ? (
                <Text style={{ color: ui.muted, textAlign: "center", fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                  Prompt Builder questions always use the answer set by your teacher, whichever vocabulary direction you choose.
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() =>
                    startSession("practice", lessonDetailMode, "pt-en", shuffle(selectedLessonWords), {
                      id: selectedLessonDetail.id,
                      name: selectedLessonDetail.name,
                    })
                  }
                  style={{ flex: 1, borderRadius: 10, backgroundColor: getLanguageColor(lessonDetailDisplayMeta.shortA, theme.isDark).solid, paddingVertical: 10, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                    {labelDirectionForward(selectedLessonDetail.language_pair, selectedLessonDetail.language)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    startSession("practice", lessonDetailMode, "en-pt", shuffle(selectedLessonWords), {
                      id: selectedLessonDetail.id,
                      name: selectedLessonDetail.name,
                    })
                  }
                  style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: getLanguageColor(lessonDetailDisplayMeta.shortB, theme.isDark).border, backgroundColor: getLanguageColor(lessonDetailDisplayMeta.shortB, theme.isDark).soft, paddingVertical: 10, alignItems: "center" }}
                >
                  <Text style={{ color: getLanguageColor(lessonDetailDisplayMeta.shortB, theme.isDark).text, fontWeight: "700", fontSize: 14 }}>
                    {labelDirectionReverse(selectedLessonDetail.language_pair, selectedLessonDetail.language)}
                  </Text>
                </TouchableOpacity>
              </View>
            </GlassCard>

            <Text style={{ color: ui.muted, fontSize: 14, fontWeight: "800", marginBottom: 8 }}>LESSON CONTENT ({selectedLessonWords.length})</Text>
            {(Array.isArray(selectedLessonDetail.words) ? selectedLessonDetail.words : []).map((word, index) => {
              if (word.rowType === "conjugation") {
                const includedConjugations = (word.conjugations ?? []).filter((entry) => entry.included !== false);
                if (includedConjugations.length === 0) return null;
                return (
                  <GlassCard key={`${selectedLessonDetail.id}-word-${index}`} style={{ borderRadius: 16, backgroundColor: ui.card, marginBottom: 10 }} padding={12}>
                    <Text style={{ color: ui.primary, fontWeight: "800", fontSize: 11, letterSpacing: 0.6, marginBottom: 6 }}>CONJUGATION</Text>
                    <Text style={{ color: ui.text, fontWeight: "800", fontSize: 18 }}>{word.infinitive?.trim() || "-"}</Text>
                    {includedConjugations.map((c, ci) => (
                      <View key={`conj-${selectedLessonDetail.id}-${index}-${ci}`} style={{ flexDirection: "row", marginTop: 10, gap: 10, alignItems: "flex-start" }}>
                        <Text style={{ color: ui.muted, fontSize: 13, fontWeight: "700", width: 118 }}>{c.pronoun || "-"}</Text>
                        <Text style={{ color: ui.text, fontSize: 15, flex: 1 }}>{(c.form_a || c.form_b || "").trim() || "-"}</Text>
                      </View>
                    ))}
                  </GlassCard>
                );
              }
              if (word.rowType === "preposition" || word.rowType === "prompt_builder") {
                const activity = normalizePromptBuilderActivity(word);
                return (
                  <GlassCard key={`${selectedLessonDetail.id}-word-${index}`} style={{ borderRadius: 16, backgroundColor: ui.card, marginBottom: 10 }} padding={12}>
                    <Text style={{ color: ui.primary, fontWeight: "800", fontSize: 11, letterSpacing: 0.6, marginBottom: 10 }}>BUILD THE ANSWER</Text>
                    <View style={{ gap: 14 }}>
                      {activity.prompts.map((item, promptIndex) => (
                        <PromptBuilderFormulaView key={item.id} item={item} instruction={promptIndex === 0 ? activity.instruction : undefined} ui={ui} compact revealAnswer />
                      ))}
                    </View>
                  </GlassCard>
                );
              }
              const row = lessonListRowTerms(word, selectedLessonDetail.language_pair);
              return (
                <GlassCard key={`${selectedLessonDetail.id}-word-${index}`} style={{ borderRadius: 16, backgroundColor: ui.card, marginBottom: 10 }} padding={12}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {(word.image_url || word.img) ? (
                      <RemoteLessonImage
                        uri={
                          cacheBustAssetUrl(word.image_url || word.img, selectedLessonDetail.updated_at, assetRefreshEpoch) ??
                          (word.image_url || word.img || "")
                        }
                        style={{ width: 54, height: 54, borderRadius: 10, backgroundColor: ui.borderSoft }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{ width: 54, height: 54, borderRadius: 10, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 20 }}>📘</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ flex: 1, color: ui.text, fontWeight: "800", fontSize: 18 }}>
                          {lessonDetailDisplayMeta.shortA}  {row.termA || "-"}
                        </Text>
                        <TouchableOpacity
                          onPress={() => playStudyTextAudio(row.termA || "", "a", `${selectedLessonDetail.id}:${index}:term-a`).catch(() => {})}
                          disabled={studyAudioLoadingKey !== null}
                          accessibilityRole="button"
                          accessibilityLabel={studyAudioLoadingKey === `${selectedLessonDetail.id}:${index}:term-a` ? "Loading pronunciation" : `Play ${lessonDetailDisplayMeta.shortA} pronunciation`}
                          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}
                        >
                          {studyAudioLoadingKey === `${selectedLessonDetail.id}:${index}:term-a` ? (
                            <VoiceLoadingIcon size={15} color={ui.primary} />
                          ) : (
                            <Ionicons name="volume-medium-outline" size={15} color={ui.primary} />
                          )}
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                        <Text style={{ flex: 1, color: ui.muted, fontSize: 16 }}>
                          {lessonDetailDisplayMeta.shortB}  {row.termB || "-"}
                        </Text>
                        <TouchableOpacity
                          onPress={() => playStudyTextAudio(row.termB || "", "b", `${selectedLessonDetail.id}:${index}:term-b`).catch(() => {})}
                          disabled={studyAudioLoadingKey !== null}
                          accessibilityRole="button"
                          accessibilityLabel={studyAudioLoadingKey === `${selectedLessonDetail.id}:${index}:term-b` ? "Loading pronunciation" : `Play ${lessonDetailDisplayMeta.shortB} pronunciation`}
                          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}
                        >
                          {studyAudioLoadingKey === `${selectedLessonDetail.id}:${index}:term-b` ? (
                            <VoiceLoadingIcon size={15} color={ui.muted} />
                          ) : (
                            <Ionicons name="volume-medium-outline" size={15} color={ui.muted} />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  {(row.ctxA || row.ctxB) ? (
                    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: ui.borderSoft, paddingTop: 10 }}>
                      {row.ctxA ? (
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                          <Text style={{ flex: 1, color: ui.text, fontSize: 14 }}>
                            {lessonDetailDisplayMeta.shortA}  {row.ctxA}
                          </Text>
                          <TouchableOpacity
                            onPress={() => playStudyTextAudio(row.ctxA || "", "a", `${selectedLessonDetail.id}:${index}:context-a`).catch(() => {})}
                            disabled={studyAudioLoadingKey !== null}
                            accessibilityRole="button"
                            accessibilityLabel={studyAudioLoadingKey === `${selectedLessonDetail.id}:${index}:context-a` ? "Loading example audio" : `Play ${lessonDetailDisplayMeta.shortA} example`}
                            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}
                          >
                            {studyAudioLoadingKey === `${selectedLessonDetail.id}:${index}:context-a` ? (
                              <VoiceLoadingIcon size={14} color={ui.primary} />
                            ) : (
                              <Ionicons name="volume-medium-outline" size={14} color={ui.primary} />
                            )}
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      {row.ctxB ? (
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                          <Text style={{ flex: 1, color: ui.muted, fontSize: 14 }}>
                            {lessonDetailDisplayMeta.shortB}  {row.ctxB}
                          </Text>
                          <TouchableOpacity
                            onPress={() => playStudyTextAudio(row.ctxB || "", "b", `${selectedLessonDetail.id}:${index}:context-b`).catch(() => {})}
                            disabled={studyAudioLoadingKey !== null}
                            accessibilityRole="button"
                            accessibilityLabel={studyAudioLoadingKey === `${selectedLessonDetail.id}:${index}:context-b` ? "Loading example audio" : `Play ${lessonDetailDisplayMeta.shortB} example`}
                            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}
                          >
                            {studyAudioLoadingKey === `${selectedLessonDetail.id}:${index}:context-b` ? (
                              <VoiceLoadingIcon size={14} color={ui.muted} />
                            ) : (
                              <Ionicons name="volume-medium-outline" size={14} color={ui.muted} />
                            )}
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </GlassCard>
              );
            })}
            </ScreenReveal>
          </ScrollView>
        </>
      ) : null}

      {runtimeScreen === "test-detail" && selectedTestDetail ? (
        <>
          <DetailTopBar
            ui={ui}
            topInset={insets.top}
            title="Test"
            onBack={() => { setRuntimeScreen("dashboard"); setActiveTab("tests"); }}
            onSettings={() => openWorkspaceTab("settings")}
            onClassrooms={() => openWorkspaceTab("classrooms")}
          />

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: Math.max(insets.top, 8) + 62, paddingBottom: 108 }}
            refreshControl={<RefreshControl refreshing={catalogRefreshing} onRefresh={() => onCatalogPullRefresh()} tintColor={ui.primary} colors={[ui.primary]} />}
          >
            <ScreenReveal
              key={`test-detail-${selectedTestDetail.test.id}`}
              delay={18}
              distance={18}
              scaleFrom={0.992}
            >
            <GlassCard style={{ borderRadius: 18, backgroundColor: ui.card, marginBottom: 12 }} padding={14}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {selectedTestDetail.test.cover_image_url ? (
                  <RemoteLessonImage
                    uri={
                      cacheBustAssetUrl(selectedTestDetail.test.cover_image_url, selectedTestDetail.test.updated_at, assetRefreshEpoch) ??
                      selectedTestDetail.test.cover_image_url
                    }
                    style={{ width: 66, height: 66, borderRadius: 14, backgroundColor: ui.borderSoft }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ width: 66, height: 66, borderRadius: 14, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 24 }}>📝</Text>
                  </View>
                )}
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ color: ui.text, fontWeight: "800", fontSize: 24 }}>
                    {selectedTestDetail.test.name}
                  </Text>
                  <Text style={{ color: ui.muted, marginTop: 4, fontSize: 14 }}>
                    {safeLength(selectedTestDetail.test.words)} questions - No hints
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {selectedTestAssignmentProgress ? (
                      <AssignmentStatusPill progress={selectedTestAssignmentProgress} ui={ui} />
                    ) : null}
                    {selectedTestDetail.test.teacher_name ? (
                      <View style={{ borderRadius: 999, backgroundColor: ui.borderSoft, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ color: ui.muted, fontSize: 10, fontWeight: "800" }}>
                          {selectedTestDetail.test.teacher_name}
                        </Text>
                      </View>
                    ) : null}
                    {selectedTestDetail.test.time_limit_minutes ? (
                      <View style={{ borderRadius: 999, backgroundColor: ui.primarySoft, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ color: ui.primary, fontSize: 10, fontWeight: "800" }}>
                          {selectedTestDetail.test.time_limit_minutes} min limit
                        </Text>
                      </View>
                    ) : null}
                    <View style={{ borderRadius: 999, backgroundColor: ui.borderSoft, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: ui.muted, fontSize: 10, fontWeight: "800" }}>
                        {selectedTestDetail.test.attempts_remaining == null
                          ? "Unlimited attempts"
                          : `${selectedTestDetail.test.attempts_remaining} attempt${selectedTestDetail.test.attempts_remaining === 1 ? "" : "s"} left`}
                      </Text>
                    </View>
                    <View style={{ borderRadius: 999, backgroundColor: ui.primarySoft, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: ui.primary, fontSize: 10, fontWeight: "800" }}>
                        {selectedTestDetail.test.passing_percentage ?? 80}% to pass
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </GlassCard>

            <AssignmentInformationCard
              assignment={selectedTestDetail.test.assignment}
              teacherName={selectedTestDetail.test.teacher_name || teacherName}
              ui={ui}
            />

            <GlassCard style={{ borderRadius: 16, marginBottom: 12 }} padding={13} variant="strong">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 }}>
                  <Ionicons name="information-circle-outline" size={19} color={ui.primary} />
                  <Text style={{ color: ui.text, fontSize: 14, fontWeight: "900" }}>
                    {selectedTestCanStart ? "Before you begin" : "Submission status"}
                  </Text>
                </View>
                <View style={{ gap: 7 }}>
                  {(selectedTestCanStart
                    ? [
                        "Your answers are saved as you move through the questions.",
                        "You can review and change responses before submitting.",
                        selectedTestDetail.test.time_limit_minutes
                          ? "The timer starts when you begin and submits automatically at zero."
                          : "Your teacher will receive the server-verified result after submission.",
                      ]
                    : [
                        selectedTestAssignmentProgress?.status === "awaiting-review"
                          ? "Your answers are with your teacher. Your final score will appear after review."
                          : selectedTestAssignmentProgress?.status === "completed"
                            ? "This test is complete. Your verified result is ready to review."
                            : "No further attempt is currently available for this test.",
                        selectedTestLatestResult
                          ? "Open the submission to review its status, feedback, and available answers."
                          : "Refresh the Tests tab if your latest result is not visible yet.",
                      ]).map((instruction) => (
                    <View key={instruction} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                      <Ionicons name="checkmark-circle-outline" size={15} color={ui.success} style={{ marginTop: 1 }} />
                      <Text style={{ color: ui.muted, fontSize: 12, lineHeight: 17, flex: 1 }}>{instruction}</Text>
                    </View>
                  ))}
                </View>
            </GlassCard>

            <GlassCard style={{ borderRadius: 16, backgroundColor: ui.card, marginBottom: 14 }} padding={12}>
              <TouchableOpacity
                disabled={
                  testStarting
                  || (!selectedTestCanStart && !selectedTestLatestResult)
                }
                onPress={() => {
                  if (selectedTestCanStart) {
                    beginAssignedTest(selectedTestDetail.test).catch(() => {});
                  } else if (selectedTestLatestResult) {
                    openTestHistoryRecord(selectedTestLatestResult);
                  }
                }}
                accessibilityRole="button"
                accessibilityState={{
                  disabled:
                    testStarting
                    || (!selectedTestCanStart && !selectedTestLatestResult),
                  busy: testStarting,
                }}
                style={{
                  borderRadius: 14,
                  backgroundColor:
                    !selectedTestCanStart && !selectedTestLatestResult
                      ? ui.border
                      : ui.primary,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity:
                    testStarting
                    || (!selectedTestCanStart && !selectedTestLatestResult)
                      ? 0.72
                      : 1,
                }}
              >
                {testStarting ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                    <ActivityIndicator color={ui.primaryText} size="small" />
                    <Text style={{ color: ui.primaryText, fontWeight: "800", fontSize: 17 }}>
                      Preparing secure test...
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: !selectedTestCanStart && !selectedTestLatestResult ? ui.muted : ui.primaryText, fontWeight: "800", fontSize: 20 }}>
                    {selectedTestAssignmentProgress?.ctaLabel ?? "Start test"}
                  </Text>
                )}
              </TouchableOpacity>
            </GlassCard>

            <Text style={{ color: ui.muted, fontSize: 14, fontWeight: "800", marginBottom: 8 }}>
              STUDY MATERIAL ({selectedTestDetail.test.reviewVocabulary?.length ?? 0})
            </Text>
            {((selectedTestDetail.test.reviewVocabulary ?? []) as any[]).map((word, index) => (
              <GlassCard key={`study-${index}`} style={{ borderRadius: 16, backgroundColor: ui.card, marginBottom: 10 }} padding={12}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {(word.image_url || word.img) ? (
                    <RemoteLessonImage
                      uri={
                        cacheBustAssetUrl(
                          word.image_url || word.img,
                          selectedTestDetail.test.updated_at,
                          assetRefreshEpoch
                        ) ?? (word.image_url || word.img || "")
                      }
                      style={{ width: 54, height: 54, borderRadius: 10, backgroundColor: ui.borderSoft }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{ width: 54, height: 54, borderRadius: 10, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 20 }}>📘</Text>
                    </View>
                  )}
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={{ color: ui.text, fontWeight: "800", fontSize: 20 }}>
                              {testDetailDisplayMeta.shortA}  {word.pt || "-"}
                            </Text>
                            <Text style={{ color: ui.muted, fontSize: 18, marginTop: 2 }}>
                              {testDetailDisplayMeta.shortB}  {word.en || "-"}
                            </Text>
                          </View>
                        </View>
                        {(word.sp || word.se) ? (
                          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: ui.borderSoft, paddingTop: 10 }}>
                            {word.sp ? (
                              <Text style={{ color: ui.text, fontSize: 14, marginBottom: 4 }}>
                                {testDetailDisplayMeta.shortA}  {word.sp}
                              </Text>
                            ) : null}
                            {word.se ? (
                              <Text style={{ color: ui.muted, fontSize: 14 }}>
                                {testDetailDisplayMeta.shortB}  {word.se}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                      </GlassCard>
                    ))}
            </ScreenReveal>
          </ScrollView>
        </>
      ) : null}

      {runtimeScreen === "test-review" && sessionType === "test" ? (
        <TestReviewPanel
          theme={theme}
          topInset={insets.top}
          bottomInset={insets.bottom}
          title={sessionContext.name || "Assigned test"}
          items={testReviewItems}
          timeRemainingSeconds={testTimeRemainingSeconds}
          submitting={testSubmitting}
          submissionError={testSubmissionError}
          onExit={requestExitCurrentSession}
          onSettings={() => openWorkspaceTab("settings")}
          onClassrooms={() => openWorkspaceTab("classrooms")}
          onEdit={openTestQuestionForEditing}
          onBackToQuestions={returnToTestQuestions}
          onSubmit={confirmTestSubmission}
        />
      ) : null}

      {runtimeScreen === "session" && current ? (
        <View style={{ flex: 1 }}>
          <StudySessionHeader
            colors={ui}
            topInset={insets.top}
            title={
              activeFocusModeRef.current
                ? sessionContext.name || "Teacher follow-up"
                : current.lessonName || current.testName || "Session"
            }
            subtitle={
              activeFocusModeRef.current
                ? `Step ${REQUIRED_FOLLOW_UP_MODES.indexOf(activeFocusModeRef.current) + 1} of 3 · ${sessionHeaderLabel}`
                : sessionHeaderLabel
            }
            streak={sessionStreak}
            index={idx}
            total={activeWords.length}
            timeRemainingSeconds={sessionType === "test" ? testTimeRemainingSeconds : null}
            assignmentLabel={activeSessionAssignment ? getAssignmentExpectationLabel(activeSessionAssignment) : null}
            teacherInstructions={activeSessionAssignment?.instructions}
            teacherName={activeSessionAssignment ? teacherName : null}
            learningObjective={activeSessionLesson?.learning_objectives?.[0] ?? null}
            languageDirection={activeSessionAssignment || activeSessionLesson ? activeSessionLanguageDirection : null}
            onExit={requestExitCurrentSession}
            onSettings={() => openWorkspaceTab("settings")}
            onClassrooms={() => openWorkspaceTab("classrooms")}
            navigationDisabled={testSubmitting}
          />
          

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              <ScreenReveal key={`session-${sessionType}-${currentSessionMode}-${current.id}-${idx}`} delay={10} distance={14} scaleFrom={0.992} duration={300}>
              <GlassCard style={{ borderRadius: 22, backgroundColor: ui.card }} padding={14}>
                {current.imageUrl && !showSessionIllustration ? (
                  <View style={{ alignSelf: "center", marginBottom: 10 }}>
                    <RemoteLessonImage uri={current.imageUrl} style={{ width: 88, height: 88, borderRadius: 16 }} resizeMode="cover" />
                  </View>
                ) : null}
                {(currentSessionMode !== "listening" || current.imageUrl) && showSessionIllustration ? (
                  <View style={{ alignItems: "center", marginBottom: 10 }}>
                    <View
                      style={{
                        width: currentSessionMode === "image" || !!current.imageUrl ? 198 : 135,
                        height: currentSessionMode === "image" || !!current.imageUrl ? 198 : 135,
                        borderRadius: currentSessionMode === "image" || !!current.imageUrl ? 25 : 20,
                        backgroundColor: ui.borderSoft,
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {current.imageUrl ? (
                        <RemoteLessonImage uri={current.imageUrl} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                      ) : (
                        <Text style={{ fontSize: currentSessionMode === "image" || !!current.imageUrl ? 54 : 43 }}>
                          {current.sourceType === "test" ? "📝" : "📚"}
                        </Text>
                      )}
                    </View>
                  </View>
                ) : null}

                {isConjugationTable && current.conjugationTable ? (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 14, paddingHorizontal: 4 }}>
                      <Text
                        style={{
                          flexShrink: 1,
                          fontSize: 32,
                          color: ui.text,
                          fontWeight: "900",
                          lineHeight: 38,
                          textAlign: "center",
                        }}
                      >
                        {titleCaseVerb(current.conjugationTable.infinitive)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => playPromptAudio().catch(() => {})}
                        disabled={ttsLoading}
                        accessibilityRole="button"
                        accessibilityLabel={ttsLoading ? "Loading pronunciation" : "Play pronunciation"}
                        style={{
                          marginLeft: 8,
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          backgroundColor: ui.borderSoft,
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {ttsLoading ? <VoiceLoadingIcon size={16} color={ui.muted} /> : <Ionicons name="volume-medium-outline" size={16} color={ui.muted} />}
                      </TouchableOpacity>
                    </View>
                    <View style={{ gap: 10 }}>
                      {current.conjugationTable.entries.map((entry, ri) => {
                        const fb = conjugationRowFeedback[ri];
                        const highlight =
                          conjugationRowFeedback.length > 0 ? (fb === true ? ui.success : fb === false ? ui.danger : ui.border) : ui.border;
                        return (
                          <View key={`${entry.pronoun}-${ri}`} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <Text style={{ width: 108, color: ui.text, fontWeight: "800", fontSize: 13 }} numberOfLines={2}>
                              {entry.pronoun.toUpperCase()}
                            </Text>
                            <TextInput
                              value={conjugationInputs[ri] ?? ""}
                              onChangeText={(t) => {
                                setConjugationInputs((prev) => {
                                  const next = [...prev];
                                  next[ri] = t;
                                  return next;
                                });
                              }}
                              placeholder="..."
                              placeholderTextColor="#98A0B2"
                              autoCapitalize="none"
                              editable={conjugationRowFeedback.length === 0}
                              style={{
                                flex: 1,
                                borderWidth: 1,
                                borderColor: highlight,
                                borderRadius: 10,
                                backgroundColor: ui.borderSoft,
                                color: ui.text,
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                fontSize: 15,
                              }}
                            />
                          </View>
                        );
                      })}
                    </View>
                    <TouchableOpacity
                      onPress={() => submitConjugationTable().catch(() => {})}
                      disabled={conjugationRowFeedback.length > 0}
                      style={{
                        marginTop: 16,
                        borderRadius: 12,
                        backgroundColor: ui.primary,
                        paddingVertical: 14,
                        alignItems: "center",
                        flexDirection: "row",
                        justifyContent: "center",
                        gap: 8,
                        opacity: conjugationRowFeedback.length > 0 ? 0.55 : 1,
                      }}
                    >
                      <Ionicons name="return-down-forward-outline" size={18} color={ui.primaryText} />
                      <Text style={{ color: ui.primaryText, fontSize: 16, fontWeight: "800" }}>Submit</Text>
                    </TouchableOpacity>
                  </>
                ) : isConjugationDrill ? (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 12, paddingHorizontal: 4 }}>
                      <Text
                        style={{
                          flexShrink: 1,
                          fontSize: 32,
                          color: ui.text,
                          fontWeight: "900",
                          lineHeight: 38,
                          textAlign: "center",
                        }}
                      >
                        {titleCaseVerb(current.conjugationInfinitive || prompt || "-")}
                      </Text>
                      <TouchableOpacity
                        onPress={() => playPromptAudio().catch(() => {})}
                        disabled={ttsLoading}
                        accessibilityRole="button"
                        accessibilityLabel={ttsLoading ? "Loading pronunciation" : "Play pronunciation"}
                        style={{
                          marginLeft: 8,
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          backgroundColor: ui.borderSoft,
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {ttsLoading ? <VoiceLoadingIcon size={16} color={ui.muted} /> : <Ionicons name="volume-medium-outline" size={16} color={ui.muted} />}
                      </TouchableOpacity>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        marginBottom: 6,
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      <Text style={{ color: ui.primary, fontWeight: "900", fontSize: 22 }}>
                        {(current.conjugationPronoun ?? "").toUpperCase()}
                      </Text>
                      <View
                        style={{
                          minWidth: 140,
                          height: 3,
                          backgroundColor: ui.text,
                          marginBottom: 5,
                          borderRadius: 2,
                        }}
                      />
                    </View>
                  </>
                ) : isPromptBuilder && current.promptBuilderItem ? (
                  <View style={{ marginBottom: 12 }}>
                    <PromptBuilderFormulaView
                      item={current.promptBuilderItem}
                      instruction={current.promptBuilderInstruction}
                      ui={ui}
                    />
                  </View>
                ) : hidePromptHeaderForImageMode ? null : (
                  <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 10, paddingHorizontal: 4 }}>
                    <Text
                      style={{
                        flexShrink: 1,
                        fontSize: 30,
                        color: ui.text,
                        fontWeight: "900",
                        lineHeight: 36,
                        textAlign: "center",
                      }}
                    >
                      {currentSessionMode === "listening" ? "Tap to listen" : prompt}
                    </Text>
                    <TouchableOpacity
                      onPress={() => playPromptAudio().catch(() => {})}
                      disabled={ttsLoading}
                      accessibilityRole="button"
                      accessibilityLabel={ttsLoading ? "Loading pronunciation" : "Play pronunciation"}
                      style={{ marginLeft: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                    >
                      {ttsLoading ? <VoiceLoadingIcon size={16} color={ui.muted} /> : <Ionicons name="volume-medium-outline" size={16} color={ui.muted} />}
                    </TouchableOpacity>
                  </View>
                )}

                {sessionType !== "test" && !isConjugationTable && !isConjugationDrill && !isPromptBuilder ? (
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <TouchableOpacity
                      onPress={() => setShowHint((v) => !v)}
                      style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: ui.border, backgroundColor: ui.card, paddingVertical: 11, alignItems: "center" }}
                    >
                      <Text style={{ color: ui.muted, fontWeight: "600", fontSize: 13 }}>{showHint ? "Hide hint" : "Show hint"}</Text>
                    </TouchableOpacity>
                    {canUseAnswerPad ? (
                      <TouchableOpacity
                        onPress={() => {
                          if (useAnswerPad) {
                            setUseNativeAnswerKeyboard(true);
                            return;
                          }
                          Keyboard.dismiss();
                          setUseNativeAnswerKeyboard(false);
                        }}
                        style={{
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: ui.border,
                          backgroundColor: ui.card,
                          paddingVertical: 11,
                          paddingHorizontal: 14,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: ui.primary, fontWeight: "700", fontSize: 13 }}>{useAnswerPad ? "Keyboard" : "Answer pad"}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}

                {showHint && sentenceHint ? (
                  <ScreenReveal key="session-hint" distance={8} scaleFrom={0.992} duration={240} style={{ marginTop: 10 }}>
                  <View style={{ borderRadius: 10, backgroundColor: ui.primarySoft, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Text style={{ flex: 1, color: ui.text, fontSize: 13 }}>{sentenceHint}</Text>
                    <TouchableOpacity
                      onPress={() => playStudyTextAudio(sentenceHint, direction === "pt-en" ? "b" : "a", `session:${current.id}:hint`).catch(() => {})}
                      disabled={studyAudioLoadingKey !== null}
                      accessibilityRole="button"
                      accessibilityLabel={studyAudioLoadingKey === `session:${current.id}:hint` ? "Loading hint audio" : "Play hint audio"}
                      style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ui.card, alignItems: "center", justifyContent: "center" }}
                    >
                      {studyAudioLoadingKey === `session:${current.id}:hint` ? (
                        <VoiceLoadingIcon size={14} color={ui.primary} />
                      ) : (
                        <Ionicons name="volume-medium-outline" size={14} color={ui.primary} />
                      )}
                    </TouchableOpacity>
                  </View>
                  </ScreenReveal>
                ) : null}

                {/* Same flow as typing/listening: prompt (+ hint) first, then answer area - MCQ options stay high in the card. */}
                {showMcq ? (
                  <View style={{ gap: 8, marginTop: sessionType === "test" ? 12 : showHint && sentenceHint ? 12 : isConjugationDrill ? 14 : 10 }}>
                    {mcqChoiceOptions && mcqChoiceOptions.length >= 2
                      ? mcqChoiceOptions.map((opt) => renderMcqChoice(opt.text, `option:${opt.id}`, opt.id))
                      : mcqChoiceTexts.length >= 2
                        ? mcqChoiceTexts.map((choice, ci) => renderMcqChoice(choice, `choice:${ci}:${choice}`))
                        : (
                          <PreparingChoicesPulse color={ui.borderSoft} />
                        )}
                  </View>
                ) : null}

                {showMcq && feedback ? (
                  <View style={{ marginTop: 10 }}>
                    <FeedbackPanel ui={ui} feedback={feedback} />
                  </View>
                ) : null}

                {showInfinitiveNote ? (
                  <View style={{ marginTop: 10, borderRadius: 10, backgroundColor: ui.primarySoft, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Text style={{ flex: 1, color: ui.text, fontSize: 13 }}>Infinitives in English often use to + verb.</Text>
                    <TouchableOpacity
                      onPress={() => playStudyTextAudio("Infinitives in English often use to plus verb.", "b", `session:${current.id}:infinitive-note`).catch(() => {})}
                      disabled={studyAudioLoadingKey !== null}
                      accessibilityRole="button"
                      accessibilityLabel={studyAudioLoadingKey === `session:${current.id}:infinitive-note` ? "Loading note audio" : "Play note audio"}
                      style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ui.card, alignItems: "center", justifyContent: "center" }}
                    >
                      {studyAudioLoadingKey === `session:${current.id}:infinitive-note` ? (
                        <VoiceLoadingIcon size={14} color={ui.primary} />
                      ) : (
                        <Ionicons name="volume-medium-outline" size={14} color={ui.primary} />
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}

                {geminiCorrection ? (
                  <View style={{ marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: ui.border, backgroundColor: ui.card, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Text style={{ flex: 1, color: ui.text, fontSize: 13 }}>{geminiCorrection}</Text>
                    <TouchableOpacity
                      onPress={() => playStudyTextAudio(geminiCorrection, "b", `session:${current.id}:correction`).catch(() => {})}
                      disabled={studyAudioLoadingKey !== null}
                      accessibilityRole="button"
                      accessibilityLabel={studyAudioLoadingKey === `session:${current.id}:correction` ? "Loading correction audio" : "Play correction audio"}
                      style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}
                    >
                      {studyAudioLoadingKey === `session:${current.id}:correction` ? (
                        <VoiceLoadingIcon size={14} color={ui.primary} />
                      ) : (
                        <Ionicons name="volume-medium-outline" size={14} color={ui.primary} />
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}
              </GlassCard>
              </ScreenReveal>
            </ScrollView>

            <SessionFooter
              ui={ui}
              bottomInset={insets.bottom}
              showInput={!showMcq && !isConjugationTable}
              input={input}
              onInputChange={setInput}
              useAnswerPad={useAnswerPad}
              answerPadTarget={expected}
              answerPadDisabled={(!!feedback && !needsRetype) || isResolvingAnswer}
              needsRetype={needsRetype}
              feedback={!showMcq && feedback?.state !== "correct" ? feedback : null}
              showSubmit={!showMcq && !isConjugationTable}
              submitDisabled={!input.trim() || (!!feedback && !needsRetype) || isResolvingAnswer}
              onSubmit={() => answerCurrent().catch(() => {})}
              showSkip={!feedback && !isResolvingAnswer && (currentSessionMode !== "listening" || sessionType === "test")}
              skipFullWidth={showMcq || isConjugationTable}
              onSkip={() => {
                if (feedback || isResolvingAnswer || finishingSessionRef.current) return;
                const isGradedTest = sessionType === "test";
                if (isGradedTest) {
                  setFeedback({ state: "recorded", text: "Question skipped" });
                  recordSessionIssue({
                    id: current.id,
                    questionIndex: current.questionIndex,
                    prompt,
                    expected: "",
                    answer: "",
                    kind: "skip",
                  });
                } else {
                  applyProgress({ ...progress, wordStats: updateWordStats(progress.wordStats, current.id, false) });
                  triggerHaptic("error").catch(() => {});
                  setMistakeWordIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
                  setFeedback({ state: "wrong", text: `Expected: ${feedbackExpected}` });
                  recordSessionIssue({ id: current.id, prompt, expected: feedbackExpected, kind: "skip" });
                }
                const skipDelay = isGradedTest ? 500 : current.practiceKind === "conjugation-table" ? 2000 : 900;
                if (isGradedTest) {
                  scheduleAnswerResolution(advanceAfterRecordedTestAnswer, skipDelay);
                  return;
                }
                scheduleAnswerResolution(() => {
                  setFeedback(null);
                  setInput("");
                  setShowHint(false);
                  setNeedsRetype(false);
                  setShowInfinitiveNote(false);
                  setGeminiCorrection("");
                  setConjugationRowFeedback([]);
                  if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
                  else setIdx((v) => v + 1);
                }, skipDelay);
              }}
            />
            
          </KeyboardAvoidingView>
          {feedback?.state === "correct" && !showMcq ? (
            <CorrectAnswerCelebration key={`correct-${current.id}-${idx}`} ui={ui} />
          ) : null}
        </View>
      ) : null}

      {(runtimeScreen === "dashboard" || runtimeScreen === "lesson-detail" || runtimeScreen === "test-detail") ? (() => {
        const effectiveTab =
          runtimeScreen === "lesson-detail" ? "lessons" :
          runtimeScreen === "test-detail" ? "tests" :
          activeTab;

        const handleTabPress = (tabId: string) => {
          setActiveTab(tabId as BottomTab);
          setRuntimeScreen("dashboard");
        };

        const tabs = [
          { id: "home", icon: "home-outline", activeIcon: "home", label: "Home" },
          { id: "lessons", icon: "book-outline", activeIcon: "book", label: "Lessons" },
          { id: "__play__", icon: "play", label: "" },
          { id: "tests", icon: "clipboard-outline", activeIcon: "clipboard", label: "Tests" },
          { id: "classrooms", icon: "people-outline", activeIcon: "people", label: "Classroom" },
        ];

        return (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              overflow: "visible",
              backgroundColor: theme.colors.surface,
              borderTopWidth: 1,
              borderTopColor: ui.border,
              flexDirection: "row",
              alignItems: "center",
              height: 66 + Math.max(insets.bottom, 0),
              paddingTop: 3,
              paddingBottom: Math.max(insets.bottom, 0),
              paddingHorizontal: 8,
              shadowColor: "#000",
              shadowOpacity: uiIsDark ? 0.15 : 0.08,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: -3 },
              elevation: 7,
            }}
          >
              {tabs.map((tab) => {
                if (tab.id === "__play__") {
                  const playActive = effectiveTab === "practice";
                  const guideTarget = studentGuideVisible && studentGuideSection === "practice";
                  return (
                    <Animated.View
                      key="play"
                      style={{ flex: 1, height: 60, alignItems: "center", transform: [{ scale: guideTarget ? studentGuideMenuScale : 1 }] }}
                    >
                    <TouchableOpacity
                      onPress={() => handleTabPress("practice")}
                      accessibilityRole="button"
                      accessibilityLabel="Practice"
                      accessibilityState={{ selected: playActive }}
                      activeOpacity={0.85}
                      hitSlop={{ top: 18, bottom: 4, left: 6, right: 6 }}
                      style={{
                        width: "100%",
                        height: 60,
                        position: "relative",
                        alignItems: "center",
                      }}
                    >
                      <View style={{ position: "absolute", top: -12, width: 55, height: 55, borderRadius: 27.5, backgroundColor: ui.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: ui.primary, shadowOpacity: guideTarget ? 0.24 : 0.09, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
                        <Ionicons name="play" size={23} color={ui.primaryText} style={{ marginLeft: 2 }} />
                      </View>
                      <Text style={{ position: "absolute", bottom: 1, fontSize: 11.5, lineHeight: 15, color: playActive ? ui.primary : ui.muted, fontWeight: playActive ? "800" : "600" }}>Practice</Text>
                    </TouchableOpacity>
                    </Animated.View>
                  );
                }

                const active = effectiveTab === tab.id;
                const guideTarget = studentGuideVisible && studentGuideSection === tab.id;
                return (
                  <StudyTabMotion key={tab.id} active={active}>
                  <Animated.View
                    key={tab.id}
                    style={{ transform: [{ scale: guideTarget ? studentGuideMenuScale : 1 }] }}
                  >
                  <TouchableOpacity
                    onPress={() => handleTabPress(tab.id)}
                    accessibilityRole="button"
                    accessibilityLabel={tab.label}
                    accessibilityState={{ selected: active }}
                    activeOpacity={0.75}
                    style={{
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      height: 60,
                      paddingTop: 1,
                      paddingBottom: 1,
                      paddingHorizontal: 3,
                      borderRadius: 14,
                      backgroundColor: guideTarget ? `${ui.primary}1A` : "transparent",
                      borderWidth: guideTarget ? 2 : 0,
                      borderColor: guideTarget ? ui.primary : "transparent",
                      shadowColor: ui.primary,
                      shadowOpacity: guideTarget ? 0.42 : 0,
                      shadowRadius: guideTarget ? 10 : 0,
                      elevation: guideTarget ? 10 : 0,
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 28,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: active || guideTarget ? ui.primarySoft : "transparent",
                        borderWidth: active ? 1 : 0,
                        borderColor: active ? `${ui.primary}22` : "transparent",
                      }}
                    >
                      <Ionicons
                        name={(active ? tab.activeIcon : tab.icon) as any}
                        size={24}
                        color={active ? ui.primary : ui.muted}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 11.5,
                        lineHeight: 15,
                        marginTop: 4,
                        color: active ? ui.primary : ui.muted,
                        fontWeight: active ? "800" : "600",
                        letterSpacing: 0.1,
                      }}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                  </Animated.View>
                  </StudyTabMotion>
                );
              })}
          </View>
        );
      })() : null}

      <AchievementGalleryModal
        visible={achievementGalleryVisible}
        unlockedIds={progress.achievements}
        stats={progress.userStats}
        theme={theme}
        onClose={() => setAchievementGalleryVisible(false)}
      />

      <Modal
        visible={runtimeScreen === "results" && !!resultRecord}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setRuntimeScreen("dashboard");
          setActiveTab("home");
          setResultRecord(null);
        }}
      >
        <View style={{ flex: 1 }}>
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              paddingTop: Math.max(insets.top, 18),
              paddingBottom: Math.max(insets.bottom, 18),
              paddingHorizontal: 16,
            }}
          >
            <Pressable
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: theme.isDark ? "rgba(0,0,0,0.55)" : "rgba(10,14,20,0.32)",
              }}
              onPress={() => {
                setRuntimeScreen("dashboard");
                setActiveTab("home");
                setResultRecord(null);
              }}
            />
            <View>
              <ScreenReveal delay={20} distance={22} scaleFrom={0.98}>
                <GlassCard style={{ borderRadius: 24, overflow: "hidden", maxHeight: "100%" }} padding={0} variant="strong">
                  {resultRecord ? (
                    <>
                      <View style={{ paddingTop: 12, paddingHorizontal: 16, alignItems: "flex-end" }}>
                        <StudentWorkspaceActions colors={ui} onSettings={() => openWorkspaceTab("settings")} onClassrooms={() => openWorkspaceTab("classrooms")} />
                      </View>
                      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flex: 1, paddingRight: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
                          {resultRecord.pendingSync ? (
                            <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                              <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.primary} />
                            </View>
                          ) : resultRecord.requiresReview ? (
                            <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: `${ui.warning}18`, alignItems: "center", justifyContent: "center" }}>
                              <Ionicons name="time-outline" size={20} color={ui.warning} />
                            </View>
                          ) : (
                            <CompletionBadge passed={resultRecord.passed} theme={theme} />
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={[theme.typography.title, { fontSize: 18 }]}>
                              {resultRecord.pendingSync
                                ? "Answers saved"
                                : resultRecord.requiresReview
                                  ? "Test submitted"
                                  : "Session complete"}
                            </Text>
                            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 3 }]}>
                              {sessionType === "test" ? "Test" : "Lesson"} - {sessionContext.name || "General practice"}
                            </Text>
                            {sessionType === "test" ? (
                              <Text
                                accessibilityLiveRegion="polite"
                                style={[
                                  theme.typography.caption,
                                  {
                                    marginTop: 4,
                                    color: resultRecord.pendingSync
                                      ? ui.primary
                                      : resultRecord.requiresReview
                                      ? ui.warning
                                      : resultRecord.verified
                                        ? ui.success
                                        : ui.danger,
                                    fontWeight: "800",
                                  },
                                ]}
                              >
                                {resultRecord.pendingSync
                                  ? "Waiting for a connection to verify"
                                  : resultRecord.requiresReview
                                  ? "Teacher review required"
                                  : resultRecord.verified
                                    ? "Server verified"
                                    : "Verification pending"}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        {!resultRecord.pendingSync && !resultRecord.requiresReview ? (
                          <View style={{ alignItems: "flex-end" }}>
                            <AnimatedNumber value={resultRecord.percentage} suffix="%" style={[theme.typography.title, { fontSize: 24 }]} />
                             <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                               {resultRecord.score}/{resultRecord.total} correct
                             </Text>
                             {sessionType === "test" ? (
                               <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                                 {Number(resultRecord.totalPoints) > 0
                                   ? `${resultRecord.earnedPoints ?? 0}/${resultRecord.totalPoints} points`
                                   : `${resultRecord.passingPercentage ?? 80}% needed to pass`}
                               </Text>
                             ) : null}
                          </View>
                        ) : (
                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={[theme.typography.bodyStrong, { color: resultRecord.pendingSync ? ui.primary : ui.warning }]}>
                              {resultRecord.total}
                            </Text>
                            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>responses</Text>
                          </View>
                        )}
                      </View>

                      <ScrollView
                        style={{ maxHeight: reviewViewportMaxHeight }}
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
                      >
                        <StudyCompletionSummary
                          percentage={resultRecord.percentage}
                          passed={resultRecord.passed}
                          pendingSync={resultRecord.pendingSync}
                          requiresReview={resultRecord.requiresReview}
                          isTest={sessionType === "test"}
                          xpEarned={resultRecord.xpEarned}
                          dailyGoalCompleted={resultRecord.dailyGoalCompleted}
                          correctCount={resultRecord.score}
                          mistakeCount={resultMistakeCount}
                          focusAreas={resultFocusAreas}
                          newAchievementTitles={(resultRecord.newAchievementIds ?? [])
                            .map((id) => ACHIEVEMENTS.find((achievement) => achievement.id === id)?.title)
                            .filter((title): title is string => Boolean(title))}
                          theme={theme}
                        />
                        {resultRecord.followUp ? (
                          <GlassCard
                            style={{
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: resultRecord.followUp.saved
                                ? resultRecord.followUp.completed
                                  ? `${ui.success}45`
                                  : `${ui.primary}45`
                                : `${ui.warning}55`,
                              marginBottom: 14,
                            }}
                            padding={12}
                            variant="strong"
                          >
                            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                              <IconTile
                                icon={resultRecord.followUp.completed ? "checkmark-circle-outline" : "locate-outline"}
                                size={38}
                                iconSize={19}
                                radius={11}
                                backgroundColor={
                                  resultRecord.followUp.completed
                                    ? `${ui.success}15`
                                    : resultRecord.followUp.saved
                                      ? ui.primarySoft
                                      : `${ui.warning}15`
                                }
                                borderColor={
                                  resultRecord.followUp.completed
                                    ? `${ui.success}35`
                                    : resultRecord.followUp.saved
                                      ? ui.borderStrong
                                      : `${ui.warning}35`
                                }
                                color={
                                  resultRecord.followUp.completed
                                    ? ui.success
                                    : resultRecord.followUp.saved
                                      ? ui.primary
                                      : ui.warning
                                }
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={[theme.typography.bodyStrong, { fontSize: 14 }]}>
                                  {resultRecord.followUp.completed
                                    ? "Teacher follow-up completed"
                                    : resultRecord.followUp.saved
                                      ? `${FOLLOW_UP_MODE_LABELS[resultRecord.followUp.completedMode]} complete`
                                      : "Stage not synced"}
                                </Text>
                                <Text style={[theme.typography.caption, { color: ui.muted, marginTop: 3, lineHeight: 18 }]}>
                                  {resultRecord.followUp.completed
                                    ? "You finished multiple choice, writing, and listening. Your teacher can see the completed follow-up."
                                    : resultRecord.followUp.saved && resultRecord.followUp.nextMode
                                      ? `Next: ${FOLLOW_UP_MODE_LABELS[resultRecord.followUp.nextMode]}. All three stages are required.`
                                      : "Reopen the follow-up and complete this stage again when you are connected."}
                                </Text>
                              </View>
                            </View>
                            <View style={{ flexDirection: "row", gap: 5, marginTop: 11 }}>
                              {REQUIRED_FOLLOW_UP_MODES.map((mode, index) => {
                                const complete = resultRecord.followUp?.completedModes.includes(mode);
                                return (
                                  <View
                                    key={mode}
                                    style={{
                                      flex: 1,
                                      borderRadius: 9,
                                      borderWidth: 1,
                                      borderColor: complete ? `${ui.success}35` : ui.border,
                                      backgroundColor: complete ? `${ui.success}12` : ui.card,
                                      paddingVertical: 7,
                                      alignItems: "center",
                                    }}
                                  >
                                    <Text style={{ color: complete ? ui.success : ui.muted, fontSize: 9, fontWeight: "900" }}>
                                      {complete ? "✓" : index + 1} {FOLLOW_UP_MODE_LABELS[mode]}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          </GlassCard>
                        ) : null}
                        {resultRecord.teacherFeedback ? (
                          <GlassCard
                            style={{ borderRadius: 14, borderWidth: 1, borderColor: `${ui.secondary}40`, marginBottom: 14 }}
                            padding={12}
                            variant="strong"
                          >
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              <Ionicons name="chatbubble-ellipses-outline" size={18} color={ui.secondary} />
                              <Text style={[theme.typography.label, { color: ui.secondary }]}>FEEDBACK FROM YOUR TEACHER</Text>
                            </View>
                            <Text style={[theme.typography.body, { marginTop: 8, lineHeight: 20 }]}>
                              {resultRecord.teacherFeedback}
                            </Text>
                          </GlassCard>
                        ) : null}
                        {resultIssuesNeedingAttention.length > 0 ? (
                          <View>
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <Text style={theme.typography.label}>QUESTION REVIEW</Text>
                              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                                {resultIssuesNeedingAttention.length} to revisit
                              </Text>
                            </View>
                            <View style={{ gap: 8 }}>
                              {visibleResultIssues.map((issue, index) => (
                                <ReviewIssueCard
                                  key={`${issue.id}-${index}`}
                                  issue={issue}
                                  index={index}
                                  theme={theme}
                                  showExpected={!resultRecord.pendingSync && !resultRecord.requiresReview && issue.kind !== "open_review"}
                                />
                              ))}
                            </View>
                            {resultIssuesNeedingAttention.length > 3 ? (
                              <TouchableOpacity
                                onPress={() => setShowAllResultIssues((current) => !current)}
                                style={{ marginTop: 8, borderRadius: 11, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, paddingVertical: 9, alignItems: "center" }}
                              >
                                <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: "900" }}>
                                  {showAllResultIssues ? "Show top 3" : `View all ${resultIssuesNeedingAttention.length} answers`}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ) : (
                          <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted }]}>
                            No question details were recorded for this run.
                          </Text>
                        )}
                        {!resultRecord.pendingSync &&
                        !resultRecord.followUp &&
                        (resultMistakeCount > 0 || recommendedNextLesson) ? (
                          <View style={{ marginTop: 16 }}>
                            <Text style={[theme.typography.label, { marginBottom: 8 }]}>WHAT&apos;S NEXT</Text>
                            <View style={{ gap: 8 }}>
                              {resultMistakeCount > 0 ? (
                                <TouchableOpacity
                                  onPress={startResultMistakeReview}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Review ${resultMistakeCount} mistakes`}
                                  activeOpacity={0.84}
                                >
                                  <GlassCard
                                    style={{ borderRadius: 14, borderWidth: 1, borderColor: `${ui.warning}45` }}
                                    padding={12}
                                    variant="strong"
                                  >
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                      <IconTile
                                        icon="refresh-outline"
                                        size={38}
                                        iconSize={19}
                                        radius={11}
                                        backgroundColor={`${ui.warning}15`}
                                        borderColor={`${ui.warning}35`}
                                        color={ui.warning}
                                      />
                                      <View style={{ flex: 1 }}>
                                        <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]}>
                                          {sessionType === "test"
                                            ? "Practise missed concepts"
                                            : `Review ${resultMistakeCount} mistake${resultMistakeCount === 1 ? "" : "s"}`}
                                        </Text>
                                        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                                          {sessionType === "test"
                                            ? "Build confidence before another graded attempt."
                                            : "Practise the words that need another look."}
                                        </Text>
                                      </View>
                                      <Ionicons name="chevron-forward" size={18} color={ui.warning} />
                                    </View>
                                  </GlassCard>
                                </TouchableOpacity>
                              ) : null}
                              {recommendedNextLesson ? (
                                <TouchableOpacity
                                  onPress={openRecommendedNextLesson}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Continue studying ${recommendedNextLesson.name}`}
                                  activeOpacity={0.84}
                                >
                                  <GlassCard
                                    style={{ borderRadius: 14, borderWidth: 1, borderColor: `${ui.primary}45` }}
                                    padding={12}
                                    variant="strong"
                                  >
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                      <IconTile
                                        icon="play-outline"
                                        size={38}
                                        iconSize={19}
                                        radius={11}
                                        backgroundColor={ui.primarySoft}
                                        borderColor={ui.borderStrong}
                                        color={ui.primary}
                                      />
                                      <View style={{ flex: 1 }}>
                                        <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]}>
                                          Continue studying
                                        </Text>
                                        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                                          {recommendedNextLesson.name}
                                        </Text>
                                      </View>
                                      <Ionicons name="chevron-forward" size={18} color={ui.primary} />
                                    </View>
                                  </GlassCard>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                        ) : null}
                      </ScrollView>

                      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: theme.colors.border, flexDirection: "row", gap: 10, backgroundColor: theme.colors.surfaceGlass }}>
                        <View style={{ flex: 1 }}>
                          <AppButton
                            label="Return Home"
                            onPress={() => {
                              setRuntimeScreen("dashboard");
                              setActiveTab("home");
                              setResultRecord(null);
                            }}
                          />
                        </View>
                        {resultRecord.followUp?.saved && resultRecord.followUp.nextMode ? (
                          <View style={{ flex: 1 }}>
                            <AppButton
                              label={`Continue: ${FOLLOW_UP_MODE_LABELS[resultRecord.followUp.nextMode]}`}
                              onPress={startTeacherFocusPractice}
                            />
                          </View>
                        ) : resultRecord.pendingSync ? (
                          <View style={{ flex: 1 }}>
                            <AppButton
                              label="Retry Sync"
                              variant="dangerSoft"
                              onPress={() => finishSession().catch(() => {})}
                            />
                          </View>
                        ) : !resultRecord.followUp && (
                          sessionType !== "test" || selectedTestAssignmentProgress?.status === "retry-available"
                        ) ? (
                          <View style={{ flex: 1 }}>
                            <AppButton
                              label={sessionType === "test" ? "Retry Test" : "Re-take"}
                              variant="dangerSoft"
                              loading={sessionType === "test" && testStarting}
                              disabled={sessionType === "test" && testStarting}
                              onPress={() => {
                                if (sessionType === "test" && selectedTestDetail) {
                                  beginAssignedTest(selectedTestDetail.test).catch(() => {});
                                  return;
                                }
                                startSession(
                                  sessionType,
                                  sessionMode,
                                  direction,
                                  sessionPool,
                                  sessionContext
                                );
                              }}
                            />
                          </View>
                        ) : null}
                      </View>
                    </>
                  ) : null}
                </GlassCard>
              </ScreenReveal>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!selectedHistoryRecord}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setSelectedHistoryRecord(null);
        }}
      >
        <View style={{ flex: 1 }}>
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              paddingTop: Math.max(insets.top, 18),
              paddingBottom: Math.max(insets.bottom, 18),
              paddingHorizontal: 16,
            }}
          >
            <Pressable
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: theme.isDark ? "rgba(0,0,0,0.55)" : "rgba(10,14,20,0.32)",
              }}
              onPress={() => {
                setSelectedHistoryRecord(null);
              }}
            />
            <View>
              <ScreenReveal delay={20} distance={22} scaleFrom={0.98}>
                <GlassCard style={{ borderRadius: 24, overflow: "hidden", maxHeight: "100%" }} padding={0} variant="strong">
                  {selectedHistoryRecord ? (
                    <>
                      <View style={{ paddingTop: 12, paddingHorizontal: 16, alignItems: "flex-end" }}>
                        <StudentWorkspaceActions colors={ui} onSettings={() => openWorkspaceTab("settings")} onClassrooms={() => openWorkspaceTab("classrooms")} />
                      </View>
                      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={[theme.typography.title, { fontSize: 18 }]}>Test review</Text>
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 3 }]}>
                            {(selectedHistoryRecord.lessonName || "Past test")} - {selectedHistoryRecord.date ? new Date(selectedHistoryRecord.date).toLocaleDateString() : "Past attempt"}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          {selectedHistoryPresentation?.state === "awaiting-review" ? (
                            <Text style={[theme.typography.bodyStrong, { color: ui.warning }]}>Pending review</Text>
                          ) : selectedHistoryPresentation?.state !== "final" ? (
                            <Text style={[theme.typography.bodyStrong, { color: ui.muted }]}>Result syncing</Text>
                          ) : (
                            <AnimatedNumber value={selectedHistoryPresentation.percentage ?? 0} suffix="%" style={[theme.typography.title, { fontSize: 24 }]} />
                          )}
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                            {selectedHistoryPresentation?.state === "awaiting-review"
                              ? "Your teacher will finalize this result"
                              : selectedHistoryPresentation?.state === "final"
                                ? `${selectedHistoryPresentation.correct}/${selectedHistoryPresentation.total} correct`
                                : "Waiting for a verified result"}
                          </Text>
                          {selectedHistoryPresentation?.state === "final" ? (
                            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                              {Number(selectedHistoryRecord.totalPoints) > 0
                                ? `${selectedHistoryRecord.earnedPoints ?? 0}/${selectedHistoryRecord.totalPoints} points`
                                : `${selectedHistoryPresentation.passingPercentage}% needed to pass`}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      <ScrollView
                        style={{ maxHeight: reviewViewportMaxHeight }}
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
                      >
                        {selectedHistoryRecord.teacherFeedback ? (
                          <GlassCard style={{ borderRadius: 13, borderWidth: 1, borderColor: `${ui.secondary}40`, marginBottom: 12 }} padding={12} variant="strong">
                            <Text style={[theme.typography.label, { color: ui.secondary }]}>FEEDBACK FROM YOUR TEACHER</Text>
                            <Text style={[theme.typography.body, { marginTop: 7, lineHeight: 20 }]}>{selectedHistoryRecord.teacherFeedback}</Text>
                          </GlassCard>
                        ) : null}
                        {(selectedHistoryRecord.issues ?? []).filter((issue) => issue.kind !== "correct").length > 0 ? (
                          <View>
                            <Text style={[theme.typography.label, { marginBottom: 8 }]}>ANSWERS TO REVISIT</Text>
                            <View style={{ gap: 8 }}>
                              {(selectedHistoryRecord.issues ?? []).filter((issue) => issue.kind !== "correct").map((issue, index) => (
                                <ReviewIssueCard
                                  key={`${issue.id}-${index}`}
                                  issue={issue}
                                  index={index}
                                  theme={theme}
                                  showExpected={
                                    selectedHistoryRecord.reviewStatus !== "pending" &&
                                    selectedHistoryRecord.requiresReview !== true &&
                                    selectedHistoryRecord.verified === true &&
                                    issue.kind !== "open_review"
                                  }
                                />
                              ))}
                            </View>
                          </View>
                        ) : (
                          <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted }]}>
                            Question details were not saved for this test attempt.
                          </Text>
                        )}
                      </ScrollView>

                      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surfaceGlass }}>
                        {!selectedHistoryRecord?.reviewCompletedAt &&
                        selectedHistoryRecord?.verified === true &&
                        selectedHistoryRecord?.reviewStatus !== "pending" ? (
                          <TouchableOpacity
                            onPress={() => {
                              if (!sessionId || !selectedHistoryRecord?.id) return;
                              recordResultEvent({
                                sessionId,
                                resultKey: String(selectedHistoryRecord.id),
                                resultType: "test",
                                eventType: "review_completed",
                              })
                                .then(() => {
                                  setSelectedHistoryRecord((current) => current ? { ...current, reviewCompletedAt: new Date().toISOString() } as StudyRecord : current);
                                  showToast("Review complete. Your teacher can see that you looked through this result.", "success");
                                })
                                .catch(() => showToast("Review status could not be saved yet.", "info"));
                            }}
                            style={{ borderRadius: 12, backgroundColor: ui.success, paddingVertical: 12, alignItems: "center", marginBottom: 9 }}
                          >
                            <Text style={{ color: ui.primaryText, fontSize: 13, fontWeight: "900" }}>I reviewed my result</Text>
                          </TouchableOpacity>
                        ) : null}
                        <AppButton
                          label="Close"
                          onPress={() => {
                            setSelectedHistoryRecord(null);
                          }}
                        />
                      </View>
                    </>
                  ) : null}
                </GlassCard>
              </ScreenReveal>
            </View>
          </View>
        </View>
      </Modal>
      {lessonPdfViewerVisible ? (
        <LessonPdfViewerModal
          visible={lessonPdfViewerVisible}
          uri={lessonPdfViewerUri}
          title={selectedLessonDetail?.document_name || selectedLessonDetail?.name}
          primaryColor={theme.colors.primary}
          backgroundColor={theme.colors.surface}
          textColor={theme.colors.text}
          onClose={() => {
            setLessonPdfViewerVisible(false);
            setLessonPdfViewerUri(null);
          }}
          onLoadError={(msg: string) => showToast(msg, "danger")}
        />
      ) : null}
      <StudentFirstRunGuide
        visible={studentGuideVisible}
        studentName={studentName}
        teacherName={teacherName}
        hasLessons={catalogLessonsData.length > 0}
        hasTests={catalogTestsData.length > 0}
        onSectionChange={showStudentGuideSection}
        onFinish={finishStudentGuide}
      />
      <FloatingToast {...toastProps} />
    </Animated.View>
  );
}
