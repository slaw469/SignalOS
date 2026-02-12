"use client";

import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 17) return "evening";
  if (h >= 12) return "afternoon";
  return "morning";
}

function formatClock() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function Header() {
  const [clock, setClock] = useState("");
  const [date, setDate] = useState("");
  const [greeting, setGreeting] = useState("morning");

  useEffect(() => {
    setClock(formatClock());
    setDate(formatDate());
    setGreeting(getGreeting());

    const interval = setInterval(() => {
      setClock(formatClock());
      setGreeting(getGreeting());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header
      className="briefing-header flex items-center justify-between mb-8"
      style={{
        padding: "0 0.5rem",
        opacity: 0,
        transform: "translateY(12px)",
        animation: "fadeUp 0.8s var(--ease-out) 0.1s forwards",
      }}
    >
      <div className="flex flex-col gap-[6px]">
        <h1 className="greeting">
          Good {greeting}, <strong>Steven</strong>
        </h1>
        <span className="date-display">{date}</span>
      </div>
      <div className="briefing-right flex items-center gap-4 mt-2">
        <span className="live-clock">{clock}</span>
        <div className="status-pill glass">
          <span className="status-dot" />
          All systems calm
        </div>
        <ThemeToggle />
        <div className="avatar" aria-label="User avatar" role="img">S</div>
      </div>
    </header>
  );
}
