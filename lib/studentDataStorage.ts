import AsyncStorage from "@react-native-async-storage/async-storage";

const IDENTITY_KEY = "eluency-student-storage-identities-v1";
const SNAPSHOT_PREFIX = "eluency-offline-study-session-v1";
const prefixes = [
  "eluency-study-game-progress-v1", "eluency-study-game-pending-sync-v1",
  "eluency-offline-lessons-index-v1", SNAPSHOT_PREFIX, "eluency_lesson_resume",
];
const identities = new Map<string, string>();
let migrationChain: Promise<void> = Promise.resolve();

export function studentDataScope(sessionId: string): string {
  const studentId = identities.get(sessionId);
  return studentId ? `student:${studentId}` : sessionId;
}

export function storedStudentIdentity(sessionId: string): string | null {
  return identities.get(sessionId) ?? null;
}

function object(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parse(raw: string | null): Record<string, unknown> | null {
  try { return raw ? object(JSON.parse(raw)) : null; } catch { return null; }
}

/** Restore the identity binding before attempting network access or reading offline data. */
export async function restoreStudentDataIdentity(sessionId: string): Promise<void> {
  const saved = parse(await AsyncStorage.getItem(IDENTITY_KEY));
  if (typeof saved?.[sessionId] === "string") identities.set(sessionId, saved[sessionId]);
}

/** Migrate only sessions whose saved student snapshot proves they belong to this student.
 * Legacy files remain in place because downloaded lesson payloads reference their paths.
 * Writes are serialized and legacy values are retained if migration is interrupted.
 */
export async function bindStudentDataIdentity(
  sessionId: string,
  studentId: string,
  mergeProgress: (existing: unknown, incoming: unknown) => unknown,
): Promise<void> {
  const operation = migrationChain.catch(() => {}).then(async () => {
    const saved = parse(await AsyncStorage.getItem(IDENTITY_KEY)) ?? {};
    const snapshots = (await AsyncStorage.getAllKeys()).filter((key) =>
      key.startsWith(`${SNAPSHOT_PREFIX}:`) && !key.startsWith(`${SNAPSHOT_PREFIX}:student:`));
    const owned = new Set<string>([sessionId]);
    for (const [key, raw] of await AsyncStorage.multiGet(snapshots)) {
      if (object(parse(raw)?.student).id === studentId) owned.add(key.slice(SNAPSHOT_PREFIX.length + 1));
    }
    const scope = `student:${studentId}`;
    for (const prefix of prefixes) {
      const targetKey = `${prefix}:${scope}`;
      let value = parse(await AsyncStorage.getItem(targetKey));
      for (const oldSessionId of owned) {
        const incoming = parse(await AsyncStorage.getItem(`${prefix}:${oldSessionId}`));
        if (!incoming) continue;
        if (prefix.includes("progress") || prefix.includes("pending-sync")) {
          value = object(mergeProgress(value, incoming));
        } else if (prefix === "eluency-offline-lessons-index-v1") {
          const lessons = { ...object(value?.lessons) };
          for (const [id, summary] of Object.entries(object(incoming.lessons))) {
            if (!lessons[id] || (Date.parse(String(object(summary).downloadedAt ?? "")) || 0) >
              (Date.parse(String(object(lessons[id]).downloadedAt ?? "")) || 0)) lessons[id] = summary;
          }
          value = { lessons };
        } else if (!value || (Date.parse(String(incoming.expires_at ?? incoming.startedAt ?? "")) || 0) >
          (Date.parse(String(value.expires_at ?? value.startedAt ?? "")) || 0)) {
          value = incoming;
        }
      }
      if (value) await AsyncStorage.setItem(targetKey, JSON.stringify(value));
    }
    for (const ownedSessionId of owned) saved[ownedSessionId] = studentId;
    await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(saved));
    for (const ownedSessionId of owned) identities.set(ownedSessionId, studentId);
    // JSON has been durably copied. Keep downloaded files, but retire old queues
    // so the next login cannot replay an already migrated snapshot.
    await AsyncStorage.multiRemove(Array.from(owned).flatMap((id) => prefixes.map((prefix) => `${prefix}:${id}`)));
  });
  migrationChain = operation;
  await operation;
}
