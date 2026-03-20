/*
 * Staff portraits are generated locally from the upstream DiceBear Avataaars style and cached on disk.
 * This keeps the Staff workspace independent from remote avatar services while avoiding repeated runtime SVG work.
 */

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fileConstants } from "node:fs";
import { resolve } from "node:path";

import { createAvatar } from "@dicebear/core";
import * as avataaars from "@dicebear/avataaars";

import type { StaffingOfferView, StaffingMarketView } from "../application/queries/staffing-market.js";
import type { NamedPilotView, StaffingStateView } from "../application/queries/staffing-state.js";

const portraitCacheDirectoryPath = resolve(process.cwd(), "data", "cache", "staff-portraits");
const inFlightPortraits = new Map<string, Promise<void>>();

const topOptions = [
  "bob",
  "bun",
  "curly",
  "curvy",
  "dreads",
  "dreads01",
  "dreads02",
  "frida",
  "frizzle",
  "fro",
  "froBand",
  "longButNotTooLong",
  "miaWallace",
  "shaggy",
  "shaggyMullet",
  "shavedSides",
  "shortCurly",
  "shortFlat",
  "shortRound",
  "shortWaved",
  "sides",
  "straight01",
  "straight02",
  "straightAndStrand",
  "theCaesar",
  "theCaesarAndSidePart",
  "bigHair",
] as const;

const accessoriesOptions = [
  "kurt",
  "prescription01",
  "prescription02",
  "round",
  "wayfarers",
] as const;

const clothingOptions = [
  "blazerAndShirt",
  "blazerAndSweater",
  "collarAndSweater",
  "hoodie",
  "shirtCrewNeck",
  "shirtScoopNeck",
  "shirtVNeck",
] as const;

const eyesOptions = [
  "default",
  "happy",
  "side",
  "squint",
  "surprised",
  "wink",
] as const;

const eyebrowsOptions = [
  "defaultNatural",
  "flatNatural",
  "raisedExcitedNatural",
  "sadConcernedNatural",
  "upDownNatural",
  "default",
  "raisedExcited",
  "upDown",
] as const;

const mouthOptions = [
  "default",
  "disbelief",
  "grimace",
  "serious",
  "smile",
  "twinkle",
] as const;

const facialHairOptions = [
  "beardLight",
  "beardMajestic",
  "beardMedium",
  "moustacheFancy",
  "moustacheMagnum",
] as const;

const hairColorOptions = [
  "2c1b18",
  "4a312c",
  "724133",
  "a55728",
  "b58143",
  "d6b370",
] as const;

const skinColorOptions = [
  "614335",
  "ae5d29",
  "d08b5b",
  "edb98a",
  "fd9841",
  "ffdbb4",
] as const;

const clothesColorOptions = [
  "25557c",
  "3c4f5c",
  "5199e4",
  "65c9ff",
  "929598",
  "a7ffc4",
  "e6e6e6",
  "ff5c5c",
  "ffafb9",
  "ffffb1",
] as const;

const accessoriesColorOptions = [
  "262e33",
  "25557c",
  "3c4f5c",
  "929598",
  "e6e6e6",
] as const;

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeNameSeed(displayName: string | undefined | null): string {
  if (!displayName) {
    return "";
  }

  return collapseWhitespace(displayName).toLowerCase();
}

function buildPortraitSeed(displayName: string | undefined | null, stableIdentity: string | undefined | null, fallback: string): string {
  const normalizedName = normalizeNameSeed(displayName);
  const normalizedIdentity = typeof stableIdentity === "string" && stableIdentity.trim().length > 0
    ? stableIdentity.trim()
    : fallback;

  if (normalizedName.length === 0) {
    return normalizedIdentity;
  }

  // Name stays first so the avatar is identity-led by the visible staff name, while the stable id avoids same-name collisions.
  return `${normalizedName}::${normalizedIdentity}`;
}

export function resolveCandidatePortraitSeed(offer: Pick<StaffingOfferView, "staffingOfferId" | "displayName">): string {
  return buildPortraitSeed(offer.displayName, offer.staffingOfferId, "staff-candidate");
}

export function resolveEmployeePortraitSeed(pilot: Pick<NamedPilotView, "displayName" | "sourceOfferId" | "staffingPackageId" | "namedPilotId">): string {
  return buildPortraitSeed(
    pilot.displayName,
    pilot.sourceOfferId ?? pilot.staffingPackageId ?? pilot.namedPilotId,
    "staff-employee",
  );
}

export function resolveStaffPortraitAssetId(seed: string): string {
  const normalizedSeed = collapseWhitespace(seed.length > 0 ? seed : "staff-portrait");
  const digest = createHash("sha1").update(normalizedSeed).digest("hex").slice(0, 20);
  return `avatar-${digest}`;
}

export function isValidStaffPortraitAssetId(assetId: string): boolean {
  return /^avatar-[a-f0-9]{20}$/i.test(assetId);
}

export function resolveStaffPortraitAssetPath(assetId: string): string {
  return resolve(portraitCacheDirectoryPath, `${assetId}.svg`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fileConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function buildStaffPortraitSvg(seed: string): string {
  const trimmedSeed = collapseWhitespace(seed.length > 0 ? seed : "staff-portrait");
  const variantHash = createHash("sha1").update(trimmedSeed).digest("hex");
  const variantIndex = Number.parseInt(variantHash.slice(0, 8), 16);
  const accessoriesProbability = [0, 20, 35, 50][variantIndex % 4] ?? 20;
  const facialHairProbability = [0, 20, 35, 45][(variantIndex + 1) % 4] ?? 20;

  return createAvatar(avataaars, {
    seed: trimmedSeed,
    style: ["default"],
    backgroundColor: ["transparent"],
    top: [...topOptions],
    accessories: [...accessoriesOptions],
    accessoriesProbability,
    clothing: [...clothingOptions],
    eyes: [...eyesOptions],
    eyebrows: [...eyebrowsOptions],
    mouth: [...mouthOptions],
    facialHair: [...facialHairOptions],
    facialHairProbability,
    hairColor: [...hairColorOptions],
    facialHairColor: [...hairColorOptions],
    skinColor: [...skinColorOptions],
    clothesColor: [...clothesColorOptions],
    accessoriesColor: [...accessoriesColorOptions],
  }).toString();
}

export async function ensureStaffPortraitAsset(seed: string): Promise<string> {
  const assetId = resolveStaffPortraitAssetId(seed);
  const assetPath = resolveStaffPortraitAssetPath(assetId);

  if (await pathExists(assetPath)) {
    return assetId;
  }

  const existingGeneration = inFlightPortraits.get(assetId);
  if (existingGeneration) {
    await existingGeneration;
    return assetId;
  }

  const generation = (async () => {
    await mkdir(portraitCacheDirectoryPath, { recursive: true });
    if (await pathExists(assetPath)) {
      return;
    }

    const svg = buildStaffPortraitSvg(seed);
    try {
      await writeFile(assetPath, svg, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      const errorCode = error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
      if (errorCode !== "EEXIST") {
        throw error;
      }
    }
  })();

  inFlightPortraits.set(assetId, generation);

  try {
    await generation;
  } finally {
    inFlightPortraits.delete(assetId);
  }

  return assetId;
}

export async function ensureStaffPortraitAssetsForStaffing(staffingMarket: StaffingMarketView | null, staffingState: StaffingStateView | null): Promise<void> {
  const seeds = new Set<string>();

  for (const offer of staffingMarket?.offers ?? []) {
    if (offer.laborCategory === "pilot" && offer.candidateState === "available_now") {
      seeds.add(resolveCandidatePortraitSeed(offer));
    }
  }

  for (const pilot of staffingState?.namedPilots ?? []) {
    seeds.add(resolveEmployeePortraitSeed(pilot));
  }

  await Promise.all(Array.from(seeds, (seed) => ensureStaffPortraitAsset(seed)));
}

export async function readStaffPortraitAsset(assetId: string): Promise<string> {
  return readFile(resolveStaffPortraitAssetPath(assetId), "utf8");
}
