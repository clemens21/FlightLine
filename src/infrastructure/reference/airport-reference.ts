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

export class AirportReferenceRepository {
  private constructor(
    private readonly filePath: string,
    private readonly database: SqliteFileDatabase,
  ) {}

  static async open(filePath: string): Promise<AirportReferenceRepository> {
    const database = await SqliteFileDatabase.open(filePath);
    return new AirportReferenceRepository(filePath, database);
  }

  findAirport(lookup: string): AirportRecord | null {
    const normalizedLookup = lookup.trim().toUpperCase();

    if (!normalizedLookup) {
      return null;
    }

    const row = this.database.getOne<AirportLookupRow>(
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
      LEFT JOIN airport_profile AS p ON p.airport_id = a.id
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

    return row ? this.mapAirportRow(row) : null;
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

  async getSnapshotVersion(): Promise<string> {
    const schemaVersionRow = this.database.getOne<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'schema_version' LIMIT 1",
    );
    const fileStat = await stat(this.filePath);
    const schemaVersion = schemaVersionRow?.value ?? "unknown";
    return `flightline-airports:${schemaVersion}:${fileStat.mtime.toISOString()}`;
  }

  async close(): Promise<void> {
    await this.database.close();
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
