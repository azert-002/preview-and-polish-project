import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { displayUsername } from "@/lib/username";

export type Settings = Tables<"settings">;
export type Subject = Tables<"subjects">;

/** Checks safely whether a subject has a given activity, handling arrays, strings, nulls and undefined. */
export function subjectHasActivity(s: { activities?: unknown } | null | undefined, act: string): boolean {
  if (!s || !s.activities) return false;
  if (Array.isArray(s.activities)) return s.activities.includes(act);
  if (typeof s.activities === "string") {
    try {
      const parsed = JSON.parse(s.activities);
      if (Array.isArray(parsed)) return parsed.includes(act);
    } catch {}
    return s.activities.includes(act);
  }
  return false;
}
export type Room = Tables<"rooms">;
export type Level = Tables<"levels">;
export type Teacher = Tables<"teachers">;
export type Group = Tables<"groups">;
export type Student = Tables<"students">;
export type Enrollment = Tables<"enrollments">;
export type Attendance = Tables<"attendance">;
export type Payment = Tables<"payments">;
export type Expense = Tables<"expenses">;
export type Payout = Tables<"payouts">;

export type GroupFull = Group & {
  subject: Subject | null;
  teacher: Teacher | null;
  room: Room | null;
  level: Level | null;
};

export type EnrollmentFull = Enrollment & { group: GroupFull | null; student?: Student | null };

function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

const GROUP_SELECT = "*, subject:subjects(*), teacher:teachers(*), room:rooms(*), level:levels(*)";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const found = unwrap(await supabase.from("settings").select("*").eq("id", 1).maybeSingle());
      if (found) return found as Settings;
      // A fresh database has no settings row yet: create the defaults so prices work.
      return unwrap(await supabase.from("settings").upsert({ id: 1 }).select("*").single()) as Settings;
    },
  });
}

export function useSubjects() {
  return useQuery({
    queryKey: ["subjects"],
    queryFn: async () => unwrap(await supabase.from("subjects").select("*").order("created_at")) as Subject[],
  });
}

export function useRooms() {
  return useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      const rows = unwrap(await supabase.from("rooms").select("*")) as Room[];
      return [...rows].sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar", { numeric: true }));
    },
  });
}

export function useLevels() {
  return useQuery({
    queryKey: ["levels"],
    queryFn: async () => unwrap(await supabase.from("levels").select("*").order("sort")) as Level[],
  });
}

export function useTeachers() {
  return useQuery({
    queryKey: ["teachers"],
    queryFn: async () => unwrap(await supabase.from("teachers").select("*").order("created_at")) as Teacher[],
  });
}

export function useGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: async () =>
      unwrap(await supabase.from("groups").select(GROUP_SELECT).order("created_at")) as unknown as GroupFull[],
  });
}

export function useStudents() {
  return useQuery({
    queryKey: ["students"],
    queryFn: async () => unwrap(await supabase.from("students").select("*").order("created_at", { ascending: false })) as Student[],
  });
}

export function useEnrollments() {
  return useQuery({
    queryKey: ["enrollments"],
    queryFn: async () => {
      const data = unwrap(
        await supabase
          .from("enrollments")
          .select(`*, group:groups(${GROUP_SELECT}), student:students(*)`)
          .order("created_at"),
      ) as unknown as EnrollmentFull[];
      const valid = data.filter((e) => e && e.student_id && e.student);
      const orphans = data.filter((e) => !e || !e.student_id || !e.student);
      if (orphans.length > 0) {
        const orphanIds = orphans.map((o) => o.id).filter(Boolean);
        if (orphanIds.length > 0) {
          void supabase.from("enrollments").delete().in("id", orphanIds);
        }
      }
      return valid;
    },
  });
}

export function usePayments() {
  return useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const data = unwrap(
        await supabase.from("payments").select("*, student:students(*)").order("created_at", { ascending: false }),
      ) as unknown as (Payment & { student: Student | null })[];
      const valid = data.filter((e) => e && e.student_id && e.student);
      const orphans = data.filter((e) => !e || !e.student_id || !e.student);
      if (orphans.length > 0) {
        const orphanIds = orphans.map((o) => o.id).filter(Boolean);
        if (orphanIds.length > 0) {
          void supabase.from("payments").delete().in("id", orphanIds);
        }
      }
      return valid;
    },
  });
}

export function useExpenses() {
  return useQuery({
    queryKey: ["expenses"],
    queryFn: async () => unwrap(await supabase.from("expenses").select("*").order("spent_on", { ascending: false })) as Expense[],
  });
}

export function usePayouts() {
  return useQuery({
    queryKey: ["payouts"],
    queryFn: async () => unwrap(await supabase.from("payouts").select("*").order("created_at", { ascending: false })) as Payout[],
  });
}

export function useAttendance(sinceDays = 60) {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
  return useQuery({
    queryKey: ["attendance", sinceDays],
    queryFn: async () => {
      const data = unwrap(
        await supabase
          .from("attendance")
          .select("*, student:students(*), group:groups(*)")
          .gte("created_at", since)
          .order("created_at", { ascending: false }),
      ) as unknown as (Attendance & { student: Student | null; group: Group | null })[];
      const valid = data.filter((e) => e && e.student_id && e.student);
      const orphans = data.filter((e) => !e || !e.student_id || !e.student);
      if (orphans.length > 0) {
        const orphanIds = orphans.map((o) => o.id).filter(Boolean);
        if (orphanIds.length > 0) {
          void supabase.from("attendance").delete().in("id", orphanIds);
        }
      }
      return valid;
    },
  });
}

export type WaitingEntry = Tables<"waiting_list">;
export type WaitingEntryFull = WaitingEntry & { student: Student | null; subject: Subject | null; level?: Level | null };

export function useWaitingList() {
  return useQuery({
    queryKey: ["waiting_list"],
    queryFn: async () => {
      const data = unwrap(
        await supabase
          .from("waiting_list")
          .select("*, student:students(*), subject:subjects(*), level:levels(*)")
          .order("created_at"),
      ) as unknown as WaitingEntryFull[];
      const valid = data.filter((e) => e && e.student_id && e.student);
      const orphans = data.filter((e) => !e || !e.student_id || !e.student);
      if (orphans.length > 0) {
        const orphanIds = orphans.map((o) => o.id).filter(Boolean);
        if (orphanIds.length > 0) {
          void supabase.from("waiting_list").delete().in("id", orphanIds);
        }
      }
      return valid;
    },
  });
}

export type TeacherAttendance = Tables<"teacher_attendance">;

export function useTeacherAttendance(sinceDays = 1) {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
  return useQuery({
    queryKey: ["teacher_attendance", sinceDays],
    queryFn: async () =>
      unwrap(await supabase.from("teacher_attendance").select("*").gte("created_at", since).order("created_at", { ascending: false })) as TeacherAttendance[],
  });
}

export function useMyRole() {
  return useQuery({
    queryKey: ["my-role"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const rows = unwrap(await supabase.from("user_roles").select("role").eq("user_id", u.user.id)) as { role: "admin" | "staff" }[];
      return rows.some((r) => r.role === "admin") ? "admin" : (rows[0]?.role ?? null);
    },
  });
}

export function useMyUserId() {
  return useQuery({
    queryKey: ["my-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });
}

export function useMyUsername() {
  return useQuery({
    queryKey: ["my-username"],
    queryFn: async () => displayUsername((await supabase.auth.getUser()).data.user?.email),
  });
}

export function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export { unwrap };

export function isToday(d: string) {
  const x = new Date(d);
  const n = new Date();
  return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth() && x.getDate() === n.getDate();
}

export function isThisMonth(d: string) {
  const x = new Date(d);
  const n = new Date();
  return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth();
}

/** Read an image file, downscale it and return a JPEG data URL. */
export function fileToDataUrl(file: File, max = 360): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
