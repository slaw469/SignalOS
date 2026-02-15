"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Trash2,
  Shield,
} from "lucide-react";
import type { DailyTaskWithStatus } from "@/lib/types";

function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ProgressRing({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const size = 28;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? completed / total : 0;
  const offset = circumference * (1 - progress);
  const allDone = total > 0 && completed === total;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: "rotate(-90deg)", flexShrink: 0 }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(168, 162, 158, 0.12)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={allDone ? "var(--sage-400)" : "var(--ceramic-warm)"}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s var(--ease-out), stroke 0.3s ease" }}
      />
    </svg>
  );
}

function ShimmerTasks() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "4px 0",
      }}
    >
      {[80, 55, 68].map((w, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 10px",
          }}
        >
          <div
            className="shimmer-line"
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              flexShrink: 0,
            }}
          />
          <div className="shimmer-line" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

export function DailyNonNegotiables() {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<DailyTaskWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const today = getTodayStr();

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/daily-tasks?date=${today}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setTasks(data);
      }
    } catch {
      // keep existing data
    } finally {
      setIsLoading(false);
    }
  }, [today]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleToggle = useCallback(
    async (id: string, completed: boolean) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, completed_today: completed } : t
        )
      );
      try {
        const res = await fetch(`/api/daily-tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed, date: today }),
        });
        if (!res.ok) {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === id ? { ...t, completed_today: !completed } : t
            )
          );
        }
      } catch {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, completed_today: !completed } : t
          )
        );
      }
    },
    [today]
  );

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/daily-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const created = await res.json();
        setTasks((prev) => [...prev, created]);
        setNewTitle("");
        setShowAddForm(false);
      }
    } catch {
      // ignore
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = useCallback(
    async (id: string) => {
      const prev = tasks;
      setTasks((t) => t.filter((task) => task.id !== id));
      try {
        const res = await fetch(`/api/daily-tasks/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) setTasks(prev);
      } catch {
        setTasks(prev);
      }
    },
    [tasks]
  );

  const completedCount = tasks.filter((t) => t.completed_today).length;
  const totalCount = tasks.length;
  const allDone = totalCount > 0 && completedCount === totalCount;

  /* ── Collapsed bar ── */
  if (!expanded) {
    return (
      <div
        className="glass"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setExpanded(true);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "12px 20px",
          marginBottom: "1.5rem",
          cursor: "pointer",
          opacity: 0,
          transform: "translateY(20px)",
          animation: "fadeUp 0.7s var(--ease-out) 0.5s forwards",
        }}
      >
        <Shield
          size={15}
          strokeWidth={1.8}
          style={{ color: allDone ? "var(--sage-400)" : "var(--ink-muted)", flexShrink: 0 }}
        />

        <span
          style={{
            flex: 1,
            fontSize: "0.8rem",
            color: "var(--ink-light)",
            fontFamily: "var(--font-body)",
            letterSpacing: "0.01em",
          }}
        >
          {isLoading
            ? "Loading..."
            : totalCount === 0
              ? "No non-negotiables set"
              : allDone
                ? "All non-negotiables done"
                : `${completedCount}/${totalCount} non-negotiables done`}
        </span>

        {totalCount > 0 && !isLoading && (
          <ProgressRing completed={completedCount} total={totalCount} />
        )}

        <ChevronDown
          size={15}
          style={{ color: "var(--ink-muted)", flexShrink: 0 }}
        />
      </div>
    );
  }

  /* ── Expanded panel ── */
  return (
    <section
      className="glass"
      aria-label="Daily Non-Negotiables"
      style={{
        marginBottom: "1.5rem",
        overflow: "hidden",
        opacity: 0,
        transform: "translateY(20px)",
        animation: "fadeUp 0.7s var(--ease-out) 0.1s forwards",
      }}
    >
      {/* Header */}
      <div className="panel-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Shield
            size={15}
            strokeWidth={1.8}
            style={{ color: "var(--sage-400)" }}
          />
          <span className="panel-title">Non-Negotiables</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {totalCount > 0 && (
            <ProgressRing completed={completedCount} total={totalCount} />
          )}
          <span className="panel-badge">
            {completedCount}/{totalCount}
          </span>
          <button
            onClick={() => setExpanded(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "none",
              border: "none",
              color: "var(--ink-muted)",
              fontSize: "0.72rem",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 8,
              transition: "all 0.2s ease",
              fontFamily: "var(--font-body)",
            }}
          >
            <ChevronUp size={13} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="panel-body">
        {isLoading && <ShimmerTasks />}

        {!isLoading && tasks.length === 0 && (
          <div
            className="empty-state"
            style={{ padding: "16px 0" }}
          >
            <Shield
              size={28}
              className="empty-state-icon"
              strokeWidth={1.5}
            />
            <div className="empty-state-text">
              No non-negotiables yet
            </div>
            <div className="empty-state-sub">
              Add the rituals you commit to every day
            </div>
          </div>
        )}

        {!isLoading && tasks.length > 0 && (
          <ul
            style={{
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {tasks.map((task) => (
              <li
                key={task.id}
                className={`task-item${task.completed_today ? " completed" : ""}`}
              >
                <label className="task-checkbox">
                  <input
                    type="checkbox"
                    checked={task.completed_today}
                    onChange={() =>
                      handleToggle(task.id, !task.completed_today)
                    }
                    aria-label={`Mark "${task.title}" as ${task.completed_today ? "incomplete" : "complete"}`}
                  />
                  <span className="checkmark" />
                </label>
                <span className="task-label" style={{ flex: 1 }}>
                  {task.title}
                </span>
                <button
                  className="task-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(task.id);
                  }}
                  aria-label={`Remove "${task.title}" from non-negotiables`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Add form */}
        {showAddForm ? (
          <div className="add-task-form" style={{ marginTop: 8 }}>
            <div className="add-task-form-row">
              <input
                type="text"
                className="add-task-input"
                placeholder="e.g. LeetCode, Read 30 min, Gym"
                aria-label="New non-negotiable title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") {
                    setShowAddForm(false);
                    setNewTitle("");
                  }
                }}
                autoFocus
              />
            </div>
            <div className="add-task-form-row" style={{ gap: 8 }}>
              <button
                className="add-task-submit"
                onClick={handleAdd}
                disabled={isAdding || !newTitle.trim()}
              >
                <Plus size={14} />
                {isAdding ? "Adding..." : "Add"}
              </button>
              <button
                className="add-task-cancel"
                onClick={() => {
                  setShowAddForm(false);
                  setNewTitle("");
                }}
                aria-label="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <button className="add-task" onClick={() => setShowAddForm(true)}>
            + Add non-negotiable
          </button>
        )}
      </div>
    </section>
  );
}
