import assert from "node:assert/strict";
import test from "node:test";
import { loadMobileModule } from "./helpers/load-mobile-module.ts";

function sessionStorage() {
  const secure = new Map<string, string>();
  const legacy = new Map<string, string>();
  let rejectWrite = false;
  const validateKey = (key: string) => {
    if (!/^[\w.-]+$/.test(key)) throw new Error("Invalid SecureStore key");
  };
  const session = loadMobileModule("lib/studentSession.ts", {
    "@react-native-async-storage/async-storage": {
      getItem: async (key: string) => legacy.get(key) ?? null,
      removeItem: async (key: string) => { legacy.delete(key); },
    },
    "expo-secure-store": {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device",
      getItemAsync: async (key: string) => { validateKey(key); return secure.get(key) ?? null; },
      setItemAsync: async (key: string, value: string) => {
        validateKey(key);
        if (rejectWrite) throw new Error("Secure storage unavailable");
        secure.set(key, value);
      },
      deleteItemAsync: async (key: string) => { validateKey(key); secure.delete(key); },
    },
  });
  return { session, secure, legacy, rejectWrites: () => { rejectWrite = true; } };
}

test("student session changes notify immediately and unsubscribed listeners stay silent", async () => {
  const { session } = sessionStorage();
  const changes: Array<string | null> = [];
  const unsubscribe = session.subscribeToStudentSession((value: string | null) => changes.push(value));
  await session.setStoredStudentSessionId(" student-one ");
  assert.equal(await session.getStoredStudentSessionId(), "student-one");
  await session.setStoredStudentSessionId("student-two");
  await session.clearStoredStudentSessionId();
  assert.equal(await session.getStoredStudentSessionId(), null);
  assert.deepEqual(changes, ["student-one", "student-two", null]);
  unsubscribe();
  await session.setStoredStudentSessionId("student-three");
  assert.equal(changes.length, 3);
});

test("legacy student sessions migrate without losing offline access", async () => {
  const { session, legacy, secure } = sessionStorage();
  legacy.set("@eluency/student-session-id", "legacy-student");
  assert.equal(await session.getStoredStudentSessionId(), "legacy-student");
  assert.equal(secure.get("eluency.student-session-id"), "legacy-student");
  assert.equal(legacy.size, 0);
});

test("failed secure writes cannot announce a successful student login", async () => {
  const { session, rejectWrites } = sessionStorage();
  const changes: string[] = [];
  session.subscribeToStudentSession((value: string) => changes.push(value));
  rejectWrites();
  await assert.rejects(session.setStoredStudentSessionId("student"), /Secure storage unavailable/);
  assert.equal(await session.getStoredStudentSessionId(), null);
  assert.deepEqual(changes, []);
});

test("logout clears local access before remote cleanup and preserves unregister/revoke order", async () => {
  const calls: string[] = [];
  const { endStudentSession } = loadMobileModule("lib/endStudentSession.ts", {
    "./api/config": { getApiBaseUrl: () => "https://www.eluency.com" },
    "./studentSession": { clearStoredStudentSessionId: async () => { calls.push("clear"); } },
    "./mobileNotifications": { unregisterStudentPushToken: async (_url: string, id: string) => {
      calls.push("unregister:" + id); throw new Error("Offline");
    } },
    "./api/study": { revokeStudentSession: async (id: string) => { calls.push("revoke:" + id); } },
  });
  await endStudentSession("student");
  assert.deepEqual(calls, ["clear", "unregister:student", "revoke:student"]);
});

test("offline logout bounds remote cleanup and still attempts revocation", async () => {
  const calls: string[] = [];
  let expire: (() => void) | undefined;
  let release: (() => void) | undefined;
  const started = new Promise<void>((resolve) => { release = resolve; });
  const { endStudentSession } = loadMobileModule("lib/endStudentSession.ts", {
    "./api/config": { getApiBaseUrl: () => "https://www.eluency.com" },
    "./studentSession": { clearStoredStudentSessionId: async () => { calls.push("clear"); } },
    "./mobileNotifications": { unregisterStudentPushToken: async (_url: string, _id: string, signal: AbortSignal) => {
      calls.push("unregister");
      release!();
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
      });
    } },
    "./api/study": { revokeStudentSession: async (_id: string, signal: AbortSignal) => {
      calls.push("revoke");
      assert.equal(signal.aborted, true);
    } },
  }, {
    setTimeout: (callback: () => void, duration: number) => {
      assert.equal(duration, 5000); expire = callback; return 1;
    },
    clearTimeout: () => { calls.push("timer-cleared"); },
  });
  const ended = endStudentSession("student");
  await started;
  assert.deepEqual(calls, ["clear", "unregister"]);
  expire!();
  await ended;
  assert.deepEqual(calls, ["clear", "unregister", "revoke", "timer-cleared"]);
});
