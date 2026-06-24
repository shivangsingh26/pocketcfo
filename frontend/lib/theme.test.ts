// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { getStored, applyTheme, setTheme, STORAGE_KEY } from "@/lib/theme";

beforeEach(() => { localStorage.clear(); document.documentElement.className = ""; });

describe("theme", () => {
  it("getStored returns null when unset", () => { expect(getStored()).toBeNull(); });
  it("applyTheme toggles the dark class", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
  it("setTheme persists and applies", () => {
    setTheme("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
