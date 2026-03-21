/*
 * Centralizes visible pilot employment pricing so the market and later lifecycle actions stay on one economic truth.
 */

import type {
  PilotCertificationCode,
  PilotStatScore,
  PilotVisibleCertificationHoursEntry,
  PilotVisibleStatProfile,
} from "../../domain/staffing/types.js";

interface PilotEmploymentPricingInput {
  qualificationGroup: string;
  certifications: PilotCertificationCode[];
  totalCareerHours: number;
  primaryQualificationFamilyHours: number;
  certificationHours?: PilotVisibleCertificationHoursEntry[];
  statProfile: PilotVisibleStatProfile;
}

function roundToNearest(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

function directSalaryBase(qualificationGroup: string): number {
  switch (qualificationGroup) {
    case "single_turboprop_premium":
      return 11_000;
    case "twin_turboprop_utility":
      return 13_500;
    case "twin_turboprop_commuter":
      return 16_500;
    case "single_turboprop_utility":
    default:
      return qualificationGroup.includes("twin") ? 13_500 : 9_500;
  }
}

function contractHourlyBase(qualificationGroup: string): number {
  switch (qualificationGroup) {
    case "single_turboprop_premium":
      return 120;
    case "twin_turboprop_utility":
      return 145;
    case "twin_turboprop_commuter":
      return 170;
    case "single_turboprop_utility":
    default:
      return qualificationGroup.includes("twin") ? 145 : 105;
  }
}

function contractEngagementBase(qualificationGroup: string): number {
  switch (qualificationGroup) {
    case "single_turboprop_premium":
      return 3_000;
    case "twin_turboprop_utility":
      return 3_750;
    case "twin_turboprop_commuter":
      return 4_750;
    case "single_turboprop_utility":
    default:
      return qualificationGroup.includes("twin") ? 3_750 : 2_500;
  }
}

function clampPilotStatScore(score: PilotStatScore): number {
  return Math.max(0, Math.min(10, Math.round(score)));
}

function normalizeCertificationHours(entries: ReadonlyArray<PilotVisibleCertificationHoursEntry> | undefined): PilotVisibleCertificationHoursEntry[] {
  if (!entries) {
    return [];
  }

  return entries
    .filter((entry) =>
      typeof entry?.certificationCode === "string"
      && typeof entry?.hours === "number"
      && Number.isFinite(entry.hours)
      && entry.hours > 0)
    .map((entry) => ({
      certificationCode: entry.certificationCode,
      hours: Math.max(0, Math.round(entry.hours)),
    }));
}

function certificationTierWeight(certificationCode: PilotCertificationCode): number {
  switch (certificationCode) {
    case "JUMBO":
      return 4;
    case "JET":
      return 3;
    case "MEPL":
    case "MEPS":
      return 2;
    case "SEPL":
    case "SEPS":
    default:
      return 1;
  }
}

function certificationExperienceIndex(entries: ReadonlyArray<PilotVisibleCertificationHoursEntry> | undefined): number {
  return normalizeCertificationHours(entries).reduce((total, entry) =>
    total + Math.round(entry.hours / 250) * certificationTierWeight(entry.certificationCode), 0);
}

export function estimateDirectHireSalary(input: PilotEmploymentPricingInput): number {
  const statWeight = clampPilotStatScore(input.statProfile.operationalReliability)
    + clampPilotStatScore(input.statProfile.stressTolerance)
    + clampPilotStatScore(input.statProfile.procedureDiscipline)
    + clampPilotStatScore(input.statProfile.trainingAptitude);
  const hourPremium = Math.round(input.totalCareerHours / 450) * 125;
  const laneHourPremium = Math.round(input.primaryQualificationFamilyHours / 350) * 100;
  const certificationPremium = Math.max(input.certifications.length - 1, 0) * 250;
  const certificationExperiencePremium = certificationExperienceIndex(input.certificationHours) * 35;
  const statPremium = statWeight * 55;

  return roundToNearest(
    directSalaryBase(input.qualificationGroup)
      + hourPremium
      + laneHourPremium
      + certificationPremium
      + certificationExperiencePremium
      + statPremium,
    250,
  );
}

export function estimateContractHourlyRate(input: PilotEmploymentPricingInput): number {
  const statWeight = clampPilotStatScore(input.statProfile.operationalReliability)
    + clampPilotStatScore(input.statProfile.procedureDiscipline)
    + clampPilotStatScore(input.statProfile.stressTolerance);
  const experiencePremium = Math.round(input.totalCareerHours / 700) * 4;
  const laneExperiencePremium = Math.round(input.primaryQualificationFamilyHours / 550) * 3;
  const certificationPremium = Math.max(input.certifications.length - 1, 0) * 4;
  const certificationExperiencePremium = certificationExperienceIndex(input.certificationHours) * 0.9;

  return roundToNearest(
    contractHourlyBase(input.qualificationGroup)
      + experiencePremium
      + laneExperiencePremium
      + certificationPremium
      + certificationExperiencePremium
      + statWeight * 0.75,
    5,
  );
}

export function estimateContractEngagementFee(input: PilotEmploymentPricingInput): number {
  const statWeight = clampPilotStatScore(input.statProfile.operationalReliability)
    + clampPilotStatScore(input.statProfile.procedureDiscipline)
    + clampPilotStatScore(input.statProfile.trainingAptitude);
  const experiencePremium = Math.round(input.totalCareerHours / 800) * 150;
  const laneExperiencePremium = Math.round(input.primaryQualificationFamilyHours / 650) * 125;
  const certificationPremium = Math.max(input.certifications.length - 1, 0) * 225;
  const certificationExperiencePremium = certificationExperienceIndex(input.certificationHours) * 45;

  return roundToNearest(
    contractEngagementBase(input.qualificationGroup)
      + experiencePremium
      + laneExperiencePremium
      + certificationPremium
      + certificationExperiencePremium
      + statWeight * 35,
    250,
  );
}
