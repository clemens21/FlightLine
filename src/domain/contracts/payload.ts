/*
 * Centralizes contract payload math so the contracts board, dispatch validator, and execution pipeline
 * all use the same passenger-weight assumption and aggregate the same way.
 */

export const defaultPassengerWeightLb = 195;

export interface ContractPayloadInput {
  volumeType?: "passenger" | "cargo" | string;
  passengerCount?: number | null | undefined;
  cargoWeightLb?: number | null | undefined;
}

export interface ContractPayloadTotals {
  volumeType: "none" | "passenger" | "cargo" | "mixed";
  passengerCount: number;
  cargoWeightLb: number;
  passengerPayloadWeightLb: number;
  totalPayloadWeightLb: number;
}

export function resolvePassengerPayloadWeightLb(
  passengerCount: number | null | undefined,
  passengerWeightLb: number = defaultPassengerWeightLb,
): number {
  const normalizedPassengerCount = Math.max(0, passengerCount ?? 0);
  return normalizedPassengerCount * passengerWeightLb;
}

export function aggregateContractPayload(
  payloads: readonly ContractPayloadInput[],
  passengerWeightLb: number = defaultPassengerWeightLb,
): ContractPayloadTotals {
  let passengerCount = 0;
  let cargoWeightLb = 0;

  for (const payload of payloads) {
    if (payload.volumeType === "passenger") {
      passengerCount += Math.max(0, payload.passengerCount ?? 0);
      continue;
    }

    if (payload.volumeType === "cargo") {
      cargoWeightLb += Math.max(0, payload.cargoWeightLb ?? 0);
    }
  }

  const passengerPayloadWeightLb = resolvePassengerPayloadWeightLb(passengerCount, passengerWeightLb);
  const totalPayloadWeightLb = passengerPayloadWeightLb + cargoWeightLb;
  const volumeType = passengerCount > 0 && cargoWeightLb > 0
    ? "mixed"
    : passengerCount > 0
      ? "passenger"
      : cargoWeightLb > 0
        ? "cargo"
        : "none";

  return {
    volumeType,
    passengerCount,
    cargoWeightLb,
    passengerPayloadWeightLb,
    totalPayloadWeightLb,
  };
}
