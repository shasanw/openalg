// Installing OpenAlg as an app (#26). Installed web apps don't get their
// storage cleared the way an ordinary site's can be (Safari evicts sites that
// aren't installed after 7 days without a visit), so the home screen nudges
// teachers to install.
//
// Chrome/Edge fire `beforeinstallprompt`; we hold on to it and show our own
// "Install app" button. iPad/iPhone Safari has no install API, only Share >
// Add to Home Screen, so there we can only show a hint.

import { useCallback, useEffect, useState } from "react";

/** The non-standard event Chrome/Edge fire when the app can be installed. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches)
  );
}

/** iPhone, iPod, or an iPad (which reports itself as a touch-screen Mac). */
function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

export interface InstallPrompt {
  /** Running as an installed app already. */
  installed: boolean;
  /** The browser offered an install prompt we can show (Chrome/Edge). */
  canInstall: boolean;
  /** Show the browser's install prompt. */
  install: () => Promise<void>;
  /** Not installed, on iPad/iPhone: show the "Add to Home Screen" hint. */
  showAppleHint: boolean;
}

export function useInstallPrompt(): InstallPrompt {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep the mini-infobar away; we show our own button
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null); // a prompt event can be used only once
  }, [deferred]);

  return {
    installed,
    canInstall: !installed && deferred !== null,
    install,
    showAppleHint: !installed && isAppleMobile(),
  };
}
