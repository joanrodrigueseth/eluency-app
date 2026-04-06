import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import {
  NavigationProp,
  useFocusEffect,
  useNavigation,
} from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";

export type RootLessonsStackParams = {
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  Lessons: undefined;
  LessonForm: { lessonId?: string } | undefined;
  Subscription: undefined;
};

type LessonRow = {
  id: string;
  title: string | null;
  description?: string | null;
  status: string | null;
  created_at: string | null;
  cover_image_url?: string | null;
  created_by?: string | null;
  language?: string | null;
  teachers?: { name: string } | null;
};

type TeacherOption = {
  id: string;
  name: string;
  count: number;
};

const apiBaseUrl =
  Constants.expoConfig?.extra?.apiBaseUrl?.toString() ||
  "https://www.eluency.com";

const PAGE_SIZE = 10;

const LIGHT_BG = "#F6F3EE";
const CARD_BG = "#FFFCF8";
const PRIMARY = "#2E7ABF";
const PRIMARY_SOFT = "#EAF3FB";
const PRIMARY_BORDER = "#B7D0E8";
const VIOLET_SOFT = "#F3EEFF";
const VIOLET = "#7C5CFA";
const GOLD = "#F3C64D";
const GOLD_SOFT = "#FFF5D7";
const SUCCESS_SOFT = "#EAF7EE";
const DANGER_SOFT = "#FFF3F3";

function formatDate(date?: string | null) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
      return {
        backgroundColor: "#EAF7EE",
        borderColor: "#2F9E44",
        textColor: "#1F7A35",
      };
    case "ESP":
      return {
        backgroundColor: "#FFF4E5",
        borderColor: "#F08C00",
        textColor: "#C56A00",
      };
    case "FR":
      return {
        backgroundColor: "#ECF4FF",
        borderColor: "#2F6FED",
        textColor: "#2458B8",
      };
    case "DE":
      return {
        backgroundColor: "#F5F5F5",
        borderColor: "#5C5F66",
        textColor: "#2D2F33",
      };
    case "IT":
      return {
        backgroundColor: "#EEF8EF",
        borderColor: "#3A9D5D",
        textColor: "#2B7A46",
      };
    case "EN":
      return {
        backgroundColor: "#F1F6FF",
        borderColor: "#4C7CEB",
        textColor: "#355FC2",
      };
    default:
      return {
        backgroundColor: "#FFF3E8",
        borderColor: "#D96B1C",
        textColor: "#B55312",
      };
  }
}

function getLessonAccent(index: number) {
  const accents = [
    {
      bg: "#EAF3FB",
      border: "#B7D0E8",
      icon: "#2E7ABF",
      glow: "rgba(46,122,191,0.18)",
    },
    {
      bg: "#F3EEFF",
      border: "#D8CDFD",
      icon: "#7C5CFA",
      glow: "rgba(124,92,250,0.18)",
    },
    {
      bg: "#FFF5D7",
      border: "#F4DB88",
      icon: "#B98500",
      glow: "rgba(243,198,77,0.22)",
    },
    {
      bg: "#EAF7EE",
      border: "#BEE0C6",
      icon: "#2E8B57",
      glow: "rgba(46,139,87,0.18)",
    },
  ];

  return accents[index % accents.length];
}

function truncate(text?: string | null, max = 120) {
  const clean = text?.trim() ?? "";
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}...`;
}

function AnimatedCounter({
  value,
  suffix = "",
  duration = 700,
  textStyle,
}: {
  value: number;
  suffix?: string;
  duration?: number;
  textStyle?: any;
}) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    animatedValue.setValue(0);
    const id = animatedValue.addListener(({ value: next }) => {
      setDisplayValue(Math.round(next));
    });

    Animated.timing(animatedValue, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    return () => {
      animatedValue.removeListener(id);
    };
  }, [animatedValue, duration, value]);

  return <Text style={textStyle}>{`${displayValue}${suffix}`}</Text>;
}

function FadeInSection({
  children,
  delay = 0,
  translateY = 18,
}: {
  children: React.ReactNode;
  delay?: number;
  translateY?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const moveY = useRef(new Animated.Value(translateY)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(moveY, {
        toValue: 0,
        duration: 460,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, moveY, opacity]);

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ translateY: moveY }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function PressableScale({
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
      useNativeDriver: true,
      speed: 28,
      bounciness: 4,
    }).start();
  };

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => animateTo(0.98)}
      onPressOut={() => animateTo(1)}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

export default function LessonsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootLessonsStackParams>>();

  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [teacherView, setTeacherView] = useState<"mine" | string>("mine");
  const [teacherMenuOpen, setTeacherMenuOpen] = useState(false);
  const [lessonPackNames, setLessonPackNames] = useState<
    Record<string, string[]>
  >({});
  const [languageFilter, setLanguageFilter] = useState("all");
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const heroGlow = useRef(new Animated.Value(0.7)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.96)).current;

  const canManage = useMemo(() => {
    const r = role.toLowerCase().trim();
    return r === "admin" || r === "teacher";
  }, [role]);

  const viewingOtherTeacher = isAdmin && teacherView !== "mine";

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(heroGlow, {
            toValue: 1,
            duration: 2400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(heroGlow, {
            toValue: 0.72,
            duration: 2400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ),
    ]).start();
  }, [headerOpacity, heroGlow]);

  useEffect(() => {
    if (teacherMenuOpen) {
      modalOpacity.setValue(0);
      modalScale.setValue(0.96);
      Animated.parallel([
        Animated.timing(modalOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(modalScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 22,
          bounciness: 5,
        }),
      ]).start();
    }
  }, [teacherMenuOpen, modalOpacity, modalScale]);

  const loadLessons = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Not logged in");
      setCurrentUserId(user.id);

      const { data: teacherRow, error: trErr } = await (supabase.from(
        "teachers"
      ) as any)
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (trErr) throw trErr;

      const admin = (teacherRow as { role?: string } | null)?.role === "admin";
      setIsAdmin(admin);
      setRole((teacherRow as { role?: string } | null)?.role ?? "");

      let query = (supabase.from("lessons") as any)
        .select(
          "id, title, description, status, created_at, cover_image_url, created_by, language"
        )
        .order("created_at", { ascending: false });

      if (!admin) {
        query = query.eq("created_by", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as LessonRow[];

      if (admin && rows.length) {
        const ownerIds = Array.from(
          new Set(rows.map((r) => r.created_by).filter(Boolean))
        ) as string[];

        if (ownerIds.length) {
          const { data: teachersData, error: teachersErr } = await (supabase.from(
            "teachers"
          ) as any)
            .select("user_id, name")
            .in("user_id", ownerIds);

          if (teachersErr) throw teachersErr;

          const byId = new Map<string, string>(
            ((teachersData ?? []) as { user_id: string; name: string }[]).map(
              (t) => [t.user_id, t.name]
            )
          );

          rows = rows.map((r) => ({
            ...r,
            teachers: r.created_by
              ? { name: byId.get(r.created_by) ?? "" }
              : null,
          }));
        }
      }

      setLessons(rows);

      if (rows.length) {
        const lessonIds = rows.map((r) => r.id);

        const { data: linkData } = await (supabase.from(
          "lesson_pack_lessons"
        ) as any)
          .select("pack_id, lesson_id")
          .in("lesson_id", lessonIds);

        const links = (linkData ?? []) as {
          pack_id: string;
          lesson_id: string;
        }[];

        if (links.length) {
          const packIds = Array.from(new Set(links.map((l) => l.pack_id)));

          const { data: packData } = await (supabase.from(
            "lesson_packs"
          ) as any)
            .select("id, name")
            .in("id", packIds);

          const packNameById = new Map<string, string>(
            ((packData ?? []) as { id: string; name: string }[]).map((p) => [
              p.id,
              p.name,
            ])
          );

          const map: Record<string, string[]> = {};

          for (const link of links) {
            const name = packNameById.get(link.pack_id);
            if (!name) continue;
            if (!map[link.lesson_id]) map[link.lesson_id] = [];
            map[link.lesson_id].push(name);
          }

          setLessonPackNames(map);
        } else {
          setLessonPackNames({});
        }
      } else {
        setLessonPackNames({});
      }
    } catch (e: unknown) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Failed to load lessons"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLessons();
    }, [loadLessons])
  );

  const otherTeachers = useMemo<TeacherOption[]>(() => {
    if (!isAdmin) return [];

    const map = new Map<string, { name: string; count: number }>();

    for (const lesson of lessons) {
      const teacherId = lesson.created_by;
      const teacherName = lesson.teachers?.name;

      if (teacherId && teacherName && teacherId !== currentUserId) {
        const current = map.get(teacherId);
        map.set(teacherId, {
          name: teacherName,
          count: (current?.count ?? 0) + 1,
        });
      }
    }

    return Array.from(map.entries())
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [currentUserId, isAdmin, lessons]);

  const lessonsForView = useMemo(() => {
    if (!isAdmin) return lessons;
    if (teacherView === "mine") {
      return lessons.filter((lesson) => lesson.created_by === currentUserId);
    }
    return lessons.filter((lesson) => lesson.created_by === teacherView);
  }, [currentUserId, isAdmin, lessons, teacherView]);

  const languageOptions = useMemo(
    () =>
      Array.from(
        new Set(
          lessonsForView
            .map((lesson) => lesson.language?.trim())
            .filter(Boolean) as string[]
        )
      ).sort(),
    [lessonsForView]
  );

  const filtered = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return lessonsForView.filter((lesson) => {
      const matchesSearch =
        (lesson.title ?? "").toLowerCase().includes(query) ||
        (lesson.description ?? "").toLowerCase().includes(query) ||
        (lesson.teachers?.name ?? "").toLowerCase().includes(query) ||
        (lessonPackNames[lesson.id] ?? []).some((pack) =>
          pack.toLowerCase().includes(query)
        );

      const matchesLanguage =
        languageFilter === "all" ||
        (lesson.language ?? "").trim() === languageFilter;

      return matchesSearch && matchesLanguage;
    });
  }, [languageFilter, lessonPackNames, lessonsForView, searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, teacherView, languageFilter, lessonsForView.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;

  const pagedLessons = useMemo(
    () => filtered.slice(pageStart, pageStart + PAGE_SIZE),
    [filtered, pageStart]
  );

  const totalLessonsCount = lessonsForView.length;
  const visibleCount = filtered.length;
  const packLinkedCount = useMemo(
    () => Object.keys(lessonPackNames).length,
    [lessonPackNames]
  );

  const selectedTeacherLabel = viewingOtherTeacher
    ? otherTeachers.find((t) => t.id === teacherView)?.name ?? "Teacher"
    : "My lessons";

  const openWebNew = async () => {
    const url = `${apiBaseUrl.replace(/\/$/, "")}/dashboard/lessons/new`;
    const ok = await Linking.canOpenURL(url);

    if (ok) await Linking.openURL(url);
    else Alert.alert("Open web", url);
  };

  const openWebEdit = async (id: string) => {
    const url = `${apiBaseUrl.replace(/\/$/, "")}/dashboard/lessons/${id}/edit`;
    const ok = await Linking.canOpenURL(url);

    if (ok) await Linking.openURL(url);
    else Alert.alert("Open web", url);
  };

  const deleteLesson = async (lesson: LessonRow) => {
    Alert.alert(
      "Delete lesson",
      `Remove "${lesson.title ?? "Untitled"}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleteLoadingId(lesson.id);

            try {
              const { error } = await (supabase.from("lessons") as any)
                .delete()
                .eq("id", lesson.id);

              if (error) throw error;

              setLessons((prev) => prev.filter((item) => item.id !== lesson.id));
            } catch (e: unknown) {
              Alert.alert(
                "Delete failed",
                e instanceof Error ? e.message : "Could not delete lesson"
              );
            } finally {
              setDeleteLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const topBarHeight = Math.max(insets.top, 8) + 62;

  if (loading && lessons.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }
    return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.isDark ? theme.colors.background : LIGHT_BG,
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: 12,
          right: -70,
          width: 230,
          height: 230,
          borderRadius: 999,
          backgroundColor: theme.isDark ? theme.colors.primarySoft : PRIMARY_SOFT,
          opacity: 0.95,
          transform: [{ scale: heroGlow }],
        }}
        pointerEvents="none"
      />
      <Animated.View
        style={{
          position: "absolute",
          bottom: 90,
          left: -70,
          width: 180,
          height: 180,
          borderRadius: 999,
          backgroundColor: theme.isDark ? theme.colors.violetSoft : VIOLET_SOFT,
          opacity: 0.85,
          transform: [{ scale: heroGlow }],
        }}
        pointerEvents="none"
      />

      <Animated.View
        style={{
          opacity: headerOpacity,
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          backgroundColor: theme.isDark
            ? "rgba(10,10,18,0.92)"
            : "rgba(246,243,238,0.96)",
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          paddingTop: Math.max(insets.top, 8),
          paddingBottom: 10,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <PressableScale
            onPress={() => navigation.navigate("Dashboard", { openDrawer: true })}
            style={{
              height: 44,
              width: 44,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceGlass,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={theme.colors.textMuted}
            />
          </PressableScale>

          <View style={{ flex: 1, paddingHorizontal: 12 }}>
            <Text style={theme.typography.label}>Library</Text>
            <Text
              style={[
                theme.typography.title,
                { marginTop: 3, fontSize: 18, lineHeight: 22 },
              ]}
            >
              Lessons
            </Text>
          </View>
        </View>

        {canManage ? (
          <PressableScale
            onPress={() => navigation.navigate("LessonForm")}
            style={{
              borderRadius: 14,
              backgroundColor: theme.isDark ? theme.colors.primary : PRIMARY,
              paddingHorizontal: 15,
              paddingVertical: 11,
              shadowColor: theme.isDark ? theme.colors.primary : PRIMARY,
              shadowOpacity: 0.22,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }}
          >
            <Text
              style={{
                color: theme.colors.primaryText,
                fontWeight: "900",
                fontSize: 12,
                letterSpacing: 0.8,
              }}
            >
              NEW
            </Text>
          </PressableScale>
        ) : null}
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: topBarHeight + 14,
          paddingHorizontal: 20,
          paddingBottom: 42,
        }}
      >
        <FadeInSection delay={20}>
          <View
            style={{
              marginBottom: 16,
              borderRadius: 26,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: theme.isDark ? theme.colors.border : PRIMARY_BORDER,
              backgroundColor: theme.isDark ? theme.colors.surface : CARD_BG,
            }}
          >
            <View
              style={{
                padding: 18,
                backgroundColor: theme.isDark ? theme.colors.surface : "#FFFFFF",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text
                    style={[
                      theme.typography.label,
                      { color: theme.isDark ? theme.colors.primary : PRIMARY },
                    ]}
                  >
                    Premium lesson workspace
                  </Text>
                  <Text
                    style={[
                      theme.typography.title,
                      { marginTop: 8, fontSize: 24, lineHeight: 30 },
                    ]}
                  >
                    Lesson Library
                  </Text>
                  <Text
                    style={[
                      theme.typography.body,
                      {
                        marginTop: 8,
                        color: theme.colors.textMuted,
                      },
                    ]}
                  >
                    Browse, filter, and manage your lesson catalog with a more
                    polished, app-like workflow.
                  </Text>
                </View>

                <View
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 20,
                    backgroundColor: theme.isDark ? theme.colors.primarySoft : PRIMARY_SOFT,
                    borderWidth: 1,
                    borderColor: theme.isDark ? theme.colors.primary : PRIMARY_BORDER,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="library-outline"
                    size={26}
                    color={theme.isDark ? theme.colors.primary : PRIMARY}
                  />
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  marginTop: 18,
                }}
              >
                <View
                  style={{
                    width: "48.5%",
                    borderRadius: 18,
                    backgroundColor: theme.isDark ? theme.colors.surfaceAlt : PRIMARY_SOFT,
                    borderWidth: 1,
                    borderColor: theme.isDark ? theme.colors.border : PRIMARY_BORDER,
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <Text
                    style={[
                      theme.typography.label,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Total in view
                  </Text>
                  <AnimatedCounter
                    value={totalLessonsCount}
                    textStyle={{
                      marginTop: 8,
                      fontSize: 24,
                      lineHeight: 28,
                      fontWeight: "900",
                      color: theme.colors.text,
                    }}
                  />
                </View>

                <View
                  style={{
                    width: "48.5%",
                    borderRadius: 18,
                    backgroundColor: theme.isDark ? theme.colors.surfaceAlt : VIOLET_SOFT,
                    borderWidth: 1,
                    borderColor: theme.isDark ? theme.colors.border : "#D8CDFD",
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <Text
                    style={[
                      theme.typography.label,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Filtered results
                  </Text>
                  <AnimatedCounter
                    value={visibleCount}
                    textStyle={{
                      marginTop: 8,
                      fontSize: 24,
                      lineHeight: 28,
                      fontWeight: "900",
                      color: theme.colors.text,
                    }}
                  />
                </View>

                <View
                  style={{
                    width: "48.5%",
                    borderRadius: 18,
                    backgroundColor: theme.isDark ? theme.colors.surfaceAlt : GOLD_SOFT,
                    borderWidth: 1,
                    borderColor: theme.isDark ? theme.colors.border : "#F4DB88",
                    padding: 14,
                  }}
                >
                  <Text
                    style={[
                      theme.typography.label,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    Languages
                  </Text>
                  <AnimatedCounter
                    value={languageOptions.length}
                    textStyle={{
                      marginTop: 8,
                      fontSize: 24,
                      lineHeight: 28,
                      fontWeight: "900",
                      color: theme.colors.text,
                    }}
                  />
                </View>

                <View
                  style={{
                    width: "48.5%",
                    borderRadius: 18,
                    backgroundColor: theme.isDark ? theme.colors.surfaceAlt : SUCCESS_SOFT,
                    borderWidth: 1,
                    borderColor: theme.isDark ? theme.colors.border : "#BEE0C6",
                    padding: 14,
                  }}
                >
                  <Text
                    style={[
                      theme.typography.label,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    In lesson packs
                  </Text>
                  <AnimatedCounter
                    value={packLinkedCount}
                    textStyle={{
                      marginTop: 8,
                      fontSize: 24,
                      lineHeight: 28,
                      fontWeight: "900",
                      color: theme.colors.text,
                    }}
                  />
                </View>
              </View>
            </View>
          </View>
        </FadeInSection>

        <FadeInSection delay={90}>
          <View
            style={{
              marginBottom: 16,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.isDark ? theme.colors.surface : CARD_BG,
              padding: 16,
            }}
          >
            <View
              style={{
                marginBottom: 14,
                flexDirection: "row",
                alignItems: "flex-end",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={theme.typography.label}>Find what you need</Text>
                <Text
                  style={[
                    theme.typography.title,
                    { marginTop: 6, fontSize: 18, lineHeight: 22 },
                  ]}
                >
                  Search and filters
                </Text>
                <Text
                  style={[
                    theme.typography.caption,
                    { marginTop: 4, color: theme.colors.textMuted },
                  ]}
                >
                  Quickly narrow your library with a cleaner, premium filter bar.
                </Text>
              </View>

              <View
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  backgroundColor: theme.isDark ? theme.colors.primarySoft : PRIMARY_SOFT,
                  borderWidth: 1,
                  borderColor: theme.isDark ? theme.colors.primary : PRIMARY_BORDER,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "900",
                    color: theme.isDark ? theme.colors.primary : PRIMARY,
                    letterSpacing: 0.4,
                  }}
                >
                  {visibleCount} RESULT{visibleCount === 1 ? "" : "S"}
                </Text>
              </View>
            </View>

            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: "#FFFFFF",
                paddingHorizontal: 14,
                paddingVertical: 4,
                marginBottom: 14,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Ionicons
                name="search-outline"
                size={18}
                color={theme.colors.textMuted}
              />
              <TextInput
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholder="Search lessons, descriptions, teachers, or packs..."
                placeholderTextColor={theme.colors.textMuted}
                style={{
                  flex: 1,
                  paddingHorizontal: 10,
                  paddingVertical: 11,
                  color: theme.colors.text,
                }}
              />
              {searchTerm ? (
                <TouchableOpacity onPress={() => setSearchTerm("")}>
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={theme.colors.textMuted}
                  />
                </TouchableOpacity>
              ) : null}
            </View>

            {isAdmin ? (
              <View style={{ marginBottom: 14 }}>
                <Text
                  style={[
                    theme.typography.caption,
                    {
                      marginBottom: 8,
                      textTransform: "uppercase",
                      color: theme.colors.textMuted,
                    },
                  ]}
                >
                  Teacher scope
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 4 }}
                >
                  <PressableScale
                    onPress={() => setTeacherView("mine")}
                    style={{
                      marginRight: 8,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor:
                        teacherView === "mine"
                          ? theme.isDark
                            ? theme.colors.primary
                            : PRIMARY_BORDER
                          : theme.colors.border,
                      backgroundColor:
                        teacherView === "mine"
                          ? theme.isDark
                            ? theme.colors.primarySoft
                            : PRIMARY_SOFT
                          : theme.colors.surfaceAlt,
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: "800",
                        fontSize: 12,
                        color: theme.colors.text,
                      }}
                    >
                      My lessons
                    </Text>
                  </PressableScale>

                  <PressableScale
                    onPress={() => setTeacherMenuOpen(true)}
                    style={{
                      marginRight: 8,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor:
                        viewingOtherTeacher
                          ? theme.isDark
                            ? theme.colors.primary
                            : PRIMARY_BORDER
                          : theme.colors.border,
                      backgroundColor:
                        viewingOtherTeacher
                          ? theme.isDark
                            ? theme.colors.primarySoft
                            : PRIMARY_SOFT
                          : theme.colors.surfaceAlt,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons
                      name="people-outline"
                      size={14}
                      color={theme.colors.text}
                    />
                    <Text
                      style={{
                        fontWeight: "800",
                        fontSize: 12,
                        color: theme.colors.text,
                        marginLeft: 6,
                      }}
                    >
                      {viewingOtherTeacher ? selectedTeacherLabel : "Other teacher"}
                    </Text>
                  </PressableScale>

                  {viewingOtherTeacher ? (
                    <TouchableOpacity
                      onPress={() => setTeacherView("mine")}
                      style={{ justifyContent: "center", paddingHorizontal: 8 }}
                    >
                      <Text
                        style={{
                          color: theme.colors.textMuted,
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        Clear
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </ScrollView>
              </View>
            ) : null}

            <View>
              <Text
                style={[
                  theme.typography.caption,
                  {
                    marginBottom: 8,
                    textTransform: "uppercase",
                    color: theme.colors.textMuted,
                  },
                ]}
              >
                Language
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: 4 }}
              >
                <PressableScale
                  onPress={() => setLanguageFilter("all")}
                  style={{
                    marginRight: 8,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor:
                      languageFilter === "all"
                        ? theme.isDark
                          ? theme.colors.primary
                          : PRIMARY_BORDER
                        : theme.colors.border,
                    backgroundColor:
                      languageFilter === "all"
                        ? theme.isDark
                          ? theme.colors.primarySoft
                          : PRIMARY_SOFT
                        : theme.colors.surfaceAlt,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 12,
                      color: theme.colors.text,
                    }}
                  >
                    All languages
                  </Text>
                </PressableScale>

                {languageOptions.map((language) => (
                  <PressableScale
                    key={language}
                    onPress={() => setLanguageFilter(language)}
                    style={{
                      marginRight: 8,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor:
                        languageFilter === language
                          ? theme.isDark
                            ? theme.colors.primary
                            : PRIMARY_BORDER
                          : theme.colors.border,
                      backgroundColor:
                        languageFilter === language
                          ? theme.isDark
                            ? theme.colors.primarySoft
                            : PRIMARY_SOFT
                          : theme.colors.surfaceAlt,
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: "800",
                        fontSize: 12,
                        color: theme.colors.text,
                      }}
                    >
                      {language}
                    </Text>
                  </PressableScale>
                ))}
              </ScrollView>
            </View>
          </View>
        </FadeInSection>

        <FadeInSection delay={160}>
          <View
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.isDark ? theme.colors.surface : CARD_BG,
              padding: 16,
            }}
          >
            {filtered.length === 0 ? (
              <View
                style={{
                  paddingVertical: 38,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 24,
                    backgroundColor: theme.isDark ? theme.colors.surfaceAlt : PRIMARY_SOFT,
                    borderWidth: 1,
                    borderColor: theme.isDark ? theme.colors.border : PRIMARY_BORDER,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="book-outline"
                    size={32}
                    color={theme.isDark ? theme.colors.primary : PRIMARY}
                  />
                </View>

                <Text
                  style={[
                    theme.typography.title,
                    { marginTop: 16, fontSize: 20, lineHeight: 24 },
                  ]}
                >
                  No lessons found
                </Text>
                <Text
                  style={[
                    theme.typography.body,
                    {
                      marginTop: 8,
                      color: theme.colors.textMuted,
                      textAlign: "center",
                      maxWidth: 280,
                    },
                  ]}
                >
                  Try adjusting your search or filters, or create a new lesson to
                  start building your library.
                </Text>

                {canManage ? (
                  <View style={{ flexDirection: "row", marginTop: 16 }}>
                    <PressableScale
                      onPress={() => navigation.navigate("LessonForm")}
                      style={{
                        marginRight: 10,
                        borderRadius: 14,
                        backgroundColor: theme.colors.primary,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.colors.primaryText,
                          fontWeight: "900",
                        }}
                      >
                        Create lesson
                      </Text>
                    </PressableScale>

                    <PressableScale
                      onPress={openWebNew}
                      style={{
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surface,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontWeight: "800",
                        }}
                      >
                        Open web
                      </Text>
                    </PressableScale>
                  </View>
                ) : null}
              </View>
            ) : (
              <>
                <View
                  style={{
                    marginBottom: 14,
                    borderRadius: 18,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View>
                    <Text
                      style={[
                        theme.typography.caption,
                        { color: theme.colors.textMuted, fontWeight: "700" },
                      ]}
                    >
                      Showing {pageStart + 1}-
                      {Math.min(pageStart + PAGE_SIZE, filtered.length)} of{" "}
                      {filtered.length}
                    </Text>
                    <Text
                      style={[
                        theme.typography.caption,
                        { color: theme.colors.textMuted, marginTop: 3 },
                      ]}
                    >
                      Scope: {selectedTeacherLabel}
                    </Text>
                  </View>

                  <View
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      backgroundColor: theme.isDark ? theme.colors.primarySoft : PRIMARY_SOFT,
                      borderWidth: 1,
                      borderColor: theme.isDark ? theme.colors.primary : PRIMARY_BORDER,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "900",
                        color: theme.isDark ? theme.colors.primary : PRIMARY,
                      }}
                    >
                      PAGE {safePage}/{totalPages}
                    </Text>
                  </View>
                </View>

                {pagedLessons.map((lesson, index) => {
                  const accent = getLessonAccent(index);
                  const languageBadge = getLanguageBadge(lesson.language);
                  const languageBadgeColors =
                    getLanguageBadgeColors(languageBadge);
                  const descriptionPreview = truncate(lesson.description, 112);
                  const packNames = lessonPackNames[lesson.id] ?? [];
                  const teacherName =
                    lesson.teachers?.name?.trim() ||
                    (lesson.created_by === currentUserId ? "You" : "");
                                      return (
                    <FadeInSection key={lesson.id} delay={210 + index * 55}>
                      <PressableScale
                        onPress={() =>
                          navigation.navigate("LessonForm", {
                            lessonId: lesson.id,
                          })
                        }
                        style={{
                          marginBottom: 12,
                          borderRadius: 24,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.isDark
                            ? theme.colors.surface
                            : "#FFFFFF",
                          overflow: "hidden",
                          shadowColor: accent.icon,
                          shadowOpacity: theme.isDark ? 0.08 : 0.16,
                          shadowRadius: 16,
                          shadowOffset: { width: 0, height: 8 },
                          elevation: 4,
                        }}
                      >
                        <View
                          style={{
                            height: 4,
                            backgroundColor: accent.icon,
                            opacity: 0.95,
                          }}
                        />

                        <View
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 14,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "flex-start",
                            }}
                          >
                            {lesson.cover_image_url?.trim() ? (
                              <Image
                                source={{ uri: lesson.cover_image_url.trim() }}
                                style={{
                                  width: 56,
                                  height: 56,
                                  borderRadius: 18,
                                  borderWidth: 1,
                                  borderColor: accent.border,
                                  marginRight: 12,
                                }}
                                resizeMode="cover"
                              />
                            ) : (
                              <View
                                style={{
                                  width: 56,
                                  height: 56,
                                  borderRadius: 18,
                                  borderWidth: 1,
                                  borderColor: accent.border,
                                  backgroundColor: accent.bg,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  marginRight: 12,
                                }}
                              >
                                <Ionicons
                                  name="book-outline"
                                  size={22}
                                  color={accent.icon}
                                />
                              </View>
                            )}

                            <View style={{ flex: 1, minWidth: 0 }}>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                }}
                              >
                                <Text
                                  style={{
                                    flex: 1,
                                    fontSize: 16,
                                    lineHeight: 20,
                                    fontWeight: "900",
                                    color: theme.colors.text,
                                    paddingRight: 10,
                                  }}
                                  numberOfLines={1}
                                >
                                  {lesson.title ?? "Untitled"}
                                </Text>

                                {languageBadge ? (
                                  <View
                                    style={{
                                      borderRadius: 999,
                                      borderWidth: 1,
                                      borderColor:
                                        languageBadgeColors.borderColor,
                                      backgroundColor:
                                        languageBadgeColors.backgroundColor,
                                      paddingHorizontal: 9,
                                      paddingVertical: 5,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        fontWeight: "900",
                                        color: languageBadgeColors.textColor,
                                        letterSpacing: 0.2,
                                      }}
                                    >
                                      {languageBadge}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>

                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  marginTop: 7,
                                }}
                              >
                                <View
                                  style={{
                                    borderRadius: 999,
                                    paddingHorizontal: 9,
                                    paddingVertical: 5,
                                    backgroundColor: accent.bg,
                                    borderWidth: 1,
                                    borderColor: accent.border,
                                    marginRight: 8,
                                    marginBottom: 6,
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 10,
                                      fontWeight: "800",
                                      color: accent.icon,
                                    }}
                                  >
                                    LESSON
                                  </Text>
                                </View>

                                {teacherName ? (
                                  <View
                                    style={{
                                      borderRadius: 999,
                                      paddingHorizontal: 9,
                                      paddingVertical: 5,
                                      backgroundColor: theme.isDark
                                        ? theme.colors.surfaceAlt
                                        : "#F7F7F8",
                                      borderWidth: 1,
                                      borderColor: theme.colors.border,
                                      marginRight: 8,
                                      marginBottom: 6,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        fontWeight: "800",
                                        color: theme.colors.textMuted,
                                      }}
                                    >
                                      {teacherName}
                                    </Text>
                                  </View>
                                ) : null}

                                {lesson.created_at ? (
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      color: theme.colors.textMuted,
                                      marginBottom: 6,
                                    }}
                                  >
                                    {formatDate(lesson.created_at)}
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          </View>

                          {descriptionPreview ? (
                            <Text
                              style={{
                                marginTop: 12,
                                fontSize: 13,
                                lineHeight: 19,
                                color: theme.colors.textMuted,
                              }}
                            >
                              {descriptionPreview}
                            </Text>
                          ) : null}

                          {packNames.length > 0 ? (
                            <View style={{ marginTop: 12 }}>
                              <Text
                                style={[
                                  theme.typography.caption,
                                  {
                                    marginBottom: 8,
                                    color: theme.colors.textMuted,
                                    textTransform: "uppercase",
                                  },
                                ]}
                              >
                                In lesson packs
                              </Text>

                              <View
                                style={{
                                  flexDirection: "row",
                                  flexWrap: "wrap",
                                }}
                              >
                                {packNames.slice(0, 3).map((pack) => (
                                  <View
                                    key={`${lesson.id}-${pack}`}
                                    style={{
                                      marginRight: 8,
                                      marginBottom: 8,
                                      borderRadius: 999,
                                      paddingHorizontal: 10,
                                      paddingVertical: 6,
                                      backgroundColor: theme.isDark
                                        ? theme.colors.surfaceAlt
                                        : GOLD_SOFT,
                                      borderWidth: 1,
                                      borderColor: theme.isDark
                                        ? theme.colors.border
                                        : "#F4DB88",
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 11,
                                        fontWeight: "800",
                                        color: theme.isDark
                                          ? theme.colors.text
                                          : "#9A7400",
                                      }}
                                    >
                                      {pack}
                                    </Text>
                                  </View>
                                ))}

                                {packNames.length > 3 ? (
                                  <View
                                    style={{
                                      marginRight: 8,
                                      marginBottom: 8,
                                      borderRadius: 999,
                                      paddingHorizontal: 10,
                                      paddingVertical: 6,
                                      backgroundColor: theme.colors.surfaceAlt,
                                      borderWidth: 1,
                                      borderColor: theme.colors.border,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 11,
                                        fontWeight: "800",
                                        color: theme.colors.textMuted,
                                      }}
                                    >
                                      +{packNames.length - 3} more
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          ) : null}

                          <View
                            style={{
                              marginTop: 14,
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                              }}
                            >
                              <Ionicons
                                name="sparkles-outline"
                                size={14}
                                color={accent.icon}
                              />
                              <Text
                                style={{
                                  marginLeft: 6,
                                  fontSize: 12,
                                  fontWeight: "800",
                                  color: accent.icon,
                                }}
                              >
                                Open lesson
                              </Text>
                            </View>

                            {canManage ? (
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                }}
                              >
                                <PressableScale
                                  onPress={() =>
                                    navigation.navigate("LessonForm", {
                                      lessonId: lesson.id,
                                    })
                                  }
                                  style={{
                                    marginRight: 8,
                                    minWidth: 68,
                                    borderRadius: 12,
                                    backgroundColor: theme.isDark
                                      ? theme.colors.primary
                                      : PRIMARY,
                                    paddingHorizontal: 14,
                                    paddingVertical: 10,
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontWeight: "900",
                                      color: theme.colors.primaryText,
                                    }}
                                  >
                                    Edit
                                  </Text>
                                </PressableScale>

                                <PressableScale
                                  onPress={() => openWebEdit(lesson.id)}
                                  style={{
                                    marginRight: 8,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: theme.colors.border,
                                    backgroundColor: theme.colors.surface,
                                    width: 40,
                                    height: 40,
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <Ionicons
                                    name="globe-outline"
                                    size={16}
                                    color={theme.colors.text}
                                  />
                                </PressableScale>

                                <PressableScale
                                  disabled={deleteLoadingId === lesson.id}
                                  onPress={() => deleteLesson(lesson)}
                                  style={{
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: theme.colors.danger,
                                    backgroundColor: theme.isDark
                                      ? "rgba(239,68,68,0.12)"
                                      : DANGER_SOFT,
                                    width: 40,
                                    height: 40,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    opacity:
                                      deleteLoadingId === lesson.id ? 0.6 : 1,
                                  }}
                                >
                                  {deleteLoadingId === lesson.id ? (
                                    <Text
                                      style={{
                                        fontSize: 11,
                                        fontWeight: "900",
                                        color: theme.colors.danger,
                                      }}
                                    >
                                      ...
                                    </Text>
                                  ) : (
                                    <Ionicons
                                      name="trash-outline"
                                      size={16}
                                      color={theme.colors.danger}
                                    />
                                  )}
                                </PressableScale>
                              </View>
                            ) : (
                              <Ionicons
                                name="chevron-forward"
                                size={18}
                                color={theme.colors.textMuted}
                              />
                            )}
                          </View>
                        </View>
                      </PressableScale>
                    </FadeInSection>
                  );
                })}

                {totalPages > 1 ? (
                  <View
                    style={{
                      marginTop: 8,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <PressableScale
                      onPress={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      style={{
                        paddingVertical: 11,
                        paddingHorizontal: 14,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surface,
                        opacity: safePage <= 1 ? 0.5 : 1,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons
                        name="chevron-back"
                        size={14}
                        color={theme.colors.text}
                      />
                      <Text
                        style={{
                          marginLeft: 6,
                          fontSize: 12,
                          fontWeight: "800",
                          color: theme.colors.text,
                        }}
                      >
                        Previous
                      </Text>
                    </PressableScale>

                    <View
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: theme.colors.surfaceAlt,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "800",
                          color: theme.colors.textMuted,
                        }}
                      >
                        {safePage} / {totalPages}
                      </Text>
                    </View>

                    <PressableScale
                      onPress={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={safePage >= totalPages}
                      style={{
                        paddingVertical: 11,
                        paddingHorizontal: 14,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surface,
                        opacity: safePage >= totalPages ? 0.5 : 1,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          marginRight: 6,
                          fontSize: 12,
                          fontWeight: "800",
                          color: theme.colors.text,
                        }}
                      >
                        Next
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={theme.colors.text}
                      />
                    </PressableScale>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </FadeInSection>
      </ScrollView>

      <Modal
        transparent
        visible={teacherMenuOpen}
        animationType="none"
        onRequestClose={() => setTeacherMenuOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: "center", padding: 20 }}>
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.34)",
              opacity: modalOpacity,
            }}
          >
            <Pressable
              style={{ flex: 1 }}
              onPress={() => setTeacherMenuOpen(false)}
            />
          </Animated.View>

          <Animated.View
            style={{
              opacity: modalOpacity,
              transform: [{ scale: modalScale }],
              borderRadius: 26,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              overflow: "hidden",
              maxHeight: 420,
            }}
          >
            <View
              style={{
                paddingHorizontal: 18,
                paddingTop: 18,
                paddingBottom: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={theme.typography.label}>Teacher filter</Text>
                <Text
                  style={[
                    theme.typography.title,
                    { marginTop: 6, fontSize: 18, lineHeight: 22 },
                  ]}
                >
                  Pick teacher
                </Text>
              </View>

              <PressableScale
                onPress={() => setTeacherMenuOpen(false)}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </PressableScale>
            </View>

            <ScrollView
              style={{ maxHeight: 320 }}
              contentContainerStyle={{ paddingVertical: 8 }}
            >
              {otherTeachers.length === 0 ? (
                <Text
                  style={{
                    paddingHorizontal: 18,
                    paddingVertical: 18,
                    color: theme.colors.textMuted,
                  }}
                >
                  No other teachers with lessons.
                </Text>
              ) : (
                otherTeachers.map((teacher, index) => (
                  <PressableScale
                    key={teacher.id}
                    onPress={() => {
                      setTeacherView(teacher.id);
                      setTeacherMenuOpen(false);
                    }}
                    style={{
                      marginHorizontal: 10,
                      marginBottom: index === otherTeachers.length - 1 ? 2 : 8,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceAlt,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 16,
                        backgroundColor: theme.isDark
                          ? theme.colors.primarySoft
                          : PRIMARY_SOFT,
                        borderWidth: 1,
                        borderColor: theme.isDark
                          ? theme.colors.primary
                          : PRIMARY_BORDER,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      <Ionicons
                        name="person-outline"
                        size={18}
                        color={theme.isDark ? theme.colors.primary : PRIMARY}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "800",
                          color: theme.colors.text,
                        }}
                      >
                        {teacher.name}
                      </Text>
                      <Text
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: theme.colors.textMuted,
                        }}
                      >
                        {teacher.count} lesson
                        {teacher.count === 1 ? "" : "s"}
                      </Text>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={theme.colors.textMuted}
                    />
                  </PressableScale>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}