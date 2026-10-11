import assert from "node:assert/strict";
import test from "node:test";

import { getTestAssignmentProgress } from "../lib/game/assignmentStatus.ts";
import { getStudentTestResultPresentation } from "../lib/game/resultPresentation.ts";
import type { StudyRecord } from "../types/study-game.ts";

function testRecord(overrides: Partial<StudyRecord> = {}): StudyRecord {
  return {
    id: "attempt-1",
    date: "2026-08-05T12:00:00.000Z",
    timestamp: Date.parse("2026-08-05T12:00:00.000Z"),
    type: "test",
    mode: "typing",
    lessonId: "test-1",
    lessonName: "Placement check",
    score: 1,
    totalWords: 2,
    percentage: 50,
    direction: "pt-en",
    ...overrides,
  };
}

test("mobile hides preliminary scores while teacher review is pending", () => {
  const record = testRecord({
    verified: false,
    requiresReview: true,
    reviewStatus: "pending",
  });

  const presentation = getStudentTestResultPresentation(record);
  const assignment = getTestAssignmentProgress({
    testId: "test-1",
    testHistory: [record],
    attemptsRemaining: 1,
  });

  assert.equal(presentation?.state, "awaiting-review");
  assert.equal(presentation?.percentage, null);
  assert.equal(presentation?.passed, null);
  assert.equal(assignment.status, "awaiting-review");
  assert.equal(assignment.ctaLabel, "View submission");
  assert.equal(assignment.actionRequired, false);
});

test("mobile uses the stored passing threshold after teacher review", () => {
  const record = testRecord({
    percentage: 85,
    passingPercentage: 90,
    passed: false,
    verified: true,
    requiresReview: false,
    reviewStatus: "finalized",
  });

  const presentation = getStudentTestResultPresentation(record);
  const assignment = getTestAssignmentProgress({
    testId: "test-1",
    testHistory: [record],
    attemptsRemaining: 1,
  });

  assert.equal(presentation?.state, "final");
  assert.equal(presentation?.label, "Not passed");
  assert.equal(presentation?.passingPercentage, 90);
  assert.equal(assignment.status, "retry-available");
  assert.equal(assignment.ctaLabel, "Retry test");
});

test("mobile treats a finalized passing result as completed", () => {
  const record = testRecord({
    percentage: 80,
    passingPercentage: 80,
    passed: true,
    verified: true,
    requiresReview: false,
    reviewStatus: "finalized",
  });

  const assignment = getTestAssignmentProgress({
    testId: "test-1",
    testHistory: [record],
    attemptsRemaining: 0,
  });

  assert.equal(assignment.status, "completed");
  assert.equal(assignment.label, "Passed");
  assert.equal(assignment.actionRequired, false);
});

test("mobile preserves canonical server states before local history refreshes", () => {
  assert.equal(getTestAssignmentProgress({
    testId: "test-1",
    testHistory: [],
    attemptsRemaining: 1,
    serverStatus: "awaiting-review",
  }).status, "awaiting-review");

  assert.equal(getTestAssignmentProgress({
    testId: "test-1",
    testHistory: [],
    attemptsRemaining: 0,
    serverStatus: "completed",
  }).status, "completed");

  assert.equal(getTestAssignmentProgress({
    testId: "test-1",
    testHistory: [],
    attemptsRemaining: 0,
  }).status, "attempts-exhausted");
});
