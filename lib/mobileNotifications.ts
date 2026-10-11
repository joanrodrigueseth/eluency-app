import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, PermissionsAndroid, Platform } from "react-native";
import Constants from "expo-constants";
import { getStoredStudentSessionId } from "./studentSession";
import { restoreStudentDataIdentity, storedStudentIdentity } from "./studentDataStorage";
import { requestWithTimeout } from "./api/request";

let initialized = false;
let handlerConfigured = false;
const NOTIFICATION_CONTEXT_PROMPT_KEY = "@eluency/notification-context-prompt-v2";
const LAST_REGISTERED_PUSH_TOKEN_KEY = "@eluency/last-registered-push-token-v1";

export type NotificationPermissionState = "granted" | "denied" | "undetermined" | "unavailable";

function canUseRemotePushNotifications() {
  const isExpoGo = Constants.appOwnership === "expo";
  return !(isExpoGo && Platform.OS === "android");
}

async function getNotificationsModule() {
  try {
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

/** Android 13+ (API 33): tray notifications require POST_NOTIFICATIONS at runtime. */
async function ensureAndroidPostNotificationsPermission(requestPermission: boolean): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const api = typeof Platform.Version === "number" ? Platform.Version : Number.parseInt(String(Platform.Version), 10);
  if (!Number.isFinite(api) || api < 33) return true;

  try {
    const alreadyGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (alreadyGranted) return true;
    if (!requestPermission) return false;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function ensureLocalNotificationsReady(requestPermission = false): Promise<boolean> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;

  if (!handlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const sessionId = await getStoredStudentSessionId();
        if (sessionId) await restoreStudentDataIdentity(sessionId).catch(() => {});
        const studentId = sessionId ? storedStudentIdentity(sessionId) : null;
        const show = !!studentId && notification.request.content.data?.student_id === studentId;
        return {
        shouldPlaySound: show,
        shouldSetBadge: false,
        shouldShowBanner: show,
        shouldShowList: show,
      }; },
    });
    handlerConfigured = true;
  }

  if (!initialized) {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("eluency_default", {
        name: "Eluency",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: "default",
        enableVibrate: true,
        showBadge: true,
      });
    }
    initialized = true;
  }

  if (Platform.OS === "android") {
    const androidOk = await ensureAndroidPostNotificationsPermission(requestPermission);
    if (!androidOk) return false;
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  if (!requestPermission) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return !!requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function requestNotificationPermissionAfterLogin(): Promise<boolean> {
  const alreadyGranted = await ensureLocalNotificationsReady(false);
  if (alreadyGranted) return true;

  const alreadyExplained = await AsyncStorage.getItem(NOTIFICATION_CONTEXT_PROMPT_KEY);
  if (alreadyExplained) return false;

  return new Promise((resolve) => {
    Alert.alert(
      "Stay up to date",
      "Enable notifications for new assignments, reminders, and reviewed test results. You can change this later in your device settings.",
      [
        {
          text: "Not now",
          style: "cancel",
          onPress: () => {
            AsyncStorage.setItem(NOTIFICATION_CONTEXT_PROMPT_KEY, "dismissed").catch(() => {});
            resolve(false);
          },
        },
        {
          text: "Enable notifications",
          onPress: () => {
            AsyncStorage.setItem(NOTIFICATION_CONTEXT_PROMPT_KEY, "requested")
              .then(() => ensureLocalNotificationsReady(true))
              .then(resolve)
              .catch(() => resolve(false));
          },
        },
      ],
      { cancelable: false }
    );
  });
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return "unavailable";

  if (Platform.OS === "android") {
    const api = typeof Platform.Version === "number" ? Platform.Version : Number.parseInt(String(Platform.Version), 10);
    if (Number.isFinite(api) && api >= 33) {
      const granted = await ensureAndroidPostNotificationsPermission(false);
      if (granted) return "granted";
    }
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return "granted";
  }
  return current.status === "undetermined" ? "undetermined" : "denied";
}

export async function requestNotificationPermissionFromSettings(): Promise<boolean> {
  const granted = await ensureLocalNotificationsReady(true);
  if (granted) {
    await AsyncStorage.setItem(NOTIFICATION_CONTEXT_PROMPT_KEY, "requested");
  }
  return granted;
}

export async function showLocalNotification(title: string, body?: string, data?: Record<string, unknown>) {
  const granted = await ensureLocalNotificationsReady();
  if (!granted) return;

  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: body || undefined,
      data: data ?? {},
      sound: "default",
      ...(Platform.OS === "android"
        ? {
            android: {
              channelId: "eluency_default",
              priority: Notifications.AndroidNotificationPriority.HIGH,
              sticky: false,
              visibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            },
          }
        : {}),
    },
    trigger: null,
  });
}

function resolveExpoProjectId() {
  const fromEasConfig = (Constants.easConfig as { projectId?: string } | null)?.projectId;
  if (typeof fromEasConfig === "string" && fromEasConfig.trim()) return fromEasConfig.trim();
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (typeof fromExtra === "string" && fromExtra.trim()) return fromExtra.trim();
  return undefined;
}

export async function getExpoPushToken() {
  if (!canUseRemotePushNotifications()) return "";
  const granted = await ensureLocalNotificationsReady();
  if (!granted) return "";
  const Notifications = await getNotificationsModule();
  if (!Notifications) return "";

  try {
    const projectId = resolveExpoProjectId();
    const result = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return typeof result?.data === "string" ? result.data.trim() : "";
  } catch {
    return "";
  }
}

export async function rememberRegisteredToken(token: string) {
  if (token) await AsyncStorage.setItem(LAST_REGISTERED_PUSH_TOKEN_KEY, token);
}

export async function registerStudentPushToken(sessionId: string, apiBaseUrl: string, signal?: AbortSignal): Promise<boolean> {
  if (!sessionId || signal?.aborted) return false;
  const token = await getExpoPushToken();
  if (!token || signal?.aborted) return false;

  try {
    const endpoint = `${apiBaseUrl.replace(/\/$/, "")}/api/mobile/push/register`;
    const response = await requestWithTimeout(endpoint, {
      signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, expoPushToken: token, platform: Platform.OS }),
    });
    if (!response.ok || signal?.aborted) return false;
    await rememberRegisteredToken(token);
    return true;
  } catch {
    return false;
  }
}

export async function unregisterStudentPushToken(
  apiBaseUrl: string,
  sessionId: string,
  signal?: AbortSignal,
) {
  if (!sessionId) return;
  const token = await AsyncStorage.getItem(LAST_REGISTERED_PUSH_TOKEN_KEY);
  if (!token) return;

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  try {
    const response = await requestWithTimeout(`${apiBaseUrl.replace(/\/$/, "")}/api/mobile/push/register`, {
      method: "DELETE",
      signal,
      headers,
      body: JSON.stringify({
        expoPushToken: token,
        platform: Platform.OS,
        sessionId,
      }),
    });
    if (response.ok || response.status === 404) {
      const activeSessionId = await getStoredStudentSessionId();
      const rememberedToken = await AsyncStorage.getItem(LAST_REGISTERED_PUSH_TOKEN_KEY);
      // A student may sign in while the previous student's remote cleanup runs.
      // Keep the new student's token available for their own eventual logout.
      if ((!activeSessionId || activeSessionId === sessionId) && rememberedToken === token) {
        await AsyncStorage.removeItem(LAST_REGISTERED_PUSH_TOKEN_KEY);
      }
    }
  } catch {
    // Keep the remembered token when cleanup fails so a later logout can retry.
  }
}
