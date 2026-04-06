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
import GlassCard from "../components/GlassCard";
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

function getLanguageBadge(language?: string | null) {
  const value = (language ?? "").trim();
  if (!value) return "";
  const normalized = value.toLowerCase();
  if (normalized.includes("portuguese")) return "PT";
  if (normalized.includes("spanish")) return "ESP";
  if (normalized.includes("french")) return "FR";
  if (normalized.includes("german")) return "DE";
  if (normalized.includes("italian")) return "IT";
  if (normalized.includes("english")) return "EN";
  return value
    .split(/[\s()/,-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
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

  const [lessonSearch, setLessonSearch] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const saveScale = useRef(new Animated.Value(1)).current;
  const copyScale = useRef(new Animated.Value(1)).current;
  const copyGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

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
          setAllLessons((lr.data as LessonOpt[]) || []);
          setAllTests((ter.data as TestOpt[]) || []);
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
      Alert.alert("Copied", "Access code copied.");
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
        Alert.alert("Saved", "Student updated.");
      } else {
        const { error } = await (supabase.from("students") as any).insert({
          name: name.trim(),
          email: email.trim() || null,
          code: code.trim().toUpperCase(),
          teacher_id: finalTeacherId,
          assigned_lessons: selectedLessons,
          assigned_tests: selectedTests,
          progress: {},
          is_active: true,
        });
        if (error) throw error;
        Alert.alert("Created", "Student added.");
      }
      navigation.goBack();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
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
        <GlassCard style={{ borderRadius: 16, marginBottom: 16 }} padding={16}>
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

        {isAdmin ? (
          <GlassCard style={{ borderRadius: 16, marginBottom: 16 }} padding={16}>
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
        ) : null}

        <GlassCard style={{ borderRadius: 16, marginBottom: 16 }} padding={16}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[darkCaption, { textTransform: "uppercase" }]}>Lessons</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ borderRadius: 999, borderWidth: 1, borderColor: GREEN, backgroundColor: GREEN_SOFT, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: GREEN }}>{selectedLessons.length} selected</Text>
              </View>
              {contentLoading ? <ActivityIndicator size="small" color={GREEN} /> : null}
            </View>
          </View>
          <TextInput
            value={lessonSearch}
            onChangeText={setLessonSearch}
            placeholder="Search lessons…"
            placeholderTextColor={theme.colors.textMuted}
            style={[inputStyle, { marginBottom: 10 }]}
          />
          {filteredLessons.map((l) => {
            const selected = selectedLessons.includes(l.id);
            const vocabCount = Array.isArray(l.content_json?.words) ? l.content_json?.words.length : 0;
            const languageBadge = getLanguageBadge(l.language);
            const languageBadgeColors = getLanguageBadgeColors(languageBadge);
            return (
              <TouchableOpacity
                key={l.id}
                onPress={() => toggleLesson(l.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                  marginBottom: 8,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: selected ? GREEN : theme.colors.border,
                  backgroundColor: selected ? GREEN_SOFT : theme.colors.surface,
                }}
              >
                <Ionicons
                  name={selected ? "checkbox" : "square-outline"}
                  size={22}
                  color={GREEN}
                />
                <Text style={[theme.typography.body, { marginLeft: 10, flex: 1 }]} numberOfLines={2}>
                  {l.title}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 8 }}>
                  {languageBadge ? (
                    <View
                      style={{
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: languageBadgeColors.borderColor,
                        backgroundColor: languageBadgeColors.backgroundColor,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "900", color: languageBadgeColors.textColor }}>{languageBadge}</Text>
                    </View>
                  ) : null}
                  <View
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "#B7D0E8",
                      backgroundColor: "#EAF3FB",
                      paddingHorizontal: 7,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "900", color: "#2E7ABF" }}>{vocabCount}V</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </GlassCard>

        <GlassCard style={{ borderRadius: 16, marginBottom: 24 }} padding={16}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[darkCaption, { textTransform: "uppercase" }]}>Tests</Text>
            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: GREEN, backgroundColor: GREEN_SOFT, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: GREEN }}>{selectedTests.length} selected</Text>
            </View>
          </View>
          <TextInput
            value={testSearch}
            onChangeText={setTestSearch}
            placeholder="Search tests…"
            placeholderTextColor={theme.colors.textMuted}
            style={[inputStyle, { marginBottom: 10 }]}
          />
          {filteredTests.map((t) => {
            const selected = selectedTests.includes(t.id);
            const vocabCount = Array.isArray(t.config_json?.words) ? t.config_json?.words.length : 0;
            const questionCount = Array.isArray(t.config_json?.tests) ? t.config_json?.tests.length : 0;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => toggleTest(t.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                  marginBottom: 8,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: selected ? GREEN : theme.colors.border,
                  backgroundColor: selected ? GREEN_SOFT : theme.colors.surface,
                }}
              >
                <Ionicons
                  name={selected ? "checkbox" : "square-outline"}
                  size={22}
                  color={GREEN}
                />
                <Text style={[theme.typography.body, { marginLeft: 10, flex: 1 }]} numberOfLines={2}>
                  {t.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 8 }}>
                  <View
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "#B7D0E8",
                      backgroundColor: "#EAF3FB",
                      paddingHorizontal: 7,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "900", color: "#2E7ABF" }}>{vocabCount}V</Text>
                  </View>
                  <View
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "#E6D39A",
                      backgroundColor: "#FFF5DA",
                      paddingHorizontal: 7,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "900", color: "#B88400" }}>{questionCount}Q</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </GlassCard>

        <AppButton label={isEdit ? "Save changes" : "Create student"} onPress={handleSave} loading={saving} />
          </View>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={teacherModalOpen} animationType="slide" transparent onRequestClose={() => setTeacherModalOpen(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setTeacherModalOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                backgroundColor: theme.colors.surface,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingBottom: insets.bottom + 16,
                maxHeight: "75%",
              }}
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
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
