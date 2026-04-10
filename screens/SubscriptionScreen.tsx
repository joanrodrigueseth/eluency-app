import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Constants from "expo-constants";
import { Feather, Ionicons } from "@expo/vector-icons";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import GlassCard from "../components/GlassCard";
import { supabase } from "../lib/supabase";
import { useAppTheme } from "../lib/theme";

type RootStackParamList = {
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  Subscription: undefined;
};

type BillingCycle = "monthly" | "yearly";

const STANDARD_FEATURES = [
  "Up to 30 Students",
  "Access to Student & Teacher App",
  "Create and Edit Lessons and Tests",
  "Assign Lessons and Tests to Students",
  "Instant Feedback from Students",
  "Access to 1,000+ Lessons",
  "Access to New Materials",
  "Grade Feedback",
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

function FeatureRow({ label }: { label: string }) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Feather name="check" size={11} color={theme.colors.primary} />
      </View>
      <Text style={[theme.typography.body, { fontSize: 13, flex: 1 }]}>{label}</Text>
    </View>
  );
}

export default function SubscriptionScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";

  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [currentTierId, setCurrentTierId] = useState("basic");

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

  const handleUpgrade = async (tierId: string) => {
    if (tierId === currentTierId) return;
    
    if (tierId === "school") {
      const mailto = "mailto:support@eluency.com?subject=School%20Plan%20Quote";
      const ok = await Linking.canOpenURL(mailto);
      if (!ok) { Alert.alert("Unavailable", "No email app is available on this device."); return; }
      await Linking.openURL(mailto);
      return;
    }

    setUpgrading(tierId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Not authenticated.");
      
      const base = apiBaseUrl.replace(/\/$/, "");
      const res = await fetch(`${base}/api/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        // DYNAMIC: Pass the selected cycle
        body: JSON.stringify({ tierId, cycle }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      
      if (!res.ok) {
        const webUrl = `${base}/dashboard/settings/subscription`;
        Alert.alert("Open Web Checkout", data?.error ?? "In-app checkout unavailable. Open web dashboard?", [
          { text: "Cancel", style: "cancel" },
          { text: "Open", onPress: () => Linking.openURL(webUrl) },
        ]);
        return;
      }

      if (data?.url) {
        await Linking.openURL(data.url);
        return;
      }
      
      Alert.alert("Success", "Plan update session started.");
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Upgrade failed.");
    } finally {
      setUpgrading(null);
    }
  };

  const isBasicCurrent = currentTierId === "basic";
  const isStandardCurrent = currentTierId === "standard";
  const isSchoolCurrent = currentTierId === "school";

  const standardPrice = cycle === "yearly" ? 11.99 : 14.99;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Decorative background blob */}
      <View style={{ position: "absolute", top: 0, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: theme.colors.primarySoft, opacity: 0.3 }} pointerEvents="none" />

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
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="diamond" size={18} color={theme.colors.primary} />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: Math.max(insets.top, 8) + 75, paddingHorizontal: 18, paddingBottom: 60 }}
      >
        {loadingPlan && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20, justifyContent: 'center' }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: "700" }]}>Syncing current plan...</Text>
          </View>
        )}

        {/* Billing Toggle */}
        <View style={{ gap: 12, marginBottom: 24 }}>
          <View style={{ flexDirection: "row", borderRadius: 999, borderWidth: 1, borderColor: theme.colors.primarySoft, backgroundColor: theme.colors.primarySoft + "40", padding: 4, alignSelf: "center" }}>
            {(["monthly", "yearly"] as const).map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setCycle(c)}
                activeOpacity={0.9}
                style={{
                  paddingHorizontal: 22,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: cycle === c ? theme.colors.primary : "transparent",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "800", color: cycle === c ? "#fff" : theme.colors.textMuted }}>
                  {c === "monthly" ? "Monthly" : "Yearly"}
                </Text>
                {c === "yearly" && (
                  <View style={{ borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: cycle === "yearly" ? "rgba(255,255,255,0.2)" : theme.colors.primarySoft }}>
                    <Text style={{ fontSize: 8, fontWeight: "900", color: cycle === "yearly" ? "#fff" : theme.colors.primary }}>-20%</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Trial Badge */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primarySoft, backgroundColor: theme.colors.primarySoft + "30", paddingHorizontal: 12, paddingVertical: 8 }}>
            <Ionicons name="shield-checkmark" size={14} color={theme.colors.primary} />
            <Text style={{ fontSize: 12, fontWeight: "800", color: theme.colors.text }}>14-day free trial</Text>
            <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>· Cancel anytime</Text>
          </View>
        </View>

        {/* ── Standard Plan (Hero) ── */}
        <GlassCard
          style={{
            borderRadius: 28,
            marginBottom: 16,
            borderWidth: 2,
            borderColor: isStandardCurrent ? theme.colors.primary : theme.colors.border,
            overflow: 'hidden'
          }}
          padding={0}
        >
          {/* Most Popular Ribbon */}
          {!isStandardCurrent && (
            <View style={{ backgroundColor: theme.colors.primary, paddingVertical: 4, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>MOST POPULAR</Text>
            </View>
          )}

          <View style={{ padding: 24 }}>
            {isStandardCurrent && (
              <View style={{ alignSelf: 'flex-end', borderRadius: 999, backgroundColor: theme.colors.primary, paddingHorizontal: 12, paddingVertical: 4, marginBottom: -20 }}>
                <Text style={{ fontSize: 10, fontWeight: "900", color: "#fff" }}>CURRENT PLAN</Text>
              </View>
            )}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <View style={{ width: 56, height: 56, borderRadius: 20, backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="person" size={26} color={theme.colors.primary} />
              </View>
              <View>
                <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.primary, letterSpacing: 1.5, marginBottom: 2 }}>INDIVIDUAL</Text>
                <Text style={[theme.typography.title, { fontSize: 24 }]}>Standard</Text>
              </View>
            </View>

            <View style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: 48, fontWeight: "900", color: theme.colors.text }}>${standardPrice.toFixed(2)}</Text>
                <Text style={[theme.typography.body, { color: theme.colors.textMuted, paddingBottom: 8 }]}>/mo</Text>
              </View>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, lineHeight: 18 }]}>
                {cycle === "yearly" 
                  ? "Billed annually as $143.90. Save $35.98 total." 
                  : "Standard monthly rate. Switch to yearly for 2 months free."}
              </Text>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 18, marginBottom: 24 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 1.2, marginBottom: 14 }}>INCLUDES:</Text>
              <View style={{ gap: 12 }}>
                {STANDARD_FEATURES.map((f) => <FeatureRow key={f} label={f} />)}
              </View>
            </View>

            <TouchableOpacity
              onPress={() => handleUpgrade("standard")}
              disabled={isStandardCurrent || upgrading === "standard"}
              activeOpacity={0.8}
              style={{
                borderRadius: 18,
                paddingVertical: 18,
                backgroundColor: isStandardCurrent ? theme.colors.primarySoft : theme.colors.primary,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 10,
              }}
            >
              {upgrading === "standard" && <ActivityIndicator size="small" color="#fff" />}
              <Text style={{ fontSize: 15, fontWeight: "900", color: isStandardCurrent ? theme.colors.primary : "#fff" }}>
                {isStandardCurrent ? "Current Plan" : "Start 14-Day Free Trial"}
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* ── Basic Plan ── */}
        <GlassCard
          style={{
            borderRadius: 24,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: isBasicCurrent ? theme.colors.primarySoft : theme.colors.border,
          }}
          padding={20}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="leaf" size={18} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: theme.colors.primary }}>STARTER</Text>
              <Text style={[theme.typography.bodyStrong, { fontSize: 18 }]}>Basic</Text>
            </View>
            <Text style={{ fontSize: 24, fontWeight: "900", color: theme.colors.text }}>$0</Text>
          </View>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 16 }]}>
            Perfect for a single-teacher pilot. 1 student seat included.
          </Text>
          <View style={{ gap: 8 }}>
            {BASIC_FEATURES.map((f) => <FeatureRow key={f} label={f} />)}
          </View>
          {isBasicCurrent && (
            <View style={{ marginTop: 16, padding: 10, backgroundColor: theme.colors.primarySoft, borderRadius: 12, alignItems: 'center' }}>
                <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 12 }}>YOUR ACTIVE PLAN</Text>
            </View>
          )}
        </GlassCard>

        {/* ── School Plan ── */}
        <GlassCard
          style={{
            borderRadius: 24,
            marginBottom: 24,
            borderWidth: 1,
            borderColor: isSchoolCurrent ? "#7C3AED" : theme.colors.border,
          }}
          padding={24}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: "#F5F0FF", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="business" size={22} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: "#7C3AED" }}>ORGANIZATION</Text>
              <Text style={[theme.typography.bodyStrong, { fontSize: 18 }]}>School / Org</Text>
            </View>
            <Text style={{ fontSize: 20, fontWeight: "900", color: theme.colors.text }}>Quote</Text>
          </View>

          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 20 }]}>
            For institutions requiring high-volume teacher and student management.
          </Text>

          <View style={{ gap: 10, marginBottom: 24 }}>
            {SCHOOL_FEATURES.map((f) => (
               <View key={f} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#F5F0FF", alignItems: "center", justifyContent: "center" }}>
                  <Feather name="plus" size={10} color="#7C3AED" />
                </View>
                <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.text }}>{f}</Text>
               </View>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => handleUpgrade("school")}
            disabled={isSchoolCurrent}
            activeOpacity={0.8}
            style={{ borderRadius: 16, paddingVertical: 15, backgroundColor: isSchoolCurrent ? "#F5F0FF" : "#7C3AED", alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
          >
            <Ionicons name="mail" size={16} color={isSchoolCurrent ? "#7C3AED" : "#fff"} />
            <Text style={{ fontSize: 14, fontWeight: "900", color: isSchoolCurrent ? "#7C3AED" : "#fff" }}>
              {isSchoolCurrent ? "Current Plan" : "Contact Sales"}
            </Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Global Support Footer */}
        <View style={{ alignItems: "center", gap: 12, paddingVertical: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="globe-outline" size={18} color={theme.colors.primary} />
            <Text style={{ fontSize: 10, fontWeight: "900", color: theme.colors.primary, letterSpacing: 2 }}>GLOBAL STANDARDS</Text>
          </View>
          <Text style={[theme.typography.caption, { textAlign: "center", color: theme.colors.textMuted, lineHeight: 18 }]}>
            Secure payments via Stripe.{"\n"}Manage subscriptions 24/7 in your dashboard.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}