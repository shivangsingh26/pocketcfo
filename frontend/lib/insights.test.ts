import { describe, it, expect } from "vitest";
import { normalizeMerchant, detectRecurring, projectMonthEnd, monthOverMonth, savingsRate } from "@/lib/insights";
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

describe("projectMonthEnd", () => {
  it("scales month-to-date debits by days-in-month / days-elapsed", () => {
    const now = new Date(2026, 5, 10); // 10th of 30-day June
    const txns = [txn("A", "2026-06-01", 1000), txn("A", "2026-06-05", 2000)]; // MTD 3000
    const f = projectMonthEnd(txns, now);
    expect(f.monthToDate).toBe(3000);
    expect(f.daysElapsed).toBe(10);
    expect(f.daysInMonth).toBe(30);
    expect(f.projected).toBe(9000);
  });
  it("ignores prior-month and credit txns", () => {
    const now = new Date(2026, 5, 10);
    const txns = [txn("A", "2026-05-30", 5000), txn("A", "2026-06-02", 1000), txn("S", "2026-06-02", 4000, "credit")];
    expect(projectMonthEnd(txns, now).monthToDate).toBe(1000);
  });
});

describe("monthOverMonth", () => {
  it("computes per-category delta vs last month", () => {
    const now = new Date(2026, 5, 15);
    const txns = [
      { ...txn("A", "2026-05-10", 1000), category_id: "food" },
      { ...txn("B", "2026-06-10", 1300), category_id: "food" },
    ];
    const d = monthOverMonth(txns, now).find((x) => x.categoryId === "food")!;
    expect(d.thisMonth).toBe(1300);
    expect(d.lastMonth).toBe(1000);
    expect(d.deltaPct).toBeCloseTo(30, 0);
  });
});

describe("savingsRate", () => {
  it("rate = (income - spend) / income for the current month", () => {
    const now = new Date(2026, 5, 15);
    const txns = [txn("S", "2026-06-01", 10000, "credit"), txn("A", "2026-06-02", 4000)];
    const s = savingsRate(txns, now);
    expect(s.income).toBe(10000);
    expect(s.spend).toBe(4000);
    expect(s.rate).toBeCloseTo(0.6, 5);
  });
  it("rate is 0 when no income", () => {
    expect(savingsRate([txn("A", "2026-06-02", 4000)], new Date(2026, 5, 15)).rate).toBe(0);
  });
  it("exposes net (income - spend), positive when saving", () => {
    const s = savingsRate([txn("S", "2026-06-01", 10000, "credit"), txn("A", "2026-06-02", 4000)], new Date(2026, 5, 15));
    expect(s.net).toBe(6000);
  });
  it("net is negative when overspending (no panic percentage needed)", () => {
    const s = savingsRate([txn("S", "2026-06-01", 78767, "credit"), txn("A", "2026-06-02", 527191)], new Date(2026, 5, 15));
    expect(s.net).toBe(-448424);
    expect(s.rate).toBeLessThan(0);
  });
});
