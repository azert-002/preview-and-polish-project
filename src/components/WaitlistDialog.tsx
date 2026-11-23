import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Hourglass, Loader2, PartyPopper, Search, X } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { subjectHasActivity, useStudents, useSubjects, useWaitingList, useLevels, type Student } from "@/lib/data";
import { AGE_GROUPS, WAITLIST_READY, studentAgeGroup, waitlistKey } from "@/lib/business";
import { ageGroupKey } from "@/lib/labels";
import { searchStudents } from "@/lib/student-search";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, selectCls } from "@/components/common";

export interface WaitlistPreset {
  student?: Student;
  activity?: string;
  subject_id?: string | null;
  age_group?: string | null;
  level_id?: string | null;
  group_id?: string | null;
}

export function WaitlistDialog({
  open,
  onOpenChange,
  preset,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  preset?: WaitlistPreset;
  onDone?: () => void;
}) {
  const { t, pick } = useI18n();
  const qc = useQueryClient();
  const { data: students = [] } = useStudents();
  const { data: subjects = [] } = useSubjects();
  const { data: levels = [] } = useLevels();
  const { data: waiting = [] } = useWaitingList();
  const [student, setStudent] = useState<Student | null>(null);
  const [q, setQ] = useState("");
  const [activity, setActivity] = useState("support");
  const [subjectId, setSubjectId] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [levelId, setLevelId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const s = preset?.student ?? null;
    setStudent(s);
    setQ("");
    setActivity(preset?.activity ?? "support");
    setSubjectId(preset?.subject_id ?? "");
    setAgeGroup(preset?.age_group ?? studentAgeGroup(s) ?? "");
    setLevelId(preset?.level_id ?? "");
    setNote("");
    // Reset only when the dialog opens; the preset object may be recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Adult level choice always has a level: preselect the first one (e.g. A0) instead of an empty choice
  useEffect(() => {
    if (!open || activity !== "levels" || ageGroup !== "17+" || levelId) return;
    const first = levels[0];
    if (first) setLevelId(first.id);
  }, [open, activity, ageGroup, levelId, levels]);

  const results = useMemo(() => (student ? [] : searchStudents(students, q)), [students, q, student]);

  function choose(s: Student) {
    setStudent(s);
    if (!preset?.age_group) setAgeGroup(studentAgeGroup(s) ?? "");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!student) return;
    const row = {
      activity,
      subject_id: subjectId || null,
      age_group: ageGroup || null,
      level_id: activity === "levels" && ageGroup === "17+" ? levelId || null : null,
    };
    const key = waitlistKey(row);
    const same = waiting.filter((w) => waitlistKey(w) === key);
    if (same.some((w) => w.student_id === student.id)) {
      toast.warning(t("alreadyWaiting"));
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("waiting_list")
      .insert({ ...row, student_id: student.id, group_id: preset?.group_id ?? null, note: note.trim() || null });
    setBusy(false);
    if (error) {
      notifyError(error.message);
      return;
    }
    const count = same.length + 1;
    if (count >= WAITLIST_READY) {
      toast.success(t("groupReady"), {
        description: t("groupReadyMsg").replace("{n}", String(count)),
        icon: <PartyPopper className="size-5" />,
        duration: 8000,
      });
    } else {
      toast.success(t("waitingAdded"), {
        description: `${count}/${WAITLIST_READY} — ${t("stillNeeded").replace("{n}", String(WAITLIST_READY - count))}`,
      });
    }
    qc.invalidateQueries({ queryKey: ["waiting_list"] });
    onOpenChange(false);
    onDone?.();
  }

  const studentAg = ageGroupKey(studentAgeGroup(student));
  const subject = subjects.find((s) => s.id === subjectId);
  const activities = (["levels", "support", "workshop"] as const).filter((a) =>
    subjects.some((s) => subjectHasActivity(s, a)),
  );
  const activitySubjects = subjects.filter((s) => subjectHasActivity(s, activity));
  const availableActivitySubjects = activitySubjects.length > 0 ? activitySubjects : subjects;

  // Keep the chosen activity valid: default to the first activity that has subjects.
  useEffect(() => {
    if (open && activities.length > 0 && !activities.includes(activity as (typeof activities)[number])) {
      setActivity(activities[0]!);
      setSubjectId("");
    }
  }, [open, activities, activity]);

  function chooseActivity(a: string) {
    setActivity(a);
    const sub = subjects.find((s) => s.id === subjectId);
    if (sub && !subjectHasActivity(sub, a)) setSubjectId("");
  }
  void subject;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hourglass className="size-4 text-accent" /> {t("addToWaitingList")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Field label={t("student")}>
            {student ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-secondary px-3 py-2 text-sm">
                <span className="font-medium text-foreground">
                  {student.first_name} {student.last_name}
                  {studentAg && <span className="ms-2 text-muted-foreground">· {t(studentAg)}</span>}
                </span>
                {!preset?.student && (
                  <Button type="button" size="icon" variant="ghost" onClick={() => setStudent(null)} aria-label={t("cancel")}>
                    <X />
                  </Button>
                )}
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchStudent")} className="ps-9" />
                </div>
                {results.length > 0 && (
                  <ul className="mt-1 divide-y rounded-lg border">
                    {results.map((s) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => choose(s)} className="flex w-full justify-between px-3 py-2 text-start text-sm hover:bg-muted">
                          <span className="font-medium text-foreground">
                            {s.first_name} {s.last_name}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("activity")}>
              <select className={selectCls} value={activity} onChange={(e) => chooseActivity(e.target.value)}>
                {activities.map((a) => (
                  <option key={a} value={a}>
                    {t(a)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("subject")}>
              <select className={selectCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
                <option value="">—</option>
                {availableActivitySubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {pick(s.name_ar, s.name_en)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("ageGroup")} className="sm:col-span-2">
              <select
                className={selectCls}
                value={ageGroup}
                onChange={(e) => {
                  setAgeGroup(e.target.value);
                  if (e.target.value !== "17+") setLevelId("");
                }}
                required
              >
                <option value="">{t("pickAgeGroup")}</option>
                {AGE_GROUPS.map((g) => (
                  <option key={g.key} value={g.key}>
                    {t(ageGroupKey(g.key)!)}
                  </option>
                ))}
              </select>
            </Field>
            {activity === "levels" && ageGroup === "17+" && (
              <Field label={t("level")} className="sm:col-span-2">
                <select className={selectCls} value={levelId} onChange={(e) => setLevelId(e.target.value)} required>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={t("notes")} className="sm:col-span-2">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="accent" disabled={!student || busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Hourglass />} {t("addToWaitingList")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
