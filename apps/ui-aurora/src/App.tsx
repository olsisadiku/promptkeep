import { useApp } from "./store";
import { Sidebar } from "./components/Sidebar";
import { PromptView } from "./components/PromptView";
import { CommunityView } from "./components/CommunityView";
import { SettingsView } from "./components/SettingsView";
import { Toaster } from "./components/Toaster";
import { Spinner } from "./ui";

export function App() {
  const { ready, view } = useApp();

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-[var(--text-soft)]">
        <Spinner size={22} />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Draggable title bar (WKWebView ignores -webkit-app-region; this is the Tauri way). */}
      <div data-tauri-drag-region className="h-7 w-full shrink-0" />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1" style={{ background: "var(--bg)" }}>
          {view === "library" && <PromptView />}
          {view === "community" && <CommunityView />}
          {view === "settings" && <SettingsView />}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
