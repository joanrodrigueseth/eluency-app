import type { PromptBuilderItem } from "../lib/promptBuilder";

export type StudySessionType =
  | "practice"
  | "test"
  | "daily-challenge"
  | "review-mistakes"
  | "smart-review";

export type StudySessionMode = "typing" | "multiple-choice" | "listening" | "image";
export type StudyDirection = "pt-en" | "en-pt";

export type StudentAssignmentType = "lesson" | "test";

export type StudentAssignmentDetail = {
  assignment_type: StudentAssignmentType;
  assignment_id: string;
  due_at: string | null;
  instructions: string | null;
  required: boolean;
  assigned_at: string;
};

export type StudentClassroomAssignmentSource = {
  assignmentType: StudentAssignmentType;
  contentId: string;
  classroomId: string;
  classroomName: string;
};

export type StudentSessionPayload = {
  student: {
    id: string;
    name: string;
    assigned_lessons: string[];
    assigned_tests: string[];
    assignment_details?: StudentAssignmentDetail[];
    classroom_assignments?: StudentClassroomAssignmentSource[];
    /** Membership and active recipient work from the student classroom endpoint. Cached for offline use. */
    classrooms?: StudentClassroom[];
    classrooms_error?: string | null;
  };
  teacher: { id: string; name: string; email: string | null } | null;
  expires_at: string;
};

export type StudentClassroom = {
  id: string;
  name: string;
  assignments: Array<{
    id: string;
    type: StudentAssignmentType;
    contentId: string;
    dueAt: string | null;
    instructions: string | null;
    assignedAt: string;
  }>;
};

export type LessonGamePayload = {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  gradeRange?: string;
  /** ISO timestamp from DB — used to bust image cache when lesson (or assets) change. */
  updated_at?: string;
  cover_image_url?: string | null;
  /** Teacher-selected lesson language from dashboard (e.g. German); refines display labels with language_pair. */
  language?: string | null;
  /** e.g. en-pt, en-es — controls display labels (pt column = lang A, en column = lang B). */
  language_pair?: string;
  words: Array<{
    id?: string;
    rowType?: "vocab" | "conjugation" | "preposition" | "prompt_builder";
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
    conjugations?: Array<{ pronoun?: string; form_a?: string; form_b?: string; included?: boolean }>;
    prepositionTitle?: string;
    prepositions?: Array<{ left?: string; right?: string; answer?: string; note?: string }>;
    instruction?: string;
    prompts?: PromptBuilderItem[];
  }>;
  tags?: string[];
  document_url?: string;
  document_name?: string;
  audio_url?: string;
  audio_name?: string;
  audio_mime_type?: string;
  audio_size?: number;
  learning_objectives?: string[];
  estimated_minutes?: number;
  assignment?: StudentAssignmentDetail | null;
  classroomNames?: string[];
};

export type TestGamePayload = {
  id: string;
  name: string;
  /** ISO timestamp — busts cover / word image cache after edits. */
  updated_at?: string;
  cover_image_url?: string | null;
  teacher_name?: string | null;
  time_limit_minutes?: number | null;
  attempts_allowed?: 1 | 2 | "unlimited";
  attempts_used?: number;
  /** Null means the teacher configured unlimited attempts. */
  attempts_remaining?: number | null;
  passing_percentage?: number;
  assignment_status?:
    | "not-started"
    | "in-progress"
    | "completed"
    | "awaiting-review"
    | "retry-available"
    | "failed"
    | "attempts-exhausted";
  active_attempt?: {
    started_at: string | null;
    expires_at: string | null;
    answered_count: number;
  } | null;
  words: Array<{
    question_index?: number;
    /** Sanitized graded-test payloads contain prompts but never answer keys. */
    prompt_text?: string;
    en?: string;
    /** Signed or absolute URL when API includes it alongside img. */
    image_url?: string;
    img?: string;
    answer_format?: "open" | "specific" | "mcq";
    require_specific_answer?: boolean;
    mcq_options?: { id: string; text: string }[] | null;
    audio_url?: string | null;
    audio_transcript?: string | null;
    prompt_format?: "text" | "audio" | "image" | "fill_blank";
    fill_blank_character_count?: number;
    required?: boolean;
    points?: number;
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
  assignment?: StudentAssignmentDetail | null;
  classroomNames?: string[];
};

export type GameWord = {
  id: string;
  questionIndex?: number;
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
  practiceKind?: "vocab" | "conjugation" | "conjugation-table" | "preposition" | "prompt-builder";
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
  promptBuilderInstruction?: string;
  promptBuilderItem?: PromptBuilderItem;
  acceptedAnswers?: string[];
};

export type VerifyAnswerPayload = {
  sessionId: string;
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
  questionIndex?: number;
  prompt: string;
  expected: string;
  answer?: string;
  kind: "correct" | "wrong" | "close" | "skip" | "open_review";
  mode?: StudySessionMode;
  promptFormat?: GameWord["promptFormat"];
  answerFormat?: GameWord["answerFormat"];
  mcqOptions?: Array<{ id?: string; text: string; correct?: boolean }>;
  selectedOptionId?: string | null;
  mcqCorrectOptionId?: string | null;
};

export type StudyRecord = {
  id: string;
  date: string;
  /** Local calendar day used for streaks and daily goals across time zones. */
  dateKey?: string;
  /** Epoch milliseconds. Web dashboard uses this for recent-result sorting. */
  timestamp?: number;
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
  xpEarned?: number;
  earnedPoints?: number;
  totalPoints?: number;
  passingPercentage?: number;
  passed?: boolean;
  verified?: boolean;
  requiresReview?: boolean;
  reviewStatus?: "not_required" | "pending" | "finalized";
  teacherFeedback?: string | null;
  reviewedAt?: string | null;
  resultOpenedAt?: string | null;
  reviewStartedAt?: string | null;
  reviewCompletedAt?: string | null;
  followUpCompletedAt?: string | null;
  direction: StudyDirection;
  issues?: StudyRecordIssue[];
};

export type VerifiedTestAttempt = {
  id: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  passed: boolean;
  requiresReview: boolean;
  earnedPoints?: number;
  totalPoints?: number;
  passingPercentage?: number;
  grading: unknown[];
  historyRecord: StudyRecord;
};

export type TestAttemptAnswer = {
  questionIndex: number;
  answer: string;
  selectedOptionId?: string | null;
};

export type ActiveTestAttemptSession = {
  attemptKey: string;
  startedAt: string;
  expiresAt: string | null;
  answers: TestAttemptAnswer[];
  resumed: boolean;
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
  preferences: {
    darkMode: boolean;
    hapticEnabled: boolean;
    soundEnabled: boolean;
    practiceLength: number;
    totalXP: number;
    dailyGoalWords: number;
  };
  dailyChallenge: DailyChallengeState;
  practiceHistory: StudyRecord[];
  testHistory: StudyRecord[];
  wordStats: Record<string, WordStatsItem>;
  wordMeta: Record<string, { tags?: string[]; lessonId?: string; testId?: string }>;
  userStats: UserStats;
  achievements: string[];
};

