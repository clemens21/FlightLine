/*
 * Implements the acquire aircraft command handler for the backend command pipeline.
 * Files in this layer validate a request, mutate save-state tables inside a transaction, and return structured results for callers.
 * The command turns a market offer plus chosen deal terms into real fleet state: aircraft row, acquisition agreement,
 * recurring obligations, ledger entries, and the resulting company financial posture.
 */

import type { CommandResult, AcquireAircraftCommand } from "./types.js";
import {
  addCadenceToUtc,
  addUtcMonths,
  calculateFinanceRecurringPayment,
  createPrefixedId,
  deriveFinancialPressureBand,
  normalizeUpperCode,
} from "./utils.js";
import { loadActiveCompanyContext } from "../queries/company-state.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AirportReferenceRepository } from "../../infrastructure/reference/airport-reference.js";
import type { AircraftReferenceRepository, AircraftLayoutRecord, AircraftModelRecord } from "../../infrastructure/reference/aircraft-reference.js";

interface AcquireAircraftDependencies {
  saveDatabase: SqliteFileDatabase;
  airportReference: AirportReferenceRepository;
  aircraftReference: AircraftReferenceRepository;
}

interface ExistingAircraftRow extends Record<string, unknown> {
  aircraftId: string;
}

interface AcquisitionTerms {
  upfrontPaymentAmount: number;
  recurringPaymentAmount: number | null;
  paymentCadence: "weekly" | "monthly" | null;
  termMonths: number | null;
  endAtUtc: string | null;
  rateBandOrApr: number | null;
}

interface MarketOfferRow extends Record<string, unknown> {
  aircraftOfferId: string;
  companyId: string;
  aircraftModelId: string;
  activeCabinLayoutId: string | null;
  currentAirportId: string;
  registration: string;
  displayName: string;
  conditionValue: number;
  conditionBandInput: string;
  statusInput: string;
  airframeHoursTotal: number;
  airframeCyclesTotal: number;
  hoursSinceInspection: number;
  cyclesSinceInspection: number;
  hoursToService: number;
  maintenanceStateInput: string;
  aogFlag: number;
  askingPurchasePriceAmount: number;
  financeTermsJson: string;
  leaseTermsJson: string;
  offerStatus: string;
}

function resolveCabinLayout(
  preferredLayoutId: string | undefined,
  aircraftReference: AircraftReferenceRepository,
  aircraftModel: AircraftModelRecord,
  hardBlockers: string[],
): AircraftLayoutRecord | null {
  if (preferredLayoutId) {
    const selectedLayout = aircraftReference.findLayout(preferredLayoutId);

    if (!selectedLayout) {
      hardBlockers.push(`Aircraft cabin layout ${preferredLayoutId} was not found.`);
      return null;
    }

    if (selectedLayout.modelId !== aircraftModel.modelId) {
      hardBlockers.push(
        `Aircraft cabin layout ${selectedLayout.layoutId} does not belong to model ${aircraftModel.modelId}.`,
      );
      return null;
    }

    return selectedLayout;
  }

  const defaultLayout = aircraftReference.findDefaultLayoutForModel(aircraftModel.modelId);

  if (aircraftModel.maxPassengers > 0 && !defaultLayout) {
    hardBlockers.push(`Aircraft model ${aircraftModel.modelId} requires a cabin layout but none is configured.`);
    return null;
  }

  return defaultLayout;
}

function deriveAcquisitionTerms(command: AcquireAircraftCommand, aircraftModel: AircraftModelRecord, acquiredAtUtc: string): AcquisitionTerms {
  switch (command.payload.ownershipType) {
    case "owned": {
      return {
        upfrontPaymentAmount: Math.round(command.payload.upfrontPaymentAmount ?? aircraftModel.marketValueUsd),
        recurringPaymentAmount: null,
        paymentCadence: null,
        termMonths: null,
        endAtUtc: null,
        rateBandOrApr: null,
      };
    }

    case "financed": {
      const termMonths = Math.max(1, command.payload.termMonths ?? 60);
      const paymentCadence = command.payload.paymentCadence ?? "monthly";
      const rateBandOrApr = command.payload.rateBandOrApr ?? 7;
      const upfrontPaymentAmount = Math.round(command.payload.upfrontPaymentAmount ?? aircraftModel.marketValueUsd * 0.15);
      const principalAmount = Math.max(0, aircraftModel.marketValueUsd - upfrontPaymentAmount);
      const recurringPaymentAmount = Math.round(
        command.payload.recurringPaymentAmount
        ?? calculateFinanceRecurringPayment(principalAmount, rateBandOrApr, termMonths, paymentCadence),
      );

      return {
        upfrontPaymentAmount,
        recurringPaymentAmount,
        paymentCadence,
        termMonths,
        endAtUtc: addUtcMonths(acquiredAtUtc, termMonths),
        rateBandOrApr,
      };
    }

    case "leased": {
      const termMonths = Math.max(1, command.payload.termMonths ?? 12);
      const paymentCadence = command.payload.paymentCadence ?? "monthly";
      const recurringPaymentAmount = Math.round(
        command.payload.recurringPaymentAmount ?? aircraftModel.targetLeaseRateMonthlyUsd,
      );
      const upfrontPaymentAmount = Math.round(command.payload.upfrontPaymentAmount ?? recurringPaymentAmount);

      return {
        upfrontPaymentAmount,
        recurringPaymentAmount,
        paymentCadence,
        termMonths,
        endAtUtc: addUtcMonths(acquiredAtUtc, termMonths),
        rateBandOrApr: command.payload.rateBandOrApr ?? null,
      };
    }
  }
}

function parseTermsJson(rawValue: string, acquiredAtUtc: string): AcquisitionTerms {
  const parsed = JSON.parse(rawValue) as {
    upfrontPaymentAmount: number;
    recurringPaymentAmount?: number;
    paymentCadence?: "weekly" | "monthly";
    termMonths?: number;
    rateBandOrApr?: number;
  };

  return {
    upfrontPaymentAmount: Math.round(parsed.upfrontPaymentAmount),
    recurringPaymentAmount: parsed.recurringPaymentAmount !== undefined ? Math.round(parsed.recurringPaymentAmount) : null,
    paymentCadence: parsed.paymentCadence ?? null,
    termMonths: parsed.termMonths ?? null,
    endAtUtc: parsed.termMonths ? addUtcMonths(acquiredAtUtc, parsed.termMonths) : null,
    rateBandOrApr: parsed.rateBandOrApr ?? null,
  };
}

function deriveMarketOfferTerms(
  command: AcquireAircraftCommand,
  marketOffer: MarketOfferRow,
  acquiredAtUtc: string,
): AcquisitionTerms {
  if (command.payload.ownershipType === "owned") {
    return {
      upfrontPaymentAmount: marketOffer.askingPurchasePriceAmount,
      recurringPaymentAmount: null,
      paymentCadence: null,
      termMonths: null,
      endAtUtc: null,
      rateBandOrApr: null,
    };
  }

  const baseTerms = parseTermsJson(
    command.payload.ownershipType === "financed" ? marketOffer.financeTermsJson : marketOffer.leaseTermsJson,
    acquiredAtUtc,
  );

  const hasOverride =
    command.payload.upfrontPaymentAmount !== undefined
    || command.payload.recurringPaymentAmount !== undefined
    || command.payload.paymentCadence !== undefined
    || command.payload.termMonths !== undefined
    || command.payload.rateBandOrApr !== undefined;

  if (!hasOverride) {
    return baseTerms;
  }

  const termMonths = command.payload.termMonths ?? baseTerms.termMonths ?? null;

  return {
    upfrontPaymentAmount: Math.round(command.payload.upfrontPaymentAmount ?? baseTerms.upfrontPaymentAmount),
    recurringPaymentAmount: command.payload.recurringPaymentAmount !== undefined
      ? Math.round(command.payload.recurringPaymentAmount)
      : baseTerms.recurringPaymentAmount ?? null,
    paymentCadence: command.payload.paymentCadence ?? baseTerms.paymentCadence ?? null,
    termMonths,
    endAtUtc: termMonths ? addUtcMonths(acquiredAtUtc, termMonths) : null,
    rateBandOrApr: command.payload.rateBandOrApr ?? baseTerms.rateBandOrApr ?? null,
  };
}

export async function handleAcquireAircraft(
  command: AcquireAircraftCommand,
  dependencies: AcquireAircraftDependencies,
): Promise<CommandResult> {
  const hardBlockers: string[] = [];
  const warnings: string[] = [];
  const companyContext = loadActiveCompanyContext(dependencies.saveDatabase, command.saveId);

  if (!companyContext) {
    hardBlockers.push(`Save ${command.saveId} does not have an active company.`);
  }

  const marketOffer = command.payload.sourceOfferId
    ? dependencies.saveDatabase.getOne<MarketOfferRow>(
        `SELECT
          aircraft_offer_id AS aircraftOfferId,
          company_id AS companyId,
          aircraft_model_id AS aircraftModelId,
          active_cabin_layout_id AS activeCabinLayoutId,
          current_airport_id AS currentAirportId,
          registration AS registration,
          display_name AS displayName,
          condition_value AS conditionValue,
          condition_band_input AS conditionBandInput,
          status_input AS statusInput,
          airframe_hours_total AS airframeHoursTotal,
          airframe_cycles_total AS airframeCyclesTotal,
          hours_since_inspection AS hoursSinceInspection,
          cycles_since_inspection AS cyclesSinceInspection,
          hours_to_service AS hoursToService,
          maintenance_state_input AS maintenanceStateInput,
          aog_flag AS aogFlag,
          asking_purchase_price_amount AS askingPurchasePriceAmount,
          finance_terms_json AS financeTermsJson,
          lease_terms_json AS leaseTermsJson,
          offer_status AS offerStatus
        FROM aircraft_offer
        WHERE aircraft_offer_id = $aircraft_offer_id
        LIMIT 1`,
        { $aircraft_offer_id: command.payload.sourceOfferId },
      )
    : null;

  if (command.payload.sourceOfferId && !marketOffer) {
    hardBlockers.push(`Aircraft offer ${command.payload.sourceOfferId} was not found.`);
  }

  const aircraftModel = dependencies.aircraftReference.findModel(command.payload.aircraftModelId);

  if (!aircraftModel) {
    hardBlockers.push(`Aircraft model ${command.payload.aircraftModelId} was not found in the aircraft reference database.`);
  }

  if (marketOffer) {
    if (companyContext && marketOffer.companyId !== companyContext.companyId) {
      hardBlockers.push(`Aircraft offer ${marketOffer.aircraftOfferId} does not belong to this company market.`);
    }

    if (marketOffer.offerStatus !== "available") {
      hardBlockers.push(`Aircraft offer ${marketOffer.aircraftOfferId} is no longer available.`);
    }

    if (marketOffer.aircraftModelId !== command.payload.aircraftModelId) {
      hardBlockers.push(`Aircraft offer ${marketOffer.aircraftOfferId} does not match model ${command.payload.aircraftModelId}.`);
    }

    if (marketOffer.currentAirportId !== command.payload.deliveryAirportId) {
      hardBlockers.push(`Aircraft offer ${marketOffer.aircraftOfferId} is listed at ${marketOffer.currentAirportId}, not ${command.payload.deliveryAirportId}.`);
    }
  }

  const deliveryAirport = dependencies.airportReference.findAirport(command.payload.deliveryAirportId);

  if (!deliveryAirport) {
    hardBlockers.push(`Delivery airport ${command.payload.deliveryAirportId} was not found in the airport reference database.`);
  }

  const normalizedRegistration = normalizeUpperCode(command.payload.registration);

  if (!normalizedRegistration) {
    hardBlockers.push("Aircraft registration is required.");
  }

  const selectedLayout = aircraftModel
    ? resolveCabinLayout(
        command.payload.activeCabinLayoutId ?? marketOffer?.activeCabinLayoutId ?? undefined,
        dependencies.aircraftReference,
        aircraftModel,
        hardBlockers,
      )
    : null;

  if (deliveryAirport) {
    if (!deliveryAirport.accessibleNow) {
      hardBlockers.push(`Delivery airport ${deliveryAirport.airportKey} is not currently accessible for gameplay.`);
    }

    if (aircraftModel && deliveryAirport.airportSize !== null && deliveryAirport.airportSize < aircraftModel.minimumAirportSize) {
      hardBlockers.push(
        `Delivery airport ${deliveryAirport.airportKey} is size ${deliveryAirport.airportSize} but ${aircraftModel.displayName} requires size ${aircraftModel.minimumAirportSize}.`,
      );
    }

    if (aircraftModel && deliveryAirport.longestHardRunwayFt !== undefined && deliveryAirport.longestHardRunwayFt < aircraftModel.minimumRunwayFt) {
      hardBlockers.push(
        `Delivery airport ${deliveryAirport.airportKey} runway is too short for ${aircraftModel.displayName}.`,
      );
    }

    if (aircraftModel && deliveryAirport.longestHardRunwayFt === undefined) {
      warnings.push(`Delivery airport ${deliveryAirport.airportKey} is missing runway-length data, so suitability could not be fully verified.`);
    }
  }

  if (aircraftModel && !aircraftModel.startupEligible && companyContext?.companyPhase === "startup") {
    warnings.push(`${aircraftModel.displayName} is outside the recommended startup roster and may create early-game pressure.`);
  }

  if (aircraftModel && aircraftModel.msfs2024Status !== "confirmed_available") {
    warnings.push(`MSFS 2024 status for ${aircraftModel.displayName} is ${aircraftModel.msfs2024Status}.`);
  }

  const effectiveRegistration = marketOffer?.registration ?? normalizedRegistration;
  const effectiveDisplayName = marketOffer?.displayName ?? (command.payload.displayName?.trim() || aircraftModel?.displayName);

  const existingRegistration = companyContext && effectiveRegistration
    ? dependencies.saveDatabase.getOne<ExistingAircraftRow>(
        `SELECT aircraft_id AS aircraftId
        FROM company_aircraft
        WHERE company_id = $company_id
          AND UPPER(registration) = $registration
        LIMIT 1`,
        {
          $company_id: companyContext.companyId,
          $registration: effectiveRegistration,
        },
      )
    : null;

  if (existingRegistration) {
    hardBlockers.push(`Aircraft registration ${effectiveRegistration} is already in use by this company.`);
  }

  const acquiredAtUtc = companyContext?.currentTimeUtc ?? command.issuedAtUtc;
  const acquisitionTerms = aircraftModel
    ? marketOffer
      ? deriveMarketOfferTerms(command, marketOffer, acquiredAtUtc)
      : deriveAcquisitionTerms(command, aircraftModel, acquiredAtUtc)
    : null;

  if (acquisitionTerms) {
    if (acquisitionTerms.upfrontPaymentAmount < 0) {
      hardBlockers.push("Aircraft upfront payment cannot be negative.");
    }

    if ((acquisitionTerms.recurringPaymentAmount ?? 0) < 0) {
      hardBlockers.push("Aircraft recurring payment cannot be negative.");
    }

    if ((acquisitionTerms.termMonths ?? 1) <= 0) {
      hardBlockers.push("Aircraft term months must be greater than zero.");
    }

    if (companyContext && acquisitionTerms.upfrontPaymentAmount > companyContext.currentCashAmount) {
      hardBlockers.push(`Company does not have enough cash to cover the upfront aircraft payment of ${acquisitionTerms.upfrontPaymentAmount}.`);
    }
  }

  if (hardBlockers.length > 0) {
    return {
      success: false,
      commandId: command.commandId,
      changedAggregateIds: [],
      validationMessages: [...hardBlockers, ...warnings],
      hardBlockers,
      warnings,
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  const aircraftId = createPrefixedId("aircraft");
  const acquisitionAgreementId = createPrefixedId("acq");
  const maintenanceProgramStateAircraftId = aircraftId;
  const recurringObligationId = acquisitionTerms!.recurringPaymentAmount ? createPrefixedId("obligation") : null;
  const ledgerEntryId = acquisitionTerms!.upfrontPaymentAmount > 0 ? createPrefixedId("ledger") : null;
  const eventLogEntryId = createPrefixedId("event");
  const displayName = effectiveDisplayName ?? aircraftModel!.displayName;
  const updatedCashAmount = companyContext!.currentCashAmount - acquisitionTerms!.upfrontPaymentAmount;
  const financialPressureBand = deriveFinancialPressureBand(updatedCashAmount);
  const seededConditionValue = marketOffer?.conditionValue ?? command.payload.seededConditionValue ?? 1.0;
  const seededStatusInput = marketOffer?.statusInput ?? command.payload.seededStatusInput ?? "idle";
  const seededAirframeHoursTotal = marketOffer?.airframeHoursTotal ?? command.payload.seededAirframeHoursTotal ?? 0;
  const seededAirframeCyclesTotal = marketOffer?.airframeCyclesTotal ?? command.payload.seededAirframeCyclesTotal ?? 0;
  const seededConditionBandInput = marketOffer?.conditionBandInput ?? command.payload.seededConditionBandInput ?? "excellent";
  const seededHoursSinceInspection = marketOffer?.hoursSinceInspection ?? command.payload.seededHoursSinceInspection ?? 0;
  const seededCyclesSinceInspection = marketOffer?.cyclesSinceInspection ?? command.payload.seededCyclesSinceInspection ?? 0;
  const seededHoursToService = marketOffer?.hoursToService ?? command.payload.seededHoursToService ?? aircraftModel!.inspectionIntervalHours;
  const seededMaintenanceStateInput = marketOffer?.maintenanceStateInput ?? command.payload.seededMaintenanceStateInput ?? "current";
  const seededAogFlag = marketOffer ? marketOffer.aogFlag === 1 : command.payload.seededAogFlag ?? false;
  const dispatchAvailable = !seededAogFlag && seededStatusInput !== "grounded" && seededMaintenanceStateInput !== "aog";

  dependencies.saveDatabase.transaction(() => {
    dependencies.saveDatabase.run(
      `INSERT INTO company_aircraft (
        aircraft_id,
        company_id,
        aircraft_model_id,
        active_cabin_layout_id,
        registration,
        display_name,
        ownership_type,
        current_airport_id,
        delivery_state,
        airframe_hours_total,
        airframe_cycles_total,
        condition_value,
        status_input,
        dispatch_available,
        active_schedule_id,
        active_maintenance_task_id,
        acquired_at_utc
      ) VALUES (
        $aircraft_id,
        $company_id,
        $aircraft_model_id,
        $active_cabin_layout_id,
        $registration,
        $display_name,
        $ownership_type,
        $current_airport_id,
        'available',
        $airframe_hours_total,
        $airframe_cycles_total,
        $condition_value,
        $status_input,
        $dispatch_available,
        NULL,
        NULL,
        $acquired_at_utc
      )`,
      {
        $aircraft_id: aircraftId,
        $company_id: companyContext!.companyId,
        $aircraft_model_id: aircraftModel!.modelId,
        $active_cabin_layout_id: selectedLayout?.layoutId ?? null,
        $registration: effectiveRegistration,
        $display_name: displayName,
        $ownership_type: command.payload.ownershipType,
        $current_airport_id: deliveryAirport!.airportKey,
        $airframe_hours_total: seededAirframeHoursTotal,
        $airframe_cycles_total: seededAirframeCyclesTotal,
        $condition_value: seededConditionValue,
        $status_input: seededStatusInput,
        $dispatch_available: dispatchAvailable ? 1 : 0,
        $acquired_at_utc: acquiredAtUtc,
      },
    );

    dependencies.saveDatabase.run(
      `INSERT INTO acquisition_agreement (
        acquisition_agreement_id,
        aircraft_id,
        agreement_type,
        origin_offer_id,
        start_at_utc,
        upfront_payment_amount,
        recurring_payment_amount,
        payment_cadence,
        term_months,
        end_at_utc,
        rate_band_or_apr,
        status
      ) VALUES (
        $acquisition_agreement_id,
        $aircraft_id,
        $agreement_type,
        $origin_offer_id,
        $start_at_utc,
        $upfront_payment_amount,
        $recurring_payment_amount,
        $payment_cadence,
        $term_months,
        $end_at_utc,
        $rate_band_or_apr,
        'active'
      )`,
      {
        $acquisition_agreement_id: acquisitionAgreementId,
        $aircraft_id: aircraftId,
        $agreement_type: command.payload.ownershipType,
        $origin_offer_id: command.payload.sourceOfferId ?? null,
        $start_at_utc: acquiredAtUtc,
        $upfront_payment_amount: acquisitionTerms!.upfrontPaymentAmount,
        $recurring_payment_amount: acquisitionTerms!.recurringPaymentAmount,
        $payment_cadence: acquisitionTerms!.paymentCadence,
        $term_months: acquisitionTerms!.termMonths,
        $end_at_utc: acquisitionTerms!.endAtUtc,
        $rate_band_or_apr: acquisitionTerms!.rateBandOrApr,
      },
    );

    dependencies.saveDatabase.run(
      `INSERT INTO maintenance_program_state (
        aircraft_id,
        condition_band_input,
        hours_since_inspection,
        cycles_since_inspection,
        hours_to_service,
        last_inspection_at_utc,
        last_heavy_service_at_utc,
        maintenance_state_input,
        aog_flag,
        updated_at_utc
      ) VALUES (
        $aircraft_id,
        $condition_band_input,
        $hours_since_inspection,
        $cycles_since_inspection,
        $hours_to_service,
        $last_inspection_at_utc,
        $last_heavy_service_at_utc,
        $maintenance_state_input,
        $aog_flag,
        $updated_at_utc
      )`,
      {
        $aircraft_id: maintenanceProgramStateAircraftId,
        $condition_band_input: seededConditionBandInput,
        $hours_since_inspection: seededHoursSinceInspection,
        $cycles_since_inspection: seededCyclesSinceInspection,
        $hours_to_service: seededHoursToService,
        $last_inspection_at_utc: acquiredAtUtc,
        $last_heavy_service_at_utc: acquiredAtUtc,
        $maintenance_state_input: seededMaintenanceStateInput,
        $aog_flag: seededAogFlag ? 1 : 0,
        $updated_at_utc: acquiredAtUtc,
      },
    );

    dependencies.saveDatabase.run(
      `UPDATE company_financial_state
      SET current_cash_amount = $current_cash_amount,
          financial_pressure_band = $financial_pressure_band,
          updated_at_utc = $updated_at_utc
      WHERE company_id = $company_id`,
      {
        $current_cash_amount: updatedCashAmount,
        $financial_pressure_band: financialPressureBand,
        $updated_at_utc: acquiredAtUtc,
        $company_id: companyContext!.companyId,
      },
    );

    if (recurringObligationId && acquisitionTerms!.paymentCadence && acquisitionTerms!.recurringPaymentAmount) {
      dependencies.saveDatabase.run(
        `INSERT INTO recurring_obligation (
          recurring_obligation_id,
          company_id,
          obligation_type,
          source_object_type,
          source_object_id,
          amount,
          cadence,
          next_due_at_utc,
          end_at_utc,
          status
        ) VALUES (
          $recurring_obligation_id,
          $company_id,
          $obligation_type,
          'acquisition_agreement',
          $source_object_id,
          $amount,
          $cadence,
          $next_due_at_utc,
          $end_at_utc,
          'active'
        )`,
        {
          $recurring_obligation_id: recurringObligationId,
          $company_id: companyContext!.companyId,
          $obligation_type: command.payload.ownershipType === "leased" ? "lease" : "finance",
          $source_object_id: acquisitionAgreementId,
          $amount: acquisitionTerms!.recurringPaymentAmount,
          $cadence: acquisitionTerms!.paymentCadence,
          $next_due_at_utc: addCadenceToUtc(acquiredAtUtc, acquisitionTerms!.paymentCadence),
          $end_at_utc: acquisitionTerms!.endAtUtc,
        },
      );
    }

    if (ledgerEntryId) {
      dependencies.saveDatabase.run(
        `INSERT INTO ledger_entry (
          ledger_entry_id,
          company_id,
          entry_time_utc,
          entry_type,
          amount,
          currency_code,
          source_object_type,
          source_object_id,
          description,
          metadata_json
        ) VALUES (
          $ledger_entry_id,
          $company_id,
          $entry_time_utc,
          'aircraft_acquisition',
          $amount,
          'USD',
          'aircraft',
          $source_object_id,
          $description,
          $metadata_json
        )`,
        {
          $ledger_entry_id: ledgerEntryId,
          $company_id: companyContext!.companyId,
          $entry_time_utc: acquiredAtUtc,
          $amount: acquisitionTerms!.upfrontPaymentAmount * -1,
          $source_object_id: aircraftId,
          $description: `Acquired ${aircraftModel!.displayName} (${effectiveRegistration}).`,
          $metadata_json: JSON.stringify({
            ownershipType: command.payload.ownershipType,
            deliveryAirportId: deliveryAirport!.airportKey,
            acquisitionAgreementId,
          }),
        },
      );
    }

    if (marketOffer) {
      dependencies.saveDatabase.run(
        `UPDATE aircraft_offer
        SET offer_status = 'acquired',
            closed_at_utc = $closed_at_utc,
            close_reason = 'acquired'
        WHERE aircraft_offer_id = $aircraft_offer_id`,
        {
          $aircraft_offer_id: marketOffer.aircraftOfferId,
          $closed_at_utc: acquiredAtUtc,
        },
      );
    }

    dependencies.saveDatabase.run(
      `INSERT INTO event_log_entry (
        event_log_entry_id,
        save_id,
        company_id,
        event_time_utc,
        event_type,
        source_object_type,
        source_object_id,
        severity,
        message,
        metadata_json
      ) VALUES (
        $event_log_entry_id,
        $save_id,
        $company_id,
        $event_time_utc,
        'aircraft_acquired',
        'aircraft',
        $source_object_id,
        'info',
        $message,
        $metadata_json
      )`,
      {
        $event_log_entry_id: eventLogEntryId,
        $save_id: command.saveId,
        $company_id: companyContext!.companyId,
        $event_time_utc: acquiredAtUtc,
        $source_object_id: aircraftId,
        $message: `Acquired ${aircraftModel!.displayName} as ${effectiveRegistration}.`,
        $metadata_json: JSON.stringify({
          aircraftModelId: aircraftModel!.modelId,
          acquisitionAgreementId,
          deliveryAirportId: deliveryAirport!.airportKey,
          ownershipType: command.payload.ownershipType,
          msfs2024Status: aircraftModel!.msfs2024Status,
        }),
      },
    );

    dependencies.saveDatabase.run(
      `INSERT INTO command_log (
        command_id,
        save_id,
        command_name,
        actor_type,
        issued_at_utc,
        completed_at_utc,
        status,
        payload_json
      ) VALUES (
        $command_id,
        $save_id,
        $command_name,
        $actor_type,
        $issued_at_utc,
        $completed_at_utc,
        'completed',
        $payload_json
      )`,
      {
        $command_id: command.commandId,
        $save_id: command.saveId,
        $command_name: command.commandName,
        $actor_type: command.actorType,
        $issued_at_utc: command.issuedAtUtc,
        $completed_at_utc: acquiredAtUtc,
        $payload_json: JSON.stringify({
          ...command.payload,
          aircraftId,
          acquisitionAgreementId,
          registration: effectiveRegistration,
          deliveryAirportId: deliveryAirport!.airportKey,
          activeCabinLayoutId: selectedLayout?.layoutId ?? null,
          acquisitionTerms,
        }),
      },
    );
  });

  await dependencies.saveDatabase.persist();

  return {
    success: true,
    commandId: command.commandId,
    changedAggregateIds: [
      aircraftId,
      acquisitionAgreementId,
      ...(recurringObligationId ? [recurringObligationId] : []),
    ],
    validationMessages: [`Acquired ${aircraftModel!.displayName} as ${effectiveRegistration}.`, ...warnings],
    hardBlockers: [],
    warnings,
    emittedEventIds: [eventLogEntryId],
    emittedLedgerEntryIds: ledgerEntryId ? [ledgerEntryId] : [],
    metadata: {
      aircraftId,
      acquisitionAgreementId,
      deliveryAirportId: deliveryAirport!.airportKey,
      aircraftModelId: aircraftModel!.modelId,
      msfs2024Status: aircraftModel!.msfs2024Status,
      activeCabinLayoutId: selectedLayout?.layoutId,
      recurringObligationId: recurringObligationId ?? undefined,
    },
  };
}

