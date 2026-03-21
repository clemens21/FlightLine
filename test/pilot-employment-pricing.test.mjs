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
