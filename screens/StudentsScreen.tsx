import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Alert,
  Easing,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";

if (Platform.OS === "android") UIManager.setLayoutAnimationEnabledExperimental?.(true);
const layoutEase = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { NavigationProp, useNavigation, useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GlassCard from "../components/GlassCard";
import IconTile from "../components/IconTile";
import ScreenReveal from "../components/ScreenReveal";
import SkeletonLoader from "../components/SkeletonLoader";
import { triggerLightImpact } from "../lib/haptics";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";
import {
  coercePlanForRole,
  getStudentLimitForPlan,
  normalizePlanUi,
} from "../lib/teacherRolePlanRules";

export type RootStudentsStackParams = {
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  Students: undefined;
  StudentForm: { studentId?: string } | undefined;
  Subscription: undefined;
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

  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

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

      setStudents((data ?? []) as StudentRow[]);
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

  const copyCode = async (code: string) => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      Alert.alert("Copied", "Access code copied to clipboard.");
    } catch {
      Alert.alert("Error", "Could not copy.");
    }
  };

  const handleToggleStatus = async (student: StudentRow) => {
    const currentlyActive = student.is_active !== false;
    const newStatus = !currentlyActive;
    if (newStatus && isMaxed && !isAdmin) {
      Alert.alert(
        "Capacity reached",
        `You can have up to ${studentLimit} active students. Deactivate another student first.`
      );
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
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update status");
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
          } catch (e: unknown) {
            Alert.alert("Error", e instanceof Error ? e.message : "Delete failed");
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
      </ScrollView>

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


