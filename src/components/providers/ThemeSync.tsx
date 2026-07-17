"use client";

import { useEffect } from "react";
import { useVybeStore } from "@/store/useVybeStore";
import type { ThemePreference } from "@/types";

function savedTheme(): ThemePreference {
  const saved = window.localStorage.getItem("vybe-theme");
  return saved === "light" || saved === "dark" || saved === "system"
    ? saved
    : "system";
}

function resolveTheme(preference: ThemePreference) {
  if (preference === "dark" || preference === "light") return preference;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "light" ? "#EEF7FF" : "#05070c");
}

export function ThemeSync({ children }: { children: React.ReactNode }) {
  const preference = useVybeStore((state) => state.settings.themePreference);
  const dataMode = useVybeStore((state) => state.dataMode);
  const cloudReady = useVybeStore((state) => state.cloudReady);
  const setSetting = useVybeStore((state) => state.setSetting);

  useEffect(() => {
    const local = savedTheme();
    if (dataMode === "demo" && preference === "system" && local !== "system") {
      setSetting("themePreference", local);
      return;
    }
    const activePreference =
      dataMode === "supabase" && !cloudReady && local !== "system"
        ? local
        : preference;
    applyTheme(activePreference);
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (activePreference === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [cloudReady, dataMode, preference, setSetting]);

  return children;
}
