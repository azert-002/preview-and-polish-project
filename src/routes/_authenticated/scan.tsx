import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CornerDownLeft, ScanLine, XCircle, Info, Search, UserCheck, GraduationCap, Hourglass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { unwrap, isToday, useEnrollments, useGroups, usePayments, useStudents, useTeachers, type EnrollmentFull, type GroupFull, type Student, type Teacher } from "@/lib/data";
import { searchStudents } from "@/lib/student-search";
import { remainingSessions, studentLedger } from "@/lib/business";
import { beep } from "@/lib/beep";
import { groupLabel } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { PageHeader, SessionBar } from "@/components/common";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({
    meta: [
      { title: "Scan Station — Beyond Words" },
      { name: "description", content: "Barcode attendance." },
      { property: "og:title", content: "Scan Station — Beyond Words" },
      { property: "og:description", content: "Barcode attendance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ]
  }),
  component: ScanStation,
});

type Result =
  | { kind: "notfound"; code: string }
  | { kind: "choose"; student: Student; options: EnrollmentFull[] }
  | { kind: "ok" | "last" | "empty" | "already" | "waiting"; student: Student; enrollment?: EnrollmentFull; left: number }
  | { kind: "teacher"; teacher: Teacher; status: "ok" | "already" | "nogroups" | "choose"; group?: GroupFull; options?: GroupFull[] };

const GROUP_SELECT = "*, subject:subjects(*), teacher:teachers(*), room:rooms(*), level:levels(*)";

function ScanStation() {
  const { t, tg, pick, money } = useI18n();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResultState] = useState<Result | null>(null);
  const [scanId, setScanId] = useState(0);
  const [active, setActive] = useState(-1);
  const { data: students = [] } = useStudents();
  const { data: allEnrollments = [] } = useEnrollments();
  const { data: allPayments = [] } = usePayments();
  const { data: teachers = [] } = useTeachers();
  const { data: groups = [] } = useGroups();
  const setResult = (r: Result) => {
    setResultState(r);
    setScanId((n) => n + 1);
  };

  useEffect(() => {
    inputRef.current?.focus();
    const refocus = () => setTimeout(() => {
      if (document.querySelector("[role=dialog]")) return;
      inputRef.current?.focus();
    }, 50);
    window.addEventListener("click", refocus);
    return () => window.removeEventListener("click", refocus);
  }, []);

  const studentMatches = searchStudents(students, query);
  const teacherMatches = searchStudents(teachers.map((x) => ({ ...x, parent_phone: null })), query, 4);
  // Teachers first (green rows), then students; one list for keyboard navigation.
  type Item = { kind: "teacher"; teacher: Teacher } | { kind: "student"; student: Student };
  const matches: Item[] = [
    ...teacherMatches.map((x) => ({ kind: "teacher" as const, teacher: x as Teacher })),
    ...studentMatches.map((x) => ({ kind: "student" as const, student: x })),
  ];
  const checkIn = (it: Item) => (it.kind === "teacher" ? checkInTeacher(it.teacher) : checkInStudent(it.student));
  const showList = query.trim().length >= 2;

  async function mark(student: Student, e: EnrollmentFull, all: EnrollmentFull[]) {
    const { data: today } = await supabase
      .from("attendance")
      .select("id, created_at")
      .eq("student_id", student.id)
      .eq("group_id", e.group_id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (today?.[0] && isToday(today[0].created_at)) {
      beep("warn");
      const left = all.filter((x) => x.group_id === e.group_id).reduce((s, x) => s + remainingSessions(x), 0);
      setResult({ kind: "already", student, enrollment: e, left });
      return;
    }
    const { data: row, error } = await supabase
      .from("attendance")
      .insert({ enrollment_id: e.id, student_id: student.id, group_id: e.group_id, status: "present" })
      .select("counted")
      .single();
    if (error) {
      beep("error");
      setResult({ kind: "empty", student, enrollment: e, left: 0 });
      return;
    }
    if (!row.counted) {
      // Teacher not checked in yet: attendance kept, session deducted when the teacher arrives.
      beep("warn");
      const left = all.filter((x) => x.group_id === e.group_id).reduce((s, x) => s + remainingSessions(x), 0);
      setResult({ kind: "waiting", student, enrollment: e, left });
      qc.invalidateQueries();
      return;
    }
    const left = all.filter((x) => x.group_id === e.group_id).reduce((s, x) => s + remainingSessions(x), 0) - 1;
    const updated = { ...e, sessions_used: e.sessions_used + 1 };
    if (left <= 0) {
      beep("warn");
      setResult({ kind: "last", student, enrollment: updated, left: 0 });
    } else {
      beep("ok");
      setResult({ kind: "ok", student, enrollment: updated, left });
    }
    qc.invalidateQueries();
  }

  async function markTeacher(teacher: Teacher, g: GroupFull) {
    const { data: prev } = await supabase
      .from("teacher_attendance")
      .select("id, created_at")
      .eq("group_id", g.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (prev?.[0] && isToday(prev[0].created_at)) {
      beep("warn");
      setResult({ kind: "teacher", teacher, status: "already", group: g });
      return;
    }
    const { error } = await supabase.from("teacher_attendance").insert({ teacher_id: teacher.id, group_id: g.id });
    if (error) {
      beep("error");
      setResult({ kind: "teacher", teacher, status: "nogroups" });
      return;
    }
    beep("ok");
    setResult({ kind: "teacher", teacher, status: "ok", group: g });
    qc.invalidateQueries();
  }

  /** Teacher card: their active groups; prefer the ones scheduled today. */
  async function checkInTeacher(teacher: Teacher) {
    const mine = groups.filter((g) => g.teacher_id === teacher.id && g.active !== false);
    const todayStr = new Date().toLocaleDateString("en-CA");
    const today = mine.filter((g) => (g.activity === "workshop" ? g.workshop_date === todayStr : g.day_of_week === new Date().getDay()));
    const options = today.length ? today : mine;
    if (options.length === 0) {
      beep("error");
      setResult({ kind: "teacher", teacher, status: "nogroups" });
    } else if (options.length === 1) {
      await markTeacher(teacher, options[0]!);
    } else {
      beep("ok");
      setResult({ kind: "teacher", teacher, status: "choose", options });
    }
  }

  // Ref guard (state updates are async): a fast double scan must not check in twice.
  const running = useRef(false);
  async function run(fn: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setQuery("");
    setActive(-1);
    setBusy(true);
    try {
      await fn();
    } finally {
      running.current = false;
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  /** Enter: highlighted result → exact card code → single name match. */
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const raw = query.trim();
    if (!raw || busy) return;
    const highlighted = active >= 0 ? matches[active] : undefined;
    if (highlighted) return run(() => checkIn(highlighted));
    const value = raw.toUpperCase();
    const teacher = teachers.find((x) => x.code?.toUpperCase() === value);
    if (teacher) return run(() => checkInTeacher(teacher));
    const byCode = students.find((s) => s.code?.toUpperCase() === value);
    if (byCode) return run(() => checkInStudent(byCode));
    if (matches.length === 1) return run(() => checkIn(matches[0]!));
    if (matches.length > 1) {
      beep("warn");
      setActive(0);
      return;
    }
    await run(async () => {
      const { data: student } = await supabase.from("students").select("*").eq("code", value).maybeSingle();
      if (!student) {
        beep("error");
        setResult({ kind: "notfound", code: raw });
        return;
      }
      await checkInStudent(student);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setQuery("");
      setActive(-1);
    } else if (e.key === "ArrowDown" && matches.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp" && matches.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
    }
  }

  async function checkInStudent(student: Student) {
    {
      const all = unwrap(
        await supabase
          .from("enrollments")
          .select(`*, group:groups(${GROUP_SELECT})`)
          .eq("student_id", student.id)
          .order("created_at"),
      ) as unknown as EnrollmentFull[];
      const active = all.filter((x) => remainingSessions(x) > 0);
      // oldest active block per group
      const perGroup = new Map<string, EnrollmentFull>();
      for (const x of active) if (!perGroup.has(x.group_id)) perGroup.set(x.group_id, x);
      const options = [...perGroup.values()];
      if (options.length === 0) {
        beep("error");
        setResult({ kind: "empty", student, left: 0 });
      } else if (options.length === 1) {
        await mark(student, options[0]!, all);
      } else {
        beep("ok");
        setResult({ kind: "choose", student, options });
      }
    }
  }

  const tone =
    result?.kind === "ok" || (result?.kind === "teacher" && result.status === "ok")
      ? "border-success bg-success/10"
      : result?.kind === "last" || result?.kind === "already"
        ? "border-warning bg-warning/15"
        : result?.kind === "waiting" || (result?.kind === "teacher" && result.status === "already")
          ? "border-warning bg-warning/15"
          : result?.kind === "empty" || result?.kind === "notfound" || (result?.kind === "teacher" && result.status === "nogroups")
            ? "border-destructive bg-destructive/10"
            : "border-border bg-card";

  const student = result && result.kind !== "notfound" && result.kind !== "teacher" ? result.student : null;
  const studentDebt = student
    ? studentLedger(
      allEnrollments.filter((e) => e.student_id === student.id),
      allPayments.filter((p) => p.student_id === student.id),
    ).debt
    : 0;

  return (
    <div>
      <PageHeader title={t("scan")} subtitle={t("scanHint")} />
      <form onSubmit={submit} className="rounded-2xl bg-ink-gradient p-6 shadow-card md:p-8">
        <label htmlFor="scan-input" className="mb-3 flex items-center gap-2 text-lg font-semibold text-ink-foreground">
          <ScanLine className="size-6 text-saffron" /> {t("scanTitle")}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute start-5 top-1/2 z-10 size-6 -translate-y-1/2 text-muted-foreground" />
          <input
            id="scan-input"
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
            placeholder={t("scanOrSearchPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            readOnly={busy}
            role="combobox"
            aria-expanded={showList}
            aria-controls="scan-results"
            aria-activedescendant={active >= 0 ? `scan-opt-${active}` : undefined}
            className="h-16 w-full rounded-2xl border-2 border-transparent bg-card pe-28 ps-14 text-lg text-foreground shadow-card outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground focus:border-saffron focus:ring-4 focus:ring-saffron/25 md:text-xl"
          />
          <kbd
            className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 items-center gap-1 rounded-md border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
          >
            <span dir="ltr" className="inline-flex items-center gap-1">
              Enter <CornerDownLeft className="size-3" />
            </span>
          </kbd>

          {showList && (
            <ul
              id="scan-results"
              role="listbox"
              className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 divide-y overflow-auto rounded-2xl border bg-card shadow-card animate-in fade-in-0 slide-in-from-top-2 duration-200"
            >
              {matches.length === 0 ? (
                <li className="p-4 text-sm text-muted-foreground">{t("noMatches")}</li>
              ) : (
                matches.map((it, i) => {
                  const isT = it.kind === "teacher";
                  const p = isT ? it.teacher : it.student;
                  const photo = isT ? null : it.student.photo_url;
                  return (
                    <li key={p.id} id={`scan-opt-${i}`} role="option" aria-selected={i === active}>
                      <button
                        type="button"
                        disabled={busy}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => run(() => checkIn(it))}
                        className={cn(
                          "flex w-full items-center gap-3 p-3 text-start transition-colors disabled:opacity-50",
                          isT ? (i === active ? "bg-success/25" : "bg-success/10 hover:bg-success/20") : i === active ? "bg-muted" : "hover:bg-muted",
                        )}
                      >
                        <div className={cn("size-10 shrink-0 overflow-hidden rounded-full", isT ? "bg-success/20 text-success" : "bg-muted")}>
                          {photo ? (
                            <img src={photo} alt="" className="size-full object-cover" />
                          ) : isT ? (
                            <div className="flex size-full items-center justify-center"><GraduationCap className="size-5" /></div>
                          ) : (
                            <div className="flex size-full items-center justify-center font-bold text-muted-foreground">
                              {p.first_name[0]}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">
                            {isT && <span className="text-success">{tg("teacher", it.teacher.gender)}: </span>}
                            {isT ? `${p.last_name} ${p.first_name}` : `${p.first_name} ${p.last_name}`}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground" dir="ltr">
                            {p.code} {p.phone ? `· ${p.phone}` : ""}
                          </div>
                        </div>
                        <span className={cn("flex items-center gap-1 text-sm font-medium", isT ? "text-success" : "text-primary")}>
                          <UserCheck className="size-4" /> {t("checkIn")}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>
        <p className="mt-3 text-xs text-ink-muted">{t("scanAnother")}</p>
      </form>

      {result && (
        <div key={scanId} className={cn("animate-flash-in mt-6 rounded-2xl border-2 p-6", tone)}>
          {result.kind === "teacher" ? (
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="flex size-32 shrink-0 items-center justify-center rounded-2xl border-4 border-card bg-primary/10 text-primary shadow-card">
                <GraduationCap className="size-14" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-sm text-muted-foreground">{result.teacher.code}</div>
                <div className="text-3xl font-bold text-foreground">
                  {tg("teacher", result.teacher.gender)}: {result.teacher.full_name}
                </div>
                {result.group && <div className="mt-1 text-muted-foreground">{groupLabel(result.group, pick)}</div>}
                {result.status === "choose" ? (
                  <div className="mt-4">
                    <p className="mb-2 text-sm text-foreground">{tg("teacherChooseGroup", result.teacher.gender)}</p>
                    <div className="flex flex-wrap gap-2">
                      {result.options!.map((g) => (
                        <Button key={g.id} variant="outline" onClick={() => run(() => markTeacher(result.teacher, g))}>
                          {groupLabel(g, pick)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "mt-4 flex items-center gap-2 text-lg font-semibold",
                      result.status === "ok" && "text-success",
                      result.status === "already" && "text-warning",
                      result.status === "nogroups" && "text-destructive",
                    )}
                  >
                    {result.status === "ok" && <CheckCircle2 className="size-6" />}
                    {result.status === "already" && <Info className="size-6" />}
                    {result.status === "nogroups" && <XCircle className="size-6" />}
                    {result.status === "ok" && tg("teacherCheckedIn", result.teacher.gender)}
                    {result.status === "already" && tg("teacherAlreadyToday", result.teacher.gender)}
                    {result.status === "nogroups" && tg("teacherNoGroups", result.teacher.gender)}
                  </div>
                )}
              </div>
            </div>
          ) : result.kind === "notfound" ? (
            <div className="flex items-center gap-3 text-lg font-semibold text-destructive">
              <XCircle className="size-8" /> {t("studentNotFound")} <span className="font-mono">{result.code}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="size-32 shrink-0 overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-card">
                {student?.photo_url ? (
                  <img src={student.photo_url} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-4xl font-bold text-muted-foreground">
                    {student?.first_name[0]}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-sm text-muted-foreground">{student?.code}</div>
                <div className="text-3xl font-bold text-foreground">
                  {student?.first_name} {student?.last_name}
                </div>
                {"enrollment" in result && result.enrollment && (
                  <div className="mt-1 text-muted-foreground">
                    {groupLabel(result.enrollment.group, pick)} · {tg("teacher", result.enrollment.group?.teacher?.gender)}: {result.enrollment.group?.teacher?.full_name ?? "—"}
                  </div>
                )}
                {studentDebt > 0 && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-sm font-semibold text-destructive">
                    <AlertTriangle className="size-4" /> {t("hasDebtAlert")}: <span className="tabular">{money(studentDebt)}</span>
                  </div>
                )}

                {result.kind === "choose" ? (
                  <div className="mt-4">
                    <p className="mb-2 text-sm text-foreground">{t("chooseGroup")}</p>
                    <div className="flex flex-wrap gap-2">
                      {result.options.map((o) => (
                        <Button key={o.id} variant="outline" onClick={() => run(() => mark(result.student, o, result.options))}>
                          {groupLabel(o.group, pick)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    <div
                      className={cn(
                        "flex items-center gap-2 text-lg font-semibold",
                        result.kind === "ok" && "text-success",
                        (result.kind === "last" || result.kind === "already" || result.kind === "waiting") && "text-warning",
                        result.kind === "empty" && "text-destructive",
                      )}
                    >
                      {result.kind === "ok" && <CheckCircle2 className="size-6" />}
                      {result.kind === "last" && <AlertTriangle className="size-6" />}
                      {result.kind === "already" && <Info className="size-6" />}
                      {result.kind === "waiting" && <Hourglass className="size-6" />}
                      {result.kind === "empty" && <XCircle className="size-6" />}
                      {result.kind === "ok" && t("checkedIn")}
                      {result.kind === "last" && t("lastSession")}
                      {result.kind === "already" && t("alreadyToday")}
                      {result.kind === "waiting" && tg("waitingTeacher", result.enrollment?.group?.teacher?.gender)}
                      {result.kind === "empty" && t("packageEmpty")}
                    </div>
                    {result.enrollment && (
                      <SessionBar used={result.enrollment.sessions_used} total={result.enrollment.sessions_total} />
                    )}
                    <span className="text-sm text-muted-foreground">
                      {t("sessionsLeft")}: <b className="tabular text-foreground">{result.left}</b>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
