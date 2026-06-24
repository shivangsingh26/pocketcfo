"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { resolveTheme, setTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(resolveTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      className="pc-btn pc-btn-ghost"
      style={{ padding: "7px 9px" }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {/* Render a stable icon until mounted to avoid hydration mismatch */}
      {!mounted ? <Sun size={16} strokeWidth={2} aria-hidden="true" />
        : isDark ? <Moon size={16} strokeWidth={2} aria-hidden="true" />
        : <Sun size={16} strokeWidth={2} aria-hidden="true" />}
    </button>
  );
}
