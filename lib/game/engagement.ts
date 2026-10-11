import type {
  StudyProgress,
  StudyRecord,
  StudySessionType,
  UserStats,
} from "../../types/study-game";

export type AchievementDefinition = {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  current: (stats: UserStats) => number;
};

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "first_practice",
    title: "First Steps",
    description: "Complete your first study session.",
    icon: "footsteps-outline",
    target: 1,
    current: (stats) => stats.totalSessions,
  },
  {
    id: "ten_sessions",
    title: "Study Habit",
    description: "Complete 10 study sessions.",
    icon: "calendar-outline",
    target: 10,
    current: (stats) => stats.totalSessions,
  },
  {
    id: "fifty_sessions",
    title: "Committed Learner",
    description: "Complete 50 study sessions.",
    icon: "ribbon-outline",
    target: 50,
    current: (stats) => stats.totalSessions,
  },
  {
    id: "hundred_words",
    title: "Word Collector",
    description: "Study 100 words.",
    icon: "book-outline",
    target: 100,
    current: (stats) => stats.totalWords,
  },
  {
    id: "five_hundred_words",
    title: "Vocabulary Builder",
    description: "Study 500 words.",
    icon: "library-outline",
    target: 500,
    current: (stats) => stats.totalWords,
  },
  {
    id: "perfect_session",
    title: "Perfect Practice",
    description: "Finish a session with a perfect score.",
    icon: "sparkles-outline",
    target: 1,
    current: (stats) => stats.perfectSessions,
  },
  {
    id: "five_perfect",
    title: "Fluency Focus",
    description: "Finish 5 sessions with a perfect score.",
    icon: "diamond-outline",
    target: 5,
    current: (stats) => stats.perfectSessions,
  },
  {
    id: "three_streak",
    title: "On a Roll",
    description: "Build a 3-day study streak.",
    icon: "flame-outline",
    target: 3,
    current: (stats) => stats.maxStreak,
  },
  {
    id: "seven_streak",
    title: "Full Week",
    description: "Build a 7-day study streak.",
    icon: "bonfire-outline",
    target: 7,
    current: (stats) => stats.maxStreak,
  },
  {
    id: "thirty_streak",
    title: "Monthly Momentum",
    description: "Build a 30-day study streak.",
    icon: "trophy-outline",
    target: 30,
    current: (stats) => stats.maxStreak,
  },
  {
    id: "first_test",
    title: "Test Ready",
    description: "Complete your first test.",
    icon: "clipboard-outline",
    target: 1,
    current: (stats) => stats.totalTests,
  },
  {
    id: "pass_test",
    title: "Test Success",
    description: "Pass your first test.",
    icon: "checkmark-done-outline",
    target: 1,
    current: (stats) => stats.passedTests,
  },
  {
    id: "listening_pro",
    title: "Active Listener",
    description: "Complete 10 listening sessions.",
    icon: "headset-outline",
    target: 10,
    current: (stats) => stats.listeningSessions,
  },
  {
    id: "daily_first",
    title: "Daily Starter",
    description: "Complete your first daily challenge.",
    icon: "flash-outline",
    target: 1,
    current: (stats) => stats.dailyChallengesCompleted,
  },
  {
    id: "daily_week",
    title: "Challenge Week",
    description: "Complete 7 daily challenges.",
    icon: "calendar-number-outline",
    target: 7,
    current: (stats) => stats.dailyChallengesCompleted,
  },
  {
    id: "daily_month",
    title: "Challenge Champion",
    description: "Complete 30 daily challenges.",
    icon: "medal-outline",
    target: 30,
    current: (stats) => stats.dailyChallengesCompleted,
  },
];

const ACHIEVEMENT_ALIASES: Record<string, string> = {
  first_session: "first_practice",
  five_sessions: "first_practice",
  first_test_pass: "pass_test",
  streak_3: "three_streak",
  daily_3: "daily_first",
};

export function normalizeAchievementIds(ids: string[]): string[] {
  const knownIds = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));
  return Array.from(
    new Set(
      ids
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .map((id) => ACHIEVEMENT_ALIASES[id] ?? id)
        .filter((id) => knownIds.has(id))
    )
  );
}

export function unlockAchievements(userStats: UserStats, unlocked: string[]): string[] {
  const ids = new Set(normalizeAchievementIds(unlocked));
  for (const achievement of ACHIEVEMENTS) {
    if (achievement.current(userStats) >= achievement.target) {
      ids.add(achievement.id);
    }
  }
  return Array.from(ids);
}

export function localDateKey(value: Date | string | number = new Date()): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calculateSessionXp(args: {
  correct: number;
  close?: number;
  percentage: number;
  type: StudySessionType;
  passingPercentage?: number;
}): number {
  const answerXp = Math.max(0, args.correct) * 10 + Math.max(0, args.close ?? 0) * 5;
  const passingPercentage = Number.isFinite(args.passingPercentage)
    ? Math.min(100, Math.max(1, Number(args.passingPercentage)))
    : 80;
  const completionXp = args.percentage === 100 ? 50 : args.percentage >= passingPercentage ? 25 : 10;
  const dailyBonus = args.type === "daily-challenge" ? 50 : 0;
  return answerXp + completionXp + dailyBonus;
}

export function calculateRecordXp(record: StudyRecord): number {
  if (typeof record.xpEarned === "number" && Number.isFinite(record.xpEarned)) {
    return Math.max(0, Math.round(record.xpEarned));
  }
  const score = typeof record.score === "number" ? record.score : 0;
  const passed =
    typeof record.passed === "boolean"
      ? record.passed
      : (record.percentage ?? 0) >= (record.passingPercentage ?? 80);
  return Math.max(0, score * 10 + (passed ? 50 : 0));
}

export function calculateTotalXp(
  progress: Pick<StudyProgress, "practiceHistory" | "testHistory" | "preferences">
): number {
  const historyXp = [...progress.practiceHistory, ...progress.testHistory].reduce(
    (sum, record) => sum + calculateRecordXp(record),
    0
  );
  return Math.max(progress.preferences.totalXP ?? 0, historyXp);
}

export function calculateTodayWords(
  practiceHistory: StudyRecord[],
  testHistory: StudyRecord[],
  today = localDateKey()
): number {
  return [...practiceHistory, ...testHistory].reduce((sum, record) => {
    if (localDateKey(record.dateKey ?? record.date) !== today) return sum;
    return sum + Math.max(0, record.totalWords ?? 0);
  }, 0);
}

export function getLevelInfo(totalXP: number) {
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
  for (let index = 0; index < levels.length; index += 1) {
    if (totalXP >= levels[index].xpNeeded) {
      current = levels[index];
      next = levels[index + 1] ?? null;
    }
  }
  const xpInLevel = totalXP - current.xpNeeded;
  const xpForLevel = next ? next.xpNeeded - current.xpNeeded : 1;
  return {
    current,
    next,
    xpInLevel,
    xpForLevel,
    progress: next ? Math.min((xpInLevel / xpForLevel) * 100, 100) : 100,
  };
}
