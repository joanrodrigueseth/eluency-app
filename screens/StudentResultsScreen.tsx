import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { NavigationProp, useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";

import GlassCard from "../components/GlassCard";
import ScreenHeader, { useScreenHeaderHeight } from "../components/ScreenHeader";
import { Pressable, TouchableOpacity } from "../lib/hapticPressables";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";

type RootStackParamList = {
  StudentResults: undefined;
};

type StudentResultWord = {
  id?: string;
  en?: string;
  pt?: string;
  sp?: string;
  se?: string;
};

type StudentResultAnswer = {
  word?: StudentResultWord;
  userAnswer?: string;
  correctAnswer?: string;
  result?: string;
  direction?: string;
  timestamp?: number;
};

type StudentResultScore = {
  correct?: number;
  close?: number;
  wrong?: number;
  answers?: StudentResultAnswer[];
};

type StudentResultRecord = {
  type: string;
  mode?: string;
  lessonId?: string;
  lessonName?: string;
  direction?: string;
  score?: StudentResultScore;
  totalWords?: number;
  percentage?: number;
  timestamp?: number;
  date?: string;
};

type StudentResultTeacherOption = {
  id: string;
  name: string;
  email?: string | null;
};

type StudentResultStudent = {
  id: string;
  name: string;
  email?: string | null;
  teacherId?: string | null;
  lastActive?: string | null;
  assignedLessons: number;
  assignedTests: number;
  records: StudentResultRecord[];
};

type WeakWord = {
  key: string;
  prompt: string;
  answer: string;
  close: number;
  wrong: number;
  total: number;
  students: string[];
};

type StudentSummary = {
  student: StudentResultStudent;
  records: StudentResultRecord[];
  lessonsCompleted: number;
  testsCompleted: number;
  wordsAnswered: number;
  correct: number;
  close: number;
  wrong: number;
  average: number | null;
  testPassRate: number | null;
  lastTimestamp: number | null;
  weakWords: WeakWord[];
  trend: number | null;
  status: "strong" | "steady" | "watch" | "inactive";
};

type MobileStudentResultsResponse = {
  isAdmin: boolean;
  selectedTeacherId?: string;
  selectedTeacherName: string;
  teachers: StudentResultTeacherOption[];
  students: StudentResultStudent[];
  error?: string;
};

type DashboardSummaryIssue = {
  id?: string;
  prompt?: string;
  expected?: string;
  answer?: string;
  kind?: "wrong" | "close" | "skip" | "correct" | "open_review";
};

type DashboardSummaryActivity = {
  id: string;
  studentId: string;
  studentName: string;
  contentName: string;
  isTest: boolean;
  percentage: number | null;
  score: number | null;
  total: number | null;
  issues?: DashboardSummaryIssue[];
  created_at: string;
};

type DashboardSummaryResponse = {
  isAdmin: boolean;
  teacherName: string;
  recentStudentActivity?: DashboardSummaryActivity[];
  error?: string;
};

function issueKindToResult(kind?: DashboardSummaryIssue["kind"]): string {
  if (kind === "close") return "close";
  if (kind === "open_review") return "submitted";
  if (kind === "correct") return "correct";
  return "wrong";
}

function buildRecordFromActivity(activity: DashboardSummaryActivity): StudentResultRecord {
  const issues = Array.isArray(activity.issues) ? activity.issues : [];
  const answers: StudentResultAnswer[] = issues
    .map((issue, index) => ({
      word: {
        id: issue.id || `${activity.id}-${index}`,
        pt: issue.prompt || "Prompt unavailable",
      },
      userAnswer: issue.answer,
      correctAnswer: issue.expected,
      result: issueKindToResult(issue.kind),
    }))
    .filter((answer) => Boolean(answer.word?.pt || answer.correctAnswer || answer.userAnswer));

  const correctCount = typeof activity.score === "number" ? activity.score : 0;
  const totalCount = typeof activity.total === "number" && activity.total > 0 ? activity.total : null;
  const closeCount = answers.filter((answer) => answer.result === "close").length;
  const wrongCountFromAnswers = answers.filter((answer) => answer.result === "wrong").length;
  const wrongCount =
    totalCount !== null
      ? Math.max(totalCount - correctCount - closeCount, 0)
      : wrongCountFromAnswers;

  return {
    type: activity.isTest ? "test" : "practice",
    lessonName: activity.contentName || (activity.isTest ? "Test" : "Lesson"),
    percentage: typeof activity.percentage === "number" ? activity.percentage : undefined,
    totalWords: totalCount ?? undefined,
    timestamp: Number.isFinite(Date.parse(activity.created_at))
      ? new Date(activity.created_at).getTime()
      : undefined,
    date: activity.created_at,
    score: {
      correct: correctCount,
      close: closeCount,
      wrong: wrongCount,
      answers: answers.length > 0 ? answers : undefined,
    },
  };
}

function buildFallbackStudentsFromDashboardSummary(
  activities: DashboardSummaryActivity[]
): StudentResultStudent[] {
  const studentMap = new Map<string, StudentResultStudent>();

  activities.forEach((activity) => {
    const id = activity.studentId || `unknown-${activity.id}`;
    const existing = studentMap.get(id);
    const record = buildRecordFromActivity(activity);

    if (existing) {
      existing.records.push(record);
      return;
    }

    studentMap.set(id, {
      id,
      name: activity.studentName || "Student",
      email: null,
      teacherId: null,
      lastActive: activity.created_at,
      assignedLessons: 0,
      assignedTests: 0,
      records: [record],
    });
  });

  return Array.from(studentMap.values()).map((student) => ({
    ...student,
    records: [...student.records].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
  }));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isTestResult(record: StudentResultRecord) {
  return record.type === "test";
}

function getStudentResultCounts(record: StudentResultRecord) {
  const score = record.score ?? {};
  const answers = Array.isArray(score.answers) ? score.answers : [];

  const correct =
    typeof score.correct === "number"
      ? score.correct
      : answers.filter((answer) => answer.result === "correct").length;
  const close =
    typeof score.close === "number"
      ? score.close
      : answers.filter((answer) => answer.result === "close").length;
  const wrong =
    typeof score.wrong === "number"
      ? score.wrong
      : answers.filter((answer) => answer.result === "wrong").length;

  return {
    correct,
    close,
    wrong,
    total: correct + close + wrong,
  };
}

function getStudentResultPercentage(record: StudentResultRecord): number | null {
  if (typeof record.percentage === "number" && Number.isFinite(record.percentage)) {
    return record.percentage;
  }

  const { correct, close, total } = getStudentResultCounts(record);
  if (total <= 0) return null;
  return Math.round(((correct + close) / total) * 100);
}

function getPrompt(answer: StudentResultAnswer) {
  const word = answer.word;
  if (!word || typeof word !== "object") return "Prompt unavailable";
  return word.pt || word.en || word.sp || word.se || "Prompt unavailable";
}

function formatDate(timestamp: number | null) {
  if (!timestamp) return "No activity";
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(timestamp: number | null) {
  if (!timestamp) return "Unknown";
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(timestamp: number | null) {
  if (!timestamp) return "Unknown";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getWeakWords(records: StudentResultRecord[], studentName?: string): WeakWord[] {
  const map = new Map<string, WeakWord>();

  records.forEach((record) => {
    const answers = record.score?.answers ?? [];
    answers.forEach((answer) => {
      if (answer.result !== "wrong" && answer.result !== "close") return;

      const prompt = getPrompt(answer);
      const correctAnswer = answer.correctAnswer || prompt;
      const key = `${prompt.toLowerCase()}::${correctAnswer.toLowerCase()}`;
      const current =
        map.get(key) ?? {
          key,
          prompt,
          answer: correctAnswer,
          close: 0,
          wrong: 0,
          total: 0,
          students: [],
        };

      if (answer.result === "wrong") current.wrong += 1;
      if (answer.result === "close") current.close += 1;
      current.total += 1;
      if (studentName && !current.students.includes(studentName)) current.students.push(studentName);

      map.set(key, current);
    });
  });

  return Array.from(map.values()).sort((a, b) => b.wrong * 2 + b.close - (a.wrong * 2 + a.close));
}

function summarizeStudent(student: StudentResultStudent): StudentSummary {
  const records = [...student.records].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  const percentages = records.map(getStudentResultPercentage).filter((value): value is number => value !== null);
  const tests = records.filter(isTestResult);

  const passedTests = tests.filter((record) => {
    const pct = getStudentResultPercentage(record);
    return pct !== null && pct >= 80;
  }).length;

  const totals = records.reduce(
    (acc, record) => {
      const counts = getStudentResultCounts(record);
      acc.correct += counts.correct;
      acc.close += counts.close;
      acc.wrong += counts.wrong;
      acc.wordsAnswered +=
        typeof record.totalWords === "number" && record.totalWords > 0
          ? record.totalWords
          : counts.total;
      return acc;
    },
    { correct: 0, close: 0, wrong: 0, wordsAnswered: 0 }
  );

  const recent = percentages.slice(0, 3);
  const previous = percentages.slice(3, 6);
  const recentAverage = average(recent);
  const previousAverage = average(previous);
  const trend =
    recentAverage !== null && previousAverage !== null ? recentAverage - previousAverage : null;
  const averageScore = average(percentages);
  const lastTimestamp = records[0]?.timestamp ?? null;
  const daysSinceLastActivity = lastTimestamp ? (Date.now() - lastTimestamp) / 86400000 : null;
  const weakWords = getWeakWords(records, student.name).slice(0, 5);

  let status: StudentSummary["status"] = "steady";
  if (records.length === 0 || (daysSinceLastActivity !== null && daysSinceLastActivity > 21)) {
    status = "inactive";
  } else if ((averageScore !== null && averageScore < 70) || weakWords.length >= 4) {
    status = "watch";
  } else if (averageScore !== null && averageScore >= 85 && weakWords.length <= 2) {
    status = "strong";
  }

  return {
    student,
    records,
    lessonsCompleted: records.filter((record) => !isTestResult(record)).length,
    testsCompleted: tests.length,
    wordsAnswered: totals.wordsAnswered,
    correct: totals.correct,
    close: totals.close,
    wrong: totals.wrong,
    average: averageScore,
    testPassRate: tests.length > 0 ? Math.round((passedTests / tests.length) * 100) : null,
    lastTimestamp,
    weakWords,
    trend,
    status,
  };
}

function scoreTone(score: number | null, isDark: boolean) {
  if (score === null) {
    return isDark
      ? { bg: "rgba(46,122,191,0.10)", border: "rgba(125,211,252,0.30)", text: "#7DD3FC" }
      : { bg: "#EAF3FB", border: "#B7D0E8", text: "#2E7ABF" };
  }
  if (score >= 85) {
    return isDark
      ? { bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.30)", text: "#6EE7B7" }
      : { bg: "#EEF8F2", border: "#A8DFC0", text: "#2F855A" };
  }
  if (score >= 70) {
    return isDark
      ? { bg: "rgba(124,58,237,0.10)", border: "rgba(196,181,253,0.30)", text: "#C4B5FD" }
      : { bg: "#F5F0FF", border: "#C4B0F8", text: "#7C3AED" };
  }
  if (score >= 50) {
    return isDark
      ? { bg: "rgba(217,119,6,0.10)", border: "rgba(251,191,36,0.30)", text: "#FBBF24" }
      : { bg: "#FFF5DA", border: "#F3C679", text: "#B88400" };
  }
  return isDark
    ? { bg: "rgba(239,68,68,0.10)", border: "rgba(248,113,113,0.30)", text: "#FCA5A5" }
    : { bg: "#FFF1F1", border: "#F8B4B4", text: "#DC2626" };
}

function statusCopy(status: StudentSummary["status"]) {
  if (status === "strong") return { label: "Strong", bg: "#EEF8F2", border: "#A8DFC0", text: "#2F855A" };
  if (status === "watch") return { label: "Watch", bg: "#FFF5DA", border: "#F3C679", text: "#B88400" };
  if (status === "inactive") return { label: "Inactive", bg: "#EAF3FB", border: "#B7D0E8", text: "#2E7ABF" };
  return { label: "Steady", bg: "#F5F0FF", border: "#C4B0F8", text: "#7C3AED" };
}

export default function StudentResultsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const theme = useAppTheme();
  const headerHeight = useScreenHeaderHeight();
  const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [teachers, setTeachers] = useState<StudentResultTeacherOption[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | undefined>(undefined);
  const [selectedTeacherName, setSelectedTeacherName] = useState("Your students");
  const [students, setStudents] = useState<StudentResultStudent[]>([]);

  const [query, setQuery] = useState("");
  const [selectedSummary, setSelectedSummary] = useState<StudentSummary | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<{ record: StudentResultRecord; studentName: string } | null>(null);
  const [showReteachList, setShowReteachList] = useState(false);
  const [dismissedWeakWords, setDismissedWeakWords] = useState<Record<string, "taught" | "removed">>({});
  const [showModalReteach, setShowModalReteach] = useState(false);
  const [showModalHistory, setShowModalHistory] = useState(false);
  const [showAllRecentAttempts, setShowAllRecentAttempts] = useState(false);

  const loadData = useCallback(
    async (teacherId?: string, silent?: boolean) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          navigation.goBack();
          return;
        }

        const base = apiBaseUrl.replace(/\/$/, "");
        const endpoint = teacherId
          ? `${base}/api/mobile/student-results?teacherId=${encodeURIComponent(teacherId)}`
          : `${base}/api/mobile/student-results`;

        const response = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Cache-Control": "no-cache",
          },
        });

        const result = (await response.json().catch(() => ({}))) as MobileStudentResultsResponse;

        if (!response.ok || result.error) {
          // Fallback: older backend builds may not have /api/mobile/student-results yet.
          const legacyResponse = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/mobile/dashboard-summary`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Cache-Control": "no-cache",
            },
          });

          const legacy = (await legacyResponse.json().catch(() => ({}))) as DashboardSummaryResponse;
          if (!legacyResponse.ok || legacy.error) {
            throw new Error(
              result.error || legacy.error || `Unable to load student results (status ${response.status}).`
            );
          }

          const fallbackActivities = Array.isArray(legacy.recentStudentActivity)
            ? legacy.recentStudentActivity
            : [];

          setIsAdmin(Boolean(legacy.isAdmin));
          setTeachers([]);
          setSelectedTeacherId(undefined);
          setSelectedTeacherName(legacy.teacherName || "Your students");
          setStudents(buildFallbackStudentsFromDashboardSummary(fallbackActivities));
          return;
        }

        setIsAdmin(Boolean(result.isAdmin));
        setTeachers(Array.isArray(result.teachers) ? result.teachers : []);
        setSelectedTeacherId(result.selectedTeacherId);
        setSelectedTeacherName(result.selectedTeacherName || "Your students");
        setStudents(Array.isArray(result.students) ? result.students : []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load student results.";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiBaseUrl, navigation]
  );

  useFocusEffect(
    useCallback(() => {
      loadData(selectedTeacherId).catch(() => {});
    }, [loadData, selectedTeacherId])
  );

  const summaries = useMemo(() => students.map(summarizeStudent), [students]);

  const filteredSummaries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return summaries;

    return summaries.filter((summary) => {
      const weakWords = summary.weakWords.map((word) => `${word.prompt} ${word.answer}`).join(" ");
      return `${summary.student.name} ${summary.student.email ?? ""} ${weakWords}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [query, summaries]);

  const allRecords = useMemo(() => summaries.flatMap((summary) => summary.records), [summaries]);

  const globalWeakWords = useMemo(() => {
    const map = new Map<string, WeakWord>();

    summaries.forEach((summary) => {
      summary.records.forEach((record) => {
        const answers = record.score?.answers ?? [];
        answers.forEach((answer) => {
          if (answer.result !== "wrong" && answer.result !== "close") return;

          const prompt = getPrompt(answer);
          const correctAnswer = answer.correctAnswer || prompt;
          const key = `${prompt.toLowerCase()}::${correctAnswer.toLowerCase()}`;
          const current =
            map.get(key) ?? {
              key,
              prompt,
              answer: correctAnswer,
              close: 0,
              wrong: 0,
              total: 0,
              students: [],
            };

          if (answer.result === "wrong") current.wrong += 1;
          if (answer.result === "close") current.close += 1;
          current.total += 1;
          if (!current.students.includes(summary.student.name)) current.students.push(summary.student.name);
          map.set(key, current);
        });
      });
    });

    return Array.from(map.values()).sort((a, b) => b.wrong * 2 + b.close - (a.wrong * 2 + a.close));
  }, [summaries]);

  const scores = useMemo(
    () => allRecords.map(getStudentResultPercentage).filter((value): value is number => value !== null),
    [allRecords]
  );
  const avgMastery = useMemo(() => average(scores), [scores]);
  const testRecords = useMemo(() => allRecords.filter(isTestResult), [allRecords]);
  const testsPassed = useMemo(
    () =>
      testRecords.filter((record) => {
        const pct = getStudentResultPercentage(record);
        return pct !== null && pct >= 80;
      }).length,
    [testRecords]
  );
  const passRate = testRecords.length > 0 ? Math.round((testsPassed / testRecords.length) * 100) : null;
  const activeStudents = summaries.filter((summary) => summary.records.length > 0).length;
  const watchStudents = summaries.filter((summary) => summary.status === "watch" || summary.status === "inactive").length;
  const lessonsCompleted = summaries.reduce((sum, summary) => sum + summary.lessonsCompleted, 0);
  const testsCompleted = summaries.reduce((sum, summary) => sum + summary.testsCompleted, 0);
  const wordsAnswered = summaries.reduce((sum, summary) => sum + summary.wordsAnswered, 0);

  const recentActivity = useMemo(
    () =>
      summaries
        .flatMap((summary) =>
          summary.records.map((record, index) => ({
            id: `${summary.student.id}-${record.timestamp ?? index}-${index}`,
            summary,
            record,
            percentage: getStudentResultPercentage(record),
            timestamp: record.timestamp ?? null,
          }))
        )
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
        .slice(0, 30),
    [summaries]
  );

  const visibleRecentActivity = useMemo(
    () => (showAllRecentAttempts ? recentActivity : recentActivity.slice(0, 5)),
    [recentActivity, showAllRecentAttempts]
  );

  const hasMoreRecentActivity = recentActivity.length > 5;

  const activeWeakWords = useMemo(
    () => globalWeakWords.filter((word) => !dismissedWeakWords[word.key]),
    [dismissedWeakWords, globalWeakWords]
  );

  const hiddenWeakWords = useMemo(
    () => globalWeakWords.filter((word) => Boolean(dismissedWeakWords[word.key])),
    [dismissedWeakWords, globalWeakWords]
  );

  const kpis = [
    {
      label: "Average Mastery",
      value: avgMastery === null ? "--" : `${avgMastery}%`,
      detail: selectedTeacherName,
      bg: theme.isDark ? "rgba(46,122,191,0.10)" : "#EAF3FB",
      border: theme.isDark ? "rgba(125,211,252,0.30)" : "#B7D0E8",
      valueColor: theme.isDark ? "#7DD3FC" : "#2E7ABF",
    },
    {
      label: "Active Students",
      value: `${activeStudents}/${students.length}`,
      detail: "Students with results",
      bg: theme.isDark ? "rgba(52,211,153,0.10)" : "#EEF8F2",
      border: theme.isDark ? "rgba(52,211,153,0.30)" : "#A8DFC0",
      valueColor: theme.isDark ? "#6EE7B7" : "#2F855A",
    },
    {
      label: "Lessons Done",
      value: String(lessonsCompleted),
      detail: "Practice sessions",
      bg: theme.isDark ? "rgba(217,119,6,0.10)" : "#FFF5DA",
      border: theme.isDark ? "rgba(251,191,36,0.30)" : "#F3C679",
      valueColor: theme.isDark ? "#FBBF24" : "#B88400",
    },
    {
      label: "Tests Done",
      value: String(testsCompleted),
      detail: passRate === null ? "No test data" : `${passRate}% pass rate`,
      bg: theme.isDark ? "rgba(124,58,237,0.10)" : "#F5F0FF",
      border: theme.isDark ? "rgba(196,181,253,0.30)" : "#C4B0F8",
      valueColor: theme.isDark ? "#C4B5FD" : "#7C3AED",
    },
    {
      label: "Words Practiced",
      value: String(wordsAnswered),
      detail: `${globalWeakWords.length} reteach priorities`,
      bg: theme.isDark ? "rgba(239,68,68,0.10)" : "#FFF1F1",
      border: theme.isDark ? "rgba(248,113,113,0.30)" : "#F8B4B4",
      valueColor: theme.isDark ? "#FCA5A5" : "#DC2626",
    },
    {
      label: "Need Attention",
      value: String(watchStudents),
      detail: "Low score or inactive",
      bg: theme.isDark ? "rgba(217,119,6,0.10)" : "#FFF5DA",
      border: theme.isDark ? "rgba(251,191,36,0.30)" : "#F3C679",
      valueColor: theme.isDark ? "#FBBF24" : "#B88400",
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScreenHeader title="Students Results" eyebrow="Dashboard" showBack />

      <ScrollView
        contentContainerStyle={{ paddingTop: headerHeight + 12, paddingHorizontal: 14, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(selectedTeacherId, true)} />}
      >
        {loading ? (
          <View style={{ paddingTop: 36, alignItems: "center" }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={[theme.typography.caption, { marginTop: 10, color: theme.colors.textMuted }]}>Loading student results...</Text>
          </View>
        ) : error ? (
          <GlassCard style={{ borderRadius: 20, marginBottom: 14 }}>
            <Text style={[theme.typography.title, { fontSize: 20 }]}>Could not load results</Text>
            <Text style={[theme.typography.body, { marginTop: 8 }]}>{error}</Text>
            <TouchableOpacity
              onPress={() => loadData(selectedTeacherId)}
              style={{
                marginTop: 14,
                alignSelf: "flex-start",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
                paddingHorizontal: 12,
                paddingVertical: 9,
              }}
            >
              <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]}>Retry</Text>
            </TouchableOpacity>
          </GlassCard>
        ) : (
          <>
            <GlassCard style={{ borderRadius: 22, marginBottom: 14 }}>
              <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Students Results</Text>
              <Text style={[theme.typography.title, { marginTop: 8 }]}>Teach from the patterns, not just the scores.</Text>
              <Text style={[theme.typography.body, { marginTop: 8 }]}>
                See mastery, weak words, completion habits, and exact answer breakdowns for each student.
              </Text>
            </GlassCard>

            {isAdmin ? (
              <GlassCard style={{ borderRadius: 18, marginBottom: 14 }}>
                <Text style={[theme.typography.label, { color: theme.colors.primary }]}>View teacher</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ marginTop: 10, paddingRight: 10 }}>
                  {teachers.map((teacher) => {
                    const active = teacher.id === selectedTeacherId;
                    return (
                      <TouchableOpacity
                        key={teacher.id}
                        onPress={() => {
                          if (teacher.id === selectedTeacherId) return;
                          loadData(teacher.id).catch(() => {});
                        }}
                        style={{
                          marginRight: 8,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? theme.colors.primary : theme.colors.border,
                          backgroundColor: active ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "800", color: active ? theme.colors.primary : theme.colors.text }}>
                          {teacher.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </GlassCard>
            ) : null}

            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 14 }}>
              {kpis.map((kpi) => (
                <GlassCard
                  key={kpi.label}
                  style={{
                    width: "48.5%",
                    marginBottom: 10,
                    borderRadius: 16,
                    borderWidth: 1.2,
                    borderColor: kpi.border,
                    backgroundColor: kpi.bg,
                  }}
                  padding={14}
                >
                  <Text style={[theme.typography.label]}>{kpi.label}</Text>
                  <Text style={[theme.typography.title, { marginTop: 6, fontSize: 24, lineHeight: 29, color: kpi.valueColor }]}>{kpi.value}</Text>
                  <Text style={[theme.typography.caption, { marginTop: 5, color: theme.colors.textMuted }]} numberOfLines={2}>
                    {kpi.detail}
                  </Text>
                </GlassCard>
              ))}
            </View>

            <GlassCard style={{ borderRadius: 20, marginBottom: 14 }}>
              <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Student performance</Text>
              <Text style={[theme.typography.caption, { marginTop: 6, color: theme.colors.textMuted }]}>
                Track each student by score and completed lessons/tests. Tap any row to open the full student performance profile.
              </Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search students or weak words..."
                placeholderTextColor={theme.colors.textSoft}
                style={{
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 12,
                  backgroundColor: theme.colors.surfaceAlt,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: theme.colors.text,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              />

              <View style={{ marginTop: 10 }}>
                {filteredSummaries.length === 0 ? (
                  <View style={{ borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, padding: 14 }}>
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No student results match this view.</Text>
                  </View>
                ) : (
                  filteredSummaries.map((summary) => {
                    const tone = scoreTone(summary.average, theme.isDark);
                    return (
                      <TouchableOpacity
                        key={summary.student.id}
                        onPress={() => {
                          setShowModalReteach(false);
                          setShowModalHistory(false);
                          setSelectedSummary(summary);
                        }}
                        style={{
                          marginTop: 8,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surfaceAlt,
                          padding: 12,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={[theme.typography.bodyStrong, { fontSize: 14 }]} numberOfLines={1}>{summary.student.name}</Text>
                            <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted }]}>
                              {summary.lessonsCompleted} lessons | {summary.testsCompleted} tests
                            </Text>
                            <Text style={[theme.typography.caption, { marginTop: 2, color: theme.colors.primary }]}>
                              Click to view student's performance
                            </Text>
                          </View>
                          <View style={{ borderRadius: 999, borderWidth: 1, borderColor: tone.border, backgroundColor: tone.bg, paddingHorizontal: 10, paddingVertical: 5 }}>
                            <Text style={{ fontSize: 12, fontWeight: "900", color: tone.text }}>
                              {summary.average === null ? "--" : `${summary.average}%`}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </GlassCard>

            <GlassCard style={{ borderRadius: 20, marginBottom: 14 }}>
              <TouchableOpacity
                onPress={() => setShowReteachList((prev) => !prev)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Reteach list</Text>
                  <Text style={[theme.typography.caption, { marginTop: 6, color: theme.colors.textMuted }]}>
                    The words causing the most wrong or close answers.
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 6, flexShrink: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 12, fontWeight: "900", color: theme.colors.text, marginRight: 6 }}
                  >
                    {`${activeWeakWords.length} words`}
                  </Text>
                  <Ionicons name={showReteachList ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.textMuted} />
                </View>
              </TouchableOpacity>

              {showReteachList ? (
                <View style={{ marginTop: 10 }}>
                  {activeWeakWords.length === 0 ? (
                    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, padding: 14 }}>
                      <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No weak word patterns yet.</Text>
                    </View>
                  ) : (
                    activeWeakWords.slice(0, 8).map((word) => (
                      <View
                        key={word.key}
                        style={{
                          marginTop: 8,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surfaceAlt,
                          padding: 10,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]} numberOfLines={1}>{word.prompt}</Text>
                            <Text style={[theme.typography.caption, { marginTop: 2 }]}>
                              Reteach: {word.total} | {word.wrong} wrong | {word.close} close | {word.students.length} students
                            </Text>
                          </View>
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            <TouchableOpacity
                              onPress={() => setDismissedWeakWords((prev) => ({ ...prev, [word.key]: "taught" }))}
                              style={{
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: theme.isDark ? "rgba(52,211,153,0.45)" : "#A8DFC0",
                                backgroundColor: theme.isDark ? "rgba(52,211,153,0.18)" : "#EEF8F2",
                                paddingHorizontal: 9,
                                paddingVertical: 5,
                              }}
                            >
                              <Text style={{ fontSize: 10, fontWeight: "900", color: theme.isDark ? "#6EE7B7" : "#2F855A" }}>Taught</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => setDismissedWeakWords((prev) => ({ ...prev, [word.key]: "removed" }))}
                              style={{
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: theme.isDark ? "rgba(248,113,113,0.45)" : "#F8B4B4",
                                backgroundColor: theme.isDark ? "rgba(239,68,68,0.18)" : "#FFF1F1",
                                paddingHorizontal: 9,
                                paddingVertical: 5,
                              }}
                            >
                              <Text style={{ fontSize: 10, fontWeight: "900", color: theme.isDark ? "#FCA5A5" : "#DC2626" }}>Remove</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    ))
                  )}

                  {hiddenWeakWords.length > 0 ? (
                    <View style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, padding: 10 }}>
                      <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>Hidden: {hiddenWeakWords.length}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </GlassCard>

            <GlassCard style={{ borderRadius: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Recent attempts</Text>
                <View style={{ borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.text }}>{recentActivity.length}</Text>
                </View>
              </View>
              <Text style={[theme.typography.caption, { marginTop: 6, color: theme.colors.textMuted }]}>App and web completions sync into this history. Tap any attempt to view the full performance details.</Text>

              <View style={{ marginTop: 10 }}>
                {recentActivity.length === 0 ? (
                  <View style={{ borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, padding: 14 }}>
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No completed work yet.</Text>
                  </View>
                ) : (
                  visibleRecentActivity.map((activity) => {
                    const tone = scoreTone(activity.percentage, theme.isDark);
                    const isTest = isTestResult(activity.record);
                    const typePill = isTest
                      ? {
                          border: theme.isDark ? "rgba(196,181,253,0.45)" : "#C4B0F8",
                          bg: theme.isDark ? "rgba(124,58,237,0.18)" : "#F5F0FF",
                          text: theme.isDark ? "#C4B5FD" : "#7C3AED",
                          label: "Test",
                        }
                      : {
                          border: theme.isDark ? "rgba(125,211,252,0.45)" : "#B7D0E8",
                          bg: theme.isDark ? "rgba(46,122,191,0.18)" : "#EAF3FB",
                          text: theme.isDark ? "#7DD3FC" : "#2E7ABF",
                          label: "Lesson",
                        };
                    // Match Reteach rows: keep a consistent blue interior while border reflects performance.
                    const rowBg = theme.colors.surfaceAlt;
                    return (
                      <TouchableOpacity
                        key={activity.id}
                        onPress={() => setSelectedRecord({ record: activity.record, studentName: activity.summary.student.name })}
                        style={{
                          marginTop: 8,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: tone.border,
                          backgroundColor: rowBg,
                          padding: 12,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]} numberOfLines={1}>
                              {activity.summary.student.name} | {activity.record.lessonName || "Untitled result"}
                            </Text>
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                              <View style={{ borderRadius: 999, borderWidth: 1, borderColor: typePill.border, backgroundColor: typePill.bg, paddingHorizontal: 7, paddingVertical: 2, marginRight: 6 }}>
                                <Text style={{ fontSize: 10, fontWeight: "900", color: typePill.text }}>{typePill.label}</Text>
                              </View>
                              <Text style={[theme.typography.caption]}>{formatShortDate(activity.timestamp)}</Text>
                            </View>
                            <Text style={[theme.typography.caption, { marginTop: 2, color: theme.colors.primary }]}>
                              Click to view attempt performance
                            </Text>
                          </View>
                          <View style={{ borderRadius: 999, borderWidth: 1, borderColor: tone.border, backgroundColor: tone.bg, paddingHorizontal: 10, paddingVertical: 5 }}>
                            <Text style={{ fontSize: 12, fontWeight: "900", color: tone.text }}>
                              {activity.percentage === null ? "Open" : `${activity.percentage}%`}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}

                {hasMoreRecentActivity ? (
                  <TouchableOpacity
                    onPress={() => setShowAllRecentAttempts((prev) => !prev)}
                    style={{
                      marginTop: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceAlt,
                      paddingVertical: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                    }}
                  >
                    <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: "800", marginRight: 6 }]}> 
                      {showAllRecentAttempts ? "Show less" : `Expand ${recentActivity.length - 5} more`}
                    </Text>
                    <Ionicons
                      name={showAllRecentAttempts ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={theme.colors.primary}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>
            </GlassCard>
          </>
        )}
      </ScrollView>

      <Modal visible={!!selectedSummary} transparent animationType="fade" onRequestClose={() => setSelectedSummary(null)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 14 }}>
          <Pressable
            onPress={() => setSelectedSummary(null)}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.45)" }}
          />

          {selectedSummary ? (
            <GlassCard style={{ borderRadius: 24, maxHeight: "88%" }} padding={0}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: theme.isDark ? "rgba(46,122,191,0.10)" : "#EAF3FB" }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Student Results Profile</Text>
                  <Text style={[theme.typography.title, { marginTop: 4, fontSize: 20 }]} numberOfLines={1}>{selectedSummary.student.name}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedSummary(null)} style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="close" size={16} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 14 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                  {[
                    { label: "Mastery", value: selectedSummary.average === null ? "--" : `${selectedSummary.average}%`, bg: theme.isDark ? "rgba(46,122,191,0.10)" : "#EAF3FB", border: theme.isDark ? "rgba(125,211,252,0.30)" : "#B7D0E8", color: theme.isDark ? "#7DD3FC" : "#2E7ABF" },
                    { label: "Lessons", value: String(selectedSummary.lessonsCompleted), bg: theme.isDark ? "rgba(52,211,153,0.10)" : "#EEF8F2", border: theme.isDark ? "rgba(52,211,153,0.30)" : "#A8DFC0", color: theme.isDark ? "#6EE7B7" : "#2F855A" },
                    { label: "Tests", value: String(selectedSummary.testsCompleted), bg: theme.isDark ? "rgba(124,58,237,0.10)" : "#F5F0FF", border: theme.isDark ? "rgba(196,181,253,0.30)" : "#C4B0F8", color: theme.isDark ? "#C4B5FD" : "#7C3AED" },
                    { label: "Words", value: String(selectedSummary.wordsAnswered), bg: theme.isDark ? "rgba(217,119,6,0.10)" : "#FFF5DA", border: theme.isDark ? "rgba(251,191,36,0.30)" : "#F3C679", color: theme.isDark ? "#FBBF24" : "#B88400" },
                  ].map((item) => (
                    <View key={item.label} style={{ width: "48.5%", marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: item.border, backgroundColor: item.bg, padding: 10 }}>
                      <Text style={[theme.typography.label]}>{item.label}</Text>
                      <Text style={[theme.typography.bodyStrong, { marginTop: 6, fontSize: 17, color: item.color }]}>{item.value}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={() => setShowModalReteach((prev) => !prev)}
                  style={{ marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.isDark ? "rgba(217,119,6,0.10)" : "#FFF5DA", paddingHorizontal: 10, paddingVertical: 10 }}
                >
                  <Text style={[theme.typography.label, { color: theme.isDark ? "#FBBF24" : "#B88400" }]}>What to reteach</Text>
                  <Ionicons name={showModalReteach ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.textMuted} />
                </TouchableOpacity>
                {showModalReteach ? (
                  selectedSummary.weakWords.length === 0 ? (
                    <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, padding: 12 }}>
                      <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No repeated weak words yet.</Text>
                    </View>
                  ) : (
                    selectedSummary.weakWords.map((word) => (
                      <View key={word.key} style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.isDark ? "rgba(251,191,36,0.30)" : "#F3C679", backgroundColor: theme.isDark ? "rgba(217,119,6,0.10)" : "#FFF5DA", padding: 10 }}>
                        <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]} numberOfLines={1}>{word.prompt}</Text>
                        <Text style={[theme.typography.caption, { marginTop: 3 }]}>Answer: {word.answer}</Text>
                        <Text style={[theme.typography.caption, { marginTop: 2 }]}>Reteach: {word.total}</Text>
                      </View>
                    ))
                  )
                ) : null}

                <TouchableOpacity
                  onPress={() => setShowModalHistory((prev) => !prev)}
                  style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.isDark ? "rgba(46,122,191,0.10)" : "#EAF3FB", paddingHorizontal: 10, paddingVertical: 10 }}
                >
                  <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Completion history</Text>
                  <Ionicons name={showModalHistory ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.textMuted} />
                </TouchableOpacity>
                {showModalHistory ? (
                  selectedSummary.records.length === 0 ? (
                    <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, padding: 12 }}>
                      <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No completed lessons or tests yet.</Text>
                    </View>
                  ) : (
                    selectedSummary.records.map((record, index) => {
                      const pct = getStudentResultPercentage(record);
                      const tone = scoreTone(pct, theme.isDark);
                      const counts = getStudentResultCounts(record);
                      return (
                        <TouchableOpacity
                          key={`${record.timestamp ?? index}-${index}`}
                          onPress={() => setSelectedRecord({ record, studentName: selectedSummary.student.name })}
                          style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.isDark ? "rgba(46,122,191,0.10)" : "#EAF3FB", padding: 10 }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]} numberOfLines={1}>{record.lessonName || "Untitled result"}</Text>
                              <Text style={[theme.typography.caption, { marginTop: 3 }]}> 
                                {formatDate(record.timestamp ?? null)} | {counts.correct} correct | {counts.close} close | {counts.wrong} wrong
                              </Text>
                            </View>
                            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: tone.border, backgroundColor: tone.bg, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 11, fontWeight: "800", color: tone.text }}>
                                {pct === null ? "Open" : `${pct}%`}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )
                ) : null}
              </ScrollView>
            </GlassCard>
          ) : null}
        </View>
      </Modal>

      <Modal visible={!!selectedRecord} transparent animationType="fade" onRequestClose={() => setSelectedRecord(null)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 14 }}>
          <Pressable
            onPress={() => setSelectedRecord(null)}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.45)" }}
          />

          {selectedRecord ? (
            <GlassCard style={{ borderRadius: 24, maxHeight: "90%" }} padding={0}>
              {(() => {
                const record = selectedRecord.record;
                const answers = Array.isArray(record.score?.answers) ? record.score?.answers ?? [] : [];
                const reviewAnswers = answers.filter((answer) => answer.result !== "correct");
                const correctAnswers = answers.filter((answer) => answer.result === "correct");
                const counts = getStudentResultCounts(record);
                const pct = getStudentResultPercentage(record);
                const tone = scoreTone(pct, theme.isDark);
                const headerBg = theme.isDark ? "rgba(46,122,191,0.10)" : "#EAF3FB";
                const closeTone = {
                  color: theme.isDark ? "#FBBF24" : "#B88400",
                  bg: theme.isDark ? "rgba(217,119,6,0.10)" : "#FFF5DA",
                  border: theme.isDark ? "rgba(251,191,36,0.30)" : "#F3C679",
                };
                const reviewTone = {
                  bg: theme.isDark ? "rgba(248,113,113,0.12)" : "#FFF1F1",
                  border: theme.isDark ? "rgba(248,113,113,0.28)" : "#F8B4B4",
                };
                const correctTone = {
                  bg: theme.isDark ? "rgba(52,211,153,0.12)" : "#EEF8F2",
                  border: theme.isDark ? "rgba(52,211,153,0.28)" : "#A8DFC0",
                };

                return (
                  <>
                    <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: headerBg }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={[theme.typography.label, { color: theme.colors.primary }]}>{isTestResult(record) ? "Test Result" : "Lesson Result"}</Text>
                        <Text style={[theme.typography.title, { marginTop: 4, fontSize: 19 }]} numberOfLines={1}>{record.lessonName || "Untitled activity"}</Text>
                        <Text style={[theme.typography.caption, { marginTop: 4 }]} numberOfLines={2}>
                          {selectedRecord.studentName} | {formatDateTime(record.timestamp ?? null)}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setSelectedRecord(null)} style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="close" size={16} color={theme.colors.textMuted} />
                      </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={{ padding: 14 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <View style={{ borderRadius: 999, borderWidth: 1, borderColor: tone.border, backgroundColor: tone.bg, paddingHorizontal: 10, paddingVertical: 5 }}>
                          <Text style={{ fontSize: 12, fontWeight: "900", color: tone.text }}>{pct === null ? "Open" : `${pct}%`}</Text>
                        </View>
                        <Text style={[theme.typography.caption]}>80% is needed to pass tests.</Text>
                      </View>

                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
                        {[
                          {
                            label: "Correct",
                            value: counts.correct,
                            color: theme.colors.success,
                            bg: theme.colors.successSoft,
                            border: theme.isDark ? "rgba(52,211,153,0.45)" : "#A8DFC0",
                          },
                          { label: "Close", value: counts.close, color: closeTone.color, bg: closeTone.bg, border: closeTone.border },
                          {
                            label: "Wrong",
                            value: counts.wrong,
                            color: theme.colors.danger,
                            bg: theme.colors.dangerSoft,
                            border: theme.isDark ? "rgba(248,113,113,0.45)" : "#F8B4B4",
                          },
                        ].map((item) => (
                          <View key={item.label} style={{ width: "31%", borderRadius: 12, borderWidth: 1, borderColor: item.border, backgroundColor: item.bg, alignItems: "center", paddingVertical: 10 }}>
                            <Text style={{ fontSize: 10, fontWeight: "800", color: item.color }}>{item.label.toUpperCase()}</Text>
                            <Text style={{ fontSize: 20, fontWeight: "900", color: item.color, marginTop: 3 }}>{item.value}</Text>
                          </View>
                        ))}
                      </View>

                      <Text style={[theme.typography.label, { color: theme.colors.primary, marginTop: 12 }]}>Wrong / close answers</Text>
                      {reviewAnswers.length === 0 ? (
                        <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, padding: 12 }}>
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No wrong or close answers.</Text>
                        </View>
                      ) : (
                        reviewAnswers.map((answer, index) => (
                          <View key={`${answer.correctAnswer ?? "answer"}-${index}`} style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: reviewTone.border, backgroundColor: reviewTone.bg, padding: 10 }}>
                            <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]}>{getPrompt(answer)}</Text>
                            <Text style={[theme.typography.caption, { marginTop: 4 }]}>Your answer: {answer.userAnswer || "No response"}</Text>
                            <Text style={[theme.typography.caption, { marginTop: 2 }]}>Correct answer: {answer.correctAnswer || "-"}</Text>
                          </View>
                        ))
                      )}

                      <Text style={[theme.typography.label, { color: theme.colors.primary, marginTop: 12 }]}>Correct answers</Text>
                      {correctAnswers.length === 0 ? (
                        <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, padding: 12 }}>
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No correct-answer rows were saved.</Text>
                        </View>
                      ) : (
                        correctAnswers.map((answer, index) => (
                          <View key={`${answer.correctAnswer ?? "correct"}-${index}`} style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: correctTone.border, backgroundColor: correctTone.bg, padding: 10 }}>
                            <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]}>{getPrompt(answer)}</Text>
                            <Text style={[theme.typography.caption, { marginTop: 4 }]}>Your answer: {answer.userAnswer || "No response"}</Text>
                          </View>
                        ))
                      )}
                    </ScrollView>
                  </>
                );
              })()}
            </GlassCard>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
