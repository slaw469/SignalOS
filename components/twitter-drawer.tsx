"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, Send, Trash2, Edit3, Link, Plus, Clock, Sparkles, Calendar } from "lucide-react";
import type { Tweet } from "@/lib/types";

type Tab = "queue" | "compose" | "posted";

function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

interface TwitterDrawerProps {
  onRefresh?: () => void;
}

export function TwitterDrawer({ onRefresh }: TwitterDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("queue");
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rateCount, setRateCount] = useState(0);

  // Compose state
  const [composeContent, setComposeContent] = useState("");
  const [threadMode, setThreadMode] = useState(false);
  const [threadTweets, setThreadTweets] = useState<string[]>([""]);
  const [scheduleDate, setScheduleDate] = useState("");
  const [recurringRule, setRecurringRule] = useState("none");
  const [recurringDay, setRecurringDay] = useState("mon");
  const [isSaving, setIsSaving] = useState(false);
  const [composeError, setComposeError] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Posting state
  const [postingId, setPostingId] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);

  // Twitter connection
  const [twitterConnected, setTwitterConnected] = useState<boolean | null>(null);
  const [isConnectingTwitter, setIsConnectingTwitter] = useState(false);

  const checkTwitterStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/twitter/auth?action=status");
      if (res.ok) {
        const data = await res.json();
        setTwitterConnected(data.connected);
      }
    } catch {
      setTwitterConnected(false);
    }
  }, []);

  const connectTwitter = async () => {
    setIsConnectingTwitter(true);
    try {
      const res = await fetch("/api/twitter/auth?action=url");
      if (res.ok) {
        const data = await res.json();
        window.open(data.url, "_blank", "width=600,height=700");
      }
    } catch {
      // ignore
    } finally {
      setIsConnectingTwitter(false);
    }
  };

  const fetchTweets = useCallback(async () => {
    try {
      const res = await fetch("/api/tweets");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setTweets(data);
        }
      }
    } catch {
      // keep existing data
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchRateLimit = useCallback(async () => {
    try {
      const month = new Date().toISOString().slice(0, 7);
      const res = await fetch(`/api/tweets?status=posted`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const thisMonth = data.filter(
            (t: Tweet) => t.posted_at && t.posted_at.startsWith(month)
          );
          setRateCount(thisMonth.length);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchTweets();
    fetchRateLimit();
    checkTwitterStatus();
  }, [fetchTweets, fetchRateLimit, checkTwitterStatus]);

  // Re-check Twitter status when window regains focus (after OAuth popup)
  useEffect(() => {
    function onFocus() { checkTwitterStatus(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkTwitterStatus]);

  useEffect(() => {
    if (expanded) {
      fetchTweets();
      fetchRateLimit();
    }
  }, [expanded, fetchTweets, fetchRateLimit]);

  const drafts = tweets.filter((t) => t.status === "draft");
  const scheduled = tweets.filter((t) => t.status === "scheduled");
  const queueTweets = tweets
    .filter((t) => t.status === "draft" || t.status === "scheduled")
    .sort((a, b) => {
      if (a.scheduled_at && b.scheduled_at) return a.scheduled_at.localeCompare(b.scheduled_at);
      if (a.scheduled_at) return -1;
      if (b.scheduled_at) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  const postedTweets = tweets
    .filter((t) => t.status === "posted")
    .sort((a, b) => {
      const aTime = a.posted_at || a.created_at;
      const bTime = b.posted_at || b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    })
    .slice(0, 20);

  const todayScheduled = scheduled.filter((t) => {
    if (!t.scheduled_at) return false;
    const today = new Date().toISOString().slice(0, 10);
    return t.scheduled_at.startsWith(today);
  });

  // Actions
  const handlePostNow = async (tweetId: string) => {
    setPostingId(tweetId);
    setPostError(null);
    try {
      const res = await fetch("/api/tweets/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweet_id: tweetId }),
      });
      if (res.ok) {
        await fetchTweets();
        await fetchRateLimit();
        onRefresh?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setPostError(data.error || `Failed to post (${res.status})`);
      }
    } catch {
      setPostError("Network error — could not reach server.");
    } finally {
      setPostingId(null);
    }
  };

  const handleDelete = async (tweetId: string) => {
    try {
      const res = await fetch(`/api/tweets/${tweetId}`, { method: "DELETE" });
      if (res.ok) {
        setTweets((prev) => prev.filter((t) => t.id !== tweetId));
        setDeletingId(null);
        onRefresh?.();
      }
    } catch {
      // ignore
    }
  };

  const handleEdit = (tweet: Tweet) => {
    setEditingId(tweet.id);
    setEditContent(tweet.content);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    try {
      const res = await fetch(`/api/tweets/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTweets((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
        setEditingId(null);
        setEditContent("");
      }
    } catch {
      // ignore
    }
  };

  const buildRecurringRule = () => {
    if (recurringRule === "none") return null;
    if (recurringRule === "daily") {
      const time = scheduleDate ? new Date(scheduleDate) : new Date();
      const h = String(time.getHours()).padStart(2, "0");
      const m = String(time.getMinutes()).padStart(2, "0");
      return `daily:${h}:${m}`;
    }
    if (recurringRule === "weekly") {
      const time = scheduleDate ? new Date(scheduleDate) : new Date();
      const h = String(time.getHours()).padStart(2, "0");
      const m = String(time.getMinutes()).padStart(2, "0");
      return `weekly:${recurringDay}:${h}:${m}`;
    }
    return null;
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    setComposeError("");
    try {
      if (threadMode) {
        const validTweets = threadTweets.filter((t) => t.trim().length > 0);
        if (validTweets.length === 0) {
          setComposeError("Add at least one tweet to the thread.");
          return;
        }
        const threadId = crypto.randomUUID();
        for (let i = 0; i < validTweets.length; i++) {
          await fetch("/api/tweets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: validTweets[i].trim(),
              thread_id: threadId,
              thread_order: i + 1,
            }),
          });
        }
      } else {
        if (!composeContent.trim()) {
          setComposeError("Tweet content cannot be empty.");
          return;
        }
        await fetch("/api/tweets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: composeContent.trim() }),
        });
      }
      resetCompose();
      await fetchTweets();
      onRefresh?.();
    } catch {
      setComposeError("Failed to save draft.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleDate) {
      setComposeError("Please select a date and time.");
      return;
    }
    setIsSaving(true);
    setComposeError("");
    try {
      const scheduledAt = new Date(scheduleDate).toISOString();
      const rule = buildRecurringRule();
      if (threadMode) {
        const validTweets = threadTweets.filter((t) => t.trim().length > 0);
        if (validTweets.length === 0) {
          setComposeError("Add at least one tweet to the thread.");
          return;
        }
        const threadId = crypto.randomUUID();
        for (let i = 0; i < validTweets.length; i++) {
          const body: Record<string, unknown> = {
            content: validTweets[i].trim(),
            scheduled_at: scheduledAt,
            thread_id: threadId,
            thread_order: i + 1,
          };
          const res = await fetch("/api/tweets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (res.ok && rule) {
            const created = await res.json();
            await fetch(`/api/tweets/${created.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ recurring_rule: rule } as Record<string, unknown>),
            });
          }
        }
      } else {
        if (!composeContent.trim()) {
          setComposeError("Tweet content cannot be empty.");
          return;
        }
        const res = await fetch("/api/tweets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: composeContent.trim(),
            scheduled_at: scheduledAt,
          }),
        });
        if (res.ok && rule) {
          const created = await res.json();
          await fetch(`/api/tweets/${created.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recurring_rule: rule } as Record<string, unknown>),
          });
        }
      }
      resetCompose();
      await fetchTweets();
      onRefresh?.();
    } catch {
      setComposeError("Failed to schedule tweet.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSmartSchedule = () => {
    const now = new Date();
    const hour = now.getHours();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;

    let nextHour: number;
    if (isWeekend) {
      nextHour = hour < 10 ? 10 : hour < 14 ? 14 : 10;
    } else {
      nextHour = hour < 9 ? 9 : hour < 12 ? 12 : hour < 17 ? 17 : 9;
    }

    const target = new Date();
    if (nextHour <= hour) {
      target.setDate(target.getDate() + 1);
    }
    target.setHours(nextHour, 0, 0, 0);

    // Format for datetime-local input
    const y = target.getFullYear();
    const mo = String(target.getMonth() + 1).padStart(2, "0");
    const d = String(target.getDate()).padStart(2, "0");
    const h = String(target.getHours()).padStart(2, "0");
    setScheduleDate(`${y}-${mo}-${d}T${h}:00`);
  };

  const resetCompose = () => {
    setComposeContent("");
    setThreadMode(false);
    setThreadTweets([""]);
    setScheduleDate("");
    setRecurringRule("none");
    setRecurringDay("mon");
    setComposeError("");
  };

  const getCharCountClass = (len: number) => {
    if (len > 280) return "char-counter char-counter-over";
    if (len > 260) return "char-counter char-counter-warn";
    return "char-counter";
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "draft": return "tweet-status-badge draft";
      case "scheduled": return "tweet-status-badge scheduled";
      case "posted": return "tweet-status-badge posted";
      case "failed": return "tweet-status-badge failed";
      default: return "tweet-status-badge";
    }
  };

  // Group tweets by thread_id for display
  const getThreadCount = (threadId: string | null) => {
    if (!threadId) return 0;
    return tweets.filter((t) => t.thread_id === threadId).length;
  };

  const postedThisMonth = () => {
    const month = new Date().toISOString().slice(0, 7);
    return tweets.filter(
      (t) => t.status === "posted" && t.posted_at && t.posted_at.startsWith(month)
    ).length;
  };

  // --- Collapsed view ---
  if (!expanded) {
    return (
      <div
        className="glass twitter-drawer-collapsed"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 20px",
          marginBottom: "2rem",
          cursor: "pointer",
          opacity: 0,
          transform: "translateY(20px)",
          animation: "fadeUp 0.7s var(--ease-out) 0.5s forwards",
        }}
        onClick={() => setExpanded(true)}
      >
        <XIcon size={18} />
        <span
          style={{
            flex: 1,
            fontSize: "0.82rem",
            color: "var(--ink-light)",
            fontFamily: "var(--font-body)",
          }}
        >
          {isLoading
            ? "Loading..."
            : `${drafts.length} draft${drafts.length !== 1 ? "s" : ""}, ${todayScheduled.length} scheduled for today`}
        </span>
        <ChevronDown size={16} style={{ color: "var(--ink-muted)" }} />
      </div>
    );
  }

  // --- Expanded view ---
  return (
    <section
      className="glass twitter-drawer-expanded"
      aria-label="Twitter"
      style={{
        marginBottom: "2rem",
        overflow: "hidden",
        opacity: 0,
        transform: "translateY(20px)",
        animation: "fadeUp 0.7s var(--ease-out) 0.1s forwards",
      }}
    >
      {/* Header */}
      <div className="panel-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <XIcon size={18} />
          <span className="panel-title">Twitter</span>
        </div>
        <button
          onClick={() => setExpanded(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "none",
            border: "none",
            color: "var(--ink-muted)",
            fontSize: "0.76rem",
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: 8,
            transition: "all 0.2s ease",
          }}
        >
          <ChevronUp size={14} />
          Collapse
        </button>
      </div>

      {/* Tabs */}
      <div className="twitter-tabs">
        {(["queue", "compose", "posted"] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`twitter-tab${activeTab === tab ? " twitter-tab-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "queue" ? "Queue" : tab === "compose" ? "Compose" : "Posted"}
          </button>
        ))}
      </div>

      {/* Twitter connection banner */}
      {twitterConnected === false && (
        <div
          style={{
            margin: "8px 12px",
            padding: "10px 14px",
            fontSize: "0.78rem",
            color: "var(--ceramic-warm)",
            background: "color-mix(in srgb, var(--ceramic-warm) 8%, transparent)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>Twitter not connected</span>
          <button
            onClick={connectTwitter}
            disabled={isConnectingTwitter}
            style={{
              padding: "4px 12px",
              fontSize: "0.72rem",
              fontWeight: 600,
              background: "var(--ink)",
              color: "var(--linen)",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {isConnectingTwitter ? "..." : "Connect"}
          </button>
        </div>
      )}

      {/* Tab content */}
      <div className="panel-body" style={{ maxHeight: 420, overflowY: "auto" }}>
        {/* ===== QUEUE TAB ===== */}
        {activeTab === "queue" && (
          <div>
            {queueTweets.length === 0 && !isLoading && (
              <div className="empty-state" style={{ padding: "1.5rem 1rem" }}>
                <div className="empty-state-text">No tweets in queue</div>
                <div className="empty-state-sub">
                  Compose a tweet or ask the AI to draft one
                </div>
              </div>
            )}

            {queueTweets.map((tweet) => {
              const threadCount = getThreadCount(tweet.thread_id);
              // Skip non-first thread tweets
              if (tweet.thread_id && tweet.thread_order > 1) return null;

              return (
                <div key={tweet.id} className="tweet-item">
                  {editingId === tweet.id ? (
                    <div style={{ flex: 1 }}>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        style={{
                          width: "100%",
                          minHeight: 60,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid rgba(168, 162, 158, 0.2)",
                          background: "rgba(255, 255, 255, 0.4)",
                          color: "var(--ink)",
                          fontFamily: "var(--font-body)",
                          fontSize: "0.82rem",
                          resize: "vertical",
                          outline: "none",
                        }}
                      />
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <span className={getCharCountClass(editContent.length)}>
                          {editContent.length}/280
                        </span>
                        <div style={{ flex: 1 }} />
                        <button
                          className="tweet-action-btn"
                          onClick={handleSaveEdit}
                          disabled={editContent.length > 280}
                        >
                          Save
                        </button>
                        <button
                          className="tweet-action-btn"
                          onClick={() => { setEditingId(null); setEditContent(""); }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "0.82rem", color: "var(--ink)", margin: 0, lineHeight: 1.5 }}>
                          {tweet.content.length > 100
                            ? tweet.content.slice(0, 100) + "..."
                            : tweet.content}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                          <span className={getStatusBadgeClass(tweet.status)}>
                            {tweet.status}
                          </span>
                          {tweet.scheduled_at && (
                            <span style={{ fontSize: "0.72rem", color: "var(--ink-muted)" }}>
                              {formatTime(tweet.scheduled_at)}
                            </span>
                          )}
                          {tweet.thread_id && threadCount > 1 && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.72rem", color: "var(--ink-muted)" }}>
                              <Link size={11} />
                              Thread: {threadCount} tweets
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "flex-start" }}>
                        {tweet.status === "draft" && (
                          <button
                            className="tweet-action-btn post"
                            onClick={() => handlePostNow(tweet.id)}
                            disabled={postingId === tweet.id}
                          >
                            <Send size={12} /> {postingId === tweet.id ? "Posting..." : "Post"}
                          </button>
                        )}
                        <button className="tweet-action-btn" onClick={() => handleEdit(tweet)}>
                          <Edit3 size={12} />
                        </button>
                        {deletingId === tweet.id ? (
                          <div style={{ display: "flex", gap: 4 }}>
                            <button className="tweet-action-btn delete" onClick={() => handleDelete(tweet.id)}>
                              Confirm
                            </button>
                            <button className="tweet-action-btn" onClick={() => setDeletingId(null)}>
                              No
                            </button>
                          </div>
                        ) : (
                          <button className="tweet-action-btn" onClick={() => setDeletingId(tweet.id)}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Post error */}
            {postError && (
              <div
                style={{
                  margin: "8px 0",
                  padding: "8px 12px",
                  fontSize: "0.78rem",
                  color: "#b45858",
                  background: "rgba(180, 88, 88, 0.08)",
                  borderRadius: 8,
                }}
              >
                {postError}
              </div>
            )}

            {/* Rate limit */}
            <div
              style={{
                marginTop: 12,
                padding: "8px 12px",
                fontSize: "0.72rem",
                color: "var(--ink-muted)",
                borderTop: "1px solid rgba(168, 162, 158, 0.1)",
                textAlign: "center",
              }}
            >
              {rateCount.toLocaleString()}/1,500 tweets this month
            </div>
          </div>
        )}

        {/* ===== COMPOSE TAB ===== */}
        {activeTab === "compose" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Thread toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                className={`tweet-action-btn${threadMode ? " active" : ""}`}
                onClick={() => {
                  setThreadMode(!threadMode);
                  if (!threadMode) {
                    setThreadTweets([composeContent || ""]);
                    setComposeContent("");
                  } else {
                    setComposeContent(threadTweets[0] || "");
                    setThreadTweets([""]);
                  }
                }}
                style={{ gap: 4 }}
              >
                <Link size={12} />
                Thread
              </button>
            </div>

            {/* Single tweet compose */}
            {!threadMode && (
              <div>
                <textarea
                  value={composeContent}
                  onChange={(e) => setComposeContent(e.target.value)}
                  placeholder="What's happening?"
                  style={{
                    width: "100%",
                    minHeight: 80,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(168, 162, 158, 0.2)",
                    background: "rgba(255, 255, 255, 0.4)",
                    color: "var(--ink)",
                    fontFamily: "var(--font-body)",
                    fontSize: "0.82rem",
                    resize: "vertical",
                    outline: "none",
                    transition: "border-color 0.2s ease",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(122, 153, 130, 0.35)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(168, 162, 158, 0.2)";
                  }}
                />
                <div style={{ textAlign: "right", marginTop: 4 }}>
                  <span className={getCharCountClass(composeContent.length)}>
                    {composeContent.length}/280
                  </span>
                </div>
              </div>
            )}

            {/* Thread compose */}
            {threadMode && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {threadTweets.map((text, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <div
                      style={{
                        position: "absolute",
                        left: -6,
                        top: 8,
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "var(--accent-soft)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        color: "var(--sage-500)",
                        zIndex: 1,
                      }}
                    >
                      {i + 1}
                    </div>
                    <textarea
                      value={text}
                      onChange={(e) => {
                        const updated = [...threadTweets];
                        updated[i] = e.target.value;
                        setThreadTweets(updated);
                      }}
                      placeholder={`Tweet ${i + 1}`}
                      style={{
                        width: "100%",
                        minHeight: 60,
                        padding: "8px 12px 8px 22px",
                        borderRadius: 10,
                        border: "1px solid rgba(168, 162, 158, 0.2)",
                        background: "rgba(255, 255, 255, 0.4)",
                        color: "var(--ink)",
                        fontFamily: "var(--font-body)",
                        fontSize: "0.82rem",
                        resize: "vertical",
                        outline: "none",
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                      <span className={getCharCountClass(text.length)}>
                        {text.length}/280
                      </span>
                      {threadTweets.length > 1 && (
                        <button
                          className="tweet-action-btn"
                          onClick={() => {
                            setThreadTweets(threadTweets.filter((_, idx) => idx !== i));
                          }}
                          style={{ fontSize: "0.68rem" }}
                        >
                          <Trash2 size={10} /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  className="tweet-action-btn"
                  onClick={() => setThreadTweets([...threadTweets, ""])}
                  style={{ alignSelf: "flex-start", gap: 4 }}
                >
                  <Plus size={12} /> Add tweet
                </button>
              </div>
            )}

            {/* Schedule picker */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Calendar size={14} style={{ color: "var(--ink-muted)" }} />
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                style={{
                  border: "1px solid rgba(168, 162, 158, 0.2)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontFamily: "var(--font-body)",
                  fontSize: "0.72rem",
                  background: "rgba(255, 255, 255, 0.4)",
                  color: "var(--ink)",
                  outline: "none",
                }}
              />
              <button className="tweet-action-btn" onClick={handleSmartSchedule} style={{ gap: 4 }}>
                <Clock size={12} /> Smart Schedule
              </button>
            </div>

            {/* Recurring */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "0.72rem", color: "var(--ink-muted)" }}>Recurring:</span>
              <select
                value={recurringRule}
                onChange={(e) => setRecurringRule(e.target.value)}
                style={{
                  border: "1px solid rgba(168, 162, 158, 0.2)",
                  borderRadius: 8,
                  padding: "5px 8px",
                  fontFamily: "var(--font-body)",
                  fontSize: "0.72rem",
                  background: "rgba(255, 255, 255, 0.4)",
                  color: "var(--ink-light)",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="none">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              {recurringRule === "weekly" && (
                <select
                  value={recurringDay}
                  onChange={(e) => setRecurringDay(e.target.value)}
                  style={{
                    border: "1px solid rgba(168, 162, 158, 0.2)",
                    borderRadius: 8,
                    padding: "5px 8px",
                    fontFamily: "var(--font-body)",
                    fontSize: "0.72rem",
                    background: "rgba(255, 255, 255, 0.4)",
                    color: "var(--ink-light)",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="mon">Monday</option>
                  <option value="tue">Tuesday</option>
                  <option value="wed">Wednesday</option>
                  <option value="thu">Thursday</option>
                  <option value="fri">Friday</option>
                  <option value="sat">Saturday</option>
                  <option value="sun">Sunday</option>
                </select>
              )}
            </div>

            {composeError && (
              <div style={{ fontSize: "0.78rem", color: "#b45858", padding: "2px 0" }}>
                {composeError}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                className="tweet-compose-btn draft"
                onClick={handleSaveDraft}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Draft"}
              </button>
              <button
                className="tweet-compose-btn schedule"
                onClick={handleSchedule}
                disabled={isSaving || !scheduleDate}
              >
                <Clock size={13} />
                {isSaving ? "Scheduling..." : "Schedule"}
              </button>
              <button className="tweet-compose-btn ai" disabled>
                <Sparkles size={13} />
                AI Assist
              </button>
            </div>
          </div>
        )}

        {/* ===== POSTED TAB ===== */}
        {activeTab === "posted" && (
          <div>
            <div
              style={{
                padding: "8px 0 12px",
                fontSize: "0.72rem",
                color: "var(--ink-muted)",
                borderBottom: "1px solid rgba(168, 162, 158, 0.1)",
                marginBottom: 8,
              }}
            >
              {postedThisMonth()} posted this month
            </div>

            {postedTweets.length === 0 && !isLoading && (
              <div className="empty-state" style={{ padding: "1.5rem 1rem" }}>
                <div className="empty-state-text">No posted tweets yet</div>
                <div className="empty-state-sub">Your published tweets will appear here</div>
              </div>
            )}

            {postedTweets.map((tweet) => (
              <div key={tweet.id} className="tweet-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.82rem", color: "var(--ink)", margin: 0, lineHeight: 1.5 }}>
                    {tweet.content}
                  </p>
                  {tweet.posted_at && (
                    <span style={{ fontSize: "0.72rem", color: "var(--ink-muted)", marginTop: 4, display: "block" }}>
                      Posted {formatTime(tweet.posted_at)}
                    </span>
                  )}
                </div>
                <div style={{ flexShrink: 0 }}>
                  {deletingId === tweet.id ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="tweet-action-btn delete" onClick={() => handleDelete(tweet.id)}>
                        Confirm
                      </button>
                      <button className="tweet-action-btn" onClick={() => setDeletingId(null)}>
                        No
                      </button>
                    </div>
                  ) : (
                    <button className="tweet-action-btn" onClick={() => setDeletingId(tweet.id)}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
