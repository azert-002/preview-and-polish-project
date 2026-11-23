import { describe, expect, it } from "vitest";
import { ageGroupFor, audienceForAgeGroup, groupSeat, studentAgeGroup, waitlistBuckets } from "./business";

const active = (student_id: string) => ({ student_id, sessions_used: 0, sessions_total: 8 });
const ref = new Date("2026-06-01");

describe("group capacity (15 students)", () => {
  it("accepts the 15th student and refuses the 16th", () => {
    const fourteen = Array.from({ length: 14 }, (_, i) => active(`s${i}`));
    expect(groupSeat("support", fourteen, "new").full).toBe(false);
    const fifteen = [...fourteen, active("s14")];
    expect(groupSeat("support", fifteen, "new").full).toBe(true);
  });
  it("lets a student already in a full group renew", () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => active(`s${i}`));
    expect(groupSeat("support", fifteen, "s3").full).toBe(false);
  });
  it("frees the seat of a student whose package is finished", () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => active(`s${i}`));
    fifteen[0] = { student_id: "s0", sessions_used: 8, sessions_total: 8 };
    expect(groupSeat("levels", fifteen, "new").full).toBe(false);
  });
});

describe("age categories", () => {
  it("maps ages to 5–8, 9–10, 11–13, 14–16 and 17+", () => {
    expect(ageGroupFor("2021-05-01", ref)).toBe("5-8"); // 5
    expect(ageGroupFor("2017-05-01", ref)).toBe("9-10"); // 9
    expect(ageGroupFor("2016-05-01", ref)).toBe("9-10"); // 10
    expect(ageGroupFor("2015-05-01", ref)).toBe("11-13"); // 11
    expect(ageGroupFor("2012-05-01", ref)).toBe("14-16"); // 14
    expect(ageGroupFor("2009-07-01", ref)).toBe("14-16"); // 16
    expect(ageGroupFor("2009-05-01", ref)).toBe("17+"); // 17
  });
  it("has no category under 5 or without a birth date", () => {
    expect(ageGroupFor("2022-05-01", ref)).toBeNull();
    expect(ageGroupFor(null, ref)).toBeNull();
  });
  it("prices only the 17+ category as adults", () => {
    expect(audienceForAgeGroup("17+")).toBe("adults");
    expect(audienceForAgeGroup("14-16")).toBe("kids");
  });
});

describe("waiting list", () => {
  const w = (i: number, subject_id = "en", age_group = "9-10") => ({
    activity: "levels",
    subject_id,
    age_group,
    created_at: `2026-01-${String(i + 1).padStart(2, "0")}`,
  });
  it("is ready to open a group at 8 waiting students, not 7", () => {
    expect(waitlistBuckets(Array.from({ length: 7 }, (_, i) => w(i)))[0]!.ready).toBe(false);
    expect(waitlistBuckets(Array.from({ length: 8 }, (_, i) => w(i)))[0]!.ready).toBe(true);
  });
  it("counts different subjects or age categories separately", () => {
    const list = [...Array.from({ length: 4 }, (_, i) => w(i, "en")), ...Array.from({ length: 4 }, (_, i) => w(i, "fr"))];
    expect(waitlistBuckets(list).map((b) => b.count)).toEqual([4, 4]);
    expect(waitlistBuckets([w(1, "en", "9-10"), w(2, "en", "11-13")])).toHaveLength(2);
  });
  it("counts different levels separately for adult language groups", () => {
    const list = [
      { activity: "levels", subject_id: "en", age_group: "17+", level_id: "lvl_a1", created_at: "2026-01-01" },
      { activity: "levels", subject_id: "en", age_group: "17+", level_id: "lvl_a2", created_at: "2026-01-02" },
    ];
    expect(waitlistBuckets(list)).toHaveLength(2);
  });
});

describe("student age category", () => {
  it("uses the category chosen on the student form", () => {
    expect(studentAgeGroup({ age_group: "11-13", birth_date: null })).toBe("11-13");
  });
  it("falls back to an old birth date when no category was chosen", () => {
    expect(studentAgeGroup({ age_group: null, birth_date: "1990-01-01" })).toBe("17+");
  });
  it("is empty when neither is known", () => {
    expect(studentAgeGroup({ age_group: null, birth_date: null })).toBeNull();
  });
});
