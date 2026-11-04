"use client";

import { SunIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

type Theme = "dark" | "light";

// The chat shell is light by default; the top bar's toggle switches it and the choice is kept in
// the browser under the mock's key. The root layout's inline script applies it before paint.
export const THEME_STORAGE_KEY = "ab-theme";

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    applyTheme(storedTheme());
  }, []);

  return children;
}

export function ThemeToggle({ className }: { readonly className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  return (
    <button
      aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}
      className={className}
      data-theme-toggle
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        applyTheme(next);
        setTheme(next);
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          // A browser without storage keeps the choice for this page only.
        }
      }}
      type="button"
    >
      <SunIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
      <span className="max-sheet:sr-only">
        <span className="dark:hidden">Dark</span>
        <span className="hidden dark:inline">Light</span>
      </span>
    </button>
  );
}

/**
 * The theme on the page as it changes: the class the layout's script and the toggle set on the
 * root element. The server renders light, the default, and the client reads the class on hydration.
 */
export function useDocumentTheme(): Theme {
  return useSyncExternalStore(subscribeToTheme, documentTheme, () => "light");
}

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function documentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function storedTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Storage blocked: the default.
  }
  return "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}
