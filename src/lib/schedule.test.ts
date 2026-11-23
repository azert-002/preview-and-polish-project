import { describe, expect, it } from "vitest";
import {
  currentSessions,
  dateInWeek,
  dayMonth,
  daysOverlap,
  findGroupConflicts,
  meetsOn,
  sheetColumns,
  sheetPages,
  nextSessions,
  sessionTitle,
  splitDuration,
  timesOverlap,
  weekStart,
  type ScheduleGroup,
} from "./schedule";

const g = (over: Partial<ScheduleGroup> & { id: string }): ScheduleGroup => ({
  active: true,
  activity: "levels",
  day_of_week: 1,
  workshop_date: null,
  start_time: "17:00:00",
  end_time: "18:30:00",
  ...over,
});

// Monday 23 Nov 2026
const monday = (h: number, m = 0, s = 0) => new Date(2026, 10, 23, h, m, s);

describe("current session", () => {
  it("is the group whose start has passed and end has not, on its weekday", () => {
    const groups = [g({ id: "a" }), g({ id: "b", day_of_week: 2 })];
    expect(currentSessions(groups, monday(17, 45)).map((x) => x.group.id)).toEqual(["a"]);
  });

  it("ends exactly at the end time", () => {
    expect(currentSessions([g({ id: "a" })], monday(18, 30))).toEqual([]);
    expect(currentSessions([g({ id: "a" })], monday(18, 29, 59))).toHaveLength(1);
  });

  it("ignores inactive groups and groups without an end time", () => {
    const groups = [g({ id: "a", active: false }), g({ id: "b", end_time: null })];
    expect(currentSessions(groups, monday(17, 30))).toEqual([]);
  });

  it("counts a workshop only on its own date", () => {
    const w = g({ id: "w", activity: "workshop", day_of_week: null, workshop_date: "2026-11-23" });
    expect(currentSessions([w], monday(17, 10))).toHaveLength(1);
    expect(currentSessions([w], new Date(2026, 10, 30, 17, 10))).toEqual([]);
  });
});

describe("next session", () => {
  it("is the earliest later start today", () => {
    const groups = [g({ id: "late", start_time: "19:00:00", end_time: "20:00:00" }), g({ id: "soon", start_time: "18:00:00", end_time: "19:00:00" })];
    const next = nextSessions(groups, monday(17, 0));
    expect(next.map((x) => x.group.id)).toEqual(["soon"]);
    expect(next[0]?.start).toEqual(monday(18, 0));
  });

  it("rolls over to the following days when nothing is left today", () => {
    const tue = g({ id: "tue", day_of_week: 2, start_time: "09:00:00" });
    const next = nextSessions([g({ id: "mon" }), tue], monday(20, 0));
    expect(next.map((x) => x.group.id)).toEqual(["tue"]);
    expect(next[0]?.start).toEqual(new Date(2026, 10, 24, 9, 0));
  });

  it("returns every group starting at the same moment", () => {
    const next = nextSessions([g({ id: "a" }), g({ id: "b" })], monday(10, 0));
    expect(next.map((x) => x.group.id).sort()).toEqual(["a", "b"]);
  });

  it("wraps to the same weekday next week", () => {
    const next = nextSessions([g({ id: "a" })], monday(19, 0));
    expect(next[0]?.start).toEqual(new Date(2026, 10, 30, 17, 0));
  });
});

describe("week layout", () => {
  it("starts the week on Saturday", () => {
    expect(weekStart(monday(12))).toEqual(new Date(2026, 10, 21));
    expect(weekStart(new Date(2026, 10, 21, 8))).toEqual(new Date(2026, 10, 21));
    expect(dateInWeek(monday(12), 5)).toEqual(new Date(2026, 10, 27));
  });

  it("matches weekly groups by weekday", () => {
    expect(meetsOn(g({ id: "a", day_of_week: 1 }), monday(9))).toBe(true);
    expect(meetsOn(g({ id: "a", day_of_week: 3 }), monday(9))).toBe(false);
  });
});

describe("countdown", () => {
  it("splits remaining time into hours, minutes and seconds", () => {
    expect(splitDuration(3_725_000)).toEqual({ h: 1, m: 2, s: 5 });
    expect(splitDuration(-5000)).toEqual({ h: 0, m: 0, s: 0 });
  });
});

describe("monthly attendance sheet columns", () => {
  it("always has 8 columns (monthly sessions setting), dated only by recorded days in order", () => {
    const cols = sheetColumns(["2026-11-20", "2026-11-08", "2026-11-08", "2026-12-01"], 8, 2026, 10);
    expect(cols).toEqual(["2026-11-08", "2026-11-20", null, null, null, null, null, null]);
  });
  it("keeps 8 empty columns when nothing was recorded yet", () => {
    expect(sheetColumns([], 8, 2026, 10)).toEqual(Array(8).fill(null));
  });
  it("adds columns when more days were recorded than the setting", () => {
    const days = Array.from({ length: 9 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
    expect(sheetColumns(days, 8, 2026, 10)).toHaveLength(9);
  });
  it("titles columns 'الحصة الأولى' with the date as dd/mm", () => {
    expect(sessionTitle(1, "ar")).toBe("الحصة الأولى");
    expect(sessionTitle(8, "ar")).toBe("الحصة الثامنة");
    expect(sessionTitle(1, "en")).toBe("Session 1");
    expect(dayMonth("2026-11-20")).toBe("20/11");
  });
});

describe("one-session (workshop) sheet pages", () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  it("puts 40 students per page: rows 1-20 in the first table, 21-40 continuing in the second", () => {
    const pages = sheetPages(list(45));
    expect(pages).toHaveLength(2);
    expect(pages[0]?.[0]?.rows).toEqual(list(20));
    expect(pages[0]?.[1]?.start).toBe(20);
    expect(pages[0]?.[1]?.rows[0]).toBe(21);
    expect(pages[0]?.[1]?.rows.at(-1)).toBe(40);
    expect(pages[1]?.[0]?.rows).toEqual([41, 42, 43, 44, 45]);
  });
  it("uses a single table when 20 students or fewer", () => {
    expect(sheetPages(list(12))).toEqual([[{ start: 0, rows: list(12) }]]);
  });
});

describe("times overlap and schedule conflicts", () => {
  it("detects strictly overlapping time intervals", () => {
    expect(timesOverlap("14:00", "17:00", "15:00", "18:00")).toBe(true);
    expect(timesOverlap("14:00", "17:00", "14:00", "17:00")).toBe(true);
    expect(timesOverlap("14:00", "17:00", "15:00", "16:00")).toBe(true);
    // Adjacent times do not overlap
    expect(timesOverlap("14:00", "17:00", "17:00", "19:00")).toBe(false);
    expect(timesOverlap("10:00", "12:00", "14:00", "17:00")).toBe(false);
    expect(timesOverlap(null, "17:00", "14:00", "17:00")).toBe(false);
  });

  it("detects day overlap between regular groups and workshops", () => {
    expect(daysOverlap({ activity: "levels", day_of_week: 0 }, { activity: "support", day_of_week: 0 })).toBe(true);
    expect(daysOverlap({ activity: "levels", day_of_week: 0 }, { activity: "support", day_of_week: 1 })).toBe(false);
    // 2026-11-22 is Sunday (day_of_week = 0)
    expect(daysOverlap({ activity: "workshop", workshop_date: "2026-11-22" }, { activity: "levels", day_of_week: 0 })).toBe(true);
    expect(daysOverlap({ activity: "workshop", workshop_date: "2026-11-22" }, { activity: "levels", day_of_week: 1 })).toBe(false);
  });

  it("detects duplicate name, teacher conflict, and room conflict", () => {
    const existing = [
      {
        id: "g1",
        name: "001",
        activity: "levels",
        day_of_week: 0,
        start_time: "14:00:00",
        end_time: "17:00:00",
        teacher_id: "t_talhi",
        room_id: "r1",
        active: true,
      },
    ];

    // Conflict 1: Candidate with duplicate name "001", same teacher, same room at same time
    const conflicts = findGroupConflicts(
      {
        name: "001",
        activity: "levels",
        day_of_week: 0,
        start_time: "14:00",
        end_time: "17:00",
        teacher_id: "t_talhi",
        room_id: "r1",
      },
      existing,
    );

    expect(conflicts.map((c) => c.kind)).toContain("duplicate_name");
    expect(conflicts.map((c) => c.kind)).toContain("teacher_conflict");
    expect(conflicts.map((c) => c.kind)).toContain("room_conflict");
  });

  it("allows same teacher at a different non-overlapping time", () => {
    const existing = [
      {
        id: "g1",
        name: "001",
        activity: "levels",
        day_of_week: 0,
        start_time: "14:00:00",
        end_time: "17:00:00",
        teacher_id: "t_talhi",
        room_id: "r1",
        active: true,
      },
    ];

    const conflicts = findGroupConflicts(
      {
        name: "002",
        activity: "levels",
        day_of_week: 0,
        start_time: "17:00",
        end_time: "19:00",
        teacher_id: "t_talhi",
        room_id: "r1",
      },
      existing,
    );

    expect(conflicts).toHaveLength(0);
  });

  it("ignores self when editing an existing group", () => {
    const existing = [
      {
        id: "g1",
        name: "001",
        activity: "levels",
        day_of_week: 0,
        start_time: "14:00:00",
        end_time: "17:00:00",
        teacher_id: "t_talhi",
        room_id: "r1",
        active: true,
      },
    ];

    const conflicts = findGroupConflicts(
      {
        id: "g1",
        name: "001",
        activity: "levels",
        day_of_week: 0,
        start_time: "14:00",
        end_time: "17:00",
        teacher_id: "t_talhi",
        room_id: "r1",
      },
      existing,
    );

    expect(conflicts).toHaveLength(0);
  });

  it("flags invalid time if end <= start", () => {
    const conflicts = findGroupConflicts(
      {
        name: "New Group",
        activity: "levels",
        start_time: "18:00",
        end_time: "17:00",
      },
      [],
    );
    expect(conflicts.map((c) => c.kind)).toContain("invalid_time");
  });
});
