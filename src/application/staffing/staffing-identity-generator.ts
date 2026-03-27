import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AirportReferenceRepository, AirportRecord } from "../../infrastructure/reference/airport-reference.js";
import {
  STAFFING_COUNTRY_NAME_POOLS,
  STAFFING_GLOBAL_NAME_POOL,
  resolveStaffingNameFallbackCountries,
  type StaffingCountryNamePool,
} from "./staffing-country-name-pools.js";

interface ExistingIdentityRow extends Record<string, unknown> {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
}

export interface StaffingIdentityMetadata {
  firstName: string;
  lastName: string;
  displayName: string;
  homeCity: string | undefined;
  homeRegionCode: string | undefined;
  homeCountryCode: string | undefined;
}

interface StaffingIdentityGeneratorOptions {
  saveDatabase: SqliteFileDatabase;
  companyId: string;
  homeBaseAirportId: string;
  airportReference: AirportReferenceRepository;
  includeAvailableMarketOffers: boolean;
}

interface ExistingIdentity {
  firstName: string | undefined;
  lastName: string | undefined;
  displayName: string | undefined;
}

function hashString(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }

  return Math.abs(hash);
}

function normalizeNameFragment(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const collapsed = value.trim().replace(/\s+/gu, " ");
  return collapsed.length > 0 ? collapsed.toLowerCase() : undefined;
}

function uniquePreserveOrder(values: ReadonlyArray<string | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function deriveIdentityFromDisplayName(displayName: string | undefined): ExistingIdentity {
  if (!displayName) {
    return {
      firstName: undefined,
      lastName: undefined,
      displayName: undefined,
    };
  }

  const collapsed = displayName.trim().replace(/\s+/gu, " ");
  if (!collapsed) {
    return {
      firstName: undefined,
      lastName: undefined,
      displayName: undefined,
    };
  }

  const parts = collapsed.split(" ");
  if (parts.length === 1) {
    return {
      firstName: collapsed,
      lastName: collapsed,
      displayName: collapsed,
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1),
    displayName: collapsed,
  };
}

function parseExistingIdentity(row: ExistingIdentityRow): ExistingIdentity {
  const displayName = row.displayName?.trim() || undefined;
  const firstName = row.firstName?.trim() || undefined;
  const lastName = row.lastName?.trim() || undefined;

  if (firstName && lastName && displayName) {
    return {
      firstName,
      lastName,
      displayName,
    };
  }

  return deriveIdentityFromDisplayName(displayName);
}

function buildCountryAttemptOrder(
  primaryCountryCode: string | undefined,
  seedBase: string,
  ordinal: number,
): string[] {
  const knownCountryCodes = Object.keys(STAFFING_COUNTRY_NAME_POOLS);
  const primaryFallbacks = primaryCountryCode
    ? [...resolveStaffingNameFallbackCountries(primaryCountryCode)].filter((countryCode) => countryCode !== primaryCountryCode)
    : [];
  const weightedRoll = hashString(`${seedBase}:country:${ordinal}`) % 100;
  const fallbackFirstIndex = primaryFallbacks.length > 0
    ? hashString(`${seedBase}:fallback:${ordinal}`) % primaryFallbacks.length
    : 0;
  const fallbackLead = primaryFallbacks[fallbackFirstIndex];

  if (!primaryCountryCode || !STAFFING_COUNTRY_NAME_POOLS[primaryCountryCode]) {
    return uniquePreserveOrder(knownCountryCodes);
  }

  if (weightedRoll < 68) {
    return uniquePreserveOrder([
      primaryCountryCode,
      ...primaryFallbacks,
      ...knownCountryCodes,
    ]);
  }

  return uniquePreserveOrder([
    fallbackLead,
    primaryCountryCode,
    ...primaryFallbacks,
    ...knownCountryCodes,
  ]);
}

function loadExistingIdentityUsage(
  saveDatabase: SqliteFileDatabase,
  companyId: string,
  includeAvailableMarketOffers: boolean,
): ExistingIdentity[] {
  const namedPilotRows = saveDatabase.all<ExistingIdentityRow>(
    `SELECT
      np.first_name AS firstName,
      np.last_name AS lastName,
      np.display_name AS displayName
    FROM named_pilot AS np
    JOIN staffing_package AS sp ON sp.staffing_package_id = np.staffing_package_id
    WHERE np.company_id = $company_id
      AND sp.status IN ('pending', 'active')`,
    { $company_id: companyId },
  );

  const marketRows = includeAvailableMarketOffers
    ? saveDatabase.all<ExistingIdentityRow>(
        `SELECT
          so.first_name AS firstName,
          so.last_name AS lastName,
          so.display_name AS displayName
        FROM staffing_offer AS so
        JOIN offer_window AS ow ON ow.offer_window_id = so.offer_window_id
        WHERE so.company_id = $company_id
          AND so.offer_status = 'available'
          AND ow.window_type = 'staffing_market'
          AND ow.status = 'active'`,
        { $company_id: companyId },
      )
    : [];

  return [...namedPilotRows, ...marketRows].map(parseExistingIdentity);
}

function chooseHometownAirport(
  airportReference: AirportReferenceRepository,
  countryCode: string,
  seedBase: string,
): AirportRecord | undefined {
  const airports = airportReference.listAirportsByCountry(countryCode, 240);
  if (airports.length === 0) {
    return undefined;
  }

  const preferredAirports = airports.filter((airport) => airport.municipality && airport.isoRegion);
  const pool = preferredAirports.length > 0 ? preferredAirports : airports;
  const index = hashString(`${seedBase}:${countryCode}:hometown`) % pool.length;
  return pool[index];
}

export function createStaffingIdentityGenerator(
  options: StaffingIdentityGeneratorOptions,
): { generateIdentity(seedBase: string, ordinal: number): StaffingIdentityMetadata } {
  const homeBaseAirport = options.airportReference.findAirport(options.homeBaseAirportId);
  const primaryCountryCode = homeBaseAirport?.isoCountry?.toUpperCase();
  const existingIdentities = loadExistingIdentityUsage(
    options.saveDatabase,
    options.companyId,
    options.includeAvailableMarketOffers,
  );
  const usedDisplayNames = new Set(
    existingIdentities
      .map((identity) => normalizeNameFragment(identity.displayName))
      .filter((value): value is string => Boolean(value)),
  );
  const usedLastNames = new Set(
    existingIdentities
      .map((identity) => normalizeNameFragment(identity.lastName))
      .filter((value): value is string => Boolean(value)),
  );

  const reserveIdentity = (displayName: string, lastName: string): void => {
    usedDisplayNames.add(normalizeNameFragment(displayName)!);
    usedLastNames.add(normalizeNameFragment(lastName)!);
  };

  const tryCountryIdentity = (
    countryCode: string,
    pool: StaffingCountryNamePool,
    seedBase: string,
  ): StaffingIdentityMetadata | undefined => {
    const hometownAirport = chooseHometownAirport(options.airportReference, countryCode, seedBase);
    const lastNameOffset = hashString(`${seedBase}:${countryCode}:last-name`);
    const firstNameOffset = hashString(`${seedBase}:${countryCode}:first-name`);

    for (let lastNameAttempt = 0; lastNameAttempt < pool.lastNames.length; lastNameAttempt += 1) {
      const lastName = pool.lastNames[(lastNameOffset + lastNameAttempt) % pool.lastNames.length]!;
      if (usedLastNames.has(normalizeNameFragment(lastName)!)) {
        continue;
      }

      for (let firstNameAttempt = 0; firstNameAttempt < pool.firstNames.length; firstNameAttempt += 1) {
        const firstName = pool.firstNames[(firstNameOffset + firstNameAttempt + lastNameAttempt) % pool.firstNames.length]!;
        const displayName = `${firstName} ${lastName}`;
        if (usedDisplayNames.has(normalizeNameFragment(displayName)!)) {
          continue;
        }

        reserveIdentity(displayName, lastName);

        return {
          firstName,
          lastName,
          displayName,
          homeCity: hometownAirport?.municipality ?? undefined,
          homeRegionCode: hometownAirport?.isoRegion ?? undefined,
          homeCountryCode: hometownAirport?.isoCountry ?? countryCode,
        };
      }
    }

    return undefined;
  };

  return {
    generateIdentity(seedBase: string, ordinal: number): StaffingIdentityMetadata {
      const countryAttemptOrder = buildCountryAttemptOrder(primaryCountryCode, seedBase, ordinal);

      for (const countryCode of countryAttemptOrder) {
        const pool = STAFFING_COUNTRY_NAME_POOLS[countryCode];
        if (!pool) {
          continue;
        }

        const identity = tryCountryIdentity(countryCode, pool, seedBase);
        if (identity) {
          return identity;
        }
      }

      const globalPool = STAFFING_GLOBAL_NAME_POOL;
      const lastNameOffset = hashString(`${seedBase}:global:last-name`);
      const firstNameOffset = hashString(`${seedBase}:global:first-name`);

      for (let lastNameAttempt = 0; lastNameAttempt < globalPool.lastNames.length; lastNameAttempt += 1) {
        const lastName = globalPool.lastNames[(lastNameOffset + lastNameAttempt) % globalPool.lastNames.length]!;
        if (usedLastNames.has(normalizeNameFragment(lastName)!)) {
          continue;
        }

        const firstName = globalPool.firstNames[(firstNameOffset + lastNameAttempt) % globalPool.firstNames.length]!;
        const displayName = `${firstName} ${lastName}`;
        if (usedDisplayNames.has(normalizeNameFragment(displayName)!)) {
          continue;
        }

        reserveIdentity(displayName, lastName);
        return {
          firstName,
          lastName,
          displayName,
          homeCity: homeBaseAirport?.municipality ?? undefined,
          homeRegionCode: homeBaseAirport?.isoRegion ?? undefined,
          homeCountryCode: homeBaseAirport?.isoCountry ?? undefined,
        };
      }

      const fallbackOrdinal = usedDisplayNames.size + 1;
      const fallbackDisplayName = `Pilot ${fallbackOrdinal}`;
      const fallbackLastName = `Pilot${fallbackOrdinal}`;
      reserveIdentity(fallbackDisplayName, fallbackLastName);

      return {
        firstName: "Pilot",
        lastName: fallbackLastName,
        displayName: fallbackDisplayName,
        homeCity: homeBaseAirport?.municipality ?? undefined,
        homeRegionCode: homeBaseAirport?.isoRegion ?? undefined,
        homeCountryCode: homeBaseAirport?.isoCountry ?? undefined,
      };
    },
  };
}
