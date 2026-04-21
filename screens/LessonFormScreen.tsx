import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
import { Alert,
  Animated,
  Easing,
  Image,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
} from "react-native";
import { TouchableOpacity } from "../lib/hapticPressables";

if (Platform.OS === "android" && UIManager.getViewManagerConfig?.("RCTLayoutAnimation")) {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const layoutSpring = () =>
  LayoutAnimation.configureNext({
    duration: 280,
    create: { type: LayoutAnimation.Types.spring, property: LayoutAnimation.Properties.scaleXY, springDamping: 0.78 },
    update: { type: LayoutAnimation.Types.spring, springDamping: 0.78 },
    delete: { type: LayoutAnimation.Types.spring, property: LayoutAnimation.Properties.scaleXY, springDamping: 0.78 },
  });
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { decode as decodeBase64 } from "base64-arraybuffer";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppButton from "../components/AppButton";
import FloatingToast from "../components/FloatingToast";
import { SkeletonBox } from "../components/SkeletonLoader";
import ThemeToggleButton from "../components/ThemeToggleButton";
import { useFeedbackToast } from "../hooks/useFeedbackToast";
import { triggerLightImpact, triggerSuccessHaptic } from "../lib/haptics";
import GlassCard from "../components/GlassCard";
import { getOrCreateVocabImage } from "../lib/api/imageBank";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";
import type { FloatingToastTone } from "../components/FloatingToast";
import type { RootLessonsStackParams } from "../types/lessons-navigation";

type LessonFormNavigationProp = NativeStackNavigationProp<RootLessonsStackParams, "LessonForm">;
type LessonFlashParams = {
  flashMessage: string;
  flashTone: FloatingToastTone;
};

const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL?.toString().trim() ||
  Constants.expoConfig?.extra?.apiBaseUrl?.toString() ||
  "https://www.eluency.com";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const uid = () => Math.random().toString(36).slice(2, 10);

type RowType = "vocab" | "conjugation" | "preposition";
type ConjugationEntry = { pronoun: string; form_a: string; form_b?: string };
type PrepositionEntry = { left: string; right: string; answer: string; note?: string };
type PrepositionTemplate = { id: string; title: string; entries: PrepositionEntry[] };
type WordRow = {
  key: string;
  rowType: RowType;
  termA: string;
  termB: string;
  contextA: string;
  contextB: string;
  altA: string;
  altB: string;
  image_url: string;
  tense: string;
  grammar: string;
  isInfinitive: boolean;
  infinitive: string;
  conjugations: ConjugationEntry[];
  prepositionTitle: string;
  prepositionGroup: string;
  prepositionTemplateId: string;
  prepositions: PrepositionEntry[];
};

const CATEGORY_OPTIONS = [
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
const LESSON_PACK_CATEGORIES = [
  "Foundations (Beginner Core)",
  "CEFR A2-C1",
  "People & Daily Life",
  "Home & Living",
  "Food & Dining",
  "Work & Professional",
  "Education",
  "Sports & Activities",
  "Travel",
  "Nature & Animals",
  "Technology",
  "Health & Safety",
] as const;
const LANGUAGE_LEVELS = ["", "A1", "A2", "B1", "B2", "C1", "C2"] as const;
const LESSON_LANGUAGES = ["Choose Language", "Portuguese (BR)", "Spanish", "English", "French", "German", "Italian", "Japanese", "Korean", "Chinese (Mandarin)", "Arabic"] as const;
const CHOOSE_LANGUAGE_PLACEHOLDER = LESSON_LANGUAGES[0];
const LANGUAGE_FLAGS: Record<string, string> = {
  "Portuguese (BR)": "🇧🇷",
  "Spanish": "🇪🇸",
  "English": "🇬🇧",
  "French": "🇫🇷",
  "German": "🇩🇪",
  "Italian": "🇮🇹",
  "Japanese": "🇯🇵",
  "Korean": "🇰🇷",
  "Chinese (Mandarin)": "🇨🇳",
  "Arabic": "🇸🇦",
};
const EMPTY_LESSON_PACK_CATEGORY = "(None)";

const ROW_TYPE_TAB_LABEL: Record<RowType, string> = {
  vocab: "Vocab",
  conjugation: "Conjugation",
  preposition: "Preposition",
};
const LANGUAGE_PAIR_FALLBACK = "en-pt";
const AI_ELIGIBLE_PLANS = ["basic", "standard", "school", "internal"];
const TENSE_OPTIONS = ["", "Present", "Past", "Future", "Present Perfect", "Past Perfect", "Future Perfect", "Conditional", "Subjunctive", "Imperative", "Infinitive", "Gerund", "Participle"] as const;
const GRAMMAR_OPTIONS = ["", "Noun", "Verb", "Adjective", "Adverb", "Preposition", "Pronoun", "Conjunction", "Phrase", "Idiom", "Expression", "Other"] as const;

/** Maps lesson language → best matching language pair code */
const LANGUAGE_DEFAULT_PAIR: Record<string, string> = {
  "Portuguese (BR)": "en-pt",
  "Spanish": "en-es",
  "English": "en-en",
  "French": "en-fr",
  "German": "en-de",
  "Italian": "en-it",
  "Japanese": "en-ja",
  "Korean": "en-ko",
  "Chinese (Mandarin)": "en-zh",
  "Arabic": "en-ar",
};

function pairForLessonLanguage(language: string | null | undefined, fallback = LANGUAGE_PAIR_FALLBACK) {
  const value = typeof language === "string" ? language.trim() : "";
  if (!value || value === CHOOSE_LANGUAGE_PLACEHOLDER || value === "(Choose Language)") return fallback;
  return LANGUAGE_DEFAULT_PAIR[value] ?? fallback;
}

const PT_DE_TEMPLATE: PrepositionTemplate = {
  id: "pt-de",
  title: "Contrações com DE",
  entries: [
    { left: "DE", right: "O", answer: "DO" },
    { left: "DE", right: "A", answer: "DA" },
    { left: "DE", right: "OS", answer: "DOS" },
    { left: "DE", right: "AS", answer: "DAS" },
    { left: "DE", right: "ELE", answer: "DELE" },
    { left: "DE", right: "ELA", answer: "DELA" },
    { left: "DE", right: "ELES", answer: "DELES" },
    { left: "DE", right: "ELAS", answer: "DELAS" },
    { left: "DE", right: "ESSE", answer: "DESSE" },
    { left: "DE", right: "ESSA", answer: "DESSA" },
    { left: "DE", right: "ISSO", answer: "DISSO" },
    { left: "DE", right: "AQUELE", answer: "DAQUELE" },
    { left: "DE", right: "AQUELA", answer: "DAQUELA" },
  ],
};
const PT_EM_TEMPLATE: PrepositionTemplate = {
  id: "pt-em",
  title: "Contrações com EM",
  entries: [
    { left: "EM", right: "O", answer: "NO" },
    { left: "EM", right: "A", answer: "NA" },
    { left: "EM", right: "OS", answer: "NOS" },
    { left: "EM", right: "AS", answer: "NAS" },
    { left: "EM", right: "UM", answer: "NUM" },
    { left: "EM", right: "UMA", answer: "NUMA" },
    { left: "EM", right: "ELE", answer: "NELE" },
    { left: "EM", right: "ELA", answer: "NELA" },
    { left: "EM", right: "ESSE", answer: "NESSE" },
    { left: "EM", right: "ESSA", answer: "NESSA" },
    { left: "EM", right: "ISSO", answer: "NISSO" },
    { left: "EM", right: "AQUELE", answer: "NAQUELE" },
    { left: "EM", right: "AQUELA", answer: "NAQUELA" },
  ],
};
const PT_A_TEMPLATE: PrepositionTemplate = {
  id: "pt-a",
  title: "Contrações com A",
  entries: [
    { left: "A", right: "O", answer: "AO" },
    { left: "A", right: "OS", answer: "AOS" },
    { left: "A", right: "A", answer: "À" },
    { left: "A", right: "AS", answer: "ÀS" },
    { left: "A", right: "AQUELE", answer: "ÀQUELE" },
    { left: "A", right: "AQUELA", answer: "ÀQUELA" },
    { left: "A", right: "AQUELES", answer: "ÀQUELES" },
    { left: "A", right: "AQUELAS", answer: "ÀQUELAS" },
    { left: "A", right: "AQUILO", answer: "ÀQUILO" },
  ],
};
const PT_POR_TEMPLATE: PrepositionTemplate = {
  id: "pt-por",
  title: "Contrações com POR",
  entries: [
    { left: "POR", right: "O", answer: "PELO" },
    { left: "POR", right: "A", answer: "PELA" },
    { left: "POR", right: "OS", answer: "PELOS" },
    { left: "POR", right: "AS", answer: "PELAS" },
  ],
};

const LANGUAGE_CONFIG: Record<string, { rowTypes: RowType[]; pronouns: string[]; templates: PrepositionTemplate[] }> = {
  "Portuguese (BR)": {
    rowTypes: ["vocab", "conjugation", "preposition"],
    pronouns: ["EU", "VOCÊ", "ELE / ELA", "A GENTE", "NÓS", "VOCÊS", "ELES / ELAS"],
    templates: [PT_DE_TEMPLATE, PT_EM_TEMPLATE, PT_A_TEMPLATE, PT_POR_TEMPLATE],
  },
  Spanish: {
    rowTypes: ["vocab", "conjugation"],
    pronouns: ["YO", "TÚ", "ÉL / ELLA / USTED", "NOSOTROS / NOSOTRAS", "VOSOTROS / VOSOTRAS", "ELLOS / ELLAS / USTEDES"],
    templates: [],
  },
  French: { rowTypes: ["vocab", "conjugation"], pronouns: ["JE", "TU", "IL / ELLE / ON", "NOUS", "VOUS", "ILS / ELLES"], templates: [] },
  German: { rowTypes: ["vocab", "conjugation"], pronouns: ["ICH", "DU", "ER / SIE / ES", "WIR", "IHR", "SIE"], templates: [] },
  Italian: { rowTypes: ["vocab", "conjugation"], pronouns: ["IO", "TU", "LUI / LEI", "NOI", "VOI", "LORO"], templates: [] },
  English: { rowTypes: ["vocab"], pronouns: [], templates: [] },
  Japanese: { rowTypes: ["vocab"], pronouns: [], templates: [] },
  Korean: { rowTypes: ["vocab"], pronouns: [], templates: [] },
  "Chinese (Mandarin)": { rowTypes: ["vocab"], pronouns: [], templates: [] },
  Arabic: { rowTypes: ["vocab"], pronouns: [], templates: [] },
};

const emptyPrepositions = (): PrepositionEntry[] => [{ left: "", right: "", answer: "" }, { left: "", right: "", answer: "" }, { left: "", right: "", answer: "" }];
const base64ByteSize = (base64: string) => {
  const len = base64.length;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
};
const conjugationsFor = (lang: string): ConjugationEntry[] => {
  const pronouns = LANGUAGE_CONFIG[lang]?.pronouns ?? LANGUAGE_CONFIG["Portuguese (BR)"].pronouns;
  return pronouns.map((pronoun) => ({ pronoun, form_a: "", form_b: "" }));
};
const makeWord = (languagePair: string, lang: string, rowType: RowType = "vocab"): WordRow => {
  const template = LANGUAGE_CONFIG[lang]?.templates?.[0];
  return {
    key: uid(),
    rowType,
    termA: "",
    termB: "",
    contextA: "",
    contextB: "",
    altA: "",
    altB: "",
    image_url: "",
    tense: "",
    grammar: rowType === "conjugation" ? "verb" : rowType === "preposition" ? "preposition" : "",
    isInfinitive: false,
    infinitive: "",
    conjugations: rowType === "conjugation" ? conjugationsFor(lang) : [],
    prepositionTitle: rowType === "preposition" ? template?.title || "Prepositions / Contractions" : "",
    prepositionGroup: rowType === "preposition" ? "Prepositions / Contractions" : "",
    prepositionTemplateId: rowType === "preposition" ? template?.id || "" : "",
    prepositions: rowType === "preposition" ? (template?.entries.length ? template.entries.map((e) => ({ ...e })) : emptyPrepositions()) : [],
  };
};

function DropdownField({
  label,
  value,
  options,
  placeholder,
  open,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  options: readonly string[];
  placeholder?: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  const theme = useAppTheme();

  return (
    <View style={{ marginBottom: 10, zIndex: open ? 50 : 1 }}>
      <Text style={[theme.typography.caption, { marginBottom: 6 }]}>{label}</Text>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onToggle}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: theme.colors.surfaceAlt,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: value ? theme.colors.text : theme.colors.textMuted, flex: 1 }}>
          {value || placeholder || "Select"}
        </Text>
        <Text style={{ color: theme.colors.textMuted, marginLeft: 10 }}>{open ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {open ? (
        <View
          style={{
            marginTop: 6,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 12,
            backgroundColor: theme.colors.surface,
            overflow: "hidden",
            maxHeight: 220,
          }}
        >
          <ScrollView nestedScrollEnabled>
            {options.map((option, index) => {
              const selected = option === value;
              return (
                <TouchableOpacity
                  key={`${label}-${option || "empty"}-${index}`}
                  activeOpacity={0.85}
                  onPress={() => onSelect(option)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
                    borderBottomWidth: index === options.length - 1 ? 0 : 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: selected ? "700" : "500" }}>
                    {option || "—"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function WizardModalPicker({
  visible,
  title,
  options,
  value,
  renderOption,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly string[];
  value: string;
  renderOption?: (option: string, selected: boolean) => React.ReactNode;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => undefined}
          style={{ width: "100%", maxWidth: 400, borderRadius: 24, backgroundColor: theme.colors.surface, overflow: "hidden", maxHeight: 500 }}
        >
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.text }}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView>
            {options.map((option, index) => {
              if (!option) return null;
              const selected = option === value;
              return (
                <TouchableOpacity
                  key={`${option}-${index}`}
                  activeOpacity={0.8}
                  onPress={() => { onSelect(option); onClose(); }}
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 15,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: selected ? theme.colors.primarySoft : "transparent",
                    borderBottomWidth: index === options.length - 1 ? 0 : 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  {renderOption ? renderOption(option, selected) : (
                    <Text style={{ fontSize: 15, color: theme.colors.text, fontWeight: selected ? "700" : "400" }}>{option}</Text>
                  )}
                  {selected && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function MiniDropdown({
  value,
  options,
  placeholder,
  isOpen,
  onToggle,
  onSelect,
}: {
  value: string;
  options: readonly string[];
  placeholder?: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (v: string) => void;
}) {
  const theme = useAppTheme();
  const phColor = theme.isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  return (
    <View style={{ zIndex: isOpen ? 50 : 1, flex: 1 }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onToggle}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 7,
          backgroundColor: theme.colors.surface,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 42,
        }}
      >
        <Text style={{ fontSize: 12, color: value ? theme.colors.text : phColor, flex: 1 }}>
          {value || placeholder || "Select"}
        </Text>
        <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={12} color={theme.colors.textMuted} />
      </TouchableOpacity>
      {isOpen ? (
        <View
          style={{
            marginTop: 4,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 10,
            backgroundColor: theme.colors.surface,
            overflow: "hidden",
            maxHeight: 180,
          }}
        >
          <ScrollView nestedScrollEnabled>
            {options.map((opt, idx) => (
              <TouchableOpacity
                key={`${opt || "empty"}-${idx}`}
                onPress={() => onSelect(opt)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  backgroundColor: opt === value ? theme.colors.primarySoft : theme.colors.surface,
                  borderBottomWidth: idx === options.length - 1 ? 0 : 1,
                  borderBottomColor: theme.colors.border,
                }}
              >
                <Text style={{ fontSize: 12, color: theme.colors.text, fontWeight: opt === value ? "700" : "400" }}>
                  {opt || "—"}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function InfoTooltip({
  id,
  visibleId,
  setVisibleId,
  text,
}: {
  id: string;
  visibleId: string | null;
  setVisibleId: React.Dispatch<React.SetStateAction<string | null>>;
  text: string;
}) {
  const theme = useAppTheme();
  const visible = visibleId === id;

  return (
    <View style={{ position: "relative" }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setVisibleId((prev) => (prev === id ? null : id))}
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.surface,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.textMuted }}>?</Text>
      </TouchableOpacity>

      {visible ? (
        <View
          style={{
            position: "absolute",
            top: 24,
            right: 0,
            width: 220,
            borderRadius: 12,
            padding: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
            zIndex: 999,
          }}
        >
          <Text style={{ fontSize: 12, lineHeight: 18, color: theme.colors.text }}>{text}</Text>
        </View>
      ) : null}
    </View>
  );
}

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

function FormSectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  const theme = useAppTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[theme.typography.label, { color: theme.colors.primary }]}>{eyebrow}</Text>
      <Text style={[theme.typography.title, { marginTop: 6, fontSize: 24, lineHeight: 30 }]}>{title}</Text>
      {subtitle ? (
        <Text style={[theme.typography.caption, { marginTop: 5, color: theme.colors.textMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export default function LessonFormScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { showToast, toastProps } = useFeedbackToast({ bottom: Math.max(insets.bottom, 20) + 12 });
  const navigation = useNavigation<LessonFormNavigationProp>();
  const route = useRoute<RouteProp<RootLessonsStackParams, "LessonForm">>();
  const lessonId = route.params?.lessonId;
  const isEdit = !!lessonId;

  const [bootLoading, setBootLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [planRaw, setPlanRaw] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("Vocabulary");
  const [lessonCategory, setLessonCategory] = useState("");
  const [languageLevel, setLanguageLevel] = useState("");
  const [language, setLanguage] = useState<string>(CHOOSE_LANGUAGE_PLACEHOLDER);
  const heroGlowOne = useRef(new Animated.Value(-10)).current;
  const heroGlowTwo = useRef(new Animated.Value(10)).current;
  const [languagePair, setLanguagePair] = useState<string>(LANGUAGE_PAIR_FALLBACK);
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverPreviewUri, setCoverPreviewUri] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [docUrl, setDocUrl] = useState("");
  const [docName, setDocName] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [words, setWords] = useState<WordRow[]>([makeWord(LANGUAGE_PAIR_FALLBACK, "Portuguese (BR)", "vocab")]);
  const [aiSubject, setAiSubject] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [extractLoading, setExtractLoading] = useState(false);
  const [uploadingWordIndex, setUploadingWordIndex] = useState<number | null>(null);
  const [generatingImageIndex, setGeneratingImageIndex] = useState<number | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const toggleAdvanced = (key: string) => { layoutSpring(); setAdvancedOpen((prev) => ({ ...prev, [key]: !prev[key] })); };
  const [openInlineDropdown, setOpenInlineDropdown] = useState<string | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState<string | null>(null);

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [lessonCategoryOpen, setLessonCategoryOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [generatingAllImages, setGeneratingAllImages] = useState(false);
  const [buildMethod, setBuildMethod] = useState<"ai" | "upload" | "manual" | null>(null);

  /** Unset / placeholder → same defaults as web lesson editor (PT conjugation templates, prepositions). */
  const effectiveLessonLanguage = useMemo(() => {
    if (!language || language === CHOOSE_LANGUAGE_PLACEHOLDER || language === "(Choose Language)") {
      return "Portuguese (BR)";
    }
    return language;
  }, [language]);
  const languageConfig = useMemo(
    () => LANGUAGE_CONFIG[effectiveLessonLanguage] ?? LANGUAGE_CONFIG["Portuguese (BR)"],
    [effectiveLessonLanguage]
  );
  const languageForSave = useMemo(
    () => (!language || language === CHOOSE_LANGUAGE_PLACEHOLDER || language === "(Choose Language)" ? "Portuguese (BR)" : language),
    [language]
  );
  const canUseAI = useMemo(() => isAdmin || AI_ELIGIBLE_PLANS.includes(planRaw.toLowerCase()), [isAdmin, planRaw]);
  const compactHeader = width < 440;
  const labelA =
    !language || language === CHOOSE_LANGUAGE_PLACEHOLDER || language === "(Choose Language)"
      ? "Language A"
      : effectiveLessonLanguage;
  const labelB = "English";
  const vocabCount = useMemo(() => words.length, [words]);
  const specialRowCount = useMemo(() => words.filter((w) => w.rowType !== "vocab").length, [words]);
  const conjugationRowCount = useMemo(() => words.filter((w) => w.rowType === "conjugation").length, [words]);
  const prepositionRowCount = useMemo(() => words.filter((w) => w.rowType === "preposition").length, [words]);
  const heroDescription = description.trim() || "Build a richer lesson with stronger metadata, cleaner cards, and vocabulary that is easier to scan.";

  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);

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

  const closeAllDropdowns = () => {
    setCategoryOpen(false);
    setLevelOpen(false);
    setLanguageOpen(false);
    setLessonCategoryOpen(false);
    setOpenInlineDropdown(null);
    setTooltipVisible(null);
  };

  const loadLesson = useCallback(async () => {
    if (!lessonId) return;
    const { data, error } = await (supabase.from("lessons") as any).select("*").eq("id", lessonId).single();
    if (error || !data) throw new Error("Could not load lesson.");

    setTitle(data.title ?? "");
    setDescription(data.description ?? "");
    const cfg = data.content_json && typeof data.content_json === "object" ? data.content_json : {};
    const inferredInstructionalCategory = String((cfg as any).instructional_category ?? data.grade_range ?? "Vocabulary");
    const storedLessonCategory = String((cfg as any).lesson_category ?? "");
    setCategory(inferredInstructionalCategory);
    setLessonCategory(storedLessonCategory);
    setLanguageLevel(data.language_level ?? "");
    const savedLanguage =
      data.language ?? (cfg as { instructional_language?: string }).instructional_language ?? "Portuguese (BR)";
    const savedPair = pairForLessonLanguage(
      savedLanguage,
      typeof (cfg as any).language_pair === "string" ? (cfg as any).language_pair : LANGUAGE_PAIR_FALLBACK
    );
    setLanguage(savedLanguage);
    setCoverImageUrl(data.cover_image_url ?? "");
    setCoverPreviewUri(data.cover_image_url ?? "");
    setTeacherId(data.created_by ?? "");

    setLanguagePair(savedPair);
    setDocUrl((cfg as any).document_url ?? "");
    setDocName((cfg as any).document_name ?? "");
    const rawWords = Array.isArray((cfg as any).words) ? (cfg as any).words : [];
    const mapped: WordRow[] = rawWords.map((w: any) => {
      const rt: RowType = w.rowType === "conjugation" ? "conjugation" : w.rowType === "preposition" ? "preposition" : "vocab";
      const base = makeWord(savedPair, savedLanguage, rt);
      return {
        ...base,
        key: uid(),
        termA: String(w.pt ?? w.term_a ?? ""),
        termB: String(w.en ?? w.term_b ?? ""),
        contextA: String(w.sp ?? w.context_a ?? ""),
        contextB: String(w.se ?? w.context_b ?? ""),
        altA: Array.isArray(w.pt_alt ?? w.alt_a) ? (w.pt_alt ?? w.alt_a).join(", ") : "",
        altB: Array.isArray(w.en_alt ?? w.alt_b) ? (w.en_alt ?? w.alt_b).join(", ") : "",
        image_url: String(w.image_url ?? ""),
        tense: String(w.tense ?? ""),
        grammar: String(w.grammar ?? base.grammar),
        isInfinitive: w.isInfinitive === true,
        infinitive: String(w.infinitive ?? ""),
        conjugations: Array.isArray(w.conjugations) && w.conjugations.length > 0
          ? w.conjugations.map((c: any, ci: number) => ({
              pronoun: String(c.pronoun ?? "") || base.conjugations[ci]?.pronoun || "",
              form_a: String(c.form_a ?? ""),
              form_b: String(c.form_b ?? ""),
            }))
          : base.conjugations,
        prepositionTitle: String(w.prepositionTitle ?? base.prepositionTitle),
        prepositionGroup: String(w.prepositionGroup ?? base.prepositionGroup),
        prepositionTemplateId: String(w.prepositionTemplateId ?? base.prepositionTemplateId),
        prepositions: Array.isArray(w.prepositions) ? w.prepositions.map((p: any) => ({ left: String(p.left ?? ""), right: String(p.right ?? ""), answer: String(p.answer ?? ""), note: String(p.note ?? "") })) : base.prepositions,
      };
    });
    setWords(mapped.length ? mapped : [makeWord(savedPair, savedLanguage, "vocab")]);

    if (!storedLessonCategory) {
      const { data: links, error: linksError } = await (supabase.from("lesson_pack_lessons") as any)
        .select("pack_id")
        .eq("lesson_id", lessonId);
      if (linksError) throw linksError;

      const packIds = Array.isArray(links) ? links.map((link: any) => String(link.pack_id ?? "")).filter(Boolean) : [];
      if (packIds.length > 0) {
        const { data: packs, error: packsError } = await (supabase.from("lesson_packs") as any)
          .select("id, title, category")
          .in("id", packIds);
        if (packsError) throw packsError;

        const matchedPack = ((packs || []) as any[]).find((pack) =>
          LESSON_PACK_CATEGORIES.includes(String(pack.title ?? "") as (typeof LESSON_PACK_CATEGORIES)[number]) ||
          LESSON_PACK_CATEGORIES.includes(String(pack.category ?? "") as (typeof LESSON_PACK_CATEGORIES)[number])
        );

        if (matchedPack) {
          setLessonCategory(String(matchedPack.title ?? matchedPack.category ?? ""));
        }
      }
    }
  }, [lessonId]);

  const syncLessonCategoryLink = useCallback(async (savedLessonId: string, selectedLessonCategory: string, actingUserId: string) => {
    const normalizedCategory = selectedLessonCategory.trim();
    const { data: existingLinks, error: existingLinksError } = await (supabase.from("lesson_pack_lessons") as any)
      .select("pack_id")
      .eq("lesson_id", savedLessonId);
    if (existingLinksError) throw existingLinksError;

    const existingPackIds = Array.isArray(existingLinks)
      ? existingLinks.map((link: any) => String(link.pack_id ?? "")).filter(Boolean)
      : [];

    let existingCategoryPackIds: string[] = [];
    if (existingPackIds.length > 0) {
      const { data: existingPacks, error: existingPacksError } = await (supabase.from("lesson_packs") as any)
        .select("id, title, category")
        .in("id", existingPackIds);
      if (existingPacksError) throw existingPacksError;

      existingCategoryPackIds = ((existingPacks || []) as any[])
        .filter((pack) =>
          LESSON_PACK_CATEGORIES.includes(String(pack.title ?? "") as (typeof LESSON_PACK_CATEGORIES)[number]) ||
          LESSON_PACK_CATEGORIES.includes(String(pack.category ?? "") as (typeof LESSON_PACK_CATEGORIES)[number])
        )
        .map((pack) => String(pack.id ?? ""))
        .filter(Boolean);
    }

    if (!normalizedCategory) {
      if (existingCategoryPackIds.length > 0) {
        const { error: deleteError } = await (supabase.from("lesson_pack_lessons") as any)
          .delete()
          .eq("lesson_id", savedLessonId)
          .in("pack_id", existingCategoryPackIds);
        if (deleteError) throw deleteError;
      }
      return;
    }

    let { data: pack, error: packLookupError } = await (supabase.from("lesson_packs") as any)
      .select("id")
      .eq("title", normalizedCategory)
      .maybeSingle();
    if (packLookupError) throw packLookupError;

    if (!pack?.id) {
      const categorySlug = normalizedCategory.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { data: createdPack, error: createdPackError } = await (supabase.from("lesson_packs") as any)
        .insert({
          title: normalizedCategory,
          slug: categorySlug,
          category: normalizedCategory,
          status: "published",
          access_type: "free",
          created_by: actingUserId,
          updated_by: actingUserId,
        })
        .select("id")
        .single();
      if (createdPackError) throw createdPackError;
      pack = createdPack;
    }

    const targetPackId = String(pack?.id ?? "");
    const linksToRemove = existingCategoryPackIds.filter((packId) => packId !== targetPackId);
    if (linksToRemove.length > 0) {
      const { error: deleteError } = await (supabase.from("lesson_pack_lessons") as any)
        .delete()
        .eq("lesson_id", savedLessonId)
        .in("pack_id", linksToRemove);
      if (deleteError) throw deleteError;
    }

    if (targetPackId) {
      const { error: upsertError } = await (supabase.from("lesson_pack_lessons") as any)
        .upsert(
          [{ pack_id: targetPackId, lesson_id: savedLessonId, sort_order: 0 }],
          { onConflict: "pack_id,lesson_id" }
        );
      if (upsertError) throw upsertError;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not logged in");
        if (cancelled) return;
        setCurrentUserId(user.id);
        if (!lessonId) setTeacherId(user.id);

        const { data: tr } = await (supabase.from("teachers") as any).select("role, plan").eq("user_id", user.id).maybeSingle();
        if (!cancelled) {
          setIsAdmin((tr as any)?.role === "admin");
          setPlanRaw(String((tr as any)?.plan ?? ""));
        }
        if (isEdit) await loadLesson();
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : "Load failed");
        navigation.goBack();
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, lessonId, loadLesson, navigation]);

  const inputStyle = {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
  };

  const getAccessToken = async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) throw error;
    if (session?.access_token) return session.access_token;

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;
    if (!refreshed.session?.access_token) throw new Error("Not authenticated");
    return refreshed.session.access_token;
  };

  const postAuthed = async (path: string, token: string, init: { body?: any; headers?: Record<string, string> }) =>
    fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(supabaseAnonKey ? { apikey: supabaseAnonKey } : {}),
        ...(init.headers ?? {}),
      },
      body: init.body,
    });

  const authedJsonFetch = async (path: string, body: unknown) => {
    const base = apiBaseUrl.replace(/\/$/, "");
    let token = await getAccessToken();
    let res = await postAuthed(path, token, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      token = refreshed.session?.access_token || token;
      res = await postAuthed(path, token, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok) {
      const detail = String(json?.error ?? json?.message ?? "").trim();
      if (res.status === 401) {
        throw new Error(
          `Unauthorized (${res.status}) from ${base}. If this app should use your patched backend, set EXPO_PUBLIC_API_BASE_URL to that server or deploy the Eluency API changes.`
        );
      }
      throw new Error(detail ? `${detail} (${res.status})` : `Request failed (${res.status})`);
    }
    return json;
  };

  const uploadFile = async (uri: string, prefix: string, ext: string, type: string, maxBytes: number) => {
    const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    let payload: Blob | ArrayBuffer;
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      if (blob.size > maxBytes) throw new Error(`File must be under ${Math.floor(maxBytes / (1024 * 1024))}MB`);
      payload = blob;
    } catch {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" as any });
      const bytes = base64ByteSize(base64);
      if (bytes > maxBytes) throw new Error(`File must be under ${Math.floor(maxBytes / (1024 * 1024))}MB`);
      payload = decodeBase64(base64);
    }
    const { error } = await supabase.storage.from("lesson-assets").upload(path, payload, { contentType: type });
    if (error) throw error;
    const { data } = supabase.storage.from("lesson-assets").getPublicUrl(path);
    return data.publicUrl;
  };

  const pickCover = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return Alert.alert("Permission", "Allow media access.");
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", allowsEditing: true, quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setCoverPreviewUri(a.uri);
    setCoverUploading(true);
    try {
      const ext = (a.fileName?.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ext === "png" || ext === "webp" || ext === "gif" || ext === "jpg" || ext === "jpeg" ? ext : "jpg";
      const url = await uploadFile(a.uri, "lesson-covers", safeExt, a.mimeType || "image/jpeg", 2 * 1024 * 1024);
      setCoverImageUrl(url);
      if (!a.uri.startsWith("file:")) setCoverPreviewUri(url);
    } catch (e) {
      setCoverPreviewUri(coverImageUrl);
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload");
    } finally {
      setCoverUploading(false);
    }
  };

  const pickDoc = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    try {
      const url = await uploadFile(a.uri, "lesson-docs", "pdf", "application/pdf", 25 * 1024 * 1024);
      setDocUrl(url);
      setDocName(a.name || "Lesson PDF");
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload");
    }
  };

  const extractVocabularyFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const file = result.assets[0];
    setExtractLoading(true);
    try {
      let token = await getAccessToken();
      const form = new FormData();
      form.append("file", { uri: file.uri, name: file.name || "vocab-file", type: file.mimeType || "application/octet-stream" } as any);
      form.append("language_pair", languagePair);
      let res = await postAuthed("/api/ai/lessons/extract-vocabulary-from-file", token, { body: form });
      if (res.status === 401) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) throw refreshError;
        token = refreshed.session?.access_token || token;
        res = await postAuthed("/api/ai/lessons/extract-vocabulary-from-file", token, { body: form });
      }
      const json = (await res.json().catch(() => ({}))) as Record<string, any>;
      if (!res.ok) {
        const detail = String(json?.error ?? json?.message ?? "").trim();
        throw new Error(detail ? `${detail} (${res.status})` : `Extraction failed (${res.status})`);
      }
      const extracted = Array.isArray(json.words) ? json.words : [];
      if (!extracted.length) return Alert.alert("AI", "No vocabulary found in this file.");
      setWords((prev) =>
        prev.concat(
          extracted.map((w: any) => ({
            ...makeWord(languagePair, effectiveLessonLanguage, "vocab"),
            termA: String(w.pt ?? w.term_a ?? ""),
            termB: String(w.en ?? w.term_b ?? ""),
            contextA: String(w.sp ?? w.context_a ?? ""),
            contextB: String(w.se ?? w.context_b ?? ""),
            altA: Array.isArray(w.pt_alt ?? w.alt_a) ? (w.pt_alt ?? w.alt_a).join(", ") : "",
            altB: Array.isArray(w.en_alt ?? w.alt_b) ? (w.en_alt ?? w.alt_b).join(", ") : "",
            image_url: String(w.image_url ?? ""),
          }))
        )
      );
    } catch (e) {
      Alert.alert("AI Error", e instanceof Error ? e.message : "Could not extract vocabulary");
    } finally {
      setExtractLoading(false);
    }
  };

  const pickWordImage = async (index: number) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return Alert.alert("Permission", "Allow media access.");
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", allowsEditing: true, quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setUploadingWordIndex(index);
    try {
      const ext = (a.fileName?.split(".").pop() || "jpg").toLowerCase();
      const url = await uploadFile(a.uri, "lesson-assets", ext, a.mimeType || "image/jpeg", 2 * 1024 * 1024);
      setWords((prev) => prev.map((x, i) => (i === index ? { ...x, image_url: url } : x)));
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload");
    } finally {
      setUploadingWordIndex(null);
    }
  };

  const generateWithAI = async () => {
    const subject = aiSubject.trim() || title.trim();
    if (!subject) return Alert.alert("AI", "Enter a subject or title first.");
    setAiLoading(true);
    try {
      const json = await authedJsonFetch("/api/ai/lessons/generate-vocabulary", { subject, language_pair: languagePair });
      const generated = Array.isArray(json.words) ? json.words : [];
      if (!generated.length) return Alert.alert("AI", "No words generated.");
      const rows = generated.map((w: any) => ({
        ...makeWord(languagePair, effectiveLessonLanguage, "vocab"),
        termA: String(w.pt ?? w.term_a ?? ""),
        termB: String(w.en ?? w.term_b ?? ""),
        contextA: String(w.sp ?? w.context_a ?? ""),
        contextB: String(w.se ?? w.context_b ?? ""),
        altA: Array.isArray(w.pt_alt ?? w.alt_a) ? (w.pt_alt ?? w.alt_a).join(", ") : "",
        altB: Array.isArray(w.en_alt ?? w.alt_b) ? (w.en_alt ?? w.alt_b).join(", ") : "",
        image_url: String(w.image_url ?? ""),
      }));
      setWords((prev) => [...prev, ...rows]);
      if (!title.trim()) setTitle(subject);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not generate";
      Alert.alert("AI Error", `${msg}\n\nIf this stays at 401 after re-login, the website AI route is rejecting mobile auth and needs a backend fix.`);
    } finally {
      setAiLoading(false);
    }
  };

  const generateAllImages = async () => {
    if (!canUseAI) return Alert.alert("AI", "AI is not available on your current plan.");
    const eligible = words
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => w.rowType === "vocab" && (w.termA.trim() || w.termB.trim()) && !w.image_url.trim());
    if (!eligible.length) return Alert.alert("AI", "No vocab rows need images.");
    setGeneratingAllImages(true);
    for (const { i } of eligible) {
      await generateWordImageWithAI(i);
    }
    setGeneratingAllImages(false);
  };

  const generateWordImageWithAI = async (index: number) => {
    const row = words[index];
    if (!row) return;
    if (!row.termA.trim() && !row.termB.trim()) return Alert.alert("AI", "Enter a term first.");
    setGeneratingImageIndex(index);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const result = await getOrCreateVocabImage(token, {
        pt: row.termA.trim() || row.termB.trim(),
        en: row.termB.trim() || row.termA.trim(),
        category,
        tags: ["lesson", "vocab", languagePair],
      });
      if (!result.image_url) return Alert.alert("AI", "No image returned.");
      setWords((prev) => prev.map((x, i) => (i === index ? { ...x, image_url: result.image_url } : x)));
    } catch (e) {
      Alert.alert("AI Error", e instanceof Error ? e.message : "Could not generate image");
    } finally {
      setGeneratingImageIndex(null);
    }
  };

  const fillBlanksWithAI = async (index: number) => {
    const row = words[index];
    if (!row) return;
    if (!row.termA.trim() && !row.termB.trim()) return Alert.alert("AI", "Enter a term first.");
    try {
      const json = await authedJsonFetch("/api/ai/lessons/fill-in-the-blanks", {
        language_pair: languagePair,
        term_a: row.termA.trim() || null,
        term_b: row.termB.trim() || null,
        existing: {
          pt: row.termA,
          en: row.termB,
          sp: row.contextA,
          se: row.contextB,
          pt_alt: row.altA.split(",").map((s) => s.trim()).filter(Boolean),
          en_alt: row.altB.split(",").map((s) => s.trim()).filter(Boolean),
          term_a: row.termA,
          term_b: row.termB,
          context_a: row.contextA,
          context_b: row.contextB,
          alt_a: row.altA.split(",").map((s) => s.trim()).filter(Boolean),
          alt_b: row.altB.split(",").map((s) => s.trim()).filter(Boolean),
        },
      });
      const w = json.word ?? {};
      setWords((prev) =>
        prev.map((x, i) =>
          i === index
            ? {
                ...x,
                termA: String(w.pt ?? w.term_a ?? x.termA),
                termB: String(w.en ?? w.term_b ?? x.termB),
                contextA: String(w.sp ?? w.context_a ?? x.contextA),
                contextB: String(w.se ?? w.context_b ?? x.contextB),
                altA: Array.isArray(w.pt_alt ?? w.alt_a) ? (w.pt_alt ?? w.alt_a).join(", ") : x.altA,
                altB: Array.isArray(w.en_alt ?? w.alt_b) ? (w.en_alt ?? w.alt_b).join(", ") : x.altB,
              }
            : x
        )
      );
    } catch (e) {
      Alert.alert("AI Error", e instanceof Error ? e.message : "Could not fill blanks");
    }
  };

  const save = async () => {
    if (!title.trim()) {
      showToast("Title required.", "danger");
      return;
    }
    if (coverUploading) {
      showToast("Please wait for the cover image to finish uploading.", "info");
      return;
    }
    const serializedWords = words
      .map((w) => ({
        rowType: w.rowType,
        pt: w.rowType === "vocab" ? w.termA.trim() : undefined,
        en: w.rowType === "vocab" ? w.termB.trim() : undefined,
        sp: w.rowType === "vocab" ? (w.contextA.trim() || undefined) : undefined,
        se: w.rowType === "vocab" ? (w.contextB.trim() || undefined) : undefined,
        pt_alt: w.rowType === "vocab" ? w.altA.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        en_alt: w.rowType === "vocab" ? w.altB.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        term_a: w.rowType === "vocab" ? w.termA.trim() : undefined,
        term_b: w.rowType === "vocab" ? w.termB.trim() : undefined,
        context_a: w.rowType === "vocab" ? (w.contextA.trim() || undefined) : undefined,
        context_b: w.rowType === "vocab" ? (w.contextB.trim() || undefined) : undefined,
        alt_a: w.rowType === "vocab" ? w.altA.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        alt_b: w.rowType === "vocab" ? w.altB.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        image_url: w.image_url.trim() || undefined,
        tense: w.tense.trim() || undefined,
        grammar: w.grammar.trim() || undefined,
        isInfinitive: w.isInfinitive || undefined,
        infinitive: w.rowType === "conjugation" ? w.infinitive.trim() : undefined,
        conjugations: w.rowType === "conjugation" ? w.conjugations.filter((c) => c.pronoun || c.form_a || c.form_b) : undefined,
        prepositionTitle: w.rowType === "preposition" ? w.prepositionTitle.trim() : undefined,
        prepositionGroup: w.rowType === "preposition" ? w.prepositionGroup.trim() : undefined,
        prepositionTemplateId: w.rowType === "preposition" ? w.prepositionTemplateId.trim() : undefined,
        prepositions: w.rowType === "preposition" ? w.prepositions.filter((p) => p.left || p.right || p.answer || p.note) : undefined,
      }))
      .filter((w) => {
        if (w.rowType === "conjugation") return !!(w.infinitive || w.conjugations?.length);
        if (w.rowType === "preposition") return !!(w.prepositionTitle || w.prepositions?.length);
        return !!(w.pt || w.en || w.sp || w.se || w.term_a || w.term_b || w.context_a || w.context_b);
      });
    const content_json = {
      language_pair: languagePair,
      instructional_language: languageForSave,
      instructional_category: category,
      lesson_category: lessonCategory.trim() || null,
      document_url: docUrl.trim() || null,
      document_name: docName.trim() || null,
      words: serializedWords,
    };

    setSaving(true);
    try {
      const ownerId = isAdmin ? (teacherId || currentUserId) : currentUserId;
      let savedLessonId = lessonId ?? "";
      if (isEdit && lessonId) {
        const payload: Record<string, unknown> = {
          title: title.trim(),
          description: description.trim() || null,
          grade_range: category,
          language_level: languageLevel || null,
          language: languageForSave,
          cover_image_url: coverImageUrl.trim() || null,
          content_json,
          status: "published",
          updated_by: currentUserId,
          updated_at: new Date().toISOString(),
        };
        if (isAdmin) {
          payload.teacher_id = ownerId;
          payload.created_by = ownerId;
        }
        const { error } = await (supabase.from("lessons") as any).update(payload).eq("id", lessonId);
        if (error) throw error;
      } else {
        const slug = `${title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Math.random().toString(36).slice(2, 7)}`;
        const { data: insertedLesson, error } = await (supabase.from("lessons") as any).insert({
          title: title.trim(),
          slug,
          description: description.trim() || null,
          grade_range: category,
          language_level: languageLevel || null,
          language: languageForSave,
          cover_image_url: coverImageUrl.trim() || null,
          content_json,
          status: "published",
          teacher_id: ownerId,
          created_by: ownerId,
          updated_by: currentUserId,
        }).select("id").single();
        if (error) throw error;
        savedLessonId = String(insertedLesson?.id ?? "");
      }

      if (isAdmin && savedLessonId && currentUserId) {
        await syncLessonCategoryLink(savedLessonId, lessonCategory, currentUserId);
      }
      triggerSuccessHaptic();
      const lessonsFlashParams: LessonFlashParams = {
        flashMessage: isEdit ? "Lesson updated." : "Lesson created.",
        flashTone: "success",
      };
      navigation.navigate("Lessons", lessonsFlashParams);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed", "danger");
    } finally {
      setSaving(false);
    }
  };

  const openWeb = () => {
    const path = lessonId ? `/dashboard/lessons/${lessonId}/edit` : "/dashboard/lessons/new";
    const url = `${apiBaseUrl.replace(/\/$/, "")}${path}`;
    Linking.openURL(url).catch(() => Alert.alert("Web", url));
  };

  if (bootLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: Math.max(insets.top, 8), paddingHorizontal: 16 }}>
        <GlassCard style={{ borderRadius: 26, marginBottom: 16 }} padding={14}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <SkeletonBox width={46} height={46} radius={16} />
            <View style={{ flex: 1, gap: 8 }}>
              <SkeletonBox width="34%" height={12} radius={6} />
              <SkeletonBox width="52%" height={20} radius={10} />
            </View>
            <SkeletonBox width={84} height={40} radius={14} />
          </View>
        </GlassCard>
        <GlassCard style={{ borderRadius: 30 }} padding={22}>
          <View style={{ gap: 16 }}>
            <SkeletonBox width="100%" height={180} radius={20} />
            <SkeletonBox width="55%" height={16} radius={8} />
            <SkeletonBox width="100%" height={48} radius={14} />
            <SkeletonBox width="100%" height={110} radius={18} />
            <SkeletonBox width="100%" height={160} radius={24} />
          </View>
        </GlassCard>
      </View>
    );
  }

  const placeholderColor = theme.isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";

  const pillStyle = {
    flex: 1,
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

  const WIZARD_TITLES = ["", "Lesson Identity", "Language & Settings", "Build Your Lesson", "Vocabulary Builder"];
  const WIZARD_SUBTITLES = [
    "",
    "Add a cover image, title, and description to kick things off.",
    "Select the lesson language, level, and optional categories.",
    "How would you like to build your lesson?",
    "Add vocabulary pairs, conjugations, and preposition drills.",
  ];

  const advanceWizard = () => {
    if (wizardStep === 1 && !title.trim()) {
      showToast("Please add a lesson title first.", "danger");
      return;
    }
    if (wizardStep === 2 && (!language || language === CHOOSE_LANGUAGE_PLACEHOLDER)) {
      showToast("Please select a lesson language.", "danger");
      return;
    }
    Keyboard.dismiss();
    setWizardStep((s) => Math.min(s + 1, 4));
  };

  if (!isEdit) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {pendingLanguage ? (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 24 }}>
            <GlassCard style={{ width: "100%", borderRadius: 28 }} variant="strong">
              <Text style={[theme.typography.title, { marginBottom: 8 }]}>Change language?</Text>
              <Text style={[theme.typography.body, { marginBottom: 16, color: theme.colors.textMuted }]}>
                Switching to <Text style={{ fontWeight: "800", color: theme.colors.text }}>{pendingLanguage}</Text> may affect conjugation and preposition rows.
              </Text>
              <TouchableOpacity onPress={() => { const np = pairForLessonLanguage(pendingLanguage, languagePair); setLanguage(pendingLanguage); setLanguagePair(np); setWords((prev) => prev.map((w) => w.rowType === "conjugation" ? { ...w, conjugations: conjugationsFor(pendingLanguage) } : w)); setPendingLanguage(null); }} style={{ borderRadius: 12, backgroundColor: theme.colors.primary, paddingVertical: 14, alignItems: "center", marginBottom: 10 }}>
                <Text style={{ color: theme.colors.primaryText, fontWeight: "800", fontSize: 15 }}>Keep existing rows</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { const np = pairForLessonLanguage(pendingLanguage, languagePair); setLanguage(pendingLanguage); setLanguagePair(np); setWords((prev) => { const kept = prev.filter((w) => w.rowType === "vocab"); return kept.length > 0 ? kept : [makeWord(np, pendingLanguage, "vocab")]; }); setPendingLanguage(null); }} style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 14, alignItems: "center", marginBottom: 10 }}>
                <Text style={{ color: theme.colors.text, fontWeight: "700", fontSize: 15 }}>Clear language-specific rows</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPendingLanguage(null)} style={{ alignItems: "center", paddingVertical: 10 }}>
                <Text style={{ color: theme.colors.textMuted, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
            </GlassCard>
          </View>
        ) : null}

        {/* Wizard header */}
        <View style={{ paddingTop: Math.max(insets.top, 8) + 8, paddingHorizontal: 20, paddingBottom: 8 }}>
          <TouchableOpacity
            onPress={() => { if (wizardStep <= 1) navigation.goBack(); else setWizardStep((s) => s - 1); }}
            style={{ alignSelf: "flex-start", padding: 4, marginBottom: 18 }}
          >
            <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
          </TouchableOpacity>

          {/* Progress bar */}
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 20 }}>
            {[1, 2, 3, 4].map((s) => (
              <View key={s} style={{ flex: 1, height: 4, borderRadius: 999, backgroundColor: s <= wizardStep ? theme.colors.primary : theme.colors.border }} />
            ))}
          </View>

          <Text style={[theme.typography.label, { color: theme.colors.textMuted, marginBottom: 4 }]}>
            Step {wizardStep} of 4
          </Text>
          <Text style={[theme.typography.display, { fontSize: 26, lineHeight: 32 }]}>
            {WIZARD_TITLES[wizardStep]}
          </Text>
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: 6, marginBottom: 4 }]}>
            {WIZARD_SUBTITLES[wizardStep]}
          </Text>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48, gap: 16 }}
        >
          {/* ── Step 1: Cover + Title + Description ── */}
          {wizardStep === 1 && (
            <>
              <TouchableOpacity onPress={pickCover} activeOpacity={0.9}>
                {coverPreviewUri.trim() ? (
                  <Image source={{ uri: coverPreviewUri.trim() }} style={{ width: "100%", height: 210, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border }} resizeMode="cover" />
                ) : (
                  <View style={{ width: "100%", height: 210, borderRadius: 20, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <Ionicons name="image-outline" size={40} color={theme.colors.textMuted} />
                    <Text style={{ color: theme.colors.textMuted, fontWeight: "700", fontSize: 14 }}>Add cover image</Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>Tap to choose a photo</Text>
                  </View>
                )}
              </TouchableOpacity>
              {coverUploading ? (
                <Text style={{ textAlign: "center", color: theme.colors.textMuted, fontSize: 12 }}>Uploading cover…</Text>
              ) : null}

              <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Lesson title *"
                  placeholderTextColor={placeholderColor}
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, fontSize: 22, fontWeight: "800", color: theme.colors.text }}
                />
                <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  placeholder="Description (optional)"
                  placeholderTextColor={placeholderColor}
                  style={{ paddingHorizontal: 20, paddingVertical: 16, fontSize: 15, lineHeight: 22, color: theme.colors.text, minHeight: 82 }}
                />
              </View>

              <AppButton label="Continue →" onPress={advanceWizard} />
            </>
          )}

          {/* ── Step 2: Language + Settings + Doc ── */}
          {wizardStep === 2 && (
            <>
              {/* Modals — rendered outside ScrollView content so they cover full screen */}
              <WizardModalPicker
                visible={languageOpen}
                title="Lesson Language"
                options={LESSON_LANGUAGES.filter((l) => l !== CHOOSE_LANGUAGE_PLACEHOLDER)}
                value={language}
                renderOption={(opt, selected) => (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <Text style={{ fontSize: 24 }}>{LANGUAGE_FLAGS[opt] ?? "🌐"}</Text>
                    <Text style={{ fontSize: 15, color: theme.colors.text, fontWeight: selected ? "700" : "400" }}>{opt}</Text>
                  </View>
                )}
                onSelect={(val) => {
                  if (val === language) return;
                  const hasContent = words.some((w) => w.termA.trim() || w.termB.trim() || w.infinitive?.trim());
                  const hasSpecial = words.some((w) => w.rowType === "conjugation" || w.rowType === "preposition");
                  if (hasContent && hasSpecial) { setPendingLanguage(val); } else {
                    const np = pairForLessonLanguage(val, languagePair);
                    setLanguage(val); setLanguagePair(np);
                    setWords((prev) => prev.map((w) => { if (w.rowType === "conjugation") return { ...w, conjugations: conjugationsFor(val) }; if (w.rowType === "preposition" && !LANGUAGE_CONFIG[val]?.rowTypes.includes("preposition")) return makeWord(np, val, "vocab"); return w; }));
                  }
                }}
                onClose={() => setLanguageOpen(false)}
              />
              <WizardModalPicker
                visible={levelOpen}
                title="Level"
                options={LANGUAGE_LEVELS.filter(Boolean)}
                value={languageLevel}
                onSelect={(val) => setLanguageLevel(val)}
                onClose={() => setLevelOpen(false)}
              />
              <WizardModalPicker
                visible={categoryOpen}
                title="Category"
                options={CATEGORY_OPTIONS}
                value={category}
                onSelect={(val) => setCategory(val)}
                onClose={() => setCategoryOpen(false)}
              />
              {isAdmin && (
                <WizardModalPicker
                  visible={lessonCategoryOpen}
                  title="Lesson Category"
                  options={LESSON_PACK_CATEGORIES}
                  value={lessonCategory}
                  onSelect={(val) => setLessonCategory(val)}
                  onClose={() => setLessonCategoryOpen(false)}
                />
              )}

              {/* PDF upload — top */}
              <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Lesson Document (PDF)</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 }}>
                    This will show up on your students' Study screen as a PDF they can review from their phone.
                  </Text>
                </View>
                <View style={{ padding: 14, gap: 10 }}>
                  {docUrl ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Ionicons name="document-outline" size={16} color={theme.colors.primary} />
                      <Text style={{ flex: 1, fontSize: 13, color: theme.colors.text }} numberOfLines={1}>{docName || docUrl}</Text>
                      <TouchableOpacity onPress={() => { setDocUrl(""); setDocName(""); }}>
                        <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <TouchableOpacity onPress={pickDoc} style={{ paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.primary, alignItems: "center", backgroundColor: theme.colors.primarySoft }}>
                    <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: "700" }}>Upload PDF</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Language */}
              <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.primary, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Lesson Language</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 }}>
                    This sets the language pair used across all vocabulary pairs, conjugations, and drills in this lesson.
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setLanguageOpen(true)}
                  style={{ margin: 14, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: theme.colors.surfaceAlt, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  {language && language !== CHOOSE_LANGUAGE_PLACEHOLDER ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text style={{ fontSize: 20 }}>{LANGUAGE_FLAGS[language] ?? "🌐"}</Text>
                      <Text style={{ fontSize: 15, color: theme.colors.text, fontWeight: "600" }}>{language}</Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 15, color: theme.colors.textMuted }}>Choose Language</Text>
                  )}
                  <Ionicons name="chevron-down" size={16} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Level + Category + Admin — combined pill */}
              <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Optional Settings</Text>
                </View>

                {/* Level */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setLevelOpen(true)}
                  style={{ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.text, marginBottom: 2 }}>Level</Text>
                    <Text style={{ fontSize: 11, color: theme.colors.textMuted, lineHeight: 15 }}>CEFR level for this lesson — tags it for CEFR Vocabulary or Lesson categories.</Text>
                  </View>
                  <View style={{ marginLeft: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.surfaceAlt, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 90 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13, color: languageLevel ? theme.colors.text : theme.colors.textMuted, fontWeight: languageLevel ? "700" : "400", flex: 1, textAlign: "center" }}>
                      {languageLevel || "Select"}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={theme.colors.textMuted} />
                  </View>
                </TouchableOpacity>

                {/* Category */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setCategoryOpen(true)}
                  style={{ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: isAdmin ? 1 : 0, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.text, marginBottom: 2 }}>Category</Text>
                    <Text style={{ fontSize: 11, color: theme.colors.textMuted, lineHeight: 15 }}>Instructional type — e.g. Vocabulary, Verb Tenses, Phrasal Verbs.</Text>
                  </View>
                  <View style={{ marginLeft: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.surfaceAlt, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 90 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13, color: category ? theme.colors.text : theme.colors.textMuted, fontWeight: category ? "700" : "400", flex: 1, textAlign: "center" }}>
                      {category || "Select"}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={theme.colors.textMuted} />
                  </View>
                </TouchableOpacity>

                {/* Admin: Lesson Category */}
                {isAdmin ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setLessonCategoryOpen(true)}
                    style={{ paddingHorizontal: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.text, marginBottom: 2 }}>Lesson Category</Text>
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted, lineHeight: 15 }}>Add this lesson to a curriculum category pack.</Text>
                    </View>
                    <View style={{ marginLeft: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.surfaceAlt, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 90 }}>
                      <Text numberOfLines={1} style={{ fontSize: 13, color: lessonCategory ? theme.colors.text : theme.colors.textMuted, fontWeight: lessonCategory ? "700" : "400", flex: 1, textAlign: "center" }}>
                        {lessonCategory || "Select"}
                      </Text>
                      <Ionicons name="chevron-down" size={12} color={theme.colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                ) : null}
              </View>

              <AppButton label="Continue →" onPress={advanceWizard} />
            </>
          )}

          {/* ── Step 3: Build Method Choice ── */}
          {wizardStep === 3 && (
            <>
              {/* Upload PDF/Excel — blue */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { setBuildMethod("upload"); setWizardStep(4); }}
                style={{ borderWidth: 1.5, borderColor: "#0EA5E9", borderRadius: 22, backgroundColor: "#0EA5E911", padding: 22, flexDirection: "row", alignItems: "center", gap: 16 }}
              >
                <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: "#0EA5E9", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="cloud-upload-outline" size={24} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: "#0EA5E9", marginBottom: 4 }}>Upload a PDF / Excel</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 }}>AI extracts vocabulary pairs from your file automatically.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#0EA5E9" />
              </TouchableOpacity>

              {/* Build with AI — purple/primary */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { setBuildMethod("ai"); setWizardStep(4); }}
                style={{ borderWidth: 1.5, borderColor: canUseAI ? "#EF4444" : theme.colors.border, borderRadius: 22, backgroundColor: canUseAI ? "#EF444411" : theme.colors.surfaceGlass, padding: 22, flexDirection: "row", alignItems: "center", gap: 16 }}
              >
                <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: canUseAI ? "#EF4444" : theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="sparkles-outline" size={24} color={canUseAI ? "#fff" : theme.colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: canUseAI ? "#EF4444" : theme.colors.text }}>Build with AI</Text>
                    {canUseAI ? (
                      <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: "#EF4444" }}>
                        <Text style={{ fontSize: 9, fontWeight: "800", color: "#fff" }}>AI enabled</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 }}>Describe a topic or paste a word list — AI builds your vocab.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={canUseAI ? "#EF4444" : theme.colors.textMuted} />
              </TouchableOpacity>

              {/* Create Manually — green */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { setBuildMethod("manual"); setWizardStep(4); }}
                style={{ borderWidth: 1.5, borderColor: "#10B981", borderRadius: 22, backgroundColor: "#10B98111", padding: 22, flexDirection: "row", alignItems: "center", gap: 16 }}
              >
                <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="create-outline" size={24} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: "#10B981", marginBottom: 4 }}>Create Manually</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 }}>Type in your vocabulary pairs one by one.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#10B981" />
              </TouchableOpacity>
            </>
          )}

          {/* ── Step 4: Vocabulary Builder ── */}
          {wizardStep === 4 && (
            <>
              {/* Build method pill */}
              {buildMethod === "ai" && (
                <View style={{ borderWidth: 1.5, borderColor: "#EF4444", borderRadius: 20, backgroundColor: "#EF444411", overflow: "hidden" }}>
                  <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#EF444433" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Ionicons name="sparkles-outline" size={14} color="#EF4444" />
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#EF4444", letterSpacing: 1.2, textTransform: "uppercase" }}>AI Lesson Generator</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: "#EF4444", opacity: 0.75, marginTop: 4, lineHeight: 16 }}>
                      Describe the topic or paste a vocabulary list — AI will fill the builder below automatically.
                    </Text>
                  </View>
                  <View style={{ padding: 14, gap: 10 }}>
                    <TextInput
                      value={aiSubject}
                      onChangeText={setAiSubject}
                      placeholder="e.g. Kitchen Vocab, B1 or paste a word here"
                      placeholderTextColor={theme.colors.textMuted}
                      multiline
                      style={{ borderWidth: 1, borderColor: "#EF444444", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.text, backgroundColor: theme.colors.surface, fontSize: 14, minHeight: 72, textAlignVertical: "top" }}
                    />
                    <TouchableOpacity
                      onPress={generateWithAI}
                      disabled={aiLoading || !canUseAI}
                      activeOpacity={0.85}
                      style={{ paddingVertical: 12, borderRadius: 12, backgroundColor: "#EF4444", alignItems: "center", opacity: aiLoading || !canUseAI ? 0.6 : 1 }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{aiLoading ? "Building…" : "✦  Build Vocab with AI"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {buildMethod === "upload" && (
                <View style={{ borderWidth: 1.5, borderColor: theme.colors.primary, borderRadius: 20, backgroundColor: theme.colors.primarySoft, overflow: "hidden" }}>
                  <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.primary + "33" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Ionicons name="cloud-upload-outline" size={14} color={theme.colors.primary} />
                      <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.primary, letterSpacing: 1.2, textTransform: "uppercase" }}>Upload a File</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: theme.colors.primary, opacity: 0.75, marginTop: 4, lineHeight: 16 }}>
                      AI will extract vocabulary pairs from your PDF, Excel, or CSV file.
                    </Text>
                  </View>
                  <View style={{ padding: 14 }}>
                    <TouchableOpacity
                      onPress={extractVocabularyFile}
                      disabled={extractLoading}
                      activeOpacity={0.85}
                      style={{ paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.colors.primary + "66", alignItems: "center", justifyContent: "center", gap: 6, opacity: extractLoading ? 0.7 : 1, backgroundColor: theme.colors.surface }}
                    >
                      <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.primary} />
                      <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: "700" }}>{extractLoading ? "Extracting…" : "Choose PDF, Excel or CSV"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 26, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Vocabulary Builder</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 4, lineHeight: 16 }}>
                    Add vocabulary pairs, verb conjugations, and preposition drills — same structure as the web dashboard.
                  </Text>
                </View>

                <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 18 }}>
                  {words.map((w, i) => {
                    const isOpen = !!advancedOpen[w.key];
                    return (
                      <View key={w.key} style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 22, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt }}>
                        {languageConfig.rowTypes.length > 1 ? (
                          <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surfaceGlass }}>
                            {languageConfig.rowTypes.map((rt, idx) => (
                              <TouchableOpacity key={rt} onPress={() => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...makeWord(languagePair, effectiveLessonLanguage, rt), key: x.key, image_url: x.image_url } : x)))}
                                style={{ flex: 1, paddingVertical: 11, alignItems: "center", borderRightWidth: idx === languageConfig.rowTypes.length - 1 ? 0 : 1, borderRightColor: theme.colors.border, backgroundColor: w.rowType === rt ? theme.colors.primarySoft : "transparent" }}>
                                <Text style={{ fontSize: 11, fontWeight: "800", color: w.rowType === rt ? theme.colors.primary : theme.colors.textMuted }}>{ROW_TYPE_TAB_LABEL[rt]}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : null}

                        <View style={{ padding: 16, gap: 10 }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: theme.colors.violetSoft }}>
                                <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.text }}>{ROW_TYPE_TAB_LABEL[w.rowType]}</Text>
                              </View>
                            </View>
                            {words.length > 1 ? (
                              <TouchableOpacity onPress={() => { layoutSpring(); setWords((prev) => prev.filter((x) => x.key !== w.key)); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.dangerSoft, alignItems: "center", justifyContent: "center" }}>
                                <Ionicons name="trash-outline" size={15} color={theme.colors.danger} />
                              </TouchableOpacity>
                            ) : null}
                          </View>

                          {w.rowType === "vocab" ? (
                            <>
                              <View style={{ flexDirection: "row", gap: 8 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase" }}>{labelA}</Text>
                                  <TextInput value={w.termA} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, termA: t } : x)))} placeholder={`${labelA} term`} placeholderTextColor={placeholderColor} style={pillStyle} />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase" }}>{labelB}</Text>
                                  <TextInput value={w.termB} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, termB: t } : x)))} placeholder={`${labelB} term`} placeholderTextColor={placeholderColor} style={pillStyle} />
                                </View>
                              </View>

                              <TouchableOpacity onPress={() => toggleAdvanced(w.key)} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 }}>
                                <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.primary }}>Advanced options</Text>
                                <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={13} color={theme.colors.primary} />
                              </TouchableOpacity>

                              {isOpen ? (
                                <View style={{ gap: 10 }}>
                                  <View style={{ flexDirection: "row", gap: 8 }}>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>Tense</Text>
                                      <MiniDropdown value={w.tense} options={TENSE_OPTIONS} placeholder="Select tense" isOpen={openInlineDropdown === `${w.key}-tense`} onToggle={() => setOpenInlineDropdown(openInlineDropdown === `${w.key}-tense` ? null : `${w.key}-tense`)} onSelect={(t) => { setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, tense: t } : x))); setOpenInlineDropdown(null); }} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>Grammar</Text>
                                      <MiniDropdown value={w.grammar} options={GRAMMAR_OPTIONS} placeholder="Select grammar" isOpen={openInlineDropdown === `${w.key}-grammar`} onToggle={() => setOpenInlineDropdown(openInlineDropdown === `${w.key}-grammar` ? null : `${w.key}-grammar`)} onSelect={(t) => { setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, grammar: t } : x))); setOpenInlineDropdown(null); }} />
                                    </View>
                                  </View>
                                  <View style={{ flexDirection: "row", gap: 8 }}>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{labelA} Alts</Text>
                                      <TextInput value={w.altA} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, altA: t } : x)))} placeholder="Comma separated" placeholderTextColor={placeholderColor} style={[pillStyle, { fontSize: 13 }]} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{labelB} Alts</Text>
                                      <TextInput value={w.altB} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, altB: t } : x)))} placeholder="Comma separated" placeholderTextColor={placeholderColor} style={[pillStyle, { fontSize: 13 }]} />
                                    </View>
                                  </View>
                                  <View style={{ gap: 8 }}>
                                    <View>
                                      <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{labelA} Sentence</Text>
                                      <TextInput value={w.contextA} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, contextA: t } : x)))} placeholder="Example sentence" placeholderTextColor={placeholderColor} style={[pillStyle, { fontSize: 13, minHeight: 44 }]} />
                                    </View>
                                    <View>
                                      <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{labelB} Sentence</Text>
                                      <TextInput value={w.contextB} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, contextB: t } : x)))} placeholder="Example sentence" placeholderTextColor={placeholderColor} style={[pillStyle, { fontSize: 13, minHeight: 44 }]} />
                                    </View>
                                  </View>
                                  {w.image_url.trim() ? (
                                    <Image source={{ uri: w.image_url.trim() }} style={{ width: "100%", height: 150, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border }} resizeMode="cover" />
                                  ) : null}
                                  <View style={{ flexDirection: "row", gap: 8 }}>
                                    <TouchableOpacity onPress={() => pickWordImage(i)} style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" }}>
                                      <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.text }}>{uploadingWordIndex === i ? "Uploading…" : "Upload image"}</Text>
                                    </TouchableOpacity>
                                    {canUseAI ? (
                                      <>
                                        <TouchableOpacity onPress={() => generateWordImageWithAI(i)} disabled={generatingImageIndex === i} style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, opacity: generatingImageIndex === i ? 0.6 : 1, alignItems: "center", justifyContent: "center" }}>
                                          <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.primary }}>{generatingImageIndex === i ? "AI…" : "AI image"}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => fillBlanksWithAI(i)} style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                                          <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.primary }}>Fill AI</Text>
                                        </TouchableOpacity>
                                      </>
                                    ) : null}
                                  </View>
                                </View>
                              ) : null}
                            </>
                          ) : null}

                          {w.rowType === "conjugation" ? (
                            <>
                              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                                Verb conjugation practice: set the infinitive and tense, then fill the correct form for each pronoun.
                              </Text>
                              <View style={{ flexDirection: "row", gap: 8 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>Verb / Infinitive</Text>
                                  <TextInput value={w.infinitive} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, infinitive: t } : x)))} placeholder="falar / sein / être" placeholderTextColor={placeholderColor} style={pillStyle} />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>Tense</Text>
                                  <MiniDropdown value={w.tense} options={TENSE_OPTIONS} placeholder="Tense" isOpen={openInlineDropdown === `${w.key}-conj-tense`} onToggle={() => setOpenInlineDropdown(openInlineDropdown === `${w.key}-conj-tense` ? null : `${w.key}-conj-tense`)} onSelect={(t) => { setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, tense: t } : x))); setOpenInlineDropdown(null); }} />
                                </View>
                              </View>
                              <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.primary, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 4 }}>Pronoun → form</Text>
                              {w.conjugations.map((c, ci) => (
                                <View key={`${w.key}-c-${ci}`} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                                  <View style={{ width: 100, flexShrink: 0, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: theme.colors.primarySoft, alignItems: "center" }}>
                                    <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.primary, textAlign: "center" }}>{c.pronoun}</Text>
                                  </View>
                                  <TextInput value={c.form_a} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, conjugations: x.conjugations.map((cc, j) => (j === ci ? { ...cc, form_a: t } : cc)) } : x)))} placeholder="Form" placeholderTextColor={placeholderColor} style={[pillStyle, { flex: 1, minHeight: 40 }]} />
                                </View>
                              ))}
                            </>
                          ) : null}

                          {w.rowType === "preposition" ? (
                            <>
                              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>Use template chips to preload common preposition and contraction sets.</Text>
                              <TextInput value={w.prepositionTitle} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositionTitle: t } : x)))} placeholder="Title" placeholderTextColor={placeholderColor} style={pillStyle} />
                              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                                {(languageConfig.templates ?? []).map((tp) => (
                                  <TouchableOpacity key={tp.id} onPress={() => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositionTemplateId: tp.id, prepositionTitle: tp.title, prepositionGroup: "Prepositions / Contractions", prepositions: tp.entries.map((e) => ({ ...e })) } : x)))}
                                    style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: w.prepositionTemplateId === tp.id ? theme.colors.primary : theme.colors.border, backgroundColor: w.prepositionTemplateId === tp.id ? theme.colors.primarySoft : theme.colors.surface }}>
                                    <Text style={{ fontSize: 11, fontWeight: "700", color: w.prepositionTemplateId === tp.id ? theme.colors.primary : theme.colors.textMuted }}>{tp.title}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                              {w.prepositions.map((p, pi) => (
                                <View key={`${w.key}-p-${pi}`} style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                                  <TextInput value={p.left} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositions: x.prepositions.map((pp, j) => (j === pi ? { ...pp, left: t } : pp)) } : x)))} placeholder="A" placeholderTextColor={placeholderColor} style={[pillStyle, { flex: 1 }]} />
                                  <TextInput value={p.right} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositions: x.prepositions.map((pp, j) => (j === pi ? { ...pp, right: t } : pp)) } : x)))} placeholder="B" placeholderTextColor={placeholderColor} style={[pillStyle, { flex: 1 }]} />
                                  <TextInput value={p.answer} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositions: x.prepositions.map((pp, j) => (j === pi ? { ...pp, answer: t } : pp)) } : x)))} placeholder="=" placeholderTextColor={placeholderColor} style={[pillStyle, { flex: 1 }]} />
                                  <TouchableOpacity onPress={() => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositions: x.prepositions.filter((_, j) => j !== pi) } : x)))}>
                                    <Ionicons name="close" size={14} color={theme.colors.danger} />
                                  </TouchableOpacity>
                                </View>
                              ))}
                              <TouchableOpacity onPress={() => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositions: [...x.prepositions, { left: "", right: "", answer: "" }] } : x)))}>
                                <Text style={{ color: theme.colors.primary, fontWeight: "700", fontSize: 12 }}>+ Add line</Text>
                              </TouchableOpacity>
                            </>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}

                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.colors.primarySoft }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.primary }}>
                        {`${vocabCount} ${vocabCount === 1 ? "row" : "rows"}`}
                        {specialRowCount > 0 ? ` · ${conjugationRowCount} conj. · ${prepositionRowCount} prep.` : ""}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => { layoutSpring(); setWords((prev) => [...prev, makeWord(languagePair, effectiveLessonLanguage, "vocab")]); }} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.colors.primary }}>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}>+ Add row</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <AppButton label="Create Lesson" onPress={save} loading={saving} />
            </>
          )}
        </ScrollView>
        <FloatingToast {...toastProps} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {pendingLanguage ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <GlassCard style={{ width: "100%", borderRadius: 28 }} variant="strong">
            <Text style={[theme.typography.title, { marginBottom: 8 }]}>Change language?</Text>
            <Text style={[theme.typography.body, { marginBottom: 16, color: theme.colors.textMuted }]}>
              Switching to <Text style={{ fontWeight: "800", color: theme.colors.text }}>{pendingLanguage}</Text> may affect conjugation and preposition rows.
            </Text>
            <TouchableOpacity onPress={() => { const np = pairForLessonLanguage(pendingLanguage, languagePair); setLanguage(pendingLanguage); setLanguagePair(np); setWords((prev) => prev.map((w) => w.rowType === "conjugation" ? { ...w, conjugations: conjugationsFor(pendingLanguage) } : w)); setPendingLanguage(null); }} style={{ borderRadius: 12, backgroundColor: theme.colors.primary, paddingVertical: 14, alignItems: "center", marginBottom: 10 }}>
              <Text style={{ color: theme.colors.primaryText, fontWeight: "800", fontSize: 15 }}>Keep existing rows</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { const np = pairForLessonLanguage(pendingLanguage, languagePair); setLanguage(pendingLanguage); setLanguagePair(np); setWords((prev) => { const kept = prev.filter((w) => w.rowType === "vocab"); return kept.length > 0 ? kept : [makeWord(np, pendingLanguage, "vocab")]; }); setPendingLanguage(null); }} style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 14, alignItems: "center", marginBottom: 10 }}>
              <Text style={{ color: theme.colors.text, fontWeight: "700", fontSize: 15 }}>Clear language-specific rows</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPendingLanguage(null)} style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ color: theme.colors.textMuted, fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
      ) : null}

      <View style={{ paddingTop: Math.max(insets.top, 8), paddingHorizontal: 16, paddingBottom: 12 }}>
        <GlassCard style={{ borderRadius: 26 }} padding={14} variant="strong">
          <View style={{ flexDirection: compactHeader ? "column" : "row", alignItems: compactHeader ? "stretch" : "center", gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: compactHeader ? 0 : 1 }}>
              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.85} style={{ width: 46, height: 46, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="chevron-back" size={22} color={theme.colors.textMuted} />
              </TouchableOpacity>
              <View style={{ flex: 1, marginHorizontal: 14 }}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[theme.typography.label, { color: theme.colors.primary, fontSize: 11, lineHeight: 13 }]}>
                  {isEdit ? "Lesson editor" : "Lesson studio"}
                </Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[theme.typography.title, { marginTop: 2, fontSize: 18, lineHeight: 22 }]}>
                  {isEdit ? "Edit lesson" : "New lesson"}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: compactHeader ? "flex-end" : "flex-start" }}>
              <ThemeToggleButton compact />
              <TouchableOpacity onPress={openWeb} style={{ paddingHorizontal: 11, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons name="open-outline" size={13} color={theme.colors.primary} />
                <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: "800" }}>Web</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  triggerLightImpact();
                  save();
                }}
                disabled={saving}
                style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: theme.colors.primary, opacity: saving ? 0.7 : 1 }}
              >
                <Text style={{ color: theme.colors.primaryText, fontSize: 12, fontWeight: "800" }}>{saving ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </GlassCard>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <TouchableOpacity activeOpacity={1} onPress={() => { Keyboard.dismiss(); closeAllDropdowns(); }}>
          <View style={{ paddingBottom: 18 }}>
            <GlassCard style={{ marginBottom: 18, borderRadius: 30, overflow: "hidden" }} padding={0}>
              <View style={{ position: "relative", overflow: "hidden" }}>
                <FloatingGlow size={180} color={theme.colors.primarySoft} top={-55} right={-25} translate={heroGlowOne} />
                <FloatingGlow size={130} color={theme.colors.violetSoft} bottom={-38} left={-15} translate={heroGlowTwo} />
                <View style={{ padding: 22 }}>
                  <TouchableOpacity onPress={pickCover} activeOpacity={0.9} style={{ width: "100%", marginBottom: 18 }}>
                    {coverPreviewUri.trim() ? (
                      <Image source={{ uri: coverPreviewUri.trim() }} style={{ width: "100%", height: 180, borderRadius: 20, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border }} resizeMode="cover" />
                    ) : (
                      <View style={{ width: "100%", height: 180, borderRadius: 20, borderWidth: 1.5, borderColor: theme.colors.border, borderStyle: "dashed", backgroundColor: theme.colors.surfaceAlt, alignItems: "center", justifyContent: "center", gap: 10 }}>
                        <Ionicons name="image-outline" size={36} color={theme.colors.textMuted} />
                        <Text style={{ color: theme.colors.textMuted, fontWeight: "700", fontSize: 13 }}>Add cover image</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <Text style={[theme.typography.label, { color: theme.colors.primary }]}>Lesson studio</Text>
                  <Text style={[theme.typography.title, { marginTop: 4, fontSize: 18, lineHeight: 23 }]}>
                    {title.trim() || (isEdit ? "Untitled lesson" : "Start a beautiful new lesson")}
                  </Text>
                  <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted }]}>
                    {heroDescription}
                  </Text>
                </View>
              </View>
            </GlassCard>

            <View style={{ paddingTop: 0, gap: 16 }}>
              <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                <TextInput value={title} onChangeText={setTitle} placeholder="Lesson title" placeholderTextColor={placeholderColor} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, fontSize: 24, fontWeight: "800", color: theme.colors.text }} />
                <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                <TextInput value={description} onChangeText={setDescription} multiline blurOnSubmit onSubmitEditing={() => Keyboard.dismiss()} placeholder="Description (optional)" placeholderTextColor={placeholderColor} style={{ paddingHorizontal: 20, paddingVertical: 16, fontSize: 15, lineHeight: 22, color: theme.colors.text, minHeight: 82 }} />
              </View>

              <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Settings</Text>
                </View>
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
                  <DropdownField label="Language" value={language} options={LESSON_LANGUAGES} placeholder="Select language" open={languageOpen}
                    onToggle={() => { setCategoryOpen(false); setLevelOpen(false); setLanguageOpen((p) => !p); }}
                    onSelect={(value) => {
                      setLanguageOpen(false);
                      if (value === language) return;
                      const hasContent = words.some((w) => w.termA.trim() || w.termB.trim() || w.infinitive?.trim());
                      const hasSpecial = words.some((w) => w.rowType === "conjugation" || w.rowType === "preposition");
                      if (hasContent && hasSpecial) { setPendingLanguage(value); } else {
                        const np = pairForLessonLanguage(value, languagePair);
                        setLanguage(value); setLanguagePair(np);
                        setWords((prev) => prev.map((w) => { if (w.rowType === "conjugation") return { ...w, conjugations: conjugationsFor(value) }; if (w.rowType === "preposition" && !LANGUAGE_CONFIG[value]?.rowTypes.includes("preposition")) return makeWord(np, value, "vocab"); return w; }));
                      }
                    }}
                  />
                  <DropdownField label="Level" value={languageLevel} options={LANGUAGE_LEVELS} placeholder="Select level" open={levelOpen}
                    onToggle={() => { setCategoryOpen(false); setLanguageOpen(false); setLevelOpen((p) => !p); }}
                    onSelect={(value) => { setLanguageLevel(value); setLevelOpen(false); }}
                  />
                  <DropdownField label="Category" value={category} options={CATEGORY_OPTIONS} placeholder="Select category" open={categoryOpen}
                    onToggle={() => { setLevelOpen(false); setLanguageOpen(false); setLessonCategoryOpen(false); setCategoryOpen((p) => !p); }}
                    onSelect={(value) => { setCategory(value); setCategoryOpen(false); }}
                  />
                  {isAdmin ? (
                    <DropdownField
                      label="Add to Lesson Category"
                      value={lessonCategory || EMPTY_LESSON_PACK_CATEGORY}
                      options={[EMPTY_LESSON_PACK_CATEGORY, ...LESSON_PACK_CATEGORIES]}
                      placeholder="Select lesson category"
                      open={lessonCategoryOpen}
                      onToggle={() => { setCategoryOpen(false); setLevelOpen(false); setLanguageOpen(false); setLessonCategoryOpen((p) => !p); }}
                      onSelect={(value) => {
                        setLessonCategory(value === EMPTY_LESSON_PACK_CATEGORY ? "" : value);
                        setLessonCategoryOpen(false);
                      }}
                    />
                  ) : null}
                </View>
              </View>

              <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, padding: 18 }}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Lesson Document (PDF)</Text>
                {docUrl ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Ionicons name="document-outline" size={16} color={theme.colors.primary} />
                    <Text style={{ flex: 1, fontSize: 13, color: theme.colors.text }} numberOfLines={1}>{docName || docUrl}</Text>
                    <TouchableOpacity onPress={() => { setDocUrl(""); setDocName(""); }}>
                      <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : null}
                <TouchableOpacity onPress={pickDoc} style={{ paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.primary, alignItems: "center", backgroundColor: theme.colors.primarySoft }}>
                  <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: "700" }}>Upload PDF</Text>
                </TouchableOpacity>
              </View>

              {/* AI Lesson Generator card (edit mode) */}
              <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 24, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
                    <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.primary, letterSpacing: 1.5, textTransform: "uppercase" }}>AI Lesson Generator</Text>
                    {canUseAI ? (
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: theme.colors.primarySoft }}>
                        <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.primary }}>AI enabled</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 }}>
                    Upload a file or enter a subject/prompt below — AI will extract vocabulary pairs and fill the Vocabulary Builder in your selected language pair automatically.
                  </Text>
                </View>

                <View style={{ padding: 18, gap: 16 }}>
                  {/* File upload */}
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>Upload a file (optional)</Text>
                    <TouchableOpacity
                      onPress={extractVocabularyFile}
                      disabled={extractLoading}
                      activeOpacity={0.85}
                      style={{ paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.colors.border, alignItems: "center", justifyContent: "center", gap: 6, opacity: extractLoading ? 0.7 : 1, backgroundColor: theme.colors.surfaceAlt }}
                    >
                      <Ionicons name="cloud-upload-outline" size={22} color={theme.colors.primary} />
                      <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: "700" }}>{extractLoading ? "Extracting…" : "Choose PDF, Excel or CSV"}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* AI Prompt */}
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>Subject / AI Prompt</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.textMuted, lineHeight: 17, marginBottom: 8 }}>
                      Describe the topic or paste a vocabulary list. E.g. "Kitchen vocabulary for B1 students", "Phrasal verbs with GET", or "Common verbs for a restaurant scenario". The more specific, the better the results.
                    </Text>
                    <TextInput
                      value={aiSubject}
                      onChangeText={setAiSubject}
                      placeholder="e.g. Kitchen vocabulary, B1 — or paste a word list here"
                      placeholderTextColor={placeholderColor}
                      multiline
                      style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, fontSize: 14, minHeight: 88, textAlignVertical: "top" }}
                    />
                  </View>

                  <TouchableOpacity
                    onPress={generateWithAI}
                    disabled={aiLoading || !canUseAI}
                    activeOpacity={0.85}
                    style={{ paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, alignItems: "center", opacity: aiLoading || !canUseAI ? 0.6 : 1 }}
                  >
                    <Text style={{ color: theme.colors.primary, fontWeight: "800", fontSize: 14 }}>{aiLoading ? "Building…" : "✦  Build Vocab with AI"}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={generateAllImages}
                    disabled={generatingAllImages || !canUseAI}
                    activeOpacity={0.85}
                    style={{ paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, alignItems: "center", opacity: generatingAllImages || !canUseAI ? 0.6 : 1 }}
                  >
                    <View style={{ alignItems: "center", gap: 4 }}>
                      <Text style={{ color: theme.colors.primary, fontWeight: "800", fontSize: 14 }}>{generatingAllImages ? "Generating images…" : "✦  AI Generate All Images"}</Text>
                      <Text style={{ color: theme.colors.primary, fontSize: 11, opacity: 0.7 }}>Builds 10 words at a time.</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 26, backgroundColor: theme.colors.surfaceGlass, overflow: "hidden" }}>
                <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.5, textTransform: "uppercase" }}>Lesson Builder</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 4, lineHeight: 16 }}>
                    Vocabulary rows, verb conjugations, and preposition drills — same structure as the web dashboard.
                  </Text>
                </View>

                {canUseAI ? (
                  <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 12, backgroundColor: theme.colors.surfaceAlt }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, textTransform: "uppercase" }}>AI Subject</Text>
                      <InfoTooltip
                        id="ai-subject-help"
                        visibleId={tooltipVisible}
                        setVisibleId={setTooltipVisible}
                        text='When adding a subject and hitting this button, it will generate 5 words for the lesson at a time'
                      />
                    </View>

                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                      <TextInput
                        value={aiSubject}
                        onChangeText={setAiSubject}
                        placeholder="AI subject (optional)"
                        placeholderTextColor={placeholderColor}
                        style={[inputStyle, { marginBottom: 0, flex: 1 }]}
                      />
                      <TouchableOpacity
                        onPress={generateWithAI}
                        disabled={aiLoading}
                        style={{
                          minWidth: 86,
                          paddingHorizontal: 12,
                          paddingVertical: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: theme.colors.primary,
                          backgroundColor: theme.colors.primarySoft,
                          opacity: aiLoading ? 0.6 : 1,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "800", color: theme.colors.primary }}>{aiLoading ? "AI..." : "✦ AI"}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 18 }}>
                  {words.map((w, i) => {
                    const isOpen = !!advancedOpen[w.key];
                    return (
                      <View key={w.key} style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 22, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt }}>
                        {languageConfig.rowTypes.length > 1 ? (
                          <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surfaceGlass }}>
                            {languageConfig.rowTypes.map((rt, idx) => (
                              <TouchableOpacity
                                key={rt}
                                onPress={() => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...makeWord(languagePair, effectiveLessonLanguage, rt), key: x.key, image_url: x.image_url } : x)))}
                                style={{
                                  flex: 1,
                                  paddingVertical: 11,
                                  alignItems: "center",
                                  borderRightWidth: idx === languageConfig.rowTypes.length - 1 ? 0 : 1,
                                  borderRightColor: theme.colors.border,
                                  backgroundColor: w.rowType === rt ? theme.colors.primarySoft : "transparent",
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: "800", color: w.rowType === rt ? theme.colors.primary : theme.colors.textMuted }}>{ROW_TYPE_TAB_LABEL[rt]}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : null}

                        <View style={{ padding: 16, gap: 10 }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: theme.colors.violetSoft }}>
                                <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.text }}>{ROW_TYPE_TAB_LABEL[w.rowType]}</Text>
                              </View>
                            </View>
                            {words.length > 1 ? (
                              <TouchableOpacity onPress={() => { layoutSpring(); setWords((prev) => prev.filter((x) => x.key !== w.key)); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.dangerSoft, alignItems: "center", justifyContent: "center" }}>
                                <Ionicons name="trash-outline" size={15} color={theme.colors.danger} />
                              </TouchableOpacity>
                            ) : null}
                          </View>

                          {w.rowType === "vocab" ? (
                            <>
                              <View style={{ flexDirection: "row", gap: 8 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase" }}>{labelA}</Text>
                                  <TextInput value={w.termA} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, termA: t } : x)))} placeholder={`${labelA} term`} placeholderTextColor={placeholderColor} style={pillStyle} />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 10, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase" }}>{labelB}</Text>
                                  <TextInput value={w.termB} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, termB: t } : x)))} placeholder={`${labelB} term`} placeholderTextColor={placeholderColor} style={pillStyle} />
                                </View>
                              </View>

                              <TouchableOpacity onPress={() => toggleAdvanced(w.key)} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 }}>
                                <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.primary }}>Advanced options</Text>
                                <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={13} color={theme.colors.primary} />
                              </TouchableOpacity>

                              {isOpen ? (
                                <View style={{ gap: 10 }}>
                                  <View style={{ flexDirection: "row", gap: 8 }}>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>Tense</Text>
                                      <MiniDropdown
                                        value={w.tense}
                                        options={TENSE_OPTIONS}
                                        placeholder="Select tense"
                                        isOpen={openInlineDropdown === `${w.key}-tense`}
                                        onToggle={() => setOpenInlineDropdown(openInlineDropdown === `${w.key}-tense` ? null : `${w.key}-tense`)}
                                        onSelect={(t) => { setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, tense: t } : x))); setOpenInlineDropdown(null); }}
                                      />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>Grammar</Text>
                                      <MiniDropdown
                                        value={w.grammar}
                                        options={GRAMMAR_OPTIONS}
                                        placeholder="Select grammar"
                                        isOpen={openInlineDropdown === `${w.key}-grammar`}
                                        onToggle={() => setOpenInlineDropdown(openInlineDropdown === `${w.key}-grammar` ? null : `${w.key}-grammar`)}
                                        onSelect={(t) => { setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, grammar: t } : x))); setOpenInlineDropdown(null); }}
                                      />
                                    </View>
                                  </View>

                                  <View style={{ flexDirection: "row", gap: 8 }}>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{labelA} Alts</Text>
                                      <TextInput value={w.altA} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, altA: t } : x)))} placeholder="Comma separated" placeholderTextColor={placeholderColor} style={[pillStyle, { fontSize: 13 }]} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{labelB} Alts</Text>
                                      <TextInput value={w.altB} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, altB: t } : x)))} placeholder="Comma separated" placeholderTextColor={placeholderColor} style={[pillStyle, { fontSize: 13 }]} />
                                    </View>
                                  </View>

                                  <View style={{ gap: 8 }}>
                                    <View>
                                      <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{labelA} Sentence</Text>
                                      <TextInput
                                        value={w.contextA}
                                        onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, contextA: t } : x)))}
                                        placeholder="Example sentence"
                                        placeholderTextColor={placeholderColor}
                                        style={[pillStyle, { fontSize: 13, minHeight: 44 }]}
                                      />
                                    </View>
                                    <View>
                                      <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{labelB} Sentence</Text>
                                      <TextInput
                                        value={w.contextB}
                                        onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, contextB: t } : x)))}
                                        placeholder="Example sentence"
                                        placeholderTextColor={placeholderColor}
                                        style={[pillStyle, { fontSize: 13, minHeight: 44 }]}
                                      />
                                    </View>
                                  </View>

                                  {w.image_url.trim() ? (
                                    <Image source={{ uri: w.image_url.trim() }} style={{ width: "100%", height: 150, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border }} resizeMode="cover" />
                                  ) : null}

                                  <View style={{ flexDirection: "row", gap: 8 }}>
                                    <TouchableOpacity
                                      onPress={() => pickWordImage(i)}
                                      style={{
                                        flex: 1,
                                        paddingHorizontal: 10,
                                        paddingVertical: 10,
                                        borderRadius: 10,
                                        borderWidth: 1,
                                        borderColor: theme.colors.border,
                                        backgroundColor: theme.colors.surface,
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.text }}>
                                        {uploadingWordIndex === i ? "Uploading..." : "Upload image"}
                                      </Text>
                                    </TouchableOpacity>

                                    {canUseAI ? (
                                      <>
                                        <TouchableOpacity
                                          onPress={() => generateWordImageWithAI(i)}
                                          disabled={generatingImageIndex === i}
                                          style={{
                                            flex: 1,
                                            paddingHorizontal: 10,
                                            paddingVertical: 10,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: theme.colors.primary,
                                            backgroundColor: theme.colors.primarySoft,
                                            opacity: generatingImageIndex === i ? 0.6 : 1,
                                            alignItems: "center",
                                            justifyContent: "center",
                                          }}
                                        >
                                          <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.primary }}>
                                            {generatingImageIndex === i ? "AI..." : "AI image"}
                                          </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          onPress={() => fillBlanksWithAI(i)}
                                          style={{
                                            flex: 1,
                                            paddingHorizontal: 10,
                                            paddingVertical: 10,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: theme.colors.primary,
                                            backgroundColor: theme.colors.primarySoft,
                                            alignItems: "center",
                                            justifyContent: "center",
                                          }}
                                        >
                                          <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.primary }}>Fill AI</Text>
                                        </TouchableOpacity>
                                      </>
                                    ) : null}
                                  </View>
                                </View>
                              ) : null}
                            </>
                          ) : null}

                          {w.rowType === "conjugation" ? (
                            <>
                              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                                Verb conjugation practice: set the infinitive and tense, then fill the correct form for each pronoun (saved as in the web lesson editor).
                              </Text>
                              <View style={{ flexDirection: "row", gap: 8 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>Verb / Infinitive</Text>
                                  <TextInput
                                    value={w.infinitive}
                                    onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, infinitive: t } : x)))}
                                    placeholder="falar / sein / être"
                                    placeholderTextColor={placeholderColor}
                                    style={pillStyle}
                                  />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>Tense</Text>
                                  <MiniDropdown
                                    value={w.tense}
                                    options={TENSE_OPTIONS}
                                    placeholder="Tense"
                                    isOpen={openInlineDropdown === `${w.key}-conj-tense`}
                                    onToggle={() => setOpenInlineDropdown(openInlineDropdown === `${w.key}-conj-tense` ? null : `${w.key}-conj-tense`)}
                                    onSelect={(t) => {
                                      setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, tense: t } : x)));
                                      setOpenInlineDropdown(null);
                                    }}
                                  />
                                </View>
                              </View>
                              <Text style={{ fontSize: 9, fontWeight: "800", color: theme.colors.primary, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 4 }}>Pronoun → form</Text>
                              {w.conjugations.map((c, ci) => (
                                <View key={`${w.key}-c-${ci}`} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                                  <View style={{ width: 100, flexShrink: 0, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: theme.colors.primarySoft, alignItems: "center" }}>
                                    <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.primary, textAlign: "center" }}>{c.pronoun}</Text>
                                  </View>
                                  <TextInput value={c.form_a} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, conjugations: x.conjugations.map((cc, j) => (j === ci ? { ...cc, form_a: t } : cc)) } : x)))} placeholder="Form" placeholderTextColor={placeholderColor} style={[pillStyle, { flex: 1, minHeight: 40 }]} />
                                </View>
                              ))}
                            </>
                          ) : null}

                          {w.rowType === "preposition" ? (
                            <>
                              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>Use template chips to preload common preposition and contraction sets.</Text>
                              <TextInput value={w.prepositionTitle} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositionTitle: t } : x)))} placeholder="Title" placeholderTextColor={placeholderColor} style={pillStyle} />
                              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                                {(languageConfig.templates ?? []).map((tp) => (
                                  <TouchableOpacity key={tp.id} onPress={() => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositionTemplateId: tp.id, prepositionTitle: tp.title, prepositionGroup: "Prepositions / Contractions", prepositions: tp.entries.map((e) => ({ ...e })) } : x)))}
                                    style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: w.prepositionTemplateId === tp.id ? theme.colors.primary : theme.colors.border, backgroundColor: w.prepositionTemplateId === tp.id ? theme.colors.primarySoft : theme.colors.surface }}>
                                    <Text style={{ fontSize: 11, fontWeight: "700", color: w.prepositionTemplateId === tp.id ? theme.colors.primary : theme.colors.textMuted }}>{tp.title}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                              {w.prepositions.map((p, pi) => (
                                <View key={`${w.key}-p-${pi}`} style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                                  <TextInput value={p.left} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositions: x.prepositions.map((pp, j) => (j === pi ? { ...pp, left: t } : pp)) } : x)))} placeholder="A" placeholderTextColor={placeholderColor} style={[pillStyle, { flex: 1 }]} />
                                  <TextInput value={p.right} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositions: x.prepositions.map((pp, j) => (j === pi ? { ...pp, right: t } : pp)) } : x)))} placeholder="B" placeholderTextColor={placeholderColor} style={[pillStyle, { flex: 1 }]} />
                                  <TextInput value={p.answer} onChangeText={(t) => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositions: x.prepositions.map((pp, j) => (j === pi ? { ...pp, answer: t } : pp)) } : x)))} placeholder="=" placeholderTextColor={placeholderColor} style={[pillStyle, { flex: 1 }]} />
                                  <TouchableOpacity onPress={() => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositions: x.prepositions.filter((_, j) => j !== pi) } : x)))}>
                                    <Ionicons name="close" size={14} color={theme.colors.danger} />
                                  </TouchableOpacity>
                                </View>
                              ))}
                              <TouchableOpacity onPress={() => setWords((prev) => prev.map((x) => (x.key === w.key ? { ...x, prepositions: [...x.prepositions, { left: "", right: "", answer: "" }] } : x)))}>
                                <Text style={{ color: theme.colors.primary, fontWeight: "700", fontSize: 12 }}>+ Add line</Text>
                              </TouchableOpacity>
                            </>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}

                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.colors.primarySoft }}>
                        <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.primary }}>
                          {`${vocabCount} ${vocabCount === 1 ? "row" : "rows"}`}
                          {specialRowCount > 0 ? ` · ${conjugationRowCount} conj. · ${prepositionRowCount} prep.` : ""}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => { layoutSpring(); setWords((prev) => [...prev, makeWord(languagePair, effectiveLessonLanguage, "vocab")]); }} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.colors.primary }}>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}>+ Add row</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <AppButton label={isEdit ? "Save Lesson" : "Create Lesson"} onPress={save} loading={saving} />
            </View>
          </View>
        </TouchableOpacity>
      </ScrollView>
      <FloatingToast {...toastProps} />
    </View>
  );
}


