import { getApiBaseUrl } from "./config";
import { requestWithTimeout } from "./request";
import type {
  ActiveTestAttemptSession,
  LessonGamePayload,
  StudentSessionPayload,
  StudentClassroom,
  StudyProgress,
  TestGamePayload,
  TestAttemptAnswer,
  VerifiedTestAttempt,
  VerifyAnswerPayload,
  VerifyAnswerResult,
} from "../../types/study-game";

const apiBaseUrl = getApiBaseUrl();

export class StudyApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "StudyApiError";
    this.status = status;
  }
}

export function isRetryableStudyApiError(error: unknown): boolean {
  return !(error instanceof StudyApiError) || error.status == null || error.status >= 500;
}

function normalizeOptionalDateTime(value: string | number | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === "number"
      ? value
      : Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeTestAttemptAnswers(answers: TestAttemptAnswer[]): TestAttemptAnswer[] {
  return answers.flatMap((answer) => {
    const questionIndex = Number((answer as { questionIndex?: unknown }).questionIndex);
    if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex > 499) return [];
    return [{
      questionIndex,
      answer: String(answer?.answer ?? ""),
      selectedOptionId: answer?.selectedOptionId == null
        ? null
        : String(answer.selectedOptionId),
    }];
  });
}

/** RN-compatible random token. `crypto.randomUUID` may be unavailable on Hermes. */
function randomToken(): string {
  const rand = `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
  return `${Date.now().toString(36)}-${rand}`;
}

/** RN/Android can cache GETs; lessons/tests must reflect dashboard edits immediately. */
function fetchNoStore(pathAndQuery: string, signal?: AbortSignal): Promise<Response> {
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const token = randomToken();
  // Two independent cache-bust params: `_=timestamp` + `r=uuid-like`. Both in URL so any
  // intermediate (CDN, OkHttp, RN-fetch polyfill) treats each call as a brand new resource.
  const url = `${apiBaseUrl}${pathAndQuery}${sep}_=${Date.now()}&r=${token}`;
  return requestWithTimeout(url, {
    signal,
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

export async function getStudentSession(sessionId: string, signal?: AbortSignal): Promise<StudentSessionPayload> {
  const res = await fetchNoStore(`/api/students/session?session=${encodeURIComponent(sessionId)}`, signal);
  const json = await parseJsonSafe<StudentSessionPayload & { error?: string }>(res);
  if (!res.ok || !json || (json as any).error) {
    throw new StudyApiError((json as any)?.error ?? "Failed to load student session", res.status);
  }
  return json;
}

export async function getStudentClassrooms(sessionId: string, signal?: AbortSignal): Promise<StudentClassroom[]> {
  const res = await fetchNoStore(`/api/students/classrooms?session=${encodeURIComponent(sessionId)}`, signal);
  const json = await parseJsonSafe<{ classrooms?: StudentClassroom[]; error?: string }>(res);
  if (!res.ok || !json || json.error || !Array.isArray(json.classrooms)) {
    throw new StudyApiError(json?.error ?? "Your classrooms could not be loaded. Pull down to retry.", res.status);
  }
  return json.classrooms;
}

export async function getAssignedLessons(sessionId: string, lessonIds: string[], signal?: AbortSignal): Promise<LessonGamePayload[]> {
  if (!lessonIds.length) return [];
  const res = await fetchNoStore(`/api/lessons?session=${encodeURIComponent(sessionId)}&lessonIds=${encodeURIComponent(lessonIds.join(","))}`, signal);
  const json = await parseJsonSafe<{ data?: LessonGamePayload[]; error?: string }>(res);
  if (!res.ok || !json || json.error) throw new StudyApiError(json?.error ?? "Failed to load lessons", res.status);
  return Array.isArray(json.data) ? json.data : [];
}

export async function getAssignedTests(sessionId: string, testIds: string[], signal?: AbortSignal): Promise<TestGamePayload[]> {
  if (!testIds.length) return [];
  const res = await fetchNoStore(`/api/tests?session=${encodeURIComponent(sessionId)}&testIds=${encodeURIComponent(testIds.join(","))}`, signal);
  const json = await parseJsonSafe<{ data?: TestGamePayload[]; error?: string }>(res);
  if (!res.ok || !json || json.error) throw new StudyApiError(json?.error ?? "Failed to load tests", res.status);
  return Array.isArray(json.data) ? json.data : [];
}

export async function getRemoteProgress(sessionId: string): Promise<StudyProgress | null> {
  const res = await fetchNoStore(`/api/game/progress?session=${encodeURIComponent(sessionId)}`);
  const json = await parseJsonSafe<{ progress?: StudyProgress; error?: string }>(res);
  if (!res.ok) return null;
  return json?.progress ?? null;
}

export async function saveRemoteProgress(sessionId: string, progress: StudyProgress): Promise<StudyProgress> {
  const res = await requestWithTimeout(`${apiBaseUrl}/api/game/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, progress }),
  });
  const json = await parseJsonSafe<{ progress?: StudyProgress; error?: string }>(res);
  if (!res.ok) {
    throw new Error(json?.error ?? "Failed to sync progress");
  }
  // Current servers return the canonical merged payload. Falling back keeps
  // staged mobile releases compatible with an older API during deployment.
  return json?.progress ?? progress;
}

export async function revokeStudentSession(sessionId: string, signal?: AbortSignal): Promise<void> {
  await requestWithTimeout(`${apiBaseUrl}/api/students/session`, {
    signal,
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {});
}

export async function notifyLessonCompletion(input: {
  sessionId: string;
  attemptId: string;
  contentName?: string | null;
  score: number;
  passed: boolean;
}): Promise<void> {
  const res = await requestWithTimeout(`${apiBaseUrl}/api/game/completion-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const json = await parseJsonSafe<{ error?: string }>(res);
    throw new StudyApiError(json?.error ?? "Lesson completion notification could not be delivered", res.status);
  }
}

export type SubmitTestAttemptInput = {
  sessionId: string;
  testId: string;
  attemptKey: string;
  mode: "typing" | "multiple-choice" | "listening" | "image";
  direction: "pt-en" | "en-pt";
  startedAt?: string | null;
  completedAt?: string | null;
  answers: TestAttemptAnswer[];
};

export type StartTestAttemptInput = {
  sessionId: string;
  testId: string;
  mode: SubmitTestAttemptInput["mode"];
  direction: SubmitTestAttemptInput["direction"];
};

export async function startTestAttempt(input: StartTestAttemptInput): Promise<ActiveTestAttemptSession> {
  const res = await requestWithTimeout(`${apiBaseUrl}/api/game/test-attempts`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await parseJsonSafe<{ attemptSession?: ActiveTestAttemptSession; error?: string }>(res);
  if (!res.ok || !json?.attemptSession) {
    throw new StudyApiError(json?.error ?? "Test session could not be started", res.status);
  }
  return json.attemptSession;
}

export async function saveTestAttemptDraft(input: {
  sessionId: string;
  testId: string;
  attemptKey: string;
  answers: TestAttemptAnswer[];
}): Promise<void> {
  const res = await requestWithTimeout(`${apiBaseUrl}/api/game/test-attempts`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      sessionId: String(input.sessionId ?? "").trim(),
      testId: String(input.testId ?? "").trim(),
      attemptKey: String(input.attemptKey ?? "").trim(),
      answers: normalizeTestAttemptAnswers(input.answers),
    }),
  });
  if (!res.ok) {
    const json = await parseJsonSafe<{ error?: string }>(res);
    throw new StudyApiError(json?.error ?? "Test answers could not be saved", res.status);
  }
}

export async function submitTestAttempt(input: SubmitTestAttemptInput): Promise<VerifiedTestAttempt> {
  const startedAt = normalizeOptionalDateTime(input.startedAt);
  const completedAt = normalizeOptionalDateTime(input.completedAt) ?? new Date().toISOString();
  const res = await requestWithTimeout(`${apiBaseUrl}/api/game/test-attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      sessionId: String(input.sessionId ?? "").trim(),
      testId: String(input.testId ?? "").trim(),
      attemptKey: String(input.attemptKey ?? "").trim(),
      startedAt,
      completedAt,
      answers: normalizeTestAttemptAnswers(input.answers),
    }),
  });
  const json = await parseJsonSafe<{ attempt?: VerifiedTestAttempt; error?: string }>(res);
  if (!res.ok || !json?.attempt) {
    throw new StudyApiError(json?.error ?? "Test attempt could not be verified", res.status);
  }
  return json.attempt;
}

export async function recordResultEvent(input: {
  sessionId: string;
  resultKey: string;
  resultType: "lesson" | "test";
  eventType: "result_opened" | "review_started" | "review_completed" | "follow_up_started" | "follow_up_completed";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const res = await requestWithTimeout(`${apiBaseUrl}/api/game/result-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const json = await parseJsonSafe<{ error?: string }>(res);
    throw new StudyApiError(json?.error ?? "Result activity could not be saved", res.status);
  }
}

export type StudentFocusIntervention = {
  id: string;
  sourceResultKey?: string | null;
  lessonId?: string | null;
  focusKey: string;
  focusPrompt: string;
  focusAnswer?: string | null;
  note?: string | null;
  status: "assigned" | "in_progress" | "completed";
  completedModes: Array<"multiple-choice" | "typing" | "listening">;
  assignedAt: string;
  completedAt?: string | null;
};

export async function getStudentFocusInterventions(
  sessionId: string,
  signal?: AbortSignal
): Promise<StudentFocusIntervention[]> {
  const res = await fetchNoStore(
    `/api/game/result-interventions?session=${encodeURIComponent(sessionId)}`,
    signal
  );
  const json = await parseJsonSafe<{ interventions?: StudentFocusIntervention[]; error?: string }>(res);
  if (!res.ok) {
    throw new StudyApiError(json?.error ?? "Teacher focus plan could not be loaded", res.status);
  }
  return Array.isArray(json?.interventions) ? json.interventions : [];
}

export async function updateStudentFocusIntervention(input: {
  sessionId: string;
  interventionId: string;
  status?: "in_progress";
  completedMode?: "multiple-choice" | "typing" | "listening";
}): Promise<StudentFocusIntervention> {
  const res = await requestWithTimeout(`${apiBaseUrl}/api/game/result-interventions`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const json = await parseJsonSafe<{ error?: string }>(res);
    throw new StudyApiError(json?.error ?? "Teacher focus plan could not be updated", res.status);
  }
  const json = await parseJsonSafe<{ intervention?: StudentFocusIntervention; error?: string }>(res);
  if (!json?.intervention) {
    throw new StudyApiError("Teacher focus plan returned an invalid update", res.status);
  }
  return json.intervention;
}

export async function verifyAnswer(payload: VerifyAnswerPayload): Promise<VerifyAnswerResult | null> {
  const res = await requestWithTimeout(`${apiBaseUrl}/api/game/verify-answer`, {
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
  const res = await requestWithTimeout(`${apiBaseUrl}/api/ai/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang, session: sessionId }),
  });
  const json = await parseJsonSafe<{ mimeType?: string; data?: string; url?: string; audioUrl?: string; error?: string }>(res);
  const playableUrl = json?.url ?? json?.audioUrl;
  if (!res.ok || !json || json.error || (!json.data && !playableUrl)) return null;
  return { mimeType: json.mimeType ?? "audio/wav", data: json.data, url: playableUrl };
}

