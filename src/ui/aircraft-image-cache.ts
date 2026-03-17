/*
 * Lazily caches open-license aircraft family images from Wikimedia-backed sources into local data storage.
 * The UI requests family image URLs from the local server, which fills the cache on first use and serves fallback art on failure.
 * Model-specific images are attempted first, then family-level assets, then the local fallback. That keeps the UI fast
 * after the first request while avoiding a hard dependency on any one external image source.
 */

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { aircraftImageFallbackPath, aircraftImageSources, aircraftModelImageSources, type AircraftImageSourceDefinition } from "./aircraft-image-sources.js";
import type { AircraftModelRecord } from "../infrastructure/reference/aircraft-reference.js";

const aircraftFamilyImageDirectoryPath = resolve(process.cwd(), "data", "aircraft", "images", "families");
const aircraftModelImageDirectoryPath = resolve(process.cwd(), "data", "aircraft", "images", "models");
const aircraftImageMetadataDirectoryPath = resolve(process.cwd(), "data", "aircraft", "images", "metadata");
const userAgent = "FlightLineDev/1.0 (local development)";

interface CommonsFetchResult {
  fileTitle: string;
  thumbnailUrl: string;
  originalUrl: string;
  license: string;
  licenseUrl: string | undefined;
  attribution: string | undefined;
  sourceUrl: string | undefined;
  title: string | undefined;
}

function requestInit(): RequestInit {
  return {
    headers: {
      "user-agent": userAgent,
    },
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, requestInit());
  if (!response.ok) {
    throw new Error(`Image metadata request failed (${response.status}) for ${url}`);
  }

  return await response.json() as T;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, requestInit());
  if (!response.ok) {
    throw new Error(`Image download failed (${response.status}) for ${url}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function stripHtml(rawValue: string | undefined): string | undefined {
  if (!rawValue) {
    return undefined;
  }

  return rawValue
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function encodedTitle(value: string): string {
  return encodeURIComponent(value);
}

async function findCachedImagePath(directoryPath: string, cacheKey: string): Promise<string | null> {
  for (const extension of [".jpg", ".png", ".webp"]) {
    const candidatePath = join(directoryPath, `${cacheKey}${extension}`);
    try {
      await access(candidatePath, fsConstants.F_OK);
      return candidatePath;
    } catch {
      // Continue to the next extension.
    }
  }

  return null;
}

function assetContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml; charset=utf-8";
    default:
      return "image/jpeg";
  }
}

function extensionForUrl(url: string): string {
  const normalized = url.toLowerCase();
  if (normalized.endsWith(".png")) {
    return ".png";
  }
  if (normalized.endsWith(".webp")) {
    return ".webp";
  }
  return ".jpg";
}

async function pageImageFromArticle(articleTitle: string): Promise<{ fileTitle: string; thumbnailUrl: string; originalUrl: string; }> {
  const data = await fetchJson<{
    query: { pages: Record<string, { pageimage?: string; thumbnail?: { source: string; }; original?: { source: string; }; }>; };
  }>(
    "https://en.wikipedia.org/w/api.php"
    + `?action=query&titles=${encodedTitle(articleTitle)}&prop=pageimages&format=json`
    + "&piprop=thumbnail|name|original&pithumbsize=1100",
  );

  const page = Object.values(data.query.pages)[0];
  if (!page?.pageimage || !page.thumbnail?.source || !page.original?.source) {
    throw new Error(`No usable page image found for article '${articleTitle}'.`);
  }

  return {
    fileTitle: `File:${page.pageimage}`,
    thumbnailUrl: page.thumbnail.source,
    originalUrl: page.original.source,
  };
}

async function pageImageFromSearch(query: string): Promise<{ fileTitle: string; thumbnailUrl: string; originalUrl: string; }> {
  const data = await fetchJson<{
    query?: {
      pages: Record<string, {
        pageimage?: string;
        thumbnail?: { source: string; };
        original?: { source: string; };
      }>;
    };
  }>(
    "https://en.wikipedia.org/w/api.php"
    + `?action=query&generator=search&gsrsearch=${encodedTitle(query)}&gsrnamespace=0`
    + "&prop=pageimages&format=json&piprop=thumbnail|name|original&pithumbsize=1100&gsrlimit=1",
  );

  const page = data.query ? Object.values(data.query.pages)[0] : undefined;
  if (!page?.pageimage || !page.thumbnail?.source || !page.original?.source) {
    throw new Error(`No usable search image found for query '${query}'.`);
  }

  return {
    fileTitle: `File:${page.pageimage}`,
    thumbnailUrl: page.thumbnail.source,
    originalUrl: page.original.source,
  };
}

async function commonsImageByTitle(fileTitle: string): Promise<CommonsFetchResult> {
  const data = await fetchJson<{
    query: {
      pages: Record<string, {
        title: string;
        imageinfo?: Array<{
          url?: string;
          thumburl?: string;
          descriptionurl?: string;
          extmetadata?: Record<string, { value?: string; }>;
        }>;
      }>;
    };
  }>(
    "https://commons.wikimedia.org/w/api.php"
    + `?action=query&titles=${encodedTitle(fileTitle)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1100&format=json`,
  );

  const page = Object.values(data.query.pages)[0];
  if (!page) {
    throw new Error(`No Commons page found for '${fileTitle}'.`);
  }
  const imageInfo = page?.imageinfo?.[0];
  if (!imageInfo?.url || !(imageInfo.thumburl ?? imageInfo.url)) {
    throw new Error(`No downloadable Commons image found for '${fileTitle}'.`);
  }

  const metadata = imageInfo.extmetadata ?? {};
  const title = stripHtml(metadata.ObjectName?.value);
  const attribution = stripHtml(metadata.Artist?.value) ?? stripHtml(metadata.Credit?.value);
  const licenseUrl = stripHtml(metadata.LicenseUrl?.value);
  const sourceUrl = imageInfo.descriptionurl;

  return {
    fileTitle: page.title,
    thumbnailUrl: imageInfo.thumburl ?? imageInfo.url,
    originalUrl: imageInfo.url,
    sourceUrl,
    title,
    attribution,
    license: stripHtml(metadata.LicenseShortName?.value) ?? "Open license",
    licenseUrl,
  };
}

async function resolveImageSource(definition: AircraftImageSourceDefinition): Promise<CommonsFetchResult> {
  if (definition.commonsFileTitle) {
    return commonsImageByTitle(definition.commonsFileTitle);
  }

  if (definition.searchQuery) {
    const searchImage = await pageImageFromSearch(definition.searchQuery);
    const metadata = await commonsImageByTitle(searchImage.fileTitle);
    return {
      ...metadata,
      thumbnailUrl: searchImage.thumbnailUrl,
      originalUrl: searchImage.originalUrl,
    };
  }

  if (!definition.articleTitle) {
    throw new Error("Aircraft image source is missing both articleTitle and commonsFileTitle.");
  }

  const pageImage = await pageImageFromArticle(definition.articleTitle);
  const metadata = await commonsImageByTitle(pageImage.fileTitle);
  return {
    ...metadata,
    thumbnailUrl: pageImage.thumbnailUrl,
    originalUrl: pageImage.originalUrl,
  };
}

function uniqueQueries(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function modelSearchQueries(model: AircraftModelRecord): string[] {
  const simplifiedDisplayName = model.displayName
    .replace(/\bPassenger\b/gi, "")
    .replace(/\bCargo\b/gi, "")
    .replace(/\bFreighter\b/gi, "")
    .replace(/\bCombi\b/gi, "")
    .replace(/\bProfessional\b/gi, "")
    .replace(/\bQT\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const withoutParenthetical = model.displayName.replace(/\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();

  return uniqueQueries([
    model.displayName,
    simplifiedDisplayName,
    withoutParenthetical,
    model.shortName,
    `${simplifiedDisplayName} aircraft`,
    `${model.shortName} aircraft`,
  ]);
}

async function resolveModelImageSource(model: AircraftModelRecord): Promise<CommonsFetchResult> {
  const explicitSource = aircraftModelImageSources[model.modelId as keyof typeof aircraftModelImageSources];
  if (explicitSource) {
    try {
      return await resolveImageSource(explicitSource);
    } catch {
      // Fall through to the generic search candidates.
    }
  }

  for (const query of modelSearchQueries(model)) {
    try {
      const pageImage = await pageImageFromArticle(query);
      const metadata = await commonsImageByTitle(pageImage.fileTitle);
      return {
        ...metadata,
        thumbnailUrl: pageImage.thumbnailUrl,
        originalUrl: pageImage.originalUrl,
      };
    } catch {
      // Try the next candidate.
    }

    try {
      const searchImage = await pageImageFromSearch(query);
      const metadata = await commonsImageByTitle(searchImage.fileTitle);
      return {
        ...metadata,
        thumbnailUrl: searchImage.thumbnailUrl,
        originalUrl: searchImage.originalUrl,
      };
    } catch {
      // Try the next candidate.
    }
  }

  const familySource = aircraftImageSources[model.familyId as keyof typeof aircraftImageSources];
  if (familySource) {
    return resolveImageSource(familySource);
  }

  throw new Error(`No model or family image source could be resolved for ${model.modelId}.`);
}

async function writeImageMetadata(cacheKey: string, metadata: CommonsFetchResult, assetFileName: string): Promise<void> {
  await mkdir(aircraftImageMetadataDirectoryPath, { recursive: true });
  await writeFile(
    join(aircraftImageMetadataDirectoryPath, `${cacheKey}.json`),
    JSON.stringify(
      {
        cacheKey,
        assetFileName,
        title: metadata.title,
        attribution: metadata.attribution,
        license: metadata.license,
        licenseUrl: metadata.licenseUrl,
        sourceUrl: metadata.sourceUrl,
        originalUrl: metadata.originalUrl,
        fileTitle: metadata.fileTitle,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function cacheFamilyImage(familyId: string): Promise<string | null> {
  const sourceKey = familyId as keyof typeof aircraftImageSources;
  const definition = aircraftImageSources[sourceKey];
  if (!definition) {
    return null;
  }

  const resolved = await resolveImageSource(definition);
  const extension = extensionForUrl(resolved.thumbnailUrl);
  const filePath = join(aircraftFamilyImageDirectoryPath, `${familyId}${extension}`);
  await mkdir(aircraftFamilyImageDirectoryPath, { recursive: true });
  await writeFile(filePath, await fetchBuffer(resolved.thumbnailUrl));
  await writeImageMetadata(familyId, resolved, basename(filePath));
  return filePath;
}

async function cacheModelImage(model: AircraftModelRecord): Promise<string | null> {
  const resolved = await resolveModelImageSource(model);
  const extension = extensionForUrl(resolved.thumbnailUrl);
  const filePath = join(aircraftModelImageDirectoryPath, `${model.modelId}${extension}`);
  await mkdir(aircraftModelImageDirectoryPath, { recursive: true });
  await writeFile(filePath, await fetchBuffer(resolved.thumbnailUrl));
  await writeImageMetadata(`model_${model.modelId}`, resolved, basename(filePath));
  return filePath;
}

export function aircraftImageFallbackDiskPath(): string {
  return join(aircraftFamilyImageDirectoryPath, "fallback.svg");
}

export async function resolveAircraftImageAsset(
  assetId: string,
  aircraftModel?: AircraftModelRecord | null,
): Promise<{ filePath: string; contentType: string; cacheControl: string; }> {
  if (assetId === "fallback.svg") {
    const fallbackPath = aircraftImageFallbackDiskPath();
    return {
      filePath: fallbackPath,
      contentType: assetContentType(fallbackPath),
      cacheControl: "public, max-age=86400",
    };
  }

  if (aircraftModel) {
    let cachedPath = await findCachedImagePath(aircraftModelImageDirectoryPath, aircraftModel.modelId);
    if (!cachedPath) {
      try {
        cachedPath = await cacheModelImage(aircraftModel);
      } catch (error) {
        console.warn(`Unable to cache aircraft model image for ${aircraftModel.modelId}:`, error);
      }
    }
    if (cachedPath) {
      return {
        filePath: cachedPath,
        contentType: assetContentType(cachedPath),
        cacheControl: "public, max-age=86400",
      };
    }
  }

  const familyId = aircraftModel?.familyId ?? decodeURIComponent(assetId);
  let cachedPath = await findCachedImagePath(aircraftFamilyImageDirectoryPath, familyId);
  if (!cachedPath) {
    try {
      cachedPath = await cacheFamilyImage(familyId);
    } catch (error) {
      console.warn(`Unable to cache aircraft family image for ${familyId}:`, error);
    }
  }

  if (!cachedPath) {
    const fallbackPath = aircraftImageFallbackDiskPath();
    return {
      filePath: fallbackPath,
      contentType: assetContentType(fallbackPath),
      cacheControl: "public, max-age=3600",
    };
  }

  return {
    filePath: cachedPath,
    contentType: assetContentType(cachedPath),
    cacheControl: "public, max-age=86400",
  };
}

export async function readAircraftImageMetadata(familyId: string): Promise<{
  attribution?: string;
  license?: string;
  licenseUrl?: string;
  sourceUrl?: string;
} | null> {
  const metadataPath = join(aircraftImageMetadataDirectoryPath, `${familyId}.json`);

  try {
    const raw = await readFile(metadataPath, "utf8");
    const parsed = JSON.parse(raw) as {
      attribution?: string;
      license?: string;
      licenseUrl?: string;
      sourceUrl?: string;
    };
    return parsed;
  } catch {
    return null;
  }
}

export { aircraftImageFallbackPath };
