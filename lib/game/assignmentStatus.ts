import type {
  StudentAssignmentDetail,
  StudentAssignmentType,
  StudyProgress,
  StudyRecord,
} from "../../types/study-game";

export type StudentAssignmentStatus =
  | "not-started"
  | "in-progress"
  | "completed"
  | "mastered"
  | "awaiting-review"
  | "retry-available"
  | "failed"
  | "attempts-exhausted";

export type StudentAssignmentProgress = {
  status: StudentAssignmentStatus;
  label: string;
  ctaLabel: string;
  actionRequired: boolean;
  progressPercent: number;
};

export type LessonAssignmentProgress = StudentAssignmentProgress & {
  practicedCount: number;
  masteredCount: number;
  totalWords: number;
};

export type TestAssignmentProgress = StudentAssignmentProgress & {
  latestResult: StudyRecord | null;
  attemptsRemaining: number | null;
};

type ResumeSnapshot = {
  lessonId?: string | null;
  activeWords?: unknown[] | null;
} | null | undefined;

function cleanIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function cleanInstructions(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 1000) : null;
}

export function assignmentKey(type: StudentAssignmentType, id: string): string {
  return `${type}:${id}`;
}

export function normalizeStudentAssignmentDetails(value: unknown): StudentAssignmentDetail[] {
  if (!Array.isArray(value)) return [];
  const details = new Map<string, StudentAssignmentDetail>();

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const input = raw as Record<string, unknown>;
    const type = input.assignment_type;
    const id = typeof input.assignment_id === "string" ? input.assignment_id.trim() : "";
    if ((type !== "lesson" && type !== "test") || !id) continue;
    const assignedAt = cleanIsoDate(input.assigned_at) ?? new Date(0).toISOString();
    details.set(assignmentKey(type, id), {
      assignment_type: type,
      assignment_id: id,
      due_at: cleanIsoDate(input.due_at),
      instructions: cleanInstructions(input.instructions),
      required: input.required !== false,
      assigned_at: assignedAt,
    });
  }

  return Array.from(details.values());
}

export function attachAssignmentDetails<T extends { id: string }>(
  values: T[],
  type: StudentAssignmentType,
  details: StudentAssignmentDetail[]
): Array<T & { assignment: StudentAssignmentDetail | null }> {
  const byKey = new Map(details.map((detail) => [
    assignmentKey(detail.assignment_type, detail.assignment_id),
    detail,
  ]));
  return values.map((value) => ({
    ...value,
    assignment: byKey.get(assignmentKey(type, value.id)) ?? null,
  }));
}

function historyTimestamp(record: StudyRecord): number {
  const timestamp = new Date(record.date ?? record.timestamp ?? 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number(record.timestamp) || 0;
}

export function getLessonAssignmentProgress({
  lessonId,
  wordIds,
  wordStats,
  practiceHistory,
  savedResume,
}: {
  lessonId: string;
  wordIds: string[];
  wordStats: StudyProgress["wordStats"];
  practiceHistory: StudyRecord[];
  savedResume?: ResumeSnapshot;
}): LessonAssignmentProgress {
  const totalWords = wordIds.length;
  let practicedCount = 0;
  let masteredCount = 0;

  for (const wordId of wordIds) {
    const stats = wordStats[wordId];
    const total = Number(stats?.total) || 0;
    const correct = Number(stats?.correct) || 0;
    if (total > 0) practicedCount += 1;
    if (total >= 3 && correct / total >= 0.8) masteredCount += 1;
  }

  const progressPercent = totalWords > 0
    ? Math.round((practicedCount / totalWords) * 100)
    : 0;
  const hasCompletedSession = practiceHistory.some((record) => (
    record.lessonId === lessonId && record.type !== "test"
  ));
  const hasResume = savedResume?.lessonId === lessonId && (savedResume.activeWords?.length ?? 0) > 0;

  if (totalWords > 0 && masteredCount === totalWords) {
    return {
      status: "mastered",
      label: "Mastered",
      ctaLabel: "Review lesson",
      actionRequired: false,
      progressPercent: 100,
      practicedCount,
      masteredCount,
      totalWords,
    };
  }
  if (hasResume) {
    return {
      status: "in-progress",
      label: "In progress",
      ctaLabel: "Resume lesson",
      actionRequired: true,
      progressPercent,
      practicedCount,
      masteredCount,
      totalWords,
    };
  }
  if (hasCompletedSession) {
    return {
      status: "completed",
      label: "Completed",
      ctaLabel: "Review lesson",
      actionRequired: false,
      progressPercent: 100,
      practicedCount,
      masteredCount,
      totalWords,
    };
  }
  if (practicedCount > 0) {
    return {
      status: "in-progress",
      label: "In progress",
      ctaLabel: "Continue lesson",
      actionRequired: true,
      progressPercent,
      practicedCount,
      masteredCount,
      totalWords,
    };
  }
  return {
    status: "not-started",
    label: "Not started",
    ctaLabel: "Start lesson",
    actionRequired: true,
    progressPercent: 0,
    practicedCount,
    masteredCount,
    totalWords,
  };
}

export function getTestAssignmentProgress({
  testId,
  testHistory,
  attemptsRemaining,
  hasActiveAttempt = false,
  serverStatus = null,
}: {
  testId: string;
  testHistory: StudyRecord[];
  attemptsRemaining?: number | null;
  hasActiveAttempt?: boolean;
  serverStatus?: StudentAssignmentStatus | null;
}): TestAssignmentProgress {
  const normalizedAttempts = Number.isInteger(attemptsRemaining)
    ? Math.max(Number(attemptsRemaining), 0)
    : null;
  const latestResult = testHistory
    .filter((record) => record.lessonId === testId)
    .slice()
    .sort((left, right) => historyTimestamp(right) - historyTimestamp(left))[0] ?? null;

  if (!latestResult) {
    if (hasActiveAttempt || serverStatus === "in-progress") {
      return {
        status: "in-progress",
        label: "In progress",
        ctaLabel: "Resume test",
        actionRequired: true,
        progressPercent: 1,
        latestResult: null,
        attemptsRemaining: normalizedAttempts,
      };
    }
    if (serverStatus === "awaiting-review") {
      return {
        status: "awaiting-review",
        label: "Awaiting teacher review",
        ctaLabel: "View submission",
        actionRequired: false,
        progressPercent: 100,
        latestResult: null,
        attemptsRemaining: normalizedAttempts,
      };
    }
    if (serverStatus === "completed") {
      return {
        status: "completed",
        label: "Passed",
        ctaLabel: "View result",
        actionRequired: false,
        progressPercent: 100,
        latestResult: null,
        attemptsRemaining: normalizedAttempts,
      };
    }
    if (serverStatus === "retry-available") {
      return {
        status: "retry-available",
        label: "Retry available",
        ctaLabel: "Retry test",
        actionRequired: true,
        progressPercent: 100,
        latestResult: null,
        attemptsRemaining: normalizedAttempts,
      };
    }
    if (serverStatus === "failed" || serverStatus === "attempts-exhausted") {
      return {
        status: serverStatus,
        label: serverStatus === "failed" ? "Not passed" : "No attempts remaining",
        ctaLabel: "View result",
        actionRequired: false,
        progressPercent: 100,
        latestResult: null,
        attemptsRemaining: normalizedAttempts,
      };
    }
    const unavailable = normalizedAttempts === 0;
    return {
      status: unavailable ? "attempts-exhausted" : "not-started",
      label: unavailable ? "No attempts remaining" : "Not started",
      ctaLabel: unavailable ? "View test" : "Start test",
      actionRequired: !unavailable,
      progressPercent: 0,
      latestResult: null,
      attemptsRemaining: normalizedAttempts,
    };
  }
  if (latestResult.requiresReview === true || latestResult.reviewStatus === "pending") {
    return {
      status: "awaiting-review",
      label: "Awaiting teacher review",
      ctaLabel: "View submission",
      actionRequired: false,
      progressPercent: 100,
      latestResult,
      attemptsRemaining: normalizedAttempts,
    };
  }

  if (hasActiveAttempt || serverStatus === "in-progress") {
    return {
      status: "in-progress",
      label: "In progress",
      ctaLabel: "Resume test",
      actionRequired: true,
      progressPercent: 1,
      latestResult,
      attemptsRemaining: normalizedAttempts,
    };
  }
  const passingPercentage = Number.isFinite(latestResult.passingPercentage)
    ? Math.min(100, Math.max(1, Number(latestResult.passingPercentage)))
    : 80;
  const passed = latestResult.verified === true && (
    latestResult.passed === true || latestResult.percentage >= passingPercentage
  );
  if (passed) {
    return {
      status: "completed",
      label: "Passed",
      ctaLabel: "View result",
      actionRequired: false,
      progressPercent: 100,
      latestResult,
      attemptsRemaining: normalizedAttempts,
    };
  }
  if (latestResult.verified === true && normalizedAttempts !== 0) {
    return {
      status: "retry-available",
      label: "Retry available",
      ctaLabel: "Retry test",
      actionRequired: true,
      progressPercent: 100,
      latestResult,
      attemptsRemaining: normalizedAttempts,
    };
  }

  if (serverStatus === "retry-available") {
    return {
      status: "retry-available",
      label: "Retry available",
      ctaLabel: "Retry test",
      actionRequired: true,
      progressPercent: 100,
      latestResult,
      attemptsRemaining: normalizedAttempts,
    };
  }
  return {
    status: latestResult.verified === true ? "failed" : "awaiting-review",
    label: latestResult.verified === true ? "Not passed" : "Result syncing",
    ctaLabel: "View result",
    actionRequired: false,
    progressPercent: 100,
    latestResult,
    attemptsRemaining: normalizedAttempts,
  };
}

export type AssignmentDueState = {
  status: "none" | "scheduled" | "due-soon" | "overdue";
  timestamp: number | null;
  label: string | null;
};

export function getAssignmentDueState(
  assignment?: StudentAssignmentDetail | null,
  now = Date.now()
): AssignmentDueState {
  if (!assignment?.due_at) return { status: "none", timestamp: null, label: null };
  const timestamp = Date.parse(assignment.due_at);
  if (!Number.isFinite(timestamp)) return { status: "none", timestamp: null, label: null };
  const status = timestamp < now
    ? "overdue"
    : timestamp <= now + 3 * 24 * 60 * 60 * 1000
      ? "due-soon"
      : "scheduled";
  const label = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(new Date(timestamp).getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}),
  }).format(new Date(timestamp));
  return { status, timestamp, label };
}

export function getAssignmentExpectationLabel(assignment?: StudentAssignmentDetail | null): string {
  const due = getAssignmentDueState(assignment);
  if (due.status === "overdue") return `Overdue - due ${due.label}`;
  if (due.status === "due-soon") return `Due soon - ${due.label}`;
  if (due.label) return `Due ${due.label}`;
  return assignment?.required === false ? "Recommended practice" : "Required assignment";
}

export function compareAssignmentPriority<
  T extends { assignment?: StudentAssignmentDetail | null }
>(left: T, right: T): number {
  const leftRequired = left.assignment?.required !== false;
  const rightRequired = right.assignment?.required !== false;
  if (leftRequired !== rightRequired) return leftRequired ? -1 : 1;
  const leftDue = getAssignmentDueState(left.assignment).timestamp ?? Number.POSITIVE_INFINITY;
  const rightDue = getAssignmentDueState(right.assignment).timestamp ?? Number.POSITIVE_INFINITY;
  if (leftDue !== rightDue) return leftDue - rightDue;
  const leftOrder = Number.isInteger((left as { assignment_order?: unknown }).assignment_order)
    ? Number((left as { assignment_order?: unknown }).assignment_order)
    : Number.POSITIVE_INFINITY;
  const rightOrder = Number.isInteger((right as { assignment_order?: unknown }).assignment_order)
    ? Number((right as { assignment_order?: unknown }).assignment_order)
    : Number.POSITIVE_INFINITY;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return (Date.parse(right.assignment?.assigned_at ?? "") || 0)
    - (Date.parse(left.assignment?.assigned_at ?? "") || 0);
}
