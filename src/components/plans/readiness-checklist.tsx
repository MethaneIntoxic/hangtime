"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, MapPin, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SINGAPORE_PLANNING_AREAS } from "@/providers/singapore-transit";
import type {
  AvailabilityWindow,
  AvailabilityWindowInput,
  ParticipationUpdateInput,
  Plan,
  PlanParticipant,
  UserProfile,
} from "@/types";

type ReadinessField = "origin" | "availability" | "dietary";
type FieldErrors = Partial<Record<ReadinessField, string>>;

interface ReadinessChecklistProps {
  plan: Plan;
  currentUser: UserProfile;
  participant?: PlanParticipant;
  onSaved?: () => void;
}

const DEFAULT_AREA = "Novena / Balestier (Central)";

function toDraftWindow(window: AvailabilityWindow | AvailabilityWindowInput): AvailabilityWindowInput {
  return {
    startTime: window.startTime,
    endTime: window.endTime,
    source: window.source,
  };
}

function parseMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function validateDraft(
  area: string,
  windows: AvailabilityWindowInput[],
  dietaryDeclared: boolean,
  plan: Plan,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!area.trim()) errors.origin = "Choose the coarse planning area you will travel from.";

  const planStart = parseMinutes(plan.windowStart);
  const planEnd = parseMinutes(plan.windowEnd);
  const hasValidWindow = windows.some((window) => {
    const start = parseMinutes(window.startTime);
    const end = parseMinutes(window.endTime);
    return (
      start !== null &&
      end !== null &&
      start < end &&
      (planStart === null || start >= planStart) &&
      (planEnd === null || end <= planEnd)
    );
  });
  if (!hasValidWindow) {
    errors.availability = `Add at least one valid window within ${plan.windowStart}–${plan.windowEnd}.`;
  }

  if (!dietaryDeclared) {
    errors.dietary = "Confirm that your dietary rules and preferences are reviewed for this plan.";
  }
  return errors;
}

function extractFieldErrors(payload: unknown, fallback: FieldErrors): FieldErrors {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]> } }).error;
  if (!error) return fallback;
  const fieldErrors: FieldErrors = {};
  for (const field of ["origin", "availability", "dietary"] as const) {
    const messages = error.fieldErrors?.[field];
    if (messages?.length) fieldErrors[field] = messages[0];
  }
  if (Object.keys(fieldErrors).length > 0) return fieldErrors;
  if (error.code === "INVALID_LOCATION") {
    fieldErrors.origin = error.message || "Choose a supported Singapore planning area.";
  } else if (error.code === "READINESS_REQUIREMENTS_MISSING") {
    return {
      origin: fallback.origin || "Review your planning area before marking ready.",
      availability: fallback.availability || "Review your availability window before marking ready.",
      dietary: fallback.dietary || "Review your dietary acknowledgement before marking ready.",
    };
  } else if (error.message) {
    fieldErrors.availability = error.message;
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : fallback;
}

export function ReadinessChecklist({ plan, currentUser, participant, onSaved }: ReadinessChecklistProps) {
  const initialWindows = useMemo(
    () => participant?.availability?.map(toDraftWindow) ?? [],
    [participant?.availability],
  );
  const [selectedArea, setSelectedArea] = useState(
    participant?.coarseOriginLabel || currentUser.coarseArea || DEFAULT_AREA,
  );
  const [windows, setWindows] = useState<AvailabilityWindowInput[]>(initialWindows);
  const [dietaryDeclared, setDietaryDeclared] = useState(Boolean(participant?.dietaryDeclared));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const hydratedParticipant = useRef<string | undefined>(participant?.id);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const pendingSaveCount = useRef(0);

  useEffect(() => {
    if (!participant || hydratedParticipant.current === participant.id) return;
    hydratedParticipant.current = participant.id;
    setSelectedArea(participant.coarseOriginLabel || currentUser.coarseArea || DEFAULT_AREA);
    setWindows(participant.availability?.map(toDraftWindow) ?? []);
    setDietaryDeclared(Boolean(participant.dietaryDeclared));
    setFieldErrors({});
    setSaveError("");
  }, [currentUser.coarseArea, participant]);

  const currentIsReady = Boolean(participant?.isReady);
  const draftErrors = validateDraft(selectedArea, windows, dietaryDeclared, plan);
  const displayErrors: FieldErrors = { ...draftErrors, ...fieldErrors };
  const hasDraftErrors = Object.keys(draftErrors).length > 0;

  const putParticipation = async (
    next: ParticipationUpdateInput,
    nextErrors: FieldErrors = {},
    preserveErrors = false,
  ) => {
    if (!participant) return false;
    pendingSaveCount.current += 1;
    setIsSaving(true);

    const save = async () => {
      setSaveError("");
      try {
        const response = await fetch(`/api/v1/plans/${plan.id}/participation`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const errors = extractFieldErrors(payload, nextErrors);
          setFieldErrors(errors);
          setSaveError(payload?.error?.message || "We could not save your readiness details.");
          return false;
        }
        setFieldErrors(preserveErrors ? nextErrors : {});
        onSaved?.();
        return true;
      } catch {
        setSaveError("We could not save your readiness details. Check your connection and try again.");
        return false;
      }
    };

    // Input autosaves and the deliberate Ready action must reach the server in
    // the same order as the user's edits. Otherwise a slower stale request can
    // overwrite a newer readiness decision.
    const queuedSave = saveQueue.current.then(save, save);
    saveQueue.current = queuedSave;
    return queuedSave.finally(() => {
      pendingSaveCount.current -= 1;
      if (pendingSaveCount.current === 0) setIsSaving(false);
    });
  };

  const syncInputs = (nextArea: string, nextWindows: AvailabilityWindowInput[], nextDietary: boolean) => {
    const errors = validateDraft(nextArea, nextWindows, nextDietary, plan);
    setFieldErrors(errors);
    void putParticipation({
      coarseOriginLabel: nextArea,
      availability: nextWindows,
      dietaryDeclared: nextDietary,
      // Input changes deliberately clear readiness server-side. A second,
      // explicit Ready action is required after any material change.
      isReady: false,
    }, errors, true);
  };

  const handleAreaChange = (nextArea: string) => {
    setSelectedArea(nextArea);
    syncInputs(nextArea, windows, dietaryDeclared);
  };

  const handleWindowChange = (index: number, field: "startTime" | "endTime", value: string) => {
    const nextWindows = windows.map((window, windowIndex) => (
      windowIndex === index ? { ...window, [field]: value } : window
    ));
    setWindows(nextWindows);
    syncInputs(selectedArea, nextWindows, dietaryDeclared);
  };

  const handleAddWindow = () => {
    const nextWindows = [...windows, { startTime: plan.windowStart, endTime: plan.windowEnd, source: "manual" as const }];
    setWindows(nextWindows);
    syncInputs(selectedArea, nextWindows, dietaryDeclared);
  };

  const handleRemoveWindow = (index: number) => {
    const nextWindows = windows.filter((_, windowIndex) => windowIndex !== index);
    setWindows(nextWindows);
    syncInputs(selectedArea, nextWindows, dietaryDeclared);
  };

  const handleDietaryChange = (checked: boolean) => {
    setDietaryDeclared(checked);
    syncInputs(selectedArea, windows, checked);
  };

  const handleReady = async () => {
    if (currentIsReady) {
      await putParticipation({
        coarseOriginLabel: selectedArea,
        availability: windows,
        dietaryDeclared,
        isReady: false,
      });
      return;
    }
    const errors = validateDraft(selectedArea, windows, dietaryDeclared, plan);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSaveError("Complete each checklist item before marking yourself ready.");
      return;
    }
    await putParticipation({
      coarseOriginLabel: selectedArea,
      availability: windows,
      dietaryDeclared: true,
      isReady: true,
    }, errors);
  };

  return (
    <Card variant="default" className="border-cream-300 bg-cream-100/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-base font-bold text-ink-900">Readiness checklist</h4>
          <p className="mt-1 text-xs leading-5 text-ink-600">
            Review these details before you declare that you are ready. Changes clear readiness until you confirm again.
          </p>
        </div>
        {currentIsReady ? (
          <span role="status" aria-live="polite" aria-atomic="true" className="inline-flex items-center gap-1 rounded-full border border-sage-200 bg-sage-50 px-2.5 py-1 text-xs font-semibold text-sage-700">
            <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> Ready
          </span>
        ) : (
          <span role="status" aria-live="polite" aria-atomic="true" className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
            <Clock3 aria-hidden="true" className="h-3.5 w-3.5" /> Not ready yet
          </span>
        )}
      </div>

      <ol className="mt-5 space-y-5" aria-label="Readiness requirements">
        <li className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-terra-100 text-xs font-bold text-terra-800" aria-hidden="true">1</span>
            <div>
              <label htmlFor="readiness-origin-area" className="block text-sm font-bold text-ink-900">Coarse planning area</label>
              <p className="text-xs leading-5 text-ink-600">Choose the general area you will travel from.</p>
            </div>
          </div>
          <div className="relative pl-8">
            <MapPin aria-hidden="true" className="pointer-events-none absolute left-11 top-3.5 h-4 w-4 text-terra-600" />
            <select
              id="readiness-origin-area"
              name="readinessOriginArea"
              value={selectedArea}
              onChange={(event) => handleAreaChange(event.target.value)}
              aria-invalid={Boolean(displayErrors.origin)}
              aria-describedby="readiness-origin-help readiness-origin-error"
              className="min-h-12 w-full appearance-none rounded-xl border border-cream-300 bg-cream-50 pl-10 pr-4 text-sm font-medium text-ink-900 focus:border-terra-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-terra-400"
            >
              {SINGAPORE_PLANNING_AREAS.map((area) => <option key={area.label} value={area.label}>{area.label}</option>)}
            </select>
            <p id="readiness-origin-help" className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-sage-700">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Companions see this general area only; precise travel origins stay private.
            </p>
            {displayErrors.origin ? <p id="readiness-origin-error" className="mt-1 flex items-start gap-1 text-xs font-medium text-berry-700" role="alert"><AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{displayErrors.origin}</p> : null}
          </div>
        </li>

        <li className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-terra-100 text-xs font-bold text-terra-800" aria-hidden="true">2</span>
            <div>
              <h5 className="text-sm font-bold text-ink-900">Availability</h5>
              <p className="text-xs leading-5 text-ink-600">Add at least one window within {plan.windowStart}–{plan.windowEnd}.</p>
            </div>
          </div>
          <div className="space-y-3 pl-8" aria-label="Availability windows">
            {windows.length === 0 ? <p className="rounded-xl border border-dashed border-cream-400 bg-cream-50 px-3 py-3 text-xs text-ink-600">No availability window added yet.</p> : null}
            {windows.map((window, index) => {
              const rowError = window.startTime && window.endTime && (
                parseMinutes(window.startTime) === null ||
                parseMinutes(window.endTime) === null ||
                parseMinutes(window.startTime)! >= parseMinutes(window.endTime)! ||
                (parseMinutes(window.startTime)! < (parseMinutes(plan.windowStart) ?? 0)) ||
                (parseMinutes(window.endTime)! > (parseMinutes(plan.windowEnd) ?? 1440))
              );
              const rowErrorId = `readiness-availability-error-${index}`;
              return (
                <div key={`${index}-${window.startTime}-${window.endTime}`} className="rounded-xl border border-cream-300 bg-cream-50 p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <div>
                      <label htmlFor={`readiness-start-${index}`} className="mb-1 block text-xs font-semibold text-ink-700">From</label>
                      <input
                        id={`readiness-start-${index}`}
                        type="time"
                        value={window.startTime}
                        min={plan.windowStart}
                        max={plan.windowEnd}
                        onChange={(event) => handleWindowChange(index, "startTime", event.target.value)}
                        aria-invalid={Boolean(displayErrors.availability && rowError)}
                        aria-describedby={rowError ? rowErrorId : undefined}
                        className="min-h-11 w-full rounded-lg border border-cream-300 bg-white px-3 text-sm text-ink-950 focus:border-terra-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-terra-400"
                      />
                    </div>
                    <div>
                      <label htmlFor={`readiness-end-${index}`} className="mb-1 block text-xs font-semibold text-ink-700">Until</label>
                      <input
                        id={`readiness-end-${index}`}
                        type="time"
                        value={window.endTime}
                        min={plan.windowStart}
                        max={plan.windowEnd}
                        onChange={(event) => handleWindowChange(index, "endTime", event.target.value)}
                        aria-invalid={Boolean(displayErrors.availability && rowError)}
                        aria-describedby={rowError ? rowErrorId : undefined}
                        className="min-h-11 w-full rounded-lg border border-cream-300 bg-white px-3 text-sm text-ink-950 focus:border-terra-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-terra-400"
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveWindow(index)} aria-label={`Remove availability window ${index + 1}`}>
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </div>
                  {rowError ? <p id={rowErrorId} className="mt-2 text-xs font-medium text-berry-700" role="alert">This window must start before it ends and stay within the plan window.</p> : null}
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={handleAddWindow}>
              <Plus aria-hidden="true" className="h-4 w-4" /> Add availability window
            </Button>
            {displayErrors.availability ? <p id="readiness-availability-error" className="flex items-start gap-1 text-xs font-medium text-berry-700" role="alert"><AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{displayErrors.availability}</p> : null}
          </div>
        </li>

        <li className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-terra-100 text-xs font-bold text-terra-800" aria-hidden="true">3</span>
            <div>
              <h5 className="text-sm font-bold text-ink-900">Dietary review</h5>
              <p className="text-xs leading-5 text-ink-600">Explicitly confirm that your rules and preferences are current.</p>
            </div>
          </div>
          <div className="pl-8">
            <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-cream-300 bg-cream-50 px-3 py-3 text-sm text-ink-800">
              <input
                type="checkbox"
                checked={dietaryDeclared}
                onChange={(event) => handleDietaryChange(event.target.checked)}
                aria-invalid={Boolean(displayErrors.dietary)}
                aria-describedby="readiness-dietary-error"
                className="mt-0.5 h-5 w-5 accent-terra-600"
              />
              <span>I have reviewed my dietary rules and preferences for this hangout.</span>
            </label>
            {displayErrors.dietary ? <p id="readiness-dietary-error" className="mt-1 flex items-start gap-1 text-xs font-medium text-berry-700" role="alert"><AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{displayErrors.dietary}</p> : null}
          </div>
        </li>
      </ol>

      {saveError ? <p className="mt-4 flex items-start gap-1.5 rounded-xl border border-berry-500/30 bg-berry-100 px-3 py-2 text-xs font-medium text-berry-800" role="alert"><AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{saveError}</p> : null}
      <div className="mt-5 border-t border-cream-300 pt-4">
        <Button
          type="button"
          variant={currentIsReady ? "outline" : "sage"}
          size="md"
          onClick={handleReady}
          isLoading={isSaving}
          disabled={!currentIsReady && hasDraftErrors}
          aria-pressed={currentIsReady}
          className="w-full text-sm font-bold sm:w-auto"
        >
          {currentIsReady ? "Mark me not ready" : "Mark me ready"}
        </Button>
        {!currentIsReady && hasDraftErrors ? <p className="mt-2 text-xs text-ink-600">Complete the highlighted items to enable Ready.</p> : null}
      </div>
    </Card>
  );
}
