import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pencil, Plus, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  subjectHasActivity,
  useGroups,
  useLevels,
  useRooms,
  useSettings,
  useSubjects,
  useTeachers,
  type Group,
  type GroupFull,
} from "@/lib/data";
import { AGE_GROUPS, GROUP_CAPACITY, audienceForAgeGroup, buildAutoGroupName, buildPackage } from "@/lib/business";
import { ageGroupKey } from "@/lib/labels";
import { findGroupConflicts, hhmm, type GroupConflictItem } from "@/lib/schedule";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, TimeField, selectCls } from "@/components/common";
import { cn } from "@/lib/utils";

export interface GroupPreset {
  name?: string;
  activity?: string;
  subject_id?: string;
  age_group?: string;
  level_id?: string;
  student_ids?: string[];
  waitlist_ids?: string[];
}

export function GroupDialog({
  open,
  onOpenChange,
  group,
  preset,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  group?: Group | GroupFull | null;
  preset?: GroupPreset | null;
  onSaved?: (g: any) => void;
}) {
  const { t, pick, day, money } = useI18n();
  const qc = useQueryClient();
  const { data: subjects = [] } = useSubjects();
  const { data: teachers = [] } = useTeachers();
  const { data: rooms = [] } = useRooms();
  const { data: levels = [] } = useLevels();
  const { data: settings } = useSettings();
  const { data: groups = [] } = useGroups();

  const todayStr = () => new Date().toLocaleDateString("en-CA");

  const usedActivities = (["levels", "support", "workshop"] as const).filter((a) =>
    subjects.some((s) => subjectHasActivity(s, a)),
  );
  const activityOptions: string[] = usedActivities.length ? [...usedActivities] : ["levels", "support", "workshop"];

  const defaultAct = activityOptions[0] || "levels";

  const empty = {
    name: "",
    activity: defaultAct,
    subject_id: "",
    teacher_id: "",
    room_id: "",
    level_id: "",
    age_group: "",
    day_of_week: "0",
    start_time: "",
    end_time: "",
    price: "",
    teacher_pct: "",
    workshop_date: todayStr(),
  };

  const [f, setF] = useState(empty);
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [showLockedHint, setShowLockedHint] = useState(false);
  // While editing, the name is regenerated only after the user changes a field it is built from.
  const [namingFieldsChanged, setNamingFieldsChanged] = useState(false);
  const isCohort = Boolean(preset && !group);
  const isAdding = !group && !isCohort;
  const hasRequiredForAuto =
    f.activity === "workshop" ? Boolean(f.subject_id) : Boolean(f.subject_id && f.age_group);
  const isNameLocked = isAdding && !hasRequiredForAuto && (!nameManuallyEdited || f.name.trim() === "");

  const conflicts = useMemo(() => {
    if (!open) return [];
    return findGroupConflicts(
      {
        id: group?.id ?? null,
        name: f.name,
        activity: f.activity,
        teacher_id: f.teacher_id || null,
        room_id: f.room_id || null,
        day_of_week: f.activity === "workshop" ? null : Number(f.day_of_week),
        workshop_date: f.activity === "workshop" ? f.workshop_date || null : null,
        start_time: f.start_time || null,
        end_time: f.end_time || null,
      },
      groups,
    );
  }, [
    open,
    group?.id,
    f.name,
    f.activity,
    f.teacher_id,
    f.room_id,
    f.day_of_week,
    f.workshop_date,
    f.start_time,
    f.end_time,
    groups,
  ]);

  function formatConflict(c: GroupConflictItem) {
    if (c.kind === "invalid_time") return t("conflictInvalidTime");
    if (c.kind === "duplicate_name") return t("conflictDuplicateName");
    const other = c.otherGroup;
    const timeInfo = other
      ? `${other.activity === "workshop" ? other.workshop_date ?? "" : day(other.day_of_week)} ${hhmm(other.start_time)}–${hhmm(other.end_time)}`
      : "";
    const detail = other?.name ? `${other.name} (${timeInfo})` : timeInfo;
    if (c.kind === "teacher_conflict") {
      const tc = teachers.find((t) => t.id === f.teacher_id);
      return t("conflictTeacher").replace("{name}", tc ? `${tc.full_name} · ${detail}` : detail);
    }
    if (c.kind === "room_conflict") {
      const rm = rooms.find((r) => r.id === f.room_id);
      const roomName = rm ? pick(rm.name_ar, rm.name_en) : "";
      return t("conflictRoom").replace("{name}", roomName ? `${roomName} · ${detail}` : detail);
    }
    return t("conflictTitle");
  }

  if (group && f.activity && !activityOptions.includes(f.activity)) activityOptions.push(f.activity);

  // Initialize or reset form state whenever open, group, or preset changes
  useEffect(() => {
    if (!open) return;
    setNameManuallyEdited(false);
    setShowLockedHint(false);
    setNamingFieldsChanged(false);
    const initialAct = activityOptions[0] || "levels";
    if (group) {
      setF({
        name: group.name ?? "",
        activity: group.activity ?? initialAct,
        subject_id: group.subject_id ?? "",
        teacher_id: group.teacher_id ?? "",
        room_id: group.room_id ?? "",
        level_id: group.level_id ?? "",
        age_group: group.age_group ?? (group.audience === "adults" ? "17+" : ""),
        day_of_week: String(group.day_of_week ?? 0),
        start_time: group.start_time ?? "",
        end_time: group.end_time ?? "",
        price: group.price != null ? String(group.price) : "",
        teacher_pct: group.teacher_pct != null ? String(group.teacher_pct) : "",
        workshop_date: group.workshop_date || todayStr(),
      });
    } else if (preset) {
      const act = preset.activity ?? initialAct;
      setF({
        ...empty,
        name: preset.name ?? "",
        activity: act,
        subject_id: preset.subject_id ?? "",
        age_group: preset.age_group ?? "",
        level_id: preset.level_id ?? "",
        workshop_date: todayStr(),
        price: String((settings as any)?.workshop_price ?? 500),
        teacher_pct: String((settings as any)?.workshop_teacher_amount ?? 300),
      });
    } else {
      setF({
        ...empty,
        activity: initialAct,
        workshop_date: todayStr(),
        price: String((settings as any)?.workshop_price ?? 500),
        teacher_pct: String((settings as any)?.workshop_teacher_amount ?? 300),
      });
    }
  }, [open, group, preset, settings, subjects]);

  // Keep chosen activity in sync if current activity isn't among available options
  useEffect(() => {
    if (open && activityOptions.length > 0 && !activityOptions.includes(f.activity)) {
      setF((prev) => ({
        ...prev,
        activity: activityOptions[0] ?? prev.activity,
        subject_id: "",
      }));
    }
  }, [open, activityOptions, f.activity]);

  // Adult level groups always have a level: preselect the first one (cheapest, e.g. A0) instead of an empty choice
  useEffect(() => {
    if (!open || f.activity !== "levels" || f.age_group !== "17+" || f.level_id) return;
    const first = levels[0];
    if (first) setF((prev) => ({ ...prev, level_id: first.id }));
  }, [open, f.activity, f.age_group, f.level_id, levels]);

  // Auto-generate the group name: always while adding, and while editing once subject/age/level/activity changed,
  // unless the user typed a name of their own
  const autoNaming = isAdding || Boolean(group && namingFieldsChanged);
  useEffect(() => {
    if (!open || !autoNaming) return;
    if (nameManuallyEdited && f.name.trim() !== "") return;

    if (!hasRequiredForAuto) {
      if (isAdding && !nameManuallyEdited && f.name !== "") {
        setF((prev) => ({ ...prev, name: "" }));
      }
      return;
    }

    const selectedSub = subjects.find((s) => s.id === f.subject_id);
    const subName = selectedSub ? pick(selectedSub.name_ar, selectedSub.name_en) : "";
    const selectedLvl = levels.find((l) => l.id === f.level_id);
    const lvlCode = f.activity === "levels" && f.age_group === "17+" ? selectedLvl?.code : "";

    const autoName = buildAutoGroupName({
      subjectName: subName,
      ageGroup: f.age_group,
      levelCode: lvlCode ?? null,
      activity: f.activity,
      existingNames: groups.filter((g) => g.id !== group?.id).map((g) => g.name),
    });

    if (autoName && f.name !== autoName) {
      setF((prev) => ({ ...prev, name: autoName }));
      setShowLockedHint(false);
    }
  }, [
    open,
    autoNaming,
    isAdding,
    hasRequiredForAuto,
    nameManuallyEdited,
    f.name,
    f.subject_id,
    f.age_group,
    f.level_id,
    f.activity,
    subjects,
    levels,
    groups,
    group?.id,
    pick,
  ]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    if (k === "subject_id" || k === "age_group" || k === "level_id") setNamingFieldsChanged(true);
    if (k === "activity" && val === "workshop") {
      setF({
        ...f,
        activity: val,
        workshop_date: f.workshop_date || todayStr(),
        price: f.price || String((settings as any)?.workshop_price ?? 500),
        teacher_pct: f.teacher_pct || String((settings as any)?.workshop_teacher_amount ?? 300),
      });
      return;
    }
    if (k === "teacher_id" && f.activity === "workshop") {
      const selectedTeacher = teachers.find((t) => t.id === val);
      setF({
        ...f,
        teacher_id: val,
        teacher_pct: selectedTeacher?.percentage
          ? String(selectedTeacher.percentage)
          : f.teacher_pct || String((settings as any)?.workshop_teacher_amount ?? 300),
      });
      return;
    }
    setF({ ...f, [k]: val });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (conflicts.length > 0) {
      toast.error(t("conflictTitle"), { description: formatConflict(conflicts[0]!) });
      return;
    }
    const row = {
      name: f.name,
      activity: f.activity,
      subject_id: f.subject_id || null,
      teacher_id: f.teacher_id || null,
      room_id: f.room_id || null,
      level_id: f.activity === "levels" && f.age_group === "17+" ? f.level_id || null : null,
      age_group: f.age_group || null,
      audience: audienceForAgeGroup(f.age_group),
      day_of_week: f.activity === "workshop" ? null : Number(f.day_of_week),
      start_time: f.start_time || null,
      end_time: f.end_time || null,
      max_students: GROUP_CAPACITY,
      price:
        f.activity === "workshop"
          ? f.price !== ""
            ? Number(f.price)
            : Number((settings as any)?.workshop_price ?? 500)
          : null,
      teacher_pct:
        f.activity === "workshop"
          ? f.teacher_pct !== ""
            ? Number(f.teacher_pct)
            : Number((settings as any)?.workshop_teacher_amount ?? 300)
          : f.teacher_pct !== ""
            ? Number(f.teacher_pct)
            : null,
      workshop_date: f.activity === "workshop" ? f.workshop_date || null : null,
    };

    const res = group
      ? await supabase.from("groups").update(row).eq("id", group.id).select().single()
      : await supabase.from("groups").insert(row).select().single();

    if (res.error) {
      notifyError(res.error.message);
      return;
    }

    const createdGroup = res.data;

    // When forming a cohort from waiting-list students: automatically enroll them into the new group
    if (!group && preset?.student_ids && preset.student_ids.length > 0) {
      const selectedLevel = levels.find((l) => l.id === (createdGroup.level_id || f.level_id));
      const pkg = buildPackage({
        activity: createdGroup.activity as any,
        audience: createdGroup.audience as any,
        plan: createdGroup.activity === "levels" && createdGroup.audience === "adults" ? "four_months" : "monthly",
        settings: (settings ?? {}) as any,
        level: selectedLevel ?? null,
        workshopPrice: createdGroup.price,
      });

      // A student waiting twice in the same bucket must still get only one package.
      const enrollRows = [...new Set(preset.student_ids)].flatMap((studentId) =>
        pkg.blocks.map((block) => ({
          student_id: studentId,
          group_id: createdGroup.id,
          sessions_total: block.sessions,
          price: block.price,
          plan: pkg.plan,
        }))
      );

      const { error: enrErr } = await supabase.from("enrollments").insert(enrollRows);
      if (enrErr) {
        console.error("[Cohort Enrollment Error]:", enrErr);
        notifyError(enrErr.message);
      } else {
        // Drop enrolled students from waiting list
        if (preset.waitlist_ids && preset.waitlist_ids.length > 0) {
          await supabase.from("waiting_list").delete().in("id", preset.waitlist_ids);
        } else {
          let delWl = supabase.from("waiting_list").delete().in("student_id", preset.student_ids);
          if (createdGroup.activity) delWl = delWl.eq("activity", createdGroup.activity);
          await delWl;
        }
      }
    }

    toast.success(
      !group && preset?.student_ids?.length
        ? t("groupFormedWithStudents").replace("{n}", String(preset.student_ids.length))
        : group
          ? t("updatedOk")
          : t("saved")
    );
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: ["groups"] });
    qc.invalidateQueries({ queryKey: ["enrollments"] });
    qc.invalidateQueries({ queryKey: ["waiting_list"] });
    qc.invalidateQueries();
    onSaved?.(res.data);
  }

  const filteredSubjects = subjects.filter((s) => subjectHasActivity(s, f.activity));
  const availableSubjects = useMemo(() => {
    const list = filteredSubjects.length > 0 ? [...filteredSubjects] : [...subjects];
    if (f.subject_id && !list.some((s) => s.id === f.subject_id)) {
      const extra = subjects.find((s) => s.id === f.subject_id);
      if (extra) list.push(extra);
    }
    return list;
  }, [filteredSubjects, subjects, f.subject_id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto sm:rounded-2xl p-5 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {group ? (
              <Pencil className="size-4 text-accent" />
            ) : isCohort ? (
              <Users className="size-4 text-accent" />
            ) : (
              <Plus className="size-4 text-accent" />
            )}
            {group ? t("editGroup") : isCohort ? t("formGroup") : t("addGroup")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          {/* Group Name: always present, auto-filled in cohort mode, locked initially when adding */}
          <Field label={t("name")} className={isCohort ? "sm:col-span-2" : ""}>
            <div
              className="relative"
              onClick={() => {
                if (isNameLocked) setShowLockedHint(true);
              }}
            >
              <Input
                required
                value={f.name}
                readOnly={isNameLocked}
                placeholder={isNameLocked ? t("autoNamePlaceholder") : ""}
                onChange={(e) => {
                  setNameManuallyEdited(true);
                  if (e.target.value.trim() === "") {
                    setNameManuallyEdited(false);
                  }
                  setF((prev) => ({ ...prev, name: e.target.value }));
                }}
                className={cn(
                  isNameLocked &&
                    "cursor-pointer bg-muted/40 border-dashed text-muted-foreground select-none focus-visible:ring-destructive/30",
                )}
              />
            </div>
            {showLockedHint && isNameLocked && (
              <p className="mt-1.5 text-xs text-destructive font-medium flex items-center gap-1 animate-in fade-in">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>
                  {f.activity === "workshop"
                    ? t("autoNameLockedWorkshopHint")
                    : t("autoNameLockedHint")}
                </span>
              </p>
            )}
          </Field>

          {/* Activity: hidden in cohort formation mode */}
          {!isCohort && (
            <Field label={t("activity")}>
              <select
                className={selectCls}
                value={f.activity}
                onChange={(e) => {
                  const a = e.target.value;
                  setNamingFieldsChanged(true);
                  const matching = subjects.filter((s) => subjectHasActivity(s, a));
                  const stillValid = matching.some((s) => s.id === f.subject_id);
                  setF({
                    ...f,
                    activity: a,
                    subject_id: stillValid ? f.subject_id : (matching[0]?.id ?? ""),
                  });
                }}
              >
                {activityOptions.map((a) => (
                  <option key={a} value={a}>
                    {t(a as "support")}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {/* Subject: hidden in cohort formation mode */}
          {!isCohort && (
            <Field label={t("subject")}>
              <select className={selectCls} value={f.subject_id} onChange={set("subject_id")} required>
                <option value="">—</option>
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {pick(s.name_ar, s.name_en)}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {/* Teacher */}
          <Field label={t("teacher")}>
            <select className={selectCls} value={f.teacher_id} onChange={set("teacher_id")}>
              <option value="">—</option>
              {teachers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </Field>

          {/* Room */}
          <Field label={t("room")}>
            <select className={selectCls} value={f.room_id} onChange={set("room_id")}>
              <option value="">—</option>
              {rooms.map((s) => (
                <option key={s.id} value={s.id}>
                  {pick(s.name_ar, s.name_en)}
                </option>
              ))}
            </select>
          </Field>

          {/* Age Group: hidden in cohort formation mode */}
          {!isCohort && (
            <Field label={t("ageGroup")}>
              <select
                className={selectCls}
                value={f.age_group}
                onChange={set("age_group")}
                required={f.activity !== "workshop"}
              >
                <option value="">{f.activity === "workshop" ? t("allAges") : t("pickAgeGroup")}</option>
                {AGE_GROUPS.map((a) => (
                  <option key={a.key} value={a.key}>
                    {t(ageGroupKey(a.key)!)}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {/* Capacity fixed to 15 */}
          <Field label={t("capacityFixed")}>
            <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm tabular text-muted-foreground">
              {GROUP_CAPACITY} {t("studentsUnit")}
            </div>
          </Field>

          {/* Level: only for levels + 17+, hidden in cohort formation mode */}
          {!isCohort && f.activity === "levels" && f.age_group === "17+" && (
            <Field label={t("level")}>
              <select className={selectCls} value={f.level_id} onChange={set("level_id")} required>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} · {money(l.price)} / {t("monthlyPlan")}
                    {l.package_price ? ` · ${money(l.package_price)} / ${t("fourMonthsPlan")}` : ""} ({l.sessions}{" "}
                    {t("sessions")})
                  </option>
                ))}
              </select>
            </Field>
          )}

          {/* Workshop specific fields */}
          {f.activity === "workshop" ? (
            <>
              <Field label={t("workshopDate")}>
                <Input type="date" value={f.workshop_date} onChange={set("workshop_date")} />
              </Field>
              <Field label={`${t("workshopPrice")} (${t("dzd")})`}>
                <Input
                  type="number"
                  min={0}
                  value={f.price}
                  onChange={set("price")}
                  placeholder={String((settings as any)?.workshop_price ?? 500)}
                />
              </Field>
              <Field label={`${t("teacherShare")} (${t("dzd")})`}>
                <Input
                  type="number"
                  min={0}
                  value={f.teacher_pct}
                  onChange={set("teacher_pct")}
                  placeholder={String((settings as any)?.workshop_teacher_amount ?? 300)}
                />
              </Field>
            </>
          ) : (
            <Field label={t("day")}>
              <select className={selectCls} value={f.day_of_week} onChange={set("day_of_week")}>
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {day(d)}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {/* Time: from and to */}
          <Field label={t("time")} className={isCohort && f.activity !== "workshop" ? "sm:col-span-2" : ""}>
            <div className="flex gap-2">
              <TimeField
                className="flex-1"
                value={f.start_time}
                onChange={(v) => setF({ ...f, start_time: v })}
                ariaLabel={t("from")}
              />
              <TimeField
                className="flex-1"
                value={f.end_time}
                onChange={(v) => setF({ ...f, end_time: v })}
                ariaLabel={t("to")}
              />
            </div>
          </Field>

          {/* Conflicts notice */}
          {conflicts.length > 0 && (
            <div role="alert" className="sm:col-span-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 space-y-1.5 text-xs text-destructive">
              <div className="flex items-center gap-1.5 font-bold text-sm">
                <AlertTriangle className="size-4 shrink-0 text-destructive" />
                <span>{t("conflictTitle")}</span>
              </div>
              <ul className="list-disc list-inside space-y-1 font-medium">
                {conflicts.map((c, i) => (
                  <li key={i}>{formatConflict(c)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer action buttons */}
          <div className="flex justify-end gap-2 sm:col-span-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="accent" disabled={conflicts.length > 0}>
              <Save /> {group ? t("saveChanges") : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

