import { useEffect, useMemo, useRef, useState } from "react";
import { DarkTheme, DefaultTheme, NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppState, View } from "react-native";
import StudyGameLoadingSkeleton from "./components/StudyGameLoadingSkeleton";
import LoginScreen from "./screens/LoginScreen";
import StudyGameScreen from "./screens/StudyGameScreen";
import { getStoredStudentSessionId, subscribeToStudentSession } from "./lib/studentSession";
import { getStudentSession } from "./lib/api/study";
import { ThemeProvider, useAppTheme } from "./lib/theme";
import {
  getNotificationPermissionState,
  registerStudentPushToken,
  requestNotificationPermissionAfterLogin,
} from "./lib/mobileNotifications";
import { getApiBaseUrl } from "./lib/api/config";
import { startStudentAssignmentNotificationsWatcher } from "./lib/studentAssignmentNotifications";
import { getStudentNotificationDestination, type StudentMobileStackParamList } from "./lib/studentMobileNavigation";

const Stack = createNativeStackNavigator<StudentMobileStackParamList>();
const navigationRef = createNavigationContainerRef<StudentMobileStackParamList>();

type NotificationDestination = { screen: "StudyGame"; params: StudentMobileStackParamList["StudyGame"] };

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

function AppShell() {
  const theme = useAppTheme();
  const navigationTheme = useMemo(() => {
    const baseTheme = theme.isDark ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      dark: theme.isDark,
      colors: {
        ...baseTheme.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.text,
        border: theme.colors.border,
        notification: theme.colors.danger,
      },
    };
  }, [theme.colors, theme.isDark]);
  const apiBaseUrl = getApiBaseUrl();
  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const [studentSessionId, setStudentSessionId] = useState<string | null>(null);
  const pendingNotificationDestinationRef = useRef<NotificationDestination | null>(null);
  const lastHandledNotificationIdRef = useRef<string | null>(null);
  const coldStartNotificationPendingRef = useRef(true);
  const navigateToNotificationDestination = (destination: NotificationDestination) => {
    if (navigationRef.isReady()) {
      pendingNotificationDestinationRef.current = null;
      navigationRef.navigate("StudyGame", destination.params);
      return;
    }
    pendingNotificationDestinationRef.current = destination;
  };

  const flushPendingNotificationNavigation = () => {
    const destination = pendingNotificationDestinationRef.current;
    if (!destination || !navigationRef.isReady()) return;
    navigateToNotificationDestination(destination);
  };

  useEffect(() => {
    let mounted = true;
    let sessionChanged = false;
    const unsubscribe = subscribeToStudentSession((sessionId) => {
      sessionChanged = true;
      coldStartNotificationPendingRef.current = false;
      if (mounted) {
        pendingNotificationDestinationRef.current = null;
        setStudentSessionId(sessionId);
      }
    });
    getStoredStudentSessionId()
      .then((sessionId) => {
        if (mounted && !sessionChanged) {
          coldStartNotificationPendingRef.current = !!sessionId;
          setStudentSessionId(sessionId);
        }
      })
      .finally(() => {
        if (mounted) setAuthBootstrapped(true);
      });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authBootstrapped || !studentSessionId) return;
    let sub: { remove: () => void } | null = null;
    let disposed = false;

    const setup = async () => {
      try {
        const Notifications = await import("expo-notifications");

        const handleResponse = async (response: import("expo-notifications").NotificationResponse) => {
          if (disposed) return;
          const notificationIdentifier = String(response?.notification?.request?.identifier ?? "");
          if (notificationIdentifier && lastHandledNotificationIdRef.current === notificationIdentifier) return;
          const data = response?.notification?.request?.content?.data ?? {};
          const currentSession = await getStudentSession(studentSessionId).catch(() => null);
          if (disposed || !currentSession) return;
          if (notificationIdentifier && lastHandledNotificationIdRef.current === notificationIdentifier) return;
          const params = getStudentNotificationDestination(data, studentSessionId, notificationIdentifier, currentSession.student.id);
          if (!params) return;
          if (notificationIdentifier) lastHandledNotificationIdRef.current = notificationIdentifier;
          navigateToNotificationDestination({ screen: "StudyGame", params });
        };

        // Restore a cold-start tap once. Signing into another student must not
        // replay the device's previous notification response.
        const checkColdStart = coldStartNotificationPendingRef.current;
        coldStartNotificationPendingRef.current = false;
        const last = checkColdStart ? await Notifications.getLastNotificationResponseAsync() : null;
        if (disposed) return;
        if (last) await handleResponse(last);

        sub = Notifications.addNotificationResponseReceivedListener((response) => { handleResponse(response).catch(() => {}); });
      } catch {
        // expo-notifications unavailable in Expo Go / web
      }
    };

    setup().catch(() => {});
    return () => {
      disposed = true;
      sub?.remove();
    };
  }, [authBootstrapped, studentSessionId]);

  useEffect(() => {
    if (!authBootstrapped || !studentSessionId) return;

    let disposed = false;
    const controller = new AbortController();
    let registered = false;
    let registration: Promise<boolean> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopAssignmentWatcher: (() => void) | null = null;

    const ensureAssignmentWatcher = async () => {
      if (disposed || !studentSessionId || stopAssignmentWatcher) return;
      const cleanup = startStudentAssignmentNotificationsWatcher(studentSessionId, apiBaseUrl);
      if (disposed) {
        cleanup();
        return;
      }
      stopAssignmentWatcher = cleanup;
    };

    const registerCurrentDevice = async () => {
      if (disposed || registered) return registered;
      if (registration) return registration;
      registration = registerStudentPushToken(studentSessionId, apiBaseUrl, controller.signal);
      const didRegister = await registration.finally(() => { registration = null; });

      if (!disposed && didRegister) {
        registered = true;
        stopAssignmentWatcher?.();
        stopAssignmentWatcher = null;
      }
      return didRegister;
    };

    const retryRegistrationIfPermitted = async () => {
      if (disposed || registered) return;
      const permission = await getNotificationPermissionState();
      if (disposed || permission !== "granted") return;

      const didRegister = await registerCurrentDevice();
      if (!didRegister && !disposed) {
        await ensureAssignmentWatcher();
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          retryRegistrationIfPermitted().catch(() => {});
        }, 30000);
      }
    };

    const setup = async () => {
      const notificationsEnabled = await requestNotificationPermissionAfterLogin();
      if (disposed || !notificationsEnabled) return;

      const didRegister = await registerCurrentDevice();
      if (!didRegister && !disposed) {
        await ensureAssignmentWatcher();
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          retryRegistrationIfPermitted().catch(() => {});
        }, 10000);
      }
    };

    setup().catch(() => {});
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") retryRegistrationIfPermitted().catch(() => {});
    });

    return () => {
      disposed = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
      stopAssignmentWatcher?.();
      appStateSubscription.remove();
    };
  }, [apiBaseUrl, authBootstrapped, studentSessionId]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <StatusBar
            style={theme.isDark ? "light" : "dark"}
            hidden={false}
          />
          {authBootstrapped ? (
            <NavigationContainer
              ref={navigationRef}
              theme={navigationTheme}
              onReady={flushPendingNotificationNavigation}
            >
              <Stack.Navigator
                key={studentSessionId ?? "signed-out"}
                initialRouteName={studentSessionId ? "StudyGame" : "Login"}
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: theme.colors.background },
                }}
              >
                {studentSessionId ? (
                  <Stack.Screen name="StudyGame" component={StudyGameScreen} initialParams={{ sessionId: studentSessionId }} />
                ) : (
                  <Stack.Screen name="Login" component={LoginScreen} />
                )}
              </Stack.Navigator>
            </NavigationContainer>
          ) : (
            <StudyGameLoadingSkeleton theme={theme} label="Opening Eluency…" />
          )}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
