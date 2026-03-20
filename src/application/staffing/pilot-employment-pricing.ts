/*
 * Centralizes visible pilot employment pricing so the market and later lifecycle actions stay on one economic truth.
 */

import type {
  PilotCertificationCode,
  PilotStatBand,
  PilotVisibleStatProfile,
} from "../../domain/staffing/types.js";

interface PilotEmploymentPricingInput {
  qualificationGroup: string;
  certifications: PilotCertificationCode[];
  totalCareerHours: number;
  primaryQualificationFamilyHours: number;
  statProfile: PilotVisibleStatProfile;
}

const STAT_BAND_VALUES: readonly PilotStatBand[] = [
  "developing",
  "solid",
  "strong",
  "exceptional",
] as const;

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

function statBandWeight(statBand: PilotStatBand): number {
  return STAT_BAND_VALUES.indexOf(statBand);
}

export function estimateDirectHireSalary(input: PilotEmploymentPricingInput): number {
  const statWeight = statBandWeight(input.statProfile.operationalReliability)
    + statBandWeight(input.statProfile.stressTolerance)
    + statBandWeight(input.statProfile.procedureDiscipline)
    + statBandWeight(input.statProfile.trainingAptitude);
  const hourPremium = Math.round(input.totalCareerHours / 450) * 125;
  const laneHourPremium = Math.round(input.primaryQualificationFamilyHours / 350) * 100;
  const certificationPremium = Math.max(input.certifications.length - 1, 0) * 300;
  const statPremium = statWeight * 175;

  return roundToNearest(
    directSalaryBase(input.qualificationGroup)
      + hourPremium
      + laneHourPremium
      + certificationPremium
      + statPremium,
    250,
  );
}

export function estimateContractHourlyRate(input: PilotEmploymentPricingInput): number {
  const statWeight = statBandWeight(input.statProfile.operationalReliability)
    + statBandWeight(input.statProfile.procedureDiscipline)
    + statBandWeight(input.statProfile.stressTolerance);
  const experiencePremium = Math.round(input.totalCareerHours / 700) * 4;
  const laneExperiencePremium = Math.round(input.primaryQualificationFamilyHours / 550) * 3;

  return roundToNearest(
    contractHourlyBase(input.qualificationGroup)
      + experiencePremium
      + laneExperiencePremium
      + statWeight * 2,
    5,
  );
}

export function estimateContractEngagementFee(input: PilotEmploymentPricingInput): number {
  const statWeight = statBandWeight(input.statProfile.operationalReliability)
    + statBandWeight(input.statProfile.procedureDiscipline)
    + statBandWeight(input.statProfile.trainingAptitude);
  const experiencePremium = Math.round(input.totalCareerHours / 800) * 150;
  const laneExperiencePremium = Math.round(input.primaryQualificationFamilyHours / 650) * 125;

  return roundToNearest(
    contractEngagementBase(input.qualificationGroup)
      + experiencePremium
      + laneExperiencePremium
      + statWeight * 110,
    250,
  );
}
