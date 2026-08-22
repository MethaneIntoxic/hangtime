"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/nav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { UserPlus, Heart, MapPin, Sparkles, PlusCircle } from "lucide-react";
import Link from "next/link";

export default function CompanionsPage() {
  const { toast } = useToast();
  const [companions, setCompanions] = useState<{
    id: string;
    companionId: string;
    displayName: string;
    email: string;
    coarseArea: string;
    isFavourite: boolean;
  }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  const loadCompanions = () => {
    fetch("/api/v1/companions")
      .then((r) => r.json())
      .then((data) => {
        if (data?.data?.companions) setCompanions(data.data.companions);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadCompanions();
  }, []);

  const handleAddCompanion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    setIsInviting(true);
    try {
      const res = await fetch("/api/v1/companions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, displayName: inviteName }),
      });
      if (res.ok) {
        toast(`Companion ${inviteName || inviteEmail} added!`, "success");
        setIsInviteModalOpen(false);
        setInviteEmail("");
        setInviteName("");
        loadCompanions();
      } else {
        toast("Failed to add companion", "error");
      }
    } catch {
      toast("Error adding companion", "error");
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-cream-50 pb-28">
      <Header />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 space-y-6 animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink-950">
              Dining Companions
            </h1>
            <p className="text-xs text-ink-500 font-medium mt-0.5">
              Saved partners and friends you regularly dine with.
            </p>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsInviteModalOpen(true)}
            className="text-xs font-semibold shadow-soft"
          >
            <UserPlus className="h-4 w-4" />
            <span>Add Companion</span>
          </Button>
        </div>

        {/* Companions List */}
        <div className="grid gap-3">
          {isLoading && [0, 1].map((item) => (
            <div key={item} className="h-24 animate-pulse-soft rounded-2xl bg-cream-100" aria-hidden="true" />
          ))}
          {!isLoading && companions.length === 0 && (
            <Card variant="default" className="p-8 text-center text-sm text-ink-600">No companions saved yet. Add someone you plan meals with often.</Card>
          )}
          {!isLoading && companions.map((comp) => (
            <Card
              key={comp.id}
              variant="elevated"
              className="p-4 border-cream-200 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-cream-300 bg-amber-100 text-xs font-extrabold text-ink-900" aria-hidden="true">
                  {comp.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-sm font-bold text-ink-950">
                      {comp.displayName}
                    </h3>
                    {comp.isFavourite && (
                      <Badge variant="terra" size="sm">
                        <Heart className="h-3 w-3 fill-terra-500 text-terra-600" /> Favourite
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-500 mt-0.5">{comp.email}</p>
                  <p className="text-[11px] text-ink-400 flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {comp.coarseArea}
                  </p>
                </div>
              </div>

              <Link href={`/plans/new?companionId=${comp.companionId}`}>
                <Button variant="outline" size="sm" className="text-xs font-semibold shrink-0">
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>Plan Meal</span>
                </Button>
              </Link>
            </Card>
          ))}
        </div>

        {/* Invite Companion Modal */}
        <Dialog
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          title="Add Dining Companion"
          description="Save a partner or friend to easily plan meals together."
          maxWidth="sm"
        >
          <form onSubmit={handleAddCompanion} className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-ink-700 block mb-1">
                Companion Name
              </label>
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="e.g. Jordan Tan"
                className="w-full rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-xs text-ink-900 focus:border-terra-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-ink-700 block mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="jordan@example.com"
                className="w-full rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-xs text-ink-900 focus:border-terra-500 focus:outline-none"
                required
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isInviting}
                className="w-full text-xs font-bold"
              >
                <Sparkles className="h-4 w-4" />
                <span>Save Companion</span>
              </Button>
            </div>
          </form>
        </Dialog>
      </main>

      <BottomNav />
    </div>
  );
}
