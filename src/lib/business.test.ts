import { describe, expect, it } from "vitest";
import { audienceFor, buildAutoGroupName, buildPackage, groupStudentIds, splitPayroll } from "./business";

const settings = {
  support_price: 1500,
  sessions_per_month: 8,
  kids_sessions_per_month: 9,
  kids_monthly_price: 5000,
  kids_quarter_price: 12500,
};

describe("pricing", () => {
  it("support classes cost 1500 DZD for 9 sessions for kids", () => {
    const p = buildPackage({ activity: "support", audience: "kids", plan: "monthly", settings });
    expect(p.total).toBe(1500);
    expect(p.blocks).toEqual([{ sessions: 9, price: 1500 }]);
  });

  it("kids languages cost 5000 DZD per month (9 sessions)", () => {
    const p = buildPackage({ activity: "levels", audience: "kids", plan: "monthly", settings });
    expect(p.total).toBe(5000);
    expect(p.blocks).toEqual([{ sessions: 9, price: 5000 }]);
  });

  it("kids 3-month offer is 12500 DZD for 27 sessions (9 per month)", () => {
    const p = buildPackage({ activity: "levels", audience: "kids", plan: "quarter", settings });
    expect(p.total).toBe(12500);
    expect(p.blocks.reduce((s, b) => s + b.sessions, 0)).toBe(27);
    expect(p.blocks.reduce((s, b) => s + b.price, 0)).toBe(12500);
  });

  it("adult level A0 costs 3000 DZD", () => {
    const p = buildPackage({
      activity: "levels",
      audience: "adults",
      plan: "monthly",
      settings,
      level: { price: 3000, sessions: 8, code: "A0" },
    });
    expect(p.total).toBe(3000);
    expect(p.blocks).toEqual([{ sessions: 8, price: 3000 }]);
  });

  it("adult levels A1/A2/A2+ cost 4000 DZD monthly", () => {
    const p = buildPackage({
      activity: "levels",
      audience: "adults",
      plan: "monthly",
      settings,
      level: { price: 4000, package_price: 15000, sessions: 30, code: "A1" },
    });
    expect(p.total).toBe(4000);
    expect(p.blocks).toEqual([{ sessions: 8, price: 4000 }]);
  });

  it("adult levels A1/A2/A2+ 4-month package costs 15000 DZD for 30 sessions", () => {
    const p = buildPackage({
      activity: "levels",
      audience: "adults",
      plan: "four_months",
      settings,
      level: { price: 4000, package_price: 15000, sessions: 30, code: "A1" },
    });
    expect(p.total).toBe(15000);
    expect(p.blocks).toEqual([{ sessions: 30, price: 15000 }]);
  });

  it("kids 3-month package is 12000 DZD and 6-month package is 20000 DZD (9 sessions/month)", () => {
    const academySettings = {
      ...settings,
      kids_quarter_price: 12000,
      kids_semester_price: 20000,
      kids_sessions_per_month: 9,
    };
    const p3 = buildPackage({ activity: "levels", audience: "kids", plan: "quarter", settings: academySettings });
    expect(p3.total).toBe(12000);
    expect(p3.blocks).toEqual([{ sessions: 27, price: 12000 }]);

    const p6 = buildPackage({ activity: "levels", audience: "kids", plan: "semester", settings: academySettings });
    expect(p6.total).toBe(20000);
    expect(p6.blocks).toEqual([{ sessions: 54, price: 20000 }]);
  });

  it("daily workshop is a single session at its own price", () => {
    const p = buildPackage({ activity: "workshop", audience: "adults", plan: "single", settings, workshopPrice: 2000 });
    expect(p.blocks).toEqual([{ sessions: 1, price: 2000 }]);
  });

  it("students aged 17 or more are adults", () => {
    const ref = new Date("2026-06-01");
    expect(audienceFor("2009-05-31", ref)).toBe("adults");
    expect(audienceFor("2009-06-02", ref)).toBe("kids");
  });
});

describe("teacher payroll", () => {
  it("pays fixed amount (default 500 DZD) only for students who completed all 8 sessions and defers the rest", () => {
    const r = splitPayroll(
      [
        { sessions_used: 8, sessions_total: 8, price: 1500, payout_id: null },
        { sessions_used: 5, sessions_total: 8, price: 1500, payout_id: null },
      ],
      500,
    );
    expect(r.eligible).toHaveLength(1);
    expect(r.deferred).toHaveLength(1);
    expect(r.share).toBe(500);
    expect(r.revenue).toBe(1500);
  });

  it("pays a completed workshop fixed amount immediately (default 300 DZD)", () => {
    const r = splitPayroll([{ sessions_used: 1, sessions_total: 1, price: 500, payout_id: null }], 300);
    expect(r.eligible).toHaveLength(1);
    expect(r.share).toBe(300);
    expect(r.effectiveAmount).toBe(300);
  });

  it("records the group's own fixed amount, overriding the teacher's default", () => {
    const r = splitPayroll([{ sessions_used: 1, sessions_total: 1, price: 500, payout_id: null }], 500, () => 300);
    expect(r.share).toBe(300);
    expect(r.effectiveAmount).toBe(300);
  });

  it("falls back to default amount when nothing is payable", () => {
    expect(splitPayroll([], 500).effectiveAmount).toBe(500);
  });

  it("does not pay a package twice", () => {
    const r = splitPayroll([{ sessions_used: 8, sessions_total: 8, price: 1500, payout_id: "p1" }], 500);
    expect(r.eligible).toHaveLength(0);
    expect(r.share).toBe(0);
  });

  it("applies per-student fixed amounts when provided (e.g. 500 for monthly support + 300 for workshop)", () => {
    const r = splitPayroll(
      [
        { sessions_used: 8, sessions_total: 8, price: 1500, payout_id: null, amount: 500 },
        { sessions_used: 1, sessions_total: 1, price: 500, payout_id: null, amount: 300 },
      ],
      500,
      (e) => e.amount,
    );
    // 500 + 300 = 800
    expect(r.share).toBe(800);
    expect(r.revenue).toBe(2000);
  });
});

describe("registered students in a group", () => {
  const done = { sessions_used: 1, sessions_total: 1 };
  it("keeps counting workshop students after they attend the single session", () => {
    expect(groupStudentIds("workshop", [{ student_id: "a", ...done }, { student_id: "b", ...done }]).size).toBe(2);
  });

  it("counts weekly-group students only while their package has sessions left", () => {
    const ids = groupStudentIds("support", [
      { student_id: "a", sessions_used: 1, sessions_total: 8 },
      { student_id: "b", sessions_used: 8, sessions_total: 8 },
    ]);
    expect([...ids]).toEqual(["a"]);
  });

  it("counts a student with several blocks once", () => {
    const ids = groupStudentIds("levels", [
      { student_id: "a", sessions_used: 8, sessions_total: 8 },
      { student_id: "a", sessions_used: 0, sessions_total: 8 },
    ]);
    expect(ids.size).toBe(1);
  });
});

describe("buildAutoGroupName", () => {
  it("formats adult language group with level code (e.g. الإنجليزية · A1)", () => {
    const name = buildAutoGroupName({
      subjectName: "الإنجليزية",
      ageGroup: "17+",
      levelCode: "A1",
    });
    expect(name).toBe("الإنجليزية · A1");
  });

  it("formats kids group with age category (e.g. الإنجليزية · 9-10)", () => {
    const name = buildAutoGroupName({
      subjectName: "الإنجليزية",
      ageGroup: "9-10",
    });
    expect(name).toBe("الإنجليزية · 9-10");
  });

  it("formats workshop group with ورشة suffix", () => {
    const name = buildAutoGroupName({
      subjectName: "الرياضيات",
      activity: "workshop",
    });
    expect(name).toBe("الرياضيات · ورشة");
  });

  it("returns base subject when no level, age group, or workshop", () => {
    const name = buildAutoGroupName({
      subjectName: "الفيزياء",
    });
    expect(name).toBe("الفيزياء");
  });

  it("handles duplicate group names by appending (2), (3)", () => {
    const name1 = buildAutoGroupName({
      subjectName: "الإنجليزية",
      ageGroup: "9-10",
      existingNames: ["الإنجليزية · 9-10"],
    });
    expect(name1).toBe("الإنجليزية · 9-10 (2)");

    const name2 = buildAutoGroupName({
      subjectName: "الإنجليزية",
      ageGroup: "9-10",
      existingNames: ["الإنجليزية · 9-10", "الإنجليزية · 9-10 (2)"],
    });
    expect(name2).toBe("الإنجليزية · 9-10 (3)");
  });

  it("returns empty string if subjectName is empty or missing", () => {
    expect(buildAutoGroupName({ subjectName: "" })).toBe("");
    expect(buildAutoGroupName({})).toBe("");
  });
});

