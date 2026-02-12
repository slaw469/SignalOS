"use client";

import { useState, useCallback, useEffect } from "react";
import { ZenBackground } from "@/components/zen-background";
import { BriefingBanner } from "@/components/briefing-banner";
import { AgendaPanel } from "@/components/agenda-panel";
import { TodoPanel } from "@/components/todo-panel";
import { ChatPanel } from "@/components/chat-panel";
import { StatsBar } from "@/components/stats-bar";
import { TwitterDrawer } from "@/components/twitter-drawer";
import { Header } from "@/components/header";

const FALLBACK_BRIEFING =
  "Welcome to your day. Take a breath, review your tasks, and move with intention.";

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [isRefreshingBriefing, setIsRefreshingBriefing] = useState(false);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const fetchBriefing = useCallback(async () => {
    try {
      const res = await fetch("/api/briefing");
      if (res.ok) {
        const data = await res.json();
        setBriefing(data.briefing?.content ?? FALLBACK_BRIEFING);
      } else {
        setBriefing(FALLBACK_BRIEFING);
      }
    } catch {
      setBriefing(FALLBACK_BRIEFING);
    }
  }, []);

  const regenerateBriefing = useCallback(async () => {
    setIsRefreshingBriefing(true);
    try {
      const res = await fetch("/api/briefing", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBriefing(data.briefing?.content ?? FALLBACK_BRIEFING);
      }
    } catch {
      // keep existing briefing on error
    } finally {
      setIsRefreshingBriefing(false);
    }
  }, []);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  return (
    <>
      <ZenBackground />

      <div
        className="relative z-[2] mx-auto max-w-[1440px]"
        style={{ padding: "2rem 2.5rem 3rem" }}
      >
        <Header />

        <BriefingBanner
          content={briefing}
          onRefresh={regenerateBriefing}
          isRefreshing={isRefreshingBriefing}
        />

        <div
          className="panels-grid grid grid-cols-3 gap-6 items-start mb-8"
        >
          <AgendaPanel key={`agenda-${refreshKey}`} />
          <TodoPanel key={`todo-${refreshKey}`} />
          <ChatPanel onToolAction={triggerRefresh} />
        </div>

        <TwitterDrawer key={`twitter-${refreshKey}`} />

        <StatsBar />
      </div>
    </>
  );
}
