interface BriefingBannerProps {
  content: string | null;
}

export function BriefingBanner({ content }: BriefingBannerProps) {
  return (
    <section
      className="glass mb-8"
      aria-label="Daily Briefing"
      style={{
        padding: "1.5rem 2rem",
        opacity: 0,
        transform: "translateY(12px)",
        animation: "fadeUp 0.7s var(--ease-out) 0.15s forwards",
      }}
    >
      <div className="briefing-label">Daily Briefing</div>
      {content ? (
        <p className="briefing-text">{content}</p>
      ) : (
        <p className="briefing-text" style={{ opacity: 0.5 }}>
          Preparing your daily briefing...
        </p>
      )}
    </section>
  );
}
