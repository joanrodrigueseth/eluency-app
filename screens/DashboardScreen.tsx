import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { NavigationProp, RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
 
import AppButton from "../components/AppButton";
import GlassCard from "../components/GlassCard";
import { SkeletonBox } from "../components/SkeletonLoader";
import { triggerLightImpact } from "../lib/haptics";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";
 
type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  Chats: undefined;
  SendNotifications: undefined;
  Teachers: undefined;
  Settings: undefined;
  Subscription: undefined;
  LessonPacks: undefined;
  Lessons: undefined;
  LessonForm: { lessonId?: string } | undefined;
  Students: undefined;
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
 
function pickProgressColor(theme: ReturnType<typeof useAppTheme>, percentage: number) {
  if (percentage >= 90) return theme.colors.danger;
  if (percentage >= 70) return theme.colors.primary;
  return theme.colors.success;
}
 
function getLanguageBadgeColors(badge: string) {
  switch (badge) {
    case "PT":
      return { backgroundColor: "#EAF7EE", borderColor: "#2F9E44", textColor: "#1F7A35" };
    case "ESP":
      return { backgroundColor: "#FFF4E5", borderColor: "#F08C00", textColor: "#C56A00" };
    case "FR":
      return { backgroundColor: "#ECF4FF", borderColor: "#2F6FED", textColor: "#2458B8" };
    case "DE":
      return { backgroundColor: "#F5F5F5", borderColor: "#5C5F66", textColor: "#2D2F33" };
    case "IT":
      return { backgroundColor: "#EEF8EF", borderColor: "#3A9D5D", textColor: "#2B7A46" };
    case "EN":
      return { backgroundColor: "#F1F6FF", borderColor: "#4C7CEB", textColor: "#355FC2" };
    default:
      return { backgroundColor: "#FFF3E8", borderColor: "#D96B1C", textColor: "#B55312" };
  }
}
 
function normalizeLanguageBadge(value?: string | null) {
  const raw = (value ?? "").trim().toUpperCase();
  if (!raw) return "EN";
  if (raw === "PORTUGUESE" || raw === "PORTUGUES" || raw === "PORTUGUÊS" || raw === "PT-BR" || raw === "PT") return "PT";
  if (raw === "SPANISH" || raw === "ESPANOL" || raw === "ESPAÑOL" || raw === "ES" || raw === "ESP") return "ESP";
  if (raw === "FRENCH" || raw === "FRANCAIS" || raw === "FRANÇAIS" || raw === "FR") return "FR";
  if (raw === "GERMAN" || raw === "DEUTSCH" || raw === "DE") return "DE";
  if (raw === "ITALIAN" || raw === "ITALIANO" || raw === "IT") return "IT";
  if (raw === "ENGLISH" || raw === "EN") return "EN";
  return raw.length <= 3 ? raw : raw.slice(0, 3);
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
 
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPrincipal, setIsPrincipal] = useState(false);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [lessonsCount, setLessonsCount] = useState(0);
  const [testsCount, setTestsCount] = useState(0);
  const [studentsCount, setStudentsCount] = useState(0);
  const [teachersCount, setTeachersCount] = useState(0);
  const [adminPlanCounts, setAdminPlanCounts] = useState({
    free: 0,
    tutor: 0,
    standard: 0,
    pro: 0,
    school: 0,
    internal: 0,
  });
  const [adminRevenueMonthly, setAdminRevenueMonthly] = useState(0);
  const [recentLessons, setRecentLessons] = useState<RecentLesson[]>([]);
  const [recentTests, setRecentTests] = useState<RecentTest[]>([]);
  const [teacherCapacity, setTeacherCapacity] = useState<TeacherCapacityItem[]>([]);
 
  const [studentName, setStudentName] = useState<string>("");
  const [studentTeacherName, setStudentTeacherName] = useState<string>("");
  const [assignedLessonsIds, setAssignedLessonsIds] = useState<string[]>([]);
  const [assignedTestsIds, setAssignedTestsIds] = useState<string[]>([]);
  const [studentExpiresAt, setStudentExpiresAt] = useState<string>("");
 
  const isStudentMode = !!sessionId;
  const currentUserName = isStudentMode ? studentName || "Student" : teacherName || "Teacher";
  const currentUserInitial = currentUserName.trim().charAt(0).toUpperCase() || "U";
 
  const PLAN_PRICE_MONTHLY = useMemo(
    () => ({
      free: 0,
      tutor: 14.99,
      standard: 29.99,
      teacher: 29.99,
      pro: 49.99,
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
    if (label === "New Lesson" || label === "New Lessons") {
      navigation.navigate("Lessons");
      return;
    }
    if (label === "New Test" || label === "New Tests") {
      navigation.navigate("Tests");
      return;
    }
    if (label === "Add Student" || label === "Add Students") {
      navigation.navigate("Students");
      return;
    }
    if (label === "Add Teacher" || label === "Add Principal") {
      navigation.navigate("Teachers");
      return;
    }
 
    Alert.alert("Coming soon", `Mobile action not implemented yet: ${label}`);
  };
 
  const menuSections = useMemo(() => {
    const workspace = [
      { label: "Dashboard", href: "/dashboard", icon: "shield" as const },
      { label: "Lessons", href: "/dashboard/lessons", icon: "book" as const },
      { label: "Tests", href: "/dashboard/tests", icon: "clipboard" as const },
      { label: "Students", href: "/dashboard/students", icon: "school" as const },
      { label: "Lesson Packs", href: "/dashboard/packs", icon: "star" as const },
    ];
 
    const admin = isAdmin
      ? [
          { label: "Teachers", href: "/dashboard/teachers", icon: "people" as const },
          { label: "Send Notifications", href: "/dashboard/notifications", icon: "flame" as const },
          { label: "Chats", href: "/dashboard/chats", icon: "star" as const },
        ]
      : [];
 
    const account = [
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
            free: 0,
            tutor: 0,
            standard: 0,
            pro: 0,
            school: 0,
            internal: 0,
          };
 
          for (const row of planRows) {
            const p = (row?.plan ?? "free").toLowerCase().trim();
            if (p === "standard" || p === "teacher") localPlanCounts.standard++;
            else if (p === "internal") localPlanCounts.internal++;
            else if (p in localPlanCounts) (localPlanCounts as any)[p]++;
            else localPlanCounts.free++;
          }
 
          const revenueMonthly =
            localPlanCounts.tutor * PLAN_PRICE_MONTHLY.tutor +
            localPlanCounts.standard * PLAN_PRICE_MONTHLY.standard +
            localPlanCounts.pro * PLAN_PRICE_MONTHLY.pro;
 
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
 
  const topBarHeight = Math.max(insets.top, 8) + 66;
 
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
    <View style={{ width: twoPerRow ? "32%" : "100%", marginBottom: twoPerRow ? 10 : 0 }}>
      <AnimatedPressable
        onPress={onPress}
        style={{
          borderRadius: 16,
          padding: 10,
          backgroundColor: tint,
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: "#000",
          shadowOpacity: 0.04,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }}
      >
        <View style={{ position: "absolute", top: 7, right: 7 }}>
          <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.07)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="chevron-forward" size={10} color={theme.colors.textMuted} />
          </View>
        </View>
        <View style={{ alignItems: "center" }}>
          <View
            style={{
              height: 28,
              width: 28,
              borderRadius: 10,
              backgroundColor: iconBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={ICONS[icon]} size={13} color={iconColor} />
          </View>
          <Text
            style={{
              marginTop: 8,
              fontSize: 20,
              lineHeight: 24,
              fontWeight: "800",
              color: theme.colors.text,
              textAlign: "center",
            }}
          >
            {value}
          </Text>
          <Text style={[theme.typography.bodyStrong, { marginTop: 2, fontSize: 12, color: theme.colors.textMuted, textAlign: "center" }]}>{label}</Text>
        </View>
      </AnimatedPressable>
    </View>
  );
 
  const QuickActionCard = ({
    label,
    icon,
    helper,
    twoPerRow,
  }: {
    label: string;
    icon: keyof typeof ICONS;
    helper: string;
    twoPerRow?: boolean;
  }) => {
    const colors =
      icon === "book"
        ? { bg: "#EEF5FF", iconWrap: "#DDEBFF", icon: "#2D74BF" }
        : icon === "clipboard"
          ? { bg: "#F5EEFF", iconWrap: "#E8D7FF", icon: "#8B4EE2" }
          : icon === "school"
            ? { bg: "#EEF9F2", iconWrap: "#D6F0E0", icon: "#3A9E6A" }
            : { bg: "#FFF8E7", iconWrap: "#FCEAB8", icon: "#B98A10" };
 
    return (
      <View style={{ width: twoPerRow ? "48.5%" : "48%", marginBottom: 10 }}>
        <AnimatedPressable
          onPress={() => handleActionPress(label)}
          style={{
            borderRadius: 18,
            padding: 12,
            backgroundColor: colors.bg,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <View
            style={{
              height: 34,
              width: 34,
              borderRadius: 12,
              backgroundColor: colors.iconWrap,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={ICONS[icon]} size={15} color={colors.icon} />
          </View>
          <Text style={[theme.typography.bodyStrong, { marginTop: 11, fontSize: 14 }]}>{label}</Text>
          <Text style={[theme.typography.caption, { marginTop: 3, fontSize: 11, color: theme.colors.textMuted }]}>{helper}</Text>
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
 
  const RecentLessonsCard = ({ items }: { items: RecentLesson[] }) => {
    const visibleItems = items.slice(0, 5);
 
    return (
      <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
        <SectionHeader eyebrow="Activity" title="Recent lessons" subtitle="Your latest lessons in a cleaner, faster-scanning layout." />
 
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
                    backgroundColor: theme.colors.surfaceAlt,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    padding: 14,
                    marginTop: index === 0 ? 0 : 10,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        height: 42,
                        width: 42,
                        borderRadius: 16,
                        backgroundColor: theme.colors.violetSoft,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      <Ionicons name="clipboard-outline" size={18} color={theme.colors.primary} />
                    </View>
 
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[theme.typography.bodyStrong, { color: theme.colors.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>Created {formatDateTime(item.created_at)}</Text>
                        <CountPill label="W" value={vocabCount} />
                        <CountPill label="Q" value={questionCount} />
                      </View>
                    </View>
 
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
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
          </View>
        </GlassCard>
      </AnimatedSection>
 
      <AnimatedSection delay={80}>
        <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
          <SectionHeader eyebrow="Overview" title="Your numbers" subtitle="A more glanceable snapshot of classroom activity." />
          <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
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
        </GlassCard>
      </AnimatedSection>
 
      <AnimatedSection delay={140}>
        <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
          <SectionHeader eyebrow="Shortcuts" title="Quick actions" subtitle="Large, more visual entry points into your next task." />
          {isAdmin ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
              <QuickActionCard label="New Lessons" icon="book" helper="Create lesson content" twoPerRow />
              <QuickActionCard label="New Tests" icon="clipboard" helper="Build an assessment" twoPerRow />
              <QuickActionCard label="Add Students" icon="school" helper="Invite or assign learners" twoPerRow />
              <QuickActionCard label="Add Teacher" icon="people" helper="Grow your team" twoPerRow />
              <QuickActionCard label="Add Principal" icon="shield" helper="Grant leadership access" twoPerRow />
            </View>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
              <QuickActionCard label="New Lesson" icon="book" helper="Create lesson content" twoPerRow />
              <QuickActionCard label="New Test" icon="clipboard" helper="Build an assessment" twoPerRow />
              <QuickActionCard label="Add Student" icon="school" helper="Invite a learner" twoPerRow />
              {isAdmin || isPrincipal ? <QuickActionCard label="Add Teacher" icon="people" helper="Add a teacher" twoPerRow /> : null}
            </View>
          )}
        </GlassCard>
      </AnimatedSection>
 
      {isAdmin ? (
        <AnimatedSection delay={200}>
          <GlassCard style={{ marginBottom: 16, borderRadius: 18 }}>
            <SectionHeader eyebrow="Platform" title="Key KPIs" subtitle="Plan distribution plus recurring monthly revenue." />
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
              <CompactMetric label="Free" value={adminPlanCounts.free} accent="#F7F8FA" />
              <CompactMetric label="Tutor" value={adminPlanCounts.tutor} accent="#EDF5FF" />
              <CompactMetric label="Teacher" value={adminPlanCounts.standard} accent="#F4EEFF" />
              <CompactMetric label="Pro" value={adminPlanCounts.pro} accent="#FFF6E5" />
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
          <AnimatedSection delay={220}>
            <RecentLessonsCard items={recentLessons} />
          </AnimatedSection>
          <AnimatedSection delay={280}>
            <RecentTestsCard items={recentTests} />
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
                  <Text style={[theme.typography.title, { fontSize: 22, lineHeight: 28, flex: 1 }]}>{isStudentMode ? studentName || "Student" : teacherName}</Text>
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
                  "/dashboard":                       { iconBg: theme.colors.primary,  iconColor: "#FFFFFF", tint: theme.colors.primarySoft,   border: theme.colors.primary },
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
        <View
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
            paddingTop: Math.max(insets.top, 8),
            paddingBottom: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
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
        </View>
 
        <ScrollView
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
        </ScrollView>
      </Animated.View>
    </View>
  );
}
