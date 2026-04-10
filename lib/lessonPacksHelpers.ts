import { coercePlanForRole } from "./teacherRolePlanRules";

export type AccessType = "free" | "included" | "paid";
export type PackStatus = "published" | "draft";

export type LessonRow = {
  id: string;
  title: string;
  status: string;
  grade_range: string | null;
  language_level: string | null;
  language: string | null;
  created_by: string | null;
  cover_image_url: string | null;
  content_json:
    | {
        words?: {
          rowType?: "vocab" | "conjugation" | "preposition";
          term_a?: string;
          term_b?: string;
          pt?: string;
          en?: string;
          infinitive?: string;
          conjugations?: { pronoun: string; form_a: string; form_b?: string }[];
        }[];
      }
    | null;
};

export type LessonPackRow = {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  category: string | null;
  cefr_level: string | null;
  access_type: AccessType | null;
  price_label: string | null;
  cover_image_url: string | null;
  is_featured: boolean | null;
  status: PackStatus | null;
  created_by: string | null;
  language: string | null;
  created_at?: string | null;
};

export type LessonPackLessonRow = {
  pack_id: string;
  lesson_id: string;
  sort_order: number | null;
};

export type PackCardType = {
  id: string;
  title: string;
  description: string;
  lessonCount: number;
  wordCount: number;
  conjugationCount: number;
  cefrLevel: string;
  creator: string;
  accessType: AccessType;
  priceLabel: string | null;
  coverImageUrl: string | null;
  isFeatured: boolean;
  category: string;
  categoryIcon: string | null;
  language: string;
  status: PackStatus;
};

export type PackLessonDetail = {
  id: string;
  title: string;
  level: string | null;
  gradeRange: string | null;
  status: string;
};

export type TeacherPackAction =
  | { kind: "add"; label: string }
  | { kind: "upgrade"; label: string; href: string }
  | { kind: "checkout"; label: string }
  | { kind: "disabled"; label: string };

export const SUBSCRIPTION_PATH = "/dashboard/settings/subscription";

export const INCLUDED_ELIGIBLE_TEACHER_PLANS = ["Basic", "Standard"];

export const PACK_LANGUAGES = [
  "Portuguese (BR)",
  "Spanish",
  "English",
  "French",
  "German",
  "Italian",
  "Japanese",
  "Korean",
  "Chinese (Mandarin)",
  "Arabic",
];

export const CEFR_OPTIONS = ["A1", "A1–A2", "A2", "A2–B1", "B1", "B1–B2", "B2", "C1", "C1–C2", "C2"];

export const CATEGORY_OPTIONS = [
  "Foundations (Beginner Core)",
  "CEFR A2-C1",
  "People & Daily Life",
  "Home & Living",
  "Food & Dining",
  "Work & Professional",
  "Education",
  "Sports & Activities",
  "Travel",
  "Nature & Animals",
  "Technology",
  "Health & Safety",
];

export const BEGINNER_LEVELS = new Set(["A1", "A1–A2", "A2", "A2–B1"]);
export const INTERMEDIATE_LEVELS = new Set(["B1", "B1–B2", "B2"]);
export const ADVANCED_LEVELS = new Set(["C1", "C1–C2", "C2"]);

export function slugifyTitle(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function canUserAddPack(packAccessType: AccessType, role: string, plan: string): boolean {
  const normalizedRole = (role ?? "teacher").toLowerCase().trim();
  const safePlan = coercePlanForRole(normalizedRole, plan);

  if (normalizedRole === "admin") return true;
  if (normalizedRole === "principal") {
    return safePlan === "School" && packAccessType !== "paid";
  }

  if (normalizedRole !== "teacher") return false;

  if (packAccessType === "free") return true;

  if (packAccessType === "included") {
    return INCLUDED_ELIGIBLE_TEACHER_PLANS.includes(safePlan);
  }

  if (packAccessType === "paid") return false;

  return false;
}

export function getTeacherPackAction(
  packAccessType: AccessType,
  role: string,
  plan: string,
  subscriptionBaseUrl: string
): TeacherPackAction {
  const normalizedRole = (role ?? "teacher").toLowerCase().trim();
  const canAdd = canUserAddPack(packAccessType, normalizedRole, plan);

  if (canAdd) {
    return { kind: "add", label: "Add to Lessons" };
  }

  if (packAccessType === "included") {
    return {
      kind: "upgrade",
      label: "Upgrade to obtain Lessons",
      href: `${subscriptionBaseUrl.replace(/\/$/, "")}${SUBSCRIPTION_PATH}`,
    };
  }

  if (packAccessType === "paid") {
    return { kind: "checkout", label: "Buy Lesson Pack" };
  }

  return { kind: "disabled", label: "Unavailable" };
}
