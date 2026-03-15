import type {
  AircraftModelId,
  AirportId,
  CompanyId,
  ContractOfferId,
  CurrencyAmount,
  JsonObject,
  OfferWindowId,
  UtcIsoString,
} from "../common/primitives.js";

export type OfferWindowType = "contract_board" | "aircraft_market" | "staffing_market";
export type OfferStatus = "available" | "shortlisted" | "accepted" | "expired";

export interface OfferWindow {
  offerWindowId: OfferWindowId;
  companyId: CompanyId;
  windowType: OfferWindowType;
  generatedAtUtc: UtcIsoString;
  expiresAtUtc: UtcIsoString;
  windowSeed: string;
  generationContextHash: string;
  refreshReason: string;
  status: "active" | "expired";
}

export interface ContractOffer {
  contractOfferId: ContractOfferId;
  offerWindowId: OfferWindowId;
  companyId: CompanyId;
  archetype: string;
  originAirportId: AirportId;
  destinationAirportId: AirportId;
  volumeType: "passenger" | "cargo";
  passengerCount?: number;
  cargoWeightLb?: number;
  earliestStartUtc: UtcIsoString;
  latestCompletionUtc: UtcIsoString;
  payoutAmount: CurrencyAmount;
  penaltyModel: JsonObject;
  likelyRole: string;
  difficultyBand: string;
  explanationMetadata: JsonObject;
  generatedSeed: string;
  offerStatus: OfferStatus;
}

export interface AircraftMarketOffer {
  aircraftMarketOfferId: string;
  offerWindowId: OfferWindowId;
  companyId: CompanyId;
  aircraftModelId: AircraftModelId;
  deliveryAirportId: AirportId;
  dealStructure: "purchase" | "finance" | "lease";
  upfrontPaymentAmount: CurrencyAmount;
  recurringPaymentAmount?: CurrencyAmount;
  termMonths?: number;
  offerStatus: OfferStatus;
  metadata?: JsonObject;
}

export interface StaffingMarketOffer {
  staffingMarketOfferId: string;
  offerWindowId: OfferWindowId;
  companyId: CompanyId;
  laborCategory: string;
  employmentModel: string;
  qualificationGroup: string;
  coverageUnits: number;
  fixedCostAmount: CurrencyAmount;
  variableCostRate?: CurrencyAmount;
  startsAtUtc?: UtcIsoString;
  endsAtUtc?: UtcIsoString;
  offerStatus: OfferStatus;
  metadata?: JsonObject;
}
