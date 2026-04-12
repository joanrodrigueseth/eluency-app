import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { NavigationProp, RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppButton from "../components/AppButton";
import GlassCard from "../components/GlassCard";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";
import { coercePlanForRole, normalizePlanUi } from "../lib/teacherRolePlanRules";

type RootStackParamList = {
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  Settings: { initialTab?: "profile" | "security" | "notifications" } | undefined;
  Subscription: undefined;
  Login: undefined;
};

type SettingsTab = "profile" | "security" | "notifications";

type PlanInfo = {
  plan: string;
  student_limit: number | null;
  lesson_limit?: number | null;
  test_limit?: number | null;
  preset_limit?: number | null;
};

const PLAN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  basic:    { bg: "#F0F4FF", text: "#3B5EDB", border: "#C0CFFF" },
  standard: { bg: "#F0FDF6", text: "#16A34A", border: "#A3E0BE" },
  school:   { bg: "#F5F0FF", text: "#7C3AED", border: "#C4B0F8" },
};

function FieldLabel({ label }: { label: string }) {
  const theme = useAppTheme();
  return (
    <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 6, fontWeight: "600", letterSpacing: 0.3 }]}>
      {label.toUpperCase()}
    </Text>
  );
}

function InputField({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  borderColor,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words";
  borderColor?: string;
}) {
  const theme = useAppTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textMuted}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      style={{
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: borderColor ?? theme.colors.border,
        backgroundColor: theme.colors.surfaceAlt,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: theme.colors.text,
        fontSize: 15,
      }}
    />
  );
}

function SectionTitle({ icon, label, color }: { icon: string; label: string; color: string }) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: color + "20", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={[theme.typography.bodyStrong, { fontSize: 15 }]}>{label}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Settings">>();
  const insets = useSafeAreaInsets();
  const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";

  const initialTab = route.params?.initialTab;
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? "profile");
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [profile, setProfile] = useState({ name: "", email: "" });
  const [originalEmail, setOriginalEmail] = useState("");
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [studentCount, setStudentCount] = useState(0);
  const [passwords, setPasswords] = useState({ newPassword: "", confirmPassword: "" });

  const passwordsMatch =
    passwords.confirmPassword.length > 0 && passwords.confirmPassword === passwords.newPassword;

  const initials = profile.name
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

  useEffect(() => {
    let mounted = true;
    (async () => {
      setProfileLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!mounted || !user) return;

        let displayName = (user.user_metadata?.name as string) || "";
        const teacherSelect = "name, role, plan, student_limit, lesson_limit, test_limit, preset_limit, default_language_pair";
        const { data: teacherByUserId, error: teacherByUserIdError } = await (supabase.from("teachers") as any)
          .select(teacherSelect)
          .eq("user_id", user.id)
          .maybeSingle();

        let teacher = teacherByUserId;

        // Fallback for legacy rows where auth user id may be stored as teachers.id.
        if (!teacher) {
          const { data: teacherById, error: teacherByIdError } = await (supabase.from("teachers") as any)
            .select(teacherSelect)
            .eq("id", user.id)
            .maybeSingle();

          teacher = teacherById;
          if (!teacher && teacherByUserIdError && teacherByIdError) {
            console.warn("SettingsScreen: unable to load teacher row via user_id or id; using auth fallbacks.");
          }
        }

        if (teacher?.name) displayName = teacher.name;
        const email = user.email ?? "";

        if (!mounted) return;
        setProfile({ name: displayName, email });
        setOriginalEmail(email);

        if (teacher) {
          const coercedPlan = coercePlanForRole(teacher.role ?? "teacher", teacher.plan ?? "Basic");
          setPlanInfo({
            plan: normalizePlanUi(coercedPlan),
            student_limit: teacher.student_limit ?? null,
            lesson_limit: teacher.lesson_limit ?? null,
            test_limit: teacher.test_limit ?? null,
            preset_limit: teacher.preset_limit ?? null,
          });
        } else {
          // Final fallback to auth metadata when teacher row is not available.
          const authPlan = normalizePlanUi((user.user_metadata?.plan as string) ?? (user.app_metadata?.plan as string));
          setPlanInfo({ plan: authPlan, student_limit: null });
        }

        const { count } = await (supabase.from("students") as any)
          .select("*", { count: "exact", head: true })
          .eq("teacher_id", user.id);
        if (!mounted) return;
        setStudentCount(count ?? 0);
      } catch (err) {
        if (!mounted) return;
        Alert.alert("Error", err instanceof Error ? err.message : "Failed to load settings.");
      } finally {
        if (mounted) setProfileLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveTab(route.params.initialTab);
    }
  }, [route.params?.initialTab]);

  const updateProfile = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: authError } = await supabase.auth.updateUser({
        email: profile.email.trim(),
        data: { name: profile.name.trim() },
      });
      if (authError) throw authError;
      if (user?.id && profile.name.trim()) {
        const { error: te } = await (supabase.from("teachers") as any)
          .update({ name: profile.name.trim() })
          .eq("user_id", user.id);
        if (te) throw te;
      }
      Alert.alert("Saved", profile.email.trim() !== originalEmail
        ? "Profile saved. Check your new email address to confirm the change."
        : "Profile saved.");
      setOriginalEmail(profile.email.trim());
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async () => {
    if (saving) return;
    if (passwords.newPassword.length < 8) { Alert.alert("Password", "Password must be at least 8 characters."); return; }
    if (passwords.newPassword !== passwords.confirmPassword) { Alert.alert("Password", "Passwords do not match."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwords.newPassword });
      if (error) throw error;
      setPasswords({ newPassword: "", confirmPassword: "" });
      Alert.alert("Saved", "Password updated successfully.");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setSaving(false);
    }
  };

  const deleteAccountAndContent = async () => {
    if (deletingAccount) return;

    Alert.alert(
      "Delete account",
      "Delete your account and all created content? This will permanently remove your lessons, tests, students, and account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes",
          style: "destructive",
          onPress: async () => {
            setDeletingAccount(true);
            try {
              const {
                data: { user },
                error: userError,
              } = await supabase.auth.getUser();
              if (userError) throw userError;
              if (!user) throw new Error("Not authenticated.");

              const {
                data: { session },
                error: sessionError,
              } = await supabase.auth.getSession();
              if (sessionError) throw sessionError;
              const accessToken = session?.access_token;
              if (!accessToken) throw new Error("Not authenticated.");

              const userId = user.id;

              const { data: lessonRows, error: lessonsLookupError } = await (supabase.from("lessons") as any)
                .select("id")
                .eq("created_by", userId);
              if (lessonsLookupError) throw lessonsLookupError;

              const lessonIds = Array.isArray(lessonRows)
                ? lessonRows.map((row: { id: string }) => row.id).filter(Boolean)
                : [];

              const { data: packRows, error: packsLookupError } = await (supabase.from("lesson_packs") as any)
                .select("id")
                .eq("created_by", userId);
              if (packsLookupError) throw packsLookupError;

              const packIds = Array.isArray(packRows)
                ? packRows.map((row: { id: string }) => row.id).filter(Boolean)
                : [];

              if (lessonIds.length > 0) {
                const { error: deleteLessonLinksError } = await (supabase.from("lesson_pack_lessons") as any)
                  .delete()
                  .in("lesson_id", lessonIds);
                if (deleteLessonLinksError) throw deleteLessonLinksError;
              }

              if (packIds.length > 0) {
                const { error: deletePackLinksError } = await (supabase.from("lesson_pack_lessons") as any)
                  .delete()
                  .in("pack_id", packIds);
                if (deletePackLinksError) throw deletePackLinksError;

                const { error: deletePacksError } = await (supabase.from("lesson_packs") as any)
                  .delete()
                  .in("id", packIds);
                if (deletePacksError) throw deletePacksError;
              }

              if (lessonIds.length > 0) {
                const { error: deleteLessonsError } = await (supabase.from("lessons") as any)
                  .delete()
                  .in("id", lessonIds);
                if (deleteLessonsError) throw deleteLessonsError;
              }

              const { error: deleteTestsError } = await (supabase.from("tests") as any)
                .delete()
                .eq("teacher_id", userId);
              if (deleteTestsError) throw deleteTestsError;

              const { error: deleteStudentsError } = await (supabase.from("students") as any)
                .delete()
                .eq("teacher_id", userId);
              if (deleteStudentsError) throw deleteStudentsError;

              const base = apiBaseUrl.replace(/\/$/, "");
              const res = await fetch(`${base}/api/admin/teachers/${userId}`, {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              });
              const body = (await res.json().catch(() => ({}))) as { error?: string };
              if (!res.ok) throw new Error(body?.error ?? `Failed to delete account (${res.status})`);

              await supabase.auth.signOut();
              navigation.reset({ index: 0, routes: [{ name: "Login" }] });
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : "Failed to delete account.");
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  const tabs: { id: SettingsTab; label: string; icon: string; color: string }[] = [
    { id: "profile",       label: "Profile",       icon: "person-outline",        color: "#3B5EDB" },
    { id: "security",      label: "Security",      icon: "shield-outline",        color: "#D4462A" },
    { id: "notifications", label: "Notifications", icon: "notifications-outline", color: "#3EA370" },
  ];

  const planKey = (planInfo?.plan ?? "basic").toLowerCase();
  const planColor = PLAN_COLORS[planKey] ?? PLAN_COLORS.basic;
  const effectiveStudentLimit =
    planKey === "basic" ? 1 : planKey === "standard" ? 30 : (planInfo?.student_limit ?? null);
  const planCtaLabel = planKey === "basic" ? "Upgrade Now!" : "View Plans";
  const studentUsageLabel =
    effectiveStudentLimit === 999 || effectiveStudentLimit === -1
      ? `${studentCount} / Unlimited`
      : `${studentCount} / ${effectiveStudentLimit != null ? String(effectiveStudentLimit) : "-"}`;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Decorative blob */}
      <View
        style={{ position: "absolute", top: 0, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: theme.colors.primarySoft, opacity: 0.5 }}
        pointerEvents="none"
      />

      {/* Header */}
      <View
        style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 50,
          backgroundColor: theme.isDark ? theme.colors.background : "#FFFFFF",
          borderBottomWidth: 1, borderBottomColor: theme.colors.border,
          paddingTop: Math.max(insets.top, 8), paddingBottom: 10, paddingHorizontal: 16,
          flexDirection: "row", alignItems: "center",
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.navigate("Dashboard", { openDrawer: true })}
          activeOpacity={0.85}
          style={{ height: 44, width: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceGlass, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text style={theme.typography.label}>Account</Text>
          <Text style={[theme.typography.title, { marginTop: 2, fontSize: 18, lineHeight: 22 }]}>Settings</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: Math.max(insets.top, 8) + 68, paddingHorizontal: 20, paddingBottom: 40 }}
      >
        {profileLoading ? (
          <GlassCard style={{ borderRadius: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 20, gap: 12 }}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={theme.typography.body}>Loading settings…</Text>
            </View>
          </GlassCard>
        ) : (
          <>
            {/* Profile hero */}
            <GlassCard style={{ borderRadius: 20, marginBottom: 16 }} padding={20}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                <View style={{
                  width: 60, height: 60, borderRadius: 20,
                  backgroundColor: theme.colors.primary,
                  alignItems: "center", justifyContent: "center",
                  shadowColor: theme.colors.primary, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
                }}>
                  <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[theme.typography.bodyStrong, { fontSize: 17 }]}>{profile.name || "—"}</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>{profile.email}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: planColor.bg, borderWidth: 1, borderColor: planColor.border }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: planColor.text }}>{planInfo?.plan ?? "Basic"}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </GlassCard>

            {/* Tab bar */}
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 16 }}>
              {tabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    onPress={() => setActiveTab(tab.id)}
                    activeOpacity={0.85}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      paddingHorizontal: 8,
                      paddingVertical: 10,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: active ? tab.color : theme.colors.border,
                      backgroundColor: active ? tab.color + "15" : theme.colors.surface,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                    }}
                  >
                    <Ionicons name={tab.icon as any} size={14} color={active ? tab.color : theme.colors.textMuted} />
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      style={{ fontSize: 11, fontWeight: "700", color: active ? tab.color : theme.colors.textMuted, flexShrink: 1 }}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Profile ── */}
            {activeTab === "profile" && (
              <>
                <GlassCard style={{ borderRadius: 20, marginBottom: 12 }} padding={20}>
                  <SectionTitle icon="person-outline" label="Profile information" color="#3B5EDB" />

                  <View style={{ gap: 14 }}>
                    <View>
                      <FieldLabel label="Full name" />
                      <InputField
                        value={profile.name}
                        onChangeText={(v) => setProfile((p) => ({ ...p, name: v }))}
                        placeholder="e.g. Maria Santos"
                        autoCapitalize="words"
                      />
                    </View>

                    <View>
                      <FieldLabel label="Email address" />
                      <InputField
                        value={profile.email}
                        onChangeText={(v) => setProfile((p) => ({ ...p, email: v }))}
                        placeholder="email@example.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                      {profile.email.trim() !== originalEmail ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
                          <Ionicons name="information-circle-outline" size={14} color={theme.colors.primary} />
                          <Text style={[theme.typography.caption, { color: theme.colors.primary }]}>You will need to confirm the new email address.</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={{ marginTop: 20 }}>
                    <AppButton
                      label={saving ? "Saving…" : "Save changes"}
                      onPress={updateProfile}
                      loading={saving}
                      icon={<Ionicons name="checkmark-outline" size={18} color="#fff" />}
                    />
                  </View>
                </GlassCard>

                <GlassCard style={{ borderRadius: 20, marginBottom: 12 }} padding={20}>
                  <SectionTitle icon="diamond-outline" label="Your plan" color="#9050E7" />

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: 14, borderRadius: 14, backgroundColor: planColor.bg, borderWidth: 1, borderColor: planColor.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[theme.typography.caption, { color: planColor.text, fontWeight: "600", marginBottom: 2 }]}>CURRENT PLAN</Text>
                      <Text style={[theme.typography.bodyStrong, { color: planColor.text, fontSize: 18 }]}>{planInfo?.plan ?? "Basic"}</Text>
                      <TouchableOpacity
                        onPress={() => navigation.navigate("Subscription")}
                        activeOpacity={0.85}
                        style={{ marginTop: 8, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: planColor.text + "20", borderWidth: 1, borderColor: planColor.text + "33" }}
                      >
                        <Text style={[theme.typography.caption, { color: planColor.text, fontWeight: "700" }]}>{planCtaLabel}</Text>
                        <Feather name="arrow-right" size={13} color={planColor.text} />
                      </TouchableOpacity>
                    </View>

                    <View style={{ alignItems: "flex-end", marginHorizontal: 10 }}>
                      <Text style={[theme.typography.caption, { color: planColor.text, fontWeight: "700", marginBottom: 2 }]}>STUDENTS MAX</Text>
                      <Text style={[theme.typography.bodyStrong, { color: planColor.text, fontSize: 14 }]}>{studentUsageLabel}</Text>
                    </View>

                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: planColor.text + "20", alignItems: "center", justifyContent: "center", marginLeft: 2 }}>
                      <Ionicons name="diamond" size={20} color={planColor.text} />
                    </View>
                  </View>

                </GlassCard>
              </>
            )}

            {/* ── Security ── */}
            {activeTab === "security" && (
              <>
                <GlassCard style={{ borderRadius: 20, marginBottom: 12 }} padding={20}>
                  <SectionTitle icon="lock-closed-outline" label="Change password" color="#D4462A" />

                  <View style={{ gap: 12 }}>
                    <View>
                      <FieldLabel label="New password" />
                      <InputField
                        value={passwords.newPassword}
                        onChangeText={(v) => setPasswords((p) => ({ ...p, newPassword: v }))}
                        placeholder="Minimum 8 characters"
                        secureTextEntry
                      />
                    </View>

                    <View>
                      <FieldLabel label="Confirm password" />
                      <InputField
                        value={passwords.confirmPassword}
                        onChangeText={(v) => setPasswords((p) => ({ ...p, confirmPassword: v }))}
                        placeholder="Re-enter new password"
                        secureTextEntry
                        borderColor={
                          passwords.confirmPassword.length
                            ? passwordsMatch ? theme.colors.success : theme.colors.danger
                            : undefined
                        }
                      />
                      {passwords.confirmPassword.length ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
                          <Ionicons
                            name={passwordsMatch ? "checkmark-circle-outline" : "close-circle-outline"}
                            size={14}
                            color={passwordsMatch ? theme.colors.success : theme.colors.danger}
                          />
                          <Text style={[theme.typography.caption, { color: passwordsMatch ? theme.colors.success : theme.colors.danger }]}>
                            {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={{ marginTop: 20 }}>
                    <AppButton
                      label={saving ? "Updating…" : "Update password"}
                      onPress={updatePassword}
                      loading={saving}
                      icon={<Ionicons name="shield-checkmark-outline" size={18} color="#fff" />}
                    />
                  </View>
                </GlassCard>

                <GlassCard style={{ borderRadius: 20, marginBottom: 12, borderColor: "#FECACA", borderWidth: 1.5 }} padding={20}>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 16 }]}>Delete account and content created. This permanently removes your lessons, tests, students, and account.</Text>
                  <TouchableOpacity
                    onPress={deleteAccountAndContent}
                    activeOpacity={0.85}
                    disabled={deletingAccount}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingVertical: 13,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: "#DC2626",
                      backgroundColor: deletingAccount ? "#FEE2E2" : "#FEF2F2",
                    }}
                  >
                    {deletingAccount ? (
                      <ActivityIndicator size="small" color="#DC2626" />
                    ) : (
                      <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    )}
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#DC2626" }}>
                      {deletingAccount ? "Deleting account…" : "Delete account and content created"}
                    </Text>
                  </TouchableOpacity>
                </GlassCard>
              </>
            )}

            {/* ── Notifications ── */}
            {activeTab === "notifications" && (
              <GlassCard style={{ borderRadius: 20, marginBottom: 12 }} padding={30}>
                <View style={{ alignItems: "center", gap: 12 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: "#F0FDF4", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="notifications-outline" size={28} color="#3EA370" />
                  </View>
                  <Text style={[theme.typography.bodyStrong, { fontSize: 16 }]}>Coming soon</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, textAlign: "center", maxWidth: 240 }]}>
                    Notification preferences will be available in a future update.
                  </Text>
                </View>
              </GlassCard>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
