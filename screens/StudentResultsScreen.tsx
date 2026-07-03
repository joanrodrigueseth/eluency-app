import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { NavigationProp, useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import GlassCard from "../components/GlassCard";
import ScreenHeader, { useScreenHeaderHeight } from "../components/ScreenHeader";
import { Pressable, TouchableOpacity } from "../lib/hapticPressables";
import { supabase } from "../lib/supabase";
import { getApiBaseUrl } from "../lib/api/config";
import { useAppTheme } from "../lib/theme";
import type { RootStackParamList } from "../types/navigation";

const STUDENT_RESULTS_WEB_URL = "https://www.eluency.com/dashboard/student-results";

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

type StudentSummary = {
  student: StudentResultStudent;
  records: StudentResultRecord[];
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
  const wrongCount =
    totalCount !== null
      ? Math.max(totalCount - correctCount - closeCount, 0)
      : answers.filter((answer) => answer.result === "wrong").length;

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
    const record = buildRecordFromActivity(activity);
    const existing = studentMap.get(id);

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

function summarizeStudent(student: StudentResultStudent): StudentSummary {
  return {
    student,
    records: [...student.records].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)),
  };
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

function isTestResult(record: StudentResultRecord) {
  return record.type === "test";
}

function getPrompt(answer: StudentResultAnswer) {
  const word = answer.word;
  if (!word || typeof word !== "object") return "Prompt unavailable";
  return word.pt || word.en || word.sp || word.se || "Prompt unavailable";
}

function formatDate(timestamp: number | null) {
  if (!timestamp) return "Unknown";
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
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

function scoreTone(score: number | null, isDark: boolean) {
  if (score === null) {
    return isDark
      ? { bg: "rgba(46,122,191,0.10)", border: "rgba(125,211,252,0.30)", text: "#7DD3FC" }
      : { bg: "#EAF3FB", border: "#B7D0E8", text: "#2E7ABF" };
  }
  if (score >= 80) {
    return isDark
      ? { bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.30)", text: "#6EE7B7" }
      : { bg: "#EEF8F2", border: "#A8DFC0", text: "#2F855A" };
  }
  if (score >= 60) {
    return isDark
      ? { bg: "rgba(217,119,6,0.10)", border: "rgba(251,191,36,0.30)", text: "#FBBF24" }
      : { bg: "#FFF5DA", border: "#F3C679", text: "#B88400" };
  }
  return isDark
    ? { bg: "rgba(239,68,68,0.10)", border: "rgba(248,113,113,0.30)", text: "#FCA5A5" }
    : { bg: "#FFF1F1", border: "#F8B4B4", text: "#DC2626" };
}

export default function StudentResultsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const theme = useAppTheme();
  const headerHeight = useScreenHeaderHeight();
  const apiBaseUrl = getApiBaseUrl();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [teachers, setTeachers] = useState<StudentResultTeacherOption[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | undefined>(undefined);
  const [selectedTeacherName, setSelectedTeacherName] = useState("Your students");
  const [students, setStudents] = useState<StudentResultStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<{ record: StudentResultRecord; studentName: string } | null>(null);

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
          const legacyResponse = await fetch(`${base}/api/mobile/dashboard-summary`, {
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
        setError(err instanceof Error ? err.message : "Unable to load student results.");
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
  const selectedSummary = useMemo(() => {
    if (summaries.length === 0) return null;
    return summaries.find((summary) => summary.student.id === selectedStudentId) ?? summaries[0];
  }, [selectedStudentId, summaries]);

  useEffect(() => {
    if (summaries.length === 0) {
      setSelectedStudentId(null);
      return;
    }
    if (!selectedStudentId || !summaries.some((summary) => summary.student.id === selectedStudentId)) {
      setSelectedStudentId(summaries[0].student.id);
    }
  }, [selectedStudentId, summaries]);

  const openWebsiteResults = useCallback(() => {
    Linking.openURL(STUDENT_RESULTS_WEB_URL).catch(() => {});
  }, []);

  const renderRecord = (record: StudentResultRecord, index: number) => {
    const pct = getStudentResultPercentage(record);
    const counts = getStudentResultCounts(record);
    const tone = scoreTone(pct, theme.isDark);
    const typeLabel = isTestResult(record) ? "Test" : "Lesson";
    const typeTone = isTestResult(record)
      ? {
          bg: theme.isDark ? "rgba(124,92,250,0.16)" : "#F1EDFF",
          border: theme.isDark ? "rgba(167,139,250,0.34)" : "#CFC2FF",
          text: theme.isDark ? "#C4B5FD" : "#6D4FE0",
        }
      : {
          bg: theme.isDark ? "rgba(46,122,191,0.14)" : "#EAF3FB",
          border: theme.isDark ? "rgba(125,211,252,0.28)" : "#B7D0E8",
          text: theme.colors.primary,
        };

    return (
      <TouchableOpacity
        key={`${record.timestamp ?? index}-${index}`}
        onPress={() => {
          if (selectedSummary) setSelectedRecord({ record, studentName: selectedSummary.student.name });
        }}
        activeOpacity={0.86}
        style={{
          marginTop: 10,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceAlt,
          padding: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 5 }}>
              <View
                style={{
                  borderRadius: 999,
                  backgroundColor: typeTone.bg,
                  borderWidth: 1,
                  borderColor: typeTone.border,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ color: typeTone.text, fontSize: 10, fontWeight: "900" }}>{typeLabel}</Text>
              </View>
              <Text style={[theme.typography.caption]}>{formatDate(record.timestamp ?? null)}</Text>
            </View>
            <Text style={[theme.typography.bodyStrong, { fontSize: 15 }]} numberOfLines={1}>
              {record.lessonName || "Untitled result"}
            </Text>
            <Text style={[theme.typography.caption, { marginTop: 4 }]}>
              {counts.correct} correct | {counts.close} close | {counts.wrong} wrong
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: tone.border,
              backgroundColor: tone.bg,
              paddingHorizontal: 11,
              paddingVertical: 6,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "900", color: tone.text }}>
              {pct === null ? "Open" : `${pct}%`}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScreenHeader title="Student Results" eyebrow="Results" showBack />

      <ScrollView
        contentContainerStyle={{ paddingTop: headerHeight + 12, paddingHorizontal: 14, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(selectedTeacherId, true)} />}
      >
        {loading ? (
          <View style={{ paddingTop: 36, alignItems: "center" }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={[theme.typography.caption, { marginTop: 10, color: theme.colors.textMuted }]}>
              Loading student results...
            </Text>
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
              <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Student Results</Text>
              <Text style={[theme.typography.title, { marginTop: 8 }]}>Results by student</Text>
              <Text style={[theme.typography.body, { marginTop: 8 }]}>
                Choose a student to see their completed lessons and tests from the app and website.
              </Text>
            </GlassCard>

            {isAdmin && teachers.length > 0 ? (
              <GlassCard style={{ borderRadius: 18, marginBottom: 14 }}>
                <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Teacher</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ marginTop: 10, paddingRight: 10 }}>
                  {teachers.map((teacher) => {
                    const active = teacher.id === selectedTeacherId;
                    return (
                      <TouchableOpacity
                        key={teacher.id}
                        onPress={() => {
                          if (teacher.id === selectedTeacherId) return;
                          setSelectedStudentId(null);
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

            <GlassCard
              style={{
                borderRadius: 18,
                marginBottom: 14,
                borderWidth: 1,
                borderColor: theme.isDark ? "rgba(125,211,252,0.26)" : "#B7D0E8",
                backgroundColor: theme.isDark ? "rgba(46,122,191,0.10)" : "#EAF3FB",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    backgroundColor: theme.colors.primarySoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="analytics-outline" size={22} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[theme.typography.bodyStrong, { fontSize: 14 }]}>Need KPIs and deeper stats?</Text>
                  <Text style={[theme.typography.caption, { marginTop: 3 }]}>
                    Visit the website for full student analytics.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={openWebsiteResults}
                  style={{
                    borderRadius: 999,
                    backgroundColor: theme.colors.primary,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "900" }}>Open</Text>
                  <Ionicons name="open-outline" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            </GlassCard>

            <GlassCard style={{ borderRadius: 18, marginBottom: 14 }}>
              <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Select a Student</Text>
              <TouchableOpacity
                onPress={() => setStudentPickerOpen(true)}
                activeOpacity={0.86}
                style={{
                  marginTop: 10,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[theme.typography.bodyStrong, { fontSize: 15 }]} numberOfLines={1}>
                    {selectedSummary?.student.name ?? "Select a student"}
                  </Text>
                  <Text style={[theme.typography.caption, { marginTop: 3 }]} numberOfLines={1}>
                    {selectedSummary?.student.email || selectedTeacherName}
                  </Text>
                </View>
                <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </GlassCard>

            <GlassCard style={{ borderRadius: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Results</Text>
                  <Text style={[theme.typography.caption, { marginTop: 5 }]}>
                    {selectedSummary ? `${selectedSummary.records.length} completed attempts` : "No student selected"}
                  </Text>
                </View>
              </View>

              {selectedSummary?.records.length ? (
                <View style={{ marginTop: 2 }}>
                  {selectedSummary.records.map(renderRecord)}
                </View>
              ) : (
                <View
                  style={{
                    marginTop: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceAlt,
                    padding: 14,
                  }}
                >
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                    No results yet for this student.
                  </Text>
                </View>
              )}
            </GlassCard>
          </>
        )}
      </ScrollView>

      <Modal visible={studentPickerOpen} transparent animationType="fade" onRequestClose={() => setStudentPickerOpen(false)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 14 }}>
          <Pressable
            onPress={() => setStudentPickerOpen(false)}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.45)" }}
          />
          <GlassCard style={{ borderRadius: 22, maxHeight: "78%" }} padding={0}>
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Select student</Text>
              <Text style={[theme.typography.title, { marginTop: 4, fontSize: 20 }]}>Student results</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: 10 }}>
              {summaries.length === 0 ? (
                <View style={{ padding: 14 }}>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No students available.</Text>
                </View>
              ) : (
                summaries.map((summary) => {
                  const active = summary.student.id === selectedSummary?.student.id;
                  return (
                    <TouchableOpacity
                      key={summary.student.id}
                      onPress={() => {
                        setSelectedStudentId(summary.student.id);
                        setStudentPickerOpen(false);
                      }}
                      style={{
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        backgroundColor: active ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        marginBottom: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[theme.typography.bodyStrong, { fontSize: 14 }]} numberOfLines={1}>
                          {summary.student.name}
                        </Text>
                        <Text style={[theme.typography.caption, { marginTop: 3 }]} numberOfLines={1}>
                          {summary.records.length} results
                        </Text>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} /> : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </GlassCard>
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
                const counts = getStudentResultCounts(record);
                const pct = getStudentResultPercentage(record);
                const tone = scoreTone(pct, theme.isDark);

                return (
                  <>
                    <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={[theme.typography.label, { color: theme.colors.primary }]}>
                          {isTestResult(record) ? "Test Result" : "Lesson Result"}
                        </Text>
                        <Text style={[theme.typography.title, { marginTop: 4, fontSize: 19 }]} numberOfLines={1}>
                          {record.lessonName || "Untitled result"}
                        </Text>
                        <Text style={[theme.typography.caption, { marginTop: 4 }]} numberOfLines={2}>
                          {selectedRecord.studentName} | {formatDateTime(record.timestamp ?? null)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setSelectedRecord(null)}
                        style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" }}
                      >
                        <Ionicons name="close" size={16} color={theme.colors.textMuted} />
                      </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={{ padding: 14 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <View style={{ borderRadius: 999, borderWidth: 1, borderColor: tone.border, backgroundColor: tone.bg, paddingHorizontal: 10, paddingVertical: 5 }}>
                          <Text style={{ fontSize: 12, fontWeight: "900", color: tone.text }}>
                            {pct === null ? "Open" : `${pct}%`}
                          </Text>
                        </View>
                        <Text style={[theme.typography.caption]}>
                          {counts.correct} correct | {counts.close} close | {counts.wrong} wrong
                        </Text>
                      </View>

                      <Text style={[theme.typography.label, { color: theme.colors.primary, marginTop: 14 }]}>Answers</Text>
                      {answers.length === 0 ? (
                        <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, padding: 12 }}>
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                            No answer rows were saved for this result.
                          </Text>
                        </View>
                      ) : (
                        answers.map((answer, index) => {
                          const isCorrect = answer.result === "correct";
                          return (
                            <View
                              key={`${answer.correctAnswer ?? "answer"}-${index}`}
                              style={{
                                marginTop: 8,
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: isCorrect
                                  ? theme.isDark ? "rgba(52,211,153,0.28)" : "#A8DFC0"
                                  : theme.isDark ? "rgba(248,113,113,0.28)" : "#F8B4B4",
                                backgroundColor: isCorrect
                                  ? theme.isDark ? "rgba(52,211,153,0.10)" : "#EEF8F2"
                                  : theme.isDark ? "rgba(248,113,113,0.12)" : "#FFF1F1",
                                padding: 10,
                              }}
                            >
                              <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]}>{getPrompt(answer)}</Text>
                              <Text style={[theme.typography.caption, { marginTop: 4 }]}>
                                Student answer: {answer.userAnswer || "No response"}
                              </Text>
                              <Text style={[theme.typography.caption, { marginTop: 2 }]}>
                                Correct answer: {answer.correctAnswer || "-"}
                              </Text>
                            </View>
                          );
                        })
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
