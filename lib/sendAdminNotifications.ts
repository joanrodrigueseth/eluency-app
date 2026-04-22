import { supabase } from "./supabase";

/**
 * Mirrors Eluency `src/app/api/admin/notifications/send/route.ts` (same audience rules,
 * same `teacher_notifications` row shape). Uses the logged-in Supabase user (no Next.js API).
 */
export type NotificationAudience = "teachers" | "principals" | "both";

export async function sendAdminNotifications(params: {
  title: string;
  body: string | null;
  audience: NotificationAudience;
  targetUserId?: string | null;
}): Promise<{ sent: number; message?: string }> {
  const title = typeof params.title === "string" ? params.title.trim() : "";
  const messageBody = typeof params.body === "string" && params.body.trim() ? params.body.trim() : null;
  const targetUserId = typeof params.targetUserId === "string" && params.targetUserId.trim()
    ? params.targetUserId.trim()
    : null;

  let audience: NotificationAudience =
    params.audience === "principals" || params.audience === "both" ? params.audience : "teachers";

  if (!title) {
    throw new Error("Title is required");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: teacherRow, error: teacherErr } = await (supabase.from("teachers") as any)
    .select("id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (teacherErr) throw teacherErr;

  const role = (teacherRow?.role ?? "").toLowerCase();
  if (role !== "admin") {
    throw new Error("Forbidden");
  }

  let recipientIds: string[] = [];
  if (targetUserId) {
    recipientIds = [targetUserId];
  } else {
    const selectCols = "id, user_id";
    let q = (supabase.from("teachers") as any).select(selectCols).eq("active", true);

    if (audience === "teachers") {
      q = q.in("role", ["teacher", "admin"]);
    } else if (audience === "principals") {
      q = q.eq("role", "principal");
    }

    const { data: teacherRows, error: listErr } = await q;
    if (listErr) throw listErr;

    recipientIds = (teacherRows ?? [])
      .map((r: { id: string; user_id?: string | null }) => r.user_id ?? r.id)
      .filter(Boolean) as string[];
  }

  if (recipientIds.length === 0) {
    return { sent: 0, message: "No recipients found" };
  }

  const rows = recipientIds.map((teacher_id: string) => ({
    teacher_id,
    type: "admin_announcement",
    title,
    body: messageBody,
    metadata: { sent_by_admin: true },
  }));

  const { error: insertErr } = await (supabase.from("teacher_notifications") as any).insert(rows);
  if (insertErr) throw insertErr;

  return { sent: recipientIds.length };
}
