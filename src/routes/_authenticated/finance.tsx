import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Banknote, Plus, Printer, Receipt, Trash2, TrendingUp, Wallet } from "lucide-react";
import { notifyError } from "@/lib/errors";
import { confirmAction } from "@/lib/confirm";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, type TKey } from "@/lib/i18n";
import { isThisMonth, useEnrollments, useExpenses, usePayments, usePayouts, useSettings, useStudents, type Payment, type Student } from "@/lib/data";
import { PayDebtDialog, type ReceiptData } from "@/components/PayDebtDialog";
import { receiptFigures, remainingSessions, studentLedger } from "@/lib/business";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, Field, PageHeader, Panel, Pill, StatCard, selectCls } from "@/components/common";
import { PaymentReceipt, PrintDialog } from "@/components/print";

export const Route = createFileRoute("/_authenticated/finance")({
  head: () => ({ meta: [
    { title: "Finance — Beyond Words" },
    { name: "description", content: "Debts, receipts and expenses." },
    { property: "og:title", content: "Finance — Beyond Words" },
    { property: "og:description", content: "Debts, receipts and expenses." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Finance,
});

const CATEGORIES: TKey[] = ["rent", "utilities", "supplies", "salaries", "other"];
const todayStr = () => new Date().toLocaleDateString("en-CA");

function Finance() {
  const { t, money, fmtDate } = useI18n();
  const qc = useQueryClient();
  const { data: payments = [] } = usePayments();
  const { data: expenses = [] } = useExpenses();
  const { data: payouts = [] } = usePayouts();
  const { data: students = [] } = useStudents();
  const { data: enrollments = [] } = useEnrollments();
  const { data: settings } = useSettings();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [payFor, setPayFor] = useState<Student | null>(null);
  const [exp, setExp] = useState({ category: "", description: "", amount: "", spent_on: todayStr() });

  const income = payments.filter((p) => isThisMonth(p.created_at)).reduce((s, p) => s + Number(p.amount), 0);
  const monthExp = expenses.filter((e) => isThisMonth(e.spent_on)).reduce((s, e) => s + Number(e.amount), 0);
  const monthPay = payouts.filter((p) => isThisMonth(p.created_at)).reduce((s, p) => s + Number(p.amount), 0);
  const net = income - monthExp - monthPay;

  const accounts = useMemo(
    () =>
      new Map(
        students.map((s) => {
          const mine = enrollments.filter((e) => e.student_id === s.id);
          const pays = payments.filter((p) => p.student_id === s.id);
          return [s.id, { mine, pays, ledger: studentLedger(mine, pays) }] as const;
        }),
      ),
    [students, enrollments, payments],
  );

  const debts = students
    .map((s) => {
      const a = accounts.get(s.id)!;
      const left = a.mine.reduce((x, e) => x + remainingSessions(e), 0);
      const withdrawn = a.mine.length > 0 && a.mine.every((e) => e.withdrawn_at);
      return { s, outstanding: a.ledger.debt, left, has: a.mine.length > 0, withdrawn };
    })
    .filter((d) => d.has && (d.outstanding > 0 || (d.left <= 0 && !d.withdrawn)))
    .sort((a, b) => b.outstanding - a.outstanding);
  const totalDebt = debts.reduce((x, d) => x + d.outstanding, 0);

  function printPayment(p: Payment & { student: Student | null }) {
    if (!p.student) return;
    const a = accounts.get(p.student_id);
    const f = a ? receiptFigures(p, a.mine, a.pays) : { total: Number(p.amount), previous: 0, remaining: 0 };
    setReceipt({ payment: p, student: p.student, description: p.note ?? "", ...f });
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("expenses").insert({
      category: exp.category,
      description: exp.description || null,
      amount: Number(exp.amount),
      spent_on: exp.spent_on || todayStr(),
    });
    if (error) { notifyError(error.message); return; }
    setExp({ category: "", description: "", amount: "", spent_on: todayStr() });
    qc.invalidateQueries();
  }

  async function delExpense(id: string) {
    if (!(await confirmAction({ title: t("confirmDeleteTitle"), message: t("confirmDelete"), hint: t("confirmDeleteHint"), confirmLabel: t("delete") }))) return;
    await supabase.from("expenses").delete().eq("id", id);
    qc.invalidateQueries();
  }

  return (
    <div>
      <PageHeader title={t("finance")} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("monthlyIncome")} value={money(income)} icon={Banknote} tone="success" />
        <StatCard label={t("monthExpenses")} value={money(monthExp)} icon={Receipt} tone="warning" />
        <StatCard label={t("monthPayouts")} value={money(monthPay)} icon={Wallet} />
        <StatCard label={t("netProfit")} value={money(net)} icon={TrendingUp} tone="accent" />
      </div>

      <Tabs defaultValue="debts">
        <TabsList className="mb-4">
          <TabsTrigger value="debts">{t("debts")}</TabsTrigger>
          <TabsTrigger value="receipts">{t("receipts")}</TabsTrigger>
          <TabsTrigger value="expenses">{t("expenses")}</TabsTrigger>
        </TabsList>

        <TabsContent value="debts">
          <Panel
            title={`${t("debts")} (${debts.length})`}
            actions={
              totalDebt > 0 ? (
                <Pill tone="danger">
                  {t("totalDebts")}: {money(totalDebt)}
                </Pill>
              ) : undefined
            }
          >
            {debts.length === 0 ? (
              <Empty>{t("none")}</Empty>
            ) : (
              <ul className="divide-y">
                {debts.map((d) => (
                  <li key={d.s.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <Link to="/students/$id" params={{ id: d.s.id }}>
                      <div className="font-medium text-foreground">
                        {d.s.first_name} {d.s.last_name}
                      </div>
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {d.s.code} · {d.s.parent_phone ?? ""}
                      </div>
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                      {d.left <= 0 && <Pill tone="warning">{t("exhausted")}</Pill>}
                      {d.outstanding > 0 && (
                        <>
                          <Pill tone="danger">
                            {t("debt")}: {money(d.outstanding)}
                          </Pill>
                          <Button size="sm" variant="outline" onClick={() => setPayFor(d.s)}>
                            <Wallet /> {t("payDebt")}
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="receipts">
          <Panel title={t("receipts")}>
            {payments.length === 0 ? (
              <Empty>{t("none")}</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 text-center font-medium">{t("receiptNo")}</th>
                      <th className="py-2 text-center font-medium">{t("date")}</th>
                      <th className="py-2 text-center font-medium">{t("student")}</th>
                      <th className="py-2 text-center font-medium">{t("description")}</th>
                      <th className="py-2 text-end font-medium">{t("amount")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2 text-center font-mono">#{p.receipt_no}</td>
                        <td className="py-2 text-center tabular">{fmtDate(p.created_at)}</td>
                        <td className="py-2 text-center">
                          {p.student?.first_name} {p.student?.last_name}
                        </td>
                        <td className="max-w-[240px] truncate py-2 text-center text-muted-foreground">{p.note}</td>
                        <td className="py-2 text-end font-semibold tabular">{money(p.amount)}</td>
                        <td className="py-2 text-end">
                          <Button size="icon" variant="ghost" onClick={() => printPayment(p)} aria-label={t("print")}>
                            <Printer />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="expenses">
          <Panel title={t("expenses")}>
            <form onSubmit={addExpense} className="mb-5 grid gap-3 rounded-xl bg-secondary p-4 md:grid-cols-5 md:items-end">
              <Field label={t("category")}>
                <Input
                  required
                  placeholder={t("category")}
                  value={exp.category}
                  onChange={(e) => setExp({ ...exp, category: e.target.value })}
                />
              </Field>
              <Field label={t("description")}>
                <Input value={exp.description} onChange={(e) => setExp({ ...exp, description: e.target.value })} />
              </Field>
              <Field label={t("amount")}>
                <Input required type="number" min={0} value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} />
              </Field>
              <Field label={t("date")}>
                <Input type="date" value={exp.spent_on} onChange={(e) => setExp({ ...exp, spent_on: e.target.value })} />
              </Field>
              <Button type="submit" variant="accent">
                <Plus /> {t("addExpense")}
              </Button>
            </form>
            {expenses.length === 0 ? (
              <Empty>{t("none")}</Empty>
            ) : (
              <ul className="divide-y">
                {expenses.map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <div className="font-medium text-foreground">
                        {CATEGORIES.includes(e.category as TKey) ? t(e.category as TKey) : e.category}
                        {e.description ? ` — ${e.description}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground tabular">{fmtDate(e.spent_on)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular text-foreground">{money(e.amount)}</span>
                      <Button size="icon" variant="ghost" onClick={() => delExpense(e.id)} aria-label={t("delete")}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <PayDebtDialog
        open={!!payFor}
        onOpenChange={(o) => !o && setPayFor(null)}
        student={payFor}
        bundles={payFor ? (accounts.get(payFor.id)?.ledger.bundles ?? []) : []}
        onDone={(r) => {
          setPayFor(null);
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
            student={receipt.student}
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
