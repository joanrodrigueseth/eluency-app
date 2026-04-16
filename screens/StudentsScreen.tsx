import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Constants from "expo-constants";
const apiBaseUrl: string =
  Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";

import {
  Animated,
  Alert,
  Easing,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { Pressable, TouchableOpacity } from "../lib/hapticPressables";

if (Platform.OS === "android" && UIManager.getViewManagerConfig?.("RCTLayoutAnimation")) UIManager.setLayoutAnimationEnabledExperimental?.(true);
const layoutEase = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { NavigationProp, RouteProp, useNavigation, useFocusEffect, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import FloatingToast from "../components/FloatingToast";
import type { FloatingToastTone } from "../components/FloatingToast";
import GlassCard from "../components/GlassCard";
import IconTile from "../components/IconTile";
import ScreenReveal from "../components/ScreenReveal";
import SkeletonLoader from "../components/SkeletonLoader";
import { useFeedbackToast } from "../hooks/useFeedbackToast";
import { getRemoteProgress } from "../lib/api/study";
import { historyDirectionLabel } from "../lib/game/languagePair";
import { triggerLightImpact } from "../lib/haptics";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";
import {
  coercePlanForRole,
  getStudentLimitForPlan,
  normalizePlanUi,
} from "../lib/teacherRolePlanRules";
import type { StudyDirection, StudyRecordIssue, StudySessionMode } from "../types/study-game";

export type RootStudentsStackParams = {
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  Students: { flashMessage?: string; flashTone?: FloatingToastTone; openStudentId?: string } | undefined;
  StudentForm: { studentId?: string } | undefined;
  Subscription: undefined;
  Notifications: undefined;
};

type StudentRow = {
  id: string;
  name: string;
  code: string;
  email?: string | null;
  teacher_id: string | null;
  is_active?: boolean | null;
  last_active: string | null;
  created_at: string;
  assigned_lessons?: string[] | null;
  assigned_tests?: string[] | null;
  progress?: { totalCorrect?: number; totalClose?: number } | null;
  teacher?: { name: string } | null;
};

type SortKey = "name" | "last_active" | "created_at";
type SortDir = "asc" | "desc";

/**
 * Normalise per-question data into a single ActivityIssue shape.
 * Handles two formats:
 *   • Mobile StudyRecordIssue  — { kind, prompt, expected, answer? }
 *   • Webapp StudentResultAnswer — { result, word:{pt?,en?}, correctAnswer, userAnswer }
 */
function activityIssueLabel(kind: ActivityIssue["kind"]) {
  if (kind === "correct") return "Correct";
  if (kind === "open_review") return "Review";
  if (kind === "skip") return "Skipped";
  if (kind === "close") return "Close";
  return "Wrong";
}

function activityIssueIcon(kind: ActivityIssue["kind"]) {
  if (kind === "correct") return "checkmark-circle" as const;
  if (kind === "open_review") return "document-text-outline" as const;
  if (kind === "close") return "alert-circle-outline" as const;
  return "close-circle" as const;
}

function activityIssueColor(colors: ReturnType<typeof useAppTheme>["colors"], kind: ActivityIssue["kind"]) {
  if (kind === "correct") return colors.success;
  if (kind === "open_review") return colors.primary;
  if (kind === "close") return "#D4943C";
  return colors.danger;
}

function normalizeIssues(rawIssues: any[], rawAnswers: any[]): ActivityIssue[] {
  if (rawIssues.length > 0 && typeof rawIssues[0]?.kind === "string") {
    return rawIssues.map((i: any, idx: number) => ({
      id: typeof i.id === "string" ? i.id : String(idx),
      prompt: i.prompt ?? "",
      expected: i.expected ?? "",
      answer: typeof i.answer === "string" ? i.answer : undefined,
      kind: i.kind as ActivityIssue["kind"],
    }));
  }
  if (rawAnswers.length > 0) {
    const kindMap: Record<string, ActivityIssue["kind"]> = {
      correct: "correct",
      close: "close",
      submitted: "open_review",
      wrong: "wrong",
    };
    return rawAnswers.map((a: any, idx: number) => {
      const w = a.word && typeof a.word === "object" ? a.word : {};
      const rawPrompt = w.pt ?? w.en ?? w.sp ?? w.se ?? a.prompt;
      const prompt = typeof rawPrompt === "string" ? rawPrompt : "";
      const rawExpected = a.correctAnswer ?? a.expected;
      const expected = typeof rawExpected === "string" ? rawExpected : "";
      const rawAnswer = a.userAnswer ?? a.answer;
      const answer = typeof rawAnswer === "string" ? rawAnswer : undefined;
      return {
        id: String(idx),
        prompt,
        expected,
        answer,
        kind: kindMap[a.result] ?? (a.kind as ActivityIssue["kind"]) ?? "wrong",
      };
    });
  }
  return [];
}

/**
 * Converts a student's progress (from student_game_progress.practice_history /
 * test_history) into ActivityRow entries. Works with both the mobile StudyRecord
 * shape (score: number, issues: []) and the webapp shape (score: {answers, correct,
 * close, wrong}, timestamp: epochMs).
 */
function buildActivitiesFromProgress(
  studentId: string,
  studentName: string,
  progress: any
): ActivityRow[] {
  if (!progress || typeof progress !== "object") return [];
  const rows: ActivityRow[] = [];

  const practiceHistory: any[] = Array.isArray(progress.practiceHistory) ? progress.practiceHistory : [];
  const testHistory: any[] = Array.isArray(progress.testHistory) ? progress.testHistory : [];

  const pushRecord = (rec: any, source: "lesson_completed" | "test_completed") => {
    if (!rec || typeof rec !== "object") return;

    const isTest = source === "test_completed";
    const contentName =
      typeof rec.lessonName === "string"
        ? rec.lessonName
        : typeof rec.testName === "string"
        ? rec.testName
        : typeof rec.lesson?.name === "string"
        ? rec.lesson.name
        : typeof rec.test?.name === "string"
        ? rec.test.name
        : null;

    // score field: number (mobile) or { answers: [] } (webapp)
    const rawScore = rec.score;
    const rawAnswers: any[] = Array.isArray(rawScore?.answers) ? rawScore.answers : [];
    const rawIssues: any[] = Array.isArray(rec.issues) ? rec.issues : [];
    const issues = normalizeIssues(rawIssues, rawAnswers);
    const totalWords =
      typeof rec.totalWords === "number"
        ? rec.totalWords
        : rawAnswers.length > 0
        ? rawAnswers.length
        : undefined;

    const correctCount =
      typeof rawScore === "number"
        ? rawScore
        : typeof rawScore?.correct === "number"
        ? rawScore.correct
        : rawAnswers.filter((a: any) => a.result === "correct").length;

    const pct: number | undefined =
      typeof rec.percentage === "number"
        ? rec.percentage
        : typeof totalWords === "number" && totalWords > 0
        ? Math.round((correctCount / totalWords) * 100)
        : undefined;

    // date: ISO string (mobile) or epoch ms (webapp)
    const createdAt: string =
      typeof rec.date === "string"
        ? rec.date
        : typeof rec.timestamp === "number"
        ? new Date(rec.timestamp).toISOString()
        : typeof rec.timestamp === "string"
        ? rec.timestamp
        : new Date().toISOString();

    const mode =
      rec.mode === "typing" || rec.mode === "multiple-choice" || rec.mode === "listening" || rec.mode === "image"
        ? (rec.mode as StudySessionMode)
        : undefined;
    const direction = rec.direction === "pt-en" || rec.direction === "en-pt" ? (rec.direction as StudyDirection) : undefined;

    rows.push({
      id: typeof rec.id === "string" ? rec.id : `${studentId}-${createdAt}`,
      type: source,
      title: `${studentName} completed ${contentName ?? (isTest ? "a test" : "a lesson")}`,
      body: null,
      created_at: createdAt,
      metadata: {
        student_id: studentId,
        student_name: studentName,
        lesson_id:
          typeof rec.lessonId === "string"
            ? rec.lessonId
            : typeof rec.lesson_id === "string"
            ? rec.lesson_id
            : typeof rec.lesson?.id === "string"
            ? rec.lesson.id
            : undefined,
        test_id:
          typeof rec.testId === "string"
            ? rec.testId
            : typeof rec.test_id === "string"
            ? rec.test_id
            : typeof rec.test?.id === "string"
            ? rec.test.id
            : undefined,
        ...(isTest ? { test_name: contentName ?? undefined } : { lesson_name: contentName ?? undefined }),
        mode,
        direction,
        language_pair: typeof rec.languagePair === "string" ? rec.languagePair : typeof rec.language_pair === "string" ? rec.language_pair : undefined,
        lesson_language:
          typeof rec.lessonLanguage === "string"
            ? rec.lessonLanguage
            : typeof rec.lesson_language === "string"
            ? rec.lesson_language
            : undefined,
        score: correctCount,
        total: totalWords,
        percentage: pct,
        passed: typeof rec.passed === "boolean" ? rec.passed : typeof pct === "number" && isTest ? pct >= 80 : undefined,
        issues,
      },
    });
  };

  for (const rec of practiceHistory) {
    pushRecord(rec, "lesson_completed");
  }
  for (const rec of testHistory) {
    pushRecord(rec, "test_completed");
  }

  return rows;
}

type StudentProgressRow = {
  student_id: string;
  practiceHistory: any[];
  testHistory: any[];
};

type VerifyAccessCodeResponse = {
  error?: string;
  session?: {
    id?: string;
  };
};

type TeacherActivityNotificationRow = {
  id: string;
  type: "lesson_completed" | "test_completed";
  title: string;
  body: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

function normalizeProgressPayload(payload: any): { practiceHistory: any[]; testHistory: any[] } {
  const source = payload && typeof payload === "object" ? payload : {};
  const nested = source.progress && typeof source.progress === "object" ? source.progress : {};
  const practiceHistory = Array.isArray(source.practiceHistory)
    ? source.practiceHistory
    : Array.isArray(source.practice_history)
    ? source.practice_history
    : Array.isArray(nested.practiceHistory)
    ? nested.practiceHistory
    : Array.isArray(nested.practice_history)
    ? nested.practice_history
    : [];
  const testHistory = Array.isArray(source.testHistory)
    ? source.testHistory
    : Array.isArray(source.test_history)
    ? source.test_history
    : Array.isArray(nested.testHistory)
    ? nested.testHistory
    : Array.isArray(nested.test_history)
    ? nested.test_history
    : [];
  return { practiceHistory, testHistory };
}

async function fetchStudentProgressViaApi(
  studentId: string,
  token: string,
  isAdmin: boolean
): Promise<StudentProgressRow | null> {
  const candidatePaths = isAdmin
    ? [
        `/api/admin/students/${encodeURIComponent(studentId)}/progress`,
        `/api/teacher/students/${encodeURIComponent(studentId)}/progress`,
        `/api/students/${encodeURIComponent(studentId)}/progress`,
      ]
    : [
        `/api/teacher/students/${encodeURIComponent(studentId)}/progress`,
        `/api/students/${encodeURIComponent(studentId)}/progress`,
        `/api/admin/students/${encodeURIComponent(studentId)}/progress`,
      ];

  for (const path of candidatePaths) {
    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) continue;
      const json = await res.json();
      const normalized = normalizeProgressPayload(json);
      return {
        student_id: studentId,
        practiceHistory: normalized.practiceHistory,
        testHistory: normalized.testHistory,
      };
    } catch {
      continue;
    }
  }

  return null;
}

function inferActivityContentName(
  notification: TeacherActivityNotificationRow,
  isTest: boolean
): string | undefined {
  const metadata = notification.metadata && typeof notification.metadata === "object" ? notification.metadata : null;
  const explicitName =
    typeof metadata?.lesson_name === "string"
      ? metadata.lesson_name
      : typeof metadata?.test_name === "string"
      ? metadata.test_name
      : typeof metadata?.content_name === "string"
      ? metadata.content_name
      : typeof metadata?.name === "string"
      ? metadata.name
      : null;
  if (explicitName) return explicitName;

  const title = notification.title.trim();
  const completedMatch = title.match(/\bcompleted\b\s+(.+)$/i);
  if (completedMatch?.[1]) return completedMatch[1].trim();

  return isTest ? "Test" : "Lesson";
}

function buildActivitiesFromNotifications(
  notifications: TeacherActivityNotificationRow[],
  studentsById: Map<string, string>
): ActivityRow[] {
  return notifications.map((notification) => {
    const metadata = notification.metadata && typeof notification.metadata === "object" ? notification.metadata : null;
    const isTest = notification.type === "test_completed";
    const studentId = typeof metadata?.student_id === "string" ? metadata.student_id : undefined;
    const studentName =
      typeof metadata?.student_name === "string"
        ? metadata.student_name
        : studentId
        ? studentsById.get(studentId) ?? undefined
        : undefined;
    const contentName = inferActivityContentName(notification, isTest);
    const percentage =
      typeof metadata?.percentage === "number"
        ? metadata.percentage
        : typeof metadata?.score_percentage === "number"
        ? metadata.score_percentage
        : undefined;
    const score = typeof metadata?.score === "number" ? metadata.score : undefined;
    const total =
      typeof metadata?.total === "number"
        ? metadata.total
        : typeof metadata?.total_words === "number"
        ? metadata.total_words
        : undefined;

    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      created_at: notification.created_at,
      metadata: {
        student_id: studentId,
        student_name: studentName,
        lesson_id: typeof metadata?.lesson_id === "string" ? metadata.lesson_id : undefined,
        test_id: typeof metadata?.test_id === "string" ? metadata.test_id : undefined,
        ...(isTest ? { test_name: contentName } : { lesson_name: contentName }),
        percentage,
        score,
        total,
        passed: typeof metadata?.passed === "boolean" ? metadata.passed : undefined,
        issues: [],
      },
    };
  });
}

function getActivityContentName(activity: ActivityRow): string {
  const meta = activity.metadata ?? {};
  const contentName =
    typeof meta.lesson_name === "string"
      ? meta.lesson_name
      : typeof meta.test_name === "string"
      ? meta.test_name
      : activity.title;
  return contentName.trim();
}

function normalizeActivityMatchText(value: string | undefined | null) {
  return String(value ?? "").trim().toLowerCase();
}

function findMatchingDetailedActivity(
  candidates: ActivityRow[],
  target: ActivityRow
): ActivityRow | null {
  const targetType = target.type;
  const targetName = normalizeActivityMatchText(getActivityContentName(target));
  const targetCreatedAt = new Date(target.created_at).getTime();

  const ranked = candidates
    .filter((candidate) => candidate.type === targetType)
    .map((candidate) => {
      const candidateName = normalizeActivityMatchText(getActivityContentName(candidate));
      const candidateCreatedAt = new Date(candidate.created_at).getTime();
      return {
        candidate,
        sameName: targetName.length > 0 && candidateName === targetName,
        dateDelta:
          Number.isFinite(targetCreatedAt) && Number.isFinite(candidateCreatedAt)
            ? Math.abs(candidateCreatedAt - targetCreatedAt)
            : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => {
      if (a.sameName !== b.sameName) return a.sameName ? -1 : 1;
      return a.dateDelta - b.dateDelta;
    });

  return ranked[0]?.candidate ?? null;
}

function getActivityOutcomeCounts(meta: ActivityRow["metadata"]): {
  correct: number;
  close: number;
  wrong: number;
  hasIssues: boolean;
} {
  const issues: ActivityIssue[] = Array.isArray(meta?.issues) ? meta.issues : [];
  if (issues.length > 0) {
    return {
      correct: issues.filter((issue) => issue.kind === "correct" || issue.kind === "open_review").length,
      close: issues.filter((issue) => issue.kind === "close").length,
      wrong: issues.filter((issue) => issue.kind === "wrong" || issue.kind === "skip").length,
      hasIssues: true,
    };
  }

  const correct = typeof meta?.score === "number" ? meta.score : 0;
  const total = typeof meta?.total === "number" ? meta.total : null;
  const close = 0;
  const wrong = total !== null ? Math.max(total - correct - close, 0) : 0;
  return { correct, close, wrong, hasIssues: false };
}

type ActivityIssue = StudyRecordIssue;

type ActivityRow = {
  id: string;
  type: "lesson_completed" | "test_completed";
  title: string;
  body: string | null;
  created_at: string;
  metadata: {
    student_id?: string;
    student_name?: string;
    lesson_id?: string;
    test_id?: string;
    lesson_name?: string;
    test_name?: string;
    mode?: StudySessionMode;
    direction?: StudyDirection;
    language_pair?: string;
    lesson_language?: string;
    score?: number;
    total?: number;
    percentage?: number;
    passed?: boolean;
    issues?: ActivityIssue[];
  } | null;
};





function GlowOrb({
  size,
  color,
  top,
  left,
  right,
  bottom,
  translate,
}: {
  size: number;
  color: string;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  translate: Animated.Value;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top,
        left,
        right,
        bottom,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: 0.9,
        transform: [
          { translateY: translate },
          {
            translateX: translate.interpolate({
              inputRange: [-12, 12],
              outputRange: [8, -8],
            }),
          },
          { scale: translate.interpolate({ inputRange: [-12, 12], outputRange: [0.96, 1.04] }) },
        ],
      }}
    />
  );
}

function formatShortDate(dateIso?: string | null) {
  if (!dateIso) return "Never";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const reviewViewportMaxHeight = 488;

function AnimatedPressable({
  children,
  onPress,
  style,
  disabled,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      tension: 250,
      friction: 18,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        triggerLightImpact();
        animateTo(0.975);
      }}
      onPressOut={() => animateTo(1)}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

export default function StudentsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStudentsStackParams>>();
  const route = useRoute<RouteProp<RootStudentsStackParams, "Students">>();
  const heroGlowOne = useRef(new Animated.Value(-10)).current;
  const heroGlowTwo = useRef(new Animated.Value(10)).current;

  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [planName, setPlanName] = useState("Basic");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [teacherView, setTeacherView] = useState<"mine" | string>("mine");
  const [teacherMenuOpen, setTeacherMenuOpen] = useState(false);

  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRow | null>(null);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityDetailLoadingId, setActivityDetailLoadingId] = useState<string | null>(null);
  const activitySessionIdCacheRef = useRef<Map<string, string>>(new Map());
  const activityProgressCacheRef = useRef<Map<string, ActivityRow[]>>(new Map());

  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const { showToast, toastProps } = useFeedbackToast({ bottom: Math.max(insets.bottom, 20) + 12 });

  useEffect(() => {
    if (!route.params?.flashMessage) return;
    showToast(route.params.flashMessage, route.params.flashTone ?? "success");
    navigation.setParams({ flashMessage: undefined, flashTone: undefined });
  }, [navigation, route.params?.flashMessage, route.params?.flashTone, showToast]);

  // When opened via notification tap, auto-open the most recent activity for that student
  const openStudentId = route.params?.openStudentId;
  useEffect(() => {
    if (!openStudentId || activities.length === 0) return;
    const match = activities.find((a) => a.metadata?.student_id === openStudentId);
    if (match) {
      setSelectedActivity(match);
      navigation.setParams({ openStudentId: undefined });
    }
  }, [openStudentId, activities, navigation]);

  useEffect(() => {
    const loopOne = Animated.loop(
      Animated.sequence([
        Animated.timing(heroGlowOne, { toValue: 12, duration: 3800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(heroGlowOne, { toValue: -10, duration: 3800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const loopTwo = Animated.loop(
      Animated.sequence([
        Animated.timing(heroGlowTwo, { toValue: -12, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(heroGlowTwo, { toValue: 10, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loopOne.start();
    loopTwo.start();
    return () => {
      loopOne.stop();
      loopTwo.stop();
    };
  }, [heroGlowOne, heroGlowTwo]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Not logged in");

      setCurrentUserId(user.id);

      const { data: me, error: meError } = await (supabase.from("teachers") as any)
        .select("user_id, name, role, plan")
        .eq("user_id", user.id)
        .maybeSingle();

      if (meError) throw meError;

      const admin = (me?.role ?? "").toLowerCase().trim() === "admin";
      setIsAdmin(admin);
      const coerced = coercePlanForRole(me?.role ?? "teacher", me?.plan ?? "Basic");
      setPlanName(normalizePlanUi(coerced));

      let query = (supabase.from("students") as any)
        .select("*, assigned_lessons, assigned_tests, teacher:teachers(name)")
        .order("created_at", { ascending: false });

      if (!admin) {
        query = query.eq("teacher_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const loadedStudents = (data ?? []) as StudentRow[];
      setStudents(loadedStudents);

      // Try direct progress reads first for teacher/admin views, then fall back to API routes.
      const studentIds = loadedStudents.map((s) => s.id);
      let sessionActivities: ActivityRow[] = [];

      if (studentIds.length > 0) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";
        const nameMap = new Map(loadedStudents.map((s) => [s.id, s.name]));

        const progressRowsByStudent = new Map<string, StudentProgressRow>();

        try {
          const { data: progressData, error: progressError } = await (supabase.from("student_game_progress") as any)
            .select("student_id, practice_history, test_history")
            .in("student_id", studentIds);

          if (!progressError && Array.isArray(progressData)) {
            for (const row of progressData) {
              const sid = typeof row?.student_id === "string" ? row.student_id : null;
              if (!sid) continue;
              const normalized = normalizeProgressPayload(row);
              progressRowsByStudent.set(sid, {
                student_id: sid,
                practiceHistory: normalized.practiceHistory,
                testHistory: normalized.testHistory,
              });
            }
          }
        } catch {
          // Direct table access can be blocked by RLS depending on role.
        }

        const missingStudentIds = studentIds.filter((sid) => !progressRowsByStudent.has(sid));
        if (missingStudentIds.length > 0) {
          const fallbackRows = await Promise.all(
            missingStudentIds.map((sid) => fetchStudentProgressViaApi(sid, token, admin))
          );
          for (const row of fallbackRows) {
            if (!row) continue;
            progressRowsByStudent.set(row.student_id, row);
          }
        }

        for (const row of progressRowsByStudent.values()) {
          if (!row) continue;
          const name = nameMap.get(row.student_id) ?? "Student";
          sessionActivities.push(...buildActivitiesFromProgress(row.student_id, name, row));
        }
        sessionActivities.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        if (sessionActivities.length === 0) {
          try {
            const { data: notificationData, error: notificationError } = await (supabase.from("teacher_notifications") as any)
              .select("id, type, title, body, metadata, created_at")
              .in("type", ["lesson_completed", "test_completed"])
              .order("created_at", { ascending: false })
              .limit(100);

            if (!notificationError && Array.isArray(notificationData)) {
              sessionActivities = buildActivitiesFromNotifications(
                notificationData as TeacherActivityNotificationRow[],
                nameMap
              ).filter((activity) => {
                const sid = typeof activity.metadata?.student_id === "string" ? activity.metadata.student_id : null;
                return sid ? studentIds.includes(sid) : true;
              });
            }
          } catch {
            // Notification fallback is best-effort.
          }
        }
      }

      setActivities(sessionActivities.slice(0, 100));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load students";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStudents();
    }, [loadStudents])
  );

  const studentLimit = useMemo(() => getStudentLimitForPlan(planName), [planName]);
  const isUnlimited = isAdmin || studentLimit >= 999;

  const activeCount = useMemo(
    () => students.filter((s) => s.is_active !== false).length,
    [students]
  );
  const totalRecordCount = students.length;
  const isMaxed = !isUnlimited && activeCount >= studentLimit;

  const otherTeachers = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, { name: string; count: number }>();
    for (const s of students) {
      const tid = s.teacher_id;
      const tname = (s.teacher as { name?: string } | null)?.name;
      if (tid && tname && tid !== currentUserId) {
        const existing = map.get(tid);
        map.set(tid, { name: tname, count: (existing?.count ?? 0) + 1 });
      }
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, isAdmin, currentUserId]);

  const studentsForView = useMemo(() => {
    if (!isAdmin) return students;
    if (teacherView === "mine") return students.filter((s) => s.teacher_id === currentUserId);
    return students.filter((s) => s.teacher_id === teacherView);
  }, [students, isAdmin, teacherView, currentUserId]);

  const viewingOtherTeacher = isAdmin && teacherView !== "mine";

  const cycleSort = (key: SortKey) => {
    layoutEase();
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  };

  const filteredSorted = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const base = studentsForView.filter((s) => (s.name ?? "").toLowerCase().includes(q));
    return [...base].sort((a, b) => {
      const av = (a as any)[sortKey] ?? "";
      const bv = (b as any)[sortKey] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [studentsForView, searchTerm, sortKey, sortDir]);

  const viewStudentIds = useMemo(
    () => new Set(studentsForView.map((s) => s.id)),
    [studentsForView]
  );

  const filteredActivities = useMemo(() => {
    let base = activities;
    // When admin is filtering by a specific teacher, restrict to that teacher's students
    if (isAdmin) {
      base = base.filter((a) => {
        const sid = typeof a.metadata?.student_id === "string" ? a.metadata.student_id : null;
        return sid ? viewStudentIds.has(sid) : true;
      });
    }
    const q = activitySearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter((a) => {
      const name = typeof a.metadata?.student_name === "string" ? a.metadata.student_name.toLowerCase() : "";
      return name.includes(q);
    });
  }, [activities, isAdmin, viewStudentIds, activitySearch]);

  const openActivity = useCallback(async (activity: ActivityRow) => {
    const existingIssues = Array.isArray(activity.metadata?.issues) ? activity.metadata.issues : [];
    if (existingIssues.length > 0) {
      setSelectedActivity(activity);
      return;
    }

    const studentId = typeof activity.metadata?.student_id === "string" ? activity.metadata.student_id : null;
    const student = studentId ? students.find((row) => row.id === studentId) ?? null : null;
    if (!student || !student.code) {
      setSelectedActivity(activity);
      return;
    }

    setActivityDetailLoadingId(activity.id);
    try {
      let detailedRows = activityProgressCacheRef.current.get(student.id);

      if (!detailedRows) {
        let sessionId = activitySessionIdCacheRef.current.get(student.id);
        if (!sessionId) {
          const response = await fetch(`${apiBaseUrl}/api/students/verify-access-code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessCode: student.code.trim().toUpperCase() }),
          });
          let result: VerifyAccessCodeResponse | null = null;
          try {
            result = (await response.json()) as VerifyAccessCodeResponse;
          } catch {
            result = null;
          }
          sessionId = result?.session?.id?.trim() || "";
          if (!response.ok || !sessionId) throw new Error(result?.error || "Could not load session details.");
          activitySessionIdCacheRef.current.set(student.id, sessionId);
        }

        const progress = await getRemoteProgress(sessionId);
        if (progress) {
          detailedRows = buildActivitiesFromProgress(student.id, student.name, progress);
          activityProgressCacheRef.current.set(student.id, detailedRows);
        }
      }

      const detailedActivity = detailedRows ? findMatchingDetailedActivity(detailedRows, activity) : null;
      if (detailedActivity) {
        const mergedActivity: ActivityRow = {
          ...activity,
          metadata: {
            ...(activity.metadata ?? {}),
            ...(detailedActivity.metadata ?? {}),
            student_id: activity.metadata?.student_id ?? detailedActivity.metadata?.student_id,
            student_name: activity.metadata?.student_name ?? detailedActivity.metadata?.student_name,
          },
        };
        setActivities((prev) => prev.map((row) => (row.id === activity.id ? mergedActivity : row)));
        setSelectedActivity(mergedActivity);
        return;
      }
    } catch {
      // Fall back to the summary row if detailed progress is unavailable.
    } finally {
      setActivityDetailLoadingId((current) => (current === activity.id ? null : current));
    }

    setSelectedActivity(activity);
  }, [students]);

  const copyCode = async (code: string) => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      showToast("Access code copied", "success");
    } catch {
      showToast("Could not copy access code.", "danger");
    }
  };

  const handleToggleStatus = async (student: StudentRow) => {
    const currentlyActive = student.is_active !== false;
    const newStatus = !currentlyActive;
    if (newStatus && isMaxed && !isAdmin) {
      showToast(`You can have up to ${studentLimit} active students. Deactivate another student first.`, "danger");
      return;
    }
    setToggleLoadingId(student.id);
    try {
      const { error } = await (supabase.from("students") as any)
        .update({ is_active: newStatus })
        .eq("id", student.id);
      if (error) throw error;
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, is_active: newStatus } : s))
      );
      showToast(newStatus ? `${student.name} activated` : `${student.name} deactivated`, "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed to update status", "danger");
    } finally {
      setToggleLoadingId(null);
    }
  };

  const handleDelete = (student: StudentRow) => {
    Alert.alert("Delete student", `Remove "${student.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleteLoadingId(student.id);
          try {
            const { error } = await supabase.from("students").delete().eq("id", student.id);
            if (error) throw error;
            setStudents((prev) => prev.filter((s) => s.id !== student.id));
            showToast("Student removed", "success");
          } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : "Delete failed", "danger");
          } finally {
            setDeleteLoadingId(null);
          }
        },
      },
    ]);
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceGlass,
  };

  if (loading && students.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <SkeletonLoader count={6} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          backgroundColor: theme.isDark ? theme.colors.background : "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          paddingTop: Math.max(insets.top, 8),
          paddingBottom: 10,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.navigate("Dashboard", { openDrawer: true })}
          style={{
            height: 44,
            width: 44,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceGlass,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
        <View style={{ flex: 1, paddingHorizontal: 10 }}>
          <Text style={theme.typography.label}>Directory</Text>
          <Text style={[theme.typography.title, { marginTop: 2, fontSize: 18, lineHeight: 22 }]}>Students</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate("Notifications")}
          activeOpacity={0.85}
          style={{ height: 44, width: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceGlass, alignItems: "center", justifyContent: "center", marginRight: 8 }}
        >
          <Ionicons name="notifications-outline" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
        {isMaxed && !isAdmin ? (
          <View style={{ alignItems: "flex-end" }}>
            <View style={{ opacity: 0.7, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceGlass }}>
              <Text style={{ fontSize: 10, fontWeight: "800" }}>MAX</Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => navigation.navigate("StudentForm")}
            activeOpacity={0.85}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: theme.colors.success,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              shadowColor: theme.colors.success,
              shadowOpacity: 0.22,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }}
          >
            <Ionicons name="add" size={15} color={"#FFFFFF"} />
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 12, letterSpacing: 0.4 }}>NEW</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        contentContainerStyle={{
          paddingTop: Math.max(insets.top, 8) + 62,
          paddingHorizontal: 20,
          paddingBottom: 40,
        }}
      >
        <ScreenReveal delay={30}>
        <GlassCard style={{ borderRadius: 18, marginBottom: 14, overflow: "hidden" }} padding={16}>
          <View style={{ position: "relative", overflow: "hidden" }}>
            <GlowOrb size={150} color={theme.colors.successSoft} top={-50} right={-18} translate={heroGlowOne} />
            <GlowOrb size={110} color={theme.colors.successSoft} bottom={-30} left={-10} translate={heroGlowTwo} />
            <Text style={[theme.typography.title, { fontSize: 22 }]}>Students directory</Text>
            <Text style={[theme.typography.body, { marginTop: 8, color: theme.colors.textMuted }]}>
              {isAdmin
                ? "Global student management for all teachers."
                : `Managing ${activeCount} active students. Cap: ${isUnlimited ? "∞" : `${activeCount} / ${studentLimit}`}.`}
            </Text>
          </View>
        </GlassCard>
        </ScreenReveal>

        <ScreenReveal delay={90}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          {isAdmin ? (
            <>
              <KpiTile theme={theme} label="Total" value={String(totalRecordCount)} icon="people-outline" />
              <KpiTile theme={theme} label="Active" value={String(activeCount)} icon="checkmark-circle-outline" tone="success" />
            </>
          ) : (
            <>
              <KpiTile
                theme={theme}
                label="Student cap"
                value={`${activeCount}/${isUnlimited ? "∞" : studentLimit}`}
                icon="people-outline"
                danger={isMaxed}
              />
            </>
          )}
        </View>
        </ScreenReveal>

        {!isAdmin && planName === "Basic" ? (
          <GlassCard style={{ borderRadius: 18, marginBottom: 14 }} padding={14}>
            <Text style={theme.typography.bodyStrong}>You are on the Basic plan</Text>
            <Text style={[theme.typography.caption, { marginTop: 6, color: theme.colors.textMuted }]}>
              Basic includes full lessons, tests, AI tools, and 1 active student. Upgrade when you need more seats.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("Subscription")}
              activeOpacity={0.85}
              style={{
                marginTop: 12,
                alignSelf: "flex-start",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: theme.colors.successSoft,
                borderWidth: 1,
                borderColor: theme.colors.success,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ionicons name="diamond-outline" size={14} color={theme.colors.success} />
              <Text style={{ color: theme.colors.success, fontWeight: "800", fontSize: 13 }}>View plans</Text>
            </TouchableOpacity>
          </GlassCard>
        ) : null}

        <ScreenReveal delay={150}>
        <GlassCard style={{ borderRadius: 18 }} padding={16}>
          {isAdmin ? (
            <View style={{ marginBottom: 14 }}>
              <Text style={[theme.typography.caption, { marginBottom: 8, textTransform: "uppercase" }]}>Filter by teacher</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <AnimatedPressable
                  onPress={() => setTeacherView("mine")}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: teacherView === "mine" ? theme.colors.success : theme.colors.border,
                    backgroundColor: teacherView === "mine" ? theme.colors.success : theme.colors.surfaceGlass,
                    flexDirection: "row", alignItems: "center", gap: 5,
                    shadowColor: teacherView === "mine" ? theme.colors.success : "transparent",
                    shadowOpacity: teacherView === "mine" ? 0.2 : 0,
                    shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: teacherView === "mine" ? 2 : 0,
                  }}
                >
                  {teacherView === "mine" && <Ionicons name="checkmark" size={13} color={"#FFFFFF"} />}
                  <Text style={{ fontWeight: "800", fontSize: 12, color: teacherView === "mine" ? "#FFFFFF" : theme.colors.text }}>My students</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => setTeacherMenuOpen(true)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: viewingOtherTeacher ? theme.colors.success : theme.colors.border,
                    backgroundColor: viewingOtherTeacher ? theme.colors.success : theme.colors.surfaceGlass,
                    flexDirection: "row", alignItems: "center", gap: 5,
                    shadowColor: viewingOtherTeacher ? theme.colors.success : "transparent",
                    shadowOpacity: viewingOtherTeacher ? 0.2 : 0,
                    shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: viewingOtherTeacher ? 2 : 0,
                  }}
                >
                  {viewingOtherTeacher && <Ionicons name="checkmark" size={13} color={"#FFFFFF"} />}
                  <Text style={{ fontWeight: "800", fontSize: 12, color: viewingOtherTeacher ? "#FFFFFF" : theme.colors.text }}>
                    {viewingOtherTeacher
                      ? otherTeachers.find((t) => t.id === teacherView)?.name ?? "Teacher"
                      : "Other teacher…"}
                  </Text>
                </AnimatedPressable>
                {viewingOtherTeacher ? (
                  <TouchableOpacity onPress={() => setTeacherView("mine")} style={{ justifyContent: "center" }}>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}

          <TextInput
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search students…"
            placeholderTextColor={theme.colors.textMuted}
            style={[inputStyle, { marginBottom: 12 }]}
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {(
              [
                { key: "name" as SortKey, label: "Name" },
                { key: "last_active" as SortKey, label: "Last active" },
                { key: "created_at" as SortKey, label: "Created" },
              ] as const
            ).map(({ key, label }) => {
              const active = sortKey === key;
              return (
                <AnimatedPressable
                  key={key}
                  onPress={() => cycleSort(key)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.success : theme.colors.border,
                    backgroundColor: active ? theme.colors.success : theme.colors.surfaceGlass,
                    gap: 5,
                    shadowColor: active ? theme.colors.success : "transparent",
                    shadowOpacity: active ? 0.18 : 0,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: active ? 2 : 0,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "800", color: active ? "#FFFFFF" : theme.colors.text }}>{label}</Text>
                  {active ? (
                    <Ionicons
                      name={sortDir === "asc" ? "arrow-up" : "arrow-down"}
                      size={13}
                      color={"#FFFFFF"}
                    />
                  ) : (
                    <Ionicons name="swap-vertical-outline" size={13} color={theme.colors.textMuted} />
                  )}
                </AnimatedPressable>
              );
            })}
          </View>

          {studentsForView.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <IconTile icon="school-outline" size={74} iconSize={30} radius={24} backgroundColor={theme.colors.successSoft} borderColor={theme.colors.success} color={theme.colors.success} />
              <Text style={[theme.typography.title, { marginTop: 16, fontSize: 20, lineHeight: 24 }]}>No students found</Text>
              <Text style={[theme.typography.body, { marginTop: 8, color: theme.colors.textMuted, textAlign: "center", maxWidth: 280 }]}>Add your first student or clear the current search and teacher filters to bring results back into view.</Text>
              {!isMaxed || isAdmin ? (
                <View style={{ flexDirection: "row", marginTop: 16, gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate("StudentForm")}
                    activeOpacity={0.85}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                      borderRadius: 14,
                      backgroundColor: theme.colors.success,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      shadowColor: theme.colors.success,
                      shadowOpacity: 0.18,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 5 },
                      elevation: 3,
                    }}
                  >
                    <Ionicons name="person-add-outline" size={15} color={"#FFFFFF"} />
                    <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}>Add student</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setSearchTerm("");
                      setTeacherView("mine");
                    }}
                    activeOpacity={0.85}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                      borderRadius: 14,
                      backgroundColor: theme.colors.surfaceGlass,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Ionicons name="close-circle-outline" size={15} color={theme.colors.textMuted} />
                    <Text style={{ color: theme.colors.text, fontWeight: "700", fontSize: 13 }}>Clear filters</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : filteredSorted.length === 0 ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <Text style={theme.typography.body}>No match for "{searchTerm}"</Text>
              <TouchableOpacity
                onPress={() => setSearchTerm("")}
                activeOpacity={0.85}
                style={{
                  marginTop: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: theme.colors.successSoft,
                  borderWidth: 1,
                  borderColor: theme.colors.success,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ionicons name="close-circle-outline" size={14} color={theme.colors.success} />
                <Text style={{ color: theme.colors.success, fontWeight: "700", fontSize: 13 }}>Clear search</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredSorted.map((student, index) => {
              const isActive = student.is_active !== false;
              return (
                <ScreenReveal key={student.id} delay={index * 45}>
                  <AnimatedPressable
                    onPress={() => navigation.navigate("StudentForm", { studentId: student.id })}
                    style={{
                      marginBottom: 12,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.isDark ? theme.colors.surfaceGlass : "#FFFFFF",
                      overflow: "hidden",
                      opacity: isActive ? 1 : 0.72,
                      shadowColor: "#000",
                      shadowOpacity: theme.isDark ? 0.06 : 0.07,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 2,
                    }}
                  >
                    <View style={{ height: 3, backgroundColor: isActive ? theme.colors.success : theme.colors.border, opacity: isActive ? 0.7 : 0.4 }} />
                    <View style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <View style={{
                          height: 46, width: 46, borderRadius: 17,
                          backgroundColor: isActive ? theme.colors.successSoft : theme.colors.surfaceAlt,
                          alignItems: "center", justifyContent: "center",
                          borderWidth: 1,
                          borderColor: isActive ? theme.colors.success : theme.colors.border,
                        }}>
                          <Text style={{ fontSize: 18, fontWeight: "900", color: isActive ? theme.colors.success : theme.colors.textMuted }}>
                            {student.name.trim().charAt(0).toUpperCase()}
                          </Text>
                        </View>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 15, fontWeight: "900", color: theme.colors.text }} numberOfLines={1}>
                            {student.name}
                          </Text>
                          <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 3 }}>
                            Last active: {formatShortDate(student.last_active)}
                          </Text>
                        </View>

                        <TouchableOpacity
                          onPress={() => copyCode(student.code)}
                          style={{
                            borderRadius: 999, borderWidth: 1,
                            borderColor: theme.colors.border,
                            backgroundColor: theme.colors.surfaceGlass,
                            paddingHorizontal: 10, paddingVertical: 6,
                            flexDirection: "row", alignItems: "center", gap: 5,
                          }}
                        >
                          <Text style={{ fontFamily: "monospace", fontWeight: "900", fontSize: 15, color: theme.colors.success }}>
                              {student.code}
                            </Text>
                            <Ionicons name="copy-outline" size={18} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, flexWrap: "wrap" }}>

                          <View style={{
                            borderRadius: 999, borderWidth: 1,
                            borderColor: "rgba(14,165,233,0.35)",
                            backgroundColor: "rgba(14,165,233,0.10)",
                            paddingHorizontal: 8, paddingVertical: 4,
                            flexDirection: "row", alignItems: "center", gap: 4,
                          }}>
                            <Ionicons name="book-outline" size={10} color="#0284C7" />
                            <Text style={{ fontSize: 10, fontWeight: "800", color: "#0284C7" }}>
                              {(student.assigned_lessons ?? []).length} lessons
                            </Text>
                          </View>

                          <View style={{
                            borderRadius: 999, borderWidth: 1,
                            borderColor: "rgba(139,92,246,0.35)",
                            backgroundColor: "rgba(139,92,246,0.10)",
                            paddingHorizontal: 8, paddingVertical: 4,
                            flexDirection: "row", alignItems: "center", gap: 4,
                          }}>
                            <Ionicons name="clipboard-outline" size={10} color="#7C3AED" />
                            <Text style={{ fontSize: 10, fontWeight: "800", color: "#7C3AED" }}>
                              {(student.assigned_tests ?? []).length} tests
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <TouchableOpacity
                            onPress={() => navigation.navigate("StudentForm", { studentId: student.id })}
                            style={{
                              borderRadius: 11,
                              backgroundColor: theme.colors.successSoft,
                              borderWidth: 1, borderColor: theme.colors.success,
                              paddingHorizontal: 14, paddingVertical: 8,
                              flexDirection: "row", alignItems: "center", gap: 5,
                            }}
                          >
                            <Ionicons name="pencil-outline" size={13} color={theme.colors.success} />
                            <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.success }}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDelete(student)}
                            disabled={deleteLoadingId === student.id}
                            style={{
                              width: 36, height: 36, borderRadius: 11,
                              borderWidth: 1, borderColor: theme.colors.danger,
                              backgroundColor: theme.isDark ? "rgba(239,68,68,0.12)" : "#FFF6F6",
                              opacity: deleteLoadingId === student.id ? 0.6 : 1,
                              alignItems: "center", justifyContent: "center",
                            }}
                          >
                            {deleteLoadingId === student.id ? (
                              <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.danger }}>...</Text>
                            ) : (
                              <Ionicons name="trash-outline" size={14} color={theme.colors.danger} />
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </AnimatedPressable>
                </ScreenReveal>
              );
            })
          )}
        </GlassCard>
        </ScreenReveal>

        <ScreenReveal delay={210}>
        <GlassCard style={{ borderRadius: 18, marginTop: 14 }} padding={0}>
          {/* Header */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.colors.successSoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="time-outline" size={16} color={theme.colors.success} />
              </View>
              <View>
                <Text style={[theme.typography.bodyStrong, { fontSize: 15 }]}>Recent Activity</Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 1 }]}>
                  Session completions across your students
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, backgroundColor: theme.colors.surfaceGlass, paddingHorizontal: 10, gap: 6 }}>
              <Ionicons name="search-outline" size={14} color={theme.colors.textMuted} />
              <TextInput
                value={activitySearch}
                onChangeText={setActivitySearch}
                placeholder="Search by student name…"
                placeholderTextColor={theme.colors.textMuted}
                style={{ flex: 1, paddingVertical: 9, fontSize: 13, color: theme.colors.text }}
              />
              {activitySearch.length > 0 && (
                <TouchableOpacity onPress={() => setActivitySearch("")}>
                  <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Column headers */}
          <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingVertical: 9, backgroundColor: theme.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)", borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
            <Text style={{ flex: 2, fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Student</Text>
            <Text style={{ flex: 2, fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Lesson / Test</Text>
            <Text style={{ flex: 1, fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>Result</Text>
          </View>

          {/* Rows */}
          {filteredActivities.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
              <Ionicons name="time-outline" size={28} color={theme.colors.textMuted} />
              <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>
                {activitySearch.trim() ? `No results for "${activitySearch.trim()}"` : "No activity yet"}
              </Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, textAlign: "center", maxWidth: 260 }]}>
                {activitySearch.trim() ? "Try a different name." : "Completed lessons and tests will appear here."}
              </Text>
            </View>
          ) : (
            filteredActivities.map((activity, index) => {
              const meta = activity.metadata ?? {};
              const studentName = typeof meta.student_name === "string" ? meta.student_name : "Student";
              const contentName =
                typeof meta.lesson_name === "string" ? meta.lesson_name :
                typeof meta.test_name === "string" ? meta.test_name :
                activity.title;
              const isTest = activity.type === "test_completed";
              const percentage = typeof meta.percentage === "number" ? meta.percentage : null;
              const passed = typeof meta.passed === "boolean" ? meta.passed : null;
              const score = typeof meta.score === "number" ? meta.score : null;
              const total = typeof meta.total === "number" ? meta.total : null;
              const isResolvingDetails = activityDetailLoadingId === activity.id;
              const outcomeCounts = getActivityOutcomeCounts(meta);
              const correctCount = outcomeCounts.correct;
              const wrongCount = outcomeCounts.wrong;
              const closeCount = outcomeCounts.close;

              const resultColor = percentage !== null
                ? (percentage >= 80 ? theme.colors.success : percentage >= 50 ? "#D97706" : theme.colors.danger)
                : theme.colors.textMuted;

              return (
                <TouchableOpacity
                  key={activity.id}
                  onPress={() => { openActivity(activity).catch(() => {}); }}
                  activeOpacity={0.75}
                  disabled={isResolvingDetails}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: index < filteredActivities.length - 1 ? 1 : 0,
                    borderBottomColor: theme.colors.border,
                    backgroundColor: "transparent",
                    opacity: isResolvingDetails ? 0.7 : 1,
                  }}
                >
                  {/* Student name */}
                  <View style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: theme.colors.successSoft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.success }}>
                      <Text style={{ fontSize: 11, fontWeight: "900", color: theme.colors.success }}>
                        {studentName.trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: theme.colors.text }} numberOfLines={1}>{studentName}</Text>
                      <Text style={{ fontSize: 10, color: theme.colors.textMuted, marginTop: 1 }}>{formatShortDate(activity.created_at)}</Text>
                    </View>
                  </View>

                  {/* Lesson / Test name */}
                  <View style={{ flex: 2, paddingRight: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons
                        name={isTest ? "clipboard-outline" : "book-outline"}
                        size={10}
                        color={isTest ? "#7C3AED" : "#0284C7"}
                      />
                      <Text style={{ fontSize: 10, fontWeight: "800", color: isTest ? "#7C3AED" : "#0284C7", textTransform: "uppercase" }}>
                        {isTest ? "Test" : "Lesson"}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: theme.colors.text, marginTop: 2 }} numberOfLines={2}>{contentName}</Text>
                  </View>

                  {/* Result badge */}
                  <View style={{ flex: 1, alignItems: "center", gap: 4 }}>
                    <View style={{ width: "100%", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <Ionicons name="checkmark-circle" size={13} color={theme.colors.success} />
                        <Text style={{ fontSize: 12, fontWeight: "800", color: theme.colors.success }}>{correctCount}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <Ionicons name="remove-circle" size={13} color="#D97706" />
                        <Text style={{ fontSize: 12, fontWeight: "800", color: "#D97706" }}>{closeCount}</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <Ionicons name="close-circle" size={13} color={theme.colors.danger} />
                        <Text style={{ fontSize: 12, fontWeight: "800", color: theme.colors.danger }}>{wrongCount}</Text>
                      </View>
                    </View>
                    {percentage !== null && (
                      <Text style={{ fontSize: 13, fontWeight: "900", color: resultColor, textAlign: "center" }}>{percentage}%</Text>
                    )}
                    {score !== null && total !== null && (
                      <Text style={{ fontSize: 9, fontWeight: "700", color: resultColor, textAlign: "center" }}>{score}/{total}</Text>
                    )}
                    {isResolvingDetails ? (
                      <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.textMuted }}>Loading…</Text>
                    ) : (
                      <Ionicons name="chevron-forward" size={12} color={theme.colors.textMuted} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </GlassCard>
        </ScreenReveal>
      </ScrollView>

      {/* Activity detail modal */}
      <Modal
        visible={!!selectedActivity}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedActivity(null)}
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
              onPress={() => setSelectedActivity(null)}
            />
            <View>
              <ScreenReveal delay={20} distance={22} scaleFrom={0.98}>
                <GlassCard style={{ borderRadius: 24, overflow: "hidden", maxHeight: "100%" }} padding={0} variant="strong">
              {selectedActivity && (() => {
                const meta = selectedActivity.metadata ?? {};
                const studentName = typeof meta.student_name === "string" ? meta.student_name : "Student";
                const contentName =
                  typeof meta.lesson_name === "string" ? meta.lesson_name :
                  typeof meta.test_name === "string" ? meta.test_name :
                  selectedActivity.title;
                const isTest = selectedActivity.type === "test_completed";
                const percentage = typeof meta.percentage === "number" ? meta.percentage : null;
                const score = typeof meta.score === "number" ? meta.score : null;
                const total = typeof meta.total === "number" ? meta.total : null;
                const issues: ActivityIssue[] = Array.isArray(meta.issues) ? meta.issues : [];
                const outcomeCounts = getActivityOutcomeCounts(meta);
                const mode = typeof meta.mode === "string" ? meta.mode : null;
                const directionLabel =
                  meta.direction === "pt-en" || meta.direction === "en-pt"
                    ? historyDirectionLabel(meta.direction, meta.language_pair, meta.lesson_language)
                    : null;

                const resultColor = percentage !== null
                  ? (percentage >= 80 ? theme.colors.success : percentage >= 50 ? "#D97706" : theme.colors.danger)
                  : theme.colors.text;

                return (
                  <>
                    {/* Header */}
                    <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={[theme.typography.title, { fontSize: 18 }]}>{isTest ? "Test review" : "Lesson review"}</Text>
                        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 3 }]}>
                          {isTest ? "Test" : "Lesson"} • {contentName}
                        </Text>
                        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                          {selectedActivity.created_at ? new Date(selectedActivity.created_at).toLocaleDateString() : "Past attempt"}
                        </Text>
                      </View>
                      {percentage !== null ? (
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={[theme.typography.title, { fontSize: 24, color: resultColor }]}>{percentage}%</Text>
                          {score !== null && total !== null && (
                            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                              {score}/{total} correct
                            </Text>
                          )}
                        </View>
                      ) : null}
                    </View>

                    {/* Tags row */}
                    <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {mode ? (
                        <View style={{ borderRadius: 999, borderWidth: 1, borderColor: "#B7D0E8", backgroundColor: "#EAF3FB", paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, fontWeight: "900", color: "#2E7ABF" }}>{mode.replace("-", " ")}</Text>
                        </View>
                      ) : null}
                      {directionLabel ? (
                        <View style={{ borderRadius: 999, borderWidth: 1, borderColor: "#B7D0E8", backgroundColor: "#EAF3FB", paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, fontWeight: "900", color: "#2E7ABF" }}>{directionLabel}</Text>
                        </View>
                      ) : null}
                      {total !== null ? (
                        <View style={{ borderRadius: 999, borderWidth: 1, borderColor: "#E6D39A", backgroundColor: "#FFF5DA", paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, fontWeight: "900", color: "#B88400" }}>{total}Q</Text>
                        </View>
                      ) : null}
                      <View style={{ borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 10, fontWeight: "900", color: theme.colors.text }}>{studentName}</Text>
                      </View>
                      <View style={{ borderRadius: 999, borderWidth: 1, borderColor: isTest ? "rgba(139,92,246,0.35)" : "rgba(14,165,233,0.35)", backgroundColor: isTest ? "rgba(139,92,246,0.08)" : "rgba(14,165,233,0.08)", paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 10, fontWeight: "900", color: isTest ? "#7C3AED" : "#0284C7" }}>{isTest ? "Test" : "Lesson"}</Text>
                      </View>
                    </View>

                    <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.success, backgroundColor: theme.colors.successSoft, paddingVertical: 10, alignItems: "center" }}>
                        <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.success }}>RIGHT</Text>
                        <Text style={{ fontSize: 18, fontWeight: "900", color: theme.colors.success, marginTop: 2 }}>{outcomeCounts.correct}</Text>
                      </View>
                      <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: "#F3C679", backgroundColor: "#FFF5DA", paddingVertical: 10, alignItems: "center" }}>
                        <Text style={{ fontSize: 10, fontWeight: "800", color: "#D97706" }}>CLOSE</Text>
                        <Text style={{ fontSize: 18, fontWeight: "900", color: "#D97706", marginTop: 2 }}>{outcomeCounts.close}</Text>
                      </View>
                      <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.danger, backgroundColor: theme.isDark ? "rgba(239,68,68,0.12)" : "#FFF6F6", paddingVertical: 10, alignItems: "center" }}>
                        <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.danger }}>WRONG</Text>
                        <Text style={{ fontSize: 18, fontWeight: "900", color: theme.colors.danger, marginTop: 2 }}>{outcomeCounts.wrong}</Text>
                      </View>
                    </View>

                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                      style={{ maxHeight: reviewViewportMaxHeight }}
                      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
                    >
                      {issues.length > 0 ? (
                        <View>
                          <Text style={[theme.typography.label, { marginBottom: 8 }]}>Question Review</Text>
                          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 }}>
                            {issues.map((issue, i) => {
                              const iconColor = activityIssueColor(theme.colors, issue.kind);
                              return (
                                <View
                                  key={issue.id ?? i}
                                  style={{
                                    width: "48.5%",
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: theme.colors.border,
                                    backgroundColor: theme.colors.surfaceGlass,
                                    padding: 9,
                                  }}
                                >
                                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                    <Ionicons name={activityIssueIcon(issue.kind)} size={14} color={iconColor} />
                                    <Text style={[theme.typography.bodyStrong, { fontSize: 11.5 }]} numberOfLines={1}>
                                      {activityIssueLabel(issue.kind)}
                                    </Text>
                                  </View>
                                  <Text style={[theme.typography.body, { marginTop: 4, fontSize: 12 }]} numberOfLines={2}>
                                    P: {typeof issue.prompt === "string" ? issue.prompt || "Untitled" : "Untitled"}
                                  </Text>
                                  {typeof issue.expected === "string" && issue.expected ? (
                                    <Text style={[theme.typography.caption, { marginTop: 2, color: theme.colors.textMuted }]} numberOfLines={1}>
                                      E: {issue.expected}
                                    </Text>
                                  ) : null}
                                  {typeof issue.answer === "string" && issue.answer ? (
                                    <Text style={[theme.typography.caption, { marginTop: 1, color: theme.colors.textMuted }]} numberOfLines={1}>
                                      A: {issue.answer}
                                    </Text>
                                  ) : null}
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      ) : (
                        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                          Question details were not saved for this session.
                        </Text>
                      )}
                    </ScrollView>

                    <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surfaceGlass }}>
                      <TouchableOpacity
                        onPress={() => setSelectedActivity(null)}
                        style={{ borderRadius: 14, backgroundColor: theme.colors.success, paddingVertical: 13, alignItems: "center" }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff" }}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
                </GlassCard>
              </ScreenReveal>
            </View>
          </View>
        </View>
      </Modal>

      {isAdmin && teacherMenuOpen ? (
        <View
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            top: Math.max(insets.top, 8) + 200,
            maxHeight: 320,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            zIndex: 100,
            paddingVertical: 8,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 8 }}>
            <Text style={theme.typography.bodyStrong}>Pick teacher</Text>
            <TouchableOpacity onPress={() => setTeacherMenuOpen(false)}>
              <Ionicons name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 260 }}>
            {otherTeachers.length === 0 ? (
              <Text style={{ padding: 16, color: theme.colors.textMuted }}>No other teachers with students.</Text>
            ) : (
              otherTeachers.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => {
                    setTeacherView(t.id);
                    setTeacherMenuOpen(false);
                  }}
                  style={{ paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
                >
                  <Text style={theme.typography.body}>{t.name}</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{t.count} students</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      ) : null}
      <FloatingToast {...toastProps} />
    </View>
  );
}

function KpiTile({
  theme,
  label,
  value,
  icon,
  tone,
  danger,
}: {
  theme: ReturnType<typeof useAppTheme>;
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: "success" | "danger";
  danger?: boolean;
}) {
  const bg =
    danger ? theme.colors.dangerSoft : tone === "success" ? theme.colors.successSoft : tone === "danger" ? theme.colors.dangerSoft : theme.colors.successSoft;
  const fg = danger ? theme.colors.danger : tone === "success" ? theme.colors.success : tone === "danger" ? theme.colors.danger : theme.colors.success;
  return (
    <View
      style={{
        flexGrow: 1,
        minWidth: "42%",
        flexBasis: "42%",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={22} color={fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[theme.typography.caption, { textTransform: "uppercase", fontSize: 10 }]}>{label}</Text>
        <Text style={[theme.typography.title, { fontSize: 22, marginTop: 2 }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

