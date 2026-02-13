"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Calendar, ChevronDown, ChevronUp, Maximize2 } from "lucide-react";
import { CalendarOverlay } from "@/components/calendar-overlay";

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

/** Find the index of the event closest to the current time (current or next upcoming). */
function findNowIndex(events: AgendaEvent[], nowHour: number): number {
  // First: find an event happening now (hour <= nowHour and closest)
  let bestIdx = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < events.length; i++) {
    const diff = nowHour - events[i].hour;
    if (diff >= 0 && diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  if (bestIdx !== -1 && bestDiff <= 1) return bestIdx;
  // Fallback: find the next upcoming event
  for (let i = 0; i < events.length; i++) {
    if (events[i].hour >= nowHour) return i;
  }
  // Fallback: last event
  return Math.max(0, events.length - 1);
}

export function AgendaPanel() {
  const [progress, setProgress] = useState(getDayProgress);
  const [nowHour, setNowHour] = useState(getNowHour);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const nowEventRef = useRef<HTMLLIElement>(null);

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

  // Auto-scroll to current event when expanded
  const scrollToNow = useCallback(() => {
    requestAnimationFrame(() => {
      if (nowEventRef.current && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const el = nowEventRef.current;
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const scrollTop = container.scrollTop + (elRect.top - containerRect.top) - containerRect.height / 2 + elRect.height / 2;
        container.scrollTo({ top: scrollTop, behavior: "smooth" });
      }
    });
  }, []);

  useEffect(() => {
    if (expanded && events.length > 0) {
      scrollToNow();
    }
  }, [expanded, events, scrollToNow]);

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

  // Compact view: show events near the current time (1 before, current, 1 after)
  const nowIdx = hasEvents ? findNowIndex(events, nowHour) : 0;
  const compactStart = Math.max(0, nowIdx - 1);
  const compactEnd = Math.min(events.length, nowIdx + 2);
  const compactEvents = events.slice(compactStart, compactEnd);
  const hiddenCount = events.length - compactEvents.length;

  function renderEventItem(ev: AgendaEvent, isNowEvent: boolean, ref?: React.Ref<HTMLLIElement>) {
    return (
      <li
        key={ev.id}
        ref={ref}
        className={`agenda-item${isNowEvent ? " is-now" : ""}`}
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
        {isNowEvent && (
          <div className="now-indicator">
            <span className="now-dot" />
            Now
          </div>
        )}
      </li>
    );
  }

  return (
    <section
      className="glass flex flex-col"
      aria-label="Agenda"
      style={{
        overflow: "hidden",
        minHeight: expanded ? 420 : undefined,
        opacity: 0,
        transform: "translateY(20px)",
        animation: "fadeUp 0.7s var(--ease-out) 0.25s forwards",
      }}
    >
      <div className="panel-header">
        <span className="panel-title">Agenda</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="panel-badge">
            {isLoading ? "loading..." : `${events.length} events`}
          </span>
          {calendarConnected !== false && (
            <button
              onClick={() => setCalendarOpen(true)}
              style={{
                background: "none",
                border: "none",
                color: "var(--ink-muted)",
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                transition: "color 0.2s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ink)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ink-muted)"; }}
              aria-label="Expand calendar"
              title="Open full calendar"
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
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

        {/* Compact View (collapsed) */}
        {!isLoading && hasEvents && !expanded && (
          <div>
            <ul className="flex flex-col gap-[2px]" style={{ listStyle: "none" }}>
              {compactEvents.map((ev) => {
                const isNow = ev.hour === closestHour;
                return renderEventItem(ev, isNow);
              })}
            </ul>
            <button
              onClick={() => setExpanded(true)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                padding: "10px 0",
                marginTop: 4,
                background: "none",
                border: "1px solid color-mix(in srgb, var(--ink-muted) 25%, transparent)",
                borderRadius: 8,
                color: "var(--ink-muted)",
                fontSize: "0.76rem",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--ink-light)";
                e.currentTarget.style.borderColor = "color-mix(in srgb, var(--ink-muted) 50%, transparent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--ink-muted)";
                e.currentTarget.style.borderColor = "color-mix(in srgb, var(--ink-muted) 25%, transparent)";
              }}
            >
              <ChevronDown size={14} />
              {hiddenCount > 0 ? `Show all ${events.length} events` : "Expand schedule"}
            </button>
          </div>
        )}

        {/* Expanded View (scrollable, auto-centered on now) */}
        {!isLoading && hasEvents && expanded && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <div
              ref={scrollContainerRef}
              style={{
                flex: 1,
                overflowY: "auto",
                maxHeight: 380,
                scrollbarWidth: "thin",
                scrollbarColor: "color-mix(in srgb, var(--ink-muted) 30%, transparent) transparent",
              }}
            >
              {sections.map((section) => {
                const sectionEvents = events.filter((e) => e.section === section);
                if (sectionEvents.length === 0) return null;
                return (
                  <div key={section}>
                    <div className="agenda-section-label">{section}</div>
                    <ul className="flex flex-col gap-[2px] flex-1" style={{ listStyle: "none" }}>
                      {sectionEvents.map((ev) => {
                        const isNow = ev.hour === closestHour;
                        const isNowRef = ev.id === events[nowIdx]?.id;
                        return renderEventItem(ev, isNow, isNowRef ? nowEventRef : undefined);
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setExpanded(false)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                padding: "10px 0",
                marginTop: 4,
                flexShrink: 0,
                background: "none",
                border: "1px solid color-mix(in srgb, var(--ink-muted) 25%, transparent)",
                borderRadius: 8,
                color: "var(--ink-muted)",
                fontSize: "0.76rem",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--ink-light)";
                e.currentTarget.style.borderColor = "color-mix(in srgb, var(--ink-muted) 50%, transparent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--ink-muted)";
                e.currentTarget.style.borderColor = "color-mix(in srgb, var(--ink-muted) 25%, transparent)";
              }}
            >
              <ChevronUp size={14} />
              Collapse
            </button>
          </div>
        )}

        <p className="breath-text">The day holds space for you</p>
      </div>

      <CalendarOverlay open={calendarOpen} onClose={() => setCalendarOpen(false)} />
    </section>
  );
}
