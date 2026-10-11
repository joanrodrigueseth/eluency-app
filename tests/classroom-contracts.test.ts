import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadMobileModule } from "./helpers/load-mobile-module.ts";
import type { StudentClassroom } from "../types/study-game.ts";

import {
  getClassroomNamesForAssignment,
  scopeStudentCatalog,
} from "../lib/classroomContracts.ts";

test("classroom names remain unique and stable for assignment pills", () => {
  assert.deepEqual(getClassroomNamesForAssignment([
    { assignmentType: "lesson", contentId: "lesson-1", classroomId: "b", classroomName: "Monday" },
    { assignmentType: "lesson", contentId: "lesson-1", classroomId: "a", classroomName: "Conversation" },
    { assignmentType: "lesson", contentId: "lesson-1", classroomId: "c", classroomName: "Monday" },
  ], "lesson", "lesson-1"), ["Conversation", "Monday"]);
});

const classes: StudentClassroom[] = [
  { id: "a", name: "Portuguese", assignments: [
    { id: "assignment-a", type: "lesson", contentId: "shared", dueAt: "2026-10-15", instructions: "Class A instructions", assignedAt: "2026-10-11" },
    { id: "test-a", type: "test", contentId: "quiz-a", dueAt: null, instructions: null, assignedAt: "2026-10-11" },
  ] },
  { id: "b", name: "Portuguese", assignments: [
    { id: "assignment-b", type: "lesson", contentId: "shared", dueAt: null, instructions: "Class B instructions", assignedAt: "2026-10-10" },
    { id: "private-b", type: "lesson", contentId: "lesson-b", dueAt: null, instructions: null, assignedAt: "2026-10-10" },
  ] },
  { id: "empty", name: "New class", assignments: [] },
];

test("classrooms scope by ID, not shared names, and apply each class's expectations", () => {
  const catalog = [{ id: "shared", assignment: null }, { id: "lesson-b", assignment: null }, { id: "direct", assignment: null }];
  const a = scopeStudentCatalog(catalog, "lesson", classes[0], classes, []);
  const b = scopeStudentCatalog(catalog, "lesson", classes[1], classes, []);
  assert.deepEqual(a.map((item) => item.id), ["shared"]);
  assert.deepEqual(b.map((item) => item.id), ["shared", "lesson-b"]);
  assert.equal((a[0].assignment as any).instructions, "Class A instructions");
  assert.equal((b[0].assignment as any).instructions, "Class B instructions");
  assert.equal(catalog[0].assignment, null);
  assert.deepEqual(scopeStudentCatalog([{ id: "quiz-a" }, { id: "shared" }], "test", classes[0], classes, []).map((item) => item.id), ["quiz-a"]);
});

test("empty classrooms stay empty and direct work never includes current classroom work", () => {
  const catalog = [{ id: "shared" }, { id: "lesson-b" }, { id: "direct" }];
  assert.deepEqual(scopeStudentCatalog(catalog, "lesson", classes[2], classes, []), []);
  assert.deepEqual(scopeStudentCatalog(catalog, "lesson", null, classes, []).map((item) => item.id), ["direct"]);
  const legacy = [{ assignmentType: "lesson" as const, contentId: "shared", classroomId: "a", classroomName: "Portuguese" }];
  assert.deepEqual(scopeStudentCatalog(catalog, "lesson", null, undefined, legacy).map((item) => item.id), ["lesson-b", "direct"]);
  // A confirmed empty membership list must not strand assignments with old classroom labels.
  assert.deepEqual(scopeStudentCatalog(catalog, "lesson", null, [], legacy), catalog);
});

test("mobile classroom requests carry the student session and surface lookup failures", async () => {
  let url = "";
  let fail = false;
  const api = loadMobileModule("lib/api/study.ts", {
    "./config": { getApiBaseUrl: () => "https://test.invalid" },
    "./request": { requestWithTimeout: async (value: string) => {
      url = value;
      return new Response(JSON.stringify(fail ? { error: "Unable to load classrooms" } : { classrooms: classes }), { status: fail ? 500 : 200 });
    } },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await api.getStudentClassrooms("session-token"))), classes);
  assert.ok(url.includes("/api/students/classrooms?session=session-token"));
  fail = true;
  await assert.rejects(api.getStudentClassrooms("session-token"), /Unable to load classrooms/);
});

test("student workspace uses classroom scoping across practice, history and navigation", () => {
  const source = readFileSync("screens/StudyGameScreen.tsx", "utf8");
  assert.equal(source.includes('selectedClassroom?.name ?? "Direct assignments"'), false);
  assert.equal(source.includes("Choose a classroom to see its lessons and tests"), false);
  assert.ok(source.includes('selectedClassroom && (activeTab === "lessons" || activeTab === "tests" || activeTab === "practice")'));
  assert.ok(source.includes('scopeStudentCatalog(catalogLessonsData, "lesson"'));
  assert.ok(source.includes('scopeStudentCatalog(catalogTestsData, "test"'));
  assert.ok(source.includes("catalogLessonsWords.filter"));
  assert.ok(source.includes("catalogTestsWords.filter"));
  assert.ok(source.includes("scopedTestHistory.slice(0, 5)"));
  assert.ok(source.includes('id: "classrooms", icon: "people-outline"'));
  assert.equal(source.includes('id: "settings", icon:'), false);
  assert.ok(source.includes('Alert.alert("Leave this session?"'));
  assert.ok(source.includes("catalogLessonsData.map((item) => (item.id === lesson.id ? offlineLesson : item))"));
  const actions = readFileSync("components/study/StudentWorkspaceActions.tsx", "utf8");
  assert.ok(actions.includes('icon: "settings-outline"'));
  assert.ok(actions.includes('icon: "people-outline"'));
  for (const file of ["components/study/StudentDashboardHeader.tsx", "components/StudySessionHeader.tsx", "components/TestReviewPanel.tsx"]) {
    assert.ok(readFileSync(file, "utf8").includes("<StudentWorkspaceActions"), file);
  }
});

type RenderNode = { type: unknown; props: Record<string, any> };
const jsx = (type: unknown, props: Record<string, any>): RenderNode => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx };
function nodes(value: unknown): RenderNode[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as RenderNode;
  return [node, ...nodes(node.props.children)];
}

test("classroom cards open the selected membership, including empty classes, and preserve retry/direct actions", () => {
  const { default: render } = loadMobileModule("components/study/StudentClassroomsTab.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "react-native": { View: "View", Text: "Text", ActivityIndicator: "Spinner" },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "../GlassCard": "Card", "../../lib/hapticPressables": { TouchableOpacity: "Button" },
  });
  let selected: string | undefined;
  let retries = 0;
  let direct = 0;
  const props = { ui: {}, classrooms: classes, teacherName: "Teacher", error: "Could not refresh", refreshing: false,
    offline: false, onSelect: (item: StudentClassroom) => { selected = item.id; },
    onRetry: () => { retries++; }, onDirectAssignments: () => { direct++; } };
  const buttons = nodes(render(props)).filter((node) => node.type === "Button");
  const classroomButtons = buttons.filter((node) => node.props.accessibilityLabel.startsWith("Open Portuguese") || node.props.accessibilityLabel.startsWith("Open New class"));
  assert.equal(classroomButtons.length, 3);
  classroomButtons[1].props.onPress(); assert.equal(selected, "b");
  classroomButtons[2].props.onPress(); assert.equal(selected, "empty");
  buttons.find((node) => node.props.accessibilityLabel === "Retry loading classrooms")!.props.onPress();
  buttons.find((node) => node.props.accessibilityLabel === "Open direct assignments")!.props.onPress();
  assert.equal(retries, 1); assert.equal(direct, 1);
  assert.equal(nodes(render({ ...props, refreshing: true })).find((node) => node.props.accessibilityLabel === "Retry loading classrooms")!.props.disabled, true);
});

test("shared header exposes working classroom and gear controls with accessible touch targets", () => {
  const { default: render } = loadMobileModule("components/study/StudentWorkspaceActions.tsx", {
    "react/jsx-runtime": jsxRuntime, "react-native": { View: "View" },
    "@expo/vector-icons": { Ionicons: "Icon" }, "../../lib/hapticPressables": { TouchableOpacity: "Button" },
  });
  let destination = "";
  const props = { colors: {}, onSettings: () => { destination = "settings"; }, onClassrooms: () => { destination = "classrooms"; } };
  const buttons = nodes(render(props)).filter((node) => node.type === "Button");
  buttons[0].props.onPress(); assert.equal(destination, "classrooms");
  buttons[1].props.onPress(); assert.equal(destination, "settings");
  for (const button of buttons) {
    assert.equal(button.props.accessibilityRole, "button");
    assert.equal(button.props.style.width, 44);
    assert.equal(button.props.style.height, 44);
  }
  assert.ok(nodes(render({ ...props, disabled: true })).filter((node) => node.type === "Button").every((node) => node.props.disabled));
});

