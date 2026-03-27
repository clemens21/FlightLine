/*
 * Regression coverage for save slot files.test.
 * This test file sets up enough backend or UI state to lock in the behavior the product currently depends on.
 */

import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildGeneratedSaveId, deleteSaveFile, listSaveIds, resolveRequestedSaveId, resolveSaveFilePath } from "../dist/ui/save-slot-files.js";

const saveDirectoryPath = await mkdtemp(join(tmpdir(), "flightline-launcher-"));

try {
  const alphaSavePath = resolveSaveFilePath(saveDirectoryPath, "alpha_save");
  await writeFile(alphaSavePath, "alpha");
  await writeFile(join(saveDirectoryPath, "notes.txt"), "ignore me");
  await mkdir(join(saveDirectoryPath, "subfolder"));

  assert.deepEqual(await listSaveIds(saveDirectoryPath), ["alpha_save"]);
  assert.equal(resolveRequestedSaveId("flightline alpha", "fallback_save"), "flightline_alpha");
  assert.equal(resolveRequestedSaveId("   ", "fallback_save"), "fallback_save");
  assert.match(buildGeneratedSaveId("launcher save"), /^launcher_save_\d{8}_\d{6}_\d{3}$/);
  assert.match(buildGeneratedSaveId("ui_smoke", { suffix: "001" }), /^ui_smoke_\d{8}_\d{6}_\d{3}_001$/);

  await deleteSaveFile(saveDirectoryPath, "alpha_save");
  await assert.rejects(access(alphaSavePath), /ENOENT/);
  await assert.rejects(deleteSaveFile(saveDirectoryPath, "alpha_save"), /not found/i);
  await assert.rejects(deleteSaveFile(saveDirectoryPath, "../escape"), /invalid/i);
} finally {
  await rm(saveDirectoryPath, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
