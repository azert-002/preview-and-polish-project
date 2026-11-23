import { describe, expect, it } from "vitest";
import { planWithdrawal, studentLedger } from "./business";

const blk = (id: string, used: number, total = 8, price = 4000, payout_id: string | null = null) => ({
  id,
  sessions_used: used,
  sessions_total: total,
  price,
  payout_id,
});

describe("withdrawing a student from a package", () => {
  it("charging used sessions only: 3 of 8 sessions of a 4000 package costs 1500", () => {
    const p = planWithdrawal([blk("b1", 3)], "used");
    expect(p.keep).toEqual([{ id: "b1", sessions_total: 3, price: 1500 }]);
    expect(p.newPrice).toBe(1500);
  });

  it("charging the full package keeps the 4000 price but ends the sessions", () => {
    const p = planWithdrawal([blk("b1", 3)], "full");
    expect(p.keep).toEqual([{ id: "b1", sessions_total: 3, price: 4000 }]);
    expect(p.newPrice).toBe(4000);
  });

  it("a package never started costs 0 when charging used sessions only, and stays in the history", () => {
    const p = planWithdrawal([blk("b1", 0)], "used");
    expect(p.keep).toEqual([{ id: "b1", sessions_total: 0, price: 0 }]);
    expect(p.deletes).toEqual([]);
    expect(p.newPrice).toBe(0);
  });

  it("a never-started package charged in full keeps its price with no sessions left", () => {
    const p = planWithdrawal([blk("b1", 0)], "full");
    expect(p.keep).toEqual([{ id: "b1", sessions_total: 0, price: 4000 }]);
    expect(p.deletes).toEqual([]);
  });

  it("in a multi-block package, finished blocks stay and untouched blocks are removed", () => {
    const p = planWithdrawal([blk("b1", 8, 8, 3750), blk("b2", 2, 8, 3750), blk("b3", 0, 8, 3750), blk("b4", 0, 6, 3750)], "used");
    expect(p.keep).toEqual([
      { id: "b1", sessions_total: 8, price: 3750 },
      { id: "b2", sessions_total: 2, price: 938 },
    ]);
    expect(p.deletes).toEqual(["b3", "b4"]);
    expect(p.keepId).toBe("b1");
  });

  it("never changes a block the teacher was already paid for", () => {
    const p = planWithdrawal([blk("b1", 4, 8, 4000, "payout1")], "used");
    expect(p.keep).toEqual([{ id: "b1", sessions_total: 8, price: 4000 }]);
  });

  it("money paid above the reduced price becomes credit for the next package", () => {
    const p = planWithdrawal([blk("b1", 2)], "used");
    const l = studentLedger(
      p.keep.map((k) => ({ id: k.id, group_id: "g1", created_at: "2026-01-01", price: k.price })),
      [{ id: "p1", amount: 4000, enrollment_id: "b1", created_at: "2026-01-01" }],
    );
    expect(l.debt).toBe(0);
    expect(l.credit).toBe(3000);
  });
});

describe("seat after withdrawal", () => {
  it("a student withdrawn from a workshop no longer takes a seat", async () => {
    const { groupStudentIds } = await import("./business");
    const ids = groupStudentIds("workshop", [
      { student_id: "s1", sessions_used: 0, sessions_total: 0, withdrawn_at: "2026-01-02" },
      { student_id: "s2", sessions_used: 1, sessions_total: 1 },
    ]);
    expect([...ids]).toEqual(["s2"]);
  });
});
