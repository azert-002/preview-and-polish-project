import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Pill, selectCls } from "@/components/common";
import { useI18n } from "@/lib/i18n";
import { notifyError } from "@/lib/errors";
import { confirmAction } from "@/lib/confirm";
import { createUser, deleteUser, listUsers, setUserPassword, setUserRole, type AppUser } from "@/lib/users";

/** Director-only: add staff accounts, set المدير / الأمانة, change passwords, delete. */
export function UsersDialog({ open, onOpenChange, myId }: { open: boolean; onOpenChange: (o: boolean) => void; myId: string | null }) {
  const { t, fmtDate } = useI18n();
  const qc = useQueryClient();
  const list = listUsers;
  const create = createUser;
  const setRole = setUserRole;
  const setPassword = setUserPassword;
  const remove = deleteUser;
  const { data: users = [], isLoading } = useQuery({ queryKey: ["app-users"], queryFn: () => list(), enabled: open });
  const [f, setF] = useState({ username: "", password: "", role: "staff" as "admin" | "staff" });
  const [busy, setBusy] = useState("");
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pw, setPw] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["app-users"] });
  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      await refresh();
      return true;
    } catch (e) {
      notifyError((e as Error).message);
      return false;
    } finally {
      setBusy("");
    }
  }

  const roleLabel = (r: AppUser["role"]) => (r === "admin" ? t("roleAdmin") : r === "staff" ? t("roleStaff") : t("roleNone"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto">
        <DialogHeader>
          <DialogTitle>{t("users")}</DialogTitle>
        </DialogHeader>
        <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">{t("usersHint")}</p>

        <form
          className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run("create", () => create({ data: f }), t("userCreated"));
            if (ok) setF({ username: "", password: "", role: "staff" });
          }}
        >
          <Field label={t("username")}>
            <Input
              dir="ltr"
              required
              autoCapitalize="none"
              spellCheck={false}
              pattern="[A-Za-z0-9._\-]{2,32}"
              title={t("usernameHint")}
              placeholder={t("usernameHint")}
              value={f.username}
              onChange={(e) => setF({ ...f, username: e.target.value })}
            />
          </Field>
          <Field label={t("password")}>
            <Input type="text" dir="ltr" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
          <Field label={t("role")}>
            <select className={selectCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as "admin" | "staff" })}>
              <option value="staff">{t("roleStaff")}</option>
              <option value="admin">{t("roleAdmin")}</option>
            </select>
          </Field>
          <Button type="submit" variant="accent" disabled={busy === "create"}>
            {busy === "create" ? <Loader2 className="animate-spin" /> : <UserPlus />} {t("addUser")}
          </Button>
        </form>

        {isLoading ? (
          <div className="flex justify-center p-6"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {users.map((u) => {
              const me = u.id === myId;
              return (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground" dir="ltr">{u.username}</span>
                      {me && <Pill tone="accent">{t("you")}</Pill>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("lastSignIn")}: {u.last_sign_in_at ? fmtDate(u.last_sign_in_at, true) : t("never")}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {me ? (
                      <Pill tone="success">{roleLabel(u.role)}</Pill>
                    ) : (
                      <div className="w-36">
                      <select
                        aria-label={t("role")}
                        className={selectCls}
                        value={u.role ?? "staff"}
                        disabled={busy === `role-${u.id}`}
                        onChange={(e) => {
                          const v = e.target.value as "admin" | "staff";
                          void run(`role-${u.id}`, () => setRole({ data: { userId: u.id, role: v } }), t("roleUpdated"));
                        }}
                      >
                        <option value="staff">{t("roleStaff")}</option>
                        <option value="admin">{t("roleAdmin")}</option>
                      </select>
                      </div>
                    )}
                    <Button size="icon" variant="ghost" aria-label={t("changePassword")} title={t("changePassword")} onClick={() => { setPwFor(pwFor === u.id ? null : u.id); setPw(""); }}>
                      <KeyRound />
                    </Button>
                    {!me && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        aria-label={t("deleteUserTitle")}
                        title={t("deleteUserTitle")}
                        disabled={busy === `del-${u.id}`}
                        onClick={async () => {
                          if (!(await confirmAction({ title: t("deleteUserTitle"), message: t("deleteUserConfirm"), hint: u.username, tone: "danger" }))) return;
                          void run(`del-${u.id}`, () => remove({ data: { userId: u.id } }), t("userDeleted"));
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  {pwFor === u.id && (
                    <form
                      className="flex w-full items-center gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await run(`pw-${u.id}`, () => setPassword({ data: { userId: u.id, password: pw } }), t("passwordUpdated"));
                        if (ok) setPwFor(null);
                      }}
                    >
                      <Input dir="ltr" required minLength={6} placeholder={t("newPassword")} value={pw} onChange={(e) => setPw(e.target.value)} />
                      <Button type="submit" size="sm" disabled={busy === `pw-${u.id}`}>{t("save")}</Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
