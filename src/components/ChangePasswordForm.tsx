import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common";
import { useI18n } from "@/lib/i18n";
import { notifyError } from "@/lib/errors";
import { changeMyPassword } from "@/lib/users";

/** Lets the signed-in user replace their own password (current one required). */
export function ChangePasswordForm({ username, onDone }: { username?: string | undefined; onDone?: (() => void) | undefined }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const change = changeMyPassword;
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const secret = { type: "text", autoComplete: "off", autoCapitalize: "none", spellCheck: false, "data-lpignore": "true", className: show ? "" : "text-secure" } as const;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.next !== f.confirm) { notifyError("PASSWORD_MISMATCH"); return; }
    setBusy(true);
    try {
      await change({ data: { current: f.current, next: f.next } });
      toast.success(t("passwordUpdated"));
      setF({ current: "", next: "", confirm: "" });
      qc.invalidateQueries({ queryKey: ["app-users"] });
      onDone?.();
    } catch (err) {
      notifyError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} autoComplete="off" className="space-y-4">
      {username && (
        <Field label={t("username")}>
          <Input dir="ltr" value={username} readOnly className="bg-muted" />
        </Field>
      )}
      <Field label={t("currentPassword")}>
        <Input dir="ltr" {...secret} required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
      </Field>
      <Field label={t("newPassword")}>
        <Input dir="ltr" {...secret} required minLength={6} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
      </Field>
      <Field label={t("confirmPassword")}>
        <Input dir="ltr" {...secret} required minLength={6} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
      </Field>
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setShow(!show)}>
          {show ? <EyeOff /> : <Eye />} {show ? t("hidePassword") : t("showPassword")}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Save />} {t("changePassword")}
        </Button>
      </div>
    </form>
  );
}

export function MyAccountDialog({ open, onOpenChange, username }: { open: boolean; onOpenChange: (o: boolean) => void; username?: string | undefined }) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("myAccount")}</DialogTitle>
        </DialogHeader>
        <ChangePasswordForm username={username} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
