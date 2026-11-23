import { describe, expect, it } from "vitest";
import { receiptFigures, studentLedger, validatePayment } from "./business";

const enr = (id: string, price: number, created_at: string, group_id = "g1") => ({ id, price, created_at, group_id });
const pay = (id: string, amount: number, enrollment_id: string | null, created_at: string) => ({ id, amount, enrollment_id, created_at });

describe("student debts", () => {
  it("paying 1000 of a 3000 package leaves a 2000 debt", () => {
    const l = studentLedger([enr("e1", 3000, "2026-01-01")], [pay("p1", 1000, "e1", "2026-01-01")]);
    expect(l.debt).toBe(2000);
    expect(l.credit).toBe(0);
    expect(l.bundles[0]!.remaining).toBe(2000);
  });

  it("a partial 500 payment then the last 1500 clears the debt", () => {
    const e = [enr("e1", 3000, "2026-01-01")];
    const p = [pay("p1", 1000, "e1", "2026-01-01"), pay("p2", 500, "e1", "2026-01-05")];
    expect(studentLedger(e, p).debt).toBe(1500);
    expect(studentLedger(e, [...p, pay("p3", 1500, "e1", "2026-01-09")]).debt).toBe(0);
  });

  it("a 3-month package stored as 3 blocks is one package of 12500", () => {
    const e = [enr("b1", 4167, "2026-01-01"), enr("b2", 4167, "2026-01-01"), enr("b3", 4166, "2026-01-01")];
    const l = studentLedger(e, [pay("p1", 10000, "b1", "2026-01-01")]);
    expect(l.bundles).toHaveLength(1);
    expect(l.bundles[0]!.price).toBe(12500);
    expect(l.debt).toBe(2500);
  });

  it("money left from a deleted package becomes credit, not a hidden zero", () => {
    // the screenshot case: package 300, paid 100 on it + 1500 from a deleted group
    const l = studentLedger([enr("w", 300, "2026-02-01")], [pay("old", 1500, null, "2026-01-01"), pay("p", 100, "w", "2026-02-01")]);
    expect(l.due).toBe(300);
    expect(l.paid).toBe(1600);
    expect(l.debt).toBe(0);
    expect(l.credit).toBe(1300);
    expect(l.bundles[0]!.fromCredit).toBe(200);
  });

  it("credit covers the oldest unpaid package first", () => {
    const e = [enr("a", 1500, "2026-01-01", "g1"), enr("b", 5000, "2026-01-02", "g2")];
    const l = studentLedger(e, [pay("x", 2000, null, "2026-01-01")]);
    expect(l.bundles[0]!.remaining).toBe(0);
    expect(l.bundles[1]!.remaining).toBe(4500);
    expect(l.debt - l.credit).toBe(l.due - l.paid);
  });
});

describe("debt payment validation", () => {
  it("rejects zero, negative and empty amounts", () => {
    expect(validatePayment(0, 2000)).toBe("invalidAmount");
    expect(validatePayment(-5, 2000)).toBe("invalidAmount");
    expect(validatePayment(Number(""), 2000)).toBe("invalidAmount");
  });
  it("rejects paying more than the remaining debt", () => {
    expect(validatePayment(2001, 2000)).toBe("exceedsDebt");
  });
  it("accepts a partial or the full remaining amount", () => {
    expect(validatePayment(500, 2000)).toBeNull();
    expect(validatePayment(2000, 2000)).toBeNull();
  });
});

describe("receipt figures", () => {
  it("second receipt shows what was paid before and what is left", () => {
    const e = [enr("e1", 3000, "2026-01-01")];
    const p = [pay("p1", 1000, "e1", "2026-01-01"), pay("p2", 1500, "e1", "2026-01-05")];
    expect(receiptFigures(p[1]!, e, p)).toEqual({ total: 3000, previous: 1000, remaining: 500 });
  });
});
