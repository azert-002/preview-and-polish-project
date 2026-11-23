import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Hourglass, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { fileToDataUrl, subjectHasActivity, useLevels, useStudents, useSubjects, type Student } from "@/lib/data";
import { findDuplicateStudent, hasLetters, isValidPhone } from "@/lib/duplicates";
import { confirmAction } from "@/lib/confirm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, selectCls } from "@/components/common";
import { AGE_GROUPS, studentAgeGroup } from "@/lib/business";
import { ageGroupKey } from "@/lib/labels";

export function StudentForm({
  initial,
  onSaved,
}: {
  initial?: Student;
  onSaved: (s: Student) => void;
}) {
  const { t, pick } = useI18n();
  const qc = useQueryClient();
  const { data: subjects = [] } = useSubjects();
  const { data: levels = [] } = useLevels();
  const { data: allStudents = [] } = useStudents();

  const [f, setF] = useState({
    first_name: initial?.first_name ?? "",
    last_name: initial?.last_name ?? "",
    age_group: studentAgeGroup(initial) ?? "",
    phone: initial?.phone ?? "",
    parent_phone: initial?.parent_phone ?? "",
    photo_url: initial?.photo_url ?? "",
    notes: initial?.notes ?? "",
    gender: (initial?.gender as "male" | "female" | undefined) ?? "male",
    activity: "levels",
    subject_id: "",
    level_id: "",
  });
  const [waitlistId, setWaitlistId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  // Adult level choice always has a level: preselect the first one (e.g. A0) instead of an empty choice
  useEffect(() => {
    if (f.age_group !== "17+" || f.activity !== "levels" || f.level_id) return;
    const first = levels[0];
    if (first) setF((prev) => ({ ...prev, level_id: first.id }));
  }, [f.age_group, f.activity, f.level_id, levels]);

  // Sync initial student info and fetch registration / waitlist / enrollment details when editing
  useEffect(() => {
    if (!initial) {
      setWaitlistId(null);
      setF({
        first_name: "",
        last_name: "",
        age_group: "",
        phone: "",
        parent_phone: "",
        photo_url: "",
        notes: "",
        gender: "male",
        activity: "levels",
        subject_id: "",
        level_id: "",
      });
      return;
    }

    setF({
      first_name: initial.first_name ?? "",
      last_name: initial.last_name ?? "",
      age_group: studentAgeGroup(initial) ?? "",
      phone: initial.phone ?? "",
      parent_phone: initial.parent_phone ?? "",
      photo_url: initial.photo_url ?? "",
      notes: initial.notes ?? "",
      gender: (initial.gender as "male" | "female" | undefined) ?? "male",
      activity: "levels",
      subject_id: "",
      level_id: "",
    });

    let cancelled = false;

    async function loadStudentRegistration() {
      // 1. Check waiting list for this student
      const { data: waitRows } = await supabase
        .from("waiting_list")
        .select("id, activity, subject_id, level_id, age_group")
        .eq("student_id", initial!.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (waitRows && waitRows.length > 0) {
        const w = waitRows[0];
        setWaitlistId(w.id);
        setF((prev) => ({
          ...prev,
          activity: w.activity || "levels",
          subject_id: w.subject_id || "",
          level_id: w.level_id || "",
        }));
        return;
      }

      // 2. If not on waiting list, check enrollments for student's group
      const { data: enrRows } = await supabase
        .from("enrollments")
        .select("id, group:groups(activity, subject_id, level_id)")
        .eq("student_id", initial!.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (enrRows && enrRows.length > 0) {
        const grp = (enrRows[0] as any)?.group;
        if (grp) {
          setF((prev) => ({
            ...prev,
            activity: grp.activity || "levels",
            subject_id: grp.subject_id || "",
            level_id: grp.level_id || "",
          }));
        }
      }
    }

    loadStudentRegistration();
    return () => {
      cancelled = true;
    };
  }, [initial]);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setF({ ...f, photo_url: await fileToDataUrl(file, 360) });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const first_name = f.first_name.trim().replace(/\s+/g, " ");
    const last_name = f.last_name.trim().replace(/\s+/g, " ");
    const problem = !first_name || !last_name
      ? t("vRequired").replace("{label}", !first_name ? t("firstName") : t("lastName"))
      : !hasLetters(first_name) || !hasLetters(last_name)
        ? t("vNameLetters")
        : !f.age_group
          ? t("vRequiredChoice").replace("{label}", t("ageGroup"))
          : !isValidPhone(f.phone) || !isValidPhone(f.parent_phone)
            ? t("vPhone")
            : null;
    if (problem) {
      toast.warning(t("vTitle"), { id: "form-validation", description: problem });
      return;
    }

    // Never register the same student twice
    const dup = findDuplicateStudent(
      { id: initial?.id ?? null, first_name, last_name, phone: f.phone, parent_phone: f.parent_phone },
      allStudents,
    );
    if (dup) {
      const fill = (k: "dupStudentMsg" | "dupStudentPossibleMsg") =>
        t(k).replace("{name}", `${dup.match.first_name} ${dup.match.last_name}`).replace("{code}", dup.match.code ?? "—");
      if (dup.kind === "same") {
        toast.error(t("dupStudentTitle"), { description: fill("dupStudentMsg"), duration: 8000 });
        return;
      }
      const ok = await confirmAction({
        title: t("dupStudentPossibleTitle"),
        message: fill("dupStudentPossibleMsg"),
        confirmLabel: t("dupStudentPossibleOk"),
        tone: "warning",
      });
      if (!ok) return;
    }

    setBusy(true);
    const payload = {
      first_name,
      last_name,
      gender: f.gender,
      age_group: f.age_group || null,
      photo_url: f.photo_url || null,
      phone: f.phone.trim() || null,
      parent_phone: f.parent_phone.trim() || null,
      notes: f.notes.trim() || null,
    };
    const res = initial
      ? await supabase.from("students").update(payload).eq("id", initial.id).select().single()
      : await supabase.from("students").insert(payload).select().single();

    if (res.error) {
      setBusy(false);
      notifyError(res.error.message);
      return;
    }

    if (f.activity && f.subject_id) {
      const waitlistRow = {
        student_id: res.data.id,
        activity: f.activity,
        subject_id: f.subject_id,
        age_group: f.age_group || null,
        level_id: f.age_group === "17+" && f.activity === "levels" ? f.level_id || null : null,
        note: f.notes?.trim() || null,
      };

      if (!initial) {
        const { error: wlErr } = await supabase.from("waiting_list").insert(waitlistRow);
        if (wlErr) {
          console.warn("[Waitlist] Auto-insert warning:", wlErr);
        }
      } else {
        if (waitlistId) {
          const { error: wlErr } = await supabase.from("waiting_list").update(waitlistRow).eq("id", waitlistId);
          if (wlErr) {
            console.warn("[Waitlist] Update warning:", wlErr);
          }
        } else {
          const { data: existingWait } = await supabase
            .from("waiting_list")
            .select("id")
            .eq("student_id", initial.id)
            .maybeSingle();

          if (existingWait) {
            await supabase.from("waiting_list").update(waitlistRow).eq("id", existingWait.id);
          } else {
            await supabase.from("waiting_list").insert(waitlistRow);
          }
        }
      }
      qc.invalidateQueries({ queryKey: ["waiting_list"] });
    }

    setBusy(false);
    toast.success(!initial ? t("studentAddedAndWaitlisted") : t("saved"));
    qc.invalidateQueries({ queryKey: ["students"] });
    onSaved(res.data);
  }

  const activitySubjects = subjects.filter((s) => subjectHasActivity(s, f.activity));
  const displaySubjects = useMemo(() => {
    const list = activitySubjects.length > 0 ? [...activitySubjects] : [...subjects];
    if (f.subject_id && !list.some((s) => s.id === f.subject_id)) {
      const extra = subjects.find((s) => s.id === f.subject_id);
      if (extra) list.push(extra);
    }
    return list;
  }, [subjects, activitySubjects, f.subject_id]);

  return (
    <form onSubmit={save} className="space-y-3.5" noValidate>
      {/* Top Identity Row: Photo + First Name + Last Name */}
      <div className="flex items-center gap-3">
        <label className="group relative flex size-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-input bg-muted/60 transition-all hover:border-accent hover:bg-accent/5">
          {f.photo_url ? (
            <img src={f.photo_url} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground group-hover:text-accent">
              <Camera className="size-5 transition-transform group-hover:scale-110" />
              <span className="text-[10px] font-medium leading-none mt-1">{t("photo")}</span>
            </div>
          )}
          <input type="file" accept="image/*" capture="user" className="hidden" onChange={onPhoto} />
        </label>
        <div className="grid grid-cols-2 gap-2.5 flex-1">
          <Field label={t("firstName")}>
            <Input required value={f.first_name} onChange={set("first_name")} className="h-9" />
          </Field>
          <Field label={t("lastName")}>
            <Input required value={f.last_name} onChange={set("last_name")} className="h-9" />
          </Field>
        </div>
      </div>

      {/* Row 2: Gender + Age Group */}
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={t("gender")}>
          <div className="flex h-9 rounded-lg border border-input bg-muted/40 p-0.5">
            {(["male", "female"] as const).map((g) => (
              <button
                key={g}
                type="button"
                className={cn(
                  "flex-1 rounded-md text-xs font-medium transition-all",
                  f.gender === g
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                )}
                onClick={() => setF({ ...f, gender: g })}
              >
                {t(g)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("ageGroup")}>
          <select
            required
            className={selectCls}
            value={f.age_group}
            onChange={(e) =>
              setF({
                ...f,
                age_group: e.target.value,
                level_id: e.target.value === "17+" ? f.level_id : "",
              })
            }
          >
            <option value="">{t("pickAgeGroup")}</option>
            {AGE_GROUPS.map((g) => (
              <option key={g.key} value={g.key}>
                {t(ageGroupKey(g.key)!)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Row 3: Phones */}
      <div className="grid grid-cols-2 gap-2.5">
        <Field label={t("studentPhone")}>
          <Input dir="ltr" value={f.phone} onChange={set("phone")} className="h-9 font-mono text-xs" />
        </Field>
        <Field label={`${t("parentPhone")} (${t("emergency")})`}>
          <Input dir="ltr" value={f.parent_phone} onChange={set("parent_phone")} className="h-9 font-mono text-xs" />
        </Field>
      </div>

      {/* Row 4: Waitlist / Registration Details (Shown for both adding and editing) */}
      <div className="rounded-xl border border-accent/25 bg-accent/5 p-3 space-y-2.5">
        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Hourglass className="size-3.5 text-accent" />
          <span>{t("waitlistInfo")}</span>
        </div>
        <div
          className={cn(
            "grid gap-2.5",
            f.age_group === "17+" && f.activity === "levels" ? "grid-cols-3" : "grid-cols-2",
          )}
        >
          <Field label={t("activity")}>
            <select
              className={selectCls}
              value={f.activity}
              onChange={(e) => {
                const act = e.target.value;
                const matching = subjects.filter((s) => subjectHasActivity(s, act));
                setF({
                  ...f,
                  activity: act,
                  subject_id: matching.some((s) => s.id === f.subject_id) ? f.subject_id : (matching[0]?.id ?? ""),
                  level_id: act === "levels" ? f.level_id : "",
                });
              }}
              required
            >
              <option value="levels">{t("levels")}</option>
              <option value="support">{t("support")}</option>
              <option value="workshop">{t("workshop")}</option>
            </select>
          </Field>
          <Field label={t("subject")}>
            <select
              className={selectCls}
              value={f.subject_id}
              onChange={(e) => setF({ ...f, subject_id: e.target.value })}
              required
            >
              <option value="">— {t("pickSubject")} —</option>
              {displaySubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {pick(s.name_ar, s.name_en)}
                </option>
              ))}
            </select>
          </Field>
          {f.age_group === "17+" && f.activity === "levels" && (
            <Field label={t("level")}>
              <select
                className={selectCls}
                value={f.level_id}
                onChange={(e) => setF({ ...f, level_id: e.target.value })}
                required
              >
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </div>

      {/* Row 5: Notes */}
      <Field label={t("notes")}>
        <Input value={f.notes} onChange={set("notes")} placeholder={t("notes") + "..."} className="h-9 text-xs" />
      </Field>

      {/* Submit Action */}
      <div className="flex justify-end pt-1">
        <Button type="submit" variant="accent" disabled={busy} className="h-9 px-6 font-medium">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {t("save")}
        </Button>
      </div>
    </form>
  );
}
