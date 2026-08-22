"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/nav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  MapPin,
  ShieldCheck,
  Sparkles,
  Plus,
  Trash2,
  Check,
} from "lucide-react";
import { SINGAPORE_PLANNING_AREAS } from "@/providers/singapore-transit";
import { DIETARY_LABELS } from "@/domain/dietary/rules";

const ALL_CUISINES = [
  { code: "japanese", label: "Japanese (Sushi, Ramen, Izakaya)", icon: "🍱" },
  { code: "italian", label: "Italian (Handmade Pasta, Pizza)", icon: "🍝" },
  { code: "halal", label: "Halal / Muslim-Friendly Bistros", icon: "🌙" },
  { code: "local_sg", label: "Local SG & Peranakan Heritage", icon: "🍛" },
  { code: "mexican", label: "Mexican (Tacos & Agave)", icon: "🌮" },
  { code: "middle_eastern", label: "Middle Eastern & Kebabs", icon: "🧆" },
  { code: "cafe", label: "Specialty Cafe & Brunch", icon: "☕" },
  { code: "french", label: "French Bistro & Wine", icon: "🥐" },
  { code: "asian", label: "Modern Asian & Dim Sum", icon: "🥟" },
];

export default function ProfilePage() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<{ displayName: string; email: string; coarseArea: string } | null>(null);
  const [dietaryRules, setDietaryRules] = useState<{ id?: string; ruleCode: string; severity: "allergy" | "hard" | "preference"; note?: string }[]>([]);
  const [cuisinePreferences, setCuisinePreferences] = useState<{ cuisineCode: string; weight: number }[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // New Dietary Rule form state
  const [newRuleCode, setNewRuleCode] = useState("nut_allergy");
  const [newRuleSeverity, setNewRuleSeverity] = useState<"allergy" | "hard" | "preference">("allergy");
  const [newRuleNote, setNewRuleNote] = useState("");

  useEffect(() => {
    fetch("/api/v1/me")
      .then((r) => r.json())
      .then((data) => {
        if (data?.data) {
          setProfile(data.data.profile);
          setDietaryRules(data.data.dietaryRules || []);
          setCuisinePreferences(data.data.cuisinePreferences || []);
        }
      })
      .catch(() => {});
  }, []);

  const handleAddDietaryRule = () => {
    if (dietaryRules.some((r) => r.ruleCode === newRuleCode)) {
      toast("This dietary rule is already added.", "info");
      return;
    }
    setDietaryRules([
      ...dietaryRules,
      {
        ruleCode: newRuleCode,
        severity: newRuleSeverity,
        note: newRuleNote || undefined,
      },
    ]);
    setNewRuleNote("");
    toast("Added dietary rule! Remember to save changes.", "success");
  };

  const handleRemoveDietaryRule = (code: string) => {
    setDietaryRules(dietaryRules.filter((r) => r.ruleCode !== code));
  };

  const handleCuisineWeightChange = (code: string, weight: number) => {
    const existing = cuisinePreferences.find((c) => c.cuisineCode === code);
    if (existing) {
      setCuisinePreferences(
        cuisinePreferences.map((c) => (c.cuisineCode === code ? { ...c, weight } : c))
      );
    } else {
      setCuisinePreferences([...cuisinePreferences, { cuisineCode: code, weight }]);
    }
  };

  const getWeight = (code: string) => {
    return cuisinePreferences.find((c) => c.cuisineCode === code)?.weight ?? 0;
  };

  const handleSaveAll = async () => {
    if (!profile) return;
    setIsSaving(true);

    try {
      const res = await fetch("/api/v1/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: profile.displayName,
          coarseArea: profile.coarseArea,
          dietaryRules,
          cuisinePreferences,
        }),
      });

      if (res.ok) {
        toast("Profile and preferences saved successfully! ✨", "success");
      } else {
        toast("Failed to save profile", "error");
      }
    } catch {
      toast("Error saving preferences", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="min-h-dvh bg-cream-50">
        <Header />
        <div className="py-24 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-terra-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-cream-50 pb-28">
      <Header />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 space-y-6 animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink-950">
              Profile & Preferences
            </h1>
            <p className="text-xs text-ink-500 font-medium mt-0.5">
              Reusable food preferences, planning area, and dietary safety rules.
            </p>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveAll}
            isLoading={isSaving}
            className="text-xs font-bold shadow-soft"
          >
            <Check className="h-4 w-4" />
            <span>Save Changes</span>
          </Button>
        </div>

        {/* User Identity & Singapore Area */}
        <Card variant="elevated" className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-cream-300 bg-amber-100 text-sm font-extrabold text-ink-900 shadow-soft"
            >
              {profile.displayName
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div className="space-y-1 flex-1">
              <input
                type="text"
                value={profile.displayName}
                onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                className="font-display text-base font-bold text-ink-950 bg-cream-50 px-2 py-1 rounded-lg border border-cream-300 focus:border-terra-500 focus:outline-none w-full"
              />
              <p className="text-xs text-ink-500 px-2">{profile.email}</p>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-cream-200">
            <label className="text-xs font-bold text-ink-800 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-terra-600" />
              Default Singapore Planning Area
            </label>
            <select
              value={profile.coarseArea}
              onChange={(e) => setProfile({ ...profile, coarseArea: e.target.value })}
              className="w-full rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-xs font-medium text-ink-900 focus:border-terra-500 focus:outline-none"
            >
              {SINGAPORE_PLANNING_AREAS.map((a) => (
                <option key={a.label} value={a.label}>
                  {a.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-400 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-sage-600" />
              Used for transit calculations. Never exposed as exact coordinates.
            </p>
          </div>
        </Card>

        {/* Dietary Restrictions Manager */}
        <Card variant="elevated" className="p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-cream-200 pb-2">
            <div>
              <h2 className="font-display text-sm font-bold text-ink-900 uppercase tracking-wider">
                Dietary Rules & Allergies ({dietaryRules.length})
              </h2>
              <p className="text-[11px] text-ink-500">
                Hard filters will strictly exclude incompatible restaurants.
              </p>
            </div>
          </div>

          {/* Current Rules List */}
          <div className="space-y-2">
            {dietaryRules.length === 0 ? (
              <p className="text-xs text-ink-400 italic py-2">
                No dietary restrictions configured (open to all menus).
              </p>
            ) : (
              dietaryRules.map((rule) => {
                const info = DIETARY_LABELS[rule.ruleCode] || { label: rule.ruleCode };
                return (
                  <div
                    key={rule.ruleCode}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-amber-100/40 border border-amber-200/80 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-ink-950">{info.label}</span>
                        <Badge
                          variant={rule.severity === "allergy" ? "berry" : rule.severity === "hard" ? "amber" : "neutral"}
                          size="sm"
                        >
                          {rule.severity}
                        </Badge>
                      </div>
                      {rule.note && (
                        <p className="text-[10px] text-ink-500 mt-0.5">{rule.note}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveDietaryRule(rule.ruleCode)}
                      className="p-1 text-ink-400 hover:text-berry-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Add Dietary Rule Form */}
          <div className="p-3 rounded-2xl bg-cream-100/60 border border-cream-200 space-y-2 text-xs">
            <span className="font-bold text-ink-800 block">Add Dietary Restriction:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={newRuleCode}
                onChange={(e) => setNewRuleCode(e.target.value)}
                className="rounded-xl border border-cream-300 bg-cream-50 px-2.5 py-1.5 text-xs text-ink-900"
              >
                {Object.entries(DIETARY_LABELS).map(([code, meta]) => (
                  <option key={code} value={code}>
                    {meta.label}
                  </option>
                ))}
              </select>

              <select
                value={newRuleSeverity}
                onChange={(e) => setNewRuleSeverity(e.target.value as "allergy" | "hard" | "preference")}
                className="rounded-xl border border-cream-300 bg-cream-50 px-2.5 py-1.5 text-xs text-ink-900"
              >
                <option value="allergy">Allergy (Strict safety check)</option>
                <option value="hard">Hard Restriction (e.g. Halal)</option>
                <option value="preference">Dietary Preference</option>
              </select>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newRuleNote}
                onChange={(e) => setNewRuleNote(e.target.value)}
                placeholder="Optional note e.g. severe reaction"
                className="flex-1 rounded-xl border border-cream-300 bg-cream-50 px-3 py-1.5 text-xs text-ink-900"
              />
              <Button variant="outline" size="sm" onClick={handleAddDietaryRule} className="text-xs">
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* Cuisine Preferences Manager */}
        <Card variant="elevated" className="p-5 space-y-4">
          <div className="border-b border-cream-200 pb-2">
            <h2 className="font-display text-sm font-bold text-ink-900 uppercase tracking-wider">
              Cuisine Weights (-2 to +2)
            </h2>
            <p className="text-[11px] text-ink-500">
              Helps our recommendation algorithm find the best culinary overlap for group plans.
            </p>
          </div>

          <div className="space-y-3">
            {ALL_CUISINES.map((cuisine) => {
              const weight = getWeight(cuisine.code);

              return (
                <div
                  key={cuisine.code}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-2xl bg-cream-100/50 border border-cream-200 gap-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cuisine.icon}</span>
                    <span className="font-bold text-ink-900">{cuisine.label}</span>
                  </div>

                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    {[-2, -1, 0, 1, 2].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleCuisineWeightChange(cuisine.code, val)}
                        className={`h-7 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          weight === val
                            ? val > 0
                              ? "bg-terra-500 text-white shadow-soft"
                              : val < 0
                              ? "bg-ink-700 text-white shadow-soft"
                              : "bg-cream-300 text-ink-900 shadow-soft"
                            : "bg-cream-50 text-ink-600 hover:bg-cream-200 border border-cream-200"
                        }`}
                      >
                        {val === 2
                          ? "❤️ Love"
                          : val === 1
                          ? "👍 Like"
                          : val === 0
                          ? "Neutral"
                          : val === -1
                          ? "Dislike"
                          : "🚫 Avoid"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Save Button */}
        <Button
          variant="primary"
          size="lg"
          onClick={handleSaveAll}
          isLoading={isSaving}
          className="w-full text-base font-bold shadow-lift"
        >
          <Sparkles className="h-5 w-5" />
          <span>Save Profile & Preferences</span>
        </Button>
      </main>

      <BottomNav />
    </div>
  );
}
