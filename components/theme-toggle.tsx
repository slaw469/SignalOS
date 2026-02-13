"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

function resolveTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem("signalos-theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {}
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(t: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", t);
  if (t === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const t = resolveTheme();
    applyTheme(t);
    setTheme(t);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem("signalos-theme", next);
    } catch {}
    setTheme(next);
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label="Toggle dark mode"
    >
      {theme === "dark" ? (
        <Sun strokeWidth={1.8} />
      ) : (
        <Moon strokeWidth={1.8} />
      )}
    </button>
  );
}
