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
};

const LEGACY_QUALIFICATION_TO_CERTIFICATIONS: Record<string, PilotCertificationCode[]> = {
  single_turboprop_utility: ["SEPL"],
  single_turboprop_premium: ["SEPL"],
  twin_turboprop_utility: ["SEPL", "MEPL"],
  twin_turboprop_commuter: ["SEPL", "MEPL"],
};

const LEGACY_QUALIFICATION_TO_REQUIRED_CERTIFICATION: Record<string, PilotCertificationCode> = {
  single_turboprop_utility: "SEPL",
  single_turboprop_premium: "SEPL",
  twin_turboprop_utility: "MEPL",
  twin_turboprop_commuter: "MEPL",
};

const TRAINING_AWARDS: Record<PilotCertificationCode, PilotCertificationCode[]> = {
  SEPL: ["SEPL"],
  SEPS: ["SEPS"],
  MEPL: ["SEPL", "MEPL"],
  MEPS: ["SEPS", "MEPS"],
  JET: ["SEPL", "MEPL", "JET"],
};

const VALID_CERTIFICATIONS = new Set<PilotCertificationCode>(["SEPL", "SEPS", "MEPL", "MEPS", "JET"]);

export function normalizePilotCertifications(certifications: ReadonlyArray<string>): PilotCertificationCode[] {
  return [...new Set(
    certifications.filter((certification): certification is PilotCertificationCode =>
      VALID_CERTIFICATIONS.has(certification as PilotCertificationCode),
    ),
  )].sort((left, right) => CERTIFICATION_ORDER[left] - CERTIFICATION_ORDER[right]);
}

export function certificationsForQualificationGroup(qualificationGroup: string): PilotCertificationCode[] {
  const mapped = LEGACY_QUALIFICATION_TO_CERTIFICATIONS[qualificationGroup];
  if (mapped) {
    return normalizePilotCertifications(mapped);
  }

  if (qualificationGroup.includes("jet")) {
    return ["SEPL", "MEPL", "JET"];
  }

  if (qualificationGroup.includes("twin")) {
    return ["SEPL", "MEPL"];
  }

  if (qualificationGroup.includes("single")) {
    return ["SEPL"];
  }

  return [];
}

export function requiredCertificationForQualificationGroup(qualificationGroup: string): PilotCertificationCode | undefined {
  const mapped = LEGACY_QUALIFICATION_TO_REQUIRED_CERTIFICATION[qualificationGroup];
  if (mapped) {
    return mapped;
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

export function formatPilotCertificationList(certifications: ReadonlyArray<string>): string {
  const normalized = normalizePilotCertifications(certifications);
  return normalized.length > 0 ? normalized.join(", ") : "Uncertified";
}

export function availableCertificationTrainingTargets(certifications: ReadonlyArray<string>): PilotCertificationCode[] {
  const owned = new Set(normalizePilotCertifications(certifications));
  const targets: PilotCertificationCode[] = [];

  if (owned.has("SEPL") && !owned.has("MEPL")) {
    targets.push("MEPL");
  }

  if (owned.has("SEPL") && !owned.has("SEPS")) {
    targets.push("SEPS");
  }

  if (owned.has("SEPS") && !owned.has("MEPS")) {
    targets.push("MEPS");
  }

  if (owned.has("SEPS") && !owned.has("SEPL")) {
    targets.push("SEPL");
  }

  if (owned.has("MEPL") && !owned.has("MEPS")) {
    targets.push("MEPS");
  }

  if (owned.has("MEPL") && !owned.has("JET")) {
    targets.push("JET");
  }

  if (owned.has("MEPS") && !owned.has("MEPL")) {
    targets.push("MEPL");
  }

  return normalizePilotCertifications(targets);
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
    ...TRAINING_AWARDS[targetCertification],
  ]);
}
