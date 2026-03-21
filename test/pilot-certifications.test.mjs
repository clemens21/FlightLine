/*
 * Locks in the first-pass pilot certification vocabulary and training progression rules.
 * This prevents later changes from collapsing the land/sea split back into generic SEP/MEP labels.
 */

import assert from "node:assert/strict";

import {
  applyCertificationTrainingAward,
  availableCertificationTrainingTargets,
  enumerateReachablePilotCertificationCombinations,
  certificationsForQualificationGroup,
  formatPilotCertificationList,
  pilotCertificationsSatisfyQualificationGroup,
} from "../dist/domain/staffing/pilot-certifications.js";

assert.deepEqual(certificationsForQualificationGroup("single_turboprop_utility"), ["SEPL"]);
assert.deepEqual(certificationsForQualificationGroup("twin_turboprop_utility"), ["MEPL"]);
assert.deepEqual(certificationsForQualificationGroup("regional_jet"), ["JET"]);
assert.deepEqual(certificationsForQualificationGroup("widebody_airline"), ["JUMBO"]);

assert.deepEqual(availableCertificationTrainingTargets(["SEPL"]), ["SEPS", "MEPL", "MEPS", "JET", "JUMBO"]);
assert.deepEqual(availableCertificationTrainingTargets(["SEPS"]), ["SEPL", "MEPL", "MEPS", "JET", "JUMBO"]);
assert.deepEqual(availableCertificationTrainingTargets(["MEPL"]), ["SEPL", "SEPS", "MEPS", "JET", "JUMBO"]);
assert.deepEqual(availableCertificationTrainingTargets(["SEPL", "MEPL", "JET"]), ["SEPS", "MEPS", "JUMBO"]);

assert.deepEqual(applyCertificationTrainingAward(["SEPL"], "MEPL"), ["SEPL", "MEPL"]);
assert.deepEqual(applyCertificationTrainingAward(["SEPS"], "MEPS"), ["SEPS", "MEPS"]);
assert.deepEqual(applyCertificationTrainingAward(["SEPL", "MEPL", "JET"], "JUMBO"), ["SEPL", "MEPL", "JET", "JUMBO"]);

const reachableCombinations = enumerateReachablePilotCertificationCombinations().map((certifications) => certifications.join("|"));
assert.equal(reachableCombinations.includes("SEPL"), true);
assert.equal(reachableCombinations.includes("SEPL|SEPS"), true);
assert.equal(reachableCombinations.includes("SEPL|MEPL|JET|JUMBO"), true);
assert.equal(reachableCombinations.includes("SEPL|MEPS"), true);

assert.equal(pilotCertificationsSatisfyQualificationGroup(["SEPL", "MEPL"], "twin_turboprop_commuter"), true);
assert.equal(pilotCertificationsSatisfyQualificationGroup(["SEPS", "MEPS"], "twin_turboprop_commuter"), false);
assert.equal(pilotCertificationsSatisfyQualificationGroup(["JET"], "regional_jet"), true);
assert.equal(pilotCertificationsSatisfyQualificationGroup(["JUMBO"], "widebody_airline"), true);

assert.equal(formatPilotCertificationList(["MEPL", "SEPL"]), "SEPL, MEPL");
