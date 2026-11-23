import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Info as InfoIcon, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { notifyError } from "@/lib/errors";
import { planWithdrawal, studentLedger, type LedgerBundle, type WithdrawMode } from "@/lib/business";
import { groupLabel } from "@/lib/labels";
import type { EnrollmentFull, Payment, Student } from "@/lib/data";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SessionBar } from "@/components/common";
import { cn } from "@/lib/utils";

/** Ends one package now: frees the student's seat and re-prices the package as chosen. */
export function WithdrawDialog({
  open,
  onOpenChange,
  student,
  bundle,
  enrollments,
  payments,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: Student;
  bundle: LedgerBundle<EnrollmentFull> | null;
  enrollments: EnrollmentFull[];
  payments: Payment[];
  onDone: () => void;
}) {
  const { t, pick, money, fmtDate } = useI18n();
  const [mode, setMode] = useState<WithdrawMode>("used");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setMode("used");
  }, [open]);

  const blocks = bundle?.enrollments ?? [];
  const used = blocks.reduce((a, x) => a + Math.min(x.sessions_used, x.sessions_total), 0);
  const total = blocks.reduce((a, x) => a + x.sessions_total, 0);

  const preview = useMemo(() => {
    if (!bundle) return null;
    const plans = {
      used: planWithdrawal(bundle.enrollments, "used"),
      full: planWithdrawal(bundle.enrollments, "full"),
    };
    const plan = plans[mode];
    const deleted = new Set(plan.deletes);
    const kept = new Map(plan.keep.map((k) => [k.id, k]));
    const nextEnrollments = enrollments
      .filter((e) => !deleted.has(e.id))
      .map((e) => (kept.has(e.id) ? { ...e, price: kept.get(e.id)!.price } : e));
    const nextPayments = payments.map((p) =>
      p.enrollment_id && deleted.has(p.enrollment_id) ? { ...p, enrollment_id: plan.keepId } : p,
    );
    const before = studentLedger(enrollments, payments);
    const after = studentLedger(nextEnrollments, nextPayments);
    return { plans, plan, before, after };
  }, [bundle, mode, enrollments, payments]);

  async function confirm() {
    if (!bundle || !preview || busy) return;
    setBusy(true);
    const { plan } = preview;
    const now = new Date().toISOString();
    const blockIds = bundle.enrollments.map((e) => e.id);
    try {
      // attendance marked today but not yet counted (teacher not checked in) must not consume a cancelled session
      const pending = await supabase.from("attendance").delete().in("enrollment_id", blockIds).eq("counted", false);
      if (pending.error) throw pending.error;
      if (plan.deletes.length && plan.keepId) {
        const moved = await supabase.from("payments").update({ enrollment_id: plan.keepId }).in("enrollment_id", plan.deletes);
        if (moved.error) throw moved.error;
      }
      for (const k of plan.keep) {
        const res = await supabase
          .from("enrollments")
          .update({ sessions_total: k.sessions_total, price: k.price, withdrawn_at: now })
          .eq("id", k.id);
        if (res.error) throw res.error;
      }
      if (plan.deletes.length) {
        const att = await supabase.from("attendance").delete().in("enrollment_id", plan.deletes);
        if (att.error) throw att.error;
        const del = await supabase.from("enrollments").delete().in("id", plan.deletes);
        if (del.error) throw del.error;
      }
    } catch (err) {
      setBusy(false);
      notifyError((err as { message?: string })?.message ?? String(err));
      return;
    }
    setBusy(false);
    toast.success(t("withdrawDone"), { description: `${t("newPackagePrice")}: ${money(plan.newPrice)}` });
    onDone();
  }

  const e = blocks[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserMinus className="size-5 text-destructive" /> {t("withdrawTitle")}
          </DialogTitle>
          <DialogDescription>
            {student.first_name} {student.last_name} · <span dir="ltr">{student.code}</span>
          </DialogDescription>
        </DialogHeader>

        {bundle && preview && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl bg-secondary p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-foreground">{groupLabel(e?.group, pick)}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(bundle.createdAt)} · {money(bundle.price)}
                  </div>
                </div>
                <SessionBar used={used} total={total} />
              </div>
              <Line label={t("sessionsConsumed")} value={`${used} / ${total}`} />
              <Line label={t("sessionsLost")} value={String(Math.max(total - used, 0))} />
              <Line label={t("amountPaid")} value={money(bundle.paidDirect + bundle.fromCredit)} />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">{t("billingChoice")}</div>
              <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
                {(["used", "full"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "rounded-xl border p-3 text-start transition-colors",
                      mode === m ? "border-accent bg-accent/15 ring-2 ring-accent/40" : "border-border hover:bg-muted/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{t(m === "used" ? "chargeUsed" : "chargeFull")}</span>
                      <span className="tabular text-sm font-bold text-foreground">{money(preview.plans[m].newPrice)}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t(m === "used" ? "chargeUsedDesc" : "chargeFullDesc")}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 rounded-xl border p-4 text-sm">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t("afterWithdraw")}</div>
              <Line label={t("newPackagePrice")} value={money(preview.plan.newPrice)} strong />
              <Line
                label={t("debt")}
                value={money(preview.after.debt)}
                tone={preview.after.debt > 0 ? "danger" : "success"}
                strong
              />
              {preview.after.credit > 0 && (
                <Line label={t("creditAfter")} value={`+ ${money(preview.after.credit)}`} tone="success" strong />
              )}
            </div>

            <div className="flex gap-2 rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
              <InfoIcon className="mt-0.5 size-4 shrink-0" />
              <span>
                {t("withdrawSeatNote")}
                {preview.after.credit > preview.before.credit ? ` ${t("withdrawCreditNote")}` : ""}
              </span>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button type="button" variant="destructive" disabled={busy} onClick={confirm}>
                <UserMinus /> {t("withdrawConfirm")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "danger" | "success" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular",
          strong && "font-bold",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-success",
          !tone && "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}
