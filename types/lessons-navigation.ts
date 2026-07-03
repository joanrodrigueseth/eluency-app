import type { RootStackParamList } from "./navigation";

export type RootLessonsStackParams = Pick<
  RootStackParamList,
  "Dashboard" | "Lessons" | "LessonForm" | "LessonPacks" | "Subscription" | "Notifications"
>;
