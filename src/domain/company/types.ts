import type { AirportId, CompanyBaseId, CompanyId, SaveId, UtcIsoString } from "../common/primitives.js";

export type CompanyPhase = "startup" | "small_operator" | "regional_carrier" | "expanding";
export type BaseRole = "home_base" | "base" | "focus";

export interface Company {
  companyId: CompanyId;
  saveId: SaveId;
  displayName: string;
  reputationScore: number;
  companyPhase: CompanyPhase;
  progressionTier: number;
  createdAtUtc: UtcIsoString;
}

export interface CompanyBase {
  companyBaseId: CompanyBaseId;
  companyId: CompanyId;
  airportId: AirportId;
  baseRole: BaseRole;
  activatedAtUtc: UtcIsoString;
}

export interface AirportRelationship {
  airportRelationshipId: string;
  companyId: CompanyId;
  airportId: AirportId;
  marketBiasScore: number;
  recentSuccessScore: number;
  recentFailureScore: number;
  updatedAtUtc: UtcIsoString;
}
