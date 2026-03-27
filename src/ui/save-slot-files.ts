/*
 * Manages filesystem-level save slot discovery, validation, and deletion.
 * The launcher and save-management flows use these helpers instead of dealing with raw save paths directly.
 */

import { access, readdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const saveIdPattern = /^[A-Za-z0-9_-]+$/;
const generatedSavePrefixMaxLength = 32;
const generatedSaveSuffixMaxLength = 12;
const deleteRetryOptions = {
  force: true,
  maxRetries: 8,
  retryDelay: 50,
};

export function sanitizeSaveId(rawValue: string): string {
  return rawValue.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function trimSaveIdToken(rawValue: string, maxLength: number): string {
  return sanitizeSaveId(rawValue)
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
}

function formatSaveIdTimestamp(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${year}${month}${day}_${hours}${minutes}${seconds}_${milliseconds}`;
}

export function buildGeneratedSaveId(
  prefix: string,
  options: {
    date?: Date;
    suffix?: string | number | null | undefined;
  } = {},
): string {
  const basePrefix = trimSaveIdToken(prefix.trim() || "save", generatedSavePrefixMaxLength) || "save";
  const timestamp = formatSaveIdTimestamp(options.date ?? new Date());
  const suffix = options.suffix === undefined || options.suffix === null
    ? ""
    : trimSaveIdToken(String(options.suffix), generatedSaveSuffixMaxLength);

  return [basePrefix, timestamp, suffix].filter((value) => value.length > 0).join("_");
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
