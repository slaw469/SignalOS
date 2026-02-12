interface PriorityBadgeProps {
  priority: "high" | "medium" | "low";
}

const displayMap: Record<string, { label: string; className: string }> = {
  high: { label: "HIGH", className: "high" },
  medium: { label: "MED", className: "med" },
  low: { label: "LOW", className: "low" },
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const info = displayMap[priority] ?? displayMap.low;
  return <span className={`priority-badge ${info.className}`}>{info.label}</span>;
}
