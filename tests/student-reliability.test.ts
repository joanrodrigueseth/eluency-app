import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import test from "node:test";
import { loadMobileModule } from "./helpers/load-mobile-module.ts";
import { studySpeechLanguage } from "../lib/game/languagePair.ts";
import { createPdfViewerHtml } from "../lib/offline/pdfViewer.ts";

function identityStorage() {
  const values = new Map<string, string>();
  let rejectWrite = false;
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    getAllKeys: async () => [...values.keys()],
    multiGet: async (keys: string[]) => keys.map((key) => [key, values.get(key) ?? null]),
    setItem: async (key: string, value: string) => { if (rejectWrite) throw new Error("Disk full"); values.set(key, value); },
    multiRemove: async (keys: string[]) => { keys.forEach((key) => values.delete(key)); },
  };
  const load = () => loadMobileModule("lib/studentDataStorage.ts", { "@react-native-async-storage/async-storage": storage });
  return { values, load, rejectWrites: () => { rejectWrite = true; } };
}

test("student data follows renewed sessions without merging another student's work", async () => {
  const { values, load } = identityStorage();
  values.set("eluency-offline-study-session-v1:old", JSON.stringify({ student: { id: "one" } }));
  values.set("eluency-offline-study-session-v1:other", JSON.stringify({ student: { id: "two" } }));
  values.set("eluency-study-game-pending-sync-v1:old", JSON.stringify({ practiceHistory: ["saved-work"] }));
  values.set("eluency-study-game-pending-sync-v1:other", JSON.stringify({ practiceHistory: ["private-work"] }));
  values.set("eluency-offline-lessons-index-v1:old", JSON.stringify({ lessons: { lesson: { path: "file:///old/lesson.json" } } }));
  const identity = load();
  await identity.bindStudentDataIdentity("new", "one", (_old: unknown, incoming: unknown) => incoming);
  assert.equal(identity.studentDataScope("new"), "student:one");
  assert.deepEqual(JSON.parse(values.get("eluency-study-game-pending-sync-v1:student:one")!), { practiceHistory: ["saved-work"] });
  assert.equal(values.has("eluency-study-game-pending-sync-v1:old"), false);
  assert.equal(values.has("eluency-study-game-pending-sync-v1:other"), true);
  assert.equal(JSON.parse(values.get("eluency-offline-lessons-index-v1:student:one")!).lessons.lesson.path, "file:///old/lesson.json");
  await identity.bindStudentDataIdentity("renewed", "one", (_old: unknown, incoming: unknown) => incoming);
  const restarted = load();
  await restarted.restoreStudentDataIdentity("renewed");
  assert.equal(restarted.studentDataScope("renewed"), "student:one");
  assert.equal(restarted.studentDataScope("other"), "other");
});

test("failed storage migration preserves legacy data and does not bind a partial migration", async () => {
  const { values, load, rejectWrites } = identityStorage();
  values.set("eluency-study-game-progress-v1:current", JSON.stringify({ practiceHistory: ["keep"] }));
  rejectWrites();
  const identity = load();
  await assert.rejects(identity.bindStudentDataIdentity("current", "one", (_old: unknown, incoming: unknown) => incoming), /Disk full/);
  assert.equal(identity.studentDataScope("current"), "current");
  assert.equal(values.has("eluency-study-game-progress-v1:current"), true);
});

test("offline cleanup removes migrated lesson files but never follows an unsafe stored path", async () => {
  const deleted: string[] = [];
  let storedPath = "file:///documents/eluency/offline-study/old/lessons/lesson/lesson.json";
  const offline = loadMobileModule("lib/offline/offlineLessons.ts", {
    "@react-native-async-storage/async-storage": {
      getItem: async () => JSON.stringify({ lessons: { lesson: { path: storedPath } } }),
      setItem: async () => {},
    },
    "../studentDataStorage": { studentDataScope: () => "student:one" },
    "../api/config": { getApiBaseUrl: () => "https://www.eluency.com" },
    "expo-file-system/legacy": { documentDirectory: "file:///documents/", deleteAsync: async (path: string) => { deleted.push(path); } },
  });
  await offline.removeOfflineLesson("session", "lesson");
  assert.equal(deleted[0], "file:///documents/eluency/offline-study/old/lessons/lesson");
  storedPath = "file:///documents/important/lesson.json";
  await offline.removeOfflineLesson("session", "lesson");
  assert.equal(deleted[1], "file:///documents/eluency/offline-study/student-one/lessons/lesson");
});

test("request deadlines cover stalled fetches even when the adapter ignores abort", async () => {
  const request = loadMobileModule("lib/api/request.ts", {}, { fetch: async () => new Promise(() => {}) });
  await assert.rejects(request.requestWithTimeout("https://test.invalid", {}, 5), /timed out/);
});

test("request deadlines cover stalled bodies and preserve external cancellation", async () => {
  const request = loadMobileModule("lib/api/request.ts", {}, {
    fetch: async () => ({ text: async () => new Promise(() => {}) }),
  });
  await assert.rejects(request.requestWithTimeout("https://test.invalid", {}, 5), /timed out/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(request.requestWithTimeout("https://test.invalid", { signal: controller.signal }), { name: "AbortError" });
});

test("bounded requests preserve JSON and final submit does not wait indefinitely for a draft", async () => {
  const request = loadMobileModule("lib/api/request.ts", {}, { fetch: async () => new Response('{"ok":true}') });
  assert.deepEqual(await (await request.requestWithTimeout("https://test.invalid")).json(), { ok: true });
  await request.waitForDraftSave(new Promise(() => {}), 5);
});

test("listening languages respect the lesson and both directions", () => {
  assert.equal(studySpeechLanguage("en-es", "Spanish", "pt-en"), "es-ES");
  assert.equal(studySpeechLanguage("en-fr", "French", "en-pt"), "en-US");
  assert.equal(studySpeechLanguage("pt-es", "Portuguese (BR)", "en-pt"), "es-ES");
  assert.equal(studySpeechLanguage("en-ja", "Japanese", "pt-en"), "ja-JP");
});

test("PDF renderer is offline, blocks outbound connections and safely embeds script text", () => {
  const html = createPdfViewerHtml("JVBERg==", "</script><script>bad()</script>", "worker");
  assert.equal(html.includes("docs.google.com"), false);
  assert.equal(html.includes("https://"), false);
  assert.ok(html.includes("connect-src blob:"));
  assert.ok(html.includes("\\u003c/script>"));
  assert.ok(html.includes("getDocument({data"));
});

test("notification taps defer once through an active test and open only after its result closes", () => {
  const refs: Array<{ current: unknown }> = [];
  let index = 0;
  const hook = loadMobileModule("hooks/useDeferredStudyNotification.ts", { react: {
    useRef: (value: unknown) => refs[index++] ?? (refs[index - 1] = { current: value }),
    useEffect: (effect: () => void) => effect(),
  } });
  const opened: string[] = [];
  let deferred = 0;
  const render = (busy: boolean) => {
    index = 0;
    hook.useDeferredStudyNotification({ notificationId: "review", initialTab: "tests", busy,
      onOpen: (tab: string) => opened.push(tab), onDeferred: () => { deferred++; } });
  };
  render(true); render(true);
  assert.equal(deferred, 1);
  assert.deepEqual(opened, []);
  render(false); render(false);
  assert.deepEqual(opened, ["tests"]);
});

test("test timer submits only once at expiry", () => {
  let tick: (() => void) | undefined;
  const hook = loadMobileModule("hooks/useTestDeadline.ts", { react: {
    useRef: (value: unknown) => ({ current: value }), useEffect: (effect: () => void) => effect(),
  } }, { setInterval: (callback: () => void) => { tick = callback; return 1; }, clearInterval: () => {} });
  let submitted = 0;
  hook.useTestDeadline({ active: true, deadline: Date.now() - 1000,
    submitted: { current: false }, announcement: { current: null }, onRemaining: () => {},
    onWarning: () => {}, onExpire: () => { submitted++; } });
  tick!(); tick!();
  assert.equal(submitted, 1);
});

test("assignment fallback is cancellable immediately and never overlaps polls", async () => {
  let requests = 0;
  let tick: (() => void) | undefined;
  let signal: AbortSignal | undefined;
  let release: ((response: unknown) => void) | undefined;
  const watcher = loadMobileModule("lib/studentAssignmentNotifications.ts", {
    "react-native": { AppState: { currentState: "active" } },
    "./mobileNotifications": { showLocalNotification: async () => { throw new Error("A disposed watcher cannot notify"); } },
    "./api/request": { requestWithTimeout: (_url: string, init: RequestInit) => {
      requests++; signal = init.signal as AbortSignal;
      return new Promise((resolve) => { release = resolve; });
    } },
  }, { URLSearchParams, setInterval: (callback: () => void) => { tick = callback; return 1; }, clearInterval: () => {} });
  const stop = watcher.startStudentAssignmentNotificationsWatcher("session", "https://test.invalid");
  assert.equal(typeof stop, "function");
  tick!(); tick!();
  assert.equal(requests, 1);
  stop();
  assert.equal(signal!.aborted, true);
  release!({ ok: true, json: async () => ({}) });
  await Promise.resolve();
  tick!();
  assert.equal(requests, 1);
});

test("home test summaries use review-aware presentation and notifications cannot trigger a full reload", () => {
  const source = readFileSync("screens/StudyGameScreen.tsx", "utf8");
  assert.ok(source.includes('getStudentTestResultPresentation(latestLearningRecord)?.state === "final"'));
  assert.equal(source.includes("refreshDownloadedLessons, route.params?.notificationId"), false);
});

test("navigation guide transforms remain valid through Fabric highlight transitions", () => {
  const require = createRequire(import.meta.url);
  const { transformSync } = require("@babel/core");
  const nativeModules = new Map<string, any>();
  function loadNative(filename: string): any {
    if (nativeModules.has(filename)) return nativeModules.get(filename);
    const module = { exports: {} };
    nativeModules.set(filename, module.exports);
    const nativeRequire = createRequire(filename);
    const compiled = transformSync(readFileSync(filename, "utf8"), {
      filename, babelrc: false, configFile: false,
      plugins: ["babel-plugin-syntax-hermes-parser", "@babel/plugin-transform-flow-strip-types", "@babel/plugin-transform-modules-commonjs"],
    }).code;
    runInNewContext(compiled, { module, exports: module.exports, __DEV__: true,
      require: (specifier: string) => specifier.startsWith(".")
        ? loadNative(nativeRequire.resolve(specifier)) : nativeRequire(specifier),
    }, { filename });
    nativeModules.set(filename, module.exports);
    return module.exports;
  }
  const processTransform = loadNative(require.resolve("react-native/Libraries/StyleSheet/processTransform")).default;
  const fabric = loadNative(require.resolve("react-native/Libraries/ReactNative/ReactFabricPublicInstance/ReactNativeAttributePayload"));
  const attributes = { style: { transform: { process: processTransform } } };

  // Reproduce the reported failure with the previous explicit-undefined style.
  assert.throws(() => fabric.diff(
    { style: { transform: [{ scale: 1.04 }] } },
    { style: { transform: undefined } }, attributes,
  ), /forEach/);

  // Extract and execute the actual styles, so reverting either call site fails.
  const source = ts.createSourceFile("StudyGameScreen.tsx", readFileSync("screens/StudyGameScreen.tsx", "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const styles: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === "style" && node.initializer &&
      ts.isJsxExpression(node.initializer) && node.initializer.expression) {
      const expression = node.initializer.expression.getText(source);
      if (expression.includes("transform") && expression.includes("guideTarget")) styles.push(expression);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(styles.length, 2);
  for (const expression of styles) {
    const style = (guideTarget: boolean) => runInNewContext(`(${expression})`, { guideTarget, studentGuideMenuScale: 1.04 });
    for (const [previous, next] of [[false, true], [true, false], [false, false]]) {
      assert.doesNotThrow(() => fabric.diff({ style: style(previous) }, { style: style(next) }, attributes));
    }
    assert.equal(style(false).transform[0].scale, 1);
  }
});
