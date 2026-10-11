import { showLocalNotification } from "./mobileNotifications";
import { AppState } from "react-native";
import { requestWithTimeout } from "./api/request";

type StudentSessionPayload = {
  student?: {
    id?: string;
    assigned_lessons?: unknown;
    assigned_tests?: unknown;
  };
};

function toIdSet(value: unknown) {
  return new Set(
    (Array.isArray(value) ? value : [])
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

/**
 * Foreground fallback for environments where remote Expo push tokens are not
 * available (notably Expo Go on Android). Installed builds use remote push;
 * this watcher is started only when device-token registration fails.
 */
export function startStudentAssignmentNotificationsWatcher(
  sessionId: string,
  apiBaseUrl: string,
) {
  let active = true;
  let polling = false;
  const controller = new AbortController();
  let previousLessons: Set<string> | null = null;
  let previousTests: Set<string> | null = null;

  const poll = async () => {
    if (!active || polling || AppState.currentState !== "active") return;
    polling = true;
    try {

    const query = new URLSearchParams({
      session: sessionId,
      _: String(Date.now()),
    });
    const response = await requestWithTimeout(`${apiBaseUrl.replace(/\/$/, "")}/api/students/session?${query.toString()}`, {
      signal: controller.signal,
      headers: { "Cache-Control": "no-cache, no-store" },
    });
    if (!response.ok || !active) return;

    const payload = (await response.json().catch(() => ({}))) as StudentSessionPayload;
    if (!active) return;
    const nextLessons = toIdSet(payload.student?.assigned_lessons);
    const nextTests = toIdSet(payload.student?.assigned_tests);

    if (previousLessons && previousTests) {
      const addedLessons = Array.from(nextLessons).filter((id) => !previousLessons?.has(id)).length;
      const addedTests = Array.from(nextTests).filter((id) => !previousTests?.has(id)).length;

      if (addedLessons || addedTests) {
        const bodyParts: string[] = [];
        if (addedLessons) bodyParts.push(`${addedLessons} new lesson${addedLessons === 1 ? "" : "s"}`);
        if (addedTests) bodyParts.push(`${addedTests} new test${addedTests === 1 ? "" : "s"}`);
        await showLocalNotification("New assignments available", bodyParts.join(" and "), {
          type: "student_assignment",
          student_id: typeof payload.student?.id === "string" ? payload.student.id : null,
        });
      }
    }

    previousLessons = nextLessons;
    previousTests = nextTests;
    } finally { polling = false; }
  };

  poll().catch(() => {});
  const intervalId = setInterval(() => {
    poll().catch(() => {});
  }, 15000);

  return () => {
    active = false;
    controller.abort();
    clearInterval(intervalId);
  };
}
