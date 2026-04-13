import Constants from "expo-constants";

import { supabase } from "../supabase";

const apiBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl?.toString() || "https://www.eluency.com";

type JsonRecord = Record<string, unknown>;

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw error;
  if (!session?.access_token) throw new Error("Not authenticated");
  return session.access_token;
}

async function parseJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function authedJsonRequest<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: T | null }> {
  const token = await getAccessToken();
  const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  return {
    ok: res.ok,
    status: res.status,
    json: await parseJsonSafe<T>(res),
  };
}

function isSupportedServerResponse(status: number) {
  return status !== 404 && status !== 405;
}

export async function createAdminTest(payload: JsonRecord) {
  return authedJsonRequest<{ error?: string }>("/api/admin/tests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function deleteTestCascade(params: {
  testId: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const { testId, currentUserId, isAdmin } = params;

  const serverResult = await authedJsonRequest<{ error?: string }>(
    `/api/admin/tests/${encodeURIComponent(testId)}?cascade=1`,
    { method: "DELETE" }
  );

  if (serverResult.ok) return;
  if (isSupportedServerResponse(serverResult.status)) {
    throw new Error(serverResult.json?.error ?? "Delete failed");
  }

  let studentsQuery = (supabase.from("students") as any)
    .select("id, assigned_tests")
    .contains("assigned_tests", [testId]);
  if (!isAdmin) {
    studentsQuery = studentsQuery.eq("teacher_id", currentUserId);
  }

  const { data: studentsRows, error: studentsErr } = await studentsQuery;
  if (studentsErr) throw studentsErr;

  const students = (studentsRows ?? []) as { id: string; assigned_tests?: string[] | null }[];
  await Promise.all(
    students.map(async (student) => {
      const current = Array.isArray(student.assigned_tests) ? student.assigned_tests : [];
      const next = current.filter((entry) => entry !== testId);
      if (next.length === current.length) return;

      const { error } = await (supabase.from("students") as any)
        .update({ assigned_tests: next })
        .eq("id", student.id);
      if (error) throw error;
    })
  );

  let deleteQuery = (supabase.from("tests") as any).delete().eq("id", testId);
  if (!isAdmin) {
    deleteQuery = deleteQuery.eq("teacher_id", currentUserId);
  }

  const { error: deleteErr } = await deleteQuery;
  if (deleteErr) throw deleteErr;
}

export async function deleteOwnAccountCascade(userId: string) {
  const serverResult = await authedJsonRequest<{ error?: string }>(
    `/api/admin/teachers/${encodeURIComponent(userId)}?cascade=1`,
    { method: "DELETE" }
  );

  if (serverResult.ok) return;
  if (isSupportedServerResponse(serverResult.status)) {
    throw new Error(serverResult.json?.error ?? `Failed to delete account (${serverResult.status})`);
  }

  const { data: lessonRows, error: lessonsLookupError } = await (supabase.from("lessons") as any)
    .select("id")
    .eq("created_by", userId);
  if (lessonsLookupError) throw lessonsLookupError;

  const lessonIds = Array.isArray(lessonRows)
    ? lessonRows.map((row: { id: string }) => row.id).filter(Boolean)
    : [];

  const { data: packRows, error: packsLookupError } = await (supabase.from("lesson_packs") as any)
    .select("id")
    .eq("created_by", userId);
  if (packsLookupError) throw packsLookupError;

  const packIds = Array.isArray(packRows)
    ? packRows.map((row: { id: string }) => row.id).filter(Boolean)
    : [];

  if (lessonIds.length > 0) {
    const { error } = await (supabase.from("lesson_pack_lessons") as any)
      .delete()
      .in("lesson_id", lessonIds);
    if (error) throw error;
  }

  if (packIds.length > 0) {
    const { error: deletePackLinksError } = await (supabase.from("lesson_pack_lessons") as any)
      .delete()
      .in("pack_id", packIds);
    if (deletePackLinksError) throw deletePackLinksError;

    const { error: deletePacksError } = await (supabase.from("lesson_packs") as any)
      .delete()
      .in("id", packIds);
    if (deletePacksError) throw deletePacksError;
  }

  if (lessonIds.length > 0) {
    const { error: deleteLessonsError } = await (supabase.from("lessons") as any)
      .delete()
      .in("id", lessonIds);
    if (deleteLessonsError) throw deleteLessonsError;
  }

  const { error: deleteTestsError } = await (supabase.from("tests") as any)
    .delete()
    .eq("teacher_id", userId);
  if (deleteTestsError) throw deleteTestsError;

  const { error: deleteStudentsError } = await (supabase.from("students") as any)
    .delete()
    .eq("teacher_id", userId);
  if (deleteStudentsError) throw deleteStudentsError;

  const legacyDelete = await authedJsonRequest<{ error?: string }>(
    `/api/admin/teachers/${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
  if (!legacyDelete.ok) {
    throw new Error(legacyDelete.json?.error ?? `Failed to delete account (${legacyDelete.status})`);
  }
}
