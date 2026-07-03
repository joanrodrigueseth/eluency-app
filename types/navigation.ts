import type { FloatingToastTone } from "../components/FloatingToast";

export type SettingsTab = "profile" | "security" | "terms" | "contact";

export type RootStackParamList = {
  Login: { initialView?: "teacher" | "student" } | undefined;
  Register: undefined;
  Dashboard: { sessionId?: string; openDrawer?: boolean } | undefined;
  Notifications: undefined;
  Chats: undefined;
  SendNotifications:
    | {
        targetTeacherId?: string;
        targetTeacherName?: string;
        targetTeacherEmail?: string;
      }
    | undefined;
  Teachers: undefined;
  Settings: { initialTab?: SettingsTab } | undefined;
  Subscription: undefined;
  LessonPacks: undefined;
  Students:
    | {
        openStudentId?: string;
        flashMessage?: string;
        flashTone?: FloatingToastTone;
      }
    | undefined;
  StudentForm: { studentId?: string } | undefined;
  Lessons: { flashMessage?: string; flashTone?: FloatingToastTone } | undefined;
  LessonForm: { lessonId?: string } | undefined;
  Tests: { flashMessage?: string; flashTone?: FloatingToastTone } | undefined;
  TestForm: { testId?: string } | undefined;
  StudentResults: undefined;
  StudyGame: { sessionId: string };
};
