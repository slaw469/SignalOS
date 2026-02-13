import { TagBadge } from "@/components/tag-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { Trash2 } from "lucide-react";
import type { Todo } from "@/lib/types";

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}

function formatDueDate(dateStr: string): string {
  const due = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";

  return due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDueDateClass(dateStr: string): string {
  const due = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) return "due-date overdue";
  if (diff <= 1) return "due-date urgent";
  if (diff <= 3) return "due-date soon";
  return "due-date";
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  return (
    <li className={`task-item${todo.completed ? " completed" : ""}`}>
      <label className="task-checkbox">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id, !todo.completed)}
          aria-label={`Mark "${todo.title}" as ${todo.completed ? "incomplete" : "complete"}`}
        />
        <span className="checkmark" />
      </label>
      <div className="flex-1 min-w-0">
        <div className="task-label">{todo.title}</div>
        <div className="flex items-center gap-2 mt-[3px] flex-wrap">
          {todo.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
          <PriorityBadge priority={todo.priority} />
          {todo.due_date && !todo.completed && (
            <span className={getDueDateClass(todo.due_date)}>
              {formatDueDate(todo.due_date)}
            </span>
          )}
        </div>
      </div>
      <button
        className="task-delete-btn"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(todo.id);
        }}
        aria-label={`Delete task: ${todo.title}`}
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}
