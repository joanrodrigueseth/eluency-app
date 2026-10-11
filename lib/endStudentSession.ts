import { getApiBaseUrl } from "./api/config";
import { revokeStudentSession } from "./api/study";
import { unregisterStudentPushToken } from "./mobileNotifications";
import { clearStoredStudentSessionId } from "./studentSession";

/** Clear local access immediately; remote cleanup must not block offline logout. */
export async function endStudentSession(sessionId: string | null): Promise<void> {
  await clearStoredStudentSessionId();
  if (!sessionId) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    // The push endpoint requires an active session, so unregister before revoke.
    await unregisterStudentPushToken(getApiBaseUrl(), sessionId, controller.signal).catch(() => {});
    await revokeStudentSession(sessionId, controller.signal).catch(() => {});
  } finally {
    clearTimeout(timeout);
  }
}
