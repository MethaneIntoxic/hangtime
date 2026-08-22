import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "terra" | "sage" | "amber" | "plum" | "neutral" | "berry";
  size?: "sm" | "md";
}

export function Badge({
  className,
  variant = "neutral",
  size = "sm",
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    terra: "bg-terra-50 text-terra-700 border-terra-200 border",
    sage: "bg-sage-50 text-sage-700 border-sage-100 border font-medium",
    amber: "bg-amber-100 text-amber-900 border-amber-300 border",
    plum: "bg-plum-50 text-plum-700 border-plum-200 border",
    neutral: "bg-cream-200/70 text-ink-800 border-cream-300 border",
    berry: "bg-berry-100 text-berry-700 border-berry-200 border",
  };

  const sizeStyles = {
    sm: "text-[11px] px-2 py-0.5 rounded-md gap-1",
    md: "text-xs px-2.5 py-1 rounded-lg gap-1.5 font-medium",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center tracking-tight leading-none select-none transition-colors",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
