import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock, DoorOpen, GraduationCap, Hourglass, Radio, UserCheck, UserX, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { isToday, useAttendance, useEnrollments, useGroups, useTeacherAttendance, useTeachers, type GroupFull } from "@/lib/data";
import { groupStudentIds } from "@/lib/business";
import {
  WEEK_ORDER,
  currentSessions,
  dateInWeek,
  hhmm,
  localISO,
  nextSessions,
  splitDuration,
  toMinutes,
  type LiveSession,
} from "@/lib/schedule";
import { Empty, PageHeader, Panel, Pill, selectCls } from "@/components/common";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/timetable")({
  head: () => ({
    meta: [
      { title: "Timetable — Beyond Words" },
      { name: "description", content: "Weekly timetable per teacher with live session countdowns and attendance." },
      { property: "og:title", content: "Timetable — Beyond Words" },
      { property: "og:description", content: "Weekly timetable per teacher with live session countdowns and attendance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TimetablePage,
});

function useNow(stepMs: number) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), stepMs);
    return () => window.clearInterval(id);
  }, [stepMs]);
  return now;
}

const SUBJECT_TONES = ["border-s-chart-1", "border-s-chart-2", "border-s-chart-3", "border-s-chart-4", "border-s-chart-5"];

function TimetablePage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: groups = [] } = useGroups();
  const { data: teachers = [] } = useTeachers();
  const { data: enrollments = [] } = useEnrollments();
  const { data: attendance = [] } = useAttendance(1);
  const { data: teacherAttendance = [] } = useTeacherAttendance(1);
  const [teacherId, setTeacherId] = useState("");

  // Keep attendance counts fresh while the page stays open.
  useEffect(() => {
    const id = window.setInterval(() => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["teacher_attendance"] });
    }, 20000);
    return () => window.clearInterval(id);
  }, [qc]);

  const shown = useMemo(
    () => groups.filter((g) => g.active && (!teacherId || g.teacher_id === teacherId)),
    [groups, teacherId],
  );

  const stats = useMemo(() => {
    const presentByGroup = new Map<string, number>();
    for (const a of attendance) {
      if (a.status === "present" && isToday(a.created_at)) presentByGroup.set(a.group_id, (presentByGroup.get(a.group_id) ?? 0) + 1);
    }
    const studentsByGroup = new Map<string, Set<string>>();
    for (const g of groups) {
      studentsByGroup.set(g.id, groupStudentIds(g.activity, enrollments.filter((e) => e.group_id === g.id)));
    }
    for (const a of attendance) {
      if (!isToday(a.created_at)) continue;
      const set = studentsByGroup.get(a.group_id) ?? new Set<string>();
      set.add(a.student_id);
      studentsByGroup.set(a.group_id, set);
    }
    const teacherIn = new Set(teacherAttendance.filter((r) => isToday(r.created_at)).map((r) => r.group_id));
    return {
      present: (id: string) => presentByGroup.get(id) ?? 0,
      enrolled: (id: string) => studentsByGroup.get(id)?.size ?? 0,
      teacherIn: (id: string) => teacherIn.has(id),
    };
  }, [attendance, enrollments, teacherAttendance, groups]);

  const teacher = teachers.find((x) => x.id === teacherId);

  return (
    <div>
      <PageHeader
        title={t("timetable")}
        subtitle={t("timetableSubtitle")}
        actions={
          <select
            aria-label={t("pickTeacher")}
            className={cn(selectCls, "h-10 min-w-56 font-medium")}
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
          >
            <option value="">{t("allTeachers")}</option>
            {teachers
              .filter((x) => x.active)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.full_name}
                </option>
              ))}
          </select>
        }
      />

      <LiveSection groups={shown} stats={stats} showTeacher={!teacherId} />

      {teacher && <TeacherSummary name={teacher.full_name} groups={shown} />}

      <WeeklyGrid groups={shown} showTeacher={!teacherId} />
    </div>
  );
}

type Stats = { present: (id: string) => number; enrolled: (id: string) => number; teacherIn: (id: string) => boolean };

function LiveSection({ groups, stats, showTeacher }: { groups: GroupFull[]; stats: Stats; showTeacher: boolean }) {
  const { t } = useI18n();
  const now = useNow(1000);
  if (!now) return <div className="h-72 animate-pulse rounded-2xl bg-muted" />;
  const current = currentSessions(groups, now);
  const next = nextSessions(groups, now);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <section className="lg:col-span-3">
        <SectionTitle icon={Radio} label={t("currentSessions")} count={current.length} />
        {current.length === 0 ? (
          <div className="flex h-[calc(100%-2.5rem)] min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card text-sm text-muted-foreground">
            <Clock className="size-8 opacity-40" />
            {t("noCurrentSessions")}
          </div>
        ) : (
          <div className="space-y-4">
            {current.map((s) => (
              <LiveCard key={s.group.id} session={s} now={now} stats={stats} showTeacher={showTeacher} mode="current" />
            ))}
          </div>
        )}
      </section>
      <section className="lg:col-span-2">
        <SectionTitle icon={Hourglass} label={t("nextSession")} count={next.length} />
        {next.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card text-sm text-muted-foreground">
            <CalendarClock className="size-8 opacity-40" />
            {t("noUpcomingSessions")}
          </div>
        ) : (
          <div className="space-y-4">
            {next.map((s) => (
              <LiveCard key={s.group.id} session={s} now={now} stats={stats} showTeacher={showTeacher} mode="next" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ icon: Icon, label, count }: { icon: typeof Radio; label: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="size-5 text-primary" />
      <h2 className="text-lg font-bold text-foreground">{label}</h2>
      {count > 0 && <Pill tone="accent">{count}</Pill>}
    </div>
  );
}

function LiveCard({
  session,
  now,
  stats,
  showTeacher,
  mode,
}: {
  session: LiveSession<GroupFull>;
  now: Date;
  stats: Stats;
  showTeacher: boolean;
  mode: "current" | "next";
}) {
  const { t, tg, pick, day } = useI18n();
  const g = session.group;
  const live = mode === "current";
  const ms = live ? session.end.getTime() - now.getTime() : session.start.getTime() - now.getTime();
  const duration = Math.max(1, session.end.getTime() - session.start.getTime());
  // Current: ring empties as the session runs out. Next: ring fills during the last hour before it starts.
  const progress = live ? ms / duration : 1 - Math.min(1, ms / 3_600_000);
  const tone = live && ms < 60_000 ? "danger" : live && ms < 5 * 60_000 ? "warning" : "ok";
  const sameDay = localISO(session.start) === localISO(now);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const dayLabel = sameDay ? t("todayLabel") : localISO(session.start) === localISO(tomorrow) ? t("tomorrowLabel") : day(session.start.getDay());
  const present = sameDay ? stats.present(g.id) : 0;
  const enrolled = stats.enrolled(g.id);
  const teacherIn = sameDay && stats.teacherIn(g.id);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl p-5 shadow-card",
        live ? "bg-ink-gradient text-ink-foreground" : "border-2 border-accent/60 bg-card text-card-foreground",
      )}
    >
      <div className={cn("flex flex-col gap-5", live && "sm:flex-row sm:items-center")}>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {live ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-saffron/20 px-3 py-1 text-xs font-bold text-saffron">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-saffron opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-saffron" />
                </span>
                {t("liveNow")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/25 px-3 py-1 text-xs font-bold text-foreground">
                <CalendarClock className="size-3.5" /> {dayLabel}
              </span>
            )}
            <span className={cn("tabular text-sm font-semibold", live ? "text-ink-muted" : "text-muted-foreground")}>
              {hhmm(g.start_time)} – {hhmm(g.end_time)}
            </span>
          </div>

          <div>
            <h3 className="truncate text-2xl font-black">{g.name}</h3>
            <p className={cn("truncate text-sm", live ? "text-ink-muted" : "text-muted-foreground")}>
              {g.subject ? pick(g.subject.name_ar, g.subject.name_en) : "—"}
              {g.level ? ` · ${g.level.code}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <Chip live={live} icon={DoorOpen}>
              {t("room")}: <b>{g.room ? pick(g.room.name_ar, g.room.name_en) : "—"}</b>
            </Chip>
            {showTeacher && g.teacher && (
              <Chip live={live} icon={GraduationCap}>
                {g.teacher.full_name}
              </Chip>
            )}
          </div>

          <div className={cn("rounded-xl p-3", live ? "bg-ink-foreground/10" : "bg-muted")}>
            <div className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Users className="size-4" /> {sameDay ? t("attendeesRegistered") : t("groupStudents")}
              </span>
              <span className="tabular text-lg font-black">
                {sameDay ? (
                  <>
                    {present}
                    <span className={cn("text-sm font-semibold", live ? "text-ink-muted" : "text-muted-foreground")}> / {enrolled}</span>
                  </>
                ) : (
                  enrolled
                )}
              </span>
            </div>
            {sameDay && (
              <div className={cn("h-2 overflow-hidden rounded-full", live ? "bg-ink-foreground/15" : "bg-background")}>
                <div
                  className="h-full rounded-full bg-success transition-[width] duration-700"
                  style={{ width: `${enrolled ? Math.min(100, (present / enrolled) * 100) : 0}%` }}
                />
              </div>
            )}
            {sameDay && (live || present > 0 || teacherIn) && (
              <div className={cn("mt-2 flex items-center gap-1.5 text-xs font-medium", teacherIn ? "text-success" : live ? "text-saffron" : "text-warning")}>
                {teacherIn ? <UserCheck className="size-3.5" /> : <UserX className="size-3.5" />}
                {tg(teacherIn ? "teacherPresent" : "teacherNotCheckedIn", g.teacher?.gender)}
              </div>
            )}
          </div>
        </div>

        <CountdownRing ms={ms} progress={progress} tone={tone} live={live} label={live ? t("timeLeft") : t("startsIn")} />
      </div>
    </article>
  );
}

function Chip({ live, icon: Icon, children }: { live: boolean; icon: typeof DoorOpen; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1", live ? "bg-ink-foreground/10" : "bg-secondary text-secondary-foreground")}>
      <Icon className="size-4 opacity-80" />
      <span>{children}</span>
    </span>
  );
}

function CountdownRing({
  ms,
  progress,
  tone,
  live,
  label,
}: {
  ms: number;
  progress: number;
  tone: "ok" | "warning" | "danger";
  live: boolean;
  label: string;
}) {
  const { t } = useI18n();
  const { h, m, s } = splitDuration(ms);
  const size = 168;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  const ringColor = tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning" : live ? "text-saffron" : "text-accent";
  const unit = (n: number, u: string) => (
    <span className="flex flex-col items-center">
      <span className="tabular text-2xl font-black leading-none">{String(n).padStart(2, "0")}</span>
      <span className={cn("mt-1 text-[10px] font-semibold uppercase", live ? "text-ink-muted" : "text-muted-foreground")}>{u}</span>
    </span>
  );
  return (
    <div className="relative mx-auto shrink-0" style={{ width: size, height: size }} role="timer" aria-label={`${label} ${h}:${m}:${s}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={live ? "stroke-ink-foreground/15" : "stroke-muted"} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          className={cn(ringColor, "transition-[stroke-dashoffset] duration-1000 ease-linear", tone === "danger" && "animate-pulse")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" dir="ltr">
        <span className={cn("mb-1.5 text-[11px] font-bold", live ? "text-ink-muted" : "text-muted-foreground")}>{label}</span>
        <div className="flex items-start gap-1">
          {unit(h, t("hoursShort"))}
          <span className="tabular text-2xl font-black leading-none opacity-50">:</span>
          {unit(m, t("minutesShort"))}
          <span className="tabular text-2xl font-black leading-none opacity-50">:</span>
          {unit(s, t("secondsShort"))}
        </div>
      </div>
    </div>
  );
}

function TeacherSummary({ name, groups }: { name: string; groups: GroupFull[] }) {
  const { t } = useI18n();
  const weekly = groups.filter((g) => g.activity !== "workshop" && g.day_of_week != null);
  const minutes = weekly.reduce((sum, g) => {
    const s = toMinutes(g.start_time);
    const e = toMinutes(g.end_time);
    return s != null && e != null && e > s ? sum + (e - s) : sum;
  }, 0);
  const hours = Math.round((minutes / 60) * 10) / 10;
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card px-5 py-4 shadow-card">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <GraduationCap className="size-6" />
        </div>
        <div className="text-lg font-bold text-foreground">{name}</div>
      </div>
      <div className="text-sm text-muted-foreground">
        <b className="tabular text-xl text-foreground">{weekly.length}</b> {t("sessionsPerWeek")}
      </div>
      <div className="text-sm text-muted-foreground">
        <b className="tabular text-xl text-foreground">{hours}</b> {t("hoursPerWeek")}
      </div>
    </div>
  );
}

function WeeklyGrid({ groups, showTeacher }: { groups: GroupFull[]; showTeacher: boolean }) {
  const { t, pick, day, fmtDate } = useI18n();
  const now = useNow(30000);
  const subjectTone = useMemo(() => {
    const ids = [...new Set(groups.map((g) => g.subject_id ?? ""))];
    return (id: string | null) => SUBJECT_TONES[ids.indexOf(id ?? "") % SUBJECT_TONES.length];
  }, [groups]);
  if (!now) return null;
  const live = new Set(currentSessions(groups, now).map((s) => s.group.id));

  return (
    <Panel title={t("weeklyTimetable")} className="mt-8">
      {groups.length === 0 ? (
        <Empty>{t("none")}</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {WEEK_ORDER.map((wd) => {
            const date = dateInWeek(now, wd);
            const iso = localISO(date);
            const isTodayCol = iso === localISO(now);
            const items = groups
              .filter((g) => (g.activity === "workshop" ? g.workshop_date === iso : g.day_of_week === wd))
              .sort((a, b) => (toMinutes(a.start_time) ?? 9999) - (toMinutes(b.start_time) ?? 9999));
            return (
              <div key={wd} className={cn("flex min-w-0 flex-col rounded-xl", isTodayCol ? "bg-accent/10 ring-2 ring-accent" : "bg-muted/60")}>
                <div className={cn("rounded-t-xl px-3 py-2 text-center", isTodayCol ? "bg-primary text-primary-foreground" : "text-foreground")}>
                  <div className="text-sm font-bold">{day(wd)}</div>
                  <div className={cn("tabular text-[11px]", isTodayCol ? "opacity-80" : "text-muted-foreground")}>{fmtDate(date)}</div>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {items.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground/70">{t("noSessionsDay")}</div>
                  ) : (
                    items.map((g) => {
                      const isLive = isTodayCol && live.has(g.id);
                      return (
                        <div
                          key={g.id}
                          className={cn(
                            "rounded-lg border border-s-4 bg-card p-2.5 shadow-sm",
                            subjectTone(g.subject_id),
                            isLive && "ring-2 ring-saffron",
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="tabular text-xs font-bold text-primary" dir="ltr">
                              {g.start_time ? `${hhmm(g.start_time)} – ${hhmm(g.end_time)}` : t("noTimeSet")}
                            </span>
                            {isLive && (
                              <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-saffron opacity-75" />
                                <span className="relative inline-flex size-2 rounded-full bg-saffron" />
                              </span>
                            )}
                          </div>
                          <div className="mt-1 truncate text-sm font-bold text-foreground" title={g.name}>
                            {g.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {g.subject ? pick(g.subject.name_ar, g.subject.name_en) : "—"}
                            {g.level ? ` · ${g.level.code}` : ""}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <span className="inline-flex max-w-full items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                              <DoorOpen className="size-3 shrink-0" />
                              <span className="truncate">{g.room ? pick(g.room.name_ar, g.room.name_en) : "—"}</span>
                            </span>
                          </div>
                          {showTeacher && g.teacher && (
                            <div className="mt-1 truncate text-[11px] text-muted-foreground">
                              <GraduationCap className="me-1 inline size-3" />
                              {g.teacher.full_name}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
