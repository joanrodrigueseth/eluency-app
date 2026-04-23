import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
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
  View,
} from "react-native";
import { TouchableOpacity } from "../lib/hapticPressables";
import { Ionicons } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Audio } from "expo-av";
import { decode as decodeBase64 } from "base64-arraybuffer";
import { NavigationProp, RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DraggableFlatList from "react-native-draggable-flatlist";

import { getOrCreateVocabImage } from "../lib/api/imageBank";
import { supabase } from "../lib/supabase";
import { triggerLightImpact, triggerSuccessHaptic } from "../lib/haptics";
import { useAppTheme } from "../lib/theme";
import { DEFAULT_RULES, ensureQuestionDefaults, ensureTestSettings, uid } from "../lib/testDesignMobile";
import { normalizePlanUi } from "../lib/teacherRolePlanRules";
import FloatingToast from "../components/FloatingToast";
import GlassCard from "../components/GlassCard";
import { SkeletonBox } from "../components/SkeletonLoader";
import ThemeToggleButton from "../components/ThemeToggleButton";
import { useFeedbackToast } from "../hooks/useFeedbackToast";

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
  attempts_allowed: number | "unlimited";
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
const AI_RED = "#D94343";
const AI_RED_SOFT = "#FDEDED";
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

const TEMPLATE_PRESET_COPY: Record<string, string> = {
  vocab_recall: "Quick recall prompt for core term translation.",
  picture_naming: "Show an image and ask students to name it.",
  listening_dictation: "Play audio and capture an exact written answer.",
  listening_mcq: "Audio-based comprehension with guided choices.",
  cloze: "Fill the missing word in a short sentence.",
  short_writing: "Open-ended response for writing practice.",
};

const TEMPLATE_ICON_PALETTE = [
  { background: "#EAF3FF", border: "#BBD7FF", icon: "#2F6FDB" },
  { background: "#EAFBF1", border: "#BCE9CF", icon: "#228B57" },
  { background: "#FFF5E8", border: "#F5D1A5", icon: "#C77100" },
  { background: "#F3EEFF", border: "#D6C5FF", icon: "#6E45CE" },
  { background: "#FFEFF3", border: "#F7C2D0", icon: "#C63A61" },
  { background: "#EAFBFA", border: "#BCE7E2", icon: "#157F7A" },
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
  const continueButtonBg = theme.isDark ? "#1F3E5A" : accentPurple;
  const continueButtonBorder = theme.isDark ? "#2E5C82" : "transparent";
  const continueButtonText = theme.isDark ? "#CFE6FF" : "#fff";
  const insets = useSafeAreaInsets();
  const { showToast, toastProps } = useFeedbackToast({ bottom: Math.max(insets.bottom, 20) + 12 });
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
  const aiThinking = useRef(new Animated.Value(0)).current;

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

  const normalizeAttemptsDefault = useCallback((settings: TestSettings): TestSettings => {
    const attempts = settings.attempts_allowed;
    if (typeof attempts === "number" && attempts >= 1 && attempts <= 10) {
      return settings;
    }
    return { ...settings, attempts_allowed: "unlimited" };
  }, []);

  const [testSettings, setTestSettings] = useState<TestSettings>(() => ({
    ...(ensureTestSettings(null) as TestSettings),
    attempts_allowed: "unlimited",
  }));
  const [aiQuestionsLoading, setAiQuestionsLoading] = useState(false);
  const [thinkingDots, setThinkingDots] = useState(".");
  const [aiVocabLoading, setAiVocabLoading] = useState(false);
  const [aiImageIndex, setAiImageIndex] = useState<number | null>(null);
  const [uploadingQuestionIndex, setUploadingQuestionIndex] = useState<number | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [lessonPickerOpen, setLessonPickerOpen] = useState(false);
  const [attemptsPickerOpen, setAttemptsPickerOpen] = useState(false);
  const [vocabOpen, setVocabOpen] = useState<Record<string, boolean>>({});
  const [vocabSectionOpen, setVocabSectionOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState<Record<string, boolean>>({});

  const confirmRemoveVocabWord = useCallback((word: WordRow & { sp: string; se: string }, index: number) => {
    const label = word.en.trim() || word.pt.trim() || `Word ${index + 1}`;
    Alert.alert(
      "Delete vocabulary word",
      `Remove \"${label}\" from this test?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => setWords((prev) => prev.filter((x) => x.key !== word.key)),
        },
      ]
    );
  }, []);
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [dropdownOpen, setDropdownOpen] = useState<Record<string, "prompt" | "answer" | null>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linkedLessonsOpen, setLinkedLessonsOpen] = useState(false);
  const [helpBubble, setHelpBubble] = useState<"vocab" | "questions" | null>(null);
  const [playingAudio, setPlayingAudio] = useState<Record<string, boolean>>({});
  const audioSoundRef = useState<{ sound: Audio.Sound | null }>({ sound: null })[0];
  const [wizardStep, setWizardStep] = useState(1);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

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
          setTestSettings(normalizeAttemptsDefault(ensureTestSettings((cfg as any).test_settings) as TestSettings));
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
          setTestSettings({
            ...(ensureTestSettings(null) as TestSettings),
            attempts_allowed: "unlimited",
          });
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
  }, [isEdit, testId, navigation, loadLessonsForTeacher, normalizeAttemptsDefault]);

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
  const filteredLinkableLessons = lessons.filter(
    (l) => !linkedLessonIds.includes(l.id) && l.title.toLowerCase().includes(lessonSearch.toLowerCase())
  );
  const selectedAttemptsCount =
    typeof testSettings.attempts_allowed === "number"
      ? testSettings.attempts_allowed
      : null;

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

  useEffect(() => {
    if (!aiQuestionsLoading) {
      aiThinking.stopAnimation();
      aiThinking.setValue(0);
      setThinkingDots(".");
      return;
    }

    const spin = Animated.loop(
      Animated.timing(aiThinking, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();

    const frames = [".", "..", "...", "...."];
    let frameIndex = 0;
    const dotsTimer = setInterval(() => {
      frameIndex = (frameIndex + 1) % frames.length;
      setThinkingDots(frames[frameIndex]);
    }, 280);

    return () => {
      spin.stop();
      clearInterval(dotsTimer);
      aiThinking.setValue(0);
    };
  }, [aiQuestionsLoading, aiThinking]);

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
      showToast("Test name is required.", "danger");
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
      showToast("A fill-in-the-blank question has the wrong answer length. Open the web editor to fix it.", "danger");
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
        showToast("Test updated.", "success");
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
        showToast("Test saved.", "success");
      }
      navigation.navigate("Tests", {
        flashMessage: isEdit ? "Test updated." : "Test saved.",
        flashTone: "success",
      });
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Save failed", "danger");
    } finally {
      setSaving(false);
    }
  };

  const advanceWizard = () => {
    if (wizardStep === 1 && !name.trim()) {
      showToast("Please add a test name first.", "danger");
      return;
    }
    Keyboard.dismiss();
    setWizardStep((s) => Math.min(s + 1, 4));
  };

  const WIZARD_TITLES = ["", "Test Identity", "Test Settings", "Lessons & Vocabulary", "Questions"];
  const WIZARD_SUBTITLES = [
    "",
    "Give your test a name, cover image, and description so students know exactly what to expect.",
    "Configure how students experience this test — timing, attempts, and question order.",
    "Connect lessons to pull vocabulary automatically, or add words manually.",
    "Build the questions students will answer. Use templates or let AI generate from your vocabulary.",
  ];

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

  if (!isEdit) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {/* ── Modals (sit above everything) ── */}
        <Modal visible={categoryPickerOpen} transparent animationType="fade" onRequestClose={() => setCategoryPickerOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => setCategoryPickerOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }}>
            <TouchableOpacity activeOpacity={1} onPress={() => undefined} style={{ width: "100%", maxWidth: 400, borderRadius: 24, backgroundColor: theme.colors.surface, overflow: "hidden", maxHeight: 500 }}>
              <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.text }}>Category</Text>
                <TouchableOpacity onPress={() => setCategoryPickerOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close" size={22} color={theme.colors.textMuted} /></TouchableOpacity>
              </View>
              <ScrollView>
                {TEST_CATEGORIES.map((opt, idx) => {
                  const selected = opt === type;
                  return (
                    <TouchableOpacity key={opt} activeOpacity={0.8} onPress={() => { setType(opt); setCategoryPickerOpen(false); }}
                      style={{ paddingHorizontal: 20, paddingVertical: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: selected ? accentPurpleSoft : "transparent", borderBottomWidth: idx === TEST_CATEGORIES.length - 1 ? 0 : 1, borderBottomColor: theme.colors.border }}>
                      <Text style={{ fontSize: 15, color: theme.colors.text, fontWeight: selected ? "700" : "400" }}>{opt}</Text>
                      {selected && <Ionicons name="checkmark" size={18} color={accentPurple} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <Modal visible={lessonPickerOpen} animationType="fade" transparent onRequestClose={() => setLessonPickerOpen(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 16, paddingVertical: 32 }} activeOpacity={1} onPress={() => setLessonPickerOpen(false)}>
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 500 }}>
              <View style={{ backgroundColor: theme.colors.surface, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" }}>
                {/* Header */}
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View>
                    <Text style={{ fontSize: 17, fontWeight: "800", color: theme.colors.text }}>Link Lessons</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>{linkedLessonIds.length} linked</Text>
                  </View>
                  <TouchableOpacity onPress={() => setLessonPickerOpen(false)} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: accentPurple }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: "#fff" }}>Done</Text>
                  </TouchableOpacity>
                </View>
                {/* Search */}
                <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <TextInput value={lessonSearch} onChangeText={setLessonSearch} placeholder="Search..." placeholderTextColor={theme.colors.textMuted} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, fontSize: 13 }} />
                </View>
                {/* Column headers */}
                <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: theme.colors.border, backgroundColor: accentPurpleSoft }}>
                    <Text style={{ fontSize: 9, fontWeight: "800", color: accentPurple, letterSpacing: 1.2, textTransform: "uppercase", textAlign: "center" }}>Linked ({linkedLessonIds.length})</Text>
                  </View>
                  <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10 }}>
                    <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", textAlign: "center" }}>Available ({filteredLinkableLessons.length})</Text>
                  </View>
                </View>
                {/* Split columns */}
                <View style={{ flexDirection: "row", maxHeight: 360 }}>
                  {/* Left: linked */}
                  <ScrollView style={{ flex: 1, borderRightWidth: 1, borderRightColor: theme.colors.border }} keyboardShouldPersistTaps="handled">
                    {linkedLessonIds.length === 0 ? (
                      <View style={{ padding: 16, alignItems: "center" }}>
                        <Text style={{ fontSize: 11, color: theme.colors.textMuted, textAlign: "center", lineHeight: 16 }}>No lessons linked yet.{"\n"}Tap from the right →</Text>
                      </View>
                    ) : linkedLessonIds.filter((id) => { const l = lessons.find((x) => x.id === id); return !lessonSearch || l?.title.toLowerCase().includes(lessonSearch.toLowerCase()); }).map((id) => {
                      const lesson = lessons.find((l) => l.id === id);
                      return (
                        <TouchableOpacity key={id} onPress={() => setLinkedLessonIds((prev) => prev.filter((x) => x !== id))} activeOpacity={0.8}
                          style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: accentPurpleSoft, flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                          <Ionicons name="remove-circle" size={14} color={accentPurple} style={{ marginTop: 1, flexShrink: 0 }} />
                          <Text style={{ flex: 1, fontSize: 11, fontWeight: "700", color: accentPurple, lineHeight: 15 }} numberOfLines={4}>{lesson?.title ?? id}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  {/* Right: available */}
                  <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                    {filteredLinkableLessons.length === 0 ? (
                      <View style={{ padding: 16, alignItems: "center" }}>
                        <Text style={{ fontSize: 11, color: theme.colors.textMuted, textAlign: "center" }}>No lessons found</Text>
                      </View>
                    ) : filteredLinkableLessons.map((l) => (
                      <TouchableOpacity key={l.id} onPress={() => setLinkedLessonIds((prev) => [...prev, l.id])} activeOpacity={0.8}
                        style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                        <Ionicons name="add-circle-outline" size={14} color={theme.colors.textMuted} style={{ marginTop: 1, flexShrink: 0 }} />
                        <Text style={{ flex: 1, fontSize: 11, color: theme.colors.text, lineHeight: 15 }} numberOfLines={4}>{l.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <Modal visible={attemptsPickerOpen} animationType="fade" transparent onRequestClose={() => setAttemptsPickerOpen(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }} activeOpacity={1} onPress={() => setAttemptsPickerOpen(false)}>
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400 }}>
              <View style={{ backgroundColor: theme.colors.surface, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" }}>
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1, paddingRight: 10 }}><Text style={[theme.typography.title, { fontSize: 18 }]}>Limit Attempts?</Text><Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>How many attempts would you like to set?</Text></View>
                  <TouchableOpacity onPress={() => setAttemptsPickerOpen(false)} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: accentPurple }}><Text style={{ fontSize: 13, fontWeight: "800", color: "#fff" }}>Done</Text></TouchableOpacity>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
                  <TouchableOpacity onPress={() => setTestSettings((prev) => ({ ...prev, attempts_allowed: "unlimited" }))} activeOpacity={0.85}
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: testSettings.attempts_allowed === "unlimited" ? "#F2F3F5" : "transparent" }}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: testSettings.attempts_allowed === "unlimited" ? "#ECEDEF" : "transparent", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                      {testSettings.attempts_allowed === "unlimited" ? <Ionicons name="infinite" size={13} color="#2B2B2B" /> : null}
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, color: "#2B2B2B" }}>Unlimited Attempts</Text>
                  </TouchableOpacity>
                  {Array.from({ length: 10 }, (_, idx) => idx + 1).map((n) => {
                    const sel = testSettings.attempts_allowed === n;
                    return (
                      <TouchableOpacity key={n} onPress={() => setTestSettings((prev) => ({ ...prev, attempts_allowed: n }))} activeOpacity={0.85}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: sel ? accentPurpleSoft : "transparent" }}>
                        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: sel ? 0 : 1.5, borderColor: theme.colors.border, backgroundColor: sel ? accentPurple : "transparent", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                          {sel ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                        </View>
                        <Text style={{ flex: 1, fontSize: 13, color: theme.colors.text }}>{n} {n === 1 ? "attempt" : "attempts"}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <Modal visible={templatePickerOpen} animationType="fade" transparent onRequestClose={() => setTemplatePickerOpen(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.58)", justifyContent: "center", paddingHorizontal: 16 }} activeOpacity={1} onPress={() => setTemplatePickerOpen(false)}>
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <View style={{ backgroundColor: theme.colors.surface, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" }}>
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: accentPurpleSoft, borderWidth: 1, borderColor: accentPurpleBorder }}>
                      <Ionicons name="layers-outline" size={18} color={accentPurple} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={theme.typography.title}>Question templates</Text>
                      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>Choose a starter and we will add it instantly.</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setTemplatePickerOpen(false)} style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="close" size={16} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
                  {TEMPLATE_PRESETS.map((p, idx) => {
                    const iconColors = TEMPLATE_ICON_PALETTE[idx % TEMPLATE_ICON_PALETTE.length];
                    return (
                      <TouchableOpacity key={p.id} onPress={() => { setQuestions((prev) => prev.concat(mapQuestion(ensureQuestionDefaults({ ...p.build(), prompt_text: p.build().prompt_text ?? "", correct_text: "" })))); setTemplatePickerOpen(false); }}
                        style={{ paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: iconColors.background, borderWidth: 1, borderColor: iconColors.border }}>
                          <Ionicons name="sparkles-outline" size={14} color={iconColors.icon} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "800", color: theme.colors.text }}>{p.label}</Text>
                          <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 3 }}>{TEMPLATE_PRESET_COPY[p.id] ?? "Preconfigured question structure."}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* ── Wizard header ── */}
        <View style={{ paddingTop: Math.max(insets.top, 8), paddingHorizontal: 16, paddingBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity
              onPress={() => { if (wizardStep <= 1) navigation.goBack(); else setWizardStep((s) => s - 1); }}
              style={{ width: 46, height: 46, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name={wizardStep <= 1 ? "close" : "chevron-back"} size={22} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <View style={{ flex: 1, flexDirection: "row", gap: 4 }}>
              {[1, 2, 3, 4].map((s) => (
                <View key={s} style={{ flex: 1, height: 4, borderRadius: 999, backgroundColor: s <= wizardStep ? accentPurple : theme.colors.border }} />
              ))}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ThemeToggleButton />
              <TouchableOpacity onPress={openWebEditor} style={{ paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: accentPurple, backgroundColor: accentPurpleSoft, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="open-outline" size={13} color={accentPurple} />
                <Text style={{ color: accentPurple, fontSize: 11, fontWeight: "800" }}>Web</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ marginTop: 20, marginBottom: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: accentPurple, letterSpacing: 1.4, textTransform: "uppercase" }}>Step {wizardStep} of 4</Text>
            <Text style={{ fontSize: 22, fontWeight: "900", color: theme.colors.text, marginTop: 4 }}>{WIZARD_TITLES[wizardStep]}</Text>
            <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4, lineHeight: 18 }}>{WIZARD_SUBTITLES[wizardStep]}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <View style={{ gap: 16 }}>

            {/* ── Step 1: Test Identity ── */}
            {wizardStep === 1 && (
              <>
                {/* Cover image */}
                <TouchableOpacity onPress={pickCoverImage} activeOpacity={0.9} disabled={coverUploading}>
                  {coverImageUrl.trim() ? (
                    <Image source={{ uri: coverImageUrl.trim() }} style={{ width: "100%", height: 180, borderRadius: 22, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border }} resizeMode="cover" />
                  ) : (
                    <View style={{ width: "100%", height: 160, borderRadius: 22, borderWidth: 1.5, borderColor: theme.colors.border, borderStyle: "dashed", backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center", gap: 10 }}>
                      <Ionicons name="image-outline" size={36} color={theme.colors.textMuted} />
                      <Text style={{ color: theme.colors.textMuted, fontWeight: "700", fontSize: 13 }}>{coverUploading ? "Uploading..." : "Add cover image (optional)"}</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Name + Description */}
                <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                  <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                      Create Test Title:
                    </Text>
                    <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 12 }}>
                      <TextInput value={name} onChangeText={setName} placeholder="" placeholderTextColor={placeholderColor} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} style={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, fontSize: 16, fontWeight: "600", color: theme.colors.text }} />
                    </View>
                  </View>
                  <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                  <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                      Description:
                    </Text>
                    <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 12 }}>
                      <TextInput value={description} onChangeText={setDescription} multiline blurOnSubmit onSubmitEditing={() => Keyboard.dismiss()} placeholder="" placeholderTextColor={placeholderColor} style={{ paddingHorizontal: 0, paddingVertical: 0, fontSize: 15, lineHeight: 22, color: theme.colors.text, minHeight: 58, textAlignVertical: "top" }} />
                    </View>
                  </View>
                </View>

                {/* Admin: teacher picker */}
                {isAdmin ? (
                  <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden", padding: 16 }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Teacher</Text>
                    <TouchableOpacity onPress={() => { setTeacherSearch(""); setTeacherModalOpen(true); }} style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
                      <Text style={{ color: theme.colors.text }}>{teachers.find((t) => t.id === teacherId)?.name ?? teacherId}</Text>
                      <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : null}

                <TouchableOpacity onPress={advanceWizard} style={{ paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: continueButtonBorder, backgroundColor: continueButtonBg, alignItems: "center" }}>
                  <Text style={{ color: continueButtonText, fontSize: 15, fontWeight: "800" }}>Continue →</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Step 2: Test Settings ── */}
            {wizardStep === 2 && (
              <>
                {/* Category */}
                <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                  <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: accentPurple, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Test Category</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 }}>Categorise your test so students and the dashboard can filter it correctly.</Text>
                  </View>
                  <TouchableOpacity activeOpacity={0.8} onPress={() => setCategoryPickerOpen(true)} style={{ margin: 14, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: theme.colors.surfaceAlt, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 15, color: theme.colors.text, fontWeight: "600" }}>{type}</Text>
                    <Ionicons name="chevron-down" size={16} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Settings card */}
                <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                  <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Test Behaviour</Text>
                  </View>

                  {/* Time limit */}
                  <View style={{ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.text, marginBottom: 2 }}>Time Limit</Text>
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted, lineHeight: 15 }}>Set a time limit in minutes. Leave blank for no limit.</Text>
                    </View>
                    <TextInput
                      value={testSettings.time_limit_minutes == null ? "" : String(testSettings.time_limit_minutes)}
                      onChangeText={(t) => setTestSettings((prev) => ({ ...prev, time_limit_minutes: t.trim() ? Number(t) || null : null }))}
                      keyboardType="numeric"
                      placeholder="None"
                      placeholderTextColor={theme.colors.textMuted}
                      style={{ width: 80, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, fontSize: 14, textAlign: "center" }}
                    />
                  </View>

                  {/* Randomize questions */}
                  <TouchableOpacity
                    onPress={() => setTestSettings((prev) => ({ ...prev, randomize_questions: !prev.randomize_questions }))}
                    style={{ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.text, marginBottom: 2 }}>Randomize Question Order</Text>
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted, lineHeight: 15 }}>Each student sees questions in a different order.</Text>
                    </View>
                    <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: testSettings.randomize_questions ? "#2F9E44" : theme.colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", alignSelf: testSettings.randomize_questions ? "flex-end" : "flex-start" }} />
                    </View>
                  </TouchableOpacity>

                  {/* Randomize MCQ options */}
                  <TouchableOpacity
                    onPress={() => setTestSettings((prev) => ({ ...prev, randomize_mcq_options: !prev.randomize_mcq_options }))}
                    style={{ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.text, marginBottom: 2 }}>Randomize MCQ Options</Text>
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted, lineHeight: 15 }}>Shuffle multiple-choice answers so the correct one isn't always in the same position.</Text>
                    </View>
                    <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: testSettings.randomize_mcq_options ? "#2F9E44" : theme.colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", alignSelf: testSettings.randomize_mcq_options ? "flex-end" : "flex-start" }} />
                    </View>
                  </TouchableOpacity>

                  {/* Attempts */}
                  <TouchableOpacity
                    onPress={() => setAttemptsPickerOpen(true)}
                    style={{ paddingHorizontal: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.text, marginBottom: 2 }}>Attempts Allowed</Text>
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted, lineHeight: 15 }}>How many times a student can attempt this test.</Text>
                    </View>
                    <View style={{ marginLeft: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.surfaceAlt, flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text numberOfLines={1} style={{ fontSize: 13, color: theme.colors.text, fontWeight: "700" }}>
                        {testSettings.attempts_allowed === "unlimited" ? "Unlimited" : `${testSettings.attempts_allowed}×`}
                      </Text>
                      <Ionicons name="chevron-down" size={12} color={theme.colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={advanceWizard} style={{ paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: continueButtonBorder, backgroundColor: continueButtonBg, alignItems: "center" }}>
                  <Text style={{ color: continueButtonText, fontSize: 15, fontWeight: "800" }}>Continue →</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Step 3: Lessons & Vocabulary ── */}
            {wizardStep === 3 && (
              <>
                {/* Linked lessons */}
                <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                  <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: accentPurple, letterSpacing: 1.5, textTransform: "uppercase" }}>Linked Lessons</Text>
                      {linkedLessonIds.length > 0 && (
                        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: accentPurpleSoft }}>
                          <Text style={{ fontSize: 10, fontWeight: "800", color: accentPurple }}>{linkedLessonIds.length}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 }}>Link lessons to automatically pull their vocabulary into this test. Students see the linked lesson on their study screen.</Text>
                  </View>
                  <View style={{ padding: 14, gap: 8 }}>
                    <TouchableOpacity onPress={() => { setLessonSearch(""); setLessonPickerOpen(true); }} style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Search and add a lesson...</Text>
                      <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                    {linkedLessonIds.length > 0 && (
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
                    )}
                  </View>
                </View>

                {/* Vocabulary */}
                <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                  <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Vocabulary</Text>
                          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: accentPurpleSoft }}>
                            <Text style={{ fontSize: 10, fontWeight: "800", color: accentPurple }}>{words.length}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 }}>Add vocabulary words for this test. Linked lesson words appear here automatically — you can also add words manually.</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8, marginLeft: 10 }}>
                        <TouchableOpacity onPress={handleEnrichVocabularyWithAI} disabled={!canUseAI || aiVocabLoading} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: accentPurple, backgroundColor: accentPurpleSoft, opacity: !canUseAI || aiVocabLoading ? 0.6 : 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: "800", color: accentPurple }}>{aiVocabLoading ? "AI..." : "AI Fill"}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setWords((w) => [...w, { key: uid(), en: "", pt: "", sp: "", se: "" }])} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: accentPurpleSoft }}>
                          <Text style={{ fontSize: 11, fontWeight: "800", color: accentPurple }}>+ Add</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  {words.length > 0 && (
                    <View style={{ marginHorizontal: 12, marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.text }}>{linkedWordCount} synced from lessons · {manualWordCount} added manually</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 }}>
                    {words.map((w, i) => {
                      const isOpen = !!vocabOpen[w.key];
                      return (
                        <View key={w.key} style={[{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 14, overflow: "hidden", backgroundColor: theme.isDark ? theme.colors.surface : theme.colors.surfaceAlt }, isOpen ? { width: "100%" } : { flexBasis: "48%", flexGrow: 1 }]}>
                          <TouchableOpacity onPress={() => setVocabOpen((prev) => ({ ...prev, [w.key]: !isOpen }))} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 10 }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.textMuted }}>#{i + 1}</Text>
                              <Text style={{ fontSize: 12, fontWeight: "800", color: theme.colors.text, marginTop: 2 }} numberOfLines={1}>{w.en || "English"}</Text>
                              <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 1 }} numberOfLines={1}>{w.pt || "Target"}</Text>
                            </View>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              {words.length > 1 && !isOpen && (
                                <TouchableOpacity onPress={() => confirmRemoveVocabWord(w, i)} style={{ marginRight: 8 }}>
                                  <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                                </TouchableOpacity>
                              )}
                              <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={theme.colors.textMuted} />
                            </View>
                          </TouchableOpacity>
                          {isOpen && (
                            <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, padding: 10, gap: 8 }}>
                              <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                                {words.length > 1 && (
                                  <TouchableOpacity onPress={() => confirmRemoveVocabWord(w, i)} style={{ marginRight: 8 }}>
                                    <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                                  </TouchableOpacity>
                                )}
                              </View>
                              {[["English", "en", "English term"] as const, ["Target language", "pt", "Portuguese (or target)"] as const, ["Context (target)", "sp", "Example sentence"] as const, ["Context (English)", "se", "Example sentence"] as const].map(([label, field, ph]) => (
                                <View key={field}>
                                  <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>{label}</Text>
                                  <TextInput value={w[field]} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, [field]: t } : x)))} placeholder={ph} placeholderTextColor={placeholderColor} style={inputStyle} />
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>

                <TouchableOpacity onPress={advanceWizard} style={{ paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: continueButtonBorder, backgroundColor: continueButtonBg, alignItems: "center" }}>
                  <Text style={{ color: continueButtonText, fontSize: 15, fontWeight: "800" }}>Continue →</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Step 4: Questions ── */}
            {wizardStep === 4 && (
              <>
                {/* AI generate card — above questions */}
                <TouchableOpacity
                  onPress={handleGenerateQuestionsFromVocabulary}
                  disabled={!canUseAI || aiQuestionsLoading}
                  activeOpacity={0.85}
                  style={{ borderWidth: 1.5, borderColor: theme.isDark ? "rgba(217,67,67,0.45)" : AI_RED, borderRadius: 22, backgroundColor: theme.isDark ? "rgba(217,67,67,0.1)" : AI_RED_SOFT, padding: 18, flexDirection: "row", alignItems: "center", gap: 14, opacity: !canUseAI || aiQuestionsLoading ? 0.6 : 1 }}
                >
                  <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: AI_RED, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Animated.View style={{ transform: [{ rotate: aiThinking.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
                      <MaterialCommunityIcons name="brain" size={22} color="#fff" />
                    </Animated.View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: AI_RED, marginBottom: 3 }}>{aiQuestionsLoading ? `Thinking${thinkingDots}` : "Generate with AI"}</Text>
                    <Text style={{ fontSize: 12, color: AI_RED, opacity: 0.75, lineHeight: 16 }}>Instantly builds 6 questions from your vocabulary. Add more after reviewing.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={AI_RED} />
                </TouchableOpacity>

                <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden", padding: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Questions</Text>
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: accentPurpleSoft }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: accentPurple }}>{questions.length}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginBottom: 14, lineHeight: 17 }}>Design each question students will answer. Choose prompt format (text, audio, image) and how they answer (specific, open, multiple choice). Long-press the drag handle to reorder.</Text>

                  <DraggableFlatList
                    data={questions}
                    keyExtractor={(item) => item.key}
                    scrollEnabled={false}
                    activationDistance={14}
                    onDragEnd={({ data }) => setQuestions(data)}
                    renderItem={({ item: q, getIndex, drag, isActive }) => {
                      const i = Math.max(0, getIndex?.() ?? questions.findIndex((x) => x.key === q.key));
                      const isOpen = !!questionOpen[q.key];
                      const isAdvOpen = !!advancedOpen[q.key];
                      const PROMPT_FORMAT_LABELS: Record<string, string> = { text: "Text", fill_blank: "Fill in Blank", audio: "Audio", image: "Image" };
                      const ANSWER_FORMAT_LABELS: Record<string, string> = { specific: "Specific", open: "Open", mcq: "Multiple Choice" };
                      const qDropdown = dropdownOpen[q.key] ?? null;
                      return (
                        <View style={{ marginBottom: 10 }}>
                          <View style={{ borderWidth: 1.5, borderColor: isActive ? accentPurple : theme.colors.border, borderRadius: 14, overflow: "hidden", backgroundColor: theme.isDark ? theme.colors.surface : theme.colors.surfaceAlt }}>
                            <TouchableOpacity onPress={() => setQuestionOpen((prev) => ({ ...prev, [q.key]: !isOpen }))} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 }}>
                              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                <Text style={{ fontSize: 13, fontWeight: "800", color: theme.colors.text }}>Question {i + 1}</Text>
                                {q.prompt_text.trim() ? <Text style={{ fontSize: 11, color: theme.colors.textMuted }} numberOfLines={1}>{q.prompt_text}</Text> : null}
                              </View>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <TouchableOpacity onPress={(e) => e.stopPropagation()} onLongPress={drag} delayLongPress={130} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                  <Ionicons name="reorder-three" size={17} color={theme.colors.textMuted} />
                                </TouchableOpacity>
                                {questions.length > 1 && (
                                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); Alert.alert("Delete Question", `Delete Question ${i + 1}?`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => setQuestions((prev) => prev.filter((x) => x.key !== q.key)) }]); }}>
                                    <Ionicons name="trash-outline" size={15} color={theme.colors.danger} />
                                  </TouchableOpacity>
                                )}
                                <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={15} color={theme.colors.textMuted} />
                              </View>
                            </TouchableOpacity>
                            {isOpen && (
                              <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: theme.colors.border, padding: 12 }}>
                                <View style={{ flexDirection: "row", gap: 8 }}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Prompt format</Text>
                                    <TouchableOpacity onPress={() => setDropdownOpen((prev) => ({ ...prev, [q.key]: qDropdown === "prompt" ? null : "prompt" }))} style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
                                      <Text style={{ fontSize: 13, color: theme.colors.text }}>{PROMPT_FORMAT_LABELS[q.prompt_format]}</Text>
                                      <Ionicons name={qDropdown === "prompt" ? "chevron-up" : "chevron-down"} size={14} color={theme.colors.textMuted} />
                                    </TouchableOpacity>
                                    {qDropdown === "prompt" && (
                                      <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, marginTop: 4, overflow: "hidden", backgroundColor: theme.colors.surface }}>
                                        {(["text", "fill_blank", "audio", "image"] as const).map((pf, idx) => (
                                          <TouchableOpacity key={pf} onPress={() => { replaceQuestion(q.key, (cur) => ({ ...cur, prompt_format: pf })); setDropdownOpen((prev) => ({ ...prev, [q.key]: null })); }} style={{ paddingVertical: 9, paddingHorizontal: 12, backgroundColor: q.prompt_format === pf ? accentPurpleSoft : "transparent", borderBottomWidth: idx < 3 ? 1 : 0, borderBottomColor: theme.colors.border }}>
                                            <Text style={{ fontSize: 13, fontWeight: q.prompt_format === pf ? "700" : "400", color: q.prompt_format === pf ? accentPurple : theme.colors.text }}>{PROMPT_FORMAT_LABELS[pf]}</Text>
                                          </TouchableOpacity>
                                        ))}
                                      </View>
                                    )}
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Answer format</Text>
                                    <TouchableOpacity onPress={() => setDropdownOpen((prev) => ({ ...prev, [q.key]: qDropdown === "answer" ? null : "answer" }))} style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
                                      <Text style={{ fontSize: 13, color: theme.colors.text }}>{ANSWER_FORMAT_LABELS[q.answer_format]}</Text>
                                      <Ionicons name={qDropdown === "answer" ? "chevron-up" : "chevron-down"} size={14} color={theme.colors.textMuted} />
                                    </TouchableOpacity>
                                    {qDropdown === "answer" && (
                                      <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, marginTop: 4, overflow: "hidden", backgroundColor: theme.colors.surface }}>
                                        {(["specific", "open", "mcq"] as const).map((af, idx) => (
                                          <TouchableOpacity key={af} onPress={() => { replaceQuestion(q.key, (cur) => ({ ...cur, answer_format: af })); setDropdownOpen((prev) => ({ ...prev, [q.key]: null })); }} style={{ paddingVertical: 9, paddingHorizontal: 12, backgroundColor: q.answer_format === af ? accentPurpleSoft : "transparent", borderBottomWidth: idx < 2 ? 1 : 0, borderBottomColor: theme.colors.border }}>
                                            <Text style={{ fontSize: 13, fontWeight: q.answer_format === af ? "700" : "400", color: q.answer_format === af ? accentPurple : theme.colors.text }}>{ANSWER_FORMAT_LABELS[af]}</Text>
                                          </TouchableOpacity>
                                        ))}
                                      </View>
                                    )}
                                  </View>
                                </View>
                                <TouchableOpacity onPress={() => replaceQuestion(q.key, (cur) => ({ ...cur, required: !cur.required }))}>
                                  <Text style={{ color: accentPurple, fontWeight: "700", fontSize: 12 }}>{q.required ? "Required" : "Optional"}</Text>
                                </TouchableOpacity>
                                {q.prompt_format === "audio" && (
                                  <View style={{ gap: 8 }}>
                                    <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 }}>Audio</Text>
                                    {q.audio_url.trim() ? (
                                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }}>
                                        <TouchableOpacity onPress={async () => { const isPlaying = !!playingAudio[q.key]; if (isPlaying) { await audioSoundRef.sound?.stopAsync(); audioSoundRef.sound = null; setPlayingAudio((prev) => ({ ...prev, [q.key]: false })); } else { const { sound } = await Audio.Sound.createAsync({ uri: q.audio_url }); audioSoundRef.sound = sound; setPlayingAudio((prev) => ({ ...prev, [q.key]: true })); await sound.playAsync(); sound.setOnPlaybackStatusUpdate((status) => { if (status.isLoaded && status.didJustFinish) { setPlayingAudio((prev) => ({ ...prev, [q.key]: false })); audioSoundRef.sound = null; } }); } }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accentPurple, alignItems: "center", justifyContent: "center" }}>
                                          <Ionicons name={playingAudio[q.key] ? "stop" : "play"} size={16} color="#fff" />
                                        </TouchableOpacity>
                                        <Text style={{ flex: 1, fontSize: 11, color: theme.colors.textMuted }} numberOfLines={1}>{q.audio_url.split("/").pop()}</Text>
                                        <TouchableOpacity onPress={() => replaceQuestion(q.key, (cur) => ({ ...cur, audio_url: "" }))}><Ionicons name="trash-outline" size={16} color={theme.colors.danger} /></TouchableOpacity>
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
                                )}
                                {(q.prompt_format === "text" || q.prompt_format === "audio" || q.prompt_format === "image" || q.answer_format === "mcq") && (
                                  <View style={{ gap: 8 }}>
                                    <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 }}>{q.prompt_format === "image" ? "Image prompt" : "Optional image"}</Text>
                                    {q.image_url.trim() && (
                                      <View>
                                        <Image source={{ uri: q.image_url.trim() }} style={{ width: "100%", height: 160, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }} resizeMode="cover" />
                                        <TouchableOpacity onPress={() => replaceQuestion(q.key, (cur) => ({ ...cur, image_url: "" }))} style={{ position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.danger, alignItems: "center", justifyContent: "center" }}>
                                          <Ionicons name="close" size={14} color="#fff" />
                                        </TouchableOpacity>
                                      </View>
                                    )}
                                    <View style={{ flexDirection: "row", gap: 8 }}>
                                      <TouchableOpacity onPress={() => pickQuestionImage(i)} disabled={uploadingQuestionIndex === i} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, alignItems: "center", opacity: uploadingQuestionIndex === i ? 0.6 : 1 }}>
                                        <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.text }}>{uploadingQuestionIndex === i ? "Uploading..." : "Upload image"}</Text>
                                      </TouchableOpacity>
                                      {canUseAI && (
                                        <TouchableOpacity onPress={() => handleGenerateImageForQuestion(i)} disabled={aiImageIndex === i} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: accentPurple, backgroundColor: accentPurpleSoft, alignItems: "center", opacity: aiImageIndex === i ? 0.6 : 1 }}>
                                          <Text style={{ fontSize: 11, fontWeight: "700", color: accentPurple }}>{aiImageIndex === i ? "AI..." : "AI image"}</Text>
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                  </View>
                                )}
                                <View>
                                  <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Question</Text>
                                  <TextInput value={q.prompt_text} onChangeText={(t) => replaceQuestion(q.key, (cur) => ({ ...cur, prompt_text: t }))} placeholder="Write the question students will see…" placeholderTextColor={placeholderColor} multiline style={inputStyle} />
                                </View>
                                {q.answer_format === "specific" && (
                                  <>
                                    <View>
                                      <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Correct answer</Text>
                                      <TextInput value={q.correct_text} onChangeText={(t) => replaceQuestion(q.key, (cur) => ({ ...cur, correct_text: t, fill_blank_character_count: cur.prompt_format === "fill_blank" ? Math.max(1, t.trim().length || 1) : cur.fill_blank_character_count }))} placeholder="Correct answer" placeholderTextColor={placeholderColor} style={inputStyle} />
                                    </View>
                                    <View>
                                      <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Accepted alternatives</Text>
                                      <TextInput value={q.accepted_texts.join(", ")} onChangeText={(t) => replaceQuestion(q.key, (cur) => ({ ...cur, accepted_texts: t.split(",").map((x) => x.trim()).filter(Boolean) }))} placeholder="Comma separated" placeholderTextColor={placeholderColor} style={inputStyle} />
                                    </View>
                                  </>
                                )}
                                {q.answer_format === "open" && (
                                  <View>
                                    <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Reference answer</Text>
                                    <TextInput value={q.teacher_reference_answer} onChangeText={(t) => replaceQuestion(q.key, (cur) => ({ ...cur, teacher_reference_answer: t }))} placeholder="Teacher reference / rubric (optional)" placeholderTextColor={placeholderColor} multiline style={inputStyle} />
                                  </View>
                                )}
                                {q.answer_format === "mcq" && (
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
                                )}
                                <TouchableOpacity onPress={() => setAdvancedOpen((prev) => ({ ...prev, [q.key]: !isAdvOpen }))} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, marginTop: 2 }}>
                                  <Text style={{ fontSize: 11, fontWeight: "700", color: accentPurple }}>Advanced options</Text>
                                  <Ionicons name={isAdvOpen ? "chevron-up" : "chevron-down"} size={13} color={accentPurple} />
                                </TouchableOpacity>
                                {isAdvOpen && (
                                  <View style={{ gap: 6 }}>
                                    {([["caseInsensitive", "Case insensitive"], ["ignorePunctuation", "Ignore punctuation"], ["trimSpaces", "Trim spaces"], ["accentInsensitive", "Accent optional"]] as const).map(([k, label]) => (
                                      <View key={k} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                                        <Text style={{ fontSize: 11, color: theme.colors.text, fontWeight: "600", flex: 1 }}>{label}</Text>
                                        <View style={{ flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" }}>
                                          <TouchableOpacity onPress={() => replaceQuestion(q.key, (cur) => ({ ...cur, specific_rules: { ...cur.specific_rules, [k]: true } }))} style={{ paddingHorizontal: 14, paddingVertical: 6, backgroundColor: q.specific_rules[k] ? theme.colors.success : "transparent" }}>
                                            <Text style={{ fontSize: 11, fontWeight: "800", color: q.specific_rules[k] ? "#fff" : theme.colors.textMuted }}>On</Text>
                                          </TouchableOpacity>
                                          <View style={{ width: 1, backgroundColor: theme.colors.border }} />
                                          <TouchableOpacity onPress={() => replaceQuestion(q.key, (cur) => ({ ...cur, specific_rules: { ...cur.specific_rules, [k]: false } }))} style={{ paddingHorizontal: 14, paddingVertical: 6, backgroundColor: !q.specific_rules[k] ? theme.colors.danger : "transparent" }}>
                                            <Text style={{ fontSize: 11, fontWeight: "800", color: !q.specific_rules[k] ? "#fff" : theme.colors.textMuted }}>Off</Text>
                                          </TouchableOpacity>
                                        </View>
                                      </View>
                                    ))}
                                  </View>
                                )}
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    }}
                  />

                  <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                    <TouchableOpacity onPress={() => setQuestions((prev) => [...prev, mapQuestion(ensureQuestionDefaults(null))])} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: accentPurpleSoft, alignItems: "center" }}>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: accentPurple }}>+ Add Question</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setTemplatePickerOpen(true)} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, alignItems: "center" }}>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: theme.colors.text }}>+ Template</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Save button */}
                <TouchableOpacity onPress={() => { Keyboard.dismiss(); triggerLightImpact(); handleSave(); }} disabled={saving} style={{ paddingVertical: 16, borderRadius: 16, backgroundColor: accentPurple, alignItems: "center", opacity: saving ? 0.7 : 1 }}>
                  <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>{saving ? "Saving..." : "Save Test"}</Text>
                </TouchableOpacity>
              </>
            )}

          </View>
        </ScrollView>

        <FloatingToast {...toastProps} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ paddingTop: Math.max(insets.top, 8), paddingHorizontal: 16, paddingBottom: 12 }}>
        <GlassCard style={{ borderRadius: 26 }} padding={14} variant="strong">
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={{ width: 46, height: 46, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="chevron-back" size={22} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 14 }}>
              <Text style={[theme.typography.label, { color: theme.colors.primary }]}>{isEdit ? "Test editor" : "Test studio"}</Text>
              <Text style={[theme.typography.title, { marginTop: 4, fontSize: 20, lineHeight: 25 }]}>{isEdit ? "Edit test" : "New test"}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ThemeToggleButton />
              <TouchableOpacity onPress={openWebEditor} style={{ paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="open-outline" size={13} color={theme.colors.primary} />
                <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: "800" }}>Web</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { Keyboard.dismiss(); triggerLightImpact(); handleSave(); }}
                disabled={saving}
                style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.primary, opacity: saving ? 0.7 : 1 }}
              >
                <Text style={{ color: theme.colors.primaryText, fontSize: 11, fontWeight: "800" }}>{saving ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </GlassCard>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <View style={{ gap: 16 }}>
          <GlassCard style={{ borderRadius: 30, overflow: "hidden" }} padding={0}>
            <View style={{ position: "relative", overflow: "hidden" }}>
              <FloatingGlow size={180} color={theme.colors.primarySoft} top={-55} right={-25} translate={heroGlowOne} />
              <FloatingGlow size={130} color={theme.colors.violetSoft} bottom={-38} left={-15} translate={heroGlowTwo} />
              <View style={{ padding: 22 }}>
                <TouchableOpacity onPress={pickCoverImage} activeOpacity={0.9} disabled={coverUploading} style={{ width: "100%", marginBottom: 18 }}>
                    {coverImageUrl.trim() ? (
                      <Image source={{ uri: coverImageUrl.trim() }} style={{ width: "100%", height: 180, borderRadius: 20, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border }} resizeMode="cover" />
                    ) : (
                      <View style={{ width: "100%", height: 180, borderRadius: 20, borderWidth: 1.5, borderColor: theme.colors.border, borderStyle: "dashed", backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center", gap: 10 }}>
                        <Ionicons name="image-outline" size={36} color={theme.colors.textMuted} />
                        <Text style={{ color: theme.colors.textMuted, fontWeight: "700", fontSize: 13 }}>
                          {coverUploading ? "Uploading..." : "Add cover image"}
                        </Text>
                      </View>
                    )}
                </TouchableOpacity>

                <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Test studio</Text>
                <Text style={[theme.typography.title, { marginTop: 4, fontSize: 18, lineHeight: 23 }]}> 
                  {name.trim() || (isEdit ? "Untitled test" : "Start a beautiful new test")}
                </Text>
                <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted }]}> 
                  {heroDescription}
                </Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                  <HeroChip icon="book-outline" label="Total Vocab" value={`${activeWordCount}`} tint={theme.colors.violetSoft} textColor={theme.colors.text} />
                  <HeroChip icon="document-text-outline" label="Total Questions" value={`${questions.length}`} tint={theme.colors.surfaceAlt} textColor={theme.colors.textMuted} />
                </View>
              </View>
            </View>
          </GlassCard>

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
            <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                Create Test Title:
              </Text>
              <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 12 }}>
                <TextInput value={name} onChangeText={setName} placeholder="" placeholderTextColor={placeholderColor} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} style={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, fontSize: 16, fontWeight: "600", color: theme.colors.text }} />
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: theme.colors.border }} />
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                Description:
              </Text>
              <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, backgroundColor: theme.colors.surface, paddingHorizontal: 14, paddingVertical: 12 }}>
                <TextInput value={description} onChangeText={setDescription} multiline blurOnSubmit onSubmitEditing={() => Keyboard.dismiss()} placeholder="" placeholderTextColor={placeholderColor} style={{ paddingHorizontal: 0, paddingVertical: 0, fontSize: 15, lineHeight: 22, color: theme.colors.text, minHeight: 58, textAlignVertical: "top" }} />
              </View>
            </View>
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
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Time limit (min)</Text>
                  <TextInput value={testSettings.time_limit_minutes == null ? "" : String(testSettings.time_limit_minutes)} onChangeText={(t) => setTestSettings((prev) => ({ ...prev, time_limit_minutes: t.trim() ? Number(t) || null : null }))} keyboardType="numeric" placeholder="Optional" placeholderTextColor={theme.colors.textMuted} style={inputStyle} />
                </View>
                <View style={{ alignSelf: "flex-start" }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>Optional:</Text>
                  <TouchableOpacity
                  onPress={() => setTestSettings((prev) => ({ ...prev, randomize_questions: !prev.randomize_questions }))}
                  style={{
                    alignSelf: "flex-start",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    borderWidth: 1,
                    borderColor: testSettings.randomize_questions ? "#A9DEBA" : theme.colors.border,
                    backgroundColor: testSettings.randomize_questions ? "#ECF9F0" : theme.colors.surfaceAlt,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 46,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: testSettings.randomize_questions ? "#DDF4E5" : "transparent",
                    }}
                  >
                    <Ionicons
                      name={testSettings.randomize_questions ? "checkmark" : "close"}
                      size={13}
                      color={testSettings.randomize_questions ? "#2F9E44" : "#D94343"}
                    />
                  </View>
                  <Text style={{ color: testSettings.randomize_questions ? "#2F9E44" : theme.colors.text, fontWeight: "700", fontSize: 12 }}>
                    Randomize Order
                  </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View>
                <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>Attempts</Text>
                <TouchableOpacity
                  onPress={() => setAttemptsPickerOpen(true)}
                  style={{
                    alignSelf: "flex-start",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    borderWidth: 1,
                    borderColor: selectedAttemptsCount ? "#A9DEBA" : "#D7DADF",
                    backgroundColor: selectedAttemptsCount ? "#ECF9F0" : "#F2F3F5",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 46,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: selectedAttemptsCount ? "#DDF4E5" : "#F2F2F2",
                    }}
                  >
                    <Ionicons
                      name={selectedAttemptsCount ? "checkmark" : "infinite"}
                      size={13}
                      color={selectedAttemptsCount ? "#2F9E44" : "#2B2B2B"}
                    />
                  </View>
                  <Text style={{ color: selectedAttemptsCount ? "#2F9E44" : "#2B2B2B", fontWeight: "700", fontSize: 12 }}>
                    {selectedAttemptsCount
                      ? `${selectedAttemptsCount} attempts selected`
                      : "Unlimited Attempts"}
                  </Text>
                </TouchableOpacity>
                <Text style={{ color: theme.colors.textMuted, fontWeight: "600", fontSize: 10, marginTop: 6 }}>
                  Click to add # of attempts
                </Text>
              </View>
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
                onPress={() => {
                  setLessonSearch("");
                  setLessonPickerOpen(true);
                }}
                style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}
              >
                <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Add lesson...</Text>
                <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
              </TouchableOpacity>
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
                        <TouchableOpacity onPress={() => confirmRemoveVocabWord(w, i)} style={{ marginRight: 8 }}>
                          <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                        </TouchableOpacity>
                      ) : null}
                      <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={theme.colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                  {isOpen ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, padding: 10, gap: 8 }}>
                      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                        {words.length > 1 ? (
                          <TouchableOpacity onPress={() => confirmRemoveVocabWord(w, i)} style={{ marginRight: 8 }}>
                            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
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
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 6 }}>
                When clicking the "AI Question" this will generate 6 questions based on your vocabulary above.
              </Text>
            </View>
          </View>
          {helpBubble === "questions" ? (
            <View style={{ marginHorizontal: 0, marginBottom: 10, padding: 10, borderRadius: 10, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ fontSize: 11, color: theme.colors.textMuted, lineHeight: 16 }}>Design each question students will answer. Choose how the question is shown (text, audio, image) and how they answer (specific, open, multiple choice). Tap a question to expand it.</Text>
            </View>
          ) : null}
          <DraggableFlatList
            data={questions}
            keyExtractor={(item) => item.key}
            scrollEnabled={false}
            activationDistance={14}
            onDragEnd={({ data }) => setQuestions(data)}
            renderItem={({ item: q, getIndex, drag, isActive }) => {
            const i = Math.max(0, getIndex?.() ?? questions.findIndex((x) => x.key === q.key));
            const isOpen = !!questionOpen[q.key];
            const isAdvOpen = !!advancedOpen[q.key];
            const PROMPT_FORMAT_LABELS: Record<string, string> = { text: "Text", fill_blank: "Fill in Blank", audio: "Audio", image: "Image" };
            const ANSWER_FORMAT_LABELS: Record<string, string> = { specific: "Specific", open: "Open", mcq: "Multiple Choice" };
            const qDropdown = dropdownOpen[q.key] ?? null;
            return (
              <View style={{ marginBottom: 10 }}>
                <View style={{ borderWidth: 1.5, borderColor: isActive ? accentPurple : theme.colors.border, borderRadius: 14, overflow: "hidden", backgroundColor: theme.isDark ? theme.colors.surface : theme.colors.surfaceAlt }}>
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
                      <TouchableOpacity
                        onPress={(e) => e.stopPropagation()}
                        onLongPress={drag}
                        delayLongPress={130}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="reorder-three" size={17} color={theme.colors.textMuted} />
                      </TouchableOpacity>
                      {questions.length > 1 ? (
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            Alert.alert(
                              "Delete Question",
                              `Do you want to delete Question ${i + 1}?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                { text: "Delete", style: "destructive", onPress: () => setQuestions((prev) => prev.filter((x) => x.key !== q.key)) },
                              ]
                            );
                          }}
                        >
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

                    {/* Advanced options */}
                    <TouchableOpacity
                      onPress={() => setAdvancedOpen((prev) => ({ ...prev, [q.key]: !isAdvOpen }))}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, marginTop: 2 }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: accentPurple }}>Advanced options</Text>
                      <Ionicons name={isAdvOpen ? "chevron-up" : "chevron-down"} size={13} color={accentPurple} />
                    </TouchableOpacity>
                    {isAdvOpen ? (
                      <View style={{ gap: 6 }}>
                        {([["caseInsensitive", "Case insensitive"], ["ignorePunctuation", "Ignore punctuation"], ["trimSpaces", "Trim spaces"], ["accentInsensitive", "Accent optional"]] as const).map(([k, label]) => (
                          <View key={k} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <Text style={{ fontSize: 11, color: theme.colors.text, fontWeight: "600", flex: 1 }}>{label}</Text>
                            <View style={{ flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" }}>
                              <TouchableOpacity onPress={() => replaceQuestion(q.key, (cur) => ({ ...cur, specific_rules: { ...cur.specific_rules, [k]: true } }))} style={{ paddingHorizontal: 14, paddingVertical: 6, backgroundColor: q.specific_rules[k] ? theme.colors.success : "transparent" }}>
                                <Text style={{ fontSize: 11, fontWeight: "800", color: q.specific_rules[k] ? "#fff" : theme.colors.textMuted }}>On</Text>
                              </TouchableOpacity>
                              <View style={{ width: 1, backgroundColor: theme.colors.border }} />
                              <TouchableOpacity onPress={() => replaceQuestion(q.key, (cur) => ({ ...cur, specific_rules: { ...cur.specific_rules, [k]: false } }))} style={{ paddingHorizontal: 14, paddingVertical: 6, backgroundColor: !q.specific_rules[k] ? theme.colors.danger : "transparent" }}>
                                <Text style={{ fontSize: 11, fontWeight: "800", color: !q.specific_rules[k] ? "#fff" : theme.colors.textMuted }}>Off</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            );
            }}
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => setQuestions((prev) => [...prev, mapQuestion(ensureQuestionDefaults(null))])}
              style={{ width: "31%", paddingVertical: 8, borderRadius: 9, backgroundColor: accentPurpleSoft, alignItems: "center" }}
            >
              <Text style={{ fontSize: 11, fontWeight: "800", color: accentPurple }}>+ Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setTemplatePickerOpen(true)}
              style={{ width: "31%", paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, alignItems: "center" }}
            >
              <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.text }}>+ Add Template</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleGenerateQuestionsFromVocabulary}
              disabled={!canUseAI || aiQuestionsLoading}
              style={{ width: "31%", paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: AI_RED, backgroundColor: AI_RED_SOFT, alignItems: "center", opacity: !canUseAI || aiQuestionsLoading ? 0.6 : 1, flexDirection: "row", justifyContent: "center", gap: 4 }}
            >
              <Animated.View
                style={{
                  transform: [
                    {
                      rotate: aiThinking.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0deg", "360deg"],
                      }),
                    },
                  ],
                }}
              >
                <MaterialCommunityIcons name="brain" size={12} color={AI_RED} />
              </Animated.View>
              <Text style={{ fontSize: 10, fontWeight: "800", color: AI_RED }}>{aiQuestionsLoading ? `Thinking${thinkingDots}` : "+ AI Question"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        </View>

      </ScrollView>

      <Modal visible={lessonPickerOpen} animationType="fade" transparent onRequestClose={() => setLessonPickerOpen(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 16, paddingVertical: 32 }} activeOpacity={1} onPress={() => setLessonPickerOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 500 }}>
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View>
                  <Text style={{ fontSize: 17, fontWeight: "800", color: theme.colors.text }}>Link Lessons</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>{linkedLessonIds.length} linked</Text>
                </View>
                <TouchableOpacity onPress={() => setLessonPickerOpen(false)} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: accentPurple }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: "#fff" }}>Done</Text>
                </TouchableOpacity>
              </View>
              <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                <TextInput value={lessonSearch} onChangeText={setLessonSearch} placeholder="Search..." placeholderTextColor={theme.colors.textMuted} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, fontSize: 13 }} />
              </View>
              <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: theme.colors.border, backgroundColor: accentPurpleSoft }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: accentPurple, letterSpacing: 1.2, textTransform: "uppercase", textAlign: "center" }}>Linked ({linkedLessonIds.length})</Text>
                </View>
                <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10 }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", textAlign: "center" }}>Available ({filteredLinkableLessons.length})</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", maxHeight: 360 }}>
                <ScrollView style={{ flex: 1, borderRightWidth: 1, borderRightColor: theme.colors.border }} keyboardShouldPersistTaps="handled">
                  {linkedLessonIds.length === 0 ? (
                    <View style={{ padding: 16, alignItems: "center" }}>
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted, textAlign: "center", lineHeight: 16 }}>No lessons linked yet.{"\n"}Tap from the right →</Text>
                    </View>
                  ) : linkedLessonIds.filter((id) => { const l = lessons.find((x) => x.id === id); return !lessonSearch || l?.title.toLowerCase().includes(lessonSearch.toLowerCase()); }).map((id) => {
                    const lesson = lessons.find((l) => l.id === id);
                    return (
                      <TouchableOpacity key={id} onPress={() => setLinkedLessonIds((prev) => prev.filter((x) => x !== id))} activeOpacity={0.8}
                        style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: accentPurpleSoft, flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                        <Ionicons name="remove-circle" size={14} color={accentPurple} style={{ marginTop: 1, flexShrink: 0 }} />
                        <Text style={{ flex: 1, fontSize: 11, fontWeight: "700", color: accentPurple, lineHeight: 15 }} numberOfLines={4}>{lesson?.title ?? id}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                  {filteredLinkableLessons.length === 0 ? (
                    <View style={{ padding: 16, alignItems: "center" }}>
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted, textAlign: "center" }}>No lessons found</Text>
                    </View>
                  ) : filteredLinkableLessons.map((l) => (
                    <TouchableOpacity key={l.id} onPress={() => setLinkedLessonIds((prev) => [...prev, l.id])} activeOpacity={0.8}
                      style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
                      <Ionicons name="add-circle-outline" size={14} color={theme.colors.textMuted} style={{ marginTop: 1, flexShrink: 0 }} />
                      <Text style={{ flex: 1, fontSize: 11, color: theme.colors.text, lineHeight: 15 }} numberOfLines={4}>{l.title}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={attemptsPickerOpen} animationType="fade" transparent onRequestClose={() => setAttemptsPickerOpen(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-start", paddingTop: "18%", paddingBottom: "12%" }}
          activeOpacity={1}
          onPress={() => setAttemptsPickerOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ marginHorizontal: 16 }}>
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: 24, borderWidth: 1, borderColor: theme.colors.border, overflow: "hidden" }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={[theme.typography.title, { fontSize: 18 }]}>Limit Attempts?</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>How many attempts would you like to set?</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setAttemptsPickerOpen(false)}
                  style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: accentPurple }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "800", color: "#fff" }}>Done</Text>
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
                <TouchableOpacity
                  onPress={() => setTestSettings((prev) => ({ ...prev, attempts_allowed: "unlimited" }))}
                  activeOpacity={0.85}
                  style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: testSettings.attempts_allowed === "unlimited" ? "#F2F3F5" : "transparent" }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: testSettings.attempts_allowed === "unlimited" ? "#ECEDEF" : "transparent", alignItems: "center", justifyContent: "center", marginRight: 12, flexShrink: 0 }}>
                    {testSettings.attempts_allowed === "unlimited" ? <Ionicons name="infinite" size={13} color="#2B2B2B" /> : null}
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, color: "#2B2B2B" }}>Unlimited Attempts</Text>
                </TouchableOpacity>
                {Array.from({ length: 10 }, (_, idx) => idx + 1).map((n) => {
                  const selected = testSettings.attempts_allowed === n;
                  return (
                    <TouchableOpacity
                      key={n}
                      onPress={() => setTestSettings((prev) => ({ ...prev, attempts_allowed: n }))}
                      activeOpacity={0.85}
                      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: selected ? accentPurpleSoft : "transparent" }}
                    >
                      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: selected ? 0 : 1.5, borderColor: theme.colors.border, backgroundColor: selected ? accentPurple : "transparent", alignItems: "center", justifyContent: "center", marginRight: 12, flexShrink: 0 }}>
                        {selected ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, color: theme.colors.text }}>{n} {n === 1 ? "attempt" : "attempts"}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={templatePickerOpen} animationType="fade" transparent onRequestClose={() => setTemplatePickerOpen(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.58)", justifyContent: "center", paddingHorizontal: 16, paddingTop: 24, paddingBottom: "10%" }}
          activeOpacity={1}
          onPress={() => setTemplatePickerOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: theme.colors.border,
                overflow: "hidden",
                shadowColor: "#000",
                shadowOpacity: 0.16,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
                elevation: 10,
              }}
            >
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: accentPurpleSoft, borderWidth: 1, borderColor: accentPurpleBorder }}>
                    <Ionicons name="layers-outline" size={18} color={accentPurple} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={theme.typography.title}>Question templates</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>Choose a starter and we will add it instantly.</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setTemplatePickerOpen(false)}
                  style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="close" size={16} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
                <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: accentPurpleBorder, backgroundColor: accentPurpleSoft }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: accentPurple, letterSpacing: 0.6, textTransform: "uppercase" }}>
                    {TEMPLATE_PRESETS.length} options
                  </Text>
                </View>
              </View>

              <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 12, gap: 10, paddingTop: 10 }} keyboardShouldPersistTaps="handled">
                {TEMPLATE_PRESETS.map((p, idx) => {
                  const iconColors = TEMPLATE_ICON_PALETTE[idx % TEMPLATE_ICON_PALETTE.length];
                  return (
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
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surfaceAlt,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: iconColors.background, borderWidth: 1, borderColor: iconColors.border }}>
                        <Ionicons name="sparkles-outline" size={14} color={iconColors.icon} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "800", color: theme.colors.text }}>{p.label}</Text>
                        <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 3 }}>
                          {TEMPLATE_PRESET_COPY[p.id] ?? "Preconfigured question structure."}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
      <FloatingToast {...toastProps} />
    </View>
  );
}
