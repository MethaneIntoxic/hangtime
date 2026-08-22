"use client";

import { useEffect, useState } from "react";

export function PwaClient() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const updateConnectionState = () => setIsOffline(!navigator.onLine);

    updateConnectionState();
    window.addEventListener("online", updateConnectionState);
    window.addEventListener("offline", updateConnectionState);

    let removeLoadListener: (() => void) | undefined;

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      const registerWorker = () => {
        void navigator.serviceWorker
          .register("/sw.js", {
            scope: "/",
            updateViaCache: "none",
          })
          .catch(() => {
            // Registration is progressive enhancement; never include URL or user data.
            console.warn("Hangtime service worker registration failed.");
          });
      };

      if (document.readyState === "complete") {
        registerWorker();
      } else {
        window.addEventListener("load", registerWorker, { once: true });
        removeLoadListener = () => window.removeEventListener("load", registerWorker);
      }
    }

    return () => {
      window.removeEventListener("online", updateConnectionState);
      window.removeEventListener("offline", updateConnectionState);
      removeLoadListener?.();
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] bg-ink-950 px-4 py-2 text-center text-xs font-semibold text-cream-50 shadow-soft"
      role="status"
    >
      You&apos;re offline. Saved public app assets remain available, but plans and
      invitations need a connection.
    </div>
  );
}
