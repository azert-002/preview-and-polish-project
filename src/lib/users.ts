import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { localAuth, getLocalSession } from "@/lib/local-db/auth";
import { displayUsername, isValidUsername, loginEmail } from "@/lib/username";

/**
 * Staff accounts management. The academy data lives in this browser's offline
 * database, so these run in the browser too (a server could never see it).
 * Director (admin) checks use the signed-in local session; errors use short
 * codes the UI translates.
 */

export type AppUser = { id: string; username: string; role: "admin" | "staff" | null; created_at: string; last_sign_in_at: string | null };

const roleSchema = z.enum(["admin", "staff"]);

function currentUserId(): string {
  const id = getLocalSession()?.user.id;
  if (!id) throw new Error("FORBIDDEN");
  return id;
}

async function roleRows(): Promise<{ id: string; user_id: string; role: "admin" | "staff" }[]> {
  const { data } = await supabase.from("user_roles").select("*");
  return (data ?? []) as { id: string; user_id: string; role: "admin" | "staff" }[];
}

async function assertAdmin(): Promise<string> {
  const me = currentUserId();
  const rows = await roleRows();
  if (!rows.some((r) => r.user_id === me && r.role === "admin")) throw new Error("FORBIDDEN");
  return me;
}

async function setRoleRow(userId: string, role: "admin" | "staff" | null) {
  await supabase.from("user_roles").delete().eq("user_id", userId);
  if (role) await supabase.from("user_roles").insert({ user_id: userId, role });
}

async function assertNotLastAdmin(userId: string) {
  const admins = (await roleRows()).filter((r) => r.role === "admin").map((r) => r.user_id);
  if (admins.includes(userId) && new Set(admins).size <= 1) throw new Error("LAST_ADMIN");
}

export async function listUsers(): Promise<AppUser[]> {
  await assertAdmin();
  const { data } = await localAuth.admin.listUsers();
  const roles = await roleRows();
  const roleOf = new Map<string, "admin" | "staff">();
  for (const r of roles) if (!roleOf.has(r.user_id) || r.role === "admin") roleOf.set(r.user_id, r.role);
  return data.users
    .map((u) => ({ id: u.id, username: displayUsername(u.email), role: roleOf.get(u.id) ?? null, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function createUser({ data }: { data: { username: string; password: string; role: "admin" | "staff" } }) {
  const d = z
    .object({ username: z.string().trim().refine(isValidUsername, "USERNAME_INVALID"), password: z.string().min(6).max(72), role: roleSchema })
    .parse(data);
  await assertAdmin();
  const { data: created, error } = await localAuth.admin.createUser({ email: loginEmail(d.username), password: d.password, app_metadata: { role: d.role } });
  if (error || !created) throw new Error(/already|exists|registered/i.test(error?.message ?? "") ? "USERNAME_EXISTS" : (error?.message ?? "UNKNOWN"));
  await setRoleRow(created.user.id, d.role);
  return { id: created.user.id };
}

export async function setUserRole({ data }: { data: { userId: string; role: "admin" | "staff" } }) {
  const d = z.object({ userId: z.string().min(1), role: roleSchema }).parse(data);
  const me = await assertAdmin();
  if (d.userId === me) throw new Error("SELF_CHANGE");
  if (d.role !== "admin") await assertNotLastAdmin(d.userId);
  await setRoleRow(d.userId, d.role);
  await localAuth.admin.updateUserById(d.userId, { role: d.role });
  return { ok: true };
}

export async function setUserPassword({ data }: { data: { userId: string; password: string } }) {
  const d = z.object({ userId: z.string().min(1), password: z.string().min(6).max(72) }).parse(data);
  await assertAdmin();
  const { error } = await localAuth.admin.updateUserById(d.userId, { password: d.password });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteUser({ data }: { data: { userId: string } }) {
  const d = z.object({ userId: z.string().min(1) }).parse(data);
  const me = await assertAdmin();
  if (d.userId === me) throw new Error("SELF_CHANGE");
  await assertNotLastAdmin(d.userId);
  await localAuth.admin.deleteUser(d.userId);
  return { ok: true };
}

/** Any signed-in user changes their own password; the current one is checked first. */
export async function changeMyPassword({ data }: { data: { current: string; next: string } }) {
  const d = z.object({ current: z.string().min(1).max(72), next: z.string().min(6).max(72) }).parse(data);
  const me = currentUserId();
  if (!(await localAuth.verifyUserPassword(me, d.current))) throw new Error("WRONG_PASSWORD");
  if (d.current === d.next) throw new Error("SAME_PASSWORD");
  const { error } = await localAuth.admin.updateUserById(me, { password: d.next });
  if (error) throw new Error(error.message);
  return { ok: true };
}


