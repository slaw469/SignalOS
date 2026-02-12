import { TagBadge } from "@/components/tag-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { Trash2 } from "lucide-react";
import type { Todo } from "@/lib/types";

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
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
        <div className="flex items-center gap-2 mt-[3px]">
          {todo.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
          <PriorityBadge priority={todo.priority} />
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
