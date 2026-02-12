"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "dark") setTheme("dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("signalos-theme", next);
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
