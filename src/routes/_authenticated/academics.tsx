import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ClipboardCheck, Save, Pencil, X, IdCard, Hourglass, Users, Calendar, DoorClosed, User, AlertTriangle } from "lucide-react";
import { PrintDialog, TeacherCard, type CardTeacher } from "@/components/print";
import { BulkCardsDialog } from "@/components/BulkCardsDialog";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { confirmAction } from "@/lib/confirm";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useEnrollments, useGroups, useLevels, useRooms, useSettings, useSubjects, useTeachers, useWaitingList } from "@/lib/data";
import { AGE_GROUPS, GROUP_CAPACITY, WAITLIST_READY, audienceForAgeGroup, buildAutoGroupName, groupSeat, groupStudentIds, waitlistBuckets } from "@/lib/business";
import { ageGroupKey, subjectName } from "@/lib/labels";
import { findGroupConflicts } from "@/lib/schedule";
import { findDuplicateLabel, findDuplicateTeacher, hasLetters, isValidPhone } from "@/lib/duplicates";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GroupDialog, type GroupPreset } from "@/components/GroupDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, Field, PageHeader, Panel, Pill, TimeField, selectCls } from "@/components/common";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/academics")({
  head: () => ({ meta: [
    { title: "Courses & Groups — Beyond Words" },
    { name: "description", content: "Subjects, rooms, teachers and groups." },
    { property: "og:title", content: "Courses & Groups — Beyond Words" },
    { property: "og:description", content: "Subjects, rooms, teachers and groups." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Academics,
});

function useDelete() {
  const qc = useQueryClient();
  const { t } = useI18n();
  return async (table: "subjects" | "rooms" | "teachers" | "groups" | "levels", id: string) => {
    const hint = table === "groups" ? `${t("groupDeleteHint")} ${t("confirmDeleteHint")}` : t("confirmDeleteHint");
    if (!(await confirmAction({ title: t("confirmDeleteTitle"), message: t("confirmDelete"), hint, confirmLabel: t("delete") }))) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { notifyError(error.message); return; }
    qc.invalidateQueries();
  };
}

function EditBtn({ onClick, active }: { onClick: () => void; active?: boolean }) {
  const { t } = useI18n();
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={onClick}
      aria-label={t("edit")}
      title={t("edit")}
      className={active ? "bg-accent/15 text-accent-foreground" : "text-muted-foreground hover:text-foreground"}
    >
      <Pencil />
    </Button>
  );
}

function FormActions({ editing, addLabel, onCancel }: { editing: boolean; addLabel: string; onCancel: () => void }) {
  const { t } = useI18n();
  if (!editing)
    return (
      <Button type="submit" variant="accent">
        <Plus /> {addLabel}
      </Button>
    );
  return (
    <div className="flex shrink-0 gap-2">
      <Button type="submit" variant="accent" className="shrink-0">
        <Save /> {t("saveChanges")}
      </Button>
      <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={onCancel} aria-label={t("cancel")} title={t("cancel")}>
        <X />
      </Button>
    </div>
  );
}

function focusForm(el: HTMLFormElement | null) {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => el.querySelector<HTMLInputElement>("input")?.focus(), 250);
}

const editRing = "ring-2 ring-accent ring-offset-2 ring-offset-background";

function Academics() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader title={t("academics")} />
      <Tabs defaultValue="groups">
        <TabsList className="mb-4 h-auto flex-wrap">
          <TabsTrigger value="groups">{t("groups")}</TabsTrigger>
          <TabsTrigger value="subjects">{t("subjects")}</TabsTrigger>
          <TabsTrigger value="rooms">{t("rooms")}</TabsTrigger>
          <TabsTrigger value="teachers">{t("teachers")}</TabsTrigger>
          <TabsTrigger value="levels">{t("levelsPricing")}</TabsTrigger>
        </TabsList>
        <TabsContent value="groups">
          <GroupsTab />
        </TabsContent>
        <TabsContent value="subjects">
          <SubjectsTab />
        </TabsContent>
        <TabsContent value="rooms">
          <RoomsTab />
        </TabsContent>
        <TabsContent value="teachers">
          <TeachersTab />
        </TabsContent>
        <TabsContent value="levels">
          <LevelsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GroupsTab() {
  const { t, tg, pick, day, money } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const del = useDelete();
  const { data: groups = [] } = useGroups();
  const { data: subjects = [] } = useSubjects();
  const { data: teachers = [] } = useTeachers();
  const { data: rooms = [] } = useRooms();
  const { data: levels = [] } = useLevels();
  const { data: enrollments = [] } = useEnrollments();
  const { data: settings } = useSettings();
  const { data: waiting = [] } = useWaitingList();
  const waitBuckets = useMemo(() => waitlistBuckets(waiting), [waiting]);
  const todayStr = () => new Date().toLocaleDateString("en-CA");

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<(typeof groups)[number] | null>(null);
  const [groupPreset, setGroupPreset] = useState<GroupPreset | null>(null);

  function openAdd(preset?: GroupPreset) {
    setEditGroup(null);
    setGroupPreset(preset ?? null);
    setGroupDialogOpen(true);
  }

  function openEdit(g: (typeof groups)[number]) {
    setGroupPreset(null);
    setEditGroup(g);
    setGroupDialogOpen(true);
  }

  return (
    <Panel
      title={t("groups")}
      actions={
        <Button size="sm" variant="accent" onClick={() => openAdd()}>
          <Plus /> {t("addGroup")}
        </Button>
      }
    >
      {groups.length === 0 ? (
        <Empty>{t("none")}</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const count = groupStudentIds(g.activity, enrollments.filter((e) => e.group_id === g.id)).size;
            const full = count >= GROUP_CAPACITY;
            const sub = subjectName(g, pick);
            const hasSubInName = sub && g.name.toLowerCase().includes(sub.toLowerCase());
            const roomName = g.room ? pick(g.room.name_ar, g.room.name_en) : "—";
            const timeStr = g.activity === "workshop"
              ? `${g.workshop_date ?? "—"}${g.start_time ? ` · ${g.start_time.slice(0, 5)}` : ""}`
              : `${day(g.day_of_week)} ${g.start_time?.slice(0, 5) ?? ""}${g.end_time ? `–${g.end_time.slice(0, 5)}` : ""}`;
            const ag = ageGroupKey(g.age_group);
            const groupConflicts = findGroupConflicts(g, groups);

            return (
              <div
                key={g.id}
                className={cn(
                  "rounded-xl border bg-card p-3.5 shadow-sm hover:shadow transition-all flex flex-col justify-between gap-2.5",
                  groupConflicts.length > 0 && "border-destructive/60 ring-1 ring-destructive/40"
                )}
              >
                {/* Header: Badges on top, full natural title below (no BiDi truncation or text jumping) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Pill
                        tone={g.activity === "workshop" ? "accent" : g.activity === "levels" ? "success" : "default"}
                        className="text-[10px] font-semibold px-2 py-0.5 whitespace-nowrap"
                      >
                        {g.activity === "levels" ? "لغات ومستويات" : t(g.activity as "support")}
                      </Pill>
                      {ag && (
                        <span
                          dir="rtl"
                          className="rounded-md border border-input/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap"
                        >
                          <bdi dir="rtl">{t(ag)}</bdi>
                        </span>
                      )}
                      {groupConflicts.length > 0 && (
                        <Pill tone="danger" className="text-[10px] font-bold gap-1 px-2 py-0.5 whitespace-nowrap" title={t("conflictBadge")}>
                          <AlertTriangle className="size-3 shrink-0" />
                          {t("conflictBadge")}
                        </Pill>
                      )}
                    </div>
                    {g.activity === "workshop" && (
                      <span className="font-bold text-accent text-xs tabular shrink-0">{money(g.price)}</span>
                    )}
                  </div>
                  <h4 dir="rtl" className="font-bold text-sm text-foreground leading-snug break-words">
                    <bdi dir="rtl">{g.name}</bdi>
                  </h4>
                  {!hasSubInName && sub && (
                    <div className="text-xs text-muted-foreground">
                      {sub} {g.level?.code ? `· ${g.level.code}` : ""}
                    </div>
                  )}
                </div>

                {/* Details Grid: 2 columns, clean icons, no repetition */}
                <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground pt-1 border-t border-border/40">
                  <div className="flex items-center gap-1.5 min-w-0" title={g.teacher?.full_name ?? "—"}>
                    <User className="size-3.5 shrink-0 text-muted-foreground/80" />
                    <span className="truncate whitespace-nowrap">{g.teacher?.full_name ?? "—"}</span>
                  </div>

                  <div className="flex items-center gap-1.5 min-w-0" title={roomName}>
                    <DoorClosed className="size-3.5 shrink-0 text-muted-foreground/80" />
                    <span className="truncate whitespace-nowrap">{roomName}</span>
                  </div>

                  <div className="flex items-center gap-1.5 min-w-0" title={timeStr}>
                    <Calendar className="size-3.5 shrink-0 text-muted-foreground/80" />
                    <span className="truncate whitespace-nowrap font-mono text-[11px]">{timeStr}</span>
                  </div>

                  <div className="flex items-center gap-1.5 min-w-0">
                    <Users className="size-3.5 shrink-0 text-muted-foreground/80" />
                    <span className="tabular font-medium text-foreground whitespace-nowrap">
                      {count}/{GROUP_CAPACITY} {t("studentsUnit")}
                    </span>
                  </div>
                </div>

                {/* Progress bar and capacity status */}
                <div className="space-y-1 pt-0.5">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        full ? "bg-destructive" : count >= GROUP_CAPACITY - 2 ? "bg-warning" : "bg-success"
                      )}
                      style={{ width: `${Math.min(100, (count / GROUP_CAPACITY) * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="tabular text-muted-foreground">
                      {full ? (
                        <span className="font-semibold text-destructive">{t("groupFull")}</span>
                      ) : (
                        <span>{GROUP_CAPACITY - count} {t("seatsLeft")}</span>
                      )}
                    </span>
                    {g.activity === "workshop" && (
                      <span className="font-bold text-accent tabular">{money(g.price)}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-0.5 border-t border-border/50">
                  <Button asChild size="sm" variant="outline" className="h-8 flex-1 text-xs gap-1.5 font-medium">
                    <Link to="/groups/$id" params={{ id: g.id }}>
                      <ClipboardCheck className="size-3.5" /> {t("takeAttendance")}
                    </Link>
                  </Button>
                  <EditBtn onClick={() => openEdit(g)} />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => del("groups", g.id)}
                    aria-label={t("delete")}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {waitBuckets.length > 0 && (
        <div className="mt-8 border-t pt-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Hourglass className="size-4 text-accent" />
                {t("waitingGroups")} ({waitBuckets.length})
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("waitingSubtitle").replace("{n}", String(WAITLIST_READY))}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/waiting">
                {t("waitingList")} ({waiting.length})
              </Link>
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {waitBuckets.map((b) => {
              const first = b.entries[0]!;
              const ag = ageGroupKey(first.age_group);
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
              return (
                <div
                  key={b.key}
                  onClick={() => navigate({ to: "/waiting" })}
                  className={cn(
                    "rounded-xl border bg-background p-4 flex flex-col justify-between shadow-sm cursor-pointer transition-all hover:border-accent hover:shadow-md group",
                    b.ready && "border-success ring-1 ring-success/40",
                  )}
                  title={t("waitingList")}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate group-hover:text-accent transition-colors">
                          {sub || "—"} {lvl ? `· ${lvl}` : first.age_group ? `· ${first.age_group}` : ""}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1 text-xs">
                          <Pill tone={first.activity === "levels" ? "success" : first.activity === "workshop" ? "accent" : "default"}>
                            {t(first.activity as "support")}
                          </Pill>
                          <Pill tone="accent" dir="rtl"><bdi dir="rtl">{ag ? t(ag) : t("noAgeGroup")}</bdi></Pill>
                          {first.level && <Pill tone="warning">{first.level.code}</Pill>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-bold text-sm tabular text-foreground shrink-0">
                        <Users className="size-4 text-muted-foreground" />
                        {b.count}/{WAITLIST_READY}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2">
                    <Button
                      size="sm"
                      variant={b.ready ? "accent" : "outline"}
                      className="w-full gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAdd({
                          name: autoName,
                          activity: first.activity,
                          subject_id: first.subject_id ?? "",
                          age_group: first.age_group ?? "",
                          level_id: first.level_id ?? "",
                          student_ids: studentIds,
                          waitlist_ids: waitlistIds,
                        });
                      }}
                    >
                      <Plus className="size-3.5" />
                      {t("createGroupNow")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <GroupDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        group={editGroup}
        preset={groupPreset}
      />
    </Panel>
  );
}

function SubjectsTab() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const del = useDelete();
  const { data: subjects = [] } = useSubjects();
  const [f, setF] = useState({ name_ar: "", name_en: "" });
  const [acts, setActs] = useState<string[]>(["levels"]);
  const [editId, setEditId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function reset() {
    setF({ name_ar: "", name_en: "" });
    setActs(["levels"]);
    setEditId(null);
  }

  function startEdit(s: (typeof subjects)[number]) {
    setEditId(s.id);
    setF({ name_ar: s.name_ar, name_en: s.name_en });
    setActs([...s.activities]);
    focusForm(formRef.current);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const row = { name_ar: f.name_ar.trim(), name_en: f.name_en.trim(), activities: acts };
    const clash = findDuplicateLabel({ id: editId, labels: [row.name_ar, row.name_en] }, subjects, (x) => [x.name_ar, x.name_en]);
    if (clash) { toast.error(t("dupTitle"), { id: "duplicate", description: t("dupSubject").replace("{name}", clash.name_ar) }); return; }
    const { error } = editId
      ? await supabase.from("subjects").update(row).eq("id", editId)
      : await supabase.from("subjects").insert(row);
    if (error) { notifyError(error.message); return; }
    toast.success(editId ? t("updatedOk") : t("saved"));
    reset();
    qc.invalidateQueries();
  }

  return (
    <Panel title={t("subjects")}>
      <form ref={formRef} onSubmit={add} onKeyDown={(e) => e.key === "Escape" && editId && reset()} className={`mb-5 grid gap-3 rounded-xl bg-secondary p-4 transition-shadow md:grid-cols-[minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(0,auto)_auto] md:items-end ${editId ? editRing : ""}`}>
        <Field label={t("nameAr")}>
          <Input required dir="rtl" value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} placeholder="الإنجليزية" />
        </Field>
        <Field label={t("nameEn")}>
          <Input required dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} placeholder="EN" />
        </Field>
        <div className="flex flex-wrap gap-3 text-sm">
          {(["support", "levels", "workshop"] as const).map((a) => (
            <label key={a} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={acts.includes(a)}
                onChange={(e) => setActs(e.target.checked ? [...acts, a] : acts.filter((x) => x !== a))}
              />
              {t(a)}
            </label>
          ))}
        </div>
        <FormActions editing={!!editId} addLabel={t("addSubject")} onCancel={reset} />
      </form>
      <ul className="divide-y">
        {subjects.map((s) => (
          <li key={s.id} className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors ${editId === s.id ? "bg-accent/10" : ""}`}>
            <div>
              <div className="font-medium text-foreground">
                {s.name_ar} · <span dir="ltr">{s.name_en}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {s.activities.map((a) => (
                  <Pill key={a}>{t(a as "support")}</Pill>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <EditBtn active={editId === s.id} onClick={() => startEdit(s)} />
              <Button size="icon" variant="ghost" onClick={() => del("subjects", s.id)} aria-label={t("delete")}>
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function RoomsTab() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const del = useDelete();
  const { data: rooms = [] } = useRooms();
  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar", { numeric: true })),
    [rooms],
  );
  const [f, setF] = useState({ name_ar: "", name_en: "", capacity: "15", notes: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function reset() {
    setF({ name_ar: "", name_en: "", capacity: "15", notes: "" });
    setEditId(null);
  }

  function startEdit(r: (typeof rooms)[number]) {
    setEditId(r.id);
    setF({ name_ar: r.name_ar, name_en: r.name_en, capacity: String(r.capacity), notes: r.notes ?? "" });
    focusForm(formRef.current);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const row = { ...f, name_ar: f.name_ar.trim(), name_en: f.name_en.trim(), capacity: Number(f.capacity) || 15, notes: f.notes.trim() || null };
    const clash = findDuplicateLabel({ id: editId, labels: [row.name_ar, row.name_en] }, rooms, (x) => [x.name_ar, x.name_en]);
    if (clash) { toast.error(t("dupTitle"), { id: "duplicate", description: t("dupRoom").replace("{name}", clash.name_ar) }); return; }
    const { error } = editId
      ? await supabase.from("rooms").update(row).eq("id", editId)
      : await supabase.from("rooms").insert(row);
    if (error) { notifyError(error.message); return; }
    toast.success(editId ? t("updatedOk") : t("saved"));
    reset();
    qc.invalidateQueries();
  }

  return (
    <Panel title={t("rooms")}>
      <form ref={formRef} onSubmit={add} onKeyDown={(e) => e.key === "Escape" && editId && reset()} className={`mb-5 grid gap-3 rounded-xl bg-secondary p-4 transition-shadow md:grid-cols-[repeat(5,minmax(0,1fr))_auto] md:items-end ${editId ? editRing : ""}`}>
        <Field label={t("nameAr")}>
          <Input required value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} placeholder="قاعة 5" />
        </Field>
        <Field label={t("nameEn")}>
          <Input required dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} placeholder="Room 5" />
        </Field>
        <Field label={t("capacity")}>
          <Input type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
        </Field>
        <Field label={t("notes")}>
          <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <FormActions editing={!!editId} addLabel={t("addRoom")} onCancel={reset} />
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sortedRooms.map((r) => (
          <div key={r.id} className={`flex items-start justify-between rounded-xl border bg-background p-4 transition-shadow ${editId === r.id ? "border-accent " + editRing : ""}`}>
            <div>
              <div className="font-semibold text-foreground">{r.name_ar}</div>
              <div className="text-sm text-muted-foreground" dir="ltr">
                {r.name_en}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {t("capacity")}: <span className="tabular">{r.capacity}</span>
              </div>
              {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
            </div>
            <div className="flex items-center">
              <EditBtn active={editId === r.id} onClick={() => startEdit(r)} />
              <Button size="icon" variant="ghost" onClick={() => del("rooms", r.id)} aria-label={t("delete")}>
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TeachersTab() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const del = useDelete();
  const { data: teachers = [] } = useTeachers();
  const { data: settings } = useSettings();
  const [f, setF] = useState({ last_name: "", first_name: "", phone: "", amount: "500", gender: "male" });
  const [editId, setEditId] = useState<string | null>(null);
  const [cardFor, setCardFor] = useState<CardTeacher | null>(null);
  const [bulk, setBulk] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function reset() {
    setF({ last_name: "", first_name: "", phone: "", amount: "500", gender: "male" });
    setEditId(null);
  }

  function startEdit(tc: (typeof teachers)[number]) {
    setEditId(tc.id);
    setF({
      last_name: tc.last_name,
      first_name: tc.first_name,
      phone: tc.phone ?? "",
      amount: String(tc.percentage || 500),
      gender: tc.gender ?? "male",
    });
    focusForm(formRef.current);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const row = {
      last_name: f.last_name.trim(),
      first_name: f.first_name.trim(),
      full_name: `${f.last_name.trim()} ${f.first_name.trim()}`,
      phone: f.phone.trim() || null,
      gender: f.gender,
      percentage: Number(f.amount || 500),
    };
    const warn = (msg: string) => toast.warning(t("vTitle"), { id: "form-validation", description: msg });
    if (!row.first_name || !row.last_name) { warn(t("vRequired").replace("{label}", !row.last_name ? t("lastName") : t("firstName"))); return; }
    if (!hasLetters(row.first_name) || !hasLetters(row.last_name)) { warn(t("vNameLetters")); return; }
    if (!isValidPhone(f.phone)) { warn(t("vPhone")); return; }
    const clash = findDuplicateTeacher({ id: editId, first_name: row.first_name, last_name: row.last_name }, teachers);
    if (clash) { toast.error(t("dupTitle"), { id: "duplicate", description: t("dupTeacher").replace("{code}", clash.code ?? clash.full_name) }); return; }
    const { error } = editId
      ? await supabase.from("teachers").update(row).eq("id", editId)
      : await supabase.from("teachers").insert(row);
    if (error) { notifyError(error.message); return; }
    toast.success(editId ? t("updatedOk") : t("saved"));
    reset();
    qc.invalidateQueries();
  }

  async function updatePct(id: string, pct: number) {
    const { error } = await supabase.from("teachers").update({ percentage: pct }).eq("id", id);
    if (error) { notifyError(error.message); return; }
    toast.success(t("saved"));
    qc.invalidateQueries();
  }

  return (
    <Panel
      title={t("teachers")}
      actions={
        <Button variant="outline" size="sm" onClick={() => setBulk(true)} disabled={teachers.length === 0}>
          <IdCard /> {t("bulkPrintCards")}
        </Button>
      }
    >
      <form ref={formRef} onSubmit={add} onKeyDown={(e) => e.key === "Escape" && editId && reset()} className={`mb-5 grid gap-3 rounded-xl bg-secondary p-4 transition-shadow md:grid-cols-[repeat(5,minmax(0,1fr))_auto] md:items-end ${editId ? editRing : ""}`}>
        <Field label={t("lastName")}>
          <Input required value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} />
        </Field>
        <Field label={t("firstName")}>
          <Input required value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} />
        </Field>
        <Field label={t("phone")}>
          <Input dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label={t("gender")}>
          <select className={selectCls} value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
            <option value="male">{t("male")}</option>
            <option value="female">{t("female")}</option>
          </select>
        </Field>
        <Field label={t("fixedAmount")}>
          <Input type="number" min={0} step={50} value={f.amount} placeholder="500" onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Field>
        <FormActions editing={!!editId} addLabel={t("addTeacher")} onCancel={reset} />
      </form>
      {teachers.length === 0 ? (
        <Empty>{t("none")}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start text-xs text-muted-foreground">
                <th className="px-3 py-2 text-start font-medium">{t("teacher")}</th>
                <th className="px-3 py-2 text-center font-medium">{t("code")}</th>
                <th className="px-3 py-2 text-center font-medium">{t("phone")}</th>
                <th className="px-3 py-2 text-center font-medium">{t("fixedAmount")}</th>
                <th className="px-3 py-2 text-end font-medium">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((tc) => (
                <tr
                  key={tc.id}
                  className={cn(
                    "border-b last:border-0 hover:bg-muted/50 transition-colors",
                    editId === tc.id && "bg-accent/10"
                  )}
                >
                  <td className="py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                        {tc.first_name?.[0] || tc.last_name?.[0] || "أ"}
                      </div>
                      <span className="font-medium text-foreground">
                        {tc.full_name || `${tc.last_name} ${tc.first_name}`}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono text-xs">{tc.code || "—"}</td>
                  <td className="px-3 py-2.5 text-center tabular" dir="ltr">{tc.phone || "—"}</td>
                  <td className="px-3 py-2.5 text-center font-medium tabular">
                    <AmountInput value={Number(tc.percentage || 500)} onSave={(v) => updatePct(tc.id, v)} />
                  </td>
                  <td className="px-3 py-2.5 text-end">
                    <div className="inline-flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setCardFor(tc)} aria-label={t("printCard")} title={t("printCard")}>
                        <IdCard />
                      </Button>
                      <EditBtn active={editId === tc.id} onClick={() => startEdit(tc)} />
                      <Button size="icon" variant="ghost" onClick={() => del("teachers", tc.id)} aria-label={t("delete")}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PrintDialog open={!!cardFor} onOpenChange={(o) => !o && setCardFor(null)} title={t("printCard")}>
        {cardFor && <TeacherCard teacher={cardFor} />}
      </PrintDialog>
      <BulkCardsDialog
        open={bulk}
        onOpenChange={setBulk}
        title={t("bulkPrintCards")}
        items={teachers.map((tc) => ({ ...tc, label: `${tc.last_name} ${tc.first_name}`, sub: tc.code }))}
        render={(tc) => <TeacherCard teacher={tc} />}
      />
    </Panel>
  );
}

function AmountInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <div className="inline-flex items-center justify-center gap-1">
      <Input
        type="number"
        min={0}
        step={50}
        className="h-8 w-20 text-center tabular font-medium"
        value={v}
        onChange={(e) => setV(e.target.value)}
      />
      {Number(v) !== value && (
        <Button size="icon" variant="ghost" className="size-8" onClick={() => onSave(Number(v))}>
          <Save className="size-4" />
        </Button>
      )}
    </div>
  );
}

function LevelsTab() {
  const { t, money } = useI18n();
  const qc = useQueryClient();
  const del = useDelete();
  const { data: levels = [] } = useLevels();
  const { data: settings } = useSettings();
  const [p, setP] = useState({
    support_price: "",
    sessions_per_month: "",
    kids_sessions_per_month: "",
    kids_monthly_price: "",
    kids_quarter_price: "",
    kids_semester_price: "",
    default_teacher_pct: "",
    workshop_price: "",
    workshop_teacher_amount: "",
  });
  const [lv, setLv] = useState({ code: "", price: "", package_price: "", sessions: "30" });
  const [editId, setEditId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function resetLevel() {
    setLv({ code: "", price: "", package_price: "", sessions: "30" });
    setEditId(null);
  }

  function startEdit(l: (typeof levels)[number]) {
    setEditId(l.id);
    setLv({
      code: l.code,
      price: String(l.price),
      package_price: (l as any).package_price ? String((l as any).package_price) : "",
      sessions: String(l.sessions),
    });
    focusForm(formRef.current);
  }

  useEffect(() => {
    if (settings)
      setP({
        support_price: String(settings.support_price === 2500 ? 1500 : (settings.support_price || 1500)),
        sessions_per_month: String(settings.sessions_per_month || 8),
        kids_sessions_per_month: String((settings as any).kids_sessions_per_month ?? 9),
        kids_monthly_price: String(settings.kids_monthly_price || 4500),
        kids_quarter_price: String(
          settings.kids_quarter_price === 4000 || settings.kids_quarter_price === 9000
            ? 12000
            : (settings.kids_quarter_price || 12000)
        ),
        kids_semester_price: String((settings as any).kids_semester_price ?? 20000),
        default_teacher_pct: String(
          settings.default_teacher_pct === 50 ? 500 : (settings.default_teacher_pct || 500)
        ),
        workshop_price: String((settings as any).workshop_price ?? 500),
        workshop_teacher_amount: String((settings as any).workshop_teacher_amount ?? 300),
      });
  }, [settings]);

  async function savePricing(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase
      .from("settings")
      .update({
        support_price: Number(p.support_price),
        sessions_per_month: Number(p.sessions_per_month),
        kids_sessions_per_month: Number(p.kids_sessions_per_month) || 9,
        kids_monthly_price: Number(p.kids_monthly_price),
        kids_quarter_price: Number(p.kids_quarter_price),
        kids_semester_price: Number(p.kids_semester_price),
        default_teacher_pct: Number(p.default_teacher_pct),
        workshop_price: Number(p.workshop_price) || 500,
        workshop_teacher_amount: Number(p.workshop_teacher_amount) || 300,
      })
      .eq("id", 1);
    if (error) { notifyError(error.message); return; }
    toast.success(t("pricingSaved"));
    qc.invalidateQueries();
  }

  async function addLevel(e: React.FormEvent) {
    e.preventDefault();
    const code = lv.code.trim();
    const clash = findDuplicateLabel({ id: editId, labels: [code] }, levels, (x) => [x.code]);
    if (clash) { toast.error(t("dupTitle"), { id: "duplicate", description: t("dupLevel").replace("{name}", clash.code) }); return; }
    const row = {
      code,
      price: Number(lv.price),
      package_price: lv.package_price ? Number(lv.package_price) : null,
      sessions: Number(lv.sessions) || 8,
    };
    const { error } = editId
      ? await supabase.from("levels").update(row).eq("id", editId)
      : await supabase.from("levels").insert({ ...row, sort: levels.length });
    if (error) { notifyError(error.message); return; }
    toast.success(editId ? t("updatedOk") : t("saved"));
    resetLevel();
    qc.invalidateQueries();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title={t("levelsPricing")}>
        <form onSubmit={savePricing} className="space-y-4">
          {/* 1. الدعم الشهري وحصصه */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`${t("supportPrice")} (${t("dzd")})`}>
              <Input
                type="number"
                placeholder="1500"
                value={p.support_price}
                onChange={(e) => setP({ ...p, support_price: e.target.value })}
              />
            </Field>
            <Field label={t("sessionsPerMonth")}>
              <Input
                type="number"
                placeholder="8"
                value={p.sessions_per_month}
                onChange={(e) => setP({ ...p, sessions_per_month: e.target.value })}
              />
            </Field>
          </div>

          {/* 2. اللغات للصغار وحصصها في نفس السطر */}
          <div className="grid gap-3 sm:grid-cols-3 items-end">
            <Field
              label={`${t("kidsLanguages3M")} (${t("dzd")})`}
              labelClassName="text-[11px] leading-tight whitespace-nowrap min-h-[1.25rem] flex items-end"
              className="flex flex-col justify-end"
            >
              <Input
                type="number"
                placeholder="12000"
                value={p.kids_quarter_price}
                onChange={(e) => setP({ ...p, kids_quarter_price: e.target.value })}
              />
            </Field>
            <Field
              label={`${t("kidsLanguages6M")} (${t("dzd")})`}
              labelClassName="text-[11px] leading-tight whitespace-nowrap min-h-[1.25rem] flex items-end"
              className="flex flex-col justify-end"
            >
              <Input
                type="number"
                placeholder="20000"
                value={p.kids_semester_price}
                onChange={(e) => setP({ ...p, kids_semester_price: e.target.value })}
              />
            </Field>
            <Field
              label={t("sessionsPerMonth")}
              labelClassName="text-[11px] leading-tight whitespace-nowrap min-h-[1.25rem] flex items-end"
              className="flex flex-col justify-end"
            >
              <Input
                type="number"
                placeholder="9"
                value={p.kids_sessions_per_month}
                onChange={(e) => setP({ ...p, kids_sessions_per_month: e.target.value })}
              />
            </Field>
          </div>

          {/* 3. المبلغ الافتراضي للأستاذ شهرياً */}
          <div>
            <Field
              label={`${t("defaultTeacherAmount")} (${t("dzd")})`}
              labelClassName="text-xs leading-tight whitespace-nowrap min-h-[1.25rem] flex items-end"
            >
              <Input
                type="number"
                placeholder="500"
                value={p.default_teacher_pct}
                onChange={(e) => setP({ ...p, default_teacher_pct: e.target.value })}
              />
            </Field>
          </div>

          {/* 4. سعر الدورة التدريبية وبجانبها المبلغ الافتراضي للأستاذ */}
          <div className="grid gap-3 sm:grid-cols-2 items-end">
            <Field
              label={`${t("workshopPrice")} (${t("dzd")})`}
              labelClassName="text-xs leading-tight whitespace-nowrap min-h-[1.25rem] flex items-end"
              className="flex flex-col justify-end"
            >
              <Input
                type="number"
                placeholder="500"
                value={p.workshop_price}
                onChange={(e) => setP({ ...p, workshop_price: e.target.value })}
              />
            </Field>
            <Field
              label={`${t("defaultTeacherAmountShort")} (${t("dzd")})`}
              labelClassName="text-xs leading-tight whitespace-nowrap min-h-[1.25rem] flex items-end"
              className="flex flex-col justify-end"
            >
              <Input
                type="number"
                placeholder="300"
                value={p.workshop_teacher_amount}
                onChange={(e) => setP({ ...p, workshop_teacher_amount: e.target.value })}
              />
            </Field>
          </div>

          {/* زر الحفظ */}
          <div className="flex justify-end pt-2">
            <Button type="submit">
              <Save /> {t("save")}
            </Button>
          </div>
        </form>
      </Panel>
      <Panel title={t("adultLevels")}>
        <form
          ref={formRef}
          onSubmit={addLevel}
          onKeyDown={(e) => e.key === "Escape" && editId && resetLevel()}
          className={`mb-4 grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-end gap-2 rounded-xl transition-shadow ${
            editId ? editRing + " p-2" : ""
          }`}
        >
          <Field label={t("level")}>
            <Input required dir="ltr" placeholder="A1" value={lv.code} onChange={(e) => setLv({ ...lv, code: e.target.value })} />
          </Field>
          <Field label={t("monthlyPrice")}>
            <Input required type="number" placeholder="4000" value={lv.price} onChange={(e) => setLv({ ...lv, price: e.target.value })} />
          </Field>
          <Field label={t("packagePrice4M")}>
            <Input type="number" placeholder="15000" value={lv.package_price} onChange={(e) => setLv({ ...lv, package_price: e.target.value })} />
          </Field>
          <Field label={t("sessions")}>
            <Input type="number" placeholder="30" value={lv.sessions} onChange={(e) => setLv({ ...lv, sessions: e.target.value })} />
          </Field>
          {editId ? (
            <div className="flex gap-1">
              <Button type="submit" variant="accent" size="icon" aria-label={t("saveChanges")} title={t("saveChanges")}>
                <Save />
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={resetLevel} aria-label={t("cancel")} title={t("cancel")}>
                <X />
              </Button>
            </div>
          ) : (
            <Button type="submit" variant="accent" size="icon" aria-label={t("addLevel")}>
              <Plus />
            </Button>
          )}
        </form>
        <ul className="divide-y">
          {levels.map((l) => (
            <li
              key={l.id}
              className={`flex items-center justify-between rounded-lg px-2 py-2.5 transition-colors ${
                editId === l.id ? "bg-accent/10" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground">
                  {l.code}
                </span>
                <div className="flex flex-col">
                  <span className="font-medium tabular text-foreground">
                    {money(l.price)} / {t("monthlyPlan")}
                    {l.package_price ? ` · ${money(l.package_price)} / ${t("fourMonthsPlan")}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {l.sessions} {t("sessions")}
                  </span>
                </div>
              </div>
              <div className="flex items-center">
                <EditBtn active={editId === l.id} onClick={() => startEdit(l)} />
                <Button size="icon" variant="ghost" onClick={() => del("levels", l.id)} aria-label={t("delete")}>
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
