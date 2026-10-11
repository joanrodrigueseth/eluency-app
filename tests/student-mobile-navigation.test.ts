import assert from "node:assert/strict";
import test from "node:test";
import { getStudentNotificationDestination } from "../lib/studentMobileNavigation.ts";

test("student assignment notifications use the active student session", () => {
  for (const type of ["student_assignment", "assignment_reminder"]) {
    assert.deepEqual(getStudentNotificationDestination({ type, student_id: "student-one" }, "current-session", "push-1", "student-one"), {
      sessionId: "current-session", notificationId: "push-1",
    });
  }
});

test("review notifications open student tests rather than teacher results", () => {
  assert.deepEqual(getStudentNotificationDestination({ type: "student_result_reviewed", student_id: "student-one" }, "student", "review", "student-one"), {
    sessionId: "student", notificationId: "review", initialTab: "tests",
  });
});

test("shared-device notifications require a matching recipient", () => {
  for (const type of ["student_assignment", "assignment_reminder", "student_result_reviewed"]) {
    assert.equal(getStudentNotificationDestination({ type, student_id: "old-student" }, "new-session", "push", "new-student"), null);
    assert.equal(getStudentNotificationDestination({ type }, "new-session", "push", "new-student"), null);
  }
});

test("teacher and unknown notifications cannot enter the student workspace", () => {
  for (const type of ["lesson_completed", "test_completed", "admin_announcement", "review_required", "unknown"]) {
    assert.equal(getStudentNotificationDestination({ type, student_id: "another-student" }, "student", "push"), null);
  }
});

test("signed-out users cannot open study through a notification", () => {
  for (const type of ["student_assignment", "assignment_reminder", "student_result_reviewed"]) {
    assert.equal(getStudentNotificationDestination({ type }, null, "push"), null);
  }
});
