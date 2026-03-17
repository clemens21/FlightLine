/*
 * Manages filesystem-level save slot discovery, validation, and deletion.
 * The launcher and save-management flows use these helpers instead of dealing with raw save paths directly.
 */

import { access, readdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const saveIdPattern = /^[A-Za-z0-9_-]+$/;
const deleteRetryOptions = {
  force: true,
  maxRetries: 8,
  retryDelay: 50,
};

export function sanitizeSaveId(rawValue: string): string {
  return rawValue.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function resolveRequestedSaveId(rawValue: string | null | undefined, fallbackSaveId: string): string {
  const trimmedValue = rawValue?.trim() ?? "";
  return sanitizeSaveId(trimmedValue || fallbackSaveId);
}

export function isValidSaveId(saveId: string): boolean {
  return saveIdPattern.test(saveId);
}

export function resolveSaveFilePath(saveDirectoryPath: string, saveId: string): string {
  if (!isValidSaveId(saveId)) {
    throw new Error(`Save id ${saveId} is invalid.`);
  }

  return resolve(saveDirectoryPath, `${saveId}.sqlite`);
}

export async function listSaveIds(saveDirectoryPath: string): Promise<string[]> {
  try {
    const entries = await readdir(saveDirectoryPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sqlite"))
      .map((entry) => entry.name.replace(/\.sqlite$/i, ""))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

export async function deleteSaveFile(saveDirectoryPath: string, saveId: string): Promise<void> {
  const saveFilePath = resolveSaveFilePath(saveDirectoryPath, saveId);

  try {
    await access(saveFilePath);
  } catch {
    throw new Error(`Save ${saveId} was not found.`);
  }

  const saveFileStats = await stat(saveFilePath);

  if (!saveFileStats.isFile()) {
    throw new Error(`Save ${saveId} is not a valid save file.`);
  }

  const sidecarPaths = [saveFilePath, `${saveFilePath}-wal`, `${saveFilePath}-shm`];

  await Promise.all(sidecarPaths.map((path) => rm(path, deleteRetryOptions)));
}
