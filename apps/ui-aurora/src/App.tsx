import { useApp } from "./store";
import { Sidebar } from "./components/Sidebar";
import { PromptView } from "./components/PromptView";
import { CommunityView } from "./components/CommunityView";
import { SettingsView } from "./components/SettingsView";
import { AuthGate } from "./components/AuthGate";
import { Toaster } from "./components/Toaster";
import { Spinner } from "./ui";

export function App() {
  const { ready, view, web, needsAuth } = useApp();

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-[var(--text-soft)]">
        <Spinner size={22} />
      </div>
    );
  }

  // Website only: require a Supabase session before showing the library.
  if (web && needsAuth) return <AuthGate />;

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Draggable title bar — desktop only (WKWebView ignores -webkit-app-region;
          this is the Tauri way). The website needs no custom title bar. */}
      {!web && <div data-tauri-drag-region className="h-7 w-full shrink-0" />}
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
