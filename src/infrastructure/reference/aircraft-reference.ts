import type { AircraftLayoutId, AircraftModelId } from "../../domain/common/primitives.js";
import { SqliteFileDatabase } from "../persistence/sqlite/sqlite-file-database.js";

interface AircraftModelLookupRow extends Record<string, unknown> {
  modelId: string;
  familyId: string;
  displayName: string;
  shortName: string;
  variantKind: string;
  inServiceRole: string;
  aircraftCategory: string;
  maxPassengers: number;
  maxCargoLb: number;
  maxTakeoffWeightLb: number;
  maxPayloadLb: number;
  cargoVolumeCuft: number;
  rangeNm: number;
  cruiseSpeedKtas: number;
  minimumRunwayFt: number;
  preferredRunwayFt: number;
  hardSurfaceRequired: number;
  roughFieldCapable: number;
  minimumAirportSize: number;
  preferredAirportSize: number;
  gateRequirement: string;
  requiredGroundServiceLevel: string;
  cargoLoadingType: string;
  marketValueUsd: number;
  targetLeaseRateMonthlyUsd: number;
  variableOperatingCostPerHourUsd: number;
  fixedSupportCostPerDayUsd: number;
  maintenanceReservePerHourUsd: number;
  pilotQualificationGroup: string;
  pilotsRequired: number;
  flightAttendantsRequired: number;
  mechanicSkillGroup: string;
  inspectionIntervalHours: number;
  inspectionIntervalCycles: number;
  maintenanceDowntimeHours: number;
  startupEligible: number;
  progressionTier: number;
  marketRolePool: string;
  airportAccessProfile: string;
  bestFitContractTags: string;
  msfs2024Status: string;
  msfs2024AvailableForUser: number;
  msfs2024UserNote: string;
  dataConfidence: string;
}

interface AircraftLayoutLookupRow extends Record<string, unknown> {
  layoutId: string;
  modelId: string;
  displayName: string;
  configType: string;
  isDefault: number;
  totalSeats: number;
  firstClassSeats: number;
  businessClassSeats: number;
  premiumEconomySeats: number;
  economySeats: number;
  cargoCapacityLb: number;
  notes: string;
}

interface CountRow extends Record<string, unknown> {
  countValue: number;
}

export interface AircraftModelRecord {
  modelId: AircraftModelId;
  familyId: string;
  displayName: string;
  shortName: string;
  variantKind: string;
  inServiceRole: string;
  aircraftCategory: string;
  maxPassengers: number;
  maxCargoLb: number;
  maxTakeoffWeightLb: number;
  maxPayloadLb: number;
  cargoVolumeCuft: number;
  rangeNm: number;
  cruiseSpeedKtas: number;
  minimumRunwayFt: number;
  preferredRunwayFt: number;
  hardSurfaceRequired: boolean;
  roughFieldCapable: boolean;
  minimumAirportSize: number;
  preferredAirportSize: number;
  gateRequirement: string;
  requiredGroundServiceLevel: string;
  cargoLoadingType: string;
  marketValueUsd: number;
  targetLeaseRateMonthlyUsd: number;
  variableOperatingCostPerHourUsd: number;
  fixedSupportCostPerDayUsd: number;
  maintenanceReservePerHourUsd: number;
  pilotQualificationGroup: string;
  pilotsRequired: number;
  flightAttendantsRequired: number;
  mechanicSkillGroup: string;
  inspectionIntervalHours: number;
  inspectionIntervalCycles: number;
  maintenanceDowntimeHours: number;
  startupEligible: boolean;
  progressionTier: number;
  marketRolePool: string;
  airportAccessProfile: string;
  bestFitContractTags: string[];
  msfs2024Status: string;
  msfs2024AvailableForUser: boolean;
  msfs2024UserNote: string | undefined;
  dataConfidence: string;
}

export interface AircraftLayoutRecord {
  layoutId: AircraftLayoutId;
  modelId: AircraftModelId;
  displayName: string;
  configType: string;
  isDefault: boolean;
  totalSeats: number;
  firstClassSeats: number;
  businessClassSeats: number;
  premiumEconomySeats: number;
  economySeats: number;
  cargoCapacityLb: number;
  notes: string | undefined;
}

export class AircraftReferenceRepository {
  private constructor(private readonly database: SqliteFileDatabase) {}

  static async open(filePath: string): Promise<AircraftReferenceRepository> {
    const database = await SqliteFileDatabase.open(filePath);
    return new AircraftReferenceRepository(database);
  }

  findModel(modelId: string): AircraftModelRecord | null {
    const row = this.database.getOne<AircraftModelLookupRow>(
      `SELECT
        model_id AS modelId,
        family_id AS familyId,
        display_name AS displayName,
        short_name AS shortName,
        variant_kind AS variantKind,
        in_service_role AS inServiceRole,
        aircraft_category AS aircraftCategory,
        max_passengers AS maxPassengers,
        max_cargo_lb AS maxCargoLb,
        max_takeoff_weight_lb AS maxTakeoffWeightLb,
        max_payload_lb AS maxPayloadLb,
        cargo_volume_cuft AS cargoVolumeCuft,
        range_nm AS rangeNm,
        cruise_speed_ktas AS cruiseSpeedKtas,
        minimum_runway_ft AS minimumRunwayFt,
        preferred_runway_ft AS preferredRunwayFt,
        hard_surface_required AS hardSurfaceRequired,
        rough_field_capable AS roughFieldCapable,
        minimum_airport_size AS minimumAirportSize,
        preferred_airport_size AS preferredAirportSize,
        gate_requirement AS gateRequirement,
        required_ground_service_level AS requiredGroundServiceLevel,
        cargo_loading_type AS cargoLoadingType,
        market_value_usd AS marketValueUsd,
        target_lease_rate_monthly_usd AS targetLeaseRateMonthlyUsd,
        variable_operating_cost_per_hour_usd AS variableOperatingCostPerHourUsd,
        fixed_support_cost_per_day_usd AS fixedSupportCostPerDayUsd,
        maintenance_reserve_per_hour_usd AS maintenanceReservePerHourUsd,
        pilot_qualification_group AS pilotQualificationGroup,
        pilots_required AS pilotsRequired,
        flight_attendants_required AS flightAttendantsRequired,
        mechanic_skill_group AS mechanicSkillGroup,
        inspection_interval_hours AS inspectionIntervalHours,
        inspection_interval_cycles AS inspectionIntervalCycles,
        maintenance_downtime_hours AS maintenanceDowntimeHours,
        startup_eligible AS startupEligible,
        progression_tier AS progressionTier,
        market_role_pool AS marketRolePool,
        airport_access_profile AS airportAccessProfile,
        best_fit_contract_tags AS bestFitContractTags,
        msfs2024_status AS msfs2024Status,
        msfs2024_available_for_user AS msfs2024AvailableForUser,
        msfs2024_user_note AS msfs2024UserNote,
        data_confidence AS dataConfidence
      FROM aircraft_model
      WHERE model_id = $model_id
      LIMIT 1`,
      { $model_id: modelId },
    );

    return row ? this.mapModel(row) : null;
  }

  findLayout(layoutId: string): AircraftLayoutRecord | null {
    const row = this.database.getOne<AircraftLayoutLookupRow>(
      `SELECT
        layout_id AS layoutId,
        model_id AS modelId,
        display_name AS displayName,
        config_type AS configType,
        is_default AS isDefault,
        total_seats AS totalSeats,
        first_class_seats AS firstClassSeats,
        business_class_seats AS businessClassSeats,
        premium_economy_seats AS premiumEconomySeats,
        economy_seats AS economySeats,
        cargo_capacity_lb AS cargoCapacityLb,
        notes AS notes
      FROM aircraft_cabin_layout
      WHERE layout_id = $layout_id
      LIMIT 1`,
      { $layout_id: layoutId },
    );

    return row ? this.mapLayout(row) : null;
  }

  findDefaultLayoutForModel(modelId: string): AircraftLayoutRecord | null {
    const row = this.database.getOne<AircraftLayoutLookupRow>(
      `SELECT
        layout_id AS layoutId,
        model_id AS modelId,
        display_name AS displayName,
        config_type AS configType,
        is_default AS isDefault,
        total_seats AS totalSeats,
        first_class_seats AS firstClassSeats,
        business_class_seats AS businessClassSeats,
        premium_economy_seats AS premiumEconomySeats,
        economy_seats AS economySeats,
        cargo_capacity_lb AS cargoCapacityLb,
        notes AS notes
      FROM aircraft_cabin_layout
      WHERE model_id = $model_id
      ORDER BY is_default DESC, total_seats DESC, layout_id ASC
      LIMIT 1`,
      { $model_id: modelId },
    );

    return row ? this.mapLayout(row) : null;
  }

  pilotQualificationGroupExists(qualificationGroup: string): boolean {
    const row = this.database.getOne<CountRow>(
      `SELECT COUNT(*) AS countValue
      FROM aircraft_model
      WHERE pilot_qualification_group = $qualification_group`,
      { $qualification_group: qualificationGroup },
    );

    return (row?.countValue ?? 0) > 0;
  }

  mechanicSkillGroupExists(qualificationGroup: string): boolean {
    const row = this.database.getOne<CountRow>(
      `SELECT COUNT(*) AS countValue
      FROM aircraft_model
      WHERE mechanic_skill_group = $qualification_group`,
      { $qualification_group: qualificationGroup },
    );

    return (row?.countValue ?? 0) > 0;
  }

  async close(): Promise<void> {
    await this.database.close();
  }

  private mapModel(row: AircraftModelLookupRow): AircraftModelRecord {
    return {
      modelId: row.modelId,
      familyId: row.familyId,
      displayName: row.displayName,
      shortName: row.shortName,
      variantKind: row.variantKind,
      inServiceRole: row.inServiceRole,
      aircraftCategory: row.aircraftCategory,
      maxPassengers: row.maxPassengers,
      maxCargoLb: row.maxCargoLb,
      maxTakeoffWeightLb: row.maxTakeoffWeightLb,
      maxPayloadLb: row.maxPayloadLb,
      cargoVolumeCuft: row.cargoVolumeCuft,
      rangeNm: row.rangeNm,
      cruiseSpeedKtas: row.cruiseSpeedKtas,
      minimumRunwayFt: row.minimumRunwayFt,
      preferredRunwayFt: row.preferredRunwayFt,
      hardSurfaceRequired: row.hardSurfaceRequired === 1,
      roughFieldCapable: row.roughFieldCapable === 1,
      minimumAirportSize: row.minimumAirportSize,
      preferredAirportSize: row.preferredAirportSize,
      gateRequirement: row.gateRequirement,
      requiredGroundServiceLevel: row.requiredGroundServiceLevel,
      cargoLoadingType: row.cargoLoadingType,
      marketValueUsd: row.marketValueUsd,
      targetLeaseRateMonthlyUsd: row.targetLeaseRateMonthlyUsd,
      variableOperatingCostPerHourUsd: row.variableOperatingCostPerHourUsd,
      fixedSupportCostPerDayUsd: row.fixedSupportCostPerDayUsd,
      maintenanceReservePerHourUsd: row.maintenanceReservePerHourUsd,
      pilotQualificationGroup: row.pilotQualificationGroup,
      pilotsRequired: row.pilotsRequired,
      flightAttendantsRequired: row.flightAttendantsRequired,
      mechanicSkillGroup: row.mechanicSkillGroup,
      inspectionIntervalHours: row.inspectionIntervalHours,
      inspectionIntervalCycles: row.inspectionIntervalCycles,
      maintenanceDowntimeHours: row.maintenanceDowntimeHours,
      startupEligible: row.startupEligible === 1,
      progressionTier: row.progressionTier,
      marketRolePool: row.marketRolePool,
      airportAccessProfile: row.airportAccessProfile,
      bestFitContractTags: row.bestFitContractTags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
      msfs2024Status: row.msfs2024Status,
      msfs2024AvailableForUser: row.msfs2024AvailableForUser === 1,
      msfs2024UserNote: row.msfs2024UserNote.trim() ? row.msfs2024UserNote : undefined,
      dataConfidence: row.dataConfidence,
    };
  }

  private mapLayout(row: AircraftLayoutLookupRow): AircraftLayoutRecord {
    return {
      layoutId: row.layoutId,
      modelId: row.modelId,
      displayName: row.displayName,
      configType: row.configType,
      isDefault: row.isDefault === 1,
      totalSeats: row.totalSeats,
      firstClassSeats: row.firstClassSeats,
      businessClassSeats: row.businessClassSeats,
      premiumEconomySeats: row.premiumEconomySeats,
      economySeats: row.economySeats,
      cargoCapacityLb: row.cargoCapacityLb,
      notes: row.notes.trim() ? row.notes : undefined,
    };
  }
}
