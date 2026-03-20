import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";

import {
  ensureStaffPortraitAsset,
  resolveCandidatePortraitSeed,
  resolveEmployeePortraitSeed,
  resolveStaffPortraitAssetId,
  resolveStaffPortraitAssetPath,
} from "../dist/ui/staff-portrait-cache.js";

const sharedName = "Jordan Avery";

const candidateSeed = resolveCandidatePortraitSeed({
  staffingOfferId: "offer_jordan_a",
  displayName: sharedName,
});

const employeeSeed = resolveEmployeePortraitSeed({
  namedPilotId: "pilot_jordan_a",
  staffingPackageId: "pkg_jordan_a",
  sourceOfferId: "offer_jordan_a",
  displayName: sharedName,
});

assert.equal(
  resolveStaffPortraitAssetId(candidateSeed),
  resolveStaffPortraitAssetId(employeeSeed),
  "Expected hire and employee portrait ids to stay aligned for the same named pilot.",
);

const secondCandidateSeed = resolveCandidatePortraitSeed({
  staffingOfferId: "offer_jordan_b",
  displayName: sharedName,
});

assert.notEqual(
  resolveStaffPortraitAssetId(candidateSeed),
  resolveStaffPortraitAssetId(secondCandidateSeed),
  "Expected same-name staff with different stable identities to receive distinct portrait ids.",
);

const cacheSeed = resolveCandidatePortraitSeed({
  staffingOfferId: "offer_cache_test",
  displayName: "Cache Test",
});
const cacheAssetId = resolveStaffPortraitAssetId(cacheSeed);
const cacheAssetPath = resolveStaffPortraitAssetPath(cacheAssetId);

await rm(cacheAssetPath, { force: true });
await ensureStaffPortraitAsset(cacheSeed);

const cachedSvg = await readFile(cacheAssetPath, "utf8");
assert.equal(cachedSvg.includes("<svg"), true);
