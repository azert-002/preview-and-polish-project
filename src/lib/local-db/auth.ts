/**
 * Local Authentication Provider.
 * Replaces Supabase Auth with secure offline authentication.
 * Uses PBKDF2 with SHA-256 password salting and hashing.
 */

import { hashPassword, verifyPassword, getRandomHex } from "./crypto";
import { getTableRows, putTableRow, deleteTableRow, ensureSeeded } from "./storage";
import { type LocalSession, type LocalUser, type Role, DEFAULT_DIRECTOR_ID } from "./types";
import { DEFAULT_DIRECTOR_PASSWORD, isDefaultDirectorLogin } from "@/lib/director-setup";
import { DIRECTOR_USERNAME, loginEmail, displayUsername, authPassword } from "@/lib/username";

const SESSION_KEY = "beyondwords_local_session";

type AuthListener = (event: "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED", session: LocalSession | null) => void;
const listeners = new Set<AuthListener>();

function notifyListeners(event: "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED", session: LocalSession | null) {
  for (const fn of listeners) {
    try {
      fn(event, session);
    } catch (e) {
      console.error("[LocalAuth] Listener error:", e);
    }
  }
}

export function getLocalSession(): LocalSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as LocalSession;
  } catch {}

  try {
    const match = document.cookie.match(new RegExp("(^|; )" + SESSION_KEY + "=([^;]+)"));
    if (match && match[2]) {
      return JSON.parse(decodeURIComponent(match[2])) as LocalSession;
    }
  } catch {}

  return null;
}

function setLocalSession(session: LocalSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
    try {
      document.cookie = `${SESSION_KEY}=; path=/; max-age=0; SameSite=Lax`;
    } catch {}
  } else {
    const json = JSON.stringify(session);
    try {
      localStorage.setItem(SESSION_KEY, json);
    } catch {}
    try {
      document.cookie = `${SESSION_KEY}=${encodeURIComponent(json)}; path=/; max-age=2592000; SameSite=Lax`;
    } catch {}
  }
}

export const localAuth = {
  async getSession() {
    const session = getLocalSession();
    return { data: { session }, error: null };
  },

  async getUser() {
    const session = getLocalSession();
    return { data: { user: session?.user ?? null }, error: null };
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    await ensureSeeded();
    const cleanEmail = email.trim().toLowerCase();

    // 1. Detect if logging in as default director
    const isDirectorLogin =
      cleanEmail === "admin" ||
      cleanEmail === DIRECTOR_USERNAME ||
      cleanEmail === loginEmail(DIRECTOR_USERNAME).toLowerCase() ||
      displayUsername(cleanEmail) === DIRECTOR_USERNAME;

    const isDirectorDefaultPass =
      password === DEFAULT_DIRECTOR_PASSWORD ||
      password === authPassword(DEFAULT_DIRECTOR_PASSWORD) ||
      password.replace("~bw-short", "") === DEFAULT_DIRECTOR_PASSWORD;

    // Built-in admin/admin only works while the academy has no director yet
    // (fresh copy or a director left without its role); afterwards the
    // director's own password is required like any other account.
    const existingRoles = isDirectorLogin && isDirectorDefaultPass ? await getTableRows<{ user_id: string; role: string }>("user_roles") : [];
    const directorMissing = !existingRoles.some((r) => r.role === "admin");
    if (isDirectorLogin && isDirectorDefaultPass && directorMissing) {
      // Guaranteed director sign-in: ensure director record & admin role exist
      const directorId = DEFAULT_DIRECTOR_ID;
      const salt = getRandomHex(16);
      const passwordHash = await hashPassword(authPassword(DEFAULT_DIRECTOR_PASSWORD), salt);
      const directorUser: LocalUser = {
        id: directorId,
        username: DIRECTOR_USERNAME,
        email: loginEmail(DIRECTOR_USERNAME),
        passwordHash,
        salt,
        role: "admin",
        createdAt: new Date().toISOString(),
        lastSignInAt: new Date().toISOString(),
      };
      await putTableRow("_local_users", directorUser as unknown as Record<string, unknown>);
      await putTableRow("user_roles", { id: "role_director_admin", user_id: directorId, role: "admin" });
      await putTableRow("academy_setup", { id: "singleton", singleton: true, director_id: directorId, completed_at: new Date().toISOString() });

      const session: LocalSession = {
        user: {
          id: directorId,
          email: loginEmail(DIRECTOR_USERNAME),
          user_metadata: { username: DIRECTOR_USERNAME },
          app_metadata: { role: "admin" },
        },
        access_token: `local_token_${getRandomHex(24)}`,
        token_type: "bearer",
        expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 30, // 30 days
      };

      setLocalSession(session);
      notifyListeners("SIGNED_IN", session);
      return { data: { user: session.user, session }, error: null };
    }

    // 2. Lookup any user (director with custom password or staff)
    const users = await getTableRows<LocalUser>("_local_users");
    const user = users.find(
      (u) =>
        u.email.toLowerCase() === cleanEmail ||
        u.username.toLowerCase() === cleanEmail ||
        loginEmail(u.username).toLowerCase() === cleanEmail
    );

    if (!user) {
      return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
    }

    // Verify password supporting direct match, authPassword, or short-suffix strip
    const cand1 = await verifyPassword(password, user.salt, user.passwordHash);
    const cand2 = !cand1 ? await verifyPassword(authPassword(password), user.salt, user.passwordHash) : false;
    const cand3 = (!cand1 && !cand2) ? await verifyPassword(password.replace("~bw-short", ""), user.salt, user.passwordHash) : false;

    if (!cand1 && !cand2 && !cand3) {
      return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
    }

    user.lastSignInAt = new Date().toISOString();
    await putTableRow("_local_users", user as unknown as Record<string, unknown>);

    const session: LocalSession = {
      user: {
        id: user.id,
        email: user.email,
        user_metadata: { username: user.username },
        app_metadata: { role: user.role },
      },
      access_token: `local_token_${getRandomHex(24)}`,
      token_type: "bearer",
      expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 30, // 30 days
    };

    setLocalSession(session);
    notifyListeners("SIGNED_IN", session);
    return { data: { user: session.user, session }, error: null };
  },

  /** Checks a typed password against a stored account (accepts the short-password suffix form too). */
  async verifyUserPassword(userId: string, password: string): Promise<boolean> {
    await ensureSeeded();
    const users = await getTableRows<LocalUser>("_local_users");
    const user = users.find((u) => u.id === userId);
    if (!user) return false;
    return (await verifyPassword(password, user.salt, user.passwordHash)) || (await verifyPassword(authPassword(password), user.salt, user.passwordHash));
  },

  async signOut() {
    setLocalSession(null);
    notifyListeners("SIGNED_OUT", null);
    return { error: null };
  },

  onAuthStateChange(callback: AuthListener) {
    listeners.add(callback);
    // Initial call
    const current = getLocalSession();
    setTimeout(() => {
      callback(current ? "SIGNED_IN" : "SIGNED_OUT", current);
    }, 0);

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            listeners.delete(callback);
          },
        },
      },
    };
  },

  // Admin APIs (equivalent to supabase.auth.admin)
  admin: {
    async listUsers(options?: { perPage?: number }) {
      await ensureSeeded();
      const users = await getTableRows<LocalUser>("_local_users");
      const mapped = users.map((u) => ({
        id: u.id,
        email: u.email,
        user_metadata: { username: u.username },
        app_metadata: { role: u.role },
        created_at: u.createdAt,
        last_sign_in_at: u.lastSignInAt,
      }));
      return { data: { users: mapped }, error: null };
    },

    async createUser({ email, password, app_metadata }: { email: string; password: string; app_metadata?: { role?: Role } }) {
      await ensureSeeded();
      const users = await getTableRows<LocalUser>("_local_users");
      if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        return { data: null, error: { message: "User already exists" } };
      }

      const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : getRandomHex(16);
      const salt = getRandomHex(16);
      const passwordHash = await hashPassword(password, salt);
      const role: Role = app_metadata?.role || "staff";
      const username = displayUsername(email) || email.split("@")[0] || "user";

      const newUser: LocalUser = {
        id,
        email,
        username,
        passwordHash,
        salt,
        role,
        createdAt: new Date().toISOString(),
        lastSignInAt: null,
      };

      await putTableRow("_local_users", newUser as unknown as Record<string, unknown>);
      await putTableRow("user_roles", { id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : getRandomHex(16), user_id: id, role });

      return {
        data: {
          user: {
            id,
            email,
            user_metadata: { username },
            app_metadata: { role },
          },
        },
        error: null,
      };
    },

    async updateUserById(userId: string, attributes: { password?: string; email?: string; role?: Role }) {
      await ensureSeeded();
      const users = await getTableRows<LocalUser>("_local_users");
      const user = users.find((u) => u.id === userId);
      if (!user) return { data: null, error: { message: "User not found" } };

      if (attributes.password) {
        const salt = getRandomHex(16);
        user.passwordHash = await hashPassword(attributes.password, salt);
        user.salt = salt;
      }
      if (attributes.email) {
        user.email = attributes.email;
      }
      if (attributes.role) {
        user.role = attributes.role;
      }

      await putTableRow("_local_users", user as unknown as Record<string, unknown>);
      return { data: { user }, error: null };
    },

    async deleteUser(userId: string) {
      await deleteTableRow("_local_users", userId);
      const roles = await getTableRows<{ id: string; user_id: string }>("user_roles");
      for (const r of roles) if (r.user_id === userId) await deleteTableRow("user_roles", r.id);
      return { data: { user: null }, error: null };
    },
  },
};

