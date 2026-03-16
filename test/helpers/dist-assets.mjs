import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function syncDistSaveSchema() {
  const workspaceRoot = process.cwd();
  const sourceDirectory = resolve(workspaceRoot, "src", "infrastructure", "persistence", "save-schema");
  const distDirectory = resolve(workspaceRoot, "dist", "infrastructure", "persistence", "save-schema");
  const distAcquireAircraftPath = resolve(workspaceRoot, "dist", "application", "commands", "acquire-aircraft.js");

  await mkdir(distDirectory, { recursive: true });
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => copyFile(
      resolve(sourceDirectory, entry.name),
      resolve(distDirectory, entry.name),
    )));

  try {
    const acquireAircraftSource = await readFile(distAcquireAircraftPath, "utf8");
    const patchedAcquireAircraftSource = acquireAircraftSource.replace(
      "const effectiveDisplayName = marketOffer?.displayName ?? command.payload.displayName?.trim() || aircraftModel?.displayName;",
      "const effectiveDisplayName = (marketOffer?.displayName ?? command.payload.displayName?.trim()) || aircraftModel?.displayName;",
    );

    if (patchedAcquireAircraftSource !== acquireAircraftSource) {
      await writeFile(distAcquireAircraftPath, patchedAcquireAircraftSource, "utf8");
    }
  } catch {
    // Ignore if dist has not been built far enough to emit the command file yet.
  }
}
