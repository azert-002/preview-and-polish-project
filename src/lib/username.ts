/**
 * Staff sign in with a username (اسم المستخدم), not an email. Accounts still
 * need an email behind the scenes, so each username maps to a private
 * address on a domain that never receives mail.
 */
export const USERNAME_DOMAIN = "beyondwords.local";
export const DIRECTOR_USERNAME = "admin";
const USERNAME_RE = /^[a-z0-9._-]{2,32}$/;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidUsername(input: string): boolean {
  return USERNAME_RE.test(normalizeUsername(input));
}

/** What the sign-in form sends: older accounts typed with "@" keep working as emails. */
export function loginEmail(input: string): string {
  const v = normalizeUsername(input);
  return v.includes("@") ? v : `${v}@${USERNAME_DOMAIN}`;
}

/** Shown in the users list: the username, or the full email for older accounts. */
export function displayUsername(email: string | null | undefined): string {
  const e = (email ?? "").toLowerCase();
  const suffix = `@${USERNAME_DOMAIN}`;
  return e.endsWith(suffix) ? e.slice(0, -suffix.length) : e;
}

/**
 * Accounts require at least 6 characters, but the built-in director password
 * is "admin". Shorter typed passwords get a fixed suffix before reaching the
 * account system; passwords of 6+ characters are sent unchanged.
 */
const SHORT_PASSWORD_SUFFIX = "~bw-short";
export function authPassword(input: string): string {
  return input.length < 6 ? `${input}${SHORT_PASSWORD_SUFFIX}` : input;
}
