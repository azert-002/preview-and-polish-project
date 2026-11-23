import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, CalendarCheck, Banknote, BellRing, ScanLine, UserPlus, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { isThisMonth, isToday, useAttendance, useEnrollments, useMyRole, usePayments, useWaitingList } from "@/lib/data";
import { canSeeIncome } from "@/lib/permissions";
import { remainingSessions, waitlistBuckets } from "@/lib/business";
import { ageGroupKey, groupLabel } from "@/lib/labels";
import { Empty, PageHeader, Panel, Pill, SessionBar, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard — Beyond Words" },
    { name: "description", content: "Academy overview." },
    { property: "og:title", content: "Dashboard — Beyond Words" },
    { property: "og:description", content: "Academy overview." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Dashboard,
});

function Dashboard() {
  const { t, money, pick, fmtDate } = useI18n();
  const { data: enrollments = [] } = useEnrollments();
  const { data: attendance = [] } = useAttendance(1);
  const { data: payments = [] } = usePayments();
  const { data: role } = useMyRole();
  const { data: waiting = [] } = useWaitingList();
  const ready = waitlistBuckets(waiting).filter((b) => b.ready);
  const showIncome = canSeeIncome(role);

  // per student+group: is there any block with sessions left?
  const byKey = new Map<string, typeof enrollments>();
  for (const e of enrollments) {
    const k = `${e.student_id}:${e.group_id}`;
    byKey.set(k, [...(byKey.get(k) ?? []), e]);
  }
  const activeStudentIds = new Set(enrollments.filter((e) => remainingSessions(e) > 0).map((e) => e.student_id));
  const alerts = [...byKey.values()]
    .map((list) => {
      const left = list.reduce((s, e) => s + remainingSessions(e), 0);
      return { e: list[list.length - 1]!, left };
    })
    .filter((x) => x.left <= 1 && x.e.group?.activity !== "workshop")
    .slice(0, 12);

  const todays = attendance.filter((a) => isToday(a.created_at));
  const monthIncome = payments.filter((p) => isThisMonth(p.created_at)).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div>
      <PageHeader
        title={t("dashboard")}
        subtitle={t("welcome")}
        actions={
          <>
            <Button asChild variant="accent">
              <Link to="/scan">
                <ScanLine /> {t("scan")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/students">
                <UserPlus /> {t("addStudent")}
              </Link>
            </Button>
          </>
        }
      />
      {ready.length > 0 && (
        <div role="status" className="mb-6 rounded-xl border border-success/40 bg-success/10 p-4">
          <div className="flex items-center gap-2 font-semibold text-success">
            <CheckCircle2 className="size-5" /> {t("readyGroups")}
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {ready.map((b) => {
              const w = b.entries[0]!;
              const ag = ageGroupKey(w.age_group);
              return (
                <li key={b.key}>
                  <Link to="/waiting" className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm hover:bg-muted">
                    <span className="font-medium text-foreground">{w.subject ? pick(w.subject.name_ar, w.subject.name_en) : "—"}</span>
                    <span className="text-muted-foreground">{ag ? t(ag) : t("noAgeGroup")}</span>
                    <Pill tone="success">{b.count}</Pill>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className={`grid gap-4 sm:grid-cols-2 ${showIncome ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        <StatCard label={t("activeStudents")} value={activeStudentIds.size} icon={Users} />
        <StatCard label={t("todayAttendance")} value={todays.length} icon={CalendarCheck} tone="success" />
        {showIncome && <StatCard label={t("monthlyIncome")} value={money(monthIncome)} icon={Banknote} tone="accent" />}
        <StatCard label={t("expiringAlerts")} value={alerts.length} icon={BellRing} tone="warning" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title={t("packagesEnding")}>
          {alerts.length === 0 ? (
            <Empty>{t("none")}</Empty>
          ) : (
            <ul className="divide-y">
              {alerts.map(({ e, left }) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link to="/students/$id" params={{ id: e.student_id }} className="min-w-0">
                    <div className="truncate font-medium text-foreground">
                      {e.student?.first_name} {e.student?.last_name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{groupLabel(e.group, pick)}</div>
                  </Link>
                  <Pill tone={left <= 0 ? "danger" : "warning"}>
                    {t("remaining")}: {left}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={t("recentAttendance")}>
          {todays.length === 0 ? (
            <Empty>{t("none")}</Empty>
          ) : (
            <ul className="divide-y">
              {todays.slice(0, 12).map((a) => {
                const e = enrollments.find((x) => x.id === a.enrollment_id);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {a.student?.first_name} {a.student?.last_name}
                      </div>
                      <div className="text-xs text-muted-foreground tabular">{fmtDate(a.created_at, true)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {e && <SessionBar used={e.sessions_used} total={e.sessions_total} />}
                      <Pill tone={a.status === "present" ? "success" : "danger"}>{t(a.status === "present" ? "present" : "absent")}</Pill>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
