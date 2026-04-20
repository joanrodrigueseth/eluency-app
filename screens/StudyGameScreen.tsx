import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Pressable, TouchableOpacity } from "../lib/hapticPressables";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset } from "expo-asset";
import Constants from "expo-constants";
import { NavigationProp, RouteProp, useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import * as Speech from "expo-speech";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import Svg, { Circle, SvgUri } from "react-native-svg";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import FloatingToast from "../components/FloatingToast";
import LessonPdfViewerModal from "../components/LessonPdfViewerModal";
import GlassCard from "../components/GlassCard";
import AppButton from "../components/AppButton";
import IconTile from "../components/IconTile";
import ScreenReveal from "../components/ScreenReveal";
import RemoteLessonImage from "../components/RemoteLessonImage";
import { useFeedbackToast } from "../hooks/useFeedbackToast";
import { useAppTheme, type AppTheme } from "../lib/theme";
import { cacheBustAssetUrl } from "../lib/imageCacheBust";
import { clearStoredStudentSessionId, getStoredStudentSessionId } from "../lib/studentSession";
import {
  getAssignedLessons,
  getAssignedTests,
  getStudentSession,
  requestTtsBase64,
  verifyAnswer,
} from "../lib/api/study";
import {
  calculateStreak,
  createRecord,
  gradePercentage,
  pickSessionWords,
  unlockAchievements,
  updateUserStats,
  updateWordStats,
} from "../lib/game/engine";
import { flushProgressSync, hydrateProgress, saveLocalProgress, scheduleProgressSync } from "../lib/game/progress";
import {
  expandConjugationTablesForMode,
  getDisplayPrompt,
  getExpectedAnswer,
  normalizeLessonsToWords,
  normalizeTestsToWords,
} from "../lib/game/normalizers";
import { getDisplayLanguageMeta, historyDirectionLabel, labelDirectionForward, labelDirectionReverse } from "../lib/game/languagePair";
import type {
  GameWord,
  LessonGamePayload,
  StudyDirection,
  StudyProgress,
  StudyRecord,
  StudyRecordIssue,
  StudySessionMode,
  StudySessionType,
  TestGamePayload,
} from "../types/study-game";

type RootStackParamList = {
  Login: undefined;
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  StudyGame: { sessionId: string };
  Settings: { initialTab?: "profile" | "security" | "notifications" } | undefined;
};

type BottomTab = "home" | "lessons" | "practice" | "tests" | "settings";
type RuntimeScreen = "dashboard" | "lesson-detail" | "test-detail" | "session" | "results";
type SessionIssue = StudyRecordIssue;

const studyApiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";

type StudentEmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
};

type ContinueSuggestion =
  | {
      kind: "resume";
      title: string;
      subtitle: string;
      meta: string;
      ctaLabel: string;
    }
  | {
      kind: "lesson";
      title: string;
      subtitle: string;
      meta: string;
      ctaLabel: string;
      lessonId: string;
    }
  | {
      kind: "test";
      title: string;
      subtitle: string;
      meta: string;
      ctaLabel: string;
      testId: string;
    };

function StudentEmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
}: StudentEmptyStateProps) {
  const theme = useAppTheme();
  const ui = theme.colors;

  return (
    <GlassCard style={{ borderRadius: 20 }} padding={18} variant="hero">
      <View style={{ alignItems: "center" }}>
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 18,
            backgroundColor: ui.primarySoft,
            borderWidth: 1,
            borderColor: ui.borderStrong,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          <Ionicons name={icon} size={26} color={ui.primary} />
        </View>
        <Text style={{ color: ui.text, fontSize: 20, fontWeight: "800", textAlign: "center" }}>{title}</Text>
        <Text style={{ color: ui.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8 }}>{body}</Text>
        {actionLabel && onAction ? (
          <TouchableOpacity
            onPress={onAction}
            activeOpacity={0.88}
            style={{
              marginTop: 16,
              minWidth: 170,
              borderRadius: 14,
              backgroundColor: ui.primary,
              paddingHorizontal: 18,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
        {secondaryLabel && onSecondaryAction ? (
          <TouchableOpacity onPress={onSecondaryAction} activeOpacity={0.8} style={{ marginTop: 10, padding: 4 }}>
            <Text style={{ color: ui.primary, fontSize: 13, fontWeight: "700" }}>{secondaryLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </GlassCard>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type LessonWordRow = NonNullable<LessonGamePayload["words"]>[number];

/** Raw lesson row terms for detail UI (en-pt uses pt/en; other pairs use term_a/term_b). */
function lessonListRowTerms(word: LessonWordRow, pair: string | undefined) {
  const legacy = !pair || pair === "en-pt";
  const termA = legacy ? String(word.pt ?? "").trim() : String(word.term_a ?? word.pt ?? "").trim();
  const termB = legacy ? String(word.en ?? "").trim() : String(word.term_b ?? word.en ?? "").trim();
  const ctxA = legacy
    ? typeof word.sp === "string"
      ? word.sp.trim()
      : ""
    : String(word.context_a ?? "").trim();
  const ctxB = legacy
    ? typeof word.se === "string"
      ? word.se.trim()
      : ""
    : String(word.context_b ?? "").trim();
  return { termA, termB, ctxA, ctxB };
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function localAnswerFallback(expected: string, answer: string, alternatives: string[]) {
  const expNorm = normalizeText(expected);
  const ansNorm = normalizeText(answer);
  const alts = alternatives.map(normalizeText).filter(Boolean);
  if (!ansNorm) return { isCorrect: false, close: false };
  if (ansNorm === expNorm || alts.includes(ansNorm)) return { isCorrect: true, close: false };
  const dist = levenshtein(ansNorm, expNorm);
  const close = expNorm.length > 0 && dist <= Math.max(1, Math.floor(expNorm.length * 0.2));
  return { isCorrect: false, close };
}

function getAcceptedAnswers(target: string, current: GameWord | undefined, direction: StudyDirection) {
  const t = typeof target === "string" ? target.trim() : "";
  const accepted = [t];
  if (direction === "en-pt" && current?.pt_alt?.length) {
    accepted.push(...current.pt_alt.filter(Boolean));
  }
  if (t && /^\s*to\s+/i.test(t)) {
    const bare = t.replace(/^\s*to\s+/i, "").trim();
    if (bare && !accepted.includes(bare)) accepted.push(bare);
  }
  return accepted;
}

function isInfinitiveWord(current: GameWord | undefined, target: string, source: string, targetLang: "pt" | "en") {
  if (!target || typeof target !== "string") return false;
  /** Conjugation/preposition prompts contain the infinitive in text; do not treat as EN infinitive gloss. */
  if (current?.practiceKind === "conjugation" || current?.practiceKind === "conjugation-table" || current?.practiceKind === "preposition")
    return false;
  if (/^\s*to\s+/i.test(target.trim())) return true;
  if (targetLang !== "en") return false;
  return /(ar|er|ir)$/i.test(String(source || "").trim());
}

function titleCaseVerb(s: string) {
  const t = (s ?? "").trim();
  if (!t) return "—";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function maskWord(sentence: string, wordToHide: string) {
  const words = String(wordToHide || "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean);
  return String(sentence || "")
    .split(" ")
    .map((word) => {
      const cleanWord = word.toLowerCase().replace(/[.,!?;:'"()]/g, "");
      if (words.some((w) => cleanWord === w || cleanWord.includes(w))) {
        const punct = word.match(/[.,!?;:'"()]+$/)?.[0] || "";
        const base = word.replace(/[.,!?;:'"()]+$/, "");
        if (!base) return word;
        return `${base[0]} ${Array(Math.max(base.length - 1, 0)).fill("_").join(" ")}${punct}`;
      }
      return word;
    })
    .join(" ");
}

function getLevelInfo(totalXP: number) {
  const levels = [
    { level: 1, name: "Rookie", xpNeeded: 0 },
    { level: 2, name: "Beginner", xpNeeded: 120 },
    { level: 3, name: "Apprentice", xpNeeded: 280 },
    { level: 4, name: "Learner", xpNeeded: 430 },
    { level: 5, name: "Scholar", xpNeeded: 1000 },
    { level: 6, name: "Master", xpNeeded: 1600 },
    { level: 7, name: "Legend", xpNeeded: 2500 },
  ];
  let current = levels[0];
  let next = levels[1] ?? null;
  for (let i = 0; i < levels.length; i += 1) {
    if (totalXP >= levels[i].xpNeeded) {
      current = levels[i];
      next = levels[i + 1] ?? null;
    }
  }
  const xpInLevel = totalXP - current.xpNeeded;
  const xpForLevel = next ? next.xpNeeded - current.xpNeeded : 1;
  const progress = next ? Math.min((xpInLevel / xpForLevel) * 100, 100) : 100;
  return { current, next, xpInLevel, xpForLevel, progress };
}

function reviewIssueLabel(kind: SessionIssue["kind"]) {
  if (kind === "correct") return "Correct";
  if (kind === "open_review") return "Review";
  if (kind === "skip") return "Skipped";
  if (kind === "close") return "Close";
  return "Wrong";
}

function reviewIssueIcon(kind: SessionIssue["kind"]) {
  if (kind === "correct") return "checkmark-circle" as const;
  if (kind === "open_review") return "document-text-outline" as const;
  if (kind === "close") return "alert-circle-outline" as const;
  return "close-circle" as const;
}

function reviewIssueColor(theme: AppTheme, kind: SessionIssue["kind"]) {
  if (kind === "correct") return theme.colors.success;
  if (kind === "open_review") return theme.colors.primary;
  if (kind === "close") return "#D4943C";
  return theme.colors.danger;
}

function normalizeAbsoluteDocumentUrl(sourceUrl: string) {
  if (/^https?:\/\//i.test(sourceUrl)) return sourceUrl;
  const host = studyApiBaseUrl.replace(/\/$/, "");
  if (sourceUrl.startsWith("/")) return `${host}${sourceUrl}`;
  return `${host}/${sourceUrl}`;
}

function ttsLangFromShort(shortCode: string) {
  switch (shortCode.toUpperCase()) {
    case "PT":
      return "pt-BR";
    case "ES":
      return "es-ES";
    case "FR":
      return "fr-FR";
    case "DE":
      return "de-DE";
    case "IT":
      return "it-IT";
    case "JA":
      return "ja-JP";
    case "KO":
      return "ko-KR";
    case "ZH":
      return "zh-CN";
    case "AR":
      return "ar-SA";
    case "EN":
    default:
      return "en-US";
  }
}

export default function StudyGameScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "StudyGame">>();
  const sessionId = route.params?.sessionId;
  const tinyLogoUri = useMemo(() => Asset.fromModule(require("../assets/2.svg")).uri, []);

  /** Login persists the canonical session id; route params can lag behind (e.g. Stack initialParams). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getStoredStudentSessionId();
        if (cancelled || !stored) return;
        if (stored !== sessionId) {
          navigation.setParams({ sessionId: stored });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigation, sessionId]);

  const [loading, setLoading] = useState(true);
  const [runtimeScreen, setRuntimeScreen] = useState<RuntimeScreen>("dashboard");
  const [activeTab, setActiveTab] = useState<BottomTab>("home");
  const [studentName, setStudentName] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [lessonsData, setLessonsData] = useState<LessonGamePayload[]>([]);
  const [testsData, setTestsData] = useState<TestGamePayload[]>([]);
  /** Bumps on each successful lesson/test catalog load so image URLs change (cache bust + expo-image). */
  const assetCatalogEpochRef = useRef(0);
  const [assetRefreshEpoch, setAssetRefreshEpoch] = useState(0);
  const [lessonsWords, setLessonsWords] = useState<GameWord[]>([]);
  const [testsWords, setTestsWords] = useState<GameWord[]>([]);
  const [progress, setProgress] = useState<StudyProgress | null>(null);

  const QUICK_PLAY_COUNTS = [10, 15, 20, 30, 0] as const; // 0 = All
  const [quickPlayCount, setQuickPlayCount] = useState<number>(15);
  const [quickPlayDirection, setQuickPlayDirection] = useState<StudyDirection>("pt-en");
  const [quickPlayLanguageKey, setQuickPlayLanguageKey] = useState<string | null>(null);

  const [sessionType, setSessionType] = useState<StudySessionType>("practice");
  const [sessionMode, setSessionMode] = useState<StudySessionMode>("typing");
  const [direction, setDirection] = useState<StudyDirection>("pt-en");
  const [activeWords, setActiveWords] = useState<GameWord[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [correctCount, setCorrectCount] = useState(0);
  const [mistakeWordIds, setMistakeWordIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ state: "correct" | "close" | "wrong"; text: string } | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [lessonPdfViewerVisible, setLessonPdfViewerVisible] = useState(false);
  const [lessonPdfViewerUri, setLessonPdfViewerUri] = useState<string | null>(null);
  const [resultRecord, setResultRecord] = useState<{ score: number; total: number; percentage: number; passed: boolean; issues: SessionIssue[] } | null>(null);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<StudyRecord | null>(null);
  const [selectedLessonDetail, setSelectedLessonDetail] = useState<LessonGamePayload | null>(null);
  const [selectedTestDetail, setSelectedTestDetail] = useState<{ type: "test"; test: TestGamePayload } | { type: "lesson"; lesson: LessonGamePayload } | null>(null);
  const [lessonDetailMode, setLessonDetailMode] = useState<StudySessionMode>("typing");
  const [showHint, setShowHint] = useState(false);
  const [needsRetype, setNeedsRetype] = useState(false);
  const [showInfinitiveNote, setShowInfinitiveNote] = useState(false);
  const [geminiCorrection, setGeminiCorrection] = useState("");
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [mcqChoiceTexts, setMcqChoiceTexts] = useState<string[]>([]);
  const [mcqChoiceOptions, setMcqChoiceOptions] = useState<{ id: string; text: string }[] | null>(null);
  /** Full conjugation table (typing mode), aligned with web `rowType === 'conjugation'`. */
  const [conjugationInputs, setConjugationInputs] = useState<string[]>([]);
  const [conjugationRowFeedback, setConjugationRowFeedback] = useState<(boolean | null)[]>([]);
  const [sessionContext, setSessionContext] = useState<{ id: string | null; name: string | null }>({ id: null, name: null });
  const [sessionPool, setSessionPool] = useState<GameWord[]>([]);
  const [savedResume, setSavedResume] = useState<{
    lessonId: string;
    lessonName: string;
    idx: number;
    correctCount: number;
    activeWords: GameWord[];
    sessionType: StudySessionType;
    sessionMode: StudySessionMode;
    direction: StudyDirection;
    pool: GameWord[];
  } | null>(null);
  const [sessionIssues, setSessionIssues] = useState<SessionIssue[]>([]);
  const [sessionStreak, setSessionStreak] = useState(0);
  const audioPlayerRef = useRef<any>(null);
  const audioTempFileRef = useRef<string | null>(null);
  const initialCatalogLoadedRef = useRef(false);
  /** Clear catalog when session changes so we never flash another student's lessons or stale rows. */
  useEffect(() => {
    if (!sessionId) return;
    initialCatalogLoadedRef.current = false;
    setLessonsData([]);
    setTestsData([]);
    setLessonsWords([]);
    setTestsWords([]);
  }, [sessionId]);
  const refreshCatalogRef = useRef<() => Promise<void>>(async () => {});
  const correctCountRef = useRef(0);
  const sessionIssuesRef = useRef<SessionIssue[]>([]);
  const sessionStreakRef = useRef(0);
  const runtimeScreenRef = useRef<RuntimeScreen>("dashboard");
  const saveResumeDataRef = useRef<() => void>(() => {});
  const runtimeToastBottom =
    runtimeScreen === "dashboard" || runtimeScreen === "lesson-detail" || runtimeScreen === "test-detail"
      ? Math.max(insets.bottom, 20) + 88
      : Math.max(insets.bottom, 20) + 12;
  const { showToast, toastProps } = useFeedbackToast({ bottom: runtimeToastBottom });

  const bumpAssetCatalogEpoch = useCallback(() => {
    assetCatalogEpochRef.current += 1;
    const n = assetCatalogEpochRef.current;
    setAssetRefreshEpoch(n);
    return n;
  }, []);

  const refreshCatalog = useCallback(async () => {
    if (!sessionId) return;
    const session = await getStudentSession(sessionId);
    const [lessons, tests] = await Promise.all([
      getAssignedLessons(session.student.assigned_lessons ?? []),
      getAssignedTests(session.student.assigned_tests ?? []),
    ]);
    if (__DEV__) {
      // Helps diagnose "web shows new title, app shows old title": prints what the API returned.
      console.log(
        "[StudyGame] refreshCatalog lessons:",
        lessons.map((l) => ({
          id: l.id,
          name: l.name,
          cover_image_url: l.cover_image_url,
          updated_at: l.updated_at,
          words: l.words?.length ?? 0,
        }))
      );
    }
    const epoch = bumpAssetCatalogEpoch();
    setLessonsData(lessons);
    setTestsData(tests);
    setLessonsWords(normalizeLessonsToWords(lessons, epoch));
    setTestsWords(normalizeTestsToWords(tests, epoch));
    setStudentName(session.student.name);
    setTeacherName(session.teacher?.name ?? "Teacher");
    setSelectedLessonDetail((prev) => {
      if (!prev) return prev;
      const next = lessons.find((l) => l.id === prev.id);
      return next ?? prev;
    });
    setSelectedTestDetail((prev) => {
      if (!prev) return prev;
      if (prev.type === "lesson") {
        const lesson = lessons.find((l) => l.id === prev.lesson.id);
        return lesson ? { type: "lesson", lesson } : prev;
      }
      const test = tests.find((t) => t.id === prev.test.id);
      return test ? { type: "test", test } : prev;
    });
  }, [sessionId, bumpAssetCatalogEpoch]);

  refreshCatalogRef.current = refreshCatalog;

  const onCatalogPullRefresh = useCallback(async () => {
    setCatalogRefreshing(true);
    try {
      await refreshCatalog();
      showToast("Lessons and tests updated.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not refresh lessons and tests.", "danger");
    } finally {
      setCatalogRefreshing(false);
    }
  }, [refreshCatalog, showToast]);

  const allWords = useMemo(() => [...lessonsWords, ...testsWords], [lessonsWords, testsWords]);

  // Distinct language groups from lessons, keyed by "pair::language"
  const quickPlayLanguageGroups = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; lesson: LessonGamePayload }>();
    for (const lesson of lessonsData) {
      const key = `${lesson.language_pair ?? ""}::${lesson.language ?? ""}`;
      if (!seen.has(key)) seen.set(key, { key, label: lesson.language ?? lesson.language_pair ?? "Unknown", lesson });
    }
    return Array.from(seen.values());
  }, [lessonsData]);

  // Words filtered to the selected language group (or all lessons words if none selected)
  const quickPlayWords = useMemo(() => {
    if (!quickPlayLanguageKey || quickPlayLanguageGroups.length < 2) return lessonsWords;
    return lessonsWords.filter((w) => {
      const key = `${w.lessonLanguagePair ?? ""}::${w.lessonLanguage ?? ""}`;
      return key === quickPlayLanguageKey;
    });
  }, [quickPlayLanguageKey, quickPlayLanguageGroups.length, lessonsWords]);
  const current = activeWords[idx];
  const isConjugationDrill = current?.practiceKind === "conjugation";
  const isConjugationTable = current?.practiceKind === "conjugation-table";

  useEffect(() => {
    if (!current || current.practiceKind !== "conjugation-table" || !current.conjugationTable) {
      setConjugationInputs([]);
      setConjugationRowFeedback([]);
      return;
    }
    const n = current.conjugationTable.entries.length;
    setConjugationInputs(Array.from({ length: n }, () => ""));
    setConjugationRowFeedback([]);
  }, [current?.id, idx]);

  const activeLanguagePair = useMemo(() => {
    if (current?.lessonLanguagePair) return current.lessonLanguagePair;
    if (sessionContext.id) return lessonsData.find((l) => l.id === sessionContext.id)?.language_pair ?? "en-pt";
    return lessonsData[0]?.language_pair ?? "en-pt";
  }, [current?.lessonLanguagePair, lessonsData, sessionContext.id]);
  const activeLessonLanguage = useMemo(() => {
    if (current?.lessonLanguage != null && String(current.lessonLanguage).trim()) return String(current.lessonLanguage).trim();
    if (sessionContext.id) return lessonsData.find((l) => l.id === sessionContext.id)?.language?.trim() || null;
    return null;
  }, [current?.lessonLanguage, lessonsData, sessionContext.id]);
  const isFillBlank = current?.promptFormat === "fill_blank";
  const prompt = useMemo(() => {
    if (!current) return "";
    if (isFillBlank) return current.en || "";
    return getDisplayPrompt(current, direction);
  }, [current, direction, isFillBlank]);
  const expected = useMemo(() => {
    if (!current) return "";
    if (isFillBlank) return current.pt || "";
    return getExpectedAnswer(current, direction);
  }, [current, direction, isFillBlank]);

  /** Label to show after wrong MCQ / Skip — test MCQ correct answer lives in option text, not always pt/en. */
  const feedbackExpected = useMemo(() => {
    if (!current) return "";
    if (isFillBlank) return current.pt || "";
    if (current.practiceKind === "conjugation-table" && current.conjugationTable) {
      return current.conjugationTable.entries.map((e) => `${e.pronoun}: ${e.form_a || e.form_b || "—"}`).join("; ");
    }
    if (
      current.answerFormat === "mcq" &&
      Array.isArray(current.mcqOptions) &&
      current.mcqOptions.length > 0 &&
      current.mcqCorrectOptionId != null &&
      String(current.mcqCorrectOptionId).length > 0
    ) {
      const id = String(current.mcqCorrectOptionId);
      const opt = current.mcqOptions.find((o) => String(o.id) === id);
      const label = typeof opt?.text === "string" ? opt.text.trim() : "";
      if (label) return label;
    }
    return getExpectedAnswer(current, direction);
  }, [current, direction, isFillBlank]);

  const sourceLang = isFillBlank ? "en" : direction === "pt-en" ? "pt" : "en";
  const targetLang = isFillBlank ? "pt" : direction === "pt-en" ? "en" : "pt";
  const acceptedAnswers = useMemo(() => getAcceptedAnswers(expected, current, direction), [current, direction, expected]);
  const sentenceHint = useMemo(() => {
    if (!current) return null;
    if (current.practiceKind === "conjugation-table") return null;
    const sentence = direction === "pt-en" ? current.se : current.sp;
    if (!sentence) return null;
    return maskWord(sentence, expected);
  }, [current, direction, expected]);

  const showMcq =
    runtimeScreen === "session" &&
    !!current &&
    !isFillBlank &&
    (sessionMode === "multiple-choice" ||
      (current.answerFormat === "mcq" && (current.mcqOptions?.length ?? 0) >= 2));

  /** Match web: no big emoji block for conjugation / preposition when there is no image. */
  const hidePlaceholderIllustration =
    current?.practiceKind === "conjugation" ||
    current?.practiceKind === "conjugation-table" ||
    current?.practiceKind === "preposition";
  const showSessionIllustration =
    sessionMode === "image" ||
    (sessionMode === "listening" && !!current?.imageUrl) ||
    (sessionMode !== "listening" && (!!current?.imageUrl || (!showMcq && !hidePlaceholderIllustration)));
  const sessionHeaderLabel = isConjugationTable
    ? "Conjugate"
    : isConjugationDrill
      ? (sessionMode === "listening" ? "Listen" : showMcq ? "Multiple Choice" : "Conjugate")
      : sessionMode === "listening"
        ? "Listen"
        : sessionMode === "image"
          ? "Look"
          : isFillBlank
            ? "Fill Blank"
            : showMcq
              ? "Multiple Choice"
              : "Translate";

  const getWordStat = useCallback(
    (word: GameWord) => {
      const stats = progress?.wordStats ?? {};
      const byId = stats[word.id];
      if (byId) return byId;
      const byPt = word.pt ? stats[word.pt] : undefined;
      if (byPt) return byPt;
      const byEn = word.en ? stats[word.en] : undefined;
      if (byEn) return byEn;
      return undefined;
    },
    [progress?.wordStats]
  );

  const wordsLearned = useMemo(
    () =>
      lessonsWords.reduce((count, word) => {
        const stat = getWordStat(word);
        return count + (stat && stat.total >= 1 ? 1 : 0);
      }, 0),
    [getWordStat, lessonsWords]
  );
  const masteredWords = useMemo(
    () =>
      lessonsWords.reduce((count, word) => {
        const stat = getWordStat(word);
        return count + (stat && stat.total >= 3 && stat.correct / stat.total >= 0.8 ? 1 : 0);
      }, 0),
    [getWordStat, lessonsWords]
  );
  const practicedWords = useMemo(
    () =>
      lessonsWords.reduce((count, word) => {
        const stat = getWordStat(word);
        return count + (stat && stat.total >= 1 ? 1 : 0);
      }, 0),
    [getWordStat, lessonsWords]
  );
  const totalWordsAvailable = lessonsWords.length;
  const overallProgress = totalWordsAvailable > 0 ? Math.round((practicedWords / totalWordsAvailable) * 100) : 0;
  const currentStreak = calculateStreak(progress?.practiceHistory ?? [], progress?.testHistory ?? []);
  const totalXP = useMemo(() => {
    const p = progress?.practiceHistory ?? [];
    const t = progress?.testHistory ?? [];
    return [...p, ...t].reduce((sum, r) => {
      const score = typeof (r as any).score === "number" ? (r as any).score : typeof (r as any).correct === "number" ? (r as any).correct : 0;
      const percentage = typeof (r as any).percentage === "number" ? (r as any).percentage : 0;
      const passed = typeof (r as any).passed === "boolean" ? (r as any).passed : percentage >= 80;
      return sum + (score * 10 + (passed ? 50 : 0));
    }, 0);
  }, [progress?.practiceHistory, progress?.testHistory]);
  const levelInfo = getLevelInfo(totalXP);

  const lessonDetailDisplayMeta = useMemo(
    () =>
      selectedLessonDetail
        ? getDisplayLanguageMeta(selectedLessonDetail.language_pair, selectedLessonDetail.language)
        : getDisplayLanguageMeta("en-pt", null),
    [selectedLessonDetail]
  );

  const testDetailDisplayMeta = useMemo(() => {
    if (!selectedTestDetail) return getDisplayLanguageMeta("en-pt", null);
    if (selectedTestDetail.type === "lesson")
      return getDisplayLanguageMeta(selectedTestDetail.lesson.language_pair, selectedTestDetail.lesson.language);
    return getDisplayLanguageMeta("en-pt", null);
  }, [selectedTestDetail]);

  const lessonsOverview = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; cover?: string; total: number; practiced: number; mastered: number }
    >();
    for (const w of lessonsWords) {
      const id = w.lessonId ?? "unknown";
      const key = id;
      const prev = map.get(key) ?? {
        id,
        name: w.lessonName || "Lesson",
        cover: w.imageUrl,
        total: 0,
        practiced: 0,
        mastered: 0,
      };
      prev.total += 1;
      if (!prev.cover && w.imageUrl) prev.cover = w.imageUrl;
      const stat = getWordStat(w);
      if (stat && stat.total > 0) {
        prev.practiced += 1;
        if (stat.total >= 3 && stat.correct / stat.total >= 0.8) prev.mastered += 1;
      }
      map.set(key, prev);
    }
    // Dashboard edits apply to lessons.title / cover_image_url — not always mirrored on word rows.
    return Array.from(map.values()).map((row) => {
      const full = lessonsData.find((l) => l.id === row.id);
      if (!full) return row;
      const lessonCover = full.cover_image_url?.trim();
      return {
        ...row,
        name: full.name?.trim() || row.name,
        cover: lessonCover || row.cover,
      };
    });
  }, [getWordStat, lessonsData, lessonsWords]);

  const latestLearningRecord = useMemo(() => {
    const records = [...(progress?.practiceHistory ?? []), ...(progress?.testHistory ?? [])];
    if (!records.length) return null;
    return [...records].sort((a, b) => {
      const leftRaw = typeof (a as any).date === "string" ? (a as any).date : typeof (a as any).timestamp === "string" ? (a as any).timestamp : "";
      const rightRaw = typeof (b as any).date === "string" ? (b as any).date : typeof (b as any).timestamp === "string" ? (b as any).timestamp : "";
      return (Date.parse(rightRaw) || 0) - (Date.parse(leftRaw) || 0);
    })[0];
  }, [progress?.practiceHistory, progress?.testHistory]);

  const continueSuggestion = useMemo<ContinueSuggestion | null>(() => {
    if (savedResume) {
      return {
        kind: "resume",
        title: savedResume.lessonName,
        subtitle: `${savedResume.sessionMode.replace("-", " ")} session`,
        meta: `Word ${savedResume.idx + 1} of ${savedResume.activeWords.length}`,
        ctaLabel: "Resume session",
      };
    }

    if (!latestLearningRecord) return null;

    const rawId =
      typeof (latestLearningRecord as any).lessonId === "string"
        ? (latestLearningRecord as any).lessonId
        : typeof (latestLearningRecord as any).lesson_id === "string"
          ? (latestLearningRecord as any).lesson_id
          : "";
    const rawName =
      typeof (latestLearningRecord as any).lessonName === "string"
        ? (latestLearningRecord as any).lessonName
        : typeof (latestLearningRecord as any).lesson_name === "string"
          ? (latestLearningRecord as any).lesson_name
          : "Recent activity";
    const percentage = typeof (latestLearningRecord as any).percentage === "number" ? (latestLearningRecord as any).percentage : 0;
    const mode =
      typeof (latestLearningRecord as any).mode === "string"
        ? String((latestLearningRecord as any).mode).replace("-", " ")
        : "practice";
    const isTestRecord = ((latestLearningRecord as any).type as StudySessionType | undefined) === "test";

    if (isTestRecord) {
      const matchedTest = testsData.find((item) => item.id === rawId) ?? testsData.find((item) => item.name === rawName);
      if (matchedTest) {
        return {
          kind: "test",
          title: matchedTest.name,
          subtitle: "Revisit your latest test",
          meta: `${percentage}% last score • ${mode}`,
          ctaLabel: "Open test",
          testId: matchedTest.id,
        };
      }
    }

    const matchedLesson = lessonsData.find((item) => item.id === rawId) ?? lessonsData.find((item) => item.name === rawName);
    if (matchedLesson) {
      return {
        kind: "lesson",
        title: matchedLesson.name,
        subtitle: "Pick up your latest lesson",
        meta: `${percentage}% last run • ${mode}`,
        ctaLabel: "Open lesson",
        lessonId: matchedLesson.id,
      };
    }

    return null;
  }, [latestLearningRecord, lessonsData, savedResume, testsData]);

  const weeklyActivity = useMemo(() => {
    const records = [...(progress?.practiceHistory ?? []), ...(progress?.testHistory ?? [])];
    const days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
    return days.map((d) =>
      records.filter((r) => {
        const rawDate = typeof (r as any).date === "string" ? (r as any).date : typeof (r as any).timestamp === "string" ? (r as any).timestamp : "";
        if (!rawDate) return false;
        return rawDate.slice(0, 10) === d;
      }).length
    );
  }, [progress?.practiceHistory, progress?.testHistory]);
  const maxWeekActivity = Math.max(...weeklyActivity, 1);

  const latestTestByLesson = useMemo(() => {
    const map = new Map<string, { percentage: number; date: string }>();
    for (const rec of progress?.testHistory ?? []) {
      const lessonId = (rec as any).lessonId ?? (rec as any).lesson_id ?? (rec as any).lesson?.id ?? "";
      if (!lessonId) continue;
      if (!map.has(lessonId)) {
        map.set(lessonId, {
          percentage: typeof (rec as any).percentage === "number" ? (rec as any).percentage : 0,
          date: typeof (rec as any).date === "string" ? (rec as any).date : typeof (rec as any).timestamp === "string" ? (rec as any).timestamp : "",
        });
      }
    }
    return map;
  }, [progress?.testHistory]);

  const selectedLessonWords = useMemo(() => {
    if (!selectedLessonDetail) return [];
    return lessonsWords.filter((word) => word.lessonId === selectedLessonDetail.id);
  }, [lessonsWords, selectedLessonDetail]);

  const hasStudyContent = lessonsData.length > 0 || testsData.length > 0 || allWords.length > 0;

  const applyProgress = useCallback(
    (next: StudyProgress) => {
      setProgress(next);
      saveLocalProgress(next).catch(() => {});
      if (sessionId) scheduleProgressSync(sessionId, next, 1200);
    },
    [sessionId]
  );

  const setCorrectCountValue = useCallback((value: number) => {
    correctCountRef.current = value;
    setCorrectCount(value);
  }, []);

  const incrementCorrectCount = useCallback(() => {
    const next = correctCountRef.current + 1;
    correctCountRef.current = next;
    setCorrectCount(next);
  }, []);

  const clearSessionIssues = useCallback(() => {
    sessionIssuesRef.current = [];
    setSessionIssues([]);
  }, []);

  const recordSessionIssue = useCallback((issue: SessionIssue) => {
    const next = [...sessionIssuesRef.current, issue];
    sessionIssuesRef.current = next;
    setSessionIssues(next);
  }, []);

  useEffect(() => {
    correctCountRef.current = correctCount;
  }, [correctCount]);

  useEffect(() => {
    sessionIssuesRef.current = sessionIssues;
  }, [sessionIssues]);

  const triggerHaptic = useCallback(
    async (type: "success" | "warning" | "error") => {
      if (!progress?.preferences.hapticEnabled) return;
      try {
        if (type === "success") {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        }
        if (type === "warning") {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          return;
        }
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {
        // ignore haptic failures
      }
    },
    [progress?.preferences.hapticEnabled]
  );

  const callTeacherCompletionEdge = useCallback(
    async (type: "lesson_completed" | "test_completed") => {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
      if (!supabaseUrl || !anonKey || !sessionId) return;
      const edgeUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/send-teacher-completion-email`;
      await fetch(edgeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ sessionId, type, contentName: sessionContext.name || null }),
      }).catch(() => {});
    },
    [sessionId, sessionContext.name]
  );

  const openLessonDetail = useCallback((lesson: LessonGamePayload) => {
    setSelectedTestDetail(null);
    setSelectedLessonDetail(lesson);
    setLessonDetailMode("typing");
    setRuntimeScreen("lesson-detail");
  }, []);

  const saveResumeData = useCallback(() => {
    if (!selectedLessonDetail || !activeWords.length) return;
    const data = {
      lessonId: selectedLessonDetail.id,
      lessonName: selectedLessonDetail.name,
      idx,
      correctCount,
      activeWords,
      sessionType,
      sessionMode,
      direction,
      pool: sessionPool,
    };
    AsyncStorage.setItem("eluency_lesson_resume", JSON.stringify(data)).catch(() => {});
    setSavedResume(data);
  }, [activeWords, correctCount, direction, idx, selectedLessonDetail, sessionMode, sessionPool, sessionType]);

  const resumeSession = useCallback(() => {
    if (!savedResume) return;
    const lesson = lessonsData.find((l) => l.id === savedResume.lessonId) ?? null;
    setSelectedLessonDetail(lesson);
    setSessionType(savedResume.sessionType);
    setSessionMode(savedResume.sessionMode);
    setDirection(savedResume.direction);
    setActiveWords(savedResume.activeWords);
    setIdx(savedResume.idx);
    setInput("");
    setCorrectCountValue(savedResume.correctCount);
    setFeedback(null);
    setShowHint(false);
    setNeedsRetype(false);
    setShowInfinitiveNote(false);
    setGeminiCorrection("");
    setSessionContext({ id: savedResume.lessonId, name: savedResume.lessonName });
    setSessionPool(savedResume.pool);
    setRuntimeScreen("session");
  }, [lessonsData, savedResume, setCorrectCountValue]);

  const openLessonDocument = useCallback(() => {
    const documentUrl = selectedLessonDetail?.document_url?.trim();
    if (!documentUrl) {
      showToast("No lesson PDF is attached to this lesson yet.", "info");
      return;
    }
    const absoluteDocumentUrl = normalizeAbsoluteDocumentUrl(documentUrl);
    if (Platform.OS === "web") {
      Linking.openURL(absoluteDocumentUrl).catch(() => {
        showToast("Could not open the lesson PDF in the browser.", "danger");
      });
      return;
    }
    setLessonPdfViewerUri(absoluteDocumentUrl);
    setLessonPdfViewerVisible(true);
  }, [selectedLessonDetail?.document_url, showToast]);

  const openTestDetailFromTest = useCallback((test: TestGamePayload) => {
    setSelectedLessonDetail(null);
    setSelectedTestDetail({ type: "test", test });
    setRuntimeScreen("test-detail");
  }, []);

  const openTestDetailFromLesson = useCallback((lesson: LessonGamePayload) => {
    setSelectedLessonDetail(null);
    setSelectedTestDetail({ type: "lesson", lesson });
    setRuntimeScreen("test-detail");
  }, []);

  const openContinueSuggestion = useCallback(() => {
    if (!continueSuggestion) return;
    if (continueSuggestion.kind === "resume") {
      resumeSession();
      return;
    }
    if (continueSuggestion.kind === "lesson") {
      const lesson = lessonsData.find((item) => item.id === continueSuggestion.lessonId);
      if (lesson) openLessonDetail(lesson);
      return;
    }
    const test = testsData.find((item) => item.id === continueSuggestion.testId);
    if (test) openTestDetailFromTest(test);
  }, [continueSuggestion, lessonsData, openLessonDetail, openTestDetailFromTest, resumeSession, testsData]);

  const startSession = useCallback(
    (
      type: StudySessionType,
      mode: StudySessionMode,
      dir: StudyDirection,
      scopedWords?: GameWord[],
      context?: { id?: string | null; name?: string | null }
    ) => {
      if (!progress) return;
      const baseWords = scopedWords?.length ? scopedWords : allWords;
      const expandedBase = expandConjugationTablesForMode(baseWords, mode);
      const selected = pickSessionWords(
        expandedBase,
        type,
        mode,
        progress.preferences.practiceLength || 15,
        mistakeWordIds,
        progress.wordStats
      );
      if (!selected.length) {
        showToast("No words available for this mode yet.", "info");
        return;
      }
      setSessionType(type);
      setSessionMode(mode);
      setDirection(dir);
      setActiveWords(selected);
      setIdx(0);
      setInput("");
      setCorrectCountValue(0);
      setFeedback(null);
      setShowHint(false);
      setNeedsRetype(false);
      setShowInfinitiveNote(false);
      setGeminiCorrection("");
      setConjugationInputs([]);
      setConjugationRowFeedback([]);
      clearSessionIssues();
      sessionStreakRef.current = 0;
      setSessionStreak(0);
      setSessionContext({ id: context?.id ?? null, name: context?.name ?? null });
      setSessionPool(expandedBase);
      setRuntimeScreen("session");
    },
    [allWords, clearSessionIssues, mistakeWordIds, progress, setCorrectCountValue, showToast]
  );

  const finishSession = useCallback(async () => {
    if (!progress) return;
    const total = activeWords.length;
    const finalCorrectCount = correctCountRef.current;
    const finalIssues = [...sessionIssuesRef.current];
    const percentage = gradePercentage(finalCorrectCount, total);
    const allQuestionsAreOpenResponse =
      sessionType === "test" &&
      activeWords.length > 0 &&
      activeWords.every((word) => word.answerFormat === "open");
    const passed =
      sessionType === "test"
        ? (allQuestionsAreOpenResponse ? finalCorrectCount === activeWords.length : percentage >= 80)
        : percentage >= 80;
    const sessionLesson = sessionContext.id != null ? lessonsData.find((l) => l.id === sessionContext.id) : null;
    const rec = createRecord({
      type: sessionType,
      mode: sessionMode,
      direction,
      lessonId: sessionContext.id,
      lessonName: sessionContext.name,
      languagePair: sessionLesson?.language_pair ?? null,
      lessonLanguage: sessionLesson?.language?.trim() || null,
      correct: finalCorrectCount,
      total,
      passedOverride: passed,
      issues: finalIssues,
    });

    const practiceHistory = sessionType === "test" ? progress.practiceHistory : [rec, ...progress.practiceHistory];
    const testHistory = sessionType === "test" ? [rec, ...progress.testHistory] : progress.testHistory;
    const streak = calculateStreak(practiceHistory, testHistory);
    const userStats = updateUserStats(progress.userStats, rec, streak);
    const achievements = unlockAchievements(userStats, progress.achievements);

    const nextProgress: StudyProgress = {
      ...progress,
      practiceHistory,
      testHistory,
      userStats,
      achievements,
      dailyChallenge:
        sessionType === "daily-challenge"
          ? { date: new Date().toISOString().slice(0, 10), completed: true, score: percentage }
          : progress.dailyChallenge,
    };
    setProgress(nextProgress);
    await saveLocalProgress(nextProgress);
    if (sessionId) await flushProgressSync(sessionId, nextProgress);
    if (sessionType === "test") callTeacherCompletionEdge("test_completed").catch(() => {});
    if (sessionType === "practice" || sessionType === "smart-review") callTeacherCompletionEdge("lesson_completed").catch(() => {});
    setResultRecord({ score: finalCorrectCount, total, percentage, passed, issues: finalIssues });
    setSavedResume(null);
    AsyncStorage.removeItem("eluency_lesson_resume").catch(() => {});
    setRuntimeScreen("results");
  }, [activeWords, callTeacherCompletionEdge, direction, lessonsData, progress, sessionContext.id, sessionContext.name, sessionId, sessionMode, sessionType]);

  const answerCurrent = useCallback(async () => {
    if (!current || !progress) return;
    const userAnswer = input.trim();
    if (!userAnswer) return;

    const isOpenAnswer = current.answerFormat === "open";
    if (isOpenAnswer) {
      applyProgress({ ...progress, wordStats: updateWordStats(progress.wordStats, current.id, true) });
      triggerHaptic("success").catch(() => {});
      incrementCorrectCount();
      sessionStreakRef.current += 1;
      setSessionStreak(sessionStreakRef.current);
      recordSessionIssue({
        id: current.id,
        prompt,
        expected: feedbackExpected || expected,
        answer: userAnswer,
        kind: "open_review",
      });
      setFeedback({ state: "correct", text: sessionType === "test" ? "Answer counted." : "Answer submitted." });
      setTimeout(() => {
        setFeedback(null);
        setInput("");
        setShowHint(false);
        setNeedsRetype(false);
        setShowInfinitiveNote(false);
        setGeminiCorrection("");
        if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
        else setIdx((v) => v + 1);
      }, 700);
      return;
    }

    if (needsRetype) {
      const matched = acceptedAnswers.some((item) => normalizeText(String(item)) === normalizeText(userAnswer));
      if (!matched) {
        triggerHaptic("error").catch(() => {});
        setInput("");
        setFeedback({ state: "wrong", text: "Type the expected answer to continue." });
        return;
      }
      triggerHaptic("success").catch(() => {});
      setFeedback(null);
      setInput("");
      setShowHint(false);
      setNeedsRetype(false);
      setShowInfinitiveNote(false);
      setGeminiCorrection("");
      if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
      else setIdx((v) => v + 1);
      return;
    }

    let result: "correct" | "close" | "wrong" = "wrong";
    let exactMatch = false;
    let infinitiveNote = false;
    let correction = "";

    const remote = await verifyAnswer({
      correctAnswer: expected,
      userAnswer,
      sourceText: prompt,
      isMarkedInfinitive: isInfinitiveWord(current, expected, prompt, targetLang),
    });

    if (remote) {
      const remoteCorrect = typeof remote.correct === "boolean" ? remote.correct : !!remote.isCorrect;
      result = remoteCorrect ? "correct" : remote.close ? "close" : "wrong";
      exactMatch = remoteCorrect;
      infinitiveNote = !!remote.showInfinitiveNote && remoteCorrect;
      correction =
        typeof remote.correction === "string" ? remote.correction.trim() : typeof remote.feedback === "string" ? remote.feedback.trim() : "";
    } else {
      const fallback = localAnswerFallback(expected, userAnswer, acceptedAnswers.filter((value) => value !== expected));
      result = fallback.isCorrect ? "correct" : fallback.close ? "close" : "wrong";
      exactMatch = fallback.isCorrect;
      infinitiveNote = fallback.isCorrect && isInfinitiveWord(current, expected, prompt, targetLang);
    }

    const correctForStats = result === "correct" || result === "close";
    applyProgress({ ...progress, wordStats: updateWordStats(progress.wordStats, current.id, correctForStats) });
    setShowInfinitiveNote(infinitiveNote);
    setGeminiCorrection(correction);

    if (result === "correct") {
      triggerHaptic("success").catch(() => {});
      incrementCorrectCount();
      sessionStreakRef.current += 1;
      setSessionStreak(sessionStreakRef.current);
      recordSessionIssue({ id: current.id, prompt, expected: feedbackExpected || expected, answer: userAnswer, kind: "correct" });
      setFeedback({ state: "correct", text: "Correct!" });
    } else if (result === "close") {
      triggerHaptic("warning").catch(() => {});
      incrementCorrectCount();
      sessionStreakRef.current = 0;
      setSessionStreak(0);
      setFeedback({ state: "close", text: sessionType === "test" ? `Almost! Expected: ${feedbackExpected}` : "Almost there. Type the expected answer to continue." });
      setMistakeWordIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
      recordSessionIssue({ id: current.id, prompt, expected: feedbackExpected, answer: userAnswer, kind: "close" });
    } else {
      triggerHaptic("error").catch(() => {});
      sessionStreakRef.current = 0;
      setSessionStreak(0);
      setFeedback({ state: "wrong", text: `Expected: ${feedbackExpected}` });
      setMistakeWordIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
      recordSessionIssue({ id: current.id, prompt, expected: feedbackExpected, answer: userAnswer, kind: "wrong" });
    }

    if (exactMatch) {
      setTimeout(() => {
        setFeedback(null);
        setInput("");
        setShowHint(false);
        setNeedsRetype(false);
        setShowInfinitiveNote(false);
        setGeminiCorrection("");
        if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
        else setIdx((v) => v + 1);
      }, 700);
      return;
    }

    if (sessionType === "test") {
      setTimeout(() => {
        setFeedback(null);
        setInput("");
        setShowHint(false);
        setNeedsRetype(false);
        setShowInfinitiveNote(false);
        setGeminiCorrection("");
        if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
        else setIdx((v) => v + 1);
      }, 1500);
      return;
    }

    setNeedsRetype(true);
    setInput("");
  }, [
    acceptedAnswers,
    activeWords.length,
    applyProgress,
    current,
    expected,
    feedbackExpected,
    finishSession,
    idx,
    input,
    needsRetype,
    progress,
    prompt,
    recordSessionIssue,
    targetLang,
    triggerHaptic,
    sessionType,
  ]);

  const submitConjugationTable = useCallback(async () => {
    if (!current || !progress || current.practiceKind !== "conjugation-table" || !current.conjugationTable) return;
    if (conjugationRowFeedback.length > 0) return;
    const entries = current.conjugationTable.entries;
    const results = entries.map((entry, i) => {
      const userVal = normalizeText(conjugationInputs[i] ?? "");
      const correct = normalizeText(String(entry.form_a || entry.form_b || "").trim());
      return userVal.length > 0 && correct.length > 0 && userVal === correct;
    });
    const done = results.length > 0 && results.every(Boolean);
    const anyRight = results.some(Boolean);
    setConjugationRowFeedback(results);
    applyProgress({ ...progress, wordStats: updateWordStats(progress.wordStats, current.id, done) });
    if (done) {
      triggerHaptic("success").catch(() => {});
      incrementCorrectCount();
      recordSessionIssue({
        id: current.id,
        prompt: current.conjugationTable.infinitive,
        expected: entries.map((e) => `${e.pronoun}: ${e.form_a || e.form_b || "—"}`).join("; "),
        answer: conjugationInputs.join("; "),
        kind: "correct",
      });
      setFeedback({ state: "correct", text: "Correct!" });
    } else if (anyRight) {
      triggerHaptic("warning").catch(() => {});
      recordSessionIssue({
        id: current.id,
        prompt: current.conjugationTable.infinitive,
        expected: entries.map((e) => `${e.pronoun}: ${e.form_a || e.form_b || "—"}`).join("; "),
        answer: conjugationInputs.join("; "),
        kind: "close",
      });
      setFeedback({ state: "close", text: "Some forms need correction. Check the highlighted rows." });
    } else {
      triggerHaptic("error").catch(() => {});
      setMistakeWordIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
      const lines = entries.map((e) => `${e.pronoun}: ${e.form_a || e.form_b || "—"}`).join("; ");
      setFeedback({ state: "wrong", text: `Expected: ${lines}` });
      recordSessionIssue({ id: current.id, prompt: current.conjugationTable.infinitive, expected: lines, kind: "wrong" });
    }
    setTimeout(() => {
      setFeedback(null);
      setConjugationRowFeedback([]);
      if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
      else setIdx((v) => v + 1);
    }, done ? 900 : 2200);
  }, [
    activeWords.length,
    applyProgress,
    conjugationInputs,
    conjugationRowFeedback.length,
    current,
    finishSession,
    incrementCorrectCount,
    idx,
    progress,
    recordSessionIssue,
    triggerHaptic,
  ]);

  useEffect(() => {
    if (runtimeScreen !== "session" || !current) {
      setMcqChoiceTexts([]);
      setMcqChoiceOptions(null);
      return;
    }
    if (current.practiceKind === "conjugation-table") {
      setMcqChoiceTexts([]);
      setMcqChoiceOptions(null);
      return;
    }
    const structuredMcq = current.answerFormat === "mcq" && Array.isArray(current.mcqOptions) && current.mcqOptions.length >= 2;
    const modeMcq = sessionMode === "multiple-choice";
    if (structuredMcq && current.mcqOptions) {
      setMcqChoiceOptions(shuffle(current.mcqOptions.map((o) => ({ id: String(o.id), text: String(o.text ?? "") }))));
      setMcqChoiceTexts([]);
      return;
    }
    if (!modeMcq) {
      setMcqChoiceTexts([]);
      setMcqChoiceOptions(null);
      return;
    }
    const correct = getExpectedAnswer(current, direction);
    if (!String(correct).trim()) {
      setMcqChoiceTexts([]);
      setMcqChoiceOptions(null);
      return;
    }
    const pool = sessionPool.length >= 2 ? sessionPool : activeWords;
    const others = pool.filter((w) => w.id !== current.id);
    const wrongCandidates = shuffle(others)
      .map((w) => getExpectedAnswer(w, direction))
      .filter((t) => t && normalizeText(String(t)) !== normalizeText(String(correct)));
    const wrong: string[] = [];
    for (const w of wrongCandidates) {
      if (wrong.length >= 3) break;
      if (!wrong.some((x) => normalizeText(x) === normalizeText(w))) wrong.push(w);
    }
    let choices = shuffle([correct, ...wrong].filter((x) => String(x ?? "").trim()));
    if (choices.length < 2) {
      const fillers = ["?", "—", "…"].filter((f) => !choices.some((c) => normalizeText(c) === normalizeText(f)));
      for (const f of fillers) {
        if (choices.length >= 4) break;
        choices.push(f);
      }
      choices = shuffle(choices);
    }
    setMcqChoiceOptions(null);
    setMcqChoiceTexts(choices);
  }, [activeWords, current, direction, idx, runtimeScreen, sessionMode, sessionPool]);

  const handleMcqPick = useCallback(
    async (choiceText: string, optionId?: string) => {
      if (!current || !progress || feedback) return;
      const isOpen = current.answerFormat === "open";
      if (isOpen) {
        applyProgress({ ...progress, wordStats: updateWordStats(progress.wordStats, current.id, true) });
        triggerHaptic("success").catch(() => {});
        incrementCorrectCount();
        recordSessionIssue({
          id: current.id,
          prompt,
          expected: feedbackExpected || expected,
          answer: choiceText,
          kind: "open_review",
        });
        setFeedback({ state: "correct", text: sessionType === "test" ? "Answer counted." : "Answer submitted." });
        setTimeout(() => {
          setFeedback(null);
          setInput("");
          setShowHint(false);
          setNeedsRetype(false);
          setShowInfinitiveNote(false);
          setGeminiCorrection("");
          if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
          else setIdx((v) => v + 1);
        }, 700);
        return;
      }

      let isCorrect = false;
      if (
        optionId != null &&
        current.mcqCorrectOptionId != null &&
        String(current.mcqCorrectOptionId).length > 0
      ) {
        isCorrect = String(optionId) === String(current.mcqCorrectOptionId);
      } else {
        const accepted = getAcceptedAnswers(expected, current, direction);
        isCorrect = accepted.some((a) => normalizeText(String(a)) === normalizeText(choiceText));
      }

      applyProgress({ ...progress, wordStats: updateWordStats(progress.wordStats, current.id, isCorrect) });

      if (isCorrect) {
        setShowInfinitiveNote(isInfinitiveWord(current, expected, prompt, targetLang));
        triggerHaptic("success").catch(() => {});
        incrementCorrectCount();
        recordSessionIssue({ id: current.id, prompt, expected: feedbackExpected || expected, answer: choiceText, kind: "correct" });
        setFeedback({ state: "correct", text: "Correct!" });
      } else {
        setShowInfinitiveNote(false);
        triggerHaptic("error").catch(() => {});
        setFeedback({ state: "wrong", text: `Expected: ${feedbackExpected}` });
        setMistakeWordIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
        recordSessionIssue({ id: current.id, prompt, expected: feedbackExpected, answer: choiceText, kind: "wrong" });
      }

      setInput("");
      const delay = isCorrect ? 700 : 1500;
      setTimeout(() => {
        setFeedback(null);
        setShowHint(false);
        setNeedsRetype(false);
        setShowInfinitiveNote(false);
        setGeminiCorrection("");
        if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
        else setIdx((v) => v + 1);
      }, delay);
    },
    [
      activeWords.length,
      applyProgress,
      current,
      expected,
      feedbackExpected,
      feedback,
      finishSession,
      incrementCorrectCount,
      idx,
      progress,
      prompt,
      recordSessionIssue,
      sessionType,
      targetLang,
      triggerHaptic,
    ]
  );

  const playPromptAudio = useCallback(async () => {
    if (!current || !sessionId) return;
    const clearPlayer = async () => {
      try {
        audioPlayerRef.current?.pause?.();
      } catch {}
      try {
        audioPlayerRef.current?.remove?.();
      } catch {}
      audioPlayerRef.current = null;
      if (audioTempFileRef.current) {
        await FileSystem.deleteAsync(audioTempFileRef.current, { idempotent: true }).catch(() => {});
        audioTempFileRef.current = null;
      }
    };

    await clearPlayer();

    const playUri = async (uri: string) => {
      const player = createAudioPlayer(uri);
      audioPlayerRef.current = player;
      player.play();
    };

    if (current.audioUrl) {
      await playUri(current.audioUrl);
      return;
    }

    let speakText = prompt || current.pt || current.en;
    if (current.practiceKind === "conjugation-table" && current.conjugationTable?.infinitive) {
      speakText = current.conjugationTable.infinitive;
    } else if (current.practiceKind === "conjugation" && current.conjugationInfinitive) {
      speakText = current.conjugationInfinitive;
    }
    const text = speakText;
    if (!text) return;
    setTtsLoading(true);
    try {
      const lang = direction === "pt-en" ? "pt-BR" : "en-US";
      const generated = await requestTtsBase64(text, sessionId, lang);
      if (generated?.url) {
        await playUri(generated.url);
        return;
      }
      if (!generated?.data) {
        await Speech.speak(text, { language: lang, pitch: 1, rate: 0.95 });
        return;
      }

      const extension = generated.mimeType.includes("mpeg")
        ? "mp3"
        : generated.mimeType.includes("wav")
          ? "wav"
          : "m4a";
      const tempUri = `${FileSystem.cacheDirectory}gemini-tts-${Date.now()}.${extension}`;
      await FileSystem.writeAsStringAsync(tempUri, generated.data, { encoding: "base64" as any });
      audioTempFileRef.current = tempUri;

      const player = createAudioPlayer(tempUri);
      audioPlayerRef.current = player;
      player.addListener?.("playbackStatusUpdate", (status: any) => {
        if (status?.didJustFinish) {
          clearPlayer().catch(() => {});
        }
      });
      player.play();
    } catch (error) {
      try {
        await Speech.speak(text, { language: direction === "pt-en" ? "pt-BR" : "en-US", pitch: 1, rate: 0.95 });
      } catch {
        showToast("Audio unavailable right now.", "danger");
      }
    } finally {
      setTtsLoading(false);
    }
  }, [current, direction, prompt, sessionId, showToast]);

  const playStudyTextAudio = useCallback(
    async (text: string, lang: "a" | "b" = "a") => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!sessionId) {
        await Speech.speak(trimmed, { language: lang === "a" ? "pt-BR" : "en-US", pitch: 1, rate: 0.95 });
        return;
      }
      try {
        const meta = getDisplayLanguageMeta(activeLanguagePair, activeLessonLanguage);
        const speechLang = ttsLangFromShort(lang === "a" ? meta.shortA : meta.shortB);
        const generated = await requestTtsBase64(trimmed, sessionId, speechLang);
        if (generated?.url) {
          const player = createAudioPlayer(generated.url);
          audioPlayerRef.current = player;
          player.play();
          return;
        }
        if (generated?.data) {
          const extension = generated.mimeType.includes("mpeg") ? "mp3" : generated.mimeType.includes("wav") ? "wav" : "m4a";
          const tempUri = `${FileSystem.cacheDirectory}study-text-${Date.now()}.${extension}`;
          await FileSystem.writeAsStringAsync(tempUri, generated.data, { encoding: "base64" as any });
          audioTempFileRef.current = tempUri;
          const player = createAudioPlayer(tempUri);
          audioPlayerRef.current = player;
          player.play();
          return;
        }
        await Speech.speak(trimmed, { language: speechLang, pitch: 1, rate: 0.95 });
      } catch {
        try {
          await Speech.speak(trimmed, { language: lang === "a" ? "pt-BR" : "en-US", pitch: 1, rate: 0.95 });
        } catch {
          showToast("This audio hint is unavailable right now.", "danger");
        }
      }
    },
    [activeLanguagePair, activeLessonLanguage, sessionId, showToast]
  );

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "doNotMix",
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!sessionId) {
        Alert.alert("Session", "Session is required.");
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
        return;
      }
      setLoading(true);
      try {
        const session = await getStudentSession(sessionId);
        const [lessons, tests, hydrated] = await Promise.all([
          getAssignedLessons(session.student.assigned_lessons ?? []),
          getAssignedTests(session.student.assigned_tests ?? []),
          hydrateProgress(sessionId),
        ]);
        if (!mounted) return;
        if (__DEV__) {
          console.log(
            "[StudyGame] initial load lessons:",
            lessons.map((l) => ({
              id: l.id,
              name: l.name,
              cover_image_url: l.cover_image_url,
              updated_at: l.updated_at,
              words: l.words?.length ?? 0,
            }))
          );
        }
        setStudentName(session.student.name);
        setTeacherName(session.teacher?.name ?? "Teacher");
        assetCatalogEpochRef.current += 1;
        const epoch = assetCatalogEpochRef.current;
        setAssetRefreshEpoch(epoch);
        setLessonsData(lessons);
        setTestsData(tests);
        setLessonsWords(normalizeLessonsToWords(lessons, epoch));
        setTestsWords(normalizeTestsToWords(tests, epoch));
        setProgress(hydrated);
        initialCatalogLoadedRef.current = true;
        const raw = await AsyncStorage.getItem("eluency_lesson_resume").catch(() => null);
        if (raw && mounted) {
          try { setSavedResume(JSON.parse(raw)); } catch {}
        }
      } catch (e) {
        if (!mounted) return;
        clearStoredStudentSessionId().catch(() => {});
        Alert.alert("Error", e instanceof Error ? e.message : "Failed to load study game");
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      try {
        audioPlayerRef.current?.pause?.();
        audioPlayerRef.current?.remove?.();
      } catch {}
    };
  }, [navigation, sessionId]);

  useEffect(() => {
    if (!sessionId || !progress) return;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") {
        flushProgressSync(sessionId, progress).catch(() => {});
        if (runtimeScreenRef.current === "session") {
          saveResumeDataRef.current();
        }
        return;
      }
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        refreshCatalogRef.current?.().catch(() => {});
        resumeTimer = null;
      }, 400);
    });
    return () => {
      sub.remove();
      if (resumeTimer) clearTimeout(resumeTimer);
    };
  }, [progress, sessionId]);

  useFocusEffect(
    useCallback(() => {
      if (!sessionId || !initialCatalogLoadedRef.current) return;
      const t = setTimeout(() => {
        refreshCatalogRef.current?.().catch(() => {});
      }, 200);
      return () => clearTimeout(t);
    }, [sessionId])
  );

  useEffect(() => {
    if (runtimeScreen !== "session" || !current) return;
    if (sessionMode === "listening") {
      playPromptAudio().catch(() => {});
    }
  }, [current, playPromptAudio, runtimeScreen, sessionMode]);

  useEffect(() => {
    return () => {
      if (sessionId && progress) flushProgressSync(sessionId, progress).catch(() => {});
    };
  }, [progress, sessionId]);

  useEffect(() => {
    if (!selectedLessonDetail) return;
    const validModes: StudySessionMode[] = ["typing", "multiple-choice", "listening", "image"];
    AsyncStorage.getItem(`eluency_lesson_mode_${selectedLessonDetail.id}`)
      .then((saved) => {
        if (saved && validModes.includes(saved as StudySessionMode)) {
          setLessonDetailMode(saved as StudySessionMode);
        }
      })
      .catch(() => {});
  }, [selectedLessonDetail?.id]);

  // Keep refs in sync with current render values so callbacks/effects can read them safely
  runtimeScreenRef.current = runtimeScreen;
  saveResumeDataRef.current = saveResumeData;

  if (loading || !progress) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const dailyCompleted = progress.dailyChallenge.date === new Date().toISOString().slice(0, 10) && progress.dailyChallenge.completed;
  const uiIsDark = theme.isDark;
  const ui = uiIsDark
    ? {
        bg: theme.colors.background,
        card: theme.colors.surfaceGlass,
        cardStrong: "rgba(23,33,43,0.84)",
        text: theme.colors.text,
        muted: theme.colors.textMuted,
        border: theme.colors.border,
        borderStrong: theme.colors.borderStrong,
        borderSoft: "rgba(255,255,255,0.08)",
        primary: theme.colors.primary,
        primarySoft: theme.colors.primarySoft,
        secondary: theme.colors.violet,
        success: theme.colors.success,
        warning: "#D4943C",
        danger: theme.colors.danger,
      }
    : {
        bg: theme.colors.background,
        card: theme.colors.surfaceGlass,
        cardStrong: "rgba(252,250,246,0.9)",
        text: theme.colors.text,
        muted: theme.colors.textMuted,
        border: theme.colors.border,
        borderStrong: theme.colors.borderStrong,
        borderSoft: "rgba(15,23,42,0.06)",
        primary: theme.colors.primary,
        primarySoft: theme.colors.primarySoft,
        secondary: theme.colors.violet,
        success: theme.colors.success,
        warning: "#D4943C",
        danger: theme.colors.danger,
      };
  const reviewViewportMaxHeight = 488;

  return (
    <View className="flex-1" style={{ backgroundColor: ui.bg }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -40,
          right: -70,
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: ui.primarySoft,
          opacity: uiIsDark ? 0.2 : 0.45,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 180,
          left: -80,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: `${ui.secondary}22`,
          opacity: uiIsDark ? 0.18 : 0.28,
        }}
      />
      {runtimeScreen === "dashboard" ? (
        <>
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              backgroundColor: uiIsDark ? theme.colors.background : theme.colors.surface,
              borderBottomWidth: 1,
              borderBottomColor: ui.border,
              paddingTop: Math.max(insets.top, 8),
              paddingBottom: 10,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View style={{ width: 44, height: 44, marginRight: 12, alignItems: "center", justifyContent: "center" }}>
              <SvgUri width="88%" height="88%" uri={tinyLogoUri} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontWeight: "800",
                  fontSize: 18,
                  color: ui.text,
                  textTransform: activeTab === "home" ? undefined : "capitalize",
                }}
              >
                {activeTab === "home" ? "Home" : activeTab}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TouchableOpacity
                activeOpacity={1}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: ui.border,
                  backgroundColor: ui.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="notifications-outline" size={18} color={ui.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setRuntimeScreen("dashboard");
                  setActiveTab("settings");
                }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: ui.border,
                  backgroundColor: ui.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="person-outline" size={18} color={ui.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: Math.max(insets.top, 8) + (activeTab === "home" ? 60 : 60),
              paddingBottom: 108,
            }}
            refreshControl={<RefreshControl refreshing={catalogRefreshing} onRefresh={() => onCatalogPullRefresh()} tintColor={ui.primary} colors={[ui.primary]} />}
          >
            <ScreenReveal key={`dashboard-${activeTab}`} delay={12} distance={16} scaleFrom={0.992}>
            {activeTab === "home" ? (
              <>
                <ScreenReveal delay={20}>
                <GlassCard style={{ borderRadius: 18, marginBottom: 14 }} padding={14} variant="hero">
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View>
                      <Text style={{ fontSize: 26 }}>🎓</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontWeight: "800", fontSize: 20, color: ui.text }}>
                        Level {levelInfo.current.level} — {levelInfo.current.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: ui.muted, marginTop: 2 }}>
                        {levelInfo.next
                          ? `${levelInfo.xpInLevel} / ${levelInfo.xpForLevel} XP to Level ${levelInfo.next.level}`
                          : "Max Level"}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: ui.primarySoft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 }}>
                      <Text style={{ color: ui.secondary, fontWeight: "800", fontSize: 13 }}>{totalXP} XP</Text>
                    </View>
                  </View>
                  <View style={{ height: 8, backgroundColor: ui.borderSoft, borderRadius: 999, overflow: "hidden", marginTop: 12 }}>
                    <View style={{ height: "100%", width: `${levelInfo.progress}%`, backgroundColor: ui.secondary }} />
                  </View>
                </GlassCard>
                </ScreenReveal>

                {continueSuggestion ? (
                  <TouchableOpacity onPress={openContinueSuggestion} activeOpacity={0.86} style={{ marginBottom: 14 }}>
                    <GlassCard style={{ borderRadius: 18, borderWidth: 1, borderColor: `${ui.primary}55` }} padding={14} variant="strong">
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: ui.primary, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name={continueSuggestion.kind === "test" ? "clipboard-outline" : "play"} size={20} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: "800", color: ui.primary, letterSpacing: 1, marginBottom: 3 }}>
                            {continueSuggestion.kind === "resume" ? "CONTINUE WHERE YOU LEFT OFF" : "PICK UP WHERE YOU LEFT OFF"}
                          </Text>
                          <Text style={{ fontSize: 17, fontWeight: "800", color: ui.text }} numberOfLines={1}>
                            {continueSuggestion.title}
                          </Text>
                          <Text style={{ fontSize: 12, color: ui.muted, marginTop: 2 }} numberOfLines={1}>
                            {continueSuggestion.subtitle}
                          </Text>
                          <Text style={{ fontSize: 11, color: ui.muted, marginTop: 3 }}>{continueSuggestion.meta}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 5 }}>
                          <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: ui.primarySoft }}>
                            <Text style={{ color: ui.primary, fontSize: 11, fontWeight: "800" }}>{continueSuggestion.ctaLabel}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={ui.primary} />
                        </View>
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                ) : null}

                {!hasStudyContent ? (
                  <View style={{ marginBottom: 14 }}>
                    <StudentEmptyState
                      icon="sparkles-outline"
                      title="Waiting for your first assignment"
                      body="Your teacher has not shared lessons or tests with you yet. Pull to refresh here and new work will appear automatically."
                      actionLabel="Refresh"
                      onAction={() => {
                        onCatalogPullRefresh().catch(() => {});
                      }}
                    />
                  </View>
                ) : null}

                <ScreenReveal delay={70}>
                <GlassCard style={{ borderRadius: 22, marginBottom: 14 }} padding={18} variant="hero">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View
                      style={{
                        width: 104,
                        height: 104,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Svg width={104} height={104} style={{ position: "absolute" }}>
                        <Circle cx={52} cy={52} r={44} stroke={ui.borderSoft} strokeWidth={8} fill="none" />
                        <Circle
                          cx={52}
                          cy={52}
                          r={44}
                          stroke={ui.primary}
                          strokeWidth={8}
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 44}`}
                          strokeDashoffset={`${2 * Math.PI * 44 * (1 - Math.min(100, Math.max(0, overallProgress)) / 100)}`}
                          strokeLinecap="round"
                          rotation="-90"
                          origin="52,52"
                        />
                      </Svg>
                      <Text style={{ color: ui.primary, fontWeight: "900", fontSize: 24 }}>{overallProgress}%</Text>
                      <Text style={{ fontSize: 9, color: ui.muted, fontWeight: "700", marginTop: -1 }}>PROGRESS</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: ui.muted, fontSize: 16, marginBottom: 2 }}>Welcome back, {studentName}!</Text>
                      <Text style={{ color: ui.text, fontSize: 22, fontWeight: "800", lineHeight: 28 }}>
                        {overallProgress >= 80 ? "Almost there!" : overallProgress >= 50 ? "Keep it up!" : overallProgress > 0 ? "Great start!" : "Let's begin!"}
                      </Text>
                      <View style={{ flexDirection: "row", marginTop: 12, gap: 20 }}>
                        <View>
                          <Text style={{ fontSize: 22, fontWeight: "800", color: ui.secondary }}>🔥 {currentStreak}</Text>
                          <Text style={{ fontSize: 10, color: ui.muted, fontWeight: "600" }}>Day Streak</Text>
                        </View>
                        <View>
                          <Text style={{ fontSize: 22, fontWeight: "800", color: ui.text }}>📖 {wordsLearned}</Text>
                          <Text style={{ fontSize: 10, color: ui.muted, fontWeight: "600" }}>Words Learned</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, color: ui.muted, fontWeight: "600", marginTop: 8 }}>Tap for progress</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => !dailyCompleted && startSession("daily-challenge", "typing", "pt-en")}
                    activeOpacity={dailyCompleted ? 1 : 0.9}
                    style={{
                      marginTop: 16,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: dailyCompleted ? ui.success : ui.secondary,
                      backgroundColor: dailyCompleted ? `${ui.success}22` : `${ui.primary}10`,
                      padding: 14,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                        <Text style={{ fontSize: 18 }}>{dailyCompleted ? "✅" : "⚡"}</Text>
                      </View>
                      <View>
                        <Text style={{ fontWeight: "800", fontSize: 16, color: ui.text }}>Daily Challenge</Text>
                        <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
                          <Text style={{ fontSize: 11, color: ui.muted, backgroundColor: ui.borderSoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                            20 words
                          </Text>
                          {!dailyCompleted ? (
                            <Text style={{ fontSize: 11, color: ui.primary, fontWeight: "700", backgroundColor: ui.primarySoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                              +50 bonus XP
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: ui.primary, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </View>
                  </TouchableOpacity>
                </GlassCard>
                </ScreenReveal>

                <ScreenReveal delay={110}>
                <GlassCard style={{ borderRadius: 16, marginBottom: 14 }} padding={14} variant="strong">
                  <Text style={{ fontWeight: "700", fontSize: 18, color: ui.text, marginBottom: 10 }}>Activity</Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 46 }}>
                    {weeklyActivity.map((count, i) => (
                      <View key={i} style={{ width: 42, alignItems: "center" }}>
                        <View
                          style={{
                            width: "100%",
                            height: Math.max(6, Math.round((count / maxWeekActivity) * 24)),
                            borderRadius: 999,
                            backgroundColor: count > 0 ? ui.primary : ui.borderSoft,
                          }}
                        />
                        <Text style={{ marginTop: 4, fontSize: 10, color: ui.muted, fontWeight: i === 6 ? "700" : "500" }}>
                          {["W", "T", "F", "S", "S", "M", "T"][i]}
                        </Text>
                      </View>
                    ))}
                  </View>
                </GlassCard>
                </ScreenReveal>

                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontWeight: "700", fontSize: 20, color: ui.text }}>Lessons</Text>
                  <TouchableOpacity onPress={() => setActiveTab("lessons")}>
                    <Text style={{ fontWeight: "700", fontSize: 16, color: ui.primary }}>View All</Text>
                  </TouchableOpacity>
                </View>

                {lessonsOverview.length === 0 ? (
                  <StudentEmptyState
                    icon="book-outline"
                    title="No lessons yet"
                    body="Assigned lessons will show up here as soon as your teacher shares them."
                    actionLabel={testsData.length > 0 ? "Open tests" : "Refresh"}
                    onAction={
                      testsData.length > 0
                        ? () => setActiveTab("tests")
                        : () => {
                            onCatalogPullRefresh().catch(() => {});
                          }
                    }
                  />
                ) : null}

                {lessonsOverview.slice(0, 5).map((lesson, index) => {
                  const pct = lesson.total > 0 ? Math.round((lesson.practiced / lesson.total) * 100) : 0;
                  const fullLesson = lessonsData.find((l) => l.id === lesson.id);
                  return (
                    <ScreenReveal key={lesson.id} delay={130 + index * 28} distance={14} scaleFrom={0.994}>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => fullLesson && openLessonDetail(fullLesson)}>
                      <GlassCard style={{ borderRadius: 16, marginBottom: 10, backgroundColor: ui.card }} padding={12}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          {lesson.cover ? (
                            <RemoteLessonImage
                              uri={cacheBustAssetUrl(lesson.cover, fullLesson?.updated_at, assetRefreshEpoch) ?? lesson.cover}
                              style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: ui.borderSoft }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: 24 }}>📚</Text>
                            </View>
                          )}
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={{ fontWeight: "700", fontSize: 16, lineHeight: 20, color: ui.text }} numberOfLines={2}>{lesson.name}</Text>
                            <View style={{ marginTop: 8, height: 8, borderRadius: 999, backgroundColor: ui.borderSoft, overflow: "hidden" }}>
                              <View style={{ width: `${pct}%`, height: "100%", backgroundColor: ui.primary }} />
                            </View>
                          </View>
                          <View style={{ marginLeft: 10, alignItems: "flex-end" }}>
                            <Text style={{ fontWeight: "800", fontSize: 18, color: ui.primary }}>{pct}%</Text>
                            <Text style={{ color: ui.muted, fontSize: 12 }}>{lesson.practiced}/{lesson.total}</Text>
                          </View>
                        </View>
                      </GlassCard>
                    </TouchableOpacity>
                    </ScreenReveal>
                  );
                })}
              </>
            ) : null}

            {activeTab === "lessons" ? (
              <>
                <GlassCard style={{ borderRadius: 18, marginBottom: 14 }} padding={16} variant="hero">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <IconTile icon="book-outline" size={42} iconSize={22} radius={12} backgroundColor={ui.primarySoft} borderColor={ui.borderStrong} color={ui.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "800", fontSize: 24, color: ui.text }}>Lessons</Text>
                      <Text style={{ color: ui.muted, fontSize: 14, marginTop: 4 }}>Select a lesson to study and practice.</Text>
                    </View>
                  </View>
                </GlassCard>
                {lessonsData.length === 0 ? (
                  <StudentEmptyState
                    icon="book-outline"
                    title="No lessons assigned"
                    body="Your teacher has not assigned a lesson yet. Pull to refresh and check back here soon."
                    actionLabel="Refresh"
                    onAction={() => {
                      onCatalogPullRefresh().catch(() => {});
                    }}
                    secondaryLabel={testsData.length > 0 ? "Open tests" : undefined}
                    onSecondaryAction={testsData.length > 0 ? () => setActiveTab("tests") : undefined}
                  />
                ) : null}
                {lessonsData.map((lesson) => (
                  <GlassCard
                    key={`${lesson.id}-${lesson.updated_at ?? ""}-${assetRefreshEpoch}`}
                    style={{ borderRadius: 16, marginBottom: 10 }}
                    padding={12}
                    variant="strong"
                  >
                    <TouchableOpacity
                      onPress={() => openLessonDetail(lesson)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
                    >
                      {lesson.cover_image_url ? (
                        <RemoteLessonImage
                          uri={cacheBustAssetUrl(lesson.cover_image_url, lesson.updated_at, assetRefreshEpoch) ?? lesson.cover_image_url}
                          style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: ui.borderSoft }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 22 }}>📚</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "700", fontSize: 16, color: ui.text }}>{lesson.name}</Text>
                        <Text style={{ color: ui.muted, fontSize: 13, marginTop: 2 }}>{lesson.words.length} words</Text>
                      </View>
                      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="arrow-forward" size={17} color={ui.primary} />
                      </View>
                    </TouchableOpacity>
                  </GlassCard>
                ))}
              </>
            ) : null}

            {activeTab === "practice" ? (
              <>
                {allWords.length === 0 ? (
                  <StudentEmptyState
                    icon="play-circle-outline"
                    title="Practice opens after your first lesson"
                    body="Once lesson words are assigned, you will be able to use typing, listening, review, and image practice here."
                    actionLabel="Refresh"
                    onAction={() => { onCatalogPullRefresh().catch(() => {}); }}
                    secondaryLabel={lessonsData.length > 0 ? "Open lessons" : undefined}
                    onSecondaryAction={lessonsData.length > 0 ? () => setActiveTab("lessons") : undefined}
                  />
                ) : (
                  <>
                    {/* ── Quick Play Card ── */}
                    <GlassCard style={{ borderRadius: 20, marginBottom: 14 }} padding={16} variant="hero">
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ui.primary, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="play" size={18} color="#fff" />
                        </View>
                        <View>
                          <Text style={{ fontWeight: "900", fontSize: 18, color: ui.text }}>Quick Play</Text>
                          <Text style={{ fontSize: 12, color: ui.muted, marginTop: 1 }}>All lessons · random words</Text>
                        </View>
                      </View>

                      {/* Language selector — only shown when 2+ distinct languages */}
                      {quickPlayLanguageGroups.length >= 2 && (
                        <>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: ui.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Language</Text>
                          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                            {quickPlayLanguageGroups.map((group) => {
                              const active = (quickPlayLanguageKey ?? quickPlayLanguageGroups[0].key) === group.key;
                              return (
                                <TouchableOpacity
                                  key={group.key}
                                  onPress={() => setQuickPlayLanguageKey(group.key)}
                                  activeOpacity={0.85}
                                  style={{
                                    paddingVertical: 8,
                                    paddingHorizontal: 16,
                                    borderRadius: 12,
                                    borderWidth: 1.5,
                                    backgroundColor: active ? ui.primary : ui.card,
                                    borderColor: active ? ui.primary : ui.border,
                                  }}
                                >
                                  <Text style={{ fontSize: 13, fontWeight: "800", color: active ? "#fff" : ui.muted }}>{group.label}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </>
                      )}

                      {/* Direction */}
                      <Text style={{ fontSize: 11, fontWeight: "700", color: ui.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Direction</Text>
                      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                        {(["pt-en", "en-pt"] as StudyDirection[]).map((dir) => {
                          const activeKey = quickPlayLanguageKey ?? quickPlayLanguageGroups[0]?.key;
                          const fwd = quickPlayLanguageGroups.find((g) => g.key === activeKey)?.lesson ?? lessonsData[0];
                          const label = dir === "pt-en"
                            ? labelDirectionForward(fwd?.language_pair, fwd?.language)
                            : labelDirectionReverse(fwd?.language_pair, fwd?.language);
                          const active = quickPlayDirection === dir;
                          return (
                            <TouchableOpacity
                              key={dir}
                              onPress={() => setQuickPlayDirection(dir)}
                              activeOpacity={0.85}
                              style={{
                                flex: 1,
                                paddingVertical: 10,
                                borderRadius: 12,
                                borderWidth: 1.5,
                                alignItems: "center",
                                backgroundColor: active ? ui.primary : ui.card,
                                borderColor: active ? ui.primary : ui.border,
                              }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "800", color: active ? "#fff" : ui.muted }}>{label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Word count slider */}
                      <Text style={{ fontSize: 11, fontWeight: "700", color: ui.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Words</Text>
                      <View style={{ flexDirection: "row", gap: 6, marginBottom: 18 }}>
                        {QUICK_PLAY_COUNTS.map((n) => {
                          const active = quickPlayCount === n;
                          const label = n === 0 ? "All" : String(n);
                          return (
                            <TouchableOpacity
                              key={n}
                              onPress={() => setQuickPlayCount(n)}
                              activeOpacity={0.85}
                              style={{
                                flex: 1,
                                paddingVertical: 9,
                                borderRadius: 10,
                                borderWidth: 1.5,
                                alignItems: "center",
                                backgroundColor: active ? ui.primary : ui.card,
                                borderColor: active ? ui.primary : ui.border,
                              }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "800", color: active ? "#fff" : ui.muted }}>{label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                    </GlassCard>

                    {/* ── Session mode list ── */}
                    <Text style={{ fontSize: 11, color: ui.muted, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700", marginBottom: 10 }}>Study modes</Text>
                    {[
                      { label: "Typing Practice", type: "practice" as StudySessionType, mode: "typing" as StudySessionMode, icon: "⌨️" },
                      { label: "Multiple Choice", type: "practice" as StudySessionType, mode: "multiple-choice" as StudySessionMode, icon: "✅" },
                      { label: "Listening", type: "practice" as StudySessionType, mode: "listening" as StudySessionMode, icon: "🎧" },
                      { label: "Image Mode", type: "practice" as StudySessionType, mode: "image" as StudySessionMode, icon: "🖼️" },
                      { label: "Review Mistakes", type: "review-mistakes" as StudySessionType, mode: "typing" as StudySessionMode, icon: "🧠" },
                      { label: "Smart Review", type: "smart-review" as StudySessionType, mode: "typing" as StudySessionMode, icon: "✨" },
                    ].map((item) => (
                      <GlassCard key={item.label} style={{ borderRadius: 16, marginBottom: 10 }} padding={12} variant="strong">
                        <TouchableOpacity
                          onPress={() => {
                            const pool = quickPlayWords.length ? quickPlayWords : lessonsWords;
                            const words = quickPlayCount === 0
                              ? pool
                              : shuffle(pool).slice(0, quickPlayCount);
                            if (!words.length) { showToast("No words available.", "info"); return; }
                            startSession(item.type, item.mode, quickPlayDirection, words, { id: null, name: "Quick Play" });
                          }}
                          style={{ flexDirection: "row", alignItems: "center" }}
                        >
                          <View style={{ width: 50, height: 50, borderRadius: 12, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                            <Text style={{ fontSize: 22 }}>{item.icon}</Text>
                          </View>
                          <Text style={{ flex: 1, fontWeight: "700", fontSize: 16, color: ui.text }}>{item.label}</Text>
                          <Ionicons name="chevron-forward" size={18} color={ui.primary} />
                        </TouchableOpacity>
                      </GlassCard>
                    ))}
                  </>
                )}
              </>
            ) : null}

            {activeTab === "tests" ? (
              <>
                <GlassCard style={{ borderRadius: 18, marginBottom: 14 }} padding={16} variant="hero">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <IconTile icon="clipboard-outline" size={42} iconSize={22} radius={12} backgroundColor={ui.primarySoft} borderColor={ui.borderStrong} color={ui.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "800", fontSize: 24, color: ui.text }}>Tests</Text>
                      <Text style={{ color: ui.muted, fontSize: 14, marginTop: 4 }}>
                    {testsData.length > 0 ? "Test your knowledge. Select a test or lesson:" : "Test your knowledge without hints. Select a lesson to test:"}
                      </Text>
                    </View>
                  </View>
                </GlassCard>

                {testsData.length === 0 && progress.testHistory.length === 0 ? (
                  <StudentEmptyState
                    icon="clipboard-outline"
                    title="No tests assigned yet"
                    body="When your teacher assigns a test, it will appear here together with your recent scores."
                    actionLabel={lessonsData.length > 0 ? "Open lessons" : "Refresh"}
                    onAction={
                      lessonsData.length > 0
                        ? () => setActiveTab("lessons")
                        : () => {
                            onCatalogPullRefresh().catch(() => {});
                          }
                    }
                  />
                ) : null}

                {testsData.length > 0 ? (
                  <>
                    <Text style={{ fontSize: 11, color: ui.muted, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700", marginBottom: 10 }}>Your tests</Text>
                    {testsData.map((item, index) => (
                      <GlassCard key={`${item.id ?? "test"}-${index}`} style={{ borderRadius: 16, marginBottom: 10 }} padding={12} variant="strong">
                        <TouchableOpacity
                          onPress={() => openTestDetailFromTest(item)}
                          style={{ flexDirection: "row", alignItems: "center" }}
                        >
                          {item.cover_image_url ? (
                            <RemoteLessonImage
                              uri={cacheBustAssetUrl(item.cover_image_url, item.updated_at, assetRefreshEpoch) ?? item.cover_image_url}
                              style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: ui.borderSoft }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: 22 }}>📝</Text>
                            </View>
                          )}
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={{ fontWeight: "700", color: ui.text, fontSize: 15 }}>{item.name}</Text>
                            <Text style={{ fontSize: 12, color: ui.muted, marginTop: 2 }}>{item.words.length} questions</Text>
                          </View>
                          <Ionicons name="arrow-forward" size={18} color={ui.primary} />
                        </TouchableOpacity>
                      </GlassCard>
                    ))}
                  </>
                ) : null}

                {progress.testHistory.length > 0 ? (
                  <>
                    <Text style={{ fontSize: 11, color: ui.muted, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700", marginTop: 10, marginBottom: 10 }}>Test history</Text>
                    {progress.testHistory.slice(0, 5).map((record, index) => (
                      <GlassCard key={`${record.id ?? record.lessonId ?? "history"}-${index}`} style={{ borderRadius: 14, marginBottom: 10 }} padding={12} variant="strong">
                        <TouchableOpacity
                          activeOpacity={0.84}
                          onPress={() => setSelectedHistoryRecord(record)}
                          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                        >
                          <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={{ fontWeight: "600", color: ui.text }} numberOfLines={1}>{record.lessonName || "Lesson test"}</Text>
                            <Text style={{ color: ui.muted, fontSize: 12, marginTop: 2 }}>
                              {record.date ? new Date(record.date).toLocaleDateString() : ""} •{" "}
                              {historyDirectionLabel(record.direction, record.languagePair, record.lessonLanguage)}
                            </Text>
                            <Text style={{ color: ui.primary, fontSize: 11, fontWeight: "700", marginTop: 5 }}>
                              Review questions and answers
                            </Text>
                          </View>
                          <View style={{ alignItems: "flex-end", gap: 8 }}>
                            <View
                              style={{
                                backgroundColor: record.percentage >= 80 ? `${ui.success}20` : record.percentage >= 50 ? `${ui.warning}20` : `${ui.danger}18`,
                                borderRadius: 999,
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                              }}
                            >
                              <Text style={{ fontWeight: "800", color: record.percentage >= 80 ? ui.success : record.percentage >= 50 ? ui.warning : ui.danger }}>
                                {record.percentage}%
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={ui.primary} />
                          </View>
                        </TouchableOpacity>
                      </GlassCard>
                    ))}
                  </>
                ) : null}
              </>
            ) : null}

            {activeTab === "settings" ? (
              <>
                <GlassCard style={{ borderRadius: 18, marginBottom: 14 }} padding={16} variant="hero">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <IconTile icon="settings-outline" size={42} iconSize={22} radius={12} backgroundColor={ui.primarySoft} borderColor={ui.borderStrong} color={ui.primary} />
                    <Text style={{ fontWeight: "800", fontSize: 24, color: ui.text }}>Settings</Text>
                  </View>
                </GlassCard>

                <GlassCard style={{ borderRadius: 16, marginBottom: 12 }} padding={14} variant="strong">
                  <Text style={{ fontSize: 11, color: ui.muted, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700", marginBottom: 10 }}>Profile</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 24 }}>👤</Text>
                    </View>
                    <View>
                      <Text style={{ fontWeight: "700", fontSize: 18, color: ui.text }}>{studentName || "Student"}</Text>
                      <Text style={{ color: ui.muted, fontSize: 13, marginTop: 2 }}>Learning Portuguese</Text>
                    </View>
                  </View>
                </GlassCard>

                <GlassCard style={{ borderRadius: 16, marginBottom: 12 }} padding={14} variant="strong">
                  <Text style={{ fontSize: 11, color: ui.muted, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700", marginBottom: 10 }}>Teacher Information</Text>
                  <Text style={{ fontWeight: "600", color: ui.text }}>{teacherName}</Text>
                  <Text style={{ color: ui.muted, marginTop: 2 }}>Contact your teacher for lesson assignments and progress.</Text>
                </GlassCard>

                <GlassCard style={{ borderRadius: 16, marginBottom: 12 }} padding={14} variant="strong">
                  <Text style={{ fontSize: 11, color: ui.muted, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700", marginBottom: 10 }}>Preferences</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const nextDarkMode = !theme.isDark;
                      theme.setMode(nextDarkMode ? "dark" : "light");
                      applyProgress({
                        ...progress,
                        preferences: { ...progress.preferences, darkMode: nextDarkMode },
                      });
                    }}
                    style={{ borderTopWidth: 1, borderTopColor: ui.borderSoft, paddingTop: 10, paddingBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <View>
                      <Text style={{ fontWeight: "600", color: ui.text }}>Dark Mode</Text>
                      <Text style={{ color: ui.muted, fontSize: 12, marginTop: 3 }}>Use dark color palette across the app</Text>
                    </View>
                    <View style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: theme.isDark ? ui.primary : ui.border, justifyContent: "center", paddingHorizontal: 3 }}>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: "#fff",
                          alignSelf: theme.isDark ? "flex-end" : "flex-start",
                        }}
                      />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      applyProgress({
                        ...progress,
                        preferences: { ...progress.preferences, hapticEnabled: !progress.preferences.hapticEnabled },
                      })
                    }
                    style={{ paddingTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <View>
                      <Text style={{ fontWeight: "600", color: ui.text }}>Haptic Feedback</Text>
                      <Text style={{ color: ui.muted, fontSize: 12, marginTop: 3 }}>Vibrate on interactions</Text>
                    </View>
                    <View style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: progress.preferences.hapticEnabled ? ui.success : ui.border, justifyContent: "center", paddingHorizontal: 3 }}>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: "#fff",
                          alignSelf: progress.preferences.hapticEnabled ? "flex-end" : "flex-start",
                        }}
                      />
                    </View>
                  </TouchableOpacity>
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: ui.muted, fontSize: 12 }}>Current app theme: {theme.isDark ? "Dark" : "Light"}</Text>
                  </View>
                </GlassCard>

                <TouchableOpacity
                  onPress={() => {
                    clearStoredStudentSessionId().catch(() => {});
                    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
                  }}
                  style={{ borderRadius: 14, borderWidth: 1, borderColor: ui.danger, backgroundColor: `${ui.danger}18`, paddingVertical: 14, alignItems: "center", marginBottom: 8 }}
                >
                  <Text style={{ color: ui.danger, fontWeight: "700", fontSize: 15 }}>Log out</Text>
                </TouchableOpacity>
              </>
            ) : null}
            </ScreenReveal>
          </ScrollView>
        </>
      ) : null}

      {runtimeScreen === "lesson-detail" && selectedLessonDetail ? (
        <>
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              backgroundColor: ui.card,
              borderBottomWidth: 1,
              borderBottomColor: ui.border,
              paddingTop: Math.max(insets.top, 8),
              paddingBottom: 10,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <TouchableOpacity
              onPress={() => { setRuntimeScreen("dashboard"); setActiveTab("lessons"); }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: ui.border,
                backgroundColor: ui.card,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <Ionicons name="chevron-back" size={18} color={ui.muted} />
            </TouchableOpacity>
            <Text style={{ flex: 1, fontWeight: "800", fontSize: 18, color: ui.text }}>Lesson</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TouchableOpacity
                activeOpacity={1}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: ui.border,
                  backgroundColor: ui.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="notifications-outline" size={18} color={ui.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setRuntimeScreen("dashboard");
                  setActiveTab("settings");
                }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: ui.border,
                  backgroundColor: ui.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="person-outline" size={18} color={ui.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: Math.max(insets.top, 8) + 62, paddingBottom: 108 }}
            refreshControl={<RefreshControl refreshing={catalogRefreshing} onRefresh={() => onCatalogPullRefresh()} tintColor={ui.primary} colors={[ui.primary]} />}
          >
            <ScreenReveal key={`lesson-detail-${selectedLessonDetail.id}`} delay={18} distance={18} scaleFrom={0.992}>
            <GlassCard style={{ borderRadius: 18, backgroundColor: ui.card, marginBottom: 12 }} padding={14}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {selectedLessonDetail.cover_image_url ? (
                  <RemoteLessonImage
                    uri={
                      cacheBustAssetUrl(selectedLessonDetail.cover_image_url, selectedLessonDetail.updated_at, assetRefreshEpoch) ??
                      selectedLessonDetail.cover_image_url
                    }
                    style={{ width: 66, height: 66, borderRadius: 14, backgroundColor: ui.borderSoft }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ width: 66, height: 66, borderRadius: 14, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 24 }}>📚</Text>
                  </View>
                )}
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ color: ui.text, fontWeight: "800", fontSize: 24 }}>{selectedLessonDetail.name}</Text>
                  <Text style={{ color: ui.muted, marginTop: 4, fontSize: 14 }}>{selectedLessonDetail.words.length} words</Text>
                </View>
              </View>
            </GlassCard>

            {selectedLessonDetail.document_url ? (
              <GlassCard style={{ borderRadius: 18, backgroundColor: ui.card, marginBottom: 12 }} padding={14} variant="strong">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 16,
                      backgroundColor: ui.primarySoft,
                      borderWidth: 1,
                      borderColor: ui.borderStrong,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="document-text-outline" size={24} color={ui.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 }}>LESSON PDF</Text>
                    <Text style={{ color: ui.text, fontWeight: "800", fontSize: 16, marginTop: 4 }} numberOfLines={1}>
                      {selectedLessonDetail.document_name || `${selectedLessonDetail.name} PDF`}
                    </Text>
                    <Text style={{ color: ui.muted, fontSize: 13, marginTop: 4 }} numberOfLines={2}>
                      Open the teacher's attached PDF for lesson notes and extra study material.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={openLessonDocument}
                  activeOpacity={0.85}
                  style={{
                    marginTop: 14,
                    borderRadius: 14,
                    backgroundColor: ui.primary,
                    paddingHorizontal: 16,
                    paddingVertical: 13,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="document-attach-outline" size={18} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>View Lesson PDF</Text>
                </TouchableOpacity>
              </GlassCard>
            ) : null}

            {/*
            {false && selectedLessonDetail?.document_url ? (
              <GlassCard style={{ borderRadius: 16, backgroundColor: ui.card, marginBottom: 12 }} padding={12}>
                <TouchableOpacity
                  onPress={() => Linking.openURL(selectedLessonDetail?.document_url ?? "").catch(() => {})}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                >
                  <Text style={{ color: ui.primary, fontWeight: "700", fontSize: 16 }} numberOfLines={1}>
                    📄 {selectedLessonDetail.document_name || "Lesson document"}
                  </Text>
                  <Text style={{ color: ui.primary, fontSize: 20 }}>→</Text>
                </TouchableOpacity>
              </GlassCard>
            ) : null}
            */}

            {savedResume && savedResume.lessonId === selectedLessonDetail?.id ? (
              <TouchableOpacity onPress={resumeSession} activeOpacity={0.85} style={{ marginBottom: 14 }}>
                <GlassCard style={{ borderRadius: 16, backgroundColor: ui.primarySoft, borderWidth: 1, borderColor: ui.primary }} padding={14}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: ui.primary, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="play" size={20} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: ui.primary, letterSpacing: 1, marginBottom: 2 }}>CONTINUE WHERE YOU LEFT OFF</Text>
                      <Text style={{ fontSize: 15, fontWeight: "800", color: ui.text }}>Word {savedResume.idx + 1} of {savedResume.activeWords.length}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={ui.primary} />
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ) : null}

            <GlassCard style={{ borderRadius: 18, backgroundColor: ui.card, marginBottom: 14 }} padding={12}>
              <Text style={{ color: ui.text, textAlign: "center", fontWeight: "600", marginBottom: 10 }}>Choose how you want to study</Text>
              <View style={{ flexDirection: "row", borderWidth: 1, borderColor: ui.border, borderRadius: 12, padding: 4, marginBottom: 12 }}>
                {[
                  { key: "typing" as StudySessionMode, label: "Typing" },
                  { key: "multiple-choice" as StudySessionMode, label: "Choice" },
                  { key: "listening" as StudySessionMode, label: "Listen" },
                  { key: "image" as StudySessionMode, label: "Images" },
                ].map((mode) => {
                  const selected = lessonDetailMode === mode.key;
                  return (
                    <TouchableOpacity
                      key={mode.key}
                      onPress={() => {
                        setLessonDetailMode(mode.key);
                        if (selectedLessonDetail) {
                          AsyncStorage.setItem(`eluency_lesson_mode_${selectedLessonDetail.id}`, mode.key).catch(() => {});
                        }
                      }}
                      style={{ flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", backgroundColor: selected ? ui.primarySoft : "transparent" }}
                    >
                      <Text style={{ fontWeight: "700", color: selected ? ui.primary : ui.muted, fontSize: 13 }}>{mode.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ color: ui.text, textAlign: "center", fontWeight: "600", marginBottom: 10 }}>Choose a direction to begin the lesson</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() =>
                    startSession("practice", lessonDetailMode, "pt-en", selectedLessonWords, {
                      id: selectedLessonDetail.id,
                      name: selectedLessonDetail.name,
                    })
                  }
                  style={{ flex: 1, borderRadius: 10, backgroundColor: ui.primary, paddingVertical: 10, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                    {labelDirectionForward(selectedLessonDetail.language_pair, selectedLessonDetail.language)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    startSession("practice", lessonDetailMode, "en-pt", selectedLessonWords, {
                      id: selectedLessonDetail.id,
                      name: selectedLessonDetail.name,
                    })
                  }
                  style={{ flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: ui.primary, backgroundColor: ui.card, paddingVertical: 10, alignItems: "center" }}
                >
                  <Text style={{ color: ui.primary, fontWeight: "700", fontSize: 14 }}>
                    {labelDirectionReverse(selectedLessonDetail.language_pair, selectedLessonDetail.language)}
                  </Text>
                </TouchableOpacity>
              </View>
            </GlassCard>

            <Text style={{ color: ui.muted, fontSize: 14, fontWeight: "800", marginBottom: 8 }}>LESSON CONTENT ({selectedLessonDetail.words.length})</Text>
            {selectedLessonDetail.words.map((word, index) => {
              if (word.rowType === "conjugation") {
                return (
                  <GlassCard key={`${selectedLessonDetail.id}-word-${index}`} style={{ borderRadius: 16, backgroundColor: ui.card, marginBottom: 10 }} padding={12}>
                    <Text style={{ color: ui.primary, fontWeight: "800", fontSize: 11, letterSpacing: 0.6, marginBottom: 6 }}>CONJUGATION</Text>
                    <Text style={{ color: ui.text, fontWeight: "800", fontSize: 18 }}>{word.infinitive?.trim() || "—"}</Text>
                    {(word.conjugations ?? []).map((c, ci) => (
                      <View key={`conj-${selectedLessonDetail.id}-${index}-${ci}`} style={{ flexDirection: "row", marginTop: 10, gap: 10, alignItems: "flex-start" }}>
                        <Text style={{ color: ui.muted, fontSize: 13, fontWeight: "700", width: 118 }}>{c.pronoun || "—"}</Text>
                        <Text style={{ color: ui.text, fontSize: 15, flex: 1 }}>{(c.form_a || c.form_b || "").trim() || "—"}</Text>
                      </View>
                    ))}
                  </GlassCard>
                );
              }
              if (word.rowType === "preposition") {
                return (
                  <GlassCard key={`${selectedLessonDetail.id}-word-${index}`} style={{ borderRadius: 16, backgroundColor: ui.card, marginBottom: 10 }} padding={12}>
                    <Text style={{ color: ui.primary, fontWeight: "800", fontSize: 11, letterSpacing: 0.6, marginBottom: 6 }}>PREPOSITION</Text>
                    <Text style={{ color: ui.text, fontWeight: "700", fontSize: 16, marginBottom: 8 }}>{word.prepositionTitle?.trim() || "—"}</Text>
                    {(word.prepositions ?? []).map((p, pi) => (
                      <Text key={`prep-${selectedLessonDetail.id}-${index}-${pi}`} style={{ color: ui.text, fontSize: 14, marginTop: 4 }}>
                        {String(p.left ?? "").trim()} + {String(p.right ?? "").trim()} → {String(p.answer ?? "").trim()}
                      </Text>
                    ))}
                  </GlassCard>
                );
              }
              const row = lessonListRowTerms(word, selectedLessonDetail.language_pair);
              return (
                <GlassCard key={`${selectedLessonDetail.id}-word-${index}`} style={{ borderRadius: 16, backgroundColor: ui.card, marginBottom: 10 }} padding={12}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {(word.image_url || word.img) ? (
                      <RemoteLessonImage
                        uri={
                          cacheBustAssetUrl(word.image_url || word.img, selectedLessonDetail.updated_at, assetRefreshEpoch) ??
                          (word.image_url || word.img || "")
                        }
                        style={{ width: 54, height: 54, borderRadius: 10, backgroundColor: ui.borderSoft }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{ width: 54, height: 54, borderRadius: 10, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 20 }}>📘</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ flex: 1, color: ui.text, fontWeight: "800", fontSize: 18 }}>
                          {lessonDetailDisplayMeta.shortA}  {row.termA || "-"}
                        </Text>
                        <TouchableOpacity
                          onPress={() => playStudyTextAudio(row.termA || "", "a").catch(() => {})}
                          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}
                        >
                          <Ionicons name="volume-medium-outline" size={15} color={ui.primary} />
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                        <Text style={{ flex: 1, color: ui.muted, fontSize: 16 }}>
                          {lessonDetailDisplayMeta.shortB}  {row.termB || "-"}
                        </Text>
                        <TouchableOpacity
                          onPress={() => playStudyTextAudio(row.termB || "", "b").catch(() => {})}
                          style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}
                        >
                          <Ionicons name="volume-medium-outline" size={15} color={ui.muted} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  {(row.ctxA || row.ctxB) ? (
                    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: ui.borderSoft, paddingTop: 10 }}>
                      {row.ctxA ? (
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                          <Text style={{ flex: 1, color: ui.text, fontSize: 14 }}>
                            {lessonDetailDisplayMeta.shortA}  {row.ctxA}
                          </Text>
                          <TouchableOpacity
                            onPress={() => playStudyTextAudio(row.ctxA || "", "a").catch(() => {})}
                            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}
                          >
                            <Ionicons name="volume-medium-outline" size={14} color={ui.primary} />
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      {row.ctxB ? (
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                          <Text style={{ flex: 1, color: ui.muted, fontSize: 14 }}>
                            {lessonDetailDisplayMeta.shortB}  {row.ctxB}
                          </Text>
                          <TouchableOpacity
                            onPress={() => playStudyTextAudio(row.ctxB || "", "b").catch(() => {})}
                            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}
                          >
                            <Ionicons name="volume-medium-outline" size={14} color={ui.muted} />
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </GlassCard>
              );
            })}
            </ScreenReveal>
          </ScrollView>
        </>
      ) : null}

      {runtimeScreen === "test-detail" && selectedTestDetail ? (
        <>
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              backgroundColor: ui.card,
              borderBottomWidth: 1,
              borderBottomColor: ui.border,
              paddingTop: Math.max(insets.top, 8),
              paddingBottom: 10,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <TouchableOpacity
              onPress={() => { setRuntimeScreen("dashboard"); setActiveTab("tests"); }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: ui.border,
                backgroundColor: ui.card,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <Ionicons name="chevron-back" size={18} color={ui.muted} />
            </TouchableOpacity>
            <Text style={{ flex: 1, fontWeight: "800", fontSize: 18, color: ui.text }}>Test</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TouchableOpacity
                activeOpacity={1}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: ui.border,
                  backgroundColor: ui.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="notifications-outline" size={18} color={ui.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setRuntimeScreen("dashboard");
                  setActiveTab("settings");
                }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: ui.border,
                  backgroundColor: ui.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="person-outline" size={18} color={ui.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: Math.max(insets.top, 8) + 62, paddingBottom: 108 }}
            refreshControl={<RefreshControl refreshing={catalogRefreshing} onRefresh={() => onCatalogPullRefresh()} tintColor={ui.primary} colors={[ui.primary]} />}
          >
            <ScreenReveal
              key={`test-detail-${selectedTestDetail.type}-${selectedTestDetail.type === "test" ? selectedTestDetail.test.id : selectedTestDetail.lesson.id}`}
              delay={18}
              distance={18}
              scaleFrom={0.992}
            >
            <GlassCard style={{ borderRadius: 18, backgroundColor: ui.card, marginBottom: 12 }} padding={14}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {selectedTestDetail.type === "test" && selectedTestDetail.test.cover_image_url ? (
                  <RemoteLessonImage
                    uri={
                      cacheBustAssetUrl(selectedTestDetail.test.cover_image_url, selectedTestDetail.test.updated_at, assetRefreshEpoch) ??
                      selectedTestDetail.test.cover_image_url
                    }
                    style={{ width: 66, height: 66, borderRadius: 14, backgroundColor: ui.borderSoft }}
                    resizeMode="cover"
                  />
                ) : selectedTestDetail.type === "lesson" && selectedTestDetail.lesson.cover_image_url ? (
                  <RemoteLessonImage
                    uri={
                      cacheBustAssetUrl(selectedTestDetail.lesson.cover_image_url, selectedTestDetail.lesson.updated_at, assetRefreshEpoch) ??
                      selectedTestDetail.lesson.cover_image_url
                    }
                    style={{ width: 66, height: 66, borderRadius: 14, backgroundColor: ui.borderSoft }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ width: 66, height: 66, borderRadius: 14, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 24 }}>📝</Text>
                  </View>
                )}
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ color: ui.text, fontWeight: "800", fontSize: 24 }}>
                    {selectedTestDetail.type === "test" ? selectedTestDetail.test.name : selectedTestDetail.lesson.name}
                  </Text>
                  <Text style={{ color: ui.muted, marginTop: 4, fontSize: 14 }}>
                    {selectedTestDetail.type === "test"
                      ? `${selectedTestDetail.test.words.length} questions • No hints`
                      : `${selectedTestDetail.lesson.words.length} words • No hints`}
                  </Text>
                </View>
              </View>
            </GlassCard>

            <GlassCard style={{ borderRadius: 16, backgroundColor: ui.card, marginBottom: 14 }} padding={12}>
              <TouchableOpacity
                onPress={() => {
                  if (selectedTestDetail.type === "test") {
                    const testWords = normalizeTestsToWords([selectedTestDetail.test], assetRefreshEpoch).filter((word) => word.sourceType === "test");
                    startSession("test", "typing", "en-pt", testWords, {
                      id: selectedTestDetail.test.id,
                      name: selectedTestDetail.test.name,
                    });
                    return;
                  }
                  startSession(
                    "test",
                    "typing",
                    "en-pt",
                    lessonsWords.filter((word) => word.lessonId === selectedTestDetail.lesson.id),
                    { id: selectedTestDetail.lesson.id, name: selectedTestDetail.lesson.name }
                  );
                }}
                style={{ borderRadius: 14, backgroundColor: ui.primary, paddingVertical: 14, alignItems: "center" }}
              >
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 20 }}>Begin Test</Text>
              </TouchableOpacity>
            </GlassCard>

            <Text style={{ color: ui.muted, fontSize: 14, fontWeight: "800", marginBottom: 8 }}>
              STUDY MATERIAL (
              {selectedTestDetail.type === "test"
                ? (selectedTestDetail.test.reviewVocabulary?.length ?? 0)
                : selectedTestDetail.lesson.words.length}
              )
            </Text>
            {(selectedTestDetail.type === "test"
              ? ((selectedTestDetail.test.reviewVocabulary ?? []) as any[])
              : (selectedTestDetail.lesson.words as any[])
            ).map((word, index) => (
              <GlassCard key={`study-${index}`} style={{ borderRadius: 16, backgroundColor: ui.card, marginBottom: 10 }} padding={12}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {(word.image_url || word.img) ? (
                    <RemoteLessonImage
                      uri={
                        cacheBustAssetUrl(
                          word.image_url || word.img,
                          selectedTestDetail.type === "test" ? selectedTestDetail.test.updated_at : selectedTestDetail.lesson.updated_at,
                          assetRefreshEpoch
                        ) ?? (word.image_url || word.img || "")
                      }
                      style={{ width: 54, height: 54, borderRadius: 10, backgroundColor: ui.borderSoft }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{ width: 54, height: 54, borderRadius: 10, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 20 }}>📘</Text>
                    </View>
                  )}
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={{ color: ui.text, fontWeight: "800", fontSize: 20 }}>
                              {testDetailDisplayMeta.shortA}  {word.pt || "-"}
                            </Text>
                            <Text style={{ color: ui.muted, fontSize: 18, marginTop: 2 }}>
                              {testDetailDisplayMeta.shortB}  {word.en || "-"}
                            </Text>
                          </View>
                        </View>
                        {(word.sp || word.se) ? (
                          <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: ui.borderSoft, paddingTop: 10 }}>
                            {word.sp ? (
                              <Text style={{ color: ui.text, fontSize: 14, marginBottom: 4 }}>
                                {testDetailDisplayMeta.shortA}  {word.sp}
                              </Text>
                            ) : null}
                            {word.se ? (
                              <Text style={{ color: ui.muted, fontSize: 14 }}>
                                {testDetailDisplayMeta.shortB}  {word.se}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                      </GlassCard>
                    ))}
            </ScreenReveal>
          </ScrollView>
        </>
      ) : null}

      {runtimeScreen === "session" && current ? (
        <View style={{ flex: 1 }}>
          {/* Fixed top bar — stays in place when keyboard opens */}
          <View
            style={{
              paddingTop: Math.max(insets.top, 5),
              paddingBottom: 5,
              paddingHorizontal: 12,
              borderBottomWidth: 1,
              borderBottomColor: ui.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  "Exit Session?",
                  "Your progress in this session will be lost.",
                  [
                    { text: "Keep Going", style: "cancel" },
                    {
                      text: "Exit",
                      style: "destructive",
                      onPress: () => {
                        if (sessionType === "test" && selectedTestDetail) {
                          setRuntimeScreen("test-detail");
                        } else if (selectedLessonDetail) {
                          saveResumeData();
                          setRuntimeScreen("lesson-detail");
                        } else if (selectedTestDetail) {
                          setRuntimeScreen("test-detail");
                        } else {
                          setRuntimeScreen("dashboard");
                        }
                      },
                    },
                  ]
                )
              }
              style={{
                width: 31,
                height: 31,
                borderRadius: 9,
                borderWidth: 1,
                borderColor: ui.border,
                backgroundColor: ui.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={14} color={ui.muted} />
            </TouchableOpacity>

            <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 10 }}>
              <Text
                style={{ color: ui.text, fontSize: 14, fontWeight: "800", textAlign: "center" }}
                numberOfLines={1}
              >
                {current.lessonName || current.testName || "Session"}
              </Text>
              <Text style={{ color: ui.muted, fontSize: 10, fontWeight: "700", letterSpacing: 1.2, marginTop: 1 }}>
                {sessionHeaderLabel.toUpperCase()}
              </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {sessionStreak >= 2 ? (
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "#FFF0DA", borderWidth: 1, borderColor: "#F5C070" }}>
                  <Text style={{ fontSize: 12 }}>🔥</Text>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: "#E07A10", marginLeft: 2 }}>{sessionStreak}</Text>
                </View>
              ) : null}
              <View style={{ width: 44, height: 44 }}>
                <Svg width={44} height={44} style={{ position: "absolute" }}>
                  <Circle cx={22} cy={22} r={17} stroke={ui.borderSoft} strokeWidth={3} fill="none" />
                  <Circle
                    cx={22} cy={22} r={17}
                    stroke={ui.primary}
                    strokeWidth={3}
                    fill="none"
                    strokeDasharray={`${(2 * Math.PI * 17).toFixed(2)}`}
                    strokeDashoffset={`${(2 * Math.PI * 17 * (1 - Math.min(idx + 1, activeWords.length) / Math.max(activeWords.length, 1))).toFixed(2)}`}
                    strokeLinecap="round"
                    rotation="-90"
                    origin="22,22"
                  />
                </Svg>
                <View style={{ position: "absolute", width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 9, fontWeight: "900", color: ui.primary }}>{idx + 1}/{activeWords.length}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Keyboard-aware content area */}
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            {/* Scrollable question card */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              <ScreenReveal key={`session-${sessionType}-${sessionMode}-${sessionContext.id ?? "general"}`} delay={14} distance={16} scaleFrom={0.994}>
              <GlassCard style={{ borderRadius: 22, backgroundColor: ui.card }} padding={14}>
                {current.imageUrl && !showSessionIllustration ? (
                  <View style={{ alignSelf: "center", marginBottom: 10 }}>
                    <RemoteLessonImage uri={current.imageUrl} style={{ width: 88, height: 88, borderRadius: 16 }} resizeMode="cover" />
                  </View>
                ) : null}
                {(sessionMode !== "listening" || current.imageUrl) && showSessionIllustration ? (
                  <View style={{ alignItems: "center", marginBottom: 10 }}>
                    <View
                      style={{
                        width: sessionMode === "image" || !!current.imageUrl ? 198 : 135,
                        height: sessionMode === "image" || !!current.imageUrl ? 198 : 135,
                        borderRadius: sessionMode === "image" || !!current.imageUrl ? 25 : 20,
                        backgroundColor: ui.borderSoft,
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {current.imageUrl ? (
                        <RemoteLessonImage uri={current.imageUrl} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                      ) : (
                        <Text style={{ fontSize: sessionMode === "image" || !!current.imageUrl ? 54 : 43 }}>
                          {current.sourceType === "test" ? "📝" : "📚"}
                        </Text>
                      )}
                    </View>
                  </View>
                ) : null}

                {isConjugationTable && current.conjugationTable ? (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 14, paddingHorizontal: 4 }}>
                      <Text
                        style={{
                          flexShrink: 1,
                          fontSize: 32,
                          color: ui.text,
                          fontWeight: "900",
                          lineHeight: 38,
                          textAlign: "center",
                        }}
                      >
                        {titleCaseVerb(current.conjugationTable.infinitive)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => playPromptAudio().catch(() => {})}
                        disabled={ttsLoading}
                        style={{
                          marginLeft: 8,
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          backgroundColor: ui.borderSoft,
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Ionicons name="volume-medium-outline" size={16} color={ui.muted} />
                      </TouchableOpacity>
                    </View>
                    <View style={{ gap: 10 }}>
                      {current.conjugationTable.entries.map((entry, ri) => {
                        const fb = conjugationRowFeedback[ri];
                        const highlight =
                          conjugationRowFeedback.length > 0 ? (fb === true ? ui.success : fb === false ? ui.danger : ui.border) : ui.border;
                        return (
                          <View key={`${entry.pronoun}-${ri}`} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <Text style={{ width: 108, color: ui.text, fontWeight: "800", fontSize: 13 }} numberOfLines={2}>
                              {entry.pronoun.toUpperCase()}
                            </Text>
                            <TextInput
                              value={conjugationInputs[ri] ?? ""}
                              onChangeText={(t) => {
                                setConjugationInputs((prev) => {
                                  const next = [...prev];
                                  next[ri] = t;
                                  return next;
                                });
                              }}
                              placeholder="…"
                              placeholderTextColor="#98A0B2"
                              autoCapitalize="none"
                              editable={conjugationRowFeedback.length === 0}
                              style={{
                                flex: 1,
                                borderWidth: 1,
                                borderColor: highlight,
                                borderRadius: 10,
                                backgroundColor: ui.borderSoft,
                                color: ui.text,
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                fontSize: 15,
                              }}
                            />
                          </View>
                        );
                      })}
                    </View>
                    <TouchableOpacity
                      onPress={() => submitConjugationTable().catch(() => {})}
                      disabled={conjugationRowFeedback.length > 0}
                      style={{
                        marginTop: 16,
                        borderRadius: 12,
                        backgroundColor: ui.primary,
                        paddingVertical: 14,
                        alignItems: "center",
                        flexDirection: "row",
                        justifyContent: "center",
                        gap: 8,
                        opacity: conjugationRowFeedback.length > 0 ? 0.55 : 1,
                      }}
                    >
                      <Ionicons name="return-down-forward-outline" size={18} color="#fff" />
                      <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>Submit</Text>
                    </TouchableOpacity>
                  </>
                ) : isConjugationDrill ? (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 12, paddingHorizontal: 4 }}>
                      <Text
                        style={{
                          flexShrink: 1,
                          fontSize: 32,
                          color: ui.text,
                          fontWeight: "900",
                          lineHeight: 38,
                          textAlign: "center",
                        }}
                      >
                        {titleCaseVerb(current.conjugationInfinitive || prompt || "—")}
                      </Text>
                      <TouchableOpacity
                        onPress={() => playPromptAudio().catch(() => {})}
                        disabled={ttsLoading}
                        style={{
                          marginLeft: 8,
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          backgroundColor: ui.borderSoft,
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Ionicons name="volume-medium-outline" size={16} color={ui.muted} />
                      </TouchableOpacity>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        marginBottom: 6,
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      <Text style={{ color: ui.primary, fontWeight: "900", fontSize: 22 }}>
                        {(current.conjugationPronoun ?? "").toUpperCase()}
                      </Text>
                      <View
                        style={{
                          minWidth: 140,
                          height: 3,
                          backgroundColor: ui.text,
                          marginBottom: 5,
                          borderRadius: 2,
                        }}
                      />
                    </View>
                  </>
                ) : (
                  <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 10, paddingHorizontal: 4 }}>
                    <Text
                      style={{
                        flexShrink: 1,
                        fontSize: 30,
                        color: ui.text,
                        fontWeight: "900",
                        lineHeight: 36,
                        textAlign: "center",
                      }}
                    >
                      {sessionMode === "listening" ? "Tap to listen" : prompt}
                    </Text>
                    <TouchableOpacity
                      onPress={() => playPromptAudio().catch(() => {})}
                      disabled={ttsLoading}
                      style={{ marginLeft: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: ui.borderSoft, alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                    >
                      <Ionicons name="volume-medium-outline" size={16} color={ui.muted} />
                    </TouchableOpacity>
                  </View>
                )}

                {sessionType !== "test" && !isConjugationTable && !isConjugationDrill ? (
                  <TouchableOpacity
                    onPress={() => setShowHint((v) => !v)}
                    style={{ borderRadius: 10, borderWidth: 1, borderColor: ui.border, backgroundColor: ui.card, paddingVertical: 11, alignItems: "center" }}
                  >
                    <Text style={{ color: ui.muted, fontWeight: "600", fontSize: 13 }}>💡 {showHint ? "Hide Hint" : "Show Hint"}</Text>
                  </TouchableOpacity>
                ) : null}

                {showHint && sentenceHint ? (
                  <View style={{ marginTop: 10, borderRadius: 10, backgroundColor: ui.primarySoft, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Text style={{ flex: 1, color: ui.text, fontSize: 13 }}>{sentenceHint}</Text>
                    <TouchableOpacity
                      onPress={() => playStudyTextAudio(sentenceHint, direction === "pt-en" ? "b" : "a").catch(() => {})}
                      style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ui.card, alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="volume-medium-outline" size={14} color={ui.primary} />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Same flow as typing/listening: prompt (+ hint) first, then answer area — MCQ options stay high in the card. */}
                {showMcq ? (
                  <View style={{ gap: 8, marginTop: sessionType === "test" ? 12 : showHint && sentenceHint ? 12 : isConjugationDrill ? 14 : 10 }}>
                    {mcqChoiceOptions && mcqChoiceOptions.length >= 2
                      ? mcqChoiceOptions.map((opt) => (
                          <TouchableOpacity
                            key={opt.id}
                            onPress={() => handleMcqPick(opt.text, opt.id)}
                            disabled={!!feedback}
                            activeOpacity={0.85}
                            style={{
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: ui.border,
                              backgroundColor: ui.card,
                              paddingVertical: 14,
                              paddingHorizontal: 14,
                            }}
                          >
                            <Text style={{ color: ui.text, fontWeight: "700", fontSize: 16, textAlign: isConjugationDrill ? "left" : "center" }}>{opt.text}</Text>
                          </TouchableOpacity>
                        ))
                      : mcqChoiceTexts.length >= 2
                        ? mcqChoiceTexts.map((choice, ci) => (
                            <TouchableOpacity
                              key={`${choice}-${ci}`}
                              onPress={() => handleMcqPick(choice)}
                              disabled={!!feedback}
                              activeOpacity={0.85}
                              style={{
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: ui.border,
                                backgroundColor: ui.card,
                                paddingVertical: 14,
                                paddingHorizontal: 14,
                              }}
                            >
                              <Text style={{ color: ui.text, fontWeight: "700", fontSize: 16, textAlign: isConjugationDrill ? "left" : "center" }}>{choice}</Text>
                            </TouchableOpacity>
                          ))
                        : (
                          <Text style={{ color: ui.muted, textAlign: "center", fontSize: 14 }}>Preparing choices…</Text>
                        )}
                  </View>
                ) : null}

                {showMcq && feedback ? (
                  <View
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: feedback.state === "correct" ? ui.success : feedback.state === "close" ? ui.warning : ui.danger,
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: "700",
                        fontSize: 13,
                        color: feedback.state === "correct" ? ui.success : feedback.state === "close" ? ui.warning : ui.danger,
                      }}
                    >
                      {feedback.text}
                    </Text>
                  </View>
                ) : null}

                {showInfinitiveNote ? (
                  <View style={{ marginTop: 10, borderRadius: 10, backgroundColor: ui.primarySoft, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Text style={{ flex: 1, color: ui.text, fontSize: 13 }}>Infinitives in English often use to + verb.</Text>
                    <TouchableOpacity
                      onPress={() => playStudyTextAudio("Infinitives in English often use to plus verb.", "b").catch(() => {})}
                      style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ui.card, alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="volume-medium-outline" size={14} color={ui.primary} />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {geminiCorrection ? (
                  <View style={{ marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: ui.border, backgroundColor: ui.card, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Text style={{ flex: 1, color: ui.text, fontSize: 13 }}>{geminiCorrection}</Text>
                    <TouchableOpacity
                      onPress={() => playStudyTextAudio(geminiCorrection, "b").catch(() => {})}
                      style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="volume-medium-outline" size={14} color={ui.primary} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </GlassCard>
              </ScreenReveal>
            </ScrollView>

            {/* Pinned bottom: input + feedback + submit/skip + progress — always visible above keyboard */}
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 2,
                paddingBottom: Math.max(insets.bottom, 1),
                borderTopWidth: 1,
                borderTopColor: ui.border,
                backgroundColor: ui.bg,
                gap: 5,
              }}
            >
              {!showMcq && !isConjugationTable ? (
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder={needsRetype ? "Type the exact answer..." : "Type your answer..."}
                  placeholderTextColor="#98A0B2"
                  style={{
                    borderWidth: 1,
                    borderColor: ui.border,
                    borderRadius: 10,
                    backgroundColor: ui.card,
                    color: ui.text,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    fontSize: 15,
                  }}
                />
              ) : null}

              {feedback && !showMcq ? (
                <View style={{ padding: 8, borderRadius: 8, borderWidth: 1, borderColor: feedback.state === "correct" ? ui.success : feedback.state === "close" ? ui.warning : ui.danger }}>
                  <Text style={{ fontWeight: "700", fontSize: 13, color: feedback.state === "correct" ? ui.success : feedback.state === "close" ? ui.warning : ui.danger }}>
                    {feedback.text}
                  </Text>
                </View>
              ) : null}

              <View style={{ flexDirection: "row", gap: 8 }}>
                {!showMcq && !isConjugationTable ? (
                  <TouchableOpacity
                    onPress={() => answerCurrent().catch(() => {})}
                    style={{ flex: 1, borderRadius: 12, backgroundColor: ui.primary, paddingVertical: 10, alignItems: "center" }}
                  >
                    <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>Submit ↵</Text>
                  </TouchableOpacity>
                ) : null}
                {sessionMode !== "listening" || sessionType === "test" ? (
                  <TouchableOpacity
                    onPress={() => {
                      applyProgress({ ...progress, wordStats: updateWordStats(progress.wordStats, current.id, false) });
                      triggerHaptic("error").catch(() => {});
                      setMistakeWordIds((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]));
                      setFeedback({ state: "wrong", text: `Expected: ${feedbackExpected}` });
                      recordSessionIssue({ id: current.id, prompt, expected: feedbackExpected, kind: "skip" });
                      if (sessionType === "test" || current.practiceKind === "conjugation-table") {
                        setTimeout(() => {
                          setFeedback(null);
                          setInput("");
                          setShowHint(false);
                          setNeedsRetype(false);
                          setShowInfinitiveNote(false);
                          setGeminiCorrection("");
                          setConjugationRowFeedback([]);
                          if (idx + 1 >= activeWords.length) finishSession().catch(() => {});
                          else setIdx((v) => v + 1);
                        }, 2000);
                        return;
                      }
                      setNeedsRetype(true);
                      setInput("");
                    }}
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: ui.border,
                      backgroundColor: ui.card,
                      paddingHorizontal: 14,
                      justifyContent: "center",
                      alignItems: "center",
                      flex: showMcq || isConjugationTable ? 1 : undefined,
                    }}
                  >
                    <Text style={{ color: ui.muted, fontWeight: "600", fontSize: 14 }}>Skip</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

            </View>
          </KeyboardAvoidingView>
        </View>
      ) : null}

      {(runtimeScreen === "dashboard" || runtimeScreen === "lesson-detail" || runtimeScreen === "test-detail") ? (() => {
        const effectiveTab =
          runtimeScreen === "lesson-detail" ? "lessons" :
          runtimeScreen === "test-detail" ? "tests" :
          activeTab;

        const handleTabPress = (tabId: string) => {
          setActiveTab(tabId as BottomTab);
          setRuntimeScreen("dashboard");
        };

        const tabs = [
          { id: "home", icon: "home-outline", activeIcon: "home", label: "Home" },
          { id: "lessons", icon: "book-outline", activeIcon: "book", label: "Lessons" },
          { id: "__play__", icon: "play", label: "" },
          { id: "tests", icon: "clipboard-outline", activeIcon: "clipboard", label: "Tests" },
          { id: "settings", icon: "settings-outline", activeIcon: "settings", label: "Settings" },
        ];

        return (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              overflow: "hidden",
              backgroundColor: uiIsDark ? theme.colors.background : theme.colors.surface,
              borderWidth: 1,
              borderColor: ui.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-around",
              paddingTop: 8,
              paddingBottom: 8,
              paddingHorizontal: 10,
              shadowColor: "#000",
              shadowOpacity: uiIsDark ? 0.18 : 0.1,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 8,
            }}
          >
              {tabs.map((tab) => {
                if (tab.id === "__play__") {
                  return (
                    <TouchableOpacity
                      key="play"
                      onPress={() => handleTabPress("practice")}
                      activeOpacity={0.85}
                      style={{
                        width: 64,
                        height: 58,
                        borderRadius: 22,
                        backgroundColor: ui.primary,
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 10,
                        shadowColor: ui.primary,
                        shadowOpacity: 0.28,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 5 },
                        elevation: 8,
                        borderWidth: 3,
                        borderColor: uiIsDark ? theme.colors.background : theme.colors.surface,
                      }}
                    >
                      <Ionicons name="play" size={31} color="#fff" style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  );
                }

                const active = effectiveTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    onPress={() => handleTabPress(tab.id)}
                    activeOpacity={0.75}
                    style={{
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 72,
                      paddingTop: 2,
                      paddingBottom: 2,
                      paddingHorizontal: 6,
                      borderRadius: 18,
                      backgroundColor: "transparent",
                    }}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 34,
                        borderRadius: 14,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: active ? ui.primarySoft : "transparent",
                        borderWidth: active ? 1 : 0,
                        borderColor: active ? `${ui.primary}22` : "transparent",
                      }}
                    >
                      <Ionicons
                        name={(active ? tab.activeIcon : tab.icon) as any}
                        size={24}
                        color={active ? ui.primary : ui.muted}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 10.5,
                        marginTop: 5,
                        color: active ? ui.primary : ui.muted,
                        fontWeight: active ? "800" : "600",
                        letterSpacing: 0.1,
                      }}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
          </View>
        );
      })() : null}

      <Modal
        visible={runtimeScreen === "results" && !!resultRecord}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setRuntimeScreen("dashboard");
          setActiveTab("home");
          setResultRecord(null);
        }}
      >
        <View style={{ flex: 1 }}>
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              paddingTop: Math.max(insets.top, 18),
              paddingBottom: Math.max(insets.bottom, 18),
              paddingHorizontal: 16,
            }}
          >
            <Pressable
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: theme.isDark ? "rgba(0,0,0,0.55)" : "rgba(10,14,20,0.32)",
              }}
              onPress={() => {
                setRuntimeScreen("dashboard");
                setActiveTab("home");
                setResultRecord(null);
              }}
            />
            <View>
              <ScreenReveal delay={20} distance={22} scaleFrom={0.98}>
                <GlassCard style={{ borderRadius: 24, overflow: "hidden", maxHeight: "100%" }} padding={0} variant="strong">
                  {resultRecord ? (
                    <>
                      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={[theme.typography.title, { fontSize: 18 }]}>Session complete</Text>
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 3 }]}>
                            {sessionType === "test" ? "Test" : "Lesson"} • {sessionContext.name || "General practice"}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={[theme.typography.title, { fontSize: 24 }]}>{resultRecord.percentage}%</Text>
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                            {resultRecord.score}/{resultRecord.total} correct
                          </Text>
                        </View>
                      </View>

                      <ScrollView
                        style={{ maxHeight: reviewViewportMaxHeight }}
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
                      >
                        {resultRecord.issues.length > 0 ? (
                          <View>
                            <Text style={[theme.typography.label, { marginBottom: 8 }]}>Question Review</Text>
                            <View style={{ gap: 8 }}>
                              {resultRecord.issues.map((issue, index) => (
                                <View
                                  key={`${issue.id}-${index}`}
                                  style={{
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: theme.colors.border,
                                    backgroundColor: theme.colors.surfaceGlass,
                                    padding: 12,
                                  }}
                                >
                                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                    <Ionicons
                                      name={reviewIssueIcon(issue.kind)}
                                      size={14}
                                      color={reviewIssueColor(theme, issue.kind)}
                                    />
                                    <Text style={[theme.typography.bodyStrong, { fontSize: 11.5 }]}>
                                      {reviewIssueLabel(issue.kind)}
                                    </Text>
                                  </View>
                                  <Text style={[theme.typography.body, { marginTop: 6, fontSize: 12, lineHeight: 18 }]}>
                                    P: {typeof issue.prompt === "string" ? issue.prompt || "Untitled" : "Untitled"}
                                  </Text>
                                  {typeof issue.expected === "string" && issue.expected ? (
                                    <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted, lineHeight: 18 }]}>
                                      E: {issue.expected}
                                    </Text>
                                  ) : null}
                                  {typeof issue.answer === "string" && issue.answer ? (
                                    <Text style={[theme.typography.caption, { marginTop: 3, color: theme.colors.textMuted, lineHeight: 18 }]}>
                                      A: {issue.answer}
                                    </Text>
                                  ) : null}
                                </View>
                              ))}
                            </View>
                          </View>
                        ) : (
                          <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted }]}>
                            No question details were recorded for this run.
                          </Text>
                        )}
                      </ScrollView>

                      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: theme.colors.border, flexDirection: "row", gap: 10, backgroundColor: theme.colors.surfaceGlass }}>
                        <View style={{ flex: 1 }}>
                          <AppButton
                            label="Return Home"
                            onPress={() => {
                              setRuntimeScreen("dashboard");
                              setActiveTab("home");
                              setResultRecord(null);
                            }}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppButton
                            label="Re-take"
                            variant="dangerSoft"
                            onPress={() => startSession(sessionType, sessionMode, direction, sessionPool, sessionContext)}
                          />
                        </View>
                      </View>
                    </>
                  ) : null}
                </GlassCard>
              </ScreenReveal>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!selectedHistoryRecord}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setSelectedHistoryRecord(null);
        }}
      >
        <View style={{ flex: 1 }}>
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              paddingTop: Math.max(insets.top, 18),
              paddingBottom: Math.max(insets.bottom, 18),
              paddingHorizontal: 16,
            }}
          >
            <Pressable
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: theme.isDark ? "rgba(0,0,0,0.55)" : "rgba(10,14,20,0.32)",
              }}
              onPress={() => {
                setSelectedHistoryRecord(null);
              }}
            />
            <View>
              <ScreenReveal delay={20} distance={22} scaleFrom={0.98}>
                <GlassCard style={{ borderRadius: 24, overflow: "hidden", maxHeight: "100%" }} padding={0} variant="strong">
                  {selectedHistoryRecord ? (
                    <>
                      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={[theme.typography.title, { fontSize: 18 }]}>Test review</Text>
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 3 }]}>
                            {(selectedHistoryRecord.lessonName || "Past test")} • {selectedHistoryRecord.date ? new Date(selectedHistoryRecord.date).toLocaleDateString() : "Past attempt"}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={[theme.typography.title, { fontSize: 24 }]}>{selectedHistoryRecord.percentage}%</Text>
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                            {typeof selectedHistoryRecord.score === "number" ? selectedHistoryRecord.score : (selectedHistoryRecord.score as any)?.correct ?? 0}/{selectedHistoryRecord.totalWords} correct
                          </Text>
                        </View>
                      </View>

                      <ScrollView
                        style={{ maxHeight: reviewViewportMaxHeight }}
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
                      >
                        {(selectedHistoryRecord.issues ?? []).length > 0 ? (
                          <View>
                            <Text style={[theme.typography.label, { marginBottom: 8 }]}>Question Review</Text>
                            <View style={{ gap: 8 }}>
                              {(selectedHistoryRecord.issues ?? []).map((issue, index) => (
                                <View
                                  key={`${issue.id}-${index}`}
                                  style={{
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: theme.colors.border,
                                    backgroundColor: theme.colors.surfaceGlass,
                                    padding: 12,
                                  }}
                                >
                                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                    <Ionicons
                                      name={reviewIssueIcon(issue.kind)}
                                      size={14}
                                      color={reviewIssueColor(theme, issue.kind)}
                                    />
                                    <Text style={[theme.typography.bodyStrong, { fontSize: 11.5 }]}>
                                      {reviewIssueLabel(issue.kind)}
                                    </Text>
                                  </View>
                                  <Text style={[theme.typography.body, { marginTop: 6, fontSize: 12, lineHeight: 18 }]}>
                                    P: {typeof issue.prompt === "string" ? issue.prompt || "Untitled" : "Untitled"}
                                  </Text>
                                  {typeof issue.expected === "string" && issue.expected ? (
                                    <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted, lineHeight: 18 }]}>
                                      E: {issue.expected}
                                    </Text>
                                  ) : null}
                                  {typeof issue.answer === "string" && issue.answer ? (
                                    <Text style={[theme.typography.caption, { marginTop: 3, color: theme.colors.textMuted, lineHeight: 18 }]}>
                                      A: {issue.answer}
                                    </Text>
                                  ) : null}
                                </View>
                              ))}
                            </View>
                          </View>
                        ) : (
                          <Text style={[theme.typography.caption, { marginTop: 4, color: theme.colors.textMuted }]}>
                            Question details were not saved for this test attempt.
                          </Text>
                        )}
                      </ScrollView>

                      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surfaceGlass }}>
                        <AppButton
                          label="Close"
                          onPress={() => {
                            setSelectedHistoryRecord(null);
                          }}
                        />
                      </View>
                    </>
                  ) : null}
                </GlassCard>
              </ScreenReveal>
            </View>
          </View>
        </View>
      </Modal>
      {lessonPdfViewerVisible ? (
        <LessonPdfViewerModal
          visible={lessonPdfViewerVisible}
          uri={lessonPdfViewerUri}
          title={selectedLessonDetail?.document_name || selectedLessonDetail?.name}
          primaryColor={theme.colors.primary}
          backgroundColor={theme.colors.surface}
          textColor={theme.colors.text}
          onClose={() => {
            setLessonPdfViewerVisible(false);
            setLessonPdfViewerUri(null);
          }}
          onLoadError={(msg: string) => showToast(msg, "danger")}
        />
      ) : null}
      <FloatingToast {...toastProps} />
    </View>
  );
}
