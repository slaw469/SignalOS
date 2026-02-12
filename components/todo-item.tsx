"use client";

import { TagBadge } from "@/components/tag-badge";
import { PriorityBadge } from "@/components/priority-badge";

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  tags: string[];
  priority: "high" | "medium" | "low";
}

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
}

export function TodoItem({ todo, onToggle }: TodoItemProps) {
  return (
    <li className={`task-item${todo.completed ? " completed" : ""}`}>
      <label className="task-checkbox">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id)}
        />
        <span className="checkmark" />
      </label>
      <div className="flex-1 min-w-0">
        <div className="task-label">{todo.title}</div>
        <div className="flex items-center gap-2 mt-[3px]">
          {todo.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
          <PriorityBadge priority={todo.priority} />
        </div>
      </div>
    </li>
  );
}
