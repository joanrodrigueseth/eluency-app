import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
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
import { createPdfViewerHtml } from "../lib/offline/pdfViewer";

const LOAD_GIVE_UP_MS = 20000;

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
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible || !uri) return;
    let cancelled = false;
    let temporaryUri: string | null = null;
    setLoading(true);
    setError(null);
    setHtml(null);
    const t = setTimeout(() => { if (!cancelled) { setLoading(false); setError("The PDF took too long to load. Please try again."); } }, LOAD_GIVE_UP_MS);
    loadTimeout.current = t;
    (async () => {
      let documentUri = uri.trim();
      if (/^https?:\/\//i.test(documentUri)) {
        temporaryUri = `${FileSystem.cacheDirectory}lesson-pdf-${Date.now()}.pdf`;
        const downloaded = await FileSystem.downloadAsync(documentUri, temporaryUri);
        if (downloaded.status < 200 || downloaded.status >= 300) throw new Error("Could not download the lesson PDF.");
        documentUri = downloaded.uri;
      }
      const assets = await Promise.all([
        Asset.fromModule(require("../.expo/pdf-viewer/library.pdfjs")).downloadAsync(),
        Asset.fromModule(require("../.expo/pdf-viewer/worker.pdfjs")).downloadAsync(),
        Asset.fromModule(require("../.expo/pdf-viewer/resources.pdfjs")).downloadAsync(),
      ]);
      const [pdf, library, worker, resources] = await Promise.all([
        FileSystem.readAsStringAsync(documentUri, { encoding: "base64" }),
        FileSystem.readAsStringAsync(assets[0].localUri!),
        FileSystem.readAsStringAsync(assets[1].localUri!),
        FileSystem.readAsStringAsync(assets[2].localUri!),
      ]);
      if (!cancelled) setHtml(createPdfViewerHtml(pdf, library, worker, JSON.parse(resources)));
    })().catch(() => { if (!cancelled) { setLoading(false); setError("Could not load the lesson PDF. Check your connection and try again."); } }).finally(() => {
      if (temporaryUri) FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => {});
    });
    return () => { cancelled = true; clearTimeout(t); };
  }, [visible, uri, retry]);

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
          {/^https?:\/\//i.test(uri) ? <Pressable onPress={openInBrowser} style={styles.iconBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Open PDF in browser">
            <Ionicons name="open-outline" size={24} color={primaryColor} />
          </Pressable> : null}
        </View>
        <View style={styles.body}>
          {loading ? (
            <View style={[styles.centered, styles.loadingOverlay]} pointerEvents="none">
              <ActivityIndicator size="large" color={primaryColor} />
            </View>
          ) : null}
          {error ? <View style={[styles.centered, { padding: 24 }]}>
            <Text accessibilityRole="alert" style={{ color: textColor, textAlign: "center", marginBottom: 16 }}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)} style={{ padding: 14 }}><Text style={{ color: primaryColor }}>Try again</Text></Pressable>
          </View> : html ? <WebView
            source={{ html }}
            style={styles.webview}
            originWhitelist={["about:*", "blob:*", "data:*"]}
            onShouldStartLoadWithRequest={({ url }) => url === "about:blank" || url.startsWith("blob:") || url.startsWith("data:text/html")}
            onMessage={({ nativeEvent }) => {
              try {
                const message = JSON.parse(nativeEvent.data);
                if (message.type === "ready" || message.type === "error") {
                  if (loadTimeout.current) clearTimeout(loadTimeout.current);
                  setLoading(false);
                  setError(message.type === "error" ? String(message.message) : null);
                }
              } catch { /* Ignore malformed messages from the document renderer. */ }
            }}
            onError={() => {
              setLoading(false);
              setError("Could not display the lesson PDF.");
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
            mixedContentMode="never"
            nestedScrollEnabled
          /> : null}
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
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingOverlay: { zIndex: 2, backgroundColor: "rgba(255,255,255,0.65)" },
});
