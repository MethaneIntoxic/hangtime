import React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "sage" | "amber" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] cursor-pointer select-none";

    const variantStyles = {
      primary:
        "bg-terra-500 text-white hover:bg-terra-600 shadow-soft hover:shadow-lift focus-visible:ring-2 focus-visible:ring-terra-400",
      secondary:
        "bg-cream-200 text-ink-900 hover:bg-cream-300 hover:text-ink-950 focus-visible:ring-2 focus-visible:ring-cream-300",
      outline:
        "border border-cream-300 bg-cream-50/80 text-ink-800 hover:bg-cream-100 hover:border-ink-400 focus-visible:ring-2 focus-visible:ring-terra-400",
      ghost:
        "text-ink-700 hover:bg-cream-100 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-terra-400",
      sage:
        "bg-sage-600 text-white hover:bg-sage-700 shadow-soft focus-visible:ring-2 focus-visible:ring-sage-500",
      amber:
        "bg-amber-500 text-ink-950 hover:bg-amber-300 shadow-soft focus-visible:ring-2 focus-visible:ring-amber-500",
      danger:
        "bg-berry-500 text-white hover:bg-berry-600 shadow-soft focus-visible:ring-2 focus-visible:ring-berry-500",
    };

    const sizeStyles = {
      sm: "text-xs px-3 py-2 rounded-[2px] gap-1.5 h-11 min-h-[44px] uppercase tracking-wide",
      md: "text-sm px-4 py-2.5 rounded-[2px] gap-2 h-11 min-h-[44px]",
      lg: "text-base px-6 py-3.5 rounded-[2px] gap-2.5 h-12 min-h-[48px] font-semibold uppercase tracking-[0.06em]",
      icon: "h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-[2px]",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading ? (
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
