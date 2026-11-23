import { DIRECTOR_USERNAME, normalizeUsername } from "./username";

/**
 * Built-in director credentials. Every new copy of the project starts with no
 * accounts, so the first sign-in with these creates (or repairs) the director.
 */
export const DEFAULT_DIRECTOR_PASSWORD = "admin";

export function isDefaultDirectorLogin(username: string, password: string): boolean {
  return normalizeUsername(username) === DIRECTOR_USERNAME && password === DEFAULT_DIRECTOR_PASSWORD;
}

/** The built-in director may only be set up while the academy has no director; unknown counts fail closed. */
export function directorMissing(setupRows: number | null, adminCount: number | null): boolean {
  return setupRows === 0 && adminCount === 0;
}
