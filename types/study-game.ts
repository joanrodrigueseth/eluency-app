export type StudySessionType =
  | "practice"
  | "test"
  | "daily-challenge"
  | "review-mistakes"
  | "smart-review";

export type StudySessionMode = "typing" | "multiple-choice" | "listening" | "image";
export type StudyDirection = "pt-en" | "en-pt";

export type StudentSessionPayload = {
  student: {
    id: string;
    name: string;
    code: string;
    assigned_lessons: string[];
    assigned_tests: string[];
  };
  teacher: { id: string; name: string; email: string | null } | null;
  expires_at: string;
};

export type LessonGamePayload = {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  gradeRange?: string;
  cover_image_url?: string;
  /** Teacher-selected lesson language from dashboard (e.g. German); refines display labels with language_pair. */
  language?: string | null;
  /** e.g. en-pt, en-es — controls display labels (pt column = lang A, en column = lang B). */
  language_pair?: string;
  words: Array<{
    id?: string;
    rowType?: "vocab" | "conjugation" | "preposition";
    pt?: string;
    en?: string;
    term_a?: string;
    term_b?: string;
    context_a?: string;
    context_b?: string;
    sp?: string;
    se?: string;
    img?: string;
    image_url?: string;
    audio_url?: string | null;
    infinitive?: string;
    conjugations?: Array<{ pronoun?: string; form_a?: string; form_b?: string }>;
    prepositionTitle?: string;
    prepositions?: Array<{ left?: string; right?: string; answer?: string; note?: string }>;
  }>;
  tags?: string[];
  document_url?: string;
  document_name?: string;
};

export type TestGamePayload = {
  id: string;
  name: string;
  cover_image_url?: string;
  words: Array<{
    pt?: string;
    en?: string;
    /** Signed or absolute URL when API includes it alongside img. */
    image_url?: string;
    img?: string;
    answer_format?: "open" | "specific" | "mcq";
    require_specific_answer?: boolean;
    pt_alt?: string[];
    mcq_options?: { id: string; text: string }[] | null;
    mcq_correct_option_id?: string | null;
    audio_url?: string | null;
    prompt_format?: "text" | "audio" | "image" | "fill_blank";
    fill_blank_character_count?: number;
  }>;
  reviewVocabulary?: Array<{
    id?: string;
    pt?: string;
    en?: string;
    sp?: string;
    se?: string;
    image_url?: string;
    img?: string;
    audio_url?: string | null;
  }>;
};

export type GameWord = {
  id: string;
  lessonId?: string;
  lessonName?: string;
  lessonLanguagePair?: string;
  /** Mirrors lessons.language from API for direction labels (e.g. DE → EN). */
  lessonLanguage?: string | null;
  testId?: string;
  testName?: string;
  sourceType: "lesson" | "test" | "review";
  pt: string;
  en: string;
  sp?: string;
  se?: string;
  pt_alt?: string[];
  imageUrl?: string;
  audioUrl?: string | null;
  promptFormat?: "text" | "audio" | "image" | "fill_blank";
  answerFormat?: "open" | "specific" | "mcq";
  mcqOptions?: { id: string; text: string }[];
  mcqCorrectOptionId?: string | null;
  fillBlankCharacterCount?: number;
  /** Vocabulary row vs expanded conjugation/preposition drill */
  practiceKind?: "vocab" | "conjugation" | "conjugation-table" | "preposition";
  /** Set for single-pronoun conjugation (MCQ / typing) — matches web _conjugInfinitive / _conjugPronoun */
  conjugationInfinitive?: string;
  conjugationPronoun?: string;
  /** Full verb row for typing mode (web `rowType === 'conjugation'`). */
  conjugationTable?: {
    infinitive: string;
    entries: { pronoun: string; form_a: string; form_b?: string }[];
  };
  conjugationPrompt?: string;
  conjugationAnswer?: string;
  prepositionPrompt?: string;
  prepositionAnswer?: string;
};

export type VerifyAnswerPayload = {
  correctAnswer: string;
  userAnswer: string;
  sourceText?: string;
  isMarkedInfinitive?: boolean;
};

export type VerifyAnswerResult = {
  correct?: boolean;
  isCorrect?: boolean;
  close?: boolean;
  showInfinitiveNote?: boolean;
  feedback?: string;
  correction?: string;
  acceptedAs?: string;
};

export type StudyRecordIssue = {
  id: string;
  prompt: string;
  expected: string;
  answer?: string;
  kind: "correct" | "wrong" | "close" | "skip" | "open_review";
};

export type StudyRecord = {
  id: string;
  date: string;
  type: StudySessionType;
  mode: StudySessionMode;
  lessonId?: string | null;
  lessonName?: string | null;
  /** Lesson content_json.language_pair for history labels (e.g. en-es). */
  languagePair?: string | null;
  /** lessons.language when session was a single lesson (direction labels). */
  lessonLanguage?: string | null;
  score: number;
  totalWords: number;
  percentage: number;
  passed?: boolean;
  direction: StudyDirection;
  issues?: StudyRecordIssue[];
};

export type WordStatsItem = {
  correct: number;
  total: number;
  lastPracticed: string | null;
  lastSeen: string | null;
  favorite?: boolean;
  difficult?: boolean;
};

export type UserStats = {
  totalSessions: number;
  totalWords: number;
  perfectSessions: number;
  totalTests: number;
  passedTests: number;
  maxStreak: number;
  lessonsCompleted: number;
  listeningSessions: number;
  dailyChallengesCompleted: number;
};

export type DailyChallengeState = {
  date: string | null;
  completed: boolean;
  score: number;
};

export type StudyProgress = {
  preferences: { darkMode: boolean; hapticEnabled: boolean; practiceLength: number };
  dailyChallenge: DailyChallengeState;
  practiceHistory: StudyRecord[];
  testHistory: StudyRecord[];
  wordStats: Record<string, WordStatsItem>;
  wordMeta: Record<string, { tags?: string[]; lessonId?: string; testId?: string }>;
  userStats: UserStats;
  achievements: string[];
};

