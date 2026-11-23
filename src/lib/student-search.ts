type Searchable = {
  first_name: string;
  last_name: string;
  code: string | null;
  phone: string | null;
  parent_phone: string | null;
  active: boolean;
};

/** Lowercase, drop Arabic diacritics/tatweel and unify common letter variants. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

/** Find active students whose name (any order), code or phone contains every typed word. */
export function searchStudents<T extends Searchable>(students: T[], query: string, limit = 8): T[] {
  const words = normalizeName(query).split(" ").filter(Boolean);
  if (words.length === 0 || normalizeName(query).length < 2) return [];
  return students
    .filter((s) => s.active)
    .filter((s) => {
      const hay = normalizeName(
        [s.first_name, s.last_name, s.code ?? "", s.phone ?? "", s.parent_phone ?? ""].join(" "),
      );
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}
