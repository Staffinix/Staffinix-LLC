import { useCallback, useEffect, useState } from "react";

export type ThemeSetting = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "staffinix-theme";

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function apply(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

/**
 * App theme controller. Defaults to dark (the product's native look) and
 * supports an explicit light choice or following the OS preference.
 */
export function useTheme() {
  const [setting, setSetting] = useState<ThemeSetting>("dark");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeSetting | null;
    const initial: ThemeSetting = stored ?? "dark";
    setSetting(initial);
    const next = initial === "system" ? systemTheme() : initial;
    setResolved(next);
    apply(next);
  }, []);

  useEffect(() => {
    if (setting !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const next = systemTheme();
      setResolved(next);
      apply(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setting]);

  const setTheme = useCallback((next: ThemeSetting) => {
    setSetting(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    const r = next === "system" ? systemTheme() : next;
    setResolved(r);
    apply(r);
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  return { theme: setting, resolvedTheme: resolved, setTheme, toggle };
}
