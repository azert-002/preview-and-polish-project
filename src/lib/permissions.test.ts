import { describe, expect, it } from "vitest";
import { canAccessPath, canManageUsers, canSeeIncome } from "./permissions";

describe("director (admin)", () => {
  it("opens every page, including payroll, finance and settings", () => {
    for (const p of ["/dashboard", "/students", "/payroll", "/finance", "/settings"]) expect(canAccessPath("admin", p)).toBe(true);
  });
  it("sees the monthly income card and manages users", () => {
    expect(canSeeIncome("admin")).toBe(true);
    expect(canManageUsers("admin")).toBe(true);
  });
});

describe("secretary (staff)", () => {
  it("cannot open payroll, finance or settings", () => {
    expect(canAccessPath("staff", "/payroll")).toBe(false);
    expect(canAccessPath("staff", "/finance")).toBe(false);
    expect(canAccessPath("staff", "/settings")).toBe(false);
  });
  it("still opens the dashboard, scan, timetable, students and courses", () => {
    for (const p of ["/dashboard", "/scan", "/timetable", "/students", "/students/abc", "/academics", "/groups/x", "/waiting"]) expect(canAccessPath("staff", p)).toBe(true);
  });
  it("does not see the monthly income card nor manage users", () => {
    expect(canSeeIncome("staff")).toBe(false);
    expect(canManageUsers("staff")).toBe(false);
  });
});

describe("account without a role", () => {
  it("opens nothing", () => {
    expect(canAccessPath(null, "/dashboard")).toBe(false);
  });
});
