import { Image, Text, View } from "react-native";
import StudentWorkspaceActions from "./StudentWorkspaceActions";
import type { StudyUi } from "../../types/study-ui";

export default function StudentDashboardHeader({ ui, topInset, onSettings, onClassrooms }: {
  ui: StudyUi; topInset: number; onSettings: () => void; onClassrooms: () => void;
}) {
  return <View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 50,
    backgroundColor: ui.card, borderBottomWidth: 1, borderBottomColor: ui.border,
    paddingTop: Math.max(topInset, 8), paddingBottom: 8, paddingHorizontal: 16,
    flexDirection: "row", alignItems: "center" }}>
    <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: 44, height: 44, marginRight: 10, borderRadius: 13, overflow: "hidden" }}>
        <Image source={require("../../assets/icon.png")} style={{ width: 44, height: 44 }} resizeMode="contain" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: "800", fontSize: 22, lineHeight: 25, color: ui.text }} numberOfLines={1}>Eluency</Text>
        <Text style={{ color: ui.muted, fontSize: 12, lineHeight: 15, marginTop: 1 }} numberOfLines={1}>Learn. Practice. Speak.</Text>
      </View>
    </View>
    <StudentWorkspaceActions colors={ui} onSettings={onSettings} onClassrooms={onClassrooms} />
  </View>;
}
