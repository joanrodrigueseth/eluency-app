import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

import { getApiBaseUrl } from "../api/config";
import type { LessonGamePayload, StudentSessionPayload, TestGamePayload } from "../../types/study-game";

const OFFLINE_INDEX_KEY = "eluency-offline-lessons-index-v1";
const OFFLINE_SESSION_KEY = "eluency-offline-study-session-v1";
const API_BASE = getApiBaseUrl().replace(/\/$/, "");

export type OfflineLessonSummary = {
  id: string;
  name: string;
  updated_at?: string | null;
  downloadedAt: string;
  bytes: number;
  wordCount: number;
  path: string;
};

type OfflineIndex = {
  lessons: Record<string, OfflineLessonSummary>;
};

type OfflineCatalog = {
  session: StudentSessionPayload | null;
  lessons: LessonGamePayload[];
  tests: TestGamePayload[];
};

function storageRoot(): string {
  const base = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!base) throw new Error("Offline storage is not available on this device.");
  return `${base.replace(/\/$/, "")}/eluency/offline-study`;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function sessionRoot(sessionId: string): string {
  return `${storageRoot()}/${safeSegment(sessionId)}`;
}

function lessonRoot(sessionId: string, lessonId: string): string {
  return `${sessionRoot(sessionId)}/lessons/${safeSegment(lessonId)}`;
}

function sessionSnapshotKey(sessionId: string): string {
  return `${OFFLINE_SESSION_KEY}:${sessionId}`;
}

function indexKey(sessionId: string): string {
  return `${OFFLINE_INDEX_KEY}:${sessionId}`;
}

function cloneLesson(lesson: LessonGamePayload): LessonGamePayload {
  return JSON.parse(JSON.stringify(lesson)) as LessonGamePayload;
}

function isLocalUri(uri?: string | null): boolean {
  return typeof uri === "string" && /^(file|content|asset):\/\//i.test(uri.trim());
}

function absoluteDownloadUrl(raw?: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || isLocalUri(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return `${API_BASE}${trimmed}`;
  return null;
}

function extensionFor(url: string, fallback: string): string {
  const clean = url.split("?")[0]?.split("#")[0] ?? "";
  const match = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
  if (match) return match[1].toLowerCase();
  return fallback;
}

function fallbackExtension(kind: "image" | "audio" | "pdf" | "asset"): string {
  if (kind === "image") return "jpg";
  if (kind === "audio") return "mp3";
  if (kind === "pdf") return "pdf";
  return "bin";
}

async function ensureDir(uri: string): Promise<void> {
  await FileSystem.makeDirectoryAsync(uri, { intermediates: true }).catch(() => {});
}

async function readIndex(sessionId: string): Promise<OfflineIndex> {
  try {
    const raw = await AsyncStorage.getItem(indexKey(sessionId));
    if (!raw) return { lessons: {} };
    const parsed = JSON.parse(raw) as Partial<OfflineIndex>;
    return { lessons: parsed.lessons ?? {} };
  } catch {
    return { lessons: {} };
  }
}

async function writeIndex(sessionId: string, index: OfflineIndex): Promise<void> {
  await AsyncStorage.setItem(indexKey(sessionId), JSON.stringify(index));
}

async function folderSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri, { size: true }).catch(() => null);
  return info?.exists && typeof info.size === "number" ? info.size : 0;
}

async function downloadAsset(
  source: string | undefined | null,
  targetDir: string,
  fileBase: string,
  kind: "image" | "audio" | "pdf" | "asset",
  seen: Map<string, string>
): Promise<string | undefined | null> {
  const absolute = absoluteDownloadUrl(source);
  if (!absolute) return source;
  const existing = seen.get(absolute);
  if (existing) return existing;

  const ext = extensionFor(absolute, fallbackExtension(kind));
  const target = `${targetDir}/${safeSegment(fileBase)}.${ext}`;
  const result = await FileSystem.downloadAsync(absolute, target, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Could not download ${fileBase}.`);
  }
  seen.set(absolute, result.uri);
  return result.uri;
}

export async function saveOfflineSessionSnapshot(sessionId: string, session: StudentSessionPayload): Promise<void> {
  await AsyncStorage.setItem(sessionSnapshotKey(sessionId), JSON.stringify(session));
}

export async function loadOfflineSessionSnapshot(sessionId: string): Promise<StudentSessionPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(sessionSnapshotKey(sessionId));
    return raw ? (JSON.parse(raw) as StudentSessionPayload) : null;
  } catch {
    return null;
  }
}

export async function getOfflineLessonSummaries(sessionId: string): Promise<Record<string, OfflineLessonSummary>> {
  return (await readIndex(sessionId)).lessons;
}

export async function loadOfflineStudyCatalog(sessionId: string): Promise<OfflineCatalog> {
  const [index, session] = await Promise.all([readIndex(sessionId), loadOfflineSessionSnapshot(sessionId)]);
  const lessons: LessonGamePayload[] = [];

  for (const summary of Object.values(index.lessons)) {
    try {
      const raw = await FileSystem.readAsStringAsync(summary.path);
      lessons.push(JSON.parse(raw) as LessonGamePayload);
    } catch {
      // Skip missing/corrupt local packages; the index will be repaired on the next download/remove.
    }
  }

  return { session, lessons, tests: [] };
}

export async function downloadLessonForOffline(
  sessionId: string,
  lesson: LessonGamePayload,
  session?: StudentSessionPayload | null
): Promise<OfflineLessonSummary> {
  if (session) await saveOfflineSessionSnapshot(sessionId, session);

  const root = lessonRoot(sessionId, lesson.id);
  const assetsDir = `${root}/assets`;
  await ensureDir(assetsDir);

  const seen = new Map<string, string>();
  const offlineLesson = cloneLesson(lesson);

  offlineLesson.cover_image_url = (await downloadAsset(
    offlineLesson.cover_image_url,
    assetsDir,
    "cover",
    "image",
    seen
  )) as string | null | undefined;

  offlineLesson.document_url = (await downloadAsset(
    offlineLesson.document_url,
    assetsDir,
    "document",
    "pdf",
    seen
  )) as string | undefined;

  const offlineWords: LessonGamePayload["words"] = [];
  for (let index = 0; index < (offlineLesson.words ?? []).length; index += 1) {
    const word = (offlineLesson.words ?? [])[index];
    const next = { ...word };
    const label = safeSegment(next.id ?? `${index}`);
    next.image_url = (await downloadAsset(next.image_url, assetsDir, `word-${label}-image`, "image", seen)) as
      | string
      | undefined;
    next.img = (await downloadAsset(next.img, assetsDir, `word-${label}-img`, "image", seen)) as string | undefined;
    next.audio_url = (await downloadAsset(next.audio_url, assetsDir, `word-${label}-audio`, "audio", seen)) as
      | string
      | null
      | undefined;
    offlineWords.push(next);
  }
  offlineLesson.words = offlineWords;

  const payloadPath = `${root}/lesson.json`;
  await FileSystem.writeAsStringAsync(payloadPath, JSON.stringify(offlineLesson));

  const summary: OfflineLessonSummary = {
    id: lesson.id,
    name: lesson.name,
    updated_at: lesson.updated_at ?? null,
    downloadedAt: new Date().toISOString(),
    bytes: await folderSize(root),
    wordCount: Array.isArray(lesson.words) ? lesson.words.length : 0,
    path: payloadPath,
  };

  const index = await readIndex(sessionId);
  index.lessons[lesson.id] = summary;
  await writeIndex(sessionId, index);
  return summary;
}

export async function removeOfflineLesson(sessionId: string, lessonId: string): Promise<void> {
  const root = lessonRoot(sessionId, lessonId);
  await FileSystem.deleteAsync(root, { idempotent: true }).catch(() => {});
  const index = await readIndex(sessionId);
  delete index.lessons[lessonId];
  await writeIndex(sessionId, index);
}

export function isDownloadedLessonStale(lesson: LessonGamePayload, summary?: OfflineLessonSummary | null): boolean {
  if (!summary) return false;
  const remoteVersion = lesson.updated_at?.trim();
  const localVersion = summary.updated_at?.trim();
  return Boolean(remoteVersion && localVersion && remoteVersion !== localVersion);
}
