import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import { TouchableOpacity } from "../lib/hapticPressables";
import { useAppTheme } from "../lib/theme";

type LessonAudioPlayerProps = {
  uri: string;
  title?: string;
  compact?: boolean;
};

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function LessonAudioPlayer({
  uri,
  title = "Lesson audio",
  compact = false,
}: LessonAudioPlayerProps) {
  const theme = useAppTheme();
  const player = useAudioPlayer(uri ? { uri } : null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState("");
  const duration = status.duration || 0;
  const currentTime = Math.min(status.currentTime || 0, duration || Number.MAX_SAFE_INTEGER);
  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  const loading = !status.isLoaded || status.isBuffering;

  useEffect(() => {
    setError("");
    if (!uri || status.isLoaded) return;
    const timer = setTimeout(() => {
      setError("Audio is taking too long to load. Check your connection and try again.");
    }, 15000);
    return () => clearTimeout(timer);
  }, [status.isLoaded, uri]);

  const togglePlayback = () => {
    setError("");
    try {
      if (status.playing) player.pause();
      else player.play();
    } catch {
      setError("Audio could not be played. Check your connection and try again.");
    }
  };

  const restart = async () => {
    setError("");
    try {
      await player.seekTo(0);
      player.play();
    } catch {
      setError("Audio could not be replayed. Check your connection and try again.");
    }
  };

  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.borderStrong,
        backgroundColor: theme.colors.surfaceAlt,
        padding: compact ? 12 : 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
        <TouchableOpacity
          onPress={togglePlayback}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? "Pause lesson audio" : "Play lesson audio"}
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: theme.colors.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {loading && !status.playing ? (
            <ActivityIndicator size="small" color={theme.colors.primaryText} />
          ) : (
            <Ionicons name={status.playing ? "pause" : "play"} size={20} color={theme.colors.primaryText} />
          )}
        </TouchableOpacity>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="musical-notes-outline" size={16} color={theme.colors.primary} />
              <Text numberOfLines={1} style={{ flex: 1, color: theme.colors.text, fontSize: 14, fontWeight: "800" }}>
                {title}
              </Text>
            </View>
            <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            style={{
              height: 7,
              marginTop: 9,
              borderRadius: 999,
              overflow: "hidden",
              backgroundColor: theme.colors.border,
            }}
          >
            <View style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 999, backgroundColor: theme.colors.primary }} />
          </View>
        </View>

        <TouchableOpacity
          onPress={restart}
          accessibilityRole="button"
          accessibilityLabel="Restart lesson audio"
          style={{
            width: 42,
            height: 42,
            borderRadius: 13,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="refresh" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      {error ? (
        <Text
          accessibilityRole="alert"
          style={{
            marginTop: 10,
            borderRadius: 10,
            backgroundColor: `${theme.colors.danger}14`,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: theme.colors.danger,
            fontSize: 11,
            fontWeight: "700",
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
