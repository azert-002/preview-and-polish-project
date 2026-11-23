import { describe, expect, it } from "vitest";
import { maskTime, now24, parse24, shift24, timeSlots } from "./time";

describe("parse24", () => {
  it("reads typed digits as a 24-hour time, never AM/PM", () => {
    expect(parse24("930")).toBe("09:30");
    expect(parse24("1755")).toBe("17:55");
    expect(parse24("0000")).toBe("00:00");
    expect(parse24("2359")).toBe("23:59");
    expect(parse24("8")).toBe("08:00");
    expect(parse24("08")).toBe("08:00");
    expect(parse24("17:55")).toBe("17:55");
  });

  it("clamps impossible hours and minutes instead of rejecting them", () => {
    expect(parse24("2599")).toBe("23:59");
    expect(parse24("93")).toBe("23:00");
    expect(parse24("9999")).toBe("23:59");
  });

  it("returns an empty string for nothing typed", () => {
    expect(parse24("")).toBe("");
    expect(parse24("::")).toBe("");
  });

  it("keeps the output free of AM/PM markers", () => {
    for (const raw of ["930", "1755", "0000", "2359", "8"]) {
      expect(parse24(raw)).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});

describe("maskTime", () => {
  it("shows the colon only once minutes start", () => {
    expect(maskTime("9")).toBe("9");
    expect(maskTime("17")).toBe("17");
    expect(maskTime("175")).toBe("17:5");
    expect(maskTime("1755")).toBe("17:55");
  });
});

describe("shift24", () => {
  it("steps by quarter hours and stops at the edges of the day", () => {
    expect(shift24("10:00", 15)).toBe("10:15");
    expect(shift24("10:00", -15)).toBe("09:45");
    expect(shift24("00:00", -15)).toBe("00:00");
    expect(shift24("23:59", 15)).toBe("23:59");
    expect(shift24("", 15)).toBe("00:15");
  });
});

describe("timeSlots", () => {
  it("covers the whole day in 24-hour labels", () => {
    const slots = timeSlots(15);
    expect(slots).toHaveLength(96);
    expect(slots[0]).toBe("00:00");
    expect(slots[4]).toBe("01:00");
    expect(slots[slots.length - 1]).toBe("23:45");
  });
});

describe("now24", () => {
  it("formats a Date as 24-hour HH:MM", () => {
    expect(now24(new Date(2026, 10, 14, 17, 5))).toBe("17:05");
    expect(now24(new Date(2026, 10, 14, 8, 0))).toBe("08:00");
    expect(now24(new Date(2026, 10, 14, 0, 0))).toBe("00:00");
  });
});
