/*
 * Locks in the first-pass pilot certification vocabulary and training progression rules.
 * This prevents later changes from collapsing the land/sea split back into generic SEP/MEP labels.
 */

import assert from "node:assert/strict";

import {
  applyCertificationTrainingAward,
  availableCertificationTrainingTargets,
  certificationsForQualificationGroup,
  formatPilotCertificationList,
  pilotCertificationsSatisfyQualificationGroup,
} from "../dist/domain/staffing/pilot-certifications.js";

assert.deepEqual(certificationsForQualificationGroup("single_turboprop_utility"), ["SEPL"]);
assert.deepEqual(certificationsForQualificationGroup("twin_turboprop_utility"), ["SEPL", "MEPL"]);

assert.deepEqual(availableCertificationTrainingTargets(["SEPL"]), ["SEPS", "MEPL"]);
assert.deepEqual(availableCertificationTrainingTargets(["SEPS"]), ["SEPL", "MEPS"]);
assert.deepEqual(availableCertificationTrainingTargets(["MEPL"]), ["MEPS", "JET"]);

assert.deepEqual(applyCertificationTrainingAward(["SEPL"], "MEPL"), ["SEPL", "MEPL"]);
assert.deepEqual(applyCertificationTrainingAward(["SEPS"], "MEPS"), ["SEPS", "MEPS"]);

assert.equal(pilotCertificationsSatisfyQualificationGroup(["SEPL", "MEPL"], "twin_turboprop_commuter"), true);
assert.equal(pilotCertificationsSatisfyQualificationGroup(["SEPS", "MEPS"], "twin_turboprop_commuter"), false);

assert.equal(formatPilotCertificationList(["MEPL", "SEPL"]), "SEPL, MEPL");
