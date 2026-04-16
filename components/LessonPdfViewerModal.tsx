import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import type { LessonPdfViewerModalProps } from "./lessonPdfViewerModal.types";

const LOAD_GIVE_UP_MS = 20000;

/**
 * Android WebView often never fires load-end for raw `application/pdf` URLs (spinner forever).
 * iOS WKWebView usually handles direct PDF URLs. Google gview loads HTML so lifecycle events work.
 * The PDF URL must be reachable by Google's servers (typical public / signed Supabase URLs work).
 */
function webViewSourceUri(original: string): string {
  const u = original.trim();
  if (Platform.OS !== "android") return u;
  if (!/^https:\/\//i.test(u)) return u;
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(u)}`;
}

export default function LessonPdfViewerModal({
  visible,
  uri,
  title,
  primaryColor,
  backgroundColor,
  textColor,
  onClose,
  onLoadError,
}: LessonPdfViewerModalProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);

  const resolvedUri = useMemo(() => (uri ? webViewSourceUri(uri) : ""), [uri]);

  useEffect(() => {
    if (!visible || !uri) return;
    setLoading(true);
    const t = setTimeout(() => setLoading(false), LOAD_GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [visible, uri]);

  const openInBrowser = () => {
    if (uri) Linking.openURL(uri.trim()).catch(() => onLoadError("Could not open the PDF outside the app."));
  };

  if (Platform.OS === "web") return null;
  if (!visible || !uri) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, backgroundColor }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close PDF">
            <Ionicons name="close" size={26} color={textColor} />
          </Pressable>
          <Text numberOfLines={1} style={[styles.title, { color: textColor }]}>
            {title || "Lesson PDF"}
          </Text>
          <Pressable onPress={openInBrowser} style={styles.iconBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Open PDF in browser">
            <Ionicons name="open-outline" size={24} color={primaryColor} />
          </Pressable>
        </View>
        <View style={styles.body}>
          {loading ? (
            <View style={[styles.centered, styles.loadingOverlay]} pointerEvents="none">
              <ActivityIndicator size="large" color={primaryColor} />
            </View>
          ) : null}
          <WebView
            source={{ uri: resolvedUri }}
            style={styles.webview}
            originWhitelist={["*"]}
            onLoadProgress={({ nativeEvent }) => {
              if (nativeEvent.progress >= 0.99) setLoading(false);
            }}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              onLoadError("Could not load the lesson PDF.");
              onClose();
            }}
            onHttpError={(e) => {
              if (e.nativeEvent.statusCode >= 400) {
                setLoading(false);
                onLoadError("Could not load the lesson PDF.");
                onClose();
              }
            }}
            allowsInlineMediaPlayback
            setSupportMultipleWindows={false}
            domStorageEnabled
            javaScriptEnabled
            mixedContentMode="compatibility"
            nestedScrollEnabled
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 4,
  },
  iconBtn: { padding: 10 },
  title: { flex: 1, fontSize: 17, fontWeight: "700" },
  body: { flex: 1, position: "relative" },
  webview: { flex: 1, width: "100%", backgroundColor: "#f5f5f5" },
  centered: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingOverlay: { zIndex: 2, backgroundColor: "rgba(255,255,255,0.65)" },
});
