import type { DifficultyProfile } from "./types.js";

export type LegacyDifficultyProfile = "relaxed" | "standard" | "challenging";
export type PersistedDifficultyProfile = DifficultyProfile | LegacyDifficultyProfile;

export interface DifficultyProfileOption {
  profile: DifficultyProfile;
  label: string;
  startingCashAmount: number;
  aircraftPriceMultiplier: number;
  staffingPriceMultiplier: number;
  includesStarterAircraft: boolean;
  includesStarterPilot: boolean;
  summary: string;
}

const difficultyProfileOptionsInternal = [
  {
    profile: "easy",
    label: "Easy",
    startingCashAmount: 4_500_000,
    aircraftPriceMultiplier: 0.9,
    staffingPriceMultiplier: 0.9,
    includesStarterAircraft: true,
    includesStarterPilot: true,
    summary: "Free starter Caravan cargo aircraft and utility pilot, plus 10% lower aircraft and staffing prices.",
  },
  {
    profile: "medium",
    label: "Medium",
    startingCashAmount: 4_000_000,
    aircraftPriceMultiplier: 0.95,
    staffingPriceMultiplier: 0.95,
    includesStarterAircraft: false,
    includesStarterPilot: false,
    summary: "No free starter crew or aircraft, but aircraft and staffing prices stay 5% lower.",
  },
  {
    profile: "hard",
    label: "Hard",
    startingCashAmount: 3_500_000,
    aircraftPriceMultiplier: 1,
    staffingPriceMultiplier: 1,
    includesStarterAircraft: false,
    includesStarterPilot: false,
    summary: "Matches the current baseline economy with no startup grants or ongoing discounts.",
  },
] as const satisfies readonly DifficultyProfileOption[];

const difficultyProfileOptionsByProfile = new Map(
  difficultyProfileOptionsInternal.map((option) => [option.profile, option] satisfies readonly [DifficultyProfile, DifficultyProfileOption]),
);

export const difficultyProfileOptions: readonly DifficultyProfileOption[] = difficultyProfileOptionsInternal;

export function isRecognizedDifficultyProfile(value: string | null | undefined): boolean {
  switch ((value ?? "").trim().toLowerCase()) {
    case "easy":
    case "medium":
    case "hard":
    case "relaxed":
    case "standard":
    case "challenging":
      return true;
    default:
      return false;
  }
}

export function normalizeDifficultyProfile(value: string | null | undefined): DifficultyProfile {
  switch ((value ?? "").trim().toLowerCase()) {
    case "easy":
    case "relaxed":
      return "easy";
    case "medium":
      return "medium";
    case "hard":
    case "standard":
    case "challenging":
    default:
      return "hard";
  }
}

export function getDifficultyProfileOption(profile: DifficultyProfile): DifficultyProfileOption {
  return difficultyProfileOptionsByProfile.get(profile) ?? difficultyProfileOptionsByProfile.get("hard")!;
}

export function startingCashAmountForDifficulty(profile: DifficultyProfile): number {
  return getDifficultyProfileOption(profile).startingCashAmount;
}

export function aircraftPriceMultiplierForDifficulty(profile: DifficultyProfile): number {
  return getDifficultyProfileOption(profile).aircraftPriceMultiplier;
}

export function staffingPriceMultiplierForDifficulty(profile: DifficultyProfile): number {
  return getDifficultyProfileOption(profile).staffingPriceMultiplier;
}
