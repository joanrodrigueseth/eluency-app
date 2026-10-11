import type { ComponentProps } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { TouchableOpacity } from "../lib/hapticPressables";
import {
  ACHIEVEMENTS,
  normalizeAchievementIds,
} from "../lib/game/engagement";
import type { AppTheme } from "../lib/theme";
import type { UserStats } from "../types/study-game";
import GlassCard from "./GlassCard";

type Props = {
  visible: boolean;
  unlockedIds: string[];
  stats: UserStats;
  theme: AppTheme;
  onClose: () => void;
};

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export default function AchievementGalleryModal({
  visible,
  unlockedIds,
  stats,
  theme,
  onClose,
}: Props) {
  const unlocked = new Set(normalizeAchievementIds(unlockedIds));
  const unlockedCount = ACHIEVEMENTS.filter((item) => unlocked.has(item.id)).length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: theme.isDark ? "rgba(0,0,0,0.66)" : "rgba(15,23,42,0.38)",
          justifyContent: "flex-end",
        }}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          accessibilityLabel="Close achievements"
          onPress={onClose}
        />
        <View
          style={{
            maxHeight: "82%",
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            backgroundColor: theme.colors.background,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: theme.colors.border,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              paddingHorizontal: 18,
              paddingTop: 12,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: 999,
                backgroundColor: theme.colors.borderStrong,
                alignSelf: "center",
                marginBottom: 13,
              }}
            />
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: theme.colors.primarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="trophy-outline" size={22} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[theme.typography.title, { fontSize: 21 }]}>Achievements</Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                  {unlockedCount} of {ACHIEVEMENTS.length} unlocked
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close achievements"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={21} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 10 }}
          >
            {ACHIEVEMENTS.map((achievement) => {
              const isUnlocked = unlocked.has(achievement.id);
              const current = Math.min(achievement.current(stats), achievement.target);
              const percentage = Math.round((current / achievement.target) * 100);
              const accent = isUnlocked ? theme.colors.success : theme.colors.primary;

              return (
                <GlassCard
                  key={achievement.id}
                  padding={13}
                  variant="strong"
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: isUnlocked ? `${theme.colors.success}55` : theme.colors.border,
                    opacity: isUnlocked ? 1 : 0.88,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 14,
                        backgroundColor: `${accent}16`,
                        borderWidth: 1,
                        borderColor: `${accent}35`,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name={(isUnlocked ? achievement.icon : "lock-closed-outline") as IoniconName}
                        size={22}
                        color={accent}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                        <Text style={[theme.typography.bodyStrong, { fontSize: 14, flexShrink: 1 }]}>
                          {achievement.title}
                        </Text>
                        {isUnlocked ? (
                          <View
                            style={{
                              paddingHorizontal: 7,
                              paddingVertical: 3,
                              borderRadius: 999,
                              backgroundColor: `${theme.colors.success}18`,
                            }}
                          >
                            <Text style={{ color: theme.colors.success, fontSize: 9, fontWeight: "900" }}>
                              UNLOCKED
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text
                        style={[
                          theme.typography.caption,
                          { color: theme.colors.textMuted, marginTop: 3, lineHeight: 17 },
                        ]}
                      >
                        {achievement.description}
                      </Text>
                      {!isUnlocked ? (
                        <View style={{ marginTop: 9 }}>
                          <View
                            style={{
                              height: 5,
                              borderRadius: 999,
                              overflow: "hidden",
                              backgroundColor: theme.colors.border,
                            }}
                          >
                            <View
                              style={{
                                width: `${percentage}%`,
                                height: "100%",
                                borderRadius: 999,
                                backgroundColor: theme.colors.primary,
                              }}
                            />
                          </View>
                          <Text
                            style={[
                              theme.typography.caption,
                              { color: theme.colors.textMuted, fontSize: 10, marginTop: 5 },
                            ]}
                          >
                            {current} / {achievement.target}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </GlassCard>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
