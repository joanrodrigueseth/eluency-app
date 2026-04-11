import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Alert,
  Easing,
  Image,
  LayoutAnimation,
  Linking,
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
import Constants from "expo-constants";
import { NavigationProp, useNavigation, useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GlassCard from "../components/GlassCard";
import IconTile from "../components/IconTile";
import ScreenReveal from "../components/ScreenReveal";
import SkeletonLoader from "../components/SkeletonLoader";
import { triggerLightImpact } from "../lib/haptics";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";
import { normalizePlanUi } from "../lib/teacherRolePlanRules";

export type RootTestsStackParams = {
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  Tests: undefined;
  TestForm: { testId?: string } | undefined;
  Subscription: undefined;
};

const VOCAB_TYPES = ["Vocabulary", "False Cognates", "Cognates", "Idioms & Expressions"];

type TestRow = {
  id: string;
  name: string | null;
  type: string | null;
  cover_image_url?: string | null;
  status?: string | null;
  description?: string | null;
  teacher_id?: string | null;
  config_json?: { words?: unknown[]; tests?: unknown[] } | null;
  teachers?: { name: string } | null;
};

type SortKey = "name" | "type" | "wordCount" | "questionCount";
type SortDir = "asc" | "desc";

const apiBaseUrl =
  Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";
const LINEN_BG = "#F7F2EA";
const LINEN_CARD = "#FCFAF6";
const AZULEJO_BLUE = "#9050E7";
const AZULEJO_BLUE_SOFT = "#F3ECFF";
const AZULEJO_BLUE_BORDER = "#D5B8FC";

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

export default function TestsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootTestsStackParams>>();
  const heroGlowOne = useRef(new Animated.Value(-10)).current;
  const heroGlowTwo = useRef(new Animated.Value(10)).current;

  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState("");
  const [planRaw, setPlanRaw] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [teacherView, setTeacherView] = useState<"mine" | string>("mine");
  const [teacherMenuOpen, setTeacherMenuOpen] = useState(false);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const planUi = normalizePlanUi(planRaw);
  const isBasicPlan = planUi === "Basic";

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

  const canManage = useMemo(() => {
    const r = (role ?? "").toLowerCase().trim();
    return r === "admin" || r === "teacher";
  }, [role]);

  const loadTests = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Not logged in");

      setCurrentUserId(user.id);

      const { data: teacherRow, error: trErr } = await (supabase.from("teachers") as any)
        .select("role, plan")
        .eq("user_id", user.id)
        .maybeSingle();

      if (trErr) throw trErr;

      const admin = (teacherRow as { role?: string } | null)?.role === "admin";
      setIsAdmin(admin);
      setRole((teacherRow as { role?: string } | null)?.role ?? "");
      setPlanRaw((teacherRow as { plan?: string | null } | null)?.plan ?? null);

      const select = admin ? "*, teachers(name)" : "*";
      let query = (supabase.from("tests") as any).select(select).order("created_at", { ascending: false });
      if (!admin) {
        query = query.eq("teacher_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      setTests((data ?? []) as TestRow[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load tests";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTests();
    }, [loadTests])
  );

  const otherTeachers = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, { name: string; count: number }>();
    for (const t of tests) {
      const tid = t.teacher_id;
      const tname = t.teachers?.name;
      if (tid && tname && tid !== currentUserId) {
        const existing = map.get(tid);
        map.set(tid, { name: tname, count: (existing?.count ?? 0) + 1 });
      }
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tests, isAdmin, currentUserId]);

  const viewingOtherTeacher = isAdmin && teacherView !== "mine";

  const testsForView = useMemo(() => {
    if (!isAdmin) return tests;
    if (teacherView === "mine") return tests.filter((t) => t.teacher_id === currentUserId);
    return tests.filter((t) => t.teacher_id === teacherView);
  }, [tests, isAdmin, teacherView, currentUserId]);

  const vocabCount = useMemo(
    () => testsForView.filter((t) => VOCAB_TYPES.includes(t.type ?? "")).length,
    [testsForView]
  );

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
    return [...testsForView]
      .filter(
        (t) =>
          (t.name ?? "").toLowerCase().includes(q) || (t.type ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => {
        let av: string | number;
        let bv: string | number;
        if (sortKey === "wordCount") {
          av = a.config_json?.words?.length ?? 0;
          bv = b.config_json?.words?.length ?? 0;
        } else if (sortKey === "questionCount") {
          av = a.config_json?.tests?.length ?? 0;
          bv = b.config_json?.tests?.length ?? 0;
        } else {
          av = ((a as any)[sortKey] ?? "").toString().toLowerCase();
          bv = ((b as any)[sortKey] ?? "").toString().toLowerCase();
        }
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [testsForView, searchTerm, sortKey, sortDir]);

  const openWebEdit = async (id: string) => {
    const url = `${apiBaseUrl.replace(/\/$/, "")}/dashboard/tests/${id}/edit`;
    const ok = await Linking.canOpenURL(url);
    if (ok) await Linking.openURL(url);
    else Alert.alert("Open web", url);
  };

  const duplicateTest = async (test: TestRow) => {
    setActionLoadingId(test.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const base = apiBaseUrl.replace(/\/$/, "");
      const payload = {
        name: `${test.name ?? "Test"} (Copy)`,
        type: test.type ?? "Vocabulary",
        config_json: test.config_json ?? { tests: [], words: [], linked_lesson_ids: [] },
        status: "draft",
        teacher_id: currentUserId,
        created_by: currentUserId,
        description: test.description != null && test.description !== "" ? test.description : null,
      };

      let res = await fetch(`${base}/api/admin/tests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const ins = await (supabase.from("tests") as any).insert({
          name: payload.name,
          type: payload.type,
          config_json: payload.config_json,
          status: payload.status,
          teacher_id: currentUserId,
          created_by: currentUserId,
          description: payload.description,
        });
        if (ins.error) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data?.error ?? ins.error.message ?? "Duplicate failed");
        }
      }

      Alert.alert("Done", "Test duplicated as draft.");
      await loadTests();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setActionLoadingId(null);
    }
  };

  const deleteTest = (test: TestRow) => {
    Alert.alert("Delete test", `Remove "${test.name ?? "Untitled"}"? It will be unassigned from students.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setActionLoadingId(test.id);
          try {
            if (!isAdmin && test.teacher_id && test.teacher_id !== currentUserId) {
              throw new Error("You can only delete your own tests.");
            }

            // Keep mobile deletion independent from web cookies endpoint.
            // First, unassign the test from students that contain it.
            let studentsQuery = (supabase.from("students") as any)
              .select("id, assigned_tests")
              .contains("assigned_tests", [test.id]);
            if (!isAdmin) {
              studentsQuery = studentsQuery.eq("teacher_id", currentUserId);
            }
            const { data: studentsRows, error: studentsErr } = await studentsQuery;
            if (studentsErr) throw studentsErr;

            const students = (studentsRows ?? []) as { id: string; assigned_tests?: string[] | null }[];
            for (const s of students) {
              const current = Array.isArray(s.assigned_tests) ? s.assigned_tests : [];
              const next = current.filter((x) => x !== test.id);
              if (next.length !== current.length) {
                const { error: upErr } = await (supabase.from("students") as any)
                  .update({ assigned_tests: next })
                  .eq("id", s.id);
                if (upErr) throw upErr;
              }
            }

            // Then delete the test itself.
            let deleteQuery = (supabase.from("tests") as any).delete().eq("id", test.id);
            if (!isAdmin) {
              deleteQuery = deleteQuery.eq("teacher_id", currentUserId);
            }
            const { error: deleteErr } = await deleteQuery;
            if (deleteErr) throw deleteErr;

            setTests((prev) => prev.filter((t) => t.id !== test.id));
            Alert.alert("Deleted", "Test removed.");
          } catch (e: unknown) {
            Alert.alert("Error", e instanceof Error ? e.message : "Delete failed");
          } finally {
            setActionLoadingId(null);
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

  if (loading && tests.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.isDark ? theme.colors.background : LINEN_BG }}>
        <SkeletonLoader count={6} />
      </View>
    );
  }

  return (
      <View style={{ flex: 1, backgroundColor: theme.isDark ? theme.colors.background : LINEN_BG }}>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
            backgroundColor: theme.isDark ? theme.colors.background : LINEN_BG,
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
          <Text style={theme.typography.label}>Library</Text>
          <Text style={[theme.typography.title, { marginTop: 2, fontSize: 18, lineHeight: 22 }]}>Tests</Text>
        </View>
        {canManage ? (
          <TouchableOpacity
            onPress={() => navigation.navigate("TestForm")}
            activeOpacity={0.85}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: theme.isDark ? theme.colors.primary : AZULEJO_BLUE,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              shadowColor: theme.isDark ? theme.colors.primary : AZULEJO_BLUE,
              shadowOpacity: 0.22,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }}
          >
            <Ionicons name="add" size={15} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 12, letterSpacing: 0.4 }}>NEW</Text>
          </TouchableOpacity>
        ) : null}
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
            <GlowOrb size={150} color={theme.isDark ? theme.colors.primarySoft : AZULEJO_BLUE_SOFT} top={-50} right={-18} translate={heroGlowOne} />
            <GlowOrb size={110} color={theme.isDark ? theme.colors.violetSoft : "#FFF2C8"} bottom={-30} left={-10} translate={heroGlowTwo} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <IconTile icon="clipboard-outline" size={38} iconSize={20} radius={10} backgroundColor={theme.isDark ? theme.colors.primarySoft : AZULEJO_BLUE_SOFT} borderColor={theme.isDark ? theme.colors.primary : AZULEJO_BLUE_BORDER} color={theme.isDark ? theme.colors.primary : AZULEJO_BLUE} />
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.title, { fontSize: 18, color: theme.isDark ? theme.colors.primary : AZULEJO_BLUE }]}>Tests Library</Text>
              <Text style={[theme.typography.caption, { color: theme.isDark ? theme.colors.primary : "#4E6F8D", marginTop: 2 }]}>
                Create and manage your tests.
              </Text>
            </View>
          </View>
          </View>
        </GlassCard>
        </ScreenReveal>

        <ScreenReveal delay={90}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <StatCard
            theme={theme}
            label="Total"
            value={String(testsForView.length)}
            icon="grid-outline"
            accent={theme.isDark ? theme.colors.primary : AZULEJO_BLUE}
          />
          <StatCard theme={theme} label="Vocab" value={String(vocabCount)} icon="language-outline" accent={theme.colors.violet} />
        </View>
        </ScreenReveal>

        {!isAdmin && isBasicPlan ? (
          <GlassCard style={{ borderRadius: 16, marginBottom: 14 }} padding={14}>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
              Basic includes full test creation with AI tools and a 1 student cap. Upgrade for a larger classroom.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("Subscription")}
              activeOpacity={0.85}
              style={{
                marginTop: 10,
                alignSelf: "flex-start",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: theme.isDark ? theme.colors.primarySoft : AZULEJO_BLUE_SOFT,
                borderWidth: 1,
                borderColor: theme.isDark ? theme.colors.primary : AZULEJO_BLUE_BORDER,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ionicons name="diamond-outline" size={14} color={theme.isDark ? theme.colors.primary : AZULEJO_BLUE} />
              <Text style={{ color: theme.isDark ? theme.colors.primary : AZULEJO_BLUE, fontWeight: "800", fontSize: 13 }}>View plans</Text>
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
                    borderColor: teacherView === "mine" ? (theme.isDark ? theme.colors.primary : AZULEJO_BLUE) : theme.colors.border,
                    backgroundColor: teacherView === "mine" ? (theme.isDark ? theme.colors.primary : AZULEJO_BLUE) : theme.colors.surfaceGlass,
                    flexDirection: "row", alignItems: "center", gap: 5,
                    shadowColor: teacherView === "mine" ? (theme.isDark ? theme.colors.primary : AZULEJO_BLUE) : "transparent",
                    shadowOpacity: teacherView === "mine" ? 0.2 : 0,
                    shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: teacherView === "mine" ? 2 : 0,
                  }}
                >
                  {teacherView === "mine" && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                  <Text style={{ fontWeight: "800", fontSize: 12, color: teacherView === "mine" ? "#FFFFFF" : theme.colors.text }}>My tests</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => setTeacherMenuOpen(true)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: viewingOtherTeacher ? (theme.isDark ? theme.colors.primary : AZULEJO_BLUE) : theme.colors.border,
                    backgroundColor: viewingOtherTeacher ? (theme.isDark ? theme.colors.primary : AZULEJO_BLUE) : theme.colors.surfaceGlass,
                    flexDirection: "row", alignItems: "center", gap: 5,
                    shadowColor: viewingOtherTeacher ? (theme.isDark ? theme.colors.primary : AZULEJO_BLUE) : "transparent",
                    shadowOpacity: viewingOtherTeacher ? 0.2 : 0,
                    shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: viewingOtherTeacher ? 2 : 0,
                  }}
                >
                  {viewingOtherTeacher && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
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
            placeholder="Search tests…"
            placeholderTextColor={theme.colors.textMuted}
            style={[inputStyle, { marginBottom: 12 }]}
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {(
              [
                { key: "name" as SortKey, label: "Name" },
                { key: "type" as SortKey, label: "Type" },
                { key: "wordCount" as SortKey, label: "Words" },
                { key: "questionCount" as SortKey, label: "Questions" },
              ] as const
            ).map(({ key, label }) => {
              const active = sortKey === key;
              const activeColor = theme.isDark ? theme.colors.primary : AZULEJO_BLUE;
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
                    borderColor: active ? activeColor : theme.colors.border,
                    backgroundColor: active ? activeColor : theme.colors.surfaceGlass,
                    gap: 5,
                    shadowColor: active ? activeColor : "transparent",
                    shadowOpacity: active ? 0.2 : 0,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: active ? 2 : 0,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "800", color: active ? "#FFFFFF" : theme.colors.text }}>{label}</Text>
                  {active ? (
                    <Ionicons name={sortDir === "asc" ? "arrow-up" : "arrow-down"} size={13} color="#FFFFFF" />
                  ) : (
                    <Ionicons name="swap-vertical-outline" size={13} color={theme.colors.textMuted} />
                  )}
                </AnimatedPressable>
              );
            })}
          </View>

          {testsForView.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <IconTile icon="clipboard-outline" size={74} iconSize={30} radius={24} backgroundColor={theme.isDark ? theme.colors.primarySoft : AZULEJO_BLUE_SOFT} borderColor={theme.isDark ? theme.colors.primary : AZULEJO_BLUE_BORDER} color={theme.isDark ? theme.colors.primary : AZULEJO_BLUE} />
              <Text style={[theme.typography.title, { marginTop: 16, fontSize: 20, lineHeight: 24 }]}>No tests found</Text>
              <Text style={[theme.typography.body, { marginTop: 8, color: theme.colors.textMuted, textAlign: "center", maxWidth: 280 }]}>
                Create your first test or adjust the current filters to bring matching results back into view.
              </Text>
              {canManage ? (
                <View style={{ flexDirection: "row", marginTop: 16, gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate("TestForm")}
                    activeOpacity={0.85}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 11,
                      borderRadius: 14,
                      backgroundColor: theme.isDark ? theme.colors.primary : AZULEJO_BLUE,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      shadowColor: theme.isDark ? theme.colors.primary : AZULEJO_BLUE,
                      shadowOpacity: 0.18,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 5 },
                      elevation: 3,
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={15} color="#FFFFFF" />
                    <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}>Create test</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSearchTerm("")}
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
                  backgroundColor: theme.isDark ? theme.colors.primarySoft : AZULEJO_BLUE_SOFT,
                  borderWidth: 1,
                  borderColor: theme.isDark ? theme.colors.primary : AZULEJO_BLUE_BORDER,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ionicons name="close-circle-outline" size={14} color={theme.isDark ? theme.colors.primary : AZULEJO_BLUE} />
                <Text style={{ color: theme.isDark ? theme.colors.primary : AZULEJO_BLUE, fontWeight: "700", fontSize: 13 }}>Clear search</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {filteredSorted.map((test, index) => {
                const cfg = test.config_json ?? {};
                const wordCount = Array.isArray(cfg.words) ? cfg.words.length : 0;
                const questionCount = Array.isArray(cfg.tests) ? cfg.tests.length : 0;
                const busy = actionLoadingId === test.id;
                const accentColor = theme.isDark ? theme.colors.primary : AZULEJO_BLUE;

                return (
                  <ScreenReveal key={test.id} delay={index * 45}>
                    <AnimatedPressable
                      onPress={() => navigation.navigate("TestForm", { testId: test.id })}
                      style={{
                        marginBottom: 12,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.isDark ? theme.colors.surfaceGlass : "#FFFFFF",
                        overflow: "hidden",
                        shadowColor: "#000",
                        shadowOpacity: theme.isDark ? 0.06 : 0.07,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 2,
                      }}
                    >
                      <View style={{ height: 3, backgroundColor: accentColor, opacity: 0.65 }} />
                      <View style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                          {test.cover_image_url?.trim() ? (
                            <Image
                              source={{ uri: test.cover_image_url.trim() }}
                              style={{ width: 48, height: 48, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={{
                              width: 48, height: 48, borderRadius: 15,
                              borderWidth: 1,
                              borderColor: theme.isDark ? theme.colors.border : AZULEJO_BLUE_BORDER,
                              backgroundColor: theme.isDark ? theme.colors.primarySoft : AZULEJO_BLUE_SOFT,
                              alignItems: "center", justifyContent: "center",
                            }}>
                              <Ionicons name="clipboard-outline" size={20} color={accentColor} />
                            </View>
                          )}

                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 15, fontWeight: "900", color: theme.colors.text }} numberOfLines={1}>
                              {test.name ?? "Untitled"}
                            </Text>
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}>
                              <View style={{ borderRadius: 999, borderWidth: 1, borderColor: theme.isDark ? theme.colors.border : AZULEJO_BLUE_BORDER, backgroundColor: theme.isDark ? theme.colors.primarySoft : AZULEJO_BLUE_SOFT, paddingHorizontal: 7, paddingVertical: 3 }}>
                                <Text style={{ fontSize: 9, fontWeight: "900", color: accentColor }}>{wordCount}W</Text>
                              </View>
                              <View style={{ borderRadius: 999, borderWidth: 1, borderColor: theme.isDark ? theme.colors.border : "#E6D39A", backgroundColor: theme.isDark ? theme.colors.primarySoft : "#FFF5DA", paddingHorizontal: 7, paddingVertical: 3 }}>
                                <Text style={{ fontSize: 9, fontWeight: "900", color: theme.isDark ? theme.colors.primary : "#B88400" }}>{questionCount}Q</Text>
                              </View>
                              <View style={{ flex: 1 }} />
                              {canManage ? (
                                <>
                                  <TouchableOpacity onPress={() => navigation.navigate("TestForm", { testId: test.id })} disabled={busy} style={{ borderRadius: 9, backgroundColor: theme.isDark ? theme.colors.primarySoft : AZULEJO_BLUE_SOFT, borderWidth: 1, borderColor: accentColor, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4, opacity: busy ? 0.6 : 1 }}>
                                    <Ionicons name="pencil-outline" size={12} color={accentColor} />
                                    <Text style={{ fontSize: 11, fontWeight: "800", color: accentColor }}>Edit</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => deleteTest(test)} disabled={busy} style={{ width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: theme.colors.danger, backgroundColor: theme.isDark ? "rgba(239,68,68,0.12)" : "#FFF6F6", opacity: busy ? 0.6 : 1, alignItems: "center", justifyContent: "center" }}>
                                    {busy ? <Text style={{ fontSize: 10, color: theme.colors.danger }}>...</Text> : <Ionicons name="trash-outline" size={13} color={theme.colors.danger} />}
                                  </TouchableOpacity>
                                </>
                              ) : (
                                <TouchableOpacity onPress={() => openWebEdit(test.id)} style={{ borderRadius: 9, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceGlass, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}>
                                  <Ionicons name="globe-outline" size={12} color={theme.colors.primary} />
                                  <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.primary }}>Web</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        </View>
                      </View>
                    </AnimatedPressable>
                  </ScreenReveal>
                );
              })}
            </>
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
              <Text style={{ padding: 16, color: theme.colors.textMuted }}>No other teachers with tests.</Text>
            ) : (
              otherTeachers.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => {
                    setTeacherView(t.id);
                    setTeacherMenuOpen(false);
                  }}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <Text style={theme.typography.body}>{t.name}</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{t.count} tests</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function StatCard({
  theme,
  label,
  value,
  icon,
  accent,
}: {
  theme: ReturnType<typeof useAppTheme>;
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
}) {
  return (
    <View
      style={{
        flexGrow: 1,
        minWidth: "42%",
        flexBasis: "42%",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.isDark ? theme.colors.border : `${accent}33`,
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: theme.isDark ? theme.colors.surfaceAlt : "#FFFFFF",
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: theme.isDark ? `${accent}22` : `${accent}18`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={22} color={accent} />
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




