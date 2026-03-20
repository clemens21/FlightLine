/*
 * Persists and mutates the saved route-plan state used by the contracts planner.
 * Planner add, remove, reorder, and clear operations all flow through this module.
 * The planner is intentionally "soft" state: it remembers the player's intent without reserving aircraft or labor,
 * and later modules decide when those planned items become accepted work or real dispatch schedules.
 */

import { createPrefixedId } from "../application/commands/utils.js";
import { loadCompanyContracts, type CompanyContractView } from "../application/queries/company-contracts.js";
import { loadActiveCompanyContext } from "../application/queries/company-state.js";
import { loadActiveContractBoard, type ContractBoardOfferView } from "../application/queries/contract-board.js";
import type { SqliteFileDatabase } from "../infrastructure/persistence/sqlite/sqlite-file-database.js";

export type RoutePlanItemSourceType = "candidate_offer" | "accepted_contract";
export type RoutePlanItemStatus = "candidate_available" | "candidate_stale" | "accepted_ready" | "scheduled" | "closed";

interface RoutePlanRow extends Record<string, unknown> {
  routePlanId: string;
  companyId: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

interface RoutePlanItemRow extends Record<string, unknown> {
  routePlanItemId: string;
  routePlanId: string;
  sequenceNumber: number;
  sourceType: RoutePlanItemSourceType;
  sourceId: string;
  plannerItemStatus: RoutePlanItemStatus;
  originAirportId: string;
  destinationAirportId: string;
  volumeType: "passenger" | "cargo";
  passengerCount: number | null;
  cargoWeightLb: number | null;
  payoutAmount: number;
  earliestStartUtc: string | null;
  deadlineUtc: string;
  linkedAircraftId: string | null;
  linkedScheduleId: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}

interface CandidateOfferRow extends Record<string, unknown> {
  contractOfferId: string;
  companyId: string;
  originAirportId: string;
  destinationAirportId: string;
  volumeType: "passenger" | "cargo";
  passengerCount: number | null;
  cargoWeightLb: number | null;
  payoutAmount: number;
  earliestStartUtc: string;
  latestCompletionUtc: string;
  offerStatus: string;
  expiresAtUtc: string;
  windowStatus: string;
}

interface ContractExecutionLinkRow extends Record<string, unknown> {
  companyContractId: string;
  linkedAircraftId: string;
  linkedScheduleId: string;
}

export interface RoutePlanItemState {
  routePlanItemId: string;
  routePlanId: string;
  sequenceNumber: number;
  sourceType: RoutePlanItemSourceType;
  sourceId: string;
  plannerItemStatus: RoutePlanItemStatus;
  originAirportId: string;
  destinationAirportId: string;
  volumeType: "passenger" | "cargo";
  passengerCount: number | undefined;
  cargoWeightLb: number | undefined;
  payoutAmount: number;
  earliestStartUtc: string | undefined;
  deadlineUtc: string;
  linkedAircraftId: string | undefined;
  linkedScheduleId: string | undefined;
}

export interface RoutePlanState {
  routePlanId: string;
  companyId: string;
  endpointAirportId: string | undefined;
  items: RoutePlanItemState[];
}

export interface RoutePlanMutationResult {
  success: boolean;
  routePlanItemId?: string | undefined;
  message?: string | undefined;
  error?: string | undefined;
}

const closedCompanyContractStates = new Set(["completed", "late_completed", "failed", "cancelled"]);
const visibleOfferStatuses = new Set(["available", "shortlisted"]);

// Public planner entry points keep the saved route plan in sqlite so contracts, dispatch, and tests share one source of truth.
export function loadRoutePlanState(saveDatabase: SqliteFileDatabase, saveId: string): RoutePlanState | null {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);

  if (!companyContext) {
    return null;
  }

  const routePlanRow = saveDatabase.getOne<RoutePlanRow>(
    `SELECT
      route_plan_id AS routePlanId,
      company_id AS companyId,
      created_at_utc AS createdAtUtc,
      updated_at_utc AS updatedAtUtc
    FROM route_plan
    WHERE company_id = $company_id
    LIMIT 1`,
    { $company_id: companyContext.companyId },
  );

  if (!routePlanRow) {
    return null;
  }

  return reconcileRoutePlanState(saveDatabase, saveId, routePlanRow, companyContext.currentTimeUtc);
}

export function addCandidateOfferToRoutePlan(
  saveDatabase: SqliteFileDatabase,
  saveId: string,
  contractOfferId: string,
): RoutePlanMutationResult {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);

  if (!companyContext) {
    return { success: false, error: "The save does not have an active company." };
  }

  const existingContract = saveDatabase.getOne<{ companyContractId: string }>(
    `SELECT company_contract_id AS companyContractId
    FROM company_contract
    WHERE company_id = $company_id
      AND origin_contract_offer_id = $contract_offer_id
    LIMIT 1`,
    {
      $company_id: companyContext.companyId,
      $contract_offer_id: contractOfferId,
    },
  );

  if (existingContract) {
    return addAcceptedContractToRoutePlan(saveDatabase, saveId, existingContract.companyContractId);
  }

  const offerRow = saveDatabase.getOne<CandidateOfferRow>(
    `SELECT
      co.contract_offer_id AS contractOfferId,
      co.company_id AS companyId,
      co.origin_airport_id AS originAirportId,
      co.destination_airport_id AS destinationAirportId,
      co.volume_type AS volumeType,
      co.passenger_count AS passengerCount,
      co.cargo_weight_lb AS cargoWeightLb,
      co.payout_amount AS payoutAmount,
      co.earliest_start_utc AS earliestStartUtc,
      co.latest_completion_utc AS latestCompletionUtc,
      co.offer_status AS offerStatus,
      ow.expires_at_utc AS expiresAtUtc,
      ow.status AS windowStatus
    FROM contract_offer AS co
    JOIN offer_window AS ow ON ow.offer_window_id = co.offer_window_id
    WHERE co.contract_offer_id = $contract_offer_id
      AND co.company_id = $company_id
    LIMIT 1`,
    {
      $contract_offer_id: contractOfferId,
      $company_id: companyContext.companyId,
    },
  );

  if (!offerRow) {
    return { success: false, error: `Contract offer ${contractOfferId} was not found.` };
  }

  const routePlanId = ensureRoutePlan(saveDatabase, companyContext.companyId, companyContext.currentTimeUtc);
  const existingItem = saveDatabase.getOne<{ routePlanItemId: string }>(
    `SELECT route_plan_item_id AS routePlanItemId
    FROM route_plan_item
    WHERE route_plan_id = $route_plan_id
      AND source_type = 'candidate_offer'
      AND source_id = $source_id
    LIMIT 1`,
    {
      $route_plan_id: routePlanId,
      $source_id: contractOfferId,
    },
  );

  if (existingItem) {
    return { success: true, routePlanItemId: existingItem.routePlanItemId, message: "Offer is already in the route plan." };
  }

  const routePlanItemId = createPrefixedId("route_plan_item");
  const sequenceNumber = nextSequenceNumber(saveDatabase, routePlanId);
  const status: RoutePlanItemStatus = offerIsPlanCandidateAvailable(offerRow, companyContext.currentTimeUtc)
    ? "candidate_available"
    : "candidate_stale";

  saveDatabase.run(
    `INSERT INTO route_plan_item (
      route_plan_item_id,
      route_plan_id,
      sequence_number,
      source_type,
      source_id,
      planner_item_status,
      origin_airport_id,
      destination_airport_id,
      volume_type,
      passenger_count,
      cargo_weight_lb,
      payout_amount,
      earliest_start_utc,
      deadline_utc,
      linked_aircraft_id,
      linked_schedule_id,
      created_at_utc,
      updated_at_utc
    ) VALUES (
      $route_plan_item_id,
      $route_plan_id,
      $sequence_number,
      'candidate_offer',
      $source_id,
      $planner_item_status,
      $origin_airport_id,
      $destination_airport_id,
      $volume_type,
      $passenger_count,
      $cargo_weight_lb,
      $payout_amount,
      $earliest_start_utc,
      $deadline_utc,
      NULL,
      NULL,
      $created_at_utc,
      $updated_at_utc
    )`,
    {
      $route_plan_item_id: routePlanItemId,
      $route_plan_id: routePlanId,
      $sequence_number: sequenceNumber,
      $source_id: offerRow.contractOfferId,
      $planner_item_status: status,
      $origin_airport_id: offerRow.originAirportId,
      $destination_airport_id: offerRow.destinationAirportId,
      $volume_type: offerRow.volumeType,
      $passenger_count: offerRow.passengerCount,
      $cargo_weight_lb: offerRow.cargoWeightLb,
      $payout_amount: offerRow.payoutAmount,
      $earliest_start_utc: offerRow.earliestStartUtc,
      $deadline_utc: offerRow.latestCompletionUtc,
      $created_at_utc: companyContext.currentTimeUtc,
      $updated_at_utc: companyContext.currentTimeUtc,
    },
  );

  touchRoutePlan(saveDatabase, routePlanId, companyContext.currentTimeUtc);

  return {
    success: true,
    routePlanItemId,
    message: status === "candidate_available" ? "Added offer to the route plan." : "Added stale offer snapshot to the route plan.",
  };
}

export function addAcceptedContractToRoutePlan(
  saveDatabase: SqliteFileDatabase,
  saveId: string,
  companyContractId: string,
): RoutePlanMutationResult {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);

  if (!companyContext) {
    return { success: false, error: "The save does not have an active company." };
  }

  const companyContracts = loadCompanyContracts(saveDatabase, saveId);
  const contract = companyContracts?.contracts.find((entry) => entry.companyContractId === companyContractId);

  if (!contract) {
    return { success: false, error: `Company contract ${companyContractId} was not found.` };
  }

  const routePlanId = ensureRoutePlan(saveDatabase, companyContext.companyId, companyContext.currentTimeUtc);
  const acceptedExisting = saveDatabase.getOne<{ routePlanItemId: string }>(
    `SELECT route_plan_item_id AS routePlanItemId
    FROM route_plan_item
    WHERE route_plan_id = $route_plan_id
      AND source_type = 'accepted_contract'
      AND source_id = $source_id
    LIMIT 1`,
    {
      $route_plan_id: routePlanId,
      $source_id: companyContractId,
    },
  );

  if (acceptedExisting) {
    return { success: true, routePlanItemId: acceptedExisting.routePlanItemId, message: "Contract is already in the route plan." };
  }

  const upgradedCandidate = contract.originContractOfferId
    ? saveDatabase.getOne<{ routePlanItemId: string }>(
        `SELECT route_plan_item_id AS routePlanItemId
        FROM route_plan_item
        WHERE route_plan_id = $route_plan_id
          AND source_type = 'candidate_offer'
          AND source_id = $source_id
        LIMIT 1`,
        {
          $route_plan_id: routePlanId,
          $source_id: contract.originContractOfferId,
        },
      )
    : null;

  const nextStatus = statusForAcceptedContract(contract);

  if (upgradedCandidate) {
    saveDatabase.run(
      `UPDATE route_plan_item
      SET source_type = 'accepted_contract',
          source_id = $source_id,
          planner_item_status = $planner_item_status,
          origin_airport_id = $origin_airport_id,
          destination_airport_id = $destination_airport_id,
          volume_type = $volume_type,
          passenger_count = $passenger_count,
          cargo_weight_lb = $cargo_weight_lb,
          payout_amount = $payout_amount,
          earliest_start_utc = $earliest_start_utc,
          deadline_utc = $deadline_utc,
          updated_at_utc = $updated_at_utc
      WHERE route_plan_item_id = $route_plan_item_id`,
      {
        $route_plan_item_id: upgradedCandidate.routePlanItemId,
        $source_id: contract.companyContractId,
        $planner_item_status: nextStatus,
        $origin_airport_id: contract.originAirportId,
        $destination_airport_id: contract.destinationAirportId,
        $volume_type: contract.volumeType,
        $passenger_count: contract.passengerCount ?? null,
        $cargo_weight_lb: contract.cargoWeightLb ?? null,
        $payout_amount: contract.acceptedPayoutAmount,
        $earliest_start_utc: contract.earliestStartUtc ?? null,
        $deadline_utc: contract.deadlineUtc,
        $updated_at_utc: companyContext.currentTimeUtc,
      },
    );

    touchRoutePlan(saveDatabase, routePlanId, companyContext.currentTimeUtc);
    return { success: true, routePlanItemId: upgradedCandidate.routePlanItemId, message: "Added accepted contract to the route plan." };
  }

  const routePlanItemId = createPrefixedId("route_plan_item");
  saveDatabase.run(
    `INSERT INTO route_plan_item (
      route_plan_item_id,
      route_plan_id,
      sequence_number,
      source_type,
      source_id,
      planner_item_status,
      origin_airport_id,
      destination_airport_id,
      volume_type,
      passenger_count,
      cargo_weight_lb,
      payout_amount,
      earliest_start_utc,
      deadline_utc,
      linked_aircraft_id,
      linked_schedule_id,
      created_at_utc,
      updated_at_utc
    ) VALUES (
      $route_plan_item_id,
      $route_plan_id,
      $sequence_number,
      'accepted_contract',
      $source_id,
      $planner_item_status,
      $origin_airport_id,
      $destination_airport_id,
      $volume_type,
      $passenger_count,
      $cargo_weight_lb,
      $payout_amount,
      $earliest_start_utc,
      $deadline_utc,
      NULL,
      NULL,
      $created_at_utc,
      $updated_at_utc
    )`,
    {
      $route_plan_item_id: routePlanItemId,
      $route_plan_id: routePlanId,
      $sequence_number: nextSequenceNumber(saveDatabase, routePlanId),
      $source_id: contract.companyContractId,
      $planner_item_status: nextStatus,
      $origin_airport_id: contract.originAirportId,
      $destination_airport_id: contract.destinationAirportId,
      $volume_type: contract.volumeType,
      $passenger_count: contract.passengerCount ?? null,
      $cargo_weight_lb: contract.cargoWeightLb ?? null,
      $payout_amount: contract.acceptedPayoutAmount,
      $earliest_start_utc: contract.earliestStartUtc ?? null,
      $deadline_utc: contract.deadlineUtc,
      $created_at_utc: companyContext.currentTimeUtc,
      $updated_at_utc: companyContext.currentTimeUtc,
    },
  );

  touchRoutePlan(saveDatabase, routePlanId, companyContext.currentTimeUtc);
  return { success: true, routePlanItemId, message: "Added accepted contract to the route plan." };
}

export function removeRoutePlanItem(
  saveDatabase: SqliteFileDatabase,
  saveId: string,
  routePlanItemId: string,
): RoutePlanMutationResult {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);
  if (!companyContext) {
    return { success: false, error: "The save does not have an active company." };
  }

  const routePlanRow = saveDatabase.getOne<RoutePlanRow>(
    `SELECT
      rp.route_plan_id AS routePlanId,
      rp.company_id AS companyId,
      rp.created_at_utc AS createdAtUtc,
      rp.updated_at_utc AS updatedAtUtc
    FROM route_plan AS rp
    JOIN route_plan_item AS rpi ON rpi.route_plan_id = rp.route_plan_id
    WHERE rp.company_id = $company_id
      AND rpi.route_plan_item_id = $route_plan_item_id
    LIMIT 1`,
    {
      $company_id: companyContext.companyId,
      $route_plan_item_id: routePlanItemId,
    },
  );

  if (!routePlanRow) {
    return { success: false, error: "Route plan item was not found." };
  }

  saveDatabase.transaction(() => {
    saveDatabase.run(
      `DELETE FROM route_plan_item
      WHERE route_plan_item_id = $route_plan_item_id`,
      { $route_plan_item_id: routePlanItemId },
    );
    normalizeSequenceNumbers(saveDatabase, routePlanRow.routePlanId, companyContext.currentTimeUtc);
    touchRoutePlan(saveDatabase, routePlanRow.routePlanId, companyContext.currentTimeUtc);
  });

  return { success: true, message: "Removed item from the route plan." };
}

export function reorderRoutePlanItem(
  saveDatabase: SqliteFileDatabase,
  saveId: string,
  routePlanItemId: string,
  direction: "up" | "down",
): RoutePlanMutationResult {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);
  if (!companyContext) {
    return { success: false, error: "The save does not have an active company." };
  }

  const itemRow = saveDatabase.getOne<RoutePlanItemRow>(
    `SELECT
      rpi.route_plan_item_id AS routePlanItemId,
      rpi.route_plan_id AS routePlanId,
      rpi.sequence_number AS sequenceNumber,
      rpi.source_type AS sourceType,
      rpi.source_id AS sourceId,
      rpi.planner_item_status AS plannerItemStatus,
      rpi.origin_airport_id AS originAirportId,
      rpi.destination_airport_id AS destinationAirportId,
      rpi.volume_type AS volumeType,
      rpi.passenger_count AS passengerCount,
      rpi.cargo_weight_lb AS cargoWeightLb,
      rpi.payout_amount AS payoutAmount,
      rpi.earliest_start_utc AS earliestStartUtc,
      rpi.deadline_utc AS deadlineUtc,
      rpi.linked_aircraft_id AS linkedAircraftId,
      rpi.linked_schedule_id AS linkedScheduleId,
      rpi.created_at_utc AS createdAtUtc,
      rpi.updated_at_utc AS updatedAtUtc
    FROM route_plan_item AS rpi
    JOIN route_plan AS rp ON rp.route_plan_id = rpi.route_plan_id
    WHERE rp.company_id = $company_id
      AND rpi.route_plan_item_id = $route_plan_item_id
    LIMIT 1`,
    {
      $company_id: companyContext.companyId,
      $route_plan_item_id: routePlanItemId,
    },
  );

  if (!itemRow) {
    return { success: false, error: "Route plan item was not found." };
  }

  const neighbor = saveDatabase.getOne<{ routePlanItemId: string; sequenceNumber: number }>(
    `SELECT
      route_plan_item_id AS routePlanItemId,
      sequence_number AS sequenceNumber
    FROM route_plan_item
    WHERE route_plan_id = $route_plan_id
      AND sequence_number ${direction === "up" ? "<" : ">"} $sequence_number
    ORDER BY sequence_number ${direction === "up" ? "DESC" : "ASC"}
    LIMIT 1`,
    {
      $route_plan_id: itemRow.routePlanId,
      $sequence_number: itemRow.sequenceNumber,
    },
  );

  if (!neighbor) {
    return { success: true, message: "Route plan item is already at the edge of the chain." };
  }

  saveDatabase.transaction(() => {
    saveDatabase.run(
      `UPDATE route_plan_item
      SET sequence_number = 0,
          updated_at_utc = $updated_at_utc
      WHERE route_plan_item_id = $route_plan_item_id`,
      {
        $route_plan_item_id: itemRow.routePlanItemId,
        $updated_at_utc: companyContext.currentTimeUtc,
      },
    );
    saveDatabase.run(
      `UPDATE route_plan_item
      SET sequence_number = $sequence_number,
          updated_at_utc = $updated_at_utc
      WHERE route_plan_item_id = $route_plan_item_id`,
      {
        $route_plan_item_id: neighbor.routePlanItemId,
        $sequence_number: itemRow.sequenceNumber,
        $updated_at_utc: companyContext.currentTimeUtc,
      },
    );
    saveDatabase.run(
      `UPDATE route_plan_item
      SET sequence_number = $sequence_number,
          updated_at_utc = $updated_at_utc
      WHERE route_plan_item_id = $route_plan_item_id`,
      {
        $route_plan_item_id: itemRow.routePlanItemId,
        $sequence_number: neighbor.sequenceNumber,
        $updated_at_utc: companyContext.currentTimeUtc,
      },
    );
    normalizeSequenceNumbers(saveDatabase, itemRow.routePlanId, companyContext.currentTimeUtc);
    touchRoutePlan(saveDatabase, itemRow.routePlanId, companyContext.currentTimeUtc);
  });

  return { success: true, message: `Moved route plan item ${direction}.` };
}

export function clearRoutePlan(saveDatabase: SqliteFileDatabase, saveId: string): RoutePlanMutationResult {
  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);
  if (!companyContext) {
    return { success: false, error: "The save does not have an active company." };
  }

  const routePlanRow = saveDatabase.getOne<RoutePlanRow>(
    `SELECT
      route_plan_id AS routePlanId,
      company_id AS companyId,
      created_at_utc AS createdAtUtc,
      updated_at_utc AS updatedAtUtc
    FROM route_plan
    WHERE company_id = $company_id
    LIMIT 1`,
    { $company_id: companyContext.companyId },
  );

  if (!routePlanRow) {
    return { success: true, message: "Route plan was already empty." };
  }

  saveDatabase.transaction(() => {
    saveDatabase.run(
      `DELETE FROM route_plan_item
      WHERE route_plan_id = $route_plan_id`,
      { $route_plan_id: routePlanRow.routePlanId },
    );
    touchRoutePlan(saveDatabase, routePlanRow.routePlanId, companyContext.currentTimeUtc);
  });

  return { success: true, message: "Cleared the route plan." };
}

export function markRoutePlanItemsScheduled(
  saveDatabase: SqliteFileDatabase,
  saveId: string,
  companyContractIds: string[],
  aircraftId: string,
  scheduleId: string,
): void {
  if (companyContractIds.length === 0) {
    return;
  }

  const companyContext = loadActiveCompanyContext(saveDatabase, saveId);
  if (!companyContext) {
    return;
  }

  const routePlanRow = saveDatabase.getOne<RoutePlanRow>(
    `SELECT
      route_plan_id AS routePlanId,
      company_id AS companyId,
      created_at_utc AS createdAtUtc,
      updated_at_utc AS updatedAtUtc
    FROM route_plan
    WHERE company_id = $company_id
    LIMIT 1`,
    { $company_id: companyContext.companyId },
  );

  if (!routePlanRow) {
    return;
  }

  const placeholders = companyContractIds.map((_, index) => `$company_contract_id_${index}`).join(", ");
  const params = companyContractIds.reduce<Record<string, string>>((accumulator, companyContractId, index) => {
    accumulator[`$company_contract_id_${index}`] = companyContractId;
    return accumulator;
  }, {
    $route_plan_id: routePlanRow.routePlanId,
    $linked_aircraft_id: aircraftId,
    $linked_schedule_id: scheduleId,
    $updated_at_utc: companyContext.currentTimeUtc,
  } as Record<string, string>);

  saveDatabase.run(
    `UPDATE route_plan_item
    SET planner_item_status = 'scheduled',
        linked_aircraft_id = $linked_aircraft_id,
        linked_schedule_id = $linked_schedule_id,
        updated_at_utc = $updated_at_utc
    WHERE route_plan_id = $route_plan_id
      AND source_type = 'accepted_contract'
      AND source_id IN (${placeholders})`,
    params,
  );

  touchRoutePlan(saveDatabase, routePlanRow.routePlanId, companyContext.currentTimeUtc);
}

// Reconciliation keeps stored planner rows aligned with a changing contract board and contract lifecycle.
function reconcileRoutePlanState(
  saveDatabase: SqliteFileDatabase,
  saveId: string,
  routePlanRow: RoutePlanRow,
  currentTimeUtc: string,
): RoutePlanState {
  const companyContracts = loadCompanyContracts(saveDatabase, saveId);
  const activeBoard = loadActiveContractBoard(saveDatabase, saveId);
  const boardIsUsable = activeBoard !== null && new Date(activeBoard.expiresAtUtc).getTime() > new Date(currentTimeUtc).getTime();
  const activeOffers = boardIsUsable && activeBoard
    ? activeBoard.offers.filter((offer) => visibleOfferStatuses.has(offer.offerStatus))
    : [];
  const offersById = new Map(activeOffers.map((offer) => [offer.contractOfferId, offer]));
  const contractsById = new Map((companyContracts?.contracts ?? []).map((contract) => [contract.companyContractId, contract]));
  const contractsByOriginOfferId = new Map(
    (companyContracts?.contracts ?? [])
      .filter((contract) => Boolean(contract.originContractOfferId))
      .map((contract) => [contract.originContractOfferId as string, contract]),
  );
  const executionLinksByContractId = loadCommittedContractExecutionLinks(saveDatabase, routePlanRow.companyId);

  const itemRows = loadRoutePlanItems(saveDatabase, routePlanRow.routePlanId);
  const nextStates = itemRows.map((itemRow) => reconcileRoutePlanItem(
    itemRow,
    offersById,
    contractsById,
    contractsByOriginOfferId,
    executionLinksByContractId,
  ));
  const changedItems = nextStates.filter(({ itemRow, nextState }) => itemNeedsUpdate(itemRow, nextState));

  if (changedItems.length > 0) {
    saveDatabase.transaction(() => {
      for (const { itemRow, nextState } of changedItems) {
        saveDatabase.run(
          `UPDATE route_plan_item
          SET source_type = $source_type,
              source_id = $source_id,
              planner_item_status = $planner_item_status,
              origin_airport_id = $origin_airport_id,
              destination_airport_id = $destination_airport_id,
              volume_type = $volume_type,
              passenger_count = $passenger_count,
              cargo_weight_lb = $cargo_weight_lb,
              payout_amount = $payout_amount,
              earliest_start_utc = $earliest_start_utc,
              deadline_utc = $deadline_utc,
              linked_aircraft_id = $linked_aircraft_id,
              linked_schedule_id = $linked_schedule_id,
              updated_at_utc = $updated_at_utc
          WHERE route_plan_item_id = $route_plan_item_id`,
          {
            $route_plan_item_id: itemRow.routePlanItemId,
            $source_type: nextState.sourceType,
            $source_id: nextState.sourceId,
            $planner_item_status: nextState.plannerItemStatus,
            $origin_airport_id: nextState.originAirportId,
            $destination_airport_id: nextState.destinationAirportId,
            $volume_type: nextState.volumeType,
            $passenger_count: nextState.passengerCount,
            $cargo_weight_lb: nextState.cargoWeightLb,
            $payout_amount: nextState.payoutAmount,
            $earliest_start_utc: nextState.earliestStartUtc,
            $deadline_utc: nextState.deadlineUtc,
            $linked_aircraft_id: nextState.linkedAircraftId,
            $linked_schedule_id: nextState.linkedScheduleId,
            $updated_at_utc: currentTimeUtc,
          },
        );
      }
      touchRoutePlan(saveDatabase, routePlanRow.routePlanId, currentTimeUtc);
    });
  }

  const rows = loadRoutePlanItems(saveDatabase, routePlanRow.routePlanId).map(mapRoutePlanItemState);
  const endpointAirportId = [...rows]
    .reverse()
    .find((item) => item.plannerItemStatus !== "candidate_stale" && item.plannerItemStatus !== "closed")
    ?.destinationAirportId;

  return {
    routePlanId: routePlanRow.routePlanId,
    companyId: routePlanRow.companyId,
    endpointAirportId,
    items: rows,
  };
}

function reconcileRoutePlanItem(
  itemRow: RoutePlanItemRow,
  offersById: Map<string, ContractBoardOfferView>,
  contractsById: Map<string, CompanyContractView>,
  contractsByOriginOfferId: Map<string, CompanyContractView>,
  executionLinksByContractId: Map<string, ContractExecutionLinkRow>,
): { itemRow: RoutePlanItemRow; nextState: RoutePlanItemRow } {
  if (itemRow.sourceType === "candidate_offer") {
    const upgradedContract = contractsByOriginOfferId.get(itemRow.sourceId);
    if (upgradedContract) {
      const plannerItemStatus = statusForAcceptedContract(upgradedContract);
      const executionLink = plannerItemStatus === "scheduled"
        ? executionLinksByContractId.get(upgradedContract.companyContractId)
        : undefined;
      return {
        itemRow,
        nextState: {
          ...itemRow,
          sourceType: "accepted_contract",
          sourceId: upgradedContract.companyContractId,
          plannerItemStatus,
          originAirportId: upgradedContract.originAirportId,
          destinationAirportId: upgradedContract.destinationAirportId,
          volumeType: upgradedContract.volumeType,
          passengerCount: upgradedContract.passengerCount ?? null,
          cargoWeightLb: upgradedContract.cargoWeightLb ?? null,
          payoutAmount: upgradedContract.acceptedPayoutAmount,
          earliestStartUtc: upgradedContract.earliestStartUtc ?? null,
          deadlineUtc: upgradedContract.deadlineUtc,
          linkedAircraftId: executionLink?.linkedAircraftId ?? null,
          linkedScheduleId: executionLink?.linkedScheduleId ?? null,
        },
      };
    }

    const matchingOffer = offersById.get(itemRow.sourceId);
    if (matchingOffer) {
      return {
        itemRow,
        nextState: {
          ...itemRow,
          plannerItemStatus: "candidate_available",
          originAirportId: matchingOffer.originAirportId,
          destinationAirportId: matchingOffer.destinationAirportId,
          volumeType: matchingOffer.volumeType,
          passengerCount: matchingOffer.passengerCount ?? null,
          cargoWeightLb: matchingOffer.cargoWeightLb ?? null,
          payoutAmount: matchingOffer.payoutAmount,
          earliestStartUtc: matchingOffer.earliestStartUtc,
          deadlineUtc: matchingOffer.latestCompletionUtc,
          linkedAircraftId: null,
          linkedScheduleId: null,
        },
      };
    }

    return {
      itemRow,
      nextState: {
        ...itemRow,
        plannerItemStatus: "candidate_stale",
        linkedAircraftId: null,
        linkedScheduleId: null,
      },
    };
  }

  const matchingContract = contractsById.get(itemRow.sourceId);
  if (!matchingContract) {
    return {
      itemRow,
      nextState: {
        ...itemRow,
        plannerItemStatus: "closed",
        linkedAircraftId: null,
        linkedScheduleId: null,
      },
    };
  }

  const plannerItemStatus = statusForAcceptedContract(matchingContract);
  const executionLink = plannerItemStatus === "scheduled"
    ? executionLinksByContractId.get(matchingContract.companyContractId)
    : undefined;
  return {
    itemRow,
    nextState: {
      ...itemRow,
      plannerItemStatus,
      originAirportId: matchingContract.originAirportId,
      destinationAirportId: matchingContract.destinationAirportId,
      volumeType: matchingContract.volumeType,
      passengerCount: matchingContract.passengerCount ?? null,
      cargoWeightLb: matchingContract.cargoWeightLb ?? null,
      payoutAmount: matchingContract.acceptedPayoutAmount,
      earliestStartUtc: matchingContract.earliestStartUtc ?? null,
      deadlineUtc: matchingContract.deadlineUtc,
      linkedAircraftId: executionLink?.linkedAircraftId ?? null,
      linkedScheduleId: executionLink?.linkedScheduleId ?? null,
    },
  };
}

function statusForAcceptedContract(
  contract: CompanyContractView,
): RoutePlanItemStatus {
  if (closedCompanyContractStates.has(contract.contractState)) {
    return "closed";
  }

  if (["assigned", "active"].includes(contract.contractState)) {
    return "scheduled";
  }

  return "accepted_ready";
}

function loadCommittedContractExecutionLinks(
  saveDatabase: SqliteFileDatabase,
  companyId: string,
): Map<string, ContractExecutionLinkRow> {
  const rows = saveDatabase.all<ContractExecutionLinkRow>(
    `SELECT
      fl.linked_company_contract_id AS companyContractId,
      s.aircraft_id AS linkedAircraftId,
      s.schedule_id AS linkedScheduleId
    FROM flight_leg AS fl
    JOIN aircraft_schedule AS s ON s.schedule_id = fl.schedule_id
    JOIN company_aircraft AS ca ON ca.aircraft_id = s.aircraft_id
    WHERE ca.company_id = $company_id
      AND fl.linked_company_contract_id IS NOT NULL
      AND s.schedule_state = 'committed'
      AND s.is_draft = 0
    ORDER BY s.updated_at_utc DESC, s.schedule_id DESC, fl.sequence_number ASC`,
    { $company_id: companyId },
  );

  const linksByContractId = new Map<string, ContractExecutionLinkRow>();
  for (const row of rows) {
    if (!linksByContractId.has(row.companyContractId)) {
      linksByContractId.set(row.companyContractId, row);
    }
  }

  return linksByContractId;
}

function offerIsPlanCandidateAvailable(offer: CandidateOfferRow, currentTimeUtc: string): boolean {
  return offer.windowStatus === "active"
    && visibleOfferStatuses.has(offer.offerStatus)
    && new Date(offer.expiresAtUtc).getTime() > new Date(currentTimeUtc).getTime();
}

// Persistence helpers below handle sequence maintenance, touch timestamps, and row-to-state mapping.
function ensureRoutePlan(saveDatabase: SqliteFileDatabase, companyId: string, currentTimeUtc: string): string {
  const existing = saveDatabase.getOne<RoutePlanRow>(
    `SELECT
      route_plan_id AS routePlanId,
      company_id AS companyId,
      created_at_utc AS createdAtUtc,
      updated_at_utc AS updatedAtUtc
    FROM route_plan
    WHERE company_id = $company_id
    LIMIT 1`,
    { $company_id: companyId },
  );

  if (existing) {
    return existing.routePlanId;
  }

  const routePlanId = createPrefixedId("route_plan");
  saveDatabase.run(
    `INSERT INTO route_plan (
      route_plan_id,
      company_id,
      created_at_utc,
      updated_at_utc
    ) VALUES (
      $route_plan_id,
      $company_id,
      $created_at_utc,
      $updated_at_utc
    )`,
    {
      $route_plan_id: routePlanId,
      $company_id: companyId,
      $created_at_utc: currentTimeUtc,
      $updated_at_utc: currentTimeUtc,
    },
  );

  return routePlanId;
}

function loadRoutePlanItems(saveDatabase: SqliteFileDatabase, routePlanId: string): RoutePlanItemRow[] {
  return saveDatabase.all<RoutePlanItemRow>(
    `SELECT
      route_plan_item_id AS routePlanItemId,
      route_plan_id AS routePlanId,
      sequence_number AS sequenceNumber,
      source_type AS sourceType,
      source_id AS sourceId,
      planner_item_status AS plannerItemStatus,
      origin_airport_id AS originAirportId,
      destination_airport_id AS destinationAirportId,
      volume_type AS volumeType,
      passenger_count AS passengerCount,
      cargo_weight_lb AS cargoWeightLb,
      payout_amount AS payoutAmount,
      earliest_start_utc AS earliestStartUtc,
      deadline_utc AS deadlineUtc,
      linked_aircraft_id AS linkedAircraftId,
      linked_schedule_id AS linkedScheduleId,
      created_at_utc AS createdAtUtc,
      updated_at_utc AS updatedAtUtc
    FROM route_plan_item
    WHERE route_plan_id = $route_plan_id
    ORDER BY sequence_number ASC, created_at_utc ASC, route_plan_item_id ASC`,
    { $route_plan_id: routePlanId },
  );
}

function normalizeSequenceNumbers(saveDatabase: SqliteFileDatabase, routePlanId: string, currentTimeUtc: string): void {
  const items = loadRoutePlanItems(saveDatabase, routePlanId);
  items.forEach((item, index) => {
    const nextSequence = index + 1;
    if (item.sequenceNumber !== nextSequence) {
      saveDatabase.run(
        `UPDATE route_plan_item
        SET sequence_number = $sequence_number,
            updated_at_utc = $updated_at_utc
        WHERE route_plan_item_id = $route_plan_item_id`,
        {
          $route_plan_item_id: item.routePlanItemId,
          $sequence_number: nextSequence,
          $updated_at_utc: currentTimeUtc,
        },
      );
    }
  });
}

function nextSequenceNumber(saveDatabase: SqliteFileDatabase, routePlanId: string): number {
  const row = saveDatabase.getOne<{ maxSequenceNumber: number | null }>(
    `SELECT MAX(sequence_number) AS maxSequenceNumber
    FROM route_plan_item
    WHERE route_plan_id = $route_plan_id`,
    { $route_plan_id: routePlanId },
  );

  return (row?.maxSequenceNumber ?? 0) + 1;
}

function touchRoutePlan(saveDatabase: SqliteFileDatabase, routePlanId: string, currentTimeUtc: string): void {
  saveDatabase.run(
    `UPDATE route_plan
    SET updated_at_utc = $updated_at_utc
    WHERE route_plan_id = $route_plan_id`,
    {
      $route_plan_id: routePlanId,
      $updated_at_utc: currentTimeUtc,
    },
  );
}

function itemNeedsUpdate(current: RoutePlanItemRow, next: RoutePlanItemRow): boolean {
  return current.sourceType !== next.sourceType
    || current.sourceId !== next.sourceId
    || current.plannerItemStatus !== next.plannerItemStatus
    || current.originAirportId !== next.originAirportId
    || current.destinationAirportId !== next.destinationAirportId
    || current.volumeType !== next.volumeType
    || current.passengerCount !== next.passengerCount
    || current.cargoWeightLb !== next.cargoWeightLb
    || current.payoutAmount !== next.payoutAmount
    || current.earliestStartUtc !== next.earliestStartUtc
    || current.deadlineUtc !== next.deadlineUtc
    || current.linkedAircraftId !== next.linkedAircraftId
    || current.linkedScheduleId !== next.linkedScheduleId;
}

function mapRoutePlanItemState(row: RoutePlanItemRow): RoutePlanItemState {
  return {
    routePlanItemId: row.routePlanItemId,
    routePlanId: row.routePlanId,
    sequenceNumber: row.sequenceNumber,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    plannerItemStatus: row.plannerItemStatus,
    originAirportId: row.originAirportId,
    destinationAirportId: row.destinationAirportId,
    volumeType: row.volumeType,
    passengerCount: row.passengerCount ?? undefined,
    cargoWeightLb: row.cargoWeightLb ?? undefined,
    payoutAmount: row.payoutAmount,
    earliestStartUtc: row.earliestStartUtc ?? undefined,
    deadlineUtc: row.deadlineUtc,
    linkedAircraftId: row.linkedAircraftId ?? undefined,
    linkedScheduleId: row.linkedScheduleId ?? undefined,
  };
}

