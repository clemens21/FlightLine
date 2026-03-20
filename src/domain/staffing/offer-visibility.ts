import type { JsonObject } from "../common/primitives.js";
import type { PilotStatBand, PilotVisibleProfile, PilotVisibleStatProfile, StaffingPricingExplanation } from "./types.js";

export interface StaffingOfferVisibility {
  candidateProfileId: string | undefined;
  candidateProfile: PilotVisibleProfile | undefined;
  pricingExplanation: StaffingPricingExplanation | undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asJsonObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as JsonObject;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isPilotStatBand(value: string | undefined): value is PilotStatBand {
  return value === "developing"
    || value === "solid"
    || value === "strong"
    || value === "exceptional";
}

function parsePilotVisibleStatProfile(rawValue: unknown): PilotVisibleStatProfile | undefined {
  const rawProfile = asJsonObject(rawValue);
  if (!rawProfile) {
    return undefined;
  }

  const operationalReliability = asString(rawProfile.operationalReliability);
  const stressTolerance = asString(rawProfile.stressTolerance);
  const procedureDiscipline = asString(rawProfile.procedureDiscipline);
  const trainingAptitude = asString(rawProfile.trainingAptitude);

  if (
    !isPilotStatBand(operationalReliability)
    || !isPilotStatBand(stressTolerance)
    || !isPilotStatBand(procedureDiscipline)
    || !isPilotStatBand(trainingAptitude)
  ) {
    return undefined;
  }

  return {
    operationalReliability,
    stressTolerance,
    procedureDiscipline,
    trainingAptitude,
  };
}

function parsePilotVisibleProfile(rawValue: unknown): PilotVisibleProfile | undefined {
  const rawProfile = asJsonObject(rawValue);
  if (!rawProfile) {
    return undefined;
  }

  const candidateProfileId = asString(rawProfile.candidateProfileId);
  const qualificationLane = asString(rawProfile.qualificationLane);
  const totalCareerHours = asFiniteNumber(rawProfile.totalCareerHours);
  const primaryQualificationFamilyHours = asFiniteNumber(rawProfile.primaryQualificationFamilyHours);
  const companyHours = asFiniteNumber(rawProfile.companyHours);
  const statProfile = parsePilotVisibleStatProfile(rawProfile.statProfile);

  if (
    !candidateProfileId
    || !qualificationLane
    || totalCareerHours === undefined
    || primaryQualificationFamilyHours === undefined
    || companyHours === undefined
    || !statProfile
  ) {
    return undefined;
  }

  return {
    candidateProfileId,
    qualificationLane,
    totalCareerHours,
    primaryQualificationFamilyHours,
    companyHours,
    statProfile,
  };
}

function parseStaffingPricingExplanation(rawValue: unknown): StaffingPricingExplanation | undefined {
  const rawExplanation = asJsonObject(rawValue);
  if (!rawExplanation) {
    return undefined;
  }

  const summary = asString(rawExplanation.summary);
  const drivers = asStringArray(rawExplanation.drivers);

  if (!summary || drivers.length === 0) {
    return undefined;
  }

  return {
    summary,
    drivers,
  };
}

export function parseStaffingOfferVisibility(explanationMetadata: JsonObject | undefined): StaffingOfferVisibility {
  const candidateProfile = parsePilotVisibleProfile(explanationMetadata?.candidateProfile);
  const pricingExplanation = parseStaffingPricingExplanation(explanationMetadata?.pricingExplanation);

  return {
    candidateProfileId: candidateProfile?.candidateProfileId ?? asString(explanationMetadata?.candidateProfileId),
    candidateProfile,
    pricingExplanation,
  };
}
