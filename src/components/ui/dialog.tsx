"use client";

import React, { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
}

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "md",
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusableElements = () => {
      if (!dialog) return [];

      return Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
        )
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key !== "Tab" || !dialog) return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (e.shiftKey && (activeElement === firstElement || !dialog.contains(activeElement))) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && (activeElement === lastElement || !dialog.contains(activeElement))) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    const focusFrame = window.requestAnimationFrame(() => {
      const initialFocusTarget = getFocusableElements()[0] ?? dialog;
      initialFocusTarget?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);

      const previousActiveElement = previousActiveElementRef.current;
      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidths = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink-950/40 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal dialog content */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : "Dialog"}
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-50 w-full rounded-3xl bg-cream-50 p-6 shadow-pop border border-cream-200 animate-pop-in overflow-hidden",
          maxWidths[maxWidth]
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-500 hover:bg-cream-200/80 hover:text-ink-800 transition-colors cursor-pointer"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>

        {title ? (
          <div className="mb-4 pr-8">
            <h3 id={titleId} className="font-display text-xl font-bold text-ink-900">
              {title}
            </h3>
            {description ? (
              <p id={descriptionId} className="mt-1 text-xs text-ink-500">
                {description}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="max-h-[80vh] overflow-y-auto pr-1 scrollbar-none">{children}</div>
      </div>
    </div>
  );
}
