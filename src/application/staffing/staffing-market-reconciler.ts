/*
 * Generates and persists the first-pass pilot hiring market.
 * The market is intentionally small and qualification-driven so the player chooses people, not a wall of near-duplicate offers.
 */

import { createPrefixedId } from "../commands/utils.js";
import type { CompanyContext } from "../queries/company-state.js";
import type { EmploymentModel, PilotCertificationCode } from "../../domain/staffing/types.js";
import { certificationsForQualificationGroup, pilotCertificationsToJson } from "../../domain/staffing/pilot-certifications.js";
import type { SqliteFileDatabase } from "../../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AircraftReferenceRepository } from "../../infrastructure/reference/aircraft-reference.js";

interface AircraftRow extends Record<string, unknown> {
  aircraftModelId: string;
}

interface StaffingCoverageRow extends Record<string, unknown> {
  qualificationGroup: string;
  coverageUnits: number;
}

interface ActiveWindowRow extends Record<string, unknown> {
  offerWindowId: string;
}

interface QualificationDemand {
  qualificationGroup: string;
  aircraftCount: number;
  pilotsRequired: number;
  coverageUnits: number;
  sampleModelName?: string;
}

interface GeneratedPilotCandidateOffer {
  displayName: string;
  employmentModel: EmploymentModel;
  qualificationGroup: string;
  certifications: PilotCertificationCode[];
  fixedCostAmount: number;
  startsAtUtc: string;
  endsAtUtc?: string;
  currentAirportId: string;
  explanationMetadata: Record<string, unknown>;
  generatedSeed: string;
}

export interface GeneratedStaffingMarket {
  generatedAtUtc: string;
  expiresAtUtc: string;
  windowSeed: string;
  generationContextHash: string;
  offers: GeneratedPilotCandidateOffer[];
}

export interface StaffingMarketReconcileResult {
  success: boolean;
  changed: boolean;
  offerWindowId?: string;
  offerCount: number;
  validationMessages: string[];
}

const FIRST_NAMES = [
  "Avery",
  "Blake",
  "Cameron",
  "Dakota",
  "Emerson",
  "Finley",
  "Harper",
  "Jamie",
  "Jordan",
  "Kai",
  "Logan",
  "Morgan",
  "Parker",
  "Quinn",
  "Reese",
  "Riley",
  "Sawyer",
  "Skyler",
  "Taylor",
  "Tatum",
] as const;

const LAST_NAMES = [
  "Bennett",
  "Brooks",
  "Calloway",
  "Dalton",
  "Ellis",
  "Foster",
  "Grayson",
  "Hayes",
  "Iverson",
  "Jordan",
  "Kendall",
  "Lawson",
  "Mercer",
  "Nolan",
  "Parker",
  "Quincy",
  "Sawyer",
  "Sterling",
  "Turner",
  "Walker",
] as const;

const CONTRACT_DURATION_DAYS = [90, 120, 180] as const;

function addHoursIso(utcIsoString: string, hours: number): string {
  return new Date(new Date(utcIsoString).getTime() + hours * 3_600_000).toISOString();
}

function addDaysIso(utcIsoString: string, days: number): string {
  return addHoursIso(utcIsoString, days * 24);
}

function hashString(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }

  return Math.abs(hash);
}

function estimatePilotFixedCost(qualificationGroup: string): number {
  switch (qualificationGroup) {
    case "single_turboprop_premium":
      return 14_000;
    case "twin_turboprop_utility":
      return 18_000;
    case "twin_turboprop_commuter":
      return 22_000;
    case "single_turboprop_utility":
    default:
      return qualificationGroup.includes("twin") ? 18_000 : 12_000;
  }
}

function chooseOfferEmploymentModel(offerIndex: number): EmploymentModel {
  return offerIndex % 2 === 1 ? "contract_hire" : "direct_hire";
}

function chooseContractEndUtc(startsAtUtc: string, generatedSeed: string): string {
  const durationIndex = hashString(generatedSeed) % CONTRACT_DURATION_DAYS.length;
  return addDaysIso(startsAtUtc, CONTRACT_DURATION_DAYS[durationIndex]!);
}

function generateCandidateName(seedBase: string, usedNames: Set<string>): string {
  const seed = hashString(seedBase);

  for (let attempt = 0; attempt < FIRST_NAMES.length * LAST_NAMES.length; attempt += 1) {
    const firstName = FIRST_NAMES[(seed + attempt) % FIRST_NAMES.length]!;
    const lastName = LAST_NAMES[(seed * 7 + attempt) % LAST_NAMES.length]!;
    const candidate = `${firstName} ${lastName}`;

    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }

  const fallback = `Pilot ${usedNames.size + 1}`;
  usedNames.add(fallback);
  return fallback;
}

function loadQualificationDemand(
  saveDatabase: SqliteFileDatabase,
  companyContext: CompanyContext,
  aircraftReference: AircraftReferenceRepository,
): QualificationDemand[] {
  const aircraftRows = saveDatabase.all<AircraftRow>(
    `SELECT aircraft_model_id AS aircraftModelId
    FROM company_aircraft
    WHERE company_id = $company_id
      AND delivery_state IN ('available', 'delivered')
    ORDER BY acquired_at_utc ASC, aircraft_id ASC`,
    { $company_id: companyContext.companyId },
  );
  const coverageRows = saveDatabase.all<StaffingCoverageRow>(
    `SELECT
      qualification_group AS qualificationGroup,
      SUM(coverage_units) AS coverageUnits
    FROM staffing_package
    WHERE company_id = $company_id
      AND labor_category = 'pilot'
      AND status IN ('pending', 'active')
    GROUP BY qualification_group`,
    { $company_id: companyContext.companyId },
  );

  const demandByQualification = new Map<string, QualificationDemand>();

  for (const coverageRow of coverageRows) {
    demandByQualification.set(coverageRow.qualificationGroup, {
      qualificationGroup: coverageRow.qualificationGroup,
      aircraftCount: 0,
      pilotsRequired: 0,
      coverageUnits: coverageRow.coverageUnits,
    });
  }

  for (const aircraftRow of aircraftRows) {
    const model = aircraftReference.findModel(aircraftRow.aircraftModelId);
    if (!model) {
      continue;
    }

    const existing = demandByQualification.get(model.pilotQualificationGroup) ?? {
      qualificationGroup: model.pilotQualificationGroup,
      aircraftCount: 0,
      pilotsRequired: 0,
      coverageUnits: 0,
      sampleModelName: model.shortName,
    };
    existing.aircraftCount += 1;
    existing.pilotsRequired += Math.max(model.pilotsRequired, 1);
    existing.sampleModelName = existing.sampleModelName ?? model.shortName;
    demandByQualification.set(model.pilotQualificationGroup, existing);
  }

  if (demandByQualification.size === 0) {
    return [{
      qualificationGroup: "single_turboprop_utility",
      aircraftCount: 0,
      pilotsRequired: 1,
      coverageUnits: 0,
      sampleModelName: "startup utility flying",
    }];
  }

  return [...demandByQualification.values()]
    .sort((left, right) => {
      const leftGap = Math.max(left.pilotsRequired - left.coverageUnits, 0);
      const rightGap = Math.max(right.pilotsRequired - right.coverageUnits, 0);
      if (leftGap !== rightGap) {
        return rightGap - leftGap;
      }

      if (left.aircraftCount !== right.aircraftCount) {
        return right.aircraftCount - left.aircraftCount;
      }

      return left.qualificationGroup.localeCompare(right.qualificationGroup);
    });
}

export function generateStaffingMarket(
  saveDatabase: SqliteFileDatabase,
  companyContext: CompanyContext,
  aircraftReference: AircraftReferenceRepository,
  refreshReason: "scheduled" | "manual" | "bootstrap",
): GeneratedStaffingMarket {
  const demand = loadQualificationDemand(saveDatabase, companyContext, aircraftReference).slice(0, 2);
  const windowSeed = `staffing:${companyContext.worldSeed}:${companyContext.currentTimeUtc}:${refreshReason}`;
  const generationContextHash = JSON.stringify(
    demand.map((entry) => ({
      qualificationGroup: entry.qualificationGroup,
      aircraftCount: entry.aircraftCount,
      pilotsRequired: entry.pilotsRequired,
      coverageUnits: entry.coverageUnits,
    })),
  );
  const offers: GeneratedPilotCandidateOffer[] = [];
  const usedNames = new Set<string>();

  demand.forEach((entry, demandIndex) => {
    const desiredCount = demand.length === 1
      ? 3
      : demandIndex === 0
        ? 2
        : 1;

    for (let offerIndex = 0; offerIndex < desiredCount; offerIndex += 1) {
      const startsAtUtc = companyContext.currentTimeUtc;
      const generatedSeed = `${windowSeed}:${entry.qualificationGroup}:${offerIndex}`;
      const displayName = generateCandidateName(generatedSeed, usedNames);
      const employmentModel = chooseOfferEmploymentModel(offerIndex);

      offers.push({
        displayName,
        employmentModel,
        qualificationGroup: entry.qualificationGroup,
        certifications: certificationsForQualificationGroup(entry.qualificationGroup),
        fixedCostAmount: estimatePilotFixedCost(entry.qualificationGroup),
        startsAtUtc,
        currentAirportId: companyContext.homeBaseAirportId,
        explanationMetadata: {
          aircraftCount: entry.aircraftCount,
          pilotsRequired: entry.pilotsRequired,
          currentCoverageUnits: entry.coverageUnits,
          employmentModel,
          fitSummary: entry.aircraftCount > 0
            ? `Matches ${entry.sampleModelName ?? entry.qualificationGroup} operations.`
            : "Keeps early utility operations staffed.",
        },
        generatedSeed,
        ...(employmentModel === "contract_hire"
          ? { endsAtUtc: chooseContractEndUtc(startsAtUtc, generatedSeed) }
          : {}),
      });
    }
  });

  return {
    generatedAtUtc: companyContext.currentTimeUtc,
    expiresAtUtc: addHoursIso(companyContext.currentTimeUtc, 48),
    windowSeed,
    generationContextHash,
    offers,
  };
}

export function reconcileStaffingMarket(params: {
  saveDatabase: SqliteFileDatabase;
  companyContext: CompanyContext;
  aircraftReference: AircraftReferenceRepository;
  refreshReason: "scheduled" | "manual" | "bootstrap";
}): StaffingMarketReconcileResult {
  const { saveDatabase, companyContext, aircraftReference, refreshReason } = params;
  const generatedMarket = generateStaffingMarket(saveDatabase, companyContext, aircraftReference, refreshReason);

  if (generatedMarket.offers.length === 0) {
    return {
      success: false,
      changed: false,
      offerCount: 0,
      validationMessages: ["No pilot candidates could be generated for the current staffing market."],
    };
  }

  const existingActiveWindows = saveDatabase.all<ActiveWindowRow>(
    `SELECT offer_window_id AS offerWindowId
    FROM offer_window
    WHERE company_id = $company_id
      AND window_type = 'staffing_market'
      AND status = 'active'`,
    { $company_id: companyContext.companyId },
  );
  const offerWindowId = createPrefixedId("window");

  saveDatabase.transaction(() => {
    for (const existingWindow of existingActiveWindows) {
      saveDatabase.run(
        `UPDATE offer_window
        SET status = 'expired'
        WHERE offer_window_id = $offer_window_id`,
        { $offer_window_id: existingWindow.offerWindowId },
      );
      saveDatabase.run(
        `UPDATE staffing_offer
        SET offer_status = 'expired',
            closed_at_utc = COALESCE(closed_at_utc, $closed_at_utc),
            close_reason = COALESCE(close_reason, 'expired')
        WHERE offer_window_id = $offer_window_id
          AND offer_status = 'available'`,
        {
          $offer_window_id: existingWindow.offerWindowId,
          $closed_at_utc: companyContext.currentTimeUtc,
        },
      );
    }

    saveDatabase.run(
      `INSERT INTO offer_window (
        offer_window_id,
        company_id,
        window_type,
        generated_at_utc,
        expires_at_utc,
        window_seed,
        generation_context_hash,
        refresh_reason,
        status
      ) VALUES (
        $offer_window_id,
        $company_id,
        'staffing_market',
        $generated_at_utc,
        $expires_at_utc,
        $window_seed,
        $generation_context_hash,
        $refresh_reason,
        'active'
      )`,
      {
        $offer_window_id: offerWindowId,
        $company_id: companyContext.companyId,
        $generated_at_utc: generatedMarket.generatedAtUtc,
        $expires_at_utc: generatedMarket.expiresAtUtc,
        $window_seed: generatedMarket.windowSeed,
        $generation_context_hash: generatedMarket.generationContextHash,
        $refresh_reason: refreshReason,
      },
    );

    for (const offer of generatedMarket.offers) {
      saveDatabase.run(
        `INSERT INTO staffing_offer (
          staffing_offer_id,
          offer_window_id,
          company_id,
          labor_category,
          employment_model,
          qualification_group,
          coverage_units,
          fixed_cost_amount,
          variable_cost_rate,
          starts_at_utc,
          ends_at_utc,
          display_name,
          certifications_json,
          current_airport_id,
          explanation_metadata_json,
          generated_seed,
          offer_status,
          listed_at_utc,
          available_until_utc,
          closed_at_utc,
          close_reason
        ) VALUES (
          $staffing_offer_id,
          $offer_window_id,
          $company_id,
          'pilot',
          $employment_model,
          $qualification_group,
          1,
          $fixed_cost_amount,
          NULL,
          $starts_at_utc,
          $ends_at_utc,
          $display_name,
          $certifications_json,
          $current_airport_id,
          $explanation_metadata_json,
          $generated_seed,
          'available',
          $listed_at_utc,
          $available_until_utc,
          NULL,
          NULL
        )`,
        {
          $staffing_offer_id: createPrefixedId("offer"),
          $offer_window_id: offerWindowId,
          $company_id: companyContext.companyId,
          $employment_model: offer.employmentModel,
          $qualification_group: offer.qualificationGroup,
          $fixed_cost_amount: offer.fixedCostAmount,
          $starts_at_utc: offer.startsAtUtc,
          $ends_at_utc: offer.endsAtUtc ?? null,
          $display_name: offer.displayName,
          $certifications_json: pilotCertificationsToJson(offer.certifications),
          $current_airport_id: offer.currentAirportId,
          $explanation_metadata_json: JSON.stringify(offer.explanationMetadata),
          $generated_seed: offer.generatedSeed,
          $listed_at_utc: generatedMarket.generatedAtUtc,
          $available_until_utc: generatedMarket.expiresAtUtc,
        },
      );
    }
  });

  return {
    success: true,
    changed: true,
    offerWindowId,
    offerCount: generatedMarket.offers.length,
    validationMessages: [`Generated ${generatedMarket.offers.length} staffing offers.`],
  };
}
