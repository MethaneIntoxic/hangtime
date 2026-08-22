"use client";

import { use, useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Clock3, MapPin, ShieldCheck, Utensils } from "lucide-react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDateLabel } from "@/lib/utils";
import { SINGAPORE_PLANNING_AREAS } from "@/providers/singapore-transit";

type InvitePreview = {
  id: string;
  mealType: string;
  date: string;
  windowStart: string;
  windowEnd: string;
  organizerDisplayName: string;
};

export default function JoinPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [guestName, setGuestName] = useState("");
  const [selectedArea, setSelectedArea] = useState("Tampines / Pasir Ris (East)");
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/invites/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "This invitation could not be opened.");
        if (active) setInvite(payload.data.plan);
      })
      .catch((error: Error) => {
        if (active) setLoadError(error.message);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!invite) return;
    setIsJoining(true);

    try {
      const area = SINGAPORE_PLANNING_AREAS.find((item) => item.label === selectedArea);
      if (!area) throw new Error("Choose a valid Singapore area.");

      const profileResponse = await fetch("/api/v1/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: guestName,
          coarseArea: selectedArea,
        }),
      });
      if (!profileResponse.ok) {
        const payload = await profileResponse.json();
        throw new Error(payload.error?.message ?? "Your diner profile could not be saved.");
      }

      const joinResponse = await fetch(`/api/v1/plans/${invite.id}/participation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteToken: token,
          coarseOriginLabel: selectedArea,
        }),
      });
      const payload = await joinResponse.json();
      if (!joinResponse.ok) throw new Error(payload.error?.message ?? "You could not join this plan.");

      toast("You're in. Let's find a table.", "success");
      router.replace(`/plans/${invite.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "You could not join this plan.", "error");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-dvh bg-cream-50">
      <Header />
      <main className="mx-auto max-w-xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-terra-600 bg-terra-50 text-terra-700">
            <Utensils className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.23em] text-terra-700">A seat is waiting</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink-950">Join the hangout</h1>
        </div>

        {loadError ? (
          <section className="mt-8 border border-berry-500/30 bg-berry-100 p-6 text-center" role="alert">
            <h2 className="font-display text-xl font-semibold text-berry-700">Invitation unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-ink-700">{loadError}</p>
            <Button variant="outline" size="md" className="mt-5" onClick={() => router.push("/")}>Return home</Button>
          </section>
        ) : !invite ? (
          <div role="status" aria-live="polite" aria-busy="true" className="mt-8 h-80 animate-pulse-soft border border-ink-900/15 bg-cream-100" aria-label="Checking invitation" />
        ) : (
          <section className="meal-ticket mt-8 border border-ink-900/20 bg-[#fffaf1] p-6 shadow-lift sm:p-8">
            <div className="border-b border-dashed border-ink-900/20 pb-5">
              <p className="text-sm text-ink-600">{invite.organizerDisplayName} invited you to</p>
              <h2 className="mt-1 font-display text-3xl font-semibold capitalize text-ink-950">{invite.mealType}</h2>
              <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-ink-700">
                <span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden="true" className="h-4 w-4" />{formatDateLabel(invite.date)}</span>
                <span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="h-4 w-4" />{invite.windowStart}–{invite.windowEnd}</span>
              </div>
            </div>

            <form onSubmit={handleJoin} className="mt-6 space-y-5">
              <div>
                <label htmlFor="guest-name" className="mb-2 block text-sm font-bold text-ink-800">What should we call you?</label>
                <input id="guest-name" name="guestName" value={guestName} onChange={(event) => setGuestName(event.target.value)} required autoComplete="name" placeholder="Jordan" className="min-h-12 w-full border border-ink-900/20 bg-cream-50 px-4 text-sm text-ink-950 focus:border-terra-600" />
              </div>
              <div>
                <label htmlFor="origin-area" className="mb-2 block text-sm font-bold text-ink-800">Where will you travel from?</label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-terra-600" aria-hidden="true" />
                  <select id="origin-area" name="originArea" value={selectedArea} onChange={(event) => setSelectedArea(event.target.value)} className="min-h-12 w-full appearance-none border border-ink-900/20 bg-cream-50 pl-10 pr-4 text-sm text-ink-950 focus:border-terra-600">
                    {SINGAPORE_PLANNING_AREAS.map((area) => <option key={area.label} value={area.label}>{area.label}</option>)}
                  </select>
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-sage-700"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />Your companion sees only this general area, never the precise origin used for travel estimates.</p>
              </div>
              <Button type="submit" variant="primary" size="lg" isLoading={isJoining} className="w-full font-bold">
                Join plan <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
