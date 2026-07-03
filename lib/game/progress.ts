import AsyncStorage from "@react-native-async-storage/async-storage";

import { getRemoteProgress, saveRemoteProgress } from "../api/study";
import type { StudyProgress } from "../../types/study-game";

const STORAGE_KEY = "eluency-study-game-progress-v1";
const PENDING_SYNC_KEY = "eluency-study-game-pending-sync-v1";

function progressStorageKey(sessionId: string): string {
  return `${STORAGE_KEY}:${sessionId}`;
}

function pendingSyncStorageKey(sessionId: string): string {
  return `${PENDING_SYNC_KEY}:${sessionId}`;
}

export const DEFAULT_PROGRESS: StudyProgress = {
  preferences: { darkMode: false, hapticEnabled: true, practiceLength: 15 },
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

export async function loadLocalProgress(sessionId: string): Promise<StudyProgress> {
  try {
    const raw = await AsyncStorage.getItem(progressStorageKey(sessionId));
    if (!raw) return DEFAULT_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<StudyProgress>;
    return {
      ...DEFAULT_PROGRESS,
      ...parsed,
      preferences: { ...DEFAULT_PROGRESS.preferences, ...(parsed.preferences ?? {}) },
      dailyChallenge: { ...DEFAULT_PROGRESS.dailyChallenge, ...(parsed.dailyChallenge ?? {}) },
      userStats: { ...DEFAULT_PROGRESS.userStats, ...(parsed.userStats ?? {}) },
      practiceHistory: Array.isArray(parsed.practiceHistory) ? parsed.practiceHistory : [],
      testHistory: Array.isArray(parsed.testHistory) ? parsed.testHistory : [],
      wordStats: parsed.wordStats ?? {},
      wordMeta: parsed.wordMeta ?? {},
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
    };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export async function saveLocalProgress(sessionId: string, progress: StudyProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(progressStorageKey(sessionId), JSON.stringify(progress));
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

export async function flushQueuedProgressSync(sessionId: string, fallbackProgress?: StudyProgress): Promise<boolean> {
  const pending = (await loadPendingProgressSync(sessionId)) ?? fallbackProgress ?? null;
  if (!pending) return true;
  try {
    await saveRemoteProgress(sessionId, pending);
    await clearQueuedProgressSync(sessionId);
    return true;
  } catch {
    await queueProgressSync(sessionId, pending);
    return false;
  }
}

export async function hydrateProgress(sessionId: string): Promise<StudyProgress> {
  const local = await loadLocalProgress(sessionId);
  const pending = await loadPendingProgressSync(sessionId);
  if (pending) {
    const synced = await flushQueuedProgressSync(sessionId, pending);
    if (!synced) return pending;
    await saveLocalProgress(sessionId, pending);
    return pending;
  }
  const remote = await getRemoteProgress(sessionId);
  if (!remote) return local;
  const merged: StudyProgress = {
    ...local,
    ...remote,
    preferences: { ...local.preferences, ...(remote.preferences ?? {}) },
    dailyChallenge: { ...local.dailyChallenge, ...(remote.dailyChallenge ?? {}) },
    userStats: { ...local.userStats, ...(remote.userStats ?? {}) },
    practiceHistory: Array.isArray(remote.practiceHistory) ? remote.practiceHistory : local.practiceHistory,
    testHistory: Array.isArray(remote.testHistory) ? remote.testHistory : local.testHistory,
    wordStats: remote.wordStats ?? local.wordStats,
    wordMeta: remote.wordMeta ?? local.wordMeta,
    achievements: Array.isArray(remote.achievements) ? remote.achievements : local.achievements,
  };
  await saveLocalProgress(sessionId, merged);
  return merged;
}

let progressSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleProgressSync(sessionId: string, progress: StudyProgress, delayMs = 1200) {
  if (progressSaveTimer) clearTimeout(progressSaveTimer);
  progressSaveTimer = setTimeout(() => {
    saveRemoteProgress(sessionId, progress)
      .then(() => clearQueuedProgressSync(sessionId))
      .catch(() => {
        queueProgressSync(sessionId, progress).catch(() => {});
      });
    progressSaveTimer = null;
  }, delayMs);
}

export async function flushProgressSync(sessionId: string, progress: StudyProgress) {
  if (progressSaveTimer) {
    clearTimeout(progressSaveTimer);
    progressSaveTimer = null;
  }
  try {
    await saveRemoteProgress(sessionId, progress);
    await clearQueuedProgressSync(sessionId);
  } catch (e) {
    await queueProgressSync(sessionId, progress);
    throw e;
  }
}

