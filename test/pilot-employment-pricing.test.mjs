import assert from "node:assert/strict";

import {
  estimateContractEngagementFee,
  estimateContractHourlyRate,
  estimateDirectHireSalary,
} from "../dist/application/staffing/pilot-employment-pricing.js";

const baseProfile = {
  qualificationGroup: "regional_jet",
  totalCareerHours: 4_800,
  primaryQualificationFamilyHours: 2_300,
  statProfile: {
    operationalReliability: 7,
    stressTolerance: 5,
    procedureDiscipline: 7,
    trainingAptitude: 5,
  },
};

const narrowCertProfile = {
  ...baseProfile,
  certifications: ["JET"],
  certificationHours: [
    { certificationCode: "JET", hours: 2_300 },
  ],
};

const broadCertProfile = {
  ...baseProfile,
  certifications: ["SEPL", "MEPL", "JET", "JUMBO"],
  certificationHours: [
    { certificationCode: "SEPL", hours: 1_000 },
    { certificationCode: "MEPL", hours: 650 },
    { certificationCode: "JET", hours: 2_300 },
    { certificationCode: "JUMBO", hours: 850 },
  ],
};

assert.ok(estimateDirectHireSalary(broadCertProfile) > estimateDirectHireSalary(narrowCertProfile));
assert.ok(estimateContractHourlyRate(broadCertProfile) > estimateContractHourlyRate(narrowCertProfile));
assert.ok(estimateContractEngagementFee(broadCertProfile) > estimateContractEngagementFee(narrowCertProfile));

const lowJetExperienceProfile = {
  ...baseProfile,
  certifications: ["SEPL", "JET"],
  certificationHours: [
    { certificationCode: "SEPL", hours: 2_000 },
    { certificationCode: "JET", hours: 400 },
  ],
};

const highJetExperienceProfile = {
  ...baseProfile,
  certifications: ["SEPL", "JET"],
  certificationHours: [
    { certificationCode: "SEPL", hours: 900 },
    { certificationCode: "JET", hours: 1_800 },
  ],
};

assert.ok(estimateDirectHireSalary(highJetExperienceProfile) > estimateDirectHireSalary(lowJetExperienceProfile));
assert.ok(estimateContractHourlyRate(highJetExperienceProfile) > estimateContractHourlyRate(lowJetExperienceProfile));
assert.ok(estimateContractEngagementFee(highJetExperienceProfile) > estimateContractEngagementFee(lowJetExperienceProfile));

const smallPlaneProfile = {
  qualificationGroup: "single_turboprop_utility",
  certifications: ["SEPL"],
  totalCareerHours: 1_600,
  primaryQualificationFamilyHours: 1_000,
  certificationHours: [
    { certificationCode: "SEPL", hours: 1_000 },
  ],
  statProfile: {
    operationalReliability: 6,
    stressTolerance: 6,
    procedureDiscipline: 6,
    trainingAptitude: 6,
  },
};

const regionalAirlineProfile = {
  qualificationGroup: "regional_jet",
  certifications: ["MEPL", "JET"],
  totalCareerHours: 5_400,
  primaryQualificationFamilyHours: 2_900,
  certificationHours: [
    { certificationCode: "MEPL", hours: 1_100 },
    { certificationCode: "JET", hours: 2_900 },
  ],
  statProfile: {
    operationalReliability: 7,
    stressTolerance: 6,
    procedureDiscipline: 7,
    trainingAptitude: 6,
  },
};

const longHaulProfile = {
  qualificationGroup: "widebody_airline",
  certifications: ["MEPL", "JET", "JUMBO"],
  totalCareerHours: 11_800,
  primaryQualificationFamilyHours: 7_200,
  certificationHours: [
    { certificationCode: "MEPL", hours: 1_200 },
    { certificationCode: "JET", hours: 3_400 },
    { certificationCode: "JUMBO", hours: 4_600 },
  ],
  statProfile: {
    operationalReliability: 8,
    stressTolerance: 7,
    procedureDiscipline: 8,
    trainingAptitude: 7,
  },
};

assert.ok(estimateDirectHireSalary(regionalAirlineProfile) > estimateDirectHireSalary(smallPlaneProfile));
assert.ok(estimateDirectHireSalary(longHaulProfile) > estimateDirectHireSalary(regionalAirlineProfile));
assert.ok(estimateContractHourlyRate(regionalAirlineProfile) > estimateContractHourlyRate(smallPlaneProfile));
assert.ok(estimateContractHourlyRate(longHaulProfile) > estimateContractHourlyRate(regionalAirlineProfile));
assert.ok(estimateContractEngagementFee(regionalAirlineProfile) > estimateContractEngagementFee(smallPlaneProfile));
assert.ok(estimateContractEngagementFee(longHaulProfile) > estimateContractEngagementFee(regionalAirlineProfile));
