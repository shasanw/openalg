import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/onest";
import App from "./App";
import { ToastProvider } from "./components/ui/toast";
import { loadDraftFonts } from "./components/shell/DraftPages";
import { platform } from "./platform";
import { registerServiceWorker } from "./serviceWorker";
import { afterFirstPaint } from "./lib/afterFirstPaint";
import "./index.css";

// Right after first paint (so the app's own scripts, styles and font go
// first): request the draft Preview's few small KaTeX fonts, so a first visit
// can show the draft at once (#29), then start downloading the Typst compiler
// and fonts at low priority, not on the first Generate, so the exact Preview
// is usually ready by the time it's needed (ADR 0002).
afterFirstPaint(() => {
  loadDraftFonts();
  platform.prepareRenderer();
});
registerServiceWorker(
  new Promise<void>((resolve) => {
    const stop = platform.onRendererStatus((s) => {
      if (s.state !== "ready") return;
      resolve();
      queueMicrotask(() => stop());
    });
  }),
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
