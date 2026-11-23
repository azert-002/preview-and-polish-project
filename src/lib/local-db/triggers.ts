/**
 * Local Database Trigger Emulation.
 * Enforces the exact business rules defined in AGENTS.md:
 * - Student attendance only consumes sessions if the teacher has checked in today.
 * - When teacher checks in, uncounted student attendances for that day are counted and deducted.
 * - Group enrollment cleans up matching waiting list entries.
 */

import type { DbRow } from "./types";
import { getTableRows, putTableRow } from "./storage";

function isTodayLocal(isoDate: string): boolean {
  const d = new Date(isoDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export async function handleAttendanceInsert(
  attendanceRow: DbRow
): Promise<DbRow> {
  const groupId = attendanceRow.group_id as string;
  const enrollmentId = attendanceRow.enrollment_id as string;

  // Check if teacher for this group checked in today
  const teacherRows = await getTableRows<{ id: string; group_id: string; created_at: string }>(
    "teacher_attendance"
  );
  const teacherToday = teacherRows.some(
    (t) => t.group_id === groupId && isTodayLocal(t.created_at)
  );

  attendanceRow.counted = teacherToday;
  if (!attendanceRow.created_at) {
    attendanceRow.created_at = new Date().toISOString();
  }

  // If teacher already present today, deduct/consume the session
  if (teacherToday && enrollmentId) {
    const enrollments = await getTableRows<{ id: string; sessions_used: number }>("enrollments");
    const enr = enrollments.find((e) => e.id === enrollmentId);
    if (enr) {
      await putTableRow("enrollments", {
        ...enr,
        sessions_used: (enr.sessions_used || 0) + 1,
      });
    }
  }

  return attendanceRow;
}

export async function handleTeacherAttendanceInsert(
  teacherAttendanceRow: DbRow
): Promise<DbRow> {
  const groupId = teacherAttendanceRow.group_id as string;
  if (!teacherAttendanceRow.created_at) {
    teacherAttendanceRow.created_at = new Date().toISOString();
  }

  // Find uncounted attendance rows for this group today
  const attendances = await getTableRows<{
    id: string;
    group_id: string;
    enrollment_id: string;
    counted: boolean;
    created_at: string;
  }>("attendance");

  const uncountedToday = attendances.filter(
    (a) => a.group_id === groupId && !a.counted && isTodayLocal(a.created_at)
  );

  const enrollments = await getTableRows<{ id: string; sessions_used: number }>("enrollments");
  const enrMap = new Map(enrollments.map((e) => [e.id, { ...e }]));

  for (const att of uncountedToday) {
    att.counted = true;
    await putTableRow("attendance", att as unknown as DbRow);

    const enr = enrMap.get(att.enrollment_id);
    if (enr) {
      enr.sessions_used = (enr.sessions_used || 0) + 1;
      await putTableRow("enrollments", enr as unknown as DbRow);
    }
  }

  return teacherAttendanceRow;
}

export async function handleEnrollmentInsert(
  enrollmentRow: DbRow
): Promise<void> {
  const studentId = enrollmentRow.student_id as string;
  const groupId = enrollmentRow.group_id as string;

  if (!studentId || !groupId) return;

  const groups = await getTableRows<{ id: string; activity: string; subject_id: string | null }>("groups");
  const grp = groups.find((g) => g.id === groupId);
  if (!grp) return;

  // Remove matching waiting list entries
  const waitlist = await getTableRows<{ id: string; student_id: string; activity: string; subject_id: string | null }>("waiting_list");
  const toDelete = waitlist.filter(
    (w) =>
      w.student_id === studentId &&
      (w.activity === grp.activity || (w.subject_id && w.subject_id === grp.subject_id))
  );

  const { deleteTableRow } = await import("./storage");
  for (const item of toDelete) {
    await deleteTableRow("waiting_list", item.id);
  }
}

export async function handleStudentDelete(studentId: string): Promise<void> {
  if (!studentId) return;

  const { deleteTableRow } = await import("./storage");

  // Cascade delete from waiting_list
  const waitlist = await getTableRows<{ id: string; student_id?: string | null }>("waiting_list");
  for (const w of waitlist) {
    if (w.student_id === studentId) {
      await deleteTableRow("waiting_list", w.id);
    }
  }

  // Cascade delete from enrollments
  const enrollments = await getTableRows<{ id: string; student_id?: string | null }>("enrollments");
  for (const e of enrollments) {
    if (e.student_id === studentId) {
      await deleteTableRow("enrollments", e.id);
    }
  }

  // Cascade delete from attendance
  const attendance = await getTableRows<{ id: string; student_id?: string | null }>("attendance");
  for (const a of attendance) {
    if (a.student_id === studentId) {
      await deleteTableRow("attendance", a.id);
    }
  }

  // Cascade delete from payments
  const payments = await getTableRows<{ id: string; student_id?: string | null }>("payments");
  for (const p of payments) {
    if (p.student_id === studentId) {
      await deleteTableRow("payments", p.id);
    }
  }
}

export async function cleanOrphanedStudentRecords(): Promise<void> {
  const students = await getTableRows<{ id: string }>("students");
  const studentIds = new Set(students.map((s) => s.id));

  const tables: ("waiting_list" | "enrollments" | "attendance" | "payments")[] = [
    "waiting_list",
    "enrollments",
    "attendance",
    "payments",
  ];

  const { deleteTableRow } = await import("./storage");

  for (const table of tables) {
    const rows = await getTableRows<{ id: string | number; student_id?: string | null }>(table);
    for (const r of rows) {
      if (!r.student_id || !studentIds.has(r.student_id)) {
        await deleteTableRow(table, r.id);
      }
    }
  }
}


