export type StudentMobileStackParamList = {
  Login: undefined;
  StudyGame: {
    sessionId: string;
    notificationId?: string;
    initialTab?: "tests";
  };
};

/** Only notifications intended for students may enter the mobile workspace. */
export function getStudentNotificationDestination(
  data: Record<string, unknown>,
  sessionId: string | null,
  notificationId: string,
  studentId: string | null = null,
): StudentMobileStackParamList["StudyGame"] | null {
  if (!sessionId || !studentId || data.student_id !== studentId) return null;
  switch (data.type) {
    case "student_assignment":
    case "assignment_reminder":
      return { sessionId, notificationId };
    case "student_result_reviewed":
      return { sessionId, notificationId, initialTab: "tests" };
    default:
      return null;
  }
}
