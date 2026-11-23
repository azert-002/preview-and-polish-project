import { describe, it, expect, beforeEach } from "vitest";
import { localSupabase } from "@/lib/local-db/local-client";
import { clearTable, getTableRows, resetSeededFlag } from "@/lib/local-db/storage";
import { changeMyPassword, createUser, deleteUser, listUsers } from "@/lib/users";
import { DIRECTOR_USERNAME, loginEmail } from "@/lib/username";

const TABLES = ["academy_setup", "user_roles", "_local_users"] as const;

async function signInDirector(password = "admin") {
  return localSupabase.auth.signInWithPassword({ email: loginEmail(DIRECTOR_USERNAME), password });
}

describe("Accounts in the offline database", () => {
  beforeEach(async () => {
    resetSeededFlag();
    for (const t of TABLES) await clearTable(t);
    await localSupabase.auth.signOut();
  });

  it("admin/admin stops working once the director changes the password", async () => {
    expect((await signInDirector()).error).toBeNull();
    await changeMyPassword({ data: { current: "admin", next: "director-2026" } });
    await localSupabase.auth.signOut();

    expect((await signInDirector("admin")).error).not.toBeNull();
    expect((await signInDirector("director-2026")).error).toBeNull();
  });

  it("the director creates a secretary account that can sign in", async () => {
    await signInDirector();
    await createUser({ data: { username: "sara", password: "sara-pass", role: "staff" } });
    const users = await listUsers();
    expect(users.find((u) => u.username === "sara")?.role).toBe("staff");

    await localSupabase.auth.signOut();
    const res = await localSupabase.auth.signInWithPassword({ email: loginEmail("sara"), password: "sara-pass" });
    expect(res.error).toBeNull();
  });

  it("a secretary cannot list or create accounts", async () => {
    await signInDirector();
    await createUser({ data: { username: "sara", password: "sara-pass", role: "staff" } });
    await localSupabase.auth.signOut();
    await localSupabase.auth.signInWithPassword({ email: loginEmail("sara"), password: "sara-pass" });

    await expect(listUsers()).rejects.toThrow("FORBIDDEN");
    await expect(createUser({ data: { username: "omar", password: "omar-pass", role: "admin" } })).rejects.toThrow("FORBIDDEN");
  });

  it("deleting an account also removes its role", async () => {
    await signInDirector();
    const { id } = await createUser({ data: { username: "sara", password: "sara-pass", role: "staff" } });
    await deleteUser({ data: { userId: id } });
    const roles = await getTableRows<{ user_id: string }>("user_roles");
    expect(roles.some((r) => r.user_id === id)).toBe(false);
  });
});
