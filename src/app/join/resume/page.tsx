"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Clock3, MapPin, ShieldCheck, Utensils } from "lucide-react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDateLabel } from "@/lib/utils";
import { SINGAPORE_PLANNING_AREAS } from "@/providers/singapore-transit";
import { errorFromPayload, InviteFlowError, invitePreviewFromPayload, safeInviteError, type InvitePreview, type SafeInviteError } from "@/app/join/join-flow";

export default function ResumeInvitePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<SafeInviteError | null>(null);
  const [selectedArea, setSelectedArea] = useState("Tampines / Pasir Ris (East)");
  const hasSelectedAreaRef = useRef(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<SafeInviteError | null>(null);
  const loadSequence = useRef(0);
  const loadErrorRef = useRef<HTMLElement>(null);
  const joinErrorRef = useRef<HTMLDivElement>(null);

  const loadInvite = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setInvite(null);
    setLoadError(null);
    try {
      const response = await fetch("/api/v1/invites/resume", { cache: "no-store", referrerPolicy: "no-referrer" });
      const payload = await response.json().catch(() => null);
      if (sequence !== loadSequence.current) return;
      if (!response.ok) {
        setLoadError(errorFromPayload(payload, response.status));
        return;
      }
      const parsedInvite = invitePreviewFromPayload(payload);
      if (!parsedInvite) {
        setLoadError(safeInviteError("UNKNOWN", response.status));
        return;
      }
      setInvite(parsedInvite);
    } catch {
      if (sequence === loadSequence.current) setLoadError(safeInviteError("UNKNOWN", 0));
    }
  }, []);

  useEffect(() => {
    if (joinError) joinErrorRef.current?.focus();
    else if (loadError) loadErrorRef.current?.focus();
  }, [joinError, loadError]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadInvite(), 0);
    return () => window.clearTimeout(timer);
  }, [loadInvite]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void fetch("/api/v1/me", { cache: "no-store", referrerPolicy: "no-referrer" })
        .then(async (response) => response.ok ? response.json().catch(() => null) : null)
        .then((payload: { data?: { profile?: { coarseArea?: unknown } } } | null) => {
          const profileArea = payload?.data?.profile?.coarseArea;
          const supportedArea = SINGAPORE_PLANNING_AREAS.find((area) => area.label === profileArea)?.label;
          if (active && !hasSelectedAreaRef.current && supportedArea) setSelectedArea(supportedArea);
        })
        .catch(() => undefined);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  const handleJoin = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!invite) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      const area = SINGAPORE_PLANNING_AREAS.find((item) => item.label === selectedArea);
      if (!area) throw new InviteFlowError("INVALID_INPUT", "Choose a valid Singapore area.");
      const response = await fetch(`/api/v1/plans/${invite.id}/participation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        referrerPolicy: "no-referrer",
        body: JSON.stringify({ coarseOriginLabel: selectedArea }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new InviteFlowError(payload?.error?.code || "UNKNOWN", payload?.error?.message || "You could not join this plan.");
      toast("You’re in — finish your check-in.", "success");
      router.replace(`/plans/${invite.id}`);
    } catch (error) {
      setJoinError(error instanceof InviteFlowError ? safeInviteError(error.code, 0) : safeInviteError("UNKNOWN", 0));
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-dvh bg-cream-50">
      <Header />
      <main className="mx-auto max-w-xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center border border-terra-600 bg-terra-50 text-terra-700"><Utensils className="h-6 w-6" aria-hidden="true" /></span>
          <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.23em] text-terra-700">Invitation resumed</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink-950">Finish joining</h1>
        </div>
        {loadError ? (
          <section ref={loadErrorRef} tabIndex={-1} className="mt-8 border border-berry-500/30 bg-berry-100 p-6 text-center" role="alert" aria-describedby="resume-error-copy">
            <h2 className="font-display text-xl font-semibold text-berry-700">{loadError.title}</h2>
            <p id="resume-error-copy" className="mt-2 text-sm leading-6 text-ink-700">{loadError.message}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {loadError.action === "retry" && <Button variant="primary" size="md" onClick={() => void loadInvite()}>Try again</Button>}
              {loadError.action === "sign-in" && <Button variant="primary" size="md" onClick={() => router.replace("/sign-in?next=/join/resume")}>Sign in again</Button>}
              <Button variant="outline" size="md" onClick={() => router.replace("/")}>Return home</Button>
            </div>
          </section>
        ) : !invite ? (
          <div role="status" aria-live="polite" aria-busy="true" className="mt-8 h-80 animate-pulse-soft border border-ink-900/15 bg-cream-100" aria-label="Restoring invitation" />
        ) : (
          <section className="meal-ticket mt-8 border border-ink-900/20 bg-[#fffaf1] p-6 shadow-lift sm:p-8">
            <div className="border-b border-dashed border-ink-900/20 pb-5">
              <p className="text-sm text-ink-600">{invite.organizerDisplayName} invited you to</p>
              <h2 className="mt-1 font-display text-3xl font-semibold capitalize text-ink-950">{invite.mealType}</h2>
              <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-ink-700"><span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden="true" className="h-4 w-4" />{formatDateLabel(invite.date)}</span><span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" className="h-4 w-4" />{invite.windowStart}–{invite.windowEnd}</span></div>
            </div>
            <form onSubmit={handleJoin} className="mt-6 space-y-5" aria-describedby={joinError ? "resume-join-error" : undefined}>
              {joinError && <div ref={joinErrorRef} id="resume-join-error" tabIndex={-1} role="alert" className="border border-berry-500/30 bg-berry-100 px-4 py-3 text-sm text-berry-800"><p className="font-semibold">{joinError.title}</p><p className="mt-1">{joinError.message}</p>{joinError.action === "retry" && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void handleJoin()}>Try again</Button>}</div>}
              <p className="border border-ink-900/15 bg-cream-100 px-4 py-3 text-sm leading-6 text-ink-700">You’re joining with your signed-in Hangtime profile. Profile maintenance stays separate from accepting this invitation.</p>
              <div>
                <label htmlFor="resume-origin-area" className="mb-2 block text-sm font-bold text-ink-800">Where will you travel from?</label>
                <div className="relative"><MapPin className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-terra-600" aria-hidden="true" /><select id="resume-origin-area" name="originArea" value={selectedArea} onChange={(event) => { hasSelectedAreaRef.current = true; setSelectedArea(event.target.value); }} className="min-h-12 w-full appearance-none border border-ink-900/20 bg-cream-50 pl-10 pr-4 text-sm text-ink-950 focus:border-terra-600">{SINGAPORE_PLANNING_AREAS.map((area) => <option key={area.label} value={area.label}>{area.label}</option>)}</select></div>
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-sage-700"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />Your companion sees only this general area, never the precise origin used for travel estimates.</p>
              </div>
              <Button type="submit" variant="primary" size="lg" isLoading={isJoining} className="w-full font-bold">Join plan <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
