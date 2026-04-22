import {
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { TouchableOpacity } from "../lib/hapticPressables";
import { Feather, Ionicons } from "@expo/vector-icons";
import { NavigationProp, RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppButton from "../components/AppButton";
import ThemeToggleButton from "../components/ThemeToggleButton";
import FloatingToast from "../components/FloatingToast";
import GlassCard from "../components/GlassCard";
import ScreenReveal from "../components/ScreenReveal";
import { useFeedbackToast } from "../hooks/useFeedbackToast";
import { deleteOwnAccountCascade } from "../lib/api/admin";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";
import { coercePlanForRole, normalizePlanUi } from "../lib/teacherRolePlanRules";

type RootStackParamList = {
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  Settings: { initialTab?: "profile" | "security" | "terms" | "contact" } | undefined;
  Notifications: undefined;
  Subscription: undefined;
  Login: undefined;
};

type SettingsTab = "profile" | "security" | "terms" | "contact";

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
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const activeTabX = useRef(new Animated.Value(0)).current;
  const { showToast, toastProps } = useFeedbackToast({ bottom: Math.max(insets.bottom, 20) + 12 });

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
        const teacherSelect = "name, role, plan, student_limit, lesson_limit, test_limit";
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
          if (!teacher && (teacherByUserIdError || teacherByIdError)) {
            if (__DEV__) console.warn("SettingsScreen: unable to load teacher row via user_id or id; using auth fallbacks.", {
              teacherByUserIdError,
              teacherByIdError,
            });
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
            preset_limit: null,
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

  const tabs: { id: SettingsTab; label: string; icon: string; color: string }[] = [
    { id: "profile",  label: "Profile",  icon: "person-outline",        color: "#3B5EDB" },
    { id: "security", label: "Security", icon: "shield-outline",        color: "#D4462A" },
    { id: "terms",    label: "Terms",    icon: "document-text-outline", color: "#0F8A83" },
    { id: "contact",  label: "Contact",  icon: "mail-outline",          color: "#7C3AED" },
  ];

  const openExternalUrl = async (url: string, errorMessage: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error("Unsupported URL");
      await Linking.openURL(url);
    } catch {
      showToast(errorMessage, "danger");
    }
  };

  const openTerms = () =>
    openExternalUrl("https://www.eluency.com/terms", "Could not open Terms and Conditions.");

  const openPrivacy = () =>
    openExternalUrl("https://www.eluency.com/privacy", "Could not open Privacy Policy.");

  const contactTeam = () =>
    openExternalUrl(
      "mailto:nathan@eluency.com?subject=Eluency%20Support",
      "Could not open your email app."
    );

  useEffect(() => {
    if (!tabBarWidth) return;
    const index = tabs.findIndex((tab) => tab.id === activeTab);
    Animated.spring(activeTabX, {
      toValue: Math.max(0, index) * (tabBarWidth / tabs.length),
      useNativeDriver: true,
      speed: 24,
      bounciness: 6,
    }).start();
  }, [activeTab, activeTabX, tabBarWidth]);

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
      showToast(
        profile.email.trim() !== originalEmail
          ? "Profile saved. Check your new email to confirm the change."
          : "Profile saved.",
        "success"
      );
      setOriginalEmail(profile.email.trim());
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update profile.", "danger");
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async () => {
    if (saving) return;
    if (passwords.newPassword.length < 8) { showToast("Password must be at least 8 characters.", "danger"); return; }
    if (passwords.newPassword !== passwords.confirmPassword) { showToast("Passwords do not match.", "danger"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwords.newPassword });
      if (error) throw error;
      setPasswords({ newPassword: "", confirmPassword: "" });
      showToast("Password updated", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update password.", "danger");
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

              await deleteOwnAccountCascade(user.id);

              await supabase.auth.signOut();
              navigation.reset({ index: 0, routes: [{ name: "Login" }] });
            } catch (err) {
              showToast(err instanceof Error ? err.message : "Failed to delete account.", "danger");
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  const planKey = (planInfo?.plan ?? "basic").toLowerCase();
  const planColor = PLAN_COLORS[planKey] ?? PLAN_COLORS.basic;
  const effectiveStudentLimit =
    planKey === "basic" ? 1 : planKey === "standard" ? 30 : (planInfo?.student_limit ?? null);
  const planCtaLabel = planKey === "basic" ? "Upgrade Now!" : "View Plans";
  const studentUsageLabel =
    effectiveStudentLimit === 999 || effectiveStudentLimit === -1
      ? `${studentCount} / Unlimited`
      : `${studentCount} / ${effectiveStudentLimit != null ? String(effectiveStudentLimit) : "-"}`;
  const heroPlanSurface = theme.isDark ? "rgba(17,24,39,0.86)" : planColor.bg;
  const heroPlanBorder = theme.isDark ? "rgba(255,255,255,0.08)" : planColor.border;
  const heroPlanAccentBg = theme.isDark ? planColor.text + "1A" : planColor.text + "18";
  const heroPlanHeadingColor = theme.isDark ? theme.colors.textMuted : planColor.text;
  const heroPlanTitleColor = theme.isDark ? theme.colors.text : planColor.text;
  const heroPlanBodyColor = theme.isDark ? theme.colors.textMuted : planColor.text;
  const heroPlanChipBg = theme.isDark ? "rgba(255,255,255,0.05)" : "#FFFFFF80";
  const heroPlanChipBorder = theme.isDark ? "rgba(255,255,255,0.08)" : planColor.border;
  const heroPlanButtonBg = theme.isDark ? "rgba(30,41,59,0.92)" : "#FFFFFFB8";
  const heroPlanButtonBorder = theme.isDark ? "rgba(255,255,255,0.10)" : planColor.text + "22";
  const heroPlanButtonText = theme.isDark ? theme.colors.text : planColor.text;

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
        <ThemeToggleButton />
        <TouchableOpacity
          onPress={() => navigation.navigate("Notifications")}
          activeOpacity={0.85}
          style={{ height: 44, width: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceGlass, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="notifications-outline" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: Math.max(insets.top, 8) + 68, paddingHorizontal: 20, paddingBottom: 96 }}
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
            <ScreenReveal key={`hero-${activeTab}`} delay={20}>
            <GlassCard style={{ borderRadius: 20, marginBottom: 16 }} padding={20} variant="hero">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={{
                  width: 52, height: 52, borderRadius: 18,
                  backgroundColor: theme.colors.primary,
                  alignItems: "center", justifyContent: "center",
                  shadowColor: theme.colors.primary, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
                }}>
                  <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>{initials}</Text>
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
              <View
                style={{
                  marginTop: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: heroPlanBorder,
                  backgroundColor: heroPlanSurface,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 11,
                      backgroundColor: heroPlanAccentBg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="diamond-outline" size={17} color={planColor.text} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[theme.typography.caption, { color: heroPlanHeadingColor, fontWeight: "700" }]}>YOUR PLAN</Text>
                    <Text style={[theme.typography.bodyStrong, { color: heroPlanTitleColor, fontSize: 16, marginTop: 2 }]} numberOfLines={1}>
                      {planInfo?.plan ?? "Basic"}
                    </Text>
                    <Text style={[theme.typography.caption, { color: heroPlanBodyColor, marginTop: 2 }]} numberOfLines={1}>
                      Manage students, limits, and billing in one place.
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 9,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: heroPlanChipBorder,
                      backgroundColor: heroPlanChipBg,
                      flex: 1,
                    }}
                  >
                    <Ionicons name="school-outline" size={14} color={planColor.text} />
                    <Text style={[theme.typography.caption, { color: heroPlanHeadingColor, fontWeight: "700" }]}>Students</Text>
                    <Text style={[theme.typography.caption, { color: heroPlanHeadingColor }]}>{`|`}</Text>
                    <Text style={[theme.typography.caption, { color: heroPlanTitleColor, fontWeight: "700", flex: 1 }]} numberOfLines={1}>
                      {studentUsageLabel}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => navigation.navigate("Subscription")}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      paddingHorizontal: 11,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: heroPlanButtonBorder,
                      backgroundColor: heroPlanButtonBg,
                      flexShrink: 0,
                    }}
                  >
                    <Text style={[theme.typography.caption, { color: heroPlanButtonText, fontWeight: "700" }]}>{planCtaLabel}</Text>
                    <Feather name="arrow-right" size={12} color={planColor.text} />
                  </TouchableOpacity>
                </View>
              </View>
            </GlassCard>
            </ScreenReveal>

            {/* Tab bar */}
            <GlassCard style={{ marginBottom: 16, borderRadius: 18 }} padding={6} variant="strong">
            <View style={{ flexDirection: "row", gap: 6 }} onLayout={(event) => setTabBarWidth(event.nativeEvent.layout.width)}>
              {tabBarWidth ? (
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: Math.max(0, tabBarWidth / tabs.length - 4),
                    margin: 2,
                    borderRadius: 12,
                    backgroundColor: tabs.find((tab) => tab.id === activeTab)?.color + "14",
                    borderWidth: 1,
                    borderColor: tabs.find((tab) => tab.id === activeTab)?.color + "2E",
                    transform: [{ translateX: activeTabX }],
                  }}
                />
              ) : null}
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
                      borderWidth: 1,
                      borderColor: "transparent",
                      backgroundColor: "transparent",
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
            </GlassCard>

            {/* ── Profile ── */}
            {activeTab === "profile" && (
              <ScreenReveal key="settings-profile" delay={40}>
              <>
                <GlassCard style={{ borderRadius: 20, marginBottom: 12 }} padding={20} variant="strong">
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

              </>
              </ScreenReveal>
            )}

            {/* ── Security ── */}
            {activeTab === "security" && (
              <ScreenReveal key="settings-security" delay={40}>
              <>
                <GlassCard style={{ borderRadius: 20, marginBottom: 12 }} padding={20} variant="strong">
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

                <GlassCard style={{ borderRadius: 20, marginBottom: 12, borderColor: "#FECACA", borderWidth: 1.5 }} padding={20} variant="strong">
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
              </ScreenReveal>
            )}

            {/* ── Notifications ── */}
            {activeTab === "terms" && (
              <ScreenReveal key="settings-terms" delay={40}>
                <GlassCard style={{ borderRadius: 20, marginBottom: 12 }} padding={20} variant="hero">
                  <SectionTitle icon="document-text-outline" label="Terms & Conditions" color="#0F8A83" />
                  <Text style={[theme.typography.body, { color: theme.colors.textMuted, lineHeight: 22 }]}>
                    Review the latest legal information for Eluency directly on our website, including the full terms and privacy policy.
                  </Text>

                  <View style={{ gap: 12, marginTop: 18 }}>
                    <TouchableOpacity
                      onPress={openTerms}
                      activeOpacity={0.82}
                      style={{
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surfaceGlass,
                        padding: 16,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: "#0F8A8314", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="document-text-outline" size={20} color="#0F8A83" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[theme.typography.bodyStrong, { fontSize: 15 }]}>Terms and Conditions</Text>
                        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 3 }]}>
                          Open the latest terms on eluency.com
                        </Text>
                      </View>
                      <Ionicons name="open-outline" size={18} color={theme.colors.textMuted} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={openPrivacy}
                      activeOpacity={0.82}
                      style={{
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surfaceGlass,
                        padding: 16,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: "#3B5EDB14", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="shield-outline" size={20} color="#3B5EDB" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[theme.typography.bodyStrong, { fontSize: 15 }]}>Privacy Policy</Text>
                        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 3 }]}>
                          View privacy and data handling details
                        </Text>
                      </View>
                      <Ionicons name="open-outline" size={18} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              </ScreenReveal>
            )}

            {activeTab === "contact" && (
              <ScreenReveal key="settings-contact" delay={40}>
                <GlassCard style={{ borderRadius: 20, marginBottom: 12 }} padding={20} variant="hero">
                  <SectionTitle icon="mail-outline" label="Contact Us" color="#7C3AED" />
                  <Text style={[theme.typography.body, { color: theme.colors.textMuted, lineHeight: 22 }]}>
                    Reach the Eluency team for support, account help, billing questions, or feedback. We are happy to help.
                  </Text>

                  <View
                    style={{
                      marginTop: 18,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceGlass,
                      padding: 18,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: "#7C3AED14", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="mail-open-outline" size={20} color="#7C3AED" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[theme.typography.bodyStrong, { fontSize: 15 }]}>Eluency Support</Text>
                        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 3 }]}>nathan@eluency.com</Text>
                      </View>
                    </View>

                    <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 16 }} />

                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted, lineHeight: 20, marginBottom: 14 }]}>
                      Send us an email with any relevant details and we will respond as quickly as possible.
                    </Text>

                    <TouchableOpacity
                      onPress={contactTeam}
                      activeOpacity={0.85}
                      style={{
                        borderRadius: 14,
                        backgroundColor: "#7C3AED",
                        paddingVertical: 13,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      <Ionicons name="mail-outline" size={17} color="#fff" />
                      <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff" }}>Email our team</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              </ScreenReveal>
            )}
          </>
        )}
      </ScrollView>
      <FloatingToast {...toastProps} />
    </View>
  );
}

