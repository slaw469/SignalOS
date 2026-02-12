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

const MOCK_EVENTS: AgendaEvent[] = [
  { hour: 7, time: "7:00", title: "Morning journaling", meta: "Personal ritual", dot: "dot-stone", section: "Morning" },
  { hour: 10, time: "10:00", title: "CS 301 \u2014 Algorithms Lecture", meta: "Room 214, Whitman Hall", dot: "dot-sage", section: "Morning" },
  { hour: 14, time: "2:00", title: "Startup standup", meta: "Zoom \u2014 Weekly sync w/ co-founders", dot: "dot-clay", section: "Afternoon" },
  { hour: 16, time: "4:30", title: "Upwork client call", meta: "Review landing page mockups", dot: "dot-rose", section: "Afternoon" },
  { hour: 18, time: "6:00", title: "DoorDash shift", meta: "Downtown zone \u2014 3 hr block", dot: "dot-stone", section: "Evening" },
];

const DOT_COLORS = ["dot-sage", "dot-clay", "dot-rose", "dot-stone"];

function getSection(hour: number): "Morning" | "Afternoon" | "Evening" {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes();
  const hour12 = h % 12 || 12;
  return m === 0 ? `${hour12}:00` : `${hour12}:${String(m).padStart(2, "0")}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCalendarEvents(events: any[]): AgendaEvent[] {
  return events.map((ev, i) => {
    const start = ev.start?.dateTime ?? ev.start?.date ?? "";
    const d = new Date(start);
    const hour = d.getHours();
    return {
      hour,
      time: formatTime(start),
      title: ev.summary ?? "Untitled",
      meta: ev.location ?? ev.description ?? "",
      dot: DOT_COLORS[i % DOT_COLORS.length],
      section: getSection(hour),
    };
  });
}

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
  const [events, setEvents] = useState<AgendaEvent[]>(MOCK_EVENTS);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(getDayProgress());
      setNowHour(getNowHour());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Check Google Calendar auth status and fetch events
  useEffect(() => {
    async function init() {
      try {
        const statusRes = await fetch("/api/calendar/auth?action=status");
        if (statusRes.ok) {
          const { connected } = await statusRes.json();
          setCalendarConnected(connected);

          if (connected) {
            const eventsRes = await fetch("/api/calendar");
            if (eventsRes.ok) {
              const data = await eventsRes.json();
              if (data.events && Array.isArray(data.events) && data.events.length > 0) {
                setEvents(mapCalendarEvents(data.events));
              }
            }
          }
        }
      } catch {
        setCalendarConnected(false);
      }
    }
    init();
  }, []);

  const handleConnectGoogle = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch("/api/calendar/auth?action=url");
      if (res.ok) {
        const { url } = await res.json();
        if (url) {
          window.location.href = url;
          return;
        }
      }
    } catch {
      // silently fail
    }
    setIsConnecting(false);
  };

  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (circumference * progress.pct) / 100;

  // Find the closest current event
  let closestHour: number | null = null;
  let closestDiff = Infinity;
  for (const ev of events) {
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
      aria-label="Agenda"
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
        <span className="panel-badge">{events.length} events</span>
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

        {/* Google Calendar Connect */}
        {calendarConnected === false && (
          <button
            className="connect-google-btn"
            onClick={handleConnectGoogle}
            disabled={isConnecting}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {isConnecting ? "Connecting..." : "Connect Google Calendar"}
          </button>
        )}

        {/* Event Sections */}
        {sections.map((section) => {
          const sectionEvents = events.filter((e) => e.section === section);
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
