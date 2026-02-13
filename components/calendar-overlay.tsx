"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarEvent {
  id: string;
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  location?: string | null;
}

interface CalendarOverlayProps {
  open: boolean;
  onClose: () => void;
}

type ViewMode = "week" | "month";

const DOT_COLORS = [
  "var(--sage-400)",
  "var(--ceramic-clay)",
  "var(--ceramic-rose)",
  "var(--stone-400)",
  "var(--ceramic-warm)",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7am - 10pm

function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start, end };
}

function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatHour(h: number): string {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function formatWeekHeader(date: Date): string {
  const { start, end } = getWeekRange(date);
  const endAdj = new Date(end.getTime() - 86400000);
  const sMonth = start.toLocaleDateString("en-US", { month: "short" });
  const eMonth = endAdj.toLocaleDateString("en-US", { month: "short" });
  if (sMonth === eMonth) {
    return `${sMonth} ${start.getDate()} – ${endAdj.getDate()}, ${start.getFullYear()}`;
  }
  return `${sMonth} ${start.getDate()} – ${eMonth} ${endAdj.getDate()}, ${start.getFullYear()}`;
}

function formatMonthHeader(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getEventTime(ev: CalendarEvent): Date {
  const s = ev.start?.dateTime ?? ev.start?.date ?? "";
  return new Date(s);
}

function getEventEndTime(ev: CalendarEvent): Date {
  const e = ev.end?.dateTime ?? ev.end?.date ?? "";
  return new Date(e);
}

function getEventMinutes(ev: CalendarEvent): { startMin: number; durationMin: number } {
  const s = getEventTime(ev);
  const e = getEventEndTime(ev);
  const startMin = s.getHours() * 60 + s.getMinutes();
  const durationMin = Math.max(30, (e.getTime() - s.getTime()) / 60000);
  return { startMin, durationMin };
}

// ─── Week View ───────────────────────────────────────────────────────────────

function WeekView({ events, anchorDate }: { events: CalendarEvent[]; anchorDate: Date }) {
  const { start } = getWeekRange(anchorDate);
  const today = new Date();
  const nowRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Group events by day
  const eventsByDay: CalendarEvent[][] = days.map((day) =>
    events.filter((ev) => {
      const evDate = getEventTime(ev);
      return isSameDay(evDate, day);
    })
  );

  // Scroll to current time on mount
  useEffect(() => {
    if (nowRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = nowRef.current;
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const targetScroll = container.scrollTop + (elRect.top - containerRect.top) - containerRect.height / 3;
      container.scrollTo({ top: Math.max(0, targetScroll), behavior: "smooth" });
    }
  }, [events]);

  const nowHour = today.getHours();
  const nowMinute = today.getMinutes();
  const nowTop = ((nowHour - 7) * 60 + nowMinute) / (16 * 60) * 100;

  return (
    <div className="cal-week-container">
      {/* Day headers */}
      <div className="cal-week-header">
        <div className="cal-week-gutter" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <div key={i} className={`cal-week-day-header${isToday ? " is-today" : ""}`}>
              <span className="cal-week-day-label">{DAY_LABELS[day.getDay()]}</span>
              <span className={`cal-week-day-num${isToday ? " is-today" : ""}`}>{day.getDate()}</span>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="cal-week-scroll" ref={scrollRef}>
        <div className="cal-week-grid">
          {/* Hour labels + lines */}
          {HOURS.map((h) => (
            <div key={h} className="cal-week-hour-row" style={{ top: `${((h - 7) / 16) * 100}%` }}>
              <div className="cal-week-hour-label">{formatHour(h)}</div>
            </div>
          ))}

          {/* Now indicator */}
          {nowHour >= 7 && nowHour <= 22 && (
            <div
              ref={nowRef}
              className="cal-week-now-line"
              style={{ top: `${nowTop}%` }}
            >
              <span className="cal-week-now-dot" />
            </div>
          )}

          {/* Event columns */}
          <div className="cal-week-columns">
            <div className="cal-week-gutter" />
            {days.map((day, dayIdx) => {
              const isToday = isSameDay(day, today);
              return (
                <div key={dayIdx} className={`cal-week-col${isToday ? " is-today" : ""}`}>
                  {eventsByDay[dayIdx].map((ev, evIdx) => {
                    const { startMin, durationMin } = getEventMinutes(ev);
                    const topPct = ((startMin - 420) / (16 * 60)) * 100; // 420 = 7*60
                    const heightPct = (durationMin / (16 * 60)) * 100;
                    if (topPct < 0 || topPct > 100) return null;
                    const color = DOT_COLORS[evIdx % DOT_COLORS.length];
                    const startDate = getEventTime(ev);
                    const timeStr = startDate.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    });
                    return (
                      <div
                        key={ev.id ?? evIdx}
                        className="cal-week-event"
                        style={{
                          top: `${topPct}%`,
                          height: `${Math.max(heightPct, 2.5)}%`,
                          borderLeftColor: color,
                          background: `color-mix(in srgb, ${color} 12%, transparent)`,
                        }}
                        title={`${ev.summary ?? "Untitled"}\n${timeStr}${ev.location ? `\n${ev.location}` : ""}`}
                      >
                        <span className="cal-week-event-time">{timeStr}</span>
                        <span className="cal-week-event-title">{ev.summary ?? "Untitled"}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Month View ──────────────────────────────────────────────────────────────

function MonthView({
  events,
  anchorDate,
  onDayClick,
  selectedDay,
}: {
  events: CalendarEvent[];
  anchorDate: Date;
  onDayClick: (d: Date) => void;
  selectedDay: Date | null;
}) {
  const today = new Date();
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startPad = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = startPad + daysInMonth;
  const rows = Math.ceil(totalCells / 7);

  const cells: (Date | null)[] = [];
  for (let i = 0; i < rows * 7; i++) {
    const dayNum = i - startPad + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(null);
    } else {
      cells.push(new Date(year, month, dayNum));
    }
  }

  // Group events by day number
  const eventsByDate = new Map<number, CalendarEvent[]>();
  for (const ev of events) {
    const d = getEventTime(ev);
    if (d.getMonth() === month && d.getFullYear() === year) {
      const key = d.getDate();
      if (!eventsByDate.has(key)) eventsByDate.set(key, []);
      eventsByDate.get(key)!.push(ev);
    }
  }

  // Events for selected day
  const selectedDayEvents = selectedDay
    ? events.filter((ev) => isSameDay(getEventTime(ev), selectedDay))
    : [];

  return (
    <div className="cal-month-container">
      <div className="cal-month-grid-wrap">
        {/* Day name headers */}
        <div className="cal-month-header-row">
          {DAY_LABELS.map((d) => (
            <div key={d} className="cal-month-day-name">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="cal-month-grid" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {cells.map((date, i) => {
            if (!date) return <div key={i} className="cal-month-cell empty" />;
            const isToday = isSameDay(date, today);
            const isSelected = selectedDay ? isSameDay(date, selectedDay) : false;
            const dayEvents = eventsByDate.get(date.getDate()) ?? [];
            return (
              <button
                key={i}
                className={`cal-month-cell${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}${dayEvents.length > 0 ? " has-events" : ""}`}
                onClick={() => onDayClick(date)}
              >
                <span className="cal-month-cell-num">{date.getDate()}</span>
                {dayEvents.length > 0 && (
                  <div className="cal-month-dots">
                    {dayEvents.slice(0, 3).map((ev, j) => (
                      <span
                        key={ev.id ?? j}
                        className="cal-month-dot"
                        style={{ background: DOT_COLORS[j % DOT_COLORS.length] }}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="cal-month-more">+{dayEvents.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day detail sidebar */}
      {selectedDay && (
        <div className="cal-month-detail">
          <div className="cal-month-detail-header">
            {selectedDay.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </div>
          {selectedDayEvents.length === 0 ? (
            <div className="cal-month-detail-empty">No events</div>
          ) : (
            <ul className="cal-month-detail-list">
              {selectedDayEvents.map((ev, i) => {
                const time = getEventTime(ev);
                const timeStr = time.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                });
                return (
                  <li key={ev.id ?? i} className="cal-month-detail-item">
                    <span className="cal-month-detail-dot" style={{ background: DOT_COLORS[i % DOT_COLORS.length] }} />
                    <div>
                      <div className="cal-month-detail-title">{ev.summary ?? "Untitled"}</div>
                      <div className="cal-month-detail-time">{timeStr}{ev.location ? ` · ${ev.location}` : ""}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Overlay ────────────────────────────────────────────────────────────

export function CalendarOverlay({ open, onClose }: CalendarOverlayProps) {
  const [view, setView] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [visible, setVisible] = useState(false);

  // Animate in
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Fetch events for current range
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const range = view === "week" ? getWeekRange(anchorDate) : getMonthRange(anchorDate);
      const res = await fetch(`/api/calendar?start=${range.start.toISOString()}&end=${range.end.toISOString()}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [view, anchorDate]);

  useEffect(() => {
    if (open) fetchEvents();
  }, [open, fetchEvents]);

  function navigate(dir: -1 | 1) {
    setAnchorDate((prev) => {
      const d = new Date(prev);
      if (view === "week") {
        d.setDate(d.getDate() + dir * 7);
      } else {
        d.setMonth(d.getMonth() + dir);
      }
      return d;
    });
    setSelectedDay(null);
  }

  function goToday() {
    setAnchorDate(new Date());
    setSelectedDay(null);
  }

  if (!open) return null;

  return createPortal(
    <div className={`cal-overlay-backdrop${visible ? " visible" : ""}`} onClick={onClose}>
      <div
        className={`cal-overlay${visible ? " visible" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Calendar"
      >
        {/* Header */}
        <div className="cal-overlay-header">
          <div className="cal-overlay-nav">
            <button className="cal-nav-btn" onClick={() => navigate(-1)} aria-label="Previous">
              <ChevronLeft size={18} />
            </button>
            <h2 className="cal-overlay-title">
              {view === "week" ? formatWeekHeader(anchorDate) : formatMonthHeader(anchorDate)}
            </h2>
            <button className="cal-nav-btn" onClick={() => navigate(1)} aria-label="Next">
              <ChevronRight size={18} />
            </button>
            <button className="cal-today-btn" onClick={goToday}>Today</button>
          </div>

          <div className="cal-overlay-actions">
            {/* View toggle */}
            <div className="cal-view-toggle">
              <button
                className={`cal-view-btn${view === "week" ? " active" : ""}`}
                onClick={() => { setView("week"); setSelectedDay(null); }}
              >
                Week
              </button>
              <button
                className={`cal-view-btn${view === "month" ? " active" : ""}`}
                onClick={() => { setView("month"); setSelectedDay(null); }}
              >
                Month
              </button>
            </div>
            <button className="cal-close-btn" onClick={onClose} aria-label="Close calendar">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="cal-overlay-body">
          {loading && (
            <div className="cal-loading">
              <div className="cal-loading-bar" />
            </div>
          )}
          {view === "week" && <WeekView events={events} anchorDate={anchorDate} />}
          {view === "month" && (
            <MonthView
              events={events}
              anchorDate={anchorDate}
              onDayClick={setSelectedDay}
              selectedDay={selectedDay}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
