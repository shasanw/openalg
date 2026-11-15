import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/onest";
import App from "./App";
import { ToastProvider } from "./components/ui/toast";
import { platform } from "./platform";
import { registerServiceWorker } from "./serviceWorker";
import "./index.css";

// Start downloading the Typst compiler and fonts now, not on the first
// Generate, so the Preview is usually ready by the time it's needed (ADR 0002).
platform.prepareRenderer();
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
