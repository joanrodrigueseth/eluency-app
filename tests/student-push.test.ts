import assert from "node:assert/strict";
import test from "node:test";
import { loadMobileModule } from "./helpers/load-mobile-module.ts";

function pushModule(activeSessionId: string | null, responseOk = true) {
  const tokens = new Map([["@eluency/last-registered-push-token-v1", "ExponentPushToken[device]"]]);
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let handleForeground: ((notification: unknown) => Promise<Record<string, boolean>>) | null = null;
  const notifications = loadMobileModule("lib/mobileNotifications.ts", {
    "@react-native-async-storage/async-storage": {
      getItem: async (key: string) => tokens.get(key) ?? null,
      setItem: async (key: string, value: string) => { tokens.set(key, value); },
      removeItem: async (key: string) => { tokens.delete(key); },
    },
    "react-native": { Platform: { OS: "ios" }, Alert: {}, PermissionsAndroid: {} },
    "expo-constants": { appOwnership: "standalone", easConfig: { projectId: "test-project" } },
    "./studentSession": { getStoredStudentSessionId: async () => activeSessionId },
    "./studentDataStorage": { restoreStudentDataIdentity: async () => {}, storedStudentIdentity: () => activeSessionId },
    "./api/request": { requestWithTimeout: async (url: string, init: RequestInit) => {
      requests.push({ url, init }); return { ok: responseOk, status: responseOk ? 200 : 500 };
    } },
    "expo-notifications": {
      setNotificationHandler: (handler: { handleNotification: typeof handleForeground }) => { handleForeground = handler.handleNotification; },
      getPermissionsAsync: async () => ({ granted: true }),
      getExpoPushTokenAsync: async () => ({ data: "ExponentPushToken[device]" }),
    },
  }, {
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return { ok: responseOk, status: responseOk ? 200 : 500 };
    },
  });
  return { notifications, tokens, requests, deliverForeground: (studentId: string | null) => handleForeground!({ request: { content: { data: { student_id: studentId } } } }) };
}

test("student push cleanup authenticates with its session and never a teacher bearer token", async () => {
  const { notifications, tokens, requests } = pushModule(null);
  await notifications.unregisterStudentPushToken("https://www.eluency.com/", "student");
  assert.equal(requests[0].url, "https://www.eluency.com/api/mobile/push/register");
  assert.equal(requests[0].init.method, "DELETE");
  assert.deepEqual(JSON.parse(requests[0].init.body as string), {
    expoPushToken: "ExponentPushToken[device]", platform: "ios", sessionId: "student",
  });
  assert.equal((requests[0].init.headers as Record<string, string>).Authorization, undefined);
  assert.equal(tokens.size, 0);
});

test("previous student logout cannot erase a newly signed-in student's remembered token", async () => {
  const { notifications, tokens } = pushModule("new-student");
  await notifications.unregisterStudentPushToken("https://www.eluency.com", "old-student");
  assert.equal(tokens.size, 1);
});

test("failed remote cleanup preserves the token for a subsequent retry", async () => {
  const { notifications, tokens } = pushModule(null, false);
  await notifications.unregisterStudentPushToken("https://www.eluency.com", "student");
  assert.equal(tokens.size, 1);
});

test("student push registration carries the student session and respects cancellation", async () => {
  const { notifications, requests } = pushModule("student");
  const controller = new AbortController();
  controller.abort();
  assert.equal(await notifications.registerStudentPushToken("student", "https://www.eluency.com", controller.signal), false);
  assert.equal(requests.length, 0);
  assert.equal(await notifications.registerStudentPushToken("student", "https://www.eluency.com"), true);
  assert.equal(requests[0].init.method, "POST");
  assert.equal(JSON.parse(requests[0].init.body as string).sessionId, "student");
  assert.equal((requests[0].init.headers as Record<string, string>).Authorization, undefined);
});

test("foreground notifications require the current student rather than an unknown or previous recipient", async () => {
  const push = pushModule("student-one");
  await push.notifications.registerStudentPushToken("session", "https://www.eluency.com");
  assert.equal((await push.deliverForeground("student-one")).shouldShowBanner, true);
  assert.equal((await push.deliverForeground("student-two")).shouldShowBanner, false);
  assert.equal((await push.deliverForeground(null)).shouldPlaySound, false);
  const signedOut = pushModule(null);
  await signedOut.notifications.registerStudentPushToken("session", "https://www.eluency.com");
  assert.equal((await signedOut.deliverForeground(null)).shouldShowBanner, false);
});
