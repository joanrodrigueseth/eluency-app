import type { StudyRecord } from "../../types/study-game";

export type StudentTestResultPresentation = {
  state: "awaiting-review" | "syncing" | "final";
  label: string;
  percentage: number | null;
  passed: boolean | null;
  passingPercentage: number;
  correct: number;
  total: number;
};

function clampPercentage(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(100, Math.max(0, Math.round(numeric)))
    : fallback;
}

export function getStudentTestResultPresentation(
  record: StudyRecord | null | undefined
): StudentTestResultPresentation | null {
  if (!record) return null;

  const passingPercentage = Math.max(1, clampPercentage(record.passingPercentage, 80));
  const correct = Math.max(0, Number(record.score) || 0);
  const total = Math.max(0, Number(record.totalWords) || 0);

  if (record.requiresReview === true || record.reviewStatus === "pending") {
    return {
      state: "awaiting-review",
      label: "Awaiting teacher review",
      percentage: null,
      passed: null,
      passingPercentage,
      correct,
      total,
    };
  }

  if (record.verified !== true) {
    return {
      state: "syncing",
      label: "Result syncing",
      percentage: null,
      passed: null,
      passingPercentage,
      correct,
      total,
    };
  }

  const percentage = clampPercentage(record.percentage, 0);
  const passed = record.passed === true || percentage >= passingPercentage;
  return {
    state: "final",
    label: passed ? "Passed" : "Not passed",
    percentage,
    passed,
    passingPercentage,
    correct,
    total,
  };
}
