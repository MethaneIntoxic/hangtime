"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast: showToast }}>
      {children}
      {/* Toast container */}
      <div
        aria-relevant="additions text"
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            aria-live={t.type === "error" ? "assertive" : "polite"}
            aria-atomic="true"
            className={cn(
              "pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl shadow-lift border text-xs sm:text-sm font-medium animate-fade-up",
              t.type === "success" && "bg-sage-700 text-white border-sage-600",
              t.type === "error" && "bg-berry-600 text-white border-berry-500",
              t.type === "info" && "bg-ink-900 text-cream-50 border-ink-800"
            )}
          >
            <div className="flex items-center gap-2">
              {t.type === "success" && (
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-sage-100" />
              )}
              {t.type === "error" && (
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-berry-100" />
              )}
              {t.type === "info" && (
                <Info aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-300" />
              )}
              <span>{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss notification"
              className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:opacity-70 cursor-pointer"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toast: (msg: string) => console.log("Toast:", msg),
    };
  }
  return context;
}
