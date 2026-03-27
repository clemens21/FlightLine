/*
 * Coordinates command dispatch, save-database access, reference repositories, and lifecycle helpers for the whole application.
 * Most higher-level entry points talk to the simulation through this service instead of touching persistence or reference data directly.
 * Read this file as the application's composition root: it opens save sessions, wires command/query handlers,
 * and exposes the narrow surface area that the UI/server layer is allowed to call.
 */

import { access, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { handleAcceptContractOffer } from "./commands/accept-contract-offer.js";
import { handleCancelCompanyContract } from "./commands/cancel-company-contract.js";
import { handleAdvanceTime } from "./commands/advance-time.js";
import { handleAcquireAircraft } from "./commands/acquire-aircraft.js";
import { handleActivateStaffingPackage } from "./commands/activate-staffing-package.js";
import { handleCommitAircraftSchedule } from "./commands/commit-aircraft-schedule.js";
import { handleConvertNamedPilotToDirectHire } from "./commands/convert-named-pilot-to-direct-hire.js";
import { handleCreateCompany } from "./commands/create-company.js";
import { handleCreateSaveGame } from "./commands/create-save-game.js";
import { handleDiscardAircraftScheduleDraft } from "./commands/discard-aircraft-schedule-draft.js";
import { handleDismissNamedPilot } from "./commands/dismiss-named-pilot.js";
import { handleRefreshAircraftMarket } from "./commands/refresh-aircraft-market.js";
import { handleRefreshContractBoard } from "./commands/refresh-contract-board.js";
import { handleRefreshStaffingMarket } from "./commands/refresh-staffing-market.js";
import { handleScheduleMaintenance } from "./commands/schedule-maintenance.js";
import { handleSaveScheduleDraft } from "./commands/save-schedule-draft.js";
import { handleStartNamedPilotTransfer } from "./commands/start-named-pilot-transfer.js";
import { handleStartNamedPilotTraining } from "./commands/start-named-pilot-training.js";
import type { CommandResult, SupportedCommand } from "./commands/types.js";
import { loadActiveAircraftMarket, type AircraftMarketView } from "./queries/aircraft-market.js";
import { loadActiveCompanyContext, type CompanyContext } from "./queries/company-state.js";
import { loadCompanyContracts, type CompanyContractsView } from "./queries/company-contracts.js";
import { loadActiveContractBoard, type ContractBoardView } from "./queries/contract-board.js";
import { loadRecentEventLog, type EventLogView } from "./queries/event-log.js";
import { loadFleetState, type FleetStateView } from "./queries/fleet-state.js";
import { loadPilotLaborHistory, type PilotLaborHistoryView } from "./queries/pilot-labor-history.js";
import { loadAircraftSchedules, type AircraftScheduleView } from "./queries/schedule-state.js";
import { loadActiveStaffingMarket, type StaffingMarketView } from "./queries/staffing-market.js";
import { loadStaffingState, type StaffingStateView } from "./queries/staffing-state.js";
import { applySaveMigrations } from "../infrastructure/persistence/sqlite/migrations.js";
import { SqliteFileDatabase } from "../infrastructure/persistence/sqlite/sqlite-file-database.js";
import { AircraftReferenceRepository } from "../infrastructure/reference/aircraft-reference.js";
import { AirportReferenceRepository } from "../infrastructure/reference/airport-reference.js";
import { reconcileAircraftMarket } from "./aircraft/aircraft-market-reconciler.js";
import { reconcileStaffingMarket } from "./staffing/staffing-market-reconciler.js";
import { reconcileNamedPilots } from "./staffing/named-pilot-roster.js";

// These types capture the long-lived backend configuration and the per-save session context handed to readers and commands.
export interface FlightLineBackendConfig {
  saveDirectoryPath?: string;
  airportDatabasePath?: string;
  aircraftDatabasePath?: string;
}

interface ResolvedFlightLineBackendConfig {
  saveDirectoryPath: string;
  airportDatabasePath: string;
  aircraftDatabasePath: string;
}

export interface FlightLineSaveReadContext {
  saveId: string;
  saveFilePath: string;
  saveDatabase: SqliteFileDatabase;
}

interface SaveSession extends FlightLineSaveReadContext {}

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled command: ${JSON.stringify(value)}`);
}

export class FlightLineBackend {
  private readonly saveSessions = new Map<string, Promise<SaveSession>>();

  private constructor(
    private readonly config: ResolvedFlightLineBackendConfig,
    private readonly airportReference: AirportReferenceRepository,
    private readonly aircraftReference: AircraftReferenceRepository,
  ) {}

  // Backend creation opens shared reference repositories once and reuses them for every save session.
  static async create(config: FlightLineBackendConfig = {}): Promise<FlightLineBackend> {
    const resolvedConfig: ResolvedFlightLineBackendConfig = {
      saveDirectoryPath: config.saveDirectoryPath ?? resolve(process.cwd(), "data", "saves"),
      airportDatabasePath:
        config.airportDatabasePath ?? resolve(process.cwd(), "data", "airports", "flightline-airports.sqlite"),
      aircraftDatabasePath:
        config.aircraftDatabasePath ?? resolve(process.cwd(), "data", "aircraft", "flightline-aircraft.sqlite"),
    };

    const [airportReference, aircraftReference] = await Promise.all([
      AirportReferenceRepository.open(resolvedConfig.airportDatabasePath),
      AircraftReferenceRepository.open(resolvedConfig.aircraftDatabasePath),
    ]);

    return new FlightLineBackend(resolvedConfig, airportReference, aircraftReference);
  }

  // Central write entry point: route one supported command to its handler with the exact dependencies it needs.
  async dispatch(command: SupportedCommand): Promise<CommandResult> {
    switch (command.commandName) {
      case "CreateSaveGame": {
        const session = await this.openSaveSession(command.saveId, { createIfMissing: true });

        return handleCreateSaveGame(command, {
          saveDatabase: session.saveDatabase,
          saveFilePath: session.saveFilePath,
          resolveAirportSnapshotVersion: async () => this.airportReference.getSnapshotVersion(),
          resolveAircraftSnapshotVersion: async () => this.resolveAircraftSnapshotVersion(),
        });
      }

      case "CreateCompany": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleCreateCompany(command, {
          saveDatabase: context.saveDatabase,
          airportReference: this.airportReference,
        }));
        if (!result) {
          return this.missingSaveResult(command.commandId, command.saveId);
        }

        if (result.success) {
          const marketResult = await this.reconcileAircraftMarket(command.saveId, "bootstrap");
          if (marketResult?.success) {
            result.metadata = {
              ...(result.metadata ?? {}),
              aircraftMarketChanged: marketResult.changed,
              aircraftMarketOfferCount: marketResult.offerCount,
            };
          }
        }

        return result;
      }

      case "AcquireAircraft": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleAcquireAircraft(command, {
          saveDatabase: context.saveDatabase,
          airportReference: this.airportReference,
          aircraftReference: this.aircraftReference,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "ActivateStaffingPackage": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleActivateStaffingPackage(command, {
          saveDatabase: context.saveDatabase,
          aircraftReference: this.aircraftReference,
          airportReference: this.airportReference,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "SaveScheduleDraft": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleSaveScheduleDraft(command, {
          saveDatabase: context.saveDatabase,
          airportReference: this.airportReference,
          aircraftReference: this.aircraftReference,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "CommitAircraftSchedule": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleCommitAircraftSchedule(command, {
          saveDatabase: context.saveDatabase,
          airportReference: this.airportReference,
          aircraftReference: this.aircraftReference,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "DiscardAircraftScheduleDraft": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleDiscardAircraftScheduleDraft(command, {
          saveDatabase: context.saveDatabase,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "StartNamedPilotTraining": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleStartNamedPilotTraining(command, {
          saveDatabase: context.saveDatabase,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "StartNamedPilotTransfer": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleStartNamedPilotTransfer(command, {
          saveDatabase: context.saveDatabase,
          airportReference: this.airportReference,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "ConvertNamedPilotToDirectHire": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleConvertNamedPilotToDirectHire(command, {
          saveDatabase: context.saveDatabase,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "DismissNamedPilot": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleDismissNamedPilot(command, {
          saveDatabase: context.saveDatabase,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "ScheduleMaintenance": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleScheduleMaintenance(command, {
          saveDatabase: context.saveDatabase,
          aircraftReference: this.aircraftReference,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "RefreshContractBoard": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleRefreshContractBoard(command, {
          saveDatabase: context.saveDatabase,
          airportReference: this.airportReference,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "RefreshAircraftMarket": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleRefreshAircraftMarket(command, {
          saveDatabase: context.saveDatabase,
          airportReference: this.airportReference,
          aircraftReference: this.aircraftReference,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "RefreshStaffingMarket": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleRefreshStaffingMarket(command, {
          saveDatabase: context.saveDatabase,
          aircraftReference: this.aircraftReference,
          airportReference: this.airportReference,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "AcceptContractOffer": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleAcceptContractOffer(command, {
          saveDatabase: context.saveDatabase,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "CancelCompanyContract": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleCancelCompanyContract(command, {
          saveDatabase: context.saveDatabase,
        }));
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }

      case "AdvanceTime": {
        const result = await this.withExistingSaveDatabase(command.saveId, (context) => handleAdvanceTime(command, {
          saveDatabase: context.saveDatabase,
          aircraftReference: this.aircraftReference,
        }));
        if (!result) {
          return this.missingSaveResult(command.commandId, command.saveId);
        }

        if (result.success) {
          const marketResult = await this.reconcileAircraftMarket(command.saveId, "scheduled");
          if (marketResult?.success) {
            result.metadata = {
              ...(result.metadata ?? {}),
              aircraftMarketChanged: marketResult.changed,
              aircraftMarketOfferCount: marketResult.offerCount,
            };
          }

          const staffingMarketResult = await this.reconcileStaffingMarket(command.saveId, "scheduled");
          if (staffingMarketResult?.success) {
            result.metadata = {
              ...(result.metadata ?? {}),
              staffingMarketChanged: staffingMarketResult.changed,
              staffingMarketOfferCount: staffingMarketResult.offerCount,
            };
          }
        }

        return result;
      }
    }

    return assertUnreachable(command);
  }

  // Lightweight read helper for shell chrome and any feature that only needs company-level state.
  async loadCompanyContext(saveId: string): Promise<CompanyContext | null> {
    return this.withExistingSaveDatabase(saveId, (context) => loadActiveCompanyContext(context.saveDatabase, saveId));
  }

  // Returns the company's accepted/active/completed contract snapshot without mutating anything.
  async loadCompanyContracts(saveId: string): Promise<CompanyContractsView | null> {
    return this.withExistingSaveDatabase(saveId, (context) => loadCompanyContracts(context.saveDatabase, saveId));
  }

  // Returns the currently active commercial offer board, if one exists for this save.
  async loadActiveContractBoard(saveId: string): Promise<ContractBoardView | null> {
    return this.withExistingSaveDatabase(saveId, (context) => loadActiveContractBoard(context.saveDatabase, saveId));
  }

  // Returns the currently visible aircraft market state after any prior reconciliation has been persisted.
  async loadActiveAircraftMarket(saveId: string): Promise<AircraftMarketView | null> {
    return this.withExistingSaveDatabase(saveId, (context) => loadActiveAircraftMarket(context.saveDatabase, saveId));
  }

  async loadActiveStaffingMarket(saveId: string): Promise<StaffingMarketView | null> {
    return this.withExistingSaveDatabase(saveId, (context) => loadActiveStaffingMarket(context.saveDatabase, saveId));
  }

  // Reconciles the rolling aircraft market from simulated time so listings can expire and be replaced individually.
  async reconcileAircraftMarket(
    saveId: string,
    refreshReason: "scheduled" | "manual" | "bootstrap" = "scheduled",
  ) {
    return this.withExistingSaveDatabase(saveId, async (context) => {
      const commandId = `cmd_aircraft_market_${Date.now()}`;
      const issuedAtUtc = new Date().toISOString();

      const result = await handleRefreshAircraftMarket({
        commandId,
        saveId,
        commandName: "RefreshAircraftMarket",
        issuedAtUtc,
        actorType: "system",
        payload: {
          refreshReason,
        },
      }, {
        saveDatabase: context.saveDatabase,
        airportReference: this.airportReference,
        aircraftReference: this.aircraftReference,
      });

      return result.success
        ? {
            success: true,
            changed: Boolean(result.metadata?.changed),
            offerCount: Number(result.metadata?.offerCount ?? 0),
          }
        : {
            success: false,
            changed: false,
            offerCount: Number(result.metadata?.offerCount ?? 0),
          };
    });
  }

  async reconcileStaffingMarket(
    saveId: string,
    refreshReason: "scheduled" | "manual" | "bootstrap" = "scheduled",
  ) {
    const [companyContext, staffingMarket] = await Promise.all([
      this.loadCompanyContext(saveId),
      this.loadActiveStaffingMarket(saveId),
    ]);

    if (!companyContext) {
      return null;
    }

    const requiresRefresh = !staffingMarket
      || staffingMarket.offers.length === 0
      || new Date(staffingMarket.expiresAtUtc).getTime() <= new Date(companyContext.currentTimeUtc).getTime();

    if (!requiresRefresh) {
      return {
        success: true,
        changed: false,
        offerCount: staffingMarket.offers.length,
      };
    }

    return this.withExistingSaveDatabase(saveId, async (context) => {
      const commandId = `cmd_staffing_market_${Date.now()}`;
      const issuedAtUtc = new Date().toISOString();

        const result = await handleRefreshStaffingMarket({
        commandId,
        saveId,
        commandName: "RefreshStaffingMarket",
        issuedAtUtc,
        actorType: "system",
        payload: {
          refreshReason,
        },
      }, {
        saveDatabase: context.saveDatabase,
        aircraftReference: this.aircraftReference,
        airportReference: this.airportReference,
      });

      return result.success
        ? {
            success: true,
            changed: Boolean(result.metadata?.changed),
            offerCount: Number(result.metadata?.offerCount ?? 0),
          }
        : {
            success: false,
            changed: false,
            offerCount: Number(result.metadata?.offerCount ?? 0),
          };
    });
  }

  async loadRecentEventLog(saveId: string, limit = 20): Promise<EventLogView | null> {
    return this.withExistingSaveDatabase(saveId, (context) => loadRecentEventLog(context.saveDatabase, saveId, limit));
  }

  async loadFleetState(saveId: string): Promise<FleetStateView | null> {
    return this.withExistingSaveDatabase(saveId, (context) => loadFleetState(context.saveDatabase, this.aircraftReference, saveId));
  }

  async loadStaffingState(saveId: string): Promise<StaffingStateView | null> {
    return this.withExistingSaveDatabase(saveId, (context) => loadStaffingState(context.saveDatabase, saveId));
  }

  async loadPilotLaborHistory(saveId: string, namedPilotId: string, limit = 16): Promise<PilotLaborHistoryView | null> {
    return this.withExistingSaveDatabase(saveId, (context) =>
      loadPilotLaborHistory(context.saveDatabase, saveId, namedPilotId, limit)
    );
  }

  async loadAircraftSchedules(saveId: string, aircraftId?: string): Promise<AircraftScheduleView[]> {
    const schedules = await this.withExistingSaveDatabase(saveId, (context) => loadAircraftSchedules(context.saveDatabase, saveId, aircraftId));
    return schedules ?? [];
  }

  // Save sessions are cached per save id so a burst of UI/API calls reuses one sqlite connection.
  // Executes a read callback only when the save already exists, keeping callers from recreating sessions accidentally.
  async withExistingSaveDatabase<TResult>(
    saveId: string,
    reader: (context: FlightLineSaveReadContext) => TResult | Promise<TResult>,
  ): Promise<TResult | null> {
    const session = await this.getExistingSaveSession(saveId);

    if (!session) {
      return null;
    }

    return reader(session);
  }

  async closeSaveSession(saveId: string): Promise<void> {
    const existingSessionPromise = this.saveSessions.get(saveId);

    if (!existingSessionPromise) {
      return;
    }

    this.saveSessions.delete(saveId);
    const session = await existingSessionPromise;
    await session.saveDatabase.close();
  }

  async close(): Promise<void> {
    const sessionPromises = [...this.saveSessions.values()];
    this.saveSessions.clear();

    await Promise.allSettled([
      ...sessionPromises.map(async (sessionPromise) => {
        const session = await sessionPromise;
        await session.saveDatabase.close();
      }),
      this.airportReference.close(),
      this.aircraftReference.close(),
    ]);
  }

  getAirportReference(): AirportReferenceRepository {
    return this.airportReference;
  }

  getAircraftReference(): AircraftReferenceRepository {
    return this.aircraftReference;
  }

  // Everything below this point is session lifecycle plumbing rather than simulation logic.
  private missingSaveResult(commandId: string, saveId: string): CommandResult {
    return {
      success: false,
      commandId,
      changedAggregateIds: [],
      validationMessages: [`Save ${saveId} does not exist.`],
      hardBlockers: [`Save ${saveId} does not exist.`],
      warnings: [],
      emittedEventIds: [],
      emittedLedgerEntryIds: [],
    };
  }

  private async getExistingSaveSession(saveId: string): Promise<SaveSession | null> {
    const saveFilePath = resolve(this.config.saveDirectoryPath, `${saveId}.sqlite`);

    try {
      await access(saveFilePath);
    } catch {
      return null;
    }

    return this.openSaveSession(saveId, { createIfMissing: false });
  }

  private async openSaveSession(saveId: string, options: { createIfMissing: boolean }): Promise<SaveSession> {
    const existingSession = this.saveSessions.get(saveId);

    if (existingSession) {
      return existingSession;
    }

    const saveFilePath = resolve(this.config.saveDirectoryPath, `${saveId}.sqlite`);
    const sessionPromise = (async () => {
      const saveDatabase = await SqliteFileDatabase.open(saveFilePath, {
        readonly: false,
        fileMustExist: !options.createIfMissing,
        enableWriteOptimizations: true,
      });
      await applySaveMigrations(saveDatabase);
      const companyContext = loadActiveCompanyContext(saveDatabase, saveId);
      if (companyContext) {
        const reconcileResult = reconcileNamedPilots(
          saveDatabase,
          companyContext.companyId,
          companyContext.homeBaseAirportId,
          companyContext.currentTimeUtc,
          this.airportReference,
        );

        if (reconcileResult.changed) {
          await saveDatabase.persist();
        }
      }
      return {
        saveId,
        saveFilePath,
        saveDatabase,
      } satisfies SaveSession;
    })();

    this.saveSessions.set(saveId, sessionPromise);

    try {
      return await sessionPromise;
    } catch (error) {
      this.saveSessions.delete(saveId);
      throw error;
    }
  }

  private async resolveAircraftSnapshotVersion(): Promise<string> {
    const fileStat = await stat(this.config.aircraftDatabasePath);
    return `flightline-aircraft:${fileStat.size}:${fileStat.mtime.toISOString()}`;
  }
}
