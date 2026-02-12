"use client";

import { useState, useEffect, useCallback } from "react";
import { TodoItem, type Todo } from "@/components/todo-item";

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

export function TodoPanel() {
  const [todos, setTodos] = useState<Todo[]>(MOCK_TODOS);
  const [activeFilter, setActiveFilter] = useState("All");

  useEffect(() => {
    async function fetchTodos() {
      try {
        const res = await fetch("/api/todos");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setTodos(data);
          }
        }
      } catch {
        // keep mock data
      }
    }
    fetchTodos();
  }, []);

  const handleToggle = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }, []);

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
        <span className="panel-badge">{openCount} open</span>
      </div>
      <div className="panel-body">
        <div className="tag-filters">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`tag-pill${activeFilter === f ? " active" : ""}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <ul className="flex flex-col gap-[2px] flex-1" style={{ listStyle: "none" }}>
          {filtered.map((todo) => (
            <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
          ))}
        </ul>

        <div className="add-task">+ Add a task</div>
      </div>
    </section>
  );
}
