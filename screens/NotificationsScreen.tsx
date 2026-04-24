import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  View,
} from "react-native";
import { TouchableOpacity } from "../lib/hapticPressables";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemeToggleButton from "../components/ThemeToggleButton";
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
type TabType = "student" | "system";

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

function pickNotificationIcon(type: NotificationType, isDark: boolean) {
  if (type === "lesson_completed") {
    return isDark
      ? { name: "book-outline", color: "#7DD3FC", bg: "#112A37", label: "Lesson" }
      : { name: "book-outline", color: "#2D74BF", bg: "#EAF3FB", label: "Lesson" };
  }
  if (type === "test_completed") {
    return isDark
      ? { name: "clipboard-outline", color: "#C4B5FD", bg: "#251A3D", label: "Test" }
      : { name: "clipboard-outline", color: "#8B4EE2", bg: "#F2EAFF", label: "Test" };
  }
  return isDark
    ? { name: "megaphone-outline", color: "#FCA5A5", bg: "#3B1A1A", label: "Announcement" }
    : { name: "megaphone-outline", color: "#E85D4A", bg: "#FFF0EE", label: "Announcement" };
}

export default function NotificationsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("student");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const studentNotifications = useMemo(
    () => notifications.filter((n) => n.type === "lesson_completed" || n.type === "test_completed"),
    [notifications]
  );
  const systemNotifications = useMemo(
    () => notifications.filter((n) => n.type === "admin_announcement"),
    [notifications]
  );

  const tabNotifications = activeTab === "student" ? studentNotifications : systemNotifications;

  const studentUnread = studentNotifications.filter((n) => !n.read_at).length;
  const systemUnread = systemNotifications.filter((n) => !n.read_at).length;
  const tabUnread = activeTab === "student" ? studentUnread : systemUnread;
  const totalUnread = notifications.filter((n) => !n.read_at).length;

  const allTabSelected = tabNotifications.length > 0 && tabNotifications.every((n) => selectedIds.has(n.id));

  const authedFetch = async (path: string, init?: RequestInit) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Not authenticated.");
    return fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
  };

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const response = await authedFetch("/api/notifications");
      const result = (await response.json().catch(() => ({}))) as { notifications?: NotificationRow[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Failed to load notifications.");
      setNotifications((result.notifications ?? []) as NotificationRow[]);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const toggleSelectMode = () => {
    setSelectMode((prev) => !prev);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allTabSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tabNotifications.map((n) => n.id)));
    }
  };

  const markRead = async (id: string) => {
    try {
      const now = new Date().toISOString();
      const response = await authedFetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Failed to mark as read.");
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read_at: now } : item)));
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to mark as read.");
    }
  };

  const markAllRead = async () => {
    if (working || tabUnread === 0) return;
    const unreadIds = tabNotifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setWorking(true);
    try {
      const now = new Date().toISOString();
      const response = await authedFetch("/api/notifications", { method: "PATCH" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Failed to mark all as read.");
      setNotifications((prev) => prev.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to mark all as read.");
    } finally {
      setWorking(false);
    }
  };

  const deleteNotification = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await authedFetch("/api/notifications", {
        method: "DELETE",
        body: JSON.stringify({ ids: [id] }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Failed to delete notification.");
      setNotifications((prev) => prev.filter((item) => item.id !== id));
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete notification.");
    } finally {
      setDeletingId(null);
    }
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      "Delete selected",
      `Delete ${selectedIds.size} notification${selectedIds.size > 1 ? "s" : ""}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setWorking(true);
            try {
              const ids = Array.from(selectedIds);
              const response = await authedFetch("/api/notifications", {
                method: "DELETE",
                body: JSON.stringify({ ids }),
              });
              const result = (await response.json().catch(() => ({}))) as { error?: string };
              if (!response.ok) throw new Error(result.error || "Failed to delete.");
              setNotifications((prev) => prev.filter((n) => !selectedIds.has(n.id)));
              setSelectedIds(new Set());
              setSelectMode(false);
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete.");
            } finally {
              setWorking(false);
            }
          },
        },
      ]
    );
  };

  const reviewNotification = async (notification: NotificationRow) => {
    if (!notification.read_at) await markRead(notification.id);
    const lessonId = typeof notification.metadata?.lesson_id === "string" ? notification.metadata.lesson_id : null;
    const testId = typeof notification.metadata?.test_id === "string" ? notification.metadata.test_id : null;
    const studentId = typeof notification.metadata?.student_id === "string" ? notification.metadata.student_id : null;
    if (lessonId) { navigation.navigate("LessonForm", { lessonId }); return; }
    if (testId) { navigation.navigate("TestForm", { testId }); return; }
    if (studentId) { navigation.navigate("StudentForm", { studentId }); return; }
  };

  const HEADER_HEIGHT = Math.max(insets.top, 8) + 58;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* ── Header ── */}
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
            height: 40,
            width: 40,
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
          <Text style={[theme.typography.label, { fontSize: 11 }]}>Teacher</Text>
          <Text style={[theme.typography.title, { marginTop: 1, fontSize: 17, lineHeight: 21 }]}>Notifications</Text>
        </View>

        <ThemeToggleButton />

        {totalUnread > 0 ? (
          <View
            style={{
              minWidth: 24,
              height: 24,
              borderRadius: 12,
              paddingHorizontal: 7,
              backgroundColor: "#E85D4A",
              alignItems: "center",
              justifyContent: "center",
              marginLeft: 8,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "800" }}>
              {totalUnread > 99 ? "99+" : totalUnread}
            </Text>
          </View>
        ) : (
          <View style={{ width: 24, marginLeft: 8 }} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: HEADER_HEIGHT + 12,
          paddingHorizontal: 16,
          paddingBottom: 40,
        }}
      >
        {/* ── Tabs ── */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: theme.colors.surface,
            borderRadius: 14,
            padding: 4,
            marginBottom: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          {(
            [
              { id: "student" as TabType, label: "Student Activity", unread: studentUnread, count: studentNotifications.length },
              { id: "system" as TabType, label: "System", unread: systemUnread, count: systemNotifications.length },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => {
                  setActiveTab(tab.id);
                  setSelectMode(false);
                  setSelectedIds(new Set());
                }}
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 9,
                  borderRadius: 11,
                  backgroundColor: active ? theme.colors.primary : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: active ? "#FFFFFF" : theme.colors.textMuted,
                  }}
                >
                  {tab.label}
                </Text>
                {tab.unread > 0 ? (
                  <View
                    style={{
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      paddingHorizontal: 5,
                      backgroundColor: active ? "rgba(255,255,255,0.3)" : "#E85D4A",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "800", color: "#FFFFFF" }}>
                      {tab.unread > 99 ? "99+" : tab.unread}
                    </Text>
                  </View>
                ) : tab.count > 0 ? (
                  <View
                    style={{
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      paddingHorizontal: 5,
                      backgroundColor: active ? "rgba(255,255,255,0.2)" : theme.colors.surfaceAlt,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "700",
                        color: active ? "#FFFFFF" : theme.colors.textMuted,
                      }}
                    >
                      {tab.count}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Toolbar ── */}
        {!loading && tabNotifications.length > 0 ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
              paddingHorizontal: 2,
            }}
          >
            {selectMode ? (
              <>
                <TouchableOpacity onPress={toggleSelectAll} activeOpacity={0.8} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      borderWidth: 2,
                      borderColor: allTabSelected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: allTabSelected ? theme.colors.primary : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {allTabSelected ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.text }}>Select all</Text>
                </TouchableOpacity>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  {selectedIds.size > 0 ? (
                    <TouchableOpacity
                      onPress={deleteSelected}
                      activeOpacity={0.8}
                      disabled={working}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        backgroundColor: "#FFF0EE",
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 9,
                      }}
                    >
                      <Ionicons name="trash-outline" size={15} color="#D4462A" />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#D4462A" }}>
                        Delete ({selectedIds.size})
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity onPress={toggleSelectMode} activeOpacity={0.8}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.textMuted }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity
                  onPress={markAllRead}
                  activeOpacity={0.8}
                  disabled={working || tabUnread === 0}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, opacity: tabUnread === 0 ? 0.4 : 1 }}
                >
                  <Ionicons name="checkmark-done-outline" size={16} color={theme.colors.primary} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.primary }}>
                    {working ? "Working…" : "Mark all read"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={toggleSelectMode} activeOpacity={0.8}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.textMuted }}>Select</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : null}

        {/* ── Notification list ── */}
        <View style={{ gap: 8 }}>
          {loading ? (
            <GlassCard style={{ borderRadius: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={theme.typography.body}>Loading notifications…</Text>
              </View>
            </GlassCard>
          ) : tabNotifications.length === 0 ? (
            <GlassCard style={{ borderRadius: 16 }}>
              <View style={{ alignItems: "center", gap: 8, paddingVertical: 12 }}>
                <Ionicons name="notifications-off-outline" size={32} color={theme.colors.textMuted} />
                <Text style={[theme.typography.bodyStrong, { fontSize: 15 }]}>
                  {activeTab === "student" ? "No student activity yet" : "No system notifications"}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, textAlign: "center" }]}>
                  {activeTab === "student"
                    ? "Completed lessons and tests will appear here."
                    : "Admin announcements will appear here."}
                </Text>
              </View>
            </GlassCard>
          ) : (
            tabNotifications.map((notification) => {
              const meta = pickNotificationIcon(notification.type, theme.isDark);
              const isSelected = selectedIds.has(notification.id);
              const hasReviewTarget =
                typeof notification.metadata?.lesson_id === "string" ||
                typeof notification.metadata?.test_id === "string" ||
                typeof notification.metadata?.student_id === "string";

              return (
                <TouchableOpacity
                  key={notification.id}
                  activeOpacity={selectMode ? 0.85 : 1}
                  onPress={selectMode ? () => toggleSelect(notification.id) : undefined}
                >
                  <GlassCard
                    style={{
                      borderRadius: 16,
                      borderWidth: isSelected ? 1.5 : 1,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                    }}
                    padding={14}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      {/* Checkbox in select mode */}
                      {selectMode ? (
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            borderWidth: 2,
                            borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                            backgroundColor: isSelected ? theme.colors.primary : "transparent",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {isSelected ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                        </View>
                      ) : null}

                      {/* Icon */}
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 13,
                          backgroundColor: meta.bg,
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Ionicons name={meta.name as any} size={20} color={meta.color} />
                      </View>

                      {/* Content */}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                theme.typography.bodyStrong,
                                { fontSize: 14, fontWeight: notification.read_at ? "600" : "800", lineHeight: 20 },
                              ]}
                              numberOfLines={2}
                            >
                              {notification.title}
                            </Text>
                            {notification.body ? (
                              <Text
                                style={[
                                  theme.typography.caption,
                                  { color: theme.colors.textMuted, marginTop: 3, lineHeight: 17 },
                                ]}
                                numberOfLines={2}
                              >
                                {notification.body}
                              </Text>
                            ) : null}
                          </View>

                          {/* Time + pill stacked on right */}
                          <View style={{ alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, fontSize: 11 }]}>
                              {formatTimeAgo(notification.created_at)}
                            </Text>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                                borderRadius: 999,
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                backgroundColor: meta.bg,
                              }}
                            >
                              <Ionicons name={meta.name as any} size={10} color={meta.color} />
                              <Text style={{ fontSize: 10, fontWeight: "800", color: meta.color }}>
                                {meta.label.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Unread dot + actions */}
                        {!selectMode ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 }}>
                            {!notification.read_at ? (
                              <View style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: theme.colors.primary }} />
                            ) : null}
                            {hasReviewTarget ? (
                              <TouchableOpacity onPress={() => reviewNotification(notification)} activeOpacity={0.8}>
                                <Text style={{ fontSize: 12, fontWeight: "700", color: theme.colors.primary }}>Review</Text>
                              </TouchableOpacity>
                            ) : null}
                            {!notification.read_at ? (
                              <TouchableOpacity onPress={() => markRead(notification.id)} activeOpacity={0.8}>
                                <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.textMuted }}>
                                  Mark read
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity
                              onPress={() => deleteNotification(notification.id)}
                              activeOpacity={0.8}
                              disabled={deletingId === notification.id}
                              style={{ marginLeft: "auto" }}
                            >
                              <Ionicons
                                name={deletingId === notification.id ? "hourglass-outline" : "trash-outline"}
                                size={15}
                                color={deletingId === notification.id ? theme.colors.textMuted : "#C94B35"}
                              />
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
