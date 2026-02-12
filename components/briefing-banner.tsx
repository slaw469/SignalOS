interface BriefingBannerProps {
  content: string;
}

export function BriefingBanner({ content }: BriefingBannerProps) {
  return (
    <div
      className="glass mb-8"
      style={{
        padding: "1.5rem 2rem",
        opacity: 0,
        transform: "translateY(12px)",
        animation: "fadeUp 0.7s var(--ease-out) 0.15s forwards",
      }}
    >
      <div className="briefing-label">Daily Briefing</div>
      <p className="briefing-text">{content}</p>
    </div>
  );
}
