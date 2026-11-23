import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { IdCard, Search, UserPlus } from "lucide-react";
import { StudentCard } from "@/components/print";
import { BulkCardsDialog } from "@/components/BulkCardsDialog";
import { useI18n } from "@/lib/i18n";
import { useEnrollments, usePayments, useStudents } from "@/lib/data";
import { remainingSessions, studentAgeGroup, studentLedger } from "@/lib/business";
import { ageGroupKey } from "@/lib/labels";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, PageHeader, Panel, Pill } from "@/components/common";
import { StudentForm } from "@/components/StudentForm";

export const Route = createFileRoute("/_authenticated/students/")({
  head: () => ({ meta: [
    { title: "Students — Beyond Words" },
    { name: "description", content: "Student registry." },
    { property: "og:title", content: "Students — Beyond Words" },
    { property: "og:description", content: "Student registry." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: StudentsPage,
});

function StudentsPage() {
  const { t, money } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: students = [], isLoading } = useStudents();
  const { data: enrollments = [] } = useEnrollments();
  const { data: payments = [] } = usePayments();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [bulk, setBulk] = useState(false);

  const filtered = students.filter((s) =>
    `${s.first_name ?? ""} ${s.last_name ?? ""} ${s.code ?? ""} ${s.phone ?? ""} ${s.parent_phone ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title={t("students")}
        subtitle={`${students.length}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulk(true)} disabled={students.length === 0}>
              <IdCard /> {t("bulkPrintCards")}
            </Button>
            <Button variant="accent" onClick={() => setOpen(true)}>
              <UserPlus /> {t("addStudent")}
            </Button>
          </div>
        }
      />
      <Panel>
        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="ps-9" />
        </div>
        {!isLoading && filtered.length === 0 ? (
          <Empty>{t("none")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-start font-medium">{t("student")}</th>
                  <th className="px-3 py-2 text-center font-medium">{t("code")}</th>
                  <th className="px-3 py-2 text-center font-medium">{t("parentPhone")}</th>
                  <th className="px-3 py-2 text-center font-medium">{t("ageGroup")}</th>
                  <th className="px-3 py-2 text-center font-medium">{t("sessionsLeft")}</th>
                  <th className="px-3 py-2 text-center font-medium">{t("accountCol")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const mine = enrollments.filter((e) => e && e.student_id === s.id);
                  const left = mine.reduce((a, e) => a + remainingSessions(e), 0);
                  const acc = studentLedger(mine, payments.filter((p) => p && p.student_id === s.id));
                  return (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2.5">
                        <Link to="/students/$id" params={{ id: s.id }} className="flex items-center gap-3">
                          <div className="size-9 shrink-0 overflow-hidden rounded-full bg-muted">
                            {s.photo_url ? (
                              <img src={s.photo_url} alt="" className="size-full object-cover" />
                            ) : (
                              <div className="flex size-full items-center justify-center text-xs font-bold text-muted-foreground">
                                {s.first_name?.[0] ?? "—"}
                              </div>
                            )}
                          </div>
                          <span className="font-medium text-foreground">
                            {s.first_name} {s.last_name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-xs">{s.code}</td>
                      <td className="px-3 py-2.5 text-center tabular" dir="ltr">{s.parent_phone || "—"}</td>
                      <td className="px-3 py-2.5 text-center tabular" dir="rtl"><bdi dir="rtl">{(() => { const k = ageGroupKey(studentAgeGroup(s)); return k ? t(k) : "—"; })()}</bdi></td>
                      <td className="py-2.5 text-center">
                        {mine.length === 0 ? (
                          <Pill>{t("noActivePackage")}</Pill>
                        ) : left <= 0 && mine.every((e) => e.withdrawn_at) ? (
                          <Pill>{t("withdrawn")}</Pill>
                        ) : (
                          <Pill tone={left <= 0 ? "danger" : left <= 1 ? "warning" : "success"}>{left}</Pill>
                        )}
                      </td>
                      <td className="py-2.5 text-center">
                        {acc.debt > 0 ? (
                          <Pill tone="danger">
                            {t("debt")}: {money(acc.debt)}
                          </Pill>
                        ) : acc.credit > 0 ? (
                          <Pill tone="accent">
                            {t("credit")}: {money(acc.credit)}
                          </Pill>
                        ) : mine.length > 0 ? (
                          <Pill tone="success">{t("settled")}</Pill>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <BulkCardsDialog
        open={bulk}
        onOpenChange={setBulk}
        title={t("bulkPrintCards")}
        items={filtered.map((s) => ({ ...s, label: `${s.last_name ?? ""} ${s.first_name ?? ""}`.trim(), sub: s.code ?? "" }))}
        render={(s) => <StudentCard student={s} />}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto sm:rounded-2xl p-5 shadow-2xl">
          <DialogHeader>
            <DialogTitle>{t("addStudent")}</DialogTitle>
          </DialogHeader>
          <StudentForm
            onSaved={(s) => {
              setOpen(false);
              qc.invalidateQueries();
              navigate({ to: "/students/$id", params: { id: s.id } });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
