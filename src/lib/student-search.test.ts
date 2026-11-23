import { describe, expect, it } from "vitest";
import { searchStudents } from "./student-search";

const base = { code: null, phone: null, parent_phone: null, active: true };
const students = [
  { ...base, first_name: "أحمد", last_name: "بن علي", code: "BW-0001" },
  { ...base, first_name: "Sara", last_name: "Benali", code: "BW-0002", phone: "0550123456" },
  { ...base, first_name: "Karim", last_name: "Old", code: "BW-0003", active: false },
];

describe("searchStudents", () => {
  it("finds a student by first and last name in any order", () => {
    expect(searchStudents(students, "علي احمد").map((s) => s.code)).toEqual(["BW-0001"]);
  });
  it("finds a student by phone number", () => {
    expect(searchStudents(students, "0550").map((s) => s.code)).toEqual(["BW-0002"]);
  });
  it("hides inactive students", () => {
    expect(searchStudents(students, "karim")).toEqual([]);
  });
});
