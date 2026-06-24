import { describe, it, expect } from "vitest";
import { toDayKey, parseDayKey, dayLabel, addDays, startOfMonth, daysInMonth, dayOfMonth } from "@/lib/date";

describe("toDayKey", () => {
  it("formats a Date using local components", () => {
    expect(toDayKey(new Date(2026, 5, 7, 23, 30))).toBe("2026-06-07");
  });
  it("does not shift across UTC midnight (local 00:30 stays same day)", () => {
    expect(toDayKey(new Date(2026, 5, 7, 0, 30))).toBe("2026-06-07");
  });
  it("takes the date prefix of an ISO-with-time string", () => {
    expect(toDayKey("2026-06-07T23:30:00")).toBe("2026-06-07");
  });
});

describe("parseDayKey", () => {
  it("returns local midnight", () => {
    const d = parseDayKey("2026-06-07");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(7);
    expect(d.getHours()).toBe(0);
  });
});

describe("dayLabel", () => {
  const now = new Date(2026, 5, 25);
  it("labels today/yesterday", () => {
    expect(dayLabel("2026-06-25", now)).toBe("Today");
    expect(dayLabel("2026-06-24", now)).toBe("Yesterday");
  });
  it("labels other days without throwing", () => {
    expect(dayLabel("2026-06-21", now)).toMatch(/Jun/);
  });
});

describe("date math", () => {
  it("addDays", () => { expect(toDayKey(addDays(new Date(2026, 5, 30), 1))).toBe("2026-07-01"); });
  it("startOfMonth", () => { expect(toDayKey(startOfMonth(new Date(2026, 5, 25)))).toBe("2026-06-01"); });
  it("daysInMonth", () => { expect(daysInMonth(new Date(2026, 1, 10))).toBe(28); });
  it("dayOfMonth", () => { expect(dayOfMonth(new Date(2026, 5, 25))).toBe(25); });
});
