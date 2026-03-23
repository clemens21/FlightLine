/*
 * Defines the contracts-tab view model shared between the server render path and the browser client.
 * Keeping these payload contracts explicit makes the contracts UI easier to evolve without hidden coupling.
 */

export interface ContractsViewAirport {
  airportId: string;
  code: string;
  name: string;
  municipality: string | undefined;
  countryCode: string | undefined;
  timezone: string | undefined;
  latitudeDeg: number;
  longitudeDeg: number;
}

export type ContractsRoutePlanItemStatus = "candidate_available" | "candidate_stale" | "accepted_ready" | "scheduled" | "closed";
export type ContractsRoutePlanItemSourceType = "candidate_offer" | "accepted_contract";
export type ContractsContractUrgencyBand = "stable" | "at_risk" | "overdue";
export type ContractsContractWorkState = "in_route_plan" | "ready_for_dispatch" | "assigned_elsewhere";
export type ContractsContractPrimaryActionKind = "send_to_route_plan" | "open_route_plan" | "open_dispatch";

export interface ContractsViewAircraftCue {
  aircraftId: string;
  registration: string;
  modelDisplayName: string;
  currentAirport: ContractsViewAirport;
  distanceNm: number;
  dispatchAvailable: boolean;
}

export interface ContractsViewOffer {
  contractOfferId: string;
  archetype: string;
  volumeType: "passenger" | "cargo";
  passengerCount: number | undefined;
  cargoWeightLb: number | undefined;
  payoutAmount: number;
  earliestStartUtc: string;
  latestCompletionUtc: string;
  offerStatus: string;
  likelyRole: string;
  difficultyBand: string;
  fitBucket: "flyable_now" | "flyable_with_reposition" | "stretch_growth" | "blocked_now" | undefined;
  timeRemainingHours: number;
  origin: ContractsViewAirport;
  destination: ContractsViewAirport;
  routePlanItemId: string | undefined;
  routePlanItemStatus: ContractsRoutePlanItemStatus | undefined;
  matchesPlannerEndpoint: boolean;
  directDispatchEligible: boolean;
  directDispatchReason: string;
  nearestRelevantAircraft: ContractsViewAircraftCue | null;
}

export interface ContractsViewAcceptedContract {
  companyContractId: string;
  originContractOfferId: string | undefined;
  contractState: string;
  archetype: string;
  volumeType: "passenger" | "cargo";
  passengerCount: number | undefined;
  cargoWeightLb: number | undefined;
  payoutAmount: number;
  cancellationPenaltyAmount: number;
  earliestStartUtc: string | undefined;
  deadlineUtc: string;
  assignedAircraftId: string | undefined;
  origin: ContractsViewAirport;
  destination: ContractsViewAirport;
  routePlanItemId: string | undefined;
  routePlanItemStatus: ContractsRoutePlanItemStatus | undefined;
  hoursRemaining: number;
  urgencyBand: ContractsContractUrgencyBand;
  workState: ContractsContractWorkState;
  primaryActionKind: ContractsContractPrimaryActionKind;
  primaryActionLabel: string;
  nearestRelevantAircraft: ContractsViewAircraftCue | null;
  assignedAircraftReady: boolean;
}

export interface ContractsViewCompanyContract {
  companyContractId: string;
  originContractOfferId: string | undefined;
  contractState: string;
  archetype: string;
  volumeType: "passenger" | "cargo";
  passengerCount: number | undefined;
  cargoWeightLb: number | undefined;
  payoutAmount: number;
  cancellationPenaltyAmount: number;
  earliestStartUtc: string | undefined;
  deadlineUtc: string;
  assignedAircraftId: string | undefined;
  origin: ContractsViewAirport;
  destination: ContractsViewAirport;
  routePlanItemId: string | undefined;
  routePlanItemStatus: ContractsRoutePlanItemStatus | undefined;
  hoursRemaining: number;
  urgencyBand: ContractsContractUrgencyBand;
  workState: ContractsContractWorkState;
  primaryActionKind: ContractsContractPrimaryActionKind;
  primaryActionLabel: string;
  nearestRelevantAircraft: ContractsViewAircraftCue | null;
  assignedAircraftReady: boolean;
}

export interface ContractsRoutePlanItem {
  routePlanItemId: string;
  sequenceNumber: number;
  sourceType: ContractsRoutePlanItemSourceType;
  sourceId: string;
  plannerItemStatus: ContractsRoutePlanItemStatus;
  volumeType: "passenger" | "cargo";
  passengerCount: number | undefined;
  cargoWeightLb: number | undefined;
  payoutAmount: number;
  earliestStartUtc: string | undefined;
  deadlineUtc: string;
  linkedAircraftId: string | undefined;
  linkedScheduleId: string | undefined;
  origin: ContractsViewAirport;
  destination: ContractsViewAirport;
}

export interface ContractsViewPayload {
  saveId: string;
  companyId: string;
  currentTimeUtc: string;
  homeBaseAirportId: string;
  board: {
    offerWindowId: string;
    generatedAtUtc: string;
    expiresAtUtc: string;
    refreshReason: string;
    offerCount: number;
  };
  offers: ContractsViewOffer[];
  acceptedContracts: ContractsViewAcceptedContract[];
  companyContracts: ContractsViewCompanyContract[];
  routePlan: {
    routePlanId: string;
    endpointAirportId: string | undefined;
    items: ContractsRoutePlanItem[];
  } | null;
  plannerEndpointAirportId: string | undefined;
}
