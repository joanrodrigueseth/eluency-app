import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassCard from "../GlassCard";
import { TouchableOpacity } from "../../lib/hapticPressables";
import type { StudentClassroom } from "../../types/study-game";
import type { StudyUi } from "../../types/study-ui";

export default function StudentClassroomsTab({ ui, classrooms, teacherName, error, refreshing, offline,
  onSelect, onRetry, onDirectAssignments }: {
  ui: StudyUi;
  classrooms: StudentClassroom[];
  teacherName: string;
  error: string | null;
  refreshing: boolean;
  offline: boolean;
  onSelect: (classroom: StudentClassroom) => void;
  onRetry: () => void;
  onDirectAssignments: () => void;
}) {
  return <View>
    <Text style={{ color: ui.muted, fontSize: 11, letterSpacing: 1, fontWeight: "700" }}>YOUR CLASSES</Text>
    <Text style={{ color: ui.text, fontSize: 28, fontWeight: "800", marginTop: 4 }}>Classroom</Text>
    <Text style={{ color: ui.muted, fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 18 }}>
      Choose your classroom to open its lessons and tests.
    </Text>
    {offline ? <Text style={{ color: ui.muted, fontSize: 12, marginBottom: 12 }}>Offline: showing saved classrooms. Downloaded lessons are available; tests require a connection.</Text> : null}
    {error ? <GlassCard padding={14} style={{ marginBottom: 12 }}>
      <Text accessibilityRole="alert" style={{ color: ui.warning, fontSize: 13, lineHeight: 19 }}>{error}</Text>
      <TouchableOpacity onPress={onRetry} disabled={refreshing} accessibilityRole="button" accessibilityLabel="Retry loading classrooms"
        style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}>
        {refreshing ? <ActivityIndicator size="small" color={ui.primary} /> : null}
        <Text style={{ color: ui.primary, fontWeight: "700" }}>{refreshing ? "Refreshing…" : "Try again"}</Text>
      </TouchableOpacity>
    </GlassCard> : null}
    {!classrooms.length && !error ? <GlassCard padding={18}>
      <Ionicons name="people-outline" size={26} color={ui.muted} />
      <Text style={{ color: ui.text, fontSize: 17, fontWeight: "700", marginTop: 12 }}>No classroom yet</Text>
      <Text style={{ color: ui.muted, fontSize: 13, lineHeight: 20, marginTop: 6 }}>Your teacher has not added you to a classroom. Pull down to refresh when they do.</Text>
    </GlassCard> : null}
    {classrooms.map((classroom) => {
      const lessons = new Set(classroom.assignments.filter((item) => item.type === "lesson").map((item) => item.contentId)).size;
      const tests = new Set(classroom.assignments.filter((item) => item.type === "test").map((item) => item.contentId)).size;
      return <TouchableOpacity key={classroom.id} onPress={() => onSelect(classroom)} activeOpacity={0.82}
        accessibilityRole="button" accessibilityLabel={`Open ${classroom.name}, ${lessons} lessons and ${tests} tests`}
        style={{ marginBottom: 12 }}>
        <GlassCard padding={16}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: ui.classroomSoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="people-outline" size={21} color={ui.classroomText} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: ui.text, fontSize: 17, fontWeight: "700" }}>{classroom.name}</Text>
              <Text style={{ color: ui.muted, fontSize: 12, marginTop: 4 }}>{teacherName || "Your teacher"}</Text>
              <Text style={{ color: ui.muted, fontSize: 12, marginTop: 6 }}>{lessons} {lessons === 1 ? "lesson" : "lessons"} · {tests} {tests === 1 ? "test" : "tests"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ui.muted} />
          </View>
        </GlassCard>
      </TouchableOpacity>;
    })}
    <TouchableOpacity onPress={onDirectAssignments} accessibilityRole="button" accessibilityLabel="Open direct assignments"
      style={{ minHeight: 48, paddingVertical: 14 }}>
      <Text style={{ color: ui.primary, fontSize: 14, fontWeight: "700" }}>View direct assignments</Text>
      <Text style={{ color: ui.muted, fontSize: 12, marginTop: 4 }}>Work assigned to you outside a classroom.</Text>
    </TouchableOpacity>
  </View>;
}
