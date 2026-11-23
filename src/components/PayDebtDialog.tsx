import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Printer, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type TKey } from "@/lib/i18n";
import { notifyError } from "@/lib/errors";
import { validatePayment, type LedgerBundle } from "@/lib/business";
import { groupLabel } from "@/lib/labels";
import type { EnrollmentFull, Payment, Student } from "@/lib/data";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, Field, selectCls } from "@/components/common";
import { cn } from "@/lib/utils";

export type ReceiptData = {
  payment: Payment;
  student: Student;
  description: string;
  total: number;
  previous: number;
  remaining: number;
};

export function useBundleLabel() {
  const { t, pick, fmtDate } = useI18n();
  return (b: LedgerBundle<EnrollmentFull>) => {
    const e = b.enrollments[0];
    const plan = e?.plan ? t(e.plan as TKey) : "";
    return `${groupLabel(e?.group, pick)} — ${plan} · ${fmtDate(b.createdAt)}`;
  };
}

export function PayDebtDialog({
  open,
  onOpenChange,
  student,
  bundles,
  initialKey,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: Student | null;
  bundles: LedgerBundle<EnrollmentFull>[];
  initialKey?: string | null;
  onDone: (r: ReceiptData) => void;
}) {
  const { t, money } = useI18n();
  const label = useBundleLabel();
  const payable = useMemo(() => bundles.filter((b) => b.remaining > 0), [bundles]);
  const [key, setKey] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const start = payable.find((b) => b.key === initialKey) ?? payable[0];
    setKey(start?.key ?? "");
    setAmount(start ? String(start.remaining) : "");
    const id = setTimeout(() => inputRef.current?.select(), 120);
    return () => clearTimeout(id);
    // reset only when the window opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bundle = payable.find((b) => b.key === key);
  const n = amount === "" ? NaN : Number(amount);
  const paidBefore = bundle ? Math.min(bundle.paidDirect, bundle.price) : 0;
  const err = bundle ? validatePayment(n, bundle.remaining) : null;
  const after = bundle ? (err ? bundle.remaining : Math.max(bundle.remaining - n, 0)) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bundle || !student || busy) return;
    const problem = validatePayment(n, bundle.remaining);
    if (problem) {
      toast.warning(t("vTitle"), {
        description: problem === "invalidAmount" ? t("vInvalidAmount") : `${t("vExceedsDebt")} ${money(bundle.remaining)}`,
      });
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    const description = `${t("debtPayment")} — ${label(bundle)}`;
    const { data, error } = await supabase
      .from("payments")
      .insert({ student_id: student.id, enrollment_id: bundle.firstId, amount: n, note: description })
      .select()
      .single();
    setBusy(false);
    if (error) {
      notifyError(error.message);
      return;
    }
    const remaining = Math.max(bundle.remaining - n, 0);
    toast.success(remaining === 0 ? t("debtCleared") : t("paymentSaved"), {
      description: remaining === 0 ? money(n) : `${t("remainingAfter")}: ${money(remaining)}`,
    });
    onDone({
      payment: data,
      student,
      description,
      total: bundle.price,
      previous: bundle.price - bundle.remaining,
      remaining,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-5 text-accent-foreground" /> {t("payDebtTitle")}
          </DialogTitle>
          {student && (
            <DialogDescription>
              {student.first_name} {student.last_name} · <span dir="ltr">{student.code}</span>
            </DialogDescription>
          )}
        </DialogHeader>
        {payable.length === 0 ? (
          <Empty>{t("noDebt")}</Empty>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label={t("plan")}>
              <select
                className={selectCls}
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  const b = payable.find((x) => x.key === e.target.value);
                  setAmount(b ? String(b.remaining) : "");
                }}
              >
                {payable.map((b) => (
                  <option key={b.key} value={b.key}>
                    {label(b)} · {t("debt")}: {money(b.remaining)}
                  </option>
                ))}
              </select>
            </Field>

            {bundle && (
              <div className="space-y-1.5 rounded-xl bg-secondary p-4 text-sm">
                <Line label={t("price")} value={money(bundle.price)} />
                {paidBefore > 0 && <Line label={t("paidBefore")} value={money(paidBefore)} />}
                {bundle.fromCredit > 0 && <Line label={t("coveredByCredit")} value={money(bundle.fromCredit)} />}
                <Line label={t("debtNow")} value={money(bundle.remaining)} strong tone="danger" />
              </div>
            )}

            {bundle && (
              <Field label={t("payingNow")}>
                <Input
                  ref={inputRef}
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={bundle.remaining}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={amount !== "" && !!err}
                  className="text-lg font-semibold tabular"
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" size="sm" variant={n === bundle.remaining ? "default" : "outline"} onClick={() => setAmount(String(bundle.remaining))}>
                    {t("payFull")} · {money(bundle.remaining)}
                  </Button>
                  {bundle.remaining >= 2 && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setAmount(String(Math.round(bundle.remaining / 2)))}>
                      {t("payHalf")} · {money(Math.round(bundle.remaining / 2))}
                    </Button>
                  )}
                </div>
                {amount !== "" && err && (
                  <p className="pt-1 text-xs font-medium text-destructive">
                    {err === "invalidAmount" ? t("vInvalidAmount") : `${t("vExceedsDebt")} ${money(bundle.remaining)}`}
                  </p>
                )}
              </Field>
            )}

            {bundle && (
              <div
                className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-3 text-sm",
                  after === 0 && !err ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10",
                )}
              >
                <span className="font-medium">{t("remainingAfter")}</span>
                <span className="text-base font-bold tabular">{after === 0 && !err ? `${money(0)} ✓` : money(after)}</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" variant="accent" disabled={!bundle || busy || !!err || amount === ""}>
                <Printer /> {t("confirmEnroll")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "danger" }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular", strong ? "font-bold" : "font-medium", tone === "danger" && "text-destructive")}>{value}</span>
    </div>
  );
}
