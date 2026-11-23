import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, ImagePlus, Loader2, Save, Upload, ShieldCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/lib/errors";
import { confirmAction } from "@/lib/confirm";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fileToDataUrl, useMyUserId, useSettings } from "@/lib/data";
import { UsersDialog } from "@/components/UsersDialog";
import { exportBackup, restoreBackup, validateBackup } from "@/lib/backup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, PageHeader, Panel, selectCls } from "@/components/common";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [
    { title: "Settings — Beyond Words" },
    { name: "description", content: "Center identity and backups." },
    { property: "og:title", content: "Settings — Beyond Words" },
    { property: "og:description", content: "Center identity and backups." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const [f, setF] = useState({ institution_type: "academy", name: "", phone: "", address: "", logo_url: "" });
  const [busy, setBusy] = useState<"" | "save" | "export" | "restore">("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [usersOpen, setUsersOpen] = useState(false);
  const { data: myId = null } = useMyUserId();

  useEffect(() => {
    if (settings)
      setF({
        institution_type: settings.institution_type,
        name: settings.name ?? "",
        phone: settings.phone ?? "",
        address: settings.address ?? "",
        logo_url: settings.logo_url ?? "",
      });
  }, [settings]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    const { error } = await supabase
      .from("settings")
      .update({ ...f, logo_url: f.logo_url || null, phone: f.phone || null, address: f.address || null, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setBusy("");
    if (error) { notifyError(error.message); return; }
    toast.success(t("saved"));
    qc.invalidateQueries();
  }

  async function doExport() {
    setBusy("export");
    try {
      const data = await exportBackup();
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `beyond_words_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function doRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let parsed;
    try {
      parsed = validateBackup(JSON.parse(await file.text()));
    } catch {
      { toast.error(t("invalidBackup")); return; }
    }
    if (!(await confirmAction({ title: t("confirmRestoreTitle"), message: t("restoreConfirm"), tone: "warning" }))) return;
    setBusy("restore");
    try {
      await restoreBackup(parsed);
      toast.success(t("restored"));
      qc.invalidateQueries();
    } catch (err) {
      notifyError((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <PageHeader
        title={t("settings")}
        actions={
          <Button variant="accent" onClick={() => setUsersOpen(true)}>
            <UsersRound /> {t("users")}
          </Button>
        }
      />
      {usersOpen && <UsersDialog open={usersOpen} onOpenChange={setUsersOpen} myId={myId} />}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("identity")}>
          <form onSubmit={save} className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="flex size-20 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted text-muted-foreground hover:border-accent">
                {f.logo_url ? <img src={f.logo_url} alt="" className="size-full object-contain p-1" /> : <ImagePlus className="size-6" />}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setF({ ...f, logo_url: await fileToDataUrl(file, 256) });
                  }}
                />
              </label>
              <div className="text-sm text-muted-foreground">{t("logo")}</div>
            </div>
            <Field label={t("institutionType")}>
              <select className={selectCls} value={f.institution_type} onChange={(e) => setF({ ...f, institution_type: e.target.value })}>
                <option value="academy">{t("academy")} / Academy</option>
              </select>
            </Field>
            <Field label={t("institutionName")}>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Beyond Words" />
            </Field>
            <Field label={t("phone")}>
              <Input dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </Field>
            <Field label={t("address")}>
              <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy === "save"}>
                {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} {t("save")}
              </Button>
            </div>
          </form>
        </Panel>

        <Panel title={t("backup")}>
          <div className="space-y-6">
            <div className="rounded-xl bg-secondary p-5">
              <div className="mb-1 flex items-center gap-2 font-semibold text-foreground">
                <Download className="size-5 text-primary" /> {t("exportBackup")}
              </div>
              <p className="mb-4 text-sm text-muted-foreground">{t("backupHint")}</p>
              <Button onClick={doExport} disabled={!!busy}>
                {busy === "export" ? <Loader2 className="animate-spin" /> : <Download />} {t("exportBackup")}
              </Button>
            </div>
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-5">
              <div className="mb-1 flex items-center gap-2 font-semibold text-foreground">
                <ShieldCheck className="size-5 text-warning" /> {t("restoreBackup")}
              </div>
              <p className="mb-4 text-sm text-muted-foreground">{t("restoreHint")}</p>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={doRestore} />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!!busy}>
                {busy === "restore" ? <Loader2 className="animate-spin" /> : <Upload />}
                {busy === "restore" ? t("working") : t("restoreFile")}
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
