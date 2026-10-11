import type { StudentClassroom } from "../types/study-game";

export type ClassroomAssignmentType = "lesson" | "test";
export type StudentClassroomAssignmentSource = {
  assignmentType: ClassroomAssignmentType;
  contentId: string;
  classroomId: string;
  classroomName: string;
};

export function getClassroomNamesForAssignment(
  sources: StudentClassroomAssignmentSource[],
  assignmentType: ClassroomAssignmentType,
  contentId: string
) {
  return Array.from(new Set(
    sources
      .filter((source) => source.assignmentType === assignmentType && source.contentId === contentId)
      .map((source) => source.classroomName.trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
}

/** ID-based membership scoping; classroom names are display-only and need not be unique. */
export function scopeStudentCatalog<T extends { id: string; assignment?: unknown }>(
  items: T[],
  type: ClassroomAssignmentType,
  classroom: StudentClassroom | null,
  classrooms: StudentClassroom[] | undefined,
  sources: StudentClassroomAssignmentSource[],
): T[] {
  const assignments = classroom?.assignments.filter((item) => item.type === type) ?? [];
  if (classroom) {
    const byId = new Map(assignments.map((item) => [item.contentId, item]));
    return items.flatMap((item) => {
      const assignment = byId.get(item.id);
      if (!assignment) return [];
      return [{ ...item, assignment: {
        assignment_type: type, assignment_id: item.id,
        due_at: assignment.dueAt, instructions: assignment.instructions,
        assigned_at: assignment.assignedAt, required: true,
      } }];
    });
  }
  const classroomIds = new Set([
    ...(classrooms ?? []).flatMap((value) => value.assignments.filter((item) => item.type === type).map((item) => item.contentId)),
    ...(classrooms ? [] : sources.filter((source) => source.assignmentType === type).map((source) => source.contentId)),
  ]);
  return items.filter((item) => !classroomIds.has(item.id));
}

