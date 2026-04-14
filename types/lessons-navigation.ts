import type { FloatingToastTone } from "../components/FloatingToast";

export type RootLessonsStackParams = {
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  Lessons: { flashMessage?: string; flashTone?: FloatingToastTone } | undefined;
  LessonForm: { lessonId?: string } | undefined;
  LessonPacks: undefined;
  Subscription: undefined;
  Notifications: undefined;
};
