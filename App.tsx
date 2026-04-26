import { useEffect, useRef, useState } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ActivityIndicator, View } from "react-native";
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import DashboardScreen from "./screens/DashboardScreen";
import NotificationsScreen from "./screens/NotificationsScreen";
import ChatsScreen from "./screens/ChatsScreen";
import SendNotificationsScreen from "./screens/SendNotificationsScreen";
import TeachersScreen from "./screens/TeachersScreen";
import SettingsScreen from "./screens/SettingsScreen";
import SubscriptionScreen from "./screens/SubscriptionScreen";
import LessonPacksScreen from "./screens/LessonPacksScreen";
import StudentsScreen from "./screens/StudentsScreen";
import StudentFormScreen from "./screens/StudentFormScreen";
import TestsScreen from "./screens/TestsScreen";
import TestFormScreen from "./screens/TestFormScreen";
import LessonsScreen from "./screens/LessonsScreen";
import LessonFormScreen from "./screens/LessonFormScreen";
import StudyGameScreen from "./screens/StudyGameScreen";
import StudentResultsScreen from "./screens/StudentResultsScreen";
import { getStoredStudentSessionId } from "./lib/studentSession";
import { ThemeProvider, useAppTheme } from "./lib/theme";
import { clearSupabaseAuthStorage, supabase } from "./lib/supabase";
import { ensureLocalNotificationsReady } from "./lib/mobileNotifications";
import { startStudentAssignmentsWatcher, startTeacherNotificationsWatcher } from "./lib/notificationWatchers";
import Constants from "expo-constants";

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef<any>();

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

function AppShell() {
  const theme = useAppTheme();
  const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";
  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [studentSessionId, setStudentSessionId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const storedStudentSessionId = await getStoredStudentSessionId();
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error?.message?.toLowerCase().includes("refresh token")) {
          await clearSupabaseAuthStorage();
          setHasSession(false);
        } else {
          setHasSession(!!data.session);
        }
        setStudentSessionId(storedStudentSessionId);
      } catch (error) {
        if (!mounted) return;
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (message.includes("refresh token")) {
          await clearSupabaseAuthStorage();
        }
        setHasSession(false);
        setStudentSessionId(storedStudentSessionId);
      } finally {
        if (!mounted) return;
        setAuthBootstrapped(true);
      }
    };

    bootstrap().catch(() => {
      if (!mounted) return;
      setHasSession(false);
      setAuthBootstrapped(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (hasSession) return;

    let cancelled = false;
    const intervalId = setInterval(() => {
      getStoredStudentSessionId()
        .then((storedId) => {
          if (cancelled) return;
          setStudentSessionId((prev) => (prev === storedId ? prev : storedId));
        })
        .catch(() => {});
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [hasSession]);

  // Handle notification taps — navigate teacher to Students screen
  useEffect(() => {
    let sub: { remove: () => void } | null = null;

    const setup = async () => {
      try {
        const Notifications = await import("expo-notifications");

        const handleResponse = (response: any) => {
          const data = response?.notification?.request?.content?.data ?? {};
          const studentId = typeof data.student_id === "string" ? data.student_id : null;
          if (!studentId) return;
          if (navigationRef.isReady()) {
            navigationRef.navigate("Students", { openStudentId: studentId });
          }
        };

        // Cold-start: app opened via notification tap
        const last = await Notifications.getLastNotificationResponseAsync();
        if (last) handleResponse(last);

        sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
      } catch {
        // expo-notifications unavailable in Expo Go / web
      }
    };

    setup().catch(() => {});
    return () => { sub?.remove(); };
  }, []);

  useEffect(() => {
    if (!authBootstrapped) return;

    let cleanup: (() => void) | null = null;
    let disposed = false;

    const setup = async () => {
      await ensureLocalNotificationsReady();
      if (disposed) return;

      if (hasSession) {
        const watcherCleanup = await startTeacherNotificationsWatcher();
        if (disposed) {
          watcherCleanup();
          return;
        }
        cleanup = watcherCleanup;
        return;
      }

      if (studentSessionId) {
        const watcherCleanup = await startStudentAssignmentsWatcher(studentSessionId, apiBaseUrl);
        if (disposed) {
          watcherCleanup();
          return;
        }
        cleanup = watcherCleanup;
      }
    };

    setup().catch(() => {});

    return () => {
      disposed = true;
      if (cleanup) cleanup();
    };
  }, [apiBaseUrl, authBootstrapped, hasSession, studentSessionId]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <StatusBar
          style={theme.isDark ? "light" : "dark"}
          hidden={false}
          translucent={false}
          backgroundColor={theme.colors.background}
        />
        {authBootstrapped ? (
          <NavigationContainer ref={navigationRef}>
            <Stack.Navigator
              initialRouteName={hasSession ? "Dashboard" : studentSessionId ? "StudyGame" : "Register"}
              screenOptions={{
                headerShown: false,
              }}
            >
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
              <Stack.Screen name="Dashboard" component={DashboardScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="Chats" component={ChatsScreen} />
              <Stack.Screen name="SendNotifications" component={SendNotificationsScreen} />
              <Stack.Screen name="Teachers" component={TeachersScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="Subscription" component={SubscriptionScreen} />
              <Stack.Screen name="LessonPacks" component={LessonPacksScreen} />
              <Stack.Screen name="Students" component={StudentsScreen} />
              <Stack.Screen name="StudentForm" component={StudentFormScreen} />
              <Stack.Screen name="Lessons" component={LessonsScreen} />
              <Stack.Screen name="LessonForm" component={LessonFormScreen} />
              <Stack.Screen name="Tests" component={TestsScreen} />
              <Stack.Screen name="TestForm" component={TestFormScreen} />
              <Stack.Screen name="StudentResults" component={StudentResultsScreen} />
              <Stack.Screen name="StudyGame" component={StudyGameScreen} initialParams={{ sessionId: studentSessionId || "" }} />
            </Stack.Navigator>
          </NavigationContainer>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        )}
      </View>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
