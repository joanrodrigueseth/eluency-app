import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassCard from "../GlassCard";
import IconTile from "../IconTile";
import { TouchableOpacity } from "../../lib/hapticPressables";
import type { AppTheme } from "../../lib/theme";
import type { StudyProgress } from "../../types/study-game";
import type { StudyUi } from "../../types/study-ui";

export default function StudentSettingsTab({ ui, theme, progress, studentName, teacherName, learningLanguages, dailyGoalWords, applyProgress, replayStudentGuide, onLogout }: {
  ui: StudyUi; theme: AppTheme; progress: StudyProgress; studentName: string; teacherName: string;
  learningLanguages: string[]; dailyGoalWords: number; applyProgress: (next: StudyProgress) => void;
  replayStudentGuide: () => void; onLogout: () => void;
}) {
  return (<>
                <GlassCard style={{ borderRadius: 18, marginBottom: 14 }} padding={16} variant="hero">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <IconTile icon="settings-outline" size={42} iconSize={22} radius={12} backgroundColor={ui.primarySoft} borderColor={ui.borderStrong} color={ui.primary} />
                    <Text style={{ fontWeight: "800", fontSize: 24, color: ui.text }}>Settings</Text>
                  </View>
                </GlassCard>

                <GlassCard style={{ borderRadius: 16, marginBottom: 12 }} padding={14} variant="strong">
                  <Text style={{ fontSize: 11, color: ui.muted, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700", marginBottom: 10 }}>Profile</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 24 }}>👤</Text>
                    </View>
                    <View>
                      <Text style={{ fontWeight: "700", fontSize: 18, color: ui.text }}>{studentName || "Student"}</Text>
                      <Text style={{ color: ui.muted, fontSize: 13, marginTop: 2 }}>{learningLanguages.length ? `Learning ${learningLanguages.join(", ")}` : "Your assigned learning workspace"}</Text>
                    </View>
                  </View>
                </GlassCard>

                <GlassCard style={{ borderRadius: 16, marginBottom: 12 }} padding={14} variant="strong">
                  <Text style={{ fontSize: 11, color: ui.muted, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700", marginBottom: 10 }}>Teacher Information</Text>
                  <Text style={{ fontWeight: "600", color: ui.text }}>{teacherName}</Text>
                  <Text style={{ color: ui.muted, marginTop: 2 }}>Contact your teacher for lesson assignments and progress.</Text>
                </GlassCard>

                <GlassCard style={{ borderRadius: 16, marginBottom: 12 }} padding={14} variant="strong">
                  <Text style={{ fontSize: 11, color: ui.muted, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "700", marginBottom: 10 }}>Preferences</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const nextDarkMode = !theme.isDark;
                      theme.setMode(nextDarkMode ? "dark" : "light");
                      applyProgress({
                        ...progress,
                        preferences: { ...progress.preferences, darkMode: nextDarkMode },
                      });
                    }}
                    accessibilityRole="switch"
                    accessibilityLabel="Dark mode"
                    accessibilityState={{ checked: theme.isDark }}
                    style={{ borderTopWidth: 1, borderTopColor: ui.borderSoft, paddingTop: 10, paddingBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <View>
                      <Text style={{ fontWeight: "600", color: ui.text }}>Dark Mode</Text>
                      <Text style={{ color: ui.muted, fontSize: 12, marginTop: 3 }}>Use dark color palette across the app</Text>
                    </View>
                    <View style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: theme.isDark ? ui.primary : ui.border, justifyContent: "center", paddingHorizontal: 3 }}>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: "#fff",
                          alignSelf: theme.isDark ? "flex-end" : "flex-start",
                        }}
                      />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      applyProgress({
                        ...progress,
                        preferences: {
                          ...progress.preferences,
                          soundEnabled: !progress.preferences.soundEnabled,
                        },
                      })
                    }
                    accessibilityRole="switch"
                    accessibilityLabel="Correct answer sounds"
                    accessibilityState={{ checked: progress.preferences.soundEnabled }}
                    style={{ borderTopWidth: 1, borderTopColor: ui.borderSoft, paddingTop: 10, paddingBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ fontWeight: "600", color: ui.text }}>Correct Answer Sounds</Text>
                      <Text style={{ color: ui.muted, fontSize: 12, marginTop: 3 }}>
                        Play a short sound after correct practice answers
                      </Text>
                    </View>
                    <View style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: progress.preferences.soundEnabled ? ui.primary : ui.border, justifyContent: "center", paddingHorizontal: 3 }}>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: "#fff",
                          alignSelf: progress.preferences.soundEnabled ? "flex-end" : "flex-start",
                        }}
                      />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      applyProgress({
                        ...progress,
                        preferences: { ...progress.preferences, hapticEnabled: !progress.preferences.hapticEnabled },
                      })
                    }
                    accessibilityRole="switch"
                    accessibilityLabel="Haptic feedback"
                    accessibilityState={{ checked: progress.preferences.hapticEnabled }}
                    style={{ borderTopWidth: 1, borderTopColor: ui.borderSoft, paddingTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <View>
                      <Text style={{ fontWeight: "600", color: ui.text }}>Haptic Feedback</Text>
                      <Text style={{ color: ui.muted, fontSize: 12, marginTop: 3 }}>Vibrate on interactions</Text>
                    </View>
                    <View style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: progress.preferences.hapticEnabled ? ui.success : ui.border, justifyContent: "center", paddingHorizontal: 3 }}>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: "#fff",
                          alignSelf: progress.preferences.hapticEnabled ? "flex-end" : "flex-start",
                        }}
                      />
                    </View>
                  </TouchableOpacity>
                  <View style={{ borderTopWidth: 1, borderTopColor: ui.borderSoft, paddingTop: 12, marginTop: 10 }}>
                    <Text style={{ fontWeight: "600", color: ui.text }}>Daily Study Goal</Text>
                    <Text style={{ color: ui.muted, fontSize: 12, marginTop: 3 }}>
                      Choose a realistic number of words to study each day
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 11 }}>
                      {[10, 20, 30, 50].map((goal) => {
                        const selected = dailyGoalWords === goal;
                        return (
                          <TouchableOpacity
                            key={goal}
                            onPress={() =>
                              applyProgress({
                                ...progress,
                                preferences: {
                                  ...progress.preferences,
                                  dailyGoalWords: goal,
                                },
                              })
                            }
                            accessibilityRole="radio"
                            accessibilityLabel={`${goal} words per day`}
                            accessibilityState={{ selected }}
                            style={{
                              flex: 1,
                              minHeight: 42,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: selected ? ui.primary : ui.border,
                              backgroundColor: selected ? ui.primarySoft : ui.card,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Text style={{ color: selected ? ui.primary : ui.text, fontWeight: "800", fontSize: 13 }}>
                              {goal}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ color: ui.muted, fontSize: 12 }}>Current app theme: {theme.isDark ? "Dark" : "Light"}</Text>
                  </View>
                </GlassCard>

                <GlassCard style={{ borderRadius: 16, marginBottom: 12 }} padding={14} variant="strong">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
                    <IconTile icon="help-circle-outline" size={42} iconSize={21} radius={12} backgroundColor={ui.primarySoft} borderColor={ui.borderStrong} color={ui.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: ui.text, fontSize: 15, fontWeight: "800" }}>Help & app guide</Text>
                      <Text style={{ color: ui.muted, fontSize: 12, lineHeight: 17, marginTop: 2 }}>Review where lessons, practice, tests, and progress live.</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={replayStudentGuide}
                    accessibilityRole="button"
                    accessibilityLabel="Show student app guide"
                    style={{ minHeight: 46, marginTop: 13, borderRadius: 13, borderWidth: 1, borderColor: ui.borderStrong, backgroundColor: ui.primarySoft, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }}
                  >
                    <Ionicons name="map-outline" size={18} color={ui.primary} />
                    <Text style={{ color: ui.primary, fontSize: 13, fontWeight: "900" }}>Show app guide</Text>
                  </TouchableOpacity>
                </GlassCard>

                <TouchableOpacity
                  onPress={onLogout}
                  accessibilityRole="button"
                  accessibilityLabel="Log out"
                  style={{ borderRadius: 14, borderWidth: 1, borderColor: ui.danger, backgroundColor: `${ui.danger}18`, paddingVertical: 14, alignItems: "center", marginBottom: 8 }}
                >
                  <Text style={{ color: ui.danger, fontWeight: "700", fontSize: 15 }}>Log out</Text>
                </TouchableOpacity>
              </>);
}

