import { describe, it, expect } from "vitest";
import { inr, categoryMeta, CATEGORIES } from "@/lib/api";

describe("inr", () => {
  it("formats integers in en-IN", () => { expect(inr(125000)).toBe("₹1,25,000"); });
  it("guards NaN", () => { expect(inr(Number.NaN)).toBe("₹0"); });
  it("guards undefined-ish", () => { expect(inr(undefined as unknown as number)).toBe("₹0"); });
});

describe("categoryMeta", () => {
  it("returns known category", () => {
    const m = categoryMeta("food");
    expect(m.label).toBe("Food");
    expect(m.emoji).toBe("🍔");
    expect(m.color).toContain("var(--pc-");
  });
  it("falls back for unknown id", () => {
    const m = categoryMeta("nonsense");
    expect(m.id).toBe("nonsense");
    expect(m.emoji).toBeTruthy();
    expect(m.color).toContain("var(--pc-");
  });
});

describe("CATEGORIES", () => {
  it("every category has a color token", () => {
    for (const c of CATEGORIES) expect(c.color).toContain("var(--pc-");
  });
});
