import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Hourglass, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { confirmAction } from "@/lib/confirm";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useGroups, useWaitingList } from "@/lib/data";
import { WAITLIST_READY, buildAutoGroupName, waitlistBuckets } from "@/lib/business";
import { ageGroupKey } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Empty, PageHeader, Panel, Pill } from "@/components/common";
import { WaitlistDialog } from "@/components/WaitlistDialog";
import { GroupDialog, type GroupPreset } from "@/components/GroupDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/waiting")({
  head: () => ({ meta: [
    { title: "Waiting list — Beyond Words" },
    { name: "description", content: "Students waiting for a new group, by subject and age category." },
    { property: "og:title", content: "Waiting list — Beyond Words" },
    { property: "og:description", content: "Students waiting for a new group, by subject and age category." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: WaitingPage,
});

function WaitingPage() {
  const { t, pick, fmtDate } = useI18n();
  const qc = useQueryClient();
  const { data: waiting = [], isLoading } = useWaitingList();
  const { data: groups = [] } = useGroups();
  const [open, setOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [cohortPreset, setCohortPreset] = useState<GroupPreset | null>(null);
  const [openBuckets, setOpenBuckets] = useState<Record<string, boolean>>({});
  const toggleBucket = (k: string) => setOpenBuckets((prev) => ({ ...prev, [k]: !prev[k] }));
  const buckets = waitlistBuckets(waiting);

  async function remove(id: string, name: string) {
    if (!(await confirmAction({ title: t("removeFromWaiting"), message: name, hint: t("removeWaitingMsg"), confirmLabel: t("delete") }))) return;
    const { error } = await supabase.from("waiting_list").delete().eq("id", id);
    if (error) { notifyError(error.message); return; }
    toast.success(t("updatedOk"));
    qc.invalidateQueries({ queryKey: ["waiting_list"] });
  }

  return (
    <div>
      <PageHeader
        title={t("waitingList")}
        subtitle={t("waitingSubtitle").replace("{n}", String(WAITLIST_READY))}
        actions={
          <Button variant="accent" onClick={() => setOpen(true)}>
            <Plus /> {t("addToWaitingList")}
          </Button>
        }
      />
      {!isLoading && buckets.length === 0 ? (
        <Panel>
          <Empty>{t("none")}</Empty>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {buckets.map((b) => {
            const first = b.entries[0]!;
            const ag = ageGroupKey(first.age_group);
            const pct = Math.min(100, (b.count / WAITLIST_READY) * 100);
            return (
              <section key={b.key} className={cn("rounded-xl border bg-card shadow-card", b.ready && "border-success ring-1 ring-success/40")}>
                <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-foreground">
                      {first.subject ? pick(first.subject.name_ar, first.subject.name_en) : "—"}
                      {first.level ? ` · ${first.level.code}` : first.age_group ? ` · ${first.age_group}` : ""}
                    </h2>
                    <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
                      <Pill tone={first.activity === "levels" ? "success" : first.activity === "workshop" ? "accent" : "default"}>{t(first.activity as "support")}</Pill>
                      <Pill tone="accent" dir="rtl"><bdi dir="rtl">{ag ? t(ag) : t("noAgeGroup")}</bdi></Pill>
                      {first.level && <Pill tone="warning">{first.level.code}</Pill>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-sm font-bold tabular text-foreground">
                    <Users className="size-4 text-muted-foreground" />
                    {b.count}/{WAITLIST_READY}
                  </div>
                </div>
                <div className="space-y-3 p-5">
                  {b.ready ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-success/40 bg-success/10 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="size-5 shrink-0 text-success" />
                        <div>
                          <div className="font-semibold text-success">{t("groupReady")}</div>
                          <div className="text-muted-foreground">{t("groupReadyMsg").replace("{n}", String(b.count))}</div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="accent"
                        className="shrink-0 gap-1.5"
                        onClick={() => {
                          const sub = first.subject ? pick(first.subject.name_ar, first.subject.name_en) : "";
                          const lvl = first.level ? first.level.code : "";
                          const autoName =
                            buildAutoGroupName({
                              subjectName: sub,
                              ageGroup: first.age_group,
                              levelCode: lvl,
                              activity: first.activity,
                              existingNames: groups.map((g) => g.name),
                            }) || t("group");
                          const studentIds = b.entries.map((w) => w.student_id).filter(Boolean);
                          const waitlistIds = b.entries.map((w) => w.id).filter(Boolean);

                          setCohortPreset({
                            name: autoName,
                            activity: first.activity,
                            subject_id: first.subject_id ?? "",
                            age_group: first.age_group ?? "",
                            level_id: first.level_id ?? "",
                            student_ids: studentIds,
                            waitlist_ids: waitlistIds,
                          });
                          setGroupOpen(true);
                        }}
                      >
                        <Plus className="size-3.5" />
                        {t("createGroupNow")}
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Hourglass className="size-3.5" />
                        {t("stillNeeded").replace("{n}", String(WAITLIST_READY - b.count))}
                      </div>
                    </div>
                  )}
                  <div className="rounded-xl border border-input/60 bg-muted/20 overflow-hidden transition-all">
                    <button
                      type="button"
                      onClick={() => toggleBucket(b.key)}
                      className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="size-4 text-accent" />
                        <span>
                          {t("studentsList")} ({b.entries.length})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-normal">
                        <span>{openBuckets[b.key] ? t("hideList") : t("showList")}</span>
                        <ChevronDown className={cn("size-4 transition-transform duration-200", openBuckets[b.key] && "rotate-180")} />
                      </div>
                    </button>
                    {openBuckets[b.key] && (
                      <ul className="divide-y border-t bg-card/60 px-3 py-1">
                        {b.entries.map((w, i) => {
                          const name = `${w.student?.first_name ?? ""} ${w.student?.last_name ?? ""}`.trim();
                          return (
                            <li key={w.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span className="w-5 text-center font-bold tabular text-muted-foreground">{i + 1}</span>
                                <div className="min-w-0">
                                  <Link to="/students/$id" params={{ id: w.student_id }} className="truncate font-medium text-foreground hover:underline">
                                    {name || "—"}
                                  </Link>
                                  <div className="truncate text-[11px] text-muted-foreground">
                                    {t("addedOn")} {fmtDate(w.created_at)}
                                    {w.note ? ` · ${w.note}` : ""}
                                  </div>
                                </div>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => remove(w.id, name)}
                                aria-label={t("removeFromWaiting")}
                                title={t("removeFromWaiting")}
                              >
                                <Trash2 className="size-3.5 text-destructive" />
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
      <WaitlistDialog open={open} onOpenChange={setOpen} />
      <GroupDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        preset={cohortPreset}
      />
    </div>
  );
}
