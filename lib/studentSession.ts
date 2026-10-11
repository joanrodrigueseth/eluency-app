import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const STUDENT_SESSION_KEY = "eluency.student-session-id";
const LEGACY_STUDENT_SESSION_KEY = "@eluency/student-session-id";

type StudentSessionListener = (sessionId: string | null) => void;
const sessionListeners = new Set<StudentSessionListener>();

export function subscribeToStudentSession(listener: StudentSessionListener): () => void {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}

function notifyStudentSession(sessionId: string | null) {
  sessionListeners.forEach((listener) => listener(sessionId));
}

export async function getStoredStudentSessionId(): Promise<string | null> {
  try {
    const secureValue = await SecureStore.getItemAsync(STUDENT_SESSION_KEY);
    const secureSessionId = typeof secureValue === "string" ? secureValue.trim() : "";
    if (secureSessionId) return secureSessionId;

    // One-time migration for students who signed in before sessions moved to
    // Keychain/Keystore-backed storage.
    const legacyValue = await AsyncStorage.getItem(LEGACY_STUDENT_SESSION_KEY);
    const legacySessionId = typeof legacyValue === "string" ? legacyValue.trim() : "";
    if (!legacySessionId) return null;

    await SecureStore.setItemAsync(STUDENT_SESSION_KEY, legacySessionId, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await AsyncStorage.removeItem(LEGACY_STUDENT_SESSION_KEY);
    return legacySessionId;
  } catch {
    return null;
  }
}

export async function setStoredStudentSessionId(sessionId: string): Promise<void> {
  const value = String(sessionId || "").trim();
  if (!value) return;
  await SecureStore.setItemAsync(STUDENT_SESSION_KEY, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await AsyncStorage.removeItem(LEGACY_STUDENT_SESSION_KEY).catch(() => {});
  notifyStudentSession(value);
}

export async function clearStoredStudentSessionId(): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(STUDENT_SESSION_KEY),
    AsyncStorage.removeItem(LEGACY_STUDENT_SESSION_KEY),
  ]);
  notifyStudentSession(null);
}
