type CanonicalValue = string | number | null;

export interface AvailabilityWindowInputLike {
  startTime: string;
  endTime: string;
  source: string;
}

export interface DietaryRuleInputLike {
  ruleCode: string;
  severity: string;
  note?: string | null;
}

export interface CuisinePreferenceInputLike {
  cuisineCode: string;
  weight: number;
}

function compareTuples(left: readonly CanonicalValue[], right: readonly CanonicalValue[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === rightValue) continue;
    if (leftValue === null) return -1;
    if (rightValue === null) return 1;
    return leftValue < rightValue ? -1 : 1;
  }
  return 0;
}

export function canonicalizeAvailabilityWindows(
  windows: readonly AvailabilityWindowInputLike[],
): string {
  return JSON.stringify(
    windows
      .map(({ startTime, endTime, source }) => ({ startTime, endTime, source }))
      .sort((left, right) => compareTuples(
        [left.startTime, left.endTime, left.source],
        [right.startTime, right.endTime, right.source],
      )),
  );
}

export function canonicalizeDietaryRules(
  rules: readonly DietaryRuleInputLike[],
): string {
  return JSON.stringify(
    rules
      .map(({ ruleCode, severity, note }) => ({
        ruleCode,
        severity,
        note: note || null,
      }))
      .sort((left, right) => compareTuples(
        [left.ruleCode, left.severity, left.note],
        [right.ruleCode, right.severity, right.note],
      )),
  );
}

export function canonicalizeCuisinePreferences(
  preferences: readonly CuisinePreferenceInputLike[],
): string {
  return JSON.stringify(
    preferences
      .map(({ cuisineCode, weight }) => ({ cuisineCode, weight }))
      .sort((left, right) => compareTuples(
        [left.cuisineCode, left.weight],
        [right.cuisineCode, right.weight],
      )),
  );
}

export function sameAvailabilityWindows(
  left: readonly AvailabilityWindowInputLike[],
  right: readonly AvailabilityWindowInputLike[],
): boolean {
  return canonicalizeAvailabilityWindows(left) === canonicalizeAvailabilityWindows(right);
}

export function sameDietaryRules(
  left: readonly DietaryRuleInputLike[],
  right: readonly DietaryRuleInputLike[],
): boolean {
  return canonicalizeDietaryRules(left) === canonicalizeDietaryRules(right);
}

export function sameCuisinePreferences(
  left: readonly CuisinePreferenceInputLike[],
  right: readonly CuisinePreferenceInputLike[],
): boolean {
  return canonicalizeCuisinePreferences(left) === canonicalizeCuisinePreferences(right);
}
