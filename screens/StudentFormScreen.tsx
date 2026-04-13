import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { NavigationProp, RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppButton from "../components/AppButton";
import FloatingToast from "../components/FloatingToast";
import GlassCard from "../components/GlassCard";
import ScreenReveal from "../components/ScreenReveal";
import { getLanguageBadge, getLanguageBadgeColors } from "../lib/languageBadges";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";
import type { RootStudentsStackParams } from "./StudentsScreen";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";

const GREEN = "#3EA370";
const GREEN_SOFT = "#EBF8F0";
const GREEN_BORDER = "#A8DFC0";

function generateRandomCode(): string {
  return Array.from({ length: 6 }, () =>
    CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length))
  ).join("");
}

type LessonOpt = { id: string; title: string; language?: string | null; content_json?: { words?: unknown[] } | null };
type TestOpt = { id: string; name: string; config_json?: { words?: unknown[]; tests?: unknown[] } | null };
type TeacherOpt = { id: string; name: string };

export default function StudentFormScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStudentsStackParams>>();
  const route = useRoute<RouteProp<RootStudentsStackParams, "StudentForm">>();
  const studentId = route.params?.studentId;
  const isEdit = !!studentId;

  const [bootLoading, setBootLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [selectedLessons, setSelectedLessons] = useState<string[]>([]);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);

  const [teachers, setTeachers] = useState<TeacherOpt[]>([]);
  const [allLessons, setAllLessons] = useState<LessonOpt[]>([]);
  const [allTests, setAllTests] = useState<TestOpt[]>([]);
  const [contentLoading, setContentLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"lessons" | "tests">("lessons");
  const [lessonSearch, setLessonSearch] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [lessonPickerOpen, setLessonPickerOpen] = useState(false);
  const [testPickerOpen, setTestPickerOpen] = useState(false);
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastTone, setToastTone] = useState<"success" | "info" | "danger">("success");
  const saveScale = useRef(new Animated.Value(1)).current;
  const copyScale = useRef(new Animated.Value(1)).current;
  const copyGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(""), 2200);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  const ROW_HEIGHT = 57; // paddingVertical 12*2 + text ~20 + badges ~13
  const listHeight = keyboardVisible ? ROW_HEIGHT * 6 : ROW_HEIGHT * 10;
  const pickerVerticalPadding = keyboardVisible ? "15%" : "15%";

  const filteredLessons = useMemo(
    () => allLessons.filter((l) => l.title.toLowerCase().includes(lessonSearch.toLowerCase())),
    [allLessons, lessonSearch]
  );
  const filteredTests = useMemo(
    () => allTests.filter((t) => (t.name ?? "").toLowerCase().includes(testSearch.toLowerCase())),
    [allTests, testSearch]
  );
  const filteredTeachers = useMemo(

    () => teachers.filter((t) => t.name.toLowerCase().includes(teacherSearch.toLowerCase())),
    [teachers, teacherSearch]
  );

  const loadListsForTeacher = useCallback(
    async (tid: string) => {
      if (!tid) {
        setAllLessons([]);
        setAllTests([]);
        return;
      }
      setContentLoading(true);
      try {
        const [l, t] = await Promise.all([
          supabase.from("lessons").select("id, title, language, content_json").eq("status", "published").eq("created_by", tid).order("created_at", { ascending: false }),
          supabase.from("tests").select("id, name, config_json").eq("status", "published").eq("teacher_id", tid).order("created_at", { ascending: false }),
        ]);
        setAllLessons((l.data as LessonOpt[]) || []);
        setAllTests((t.data as TestOpt[]) || []);
      } finally {
        setContentLoading(false);
      }
    },
    []
  );

  const showToast = useCallback((message: string, tone: "success" | "info" | "danger" = "success") => {
    setToastTone(tone);
    setToastMessage(message);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBootLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          Alert.alert("Sign in required");
          navigation.goBack();
          return;
        }
        if (cancelled) return;
        setCurrentUserId(user.id);

        const { data: teacherRecord } = await supabase
          .from("teachers")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        const admin = (teacherRecord as { role?: string } | null)?.role === "admin";
        if (cancelled) return;
        setIsAdmin(admin);

        if (isEdit && studentId) {
          const { data: student, error: se } = await (supabase.from("students") as any).select("*").eq("id", studentId).single();
          if (se || !student) {
            Alert.alert("Error", "Could not load student.");
            navigation.goBack();
            return;
          }
          if (!admin && student.teacher_id !== user.id) {
            Alert.alert("Access denied", "You cannot edit this student.");
            navigation.goBack();
            return;
          }
          setName(student.name ?? "");
          setEmail(student.email ?? "");
          setCode(student.code ?? "");
          setTeacherId(student.teacher_id ?? "");
          setSelectedLessons(Array.isArray(student.assigned_lessons) ? student.assigned_lessons : []);
          setSelectedTests(Array.isArray(student.assigned_tests) ? student.assigned_tests : []);

          const tidForContent = admin ? student.teacher_id || user.id : user.id;
          const [tr, lr, ter] = await Promise.all([
            admin
              ? (supabase.from("teachers") as any).select("user_id, name").order("name")
              : Promise.resolve({ data: [] }),
            tidForContent
              ? supabase.from("lessons").select("id, title, language, content_json").eq("status", "published").eq("created_by", tidForContent).order("created_at", { ascending: false })
              : Promise.resolve({ data: [] }),
            tidForContent
              ? supabase.from("tests").select("id, name, config_json").eq("status", "published").eq("teacher_id", tidForContent).order("created_at", { ascending: false })
              : Promise.resolve({ data: [] }),
          ]);
          if (admin && tr.data) {
            setTeachers(
              (tr.data as { user_id: string; name: string }[]).map((x) => ({ id: x.user_id, name: x.name }))
            );
          }

          const teacherLessons = (lr.data as LessonOpt[]) || [];
          const teacherTests = (ter.data as TestOpt[]) || [];

          // Fetch any assigned lessons whose IDs are not in the teacher's own list
          const assignedLessonIds: string[] = Array.isArray(student.assigned_lessons) ? student.assigned_lessons : [];
          const teacherLessonIds = new Set(teacherLessons.map((l) => l.id));
          const missingLessonIds = assignedLessonIds.filter((id) => !teacherLessonIds.has(id));
          const assignedTestIds: string[] = Array.isArray(student.assigned_tests) ? student.assigned_tests : [];
          const teacherTestIds = new Set(teacherTests.map((t) => t.id));
          const missingTestIds = assignedTestIds.filter((id) => !teacherTestIds.has(id));

          const [extraLessonsRes, extraTestsRes] = await Promise.all([
            missingLessonIds.length > 0
              ? supabase.from("lessons").select("id, title, language, content_json").in("id", missingLessonIds)
              : Promise.resolve({ data: [] }),
            missingTestIds.length > 0
              ? supabase.from("tests").select("id, name, config_json").in("id", missingTestIds)
              : Promise.resolve({ data: [] }),
          ]);

          setAllLessons([...teacherLessons, ...((extraLessonsRes.data as LessonOpt[]) || [])]);
          setAllTests([...teacherTests, ...((extraTestsRes.data as TestOpt[]) || [])]);
        } else {
          if (admin) {
            const { data: tr } = await (supabase.from("teachers") as any).select("user_id, name").order("name");
            if (!cancelled && tr) {
              setTeachers((tr as { user_id: string; name: string }[]).map((x) => ({ id: x.user_id, name: x.name })));
            }
          }
          let generated = generateRandomCode();
          for (let i = 0; i < 10; i++) {
            const { count } = await supabase.from("students").select("*", { count: "exact", head: true }).eq("code", generated);
            if (!count) break;
            generated = generateRandomCode();
          }
          if (!cancelled) setCode(generated);
          setTeacherId(user.id);
          await loadListsForTeacher(user.id);
        }
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : "Failed to load");
        navigation.goBack();
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, studentId, navigation, loadListsForTeacher]);

  const toggleLesson = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedLessons((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleTest = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedTests((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(code);
      Animated.sequence([
        Animated.parallel([
          Animated.spring(copyScale, { toValue: 1.04, useNativeDriver: true, speed: 24, bounciness: 8 }),
          Animated.timing(copyGlow, { toValue: 1, duration: 180, useNativeDriver: false }),
        ]),
        Animated.parallel([
          Animated.spring(copyScale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 6 }),
          Animated.timing(copyGlow, { toValue: 0, duration: 260, useNativeDriver: false }),
        ]),
      ]).start();
      showToast("Access code copied", "success");
    } catch {
      Alert.alert("Error", "Could not copy.");
    }
  };

  const regenCode = async () => {
    if (isEdit) return;
    let generated = generateRandomCode();
    for (let i = 0; i < 10; i++) {
      const { count } = await supabase.from("students").select("*", { count: "exact", head: true }).eq("code", generated);
      if (!count) break;
      generated = generateRandomCode();
    }
    setCode(generated);
    showToast("New access code generated", "info");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Validation", "Name is required.");
      return;
    }
    if (!currentUserId) return;
    const finalTeacherId = isAdmin ? teacherId || null : currentUserId;
    if (isAdmin && !isEdit && !finalTeacherId) {
      Alert.alert("Validation", "Select a teacher.");
      return;
    }

    setSaving(true);
    Animated.sequence([
      Animated.spring(saveScale, { toValue: 0.97, useNativeDriver: true, speed: 28, bounciness: 4 }),
      Animated.spring(saveScale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 6 }),
    ]).start();
    try {
      if (isEdit && studentId) {
        const payload: Record<string, unknown> = {
          name: name.trim(),
          email: email.trim() || null,
          assigned_lessons: selectedLessons,
          assigned_tests: selectedTests,
        };
        if (isAdmin) payload.teacher_id = finalTeacherId;
        const { error } = await (supabase.from("students") as any).update(payload).eq("id", studentId);
        if (error) throw error;
        showToast("Student updated", "success");
      } else {
        const { error } = await (supabase.from("students") as any).insert({
          name: name.trim(),
          email: email.trim() || null,
          code: code.trim().toUpperCase(),
          teacher_id: finalTeacherId,
          assigned_lessons: selectedLessons,
          assigned_tests: selectedTests,
          progress: {},
        });
        if (error) throw error;
        showToast("Student added", "success");
      }
      navigation.goBack();
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof (e as any)?.message === "string"
            ? (e as any).message
            : typeof (e as any)?.details === "string"
              ? (e as any).details
              : JSON.stringify(e) ?? "Save failed";
      Alert.alert("Save Failed", msg);
    } finally {
      setSaving(false);
    }
  };

  const openWeb = async () => {
    const path = studentId ? `/dashboard/students/${studentId}/edit` : "/dashboard/students/new";
    const url = `${apiBaseUrl.replace(/\/$/, "")}${path}`;
    Linking.openURL(url).catch(() => Alert.alert("Web", url));
  };

  const inputStyle = {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#0F1115",
    backgroundColor: theme.colors.surfaceAlt,
  };

  const darkCaption = [theme.typography.caption, { color: "#0F1115" as const }];

  if (bootLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={GREEN} />
      </View>
    );
  }

  const selectedTeacherLabel = teachers.find((t) => t.id === teacherId)?.name ?? "Select teacher…";

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: Math.max(insets.top, 8),
          paddingBottom: 10,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: theme.isDark ? theme.colors.background : "#FFFFFF",
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
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
        <Text style={[theme.typography.title, { flex: 1, textAlign: "center", fontSize: 17 }]}>
          {isEdit ? "Edit student" : "New student"}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            onPress={openWeb}
            style={{
              paddingHorizontal: 11,
              paddingVertical: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: GREEN,
              backgroundColor: GREEN_SOFT,
            }}
          >
            <Text style={{ color: GREEN, fontSize: 12, fontWeight: "800" }}>Web</Text>
          </TouchableOpacity>
          <Animated.View style={{ transform: [{ scale: saveScale }] }}>
            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                handleSave();
              }}
              disabled={saving}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 11,
                borderRadius: 10,
                backgroundColor: GREEN,
                opacity: saving ? 0.7 : 1,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800" }}>
                {saving ? "Saving..." : "Save"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        removeClippedSubviews={false}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => Keyboard.dismiss()}>
          <View>
        <ScreenReveal delay={20}>
        <GlassCard style={{ borderRadius: 16, marginBottom: 16 }} padding={16} variant="hero">
          <Text style={[darkCaption, { textTransform: "uppercase", marginBottom: 8 }]}>Profile</Text>

          <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[darkCaption, { marginBottom: 4 }]}>Full name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Jane Smith"
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                style={inputStyle}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[darkCaption, { marginBottom: 4 }]}>Access code</Text>
              <Animated.View
                style={{
                  transform: [{ scale: copyScale }],
                  shadowColor: GREEN,
                  shadowOpacity: copyGlow,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                }}
              >
                <TouchableOpacity
                  onPress={copyCode}
                  activeOpacity={0.85}
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: GREEN,
                    backgroundColor: GREEN_SOFT,
                    paddingHorizontal: 10,
                    paddingVertical: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontFamily: "monospace", fontSize: 20, fontWeight: "900", color: GREEN }}>
                    {code}
                  </Text>
                  <Ionicons name="copy-outline" size={16} color={GREEN} />
                </TouchableOpacity>
              </Animated.View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                {!isEdit ? (
                  <TouchableOpacity
                    onPress={regenCode}
                    style={{ width: "100%", paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", backgroundColor: theme.colors.surfaceAlt }}
                  >
                    <Ionicons name="refresh-outline" size={16} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          <Text style={[darkCaption, { marginBottom: 4 }]}>Email (optional)</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="email@example.com"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
            style={inputStyle}
          />
        </GlassCard>
        </ScreenReveal>

        {isAdmin ? (
          <ScreenReveal delay={70}>
          <GlassCard style={{ borderRadius: 16, marginBottom: 16 }} padding={16} variant="strong">
            <Text style={[darkCaption, { textTransform: "uppercase", marginBottom: 8 }]}>Teacher</Text>
            <TouchableOpacity
              onPress={() => {
                setTeacherSearch("");
                setTeacherModalOpen(true);
              }}
              style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}
            >
              <Text style={{ color: teacherId ? theme.colors.text : theme.colors.textMuted }}>{selectedTeacherLabel}</Text>
              <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </GlassCard>
          </ScreenReveal>
        ) : null}

        {/* ── Lessons & Tests tabbed card ── */}
        <ScreenReveal delay={110}>
        <GlassCard style={{ borderRadius: 16, marginBottom: 24 }} padding={16} variant="strong">
          {/* Tab bar */}
          <View style={{ flexDirection: "row", marginBottom: 14, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt, padding: 3 }}>
            {(["lessons", "tests"] as const).map((tab) => {
              const active = activeTab === tab;
              const count = tab === "lessons" ? selectedLessons.length : selectedTests.length;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 9,
                    borderRadius: 10,
                    backgroundColor: active ? "#FFFFFF" : "transparent",
                    shadowColor: active ? "#000" : "transparent",
                    shadowOpacity: active ? 0.06 : 0,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: active ? 2 : 0,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#0F1115" : theme.colors.textMuted }}>
                    {tab === "lessons" ? "Lessons" : "Tests"}
                  </Text>
                  {count > 0 ? (
                    <View style={{ borderRadius: 999, backgroundColor: GREEN, paddingHorizontal: 6, paddingVertical: 2, minWidth: 18, alignItems: "center" }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#fff" }}>{count}</Text>
                    </View>
                  ) : null}
                  {tab === "lessons" && contentLoading ? <ActivityIndicator size="small" color={GREEN} style={{ marginLeft: 2 }} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Lessons tab */}
          {activeTab === "lessons" ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Text style={[darkCaption, { textTransform: "uppercase" }]}>
                  {selectedLessons.length > 0 ? `${selectedLessons.length} assigned` : "None assigned"}
                </Text>
                <TouchableOpacity
                  onPress={() => { setLessonSearch(""); setLessonPickerOpen(true); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: GREEN }}
                >
                  <Ionicons name="add" size={15} color="#fff" />
                  <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}>Assign lessons</Text>
                </TouchableOpacity>
              </View>

              {selectedLessons.length === 0 ? (
                <TouchableOpacity
                  onPress={() => { setLessonSearch(""); setLessonPickerOpen(true); }}
                  activeOpacity={0.7}
                  style={{ paddingVertical: 24, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, borderStyle: "dashed", backgroundColor: theme.colors.surfaceAlt }}
                >
                  <Ionicons name="book-outline" size={28} color={theme.colors.textMuted} />
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 8 }]}>No lessons assigned yet</Text>
                  <Text style={[theme.typography.caption, { color: GREEN, fontWeight: "700", marginTop: 4 }]}>Tap to assign lessons</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 8 }}>
                  {selectedLessons.map((id) => {
                    const lesson = allLessons.find((l) => l.id === id);
                    if (!lesson) return null;
                    const vocabCount = Array.isArray(lesson.content_json?.words) ? lesson.content_json?.words.length : 0;
                    const languageBadge = getLanguageBadge(lesson.language);
                    const languageBadgeColors = getLanguageBadgeColors(languageBadge);
                    return (
                      <View key={id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: GREEN, backgroundColor: GREEN_SOFT }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={[theme.typography.body, { fontWeight: "600" }]} numberOfLines={1}>{lesson.title}</Text>
                          <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                            {languageBadge ? (
                              <View style={{ borderRadius: 999, borderWidth: 1, borderColor: languageBadgeColors.borderColor, backgroundColor: languageBadgeColors.backgroundColor, paddingHorizontal: 7, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, fontWeight: "900", color: languageBadgeColors.textColor }}>{languageBadge}</Text>
                              </View>
                            ) : null}
                            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: "#B7D0E8", backgroundColor: "#EAF3FB", paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontWeight: "900", color: "#2E7ABF" }}>{vocabCount}V</Text>
                            </View>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => toggleLesson(id)} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="close" size={15} color={GREEN} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          ) : (
            /* Tests tab */
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Text style={[darkCaption, { textTransform: "uppercase" }]}>
                  {selectedTests.length > 0 ? `${selectedTests.length} assigned` : "None assigned"}
                </Text>
                <TouchableOpacity
                  onPress={() => { setTestSearch(""); setTestPickerOpen(true); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: GREEN }}
                >
                  <Ionicons name="add" size={15} color="#fff" />
                  <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}>Assign tests</Text>
                </TouchableOpacity>
              </View>

              {selectedTests.length === 0 ? (
                <TouchableOpacity
                  onPress={() => { setTestSearch(""); setTestPickerOpen(true); }}
                  activeOpacity={0.7}
                  style={{ paddingVertical: 24, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, borderStyle: "dashed", backgroundColor: theme.colors.surfaceAlt }}
                >
                  <Ionicons name="clipboard-outline" size={28} color={theme.colors.textMuted} />
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 8 }]}>No tests assigned yet</Text>
                  <Text style={[theme.typography.caption, { color: GREEN, fontWeight: "700", marginTop: 4 }]}>Tap to assign tests</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 8 }}>
                  {selectedTests.map((id) => {
                    const test = allTests.find((t) => t.id === id);
                    if (!test) return null;
                    const vocabCount = Array.isArray(test.config_json?.words) ? test.config_json?.words.length : 0;
                    const questionCount = Array.isArray(test.config_json?.tests) ? test.config_json?.tests.length : 0;
                    return (
                      <View key={id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: GREEN, backgroundColor: GREEN_SOFT }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={[theme.typography.body, { fontWeight: "600" }]} numberOfLines={1}>{test.name}</Text>
                          <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: "#B7D0E8", backgroundColor: "#EAF3FB", paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontWeight: "900", color: "#2E7ABF" }}>{vocabCount}V</Text>
                            </View>
                            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: "#E6D39A", backgroundColor: "#FFF5DA", paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontWeight: "900", color: "#B88400" }}>{questionCount}Q</Text>
                            </View>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => toggleTest(id)} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="close" size={15} color={GREEN} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </GlassCard>
        </ScreenReveal>

        <AppButton label={isEdit ? "Save changes" : "Create student"} onPress={handleSave} loading={saving} />
          </View>
        </TouchableOpacity>
      </ScrollView>
      <FloatingToast
        visible={!!toastMessage}
        message={toastMessage}
        tone={toastTone}
        bottom={Math.max(insets.bottom, 20) + 12}
      />

      {/* ── Lesson picker modal ── */}
      <Modal visible={lessonPickerOpen} animationType="fade" transparent onRequestClose={() => { Keyboard.dismiss(); setLessonPickerOpen(false); }}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-start", paddingTop: pickerVerticalPadding, paddingBottom: pickerVerticalPadding }}
            activeOpacity={1}
            onPress={() => { Keyboard.dismiss(); setLessonPickerOpen(false); }}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ marginHorizontal: 16 }}>
              <GlassCard style={{ borderRadius: 24, overflow: "hidden" }} padding={0} variant="strong">
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View>
                    <Text style={[theme.typography.title, { fontSize: 18 }]}>Assign lessons</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                      {selectedLessons.length} selected
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { Keyboard.dismiss(); setLessonPickerOpen(false); }}
                    style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: GREEN }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "800", color: "#fff" }}>Done</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <TextInput
                    value={lessonSearch}
                    onChangeText={setLessonSearch}
                    placeholder="Search lessons…"
                    placeholderTextColor={theme.colors.textMuted}
                    style={[inputStyle, { marginBottom: 0 }]}
                  />
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" style={{ height: listHeight }}>
                  {filteredLessons.length === 0 ? (
                    <View style={{ paddingVertical: 32, alignItems: "center" }}>
                      <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No lessons found</Text>
                    </View>
                  ) : filteredLessons.map((l) => {
                    const selected = selectedLessons.includes(l.id);
                    const vocabCount = Array.isArray(l.content_json?.words) ? l.content_json?.words.length : 0;
                    const languageBadge = getLanguageBadge(l.language);
                    const languageBadgeColors = getLanguageBadgeColors(languageBadge);
                    return (
                      <TouchableOpacity
                        key={l.id}
                        onPress={() => toggleLesson(l.id)}
                        activeOpacity={0.8}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: selected ? GREEN_SOFT : "transparent" }}
                      >
                        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: selected ? 0 : 1.5, borderColor: theme.colors.border, backgroundColor: selected ? GREEN : "transparent", alignItems: "center", justifyContent: "center", marginRight: 12, flexShrink: 0 }}>
                          {selected ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[theme.typography.body, { fontWeight: selected ? "700" : "400" }]} numberOfLines={1}>{l.title}</Text>
                          <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                            {languageBadge ? (
                              <View style={{ borderRadius: 999, borderWidth: 1, borderColor: languageBadgeColors.borderColor, backgroundColor: languageBadgeColors.backgroundColor, paddingHorizontal: 7, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, fontWeight: "900", color: languageBadgeColors.textColor }}>{languageBadge}</Text>
                              </View>
                            ) : null}
                            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: "#B7D0E8", backgroundColor: "#EAF3FB", paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontWeight: "900", color: "#2E7ABF" }}>{vocabCount}V</Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </GlassCard>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Test picker modal ── */}
      <Modal visible={testPickerOpen} animationType="fade" transparent onRequestClose={() => { Keyboard.dismiss(); setTestPickerOpen(false); }}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-start", paddingTop: pickerVerticalPadding, paddingBottom: pickerVerticalPadding }}
            activeOpacity={1}
            onPress={() => { Keyboard.dismiss(); setTestPickerOpen(false); }}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ marginHorizontal: 16 }}>
              <GlassCard style={{ borderRadius: 24, overflow: "hidden" }} padding={0} variant="strong">
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View>
                    <Text style={[theme.typography.title, { fontSize: 18 }]}>Assign tests</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                      {selectedTests.length} selected
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { Keyboard.dismiss(); setTestPickerOpen(false); }}
                    style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: GREEN }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "800", color: "#fff" }}>Done</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <TextInput
                    value={testSearch}
                    onChangeText={setTestSearch}
                    placeholder="Search tests…"
                    placeholderTextColor={theme.colors.textMuted}
                    style={[inputStyle, { marginBottom: 0 }]}
                  />
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" style={{ height: listHeight }}>
                  {filteredTests.length === 0 ? (
                    <View style={{ paddingVertical: 32, alignItems: "center" }}>
                      <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>No tests found</Text>
                    </View>
                  ) : filteredTests.map((t) => {
                    const selected = selectedTests.includes(t.id);
                    const vocabCount = Array.isArray(t.config_json?.words) ? t.config_json?.words.length : 0;
                    const questionCount = Array.isArray(t.config_json?.tests) ? t.config_json?.tests.length : 0;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => toggleTest(t.id)}
                        activeOpacity={0.8}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: selected ? GREEN_SOFT : "transparent" }}
                      >
                        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: selected ? 0 : 1.5, borderColor: theme.colors.border, backgroundColor: selected ? GREEN : "transparent", alignItems: "center", justifyContent: "center", marginRight: 12, flexShrink: 0 }}>
                          {selected ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[theme.typography.body, { fontWeight: selected ? "700" : "400" }]} numberOfLines={1}>{t.name}</Text>
                          <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: "#B7D0E8", backgroundColor: "#EAF3FB", paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontWeight: "900", color: "#2E7ABF" }}>{vocabCount}V</Text>
                            </View>
                            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: "#E6D39A", backgroundColor: "#FFF5DA", paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 10, fontWeight: "900", color: "#B88400" }}>{questionCount}Q</Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </GlassCard>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={teacherModalOpen} animationType="slide" transparent onRequestClose={() => setTeacherModalOpen(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setTeacherModalOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <GlassCard
              style={{
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                maxHeight: "75%",
              }}
              contentStyle={{ paddingBottom: insets.bottom + 16 }}
              padding={0}
              variant="strong"
            >
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                <Text style={theme.typography.title}>Assign teacher</Text>
                <TextInput
                  value={teacherSearch}
                  onChangeText={setTeacherSearch}
                  placeholder="Search…"
                  placeholderTextColor={theme.colors.textMuted}
                  style={[inputStyle, { marginTop: 12 }]}
                />
              </View>
              <ScrollView style={{ maxHeight: 400 }}>
                {filteredTeachers.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={async () => {
                      setTeacherId(t.id);
                      setSelectedLessons([]);
                      setSelectedTests([]);
                      await loadListsForTeacher(t.id);
                      setTeacherModalOpen(false);
                    }}
                    style={{ paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
                  >
                    <Text style={theme.typography.bodyStrong}>{t.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </GlassCard>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
