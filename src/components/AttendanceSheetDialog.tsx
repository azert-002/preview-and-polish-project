import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { unwrap, useSettings, type GroupFull } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { groupLabel } from "@/lib/labels";
import { hhmm, localISO, sheetColumns } from "@/lib/schedule";
import { Button } from "@/components/ui/button";
import { AttendanceSheet, PrintDialog, SingleSessionSheet, type SheetStudent } from "@/components/print";

/**
 * Print dialog for a group's attendance sheet. Weekly groups: one month per sheet
 * with month navigation. Workshops happen in a single session: one "الحالة" column.
 */
export function AttendanceSheetDialog({
  open,
  onOpenChange,
  group,
  students,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  group: GroupFull;
  students: SheetStudent[];
}) {
  const { t, pick, day } = useI18n();
  const { data: settings } = useSettings();
  const workshop = group.activity === "workshop";
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const from = new Date(cursor.y, cursor.m, 1);
  const to = new Date(cursor.y, cursor.m + 1, 1);

  const { data: records = [] } = useQuery({
    queryKey: ["attendance-sheet", group.id, workshop ? "all" : `${cursor.y}-${cursor.m}`],
    enabled: open,
    queryFn: async () => {
      let q = supabase.from("attendance").select("student_id, status, created_at").eq("group_id", group.id);
      if (!workshop) q = q.gte("created_at", from.toISOString()).lt("created_at", to.toISOString());
      return unwrap(await q.order("created_at"));
    },
  });

  const { dates, marks, firstStatus } = useMemo(() => {
    const marks = new Map<string, string>();
    const firstStatus = new Map<string, string>();
    for (const r of records) {
      const key = `${r.student_id}|${localISO(new Date(r.created_at))}`;
      if (!marks.has(key)) marks.set(key, r.status);
      if (!firstStatus.has(r.student_id)) firstStatus.set(r.student_id, r.status);
    }
    const recorded = records.map((r) => localISO(new Date(r.created_at)));
    return { dates: sheetColumns(recorded, settings?.sessions_per_month ?? 8, cursor.y, cursor.m), marks, firstStatus };
  }, [records, settings?.sessions_per_month, cursor.y, cursor.m]);

  const sorted = [...students].sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "ar"));
  const monthLabel = new Intl.DateTimeFormat("ar-DZ", { month: "long", year: "numeric", numberingSystem: "latn" }).format(from);
  const shift = (d: number) => setCursor((c) => { const n = new Date(c.y, c.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  const time = group.start_time ? `\u2066${hhmm(group.start_time)}–${hhmm(group.end_time)}\u2069` : "";
  const room = group.room ? pick(group.room.name_ar, group.room.name_en) : "";
  const teacherFemale = group.teacher?.gender === "female";
  const common = {
    settings,
    groupName: groupLabel(group, pick),
    teacherName: group.teacher?.full_name ?? "",
    teacherFemale,
    students: sorted,
  };

  if (workshop) {
    const date = group.workshop_date ?? (records[0] ? localISO(new Date(records[0].created_at)) : null);
    const dateLabel = date
      ? new Intl.DateTimeFormat("ar-DZ", { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" }).format(new Date(`${date}T12:00:00`))
      : "";
    return (
      <PrintDialog open={open} onOpenChange={onOpenChange} title={t("attendanceSheet")} wide>
        <SingleSessionSheet
          {...common}
          subtitle={[time, room].filter(Boolean).join(" · ")}
          dateLabel={dateLabel}
          date={date}
          statusOf={(id) => firstStatus.get(id)}
        />
      </PrintDialog>
    );
  }

  return (
    <PrintDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("attendanceSheet")}
      wide
      toolbar={
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => shift(-1)}>
            <ChevronRight className="ltr:rotate-180" /> {t("prevMonth")}
          </Button>
          <div className="text-sm font-semibold">{monthLabel}</div>
          <Button variant="outline" size="sm" onClick={() => shift(1)}>
            {t("nextMonth")} <ChevronLeft className="ltr:rotate-180" />
          </Button>
        </div>
      }
    >
      <AttendanceSheet {...common} subtitle={[day(group.day_of_week), time, room].filter(Boolean).join(" · ")} monthLabel={monthLabel} dates={dates} marks={marks} />
    </PrintDialog>
  );
}
