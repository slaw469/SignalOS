"use client";

import { RefreshCw } from "lucide-react";

interface BriefingBannerProps {
  content: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function BriefingBanner({ content, onRefresh, isRefreshing }: BriefingBannerProps) {
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.65rem" }}>
        <div className="briefing-label" style={{ marginBottom: 0 }}>Daily Briefing</div>
        {onRefresh && (
          <button
            className={`briefing-refresh${isRefreshing ? " is-refreshing" : ""}`}
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Regenerate briefing"
            title="Regenerate briefing"
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>
      {content === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="shimmer-line shimmer-thick shimmer-long" />
          <div className="shimmer-line shimmer-thick shimmer-medium" />
          <div className="shimmer-line shimmer-thick shimmer-short" />
        </div>
      ) : (
        <p className="briefing-text">{content}</p>
      )}
    </section>
  );
}
