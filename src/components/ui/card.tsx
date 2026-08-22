import React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "interactive" | "accent";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", children, ...props }, ref) => {
    const variantStyles = {
      default: "bg-cream-100/70 border border-ink-900/20 shadow-none",
      elevated: "bg-cream-50 border border-ink-900/20 shadow-[6px_6px_0_rgb(17_17_15_/_0.08)]",
      interactive:
        "bg-cream-50 border border-cream-200 shadow-soft hover:shadow-lift hover:border-terra-300 transition-all duration-200 cursor-pointer active:scale-[0.99]",
      accent:
        "bg-terra-50 border border-terra-300 shadow-soft",
    };

    return (
      <div
        ref={ref}
        className={cn("rounded-[3px] p-4 sm:p-5", variantStyles[variant], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
