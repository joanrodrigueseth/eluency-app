import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnimatedBrand from "../components/AnimatedBrand";

import ScreenReveal from "../components/ScreenReveal";
import StudentCodeField from "../components/StudentCodeField";
import { getStudentCodeErrorMessage } from "../lib/authErrors";
import { getApiBaseUrl } from "../lib/api/config";
import { requestWithTimeout } from "../lib/api/request";
import { TouchableOpacity } from "../lib/hapticPressables";
import { setStoredStudentSessionId } from "../lib/studentSession";
import { useAppTheme } from "../lib/theme";

type VerifyAccessCodeResponse = {
  error?: string;
  session?: {
    id?: string;
  };
};

const apiBaseUrl = getApiBaseUrl();
const DEMO_STUDENT_CODE = "2PHJ5J";

function StatusBanner({
  message,
  tone,
}: {
  message: string;
  tone: "danger" | "success";
}) {
  const theme = useAppTheme();
  const isDanger = tone === "danger";
  const color = isDanger ? theme.colors.danger : theme.colors.success;

  return (
    <View
      accessible
      accessibilityRole={isDanger ? "alert" : undefined}
      accessibilityLiveRegion={isDanger ? "assertive" : "polite"}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: color,
        backgroundColor: isDanger ? theme.colors.dangerSoft : theme.colors.successSoft,
        paddingHorizontal: 12,
        paddingVertical: 11,
      }}
    >
      <Feather
        name={isDanger ? "alert-circle" : "check-circle"}
        size={17}
        color={color}
        style={{ marginTop: 1 }}
      />
      <Text style={[theme.typography.helper, { flex: 1, color: theme.colors.text, lineHeight: 18 }]}>
        {message}
      </Text>
    </View>
  );
}

function LoginAction({ label, loading, disabled, onPress }: {
  label: string; loading: boolean; disabled: boolean; onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading} onPress={onPress} activeOpacity={0.8}
      style={{ minHeight: 56, borderRadius: 17, paddingVertical: 12, paddingHorizontal: 20,
        flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center",
        backgroundColor: disabled && !loading ? theme.colors.surfaceAlt : theme.colors.primary }}>
      {loading ? <ActivityIndicator color={theme.colors.primaryText} /> : null}
      <Text style={[theme.typography.bodyStrong, { flexShrink: 1, textAlign: "center",
        color: disabled && !loading ? theme.colors.textMuted : theme.colors.primaryText }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Divider({ label }: { label: string }) {
  const theme = useAppTheme();

  return (
    <View accessible={false} style={{ flexDirection: "row", alignItems: "center", alignSelf: "center", width: "84%", gap: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
      <Text style={[theme.typography.helper, { color: theme.colors.textSoft, fontSize: 13 }]}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
    </View>
  );
}

export default function LoginScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const studentRequestInFlightRef = useRef(false);

  const [gameCode, setGameCode] = useState("");
  const [studentError, setStudentError] = useState("");
  const [studentSubmissionMode, setStudentSubmissionMode] = useState<"code" | "demo" | null>(null);

  const isCompactHeight = screenHeight < 760;
  const horizontalPadding = screenWidth < 360 ? 22 : 28;
  const contentWidth = Math.min(screenWidth - horizontalPadding * 2, 420);
  const logoWidth = Math.min(isCompactHeight ? 140 : 164, contentWidth - 32);
  const isCodeComplete = gameCode.trim().length === 6;
  const studentLoading = studentSubmissionMode !== null;
  const isCodeLoading = studentSubmissionMode === "code";
  const isDemoLoading = studentSubmissionMode === "demo";
  const openLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      const message = "We couldn't open that page. Please try again.";
      setStudentError(message);
    }
  };

  const verifyStudentCode = async (rawCode: string, mode: "code" | "demo") => {
    const code = rawCode.trim().toUpperCase();
    if (code.length !== 6 || studentRequestInFlightRef.current) return;

    studentRequestInFlightRef.current = true;
    setStudentError("");
    setStudentSubmissionMode(mode);

    try {
      const response = await requestWithTimeout(`${apiBaseUrl}/api/students/verify-access-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code }),
      });

      let result: VerifyAccessCodeResponse | null = null;
      try {
        result = (await response.json()) as VerifyAccessCodeResponse;
      } catch {
        result = null;
      }

      if (!response.ok || result?.error) {
        setStudentError(getStudentCodeErrorMessage(response.status, result?.error));
        return;
      }

      const sessionId = result?.session?.id;
      if (!sessionId) {
        setStudentError("We couldn't start this student session. Ask your teacher for a new code.");
        return;
      }

      try {
        await setStoredStudentSessionId(sessionId);
      } catch {
        setStudentError("We couldn't save your sign-in on this device. Please try again.");
        return;
      }
      // The shell observes the saved session and mounts a fresh study workspace.
    } catch {
      setStudentError("We couldn't connect to Eluency. Check your internet connection and try again.");
    } finally {
      studentRequestInFlightRef.current = false;
      setStudentSubmissionMode(null);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <View style={{ position: "absolute", width: 280, height: 280, borderRadius: 140, top: -170, left: -130, backgroundColor: theme.colors.primarySoft }} />
        <View style={{ position: "absolute", width: 240, height: 240, borderRadius: 120, bottom: -150, right: -140, backgroundColor: theme.colors.primarySoft }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, alignItems: "center", paddingHorizontal: horizontalPadding,
          paddingTop: Math.max(insets.top + (isCompactHeight ? 4 : 12), 24),
          paddingBottom: Math.max(insets.bottom + 12, 24) }}>
        <View style={{ width: contentWidth, flexGrow: 1 }}>
          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <AnimatedBrand theme={theme} width={logoWidth} busy={studentLoading} showDivider={false} />
          </View>

          <ScreenReveal distance={6} scaleFrom={1} duration={240}
            style={{ alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Text accessibilityRole="header" style={[theme.typography.title,
              { fontSize: 28, lineHeight: 34, letterSpacing: -0.6, textAlign: "center" }]}>
              Ready to learn?
            </Text>
            <Text style={[theme.typography.body, { color: theme.colors.textMuted, fontSize: 16, fontWeight: "400",
              lineHeight: 23, textAlign: "center", maxWidth: 320 }]}>
              Your lessons, practice, and progress in one place.
            </Text>
          </ScreenReveal>

          <View style={{ marginTop: 16, gap: 16 }}>
            {studentError ? <StatusBanner message={studentError} tone="danger" /> : null}
            <StudentCodeField value={gameCode} disabled={studentLoading}
              onChange={(value) => { setGameCode(value); setStudentError(""); }}
              onError={setStudentError}
              onSubmit={() => { if (isCodeComplete && !studentLoading) void verifyStudentCode(gameCode, "code"); }} />
            <Text style={[theme.typography.body, { color: theme.colors.textSoft, fontSize: 14, fontWeight: "400", lineHeight: 20, textAlign: "center" }]}>
              Enter the 6-character code your teacher gave you.{"\n"}No email or password needed.
            </Text>
            <LoginAction label={isCodeLoading ? "Opening your lessons..." : "Continue"} loading={isCodeLoading}
              disabled={!isCodeComplete || isDemoLoading} onPress={() => void verifyStudentCode(gameCode, "code")} />
            <View style={{ marginVertical: -5 }}><Divider label="or" /></View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Try the student demo"
              accessibilityState={{ disabled: studentLoading, busy: isDemoLoading }} disabled={studentLoading}
              onPress={() => void verifyStudentCode(DEMO_STUDENT_CODE, "demo")}
              style={{ minHeight: 54, borderWidth: 1, borderColor: theme.isDark ? theme.colors.borderStrong : "#BFDBFE", borderRadius: 14, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }}>
              {isDemoLoading ? <ActivityIndicator color={theme.colors.primary} /> :
                <Ionicons name="play-circle-outline" size={20} color={theme.colors.primary} />}
              <Text style={[theme.typography.body, { color: theme.colors.primary, fontSize: 15, fontWeight: "600" }]}>
                {isDemoLoading ? "Opening demo..." : "Try the student demo"}
              </Text>
            </TouchableOpacity>
            <Text style={[theme.typography.body, { color: theme.colors.textSoft, fontSize: 13, fontWeight: "400", textAlign: "center", lineHeight: 18 }]}>
              Demo progress is shared and may include other sessions.
            </Text>
          </View>

          <View style={{ flexGrow: 1, minHeight: 16 }} />
          <View>
            <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 20 }}>
              <TouchableOpacity accessibilityRole="link" onPress={() => void openLink("https://www.eluency.com/terms")}
                style={{ minHeight: 44, justifyContent: "center" }}>
                <Text style={[theme.typography.helper, { color: theme.colors.textSoft, fontSize: 12, fontWeight: "400" }]}>Terms</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="link" onPress={() => void openLink("https://www.eluency.com/security")}
                style={{ minHeight: 44, justifyContent: "center" }}>
                <Text style={[theme.typography.helper, { color: theme.colors.textSoft, fontSize: 12, fontWeight: "400" }]}>Privacy & security</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
