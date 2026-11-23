import { describe, expect, it } from "vitest";
import { findDuplicateLabel, findDuplicateStudent, findDuplicateTeacher, hasLetters, isValidPhone } from "./duplicates";

const s = (id: string, first: string, last: string, phone: string | null = null, parent: string | null = null) => ({
  id, first_name: first, last_name: last, phone, parent_phone: parent,
});

describe("student duplicates", () => {
  const existing = [s("a", "أحمد", "بن علي", null, "0550123456"), s("b", "000", "000")];

  it("blocks a second student with the same name and no phones", () => {
    expect(findDuplicateStudent(s("", "000", "000"), existing)?.kind).toBe("same");
  });
  it("blocks the same name with a shared phone, even written differently", () => {
    expect(findDuplicateStudent(s("", "احمد", "بن  علي", null, "+213 550 12 34 56"), existing)?.match.id).toBe("a");
  });
  it("only asks for confirmation when the namesake has a different phone", () => {
    expect(findDuplicateStudent(s("", "أحمد", "بن علي", "0661000000"), existing)?.kind).toBe("possible");
  });
  it("ignores the student being edited", () => {
    expect(findDuplicateStudent(s("b", "000", "000"), existing)).toBeNull();
  });
});

describe("other duplicates", () => {
  it("blocks a teacher with the same name in swapped order", () => {
    expect(findDuplicateTeacher(s("", "Karim", "Saidi"), [s("t1", "Saidi", "Karim")])?.id).toBe("t1");
  });
  it("blocks a level code that differs only by case", () => {
    expect(findDuplicateLabel({ labels: ["a1"] }, [{ id: "l1", code: "A1" }], (l) => [l.code])?.id).toBe("l1");
  });
  it("blocks a subject whose Arabic name already exists", () => {
    const subjects = [{ id: "x", name_ar: "الإنجليزية", name_en: "EN" }];
    expect(findDuplicateLabel({ labels: ["الانجليزية", "English"] }, subjects, (r) => [r.name_ar, r.name_en])?.id).toBe("x");
  });
});

describe("field checks", () => {
  it("rejects names made only of digits", () => {
    expect(hasLetters("000")).toBe(false);
    expect(hasLetters("سارة")).toBe(true);
  });
  it("accepts empty or 9-13 digit phones only", () => {
    expect(isValidPhone("")).toBe(true);
    expect(isValidPhone("0550 12 34 56")).toBe(true);
    expect(isValidPhone("000")).toBe(false);
    expect(isValidPhone("abc0550123456")).toBe(false);
  });
});
