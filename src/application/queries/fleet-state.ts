import type { SaveId, UtcIsoString } from "../../domain/common/primitives.js";
import type { OwnershipType } from "../../domain/fleet/types.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";
import { loadActiveCompanyContext } from "./company-state.js";

interface FleetAircraftRow extends Record<string, unknown> {
  aircraftId: string;
  aircraftModelId: string;
  activeCabinLayoutId: string | null;
  registration: string;
  displayName: string;
  ownershipType: OwnershipType;
  currentAirportId: string;
  deliveryState: string;
  airframeHoursTotal: number;
  airframeCyclesTotal: number;
  conditionValue: number;
  statusInput: string;
  dispatchAvailable: number;
  activeScheduleId: string | null;
  activeMaintenanceTaskId: string | null;
  acquiredAtUtc: string;
  acquisitionAgreementId: string | null;
  recurringPaymentAmount: number | null;
  paymentCadence: "weekly" | "monthly" | null;
  agreementEndAtUtc: string | null;
}

export interface FleetAircraftView {
  aircraftId: string;
  aircraftModelId: string;
  modelDisplayName: string;
  registration: string;
  displayName: string;
  ownershipType: OwnershipType;
  currentAirportId: string;
  deliveryState: string;
  airframeHoursTotal: number;
  airframeCyclesTotal: number;
  conditionValue: number;
  statusInput: string;
  dispatchAvailable: boolean;
  activeScheduleId: string | undefined;
  activeMaintenanceTaskId: string | undefined;
  acquiredAtUtc: UtcIsoString;
  activeCabinLayoutId: string | undefined;
  activeCabinLayoutDisplayName: string | undefined;
  activeCabinSeats: number | undefined;
  activeCabinCargoCapacityLb: number | undefined;
  acquisitionAgreementId: string | undefined;
  recurringPaymentAmount: number | undefined;
  paymentCadence: "weekly" | "monthly" | undefined;
  agreementEndAtUtc: UtcIsoString | undefined;
  minimumAirportSize: number;
  minimumRunwayFt: number;
  rangeNm: number;
  maxPassengers: number;
  maxCargoLb: number;
  pilotQualificationGroup: string;
  pilotsRequired: number;
  flightAttendantsRequired: number;
  mechanicSkillGroup: string;
  msfs2024Status: string;
}

export interface FleetStateView {
  saveId: SaveId;
  companyId: string;
  aircraft: FleetAircraftView[];
  totalAircraftCount: number;
  dispatchAvailableCount: number;
  ownedCount: number;
  financedCount: number;
  leasedCount: number;
}

export function loadFleetState(
  saveDatabase: SqliteFileDatabase,
  aircraftReference: AircraftReferenceRepository,
  saveId: SaveId,
): FleetStateView | null {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);

  if (!companyContext) {
    return null;
  }

  const rows = saveDatabase.all<FleetAircraftRow>(
    `SELECT
      ca.aircraft_id AS aircraftId,
      ca.aircraft_model_id AS aircraftModelId,
      ca.active_cabin_layout_id AS activeCabinLayoutId,
      ca.registration AS registration,
      ca.display_name AS displayName,
      ca.ownership_type AS ownershipType,
      ca.current_airport_id AS currentAirportId,
      ca.delivery_state AS deliveryState,
      ca.airframe_hours_total AS airframeHoursTotal,
      ca.airframe_cycles_total AS airframeCyclesTotal,
      ca.condition_value AS conditionValue,
      ca.status_input AS statusInput,
      ca.dispatch_available AS dispatchAvailable,
      ca.active_schedule_id AS activeScheduleId,
      ca.active_maintenance_task_id AS activeMaintenanceTaskId,
      ca.acquired_at_utc AS acquiredAtUtc,
      aa.acquisition_agreement_id AS acquisitionAgreementId,
      aa.recurring_payment_amount AS recurringPaymentAmount,
      aa.payment_cadence AS paymentCadence,
      aa.end_at_utc AS agreementEndAtUtc
    FROM company_aircraft AS ca
    LEFT JOIN acquisition_agreement AS aa ON aa.aircraft_id = ca.aircraft_id
    WHERE ca.company_id = $company_id
    ORDER BY ca.acquired_at_utc, ca.registration`,
    { $company_id: companyContext.companyId },
  );

  const aircraft = rows.map<FleetAircraftView>((row) => {
    const model = aircraftReference.findModel(row.aircraftModelId);

    if (!model) {
      throw new Error(`Aircraft model ${row.aircraftModelId} is missing from the reference database.`);
    }

    const layout = row.activeCabinLayoutId ? aircraftReference.findLayout(row.activeCabinLayoutId) : null;

    return {
      aircraftId: row.aircraftId,
      aircraftModelId: row.aircraftModelId,
      modelDisplayName: model.displayName,
      registration: row.registration,
      displayName: row.displayName,
      ownershipType: row.ownershipType,
      currentAirportId: row.currentAirportId,
      deliveryState: row.deliveryState,
      airframeHoursTotal: row.airframeHoursTotal,
      airframeCyclesTotal: row.airframeCyclesTotal,
      conditionValue: row.conditionValue,
      statusInput: row.statusInput,
      dispatchAvailable: row.dispatchAvailable === 1,
      activeScheduleId: row.activeScheduleId ?? undefined,
      activeMaintenanceTaskId: row.activeMaintenanceTaskId ?? undefined,
      acquiredAtUtc: row.acquiredAtUtc,
      activeCabinLayoutId: row.activeCabinLayoutId ?? undefined,
      activeCabinLayoutDisplayName: layout?.displayName,
      activeCabinSeats: layout?.totalSeats,
      activeCabinCargoCapacityLb: layout?.cargoCapacityLb,
      acquisitionAgreementId: row.acquisitionAgreementId ?? undefined,
      recurringPaymentAmount: row.recurringPaymentAmount ?? undefined,
      paymentCadence: row.paymentCadence ?? undefined,
      agreementEndAtUtc: row.agreementEndAtUtc ?? undefined,
      minimumAirportSize: model.minimumAirportSize,
      minimumRunwayFt: model.minimumRunwayFt,
      rangeNm: model.rangeNm,
      maxPassengers: model.maxPassengers,
      maxCargoLb: model.maxCargoLb,
      pilotQualificationGroup: model.pilotQualificationGroup,
      pilotsRequired: model.pilotsRequired,
      flightAttendantsRequired: model.flightAttendantsRequired,
      mechanicSkillGroup: model.mechanicSkillGroup,
      msfs2024Status: model.msfs2024Status,
    };
  });

  return {
    saveId,
    companyId: companyContext.companyId,
    aircraft,
    totalAircraftCount: aircraft.length,
    dispatchAvailableCount: aircraft.filter((entry) => entry.dispatchAvailable).length,
    ownedCount: aircraft.filter((entry) => entry.ownershipType === "owned").length,
    financedCount: aircraft.filter((entry) => entry.ownershipType === "financed").length,
    leasedCount: aircraft.filter((entry) => entry.ownershipType === "leased").length,
  };
}
