"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, Users, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/plans/new", label: "Plan", icon: PlusCircle, isHighlight: true },
    { href: "/companions", label: "Companions", icon: Users },
    { href: "/profile", label: "Preferences", icon: Sliders },
  ];

  return (
    <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-white/15 bg-ink-950 text-cream-50 md:hidden" aria-label="Mobile navigation">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

          if (item.isHighlight) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group relative -top-3 flex flex-col items-center justify-center cursor-pointer"
                aria-current={isActive ? "page" : undefined}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-terra-400 bg-terra-500 text-white shadow-[3px_3px_0_#6d291b] transition-all group-hover:bg-terra-600 group-active:scale-95">
                  <Icon className="h-6 w-6" />
                </div>
                <span className="mt-1 text-[10px] font-semibold text-terra-300">
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center w-16 py-1 text-[11px] font-medium transition-colors cursor-pointer rounded-xl",
                isActive
                  ? "font-semibold text-terra-300"
                  : "text-cream-300 hover:bg-white/10 hover:text-white"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className={cn("h-5 w-5 mb-0.5", isActive && "text-terra-500")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
