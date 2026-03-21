import assert from "node:assert/strict";

import { parseStaffingOfferVisibility } from "../dist/domain/staffing/offer-visibility.js";

const legacyVisibility = parseStaffingOfferVisibility({
  candidateProfile: {
    candidateProfileId: "candidate_legacy",
    qualificationLane: "single turboprop utility",
    totalCareerHours: 1_900,
    primaryQualificationFamilyHours: 1_100,
    certificationHours: undefined,
    companyHours: 0,
    statProfile: {
      operationalReliability: "strong",
      stressTolerance: "solid",
      procedureDiscipline: "developing",
      trainingAptitude: "exceptional",
    },
  },
  pricingExplanation: {
    summary: "Legacy pricing",
    drivers: ["Qualification lane: single turboprop utility"],
  },
});

assert.deepEqual(legacyVisibility.candidateProfile?.statProfile, {
  operationalReliability: 7,
  stressTolerance: 5,
  procedureDiscipline: 2,
  trainingAptitude: 9,
});
assert.deepEqual(legacyVisibility.candidateProfile?.certificationHours, []);

const numericVisibility = parseStaffingOfferVisibility({
  candidateProfile: {
    candidateProfileId: "candidate_numeric",
    qualificationLane: "single turboprop utility",
    totalCareerHours: 2_700,
    primaryQualificationFamilyHours: 1_500,
    certificationHours: [
      { certificationCode: "SEPL", hours: 1_500 },
      { certificationCode: "JET", hours: 650 },
    ],
    companyHours: 0,
    statProfile: {
      operationalReliability: 8,
      stressTolerance: 6,
      procedureDiscipline: 7,
      trainingAptitude: 4,
    },
  },
  pricingExplanation: {
    summary: "Numeric pricing",
    drivers: ["Qualification lane: single turboprop utility"],
  },
});

assert.deepEqual(numericVisibility.candidateProfile?.statProfile, {
  operationalReliability: 8,
  stressTolerance: 6,
  procedureDiscipline: 7,
  trainingAptitude: 4,
});
assert.deepEqual(numericVisibility.candidateProfile?.certificationHours, [
  { certificationCode: "SEPL", hours: 1_500 },
  { certificationCode: "JET", hours: 650 },
]);
