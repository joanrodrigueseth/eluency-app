import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Constants from "expo-constants";
import { Feather, Ionicons } from "@expo/vector-icons";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppButton from "../components/AppButton";
import GlassCard from "../components/GlassCard";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";

type RootStackParamList = {
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  Subscription: undefined;
  Notifications: undefined;
};

const MONTHLY_PRICE = 14.99;
const YEARLY_PRICE_PER_MONTH = 11.99;
const YEARLY_TOTAL = 143.90;
const YEARLY_SAVINGS = parseFloat((MONTHLY_PRICE * 12 - YEARLY_TOTAL).toFixed(2)); // $35.98

const STANDARD_FEATURES = [
  { icon: "users", text: "Up to 30 students included" },
  { icon: "book-open", text: "Access to 1,000+ lessons & AI tools" },
  { icon: "smartphone", text: "Full teacher & student app access" },
  { icon: "zap", text: "Instant feedback & grade tracking" },
];

const BASIC_FEATURES = [
  "Access to 1,000+ Lessons",
  "Create and Edit Lessons and Tests",
  "1 Student Seat",
  "No credit card required",
];

const SCHOOL_FEATURES = [
  "Unlimited Students",
  "Administrative Tools",
  "Teacher Management Tools",
  "Activity Reports",
];

function getTrialEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function FeatureRow({ label, color }: { label: string; color?: string }) {
  const theme = useAppTheme();
  const c = color ?? theme.colors.primary;
  const soft = color ? `${color}22` : theme.colors.primarySoft;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: soft, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Feather name="check" size={11} color={c} />
      </View>
      <Text style={[theme.typography.body, { fontSize: 13, flex: 1 }]}>{label}</Text>
    </View>
  );
}

export default function SubscriptionScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";

  const [loadingPlan, setLoadingPlan] = useState(true);
  const [currentTierId, setCurrentTierId] = useState("basic");
  const [error, setError] = useState("");
  // Default to yearly — best deal, most conversions
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");

  const trialEndDate = useMemo(() => getTrialEndDate(), []);
  const isOnStandard = currentTierId === "standard";
  const isOnBasic = currentTierId === "basic";

  const displayPrice = billingCycle === "yearly" ? YEARLY_PRICE_PER_MONTH : MONTHLY_PRICE;

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingPlan(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!mounted || !user) { setCurrentTierId("basic"); return; }
        const { data: teacher } = await (supabase.from("teachers") as any)
          .select("plan").eq("user_id", user.id).maybeSingle();
        const plan = String(teacher?.plan ?? "basic").toLowerCase().trim();

        if (plan === "free" || plan === "basic") setCurrentTierId("basic");
        else if (plan === "teacher" || plan === "tutor" || plan === "standard") setCurrentTierId("standard");
        else if (plan === "pro" || plan === "school") setCurrentTierId("school");
        else setCurrentTierId(plan);
      } catch {
        if (mounted) setCurrentTierId("basic");
      } finally {
        if (mounted) setLoadingPlan(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const WEB_SUBSCRIPTION_URL = `${apiBaseUrl.replace(/\/$/, "")}/dashboard/settings/subscription`;

  const handleUpgrade = (tierId: string) => {
    setError("");
    if (tierId === currentTierId) return;

    if (tierId === "school") {
      Linking.openURL("mailto:support@eluency.com?subject=School%20Plan%20Quote").catch(() => {
        Alert.alert("Unavailable", "No email app is available on this device.");
      });
      return;
    }

    // Subscriptions are managed via the web dashboard to comply with App Store guidelines.
    Linking.openURL(WEB_SUBSCRIPTION_URL).catch(() => {
      Alert.alert("Error", "Could not open the subscription page. Visit eluency.com to manage your plan.");
    });
  };

  const handleRestorePurchases = () => {
    Alert.alert(
      "Restore Subscription",
      "Your subscription is tied to your Eluency account. Sign in with the same email you used when you subscribed and your plan will be restored automatically.",
      [
        { text: "Manage on Web", onPress: () => Linking.openURL(WEB_SUBSCRIPTION_URL).catch(() => {}) },
        { text: "OK", style: "cancel" },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Decorative blob */}
      <View style={{ position: "absolute", top: -40, right: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: theme.colors.primarySoft, opacity: 0.25 }} pointerEvents="none" />

      {/* Header */}
      <View style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 50,
        backgroundColor: theme.isDark ? theme.colors.background : "#FFFFFF",
        borderBottomWidth: 1, borderBottomColor: theme.colors.border,
        paddingTop: Math.max(insets.top, 8), paddingBottom: 12, paddingHorizontal: 16,
        flexDirection: "row", alignItems: "center",
      }}>
        <TouchableOpacity
          onPress={() => navigation.navigate("Dashboard", { openDrawer: true })}
          activeOpacity={0.8}
          style={{ height: 40, width: 40, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text style={[theme.typography.label, { fontSize: 10 }]}>BILLING</Text>
          <Text style={[theme.typography.title, { fontSize: 18, lineHeight: 22 }]}>Subscription</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate("Notifications")}
          activeOpacity={0.85}
          style={{ height: 40, width: 40, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceGlass, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="notifications-outline" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: Math.max(insets.top, 8) + 75, paddingHorizontal: 20, paddingBottom: 60, gap: 16 }}
      >
        {error ? (
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerSoft, padding: 12 }}>
            <Text style={[theme.typography.caption, { color: theme.colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        {/* ── Value headline ── */}
        {!isOnStandard ? (
          <View style={{ alignItems: "center", paddingVertical: 4 }}>
            <Text style={[theme.typography.title, { fontSize: 24, textAlign: "center", lineHeight: 30 }]}>
              Teach more.{"\n"}Stress less.
            </Text>
            <Text style={[theme.typography.body, { color: theme.colors.textMuted, textAlign: "center", marginTop: 6, maxWidth: 260 }]}>
              Everything you need to run a full classroom — students, lessons, tests, and grades in one place.
            </Text>
          </View>
        ) : null}

        {/* ── Billing cycle toggle ── */}
        <View style={{ alignItems: "center" }}>
          <View style={{
            flexDirection: "row",
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceAlt,
            padding: 4,
            gap: 4,
          }}>
            <TouchableOpacity
              onPress={() => setBillingCycle("monthly")}
              activeOpacity={0.85}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: billingCycle === "monthly" ? theme.colors.surface : "transparent",
                borderWidth: billingCycle === "monthly" ? 1 : 0,
                borderColor: billingCycle === "monthly" ? theme.colors.border : "transparent",
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 13, color: billingCycle === "monthly" ? theme.colors.text : theme.colors.textMuted }}>
                Monthly
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setBillingCycle("yearly")}
              activeOpacity={0.85}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: billingCycle === "yearly" ? theme.colors.primary : "transparent",
              }}
            >
              <Text style={{ fontWeight: "800", fontSize: 13, color: billingCycle === "yearly" ? theme.colors.primaryText : theme.colors.textMuted }}>
                Yearly
              </Text>
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: billingCycle === "yearly" ? "rgba(255,255,255,0.25)" : "#10b981" }}>
                <Text style={{ fontSize: 10, fontWeight: "900", color: "#FFFFFF" }}>SAVE 20%</Text>
              </View>
            </TouchableOpacity>
          </View>

          {billingCycle === "yearly" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
              <Ionicons name="checkmark-circle" size={14} color="#10b981" />
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#10b981" }}>
                You save ${YEARLY_SAVINGS.toFixed(2)}/year — like getting 2.5 months free
              </Text>
            </View>
          ) : (
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 8 }]}>
              Switch to yearly and save ${YEARLY_SAVINGS.toFixed(2)} per year
            </Text>
          )}
        </View>

        {/* ── Standard plan hero card ── */}
        <GlassCard
          style={{
            borderRadius: 24,
            borderWidth: 2,
            borderColor: theme.colors.primary,
            shadowColor: theme.colors.primary,
            shadowOpacity: 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          }}
          padding={0}
        >
          {/* Card top stripe */}
          <View style={{
            backgroundColor: theme.colors.primary,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 20,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="diamond" size={14} color={theme.colors.primaryText} />
              <Text style={{ fontSize: 12, fontWeight: "900", color: theme.colors.primaryText, letterSpacing: 1 }}>
                {isOnStandard ? "YOUR PLAN" : "MOST POPULAR"}
              </Text>
            </View>
            {billingCycle === "yearly" && !isOnStandard ? (
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.25)" }}>
                <Text style={{ fontSize: 10, fontWeight: "900", color: "#FFF" }}>BEST VALUE</Text>
              </View>
            ) : null}
          </View>

          <View style={{ padding: 20, gap: 16 }}>
            {/* Plan name + price */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View>
                <Text style={[theme.typography.title, { fontSize: 30 }]}>Standard</Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                  For independent teachers
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {billingCycle === "yearly" ? (
                  <Text style={{ fontSize: 13, color: theme.colors.textMuted, textDecorationLine: "line-through" }}>
                    ${MONTHLY_PRICE.toFixed(2)}/mo
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
                  <Text style={[theme.typography.title, { fontSize: 36, lineHeight: 40, color: theme.colors.primary }]}>
                    ${displayPrice.toFixed(2)}
                  </Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 6 }]}>/mo</Text>
                </View>
                {billingCycle === "yearly" ? (
                  <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>
                    billed ${YEARLY_TOTAL.toFixed(2)}/year
                  </Text>
                ) : null}
              </View>
            </View>

            {/* "Pay 10 get 12" banner — yearly only */}
            {billingCycle === "yearly" && !isOnStandard ? (
              <View style={{
                backgroundColor: "#10b981" + "18",
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: "#10b981" + "44",
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}>
                <Text style={{ fontSize: 20 }}>🎉</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: "#10b981" }}>
                    Pay for 10 months, get 12
                  </Text>
                  <Text style={{ fontSize: 12, color: "#10b981", opacity: 0.85, marginTop: 1 }}>
                    That's ${YEARLY_SAVINGS.toFixed(2)} back in your pocket every year
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Trial / current plan banner */}
            {isOnStandard ? (
              <View style={{ backgroundColor: theme.colors.successSoft, padding: 14, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                <View>
                  <Text style={[theme.typography.bodyStrong, { color: theme.colors.success }]}>You're on Standard</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.success, opacity: 0.8, marginTop: 1 }]}>Enjoying full access — nothing to do</Text>
                </View>
              </View>
            ) : (
              <View style={{ backgroundColor: theme.colors.primarySoft, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.primary + "44" }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>✨</Text>
                    <Text style={[theme.typography.bodyStrong, { color: theme.colors.primary, fontSize: 15 }]}>
                      14-Day Free Trial
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.colors.primary }}>
                    <Text style={{ fontSize: 12, fontWeight: "900", color: theme.colors.primaryText }}>$0 today</Text>
                  </View>
                </View>
                <Text style={[theme.typography.caption, { color: theme.colors.primary, marginTop: 6, lineHeight: 18 }]}>
                  Free until {trialEndDate}. No charge until your trial ends — cancel anytime with one tap.
                </Text>
              </View>
            )}

            {/* Upgrade comparison callout — Basic users only */}
            {isOnBasic ? (
              <View style={{ backgroundColor: theme.colors.surfaceAlt, borderRadius: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: theme.colors.primary }}>
                <Text style={[theme.typography.caption, { color: theme.colors.text, fontWeight: "700", marginBottom: 4 }]}>
                  What you unlock vs. Basic:
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, lineHeight: 18 }]}>
                  30 student seats · instant feedback · grade tracking · teacher management tools
                </Text>
              </View>
            ) : null}

            {/* Feature list */}
            <View style={{ gap: 12 }}>
              {STANDARD_FEATURES.map(({ icon, text }) => (
                <View key={text} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Feather name={icon as any} size={15} color={theme.colors.primary} />
                  </View>
                  <Text style={[theme.typography.body, { flex: 1, fontSize: 14 }]}>{text}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            {isOnStandard ? null : (
              <View style={{ gap: 10, marginTop: 4 }}>
                <AppButton
                  label={`Start My Free 14-Day Trial →`}
                  onPress={() => handleUpgrade("standard")}
                  loading={false}
                />
                <View style={{ alignItems: "center", gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="lock" size={11} color={theme.colors.textMuted} />
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>Secure checkout · Powered by Stripe</Text>
                  </View>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                    Cancel anytime. No questions asked.
                  </Text>
                </View>
              </View>
            )}

            {/* Social proof */}
            {!isOnStandard ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 2 }}>
                <View style={{ flexDirection: "row" }}>
                  {["#F97316", "#3B82F6", "#10B981", "#8B5CF6", "#EF4444"].map((c, i) => (
                    <View key={i} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c, borderWidth: 2, borderColor: theme.colors.surface, marginLeft: i === 0 ? 0 : -9, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 9, fontWeight: "900", color: "#FFF" }}>
                        {["J", "M", "A", "S", "R"][i]}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, fontSize: 12 }]}>
                  Trusted by 2,000+ teachers worldwide
                </Text>
              </View>
            ) : null}

            {/* OR divider */}
            <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 4 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginHorizontal: 12, fontWeight: "600" }]}>Other plans</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
            </View>

            {/* Basic sub-card */}
            <View style={{ padding: 16, borderRadius: 16, backgroundColor: theme.colors.background, borderWidth: 1.5, borderColor: "#10b981" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <View>
                  <Text style={[theme.typography.caption, { color: "#10b981", fontWeight: "700", letterSpacing: 1 }]}>STARTER</Text>
                  <Text style={[theme.typography.title, { fontSize: 22 }]}>Basic</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {isOnBasic ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: theme.colors.successSoft, marginBottom: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: "900", color: theme.colors.success }}>CURRENT PLAN</Text>
                    </View>
                  ) : null}
                  <Text style={[theme.typography.title, { fontSize: 26 }]}>$0</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>/forever</Text>
                </View>
              </View>

              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, lineHeight: 18, marginBottom: 12 }]}>
                Single-teacher pilot. All lessons and tests with one student — no credit card ever required.
              </Text>

              <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12, gap: 8, marginBottom: 12 }}>
                {BASIC_FEATURES.map((feature) => (
                  <FeatureRow key={feature} label={feature} color="#10b981" />
                ))}
              </View>

              {isOnBasic ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
                  <Text style={[theme.typography.caption, { color: theme.colors.success, fontWeight: "700" }]}>You're on this plan</Text>
                </View>
              ) : (
                <AppButton
                  label="Continue with Basic (Free)"
                  onPress={() => handleUpgrade("basic")}
                  loading={false}
                />
              )}
            </View>

            {/* School sub-card */}
            <View style={{ padding: 16, borderRadius: 16, backgroundColor: theme.colors.background, borderWidth: 1.5, borderColor: "#8b5cf6" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <View>
                  <Text style={[theme.typography.caption, { color: "#8b5cf6", fontWeight: "700", letterSpacing: 1 }]}>ORGANIZATION</Text>
                  <Text style={[theme.typography.title, { fontSize: 22 }]}>School</Text>
                </View>
                <Text style={[theme.typography.title, { fontSize: 22 }]}>Custom</Text>
              </View>

              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, lineHeight: 18, marginBottom: 12 }]}>
                Volume pricing for schools and language organizations — one or more teachers.
              </Text>

              <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12, gap: 8, marginBottom: 12 }}>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, fontWeight: "700", marginBottom: 4 }]}>Everything in Standard, plus:</Text>
                {SCHOOL_FEATURES.map((feature) => (
                  <FeatureRow key={feature} label={feature} color="#8b5cf6" />
                ))}
              </View>

              <AppButton
                label="Contact for a Quote"
                onPress={() => handleUpgrade("school")}
                loading={false}
                variant="violet"
              />
            </View>
          </View>
        </GlassCard>

        <TouchableOpacity
          onPress={handleRestorePurchases}
          activeOpacity={0.7}
          style={{ alignSelf: "center", paddingVertical: 16, paddingHorizontal: 24, marginBottom: 8 }}
        >
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, textDecorationLine: "underline" }]}>
            Restore Purchases
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
