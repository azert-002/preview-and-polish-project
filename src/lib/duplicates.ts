import { normalizeName } from "./student-search";

/**
 * Duplicate and identity checks shared by every "add / edit" form.
 * Pure functions: forms call them before saving so the same person, subject,
 * room or level can never be registered twice.
 */

type Person = {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  parent_phone?: string | null;
};

/** A name must contain at least one letter (Arabic or Latin), not only digits/symbols. */
export function hasLetters(s: string): boolean {
  return /\p{L}/u.test(s);
}

/** Digits only; Algerian +213 / 00213 prefixes become a leading 0 so 0550… and +213 550… match. */
export function phoneDigits(p: string | null | undefined): string {
  let d = (p ?? "").replace(/\D/g, "");
  if (d.startsWith("00213")) d = "0" + d.slice(5);
  else if (d.startsWith("213") && d.length >= 12) d = "0" + d.slice(3);
  return d;
}

/** Empty is allowed; otherwise 9 to 13 digits (spaces, dashes and a leading + are tolerated). */
export function isValidPhone(p: string | null | undefined): boolean {
  const raw = (p ?? "").trim();
  if (!raw) return true;
  if (!/^\+?[\d\s\-.()]+$/.test(raw)) return false;
  const n = raw.replace(/\D/g, "").length;
  return n >= 9 && n <= 13;
}

/** Same first + last name after normalization, in either order. */
export function sameFullName(a: Pick<Person, "first_name" | "last_name">, b: Pick<Person, "first_name" | "last_name">): boolean {
  const af = normalizeName(a.first_name);
  const al = normalizeName(a.last_name);
  const bf = normalizeName(b.first_name);
  const bl = normalizeName(b.last_name);
  if (!af && !al) return false;
  return (af === bf && al === bl) || (af === bl && al === bf);
}

function phonesOf(p: Person): Set<string> {
  return new Set([phoneDigits(p.phone), phoneDigits(p.parent_phone)].filter(Boolean));
}

export type StudentDuplicate<T> = { kind: "same" | "possible"; match: T };

/**
 * "same": same name and nothing tells them apart (a shared phone, or no phones at all) → block.
 * "possible": same name but different phone numbers → ask the user to confirm it is another student.
 */
export function findDuplicateStudent<T extends Person>(candidate: Omit<Person, "id"> & { id?: string | null }, existing: T[]): StudentDuplicate<T> | null {
  const mine = phonesOf({ ...candidate, id: candidate.id ?? "" });
  const namesakes = existing.filter((s) => s.id !== candidate.id && sameFullName(candidate, s));
  if (namesakes.length === 0) return null;
  for (const s of namesakes) {
    const theirs = phonesOf(s);
    const shared = [...mine].some((p) => theirs.has(p));
    if (shared || (mine.size === 0 && theirs.size === 0)) return { kind: "same", match: s };
  }
  return { kind: "possible", match: namesakes[0]! };
}

/** Teachers: same name → the same person (staff lists are small, namesakes are not expected). */
export function findDuplicateTeacher<T extends Person>(candidate: Omit<Person, "id"> & { id?: string | null }, existing: T[]): T | null {
  return existing.find((x) => x.id !== candidate.id && sameFullName(candidate, x)) ?? null;
}

/** Generic label clash (subject / room names, level codes), ignoring case, spaces and Arabic letter variants. */
export function findDuplicateLabel<T extends { id: string }>(
  candidate: { id?: string | null; labels: (string | null | undefined)[] },
  existing: T[],
  labelsOf: (row: T) => (string | null | undefined)[],
): T | null {
  const want = candidate.labels.map((l) => normalizeName(l ?? "")).filter(Boolean);
  if (want.length === 0) return null;
  return (
    existing.find((row) => {
      if (row.id === candidate.id) return false;
      const have = labelsOf(row).map((l) => normalizeName(l ?? "")).filter(Boolean);
      return want.some((w) => have.includes(w));
    }) ?? null
  );
}
