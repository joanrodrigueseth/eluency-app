import { getApiBaseUrl } from "./config";
import type {
  LessonGamePayload,
  StudentSessionPayload,
  StudyProgress,
  TestGamePayload,
  VerifiedTestAttempt,
  VerifyAnswerPayload,
  VerifyAnswerResult,
} from "../../types/study-game";

const apiBaseUrl = getApiBaseUrl();

/** RN-compatible random token. `crypto.randomUUID` may be unavailable on Hermes. */
function randomToken(): string {
  const rand = `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
  return `${Date.now().toString(36)}-${rand}`;
}

/** RN/Android can cache GETs; lessons/tests must reflect dashboard edits immediately. */
function fetchNoStore(pathAndQuery: string): Promise<Response> {
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const token = randomToken();
  // Two independent cache-bust params: `_=timestamp` + `r=uuid-like`. Both in URL so any
  // intermediate (CDN, OkHttp, RN-fetch polyfill) treats each call as a brand new resource.
  const url = `${apiBaseUrl}${pathAndQuery}${sep}_=${Date.now()}&r=${token}`;
  return fetch(url, {
    headers: {
      "Cache-Control": "no-cache, no-store",
      Pragma: "no-cache",
      // Some Android HTTP stacks still cache GETs; vary headers so each request is unique.
      "X-Request-Nonce": token,
    },
    cache: "no-store",
  } as RequestInit);
}

async function parseJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getStudentSession(sessionId: string): Promise<StudentSessionPayload> {
  const res = await fetchNoStore(`/api/students/session?session=${encodeURIComponent(sessionId)}`);
  const json = await parseJsonSafe<StudentSessionPayload & { error?: string }>(res);
  if (!res.ok || !json || (json as any).error) {
    throw new Error((json as any)?.error ?? "Failed to load student session");
  }
  return json;
}

export async function getAssignedLessons(sessionId: string, lessonIds: string[]): Promise<LessonGamePayload[]> {
  if (!lessonIds.length) return [];
  const res = await fetchNoStore(`/api/lessons?session=${encodeURIComponent(sessionId)}&lessonIds=${encodeURIComponent(lessonIds.join(","))}`);
  const json = await parseJsonSafe<{ data?: LessonGamePayload[]; error?: string }>(res);
  if (!res.ok || !json || json.error) throw new Error(json?.error ?? "Failed to load lessons");
  return Array.isArray(json.data) ? json.data : [];
}

export async function getAssignedTests(sessionId: string, testIds: string[]): Promise<TestGamePayload[]> {
  if (!testIds.length) return [];
  const res = await fetchNoStore(`/api/tests?session=${encodeURIComponent(sessionId)}&testIds=${encodeURIComponent(testIds.join(","))}`);
  const json = await parseJsonSafe<{ data?: TestGamePayload[]; error?: string }>(res);
  if (!res.ok || !json || json.error) throw new Error(json?.error ?? "Failed to load tests");
  return Array.isArray(json.data) ? json.data : [];
}

export async function getRemoteProgress(sessionId: string): Promise<StudyProgress | null> {
  const res = await fetchNoStore(`/api/game/progress?session=${encodeURIComponent(sessionId)}`);
  const json = await parseJsonSafe<{ progress?: StudyProgress; error?: string }>(res);
  if (!res.ok) return null;
  return json?.progress ?? null;
}

export async function saveRemoteProgress(sessionId: string, progress: StudyProgress): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/api/game/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, progress }),
  });
  if (!res.ok) {
    const json = await parseJsonSafe<{ error?: string }>(res);
    throw new Error(json?.error ?? "Failed to sync progress");
  }
}

export async function revokeStudentSession(sessionId: string): Promise<void> {
  await fetch(`${apiBaseUrl}/api/students/session`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {});
}

export async function submitTestAttempt(input: {
  sessionId: string;
  testId: string;
  attemptKey: string;
  mode: "typing" | "multiple-choice" | "listening" | "image";
  direction: "pt-en" | "en-pt";
  startedAt?: string | null;
  answers: Array<{ questionIndex: number; answer: string; selectedOptionId?: string | null }>;
}): Promise<VerifiedTestAttempt> {
  const res = await fetch(`${apiBaseUrl}/api/game/test-attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, completedAt: new Date().toISOString() }),
  });
  const json = await parseJsonSafe<{ attempt?: VerifiedTestAttempt; error?: string }>(res);
  if (!res.ok || !json?.attempt) throw new Error(json?.error ?? "Test attempt could not be verified");
  return json.attempt;
}

export async function verifyAnswer(payload: VerifyAnswerPayload): Promise<VerifyAnswerResult | null> {
  const res = await fetch(`${apiBaseUrl}/api/game/verify-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await parseJsonSafe<VerifyAnswerResult & { error?: string; fallback?: boolean }>(res);
  if (!res.ok || !json || (json as any).error) return null;
  return json;
}

export async function requestTtsBase64(
  text: string,
  sessionId: string,
  lang = "pt-BR"
): Promise<{ mimeType: string; data?: string; url?: string } | null> {
  const res = await fetch(`${apiBaseUrl}/api/ai/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang, session: sessionId }),
  });
  const json = await parseJsonSafe<{ mimeType?: string; data?: string; url?: string; audioUrl?: string; error?: string }>(res);
  const playableUrl = json?.url ?? json?.audioUrl;
  if (!res.ok || !json || json.error || (!json.data && !playableUrl)) return null;
  return { mimeType: json.mimeType ?? "audio/wav", data: json.data, url: playableUrl };
}

