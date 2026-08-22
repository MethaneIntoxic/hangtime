"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, Home, LogOut, Route, UserRound, Users } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const DEMO_USERS = [
  { id: "user_maya", name: "Maya Chen", area: "Novena" },
  { id: "user_ethan", name: "Ethan Tan", area: "Jurong East" },
  { id: "user_clara", name: "Clara Lee", area: "Tampines" },
];

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/companions", label: "Companions", icon: Users },
  { href: "/profile", label: "Profile", icon: UserRound },
];

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState("user_maya");
  const [currentProfile, setCurrentProfile] = useState<{ id: string; name: string; area: string } | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  useEffect(() => {
    fetch("/api/v1/me")
      .then((response) => response.json())
      .then((data) => {
        if (data?.data?.profile?.id) {
          setCurrentUser(data.data.profile.id);
          setCurrentProfile({
            id: data.data.profile.id,
            name: data.data.profile.displayName,
            area: data.data.profile.coarseArea || "Singapore",
          });
        }
        setIsDemo(Boolean(data?.data?.demoMode));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDropdownOpen(false);
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsDropdownOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [isDropdownOpen]);

  const handleSwitchUser = async (userId: string, name: string) => {
    const response = await fetch("/api/v1/me/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
      toast("Demo perspective could not be changed.", "error");
      return;
    }
    setCurrentUser(userId);
    setIsDropdownOpen(false);
    toast(`Viewing the demo as ${name}.`, "info");
    window.location.reload();
  };

  const handleSignOut = async () => {
    const response = await fetch("/api/v1/auth/sign-out", { method: "POST" });
    if (!response.ok) {
      toast("You could not be signed out. Please try again.", "error");
      return;
    }
    router.replace("/sign-in");
    router.refresh();
  };

  const activeUser = DEMO_USERS.find((user) => user.id === currentUser) ?? DEMO_USERS[0];
  const visibleUser = isDemo ? activeUser : currentProfile;

  return (
    <header className="sticky top-0 z-40 border-b border-white/15 bg-ink-950 text-cream-50">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link href="/" className="group flex min-h-11 items-center gap-3" aria-label="Hangtime home">
          <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-terra-500 text-terra-400">
            <Route className="h-6 w-6 stroke-[1.8]" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-display text-xl font-semibold uppercase tracking-[0.08em] text-cream-50 sm:text-2xl">Hangtime</span>
            <span className="hidden text-[8px] font-bold uppercase tracking-[0.3em] text-terra-400 sm:block">Meet in the middle</span>
          </span>
        </Link>

        <nav className="hidden h-full items-center gap-8 md:flex" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full min-w-20 items-center justify-center gap-2 border-b-2 px-2 text-sm font-semibold transition",
                  active
                    ? "border-terra-500 text-cream-50"
                    : "border-transparent text-cream-200 hover:border-white/30 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div ref={menuRef} className="relative">
          {isDemo ? (
            <button
              type="button"
              onClick={() => setIsDropdownOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={isDropdownOpen}
              className="flex min-h-11 items-center gap-2 border-l border-white/20 pl-3 text-left sm:pl-5"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full border border-white/30 bg-terra-600 text-xs font-extrabold text-white">
                {initials(activeUser.name)}
              </span>
              <span className="hidden sm:block">
                <span className="block text-sm font-bold text-cream-50">{activeUser.name.split(" ")[0]}</span>
                <span className="block text-[9px] font-bold uppercase tracking-wider text-terra-400">Demo diner</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 text-cream-300 transition", isDropdownOpen && "rotate-180")} aria-hidden="true" />
            </button>
          ) : (
            visibleUser ? (
              <div className="flex items-center gap-2">
                <Link href="/profile" className="flex min-h-11 items-center gap-2" aria-label="Open profile">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-100 text-xs font-extrabold text-ink-900">{initials(visibleUser.name)}</span>
                  <span className="hidden text-sm font-bold text-cream-50 sm:block">{visibleUser.name.split(" ")[0]}</span>
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="grid min-h-11 min-w-11 place-items-center text-cream-300 hover:text-terra-400"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <Link href="/sign-in" className="inline-flex min-h-11 items-center px-3 text-sm font-bold text-terra-400 hover:underline">
                Sign in
              </Link>
            )
          )}

          {isDemo && isDropdownOpen && (
            <div role="menu" className="absolute right-0 top-full mt-3 w-72 border border-ink-900/20 bg-[#fffaf1] p-2 shadow-pop">
              <div className="border-b border-ink-900/15 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-terra-700">Demo perspective</p>
                <p className="mt-1 text-xs leading-5 text-ink-600">Switch diners to test readiness and voting.</p>
              </div>
              {DEMO_USERS.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSwitchUser(user.id, user.name)}
                  className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-cream-200"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-cream-200 text-[10px] font-extrabold">{initials(user.name)}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-bold text-ink-950">{user.name}</span>
                    <span className="block text-xs text-ink-500">{user.area}</span>
                  </span>
                  {currentUser === user.id && <Check className="h-4 w-4 text-sage-700" aria-label="Current diner" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
