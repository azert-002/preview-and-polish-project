import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Banknote, Printer, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { confirmAction } from "@/lib/confirm";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useEnrollments, usePayouts, useSettings, useTeachers, type Payout } from "@/lib/data";
import { splitPayroll } from "@/lib/business";
import { groupLabel } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Empty, PageHeader, Panel, SessionBar, StatCard, selectCls } from "@/components/common";
import { PayoutStatement, PrintDialog } from "@/components/print";

export const Route = createFileRoute("/_authenticated/payroll")({
  head: () => ({ meta: [
    { title: "Payroll — Beyond Words" },
    { name: "description", content: "Teacher payroll engine." },
    { property: "og:title", content: "Payroll — Beyond Words" },
    { property: "og:description", content: "Teacher payroll engine." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Payroll,
});

type Row = {
  enrollment_id?: string;
  student: string;
  group: string;
  sessions: string;
  price: number;
  teacherPrice?: number;
};

function Payroll() {
  const { t, tg, pick, money, fmtDate } = useI18n();
  const qc = useQueryClient();
  const { data: teachers = [] } = useTeachers();
  const { data: enrollments = [] } = useEnrollments();
  const { data: payouts = [] } = usePayouts();
  const { data: settings } = useSettings();
  const [teacherId, setTeacherId] = useState("");
  const [activityFilter, setActivityFilter] = useState<"all" | "support" | "levels" | "workshop">("all");
  const [busy, setBusy] = useState(false);
  const [statement, setStatement] = useState<Payout | null>(null);

  const teacher = teachers.find((x) => x.id === teacherId);
  const teacherEnrollments = enrollments.filter((e) => e.group?.teacher_id === teacherId);
  const mine = activityFilter === "all"
    ? teacherEnrollments
    : teacherEnrollments.filter((e) => e.group?.activity === activityFilter);

  // Fixed per-student share: 300 DZD for workshops, 500 DZD for support/languages (or group/teacher custom override)
  const amountOf = (e: (typeof enrollments)[number]) => {
    const isWorkshop = e.group?.activity === "workshop";
    if (isWorkshop) {
      if (e.group?.teacher_pct != null && Number(e.group.teacher_pct) > 0) {
        return Number(e.group.teacher_pct);
      }
      return Number((settings as any)?.workshop_teacher_amount ?? 300);
    }
    if (e.group?.teacher_pct != null && Number(e.group.teacher_pct) > 0) {
      return Number(e.group.teacher_pct);
    }
    if (teacher?.percentage != null && Number(teacher.percentage) > 0) {
      return Number(teacher.percentage);
    }
    return Number(settings?.default_teacher_pct ?? 500);
  };

  const defaultTeacherAmt = Number(teacher?.percentage ?? settings?.default_teacher_pct ?? 500);

  const maxMonthsOf = (e: (typeof enrollments)[number]) => {
    if (e.group?.activity === "workshop") return 1;
    if (e.plan === "four_months") return 4;
    if (e.plan === "semester") return 6;
    if (e.plan === "quarter") return 3;
    return 1;
  };

  const timesPaidOf = (enrollmentId: string) => {
    return payouts.filter(
      (p) => p.teacher_id === teacherId && (p.details as any[])?.some((d: any) => d.enrollment_id === enrollmentId)
    ).length;
  };

  // Eligibility:
  // - Daily workshop: 1 session completed and not paid yet
  // - Support / Languages / Levels: teacher receives fixed 500 DZD per student each month
  //   as long as the package still has months to pay (timesPaid < maxMonths)
  // a package the student left before any session was taught never earns the teacher anything
  const neverTaught = (e: (typeof mine)[number]) => Boolean(e.withdrawn_at) && e.sessions_used === 0;
  const isEligible = (e: (typeof mine)[number]) => {
    if (e.payout_id || neverTaught(e)) return false;
    const maxM = maxMonthsOf(e);
    const times = timesPaidOf(e.id);
    if (times >= maxM) return false;

    if (e.group?.activity === "workshop") {
      return e.sessions_used >= 1;
    }
    return true;
  };

  const eligible = mine.filter(isEligible);
  const deferred = mine.filter((e) => !e.payout_id && !neverTaught(e) && !isEligible(e));

  const revenue = eligible.reduce((s, e) => s + Math.round(Number(e.price) / maxMonthsOf(e)), 0);
  const share = eligible.reduce((s, e) => s + amountOf(e), 0);
  const effectiveAmount = eligible.length > 0 ? Math.round(share / eligible.length) : defaultTeacherAmt;

  const toRow = (e: (typeof mine)[number]): Row => {
    const maxM = maxMonthsOf(e);
    const currentCycle = timesPaidOf(e.id) + 1;
    return {
      enrollment_id: e.id,
      student: `${e.student?.first_name ?? ""} ${e.student?.last_name ?? ""}`,
      group: `${groupLabel(e.group, pick)}${maxM > 1 ? ` (${t("month")} ${currentCycle}/${maxM})` : ""}`,
      sessions: `${e.sessions_used}/${e.sessions_total}`,
      price: Math.round(Number(e.price) / maxM),
      teacherPrice: amountOf(e),
    };
  };

  async function payOut() {
    if (!teacher || eligible.length === 0) return;
    setBusy(true);
    try {
      const ins = await supabase
        .from("payouts")
        .insert({
          teacher_id: teacher.id,
          percentage: effectiveAmount,
          total_revenue: revenue,
          amount: share,
          students_count: eligible.length,
          details: eligible.map(toRow),
        })
        .select()
        .single();
      if (ins.error) throw ins.error;

      // Mark enrollments with payout_id only once they have been paid for all their months
      const fullyPaidIds = eligible
        .filter((e) => timesPaidOf(e.id) + 1 >= maxMonthsOf(e))
        .map((e) => e.id);

      if (fullyPaidIds.length > 0) {
        const up = await supabase
          .from("enrollments")
          .update({ payout_id: ins.data.id })
          .in("id", fullyPaidIds);
        if (up.error) throw up.error;
      }

      toast.success(t("saved"));
      qc.invalidateQueries();
      setStatement(ins.data);
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePayout(p: Payout) {
    const ok = await confirmAction({
      title: t("confirmDeleteTitle"),
      message: t("confirmDelete"),
      hint: t("payoutDeleteHint"),
      confirmLabel: t("delete"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      // Release the students first so they can be paid again, then remove the record.
      const up = await supabase.from("enrollments").update({ payout_id: null }).eq("payout_id", p.id);
      if (up.error) throw up.error;
      const del = await supabase.from("payouts").delete().eq("id", p.id);
      if (del.error) throw del.error;
      toast.success(t("deleted"));
      qc.invalidateQueries();
    } catch (e) {
      notifyError((e as Error).message);
    }
  }

  const history = payouts.filter((p) => !teacherId || p.teacher_id === teacherId);

  return (
    <div>
      <PageHeader title={t("payroll")} subtitle={t("payrollRule")} />
      <Panel className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-xs">
              <label className="mb-1.5 block text-xs text-muted-foreground">{t("selectTeacher")}</label>
              <select className={selectCls} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">—</option>
                {teachers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.full_name}
                  </option>
                ))}
              </select>
            </div>
            {teacher && (
              <div className="w-full sm:w-auto">
                <label className="mb-1.5 block text-xs text-muted-foreground">{t("category")}</label>
                <div className="inline-flex rounded-lg border bg-muted/30 p-0.5">
                  {(
                    [
                      { key: "all", label: t("allActivities") },
                      { key: "support", label: t("support") },
                      { key: "levels", label: t("levels") },
                      { key: "workshop", label: t("workshop") },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActivityFilter(tab.key)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        activityFilter === tab.key
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {teacher && (
            <Button variant="accent" disabled={busy || eligible.length === 0} onClick={payOut}>
              <Banknote /> {t("payNow")}
            </Button>
          )}
        </div>
      </Panel>

      {teacher && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label={t("revenue")} value={money(revenue)} icon={Wallet} />
            <StatCard label={tg("teacherShare", teacher?.gender)} value={money(share)} icon={Banknote} tone="accent" />
            <StatCard label={t("deferred")} value={`${deferred.length} ${t("students")}`} icon={Wallet} tone="warning" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={`${t("eligible")} (${eligible.length})`}>
              <EnrollTable rows={eligible} money={money} pick={pick} empty={t("none")} amountOf={amountOf} />
            </Panel>
            <Panel title={`${t("deferred")} (${deferred.length})`}>
              <EnrollTable rows={deferred} money={money} pick={pick} empty={t("none")} amountOf={amountOf} />
            </Panel>
          </div>
        </>
      )}

      <Panel title={t("payoutHistory")} className="mt-6">
        {history.length === 0 ? (
          <Empty>{t("none")}</Empty>
        ) : (
          <ul className="divide-y">
            {history.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium text-foreground">{teachers.find((x) => x.id === p.teacher_id)?.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(p.created_at)} · {p.students_count} {t("students")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold tabular text-foreground">{money(Number(p.amount))}</span>
                  <Button size="icon" variant="ghost" onClick={() => setStatement(p)} aria-label={t("print")}>
                    <Printer />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => deletePayout(p)}
                    aria-label={t("delete")}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <PrintDialog open={!!statement} onOpenChange={(o) => !o && setStatement(null)} title={tg("statement", teachers.find((x) => x.id === statement?.teacher_id)?.gender)}>
        {statement && (
          <PayoutStatement
            settings={settings}
            teacherName={teachers.find((x) => x.id === statement.teacher_id)?.full_name ?? ""}
            female={teachers.find((x) => x.id === statement.teacher_id)?.gender === "female"}
            date={statement.created_at}
            percentage={Number(statement.percentage)}
            rows={(statement.details as Row[]) ?? []}
            share={Number(statement.amount)}
          />
        )}
      </PrintDialog>
    </div>
  );
}

function EnrollTable({
  rows,
  money,
  pick,
  empty,
  amountOf,
}: {
  rows: ReturnType<typeof useEnrollments>["data"] & object;
  money: (n: number) => string;
  pick: (a: string | null | undefined, b: string | null | undefined) => string;
  empty: string;
  amountOf: (e: any) => number;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y">
      {rows.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">
              {e.student?.first_name} {e.student?.last_name}
            </div>
            <div className="truncate text-xs text-muted-foreground">{groupLabel(e.group, pick)}</div>
          </div>
          <div className="flex items-center gap-3">
            <SessionBar used={e.sessions_used} total={e.sessions_total} />
            <div className="text-end">
              <span className="font-semibold tabular text-foreground">{money(amountOf(e))}</span>
              <span className="ms-1.5 text-xs text-muted-foreground">({money(Number(e.price))})</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
