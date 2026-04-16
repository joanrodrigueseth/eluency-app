import {
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Pressable, TouchableOpacity } from "../lib/hapticPressables";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { NavigationProp, RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
 
import AppButton from "../components/AppButton";
import GlassCard from "../components/GlassCard";
import { SkeletonBox } from "../components/SkeletonLoader";
import ThemeToggleButton from "../components/ThemeToggleButton";
import { getRemoteProgress } from "../lib/api/study";
import { triggerLightImpact } from "../lib/haptics";
import { getLanguageBadgeColors, normalizeLanguageBadge } from "../lib/languageBadges";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";
import type { StudyRecordIssue } from "../types/study-game";
 
type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  Notifications: undefined;
  Chats: undefined;
  SendNotifications: undefined;
  Teachers: undefined;
  Settings: { initialTab?: "profile" | "security" | "notifications" } | undefined;
  Subscription: undefined;
  LessonPacks: undefined;
  Lessons: undefined;
  LessonForm: { lessonId?: string } | undefined;
  Students: { openStudentId?: string } | undefined;
  StudentForm: { studentId?: string } | undefined;
  Tests: undefined;
  TestForm: { testId?: string } | undefined;
  StudyGame: { sessionId: string };
};
 
type RecentLesson = {
  id: string;
  title: string;
  slug?: string;
  status?: string;
  created_at: string;
  language?: string | null;
};
 
type RecentTest = {
  id: string;
  name: string;
  type?: string;
  status?: string;
  created_at: string;
  config_json?: { words?: unknown[]; tests?: unknown[] } | null;
  teacher_id?: string | null;
  created_by?: string | null;
  vocab_words_count?: number | null;
  question_count?: number | null;
  vocab_count?: number | null;
  questions_count?: number | null;
  vocabWordsCount?: number | null;
  questionCount?: number | null;
};
 
type TeacherCapacityItem = {
  id: string;
  name: string;
  created_at: string;
  student_limit: number;
  studentCount: number;
  percentage: number;
};

type ActivityTab = "lessons" | "tests" | "student_activity";

type StudentActivity = {
  id: string;
  studentId: string;
  studentName: string;
  contentName: string;
  isTest: boolean;
  percentage: number | null;
  score: number | null;
  total: number | null;
  issues?: ActivityIssue[];
  created_at: string;
};

type ActivityIssue = StudyRecordIssue;
 
type StudentSessionResponse = {
  student: {
    id: string;
    name: string;
    code: string;
    assigned_lessons: string[];
    assigned_tests: string[];
  };
  teacher: { id: string; name: string; email: string | null } | null;
  expires_at: string;
  error?: string;
};

type VerifyAccessCodeResponse = {
  error?: string;
  session?: {
    id?: string;
  };
};
 
function formatDateTime(dateIso?: string | null) {
  if (!dateIso) return "";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getStudentActivityTotal(rec: any, rawScore: any, rawAnswers: any[]) {
  if (typeof rec?.totalWords === "number") return rec.totalWords;
  if (typeof rec?.total_words === "number") return rec.total_words;
  if (typeof rec?.total === "number") return rec.total;
  if (typeof rawScore?.totalWords === "number") return rawScore.totalWords;
  if (typeof rawScore?.total_words === "number") return rawScore.total_words;
  if (typeof rawScore?.total === "number") return rawScore.total;
  if (rawAnswers.length > 0) return rawAnswers.length;

  const scoreParts = [rawScore?.correct, rawScore?.close, rawScore?.wrong].filter((value) => typeof value === "number") as number[];
  if (scoreParts.length > 0) return scoreParts.reduce((sum, value) => sum + value, 0);

  return null;
}

function normalizeStudentActivityProgressPayload(payload: any): { practiceHistory: any[]; testHistory: any[] } {
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

function normalizeStudentActivityMatchText(value: string | undefined | null) {
  return String(value ?? "").trim().toLowerCase();
}

function isGenericStudentActivityContentName(value: string | undefined | null) {
  const normalized = normalizeStudentActivityMatchText(value);
  return normalized.length === 0 || normalized === "test" || normalized === "lesson" || normalized === "a test" || normalized === "a lesson";
}

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
    return rawIssues.map((issue: any, index: number) => ({
      id: typeof issue.id === "string" ? issue.id : String(index),
      prompt: issue.prompt ?? "",
      expected: issue.expected ?? "",
      answer: typeof issue.answer === "string" ? issue.answer : undefined,
      kind: issue.kind as ActivityIssue["kind"],
    }));
  }

  if (rawAnswers.length > 0) {
    const kindMap: Record<string, ActivityIssue["kind"]> = {
      correct: "correct",
      close: "close",
      submitted: "open_review",
      wrong: "wrong",
    };

    return rawAnswers.map((answer: any, index: number) => {
      const word = answer.word && typeof answer.word === "object" ? answer.word : {};
      const rawPrompt = word.pt ?? word.en ?? word.sp ?? word.se ?? answer.prompt;
      const rawExpected = answer.correctAnswer ?? answer.expected;
      const rawUserAnswer = answer.userAnswer ?? answer.answer;

      return {
        id: String(index),
        prompt: typeof rawPrompt === "string" ? rawPrompt : "",
        expected: typeof rawExpected === "string" ? rawExpected : "",
        answer: typeof rawUserAnswer === "string" ? rawUserAnswer : undefined,
        kind: kindMap[answer.result] ?? (answer.kind as ActivityIssue["kind"]) ?? "wrong",
      };
    });
  }

  return [];
}

function getStudentActivityOutcomeCounts(activity: StudentActivity) {
  const issues = Array.isArray(activity.issues) ? activity.issues : [];
  if (issues.length > 0) {
    return {
      correct: issues.filter((issue) => issue.kind === "correct" || issue.kind === "open_review").length,
      close: issues.filter((issue) => issue.kind === "close").length,
      wrong: issues.filter((issue) => issue.kind === "wrong" || issue.kind === "skip").length,
    };
  }

  const correct = typeof activity.score === "number" ? activity.score : 0;
  const total = typeof activity.total === "number" ? activity.total : null;
  const close = 0;
  const wrong = total !== null ? Math.max(total - correct - close, 0) : 0;
  return { correct, close, wrong };
}

function findMatchingStudentActivity(candidates: StudentActivity[], target: StudentActivity): StudentActivity | null {
  const targetName = normalizeStudentActivityMatchText(target.contentName);
  const targetCreatedAt = new Date(target.created_at).getTime();

  const ranked = candidates
    .filter((candidate) => candidate.studentId === target.studentId && candidate.isTest === target.isTest)
    .map((candidate) => {
      const candidateName = normalizeStudentActivityMatchText(candidate.contentName);
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

function getStudentActivityResultLabel(item: StudentActivity) {
  const parts: string[] = [];

  if (item.percentage !== null) parts.push(`${item.percentage}%`);

  if (item.score !== null && item.total !== null) {
    parts.push(`${item.score}/${item.total}`);
  } else if (item.score !== null) {
    parts.push(`${item.score} correct`);
  }

  return parts.join(" • ") || "Result pending";
}
 
const reviewViewportMaxHeight = 488;

function buildStudentActivitiesFromProgress(studentId: string, studentName: string, progress: any): StudentActivity[] {
  if (!progress || typeof progress !== "object") return [];

  const normalized = normalizeStudentActivityProgressPayload(progress);
  const items: StudentActivity[] = [];

  const push = (records: any[], isTest: boolean) => {
    for (const rec of records ?? []) {
      const contentName =
        typeof rec.lessonName === "string" ? rec.lessonName :
        typeof rec.testName === "string" ? rec.testName :
        typeof rec.lessonTitle === "string" ? rec.lessonTitle :
        typeof rec.testTitle === "string" ? rec.testTitle :
        typeof rec.lesson_title === "string" ? rec.lesson_title :
        typeof rec.test_title === "string" ? rec.test_title :
        typeof rec.title === "string" ? rec.title :
        typeof rec.name === "string" ? rec.name :
        typeof rec.lesson?.name === "string" ? rec.lesson.name :
        typeof rec.lesson?.title === "string" ? rec.lesson.title :
        typeof rec.test?.name === "string" ? rec.test.name :
        typeof rec.test?.title === "string" ? rec.test.title : null;
      const rawScore = rec.score;
      const rawAnswers: any[] = Array.isArray(rawScore?.answers) ? rawScore.answers : [];
      const rawIssues: any[] = Array.isArray(rec.issues) ? rec.issues : [];
      const issues = normalizeIssues(rawIssues, rawAnswers);
      const correctCount = typeof rawScore === "number"
        ? rawScore
        : typeof rawScore?.correct === "number"
        ? rawScore.correct
        : rawAnswers.filter((answer: any) => answer.result === "correct").length;
      const totalWords = getStudentActivityTotal(rec, rawScore, rawAnswers);
      const pct: number | null =
        typeof rec.percentage === "number" ? rec.percentage :
        typeof rec.score_percentage === "number" ? rec.score_percentage :
        typeof rawScore?.percentage === "number" ? rawScore.percentage :
        totalWords != null && totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : null;
      const createdAt =
        typeof rec.date === "string" ? rec.date :
        typeof rec.timestamp === "number" ? new Date(rec.timestamp).toISOString() :
        typeof rec.timestamp === "string" ? rec.timestamp : new Date().toISOString();

      items.push({
        id: `${studentId}-${createdAt}-${isTest ? "t" : "l"}`,
        studentId,
        studentName,
        contentName: contentName ?? (isTest ? "Test" : "Lesson"),
        isTest,
        percentage: pct,
        score: correctCount >= 0 && totalWords != null ? correctCount : correctCount > 0 ? correctCount : null,
        total: totalWords,
        issues,
        created_at: createdAt,
      });
    }
  };

  push(normalized.practiceHistory, false);
  push(normalized.testHistory, true);

  return items;
}

function pickProgressColor(theme: ReturnType<typeof useAppTheme>, percentage: number) {
  if (percentage >= 90) return theme.colors.danger;
  if (percentage >= 70) return theme.colors.primary;
  return theme.colors.success;
}
 
function inferLessonLanguageBadge(lesson: RecentLesson) {
  if (lesson.language) return normalizeLanguageBadge(lesson.language);
 
  const haystack = `${lesson.title ?? ""} ${lesson.slug ?? ""}`.toUpperCase();
 
  if (haystack.includes("PORTUGUESE") || haystack.includes("PORTUGUES") || haystack.includes("PORTUGUÊS") || haystack.includes(" PT ")) {
    return "PT";
  }
  if (haystack.includes("SPANISH") || haystack.includes("ESPANOL") || haystack.includes("ESPAÑOL") || haystack.includes(" ESP ")) {
    return "ESP";
  }
  if (haystack.includes("FRENCH") || haystack.includes("FRANCAIS") || haystack.includes("FRANÇAIS") || haystack.includes(" FR ")) {
    return "FR";
  }
  if (haystack.includes("GERMAN") || haystack.includes("DEUTSCH") || haystack.includes(" DE ")) {
    return "DE";
  }
  if (haystack.includes("ITALIAN") || haystack.includes("ITALIANO") || haystack.includes(" IT ")) {
    return "IT";
  }
 
  return "EN";
}
 
function getTestVocabCount(test: RecentTest) {
  if (Array.isArray(test.config_json?.words)) return test.config_json.words.length;
  return test.vocab_words_count ?? test.vocab_count ?? test.vocabWordsCount ?? 0;
}
 
function getTestQuestionCount(test: RecentTest) {
  if (Array.isArray(test.config_json?.tests)) return test.config_json.tests.length;
  return test.question_count ?? test.questions_count ?? test.questionCount ?? 0;
}
 
function useCountUp(target: number, duration = 850) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);
 
  useEffect(() => {
    animatedValue.stopAnimation();
    animatedValue.setValue(0);
 
    const listener = animatedValue.addListener(({ value }) => {
      setDisplayValue(Math.round(value));
    });
 
    Animated.timing(animatedValue, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
 
    return () => animatedValue.removeListener(listener);
  }, [animatedValue, duration, target]);
 
  return displayValue;
}
 
function useAnimatedProgress(targetPercentage: number, duration = 800) {
  const progress = useRef(new Animated.Value(0)).current;
 
  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: Math.max(0, Math.min(100, targetPercentage)),
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [duration, progress, targetPercentage]);
 
  return progress;
}
 
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
 
function AnimatedSection({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;
 
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 520,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);
 
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}
 
function DashboardBackground({ theme }: { theme: ReturnType<typeof useAppTheme> }) {
  const pulseA = useRef(new Animated.Value(0.96)).current;
  const pulseB = useRef(new Animated.Value(1.04)).current;
 
  useEffect(() => {
    const loopA = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseA, {
          toValue: 1.05,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseA, {
          toValue: 0.96,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
 
    const loopB = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseB, {
          toValue: 0.98,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseB, {
          toValue: 1.06,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
 
    loopA.start();
    loopB.start();
 
    return () => {
      loopA.stop();
      loopB.stop();
    };
  }, [pulseA, pulseB]);
 
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 10,
          right: -60,
          height: 230,
          width: 230,
          borderRadius: 999,
          backgroundColor: theme.colors.primarySoft,
          opacity: 0.8,
          transform: [{ scale: pulseA }],
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 70,
          left: -80,
          height: 190,
          width: 190,
          borderRadius: 999,
          backgroundColor: theme.colors.violetSoft,
          opacity: 0.75,
          transform: [{ scale: pulseB }],
        }}
      />
    </>
  );
}
 
export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, "Dashboard">>();
 
  const sessionId = route.params?.sessionId;
  const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";

  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
 
  const drawerWidth = useMemo(() => Dimensions.get("window").width, []);
  const drawerAnim = useRef(new Animated.Value(-drawerWidth)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(1)).current;
  const contentLift = useRef(new Animated.Value(0)).current;
  const headerOpacity = useRef(new Animated.Value(1)).current;
  const headerTranslateY = useRef(new Animated.Value(0)).current;
 
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPrincipal, setIsPrincipal] = useState(false);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [lessonsCount, setLessonsCount] = useState(0);
  const [testsCount, setTestsCount] = useState(0);
  const [studentsCount, setStudentsCount] = useState(0);
  const [teachersCount, setTeachersCount] = useState(0);
  const [adminPlanCounts, setAdminPlanCounts] = useState({
    basic: 0,
    standard: 0,
    school: 0,
    internal: 0,
  });
  const [adminRevenueMonthly, setAdminRevenueMonthly] = useState(0);
  const [recentLessons, setRecentLessons] = useState<RecentLesson[]>([]);
  const [recentTests, setRecentTests] = useState<RecentTest[]>([]);
  const [recentStudentActivity, setRecentStudentActivity] = useState<StudentActivity[]>([]);
  const [activityTab, setActivityTab] = useState<ActivityTab>("student_activity");
  const [selectedStudentActivity, setSelectedStudentActivity] = useState<StudentActivity | null>(null);
  const [studentActivityDetailLoadingId, setStudentActivityDetailLoadingId] = useState<string | null>(null);
  const [teacherCapacity, setTeacherCapacity] = useState<TeacherCapacityItem[]>([]);
 
  const [studentName, setStudentName] = useState<string>("");
  const [studentTeacherName, setStudentTeacherName] = useState<string>("");
  const [assignedLessonsIds, setAssignedLessonsIds] = useState<string[]>([]);
  const [assignedTestsIds, setAssignedTestsIds] = useState<string[]>([]);
  const [studentExpiresAt, setStudentExpiresAt] = useState<string>("");

  const studentAccessCodeMapRef = useRef(new Map<string, string>());
  const isCompactPhone = drawerWidth < 420;
 
  const isStudentMode = !!sessionId;
  const currentUserName = isStudentMode ? studentName || "Student" : teacherName || "Teacher";
  const currentUserInitial = currentUserName.trim().charAt(0).toUpperCase() || "U";
 
  const PLAN_PRICE_MONTHLY = useMemo(
    () => ({
      basic: 0,
      standard: 29.99,
      school: 0,
      internal: 0,
    }),
    []
  );
 
  const animatedLessonsCount = useCountUp(lessonsCount);
  const animatedTestsCount = useCountUp(testsCount);
  const animatedStudentsCount = useCountUp(studentsCount);
  const animatedTeachersCount = useCountUp(teachersCount);
  const animatedRevenueCount = useCountUp(Math.round(adminRevenueMonthly));
 
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore sign-out errors
    }
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };
 
  const handleActionPress = (label: string) => {
    const lessonEditMatch = label.match(/^\/dashboard\/lessons\/([^/]+)\/edit$/);
    if (lessonEditMatch?.[1]) {
      navigation.navigate("LessonForm", { lessonId: lessonEditMatch[1] });
      return;
    }
    const testEditMatch = label.match(/^\/dashboard\/tests\/([^/]+)\/edit$/);
    if (testEditMatch?.[1]) {
      navigation.navigate("TestForm", { testId: testEditMatch[1] });
      return;
    }
    if (label === "/dashboard/chats") {
      navigation.navigate("Chats");
      return;
    }
    if (label === "/dashboard/inbox" || label === "Notifications") {
      navigation.navigate("Notifications");
      return;
    }
    if (label === "/dashboard/notifications") {
      navigation.navigate("SendNotifications");
      return;
    }
    if (label === "/dashboard/teachers") {
      navigation.navigate("Teachers");
      return;
    }
    if (label === "/dashboard/settings") {
      navigation.navigate("Settings");
      return;
    }
    if (label === "/dashboard/settings/subscription") {
      navigation.navigate("Subscription");
      return;
    }
    if (label === "/dashboard/packs") {
      navigation.navigate("LessonPacks");
      return;
    }
    if (label === "/dashboard/lessons") {
      navigation.navigate("Lessons");
      return;
    }
    if (label === "/dashboard/students") {
      navigation.navigate("Students");
      return;
    }
    if (label === "/dashboard/tests") {
      navigation.navigate("Tests");
      return;
    }
    if (label === "/dashboard") {
      return;
    }
    if (label === "New Lesson" || label === "New Lessons" || label === "Create Lesson") {
      navigation.navigate("Lessons");
      return;
    }
    if (label === "New Test" || label === "New Tests" || label === "Create Test") {
      navigation.navigate("Tests");
      return;
    }
    if (label === "Add Student" || label === "Add Students" || label === "Create Student") {
      navigation.navigate("Students");
      return;
    }
    if (label === "Add Teacher" || label === "Add Principal" || label === "Create Teacher" || label === "Create Principal") {
      navigation.navigate("Teachers");
      return;
    }
 
    Alert.alert("Coming soon", `Mobile action not implemented yet: ${label}`);
  };

  const openStudentActivity = async (activity: StudentActivity) => {
    const existingIssues = Array.isArray(activity.issues) ? activity.issues : [];
    if (existingIssues.length > 0) {
      setSelectedStudentActivity(activity);
      return;
    }

    const accessCode = studentAccessCodeMapRef.current.get(activity.studentId)?.trim();
    if (!accessCode) {
      setSelectedStudentActivity(activity);
      return;
    }

    setStudentActivityDetailLoadingId(activity.id);
    try {
      const response = await fetch(`${apiBaseUrl}/api/students/verify-access-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: accessCode.toUpperCase() }),
      });

      let result: VerifyAccessCodeResponse | null = null;
      try {
        result = (await response.json()) as VerifyAccessCodeResponse;
      } catch {
        result = null;
      }

      const sessionIdFromCode = result?.session?.id?.trim() || "";
      if (!response.ok || !sessionIdFromCode) {
        setSelectedStudentActivity(activity);
        return;
      }

      const progress = await getRemoteProgress(sessionIdFromCode);
      const detailedRows = buildStudentActivitiesFromProgress(activity.studentId, activity.studentName, progress);
      const match = findMatchingStudentActivity(detailedRows, activity);

      if (match) {
        const mergedActivity: StudentActivity = {
          ...activity,
          contentName: isGenericStudentActivityContentName(activity.contentName) ? match.contentName : activity.contentName || match.contentName,
          percentage: activity.percentage ?? match.percentage,
          score: activity.score ?? match.score,
          total: activity.total ?? match.total,
          issues: Array.isArray(activity.issues) && activity.issues.length > 0 ? activity.issues : match.issues,
          created_at: activity.created_at || match.created_at,
        };

        setRecentStudentActivity((prev) => prev.map((item) => (item.id === activity.id ? mergedActivity : item)));
        setSelectedStudentActivity(mergedActivity);
        return;
      }
    } catch {
      // Fall back to the summary row if detailed progress is unavailable.
    } finally {
      setStudentActivityDetailLoadingId((current) => (current === activity.id ? null : current));
    }

    setSelectedStudentActivity(activity);
  };

  const menuSections = useMemo(() => {
    const workspace = [
      { label: "Dashboard", href: "/dashboard", icon: "shield" as const },
      { label: "Lessons", href: "/dashboard/lessons", icon: "book" as const },
      { label: "Tests", href: "/dashboard/tests", icon: "clipboard" as const },
      { label: "Students", href: "/dashboard/students", icon: "school" as const },
      { label: "Vocabulary Browser", href: "/dashboard/packs", icon: "star" as const },
    ];
 
    const admin = isAdmin
      ? [
          { label: "Teachers", href: "/dashboard/teachers", icon: "people" as const },
          { label: "Send Notifications", href: "/dashboard/notifications", icon: "flame" as const },
          { label: "Chats", href: "/dashboard/chats", icon: "star" as const },
        ]
      : [];
 
    const account = [
      { label: "Notifications", href: "/dashboard/inbox", icon: "notifications" as const },
      { label: "Settings", href: "/dashboard/settings", icon: "settings" as const },
      { label: "Subscription", href: "/dashboard/settings/subscription", icon: "wallet" as const },
    ];
 
    return [
      { title: "Workspace", items: workspace },
      ...(isAdmin ? [{ title: "Admin", items: admin }] : []),
      { title: "Account", items: account },
    ];
  }, [isAdmin]);
 
  useEffect(() => {
    let isMounted = true;
 
    async function loadStudentSession() {
      if (!sessionId) return;
      setFatalError(null);
      setLoading(true);
 
      try {
        const res = await fetch(`${apiBaseUrl}/api/students/session?session=${sessionId}`);
        let json: StudentSessionResponse | null = null;
        try {
          json = (await res.json()) as StudentSessionResponse;
        } catch {
          json = null;
        }
 
        if (!res.ok || !json || json.error) {
          throw new Error(json?.error || "Unable to load student session.");
        }
 
        if (!isMounted) return;
        setStudentName(json.student?.name ?? "Student");
        setStudentTeacherName(json.teacher?.name ?? "");
        setAssignedLessonsIds(json.student?.assigned_lessons ?? []);
        setAssignedTestsIds(json.student?.assigned_tests ?? []);
        setStudentExpiresAt(json.expires_at ?? "");
      } catch (err) {
        if (!isMounted) return;
        setFatalError(err instanceof Error ? err.message : "Unable to load dashboard.");
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    }
 
    async function loadTeacherDashboard() {
      setFatalError(null);
      setLoading(true);
 
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
 
        if (userError) throw userError;
        if (!user) {
          if (!isMounted) return;
          navigation.reset({ index: 0, routes: [{ name: "Login" }] });
          return;
        }
 
        const { data: currentTeacher, error: teacherError } = await (supabase.from("teachers") as any)
          .select("id, user_id, name, role, active, plan, student_limit, created_at")
          .eq("user_id", user.id)
          .maybeSingle();
 
        if (teacherError && !currentTeacher) {
          throw new Error("Unable to load teacher profile.");
        }
 
        const role = (currentTeacher?.role ?? "teacher") as string;
        const admin = role === "admin";
        const principal = role === "principal";
        const tName = currentTeacher?.name || (admin ? "Administrator" : principal ? "Principal" : "Teacher");
 
        if (!isMounted) return;
        setIsAdmin(admin);
        setIsPrincipal(principal);
        setTeacherName(tName);
 
        const lessonQuery = (supabase.from("lessons") as any).select("*", { count: "exact", head: true });
        const testQuery = (supabase.from("tests") as any).select("*", { count: "exact", head: true });
        const studentQuery = (supabase.from("students") as any).select("*", { count: "exact", head: true });
        const teachersQuery = (supabase.from("teachers") as any).select("*", { count: "exact", head: true });
 
        if (!admin && !principal) {
          lessonQuery.eq("created_by", user.id);
          testQuery.eq("created_by", user.id);
          studentQuery.eq("teacher_id", user.id);
        }
 
        const [lessonsRes, testsRes, studentsRes, teachersRes] = await Promise.all([
          lessonQuery,
          testQuery,
          studentQuery,
          teachersQuery,
        ]);
 
        if (!isMounted) return;
        setLessonsCount(lessonsRes?.count ?? 0);
        setTestsCount(testsRes?.count ?? 0);
        setStudentsCount(studentsRes?.count ?? 0);
        setTeachersCount(teachersRes?.count ?? 0);
 
        if (admin) {
          const { data: plansRows } = await (supabase.from("teachers") as any).select("plan");
          const planRows = (plansRows ?? []) as { plan: string | null }[];
 
          const localPlanCounts = {
            basic: 0,
            standard: 0,
            school: 0,
            internal: 0,
          };

          for (const row of planRows) {
            const p = (row?.plan ?? "basic").toLowerCase().trim();
            if (p === "standard" || p === "teacher" || p === "tutor") localPlanCounts.standard++;
            else if (p === "basic" || p === "free") localPlanCounts.basic++;
            else if (p === "pro") localPlanCounts.school++;
            else if (p === "internal") localPlanCounts.internal++;
            else if (p in localPlanCounts) (localPlanCounts as any)[p]++;
            else localPlanCounts.basic++;
          }

          const revenueMonthly =
            localPlanCounts.standard * PLAN_PRICE_MONTHLY.standard;
 
          setAdminPlanCounts(localPlanCounts);
          setAdminRevenueMonthly(revenueMonthly);
        }
 
        if (admin || principal) {
          const { data: teachersRows } = await (supabase.from("teachers") as any)
            .select("user_id, name, student_limit, created_at")
            .eq("role", "teacher");
 
          const teacherRows = (teachersRows ?? []) as any[];
 
          const capacityItems: TeacherCapacityItem[] = await Promise.all(
            teacherRows.map(async (t) => {
              const teacherUserId = String(t.user_id);
              const { count } = await (supabase.from("students") as any)
                .select("*", { count: "exact", head: true })
                .eq("teacher_id", teacherUserId);
 
              const studentCount = count ?? 0;
              const limitNumber = typeof t.student_limit === "number" ? t.student_limit : t.student_limit ? Number(t.student_limit) : 10;
              const limit = Number.isFinite(limitNumber) && limitNumber > 0 ? limitNumber : 10;
              const percentage = Math.min((studentCount / limit) * 100, 100);
 
              return {
                id: teacherUserId,
                name: t.name ?? "Teacher",
                created_at: t.created_at ?? "",
                student_limit: limit,
                studentCount,
                percentage,
              };
            })
          );
 
          if (!isMounted) return;
          setTeacherCapacity(capacityItems);
          setRecentLessons([]);
          setRecentTests([]);
        } else {
          const [rawLessons, rawTests] = await Promise.all([
            (supabase.from("lessons") as any)
              .select("*")
              .eq("created_by", user.id)
              .order("created_at", { ascending: false })
              .limit(5),
            (supabase.from("tests") as any)
              .select("*")
              .eq("teacher_id", user.id)
              .order("created_at", { ascending: false })
              .limit(5),
          ]);
 
          if (!isMounted) return;
          setRecentLessons((rawLessons?.data ?? []) as RecentLesson[]);
          setRecentTests((rawTests?.data ?? []) as RecentTest[]);
          setTeacherCapacity([]);

          // Load condensed student activity for the third tab
          try {
            const { data: studentRows } = await (supabase.from("students") as any)
              .select("id, name, code")
              .eq("teacher_id", user.id);
            const myStudents: { id: string; name: string; code: string }[] = studentRows ?? [];
            if (myStudents.length > 0) {
              studentAccessCodeMapRef.current = new Map(myStudents.map((student) => [student.id, student.code ?? ""]));
              const ids = myStudents.map((s) => s.id);
              const nameMap = new Map(myStudents.map((s) => [s.id, s.name]));

              // Helper: parse a single progress row into StudentActivity[]
              const parseProgressRow = (studentId: string, practiceH: any[], testH: any[]): StudentActivity[] => {
                const out: StudentActivity[] = [];
                const name = nameMap.get(studentId) ?? "Student";
                const push = (records: any[], isTest: boolean) => {
                  for (const rec of records ?? []) {
                    const contentName =
                      typeof rec.lessonName === "string" ? rec.lessonName :
                      typeof rec.testName === "string" ? rec.testName :
                      typeof rec.lessonTitle === "string" ? rec.lessonTitle :
                      typeof rec.testTitle === "string" ? rec.testTitle :
                      typeof rec.lesson_title === "string" ? rec.lesson_title :
                      typeof rec.test_title === "string" ? rec.test_title :
                      typeof rec.title === "string" ? rec.title :
                      typeof rec.name === "string" ? rec.name :
                      typeof rec.lesson?.name === "string" ? rec.lesson.name :
                      typeof rec.lesson?.title === "string" ? rec.lesson.title :
                      typeof rec.test?.name === "string" ? rec.test.name :
                      typeof rec.test?.title === "string" ? rec.test.title : null;
                    const rawScore = rec.score;
                    const rawAnswers: any[] = Array.isArray(rawScore?.answers) ? rawScore.answers : [];
                    const rawIssues: any[] = Array.isArray(rec.issues) ? rec.issues : [];
                    const issues = normalizeIssues(rawIssues, rawAnswers);
                    const correctCount = typeof rawScore === "number" ? rawScore :
                      typeof rawScore?.correct === "number" ? rawScore.correct :
                      rawAnswers.filter((a: any) => a.result === "correct").length;
                    const totalWords = getStudentActivityTotal(rec, rawScore, rawAnswers);
                    const pct: number | null =
                      typeof rec.percentage === "number" ? rec.percentage :
                      typeof rec.score_percentage === "number" ? rec.score_percentage :
                      typeof rawScore?.percentage === "number" ? rawScore.percentage :
                      totalWords != null && totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : null;
                    const createdAt = typeof rec.date === "string" ? rec.date :
                      typeof rec.timestamp === "number" ? new Date(rec.timestamp).toISOString() :
                      typeof rec.timestamp === "string" ? rec.timestamp : new Date().toISOString();
                    out.push({
                      id: `${studentId}-${createdAt}-${isTest ? "t" : "l"}`,
                      studentId,
                      studentName: name,
                      contentName: contentName ?? (isTest ? "Test" : "Lesson"),
                      isTest,
                      percentage: pct,
                      score: correctCount >= 0 && totalWords != null ? correctCount : correctCount > 0 ? correctCount : null,
                      total: totalWords,
                      issues,
                      created_at: createdAt,
                    });
                  }
                };
                push(practiceH, false);
                push(testH, true);
                return out;
              };

              let activities: StudentActivity[] = [];
              const progressRowsByStudent = new Map<string, { practiceHistory: any[]; testHistory: any[] }>();

              // 1. Try direct student_game_progress table
              const { data: progressRows, error: progressError } = await (supabase.from("student_game_progress") as any)
                .select("student_id, practice_history, test_history")
                .in("student_id", ids);

              if (!progressError && Array.isArray(progressRows)) {
                for (const row of progressRows) {
                  const sid = typeof row?.student_id === "string" ? row.student_id : null;
                  if (!sid) continue;
                  progressRowsByStudent.set(sid, normalizeStudentActivityProgressPayload(row));
                }
              }

              // 2. Fill in any missing students via API
              const missingStudentIds = ids.filter((sid) => !progressRowsByStudent.has(sid));
              if (missingStudentIds.length > 0) {
                const { data: { session: authSession } } = await supabase.auth.getSession();
                const token = authSession?.access_token ?? "";
                const apiResults = await Promise.all(
                  missingStudentIds.map(async (sid) => {
                    try {
                      const res = await fetch(`${apiBaseUrl}/api/teacher/students/${encodeURIComponent(sid)}/progress`, {
                        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                      });
                      if (!res.ok) return null;
                      const json = await res.json();
                      return { sid, payload: normalizeStudentActivityProgressPayload(json) };
                    } catch {
                      return null;
                    }
                  })
                );

                for (const row of apiResults) {
                  if (!row) continue;
                  progressRowsByStudent.set(row.sid, row.payload);
                }
              }

              for (const [studentId, progress] of progressRowsByStudent.entries()) {
                activities.push(...parseProgressRow(studentId, progress.practiceHistory, progress.testHistory));
              }

              // 3. Last resort: teacher_notifications
              if (activities.length === 0) {
                const { data: notifs } = await (supabase.from("teacher_notifications") as any)
                  .select("id, type, title, metadata, created_at")
                  .in("type", ["lesson_completed", "test_completed"])
                  .order("created_at", { ascending: false })
                  .limit(30);
                for (const n of notifs ?? []) {
                  const meta = n.metadata && typeof n.metadata === "object" ? n.metadata : {};
                  const sid = typeof meta.student_id === "string" ? meta.student_id : null;
                  if (sid && !ids.includes(sid)) continue;
                  const isTest = n.type === "test_completed";
                  const contentName = typeof meta.lesson_name === "string" ? meta.lesson_name :
                    typeof meta.test_name === "string" ? meta.test_name : (isTest ? "Test" : "Lesson");
                  activities.push({
                    id: n.id,
                    studentId: sid ?? "",
                    studentName: typeof meta.student_name === "string" ? meta.student_name : nameMap.get(sid ?? "") ?? "Student",
                    contentName,
                    isTest,
                    percentage:
                      typeof meta.percentage === "number" ? meta.percentage :
                      typeof meta.score_percentage === "number" ? meta.score_percentage : null,
                    score:
                      typeof meta.score === "number" ? meta.score :
                      typeof meta.correct === "number" ? meta.correct : null,
                    total:
                      typeof meta.total === "number" ? meta.total :
                      typeof meta.total_words === "number" ? meta.total_words :
                      typeof meta.question_count === "number" ? meta.question_count : null,
                    created_at: n.created_at,
                  });
                }
              }

              activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
              if (isMounted) setRecentStudentActivity(activities.slice(0, 15));

              const studentsWithCodes = myStudents.filter((student) => student.code);
              if (studentsWithCodes.length > 0) {
                void (async () => {
                  for (const student of studentsWithCodes) {
                    try {
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

                      const sessionId = result?.session?.id?.trim() || "";
                      if (!response.ok || !sessionId) continue;

                      const progress = await getRemoteProgress(sessionId);
                      const normalized = normalizeStudentActivityProgressPayload(progress);
                      const detailedRows = parseProgressRow(student.id, normalized.practiceHistory, normalized.testHistory);
                      if (detailedRows.length === 0 || !isMounted) continue;

                      setRecentStudentActivity((prev) =>
                        prev.map((activity) => {
                          if (activity.studentId !== student.id) return activity;
                          const match = findMatchingStudentActivity(detailedRows, activity);
                          if (!match) return activity;

                          return {
                            ...activity,
                            contentName: isGenericStudentActivityContentName(activity.contentName) ? match.contentName : activity.contentName || match.contentName,
                            percentage: activity.percentage ?? match.percentage,
                            score: activity.score ?? match.score,
                            total: activity.total ?? match.total,
                            issues: Array.isArray(activity.issues) && activity.issues.length > 0 ? activity.issues : match.issues,
                            created_at: activity.created_at || match.created_at,
                          };
                        })
                      );
                    } catch {
                      // best-effort enrichment
                    }
                  }
                })();
              }
            }
          } catch {
            // best-effort
          }
        }
      } catch (err) {
        if (!isMounted) return;
        setFatalError(err instanceof Error ? err.message : "Unable to load dashboard.");
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    }
 
    if (isStudentMode) loadStudentSession();
    else loadTeacherDashboard();
 
    return () => {
      isMounted = false;
    };
  }, [PLAN_PRICE_MONTHLY, apiBaseUrl, isStudentMode, navigation, sessionId]);
 
  const animateDrawer = (toValue: number, onDone?: () => void) => {
    Animated.parallel([
      Animated.spring(drawerAnim, {
        toValue,
        tension: 78,
        friction: 14,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: toValue === 0 ? 1 : 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentScale, {
        toValue: toValue === 0 ? 0.985 : 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentLift, {
        toValue: toValue === 0 ? -topBarHeight : 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headerOpacity, {
        toValue: toValue === 0 ? 0 : 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headerTranslateY, {
        toValue: toValue === 0 ? -8 : 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onDone?.();
    });
  };
 
  const openMenu = () => {
    setDrawerVisible(true);
    drawerAnim.setValue(-drawerWidth);
    animateDrawer(0);
  };
 
  const closeMenu = () => {
    animateDrawer(-drawerWidth, () => setDrawerVisible(false));
  };
 
  useEffect(() => {
    if (route.params?.openDrawer !== true) return;
    const id = requestAnimationFrame(() => {
      openMenu();
      navigation.setParams({ openDrawer: false } as never);
    });
    return () => cancelAnimationFrame(id);
  }, [navigation, route.params?.openDrawer]);
 
  const welcomeSubtitle = useMemo(() => {
    if (isAdmin) return "Overseeing the platform and teacher performance.";
    if (isPrincipal) return "Manage your school's teachers, students, and assignments.";
    return "Manage your students and their learning progress.";
  }, [isAdmin, isPrincipal]);
 
  const ICONS = useMemo(
    () => ({
      book: "book" as const,
      clipboard: "clipboard" as const,
      school: "school" as const,
      people: "people" as const,
      shield: "shield-checkmark" as const,
      wallet: "wallet" as const,
      flame: "flame" as const,
      star: "star" as const,
      settings: "settings" as const,
      notifications: "notifications-outline" as const,
    }),
    []
  );
 
  const stats = useMemo(() => {
    const items: Array<{
      label: string;
      value: number;
      animatedValue: number;
      icon: keyof typeof ICONS;
      iconBg: string;
      iconColor: string;
      tint: string;
      onPress: () => void;
    }> = [
      {
        label: "Lessons",
        value: lessonsCount,
        animatedValue: animatedLessonsCount,
        icon: "book",
        iconBg: "#3777C9",
        iconColor: "#FFFFFF",
        tint: "#ECF4FF",
        onPress: () => handleActionPress("/dashboard/lessons"),
      },
      {
        label: "Tests",
        value: testsCount,
        animatedValue: animatedTestsCount,
        icon: "clipboard",
        iconBg: "#9050E7",
        iconColor: "#FFFFFF",
        tint: "#F3ECFF",
        onPress: () => handleActionPress("/dashboard/tests"),
      },
      {
        label: "Students",
        value: studentsCount,
        animatedValue: animatedStudentsCount,
        icon: "school",
        iconBg: "#3EA370",
        iconColor: "#FFFFFF",
        tint: "#EBF8F0",
        onPress: () => handleActionPress("/dashboard/students"),
      },
    ];
 
    if (isAdmin || isPrincipal) {
      items.push({
        label: "Teachers",
        value: teachersCount,
        animatedValue: animatedTeachersCount,
        icon: "people",
        iconBg: "#E3A91F",
        iconColor: "#FFFFFF",
        tint: "#FFF7DE",
        onPress: () => handleActionPress("/dashboard/teachers"),
      });
    }
 
    return items;
  }, [
    ICONS,
    animatedLessonsCount,
    animatedStudentsCount,
    animatedTeachersCount,
    animatedTestsCount,
    isAdmin,
    isPrincipal,
    lessonsCount,
    studentsCount,
    teachersCount,
    testsCount,
  ]);
 
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    []
  );
 
  const topBarHeight = Math.max(insets.top, 8) + 76;
 
  const SectionHeader = ({
    eyebrow,
    title,
    subtitle,
    actionLabel,
    onActionPress,
  }: {
    eyebrow: string;
    title: string;
    subtitle?: string;
    actionLabel?: string;
    onActionPress?: () => void;
  }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 16,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[theme.typography.label, { color: theme.colors.primary }]}>{eyebrow}</Text>
        <Text style={[theme.typography.title, { marginTop: 6 }]}>{title}</Text>
        {subtitle ? (
          <Text style={[theme.typography.caption, { marginTop: 5, color: theme.colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <TouchableOpacity onPress={onActionPress} activeOpacity={0.8}>
          <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: "800" }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
 
  const StatCard = ({
    label,
    value,
    icon,
    iconBg,
    iconColor,
    tint,
    onPress,
    twoPerRow,
  }: {
    label: string;
    value: number;
    icon: keyof typeof ICONS;
    iconBg: string;
    iconColor: string;
    tint: string;
    onPress: () => void;
    twoPerRow?: boolean;
  }) => (
    <View style={{ width: twoPerRow ? "31%" : "100%", marginBottom: twoPerRow ? 6 : 0 }}>
      <AnimatedPressable
        onPress={onPress}
        style={{
          borderRadius: 12,
          padding: 6,
          backgroundColor: theme.isDark ? iconBg + "33" : tint,
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: "#000",
          shadowOpacity: 0.04,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }}
      >
        <View style={{ position: "absolute", top: 5, right: 5 }}>
          <View style={{ width: 14, height: 14, borderRadius: 5, backgroundColor: theme.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="chevron-forward" size={8} color={theme.colors.textMuted} />
          </View>
        </View>
        <View style={{ alignItems: "center" }}>
          <View
            style={{
              height: 18,
              width: 18,
              borderRadius: 7,
              backgroundColor: iconBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={ICONS[icon]} size={9} color={iconColor} />
          </View>
          <Text
            style={{
              marginTop: 5,
              fontSize: 13,
              lineHeight: 15,
              fontWeight: "800",
              color: theme.colors.text,
              textAlign: "center",
            }}
          >
            {value}
          </Text>
          <Text style={[theme.typography.bodyStrong, { marginTop: 1, fontSize: 10, color: theme.colors.textMuted, textAlign: "center" }]}>{label}</Text>
        </View>
      </AnimatedPressable>
    </View>
  );
 
  const QuickActionCard = ({
    label,
    icon,
    twoPerRow,
  }: {
    label: string;
    icon: keyof typeof ICONS;
    twoPerRow?: boolean;
  }) => {
    const createMatch = label.match(/^Create\s+(.+)$/i);
    const topLabel = createMatch ? "Create" : label;
    const bottomLabel = createMatch ? createMatch[1] : "";

    const colors = theme.isDark
      ? icon === "book"
        ? { bg: "rgba(55,119,201,0.20)", iconWrap: "rgba(55,119,201,0.35)", icon: "#60A5FA" }
        : icon === "clipboard"
        ? { bg: "rgba(144,80,231,0.20)", iconWrap: "rgba(144,80,231,0.35)", icon: "#C084FC" }
        : icon === "school"
        ? { bg: "rgba(62,163,112,0.20)", iconWrap: "rgba(62,163,112,0.35)", icon: "#34D399" }
        : { bg: "rgba(227,169,31,0.20)", iconWrap: "rgba(227,169,31,0.35)", icon: "#FCD34D" }
      : icon === "book"
      ? { bg: "#EEF5FF", iconWrap: "#DDEBFF", icon: "#2D74BF" }
      : icon === "clipboard"
      ? { bg: "#F5EEFF", iconWrap: "#E8D7FF", icon: "#8B4EE2" }
      : icon === "school"
      ? { bg: "#EEF9F2", iconWrap: "#D6F0E0", icon: "#3A9E6A" }
      : { bg: "#FFF8E7", iconWrap: "#FCEAB8", icon: "#B98A10" };

    return (
      <View style={{ width: twoPerRow ? "31.5%" : "31.5%", marginBottom: 8 }}>
        <AnimatedPressable
          onPress={() => handleActionPress(label)}
          style={{
            borderRadius: 14,
            padding: 10,
            minHeight: 88,
            backgroundColor: colors.bg,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              height: 30,
              width: 30,
              borderRadius: 10,
              backgroundColor: colors.iconWrap,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={ICONS[icon]} size={14} color={colors.icon} />
          </View>
          <View style={{ marginTop: 8, alignItems: "center" }}>
            <Text style={[theme.typography.bodyStrong, { fontSize: 11, lineHeight: 13, textTransform: "uppercase", color: theme.colors.textMuted, textAlign: "center" }]} numberOfLines={1}>
              {topLabel}
            </Text>
            {bottomLabel ? (
              <Text style={[theme.typography.bodyStrong, { marginTop: 2, fontSize: 12, lineHeight: 15, color: theme.colors.text, textAlign: "center" }]} numberOfLines={1}>
                {bottomLabel}
              </Text>
            ) : null}
          </View>
        </AnimatedPressable>
      </View>
    );
  };
 
  const CompactMetric = ({
    label,
    value,
    accent = theme.colors.primarySoft,
    textColor = theme.colors.text,
  }: {
    label: string;
    value: string | number;
    accent?: string;
    textColor?: string;
  }) => (
    <View
      style={{
        width: "48.5%",
        marginBottom: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: accent,
        padding: 14,
      }}
    >
      <Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[theme.typography.title, { marginTop: 8, fontSize: 24, lineHeight: 28, color: textColor }]}>{value}</Text>
    </View>
  );
 
  const LanguagePill = ({ badge }: { badge: string }) => {
    const colors = getLanguageBadgeColors(badge);
 
    return (
      <View
        style={{
          marginLeft: 8,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.borderColor,
          backgroundColor: colors.backgroundColor,
        }}
      >
        <Text style={{ color: colors.textColor, fontSize: 10, lineHeight: 12, fontWeight: "900" }}>{badge}</Text>
      </View>
    );
  };
 
  const CountPill = ({ label, value }: { label: string; value: number }) => {
    const isQuestion = label.toUpperCase() === "Q";
    return (
      <View
        style={{
          marginLeft: 8,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: isQuestion ? "#E6D39A" : "#B7D0E8",
          backgroundColor: isQuestion ? "#FFF5DA" : "#EAF3FB",
        }}
      >
        <Text style={{ color: isQuestion ? "#B88400" : "#2E7ABF", fontSize: 10, lineHeight: 12, fontWeight: "900" }}>
          {value}
          {label}
        </Text>
      </View>
    );
  };

  const ActivityTabs = () => (
    <View
      style={{
        marginBottom: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceAlt,
        padding: 3,
        flexDirection: "row",
      }}
    >
      {(["student_activity", "lessons", "tests"] as ActivityTab[]).map((tab) => {
        const label = tab === "lessons" ? "Lessons" : tab === "tests" ? "Tests" : isCompactPhone ? "Student" : "Student Activity";
        const active = activityTab === tab;
        const colors =
          tab === "lessons"
            ? { bg: "#EAF6FF", border: "#A9D8F7", text: "#0284C7" }
            : tab === "tests"
            ? { bg: "#F5F0FF", border: "#C4B0F8", text: "#7C3AED" }
            : { bg: "#EBF8F0", border: "#A8DFC0", text: "#2F855A" };
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => setActivityTab(tab)}
            activeOpacity={0.9}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 8,
              borderRadius: 9,
              borderWidth: 1,
              borderColor: active ? colors.border : "transparent",
              backgroundColor: active ? colors.bg : "transparent",
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[
                theme.typography.caption,
                {
                  fontWeight: "800",
                  fontSize: isCompactPhone ? 11 : undefined,
                  color: active ? colors.text : theme.colors.textMuted,
                },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
 
  const RecentLessonsCard = ({ items }: { items: RecentLesson[] }) => {
    const visibleItems = items.slice(0, 5);
 
    return (
      <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
        <SectionHeader eyebrow="Activity" title="Recent lessons" subtitle="Your latest lessons in a cleaner, faster-scanning layout." />
        <ActivityTabs />
 
        {visibleItems.length > 0 ? (
          <>
            {visibleItems.map((item, index) => {
              const badge = inferLessonLanguageBadge(item);
              return (
                <AnimatedPressable
                  key={item.id}
                  onPress={() => handleActionPress(`/dashboard/lessons/${item.id}/edit`)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: theme.colors.surfaceAlt,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    marginTop: index === 0 ? 0 : 6,
                    gap: 8,
                  }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ionicons name="book-outline" size={13} color={theme.colors.primary} />
                  </View>
                  <Text style={[theme.typography.bodyStrong, { flex: 1, fontSize: 13, color: theme.colors.text }]} numberOfLines={1}>{item.title}</Text>
                  {badge ? <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: theme.colors.primarySoft }}><Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.primary }}>{badge}</Text></View> : null}
                  <Text style={{ fontSize: 10, color: theme.colors.textMuted, flexShrink: 0 }}>{formatDateTime(item.created_at)}</Text>
                  <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ionicons name="chevron-forward" size={10} color={theme.colors.textMuted} />
                  </View>
                </AnimatedPressable>
              );
            })}
 
            {items.length >= 5 ? (
              <View style={{ alignItems: "flex-end", marginTop: 14 }}>
                <TouchableOpacity onPress={() => handleActionPress("/dashboard/lessons")} activeOpacity={0.8}>
                  <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: "800" }]}>View all</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : (
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceAlt,
              padding: 20,
              alignItems: "center",
            }}
          >
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No recent lessons</Text>
          </View>
        )}
      </GlassCard>
    );
  };
 
  const RecentTestsCard = ({ items }: { items: RecentTest[] }) => {
    const visibleItems = items.slice(0, 5);
 
    return (
      <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
        <SectionHeader eyebrow="Activity" title="Recent tests" subtitle="Your latest tests with quick signal chips and better spacing." />
        <ActivityTabs />
 
        {visibleItems.length > 0 ? (
          <>
            {visibleItems.map((item, index) => {
              const vocabCount = getTestVocabCount(item);
              const questionCount = getTestQuestionCount(item);
 
              return (
                <AnimatedPressable
                  key={item.id}
                  onPress={() => handleActionPress(`/dashboard/tests/${item.id}/edit`)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: theme.colors.surfaceAlt,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    marginTop: index === 0 ? 0 : 6,
                    gap: 8,
                  }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: theme.colors.violetSoft, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ionicons name="clipboard-outline" size={13} color={theme.colors.primary} />
                  </View>
                  <Text style={[theme.typography.bodyStrong, { flex: 1, fontSize: 13, color: theme.colors.text }]} numberOfLines={1}>{item.name}</Text>
                  <CountPill label="W" value={vocabCount} />
                  <CountPill label="Q" value={questionCount} />
                  <Text style={{ fontSize: 10, color: theme.colors.textMuted, flexShrink: 0 }}>{formatDateTime(item.created_at)}</Text>
                  <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ionicons name="chevron-forward" size={10} color={theme.colors.textMuted} />
                  </View>
                </AnimatedPressable>
              );
            })}
 
            {items.length >= 5 ? (
              <View style={{ alignItems: "flex-end", marginTop: 14 }}>
                <TouchableOpacity onPress={() => handleActionPress("/dashboard/tests")} activeOpacity={0.8}>
                  <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: "800" }]}>View all</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : (
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceAlt,
              padding: 20,
              alignItems: "center",
            }}
          >
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No recent tests</Text>
          </View>
        )}
      </GlassCard>
    );
  };
 
  const RecentStudentActivityCard = ({ items }: { items: StudentActivity[] }) => {
    const visibleItems = items.slice(0, 5);
    return (
      <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
        <SectionHeader eyebrow="Activity" title="Student activity" subtitle="Recent lesson and test completions across your students." />
        <ActivityTabs />
        {visibleItems.length > 0 ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 4 }}>
              <View
                style={{
                  minWidth: 740,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  overflow: "hidden",
                  backgroundColor: theme.colors.surfaceAlt,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: theme.colors.surfaceGlass,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <Text style={[theme.typography.caption, { width: 140, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase" }]}>Student</Text>
                  <Text style={[theme.typography.caption, { width: 220, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase" }]}>Lesson/Test Name</Text>
                  <Text style={[theme.typography.caption, { width: 110, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase" }]}>Type</Text>
                  <Text style={[theme.typography.caption, { width: 130, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase" }]}>Date Completed</Text>
                  <Text style={[theme.typography.caption, { width: 120, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase" }]}>Results</Text>
                  <View style={{ width: 24 }} />
                </View>
            {visibleItems.map((item, index) => {
              const resultColor = item.percentage !== null
                ? (item.percentage >= 80 ? theme.colors.success : item.percentage >= 50 ? "#D97706" : theme.colors.danger)
                : theme.colors.textMuted;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.75}
                  onPress={() => navigation.navigate("Students", { openStudentId: item.studentId })}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: theme.colors.surfaceAlt,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    marginTop: index === 0 ? 0 : 6,
                    gap: 8,
                  }}
                >
                  <View style={{ width: 140, paddingRight: 12 }}>
                    <Text style={[theme.typography.bodyStrong, { fontSize: 12, color: theme.colors.text }]} numberOfLines={1}>{item.studentName}</Text>
                  </View>
                  <View style={{ width: 220, paddingRight: 12 }}>
                    <Text style={[theme.typography.bodyStrong, { fontSize: 12, color: theme.colors.text }]} numberOfLines={2}>{item.contentName}</Text>
                  </View>
                  <View style={{ width: 110, paddingRight: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: "900", color: resultColor }}>
                      {item.percentage !== null ? `${item.percentage}%` : "—"}
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: resultColor, marginTop: 1 }}>
                      {item.score !== null && item.total !== null ? `${item.score}/${item.total}` : "—"}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, color: theme.colors.textMuted, flexShrink: 0 }}>{formatDateTime(item.created_at)}</Text>
                  <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ionicons name="chevron-forward" size={10} color={theme.colors.textMuted} />
                  </View>
                </TouchableOpacity>
              );
            })}
              </View>
            </ScrollView>
            <View style={{ alignItems: "flex-end", marginTop: 14 }}>
              <TouchableOpacity onPress={() => navigation.navigate("Students")} activeOpacity={0.8}>
                <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: "800" }]}>View all</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={{ borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, padding: 20, alignItems: "center" }}>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No student activity yet</Text>
          </View>
        )}
      </GlassCard>
    );
  };

  const StudentActivityTableCard = ({ items }: { items: StudentActivity[] }) => {
    const visibleItems = items.slice(0, 5);

    return (
      <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
        <SectionHeader eyebrow="Activity" title="Student activity" subtitle="Recent lesson and test completions across your students." />
        <ActivityTabs />

        {visibleItems.length > 0 ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 4 }}>
              <View
                style={{
                  minWidth: 740,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  overflow: "hidden",
                  backgroundColor: theme.colors.surfaceAlt,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: theme.colors.surfaceGlass,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <Text style={[theme.typography.caption, { width: 140, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase" }]}>Student</Text>
                  <Text style={[theme.typography.caption, { width: 220, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase" }]}>Lesson/Test Name</Text>
                  <Text style={[theme.typography.caption, { width: 110, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase" }]}>Type</Text>
                  <Text style={[theme.typography.caption, { width: 130, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase" }]}>Date Completed</Text>
                  <Text style={[theme.typography.caption, { width: 120, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase" }]}>Results</Text>
                  <View style={{ width: 24 }} />
                </View>

                {visibleItems.map((item, index) => {
                  const resultColor = item.percentage !== null
                    ? (item.percentage >= 80 ? theme.colors.success : item.percentage >= 50 ? "#D97706" : theme.colors.danger)
                    : theme.colors.textMuted;

                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.75}
                      onPress={() => navigation.navigate("Students", { openStudentId: item.studentId })}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        borderBottomWidth: index === visibleItems.length - 1 ? 0 : 1,
                        borderBottomColor: theme.colors.border,
                      }}
                    >
                      <View style={{ width: 140, paddingRight: 12 }}>
                        <Text style={[theme.typography.bodyStrong, { fontSize: 12, color: theme.colors.text }]} numberOfLines={1}>{item.studentName}</Text>
                      </View>

                      <View style={{ width: 220, paddingRight: 12 }}>
                        <Text style={[theme.typography.bodyStrong, { fontSize: 12, color: theme.colors.text }]} numberOfLines={2}>{item.contentName}</Text>
                      </View>

                      <View style={{ width: 110, paddingRight: 12 }}>
                        <View
                          style={{
                            alignSelf: "flex-start",
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: item.isTest ? "#C4B0F8" : "#A9D8F7",
                            backgroundColor: item.isTest ? "#F5F0FF" : "#EAF6FF",
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "800", color: item.isTest ? "#7C3AED" : "#0284C7", textTransform: "uppercase" }}>
                            {item.isTest ? "Test" : "Lesson"}
                          </Text>
                        </View>
                      </View>

                      <View style={{ width: 130, paddingRight: 12 }}>
                        <Text style={{ fontSize: 11, color: theme.colors.textMuted }} numberOfLines={1}>{formatDateTime(item.created_at)}</Text>
                      </View>

                      <View style={{ width: 120, paddingRight: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: "900", color: resultColor }} numberOfLines={1}>
                          {item.percentage !== null ? `${item.percentage}%` : "—"}
                        </Text>
                        <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                          {item.score !== null && item.total !== null ? `${item.score}/${item.total}` : "No score"}
                        </Text>
                      </View>

                      <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Ionicons name="chevron-forward" size={10} color={theme.colors.textMuted} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={{ alignItems: "flex-end", marginTop: 14 }}>
              <TouchableOpacity onPress={() => navigation.navigate("Students")} activeOpacity={0.8}>
                <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: "800" }]}>View all</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={{ borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, padding: 20, alignItems: "center" }}>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No student activity yet</Text>
          </View>
        )}
      </GlassCard>
    );
  };

  const StudentActivityPillCard = ({ items }: { items: StudentActivity[] }) => {
    const visibleItems = items.slice(0, 5);

    return (
      <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
        <SectionHeader eyebrow="Activity" title="Student activity" subtitle="Recent lesson and test completions across your students." />
        <ActivityTabs />

        {visibleItems.length > 0 ? (
          <>
            {visibleItems.map((item, index) => {
              const resultColor = item.percentage !== null
                ? (item.percentage >= 80 ? theme.colors.success : item.percentage >= 50 ? "#D97706" : theme.colors.danger)
                : theme.colors.textMuted;
              const resultLabel = getStudentActivityResultLabel(item);
              const isResolvingDetails = studentActivityDetailLoadingId === item.id;

              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.75}
                  onPress={() => { openStudentActivity(item).catch(() => {}); }}
                  disabled={isResolvingDetails}
                  style={{
                    backgroundColor: theme.colors.surfaceAlt,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    marginTop: index === 0 ? 0 : 8,
                    opacity: isResolvingDetails ? 0.7 : 1,
                  }}
                >
                  {isCompactPhone ? (
                    <>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View
                          style={{
                            paddingHorizontal: 9,
                            paddingVertical: 4,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: item.isTest ? "#C4B0F8" : "#A9D8F7",
                            backgroundColor: item.isTest ? "#F5F0FF" : "#EAF6FF",
                            flexShrink: 0,
                          }}
                        >
                          <Text style={{ fontSize: 9, fontWeight: "800", color: item.isTest ? "#7C3AED" : "#0284C7", textTransform: "uppercase" }}>
                            {item.isTest ? "Test" : "Lesson"}
                          </Text>
                        </View>

                        <Text style={[theme.typography.bodyStrong, { flex: 1, fontSize: 12, color: theme.colors.text }]} numberOfLines={1}>
                          {item.studentName}
                        </Text>

                        {isResolvingDetails ? (
                          <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.textMuted }}>Loading...</Text>
                        ) : (
                          <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Ionicons name="chevron-forward" size={10} color={theme.colors.textMuted} />
                          </View>
                        )}
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                        <Text style={{ flex: 1, fontSize: 11, color: theme.colors.textMuted }} numberOfLines={1}>
                          {item.contentName}
                        </Text>

                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: resultColor,
                            backgroundColor: theme.colors.surfaceGlass,
                            flexShrink: 0,
                          }}
                        >
                          <Text style={{ fontSize: 9, fontWeight: "800", color: resultColor }} numberOfLines={1}>
                            {resultLabel}
                          </Text>
                        </View>

                        <Text style={{ fontSize: 10, color: theme.colors.textMuted, flexShrink: 0 }} numberOfLines={1}>
                          {formatDateTime(item.created_at)}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View
                        style={{
                          paddingHorizontal: 9,
                          paddingVertical: 4,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: item.isTest ? "#C4B0F8" : "#A9D8F7",
                          backgroundColor: item.isTest ? "#F5F0FF" : "#EAF6FF",
                          flexShrink: 0,
                        }}
                      >
                        <Text style={{ fontSize: 9, fontWeight: "800", color: item.isTest ? "#7C3AED" : "#0284C7", textTransform: "uppercase" }}>
                          {item.isTest ? "Test" : "Lesson"}
                        </Text>
                      </View>

                      <Text style={[theme.typography.bodyStrong, { flex: 1, fontSize: 12, color: theme.colors.text }]} numberOfLines={1}>
                        {`${item.studentName} | ${item.contentName}`}
                      </Text>

                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: resultColor,
                          backgroundColor: theme.colors.surfaceGlass,
                          flexShrink: 0,
                        }}
                      >
                        <Text style={{ fontSize: 9, fontWeight: "800", color: resultColor }} numberOfLines={1}>
                          {resultLabel}
                        </Text>
                      </View>

                      <Text style={{ fontSize: 10, color: theme.colors.textMuted, flexShrink: 0 }} numberOfLines={1}>
                        {formatDateTime(item.created_at)}
                      </Text>

                      {isResolvingDetails ? (
                        <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.textMuted }}>Loading...</Text>
                      ) : (
                        <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Ionicons name="chevron-forward" size={10} color={theme.colors.textMuted} />
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            <View style={{ alignItems: "flex-end", marginTop: 14 }}>
              <TouchableOpacity onPress={() => navigation.navigate("Students")} activeOpacity={0.8}>
                <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: "800" }]}>View all</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={{ borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, padding: 20, alignItems: "center" }}>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No student activity yet</Text>
          </View>
        )}
      </GlassCard>
    );
  };

  const AssignmentCard = ({
    eyebrow,
    title,
    items,
    emptyLabel,
  }: {
    eyebrow: string;
    title: string;
    items: string[];
    emptyLabel: string;
  }) => (
    <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
      <SectionHeader eyebrow={eyebrow} title={title} subtitle={`${items.length} assigned`} />
      {items.length > 0 ? (
        items.map((id, index) => (
          <View
            key={id}
            style={{
              backgroundColor: theme.colors.surfaceAlt,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 14,
              marginTop: index === 0 ? 0 : 10,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                height: 38,
                width: 38,
                borderRadius: 14,
                backgroundColor: theme.colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
            </View>
            <Text style={[theme.typography.bodyStrong, { flex: 1 }]}>{id}</Text>
          </View>
        ))
      ) : (
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{emptyLabel}</Text>
      )}
    </GlassCard>
  );
 
  const TeacherLoadRow = ({ item }: { item: TeacherCapacityItem }) => {
    const loadColor = pickProgressColor(theme, item.percentage);
    const widthAnim = useAnimatedProgress(item.percentage);
 
    return (
      <View
        style={{
          backgroundColor: theme.colors.surfaceAlt,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 14,
          marginBottom: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 12 }}>
            <View
              style={{
                height: 40,
                width: 40,
                borderRadius: 15,
                backgroundColor: theme.colors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <Text style={[theme.typography.bodyStrong, { color: theme.colors.primary }]}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted }]}>Joined {formatDateTime(item.created_at)}</Text>
            </View>
          </View>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: `${loadColor}15`,
            }}
          >
            <Text style={[theme.typography.caption, { color: loadColor, fontWeight: "800" }]}>{`${item.studentCount} / ${item.student_limit}`}</Text>
          </View>
        </View>
 
        <View
          style={{
            height: 10,
            borderRadius: 999,
            backgroundColor: theme.colors.background,
            overflow: "hidden",
            marginTop: 12,
          }}
        >
          <Animated.View
            style={{
              height: "100%",
              backgroundColor: loadColor,
              width: widthAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ["0%", "100%"],
              }),
            }}
          />
        </View>
      </View>
    );
  };

  const teacherDashboard = (
    <>
      <AnimatedSection delay={0}>
        <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
          <TouchableOpacity
            onPress={() => setQuickActionsOpen((o) => !o)}
            activeOpacity={0.8}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: quickActionsOpen ? 12 : 0 }}
          >
            <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Quick actions</Text>
            <Ionicons name={quickActionsOpen ? "chevron-up" : "chevron-down"} size={15} color={theme.colors.textMuted} />
          </TouchableOpacity>
          {quickActionsOpen && (isAdmin ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
              <QuickActionCard label="Create Lesson" icon="book" twoPerRow />
              <QuickActionCard label="Create Student" icon="school" twoPerRow />
              <QuickActionCard label="Create Teacher" icon="people" twoPerRow />
              <QuickActionCard label="Create Test" icon="clipboard" twoPerRow />
              <QuickActionCard label="Create Principal" icon="shield" twoPerRow />
            </View>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
              <QuickActionCard label="Create Lesson" icon="book" twoPerRow />
              <QuickActionCard label="Create Student" icon="school" twoPerRow />
              {isAdmin || isPrincipal ? <QuickActionCard label="Create Teacher" icon="people" twoPerRow /> : null}
              <QuickActionCard label="Create Test" icon="clipboard" twoPerRow />
            </View>
          ))}
        </GlassCard>
      </AnimatedSection>

      <AnimatedSection delay={80}>
        <GlassCard style={{ marginBottom: 18, borderRadius: 24, overflow: "hidden" }}>
          <View
            style={{
              borderRadius: 24,
              padding: 2,
              backgroundColor: theme.colors.surfaceGlass,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[theme.typography.label, { color: theme.colors.primary }]}>
                  {isAdmin ? "Admin" : isPrincipal ? "Principal" : "Teacher"} workspace
                </Text>
                <Text style={[theme.typography.title, { marginTop: 8, fontSize: 24, lineHeight: 30 }]}>{`Welcome back, ${teacherName}`}</Text>
                <Text style={[theme.typography.bodyStrong, { marginTop: 8, color: theme.colors.textMuted }]}>{welcomeSubtitle}</Text>
              </View>
 
              <View
                style={{
                  height: 52,
                  width: 52,
                  borderRadius: 18,
                  backgroundColor: theme.colors.primarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Ionicons name="shield-checkmark" size={24} color={theme.colors.primary} />
              </View>
            </View>

            <View style={{ marginTop: 14, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
              {stats.map((s) => (
                <StatCard
                  key={s.label}
                  label={s.label}
                  value={s.animatedValue}
                  icon={s.icon}
                  iconBg={s.iconBg}
                  iconColor={s.iconColor}
                  tint={s.tint}
                  onPress={s.onPress}
                  twoPerRow
                />
              ))}
            </View>
          </View>
        </GlassCard>
      </AnimatedSection>
 
      {isAdmin ? (
        <AnimatedSection delay={200}>
          <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
            <SectionHeader eyebrow="Platform" title="Key KPIs" subtitle="Plan distribution plus recurring monthly revenue." />
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
              <CompactMetric label="Basic" value={adminPlanCounts.basic} accent="#F7F8FA" />
              <CompactMetric label="Standard" value={adminPlanCounts.standard} accent="#F4EEFF" />
              <CompactMetric label="School" value={adminPlanCounts.school} accent="#EEF8F2" />
              <CompactMetric label="Internal" value={adminPlanCounts.internal} accent="#F5F5F7" />
              <View
                style={{
                  width: "100%",
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme.colors.success,
                  backgroundColor: theme.colors.successSoft,
                  padding: 16,
                }}
              >
                <Text style={[theme.typography.label, { color: theme.colors.success }]}>Revenue /mo</Text>
                <Text style={{ marginTop: 8, fontWeight: "800", fontSize: 28, lineHeight: 32, color: theme.colors.success }}>
                  {`$${animatedRevenueCount.toFixed(0)}`}
                </Text>
              </View>
            </View>
          </GlassCard>
        </AnimatedSection>
      ) : null}
 
      {isAdmin || isPrincipal ? (
        <AnimatedSection delay={260}>
          <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
            <SectionHeader eyebrow="Teachers" title="Capacity and activity" subtitle="Animated load bars make team health easier to scan." />
            {teacherCapacity.length > 0 ? (
              teacherCapacity.map((t) => <TeacherLoadRow key={t.id} item={t} />)
            ) : (
              <View
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                  padding: 22,
                  alignItems: "center",
                }}
              >
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No teachers found</Text>
              </View>
            )}
          </GlassCard>
        </AnimatedSection>
      ) : (
        <>
          <AnimatedSection delay={280}>
            {activityTab === "lessons" ? (
              <RecentLessonsCard items={recentLessons} />
            ) : activityTab === "tests" ? (
              <RecentTestsCard items={recentTests} />
            ) : (
              <StudentActivityPillCard items={recentStudentActivity} />
            )}
          </AnimatedSection>
        </>
      )}
    </>
  );
 
  const studentDashboard = (
    <>
      <AnimatedSection delay={0}>
        <GlassCard style={{ marginBottom: 18, borderRadius: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Student dashboard</Text>
              <Text style={[theme.typography.title, { marginTop: 8, fontSize: 24, lineHeight: 30 }]}>{`Hello, ${studentName}`}</Text>
              <Text style={[theme.typography.bodyStrong, { marginTop: 8, color: theme.colors.textMuted }]}>
                {studentTeacherName ? `Teacher: ${studentTeacherName}` : "Welcome to Eluency"}
              </Text>
            </View>
            <View
              style={{
                height: 64,
                width: 64,
                borderRadius: 24,
                backgroundColor: theme.colors.violetSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="school" size={28} color={theme.colors.primary} />
            </View>
          </View>
        </GlassCard>
      </AnimatedSection>
 
      {studentExpiresAt ? (
        <AnimatedSection delay={80}>
          <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
            <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Session</Text>
            <Text style={[theme.typography.caption, { marginTop: 8, color: theme.colors.textMuted }]}>{`Active until ${formatDateTime(studentExpiresAt)}`}</Text>
          </GlassCard>
        </AnimatedSection>
      ) : null}
 
      <AnimatedSection delay={120}>
        <AssignmentCard eyebrow="Lessons" title="Assigned lessons" items={assignedLessonsIds} emptyLabel="No lessons assigned." />
      </AnimatedSection>
      <AnimatedSection delay={180}>
        <AssignmentCard eyebrow="Tests" title="Assigned tests" items={assignedTestsIds} emptyLabel="No tests assigned." />
      </AnimatedSection>
 
      {sessionId ? (
        <AnimatedSection delay={240}>
          <View style={{ marginBottom: 16 }}>
            <AppButton
              label="Start Study Game"
              onPress={() => navigation.navigate("StudyGame", { sessionId })}
              icon={<Ionicons name="game-controller-outline" size={18} color={theme.colors.primaryText} />}
            />
          </View>
        </AnimatedSection>
      ) : null}
 
      <AnimatedSection delay={300}>
        <AppButton
          label="Back to Login"
          variant="secondary"
          onPress={handleSignOut}
          icon={<Ionicons name="log-out-outline" size={18} color={theme.colors.text} />}
        />
      </AnimatedSection>
    </>
  );
 
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <DashboardBackground theme={theme} />

      <Modal
        visible={!!selectedStudentActivity}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedStudentActivity(null)}
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
              onPress={() => setSelectedStudentActivity(null)}
            />

            <View>
              <GlassCard style={{ borderRadius: 24, overflow: "hidden", maxHeight: "100%" }} padding={0} variant="strong">
                {selectedStudentActivity && (() => {
                  const activity = selectedStudentActivity;
                  const issues: ActivityIssue[] = Array.isArray(activity.issues) ? activity.issues : [];
                  const outcomeCounts = getStudentActivityOutcomeCounts(activity);
                  const resultColor = activity.percentage !== null
                    ? (activity.percentage >= 80 ? theme.colors.success : activity.percentage >= 50 ? "#D97706" : theme.colors.danger)
                    : theme.colors.text;

                  return (
                    <>
                      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={[theme.typography.title, { fontSize: 18 }]}>{activity.isTest ? "Test review" : "Lesson review"}</Text>
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 3 }]}>
                            {activity.studentName} | {activity.contentName}
                          </Text>
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                            {activity.created_at ? new Date(activity.created_at).toLocaleDateString() : "Past attempt"}
                          </Text>
                        </View>
                        {activity.percentage !== null ? (
                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={[theme.typography.title, { fontSize: 24, color: resultColor }]}>{activity.percentage}%</Text>
                            {activity.score !== null && activity.total !== null ? (
                              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                                {activity.score}/{activity.total} correct
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
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
                            <View style={{ gap: 8 }}>
                              {issues.map((issue, index) => {
                                const iconColor = activityIssueColor(theme.colors, issue.kind);
                                return (
                                  <View
                                    key={issue.id ?? index}
                                    style={{
                                      borderRadius: 12,
                                      borderWidth: 1,
                                      borderColor: theme.colors.border,
                                      backgroundColor: theme.colors.surfaceGlass,
                                      padding: 12,
                                    }}
                                  >
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                      <Ionicons name={activityIssueIcon(issue.kind)} size={14} color={iconColor} />
                                      <Text style={[theme.typography.bodyStrong, { fontSize: 11.5 }]}>
                                        {activityIssueLabel(issue.kind)}
                                      </Text>
                                    </View>
                                    <Text style={[theme.typography.body, { marginTop: 6, fontSize: 12, lineHeight: 18 }]}>
                                      P: {typeof issue.prompt === "string" ? issue.prompt || "Untitled" : "Untitled"}
                                    </Text>
                                    {typeof issue.expected === "string" && issue.expected ? (
                                      <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted, lineHeight: 18 }]}>
                                        E: {issue.expected}
                                      </Text>
                                    ) : null}
                                    {typeof issue.answer === "string" && issue.answer ? (
                                      <Text style={[theme.typography.caption, { marginTop: 3, color: theme.colors.textMuted, lineHeight: 18 }]}>
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
                          onPress={() => setSelectedStudentActivity(null)}
                          style={{ borderRadius: 14, backgroundColor: theme.colors.success, paddingVertical: 13, alignItems: "center" }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff" }}>Close</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  );
                })()}
              </GlassCard>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={drawerVisible} animationType="none" onRequestClose={closeMenu}>
        <View style={{ flex: 1 }}>
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "rgba(0,0,0,0.35)",
              opacity: backdropAnim,
            }}
          />
 
          <TouchableOpacity
            activeOpacity={1}
            style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
            onPress={closeMenu}
          />
 
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: drawerWidth,
              transform: [{ translateX: drawerAnim }],
              backgroundColor: theme.colors.background,
              zIndex: 2,
            }}
          >
            <DashboardBackground theme={theme} />
 
            <ScrollView
              contentContainerStyle={{
                paddingTop: insets.top + 20,
                paddingHorizontal: 20,
                paddingBottom: 28,
              }}
              showsVerticalScrollIndicator={false}
            >
              <GlassCard style={{ marginBottom: 18, borderRadius: 18, position: "relative" }} padding={18}>
                <TouchableOpacity
                  onPress={closeMenu}
                  activeOpacity={0.8}
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    height: 38,
                    width: 38,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceGlass,
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 2,
                  }}
                >
                  <Ionicons name="chevron-back" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
 
                <Text style={[theme.typography.label, { color: theme.colors.primary }]}>
                  {isStudentMode ? "Student Access" : isAdmin ? "Admin Access" : isPrincipal ? "Principal Access" : "Teacher Access"}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 }}>
                  {isStudentMode ? (
                    <Text style={[theme.typography.title, { fontSize: 22, lineHeight: 28, flex: 1 }]}>{studentName || "Student"}</Text>
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        closeMenu();
                        navigation.navigate("Settings", { initialTab: "profile" });
                      }}
                      activeOpacity={0.8}
                      style={{ flex: 1, alignSelf: "flex-start" }}
                    >
                      <Text style={[theme.typography.title, { fontSize: 22, lineHeight: 28, textDecorationLine: "underline" }]}>{teacherName}</Text>
                    </TouchableOpacity>
                  )}
                  {!isStudentMode && (
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginLeft: 8 }]}>{todayLabel}</Text>
                  )}
                </View>
                {isStudentMode && (
                  <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted }]}>
                    {studentTeacherName ? `Connected to ${studentTeacherName}` : "Welcome to your learning space"}
                  </Text>
                )}

                <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, paddingVertical: 7, paddingHorizontal: 10, gap: 6 }}>
                    <Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>{isStudentMode ? "Lessons" : "Classes"}</Text>
                    <Text style={[theme.typography.label, { color: theme.colors.border }]}>|</Text>
                    <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>{isStudentMode ? assignedLessonsIds.length : animatedLessonsCount}</Text>
                  </View>
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, paddingVertical: 7, paddingHorizontal: 10, gap: 6 }}>
                    <Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>{isStudentMode ? "Tests" : "Students"}</Text>
                    <Text style={[theme.typography.label, { color: theme.colors.border }]}>|</Text>
                    <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]}>{isStudentMode ? assignedTestsIds.length : animatedStudentsCount}</Text>
                  </View>
                </View>
              </GlassCard>
 
              {(() => {
                const DRAWER_COLORS: Record<string, { iconBg: string; iconColor: string; tint: string; border: string }> = {
                  "/dashboard":                       { iconBg: "#D4462A",             iconColor: "#FFFFFF", tint: "#FDF0EE",                   border: "#F0B9B0" },
                  "/dashboard/lessons":               { iconBg: "#3777C9",             iconColor: "#FFFFFF", tint: "#ECF4FF",                   border: "#B8D3F7" },
                  "/dashboard/tests":                 { iconBg: "#9050E7",             iconColor: "#FFFFFF", tint: "#F3ECFF",                   border: "#D5B8FC" },
                  "/dashboard/students":              { iconBg: "#3EA370",             iconColor: "#FFFFFF", tint: "#EBF8F0",                   border: "#A8DFC0" },
                  "/dashboard/packs":                 { iconBg: "#E3A91F",             iconColor: "#FFFFFF", tint: "#FFF7DE",                   border: "#F4DB88" },
                  "/dashboard/teachers":              { iconBg: "#E3A91F",             iconColor: "#FFFFFF", tint: "#FFF7DE",                   border: "#F4DB88" },
                  "/dashboard/notifications":         { iconBg: "#E85D4A",             iconColor: "#FFFFFF", tint: "#FFF0EE",                   border: "#F7C5BF" },
                  "/dashboard/chats":                 { iconBg: "#7C5CFA",             iconColor: "#FFFFFF", tint: "#F3EEFF",                   border: "#CEC0FD" },
                  "/dashboard/settings":              { iconBg: "#5C6370",             iconColor: "#FFFFFF", tint: theme.colors.surfaceAlt,     border: theme.colors.border },
                  "/dashboard/settings/subscription": { iconBg: "#7C5CFA",             iconColor: "#FFFFFF", tint: "#F3EEFF",                   border: "#CEC0FD" },
                };
                return menuSections.map((section) => (
                  <GlassCard key={section.title} style={{ marginBottom: 16, borderRadius: 18 }} padding={14}>
                    <Text style={[theme.typography.label, { marginBottom: 10, color: theme.colors.primary }]}>{section.title}</Text>
                    {section.items.map((item, index) => {
                      const colors = DRAWER_COLORS[item.href] ?? { iconBg: theme.colors.primary, iconColor: "#FFFFFF", tint: theme.colors.surfaceAlt, border: theme.colors.border };
                      return (
                        <AnimatedPressable
                          key={item.href}
                          onPress={() => { closeMenu(); handleActionPress(item.href); }}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 10,
                            paddingHorizontal: 10,
                            borderRadius: 14,
                            backgroundColor: theme.isDark ? theme.colors.surfaceAlt : colors.tint,
                            marginBottom: index === section.items.length - 1 ? 0 : 10,
                            borderWidth: 1,
                            borderColor: theme.isDark ? theme.colors.border : colors.border,
                          }}
                        >
                          <View style={{ height: 36, width: 36, borderRadius: 11, backgroundColor: colors.iconBg, alignItems: "center", justifyContent: "center", marginRight: 10, shadowColor: colors.iconBg, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
                            <Ionicons name={ICONS[item.icon]} size={16} color={colors.iconColor} />
                          </View>
                          <Text style={[theme.typography.bodyStrong, { flex: 1, color: theme.colors.text }]}>{item.label}</Text>
                          <View style={{ height: 26, width: 26, borderRadius: 9, backgroundColor: theme.isDark ? theme.colors.surfaceGlass : "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" }}>
                            <Ionicons name="chevron-forward" size={13} color={theme.colors.textMuted} />
                          </View>
                        </AnimatedPressable>
                      );
                    })}
                  </GlassCard>
                ));
              })()}
              <AppButton
                label="Sign Out"
                variant="secondary"
                onPress={() => {
                  closeMenu();
                  handleSignOut();
                }}
                icon={<Ionicons name="log-out-outline" size={18} color={theme.colors.text} />}
              />
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
 
      <Animated.View
        style={{
          flex: 1,
          transform: [{ scale: contentScale }],
        }}
      >
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            backgroundColor: theme.isDark ? theme.colors.background : "rgba(255,255,255,0.96)",
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            paddingHorizontal: 20,
            paddingTop: Math.max(insets.top, 8) + 10,
            paddingBottom: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }],
          }}
          pointerEvents="box-none"
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <AnimatedPressable
              onPress={openMenu}
              style={{
                height: 46,
                width: 46,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceGlass,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="apps-outline" size={20} color={theme.colors.textMuted} />
            </AnimatedPressable>
 
            <View style={{ flex: 1, paddingHorizontal: 12 }}>
              <Text style={[theme.typography.label, { color: theme.colors.primary }]}>{isStudentMode ? "Student Dashboard" : "Dashboard"}</Text>
              <Text style={[theme.typography.title, { marginTop: 4, fontSize: 18, lineHeight: 22 }]}>Eluency</Text>
            </View>
          </View>
 
          <ThemeToggleButton />
          <AnimatedPressable
            onPress={() => navigation.navigate("Settings")}
            style={{
              height: 42,
              width: 42,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceGlass,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={[theme.typography.bodyStrong, { fontWeight: "800", color: theme.colors.text }]}>{currentUserInitial}</Text>
          </AnimatedPressable>
        </Animated.View>
 
        <Animated.ScrollView
          style={{ transform: [{ translateY: contentLift }] }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: topBarHeight + 16,
            paddingBottom: 36,
          }}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <GlassCard style={{ borderRadius: 18 }}>
              <View style={{ gap: 18 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <SkeletonBox width={52} height={52} radius={16} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <SkeletonBox width="40%" height={12} radius={6} />
                    <SkeletonBox width="65%" height={20} radius={10} />
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <SkeletonBox width="31%" height={92} radius={18} style={{ flex: 1 }} />
                  <SkeletonBox width="31%" height={92} radius={18} style={{ flex: 1 }} />
                  <SkeletonBox width="31%" height={92} radius={18} style={{ flex: 1 }} />
                </View>
                <SkeletonBox width="100%" height={170} radius={22} />
                <SkeletonBox width="100%" height={120} radius={22} />
              </View>
            </GlassCard>
          ) : fatalError ? (
            <GlassCard style={{ borderRadius: 18 }}>
              <Text style={theme.typography.title}>Error loading dashboard</Text>
              <Text style={[theme.typography.body, { marginTop: 10 }]}>{fatalError}</Text>
              <View style={{ marginTop: 16 }}>
                <AppButton
                  label="Back to Login"
                  variant="secondary"
                  onPress={handleSignOut}
                  icon={<Ionicons name="arrow-back-outline" size={18} color={theme.colors.text} />}
                />
              </View>
            </GlassCard>
          ) : isStudentMode ? (
            studentDashboard
          ) : (
            teacherDashboard
          )}
        </Animated.ScrollView>
      </Animated.View>
    </View>
  );
}

