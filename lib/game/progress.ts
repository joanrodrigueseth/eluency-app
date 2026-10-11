import AsyncStorage from "@react-native-async-storage/async-storage";
import { studentDataScope } from "../studentDataStorage";

import {
  getRemoteProgress,
  saveRemoteProgress,
  submitTestAttempt,
  type SubmitTestAttemptInput,
} from "../api/study";
import type {
  StudyProgress,
  StudyRecord,
  StudyRecordIssue,
  WordStatsItem,
} from "../../types/study-game";
import {
  calculateRecordXp,
  normalizeAchievementIds,
  unlockAchievements,
} from "./engagement";

const STORAGE_KEY = "eluency-study-game-progress-v1";
const PENDING_SYNC_KEY = "eluency-study-game-pending-sync-v1";
const PENDING_TEST_ATTEMPTS_KEY = "eluency-study-game-pending-test-attempts-v1";
const MAX_PENDING_TEST_ATTEMPTS = 10;
const MAX_HISTORY_RECORDS = 250;
const pendingAttemptOperations = new Map<string, Promise<void>>();
let pendingAttemptMigrationComplete = false;

function progressStorageKey(sessionId: string): string {
  return `${STORAGE_KEY}:${studentDataScope(sessionId)}`;
}

function pendingSyncStorageKey(sessionId: string): string {
  return `${PENDING_SYNC_KEY}:${studentDataScope(sessionId)}`;
}

type PendingTestAttempt = Omit<SubmitTestAttemptInput, "sessionId"> & {
  studentId?: string;
};

async function loadPendingTestAttempts(): Promise<PendingTestAttempt[]> {
  try {
    const legacyKeys = pendingAttemptMigrationComplete
      ? []
      : (await AsyncStorage.getAllKeys()).filter((key) =>
          key.startsWith(`${PENDING_TEST_ATTEMPTS_KEY}:`)
        );
    const values = await AsyncStorage.multiGet([
      PENDING_TEST_ATTEMPTS_KEY,
      ...legacyKeys,
    ]);
    const parsed = values.flatMap(([, value]) => {
      if (!value) return [];
      try {
        const items = JSON.parse(value);
        return Array.isArray(items) ? items : [];
      } catch {
        return [];
      }
    });
    const byAttemptKey = new Map<string, PendingTestAttempt>();
    parsed.forEach((item) => {
      if (
        item != null &&
        typeof item === "object" &&
        typeof item.testId === "string" &&
        typeof item.attemptKey === "string" &&
        Array.isArray(item.answers)
      ) {
        const safeAttempt = { ...(item as SubmitTestAttemptInput) } as Record<string, unknown>;
        delete safeAttempt.sessionId;
        byAttemptKey.set(String(safeAttempt.attemptKey), safeAttempt as PendingTestAttempt);
      }
    });
    const attempts = Array.from(byAttemptKey.values());
    if (legacyKeys.length > 0) {
      if (attempts.length > 0) {
        await AsyncStorage.setItem(PENDING_TEST_ATTEMPTS_KEY, JSON.stringify(attempts));
      }
      await AsyncStorage.multiRemove(legacyKeys);
    }
    pendingAttemptMigrationComplete = true;
    return attempts;
  } catch {
    return [];
  }
}

async function savePendingTestAttempts(attempts: PendingTestAttempt[]): Promise<void> {
  const key = PENDING_TEST_ATTEMPTS_KEY;
  if (attempts.length === 0) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, JSON.stringify(attempts));
}

async function withPendingAttemptLock<T>(operation: () => Promise<T>): Promise<T> {
  const lockKey = PENDING_TEST_ATTEMPTS_KEY;
  const previous = pendingAttemptOperations.get(lockKey) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operationChain = previous.then(() => current);
  pendingAttemptOperations.set(lockKey, operationChain);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (pendingAttemptOperations.get(lockKey) === operationChain) {
      pendingAttemptOperations.delete(lockKey);
    }
  }
}

export async function queuePendingTestAttempt(
  input: SubmitTestAttemptInput,
  studentId?: string
): Promise<boolean> {
  return withPendingAttemptLock(async () => {
    const attempts = await loadPendingTestAttempts();
    const replacing = attempts.some((item) => item.attemptKey === input.attemptKey);
    const next = attempts.filter((item) => item.attemptKey !== input.attemptKey);
    const currentStudentAttempts = next.filter(
      (item) => !studentId || !item.studentId || item.studentId === studentId
    );
    if (!replacing && currentStudentAttempts.length >= MAX_PENDING_TEST_ATTEMPTS) return false;
    const safeAttempt = { ...input } as Record<string, unknown>;
    delete safeAttempt.sessionId;
    if (studentId) safeAttempt.studentId = studentId;
    next.push(safeAttempt as PendingTestAttempt);
    await savePendingTestAttempts(next);
    return true;
  });
}

export async function removePendingTestAttempt(_sessionId: string, attemptKey: string): Promise<void> {
  await withPendingAttemptLock(async () => {
    const attempts = await loadPendingTestAttempts();
    await savePendingTestAttempts(
      attempts.filter((item) => item.attemptKey !== attemptKey)
    );
  });
}

export async function flushPendingTestAttempts(
  sessionId: string,
  studentId?: string
): Promise<{ synced: number; remaining: number }> {
  return withPendingAttemptLock(async () => {
    const attempts = await loadPendingTestAttempts();
    if (attempts.length === 0) return { synced: 0, remaining: 0 };

    const remaining: PendingTestAttempt[] = [];
    let synced = 0;
    for (const attempt of attempts) {
      if (studentId && attempt.studentId && attempt.studentId !== studentId) {
        remaining.push(attempt);
        continue;
      }
      try {
        const attemptInput = { ...attempt } as Record<string, unknown>;
        delete attemptInput.studentId;
        await submitTestAttempt({ ...(attemptInput as PendingTestAttempt), sessionId });
        synced += 1;
      } catch {
        // A completed test is never discarded automatically. A refreshed
        // session or a server correction may make a later retry succeed.
        remaining.push(attempt);
      }
    }
    await savePendingTestAttempts(remaining);
    return { synced, remaining: remaining.length };
  });
}

export const DEFAULT_PROGRESS: StudyProgress = {
  preferences: {
    darkMode: false,
    hapticEnabled: true,
    soundEnabled: true,
    practiceLength: 15,
    totalXP: 0,
    dailyGoalWords: 20,
  },
  dailyChallenge: { date: null, completed: false, score: 0 },
  practiceHistory: [],
  testHistory: [],
  wordStats: {},
  wordMeta: {},
  userStats: {
    totalSessions: 0,
    totalWords: 0,
    perfectSessions: 0,
    totalTests: 0,
    passedTests: 0,
    maxStreak: 0,
    lessonsCompleted: 0,
    listeningSessions: 0,
    dailyChallengesCompleted: 0,
  },
  achievements: [],
};

const SESSION_TYPES = new Set(["practice", "test", "daily-challenge", "review-mistakes", "smart-review"]);
const SESSION_MODES = new Set(["typing", "multiple-choice", "listening", "image"]);
const DIRECTIONS = new Set(["pt-en", "en-pt"]);
const ISSUE_KINDS = new Set(["correct", "wrong", "close", "skip", "open_review"]);

function asObject(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeIssue(value: unknown): StudyRecordIssue | null {
  const item = asObject(value);
  if (typeof item.id !== "string" || !item.id || !ISSUE_KINDS.has(String(item.kind))) return null;
  return {
    ...item,
    id: item.id,
    prompt: typeof item.prompt === "string" ? item.prompt : "",
    expected: typeof item.expected === "string" ? item.expected : "",
    answer: typeof item.answer === "string" ? item.answer : undefined,
    kind: item.kind as StudyRecordIssue["kind"],
    mode: SESSION_MODES.has(String(item.mode)) ? item.mode as StudyRecordIssue["mode"] : undefined,
  } as StudyRecordIssue;
}

function normalizeRecord(value: unknown, fallbackType: StudyRecord["type"]): StudyRecord | null {
  const item = asObject(value);
  const recordType = SESSION_TYPES.has(String(item.type)) ? item.type : fallbackType;
  if (
    !SESSION_MODES.has(String(item.mode)) ||
    !DIRECTIONS.has(String(item.direction))
  ) return null;
  const timestampValue = typeof item.timestamp === "number"
    ? item.timestamp
    : typeof item.timestamp === "string"
      ? Date.parse(item.timestamp)
      : NaN;
  const date = typeof item.date === "string" && item.date
    ? item.date
    : Number.isFinite(timestampValue)
      ? new Date(timestampValue).toISOString()
      : "";
  if (!date) return null;
  const numericScore = typeof item.score === "number"
    ? item.score
    : finiteNumber(asObject(item.score).correct) + finiteNumber(asObject(item.score).close);
  const fallbackId = [item.timestamp ?? date, recordType, item.lessonId ?? "", item.mode].join(":");
  return {
    ...item,
    id: typeof item.id === "string" && item.id ? item.id : fallbackId,
    date,
    timestamp: Number.isFinite(timestampValue) ? timestampValue : Date.parse(date),
    type: recordType as StudyRecord["type"],
    mode: item.mode as StudyRecord["mode"],
    direction: item.direction as StudyRecord["direction"],
    score: Math.max(0, numericScore),
    totalWords: Math.max(0, finiteNumber(item.totalWords)),
    percentage: Math.min(100, Math.max(0, finiteNumber(item.percentage))),
    issues: Array.isArray(item.issues)
      ? item.issues.map(normalizeIssue).filter((issue): issue is StudyRecordIssue => Boolean(issue)).slice(0, MAX_HISTORY_RECORDS)
      : [],
  } as StudyRecord;
}

function normalizeWordStats(value: unknown): StudyProgress["wordStats"] {
  return Object.fromEntries(
    Object.entries(asObject(value)).slice(0, 5_000).flatMap(([wordId, raw]) => {
      const item = asObject(raw);
      const total = Math.max(0, finiteNumber(item.total));
      const correct = Math.min(total, Math.max(0, finiteNumber(item.correct)));
      if (!wordId || wordId.length > 240) return [];
      return [[wordId, {
        ...item,
        correct,
        total,
        lastPracticed: typeof item.lastPracticed === "string" ? item.lastPracticed : null,
        lastSeen: typeof item.lastSeen === "string" ? item.lastSeen : null,
      } as WordStatsItem] as const];
    })
  );
}

function normalizeProgress(raw: unknown): StudyProgress {
  const source = asObject(raw);
  const preferences = asObject(source.preferences);
  const dailyChallenge = asObject(source.dailyChallenge);
  const userStats = asObject(source.userStats);
  const history = (value: unknown, fallbackType: StudyRecord["type"]) => Array.isArray(value)
    ? value.map((record) => normalizeRecord(record, fallbackType)).filter((record): record is StudyRecord => Boolean(record)).slice(0, MAX_HISTORY_RECORDS)
    : [];
  return {
    preferences: {
      darkMode: typeof preferences.darkMode === "boolean" ? preferences.darkMode : DEFAULT_PROGRESS.preferences.darkMode,
      hapticEnabled: typeof preferences.hapticEnabled === "boolean" ? preferences.hapticEnabled : DEFAULT_PROGRESS.preferences.hapticEnabled,
      soundEnabled: typeof preferences.soundEnabled === "boolean" ? preferences.soundEnabled : DEFAULT_PROGRESS.preferences.soundEnabled,
      practiceLength: Math.min(100, Math.max(5, Math.round(finiteNumber(preferences.practiceLength, DEFAULT_PROGRESS.preferences.practiceLength)))),
      totalXP: Math.max(0, finiteNumber(preferences.totalXP)),
      dailyGoalWords: Math.min(200, Math.max(5, Math.round(finiteNumber(preferences.dailyGoalWords, DEFAULT_PROGRESS.preferences.dailyGoalWords)))),
    },
    dailyChallenge: {
      date: typeof dailyChallenge.date === "string" ? dailyChallenge.date : null,
      completed: dailyChallenge.completed === true,
      score: Math.min(100, Math.max(0, finiteNumber(dailyChallenge.score))),
    },
    practiceHistory: history(source.practiceHistory, "practice"),
    testHistory: history(source.testHistory, "test"),
    wordStats: normalizeWordStats(source.wordStats),
    wordMeta: asObject(source.wordMeta) as StudyProgress["wordMeta"],
    userStats: {
      totalSessions: Math.max(0, finiteNumber(userStats.totalSessions)),
      totalWords: Math.max(0, finiteNumber(userStats.totalWords)),
      perfectSessions: Math.max(0, finiteNumber(userStats.perfectSessions)),
      totalTests: Math.max(0, finiteNumber(userStats.totalTests)),
      passedTests: Math.max(0, finiteNumber(userStats.passedTests)),
      maxStreak: Math.max(0, finiteNumber(userStats.maxStreak)),
      lessonsCompleted: Math.max(0, finiteNumber(userStats.lessonsCompleted)),
      listeningSessions: Math.max(0, finiteNumber(userStats.listeningSessions)),
      dailyChallengesCompleted: Math.max(0, finiteNumber(userStats.dailyChallengesCompleted)),
    },
    achievements: Array.isArray(source.achievements)
      ? source.achievements.filter((id): id is string => typeof id === "string").slice(0, 100)
      : [],
  };
}

function recordIdentity(record: StudyRecord): string {
  return record.id || [record.timestamp ?? record.date, record.type, record.lessonId ?? "", record.mode].join(":");
}

function recordTime(record: StudyRecord): number {
  const timestamp = typeof record.timestamp === "number" ? record.timestamp : 0;
  return Date.parse(record.date) || timestamp || 0;
}

function mergeHistory(existing: StudyRecord[], incoming: StudyRecord[]): StudyRecord[] {
  const records = new Map<string, StudyRecord>();
  for (const record of [...incoming, ...existing]) {
    const identity = recordIdentity(record);
    if (!identity) continue;
    const current = records.get(identity);
    if (current?.verified === true && record.verified !== true) continue;
    records.set(identity, record);
  }
  return Array.from(records.values())
    .sort((left, right) => recordTime(right) - recordTime(left))
    .slice(0, MAX_HISTORY_RECORDS);
}

function latestTimestamp(left: string | null | undefined, right: string | null | undefined) {
  if (!left) return right ?? null;
  if (!right) return left;
  return Date.parse(right) > Date.parse(left) ? right : left;
}

function mergeWordStats(
  existing: StudyProgress["wordStats"],
  incoming: StudyProgress["wordStats"],
  practiceHistory: StudyRecord[]
): StudyProgress["wordStats"] {
  const merged: StudyProgress["wordStats"] = { ...existing };
  for (const [wordId, next] of Object.entries(incoming)) {
    const previous = merged[wordId];
    merged[wordId] = previous ? {
      ...previous,
      ...next,
      correct: Math.max(previous.correct, next.correct),
      total: Math.max(previous.total, next.total),
      lastPracticed: latestTimestamp(previous.lastPracticed, next.lastPracticed),
      lastSeen: latestTimestamp(previous.lastSeen, next.lastSeen),
    } : next;
  }
  const historyStats: StudyProgress["wordStats"] = {};
  for (const record of practiceHistory) {
    for (const issue of record.issues ?? []) {
      if (!issue.id) continue;
      const current = historyStats[issue.id] ?? { correct: 0, total: 0, lastPracticed: null, lastSeen: null };
      current.total += 1;
      if (issue.kind === "correct" || issue.kind === "open_review") current.correct += 1;
      current.lastPracticed = latestTimestamp(current.lastPracticed, record.date);
      current.lastSeen = latestTimestamp(current.lastSeen, record.date);
      historyStats[issue.id] = current;
    }
  }
  for (const [wordId, historyItem] of Object.entries(historyStats)) {
    const current = merged[wordId];
    if (!current) {
      merged[wordId] = historyItem;
      continue;
    }
    const total = Math.max(current.total, historyItem.total);
    merged[wordId] = {
      ...current,
      total,
      correct: Math.min(total, Math.max(current.correct, historyItem.correct)),
      lastPracticed: latestTimestamp(current.lastPracticed, historyItem.lastPracticed),
      lastSeen: latestTimestamp(current.lastSeen, historyItem.lastSeen),
    };
  }
  return merged;
}

function mergeDailyChallenge(
  existing: StudyProgress["dailyChallenge"],
  incoming: StudyProgress["dailyChallenge"]
): StudyProgress["dailyChallenge"] {
  if (!existing.date) return incoming;
  if (!incoming.date) return existing;
  if (existing.date > incoming.date) return existing;
  if (incoming.date > existing.date) return incoming;
  return {
    date: existing.date,
    completed: existing.completed || incoming.completed,
    score: Math.max(existing.score, incoming.score),
  };
}

function deriveUserStats(practiceHistory: StudyRecord[], testHistory: StudyRecord[]): StudyProgress["userStats"] {
  const all = [...practiceHistory, ...testHistory];
  const lessonIds = new Set(practiceHistory.map((record) => record.lessonId).filter((id): id is string => Boolean(id && id !== "all")));
  const dates = Array.from(new Set(all.map((record) => record.dateKey ?? record.date.slice(0, 10)).filter(Boolean))).sort().reverse();
  let maxStreak = 0;
  let runningStreak = 0;
  let previous: Date | null = null;
  for (const value of dates) {
    const date = new Date(`${value}T00:00:00.000Z`);
    runningStreak = previous && Math.round((previous.getTime() - date.getTime()) / 86_400_000) === 1
      ? runningStreak + 1
      : 1;
    maxStreak = Math.max(maxStreak, runningStreak);
    previous = date;
  }
  return {
    totalSessions: all.length,
    totalWords: all.reduce((sum, record) => sum + record.totalWords, 0),
    perfectSessions: all.filter((record) => record.percentage === 100).length,
    totalTests: testHistory.length,
    passedTests: testHistory.filter((record) => record.verified === true && (
      record.passed === true
      || record.percentage >= (record.passingPercentage ?? 80)
    )).length,
    maxStreak,
    lessonsCompleted: lessonIds.size,
    listeningSessions: all.filter((record) => record.mode === "listening").length,
    dailyChallengesCompleted: practiceHistory.filter((record) => record.type === "daily-challenge").length,
  };
}

export function mergeStudyProgress(existingRaw: unknown, incomingRaw: unknown): StudyProgress {
  const existing = normalizeProgress(existingRaw);
  const incoming = normalizeProgress(incomingRaw);
  const practiceHistory = mergeHistory(existing.practiceHistory, incoming.practiceHistory);
  const testHistory = mergeHistory(existing.testHistory, incoming.testHistory);
  const userStats = deriveUserStats(practiceHistory, testHistory);
  const achievements = unlockAchievements(
    userStats,
    normalizeAchievementIds([...existing.achievements, ...incoming.achievements])
  );
  return {
    preferences: {
      ...existing.preferences,
      ...incoming.preferences,
      totalXP: [...practiceHistory, ...testHistory].reduce((sum, record) => sum + calculateRecordXp(record), 0),
    },
    dailyChallenge: mergeDailyChallenge(existing.dailyChallenge, incoming.dailyChallenge),
    practiceHistory,
    testHistory,
    wordStats: mergeWordStats(existing.wordStats, incoming.wordStats, practiceHistory),
    wordMeta: { ...existing.wordMeta, ...incoming.wordMeta },
    userStats,
    achievements,
  };
}

function normalizeEngagementProgress(progress: StudyProgress): StudyProgress {
  return mergeStudyProgress(DEFAULT_PROGRESS, progress);
}

export async function loadLocalProgress(sessionId: string): Promise<StudyProgress> {
  try {
    const raw = await AsyncStorage.getItem(progressStorageKey(sessionId));
    if (!raw) return normalizeEngagementProgress(DEFAULT_PROGRESS);
    return normalizeEngagementProgress(JSON.parse(raw));
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export async function saveLocalProgress(sessionId: string, progress: StudyProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(
      progressStorageKey(sessionId),
      JSON.stringify({
        ...progress,
        practiceHistory: progress.practiceHistory.slice(0, MAX_HISTORY_RECORDS),
        testHistory: progress.testHistory.slice(0, MAX_HISTORY_RECORDS),
      })
    );
  } catch {
    // no-op
  }
}

async function loadPendingProgressSync(sessionId: string): Promise<StudyProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(pendingSyncStorageKey(sessionId));
    return raw ? (JSON.parse(raw) as StudyProgress) : null;
  } catch {
    return null;
  }
}

async function queueProgressSync(sessionId: string, progress: StudyProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(pendingSyncStorageKey(sessionId), JSON.stringify(progress));
  } catch {
    // no-op
  }
}

async function clearQueuedProgressSync(sessionId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(pendingSyncStorageKey(sessionId));
  } catch {
    // no-op
  }
}

export async function flushQueuedProgressSync(
  sessionId: string,
  fallbackProgress?: StudyProgress,
  onCanonical?: (progress: StudyProgress) => void
): Promise<boolean> {
  const pending = (await loadPendingProgressSync(sessionId)) ?? fallbackProgress ?? null;
  if (!pending) return true;
  const versionAtStart = progressSaveVersions.get(sessionId) ?? 0;
  try {
    const canonical = await saveRemoteProgress(sessionId, normalizeEngagementProgress(pending));
    const latest = latestScheduledProgress.get(sessionId) ?? pending;
    const reconciled = mergeStudyProgress(canonical, latest);
    await saveLocalProgress(sessionId, reconciled);
    onCanonical?.(reconciled);
    if ((progressSaveVersions.get(sessionId) ?? 0) === versionAtStart) {
      await clearQueuedProgressSync(sessionId);
    } else {
      await queueProgressSync(sessionId, latest);
    }
    return true;
  } catch {
    await queueProgressSync(sessionId, latestScheduledProgress.get(sessionId) ?? pending);
    return false;
  }
}

export async function hydrateProgress(sessionId: string): Promise<StudyProgress> {
  const local = await loadLocalProgress(sessionId);
  const pending = await loadPendingProgressSync(sessionId);
  const remote = await getRemoteProgress(sessionId);
  const localWithPending = pending ? mergeStudyProgress(local, pending) : local;
  if (!remote) {
    if (pending) await queueProgressSync(sessionId, localWithPending);
    return localWithPending;
  }
  const normalizedRemote = normalizeProgress(remote);
  const mergedBase = mergeStudyProgress(remote, localWithPending);
  const merged = pending ? mergedBase : {
    ...mergedBase,
    preferences: {
      ...mergedBase.preferences,
      ...normalizedRemote.preferences,
      totalXP: mergedBase.preferences.totalXP,
    },
  };
  let canonical = merged;
  if (pending || JSON.stringify(merged) !== JSON.stringify(normalizedRemote)) {
    try {
      canonical = mergeStudyProgress(await saveRemoteProgress(sessionId, merged), merged);
      await clearQueuedProgressSync(sessionId);
    } catch {
      await queueProgressSync(sessionId, merged);
    }
  }
  await saveLocalProgress(sessionId, canonical);
  return canonical;
}

const progressSaveTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; version: number }>();
const progressSaveVersions = new Map<string, number>();
const latestScheduledProgress = new Map<string, StudyProgress>();

export function scheduleProgressSync(
  sessionId: string,
  progress: StudyProgress,
  delayMs = 1200,
  onCanonical?: (progress: StudyProgress) => void
) {
  const currentTimer = progressSaveTimers.get(sessionId);
  if (currentTimer) clearTimeout(currentTimer.timer);
  const version = (progressSaveVersions.get(sessionId) ?? 0) + 1;
  const normalized = normalizeEngagementProgress(progress);
  progressSaveVersions.set(sessionId, version);
  latestScheduledProgress.set(sessionId, normalized);
  queueProgressSync(sessionId, normalized).catch(() => {});
  const timer = setTimeout(() => {
    saveRemoteProgress(sessionId, normalized)
      .then(async (canonical) => {
        const latest = latestScheduledProgress.get(sessionId) ?? normalized;
        const reconciled = mergeStudyProgress(canonical, latest);
        await saveLocalProgress(sessionId, reconciled);
        onCanonical?.(reconciled);
        if (progressSaveVersions.get(sessionId) === version) {
          await clearQueuedProgressSync(sessionId);
        } else {
          await queueProgressSync(sessionId, latest);
        }
      })
      .catch(() => {
        queueProgressSync(sessionId, latestScheduledProgress.get(sessionId) ?? normalized).catch(() => {});
      });
    if (progressSaveTimers.get(sessionId)?.version === version) progressSaveTimers.delete(sessionId);
  }, delayMs);
  progressSaveTimers.set(sessionId, { timer, version });
}

export async function flushProgressSync(sessionId: string, progress: StudyProgress): Promise<StudyProgress> {
  const currentTimer = progressSaveTimers.get(sessionId);
  if (currentTimer) {
    clearTimeout(currentTimer.timer);
    progressSaveTimers.delete(sessionId);
  }
  const version = (progressSaveVersions.get(sessionId) ?? 0) + 1;
  const normalized = normalizeEngagementProgress(progress);
  progressSaveVersions.set(sessionId, version);
  latestScheduledProgress.set(sessionId, normalized);
  await queueProgressSync(sessionId, normalized);
  try {
    const canonical = mergeStudyProgress(await saveRemoteProgress(sessionId, normalized), normalized);
    await saveLocalProgress(sessionId, canonical);
    if (progressSaveVersions.get(sessionId) === version) await clearQueuedProgressSync(sessionId);
    return canonical;
  } catch (e) {
    await queueProgressSync(sessionId, normalized);
    throw e;
  }
}

