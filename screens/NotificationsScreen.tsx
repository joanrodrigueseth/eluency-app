import {
  useEffect,
  useMemo,
  useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  View,
} from "react-native";
import { TouchableOpacity } from "../lib/hapticPressables";
import { Ionicons } from "@expo/vector-icons";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppButton from "../components/AppButton";
import GlassCard from "../components/GlassCard";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";

type RootStackParamList = {
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  LessonForm: { lessonId?: string } | undefined;
  TestForm: { testId?: string } | undefined;
  StudentForm: { studentId?: string } | undefined;
};

type NotificationType = "lesson_completed" | "test_completed" | "admin_announcement";
type FilterType = "all" | "unread" | "activity" | "announcements";

type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

function formatTimeAgo(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function pickNotificationIcon(type: NotificationType) {
  if (type === "lesson_completed") return { name: "book-outline", color: "#2D74BF", bg: "#EAF3FB", label: "Lesson" };
  if (type === "test_completed") return { name: "clipboard-outline", color: "#8B4EE2", bg: "#F2EAFF", label: "Test" };
  return { name: "megaphone-outline", color: "#E85D4A", bg: "#FFF0EE", label: "Announcement" };
}

export default function NotificationsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  const filteredNotifications = useMemo(() => {
    if (activeFilter === "unread") return notifications.filter((notification) => !notification.read_at);
    if (activeFilter === "activity") {
      return notifications.filter(
        (notification) =>
          notification.type === "lesson_completed" || notification.type === "test_completed"
      );
    }
    if (activeFilter === "announcements") {
      return notifications.filter((notification) => notification.type === "admin_announcement");
    }
    return notifications;
  }, [activeFilter, notifications]);

  const filters: { id: FilterType; label: string }[] = [
    { id: "all", label: `All (${notifications.length})` },
    { id: "unread", label: `Unread (${unreadCount})` },
    { id: "activity", label: "Activity" },
    { id: "announcements", label: "Announcements" },
  ];

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.from("teacher_notifications") as any)
        .select("id, type, title, body, metadata, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setNotifications((data ?? []) as NotificationRow[]);
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const markRead = async (id: string) => {
    try {
      const now = new Date().toISOString();
      const { error } = await (supabase.from("teacher_notifications") as any)
        .update({ read_at: now })
        .eq("id", id);
      if (error) throw error;
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read_at: now } : item)));
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to mark notification as read.");
    }
  };

  const markAllRead = async () => {
    if (working || unreadCount === 0) return;
    const unreadIds = notifications.filter((notification) => !notification.read_at).map((notification) => notification.id);
    if (unreadIds.length === 0) return;

    setWorking(true);
    try {
      const now = new Date().toISOString();
      const { error } = await (supabase.from("teacher_notifications") as any)
        .update({ read_at: now })
        .in("id", unreadIds);
      if (error) throw error;
      setNotifications((prev) => prev.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to mark all notifications as read.");
    } finally {
      setWorking(false);
    }
  };

  const deleteNotification = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await (supabase.from("teacher_notifications") as any).delete().eq("id", id);
      if (error) throw error;
      setNotifications((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to delete notification.");
    } finally {
      setDeletingId(null);
    }
  };

  const clearAll = () => {
    if (working || notifications.length === 0) return;

    Alert.alert("Clear notifications", "Delete all notifications? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete all",
        style: "destructive",
        onPress: async () => {
          setWorking(true);
          try {
            const ids = notifications.map((notification) => notification.id);
            const { error } = await (supabase.from("teacher_notifications") as any)
              .delete()
              .in("id", ids);
            if (error) throw error;
            setNotifications([]);
          } catch (error) {
            Alert.alert("Error", error instanceof Error ? error.message : "Failed to clear notifications.");
          } finally {
            setWorking(false);
          }
        },
      },
    ]);
  };

  const reviewNotification = async (notification: NotificationRow) => {
    if (!notification.read_at) {
      await markRead(notification.id);
    }

    const lessonId = typeof notification.metadata?.lesson_id === "string" ? notification.metadata.lesson_id : null;
    const testId = typeof notification.metadata?.test_id === "string" ? notification.metadata.test_id : null;
    const studentId = typeof notification.metadata?.student_id === "string" ? notification.metadata.student_id : null;

    if (lessonId) {
      navigation.navigate("LessonForm", { lessonId });
      return;
    }
    if (testId) {
      navigation.navigate("TestForm", { testId });
      return;
    }
    if (studentId) {
      navigation.navigate("StudentForm", { studentId });
      return;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          backgroundColor: theme.isDark ? theme.colors.background : "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          paddingTop: Math.max(insets.top, 8),
          paddingBottom: 10,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <TouchableOpacity
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Dashboard"))}
          activeOpacity={0.85}
          style={{
            height: 44,
            width: 44,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceGlass,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text style={theme.typography.label}>Teacher</Text>
          <Text style={[theme.typography.title, { marginTop: 2, fontSize: 18, lineHeight: 22 }]}>Notifications</Text>
        </View>
        {unreadCount > 0 ? (
          <View
            style={{
              minWidth: 26,
              height: 26,
              borderRadius: 13,
              paddingHorizontal: 8,
              backgroundColor: "#E85D4A",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "800" }}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
          </View>
        ) : (
          <View style={{ width: 26 }} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: Math.max(insets.top, 8) + 68, paddingHorizontal: 20, paddingBottom: 30 }}
      >
        <GlassCard style={{ borderRadius: 18, marginBottom: 14 }} padding={14}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={[theme.typography.bodyStrong, { fontSize: 14 }]}>Inbox</Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{notifications.length} total</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {filters.map((filter) => {
              const active = activeFilter === filter.id;
              return (
                <TouchableOpacity
                  key={filter.id}
                  onPress={() => setActiveFilter(filter.id)}
                  activeOpacity={0.85}
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: active ? theme.colors.primary : theme.colors.textMuted }}>
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </GlassCard>

        <View style={{ gap: 10 }}>
          {loading ? (
            <GlassCard style={{ borderRadius: 18 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={theme.typography.body}>Loading notifications…</Text>
              </View>
            </GlassCard>
          ) : filteredNotifications.length === 0 ? (
            <GlassCard style={{ borderRadius: 18 }}>
              <View style={{ alignItems: "center", gap: 8, paddingVertical: 8 }}>
                <Ionicons name="notifications-off-outline" size={30} color={theme.colors.textMuted} />
                <Text style={[theme.typography.bodyStrong, { fontSize: 15 }]}>
                  {activeFilter === "unread" ? "All caught up" : "No notifications found"}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, textAlign: "center" }]}>
                  New activity and announcements will appear here.
                </Text>
              </View>
            </GlassCard>
          ) : (
            filteredNotifications.map((notification) => {
              const meta = pickNotificationIcon(notification.type);
              const hasReviewTarget =
                typeof notification.metadata?.lesson_id === "string" ||
                typeof notification.metadata?.test_id === "string" ||
                typeof notification.metadata?.student_id === "string";

              return (
                <GlassCard key={notification.id} style={{ borderRadius: 18 }} padding={16}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        backgroundColor: meta.bg,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name={meta.name as any} size={20} color={meta.color} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <Text style={[theme.typography.bodyStrong, { flex: 1, fontSize: 15, fontWeight: notification.read_at ? "700" : "800" }]}>
                          {notification.title}
                        </Text>
                        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{formatTimeAgo(notification.created_at)}</Text>
                      </View>

                      {notification.body ? (
                        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4, lineHeight: 18 }]}>
                          {notification.body}
                        </Text>
                      ) : null}

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
                        <View
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            backgroundColor: theme.colors.surfaceAlt,
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "800", color: meta.color }}>{meta.label.toUpperCase()}</Text>
                        </View>
                        {!notification.read_at ? (
                          <View style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: theme.colors.primary }} />
                        ) : null}
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
                        {hasReviewTarget ? (
                          <TouchableOpacity onPress={() => reviewNotification(notification)} activeOpacity={0.8}>
                            <Text style={{ fontSize: 12, fontWeight: "700", color: theme.colors.primary }}>Review</Text>
                          </TouchableOpacity>
                        ) : null}
                        {!notification.read_at ? (
                          <TouchableOpacity onPress={() => markRead(notification.id)} activeOpacity={0.8}>
                            <Text style={{ fontSize: 12, fontWeight: "700", color: theme.colors.textMuted }}>Mark as read</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity onPress={() => deleteNotification(notification.id)} activeOpacity={0.8} disabled={deletingId === notification.id}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#D4462A" }}>
                            {deletingId === notification.id ? "Deleting..." : "Delete"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </GlassCard>
              );
            })
          )}
        </View>

        {!loading && notifications.length > 0 ? (
          <View style={{ marginTop: 14, gap: 10 }}>
            <AppButton
              label={working ? "Working..." : "Mark all as read"}
              onPress={markAllRead}
              disabled={working || unreadCount === 0}
              variant="secondary"
              icon={<Ionicons name="checkmark-done-outline" size={18} color={theme.colors.text} />}
            />
            <AppButton
              label={working ? "Working..." : "Clear all notifications"}
              onPress={clearAll}
              disabled={working}
              variant="secondary"
              icon={<Ionicons name="trash-outline" size={18} color={theme.colors.text} />}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

