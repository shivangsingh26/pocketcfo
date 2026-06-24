import { describe, it, expect } from "vitest";
import { normalizeMerchant, detectRecurring } from "@/lib/insights";
import type { Txn } from "@/lib/api";

function txn(merchant: string, dayKey: string, amount: number, direction: Txn["direction"] = "debit"): Txn {
  return { id: `${merchant}-${dayKey}`, occurred_at: `${dayKey}T10:00:00`, amount, direction, merchant, category_id: "other", source: "csv" };
}

describe("normalizeMerchant", () => {
  it("lowercases, trims, strips trailing ref numbers", () => {
    expect(normalizeMerchant("NETFLIX  *12345")).toBe("netflix");
    expect(normalizeMerchant("Swiggy Order #99-88")).toBe("swiggy order");
  });
});

describe("detectRecurring", () => {
  it("flags a monthly subscription (3 charges ~30d apart, stable amount)", () => {
    const txns = [
      txn("Netflix", "2026-04-05", 499),
      txn("Netflix", "2026-05-05", 499),
      txn("Netflix", "2026-06-05", 499),
    ];
    const r = detectRecurring(txns);
    expect(r).toHaveLength(1);
    expect(r[0].cadence).toBe("monthly");
    expect(r[0].avgAmount).toBe(499);
    expect(r[0].monthlyEquivalent).toBeCloseTo(499, 0);
  });
  it("flags weekly cadence and computes ~4.33x monthly equivalent", () => {
    const txns = [
      txn("Gym", "2026-06-01", 200),
      txn("Gym", "2026-06-08", 200),
      txn("Gym", "2026-06-15", 200),
      txn("Gym", "2026-06-22", 200),
    ];
    const r = detectRecurring(txns);
    expect(r[0].cadence).toBe("weekly");
    expect(r[0].monthlyEquivalent).toBeGreaterThan(800);
  });
  it("ignores merchants with < 3 charges", () => {
    expect(detectRecurring([txn("X", "2026-05-01", 10), txn("X", "2026-06-01", 10)])).toHaveLength(0);
  });
  it("ignores irregular gaps", () => {
    const txns = [
      txn("Random", "2026-06-01", 50),
      txn("Random", "2026-06-03", 50),
      txn("Random", "2026-06-20", 50),
    ];
    expect(detectRecurring(txns)).toHaveLength(0);
  });
  it("ignores wildly varying amounts", () => {
    const txns = [
      txn("Store", "2026-04-05", 100),
      txn("Store", "2026-05-05", 900),
      txn("Store", "2026-06-05", 300),
    ];
    expect(detectRecurring(txns)).toHaveLength(0);
  });
  it("ignores credits", () => {
    const txns = [
      txn("Salary", "2026-04-01", 50000, "credit"),
      txn("Salary", "2026-05-01", 50000, "credit"),
      txn("Salary", "2026-06-01", 50000, "credit"),
    ];
    expect(detectRecurring(txns)).toHaveLength(0);
  });
});
