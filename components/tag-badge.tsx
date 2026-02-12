interface TagBadgeProps {
  tag: string;
}

export function TagBadge({ tag }: TagBadgeProps) {
  return <span className={`task-tag ${tag.toLowerCase()}`}>{tag}</span>;
}
