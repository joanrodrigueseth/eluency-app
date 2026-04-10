import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppButton from "../components/AppButton";
import GlassCard from "../components/GlassCard";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";
import { normalizePlanUi } from "../lib/teacherRolePlanRules";

type RootStackParamList = {
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  Settings: undefined;
  Subscription: undefined;
};

type SettingsTab = "profile" | "security" | "notifications" | "preferences" | "plan";
type LanguagePairCode = "en-pt" | "en-es" | "en-fr" | "pt-es";

type PlanInfo = {
  plan: string;
  student_limit: number | null;
  lesson_limit?: number | null;
  test_limit?: number | null;
  preset_limit?: number | null;
};

const LANGUAGE_PAIRS: { code: LanguagePairCode; fullLabel: string; flag: string }[] = [
  { code: "en-pt", fullLabel: "English ↔ Portuguese", flag: "🇧🇷" },
  { code: "en-es", fullLabel: "English ↔ Spanish", flag: "🇪🇸" },
  { code: "en-fr", fullLabel: "English ↔ French", flag: "🇫🇷" },
  { code: "pt-es", fullLabel: "Portuguese ↔ Spanish", flag: "🇵🇹" },
];

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

function Divider() {
  const theme = useAppTheme();
  return <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 14 }} />;
}

export default function SettingsScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState({ name: "", email: "" });
  const [originalEmail, setOriginalEmail] = useState("");
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [studentCount, setStudentCount] = useState(0);
  const [defaultLanguagePair, setDefaultLanguagePair] = useState<LanguagePairCode>("en-pt");
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
        const { data: teacher } = await (supabase.from("teachers") as any)
          .select("name, plan, student_limit, lesson_limit, test_limit, preset_limit, default_language_pair")
          .eq("user_id", user.id)
          .maybeSingle();

        if (teacher?.name) displayName = teacher.name;
        const email = user.email ?? "";

        if (!mounted) return;
        setProfile({ name: displayName, email });
        setOriginalEmail(email);

        if (teacher) {
          setPlanInfo({
            plan: normalizePlanUi(teacher.plan),
            student_limit: teacher.student_limit ?? null,
            lesson_limit: teacher.lesson_limit ?? null,
            test_limit: teacher.test_limit ?? null,
            preset_limit: teacher.preset_limit ?? null,
          });
          const dbPair = (teacher.default_language_pair ?? "").trim() as LanguagePairCode;
          if (LANGUAGE_PAIRS.some((p) => p.code === dbPair)) setDefaultLanguagePair(dbPair);
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

  const saveDefaultLanguagePair = async (value: LanguagePairCode) => {
    setDefaultLanguagePair(value);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await (supabase.from("teachers") as any).update({ default_language_pair: value }).eq("user_id", user.id);
      Alert.alert("Saved", "Default language pair updated.");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to save preference.");
    }
  };

  const openDeleteMail = async () => {
    const url = "mailto:nathan@eluency.com?subject=Account%20Deletion%20Request&body=Please%20delete%20my%20Eluency%20account%20and%20all%20associated%20data.";
    const supported = await Linking.canOpenURL(url);
    if (!supported) { Alert.alert("Not available", "No email app available on this device."); return; }
    await Linking.openURL(url);
  };

  const tabs: { id: SettingsTab; label: string; icon: string; color: string }[] = [
    { id: "profile",       label: "Profile",       icon: "person-outline",        color: "#3B5EDB" },
    { id: "security",      label: "Security",      icon: "shield-outline",        color: "#D4462A" },
    { id: "plan",          label: "Plan",          icon: "diamond-outline",       color: "#9050E7" },
    { id: "preferences",   label: "Preferences",   icon: "language-outline",      color: "#E3A91F" },
    { id: "notifications", label: "Notifications", icon: "notifications-outline", color: "#3EA370" },
  ];

  const planKey = (planInfo?.plan ?? "basic").toLowerCase();
  const planColor = PLAN_COLORS[planKey] ?? PLAN_COLORS.basic;

  const studentLimit = planInfo?.student_limit;
  const studentPct = studentLimit && studentLimit !== 999
    ? Math.min(100, (studentCount / Math.max(studentLimit, 1)) * 100)
    : null;

  const limitRows = [
    { label: "Students", used: studentCount, limit: planInfo?.student_limit },
    { label: "Lessons",  used: null,         limit: planInfo?.lesson_limit },
    { label: "Tests",    used: null,         limit: planInfo?.test_limit },
    { label: "Presets",  used: null,         limit: planInfo?.preset_limit },
  ].filter((r) => r.limit != null);

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
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {tabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    onPress={() => setActiveTab(tab.id)}
                    activeOpacity={0.85}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: active ? tab.color : theme.colors.border,
                      backgroundColor: active ? tab.color + "15" : theme.colors.surface,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Ionicons name={tab.icon as any} size={15} color={active ? tab.color : theme.colors.textMuted} />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: active ? tab.color : theme.colors.textMuted }}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Profile ── */}
            {activeTab === "profile" && (
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
                        <Text style={[theme.typography.caption, { color: theme.colors.primary }]}>
                          You will need to confirm the new email address.
                        </Text>
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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="warning-outline" size={16} color="#DC2626" />
                    </View>
                    <Text style={[theme.typography.bodyStrong, { color: "#DC2626", fontSize: 15 }]}>Danger zone</Text>
                  </View>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 16 }]}>
                    Account deletion is permanent and cannot be undone. All your data will be removed.
                  </Text>
                  <TouchableOpacity
                    onPress={openDeleteMail}
                    activeOpacity={0.85}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: "#DC2626", backgroundColor: "#FEF2F2" }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#DC2626" }}>Request account deletion</Text>
                  </TouchableOpacity>
                </GlassCard>
              </>
            )}

            {/* ── Plan ── */}
            {activeTab === "plan" && (
              <GlassCard style={{ borderRadius: 20, marginBottom: 12 }} padding={20}>
                <SectionTitle icon="diamond-outline" label="Your plan" color="#9050E7" />

                {/* Plan name badge row */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, padding: 14, borderRadius: 14, backgroundColor: planColor.bg, borderWidth: 1, borderColor: planColor.border }}>
                  <View>
                    <Text style={[theme.typography.caption, { color: planColor.text, fontWeight: "600", marginBottom: 2 }]}>CURRENT PLAN</Text>
                    <Text style={[theme.typography.bodyStrong, { color: planColor.text, fontSize: 18 }]}>{planInfo?.plan ?? "Basic"}</Text>
                  </View>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: planColor.text + "20", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="diamond" size={20} color={planColor.text} />
                  </View>
                </View>

                {/* Students usage */}
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="school-outline" size={15} color={theme.colors.textMuted} />
                      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, fontWeight: "600" }]}>STUDENTS</Text>
                    </View>
                    <Text style={[theme.typography.caption, { fontWeight: "700" }]}>
                      {studentCount} / {studentLimit === 999 ? "Unlimited" : studentLimit != null ? String(studentLimit) : "—"}
                    </Text>
                  </View>
                  {studentPct != null ? (
                    <View style={{ height: 8, borderRadius: 999, backgroundColor: theme.colors.surfaceAlt, overflow: "hidden" }}>
                      <View style={{
                        height: "100%",
                        width: `${studentPct}%`,
                        borderRadius: 999,
                        backgroundColor: studentPct > 85 ? "#DC2626" : studentPct > 60 ? "#E3A91F" : "#3EA370",
                      }} />
                    </View>
                  ) : null}
                </View>

                {/* Other limits */}
                {limitRows.filter((r) => r.label !== "Students").length > 0 ? (
                  <>
                    <Divider />
                    <View style={{ gap: 10 }}>
                      {limitRows.filter((r) => r.label !== "Students").map((row) => (
                        <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{row.label}</Text>
                          <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border }}>
                            <Text style={[theme.typography.caption, { fontWeight: "700" }]}>
                              {row.limit === 999 || row.limit === -1 ? "Unlimited" : String(row.limit)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                <View style={{ marginTop: 20 }}>
                  <AppButton
                    label="View all plans"
                    variant="secondary"
                    onPress={() => navigation.navigate("Subscription")}
                    icon={<Feather name="arrow-right" size={16} color={theme.colors.text} />}
                  />
                </View>
              </GlassCard>
            )}

            {/* ── Preferences ── */}
            {activeTab === "preferences" && (
              <GlassCard style={{ borderRadius: 20, marginBottom: 12 }} padding={20}>
                <SectionTitle icon="language-outline" label="Language preferences" color="#E3A91F" />
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 16 }]}>
                  Default language pair used when creating new lessons.
                </Text>
                <View style={{ gap: 10 }}>
                  {LANGUAGE_PAIRS.map((pair) => {
                    const active = defaultLanguagePair === pair.code;
                    return (
                      <TouchableOpacity
                        key={pair.code}
                        onPress={() => saveDefaultLanguagePair(pair.code)}
                        activeOpacity={0.85}
                        style={{
                          borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: active ? "#E3A91F" : theme.colors.border,
                          backgroundColor: active ? "#FFF7DE" : theme.colors.surfaceAlt,
                          paddingHorizontal: 16,
                          paddingVertical: 14,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>{pair.flag}</Text>
                        <Text style={[theme.typography.body, { flex: 1, color: active ? "#B87E00" : theme.colors.text, fontWeight: active ? "700" : "400" }]}>
                          {pair.fullLabel}
                        </Text>
                        {active ? (
                          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#E3A91F", alignItems: "center", justifyContent: "center" }}>
                            <Ionicons name="checkmark" size={13} color="#fff" />
                          </View>
                        ) : (
                          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: theme.colors.border }} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </GlassCard>
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
