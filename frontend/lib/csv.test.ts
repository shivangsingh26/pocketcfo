import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";

const cols = [
  { key: "merchant", header: "Merchant" },
  { key: "amount", header: "Amount" },
];

describe("toCsv", () => {
  it("emits a header row", () => {
    expect(toCsv([], cols).split("\r\n")[0]).toBe("Merchant,Amount");
  });
  it("serializes simple rows", () => {
    const out = toCsv([{ merchant: "Cafe", amount: 250 }], cols);
    expect(out).toBe("Merchant,Amount\r\nCafe,250");
  });
  it("quotes fields with commas and doubles inner quotes", () => {
    const out = toCsv([{ merchant: 'A, "B"', amount: 1 }], cols);
    expect(out.split("\r\n")[1]).toBe('"A, ""B""",1');
  });
  it("treats null/undefined as empty", () => {
    const out = toCsv([{ merchant: null, amount: undefined }], cols);
    expect(out.split("\r\n")[1]).toBe(",");
  });
});
