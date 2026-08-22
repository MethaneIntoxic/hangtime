import { DietaryRule, DietarySuitabilityInfo } from "@/types";

export interface VenueDietaryAttributes {
  isHalalCertified?: boolean;
  isMuslimOwned?: boolean;
  hasVegetarianOptions?: boolean;
  hasVeganOptions?: boolean;
  hasGlutenFreeOptions?: boolean;
  hasNutFreeOptions?: boolean;
  hasDairyFreeOptions?: boolean;
  hasShellfishFreeOptions?: boolean;
  isPorkFree?: boolean;
  isBeefFree?: boolean;
}

export const DIETARY_LABELS: Record<string, { label: string; icon: string }> = {
  halal: { label: "Halal / Muslim-Friendly", icon: "Moon" },
  vegetarian: { label: "Vegetarian", icon: "Leaf" },
  vegan: { label: "Vegan", icon: "Sprout" },
  gluten_free: { label: "Gluten-Free", icon: "WheatOff" },
  nut_allergy: { label: "Nut Allergy / Nut-Free", icon: "ShieldAlert" },
  dairy_free: { label: "Dairy-Free", icon: "MilkOff" },
  shellfish: { label: "Shellfish Allergy", icon: "FishOff" },
  pork_free: { label: "No Pork / No Lard", icon: "Ban" },
  beef_free: { label: "No Beef", icon: "Ban" },
};

export function evaluateDietarySuitability(
  rules: DietaryRule[],
  venueAttrs: VenueDietaryAttributes
): {
  isCompatible: boolean;
  isCaution: boolean;
  suitabilityList: DietarySuitabilityInfo[];
  bindingConstraint?: string;
} {
  const suitabilityList: DietarySuitabilityInfo[] = [];
  let isCompatible = true;
  let isCaution = false;
  let bindingConstraint: string | undefined;

  const markUnverified = (
    rule: DietaryRule,
    label: string,
    ruleCode: string,
    note: string
  ) => {
    const isStrict = rule.severity === "allergy" || rule.severity === "hard";
    isCaution = true;
    if (isStrict) {
      isCompatible = false;
      bindingConstraint ||= label;
    }
    suitabilityList.push({
      ruleCode,
      status: isStrict ? "incompatible" : "caution",
      note,
    });
  };

  for (const rule of rules) {
    const info = DIETARY_LABELS[rule.ruleCode] || { label: rule.ruleCode };

    switch (rule.ruleCode) {
      case "halal": {
        if (venueAttrs.isHalalCertified || venueAttrs.isMuslimOwned) {
          suitabilityList.push({
            ruleCode: "halal",
            status: "verified",
            note: "Reported halal-certified or Muslim-owned — confirm directly with the venue.",
          });
        } else if (venueAttrs.isPorkFree) {
          isCaution = true;
          suitabilityList.push({
            ruleCode: "halal",
            status: "caution",
            note: "Pork-free kitchen, but not certified halal.",
          });
        } else {
          if (rule.severity === "allergy" || rule.severity === "hard") {
            isCompatible = false;
            bindingConstraint = "Halal dietary requirement";
          }
          suitabilityList.push({
            ruleCode: "halal",
            status: "incompatible",
            note: "Not reported halal-suitable.",
          });
        }
        break;
      }
      case "vegetarian": {
        if (venueAttrs.hasVegetarianOptions) {
          suitabilityList.push({
            ruleCode: "vegetarian",
            status: "reported_compatible",
            note: "Vegetarian options reported available — verify menu with venue.",
          });
        } else {
          if (rule.severity === "allergy" || rule.severity === "hard") {
            isCompatible = false;
            bindingConstraint = "Vegetarian requirement";
          }
          suitabilityList.push({
            ruleCode: "vegetarian",
            status: "incompatible",
            note: "Limited or unverified vegetarian options.",
          });
        }
        break;
      }
      case "vegan": {
        if (venueAttrs.hasVeganOptions) {
          suitabilityList.push({
            ruleCode: "vegan",
            status: "reported_compatible",
            note: "Plant-based/vegan options reported available.",
          });
        } else {
          if (rule.severity === "allergy" || rule.severity === "hard") {
            isCompatible = false;
            bindingConstraint = "Vegan requirement";
          }
          suitabilityList.push({
            ruleCode: "vegan",
            status: "incompatible",
            note: "Unverified vegan options.",
          });
        }
        break;
      }
      case "gluten_free": {
        if (venueAttrs.hasGlutenFreeOptions) {
          suitabilityList.push({
            ruleCode: "gluten_free",
            status: "reported_compatible",
            note: "Gluten-free friendly options reported — not a dedicated GF kitchen.",
          });
        } else {
          markUnverified(
            rule,
            "Gluten-free requirement",
            "gluten_free",
            "Gluten-free suitability is unverified; cross-contact may be possible."
          );
        }
        break;
      }
      case "nut_allergy": {
        if (venueAttrs.hasNutFreeOptions) {
          suitabilityList.push({
            ruleCode: "nut_allergy",
            status: "reported_compatible",
            note: "Nut-aware kitchen — inform server upon arrival.",
          });
        } else {
          markUnverified(
            rule,
            "Nut allergy requirement",
            "nut_allergy",
            "Nut handling is unverified; the venue may use tree nuts or peanuts."
          );
        }
        break;
      }
      case "dairy_free": {
        if (venueAttrs.hasDairyFreeOptions) {
          suitabilityList.push({
            ruleCode: "dairy_free",
            status: "reported_compatible",
            note: "Dairy-free options are reported — confirm ingredients with the venue.",
          });
        } else {
          markUnverified(
            rule,
            "Dairy-free requirement",
            "dairy_free",
            "Dairy-free preparation is unverified."
          );
        }
        break;
      }
      case "shellfish": {
        if (venueAttrs.hasShellfishFreeOptions) {
          suitabilityList.push({
            ruleCode: "shellfish",
            status: "reported_compatible",
            note: "Shellfish-aware options are reported — confirm cross-contact controls directly.",
          });
        } else {
          markUnverified(
            rule,
            "Shellfish allergy requirement",
            "shellfish",
            "Shellfish handling and cross-contact controls are unverified."
          );
        }
        break;
      }
      case "pork_free": {
        if (venueAttrs.isPorkFree || venueAttrs.isHalalCertified) {
          suitabilityList.push({
            ruleCode: "pork_free",
            status: "reported_compatible",
            note: "No pork / no lard used in recipes.",
          });
        } else {
          if (rule.severity === "allergy" || rule.severity === "hard") {
            isCompatible = false;
            bindingConstraint = "No pork requirement";
          }
          suitabilityList.push({
            ruleCode: "pork_free",
            status: "incompatible",
            note: "Pork dishes present on menu.",
          });
        }
        break;
      }
      case "beef_free": {
        if (venueAttrs.isBeefFree) {
          suitabilityList.push({
            ruleCode: "beef_free",
            status: "reported_compatible",
            note: "No beef is reported in the venue offering — verify with the venue.",
          });
        } else {
          markUnverified(
            rule,
            "No beef requirement",
            "beef_free",
            "Beef-free preparation is unverified."
          );
        }
        break;
      }
      default: {
        markUnverified(
          rule,
          `${info.label} requirement`,
          rule.ruleCode,
          `${info.label} suitability is not covered by current venue data.`
        );
      }
    }
  }

  return { isCompatible, isCaution, suitabilityList, bindingConstraint };
}
