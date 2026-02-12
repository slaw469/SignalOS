"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";

interface AgendaEvent {
  id: string;
  hour: number;
  time: string;
  title: string;
  meta: string;
  dot: string;
  section: "Morning" | "Afternoon" | "Evening";
}

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

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCalendarEvents(events: any[]): AgendaEvent[] {
  return events.map((ev, i) => {
    const start = ev.start?.dateTime ?? ev.start?.date ?? "";
    const d = new Date(start);
    const hour = d.getHours();
    const rawMeta = ev.location ?? ev.description ?? "";
    return {
      id: ev.id ?? `${i}-${start}`,
      hour,
      time: formatTime(start),
      title: ev.summary ?? "Untitled",
      meta: stripHtml(rawMeta).slice(0, 80),
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

function ShimmerEvents() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0" }}>
      {[95, 75, 85, 60].map((w, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 12px" }}>
          <div
            className="shimmer-line"
            style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0 }}
          />
          <div
            className="shimmer-line"
            style={{ width: 42, height: 12, flexShrink: 0 }}
          />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="shimmer-line" style={{ width: `${w}%` }} />
            <div className="shimmer-line" style={{ width: `${w - 25}%`, height: 10 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyAgenda() {
  return (
    <div className="empty-state">
      <Calendar size={32} className="empty-state-icon" strokeWidth={1.5} />
      <div className="empty-state-text">No events scheduled today</div>
      <div className="empty-state-sub">An open day is a gift &mdash; use it wisely</div>
    </div>
  );
}

export function AgendaPanel() {
  const [progress, setProgress] = useState(getDayProgress);
  const [nowHour, setNowHour] = useState(getNowHour);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
              if (data.events && Array.isArray(data.events)) {
                setEvents(data.events.length > 0 ? mapCalendarEvents(data.events) : []);
              }
            }
          }
        }
      } catch {
        setCalendarConnected(false);
      } finally {
        setIsLoading(false);
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
  const hasEvents = events.length > 0;

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
        <span className="panel-badge">
          {isLoading ? "loading..." : `${events.length} events`}
        </span>
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

        {/* Loading State */}
        {isLoading && <ShimmerEvents />}

        {/* Empty State */}
        {!isLoading && !hasEvents && <EmptyAgenda />}

        {/* Event Sections */}
        {!isLoading && hasEvents && (
          <>
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
                          key={ev.id}
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
          </>
        )}

        <p className="breath-text">The day holds space for you</p>
      </div>
    </section>
  );
}
