/*
 * Copies SQL save-schema files from source into dist after the TypeScript build completes.
 * The runtime needs these migration files alongside the emitted JavaScript even though TypeScript does not compile them.
 */

import { mkdir, readdir, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectoryPath = dirname(fileURLToPath(import.meta.url));
const sourceDirectoryPath = resolve(scriptDirectoryPath, "..", "src", "infrastructure", "persistence", "save-schema");
const targetDirectoryPath = resolve(scriptDirectoryPath, "..", "dist", "infrastructure", "persistence", "save-schema");

await mkdir(targetDirectoryPath, { recursive: true });

for (const fileName of await readdir(sourceDirectoryPath)) {
  if (!fileName.endsWith(".sql")) {
    continue;
  }

  await copyFile(join(sourceDirectoryPath, fileName), join(targetDirectoryPath, fileName));
}
