import { PermissionsAndroid, Platform } from "react-native";
import Constants from "expo-constants";

let initialized = false;
let permissionRequested = false;
let handlerConfigured = false;

function canUseExpoNotifications() {
  const isExpoGo = Constants.appOwnership === "expo";
  if (isExpoGo && Platform.OS === "android") {
    return false;
  }
  return true;
}

async function getNotificationsModule() {
  if (!canUseExpoNotifications()) {
    return null;
  }
  try {
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

/** Android 13+ (API 33): tray notifications require POST_NOTIFICATIONS at runtime. */
async function ensureAndroidPostNotificationsPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const api = typeof Platform.Version === "number" ? Platform.Version : Number.parseInt(String(Platform.Version), 10);
  if (!Number.isFinite(api) || api < 33) return true;

  try {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function ensureLocalNotificationsReady(): Promise<boolean> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;

  if (!handlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
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
    const androidOk = await ensureAndroidPostNotificationsPermission();
    if (!androidOk) return false;
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  if (permissionRequested) {
    const again = await Notifications.getPermissionsAsync();
    return !!again.granted || again.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  }

  permissionRequested = true;
  const requested = await Notifications.requestPermissionsAsync();
  return !!requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
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
