"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

function getThemeFromDOM(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(getThemeFromDOM);

  useEffect(() => {
    // Sync with what the head script already set
    const current = getThemeFromDOM();
    if (current !== theme) {
      setTheme(current);
    }
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("signalos-theme", next);
    } catch {
      // localStorage may be unavailable in Safari private browsing
    }
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
