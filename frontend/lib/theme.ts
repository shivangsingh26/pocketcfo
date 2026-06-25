export type Theme = "light" | "dark";
export const STORAGE_KEY = "pc-theme";

export function getStored(): Theme | null {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : null;
}

export function resolveTheme(): Theme {
  const stored = getStored();
  if (stored) return stored;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function applyTheme(t: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", t === "dark");
  document.documentElement.style.colorScheme = t;
}

// ── Subscribable store so React can read the theme via useSyncExternalStore
//    (avoids setState-in-effect). Theme changes only via setTheme + cross-tab
//    storage events. ──
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeTheme(cb: Listener): () => void {
  listeners.add(cb);
  if (typeof window !== "undefined") window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", cb);
  };
}

export function setTheme(t: Theme): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, t);
  applyTheme(t);
  listeners.forEach((l) => l());
}
