/**
 * Timetable rules: which sessions run on a date, which one is happening now,
 * and which one comes next. Times are the academy's local clock.
 */

export type ScheduleGroup = {
  id: string;
  active: boolean;
  activity: string;
  day_of_week: number | null;
  workshop_date: string | null;
  start_time: string | null;
  end_time: string | null;
};

/** Display order of the week: Saturday first, Friday last. */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;

/** "17:30" or "17:30:00" -> minutes since midnight. */
export function toMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hh = Number(h);
  const mm = Number(m ?? 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

/** "17:30:00" -> "17:30" */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "—");

/** Local calendar date as YYYY-MM-DD. */
export function localISO(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Does this group meet on that calendar date? Workshops meet on their date only. */
export function meetsOn(g: ScheduleGroup, date: Date) {
  if (!g.active) return false;
  if (g.activity === "workshop") return g.workshop_date === localISO(date);
  return g.day_of_week === date.getDay();
}

/** Saturday that starts the week containing `d` (00:00 local). */
export function weekStart(d: Date) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - ((s.getDay() + 1) % 7));
  return s;
}

/** Date of a weekday (0=Sun..6=Sat) inside the Saturday-first week of `d`. */
export function dateInWeek(d: Date, weekday: number) {
  const s = weekStart(d);
  s.setDate(s.getDate() + ((weekday + 1) % 7));
  return s;
}

function at(date: Date, minutes: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60);
}

export type LiveSession<G> = { group: G; start: Date; end: Date };

/** Sessions in progress at `now`: started, not yet ended. Needs both times. */
export function currentSessions<G extends ScheduleGroup>(groups: G[], now: Date): LiveSession<G>[] {
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  return groups
    .filter((g) => meetsOn(g, now))
    .flatMap((g) => {
      const s = toMinutes(g.start_time);
      const e = toMinutes(g.end_time);
      if (s == null || e == null || e <= s) return [];
      return s <= nowMin && nowMin < e ? [{ group: g, start: at(now, s), end: at(now, e) }] : [];
    })
    .sort((a, b) => a.end.getTime() - b.end.getTime());
}

/**
 * The next sessions to start after `now` (today later, or the following days,
 * up to a week ahead). Several groups starting at the same moment are all returned.
 */
export function nextSessions<G extends ScheduleGroup>(groups: G[], now: Date): LiveSession<G>[] {
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const found = groups
      .filter((g) => meetsOn(g, day))
      .flatMap((g) => {
        const s = toMinutes(g.start_time);
        if (s == null) return [];
        const start = at(day, s);
        if (start.getTime() <= now.getTime()) return [];
        const e = toMinutes(g.end_time);
        const end = e != null && e > s ? at(day, e) : start;
        return [{ group: g, start, end }];
      });
    if (found.length) {
      const first = Math.min(...found.map((f) => f.start.getTime()));
      return found.filter((f) => f.start.getTime() === first);
    }
  }
  return [];
}

/** Split a duration in ms into h/m/s (never negative). */
export function splitDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

/**
 * Columns of the monthly attendance sheet (month is 0-based): a fixed number of
 * session columns (the monthly sessions setting). Each column gets the date of a
 * session actually recorded that month, in order; the rest stay null (no date yet).
 * If more days were recorded than the setting, every recorded day still gets a column.
 */
export function sheetColumns(recorded: string[], count: number, year: number, month: number): (string | null)[] {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const days = [...new Set(recorded.filter((r) => r.startsWith(prefix)))].sort();
  const n = Math.max(count, days.length);
  return Array.from({ length: n }, (_, i) => days[i] ?? null);
}

const AR_ORDINALS = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية عشرة", "الثانية عشرة"];

/** Column title of the n-th session (1-based): "الحصة الأولى" / "Session 1". */
export function sessionTitle(n: number, lang: "ar" | "en") {
  if (lang === "en") return `Session ${n}`;
  return `الحصة ${AR_ORDINALS[n - 1] ?? n}`;
}

/** "2026-11-20" -> "20/11" */
export const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Pages of the one-session (portrait) attendance sheet: 40 students per page,
 * shown as two side-by-side tables of 20 — the second continues the numbering.
 * An empty list still yields one page with an empty table.
 */
export function sheetPages<T>(students: T[], perTable = 20): { start: number; rows: T[] }[][] {
  const pages: { start: number; rows: T[] }[][] = [];
  for (let p = 0; p === 0 || p < students.length; p += perTable * 2) {
    const page = [{ start: p, rows: students.slice(p, p + perTable) }];
    const second = students.slice(p + perTable, p + perTable * 2);
    if (second.length) page.push({ start: p + perTable, rows: second });
    pages.push(page);
  }
  return pages;
}

/**
 * Checks whether two time intervals [start1, end1] and [start2, end2] strictly overlap.
 * Overlap condition: start1 < end2 && start2 < end1.
 */
export function timesOverlap(
  start1: string | null | undefined,
  end1: string | null | undefined,
  start2: string | null | undefined,
  end2: string | null | undefined,
): boolean {
  const s1 = toMinutes(start1);
  const e1 = toMinutes(end1);
  const s2 = toMinutes(start2);
  const e2 = toMinutes(end2);
  if (s1 == null || e1 == null || s2 == null || e2 == null) return false;
  return s1 < e2 && s2 < e1;
}

/**
 * Checks whether two groups meet on the same day (weekly day or workshop date).
 */
export function daysOverlap(
  g1: { activity?: string | null; day_of_week?: number | null; workshop_date?: string | null },
  g2: { activity?: string | null; day_of_week?: number | null; workshop_date?: string | null },
): boolean {
  if (g1.activity === "workshop" && g2.activity === "workshop") {
    return Boolean(g1.workshop_date && g1.workshop_date === g2.workshop_date);
  }
  if (g1.activity !== "workshop" && g2.activity !== "workshop") {
    return g1.day_of_week != null && g2.day_of_week != null && Number(g1.day_of_week) === Number(g2.day_of_week);
  }
  const ws = g1.activity === "workshop" ? g1 : g2;
  const reg = g1.activity === "workshop" ? g2 : g1;
  if (!ws.workshop_date || reg.day_of_week == null) return false;
  const [y, m, d] = ws.workshop_date.split("-").map(Number);
  if (!y || !m || !d) return false;
  const wsDay = new Date(y, m - 1, d).getDay();
  return wsDay === Number(reg.day_of_week);
}

export type GroupConflictKind = "duplicate_name" | "teacher_conflict" | "room_conflict" | "invalid_time";

export interface GroupConflictItem<G = any> {
  kind: GroupConflictKind;
  otherGroup?: G;
}

/**
 * Validates a candidate group against existing groups to detect duplicate names,
 * teacher double-booking, and room double-booking during overlapping times.
 */
export function findGroupConflicts<
  G extends {
    id: string;
    name: string;
    active?: boolean;
    teacher_id?: string | null;
    room_id?: string | null;
    activity: string;
    day_of_week?: number | null;
    workshop_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
  },
>(
  candidate: {
    id?: string | null;
    name: string;
    activity: string;
    teacher_id?: string | null;
    room_id?: string | null;
    day_of_week?: number | null;
    workshop_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
  },
  existingGroups: G[],
): GroupConflictItem<G>[] {
  const conflicts: GroupConflictItem<G>[] = [];

  const s = toMinutes(candidate.start_time);
  const e = toMinutes(candidate.end_time);
  if (s != null && e != null && e <= s) {
    conflicts.push({ kind: "invalid_time" });
  }

  const candName = (candidate.name ?? "").trim().toLowerCase();

  for (const other of existingGroups) {
    if (candidate.id && other.id === candidate.id) continue;
    if (other.active === false) continue;

    // 1. Name duplication check
    if (candName && (other.name ?? "").trim().toLowerCase() === candName) {
      conflicts.push({ kind: "duplicate_name", otherGroup: other });
    }

    // Schedule overlap check
    const sameDay = daysOverlap(candidate, other);
    const timeOverlap = timesOverlap(candidate.start_time, candidate.end_time, other.start_time, other.end_time);

    if (sameDay && timeOverlap) {
      // 2. Teacher conflict
      if (candidate.teacher_id && other.teacher_id && candidate.teacher_id === other.teacher_id) {
        conflicts.push({ kind: "teacher_conflict", otherGroup: other });
      }
      // 3. Room conflict
      if (candidate.room_id && other.room_id && candidate.room_id === other.room_id) {
        conflicts.push({ kind: "room_conflict", otherGroup: other });
      }
    }
  }

  return conflicts;
}
