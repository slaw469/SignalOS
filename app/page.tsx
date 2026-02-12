import { ZenBackground } from "@/components/zen-background";
import { BriefingBanner } from "@/components/briefing-banner";
import { AgendaPanel } from "@/components/agenda-panel";
import { TodoPanel } from "@/components/todo-panel";
import { ChatPanel } from "@/components/chat-panel";
import { StatsBar } from "@/components/stats-bar";
import { Header } from "@/components/header";

export default function Home() {
  return (
    <>
      <ZenBackground />

      <div
        className="relative z-[2] mx-auto max-w-[1440px]"
        style={{ padding: "2rem 2.5rem 3rem" }}
      >
        <Header />

        <BriefingBanner
          content="Four things on your plate today. CS 301 at ten, startup standup at two, Upwork client call at four-thirty, and DoorDash from six. Your pitch deck draft is due Friday &mdash; steady momentum."
        />

        <div
          className="panels-grid grid grid-cols-3 gap-6 items-start mb-8"
        >
          <AgendaPanel />
          <TodoPanel />
          <ChatPanel />
        </div>

        <StatsBar />
      </div>
    </>
  );
}
