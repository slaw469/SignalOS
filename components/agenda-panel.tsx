"use client";

import { useEffect, useState } from "react";

interface AgendaEvent {
  hour: number;
  time: string;
  title: string;
  meta: string;
  dot: string;
  section: "Morning" | "Afternoon" | "Evening";
}

const EVENTS: AgendaEvent[] = [
  { hour: 7, time: "7:00", title: "Morning journaling", meta: "Personal ritual", dot: "dot-stone", section: "Morning" },
  { hour: 10, time: "10:00", title: "CS 301 \u2014 Algorithms Lecture", meta: "Room 214, Whitman Hall", dot: "dot-sage", section: "Morning" },
  { hour: 14, time: "2:00", title: "Startup standup", meta: "Zoom \u2014 Weekly sync w/ co-founders", dot: "dot-clay", section: "Afternoon" },
  { hour: 16, time: "4:30", title: "Upwork client call", meta: "Review landing page mockups", dot: "dot-rose", section: "Afternoon" },
  { hour: 18, time: "6:00", title: "DoorDash shift", meta: "Downtown zone \u2014 3 hr block", dot: "dot-stone", section: "Evening" },
];

function getDayProgress() {
  const now = new Date();
  const dayStart = 7;
  const dayEnd = 22;
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const total = dayEnd - dayStart;
  const elapsed = Math.max(0, Math.min(total, currentHour - dayStart));
  const pct = Math.round((elapsed / total) * 100);
  const remaining = Math.max(0, dayEnd - currentHour);
  const rH = Math.floor(remaining);
  const rM = Math.round((remaining - rH) * 60);
  return { pct, remaining, text: remaining > 0 ? `${rH}h ${rM}m remaining` : "Day complete" };
}

function getNowHour() {
  return new Date().getHours();
}

export function AgendaPanel() {
  const [progress, setProgress] = useState(getDayProgress);
  const [nowHour, setNowHour] = useState(getNowHour);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(getDayProgress());
      setNowHour(getNowHour());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (circumference * progress.pct) / 100;

  // Find the closest current event
  let closestHour: number | null = null;
  let closestDiff = Infinity;
  for (const ev of EVENTS) {
    const diff = Math.abs(nowHour - ev.hour);
    if (diff < closestDiff && nowHour >= ev.hour) {
      closestDiff = diff;
      closestHour = ev.hour;
    }
  }
  if (closestDiff > 1) closestHour = null;

  const sections: ("Morning" | "Afternoon" | "Evening")[] = ["Morning", "Afternoon", "Evening"];

  return (
    <section
      className="glass flex flex-col"
      style={{
        overflow: "hidden",
        minHeight: 420,
        opacity: 0,
        transform: "translateY(20px)",
        animation: "fadeUp 0.7s var(--ease-out) 0.25s forwards",
      }}
    >
      <div className="panel-header">
        <span className="panel-title">Agenda</span>
        <span className="panel-badge">{EVENTS.length} events</span>
      </div>
      <div className="panel-body">
        {/* Day Progress Ring */}
        <div className="day-progress-wrapper">
          <div className="day-ring-container">
            <svg viewBox="0 0 44 44">
              <circle className="day-ring-bg" cx="22" cy="22" r="18" />
              <circle
                className="day-ring-fill"
                cx="22"
                cy="22"
                r="18"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />
            </svg>
            <span className="day-ring-label">{progress.pct}%</span>
          </div>
          <div className="flex-1">
            <div style={{ fontSize: "0.72rem", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
              Day Progress
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--ink-light)", fontWeight: 400 }}>
              {progress.text}
            </div>
          </div>
        </div>

        {/* Event Sections */}
        {sections.map((section) => {
          const sectionEvents = EVENTS.filter((e) => e.section === section);
          if (sectionEvents.length === 0) return null;
          return (
            <div key={section}>
              <div className="agenda-section-label">{section}</div>
              <ul className="flex flex-col gap-[2px] flex-1" style={{ listStyle: "none" }}>
                {sectionEvents.map((ev) => {
                  const isNow = ev.hour === closestHour;
                  return (
                    <li
                      key={ev.hour + ev.title}
                      className={`agenda-item${isNow ? " is-now" : ""}`}
                    >
                      <span className={`agenda-dot ${ev.dot}`} />
                      <span className="agenda-time">{ev.time}</span>
                      <div className="flex-1">
                        <div style={{ fontSize: "0.86rem", color: "var(--ink)", marginBottom: 2, fontWeight: 400 }}>
                          {ev.title}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--ink-muted)" }}>
                          {ev.meta}
                        </div>
                      </div>
                      {isNow && (
                        <div className="now-indicator">
                          <span className="now-dot" />
                          Now
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        <p className="breath-text">The day holds space for you</p>
      </div>
    </section>
  );
}
