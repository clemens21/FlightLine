/*
 * Defines the first-pass named-pilot certification vocabulary and the mapping between
 * legacy pilot qualification groups and player-facing certification ownership.
 */

import type { PilotCertificationCode } from "./types.js";

const CERTIFICATION_ORDER: Record<PilotCertificationCode, number> = {
  SEPL: 1,
  SEPS: 2,
  MEPL: 3,
  MEPS: 4,
  JET: 5,
  JUMBO: 6,
};

const QUALIFICATION_GROUP_TO_REQUIRED_CERTIFICATION: Record<string, PilotCertificationCode> = {
  single_turboprop_utility: "SEPL",
  single_turboprop_premium: "SEPL",
  twin_turboprop_utility: "MEPL",
  twin_turboprop_commuter: "MEPL",
  regional_turboprop: "MEPL",
  classic_regional_jet: "JET",
  light_business_jet: "JET",
  super_midsize_business_jet: "JET",
  regional_jet: "JET",
  narrowbody_airline: "JET",
  widebody_airline: "JUMBO",
};

const VALID_CERTIFICATIONS = new Set<PilotCertificationCode>(["SEPL", "SEPS", "MEPL", "MEPS", "JET", "JUMBO"]);

const CERTIFICATION_DISPLAY: Record<PilotCertificationCode, string> = {
  SEPL: "SEPL",
  SEPS: "SEPS",
  MEPL: "MEPL",
  MEPS: "MEPS",
  JET: "JET",
  JUMBO: "JUMBO",
};
const ALL_CERTIFICATION_CODES = Object.keys(CERTIFICATION_ORDER) as PilotCertificationCode[];

export function normalizePilotCertifications(certifications: ReadonlyArray<string>): PilotCertificationCode[] {
  return [...new Set(
    certifications.filter((certification): certification is PilotCertificationCode =>
      VALID_CERTIFICATIONS.has(certification as PilotCertificationCode),
    ),
  )].sort((left, right) => CERTIFICATION_ORDER[left] - CERTIFICATION_ORDER[right]);
}

export function certificationsForQualificationGroup(qualificationGroup: string): PilotCertificationCode[] {
  const requiredCertification = requiredCertificationForQualificationGroup(qualificationGroup);
  if (requiredCertification) {
    return [requiredCertification];
  }

  if (qualificationGroup.includes("jumbo") || qualificationGroup.includes("widebody") || qualificationGroup.includes("heavy")) {
    return ["JUMBO"];
  }

  if (qualificationGroup.includes("jet")) {
    return ["JET"];
  }

  if (qualificationGroup.includes("twin")) {
    return ["MEPL"];
  }

  if (qualificationGroup.includes("single")) {
    return ["SEPL"];
  }

  return [];
}

export function requiredCertificationForQualificationGroup(qualificationGroup: string): PilotCertificationCode | undefined {
  const mapped = QUALIFICATION_GROUP_TO_REQUIRED_CERTIFICATION[qualificationGroup];
  if (mapped) {
    return mapped;
  }

  if (qualificationGroup.includes("jumbo") || qualificationGroup.includes("widebody") || qualificationGroup.includes("heavy")) {
    return "JUMBO";
  }

  if (qualificationGroup.includes("jet")) {
    return "JET";
  }

  if (qualificationGroup.includes("twin")) {
    return "MEPL";
  }

  if (qualificationGroup.includes("single")) {
    return "SEPL";
  }

  return undefined;
}

export function isPilotQualificationGroup(qualificationGroup: string): boolean {
  return requiredCertificationForQualificationGroup(qualificationGroup) !== undefined;
}

export function pilotCertificationsSatisfyQualificationGroup(
  certifications: ReadonlyArray<string>,
  qualificationGroup: string,
): boolean {
  const requiredCertification = requiredCertificationForQualificationGroup(qualificationGroup);
  if (!requiredCertification) {
    return false;
  }

  return normalizePilotCertifications(certifications).includes(requiredCertification);
}

export function parsePilotCertificationsJson(
  rawValue: string | null | undefined,
  fallbackQualificationGroup?: string,
): PilotCertificationCode[] {
  if (!rawValue) {
    return fallbackQualificationGroup ? certificationsForQualificationGroup(fallbackQualificationGroup) : [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return fallbackQualificationGroup ? certificationsForQualificationGroup(fallbackQualificationGroup) : [];
    }

    const normalized = normalizePilotCertifications(
      parsed.filter((entry): entry is string => typeof entry === "string"),
    );
    if (normalized.length > 0 || !fallbackQualificationGroup) {
      return normalized;
    }

    return certificationsForQualificationGroup(fallbackQualificationGroup);
  } catch {
    return fallbackQualificationGroup ? certificationsForQualificationGroup(fallbackQualificationGroup) : [];
  }
}

export function pilotCertificationsToJson(certifications: ReadonlyArray<string>): string {
  return JSON.stringify(normalizePilotCertifications(certifications));
}

export function formatPilotCertificationCode(certification: string): string {
  return CERTIFICATION_DISPLAY[certification as PilotCertificationCode] ?? certification;
}

export function formatPilotCertificationList(certifications: ReadonlyArray<string>): string {
  const normalized = normalizePilotCertifications(certifications);
  return normalized.length > 0 ? normalized.map((certification) => formatPilotCertificationCode(certification)).join(", ") : "Uncertified";
}

export function enumerateReachablePilotCertificationCombinations(): PilotCertificationCode[][] {
  const combinations: PilotCertificationCode[][] = [];

  for (let mask = 1; mask < 2 ** ALL_CERTIFICATION_CODES.length; mask += 1) {
    const certifications = ALL_CERTIFICATION_CODES.filter((_, index) => (mask & (1 << index)) !== 0);
    combinations.push(normalizePilotCertifications(certifications));
  }

  return combinations.sort((left, right) => {
    if (left.length !== right.length) {
      return left.length - right.length;
    }

    return left.join("|").localeCompare(right.join("|"));
  });
}

export function availableCertificationTrainingTargets(certifications: ReadonlyArray<string>): PilotCertificationCode[] {
  const owned = new Set(normalizePilotCertifications(certifications));
  return ALL_CERTIFICATION_CODES.filter((certification) => !owned.has(certification));
}

export function canTrainToCertification(
  certifications: ReadonlyArray<string>,
  targetCertification: PilotCertificationCode,
): boolean {
  return availableCertificationTrainingTargets(certifications).includes(targetCertification);
}

export function applyCertificationTrainingAward(
  certifications: ReadonlyArray<string>,
  targetCertification: PilotCertificationCode,
): PilotCertificationCode[] {
  return normalizePilotCertifications([
    ...normalizePilotCertifications(certifications),
    targetCertification,
  ]);
}
