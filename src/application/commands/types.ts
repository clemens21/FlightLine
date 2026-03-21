/*
 * Implements the types command handler for the backend command pipeline.
 * Files in this layer validate a request, mutate save-state tables inside a transaction, and return structured results for callers.
 */

import type {
  AircraftLayoutId,
  AircraftModelId,
  AirportId,
  CommandId,
  ContractOfferId,
  CompanyContractId,
  CurrencyAmount,
  JsonObject,
  NamedPilotId,
  SaveId,
  UtcIsoString,
} from "../../domain/common/primitives.js";
import type { FlightLegType } from "../../domain/dispatch/types.js";
import type { BaseRole, CompanyPhase } from "../../domain/company/types.js";
import type { OwnershipType } from "../../domain/fleet/types.js";
import type { DifficultyProfile } from "../../domain/save-runtime/types.js";
import type {
  EmploymentModel,
  LaborCategory,
  NamedPilotTrainingProgramKind,
  PilotCertificationCode,
} from "../../domain/staffing/types.js";
import type { AdvanceTimeStopCondition } from "../../domain/simulation/types.js";

export type CommandName =
  | "CreateSaveGame"
  | "CreateCompany"
  | "AcquireAircraft"
  | "ActivateStaffingPackage"
  | "RefreshContractBoard"
  | "RefreshAircraftMarket"
  | "RefreshStaffingMarket"
  | "ExpireOfferWindow"
  | "AcceptContractOffer"
  | "ShortlistContractOffer"
  | "CancelCompanyContract"
  | "SaveScheduleDraft"
  | "DiscardAircraftScheduleDraft"
  | "CommitAircraftSchedule"
  | "StartNamedPilotTraining"
  | "StartNamedPilotTransfer"
  | "ConvertNamedPilotToDirectHire"
  | "DismissNamedPilot"
  | "ScheduleMaintenance"
  | "AdvanceTime";

export interface CreateSaveGamePayload {
  worldSeed: string;
  difficultyProfile: DifficultyProfile;
  startTimeUtc: UtcIsoString;
  airportSnapshotVersion?: string;
  aircraftSnapshotVersion?: string;
}

export interface CreateCompanyPayload {
  displayName: string;
  starterAirportId: AirportId;
  startingCashAmount: CurrencyAmount;
  reserveBalanceAmount?: CurrencyAmount;
  baseRole?: BaseRole;
  companyPhase?: CompanyPhase;
  progressionTier?: number;
  startingReputationScore?: number;
}

export interface AcquireAircraftPayload {
  aircraftModelId: AircraftModelId;
  deliveryAirportId: AirportId;
  ownershipType: OwnershipType;
  registration: string;
  displayName?: string;
  activeCabinLayoutId?: AircraftLayoutId;
  sourceOfferId?: string;
  upfrontPaymentAmount?: CurrencyAmount;
  recurringPaymentAmount?: CurrencyAmount;
  paymentCadence?: "weekly" | "monthly";
  termMonths?: number;
  rateBandOrApr?: number;
  seededAirframeHoursTotal?: number;
  seededAirframeCyclesTotal?: number;
  seededConditionValue?: number;
  seededStatusInput?: string;
  seededConditionBandInput?: string;
  seededHoursSinceInspection?: number;
  seededCyclesSinceInspection?: number;
  seededHoursToService?: number;
  seededMaintenanceStateInput?: string;
  seededAogFlag?: boolean;
}

export interface ActivateStaffingPackagePayload {
  laborCategory: LaborCategory;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  coverageUnits: number;
  fixedCostAmount: CurrencyAmount;
  variableCostRate?: CurrencyAmount;
  serviceRegionCode?: string;
  startsAtUtc?: UtcIsoString;
  endsAtUtc?: UtcIsoString;
  sourceOfferId?: string;
}

export interface ScheduleDraftLegPayload {
  legType: FlightLegType;
  linkedCompanyContractId?: string;
  originAirportId: AirportId;
  destinationAirportId: AirportId;
  plannedDepartureUtc: UtcIsoString;
  plannedArrivalUtc: UtcIsoString;
  assignedQualificationGroup?: string;
  payloadSnapshot?: JsonObject;
}

export interface SaveScheduleDraftPayload {
  aircraftId: string;
  scheduleId?: string;
  scheduleKind?: "operational" | "maintenance_only";
  legs: ScheduleDraftLegPayload[];
}

export interface CommitAircraftSchedulePayload {
  scheduleId: string;
}

export interface DiscardAircraftScheduleDraftPayload {
  scheduleId: string;
}

export interface StartNamedPilotTrainingPayload {
  namedPilotId: NamedPilotId;
  trainingProgramKind?: NamedPilotTrainingProgramKind;
  targetCertificationCode?: PilotCertificationCode;
}

export interface StartNamedPilotTransferPayload {
  namedPilotId: NamedPilotId;
  destinationAirportId: AirportId;
}

export interface ConvertNamedPilotToDirectHirePayload {
  namedPilotId: NamedPilotId;
}

export interface DismissNamedPilotPayload {
  namedPilotId: NamedPilotId;
}

export interface RefreshContractBoardPayload {
  refreshReason?: "scheduled" | "manual" | "bootstrap";
}

export interface RefreshAircraftMarketPayload {
  refreshReason?: "scheduled" | "manual" | "bootstrap";
}

export interface RefreshStaffingMarketPayload {
  refreshReason?: "scheduled" | "manual" | "bootstrap";
}

export interface AcceptContractOfferPayload {
  contractOfferId: ContractOfferId;
}

export interface CancelCompanyContractPayload {
  companyContractId: CompanyContractId;
}

export interface AdvanceTimePayload {
  targetTimeUtc: UtcIsoString;
  stopConditions?: AdvanceTimeStopCondition[];
  selectedAircraftId?: string;
  selectedContractId?: string;
}

export interface CommandEnvelope<TPayload> {
  commandId: CommandId;
  saveId: SaveId;
  commandName: CommandName;
  issuedAtUtc: string;
  actorType: "player" | "system";
  payload: TPayload;
}

export type CreateSaveGameCommand = CommandEnvelope<CreateSaveGamePayload> & {
  commandName: "CreateSaveGame";
};

export type CreateCompanyCommand = CommandEnvelope<CreateCompanyPayload> & {
  commandName: "CreateCompany";
};

export type AcquireAircraftCommand = CommandEnvelope<AcquireAircraftPayload> & {
  commandName: "AcquireAircraft";
};

export type ActivateStaffingPackageCommand = CommandEnvelope<ActivateStaffingPackagePayload> & {
  commandName: "ActivateStaffingPackage";
};

export type SaveScheduleDraftCommand = CommandEnvelope<SaveScheduleDraftPayload> & {
  commandName: "SaveScheduleDraft";
};

export type CommitAircraftScheduleCommand = CommandEnvelope<CommitAircraftSchedulePayload> & {
  commandName: "CommitAircraftSchedule";
};

export type DiscardAircraftScheduleDraftCommand = CommandEnvelope<DiscardAircraftScheduleDraftPayload> & {
  commandName: "DiscardAircraftScheduleDraft";
};

export type StartNamedPilotTrainingCommand = CommandEnvelope<StartNamedPilotTrainingPayload> & {
  commandName: "StartNamedPilotTraining";
};

export type StartNamedPilotTransferCommand = CommandEnvelope<StartNamedPilotTransferPayload> & {
  commandName: "StartNamedPilotTransfer";
};

export type ConvertNamedPilotToDirectHireCommand = CommandEnvelope<ConvertNamedPilotToDirectHirePayload> & {
  commandName: "ConvertNamedPilotToDirectHire";
};

export type DismissNamedPilotCommand = CommandEnvelope<DismissNamedPilotPayload> & {
  commandName: "DismissNamedPilot";
};

export type RefreshContractBoardCommand = CommandEnvelope<RefreshContractBoardPayload> & {
  commandName: "RefreshContractBoard";
};

export type RefreshAircraftMarketCommand = CommandEnvelope<RefreshAircraftMarketPayload> & {
  commandName: "RefreshAircraftMarket";
};

export type RefreshStaffingMarketCommand = CommandEnvelope<RefreshStaffingMarketPayload> & {
  commandName: "RefreshStaffingMarket";
};

export type AcceptContractOfferCommand = CommandEnvelope<AcceptContractOfferPayload> & {
  commandName: "AcceptContractOffer";
};

export type CancelCompanyContractCommand = CommandEnvelope<CancelCompanyContractPayload> & {
  commandName: "CancelCompanyContract";
};

export type AdvanceTimeCommand = CommandEnvelope<AdvanceTimePayload> & {
  commandName: "AdvanceTime";
};

export type SupportedCommand =
  | CreateSaveGameCommand
  | CreateCompanyCommand
  | AcquireAircraftCommand
  | ActivateStaffingPackageCommand
  | SaveScheduleDraftCommand
  | DiscardAircraftScheduleDraftCommand
  | CommitAircraftScheduleCommand
  | StartNamedPilotTrainingCommand
  | StartNamedPilotTransferCommand
  | ConvertNamedPilotToDirectHireCommand
  | DismissNamedPilotCommand
  | RefreshContractBoardCommand
  | RefreshAircraftMarketCommand
  | RefreshStaffingMarketCommand
  | AcceptContractOfferCommand
  | CancelCompanyContractCommand
  | AdvanceTimeCommand;

export interface CommandResult {
  success: boolean;
  commandId: string;
  changedAggregateIds: string[];
  validationMessages: string[];
  hardBlockers: string[];
  warnings: string[];
  emittedEventIds: string[];
  emittedLedgerEntryIds: string[];
  metadata?: JsonObject;
}
