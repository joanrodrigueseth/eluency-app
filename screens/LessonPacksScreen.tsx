import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GlassCard from "../components/GlassCard";
import AppButton from "../components/AppButton";
import { SkeletonBox } from "../components/SkeletonLoader";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";
import { coercePlanForRole } from "../lib/teacherRolePlanRules";
import {
  AccessType,
  CATEGORY_OPTIONS,
  CEFR_OPTIONS,
  getTeacherPackAction,
  LessonRow,
  PackCardType,
  PackStatus,
  PACK_LANGUAGES,
  slugifyTitle,
  TeacherPackAction,
} from "../lib/lessonPacksHelpers";

type RootStackParamList = {
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  LessonPacks: undefined;
};

type LessonPackLessonRow = { pack_id: string; lesson_id: string; sort_order: number | null };
type LessonPackRow = {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  category: string | null;
  category_icon?: string | null;
  cefr_level: string | null;
  access_type: AccessType | null;
  price_label: string | null;
  cover_image_url: string | null;
  is_featured: boolean | null;
  status: PackStatus | null;
  created_by: string | null;
  language: string | null;
  created_at?: string | null;
};

const apiBaseUrl =
  Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";

const NEW_PACK_CEFR = ["A1", "A1–A2", "A2", "A2–B1", "B1", "B1–B2", "B2", "C1"];

const ACCESS_OPTIONS: AccessType[] = ["free", "included", "paid"];
const SORT_OPTIONS = ["default", "alpha", "words"] as const;
type SortBy = (typeof SORT_OPTIONS)[number];

const EXCLUDED_LANGUAGE_FILTERS = new Set(["english", "en-fr"]);

const LANGUAGE_PILL_COLORS: Record<string, { inactive: { bg: string; text: string; border: string }; active: { bg: string; text: string; border: string } }> = {
  "Portuguese (BR)": { inactive: { bg: "rgba(34,197,94,0.10)", text: "#15803D", border: "rgba(34,197,94,0.30)" }, active: { bg: "#16A34A", text: "#fff", border: "#15803D" } },
  "Spanish":         { inactive: { bg: "rgba(239,68,68,0.10)", text: "#DC2626", border: "rgba(239,68,68,0.30)" }, active: { bg: "#DC2626", text: "#fff", border: "#B91C1C" } },
  "English":         { inactive: { bg: "rgba(59,130,246,0.10)", text: "#2563EB", border: "rgba(59,130,246,0.30)" }, active: { bg: "#2563EB", text: "#fff", border: "#1D4ED8" } },
  "French":          { inactive: { bg: "rgba(99,102,241,0.10)", text: "#4F46E5", border: "rgba(99,102,241,0.30)" }, active: { bg: "#4F46E5", text: "#fff", border: "#4338CA" } },
  "German":          { inactive: { bg: "rgba(245,158,11,0.10)", text: "#D97706", border: "rgba(245,158,11,0.30)" }, active: { bg: "#D97706", text: "#fff", border: "#B45309" } },
  "Italian":         { inactive: { bg: "rgba(16,185,129,0.10)", text: "#059669", border: "rgba(16,185,129,0.30)" }, active: { bg: "#059669", text: "#fff", border: "#047857" } },
  "Japanese":        { inactive: { bg: "rgba(244,63,94,0.10)", text: "#E11D48", border: "rgba(244,63,94,0.30)" }, active: { bg: "#E11D48", text: "#fff", border: "#BE123C" } },
  "Korean":          { inactive: { bg: "rgba(14,165,233,0.10)", text: "#0284C7", border: "rgba(14,165,233,0.30)" }, active: { bg: "#0284C7", text: "#fff", border: "#0369A1" } },
  "Chinese (Mandarin)": { inactive: { bg: "rgba(220,38,38,0.10)", text: "#B91C1C", border: "rgba(220,38,38,0.30)" }, active: { bg: "#B91C1C", text: "#fff", border: "#991B1B" } },
  "Arabic":          { inactive: { bg: "rgba(20,184,166,0.10)", text: "#0D9488", border: "rgba(20,184,166,0.30)" }, active: { bg: "#0D9488", text: "#fff", border: "#0F766E" } },
};

function normalizeLanguage(value?: string) {
  return (value || "")
    .toLowerCase()
    .replace(/[\s\u00A0]+/g, " ")
    .replace(/[^a-z0-9()\- ]+/g, "")
    .trim();
}

function matchLanguage(value?: string, filter?: string): boolean {
  const nv = normalizeLanguage(value);
  const nf = normalizeLanguage(filter);
  if (!nf || nf === "all") return true;
  if (!nv) return false;
  if (nv === nf) return true;
  return nv.includes(nf) || nf.includes(nv);
}

function accessPillStyle(
  theme: ReturnType<typeof useAppTheme>,
  access: AccessType
): { bg: string; text: string; border: string } {
  if (access === "free")
    return { bg: theme.colors.successSoft, text: theme.colors.success, border: theme.colors.success };
  if (access === "included")
    return { bg: "rgba(14,165,233,0.12)", text: "#0284C7", border: "rgba(14,165,233,0.35)" };
  return { bg: theme.colors.violetSoft, text: theme.colors.violet, border: theme.colors.borderStrong };
}

const CATEGORY_META: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; bg: string; text: string }
> = {
  "Foundations (Beginner Core)": { icon: "book-outline", bg: "rgba(245,158,11,0.14)", text: "#D97706" },
  "CEFR A2-C1": { icon: "trending-up-outline", bg: "rgba(99,102,241,0.14)", text: "#4F46E5" },
  "People & Daily Life": { icon: "people-outline", bg: "rgba(14,165,233,0.14)", text: "#0284C7" },
  "Home & Living": { icon: "home-outline", bg: "rgba(249,115,22,0.14)", text: "#EA580C" },
  "Food & Dining": { icon: "restaurant-outline", bg: "rgba(244,63,94,0.14)", text: "#E11D48" },
  "Work & Professional": { icon: "briefcase-outline", bg: "rgba(100,116,139,0.14)", text: "#475569" },
  Education: { icon: "school-outline", bg: "rgba(139,92,246,0.14)", text: "#7C3AED" },
  "Sports & Activities": { icon: "trophy-outline", bg: "rgba(234,179,8,0.14)", text: "#CA8A04" },
  Travel: { icon: "airplane-outline", bg: "rgba(6,182,212,0.14)", text: "#0891B2" },
  "Nature & Animals": { icon: "leaf-outline", bg: "rgba(34,197,94,0.14)", text: "#16A34A" },
  Technology: { icon: "hardware-chip-outline", bg: "rgba(59,130,246,0.14)", text: "#2563EB" },
  "Health & Safety": { icon: "heart-outline", bg: "rgba(239,68,68,0.14)", text: "#DC2626" },
};

async function uploadPackCoverFromUri(uri: string, mimeType?: string | null): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  if (blob.size > 2 * 1024 * 1024) throw new Error("Image must be under 2MB");
  const lower = uri.toLowerCase();
  const ext = lower.endsWith(".png") ? "png" : lower.endsWith(".webp") ? "webp" : lower.endsWith(".gif") ? "gif" : "jpg";
  const filePath = `pack-covers/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
  const { error } = await supabase.storage.from("lesson-assets").upload(filePath, blob, {
    contentType: mimeType || "image/jpeg",
  });
  if (error) throw error;
  const { data } = supabase.storage.from("lesson-assets").getPublicUrl(filePath);
  return data.publicUrl;
}

function Pill({
  children,
  colors,
}: {
  children: ReactNode;
  colors: { bg: string; text: string; border: string };
}) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: "800", color: colors.text, textTransform: "uppercase" }}>
        {children}
      </Text>
    </View>
  );
}

function getLessonWordCount(lesson: LessonRow) {
  return lesson.content_json?.words?.filter((word) => word.rowType !== "conjugation").length ?? 0;
}

function getLessonConjugationCount(lesson: LessonRow) {
  return lesson.content_json?.words?.filter((word) => word.rowType === "conjugation").length ?? 0;
}

function CollapsibleSection({
  label,
  count,
  addedCount,
  icon,
  iconBg,
  iconColor,
  canAddAll,
  onAddAll,
  defaultOpen,
  theme,
  children,
}: {
  label: string;
  count: number;
  addedCount?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  iconColor?: string;
  canAddAll?: boolean;
  onAddAll?: () => void;
  defaultOpen: boolean;
  theme: ReturnType<typeof useAppTheme>;
  children: (sortBy: SortBy) => ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [sortBy, setSortBy] = useState<SortBy>("default");
  const pct = count > 0 && typeof addedCount === "number" ? Math.round((addedCount / count) * 100) : 0;
  return (
    <View style={{ marginBottom: 26 }}>
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.85}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: open ? 10 : 8 }}
      >
        {icon ? (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: iconBg || theme.colors.primarySoft,
            }}
          >
            <Ionicons name={icon} size={15} color={iconColor || theme.colors.primary} />
          </View>
        ) : null}
        <Text
          style={[
            theme.typography.bodyStrong,
            { flex: 1, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: iconBg || theme.colors.primarySoft,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "800", color: iconColor || theme.colors.primary }}>{count}</Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={theme.colors.textMuted} />
      </TouchableOpacity>

      {open ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <View
            style={{
              flexDirection: "row",
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 10,
              padding: 2,
              backgroundColor: theme.colors.surfaceAlt,
            }}
          >
            {SORT_OPTIONS.map((value) => (
              <TouchableOpacity
                key={value}
                onPress={() => setSortBy(value)}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  borderRadius: 8,
                  backgroundColor: sortBy === value ? theme.colors.primary : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: "800",
                    color: sortBy === value ? theme.colors.primaryText : theme.colors.textMuted,
                  }}
                >
                  {value === "default" ? "DEF" : value === "alpha" ? "A-Z" : "WORDS"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {canAddAll && onAddAll ? (
            <TouchableOpacity
              onPress={onAddAll}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.colors.primary,
                backgroundColor: theme.colors.primarySoft,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.primary }}>ADD ALL</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {typeof addedCount === "number" && count > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <View
            style={{
              flex: 1,
              height: 6,
              borderRadius: 999,
              overflow: "hidden",
              backgroundColor: theme.colors.border,
            }}
          >
            <View
              style={{
                width: `${pct}%`,
                height: "100%",
                borderRadius: 999,
                backgroundColor: pct === 100 ? theme.colors.success : theme.colors.primary,
              }}
            />
          </View>
          <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.textMuted }}>
            {addedCount}/{count}
          </Text>
        </View>
      ) : null}

      {open ? children(sortBy) : null}
    </View>
  );
}

function LanguagePickerModal({
  visible,
  title,
  value,
  allowEmpty,
  onClose,
  onSelect,
  theme,
}: {
  visible: boolean;
  title: string;
  value: string;
  allowEmpty: boolean;
  onClose: () => void;
  onSelect: (lang: string) => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: 28,
              maxHeight: "70%",
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <Text style={theme.typography.title}>{title}</Text>
            </View>
            <FlatList
              data={allowEmpty ? ["", ...PACK_LANGUAGES] : PACK_LANGUAGES}
              keyExtractor={(item, i) => `${item}-${i}`}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    backgroundColor: value === item ? theme.colors.primarySoft : "transparent",
                  }}
                >
                  <Text style={[theme.typography.body, item === "" ? { color: theme.colors.textMuted } : {}]}>
                    {item === "" ? "— None —" : item}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export default function LessonPacksScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [currentUserId, setCurrentUserId] = useState("");
  const [currentRole, setCurrentRole] = useState("teacher");
  const [currentPlan, setCurrentPlan] = useState("Basic");
  const [currentName, setCurrentName] = useState("Teacher");

  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [packs, setPacks] = useState<PackCardType[]>([]);
  const [packLessonMap, setPackLessonMap] = useState<Record<string, string[]>>({});

  const [query, setQuery] = useState("");
  const [filterCefr, setFilterCefr] = useState("all");
  const [filterLanguage, setFilterLanguage] = useState("all");
  const [editModal, setEditModal] = useState<PackCardType | null>(null);
  const [viewLessonsPack, setViewLessonsPack] = useState<PackCardType | null>(null);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [installingPackId, setInstallingPackId] = useState<string | null>(null);
  const [installingLessonId, setInstallingLessonId] = useState<string | null>(null);
  const [viewingLesson, setViewingLesson] = useState<LessonRow | null>(null);
  const [sessionAddedCount, setSessionAddedCount] = useState(0);
  const [cefrPickerOpen, setCefrPickerOpen] = useState(false);

  const canManage = (currentRole ?? "").toLowerCase().trim() === "admin";

  const loadData = useCallback(async (showInitial: boolean) => {
    try {
      if (showInitial) setLoading(true);
      else setRefreshing(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Not logged in");

      setCurrentUserId(user.id);

      const { data: me, error: meError } = await (supabase.from("teachers") as any)
        .select("user_id, role, name, plan")
        .eq("user_id", user.id)
        .single();
      if (meError) throw meError;

      const normalizedRole = (me?.role ?? "teacher") as string;
      const normalizedPlan = coercePlanForRole(me?.role ?? "teacher", me?.plan ?? "Basic");
      setCurrentRole(normalizedRole);
      setCurrentPlan(normalizedPlan);
      setCurrentName(me?.name || "Teacher");

      let packsQuery = (supabase.from("lesson_packs") as any)
        .select(
          "id, title, slug, description, category, category_icon, cefr_level, access_type, price_label, cover_image_url, is_featured, status, created_by, created_at, language"
        )
        .order("created_at", { ascending: false });

      if ((me?.role ?? "").toLowerCase().trim() !== "admin") {
        packsQuery = packsQuery.eq("status", "published");
      }

      const lessonsQuery = (supabase.from("lessons") as any)
        .select("id, title, status, grade_range, language_level, language, created_by, cover_image_url, content_json")
        .order("created_at", { ascending: false });

      const [packsRes, lessonsRes, linksRes] = await Promise.all([
        packsQuery,
        lessonsQuery,
        (supabase.from("lesson_pack_lessons") as any)
          .select("pack_id, lesson_id, sort_order")
          .order("sort_order", { ascending: true }),
      ]);

      if (packsRes.error) throw packsRes.error;
      if (lessonsRes.error) throw lessonsRes.error;
      if (linksRes.error) throw linksRes.error;

      const lessonRows = (lessonsRes.data || []) as LessonRow[];
      const packRows = (packsRes.data || []) as LessonPackRow[];
      const linkRows = (linksRes.data || []) as LessonPackLessonRow[];

      const creatorIds = Array.from(
        new Set(packRows.map((r) => r.created_by).filter((id): id is string => Boolean(id)))
      );
      const creatorNameMap = new Map<string, string>();
      if (creatorIds.length > 0) {
        const { data: creatorRows } = await (supabase.from("teachers") as any)
          .select("user_id, name")
          .in("user_id", creatorIds);
        ((creatorRows || []) as { user_id: string; name: string | null }[]).forEach((t) => {
          creatorNameMap.set(t.user_id, t.name || "Unknown");
        });
      }

      const nextPackLessonMap: Record<string, string[]> = {};
      for (const row of linkRows) {
        if (!nextPackLessonMap[row.pack_id]) nextPackLessonMap[row.pack_id] = [];
        nextPackLessonMap[row.pack_id].push(row.lesson_id);
      }

      const lessonRowMap = new Map(lessonRows.map((lesson) => [lesson.id, lesson]));
      const nextPacks: PackCardType[] = packRows.map((row) => {
        const lessonIds = nextPackLessonMap[row.id] || [];
        let wordCount = 0;
        let conjugationCount = 0;

        for (const lessonId of lessonIds) {
          const lesson = lessonRowMap.get(lessonId);
          wordCount += lesson ? getLessonWordCount(lesson) : 0;
          conjugationCount += lesson ? getLessonConjugationCount(lesson) : 0;
        }

        return {
          id: row.id,
          title: row.title,
          description: row.description || "",
          lessonCount: lessonIds.length,
          wordCount,
          conjugationCount,
          cefrLevel: row.cefr_level || "",
          creator: creatorNameMap.get(row.created_by || "") || "Unknown",
          accessType: (row.access_type || "free") as AccessType,
          priceLabel: row.price_label || null,
          coverImageUrl: row.cover_image_url || null,
          isFeatured: !!row.is_featured,
          category: row.category || "",
          categoryIcon: row.category_icon || null,
          language: row.language || "",
          status: (row.status || "draft") as PackStatus,
        };
      });

      setLessons(lessonRows);
      setPacks(nextPacks);
      setPackLessonMap(nextPackLessonMap);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load packs";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  const lessonDetailMap = useMemo(() => new Map(lessons.map((l) => [l.id, l])), [lessons]);

  const filteredPacks = useMemo(() => {
    const queryLower = query.trim().toLowerCase();
    return packs
      .filter((pack) => {
        if (filterCefr !== "all" && pack.cefrLevel !== filterCefr) return false;
        if (filterLanguage !== "all") {
          const hasLanguageMatch = (packLessonMap[pack.id] || []).some((lessonId) => {
            const lesson = lessonDetailMap.get(lessonId);
            return matchLanguage(lesson?.language ?? undefined, filterLanguage);
          });
          if (!hasLanguageMatch) return false;
        }
        if (!queryLower) return true;

        const packMatches =
          pack.title.toLowerCase().includes(queryLower) ||
          pack.description.toLowerCase().includes(queryLower) ||
          pack.creator.toLowerCase().includes(queryLower);

        if (packMatches) return true;

        return (packLessonMap[pack.id] || []).some((lessonId) => {
          const lesson = lessonDetailMap.get(lessonId);
          return lesson?.title?.toLowerCase().includes(queryLower);
        });
      })
      .sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0));
  }, [filterCefr, filterLanguage, lessonDetailMap, packLessonMap, packs, query]);

  const myLessonTitles = useMemo(() => {
    return new Set(
      lessons.filter((l) => l.created_by === currentUserId).map((l) => l.title.toLowerCase().trim())
    );
  }, [lessons, currentUserId]);

  const addedPackIds = useMemo(() => {
    const result = new Set<string>();
    for (const pack of packs) {
      const lessonIds = packLessonMap[pack.id] || [];
      if (lessonIds.length === 0) continue;
      const packTitles = lessonIds
        .map((id) => lessonDetailMap.get(id)?.title.toLowerCase().trim())
        .filter((t): t is string => Boolean(t));
      if (packTitles.length > 0 && packTitles.every((t) => myLessonTitles.has(t))) {
        result.add(pack.id);
      }
    }
    return result;
  }, [packs, packLessonMap, lessonDetailMap, myLessonTitles]);

  const availableCefrLevels = useMemo(
    () => Array.from(new Set(packs.map((p) => p.cefrLevel).filter(Boolean))).sort(),
    [packs]
  );
  const availableLanguages = useMemo(() => {
    const raw = new Set(
      lessons
        .map((l) => l.language?.trim())
        .filter((lang): lang is string => Boolean(lang) && !EXCLUDED_LANGUAGE_FILTERS.has(normalizeLanguage(lang)))
    );
    // Preserve PACK_LANGUAGES canonical order, then append any extras
    const ordered: string[] = PACK_LANGUAGES.filter((lang) => raw.has(lang));
    const extras = Array.from(raw).filter((lang) => !PACK_LANGUAGES.includes(lang)).sort();
    return [...ordered, ...extras];
  }, [lessons]);
  const languageLessonCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const seen = new Set<string>();

    for (const pack of packs) {
      if (filterCefr !== "all" && pack.cefrLevel !== filterCefr) continue;
      const queryLower = query.trim().toLowerCase();
      if (queryLower) {
        const packMatches =
          pack.title.toLowerCase().includes(queryLower) ||
          pack.description.toLowerCase().includes(queryLower) ||
          pack.creator.toLowerCase().includes(queryLower);

        const lessonMatches = (packLessonMap[pack.id] || []).some((lessonId) => {
          const lesson = lessonDetailMap.get(lessonId);
          return lesson?.title?.toLowerCase().includes(queryLower);
        });

        if (!packMatches && !lessonMatches) continue;
      }

      for (const lessonId of packLessonMap[pack.id] || []) {
        const lesson = lessonDetailMap.get(lessonId);
        const language = lesson?.language?.trim();
        if (!lesson || !language) continue;
        const seenKey = `${language}::${lesson.id}`;
        if (seen.has(seenKey)) continue;
        seen.add(seenKey);
        counts.set(language, (counts.get(language) || 0) + 1);
      }
    }

    return counts;
  }, [filterCefr, lessonDetailMap, packLessonMap, packs, query]);
  const totalVisibleLessonCount = useMemo(
    () => Array.from(languageLessonCounts.values()).reduce((sum, count) => sum + count, 0),
    [languageLessonCounts]
  );

  const canAddLesson = useMemo(
    () => !["starter", "view-only"].includes(currentPlan.toLowerCase().trim()) || canManage,
    [canManage, currentPlan]
  );

  const getLessonsForPack = (packId: string): LessonRow[] => {
    const lessonIds = packLessonMap[packId] || [];
    return lessonIds
      .map((id) => lessonDetailMap.get(id))
      .filter((x): x is LessonRow => x !== null && x !== undefined);
  };

  const getCategoryLessons = useCallback(
    (packsForCategory: PackCardType[], sortBy: SortBy) => {
      const seen = new Set<string>();
      const collected: LessonRow[] = [];

      for (const pack of packsForCategory) {
        for (const lessonId of packLessonMap[pack.id] || []) {
          if (seen.has(lessonId)) continue;
          seen.add(lessonId);
          const lesson = lessonDetailMap.get(lessonId);
          if (lesson) collected.push(lesson);
        }
      }

      if (sortBy === "alpha") {
        return [...collected].sort((a, b) => a.title.localeCompare(b.title));
      }

      if (sortBy === "words") {
        return [...collected].sort((a, b) => getLessonWordCount(b) - getLessonWordCount(a));
      }

      return collected;
    },
    [lessonDetailMap, packLessonMap]
  );

  const duplicatePackLessonsToTeacher = async (pack: PackCardType) => {
    if (!currentUserId) {
      Alert.alert("Error", "Missing current user");
      return;
    }
    const lessonIds = packLessonMap[pack.id] || [];
    if (lessonIds.length === 0) {
      Alert.alert("Error", "This pack has no lessons");
      return;
    }
    setInstallingPackId(pack.id);
    try {
      const { data: originalLessons, error: lessonsError } = await (supabase.from("lessons") as any)
        .select("*")
        .in("id", lessonIds);
      if (lessonsError) throw lessonsError;
      if (!originalLessons || originalLessons.length === 0) throw new Error("No lessons found to duplicate");

      const sortIndex = new Map(lessonIds.map((id, index) => [id, index]));
      const orderedLessons = [...originalLessons].sort(
        (a: { id: string }, b: { id: string }) => (sortIndex.get(a.id) ?? 0) - (sortIndex.get(b.id) ?? 0)
      );

      const clonedRows = orderedLessons.map((lesson: Record<string, unknown>) => {
        const { id: _id, slug: _slug, teacher_id: _tid, created_at: _ca, updated_at: _ua, deleted_at: _da, ...rest } =
          lesson as Record<string, unknown> & { id: string; slug?: string };
        const titleStr = (lesson.title as string) ?? "Lesson";
        const baseSlug = slugifyTitle(titleStr) || "lesson-copy";
        const uniqueSlug = `${baseSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        return {
          ...rest,
          title: titleStr,
          slug: uniqueSlug,
          teacher_id: currentUserId,
          created_by: currentUserId,
          updated_by: currentUserId,
          status: "published",
        };
      });

      const { data: insertedLessons, error: insertError } = await (supabase.from("lessons") as any)
        .insert(clonedRows)
        .select("id");
      if (insertError) throw insertError;

      if (insertedLessons && insertedLessons.length > 0) {
        const packLessonRows = insertedLessons.map((l: { id: string }) => ({
          pack_id: pack.id,
          lesson_id: l.id,
        }));
        const { error: linkError } = await (supabase.from("lesson_pack_lessons") as any).insert(packLessonRows);
        if (linkError) console.warn("Failed to link lessons to pack:", linkError);
      }

      await loadData(false);
      const count = insertedLessons?.length || clonedRows.length;
      Alert.alert(
        "Added to your library",
        `${count} lesson${count === 1 ? "" : "s"} copied from this pack. Open Lessons on the web to edit them.`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to add lessons";
      Alert.alert("Error", msg);
    } finally {
      setInstallingPackId(null);
    }
  };

  const duplicateSingleLessonToTeacher = async (lesson: LessonRow) => {
    if (!currentUserId) {
      Alert.alert("Error", "Missing current user");
      return;
    }

    setInstallingLessonId(lesson.id);
    try {
      const { data: fullLesson, error: fetchError } = await (supabase.from("lessons") as any)
        .select("*")
        .eq("id", lesson.id)
        .single();

      if (fetchError) throw fetchError;

      const {
        id: _id,
        slug: _slug,
        teacher_id: _teacherId,
        created_at: _createdAt,
        updated_at: _updatedAt,
        deleted_at: _deletedAt,
        ...rest
      } = fullLesson as Record<string, unknown> & { title?: string };

      const titleStr = fullLesson.title ?? "Lesson";
      const baseSlug = slugifyTitle(titleStr) || "lesson-copy";
      const uniqueSlug = `${baseSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const { error: insertError } = await (supabase.from("lessons") as any).insert({
        ...rest,
        title: titleStr,
        slug: uniqueSlug,
        teacher_id: currentUserId,
        created_by: currentUserId,
        updated_by: currentUserId,
        status: "published",
      });

      if (insertError) throw insertError;

      await loadData(false);
      setSessionAddedCount((count) => count + 1);
      Alert.alert("Added", `"${lesson.title}" was added to your lessons.`);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to add lesson");
    } finally {
      setInstallingLessonId(null);
    }
  };

  const handleTeacherAction = async (pack: PackCardType, action: TeacherPackAction) => {
    if (action.kind === "upgrade") {
      const ok = await Linking.canOpenURL(action.href);
      if (ok) await Linking.openURL(action.href);
      else Alert.alert("Subscription", "Open your account on the web to manage your plan.");
      return;
    }
    if (action.kind === "checkout") {
      Alert.alert(
        "Paid packs",
        "Paid packs are coming soon. Contact support@eluency.com for early access."
      );
      return;
    }
    if (action.kind === "disabled") {
      Alert.alert("Unavailable", "This pack is unavailable for your account.");
      return;
    }
    await duplicatePackLessonsToTeacher(pack);
  };

  const clearFilters = () => {
    setFilterCefr("all");
    setFilterLanguage("all");
    setQuery("");
  };

  /** RN flexWrap+gap+fixed width is unreliable; real grid = two flex:1 columns. */
  const GRID_COLUMN_GAP = 10;
  const LIST_THUMB_SIZE = 56;

  const renderPackCard = (pack: PackCardType) => {
    const action = getTeacherPackAction(pack.accessType, currentRole, currentPlan, apiBaseUrl);
    const isAdded = addedPackIds.has(pack.id);
    const installing = installingPackId === pack.id;
    const acc = accessPillStyle(theme, pack.accessType);

    return (
      <View
        key={`grid-${pack.id}`}
        style={{
          width: "100%",
          marginBottom: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceAlt,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: 120,
            backgroundColor: pack.isFeatured ? "rgba(251,191,36,0.2)" : theme.colors.surfaceGlass,
            alignItems: "center",
            justifyContent: "center",
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          {pack.coverImageUrl ? (
            <Image
              key={pack.coverImageUrl}
              source={{ uri: pack.coverImageUrl }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          ) : (
            <Ionicons name="layers-outline" size={36} color={theme.colors.textMuted} style={{ opacity: 0.35 }} />
          )}
          {pack.isFeatured ? (
            <View style={{ position: "absolute", top: 8, left: 8 }}>
              <Pill colors={{ bg: "rgba(245,158,11,0.95)", text: "#fff", border: "#D97706" }}>Featured</Pill>
            </View>
          ) : null}
          <View style={{ position: "absolute", top: 8, right: 8 }}>
            <Pill colors={acc}>
              {pack.accessType}
              {pack.priceLabel ? ` ${pack.priceLabel}` : ""}
            </Pill>
          </View>
          {isAdded && !canManage ? (
            <View style={{ position: "absolute", bottom: 8, right: 8 }}>
              <Pill colors={{ bg: theme.colors.successSoft, text: theme.colors.success, border: theme.colors.success }}>
                Added
              </Pill>
            </View>
          ) : null}
        </View>
        <View style={{ padding: 10 }}>
          <Text style={[theme.typography.bodyStrong, { fontSize: 14 }]} numberOfLines={2}>
            {pack.title}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <Pill
              colors={
                pack.lessonCount === 0
                  ? { bg: "rgba(249,115,22,0.15)", text: "#EA580C", border: "rgba(249,115,22,0.35)" }
                  : { bg: "rgba(14,165,233,0.12)", text: "#0284C7", border: "rgba(14,165,233,0.35)" }
              }
            >
              {pack.lessonCount} lessons
            </Pill>
            {pack.cefrLevel ? (
              <Pill colors={{ bg: "rgba(14,165,233,0.12)", text: "#0284C7", border: "rgba(14,165,233,0.35)" }}>
                {pack.cefrLevel}
              </Pill>
            ) : null}
          </View>
          <Text style={[theme.typography.caption, { marginTop: 6, color: theme.colors.textMuted }]} numberOfLines={1}>
            {pack.creator}
            {pack.language ? ` · ${pack.language}` : ""}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => setViewLessonsPack(pack)}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.colors.border,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "800" }}>VIEW</Text>
            </TouchableOpacity>
            {canManage ? (
              <TouchableOpacity
                onPress={() => setEditModal(pack)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "800" }}>EDIT</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => handleTeacherAction(pack, action)}
                disabled={installing || action.kind === "disabled"}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: "center",
                  backgroundColor:
                    action.kind === "add"
                      ? theme.colors.primary
                      : action.kind === "upgrade"
                        ? "#0284C7"
                        : action.kind === "checkout"
                          ? "#7C3AED"
                          : theme.colors.border,
                  opacity: installing || action.kind === "disabled" ? 0.5 : 1,
                }}
              >
                {installing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ fontSize: 10, fontWeight: "800", color: "#fff" }} numberOfLines={2}>
                    {action.label}
                    {action.kind === "checkout" && pack.priceLabel ? ` · ${pack.priceLabel}` : ""}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderLessonCard = (lesson: LessonRow) => {
    const wordCount = getLessonWordCount(lesson);
    const conjCount = getLessonConjugationCount(lesson);
    const isAdded = myLessonTitles.has(lesson.title.toLowerCase().trim());
    const installing = installingLessonId === lesson.id;
    return (
      <View
        key={`lcard-${lesson.id}`}
        style={{
          width: "100%",
          marginBottom: 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceAlt,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: 80,
            backgroundColor: theme.colors.surfaceGlass,
            alignItems: "center",
            justifyContent: "center",
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          {lesson.cover_image_url ? (
            <Image source={{ uri: lesson.cover_image_url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <Ionicons name="document-text-outline" size={28} color={theme.colors.textMuted} style={{ opacity: 0.35 }} />
          )}
          {isAdded && !canManage ? (
            <View style={{ position: "absolute", top: 6, right: 6 }}>
              <Pill colors={{ bg: theme.colors.successSoft, text: theme.colors.success, border: theme.colors.success }}>Added</Pill>
            </View>
          ) : null}
        </View>
        <View style={{ padding: 10 }}>
          <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]} numberOfLines={2}>{lesson.title}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {wordCount > 0 ? (
              <Pill colors={{ bg: "rgba(14,165,233,0.12)", text: "#0284C7", border: "rgba(14,165,233,0.35)" }}>{wordCount}w</Pill>
            ) : null}
            {conjCount > 0 ? (
              <Pill colors={{ bg: "rgba(139,92,246,0.12)", text: "#7C3AED", border: "rgba(139,92,246,0.35)" }}>{conjCount}c</Pill>
            ) : null}
            {wordCount === 0 && conjCount === 0 ? (
              <Pill colors={{ bg: "rgba(249,115,22,0.12)", text: "#EA580C", border: "rgba(249,115,22,0.35)" }}>Empty</Pill>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => setViewingLesson(lesson)}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center" }}
            >
              <Text style={{ fontSize: 10, fontWeight: "800" }}>VIEW</Text>
            </TouchableOpacity>
            {canManage ? null : (
              <TouchableOpacity
                onPress={() => { if (!isAdded && canAddLesson) duplicateSingleLessonToTeacher(lesson); }}
                disabled={installing || isAdded || !canAddLesson}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center",
                  backgroundColor: isAdded ? theme.colors.successSoft : canAddLesson ? theme.colors.primary : theme.colors.border,
                  opacity: installing ? 0.5 : 1,
                }}
              >
                {installing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ fontSize: 10, fontWeight: "800", color: isAdded ? theme.colors.success : "#fff" }}>
                    {isAdded ? "ADDED" : canAddLesson ? "ADD" : "UPGRADE"}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderLessonListRow = (lesson: LessonRow) => {
    const wordCount = getLessonWordCount(lesson);
    const conjCount = getLessonConjugationCount(lesson);
    const isAdded = myLessonTitles.has(lesson.title.toLowerCase().trim());
    const installing = installingLessonId === lesson.id;
    return (
      <View
        key={`lrow-${lesson.id}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 10,
          paddingHorizontal: 12,
          marginBottom: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceAlt,
        }}
      >
        <TouchableOpacity
          onPress={() => setViewingLesson(lesson)}
          activeOpacity={0.85}
          style={{
            width: LIST_THUMB_SIZE,
            height: LIST_THUMB_SIZE,
            borderRadius: 10,
            overflow: "hidden",
            marginRight: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceGlass,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {lesson.cover_image_url ? (
            <Image source={{ uri: lesson.cover_image_url }} style={{ width: LIST_THUMB_SIZE, height: LIST_THUMB_SIZE }} resizeMode="cover" />
          ) : (
            <Ionicons name="document-text-outline" size={20} color={theme.colors.textMuted} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setViewingLesson(lesson)}
          activeOpacity={0.85}
          style={{ flex: 1, minWidth: 0, marginRight: 8 }}
        >
          <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]} numberOfLines={2}>{lesson.title}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            {wordCount > 0 ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{wordCount}w</Text>
            ) : null}
            {conjCount > 0 ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{conjCount}c</Text>
            ) : null}
            {isAdded && !canManage ? (
              <Pill colors={{ bg: theme.colors.successSoft, text: theme.colors.success, border: theme.colors.success }}>Added</Pill>
            ) : null}
          </View>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => setViewingLesson(lesson)}
            style={{ padding: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border }}
          >
            <Ionicons name="eye-outline" size={16} color={theme.colors.primary} />
          </TouchableOpacity>
          {canManage ? null : (
            <TouchableOpacity
              onPress={() => { if (!isAdded && canAddLesson) duplicateSingleLessonToTeacher(lesson); }}
              disabled={installing || isAdded || !canAddLesson}
              style={{
                paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
                backgroundColor: isAdded ? theme.colors.successSoft : canAddLesson ? theme.colors.primary : theme.colors.border,
                opacity: installing ? 0.5 : 1,
              }}
            >
              {installing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ fontSize: 10, fontWeight: "800", color: isAdded ? theme.colors.success : "#fff" }}>
                  {isAdded ? "ADDED" : canAddLesson ? "ADD" : "UP"}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderTwoColumnLessonGrid = (lessons: LessonRow[]) => {
    const left = lessons.filter((_, i) => i % 2 === 0);
    const right = lessons.filter((_, i) => i % 2 === 1);
    const half = GRID_COLUMN_GAP / 2;
    return (
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0, paddingRight: half }}>{left.map((l) => renderLessonCard(l))}</View>
        <View style={{ flex: 1, minWidth: 0, paddingLeft: half }}>{right.map((l) => renderLessonCard(l))}</View>
      </View>
    );
  };

  const renderCategorySections = () => {
    const allCategories = [...CATEGORY_OPTIONS, "Other"];
    return (
      <View>
        {allCategories.map((cat, idx) => {
          const packsForCat = cat === "Other"
            ? filteredPacks.filter((p) => !CATEGORY_OPTIONS.includes(p.category))
            : filteredPacks.filter((p) => p.category === cat);
          if (packsForCat.length === 0) return null;
          const meta = CATEGORY_META[cat];
          const catAllLessons = getCategoryLessons(packsForCat, "default");
          const catAddedCount = catAllLessons.filter((l) => myLessonTitles.has(l.title.toLowerCase().trim())).length;
          const unadded = catAllLessons.filter((l) => !myLessonTitles.has(l.title.toLowerCase().trim()));
          return (
            <CollapsibleSection
              key={cat}
              label={cat}
              count={catAllLessons.length}
              addedCount={!canManage ? catAddedCount : undefined}
              icon={meta?.icon}
              iconBg={meta?.bg}
              iconColor={meta?.text}
              canAddAll={!canManage && canAddLesson && unadded.length > 0}
              onAddAll={() => unadded.forEach((l) => duplicateSingleLessonToTeacher(l))}
              defaultOpen={idx === 0}
              theme={theme}
            >
              {(sortBy) => {
                const catLessons = getCategoryLessons(packsForCat, sortBy);
                if (catLessons.length === 0) return (
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 12 }]}>No lessons yet.</Text>
                );
                return <View>{catLessons.map((l) => renderLessonListRow(l))}</View>;
              }}
            </CollapsibleSection>
          );
        })}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: Math.max(insets.top, 8), paddingHorizontal: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
          <SkeletonBox width={44} height={44} radius={12} />
          <View style={{ flex: 1, paddingHorizontal: 10, gap: 8 }}>
            <SkeletonBox width="28%" height={12} radius={6} />
            <SkeletonBox width="42%" height={18} radius={9} />
          </View>
          <SkeletonBox width={62} height={38} radius={12} />
        </View>
        <GlassCard style={{ borderRadius: 18, marginBottom: 14 }} padding={16}>
          <View style={{ gap: 14 }}>
            <SkeletonBox width="44%" height={16} radius={8} />
            <SkeletonBox width="100%" height={44} radius={14} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <SkeletonBox width="32%" height={34} radius={999} style={{ flex: 1 }} />
              <SkeletonBox width="32%" height={34} radius={999} style={{ flex: 1 }} />
              <SkeletonBox width="32%" height={34} radius={999} style={{ flex: 1 }} />
            </View>
          </View>
        </GlassCard>
        <View style={{ gap: 12 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <GlassCard key={index} style={{ borderRadius: 18 }} padding={16}>
              <View style={{ flexDirection: "row", gap: 14 }}>
                <SkeletonBox width={72} height={88} radius={16} />
                <View style={{ flex: 1, gap: 10 }}>
                  <SkeletonBox width="62%" height={16} radius={8} />
                  <SkeletonBox width="88%" height={12} radius={6} />
                  <SkeletonBox width="74%" height={12} radius={6} />
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                    <SkeletonBox width={72} height={24} radius={999} />
                    <SkeletonBox width={92} height={24} radius={999} />
                  </View>
                </View>
              </View>
            </GlassCard>
          ))}
        </View>
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
          activeOpacity={0.85}
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
          <Text style={[theme.typography.title, { marginTop: 2, fontSize: 18, lineHeight: 22 }]}>Lesson Browser</Text>
        </View>
        {canManage ? (
          <TouchableOpacity
            onPress={() => setNewModalOpen(true)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: theme.colors.primary,
            }}
          >
            <Text style={{ color: theme.colors.primaryText, fontWeight: "800", fontSize: 12 }}>NEW</Text>
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
        {refreshing ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={theme.typography.caption}>Refreshing…</Text>
          </View>
        ) : null}

        <GlassCard style={{ borderRadius: 16, marginBottom: 16 }} padding={16}>
          <Text style={[theme.typography.title, { fontSize: 22 }]}>Lesson Browser</Text>
          <Text style={[theme.typography.body, { marginTop: 8, color: theme.colors.textMuted }]}>
            {canManage
              ? `Welcome back, ${currentName}. You can create and manage lesson categories.`
              : `Welcome back, ${currentName}. Browse published lessons and add those available on your plan.`}
          </Text>
          {!canManage ? (
            <View style={{ marginTop: 10 }}>
              <Pill colors={accessPillStyle(theme, "included")}>Plan: {currentPlan}</Pill>
            </View>
          ) : null}
          <TouchableOpacity onPress={() => loadData(false)} style={{ marginTop: 14, alignSelf: "flex-start" }}>
            <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Refresh</Text>
          </TouchableOpacity>
        </GlassCard>

        <GlassCard style={{ borderRadius: 16 }} padding={16}>
          <View style={{ marginBottom: 14 }}>
            <Text style={[theme.typography.title, { fontSize: 18 }]}>Available Packs</Text>
            <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted }]}>
              Browse lessons by category and add the ones you want to your library.
            </Text>
          </View>

          {/* Language pills — colored per language, web-matching */}
          <Text style={[theme.typography.caption, { marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }]}>
            What language are you teaching?
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            {/* "All" pill */}
            <TouchableOpacity
              key="all"
              onPress={() => setFilterLanguage("all")}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                marginRight: 8,
                borderWidth: 1,
                borderColor: filterLanguage === "all" ? theme.colors.primary : theme.colors.border,
                backgroundColor: filterLanguage === "all" ? theme.colors.primarySoft : theme.colors.surfaceAlt,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: filterLanguage === "all" ? theme.colors.primary : theme.colors.text }}>
                All ({totalVisibleLessonCount})
              </Text>
            </TouchableOpacity>

            {availableLanguages.map((lang) => {
              const colors = LANGUAGE_PILL_COLORS[lang];
              const isActive = filterLanguage === lang;
              const count = languageLessonCounts.get(lang) || 0;
              const bg = isActive ? (colors?.active.bg ?? theme.colors.primary) : (colors?.inactive.bg ?? theme.colors.surfaceAlt);
              const text = isActive ? (colors?.active.text ?? "#fff") : (colors?.inactive.text ?? theme.colors.text);
              const border = isActive ? (colors?.active.border ?? theme.colors.primary) : (colors?.inactive.border ?? theme.colors.border);
              return (
                <TouchableOpacity
                  key={lang}
                  onPress={() => setFilterLanguage(lang)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 10,
                    marginRight: 8,
                    borderWidth: 1,
                    borderColor: border,
                    backgroundColor: bg,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: text }}>
                    {lang} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search lessons, categories, creators..."
            placeholderTextColor={theme.colors.textMuted}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 12,
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceAlt,
            }}
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => setCefrPickerOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: filterCefr !== "all" ? theme.colors.primary : theme.colors.border,
                backgroundColor: filterCefr !== "all" ? theme.colors.primarySoft : theme.colors.surfaceAlt,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: "800" }}>
                {filterCefr === "all" ? "LEVEL" : filterCefr}
              </Text>
              <Ionicons name="chevron-down" size={12} color={filterCefr !== "all" ? theme.colors.primary : theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          {(filterCefr !== "all" || filterLanguage !== "all" || query.length > 0) && (
            <TouchableOpacity onPress={clearFilters} style={{ marginBottom: 16 }}>
              <Text style={{ color: theme.colors.danger, fontWeight: "700", fontSize: 12 }}>Clear filters</Text>
            </TouchableOpacity>
          )}

          {filteredPacks.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <Ionicons name="layers-outline" size={48} color={theme.colors.textMuted} style={{ opacity: 0.25 }} />
              <Text style={[theme.typography.caption, { marginTop: 12, textTransform: "uppercase" }]}>
                {packs.length === 0 ? "No lessons yet" : "No lessons match your filters"}
              </Text>
              {packs.length === 0 && canManage ? (
                <View style={{ marginTop: 16, alignSelf: "stretch" }}>
                  <AppButton label="Create first pack" onPress={() => setNewModalOpen(true)} />
                </View>
              ) : null}
              {packs.length > 0 ? (
                <TouchableOpacity onPress={clearFilters} style={{ marginTop: 12 }}>
                  <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Clear filters</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View style={{ width: "100%" }}>
              {renderCategorySections()}
            </View>
          )}
        </GlassCard>
      </ScrollView>

      {/* CEFR picker modal */}
      <Modal visible={cefrPickerOpen} animationType="slide" transparent onRequestClose={() => setCefrPickerOpen(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setCefrPickerOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28, borderWidth: 1, borderColor: theme.colors.border }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                <Text style={theme.typography.title}>Filter by CEFR Level</Text>
              </View>
              <FlatList
                data={["all", ...availableCefrLevels]}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => { setFilterCefr(item); setCefrPickerOpen(false); }}
                    style={{ paddingVertical: 14, paddingHorizontal: 20, backgroundColor: filterCefr === item ? theme.colors.primarySoft : "transparent" }}
                  >
                    <Text style={[theme.typography.body, item === "all" ? { color: theme.colors.textMuted } : {}]}>
                      {item === "all" ? "— All Levels —" : item}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Lesson words modal */}
      {viewingLesson ? (
        <Modal visible animationType="slide" onRequestClose={() => setViewingLesson(null)}>
          <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: 48 }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 12 }}>
              <TouchableOpacity onPress={() => setViewingLesson(null)} style={{ padding: 8 }}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={theme.typography.caption}>Lesson preview</Text>
                <Text style={theme.typography.title} numberOfLines={1}>{viewingLesson.title}</Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
              {(() => {
                const words = viewingLesson.content_json?.words?.filter((w) => w.rowType !== "conjugation") ?? [];
                const conjs = viewingLesson.content_json?.words?.filter((w) => w.rowType === "conjugation") ?? [];
                return (
                  <>
                    {words.length > 0 ? (
                      <View style={{ marginBottom: 20 }}>
                        <Text style={[theme.typography.bodyStrong, { marginBottom: 10, textTransform: "uppercase", fontSize: 11, letterSpacing: 1 }]}>
                          Vocabulary · {words.length}
                        </Text>
                        {words.map((w, i) => (
                          <View key={i} style={{ flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                            <Text style={[theme.typography.body, { flex: 1 }]}>{w.term_a || w.pt || w.en || ""}</Text>
                            <Text style={[theme.typography.body, { flex: 1, color: theme.colors.textMuted }]}>{w.term_b || w.en || ""}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {conjs.length > 0 ? (
                      <View>
                        <Text style={[theme.typography.bodyStrong, { marginBottom: 10, textTransform: "uppercase", fontSize: 11, letterSpacing: 1 }]}>
                          Conjugations · {conjs.length}
                        </Text>
                        {conjs.map((c, ci) => (
                          <View key={ci} style={{ marginBottom: 16 }}>
                            <Text style={[theme.typography.bodyStrong, { marginBottom: 6 }]}>{c.infinitive || ""}</Text>
                            {(c.conjugations || []).map((pair, pi) => (
                              <View key={pi} style={{ flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                                <Text style={[theme.typography.caption, { width: 80, color: theme.colors.textMuted }]}>{pair.pronoun}</Text>
                                <Text style={theme.typography.body}>{pair.form_a}{pair.form_b ? ` / ${pair.form_b}` : ""}</Text>
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {words.length === 0 && conjs.length === 0 ? (
                      <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>No content in this lesson yet.</Text>
                    ) : null}
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </Modal>
      ) : null}

      {/* Session footer */}
      {sessionAddedCount > 0 && !canManage ? (
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: Math.max(insets.bottom, 16), paddingTop: 12, paddingHorizontal: 20, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[theme.typography.bodyStrong, { fontSize: 13 }]}>
                {sessionAddedCount} lesson{sessionAddedCount !== 1 ? "s" : ""} added this session
              </Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>Open Lessons on the web to edit them.</Text>
            </View>
            <TouchableOpacity onPress={() => setSessionAddedCount(0)} style={{ padding: 8 }}>
              <Ionicons name="close" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <ViewLessonsModal
        visible={!!viewLessonsPack}
        pack={viewLessonsPack}
        lessons={viewLessonsPack ? getLessonsForPack(viewLessonsPack.id) : []}
        onClose={() => setViewLessonsPack(null)}
        theme={theme}
      />

      {editModal && currentUserId && canManage ? (
        <EditPackModal
          pack={editModal}
          lessons={lessons}
          initialLessonIds={packLessonMap[editModal.id] || []}
          currentUserId={currentUserId}
          onClose={() => setEditModal(null)}
          onSaved={() => loadData(false)}
          theme={theme}
        />
      ) : null}

      {newModalOpen && currentUserId && canManage ? (
        <NewPackModal
          lessons={lessons}
          currentUserId={currentUserId}
          onClose={() => setNewModalOpen(false)}
          onSaved={() => loadData(false)}
          theme={theme}
        />
      ) : null}
    </View>
  );
}

function ViewLessonsModal({
  visible,
  pack,
  lessons,
  onClose,
  theme,
}: {
  visible: boolean;
  pack: PackCardType | null;
  lessons: LessonRow[];
  onClose: () => void;
  theme: ReturnType<typeof useAppTheme>;
}) {
  if (!pack) return null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: 48 }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 12 }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={theme.typography.caption}>Pack lessons</Text>
            <Text style={theme.typography.title}>{pack.title}</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          {lessons.length === 0 ? (
            <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>No lessons in this pack.</Text>
          ) : (
            lessons.map((lesson, index) => {
              const words = lesson.content_json?.words?.filter((w) => w.rowType !== "conjugation") ?? [];
              const conjs = lesson.content_json?.words?.filter((w) => w.rowType === "conjugation") ?? [];
              return (
                <View
                  key={lesson.id}
                  style={{
                    padding: 14,
                    marginBottom: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceAlt,
                  }}
                >
                  <View style={{ flexDirection: "row", gap: 12, marginBottom: 8 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontWeight: "800", fontSize: 12, color: theme.colors.primary }}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={theme.typography.bodyStrong}>{lesson.title}</Text>
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                        {words.length > 0 ? (
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                            {words.length} word{words.length !== 1 ? "s" : ""}
                          </Text>
                        ) : null}
                        {conjs.length > 0 ? (
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                            {conjs.length} conjugation{conjs.length !== 1 ? "s" : ""}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  {words.length > 0 ? (
                    <View style={{ gap: 4, marginBottom: conjs.length > 0 ? 8 : 0 }}>
                      {words.map((w, wi) => (
                        <View key={wi} style={{ flexDirection: "row", gap: 8 }}>
                          <Text style={[theme.typography.caption, { color: theme.colors.primary, width: 18 }]}>{wi + 1}.</Text>
                          <Text style={[theme.typography.caption, { flex: 1 }]}>
                            {w.term_a || w.pt || w.en || ""}{(w.term_b || w.en) && (w.term_a || w.pt) ? ` — ${w.term_b || w.en}` : ""}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {conjs.length > 0 ? (
                    <View style={{ gap: 4 }}>
                      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 2 }]}>
                        Conjugations: {lesson.content_json?.words?.find((w) => w.rowType === "conjugation")?.infinitive || ""}
                      </Text>
                      {conjs.map((c, ci) =>
                        (c.conjugations || []).map((pair, pi) => (
                          <View key={`${ci}-${pi}`} style={{ flexDirection: "row", gap: 8 }}>
                            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, width: 60 }]}>{pair.pronoun}</Text>
                            <Text style={theme.typography.caption}>{pair.form_a}{pair.form_b ? ` / ${pair.form_b}` : ""}</Text>
                          </View>
                        ))
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function EditPackModal({
  pack,
  lessons,
  initialLessonIds,
  currentUserId,
  onClose,
  onSaved,
  theme,
}: {
  pack: PackCardType;
  lessons: LessonRow[];
  initialLessonIds: string[];
  currentUserId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  theme: ReturnType<typeof useAppTheme>;
}) {
  const [title, setTitle] = useState(pack.title);
  const [description, setDescription] = useState(pack.description || "");
  const [cefrLevel, setCefrLevel] = useState(pack.cefrLevel || "");
  const [accessType, setAccessType] = useState<AccessType>(pack.accessType);
  const [priceLabel, setPriceLabel] = useState(pack.priceLabel || "");
  const [isFeatured, setIsFeatured] = useState(pack.isFeatured);
  const [status, setStatus] = useState<PackStatus>(pack.status);
  const [coverImageUrl, setCoverImageUrl] = useState(pack.coverImageUrl || "");
  const [selected, setSelected] = useState<Set<string>>(new Set(initialLessonIds));
  const [lessonQuery, setLessonQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [language, setLanguage] = useState(pack.language || "");
  const [langModal, setLangModal] = useState(false);

  const levels = useMemo(() => {
    const unique = Array.from(
      new Set(lessons.map((l) => l.language_level).filter((v): v is string => Boolean(v)))
    );
    return ["all", ...unique];
  }, [lessons]);

  const filteredLessons = useMemo(() => {
    return lessons.filter(
      (l) =>
        l.title.toLowerCase().includes(lessonQuery.toLowerCase()) &&
        (level === "all" || l.language_level === level)
    );
  }, [lessons, lessonQuery, level]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pickCover = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission", "Allow photo library access to upload a cover.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize != null && asset.fileSize > 2 * 1024 * 1024) {
      Alert.alert("Too large", "Image must be under 2MB");
      return;
    }
    setCoverUploading(true);
    try {
      const url = await uploadPackCoverFromUri(asset.uri, asset.mimeType);
      setCoverImageUrl(url);
    } catch (e: unknown) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setCoverUploading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Validation", "Pack title is required");
      return;
    }
    setSaving(true);
    try {
      const slug = slugifyTitle(title.trim()) || null;
      const { error: updateError } = await (supabase.from("lesson_packs") as any)
        .update({
          title: title.trim(),
          slug,
          description: description.trim() || null,
          cefr_level: cefrLevel || null,
          access_type: accessType,
          price_label: accessType === "paid" ? priceLabel.trim() || null : null,
          is_featured: isFeatured,
          status,
          cover_image_url: coverImageUrl.trim() || null,
          language: language || null,
          updated_by: currentUserId,
        })
        .eq("id", pack.id);
      if (updateError) throw updateError;

      const orderedLessonIds = Array.from(selected);
      const { error: deleteLinksError } = await (supabase.from("lesson_pack_lessons") as any)
        .delete()
        .eq("pack_id", pack.id);
      if (deleteLinksError) throw deleteLinksError;

      if (orderedLessonIds.length > 0) {
        const rows = orderedLessonIds.map((lessonId, index) => ({
          pack_id: pack.id,
          lesson_id: lessonId,
          sort_order: index,
        }));
        const { error: insertError } = await (supabase.from("lesson_pack_lessons") as any).insert(rows);
        if (insertError) throw insertError;
      }

      await onSaved();
      Alert.alert("Saved", "Pack updated.");
      onClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update pack");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error: deleteLinksError } = await (supabase.from("lesson_pack_lessons") as any)
        .delete()
        .eq("pack_id", pack.id);
      if (deleteLinksError) throw deleteLinksError;
      const { error: deletePackError } = await (supabase.from("lesson_packs") as any).delete().eq("id", pack.id);
      if (deletePackError) throw deletePackError;
      await onSaved();
      Alert.alert("Deleted", "Pack removed.");
      onClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete pack");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 48,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Close</Text>
          </TouchableOpacity>
          <Text style={[theme.typography.title, { flex: 1, textAlign: "center" }]}>Edit pack</Text>
          <View style={{ width: 48 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          <Text style={theme.typography.caption}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 12,
              padding: 12,
              marginTop: 6,
              marginBottom: 14,
              color: theme.colors.text,
            }}
          />
          <Text style={theme.typography.caption}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 12,
              padding: 12,
              marginTop: 6,
              marginBottom: 14,
              minHeight: 80,
              color: theme.colors.text,
            }}
          />
          <Text style={theme.typography.caption}>Language</Text>
          <TouchableOpacity
            onPress={() => setLangModal(true)}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 12,
              padding: 14,
              marginTop: 6,
              marginBottom: 14,
            }}
          >
            <Text>{language || "Select language…"}</Text>
          </TouchableOpacity>
          <LanguagePickerModal
            visible={langModal}
            title="Pack language"
            value={language}
            allowEmpty
            onClose={() => setLangModal(false)}
            onSelect={setLanguage}
            theme={theme}
          />

          <Text style={theme.typography.caption}>CEFR</Text>
          <ScrollView horizontal style={{ marginTop: 8, marginBottom: 14 }} showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              onPress={() => setCefrLevel("")}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginRight: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: cefrLevel === "" ? theme.colors.primary : theme.colors.border,
                backgroundColor: cefrLevel === "" ? theme.colors.primarySoft : theme.colors.surfaceAlt,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "700" }}>None</Text>
            </TouchableOpacity>
            {CEFR_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o}
                onPress={() => setCefrLevel(o)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginRight: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: cefrLevel === o ? theme.colors.primary : theme.colors.border,
                  backgroundColor: cefrLevel === o ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "700" }}>{o}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={theme.typography.caption}>Status</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 14 }}>
            {(["draft", "published"] as PackStatus[]).map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setStatus(s)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: status === s ? theme.colors.primary : theme.colors.border,
                  backgroundColor: status === s ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                }}
              >
                <Text style={{ fontWeight: "800", textAlign: "center", textTransform: "uppercase", fontSize: 11 }}>
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={theme.typography.caption}>Access</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 14 }}>
            {ACCESS_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o}
                onPress={() => setAccessType(o)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: accessType === o ? theme.colors.primary : theme.colors.border,
                  backgroundColor: accessType === o ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                }}
              >
                <Text style={{ fontWeight: "800", fontSize: 11, textTransform: "uppercase" }}>{o}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {accessType === "paid" ? (
            <>
              <Text style={theme.typography.caption}>Price label</Text>
              <TextInput
                value={priceLabel}
                onChangeText={setPriceLabel}
                placeholder="$4.99"
                placeholderTextColor={theme.colors.textMuted}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 12,
                  padding: 12,
                  marginTop: 6,
                  marginBottom: 14,
                  maxWidth: 200,
                  color: theme.colors.text,
                }}
              />
            </>
          ) : null}

          <TouchableOpacity
            onPress={() => setIsFeatured((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}
          >
            <Ionicons name={isFeatured ? "checkbox" : "square-outline"} size={24} color={theme.colors.primary} />
            <Text style={theme.typography.bodyStrong}>Featured</Text>
          </TouchableOpacity>

          <Text style={theme.typography.caption}>Cover</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={pickCover}
              disabled={coverUploading || saving}
              style={{
                width: 88,
                height: 88,
                borderRadius: 16,
                borderWidth: 2,
                borderStyle: "dashed",
                borderColor: theme.colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {coverUploading ? (
                <ActivityIndicator />
              ) : coverImageUrl ? (
                <Image source={{ uri: coverImageUrl }} style={{ width: "100%", height: "100%", borderRadius: 14 }} />
              ) : (
                <Ionicons name="image-outline" size={28} color={theme.colors.textMuted} />
              )}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <TextInput
                value={coverImageUrl}
                onChangeText={setCoverImageUrl}
                placeholder="Image URL"
                placeholderTextColor={theme.colors.textMuted}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 12,
                  padding: 10,
                  color: theme.colors.text,
                }}
              />
            </View>
          </View>

          <Text style={theme.typography.caption}>Lessons in pack</Text>
          <TextInput
            value={lessonQuery}
            onChangeText={setLessonQuery}
            placeholder="Search lessons…"
            placeholderTextColor={theme.colors.textMuted}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 12,
              padding: 12,
              marginTop: 8,
              marginBottom: 8,
              color: theme.colors.text,
            }}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {levels.map((value) => (
              <TouchableOpacity
                key={value}
                onPress={() => setLevel(value)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginRight: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: level === value ? theme.colors.primary : theme.colors.border,
                  backgroundColor: level === value ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "800" }}>{value === "all" ? "ALL" : value}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {filteredLessons.map((lesson) => (
            <TouchableOpacity
              key={lesson.id}
              onPress={() => toggle(lesson.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 12,
                marginBottom: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: selected.has(lesson.id) ? theme.colors.primary : theme.colors.border,
                backgroundColor: selected.has(lesson.id) ? theme.colors.primarySoft : theme.colors.surfaceAlt,
              }}
            >
              <Ionicons
                name={selected.has(lesson.id) ? "checkmark-circle" : "ellipse-outline"}
                size={22}
                color={theme.colors.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={theme.typography.bodyStrong}>{lesson.title}</Text>
                {lesson.language_level ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{lesson.language_level}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}

          {confirmDelete ? (
            <View style={{ marginTop: 20, gap: 12 }}>
              <Text style={{ color: theme.colors.danger, fontWeight: "700" }}>Delete this pack forever?</Text>
              <AppButton label="Confirm delete" onPress={handleDelete} loading={deleting} />
              <TouchableOpacity onPress={() => setConfirmDelete(false)}>
                <Text style={{ textAlign: "center", color: theme.colors.primary }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setConfirmDelete(true)} style={{ marginTop: 20 }}>
              <Text style={{ color: theme.colors.danger, fontWeight: "800" }}>Delete pack</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.background,
          }}
        >
          <AppButton label="Save changes" onPress={handleSave} loading={saving} disabled={!title.trim()} />
        </View>
      </View>
    </Modal>
  );
}

function NewPackModal({
  lessons,
  currentUserId,
  onClose,
  onSaved,
  theme,
}: {
  lessons: LessonRow[];
  currentUserId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  theme: ReturnType<typeof useAppTheme>;
}) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cefrLevel, setCefrLevel] = useState("A1–A2");
  const [category, setCategory] = useState("");
  const [accessType, setAccessType] = useState<AccessType>("free");
  const [priceLabel, setPriceLabel] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [language, setLanguage] = useState("");
  const [status, setStatus] = useState<PackStatus>("published");
  const [lessonQuery, setLessonQuery] = useState("");
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(new Set());
  const [langModal, setLangModal] = useState(false);

  const filteredLessons = useMemo(() => {
    return lessons.filter((l) => l.title.toLowerCase().includes(lessonQuery.toLowerCase()));
  }, [lessons, lessonQuery]);

  const stepOneValid = title.trim().length > 0;
  const stepTwoValid = stepOneValid && selectedLessonIds.size > 0;

  const toggleLesson = (id: string) => {
    setSelectedLessonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pickCover = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission", "Allow photo library access to upload a cover.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize != null && asset.fileSize > 2 * 1024 * 1024) {
      Alert.alert("Too large", "Image must be under 2MB");
      return;
    }
    setCoverUploading(true);
    try {
      const url = await uploadPackCoverFromUri(asset.uri, asset.mimeType);
      setCoverImageUrl(url);
    } catch (e: unknown) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setCoverUploading(false);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const slug = slugifyTitle(title.trim()) || null;
      const payload = {
        title: title.trim(),
        slug,
        description: description.trim() || null,
        cefr_level: cefrLevel || null,
        category: category || null,
        access_type: accessType,
        price_label: accessType === "paid" ? priceLabel.trim() || null : null,
        cover_image_url: coverImageUrl.trim() || null,
        language: language || null,
        is_featured: isFeatured,
        status,
        created_by: currentUserId,
        updated_by: currentUserId,
      };
      const { data: insertedPack, error: packError } = await (supabase.from("lesson_packs") as any)
        .insert(payload)
        .select("id")
        .single();
      if (packError) throw packError;
      if (!insertedPack?.id) throw new Error("Pack created but id missing");

      const rows = Array.from(selectedLessonIds).map((lessonId, index) => ({
        pack_id: insertedPack.id,
        lesson_id: lessonId,
        sort_order: index,
      }));
      const { error: linkError } = await (supabase.from("lesson_pack_lessons") as any).insert(rows);
      if (linkError) throw linkError;

      await onSaved();
      Alert.alert("Created", "Pack created.");
      onClose();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create pack");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 48,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Close</Text>
          </TouchableOpacity>
          <Text style={[theme.typography.title, { flex: 1, textAlign: "center" }]}>
            {step === 1 ? "New pack" : "Select lessons"}
          </Text>
          <View style={{ width: 48 }} />
        </View>

        {step === 1 ? (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            <Text style={theme.typography.caption}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Conversation booster"
              placeholderTextColor={theme.colors.textMuted}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 12,
                padding: 12,
                marginTop: 6,
                marginBottom: 14,
                color: theme.colors.text,
              }}
            />
            <Text style={theme.typography.caption}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 12,
                padding: 12,
                marginTop: 6,
                marginBottom: 14,
                minHeight: 100,
                color: theme.colors.text,
              }}
            />
            <Text style={theme.typography.caption}>CEFR</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginBottom: 14 }}>
              {NEW_PACK_CEFR.map((o) => (
                <TouchableOpacity
                  key={o}
                  onPress={() => setCefrLevel(o)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    marginRight: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: cefrLevel === o ? theme.colors.primary : theme.colors.border,
                    backgroundColor: cefrLevel === o ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700" }}>{o}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={theme.typography.caption}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginBottom: 14 }}>
              {CATEGORY_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o}
                  onPress={() => setCategory(o)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    marginRight: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: category === o ? theme.colors.primary : theme.colors.border,
                    backgroundColor: category === o ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700" }}>{o}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={theme.typography.caption}>Language</Text>
            <TouchableOpacity
              onPress={() => setLangModal(true)}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 12,
                padding: 14,
                marginTop: 6,
                marginBottom: 14,
              }}
            >
              <Text>{language || "Select language…"}</Text>
            </TouchableOpacity>
            <LanguagePickerModal
              visible={langModal}
              title="Pack language"
              value={language}
              allowEmpty
              onClose={() => setLangModal(false)}
              onSelect={setLanguage}
              theme={theme}
            />
            <Text style={theme.typography.caption}>Access</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 14 }}>
              {ACCESS_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o}
                  onPress={() => setAccessType(o)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: accessType === o ? theme.colors.primary : theme.colors.border,
                    backgroundColor: accessType === o ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                  }}
                >
                  <Text style={{ fontWeight: "800", fontSize: 11, textTransform: "uppercase" }}>{o}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {accessType === "paid" ? (
              <>
                <Text style={theme.typography.caption}>Price label</Text>
                <TextInput
                  value={priceLabel}
                  onChangeText={setPriceLabel}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: 12,
                    padding: 12,
                    marginTop: 6,
                    marginBottom: 14,
                    maxWidth: 200,
                    color: theme.colors.text,
                  }}
                />
              </>
            ) : null}
            <Text style={theme.typography.caption}>Cover</Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8, marginBottom: 14 }}>
              <TouchableOpacity
                onPress={pickCover}
                disabled={coverUploading}
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 16,
                  borderWidth: 2,
                  borderStyle: "dashed",
                  borderColor: theme.colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {coverUploading ? (
                  <ActivityIndicator />
                ) : coverImageUrl ? (
                  <Image source={{ uri: coverImageUrl }} style={{ width: "100%", height: "100%", borderRadius: 14 }} />
                ) : (
                  <Ionicons name="image-outline" size={28} color={theme.colors.textMuted} />
                )}
              </TouchableOpacity>
              <TextInput
                value={coverImageUrl}
                onChangeText={setCoverImageUrl}
                placeholder="Or paste URL"
                placeholderTextColor={theme.colors.textMuted}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 12,
                  padding: 10,
                  color: theme.colors.text,
                }}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={theme.typography.caption}>Status</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  {(["draft", "published"] as PackStatus[]).map((s) => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setStatus(s)}
                      style={{
                        flex: 1,
                        padding: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: status === s ? theme.colors.primary : theme.colors.border,
                        backgroundColor: status === s ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "800", textAlign: "center", textTransform: "uppercase" }}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setIsFeatured((v) => !v)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <Ionicons name={isFeatured ? "checkbox" : "square-outline"} size={24} color={theme.colors.primary} />
              <Text style={theme.typography.bodyStrong}>Featured</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            <TextInput
              value={lessonQuery}
              onChangeText={setLessonQuery}
              placeholder="Search lessons…"
              placeholderTextColor={theme.colors.textMuted}
              style={{
                marginHorizontal: 16,
                marginTop: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 12,
                padding: 12,
                color: theme.colors.text,
              }}
            />
            <FlatList
              data={filteredLessons}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              renderItem={({ item: lesson }) => (
                <TouchableOpacity
                  onPress={() => toggleLesson(lesson.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    marginBottom: 8,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: selectedLessonIds.has(lesson.id) ? theme.colors.primary : theme.colors.border,
                    backgroundColor: selectedLessonIds.has(lesson.id) ? theme.colors.primarySoft : theme.colors.surfaceAlt,
                  }}
                >
                  <Ionicons
                    name={selectedLessonIds.has(lesson.id) ? "checkmark-circle" : "ellipse-outline"}
                    size={22}
                    color={theme.colors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={theme.typography.bodyStrong}>{lesson.title}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            flexDirection: "row",
            gap: 12,
          }}
        >
          {step === 1 ? (
            <>
              <View style={{ flex: 1 }}>
                <AppButton label="Cancel" onPress={onClose} variant="secondary" />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton label="Next" onPress={() => setStep(2)} disabled={!stepOneValid} />
              </View>
            </>
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <AppButton label="Back" onPress={() => setStep(1)} variant="secondary" />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton label="Create" onPress={handleCreate} loading={saving} disabled={!stepTwoValid} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

