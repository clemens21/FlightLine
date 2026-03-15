import type { AirportId, CompanyContractId, CompanyId, ContractOfferId, CurrencyAmount, JsonObject, UtcIsoString } from "../common/primitives.js";

export type CompanyContractState =
  | "accepted"
  | "assigned"
  | "active"
  | "completed"
  | "late_completed"
  | "failed"
  | "cancelled";

export interface CompanyContract {
  companyContractId: CompanyContractId;
  companyId: CompanyId;
  originContractOfferId?: ContractOfferId;
  archetype: string;
  originAirportId: AirportId;
  destinationAirportId: AirportId;
  volumeType: "passenger" | "cargo";
  passengerCount?: number;
  cargoWeightLb?: number;
  acceptedPayoutAmount: CurrencyAmount;
  penaltyModel: JsonObject;
  acceptedAtUtc: UtcIsoString;
  earliestStartUtc?: UtcIsoString;
  deadlineUtc: UtcIsoString;
  contractState: CompanyContractState;
  assignedAircraftId?: string;
}
