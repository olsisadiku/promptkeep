import { createRoot } from "react-dom/client";
import { isQuickPanel } from "@spl/shared-ui";
import { AppProvider } from "./store";
import { App } from "./App";
import { QuickPanel } from "./components/QuickPanel";
import "./index.css";

function showFatal(msg: string) {
  const el = document.getElementById("root");
  if (el)
    el.innerHTML = `<pre style="white-space:pre-wrap;padding:24px;font:13px ui-monospace,monospace;color:#c0392b">${msg}</pre>`;
}
window.addEventListener("error", (e) => showFatal(`Error: ${e.message}\n${e.error?.stack ?? ""}`));
window.addEventListener("unhandledrejection", (e) =>
  showFatal(`Unhandled: ${String((e as PromiseRejectionEvent).reason)}`),
);

try {
  const root = createRoot(document.getElementById("root")!);
  // The same bundle drives both windows; the menu-bar popover renders a light
  // standalone panel, the main window renders the full app.
  if (isQuickPanel()) {
    root.render(<QuickPanel />);
  } else {
    root.render(
      <AppProvider>
        <App />
      </AppProvider>,
    );
  }
} catch (e) {
  showFatal(`Mount failed: ${String(e)}`);
}
