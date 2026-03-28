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
  marketSeed?: string;
}

function roundToNearest(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

function hashString(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }

  return Math.abs(hash);
}

function marketRateMultiplier(
  seedBase: string | undefined,
  channel: "direct" | "hourly" | "fee",
): number {
  if (!seedBase) {
    return 1;
  }

  const spreadByChannel = {
    direct: { maxSteps: 6, stepPercent: 0.0225 },
    hourly: { maxSteps: 7, stepPercent: 0.02 },
    fee: { maxSteps: 7, stepPercent: 0.025 },
  } satisfies Record<"direct" | "hourly" | "fee", { maxSteps: number; stepPercent: number }>;

  const spread = spreadByChannel[channel];
  const totalBuckets = (spread.maxSteps * 2) + 1;
  const signedSteps = (hashString(`${seedBase}:${channel}:market-band`) % totalBuckets) - spread.maxSteps;
  return 1 + (signedSteps * spread.stepPercent);
}

// Calibrated to current U.S. pay anchors:
// smaller-aircraft work near recent BLS commercial-pilot medians,
// regional airline work near current official regional pay scales,
// and long-haul airline work near current major-airline widebody pay ranges.
function directSalaryBase(qualificationGroup: string): number {
  switch (qualificationGroup) {
    case "single_turboprop_premium":
      return 10_500;
    case "regional_turboprop":
      return 11_750;
    case "twin_turboprop_utility":
      return 11_250;
    case "twin_turboprop_commuter":
      return 13_250;
    case "light_business_jet":
      return 15_500;
    case "super_midsize_business_jet":
      return 18_500;
    case "classic_regional_jet":
      return 16_000;
    case "regional_jet":
      return 17_750;
    case "narrowbody_airline":
      return 23_500;
    case "widebody_airline":
      return 30_500;
    case "single_turboprop_utility":
    default:
      if (qualificationGroup.includes("widebody") || qualificationGroup.includes("jumbo")) {
        return 30_500;
      }

      if (qualificationGroup.includes("jet")) {
        return 16_000;
      }

      if (qualificationGroup.includes("regional_turboprop")) {
        return 11_750;
      }

      if (qualificationGroup.includes("twin")) {
        return 11_250;
      }

      return 9_000;
  }
}

function contractHourlyBase(qualificationGroup: string): number {
  switch (qualificationGroup) {
    case "single_turboprop_premium":
      return 115;
    case "regional_turboprop":
      return 130;
    case "twin_turboprop_utility":
      return 125;
    case "twin_turboprop_commuter":
      return 145;
    case "light_business_jet":
      return 165;
    case "super_midsize_business_jet":
      return 190;
    case "classic_regional_jet":
      return 175;
    case "regional_jet":
      return 195;
    case "narrowbody_airline":
      return 255;
    case "widebody_airline":
      return 335;
    case "single_turboprop_utility":
    default:
      if (qualificationGroup.includes("widebody") || qualificationGroup.includes("jumbo")) {
        return 335;
      }

      if (qualificationGroup.includes("jet")) {
        return 175;
      }

      if (qualificationGroup.includes("regional_turboprop")) {
        return 130;
      }

      if (qualificationGroup.includes("twin")) {
        return 125;
      }

      return 105;
  }
}

function contractEngagementBase(qualificationGroup: string): number {
  switch (qualificationGroup) {
    case "single_turboprop_premium":
      return 3_250;
    case "regional_turboprop":
      return 4_000;
    case "twin_turboprop_utility":
      return 3_750;
    case "twin_turboprop_commuter":
      return 4_750;
    case "light_business_jet":
      return 5_500;
    case "super_midsize_business_jet":
      return 6_750;
    case "classic_regional_jet":
      return 5_750;
    case "regional_jet":
      return 6_500;
    case "narrowbody_airline":
      return 8_500;
    case "widebody_airline":
      return 11_500;
    case "single_turboprop_utility":
    default:
      if (qualificationGroup.includes("widebody") || qualificationGroup.includes("jumbo")) {
        return 11_500;
      }

      if (qualificationGroup.includes("jet")) {
        return 5_750;
      }

      if (qualificationGroup.includes("regional_turboprop")) {
        return 4_000;
      }

      if (qualificationGroup.includes("twin")) {
        return 3_750;
      }

      return 3_000;
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
  const hourPremium = Math.round(input.totalCareerHours / 325) * 150;
  const laneHourPremium = Math.round(input.primaryQualificationFamilyHours / 240) * 125;
  const certificationPremium = Math.max(input.certifications.length - 1, 0) * 350;
  const certificationExperiencePremium = certificationExperienceIndex(input.certificationHours) * 50;
  const statPremium = statWeight * 72;

  const salaryBeforeMarketTension = directSalaryBase(input.qualificationGroup)
    + hourPremium
    + laneHourPremium
    + certificationPremium
    + certificationExperiencePremium
    + statPremium;

  return roundToNearest(salaryBeforeMarketTension * marketRateMultiplier(input.marketSeed, "direct"), 250);
}

export function estimateContractHourlyRate(input: PilotEmploymentPricingInput): number {
  const statWeight = clampPilotStatScore(input.statProfile.operationalReliability)
    + clampPilotStatScore(input.statProfile.procedureDiscipline)
    + clampPilotStatScore(input.statProfile.stressTolerance);
  const experiencePremium = Math.round(input.totalCareerHours / 850) * 4;
  const laneExperiencePremium = Math.round(input.primaryQualificationFamilyHours / 650) * 3;
  const certificationPremium = Math.max(input.certifications.length - 1, 0) * 4;
  const certificationExperiencePremium = certificationExperienceIndex(input.certificationHours) * 0.85;

  const hourlyRateBeforeMarketTension = contractHourlyBase(input.qualificationGroup)
    + experiencePremium
    + laneExperiencePremium
    + certificationPremium
    + certificationExperiencePremium
    + statWeight * 0.8;

  return roundToNearest(hourlyRateBeforeMarketTension * marketRateMultiplier(input.marketSeed, "hourly"), 5);
}

export function estimateContractEngagementFee(input: PilotEmploymentPricingInput): number {
  const statWeight = clampPilotStatScore(input.statProfile.operationalReliability)
    + clampPilotStatScore(input.statProfile.procedureDiscipline)
    + clampPilotStatScore(input.statProfile.trainingAptitude);
  const experiencePremium = Math.round(input.totalCareerHours / 900) * 175;
  const laneExperiencePremium = Math.round(input.primaryQualificationFamilyHours / 700) * 125;
  const certificationPremium = Math.max(input.certifications.length - 1, 0) * 250;
  const certificationExperiencePremium = certificationExperienceIndex(input.certificationHours) * 42;

  const engagementFeeBeforeMarketTension = contractEngagementBase(input.qualificationGroup)
    + experiencePremium
    + laneExperiencePremium
    + certificationPremium
    + certificationExperiencePremium
    + statWeight * 36;

  return roundToNearest(engagementFeeBeforeMarketTension * marketRateMultiplier(input.marketSeed, "fee"), 250);
}
