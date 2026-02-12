"use client";

import { useState, useEffect, useCallback } from "react";
import { TodoItem } from "@/components/todo-item";
import type { Todo } from "@/lib/types";
import { Plus, X, Leaf } from "lucide-react";

const MOCK_TODOS: Todo[] = [
  { id: "1", title: "Finalize pitch deck for Friday's investor call", completed: false, tags: ["startup"], priority: "high" },
  { id: "2", title: "Submit CS 301 problem set #4", completed: false, tags: ["school"], priority: "high" },
  { id: "3", title: "Deliver responsive navbar for client project", completed: false, tags: ["upwork"], priority: "medium" },
  { id: "4", title: "Renew gym membership", completed: true, tags: ["personal"], priority: "low" },
  { id: "5", title: "Set up analytics tracking on landing page", completed: false, tags: ["startup"], priority: "medium" },
  { id: "6", title: "Read chapters 7-8 for Thursday discussion", completed: false, tags: ["school"], priority: "low" },
  { id: "7", title: "Meal prep for the week", completed: false, tags: ["personal"], priority: "low" },
];

const FILTERS = ["All", "Startup", "School", "Upwork", "Personal"] as const;

function ShimmerTodos() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 0" }}>
      {[90, 70, 82, 55].map((w, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px" }}>
          <div
            className="shimmer-line"
            style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0 }}
          />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="shimmer-line" style={{ width: `${w}%` }} />
            <div style={{ display: "flex", gap: 6 }}>
              <div className="shimmer-line" style={{ width: 48, height: 10 }} />
              <div className="shimmer-line" style={{ width: 36, height: 10 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyTodos() {
  return (
    <div className="empty-state">
      <Leaf size={32} className="empty-state-icon" strokeWidth={1.5} />
      <div className="empty-state-text">All clear &mdash; nothing on your plate</div>
      <div className="empty-state-sub">A still mind is a powerful mind</div>
    </div>
  );
}

export function TodoPanel() {
  const [todos, setTodos] = useState<Todo[]>(MOCK_TODOS);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("All");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<"high" | "medium" | "low">("medium");
  const [newTag, setNewTag] = useState("personal");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState("");

  useEffect(() => {
    async function fetchTodos() {
      try {
        const res = await fetch("/api/todos?include_completed=true");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setTodos(data);
          }
        }
      } catch {
        // keep mock data
      } finally {
        setIsLoading(false);
      }
    }
    fetchTodos();
  }, []);

  const handleToggle = useCallback(async (id: string, completed: boolean) => {
    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed } : t))
    );
    try {
      const res = await fetch(`/api/todos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) {
        setTodos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t))
        );
        return;
      }
      const updated = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch {
      // Revert on error
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed: !completed } : t))
      );
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    const prev = todos;
    setTodos((t) => t.filter((todo) => todo.id !== id));
    try {
      const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setTodos(prev);
      }
    } catch {
      setTodos(prev);
    }
  }, [todos]);

  const handleAddTodo = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, priority: newPriority, tags: [newTag] }),
      });
      if (res.ok) {
        const created = await res.json();
        setTodos((prev) => [created, ...prev]);
        setNewTitle("");
        setNewPriority("medium");
        setNewTag("personal");
        setShowAddForm(false);
      } else {
        setAddError("Failed to add task. Please try again.");
        setTimeout(() => setAddError(""), 3000);
      }
    } catch {
      setAddError("Failed to add task. Please try again.");
      setTimeout(() => setAddError(""), 3000);
    } finally {
      setIsAdding(false);
    }
  };

  const filtered =
    activeFilter === "All"
      ? todos
      : todos.filter((t) =>
          t.tags.some((tag) => tag.toLowerCase() === activeFilter.toLowerCase())
        );

  const openCount = filtered.filter((t) => !t.completed).length;

  return (
    <section
      className="glass flex flex-col"
      aria-label="Tasks"
      style={{
        overflow: "hidden",
        minHeight: 420,
        opacity: 0,
        transform: "translateY(20px)",
        animation: "fadeUp 0.7s var(--ease-out) 0.40s forwards",
      }}
    >
      <div className="panel-header">
        <span className="panel-title">Tasks</span>
        <span className="panel-badge">
          {isLoading ? "loading..." : `${openCount} open`}
        </span>
      </div>
      <div className="panel-body">
        <div className="tag-filters" role="group" aria-label="Filter tasks by category">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`tag-pill${activeFilter === f ? " active" : ""}`}
              onClick={() => setActiveFilter(f)}
              aria-pressed={activeFilter === f}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {isLoading && <ShimmerTodos />}

        {/* Empty State */}
        {!isLoading && filtered.length === 0 && <EmptyTodos />}

        {/* Todo List */}
        {!isLoading && filtered.length > 0 && (
          <ul className="flex flex-col gap-[2px] flex-1" style={{ listStyle: "none" }}>
            {filtered.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}

        {addError && (
          <div style={{ fontSize: "0.78rem", color: "#b45858", padding: "4px 10px", marginTop: 4 }}>{addError}</div>
        )}

        {showAddForm ? (
          <div className="add-task-form">
            <div className="add-task-form-row">
              <input
                type="text"
                className="add-task-input"
                placeholder="What needs to be done?"
                aria-label="New task title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddTodo(); }}
                autoFocus
              />
            </div>
            <div className="add-task-form-row" style={{ gap: 8 }}>
              <select
                className="add-task-select"
                aria-label="Priority"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as "high" | "medium" | "low")}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                className="add-task-select"
                aria-label="Category"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
              >
                <option value="startup">Startup</option>
                <option value="school">School</option>
                <option value="upwork">Upwork</option>
                <option value="personal">Personal</option>
              </select>
              <button
                className="add-task-submit"
                onClick={handleAddTodo}
                disabled={isAdding || !newTitle.trim()}
              >
                <Plus size={14} />
                {isAdding ? "Adding..." : "Add"}
              </button>
              <button
                className="add-task-cancel"
                onClick={() => { setShowAddForm(false); setNewTitle(""); }}
                aria-label="Cancel adding task"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <button className="add-task" onClick={() => setShowAddForm(true)}>+ Add a task</button>
        )}
      </div>
    </section>
  );
}
