import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, X, Undo2, GraduationCap, Hourglass, Printer } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { isToday, useAttendance, useEnrollments, useGroups, useTeacherAttendance } from "@/lib/data";
import { remainingSessions } from "@/lib/business";
import { groupLabel } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Empty, PageHeader, Panel, Pill, SessionBar } from "@/components/common";
import { AttendanceSheetDialog } from "@/components/AttendanceSheetDialog";

export const Route = createFileRoute("/_authenticated/groups/$id")({
  head: () => ({ meta: [
    { title: "Attendance — Beyond Words" },
    { name: "description", content: "Group attendance sheet." },
    { property: "og:title", content: "Attendance — Beyond Words" },
    { property: "og:description", content: "Group attendance sheet." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: GroupAttendance,
});

function GroupAttendance() {
  const { id } = Route.useParams();
  const { t, tg, pick, day } = useI18n();
  const qc = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: groups = [] } = useGroups();
  const { data: enrollments = [] } = useEnrollments();
  const { data: attendance = [] } = useAttendance(1);
  const { data: teacherAttendance = [] } = useTeacherAttendance(1);
  const group = groups.find((g) => g.id === id);
  const teacherToday = teacherAttendance.find((a) => a.group_id === id && isToday(a.created_at)) ?? null;

  async function markTeacher() {
    if (!group?.teacher_id) return;
    const { error } = await supabase.from("teacher_attendance").insert({ teacher_id: group.teacher_id, group_id: id });
    if (error) { notifyError(error.message); return; }
    toast.success(tg("teacherCheckedIn", group.teacher?.gender));
    qc.invalidateQueries();
  }

  async function undoTeacher(attendanceId: string) {
    const { error } = await supabase.from("teacher_attendance").delete().eq("id", attendanceId);
    if (error) { notifyError(error.message); return; }
    qc.invalidateQueries();
  }

  const inGroup = enrollments.filter((e) => e.group_id === id);
  const studentIds = [...new Set(inGroup.map((e) => e.student_id))];
  const rows = studentIds.map((sid) => {
    const list = inGroup.filter((e) => e.student_id === sid);
    const active = list.find((e) => remainingSessions(e) > 0) ?? null;
    const left = list.reduce((s, e) => s + remainingSessions(e), 0);
    const today = attendance.find((a) => a.student_id === sid && a.group_id === id && isToday(a.created_at)) ?? null;
    return { sid, student: list[0]!.student, active, left, today, last: list[list.length - 1]! };
  }).filter((r) => r.active || r.today || !r.last.withdrawn_at); // removed from the package: seat freed, not listed

  async function mark(sid: string, enrollmentId: string, status: "present" | "absent") {
    const { error } = await supabase.from("attendance").insert({ enrollment_id: enrollmentId, student_id: sid, group_id: id, status });
    if (error) { error.message.includes("PACKAGE_EXHAUSTED") ? toast.error(t("packageEmpty")) : notifyError(error.message); return; }
    qc.invalidateQueries();
  }

  async function undo(attendanceId: string) {
    const { error } = await supabase.from("attendance").delete().eq("id", attendanceId);
    if (error) { notifyError(error.message); return; }
    qc.invalidateQueries();
  }

  return (
    <div>
      <Link to="/academics" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("academics")}
      </Link>
      <PageHeader
        title={`${t("takeAttendance")} — ${group ? groupLabel(group, pick) : ""}`}
        subtitle={group ? `${group.activity === "workshop" ? group.workshop_date ?? "" : day(group.day_of_week)} · ${group.teacher?.full_name ?? ""}` : ""}
        actions={
          group && (
            <Button variant="outline" onClick={() => setSheetOpen(true)}>
              <Printer /> {t("printAttendanceSheet")}
            </Button>
          )
        }
      />
      {group && sheetOpen && (
        <AttendanceSheetDialog
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          group={group}
          students={rows.flatMap((r) => (r.student ? [{ id: r.sid, first_name: r.student.first_name, last_name: r.student.last_name, code: r.student.code }] : []))}
        />
      )}
      <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">{t("absenceRule")}</div>
      <Panel title={tg("teacherPresence", group?.teacher?.gender)} className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <GraduationCap className="size-5" />
            </div>
            <div>
              <div className="font-medium text-foreground">{group?.teacher?.full_name ?? t("noTeacherAssigned")}</div>
              <div className="font-mono text-xs text-muted-foreground">{group?.teacher?.code ?? ""}</div>
            </div>
          </div>
          {!group?.teacher_id ? null : teacherToday ? (
            <div className="flex items-center gap-2">
              <Pill tone="success">{tg("teacherPresent", group?.teacher?.gender)}</Pill>
              <Button size="icon" variant="ghost" onClick={() => undoTeacher(teacherToday.id)} aria-label="undo">
                <Undo2 />
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="success" onClick={markTeacher}>
              <Check /> {tg("markTeacherPresent", group?.teacher?.gender)}
            </Button>
          )}
        </div>
        {group?.teacher_id && !teacherToday && <p className="mt-3 text-sm text-warning">{tg("teacherAbsentYet", group?.teacher?.gender)}</p>}
      </Panel>
      <Panel title={`${t("enrolled")} (${rows.length})`}>
        {rows.length === 0 ? (
          <Empty>{t("none")}</Empty>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.sid} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <Link to="/students/$id" params={{ id: r.sid }} className="flex items-center gap-3">
                  <div className="size-10 overflow-hidden rounded-full bg-muted">
                    {r.student?.photo_url && <img src={r.student.photo_url} alt="" className="size-full object-cover" />}
                  </div>
                  <div>
                    <div className="font-medium text-foreground">
                      {r.student?.first_name} {r.student?.last_name}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">{r.student?.code}</div>
                  </div>
                </Link>
                <div className="flex items-center gap-3">
                  <SessionBar used={(r.active ?? r.last).sessions_used} total={(r.active ?? r.last).sessions_total} />
                  {r.today ? (
                    <>
                      <Pill tone={r.today.status === "present" ? "success" : "danger"}>
                        {t("markedToday")}: {t(r.today.status === "present" ? "present" : "absent")}
                      </Pill>
                      {!r.today.counted && (
                        <Pill tone="warning">
                          <Hourglass className="me-1 inline size-3" /> {tg("waiting", group?.teacher?.gender)}
                        </Pill>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => undo(r.today!.id)} aria-label="undo">
                        <Undo2 />
                      </Button>
                    </>
                  ) : r.active ? (
                    <>
                      <Button size="sm" variant="success" onClick={() => mark(r.sid, r.active!.id, "present")}>
                        <Check /> {t("present")}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => mark(r.sid, r.active!.id, "absent")}>
                        <X /> {t("absent")}
                      </Button>
                    </>
                  ) : (
                    <Pill tone="danger">{t("exhausted")}</Pill>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
