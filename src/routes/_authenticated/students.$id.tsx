import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CreditCard, Hourglass, Info as InfoIcon, Ban, Pencil, PlusCircle, Printer, Trash2, Phone, Wallet } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { confirmAction } from "@/lib/confirm";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  useAttendance,
  useEnrollments,
  useGroups,
  usePayments,
  useSettings,
  useStudents,
  type Payment,
  type Student,
} from "@/lib/data";
import { GROUP_CAPACITY, audienceForAgeGroup, studentAgeGroup, buildPackage, groupSeat, receiptFigures, remainingSessions, studentLedger, type PlanKind } from "@/lib/business";
import { ageGroupKey, groupLabel } from "@/lib/labels";
import { WaitlistDialog } from "@/components/WaitlistDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, Field, PageHeader, Panel, Pill, SessionBar, selectCls } from "@/components/common";
import { StudentForm } from "@/components/StudentForm";
import { PaymentReceipt, PrintDialog, StudentCard } from "@/components/print";
import { PayDebtDialog, type ReceiptData } from "@/components/PayDebtDialog";

export const Route = createFileRoute("/_authenticated/students/$id")({
  head: () => ({ meta: [
    { title: "Student — Beyond Words" },
    { name: "description", content: "Student profile." },
    { property: "og:title", content: "Student — Beyond Words" },
    { property: "og:description", content: "Student profile." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: StudentPage,
});

function StudentPage() {
  const { id } = Route.useParams();
  const { t, pick, money, fmtDate } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: students = [] } = useStudents();
  const { data: settings } = useSettings();
  const { data: enrollments = [] } = useEnrollments();
  const { data: payments = [] } = usePayments();
  const { data: attendance = [] } = useAttendance(365);
  const student = students.find((s) => s.id === id);

  const [editOpen, setEditOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [receipt, setReceipt] = useState<Omit<ReceiptData, "student"> | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payKey, setPayKey] = useState<string | null>(null);

  const mine = useMemo(() => enrollments.filter((e) => e && e.student_id === id), [enrollments, id]);
  const myPayments = useMemo(() => payments.filter((p) => p && p.student_id === id), [payments, id]);
  const ledger = useMemo(() => studentLedger(mine, myPayments), [mine, myPayments]);

  if (!student) return <Empty>…</Empty>;

  const myAttendance = attendance.filter((a) => a.student_id === id);
  const unlinkedIds = new Set(ledger.unlinked.map((p) => p.id));

  function openPay(key: string | null) {
    setPayKey(key);
    setPayOpen(true);
  }

  async function cancelReceipt(p: Payment) {
    if (
      !(await confirmAction({
        title: t("cancelReceiptTitle"),
        message: `#${p.receipt_no} · ${money(p.amount)}`,
        hint: t("cancelReceiptMsg"),
        confirmLabel: t("cancelReceipt"),
      }))
    )
      return;
    const { error } = await supabase.from("payments").delete().eq("id", p.id);
    if (error) { notifyError(error.message); return; }
    toast.success(t("saved"));
    qc.invalidateQueries();
  }

  async function remove() {
    if (!(await confirmAction({ title: t("confirmDeleteTitle"), message: t("confirmDelete"), hint: t("confirmDeleteHint"), confirmLabel: t("delete") }))) return;
    // Completely purge all traces of the student across waiting list, attendance, payments, enrollments
    await supabase.from("waiting_list").delete().eq("student_id", id);
    await supabase.from("attendance").delete().eq("student_id", id);
    await supabase.from("payments").delete().eq("student_id", id);
    await supabase.from("enrollments").delete().eq("student_id", id);
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) { notifyError(error.message); return; }
    toast.success(t("deleted"));
    qc.invalidateQueries({ queryKey: ["students"] });
    qc.invalidateQueries({ queryKey: ["waiting_list"] });
    qc.invalidateQueries({ queryKey: ["enrollments"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["attendance"] });
    qc.invalidateQueries();
    navigate({ to: "/students" });
  }

  return (
    <div>
      <Link to="/students" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("students")}
      </Link>
      <PageHeader
        title={`${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || t("student")}
        subtitle={student.code ?? ""}
        actions={
          <>
            <Button variant="accent" onClick={() => setEnrollOpen(true)}>
              <PlusCircle /> {t("enrollRenew")}
            </Button>
            {ledger.debt > 0 && (
              <Button variant="destructive" onClick={() => openPay(null)}>
                <Wallet /> {t("payDebt")} · {money(ledger.debt)}
              </Button>
            )}
            <Button variant="outline" onClick={() => setCardOpen(true)}>
              <CreditCard /> {t("printCard")}
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> {t("edit")}
            </Button>
            <Button variant="ghost" size="icon" onClick={remove} aria-label={t("delete")}>
              <Trash2 className="text-destructive" />
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel>
          <div className="flex flex-col items-center text-center">
            <div className="size-32 overflow-hidden rounded-2xl bg-muted">
              {student.photo_url ? (
                <img src={student.photo_url} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-4xl font-bold text-muted-foreground">{student.first_name?.[0] ?? "—"}</div>
              )}
            </div>
            <div className="mt-3 font-mono text-sm text-primary">{student.code}</div>
          </div>
          <dl className="mt-5 space-y-2 text-sm">
            <Info label={t("ageGroup")} value={<bdi dir="rtl">{(() => { const k = ageGroupKey(studentAgeGroup(student)); return k ? t(k) : "—"; })()}</bdi>} />
            <Info label={t("studentPhone")} value={student.phone || "—"} ltr />
            <Info label={`${t("parentPhone")} · ${t("emergency")}`} value={student.parent_phone || "—"} ltr />
            <Info label={t("packagesTotal")} value={money(ledger.due)} />
            <Info label={t("amountPaid")} value={money(ledger.paid)} />
            {ledger.debt > 0 ? (
              <Info label={t("debt")} value={<Pill tone="danger">{money(ledger.debt)}</Pill>} />
            ) : ledger.credit > 0 ? (
              <Info label={t("credit")} value={<Pill tone="accent">+ {money(ledger.credit)}</Pill>} />
            ) : (
              <Info label={t("debt")} value={<Pill tone="success">{t("noDebt")}</Pill>} />
            )}
          </dl>
          {(ledger.debt > 0 || ledger.credit > 0) && (
            <div className={`mt-3 flex gap-2 rounded-lg p-3 text-xs leading-relaxed ${ledger.debt > 0 ? "bg-destructive/10 text-destructive" : "bg-accent/15 text-foreground"}`}>
              <InfoIcon className="mt-0.5 size-4 shrink-0" />
              <span>{ledger.debt > 0 ? t("debtExplain") : t("creditExplain")}</span>
            </div>
          )}
          {ledger.debt > 0 && (
            <Button variant="destructive" className="mt-3 w-full" onClick={() => openPay(null)}>
              <Wallet /> {t("payDebt")}
            </Button>
          )}
          {student.parent_phone && (
            <Button asChild variant="outline" className="mt-4 w-full">
              <a href={`tel:${student.parent_phone}`}>
                <Phone /> {t("parentPhone")}
              </a>
            </Button>
          )}
          {student.notes && <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">{student.notes}</p>}
        </Panel>

        <div className="space-y-6 lg:col-span-2">
          <Panel title={t("packages")}>
            {ledger.bundles.length === 0 ? (
              <Empty>{t("noActivePackage")}</Empty>
            ) : (
              <ul className="divide-y">
                {[...ledger.bundles].reverse().map((b) => {
                  const e = b.enrollments[0]!;
                  const used = b.enrollments.reduce((a, x) => a + x.sessions_used, 0);
                  const total = b.enrollments.reduce((a, x) => a + x.sessions_total, 0);
                  const paidPart = b.price - b.remaining;
                  return (
                    <li key={b.key} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">{groupLabel(e.group, pick)}</div>
                          <div className="text-xs text-muted-foreground">
                            {e.group ? t(e.group.activity as "support") : ""} · {fmtDate(b.createdAt)} · {money(b.price)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <SessionBar used={used} total={total} />
                          {b.enrollments.every((x) => x.payout_id) ? (
                            <Pill>{t("paidOut")}</Pill>
                          ) : used >= total ? (
                            <Pill tone="warning">{t("completed")}</Pill>
                          ) : (
                            <Pill tone="success">{t("active")}</Pill>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                          <span>
                            {t("amountPaid")}: <b className="tabular text-foreground">{money(Math.min(b.paidDirect, b.price))}</b>
                          </span>
                          {b.fromCredit > 0 && (
                            <span>
                              {t("coveredByCredit")}: <b className="tabular text-foreground">{money(b.fromCredit)}</b>
                            </span>
                          )}
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-success" style={{ width: `${b.price ? Math.min(100, (paidPart / b.price) * 100) : 100}%` }} />
                          </div>
                        </div>
                        {b.remaining > 0 ? (
                          <div className="flex items-center gap-2">
                            <Pill tone="danger">
                              {t("debt")}: {money(b.remaining)}
                            </Pill>
                            <Button size="sm" variant="outline" className="h-7" onClick={() => openPay(b.key)}>
                              <Wallet /> {t("payDebt")}
                            </Button>
                          </div>
                        ) : (
                          <Pill tone="success">{t("paidInFull")} ✓</Pill>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel title={t("paymentsHistory")}>
              {myPayments.length === 0 ? (
                <Empty>{t("none")}</Empty>
              ) : (
                <ul className="divide-y">
                  {myPayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium tabular text-foreground">{money(p.amount)}</div>
                        <div className="truncate text-xs text-muted-foreground" title={p.note ?? ""}>
                          #{p.receipt_no} · {fmtDate(p.created_at)}
                          {p.note ? ` · ${p.note}` : ""}
                        </div>
                        {unlinkedIds.has(p.id) && (
                          <div className="mt-1">
                            <Pill tone="accent">{t("unlinkedPayment")}</Pill>
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t("print")}
                          title={t("print")}
                          onClick={() => {
                            const e = mine.find((x) => x.id === p.enrollment_id);
                            const f = receiptFigures(p, mine, myPayments);
                            setReceipt({ payment: p, description: p.note || groupLabel(e?.group, pick), ...f });
                          }}
                        >
                          <Printer />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={t("cancelReceipt")} title={t("cancelReceipt")} onClick={() => cancelReceipt(p)}>
                          <Trash2 className="text-destructive" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title={t("attendanceHistory")}>
              {myAttendance.length === 0 ? (
                <Empty>{t("none")}</Empty>
              ) : (
                <ul className="max-h-80 divide-y overflow-auto">
                  {myAttendance.map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="tabular text-muted-foreground">{fmtDate(a.created_at, true)}</span>
                      <Pill tone={a.status === "present" ? "success" : "danger"}>{t(a.status === "present" ? "present" : "absent")}</Pill>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto sm:rounded-2xl p-5 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-4 text-accent" />
              {t("editStudent")}
            </DialogTitle>
          </DialogHeader>
          <StudentForm
            initial={student}
            onSaved={() => {
              setEditOpen(false);
              qc.invalidateQueries();
            }}
          />
        </DialogContent>
      </Dialog>

      <PrintDialog open={cardOpen} onOpenChange={setCardOpen} title={t("studentCard")}>
        <StudentCard student={student} settings={settings} />
      </PrintDialog>

      <EnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        student={student}
        credit={ledger.credit}
        onDone={(r) => {
          setEnrollOpen(false);
          qc.invalidateQueries();
          if (r) setReceipt(r);
        }}
      />

      <PayDebtDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        student={student}
        bundles={ledger.bundles}
        initialKey={payKey}
        onDone={(r) => {
          setPayOpen(false);
          qc.invalidateQueries();
          setReceipt(r);
        }}
      />

      <PrintDialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)} title={t("receipt")}>
        {receipt && (
          <PaymentReceipt
            settings={settings}
            receiptNo={receipt.payment.receipt_no ?? ""}
            date={receipt.payment.created_at}
            student={student}
            description={receipt.description}
            total={receipt.total}
            previous={receipt.previous}
            remaining={receipt.remaining}
            paid={Number(receipt.payment.amount)}
          />
        )}
      </PrintDialog>
    </div>
  );
}

function Info({ label, value, ltr }: { label: string; value: React.ReactNode; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground tabular" dir={ltr ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}

function EnrollDialog({
  open,
  onOpenChange,
  student,
  credit,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: Student;
  credit: number;
  onDone: (r: Omit<ReceiptData, "student"> | null) => void;
}) {
  const { t, pick, money, day } = useI18n();
  const qc = useQueryClient();
  const { data: groups = [] } = useGroups();
  const { data: settings } = useSettings();
  const { data: allEnrollments = [] } = useEnrollments();
  const [waitOpen, setWaitOpen] = useState(false);
  const seatFor = (gid: string, activity: string) =>
    groupSeat(activity, allEnrollments.filter((e) => e.group_id === gid), student.id);
  const [groupId, setGroupId] = useState("");
  const [plan, setPlan] = useState<PlanKind>("monthly");
  const [paid, setPaid] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const group = groups.find((g) => g.id === groupId);
  const audience = group?.activity === "levels" ? (group.audience as "kids" | "adults") : audienceForAgeGroup(studentAgeGroup(student));

  const availablePlans = useMemo(() => {
    if (!group) return [];
    if (group.activity === "workshop") return [{ value: "single" as PlanKind, label: t("single") }];

    if (audience === "kids") {
      const qPrice = Number(settings?.kids_quarter_price ?? 12000);
      const sPrice = Number((settings as any)?.kids_semester_price ?? 20000);
      const mPrice = Number(settings?.kids_monthly_price ?? 4500);
      return [
        { value: "quarter" as PlanKind, label: `${t("quarter")} — ${money(qPrice)}` },
        { value: "semester" as PlanKind, label: `${t("semester")} — ${money(sPrice)}` },
        { value: "monthly" as PlanKind, label: `${t("monthlyKids")} — ${money(mPrice)}` },
      ];
    }

    if (audience === "adults" && group.activity === "levels") {
      const lvl = group.level as any;
      const hasPkg = (lvl?.sessions ?? 0) >= 30 || (lvl?.package_price ?? 0) > 0;
      if (hasPkg) {
        const pkgPrice = lvl?.package_price || 15000;
        const mPrice = lvl?.price || 4000;
        return [
          { value: "four_months" as PlanKind, label: `${t("four_months")} — ${money(pkgPrice)}` },
          { value: "monthly" as PlanKind, label: `${t("monthly")} — ${money(mPrice)}` },
        ];
      }
      return [{ value: "monthly" as PlanKind, label: `${t("monthly")} — ${money(lvl?.price ?? 3000)}` }];
    }

    return [{ value: "monthly" as PlanKind, label: `${t("monthly")} — ${money(Number(settings?.support_price ?? 2500))}` }];
  }, [group, audience, settings, t, money]);

  useEffect(() => {
    if (availablePlans.length > 0) {
      if (!availablePlans.some((p) => p.value === plan)) {
        setPlan(availablePlans[0]!.value);
      }
    }
  }, [availablePlans, plan]);

  const pkg = useMemo(() => {
    if (!group || !settings) return null;
    return buildPackage({
      activity: group.activity as "support",
      audience,
      plan,
      settings,
      level: group.level,
      workshopPrice: group.price,
    });
  }, [group, settings, audience, plan]);

  const showPlan = availablePlans.length > 1;
  const seat = group ? seatFor(group.id, group.activity) : null;
  const studentAg = studentAgeGroup(student);
  const groupAg = ageGroupKey(group?.age_group);
  const ageMismatch = !!group?.age_group && studentAg != null && studentAg !== group.age_group;
  const creditUse = pkg ? Math.min(credit, pkg.total) : 0;
  const dueNow = pkg ? pkg.total - creditUse : 0;
  const payNow = paid === "" ? dueNow : Number(paid);
  const payErr = !pkg
    ? null
    : !Number.isFinite(payNow) || payNow < 0
      ? t("vInvalidAmount")
      : payNow > dueNow
        ? `${t("vExceedsDebt")} ${money(dueNow)}`
        : null;
  const leftDebt = pkg && !payErr ? dueNow - payNow : 0;

  async function confirmEnroll() {
    if (!group || !pkg) return;
    if (seat?.full) {
      toast.error(t("groupFullTitle"), { description: t("groupFullMsg").replace("{n}", String(GROUP_CAPACITY)) });
      return;
    }
    if (payErr) {
      toast.warning(t("vTitle"), { description: payErr });
      return;
    }
    setBusy(true);
    try {
      const rows = pkg.blocks.map((b) => ({
        student_id: student.id,
        group_id: group.id,
        sessions_total: b.sessions,
        price: b.price,
        plan: pkg.plan,
      }));
      const ins = await supabase.from("enrollments").insert(rows).select();
      if (ins.error) throw ins.error;
      // The student found a group: drop their matching waiting-list entries.
      let wl = supabase.from("waiting_list").delete().eq("student_id", student.id).eq("activity", group.activity);
      wl = group.subject_id ? wl.eq("subject_id", group.subject_id) : wl.is("subject_id", null);
      await wl;
      qc.invalidateQueries({ queryKey: ["waiting_list"] });
      const amount = payNow;
      if (amount > 0) {
        const description = `${groupLabel(group, pick)} — ${t(pkg.plan)}`;
        const pay = await supabase
          .from("payments")
          .insert({ student_id: student.id, enrollment_id: ins.data![0]!.id, amount, note: description })
          .select()
          .single();
        if (pay.error) throw pay.error;
        if (leftDebt > 0) toast.success(t("enrolledWithDebt"), { description: `${t("debt")}: ${money(leftDebt)}` });
        else toast.success(t("saved"));
        onDone({ payment: pay.data, description, total: pkg.total, previous: creditUse, remaining: leftDebt });
      } else {
        if (leftDebt > 0) toast.success(t("enrolledWithDebt"), { description: `${t("debt")}: ${money(leftDebt)}` });
        else toast.success(t("saved"));
        onDone(null);
      }
      setGroupId("");
      setPaid("");
      setPlan("monthly");
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("enrollRenew")}</DialogTitle>
        </DialogHeader>
        {groups.length === 0 ? (
          <Empty>{t("noGroups")}</Empty>
        ) : (
          <div className="space-y-4">
            <Field label={t("group")}>
              <select className={selectCls} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">—</option>
                {(["support", "levels", "workshop"] as const).map((a) => (
                  <optgroup key={a} label={t(a)}>
                    {groups
                      .filter((g) => g.activity === a && g.active)
                      .map((g) => {
                        const st = seatFor(g.id, g.activity);
                        const agk = ageGroupKey(g.age_group);
                        return (
                          <option key={g.id} value={g.id}>
                            {groupLabel(g, pick)} · {g.activity === "workshop" ? g.workshop_date ?? "" : day(g.day_of_week)}{" "}
                            {g.start_time?.slice(0, 5) ?? ""}
                            {agk ? ` · ${t(agk)}` : ""} · {st.full ? `⛔ ${t("groupFull")}` : `${st.count}/${GROUP_CAPACITY}`}
                          </option>
                        );
                      })}
                  </optgroup>
                ))}
              </select>
            </Field>
            {seat?.full && group && (
              <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
                <div className="flex items-start gap-3">
                  <Ban className="mt-0.5 size-5 shrink-0 text-destructive" />
                  <div className="space-y-1 text-sm">
                    <div className="font-semibold text-destructive">
                      {t("groupFullTitle")} · {seat.count}/{GROUP_CAPACITY}
                    </div>
                    <p className="text-foreground">{t("groupFullMsg").replace("{n}", String(GROUP_CAPACITY))}</p>
                    <p className="text-muted-foreground">{t("groupFullHint")}</p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button type="button" size="sm" variant="accent" onClick={() => setWaitOpen(true)}>
                    <Hourglass /> {t("addToWaitingList")}
                  </Button>
                </div>
              </div>
            )}
            {seat && !seat.full && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs text-muted-foreground">
                <span>{seat.renewal ? t("renewalSeat") : `${seat.left} ${t("seatsLeft")}`}</span>
                <span className="font-medium tabular text-foreground">
                  {seat.count}/{GROUP_CAPACITY}
                </span>
              </div>
            )}
            {ageMismatch && !seat?.full && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  {t("ageMismatch")
                    .replace("{age}", studentAg ? t(ageGroupKey(studentAg)!) : "—")
                    .replace("{group}", groupAg ? t(groupAg) : "—")}
                </span>
              </div>
            )}
            {showPlan && (
              <Field label={t("plan")}>
                <select className={selectCls} value={plan} onChange={(e) => setPlan(e.target.value as PlanKind)}>
                  {availablePlans.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {pkg && (
              <div className="rounded-xl bg-secondary p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("audience")}</span>
                  <span className="font-medium">{t(audience)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("sessions")}</span>
                  <span className="font-medium tabular">{pkg.blocks.reduce((s, b) => s + b.sessions, 0)}</span>
                </div>
                <div className="mt-2 flex justify-between text-base">
                  <span className="font-semibold">{t("price")}</span>
                  <span className="font-bold tabular">{money(pkg.total)}</span>
                </div>
                {creditUse > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("coveredByCredit")}</span>
                    <span className="font-medium tabular">− {money(creditUse)}</span>
                  </div>
                )}
              </div>
            )}
            <Field label={t("amountPaid")}>
              <Input
                type="number"
                min={0}
                max={dueNow}
                value={paid}
                placeholder={pkg ? String(dueNow) : ""}
                onChange={(e) => setPaid(e.target.value)}
                aria-invalid={!!payErr}
              />
              {pkg && !payErr && <p className="pt-1 text-xs text-muted-foreground">{t("partialHint")}</p>}
              {payErr && <p className="pt-1 text-xs font-medium text-destructive">{payErr}</p>}
            </Field>
            {pkg && !payErr && (
              <div
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${leftDebt > 0 ? "border-warning/40 bg-warning/10" : "border-success/40 bg-success/10"}`}
              >
                <span className="font-medium">{leftDebt > 0 ? t("becomesDebt") : t("remainingAfter")}</span>
                <span className="text-base font-bold tabular">{leftDebt > 0 ? money(leftDebt) : `${money(0)} ✓`}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button variant="accent" disabled={!pkg || busy || !!payErr || !!seat?.full} onClick={confirmEnroll}>
                <Printer /> {t("confirmEnroll")}
              </Button>
            </div>
          </div>
        )}
        {group && (
          <WaitlistDialog
            open={waitOpen}
            onOpenChange={setWaitOpen}
            preset={{ student, activity: group.activity, subject_id: group.subject_id, age_group: group.age_group ?? studentAg, group_id: group.id }}
            onDone={() => setGroupId("")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
