/*
 * Opens the airport reference database and exposes lookup helpers for geography, runway, and timezone data.
 * Many simulation calculations depend on these lookups instead of duplicating airport facts in each save.
 */

import { stat } from "node:fs/promises";

import type { AirportId } from "../../domain/common/primitives.js";
import { SqliteFileDatabase } from "../persistence/sqlite/sqlite-file-database.js";

interface AirportLookupRow extends Record<string, unknown> {
  airportKey: string;
  identCode: string;
  name: string;
  airportType: string;
  airportSize: number | null;
  continent: string | null;
  isoCountry: string | null;
  isoRegion: string | null;
  municipality: string | null;
  timezone: string | null;
  latitudeDeg: number;
  longitudeDeg: number;
  scheduledService: number;
  accessibleNow: number;
  supportsSmallUtility: number;
  marketRegion: string | null;
  passengerScore: number | null;
  cargoScore: number | null;
  remoteScore: number | null;
  tourismScore: number | null;
  businessScore: number | null;
  demandArchetype: string | null;
  contractGenerationWeight: number | null;
  longestHardRunwayFt: number | null;
}

export interface AirportRecord {
  airportKey: AirportId;
  identCode: string;
  name: string;
  airportType: string;
  airportSize: number | null;
  continent: string | undefined;
  isoCountry: string | undefined;
  isoRegion: string | undefined;
  municipality: string | undefined;
  timezone: string | undefined;
  latitudeDeg: number;
  longitudeDeg: number;
  scheduledService: boolean;
  accessibleNow: boolean;
  supportsSmallUtility: boolean;
  marketRegion: string | undefined;
  passengerScore: number;
  cargoScore: number;
  remoteScore: number;
  tourismScore: number;
  businessScore: number;
  demandArchetype: string | undefined;
  contractGenerationWeight: number;
  longestHardRunwayFt: number | undefined;
}

const airportLookupSelect = `SELECT
  a.airport_key AS airportKey,
  a.ident_code AS identCode,
  a.name AS name,
  a.airport_type AS airportType,
  a.airport_size AS airportSize,
  a.continent AS continent,
  a.iso_country AS isoCountry,
  a.iso_region AS isoRegion,
  a.municipality AS municipality,
  a.timezone AS timezone,
  a.latitude_deg AS latitudeDeg,
  a.longitude_deg AS longitudeDeg,
  a.scheduled_service AS scheduledService,
  COALESCE(p.accessible_now, 0) AS accessibleNow,
  COALESCE(p.supports_small_utility, 0) AS supportsSmallUtility,
  p.market_region AS marketRegion,
  COALESCE(p.passenger_score, 0) AS passengerScore,
  COALESCE(p.cargo_score, 0) AS cargoScore,
  COALESCE(p.remote_score, 0) AS remoteScore,
  COALESCE(p.tourism_score, 0) AS tourismScore,
  COALESCE(p.business_score, 0) AS businessScore,
  p.demand_archetype AS demandArchetype,
  COALESCE(p.contract_generation_weight, 1.0) AS contractGenerationWeight,
  p.longest_hard_runway_ft AS longestHardRunwayFt
FROM airport AS a
LEFT JOIN airport_profile AS p ON p.airport_id = a.id`;

export class AirportReferenceRepository {
  private readonly lookupCache = new Map<string, AirportRecord | null>();
  private readonly airportsByCountryCache = new Map<string, AirportRecord[]>();

  private constructor(
    private readonly filePath: string,
    private readonly database: SqliteFileDatabase,
  ) {}

  static async open(filePath: string): Promise<AirportReferenceRepository> {
    const database = await SqliteFileDatabase.open(filePath, {
      readonly: true,
      fileMustExist: true,
      enableWriteOptimizations: false,
    });
    return new AirportReferenceRepository(filePath, database);
  }

  findAirport(lookup: string): AirportRecord | null {
    const normalizedLookup = lookup.trim().toUpperCase();

    if (!normalizedLookup) {
      return null;
    }

    const cachedAirport = this.lookupCache.get(normalizedLookup);
    if (cachedAirport !== undefined) {
      return cachedAirport;
    }

    const row = this.database.getOne<AirportLookupRow>(
      `${airportLookupSelect}
      WHERE UPPER(a.airport_key) = $lookup
         OR UPPER(a.ident_code) = $lookup
         OR UPPER(COALESCE(a.icao_code, '')) = $lookup
         OR UPPER(COALESCE(a.iata_code, '')) = $lookup
         OR UPPER(COALESCE(a.gps_code, '')) = $lookup
         OR UPPER(COALESCE(a.local_code, '')) = $lookup
      ORDER BY CASE
        WHEN UPPER(a.airport_key) = $lookup THEN 0
        WHEN UPPER(a.ident_code) = $lookup THEN 1
        WHEN UPPER(COALESCE(a.icao_code, '')) = $lookup THEN 2
        WHEN UPPER(COALESCE(a.iata_code, '')) = $lookup THEN 3
        ELSE 4
      END
      LIMIT 1`,
      { $lookup: normalizedLookup },
    );

    const airport = row ? this.mapAirportRow(row) : null;
    this.cacheAirport(airport, normalizedLookup);
    return airport;
  }

  findAirportsByAirportKeys(airportKeys: string[]): Map<string, AirportRecord> {
    const normalizedKeys = [...new Set(airportKeys.map((airportKey) => airportKey.trim().toUpperCase()).filter(Boolean))];
    const airportsByKey = new Map<string, AirportRecord>();
    const missingKeys: string[] = [];

    for (const airportKey of normalizedKeys) {
      const cachedAirport = this.lookupCache.get(airportKey);
      if (cachedAirport !== undefined) {
        if (cachedAirport) {
          airportsByKey.set(airportKey, cachedAirport);
        }
        continue;
      }
      missingKeys.push(airportKey);
    }

    if (missingKeys.length > 0) {
      const placeholders = missingKeys.map(() => "?").join(", ");
      const rows = this.database.all<AirportLookupRow>(
        `${airportLookupSelect}
        WHERE UPPER(a.airport_key) IN (${placeholders})`,
        missingKeys,
      );

      const fetchedByKey = new Map<string, AirportRecord>();
      for (const row of rows) {
        const airport = this.mapAirportRow(row);
        fetchedByKey.set(airport.airportKey.toUpperCase(), airport);
        this.cacheAirport(airport);
      }

      for (const airportKey of missingKeys) {
        const airport = fetchedByKey.get(airportKey) ?? null;
        this.lookupCache.set(airportKey, airport);
        if (airport) {
          airportsByKey.set(airportKey, airport);
        }
      }
    }

    return airportsByKey;
  }

  listContractDestinations(originAirport: AirportRecord, limit = 400): AirportRecord[] {
    const rows = this.database.all<AirportLookupRow>(
      `SELECT
        a.airport_key AS airportKey,
        a.ident_code AS identCode,
        a.name AS name,
        a.airport_type AS airportType,
        a.airport_size AS airportSize,
        a.continent AS continent,
        a.iso_country AS isoCountry,
        a.iso_region AS isoRegion,
        a.municipality AS municipality,
        a.timezone AS timezone,
        a.latitude_deg AS latitudeDeg,
        a.longitude_deg AS longitudeDeg,
        a.scheduled_service AS scheduledService,
        COALESCE(p.accessible_now, 0) AS accessibleNow,
        COALESCE(p.supports_small_utility, 0) AS supportsSmallUtility,
        p.market_region AS marketRegion,
        COALESCE(p.passenger_score, 0) AS passengerScore,
        COALESCE(p.cargo_score, 0) AS cargoScore,
        COALESCE(p.remote_score, 0) AS remoteScore,
        COALESCE(p.tourism_score, 0) AS tourismScore,
        COALESCE(p.business_score, 0) AS businessScore,
        p.demand_archetype AS demandArchetype,
        COALESCE(p.contract_generation_weight, 1.0) AS contractGenerationWeight,
        p.longest_hard_runway_ft AS longestHardRunwayFt
      FROM airport AS a
      JOIN airport_profile AS p ON p.airport_id = a.id
      WHERE a.airport_key <> $origin_airport_key
        AND p.accessible_now = 1
        AND p.supports_small_utility = 1
        AND a.airport_type NOT IN ('heliport', 'seaplane_base', 'balloonport', 'closed')
        AND COALESCE(p.longest_hard_runway_ft, 0) >= 2500
        AND (
          COALESCE(a.iso_country, '') = COALESCE($iso_country, '')
          OR COALESCE(p.market_region, '') = COALESCE($market_region, '')
          OR COALESCE(a.continent, '') = COALESCE($continent, '')
        )
      ORDER BY p.contract_generation_weight DESC, a.airport_size DESC, a.airport_key ASC
      LIMIT $limit`,
      {
        $origin_airport_key: originAirport.airportKey,
        $iso_country: originAirport.isoCountry ?? null,
        $market_region: originAirport.marketRegion ?? null,
        $continent: originAirport.continent ?? null,
        $limit: limit,
      },
    );

    return rows.map((row) => this.mapAirportRow(row));
  }

  listContractMarketAirports(limit = 3200): AirportRecord[] {
    const rows = this.database.all<AirportLookupRow>(
      `SELECT
        a.airport_key AS airportKey,
        a.ident_code AS identCode,
        a.name AS name,
        a.airport_type AS airportType,
        a.airport_size AS airportSize,
        a.continent AS continent,
        a.iso_country AS isoCountry,
        a.iso_region AS isoRegion,
        a.municipality AS municipality,
        a.timezone AS timezone,
        a.latitude_deg AS latitudeDeg,
        a.longitude_deg AS longitudeDeg,
        a.scheduled_service AS scheduledService,
        COALESCE(p.accessible_now, 0) AS accessibleNow,
        COALESCE(p.supports_small_utility, 0) AS supportsSmallUtility,
        p.market_region AS marketRegion,
        COALESCE(p.passenger_score, 0) AS passengerScore,
        COALESCE(p.cargo_score, 0) AS cargoScore,
        COALESCE(p.remote_score, 0) AS remoteScore,
        COALESCE(p.tourism_score, 0) AS tourismScore,
        COALESCE(p.business_score, 0) AS businessScore,
        p.demand_archetype AS demandArchetype,
        COALESCE(p.contract_generation_weight, 1.0) AS contractGenerationWeight,
        p.longest_hard_runway_ft AS longestHardRunwayFt
      FROM airport AS a
      JOIN airport_profile AS p ON p.airport_id = a.id
      WHERE p.accessible_now = 1
        AND a.airport_type NOT IN ('heliport', 'seaplane_base', 'balloonport', 'closed')
        AND COALESCE(p.longest_hard_runway_ft, 0) >= 2500
      ORDER BY
        COALESCE(p.contract_generation_weight, 1.0) DESC,
        COALESCE(p.passenger_score, 0) + COALESCE(p.cargo_score, 0) + COALESCE(p.business_score, 0) DESC,
        a.airport_size DESC,
        a.airport_key ASC
      LIMIT $limit`,
      {
        $limit: limit,
      },
    );

    return rows.map((row) => this.mapAirportRow(row));
  }

  listAirportsByCountry(countryCode: string, limit = 240): AirportRecord[] {
    const normalizedCountryCode = countryCode.trim().toUpperCase();
    if (!normalizedCountryCode) {
      return [];
    }

    const cacheKey = `${normalizedCountryCode}:${limit}`;
    const cachedAirports = this.airportsByCountryCache.get(cacheKey);
    if (cachedAirports) {
      return cachedAirports;
    }

    const rows = this.database.all<AirportLookupRow>(
      `${airportLookupSelect}
      WHERE UPPER(COALESCE(a.iso_country, '')) = $country_code
        AND COALESCE(a.municipality, '') <> ''
        AND a.airport_type NOT IN ('heliport', 'seaplane_base', 'balloonport', 'closed')
      ORDER BY
        CASE WHEN COALESCE(a.iso_region, '') <> '' THEN 0 ELSE 1 END,
        COALESCE(p.contract_generation_weight, 1.0) DESC,
        a.airport_size DESC,
        a.airport_key ASC
      LIMIT $limit`,
      {
        $country_code: normalizedCountryCode,
        $limit: limit,
      },
    );

    const airports = rows.map((row) => this.mapAirportRow(row));
    this.airportsByCountryCache.set(cacheKey, airports);
    return airports;
  }

  async getSnapshotVersion(): Promise<string> {
    const schemaVersionRow = this.database.getOne<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'schema_version' LIMIT 1",
    );
    const fileStat = await stat(this.filePath);
    const schemaVersion = schemaVersionRow?.value ?? "unknown";
    return `flightline-airports:${schemaVersion}:${fileStat.mtime.toISOString()}`;
  }

  async close(): Promise<void> {
    this.lookupCache.clear();
    this.airportsByCountryCache.clear();
    await this.database.close();
  }

  private cacheAirport(airport: AirportRecord | null, primaryLookup?: string): void {
    if (!airport) {
      if (primaryLookup) {
        this.lookupCache.set(primaryLookup, null);
      }
      return;
    }

    const aliases = [
      primaryLookup,
      airport.airportKey,
      airport.identCode,
    ].filter((alias): alias is string => Boolean(alias));

    for (const alias of aliases) {
      this.lookupCache.set(alias.trim().toUpperCase(), airport);
    }
  }

  private mapAirportRow(row: AirportLookupRow): AirportRecord {
    return {
      airportKey: row.airportKey,
      identCode: row.identCode,
      name: row.name,
      airportType: row.airportType,
      airportSize: row.airportSize,
      continent: row.continent ?? undefined,
      isoCountry: row.isoCountry ?? undefined,
      isoRegion: row.isoRegion ?? undefined,
      municipality: row.municipality ?? undefined,
      timezone: row.timezone ?? undefined,
      latitudeDeg: row.latitudeDeg,
      longitudeDeg: row.longitudeDeg,
      scheduledService: row.scheduledService === 1,
      accessibleNow: row.accessibleNow === 1,
      supportsSmallUtility: row.supportsSmallUtility === 1,
      marketRegion: row.marketRegion ?? undefined,
      passengerScore: row.passengerScore ?? 0,
      cargoScore: row.cargoScore ?? 0,
      remoteScore: row.remoteScore ?? 0,
      tourismScore: row.tourismScore ?? 0,
      businessScore: row.businessScore ?? 0,
      demandArchetype: row.demandArchetype ?? undefined,
      contractGenerationWeight: row.contractGenerationWeight ?? 1,
      longestHardRunwayFt: row.longestHardRunwayFt ?? undefined,
    };
  }
}
