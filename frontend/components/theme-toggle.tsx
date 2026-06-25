"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { resolveTheme, setTheme, subscribeTheme, type Theme } from "@/lib/theme";

const serverTheme = (): Theme => "light";

export function ThemeToggle() {
  // useSyncExternalStore reads the real theme on the client and a stable
  // "light" during SSR/hydration — no setState-in-effect, no hydration flash.
  const theme = useSyncExternalStore(subscribeTheme, resolveTheme, serverTheme);
  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="pc-btn pc-btn-ghost"
      style={{ padding: "7px 9px" }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark
        ? <Moon size={16} strokeWidth={2} aria-hidden="true" />
        : <Sun size={16} strokeWidth={2} aria-hidden="true" />}
    </button>
  );
}
