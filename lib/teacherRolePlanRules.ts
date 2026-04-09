/**
 * Matches Eluency web `rolePlanRules.ts` / DB check `teachers_role_plan_check`.
 * - admin     -> plan = 'Internal'
 * - principal -> plan = 'School'
 * - teacher   -> plan IN ('Basic', 'Standard')
 */
export const PLANS_BY_ROLE: Record<string, string[]> = {
  admin: ["Internal"],
  principal: ["School"],
  teacher: ["Basic", "Standard"],
};

export const DEFAULT_PLAN_FOR_ROLE: Record<string, string> = {
  admin: "Internal",
  principal: "School",
  teacher: "Basic",
};

export function getValidPlansForRole(role: string): string[] {
  const r = (role ?? "teacher").toLowerCase().trim();
  return PLANS_BY_ROLE[r] ?? PLANS_BY_ROLE.teacher;
}

export function getDefaultPlanForRole(role: string): string {
  const r = (role ?? "teacher").toLowerCase().trim();
  return DEFAULT_PLAN_FOR_ROLE[r] ?? DEFAULT_PLAN_FOR_ROLE.teacher;
}

/** Ensure plan is valid for role (for submit/save). */
export function coercePlanForRole(role: string, plan: string): string {
  const valid = getValidPlansForRole(role);
  const p = normalizePlanUi(plan);
  if (valid.includes(p)) return p;
  return getDefaultPlanForRole(role);
}

export const STUDENT_LIMIT_BY_PLAN: Record<string, number> = {
  Basic: 1,
  Standard: 30,
  School: 999,
  Internal: 999,
};

export function getStudentLimitForPlan(plan: string): number {
  const p = normalizePlanUi(plan);
  return STUDENT_LIMIT_BY_PLAN[p] ?? STUDENT_LIMIT_BY_PLAN.Basic ?? 1;
}

/** Map DB / display plan string to Title Case used in checks. */
export function normalizePlanUi(plan: string | null | undefined): string {
  const p = (plan ?? "").toLowerCase().trim();
  if (p === "basic" || p === "free" || p === "starter" || p === "view-only") return "Basic";
  if (p === "standard") return "Standard";
  if (p === "teacher") return "Standard";
  if (p === "tutor") return "Standard";
  if (p === "pro") return "School";
  if (p === "school") return "School";
  if (p === "internal") return "Internal";
  return "Basic";
}
