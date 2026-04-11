import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Keyboard,
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
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Audio } from "expo-av";
import { decode as decodeBase64 } from "base64-arraybuffer";
import { NavigationProp, RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getOrCreateVocabImage } from "../lib/api/imageBank";
import { supabase } from "../lib/supabase";
import { triggerLightImpact, triggerSuccessHaptic } from "../lib/haptics";
import { useAppTheme } from "../lib/theme";
import { DEFAULT_RULES, ensureQuestionDefaults, ensureTestSettings, uid } from "../lib/testDesignMobile";
import { normalizePlanUi } from "../lib/teacherRolePlanRules";
import GlassCard from "../components/GlassCard";
import { SkeletonBox } from "../components/SkeletonLoader";

import type { RootTestsStackParams } from "./TestsScreen";

const apiBaseUrl =
  Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";

const TEST_CATEGORIES = [
  "Vocabulary",
  "Lessons",
  "False Cognates",
  "Cognates",
  "Verb Tenses",
  "Prepositions",
  "Phrasal Verbs",
  "Idioms & Expressions",
  "Gender & Agreement",
  "Word Order",
  "Register & Formality",
  "Other",
] as const;

type WordRow = {
  key: string;
  en: string;
  pt: string;
  sourceLessonId?: string | null;
  sourceLessonWordKey?: string | null;
};
type QRow = {
  key: string;
  id: string;
  q_type: "manual" | "ai";
  prompt_format: "text" | "audio" | "image" | "video" | "fill_blank";
  answer_format: "specific" | "open" | "mcq";
  section: string;
  points: number;
  required: boolean;
  prompt_text: string;
  image_url: string;
  audio_url: string;
  audio_transcript: string;
  correct_text: string;
  accepted_texts: string[];
  specific_rules: {
    caseInsensitive: boolean;
    ignorePunctuation: boolean;
    trimSpaces: boolean;
    accentInsensitive: boolean;
  };
  mcq_options: { id: string; text: string }[];
  mcq_correct_option_id: string;
  teacher_reference_answer: string;
  fill_blank_character_count?: number;
};
type LessonOpt = { id: string; title: string };
type TeacherOpt = { id: string; name: string };
type TestSettings = {
  time_limit_minutes: number | null;
  attempts_allowed: 1 | 2 | "unlimited";
  randomize_questions: boolean;
  randomize_mcq_options: boolean;
};
type TemplatePreset = {
  id: string;
  label: string;
  build: () => Partial<QRow>;
};

type LinkedLessonWordRow = {
  key: string;
  en: string;
  pt: string;
  sp: string;
  se: string;
  sourceLessonId: string;
  sourceLessonWordKey: string;
};

const AI_ELIGIBLE_PLANS = ["basic", "standard", "school", "internal"];
const base64ByteSize = (base64: string) => {
  const len = base64.length;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
};

const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "vocab_recall",
    label: "Vocabulary recall",
    build: () => ({ prompt_format: "text", answer_format: "specific", section: "Vocabulary", points: 1 }),
  },
  {
    id: "picture_naming",
    label: "Picture naming",
    build: () => ({ prompt_format: "image", answer_format: "specific", section: "Vocabulary", points: 1 }),
  },
  {
    id: "listening_dictation",
    label: "Listening dictation",
    build: () => ({
      prompt_format: "audio",
      answer_format: "specific",
      section: "Listening",
      points: 1,
      specific_rules: { ...DEFAULT_RULES, accentInsensitive: true },
    }),
  },
  {
    id: "listening_mcq",
    label: "Listening comprehension",
    build: () => ({ prompt_format: "audio", answer_format: "mcq", section: "Listening", points: 1 }),
  },
  {
    id: "cloze",
    label: "Fill in the blank",
    build: () => ({
      prompt_format: "fill_blank",
      answer_format: "specific",
      section: "Grammar",
      points: 1,
      fill_blank_character_count: 4,
      prompt_text: "Fill in the blank: ____",
    }),
  },
  {
    id: "short_writing",
    label: "Short writing",
    build: () => ({ prompt_format: "text", answer_format: "open", section: "Writing", points: 2 }),
  },
];

function FloatingGlow({
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
        opacity: 0.85,
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

function HeroChip({
  icon,
  label,
  value,
  tint,
  textColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tint: string;
  textColor: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: tint,
      }}
    >
      <Ionicons name={icon} size={14} color={textColor} />
      <Text style={{ fontSize: 11, fontWeight: "800", color: textColor, textTransform: "uppercase", letterSpacing: 0.7 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 12, fontWeight: "700", color: textColor }}>{value}</Text>
    </View>
  );
}

export default function TestFormScreen() {
  const theme = useAppTheme();
  const accentPurple = theme.isDark ? theme.colors.primary : "#9050E7";
  const accentPurpleSoft = theme.isDark ? theme.colors.primarySoft : "#F3ECFF";
  const accentPurpleBorder = theme.isDark ? theme.colors.border : "#D5B8FC";
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootTestsStackParams>>();
  const route = useRoute<RouteProp<RootTestsStackParams, "TestForm">>();
  const testId = route.params?.testId;
  const isEdit = !!testId;

  const [bootLoading, setBootLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [planUi, setPlanUi] = useState("Basic");

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("Vocabulary");
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const heroGlowOne = useRef(new Animated.Value(-10)).current;
  const heroGlowTwo = useRef(new Animated.Value(10)).current;

  const [words, setWords] = useState<(WordRow & { sp: string; se: string })[]>([]);
  const [questions, setQuestions] = useState<QRow[]>([
    mapQuestion(ensureQuestionDefaults(null)),
  ]);
  const [linkedLessonIds, setLinkedLessonIds] = useState<string[]>([]);
  const [lessons, setLessons] = useState<LessonOpt[]>([]);
  const [teachers, setTeachers] = useState<TeacherOpt[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [lessonSearch, setLessonSearch] = useState("");

  const [testSettings, setTestSettings] = useState<TestSettings>(() => ensureTestSettings(null) as TestSettings);
  const [aiQuestionsLoading, setAiQuestionsLoading] = useState(false);
  const [aiVocabLoading, setAiVocabLoading] = useState(false);
  const [aiImageIndex, setAiImageIndex] = useState<number | null>(null);
  const [uploadingQuestionIndex, setUploadingQuestionIndex] = useState<number | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [vocabOpen, setVocabOpen] = useState<Record<string, boolean>>({});
  const [vocabSectionOpen, setVocabSectionOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [dropdownOpen, setDropdownOpen] = useState<Record<string, "prompt" | "answer" | null>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linkedLessonsOpen, setLinkedLessonsOpen] = useState(false);
  const [helpBubble, setHelpBubble] = useState<"vocab" | "questions" | null>(null);
  const [playingAudio, setPlayingAudio] = useState<Record<string, boolean>>({});
  const audioSoundRef = useState<{ sound: Audio.Sound | null }>({ sound: null })[0];

  const canUseAI = useMemo(() => isAdmin || AI_ELIGIBLE_PLANS.includes((planUi ?? "").toLowerCase()), [isAdmin, planUi]);

  function mapQuestion(raw: Record<string, unknown>): QRow {
    return {
      key: uid(),
      id: String(raw.id ?? uid()),
      q_type: raw.q_type === "ai" ? "ai" : "manual",
      prompt_format: (raw.prompt_format as QRow["prompt_format"]) ?? "text",
      answer_format: (raw.answer_format as QRow["answer_format"]) ?? "specific",
      section: String(raw.section ?? ""),
      points: typeof raw.points === "number" ? raw.points : 1,
      required: raw.required !== false,
      prompt_text: String(raw.prompt_text ?? ""),
      image_url: String(raw.image_url ?? ""),
      audio_url: String(raw.audio_url ?? ""),
      audio_transcript: String(raw.audio_transcript ?? ""),
      correct_text: String(raw.correct_text ?? ""),
      accepted_texts: Array.isArray(raw.accepted_texts) ? raw.accepted_texts.filter((x): x is string => typeof x === "string") : [],
      specific_rules:
        raw.specific_rules && typeof raw.specific_rules === "object"
          ? {
              caseInsensitive: (raw.specific_rules as any).caseInsensitive !== false,
              ignorePunctuation: (raw.specific_rules as any).ignorePunctuation !== false,
              trimSpaces: (raw.specific_rules as any).trimSpaces !== false,
              accentInsensitive: (raw.specific_rules as any).accentInsensitive === true,
            }
          : { ...DEFAULT_RULES },
      mcq_options: Array.isArray(raw.mcq_options)
        ? raw.mcq_options.map((o: any) => ({ id: String(o?.id ?? uid()), text: String(o?.text ?? "") }))
        : [
            { id: uid(), text: "" },
            { id: uid(), text: "" },
            { id: uid(), text: "" },
            { id: uid(), text: "" },
          ],
      mcq_correct_option_id: String(raw.mcq_correct_option_id ?? ""),
      teacher_reference_answer: String(raw.teacher_reference_answer ?? ""),
      fill_blank_character_count:
        typeof raw.fill_blank_character_count === "number" ? raw.fill_blank_character_count : undefined,
    };
  }

  const replaceQuestion = (key: string, updater: (q: QRow) => QRow) => {
    setQuestions((prev) => prev.map((q) => (q.key === key ? updater(q) : q)));
  };

  const buildLinkedLessonWordRows = useCallback((lessonRows: { id: string; content_json?: unknown }[]) => {
    const linkedWords: LinkedLessonWordRow[] = [];
    for (const lesson of lessonRows) {
      const cfg = lesson.content_json && typeof lesson.content_json === "object" ? (lesson.content_json as Record<string, unknown>) : {};
      const rawWords = Array.isArray((cfg as any).words) ? ((cfg as any).words as any[]) : [];
      rawWords.forEach((word, index) => {
        const rowType = String(word?.rowType ?? "vocab");
        if (rowType !== "vocab") return;
        const en = String(word?.en ?? word?.term_b ?? "").trim();
        const pt = String(word?.pt ?? word?.term_a ?? "").trim();
        const sp = String(word?.sp ?? word?.context_a ?? "").trim();
        const se = String(word?.se ?? word?.context_b ?? "").trim();
        if (!en && !pt && !sp && !se) return;
        const sourceLessonWordKey = String(word?.id ?? word?.key ?? `${lesson.id}:${index}`);
        linkedWords.push({
          key: uid(),
          en,
          pt,
          sp,
          se,
          sourceLessonId: lesson.id,
          sourceLessonWordKey,
        });
      });
    }
    return linkedWords;
  }, []);

  const syncLinkedLessonWords = useCallback(
    async (lessonIds: string[]) => {
      if (!lessonIds.length) {
        setWords((prev) => {
          const manualWords = prev.filter((w) => !w.sourceLessonId);
          return manualWords;
        });
        return;
      }

      const { data, error } = await (supabase.from("lessons") as any)
        .select("id, content_json")
        .in("id", lessonIds);
      if (error) throw error;

      const linkedWords = buildLinkedLessonWordRows((data ?? []) as { id: string; content_json?: unknown }[]);
      setWords((prev) => {
        const manualWords = prev.filter((w) => !w.sourceLessonId);
        const nextWords = [...manualWords, ...linkedWords];
        return nextWords;
      });
    },
    [buildLinkedLessonWordRows]
  );

  const loadLessonsForTeacher = useCallback(async (tid: string) => {
    if (!tid) {
      setLessons([]);
      return;
    }
    const { data } = await supabase
      .from("lessons")
      .select("id, title")
      .eq("status", "published")
      .eq("created_by", tid)
      .order("created_at", { ascending: false });
    setLessons((data as LessonOpt[]) || []);
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
        setCurrentUserId(user.id);

        const { data: tr } = await (supabase.from("teachers") as any)
          .select("role, plan")
          .eq("user_id", user.id)
          .maybeSingle();
        const r = (tr as { role?: string })?.role ?? "";
        const p = normalizePlanUi((tr as { plan?: string })?.plan ?? null);
        setPlanUi(p);
        setIsAdmin(r === "admin");

        if (r !== "admin" && r !== "teacher") {
          Alert.alert("Access denied", "Only teachers and admins can edit tests.");
          navigation.goBack();
          return;
        }

        if (isEdit && testId) {
          const { data: row, error } = await (supabase.from("tests") as any).select("*").eq("id", testId).single();
          if (error || !row) {
            Alert.alert("Error", "Could not load test.");
            navigation.goBack();
            return;
          }
          if (r !== "admin" && row.teacher_id !== user.id) {
            Alert.alert("Access denied");
            navigation.goBack();
            return;
          }

          setName(row.name ?? "");
          const t = row.type ?? "Vocabulary";
          setType(TEST_CATEGORIES.includes(t as (typeof TEST_CATEGORIES)[number]) ? t : "Other");
          if (!TEST_CATEGORIES.includes(t as (typeof TEST_CATEGORIES)[number])) setCustomCategory(t);
          setDescription(row.description ?? "");
          setCoverImageUrl(row.cover_image_url ?? "");
          setTeacherId(row.teacher_id ?? user.id);

          const cfg = row.config_json && typeof row.config_json === "object" ? row.config_json : {};
          const w = Array.isArray((cfg as any).words) ? (cfg as any).words : [];
          setWords(
            w.length
              ? w.map((x: any) => ({
                  key: uid(),
                  en: String(x.en ?? ""),
                  pt: String(x.pt ?? ""),
                  sp: String(x.sp ?? ""),
                  se: String(x.se ?? ""),
                  sourceLessonId: x.sourceLessonId ? String(x.sourceLessonId) : null,
                  sourceLessonWordKey: x.sourceLessonWordKey ? String(x.sourceLessonWordKey) : null,
                }))
              : []
          );

          const rawTests = Array.isArray((cfg as any).tests) ? (cfg as any).tests : [];
          setTestSettings(ensureTestSettings((cfg as any).test_settings) as TestSettings);
          setLinkedLessonIds(Array.isArray((cfg as any).linked_lesson_ids) ? [...(cfg as any).linked_lesson_ids] : []);

          const qRows: QRow[] = rawTests.map((tq: unknown) => mapQuestion(ensureQuestionDefaults(tq as Record<string, unknown>)));
          setQuestions(
            qRows.length
              ? qRows
              : [mapQuestion(ensureQuestionDefaults(null))]
          );

          if (r === "admin") {
            const { data: tlist } = await (supabase.from("teachers") as any).select("user_id, name").order("name");
            if (!cancelled && tlist) {
              setTeachers((tlist as { user_id: string; name: string }[]).map((x) => ({ id: x.user_id, name: x.name })));
            }
          }
          await loadLessonsForTeacher(row.teacher_id || user.id);
        } else {
          setName("");
          setType("Vocabulary");
          setCustomCategory("");
          setDescription("");
          setCoverImageUrl("");
          setWords([]);
          setQuestions([mapQuestion(ensureQuestionDefaults(null))]);
          setLinkedLessonIds([]);
          setTestSettings(ensureTestSettings(null) as TestSettings);
          if (r === "admin") {
            const { data: tlist } = await (supabase.from("teachers") as any).select("user_id, name").order("name");
            if (!cancelled && tlist) {
              setTeachers((tlist as { user_id: string; name: string }[]).map((x) => ({ id: x.user_id, name: x.name })));
            }
          }
          setTeacherId(user.id);
          await loadLessonsForTeacher(user.id);
        }
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : "Load failed");
        navigation.goBack();
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, testId, navigation, loadLessonsForTeacher]);

  useEffect(() => {
    if (!isAdmin || !teacherId) return;
    loadLessonsForTeacher(teacherId);
  }, [isAdmin, teacherId, loadLessonsForTeacher]);

  useEffect(() => {
    if (bootLoading) return;
    syncLinkedLessonWords(linkedLessonIds).catch((e) => {
      Alert.alert("Linked lessons", e instanceof Error ? e.message : "Could not sync linked lesson vocabulary");
    });
  }, [bootLoading, linkedLessonIds, syncLinkedLessonWords]);

  const filteredTeachers = teachers.filter((t) => t.name.toLowerCase().includes(teacherSearch.toLowerCase()));

  const finalType = type === "Other" ? (customCategory.trim() || "Other") : type;
  const linkedLessonsSummary =
    linkedLessonIds.length > 0 ? `${linkedLessonIds.length} linked lesson${linkedLessonIds.length === 1 ? "" : "s"}` : "No lessons linked";
  const activeWordCount = words.filter((w) => w.en.trim() || w.pt.trim()).length;
  const linkedWordCount = words.filter((w) => w.sourceLessonId && (w.en.trim() || w.pt.trim())).length;
  const manualWordCount = Math.max(0, activeWordCount - linkedWordCount);
  const vocabSummary =
    activeWordCount > 0
      ? `${activeWordCount} active vocabulary row${activeWordCount === 1 ? "" : "s"}`
      : "Add vocabulary manually or pull it from lessons";
  const questionsSummary =
    questions.length > 0 ? `${questions.length} question${questions.length === 1 ? "" : "s"} ready to edit` : "No questions yet";
  const settingsSummary =
    testSettings.time_limit_minutes || linkedLessonIds.length || testSettings.randomize_questions || testSettings.randomize_mcq_options
      ? "Configured"
      : "Using default test settings";
  const heroDescription =
    description.trim() || "Shape the test flow, link lessons when needed, and turn vocabulary into a cleaner, richer assessment experience.";

  useEffect(() => {
    const loopOne = Animated.loop(
      Animated.sequence([
        Animated.timing(heroGlowOne, {
          toValue: 12,
          duration: 3800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(heroGlowOne, {
          toValue: -10,
          duration: 3800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const loopTwo = Animated.loop(
      Animated.sequence([
        Animated.timing(heroGlowTwo, {
          toValue: -12,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(heroGlowTwo, {
          toValue: 10,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loopOne.start();
    loopTwo.start();
    return () => {
      loopOne.stop();
      loopTwo.stop();
    };
  }, [heroGlowOne, heroGlowTwo]);

  const buildConfigJson = () => {
    const wordObjs = words
      .filter((w) => w.en.trim() || w.pt.trim())
      .map((w) => ({
        pt: w.pt.trim(),
        en: w.en.trim(),
        sp: w.sp.trim(),
        se: w.se.trim(),
        sourceLessonId: w.sourceLessonId ?? null,
        sourceLessonWordKey: w.sourceLessonWordKey ?? null,
      }));

    const builtTests: Record<string, unknown>[] = questions.map((q) =>
      ensureQuestionDefaults({
        id: q.id,
        q_type: q.q_type,
        prompt_format: q.prompt_format,
        answer_format: q.answer_format,
        section: q.section,
        points: q.points,
        required: q.required,
        prompt_text: q.prompt_text,
        image_url: q.image_url,
        audio_url: q.audio_url,
        audio_transcript: q.audio_transcript,
        correct_text: q.correct_text,
        accepted_texts: q.accepted_texts,
        specific_rules: q.specific_rules,
        mcq_options: q.mcq_options,
        mcq_correct_option_id: q.mcq_correct_option_id,
        teacher_reference_answer: q.teacher_reference_answer,
        fill_blank_character_count:
          q.prompt_format === "fill_blank" ? Math.max(1, q.correct_text.trim().length || q.fill_blank_character_count || 1) : q.fill_blank_character_count,
      })
    );

    return {
      words: wordObjs,
      tests: builtTests,
      test_settings: ensureTestSettings(testSettings),
      linked_lesson_ids: linkedLessonIds,
    };
  };

  const authedJsonFetch = async (path: string, body: unknown) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Not authenticated");
    const base = apiBaseUrl.replace(/\/$/, "");
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(String(json?.error ?? "Request failed"));
    return json;
  };

  const handleEnrichVocabularyWithAI = async () => {
    const source = words.filter((w) => w.en.trim() || w.pt.trim()).map((w) => ({ en: w.en, pt: w.pt, sp: w.sp, se: w.se }));
    if (!source.length) {
      Alert.alert("AI", "Add some vocabulary first.");
      return;
    }
    setAiVocabLoading(true);
    try {
      const json = await authedJsonFetch("/api/ai/tests/enrich-vocabulary", { words: source });
      const enriched = Array.isArray(json.words) ? json.words : [];
      if (!enriched.length) {
        Alert.alert("AI", "No enrichment returned.");
        return;
      }
      setWords(
        enriched.map((w: any) => ({
          key: uid(),
          en: String(w.en ?? ""),
          pt: String(w.pt ?? ""),
          sp: String(w.sp ?? ""),
          se: String(w.se ?? ""),
        }))
      );
    } catch (e) {
      Alert.alert("AI Error", e instanceof Error ? e.message : "Could not enrich vocabulary");
    } finally {
      setAiVocabLoading(false);
    }
  };

  const handleGenerateQuestionsFromVocabulary = async () => {
    const source = words.filter((w) => w.en.trim() || w.pt.trim()).map((w) => ({ en: w.en, pt: w.pt, sp: w.sp, se: w.se }));
    if (!source.length) {
      Alert.alert("AI", "Add vocabulary first.");
      return;
    }
    setAiQuestionsLoading(true);
    try {
      const json = await authedJsonFetch("/api/ai/tests/generate-questions-from-vocabulary", { words: source });
      const generated = Array.isArray(json.tests) ? json.tests : [];
      if (!generated.length) {
        Alert.alert("AI", "No questions generated.");
        return;
      }
      setQuestions((prev) => [...prev, ...generated.map((q) => mapQuestion(ensureQuestionDefaults(q as Record<string, unknown>)))]);
    } catch (e) {
      Alert.alert("AI Error", e instanceof Error ? e.message : "Could not generate questions");
    } finally {
      setAiQuestionsLoading(false);
    }
  };

  const handleGenerateImageForQuestion = async (index: number) => {
    const q = questions[index];
    if (!q) return;
    const pt = q.correct_text.trim();
    if (!pt) {
      Alert.alert("AI", "Set a correct answer first.");
      return;
    }
    setAiImageIndex(index);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const result = await getOrCreateVocabImage(token, {
        pt,
        en: q.prompt_text.trim() || undefined,
        category: finalType,
        tags: ["test", "question-image"],
      });
      if (!result.image_url) {
        Alert.alert("AI", "No image returned.");
        return;
      }
      replaceQuestion(q.key, (cur) => ({ ...cur, image_url: result.image_url }));
    } catch (e) {
      Alert.alert("AI Error", e instanceof Error ? e.message : "Could not generate image");
    } finally {
      setAiImageIndex(null);
    }
  };

  const uploadFileFromUri = async (uri: string, bucketPath: string, opts?: { maxBytes?: number; contentType?: string; ext?: string }) => {
    const path = `${bucketPath}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${opts?.ext ?? "bin"}`;
    let payload: Blob | ArrayBuffer;
    let inferredType = opts?.contentType ?? "application/octet-stream";
    try {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      if (opts?.maxBytes && blob.size > opts.maxBytes) {
        throw new Error(`File must be under ${Math.floor(opts.maxBytes / (1024 * 1024))}MB`);
      }
      payload = blob;
      inferredType = opts?.contentType ?? blob.type ?? inferredType;
    } catch {
      // Fallback for Android content:// URIs that can fail with fetch.
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" as any });
      const bytes = base64ByteSize(base64);
      if (opts?.maxBytes && bytes > opts.maxBytes) {
        throw new Error(`File must be under ${Math.floor(opts.maxBytes / (1024 * 1024))}MB`);
      }
      payload = decodeBase64(base64);
    }
    const { error } = await supabase.storage.from("lesson-assets").upload(path, payload, {
      contentType: inferredType,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("lesson-assets").getPublicUrl(path);
    return data.publicUrl;
  };

  const pickCoverImage = async () => {
    const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm !== "granted") {
      Alert.alert("Permission", "Allow media library access to upload images.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setCoverUploading(true);
    try {
      const ext = (a.fileName?.split(".").pop() || "jpg").toLowerCase();
      const url = await uploadFileFromUri(a.uri, "test-covers", {
        maxBytes: 2 * 1024 * 1024,
        contentType: a.mimeType ?? "image/jpeg",
        ext: ext === "png" || ext === "webp" || ext === "gif" || ext === "jpg" || ext === "jpeg" ? ext : "jpg",
      });
      setCoverImageUrl(url);
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload image");
    } finally {
      setCoverUploading(false);
    }
  };

  const pickQuestionImage = async (index: number) => {
    const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm !== "granted") {
      Alert.alert("Permission", "Allow media library access to upload images.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setUploadingQuestionIndex(index);
    try {
      const ext = (a.fileName?.split(".").pop() || "jpg").toLowerCase();
      const url = await uploadFileFromUri(a.uri, "test-assets", {
        maxBytes: 2 * 1024 * 1024,
        contentType: a.mimeType ?? "image/jpeg",
        ext: ext === "png" || ext === "webp" || ext === "gif" || ext === "jpg" || ext === "jpeg" ? ext : "jpg",
      });
      const q = questions[index];
      if (q) replaceQuestion(q.key, (cur) => ({ ...cur, image_url: url }));
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload image");
    } finally {
      setUploadingQuestionIndex(null);
    }
  };

  const pickQuestionAudio = async (index: number) => {
    const res = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setUploadingQuestionIndex(index);
    try {
      const ext = (a.name?.split(".").pop() || "mp3").toLowerCase();
      const url = await uploadFileFromUri(a.uri, "test-audio", {
        maxBytes: 10 * 1024 * 1024,
        contentType: a.mimeType ?? "audio/mpeg",
        ext,
      });
      const q = questions[index];
      if (q) replaceQuestion(q.key, (cur) => ({ ...cur, audio_url: url }));
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload audio");
    } finally {
      setUploadingQuestionIndex(null);
    }
  };

  const openWebEditor = () => {
    const path = testId ? `/dashboard/tests/${testId}/edit` : "/dashboard/tests/new";
    const url = `${apiBaseUrl.replace(/\/$/, "")}${path}`;
    Linking.openURL(url).catch(() => Alert.alert("Web", url));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Validation", "Test name is required.");
      return;
    }
    const config_json = buildConfigJson();
    const fillErr = (config_json.tests as Record<string, unknown>[]).find((t) => {
      if (t.prompt_format !== "fill_blank") return false;
      const cnt = (t.fill_blank_character_count as number) ?? 4;
      const len = String(t.correct_text ?? t.pt ?? "")
        .trim()
        .length;
      return len > 0 && len !== cnt;
    });
    if (fillErr) {
      Alert.alert("Validation", "A fill-in-the-blank question has wrong answer length. Open the web editor to fix.");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const tid = isAdmin ? teacherId || currentUserId : currentUserId;

      if (isEdit && testId) {
        const payload: Record<string, unknown> = {
          name: name.trim(),
          type: finalType,
          description: description.trim() || null,
          status: "published",
          cover_image_url: coverImageUrl.trim() || null,
          config_json,
        };
        if (isAdmin) payload.teacher_id = tid;
        const { error } = await (supabase.from("tests") as any).update(payload).eq("id", testId);
        if (error) throw error;
        triggerSuccessHaptic();
        Alert.alert("Saved", "Test updated.");
      } else {
        const body = {
          name: name.trim(),
          type: finalType,
          description: description.trim() || null,
          status: "published",
          config_json,
          cover_image_url: coverImageUrl.trim() || null,
          created_by: currentUserId,
          teacher_id: tid,
        };
        const base = apiBaseUrl.replace(/\/$/, "");
        let res = await fetch(`${base}/api/admin/tests`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const ins = await (supabase.from("tests") as any).insert({
            name: body.name,
            type: body.type,
            description: body.description,
            status: body.status,
            config_json: body.config_json,
            cover_image_url: body.cover_image_url,
            teacher_id: tid,
            created_by: currentUserId,
          });
          if (ins.error) {
            const errJson = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(errJson?.error ?? ins.error.message ?? "Create failed");
          }
        }
        triggerSuccessHaptic();
        Alert.alert("Created", "Test saved.");
      }
      navigation.goBack();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const placeholderColor = theme.isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";

  const inputStyle = {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    fontSize: 14,
    minHeight: 48,
  };

  const sectionCardStyle = {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceGlass,
    overflow: "hidden" as const,
    marginBottom: 16,
  };

  if (bootLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: Math.max(insets.top, 8), paddingHorizontal: 16 }}>
        <GlassCard style={{ borderRadius: 26, marginBottom: 16 }} padding={14}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <SkeletonBox width={46} height={46} radius={16} />
            <View style={{ flex: 1, gap: 8 }}>
              <SkeletonBox width="30%" height={12} radius={6} />
              <SkeletonBox width="48%" height={20} radius={10} />
            </View>
            <SkeletonBox width={84} height={40} radius={14} />
          </View>
        </GlassCard>
        <GlassCard style={{ borderRadius: 30 }} padding={22}>
          <View style={{ gap: 16 }}>
            <SkeletonBox width="100%" height={132} radius={24} />
            <SkeletonBox width="100%" height={48} radius={14} />
            <SkeletonBox width="100%" height={96} radius={18} />
            <SkeletonBox width="100%" height={180} radius={24} />
          </View>
        </GlassCard>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ paddingTop: Math.max(insets.top, 8), paddingHorizontal: 16, paddingBottom: 12 }}>
        <GlassCard style={{ borderRadius: 26 }} padding={14}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={{ width: 46, height: 46, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="chevron-back" size={22} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 14 }}>
              <Text style={[theme.typography.label, { color: accentPurple }]}>{isEdit ? "Test editor" : "Test studio"}</Text>
              <Text style={[theme.typography.title, { marginTop: 4, fontSize: 20, lineHeight: 25 }]}>{isEdit ? "Edit test" : "New test"}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TouchableOpacity onPress={openWebEditor} style={{ paddingHorizontal: 13, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: accentPurple, backgroundColor: accentPurpleSoft, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="open-outline" size={14} color={accentPurple} />
                <Text style={{ color: accentPurple, fontSize: 12, fontWeight: "800" }}>Web</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { Keyboard.dismiss(); triggerLightImpact(); handleSave(); }}
                disabled={saving}
                style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: accentPurple, opacity: saving ? 0.7 : 1 }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800" }}>{saving ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </GlassCard>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <View style={{ gap: 16 }}>
          <GlassCard style={{ borderRadius: 30, overflow: "hidden" }} padding={0}>
            <View style={{ position: "relative", overflow: "hidden" }}>
              <FloatingGlow size={180} color={accentPurpleSoft} top={-55} right={-25} translate={heroGlowOne} />
              <FloatingGlow size={130} color={theme.colors.violetSoft} bottom={-38} left={-15} translate={heroGlowTwo} />
              <View style={{ padding: 22 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TouchableOpacity onPress={pickCoverImage} activeOpacity={0.9} disabled={coverUploading} style={{ width: 110, marginRight: 16 }}>
                    {coverImageUrl.trim() ? (
                      <Image source={{ uri: coverImageUrl.trim() }} style={{ width: 110, height: 132, borderRadius: 24, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border }} resizeMode="cover" />
                    ) : (
                      <View style={{ width: 110, height: 132, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <Ionicons name="image-outline" size={30} color={theme.colors.textMuted} />
                        <Text style={{ color: theme.colors.textMuted, fontWeight: "700", fontSize: 11, textAlign: "center", paddingHorizontal: 10 }}>
                          {coverUploading ? "Uploading..." : "Add cover"}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={[theme.typography.label, { color: accentPurple }]}>Test studio</Text>
                    <Text style={[theme.typography.title, { marginTop: 8, fontSize: 28, lineHeight: 32 }]}>
                      {name.trim() || (isEdit ? "Untitled test" : "Design a polished new test")}
                    </Text>
                    <Text style={[theme.typography.bodyStrong, { marginTop: 8, color: theme.colors.textMuted, fontSize: 15, lineHeight: 22 }]}>
                      {heroDescription}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
                  <HeroChip icon="grid-outline" label="Type" value={finalType} tint={accentPurpleSoft} textColor={accentPurple} />
                  <HeroChip icon="book-outline" label="Vocab" value={`${activeWordCount}`} tint={theme.colors.violetSoft} textColor={theme.colors.text} />
                  <HeroChip icon="document-text-outline" label="Questions" value={`${questions.length}`} tint={theme.colors.surfaceAlt} textColor={theme.colors.textMuted} />
                  <HeroChip icon="link-outline" label="Lessons" value={`${linkedLessonIds.length}`} tint={theme.colors.surfaceAlt} textColor={theme.colors.textMuted} />
                </View>
              </View>
            </View>
          </GlassCard>

          <View
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: accentPurple,
              backgroundColor: accentPurpleSoft,
              padding: 16,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "900", color: accentPurple, letterSpacing: 1.3, textTransform: "uppercase" }}>
              Test builder
            </Text>
            <Text style={{ fontSize: 20, fontWeight: "800", color: theme.colors.text, marginTop: 6 }}>
              {isEdit ? "Test overview" : "Build the test in four steps."}
            </Text>
            {!isEdit ? (
              <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.textMuted, marginTop: 6 }}>
                Start with basics, link lessons if needed, shape the vocabulary, then finish with the questions students will answer.
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {[
                { label: "Basics", value: finalType },
                { label: "Linked Lessons", value: linkedLessonIds.length ? String(linkedLessonIds.length) : "0" },
                { label: "Vocabulary", value: String(activeWordCount) },
                { label: "Questions", value: String(questions.length) },
              ].map((item) => (
                <View
                  key={item.label}
                  style={{
                    width: "48%",
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: accentPurple,
                    backgroundColor: theme.colors.surface,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.text, textTransform: "uppercase" }} numberOfLines={1}>
                    {item.label}: <Text style={{ color: theme.colors.textMuted }}>{item.value}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {!isEdit ? (
          <View style={{ marginBottom: 2 }}>
            <Text style={{ fontSize: 11, fontWeight: "900", color: theme.colors.textMuted, letterSpacing: 1.4, textTransform: "uppercase" }}>
              Step 1
            </Text>
            <Text style={{ fontSize: 17, fontWeight: "800", color: theme.colors.text, marginTop: 4 }}>
              Basics
            </Text>
            <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
              Name the test, describe it, and add a cover students will recognize.
            </Text>
          </View>
          ) : null}

          <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
            <TextInput value={name} onChangeText={setName} placeholder="Test name" placeholderTextColor={placeholderColor} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, fontSize: 24, fontWeight: "800", color: theme.colors.text }} />
            <View style={{ height: 1, backgroundColor: theme.colors.border }} />
            <TextInput value={description} onChangeText={setDescription} multiline blurOnSubmit onSubmitEditing={() => Keyboard.dismiss()} placeholder="Description (optional)" placeholderTextColor={placeholderColor} style={{ paddingHorizontal: 20, paddingVertical: 16, fontSize: 15, lineHeight: 22, color: theme.colors.text, minHeight: 82 }} />
          </View>

        {isAdmin ? (
          <View style={[sectionCardStyle, { padding: 16 }]}>
            <Text style={[theme.typography.caption, { textTransform: "uppercase", marginBottom: 8 }]}>Teacher</Text>
            <TouchableOpacity
              onPress={() => {
                setTeacherSearch("");
                setTeacherModalOpen(true);
              }}
              style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}
            >
              <Text>{teachers.find((t) => t.id === teacherId)?.name ?? teacherId}</Text>
              <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : null}

        {!isEdit ? (
        <View style={{ marginTop: 2, marginBottom: -4 }}>
          <Text style={{ fontSize: 11, fontWeight: "900", color: theme.colors.textMuted, letterSpacing: 1.4, textTransform: "uppercase" }}>
            Step 2
          </Text>
          <Text style={{ fontSize: 17, fontWeight: "800", color: theme.colors.text, marginTop: 4 }}>
            Setup
          </Text>
          <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
            Choose test behavior, then link lessons if you want vocabulary to sync in automatically.
          </Text>
        </View>
        ) : null}

        <View style={sectionCardStyle}>
          <TouchableOpacity onPress={() => setSettingsOpen((v) => !v)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: settingsOpen ? 1 : 0, borderBottomColor: theme.colors.border }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>2A. Test settings</Text>
              {!settingsOpen ? (
                <Text style={{ marginTop: 4, fontSize: 12, color: theme.colors.textMuted }}>{settingsSummary}</Text>
              ) : null}
            </View>
            <Ionicons name={settingsOpen ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
          {settingsOpen ? (
            <View style={{ padding: 14, gap: 10 }}>
              <View>
                <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Time limit (min)</Text>
                <TextInput value={testSettings.time_limit_minutes == null ? "" : String(testSettings.time_limit_minutes)} onChangeText={(t) => setTestSettings((prev) => ({ ...prev, time_limit_minutes: t.trim() ? Number(t) || null : null }))} keyboardType="numeric" placeholder="Optional" placeholderTextColor={theme.colors.textMuted} style={inputStyle} />
              </View>
              <View>
                <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>Attempts</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {(["1", "2", "unlimited"] as const).map((v) => {
                    const active = String(testSettings.attempts_allowed) === v;
                    return (
                      <TouchableOpacity
                        key={v}
                        onPress={() => setTestSettings((prev) => ({ ...prev, attempts_allowed: v === "unlimited" ? "unlimited" : (Number(v) as 1 | 2) }))}
                        style={v === "unlimited"
                          ? { flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1, alignItems: "center", borderColor: active ? accentPurple : theme.colors.border, backgroundColor: active ? accentPurpleSoft : theme.colors.surfaceAlt }
                          : { width: 32, paddingVertical: 6, borderRadius: 6, borderWidth: 1, alignItems: "center", borderColor: active ? accentPurple : theme.colors.border, backgroundColor: active ? accentPurpleSoft : theme.colors.surfaceAlt }
                        }
                      >
                        <Text style={{ fontSize: v === "unlimited" ? 11 : 10, fontWeight: "800", color: active ? accentPurple : theme.colors.text }}>{v === "unlimited" ? "Unlimited" : v}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <TouchableOpacity onPress={() => setTestSettings((prev) => ({ ...prev, randomize_questions: !prev.randomize_questions }))}>
                <Text style={{ color: accentPurple, fontWeight: "700", fontSize: 11 }}>{testSettings.randomize_questions ? "On" : "Off"} - Randomize order</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setTestSettings((prev) => ({ ...prev, randomize_mcq_options: !prev.randomize_mcq_options }))}>
                <Text style={{ color: accentPurple, fontWeight: "700", fontSize: 11 }}>{testSettings.randomize_mcq_options ? "On" : "Off"} - Randomize MCQ</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={sectionCardStyle}>
          <TouchableOpacity onPress={() => setLinkedLessonsOpen((v) => !v)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: linkedLessonsOpen ? 1 : 0, borderBottomColor: theme.colors.border }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>2B. Linked lessons</Text>
                {linkedLessonIds.length > 0 ? (
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: accentPurpleSoft }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: accentPurple }}>{linkedLessonIds.length}</Text>
                  </View>
                ) : null}
              </View>
              {!linkedLessonsOpen ? (
                <Text style={{ marginTop: 4, fontSize: 12, color: theme.colors.textMuted }}>{linkedLessonsSummary}</Text>
              ) : null}
            </View>
            <Ionicons name={linkedLessonsOpen ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
          {linkedLessonsOpen ? (
            <View style={{ padding: 14, gap: 8 }}>
              <TouchableOpacity
                onPress={() => setLessonSearch((v) => v === "__open__" ? "" : "__open__")}
                style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}
              >
                <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Add lesson...</Text>
                <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
              </TouchableOpacity>
              {lessonSearch === "__open__" ? (
                <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, overflow: "hidden", backgroundColor: theme.colors.surface, maxHeight: 200 }}>
                  <ScrollView nestedScrollEnabled>
                    {lessons.filter((l) => !linkedLessonIds.includes(l.id)).map((l, idx, arr) => (
                      <TouchableOpacity key={l.id} onPress={() => { setLinkedLessonIds((prev) => [...prev, l.id]); setLessonSearch(""); }} style={{ paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderBottomColor: theme.colors.border }}>
                        <Text style={{ fontSize: 12, color: theme.colors.text }} numberOfLines={2}>{l.title}</Text>
                      </TouchableOpacity>
                    ))}
                    {lessons.filter((l) => !linkedLessonIds.includes(l.id)).length === 0 ? (
                      <Text style={{ padding: 12, fontSize: 12, color: theme.colors.textMuted }}>No lessons available</Text>
                    ) : null}
                  </ScrollView>
                </View>
              ) : null}
              {linkedLessonIds.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {linkedLessonIds.map((id) => {
                    const lesson = lessons.find((l) => l.id === id);
                    return (
                      <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, backgroundColor: accentPurpleSoft, borderWidth: 1, borderColor: accentPurple }}>
                        <Text style={{ fontSize: 10, fontWeight: "700", color: accentPurple }} numberOfLines={1}>{lesson?.title ?? id}</Text>
                        <TouchableOpacity onPress={() => setLinkedLessonIds((prev) => prev.filter((x) => x !== id))}>
                          <Ionicons name="close-circle" size={13} color={accentPurple} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {!isEdit ? (
        <View style={{ marginTop: 2, marginBottom: -4 }}>
          <Text style={{ fontSize: 11, fontWeight: "900", color: theme.colors.textMuted, letterSpacing: 1.4, textTransform: "uppercase" }}>
            Step 3
          </Text>
          <Text style={{ fontSize: 17, fontWeight: "800", color: theme.colors.text, marginTop: 4 }}>
            Vocabulary
          </Text>
          <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
            Mix synced lesson vocabulary with manual words, then expand the rows you want to refine.
          </Text>
        </View>
        ) : null}

        <View style={sectionCardStyle}>
          <TouchableOpacity
            onPress={() => setVocabSectionOpen((v) => !v)}
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, borderBottomWidth: vocabSectionOpen ? 1 : 0, borderBottomColor: theme.colors.border }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>3. Vocabulary</Text>
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: accentPurpleSoft }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: accentPurple }}>{words.length}</Text>
                </View>
                <TouchableOpacity onPress={() => setHelpBubble((v) => v === "vocab" ? null : "vocab")} style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: theme.colors.textMuted, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 9, fontWeight: "900", color: theme.colors.textMuted }}>?</Text>
                </TouchableOpacity>
              </View>
              {!vocabSectionOpen ? (
                <Text style={{ marginTop: 4, fontSize: 12, color: theme.colors.textMuted }}>{vocabSummary}</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {vocabSectionOpen ? (
                <>
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation?.(); handleEnrichVocabularyWithAI(); }}
                    disabled={!canUseAI || aiVocabLoading}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: accentPurple, backgroundColor: accentPurpleSoft, opacity: !canUseAI || aiVocabLoading ? 0.6 : 1 }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: accentPurple }}>{aiVocabLoading ? "AI..." : "AI Fill"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation?.(); setWords((w) => [...w, { key: uid(), en: "", pt: "", sp: "", se: "" }]); }}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: accentPurpleSoft }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: accentPurple }}>+ Add</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              <Ionicons name={vocabSectionOpen ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.textMuted} />
            </View>
          </TouchableOpacity>
          {helpBubble === "vocab" ? (
            <View style={{ marginHorizontal: 14, marginBottom: 10, padding: 10, borderRadius: 10, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ fontSize: 11, color: theme.colors.textMuted, lineHeight: 16 }}>Add the words or terms for this test. Each word has an English side and a target language side. Context sentences are optional but help AI generate better questions.</Text>
            </View>
          ) : null}
          {vocabSectionOpen ? (
          <>
          <View style={{ marginHorizontal: 12, marginTop: 2, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.text }}>
              {linkedWordCount} synced from lessons - {manualWordCount} added manually
            </Text>
            <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 4 }}>
              Removing a linked lesson removes its synced vocabulary from this test.
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 }}>
            {words.map((w, i) => {
              const isOpen = !!vocabOpen[w.key];
              return (
                <View
                  key={w.key}
                  style={[
                    { borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 14, overflow: "hidden", backgroundColor: theme.isDark ? theme.colors.surface : theme.colors.surfaceAlt },
                    isOpen ? { width: "100%" } : { flexBasis: "48%", flexGrow: 1 },
                  ]}
                >
                  <TouchableOpacity
                    onPress={() => setVocabOpen((prev) => ({ ...prev, [w.key]: !isOpen }))}
                    style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 10 }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.textMuted }}>#{i + 1}</Text>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: theme.colors.text, marginTop: 2 }} numberOfLines={1}>{w.en || "English"}</Text>
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 1 }} numberOfLines={1}>{w.pt || "Target"}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {words.length > 1 && !isOpen ? (
                        <TouchableOpacity onPress={() => setWords((prev) => prev.filter((x) => x.key !== w.key))}>
                          <Ionicons name="trash-outline" size={13} color={theme.colors.danger} />
                        </TouchableOpacity>
                      ) : null}
                      <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={13} color={theme.colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                  {isOpen ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, padding: 10, gap: 8 }}>
                      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                        {words.length > 1 ? (
                          <TouchableOpacity onPress={() => setWords((prev) => prev.filter((x) => x.key !== w.key))}>
                            <Ionicons name="trash-outline" size={15} color={theme.colors.danger} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <View>
                        <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>English</Text>
                        <TextInput value={w.en} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, en: t } : x)))} placeholder="English term" placeholderTextColor={placeholderColor} style={inputStyle} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Target language</Text>
                        <TextInput value={w.pt} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, pt: t } : x)))} placeholder="Portuguese (or target)" placeholderTextColor={placeholderColor} style={inputStyle} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Context (target)</Text>
                        <TextInput value={w.sp} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, sp: t } : x)))} placeholder="Example sentence" placeholderTextColor={placeholderColor} style={inputStyle} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Context (English)</Text>
                        <TextInput value={w.se} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, se: t } : x)))} placeholder="Example sentence" placeholderTextColor={placeholderColor} style={inputStyle} />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
          </>
          ) : null}
        </View>

        {!isEdit ? (
        <View style={{ marginTop: 2, marginBottom: -4 }}>
          <Text style={{ fontSize: 11, fontWeight: "900", color: theme.colors.textMuted, letterSpacing: 1.4, textTransform: "uppercase" }}>
            Step 4
          </Text>
          <Text style={{ fontSize: 17, fontWeight: "800", color: theme.colors.text, marginTop: 4 }}>
            Questions
          </Text>
          <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
            Turn your vocabulary into questions and use templates or AI when it saves time.
          </Text>
        </View>
        ) : null}

        <View style={[sectionCardStyle, { padding: 16 }]}>
          <View style={{ marginBottom: 8 }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[theme.typography.caption, { textTransform: "uppercase" }]}>4. Questions</Text>
                <TouchableOpacity onPress={() => setHelpBubble((v) => v === "questions" ? null : "questions")} style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: theme.colors.textMuted, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 9, fontWeight: "900", color: theme.colors.textMuted }}>?</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 4 }}>{questionsSummary}</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                onPress={handleGenerateQuestionsFromVocabulary}
                disabled={!canUseAI || aiQuestionsLoading}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: accentPurple,
                  backgroundColor: accentPurpleSoft,
                  opacity: !canUseAI || aiQuestionsLoading ? 0.6 : 1,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "800", color: accentPurple }}>{aiQuestionsLoading ? "AI..." : "AI Gen"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTemplatePickerOpen((v) => !v)}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border }}
              >
                <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.text }}>Template</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setQuestions((q) => [...q, mapQuestion(ensureQuestionDefaults(null))])}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: accentPurpleSoft }}
              >
                <Text style={{ fontSize: 11, fontWeight: "800", color: accentPurple }}>+ Add</Text>
              </TouchableOpacity>
            </View>
          </View>
          {helpBubble === "questions" ? (
            <View style={{ marginHorizontal: 0, marginBottom: 10, padding: 10, borderRadius: 10, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ fontSize: 11, color: theme.colors.textMuted, lineHeight: 16 }}>Design each question students will answer. Choose how the question is shown (text, audio, image) and how they answer (specific, open, multiple choice). Tap a question to expand it.</Text>
            </View>
          ) : null}
          {templatePickerOpen ? (
            <View style={{ marginBottom: 10, gap: 8 }}>
              {TEMPLATE_PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => {
                    setQuestions((prev) =>
                      prev.concat(
                        mapQuestion(
                          ensureQuestionDefaults({
                            ...p.build(),
                            prompt_text: p.build().prompt_text ?? "",
                            correct_text: "",
                          })
                        )
                      )
                    );
                    setTemplatePickerOpen(false);
                  }}
                  style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700" }}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {questions.map((q, i) => {
            const isOpen = !!questionOpen[q.key];
            const isAdvOpen = !!advancedOpen[q.key];
            const PROMPT_FORMAT_LABELS: Record<string, string> = { text: "Text", fill_blank: "Fill in Blank", audio: "Audio", image: "Image" };
            const ANSWER_FORMAT_LABELS: Record<string, string> = { specific: "Specific", open: "Open", mcq: "Multiple Choice" };
            const qDropdown = dropdownOpen[q.key] ?? null;
            return (
              <View key={q.key} style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 14, overflow: "hidden", backgroundColor: theme.isDark ? theme.colors.surface : theme.colors.surfaceAlt, marginBottom: 10 }}>
                {/* Collapsed header */}
                <TouchableOpacity
                  onPress={() => setQuestionOpen((prev) => ({ ...prev, [q.key]: !isOpen }))}
                  style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 }}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: theme.colors.text }}>
                      Question {i + 1}
                    </Text>
                    {q.prompt_text.trim() ? (
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted }} numberOfLines={1}>{q.prompt_text}</Text>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {questions.length > 1 ? (
                      <TouchableOpacity onPress={() => setQuestions((prev) => prev.filter((x) => x.key !== q.key))}>
                        <Ionicons name="trash-outline" size={15} color={theme.colors.danger} />
                      </TouchableOpacity>
                    ) : null}
                    <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={15} color={theme.colors.textMuted} />
                  </View>
                </TouchableOpacity>

                {isOpen ? (
                  <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: theme.colors.border, padding: 12 }}>
                    {/* Two format dropdowns side by side */}
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {/* Prompt format */}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Prompt format</Text>
                        <TouchableOpacity
                          onPress={() => setDropdownOpen((prev) => ({ ...prev, [q.key]: qDropdown === "prompt" ? null : "prompt" }))}
                          style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}
                        >
                          <Text style={{ fontSize: 13, color: theme.colors.text }}>{PROMPT_FORMAT_LABELS[q.prompt_format]}</Text>
                          <Ionicons name={qDropdown === "prompt" ? "chevron-up" : "chevron-down"} size={14} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                        {qDropdown === "prompt" ? (
                          <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, marginTop: 4, overflow: "hidden", backgroundColor: theme.colors.surface }}>
                            {(["text", "fill_blank", "audio", "image"] as const).map((pf, idx) => (
                              <TouchableOpacity
                                key={pf}
                                onPress={() => { replaceQuestion(q.key, (cur) => ({ ...cur, prompt_format: pf })); setDropdownOpen((prev) => ({ ...prev, [q.key]: null })); }}
                                style={{ paddingVertical: 9, paddingHorizontal: 12, backgroundColor: q.prompt_format === pf ? accentPurpleSoft : "transparent", borderBottomWidth: idx < 3 ? 1 : 0, borderBottomColor: theme.colors.border }}
                              >
                                <Text style={{ fontSize: 13, fontWeight: q.prompt_format === pf ? "700" : "400", color: q.prompt_format === pf ? accentPurple : theme.colors.text }}>{PROMPT_FORMAT_LABELS[pf]}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : null}
                      </View>
                      {/* Answer format */}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Answer format</Text>
                        <TouchableOpacity
                          onPress={() => setDropdownOpen((prev) => ({ ...prev, [q.key]: qDropdown === "answer" ? null : "answer" }))}
                          style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}
                        >
                          <Text style={{ fontSize: 13, color: theme.colors.text }}>{ANSWER_FORMAT_LABELS[q.answer_format]}</Text>
                          <Ionicons name={qDropdown === "answer" ? "chevron-up" : "chevron-down"} size={14} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                        {qDropdown === "answer" ? (
                          <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, marginTop: 4, overflow: "hidden", backgroundColor: theme.colors.surface }}>
                            {(["specific", "open", "mcq"] as const).map((af, idx) => (
                              <TouchableOpacity
                                key={af}
                                onPress={() => { replaceQuestion(q.key, (cur) => ({ ...cur, answer_format: af })); setDropdownOpen((prev) => ({ ...prev, [q.key]: null })); }}
                                style={{ paddingVertical: 9, paddingHorizontal: 12, backgroundColor: q.answer_format === af ? accentPurpleSoft : "transparent", borderBottomWidth: idx < 2 ? 1 : 0, borderBottomColor: theme.colors.border }}
                              >
                                <Text style={{ fontSize: 13, fontWeight: q.answer_format === af ? "700" : "400", color: q.answer_format === af ? accentPurple : theme.colors.text }}>{ANSWER_FORMAT_LABELS[af]}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </View>

                    <TouchableOpacity onPress={() => replaceQuestion(q.key, (cur) => ({ ...cur, required: !cur.required }))}>
                      <Text style={{ color: accentPurple, fontWeight: "700", fontSize: 12 }}>
                        {q.required ? "Required" : "Optional"}
                      </Text>
                    </TouchableOpacity>

                    {/* Audio upload block — at top when prompt_format is audio */}
                    {q.prompt_format === "audio" ? (
                      <View style={{ gap: 8 }}>
                        <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 }}>Audio</Text>
                        {q.audio_url.trim() ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }}>
                            <TouchableOpacity
                              onPress={async () => {
                                const isPlaying = !!playingAudio[q.key];
                                if (isPlaying) {
                                  await audioSoundRef.sound?.stopAsync();
                                  audioSoundRef.sound = null;
                                  setPlayingAudio((prev) => ({ ...prev, [q.key]: false }));
                                } else {
                                  const { sound } = await Audio.Sound.createAsync({ uri: q.audio_url });
                                  audioSoundRef.sound = sound;
                                  setPlayingAudio((prev) => ({ ...prev, [q.key]: true }));
                                  await sound.playAsync();
                                  sound.setOnPlaybackStatusUpdate((status) => {
                                    if (status.isLoaded && status.didJustFinish) {
                                      setPlayingAudio((prev) => ({ ...prev, [q.key]: false }));
                                      audioSoundRef.sound = null;
                                    }
                                  });
                                }
                              }}
                              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accentPurple, alignItems: "center", justifyContent: "center" }}
                            >
                              <Ionicons name={playingAudio[q.key] ? "stop" : "play"} size={16} color="#fff" />
                            </TouchableOpacity>
                            <Text style={{ flex: 1, fontSize: 11, color: theme.colors.textMuted }} numberOfLines={1}>{q.audio_url.split("/").pop()}</Text>
                            <TouchableOpacity onPress={() => replaceQuestion(q.key, (cur) => ({ ...cur, audio_url: "" }))}>
                              <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => pickQuestionAudio(i)} disabled={uploadingQuestionIndex === i} style={{ paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", opacity: uploadingQuestionIndex === i ? 0.6 : 1 }}>
                            <Ionicons name="musical-notes-outline" size={20} color={theme.colors.textMuted} />
                            <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.textMuted, marginTop: 4 }}>{uploadingQuestionIndex === i ? "Uploading..." : "Upload audio"}</Text>
                          </TouchableOpacity>
                        )}
                        <View>
                          <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Transcript (optional)</Text>
                          <TextInput value={q.audio_transcript} onChangeText={(t) => replaceQuestion(q.key, (cur) => ({ ...cur, audio_transcript: t }))} placeholder="Accessibility / teacher reference" placeholderTextColor={placeholderColor} style={inputStyle} />
                        </View>
                      </View>
                    ) : null}

                    {/* Image block — match web: available for text/audio/image prompts and mcq answers */}
                    {(q.prompt_format === "text" ||
                      q.prompt_format === "audio" ||
                      q.prompt_format === "image" ||
                      q.answer_format === "mcq") ? (
                      <View style={{ gap: 8 }}>
                        <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 }}>{q.prompt_format === "image" ? "Image prompt" : "Optional image"}</Text>
                        {q.image_url.trim() ? (
                          <View>
                            <Image source={{ uri: q.image_url.trim() }} style={{ width: "100%", height: 160, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }} resizeMode="cover" />
                            <TouchableOpacity onPress={() => replaceQuestion(q.key, (cur) => ({ ...cur, image_url: "" }))} style={{ position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.danger, alignItems: "center", justifyContent: "center" }}>
                              <Ionicons name="close" size={14} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        ) : null}
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <TouchableOpacity onPress={() => pickQuestionImage(i)} disabled={uploadingQuestionIndex === i} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, alignItems: "center", opacity: uploadingQuestionIndex === i ? 0.6 : 1 }}>
                            <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.text }}>{uploadingQuestionIndex === i ? "Uploading..." : "Upload image"}</Text>
                          </TouchableOpacity>
                          {canUseAI ? (
                            <TouchableOpacity onPress={() => handleGenerateImageForQuestion(i)} disabled={aiImageIndex === i} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: accentPurple, backgroundColor: accentPurpleSoft, alignItems: "center", opacity: aiImageIndex === i ? 0.6 : 1 }}>
                              <Text style={{ fontSize: 11, fontWeight: "700", color: accentPurple }}>{aiImageIndex === i ? "AI..." : "AI image"}</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    ) : null}

                    {/* Question prompt */}
                    <View>
                      <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Question</Text>
                      <TextInput value={q.prompt_text} onChangeText={(t) => replaceQuestion(q.key, (cur) => ({ ...cur, prompt_text: t }))} placeholder="Write the question students will see…" placeholderTextColor={placeholderColor} multiline style={inputStyle} />
                    </View>

                    {q.answer_format === "specific" ? (
                      <>
                        <View>
                          <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Correct answer</Text>
                          <TextInput
                            value={q.correct_text}
                            onChangeText={(t) =>
                              replaceQuestion(q.key, (cur) => ({
                                ...cur,
                                correct_text: t,
                                fill_blank_character_count:
                                  cur.prompt_format === "fill_blank" ? Math.max(1, t.trim().length || 1) : cur.fill_blank_character_count,
                              }))
                            }
                            placeholder="Correct answer"
                            placeholderTextColor={placeholderColor}
                            style={inputStyle}
                          />
                        </View>
                        <View>
                          <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Accepted alternatives</Text>
                          <TextInput value={q.accepted_texts.join(", ")} onChangeText={(t) => replaceQuestion(q.key, (cur) => ({ ...cur, accepted_texts: t.split(",").map((x) => x.trim()).filter(Boolean) }))} placeholder="Comma separated" placeholderTextColor={placeholderColor} style={inputStyle} />
                        </View>
                      </>
                    ) : null}
                    {q.answer_format === "open" ? (
                      <View>
                        <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Reference answer</Text>
                        <TextInput value={q.teacher_reference_answer} onChangeText={(t) => replaceQuestion(q.key, (cur) => ({ ...cur, teacher_reference_answer: t }))} placeholder="Teacher reference / rubric (optional)" placeholderTextColor={placeholderColor} multiline style={inputStyle} />
                      </View>
                    ) : null}
                    {q.answer_format === "mcq" ? (
                      <View style={{ gap: 8 }}>
                        {q.mcq_options.map((opt, oi) => (
                          <View key={opt.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <TouchableOpacity onPress={() => replaceQuestion(q.key, (cur) => ({ ...cur, mcq_correct_option_id: opt.id }))}>
                              <Ionicons name={q.mcq_correct_option_id === opt.id ? "radio-button-on" : "radio-button-off"} size={18} color={accentPurple} />
                            </TouchableOpacity>
                            <TextInput value={opt.text} onChangeText={(t) => replaceQuestion(q.key, (cur) => ({ ...cur, mcq_options: cur.mcq_options.map((x, idx) => (idx === oi ? { ...x, text: t } : x)) }))} placeholder={`Option ${oi + 1}`} placeholderTextColor={placeholderColor} style={[inputStyle, { flex: 1 }]} />
                            <TouchableOpacity onPress={() => replaceQuestion(q.key, (cur) => { const next = cur.mcq_options.filter((_, idx) => idx !== oi); return { ...cur, mcq_options: next.length >= 2 ? next : [...next, { id: uid(), text: "" }] }; })}>
                              <Text style={{ color: theme.colors.danger, fontSize: 12 }}>Del</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity onPress={() => replaceQuestion(q.key, (cur) => ({ ...cur, mcq_options: [...cur.mcq_options, { id: uid(), text: "" }] }))}>
                          <Text style={{ color: accentPurple, fontWeight: "700" }}>+ Add option</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    {q.prompt_format === "fill_blank" ? (
                      <TextInput
                        value={String(Math.max(1, q.correct_text.trim().length || q.fill_blank_character_count || 1))}
                        editable={false}
                        placeholderTextColor={placeholderColor}
                        style={[inputStyle, { width: 56, minHeight: 32, paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, textAlign: "center" }]}
                      />
                    ) : null}
                    {/* Advanced options */}
                    <TouchableOpacity
                      onPress={() => setAdvancedOpen((prev) => ({ ...prev, [q.key]: !isAdvOpen }))}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, marginTop: 2 }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: accentPurple }}>Advanced options</Text>
                      <Ionicons name={isAdvOpen ? "chevron-up" : "chevron-down"} size={13} color={accentPurple} />
                    </TouchableOpacity>
                    {isAdvOpen ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {(
                          [
                            ["caseInsensitive", "Case insensitive"],
                            ["ignorePunctuation", "Ignore punctuation"],
                            ["trimSpaces", "Trim spaces"],
                            ["accentInsensitive", "Accent optional"],
                          ] as const
                        ).map(([k, label]) => (
                          <TouchableOpacity
                            key={k}
                            onPress={() => replaceQuestion(q.key, (cur) => ({ ...cur, specific_rules: { ...cur.specific_rules, [k]: !cur.specific_rules[k] } }))}
                            style={{ flexBasis: "48%", flexGrow: 1, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: q.specific_rules[k] ? theme.colors.success : theme.colors.border, backgroundColor: q.specific_rules[k] ? theme.colors.successSoft : "transparent", alignItems: "center" }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: "700", color: q.specific_rules[k] ? theme.colors.success : theme.colors.textMuted }}>{q.specific_rules[k] ? "On " : ""}{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        </View>

      </ScrollView>

      <Modal visible={teacherModalOpen} animationType="slide" transparent onRequestClose={() => setTeacherModalOpen(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} activeOpacity={1} onPress={() => setTeacherModalOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 16, maxHeight: "75%" }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                <Text style={theme.typography.title}>Teacher</Text>
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
                    onPress={() => {
                      setTeacherId(t.id);
                      setTeacherModalOpen(false);
                      if (!isEdit) loadLessonsForTeacher(t.id);
                    }}
                    style={{ paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
                  >
                    <Text style={theme.typography.body}>{t.name}</Text>
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
