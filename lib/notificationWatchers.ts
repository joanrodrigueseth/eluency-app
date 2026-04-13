import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "./supabase";
import { ensureLocalNotificationsReady, showLocalNotification } from "./mobileNotifications";

type TeacherNotificationRow = {
  id: string;
  type: "lesson_completed" | "test_completed" | "admin_announcement";
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  teacher_id: string;
  created_at: string;
};

type StudentSessionPayload = {
  student?: {
    assigned_lessons?: string[];
    assigned_tests?: string[];
  };
};

const TEACHER_LAST_SEEN_KEY = "@eluency/teacher-notifications-last-seen";
const STUDENT_ASSIGNMENTS_PREFIX = "@eluency/student-assignments";

function createNoopCleanup() {
  return () => {
    // no-op
  };
}

function sortByCreatedAtAsc(rows: TeacherNotificationRow[]) {
  return [...rows].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
}

export async function startTeacherNotificationsWatcher() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return createNoopCleanup();

  await ensureLocalNotificationsReady();
  let active = true;
  let newestSeen = (await AsyncStorage.getItem(TEACHER_LAST_SEEN_KEY)) || new Date().toISOString();
  const seenIds = new Set<string>();

  const emit = async (row: TeacherNotificationRow) => {
    if (!active || seenIds.has(row.id)) return;
    seenIds.add(row.id);
    newestSeen = row.created_at > newestSeen ? row.created_at : newestSeen;
    await AsyncStorage.setItem(TEACHER_LAST_SEEN_KEY, newestSeen);
    await showLocalNotification(row.title, row.body || undefined, {
      notificationId: row.id,
      type: row.type,
    });
  };

  const primeLatest = async () => {
    const { data } = await (supabase.from("teacher_notifications") as any)
      .select("created_at")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const latest = Array.isArray(data) && data[0]?.created_at ? String(data[0].created_at) : null;
    if (latest && latest > newestSeen) {
      newestSeen = latest;
      await AsyncStorage.setItem(TEACHER_LAST_SEEN_KEY, newestSeen);
    }
  };

  await primeLatest();

  const pullMissed = async () => {
    if (!active) return;
    const { data } = await (supabase.from("teacher_notifications") as any)
      .select("id, type, title, body, metadata, teacher_id, created_at")
      .eq("teacher_id", user.id)
      .gt("created_at", newestSeen)
      .order("created_at", { ascending: true })
      .limit(20);

    const rows = (data ?? []) as TeacherNotificationRow[];
    for (const row of sortByCreatedAtAsc(rows)) {
      await emit(row);
    }
  };

  const channel = supabase
    .channel(`teacher-notifications-${user.id}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "teacher_notifications",
        filter: `teacher_id=eq.${user.id}`,
      },
      (payload) => {
        const row = payload.new as TeacherNotificationRow;
        emit(row).catch(() => {});
      }
    )
    .subscribe();

  const intervalId = setInterval(() => {
    pullMissed().catch(() => {});
  }, 60000);

  return () => {
    active = false;
    clearInterval(intervalId);
    supabase.removeChannel(channel);
  };
}

export async function startStudentAssignmentsWatcher(sessionId: string, apiBaseUrl: string) {
  if (!sessionId) return createNoopCleanup();

  await ensureLocalNotificationsReady();
  let active = true;
  const storageKey = `${STUDENT_ASSIGNMENTS_PREFIX}:${sessionId}`;

  const readSnapshot = async () => {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return { hasSnapshot: false, lessons: [] as string[], tests: [] as string[] };
    try {
      const parsed = JSON.parse(raw) as { lessons?: unknown; tests?: unknown };
      return {
        hasSnapshot: true,
        lessons: Array.isArray(parsed.lessons) ? parsed.lessons.map(String) : [],
        tests: Array.isArray(parsed.tests) ? parsed.tests.map(String) : [],
      };
    } catch {
      return { hasSnapshot: false, lessons: [] as string[], tests: [] as string[] };
    }
  };

  const writeSnapshot = async (lessons: string[], tests: string[]) => {
    await AsyncStorage.setItem(storageKey, JSON.stringify({ lessons, tests }));
  };

  const poll = async () => {
    if (!active) return;
    const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/students/session?session=${encodeURIComponent(sessionId)}`);
    if (!res.ok) return;
    const json = (await res.json()) as StudentSessionPayload;
    const lessons = Array.isArray(json.student?.assigned_lessons)
      ? json.student?.assigned_lessons.map(String)
      : [];
    const tests = Array.isArray(json.student?.assigned_tests) ? json.student?.assigned_tests.map(String) : [];

    const previous = await readSnapshot();
    if (previous.hasSnapshot) {
      const addedLessons = lessons.filter((id) => !previous.lessons.includes(id)).length;
      const addedTests = tests.filter((id) => !previous.tests.includes(id)).length;
      if (addedLessons > 0 || addedTests > 0) {
        const chunks = [
          addedLessons > 0 ? `${addedLessons} new lesson${addedLessons === 1 ? "" : "s"}` : null,
          addedTests > 0 ? `${addedTests} new test${addedTests === 1 ? "" : "s"}` : null,
        ].filter(Boolean);
        await showLocalNotification("New assignments available", chunks.join(" and "), {
          sessionId,
          addedLessons,
          addedTests,
        });
      }
    }

    await writeSnapshot(lessons, tests);
  };

  await poll();
  const intervalId = setInterval(() => {
    poll().catch(() => {});
  }, 60000);

  return () => {
    active = false;
    clearInterval(intervalId);
  };
}
