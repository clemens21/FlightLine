import type { AircraftId, AircraftLayoutId, AircraftModelId, AirportId, CurrencyAmount, UtcIsoString } from "../common/primitives.js";

export type OwnershipType = "owned" | "financed" | "leased";
export type DeliveryState = "pending_delivery" | "delivered" | "available" | "retired";

export interface CompanyAircraft {
  aircraftId: AircraftId;
  companyId: string;
  aircraftModelId: AircraftModelId;
  activeCabinLayoutId?: AircraftLayoutId;
  registration: string;
  displayName: string;
  ownershipType: OwnershipType;
  currentAirportId: AirportId;
  deliveryState: DeliveryState;
  airframeHoursTotal: number;
  airframeCyclesTotal: number;
  conditionValue: number;
  statusInput: string;
  dispatchAvailable: boolean;
  activeScheduleId?: string;
  activeMaintenanceTaskId?: string;
  acquiredAtUtc: UtcIsoString;
}

export interface AcquisitionAgreement {
  acquisitionAgreementId: string;
  aircraftId: AircraftId;
  agreementType: OwnershipType;
  originOfferId?: string;
  startAtUtc: UtcIsoString;
  upfrontPaymentAmount: CurrencyAmount;
  recurringPaymentAmount?: CurrencyAmount;
  paymentCadence?: "weekly" | "monthly";
  termMonths?: number;
  endAtUtc?: UtcIsoString;
  rateBandOrApr?: number;
  status: "active" | "completed" | "cancelled";
}
