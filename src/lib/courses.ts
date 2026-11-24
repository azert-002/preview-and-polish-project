// Duration-based courses (level improvement & languages only).
// Each enrollment block = one month of the course. Sessions are simply counted
// (present or absent), any number per day. The course clock starts on the
// student's first "present" mark; school support and workshops never use this.

export interface CourseBlock {
  id: string;
  student_id?: string;
  group_id?: string;
  created_at?: string | null;
  months?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  withdrawn_at?: string | null;
  sessions_used?: number | null;
  sessions_total?: number | null;
  payout_id?: string | null;
}

/** Calendar day in Algeria (YYYY-MM-DD) — never the device time zone. */
export function algiersDay(d: Date | string = new Date()): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers", year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
}

/** Adds whole months to a YYYY-MM-DD day, clamping to the month's last day (31 Jan + 1 = 28/29 Feb). */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const total = (m - 1) + n;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, last);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export function isDurationBlock(e: { months?: number | null } | null | undefined): boolean {
  return Number(e?.months ?? 0) > 0;
}

/** Still running (or not started yet) on `today`; withdrawn blocks never are. */
export function durationActive(e: CourseBlock, today: string = algiersDay()): boolean {
  if (e.withdrawn_at) return false;
  return !e.ends_at || e.ends_at > today;
}

/** Started course that reached its end date without a renewal. */
export function durationExpired(e: CourseBlock, today: string = algiersDay()): boolean {
  return !e.withdrawn_at && !!e.ends_at && e.ends_at <= today;
}

/** Is this enrollment block still giving the student a seat / attendance? Works for both kinds. */
export function blockActive(e: CourseBlock, today: string = algiersDay()): boolean {
  if (isDurationBlock(e)) return durationActive(e, today);
  return Math.max(Number(e.sessions_total ?? 0) - Number(e.sessions_used ?? 0), 0) > 0;
}

const byCreated = (a: CourseBlock, b: CourseBlock) =>
  (a.created_at ?? "").localeCompare(b.created_at ?? "") || (a.starts_at ?? "9999").localeCompare(b.starts_at ?? "9999");

/**
 * Block that a new attendance mark goes to for one student in one duration group:
 * the month covering today (or the next not-yet-started one); when everything ended,
 * the last block, flagged `expired` so the app warns that a renewal is needed.
 */
export function pickDurationBlock<T extends CourseBlock>(list: T[], today: string = algiersDay()): { block: T | null; expired: boolean } {
  const live = [...list].filter((e) => !e.withdrawn_at).sort(byCreated);
  const running = live.find((e) => e.starts_at && e.ends_at && e.starts_at <= today && e.ends_at > today);
  if (running) return { block: running, expired: false };
  const next = live.find((e) => !e.ends_at || e.ends_at > today);
  if (next) return { block: next, expired: false };
  const last = live[live.length - 1] ?? null;
  return { block: last, expired: !!last };
}

/**
 * Dates for a package whose first presence happens on `day`.
 * Renewing before the previous course ended continues right after it (no lost days).
 * Returns block id -> [starts_at, ends_at] for blocks that have no dates yet.
 */
export function scheduleBundle(
  bundle: CourseBlock[],
  day: string,
  previousEnd: string | null,
): Map<string, { starts_at: string; ends_at: string }> {
  const out = new Map<string, { starts_at: string; ends_at: string }>();
  const todo = [...bundle].filter((b) => !b.starts_at).sort(byCreated);
  if (todo.length === 0) return out;
  const dated = bundle.filter((b) => b.ends_at).map((b) => b.ends_at!).sort();
  let start = dated.length ? dated[dated.length - 1]! : previousEnd && previousEnd > day ? previousEnd : day;
  for (const b of todo) {
    const end = addMonths(start, Number(b.months ?? 1));
    out.set(b.id, { starts_at: start, ends_at: end });
    start = end;
  }
  return out;
}

/** The teacher earns one fixed amount per student for each month that has passed (or was started before a withdrawal). */
export function durationPayable(e: CourseBlock, today: string = algiersDay()): boolean {
  if (e.payout_id || !e.starts_at) return false;
  if (e.withdrawn_at) return e.starts_at <= algiersDay(e.withdrawn_at);
  return !!e.ends_at && e.ends_at <= today;
}

/** Course summary for one package (all its month blocks). */
export function courseSummary(blocks: CourseBlock[], today: string = algiersDay()) {
  const sorted = [...blocks].sort(byCreated);
  const sessions = sorted.reduce((s, b) => s + Number(b.sessions_used ?? 0), 0);
  const starts = sorted.map((b) => b.starts_at).filter(Boolean).sort() as string[];
  const ends = sorted.map((b) => b.ends_at).filter(Boolean).sort() as string[];
  const startsAt = starts[0] ?? null;
  const endsAt = ends.length === sorted.length ? (ends[ends.length - 1] ?? null) : null;
  const withdrawnAt = sorted.find((b) => b.withdrawn_at)?.withdrawn_at ?? null;
  const status: "notStarted" | "running" | "ended" | "withdrawn" = withdrawnAt
    ? "withdrawn"
    : !startsAt
      ? "notStarted"
      : endsAt && endsAt <= today
        ? "ended"
        : "running";
  const months = sorted.reduce((s, b) => s + Number(b.months ?? 0), 0);
  const daysLeft = endsAt && status === "running" ? Math.round((Date.parse(endsAt) - Date.parse(today)) / 86400000) : null;
  return { sessions, startsAt, endsAt, status, months, daysLeft, withdrawnAt };
}
