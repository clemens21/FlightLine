import { access, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { handleAcceptContractOffer } from "./commands/accept-contract-offer.js";
import { handleCancelCompanyContract } from "./commands/cancel-company-contract.js";
import { handleAdvanceTime } from "./commands/advance-time.js";
import { handleAcquireAircraft } from "./commands/acquire-aircraft.js";
import { handleActivateStaffingPackage } from "./commands/activate-staffing-package.js";
import { handleCommitAircraftSchedule } from "./commands/commit-aircraft-schedule.js";
import { handleCreateCompany } from "./commands/create-company.js";
import { handleCreateSaveGame } from "./commands/create-save-game.js";
import { handleRefreshAircraftMarket } from "./commands/refresh-aircraft-market.js";
import { handleRefreshContractBoard } from "./commands/refresh-contract-board.js";
import { handleSaveScheduleDraft } from "./commands/save-schedule-draft.js";
import type { CommandResult, SupportedCommand } from "./commands/types.js";
import { loadActiveAircraftMarket, type AircraftMarketView } from "./queries/aircraft-market.js";
import { loadActiveCompanyContext, type CompanyContext } from "./queries/company-state.js";
import { loadCompanyContracts, type CompanyContractsView } from "./queries/company-contracts.js";
import { loadActiveContractBoard, type ContractBoardView } from "./queries/contract-board.js";
import { loadRecentEventLog, type EventLogView } from "./queries/event-log.js";
import { loadFleetState, type FleetStateView } from "./queries/fleet-state.js";
import { loadAircraftSchedules, type AircraftScheduleView } from "./queries/schedule-state.js";
import { loadStaffingState, type StaffingStateView } from "./queries/staffing-state.js";
import { applySaveMigrations } from "../infrastructure/persistence/sqlite/migrations.js";
import { SqliteFileDatabase } from "../infrastructure/persistence/sqlite/sqlite-file-database.js";
import { AircraftReferenceRepository } from "../infrastructure/reference/aircraft-reference.js";
import { AirportReferenceRepository } from "../infrastructure/reference/airport-reference.js";

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
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
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
        return result ?? this.missingSaveResult(command.commandId, command.saveId);
      }
    }

    return assertUnreachable(command);
  }

  async loadCompanyContext(saveId: string): Promise<CompanyContext | null> {
    return this.withExistingSaveDatabase(saveId, (context) => loadActiveCompanyContext(context.saveDatabase, saveId));
  }

  async loadCompanyContracts(saveId: string): Promise<CompanyContractsView | null> {
    return this.withExistingSaveDatabase(saveId, (context) => loadCompanyContracts(context.saveDatabase, saveId));
  }

  async loadActiveContractBoard(saveId: string): Promise<ContractBoardView | null> {
    return this.withExistingSaveDatabase(saveId, (context) => loadActiveContractBoard(context.saveDatabase, saveId));
  }

  async loadActiveAircraftMarket(saveId: string): Promise<AircraftMarketView | null> {
    return this.withExistingSaveDatabase(saveId, (context) => loadActiveAircraftMarket(context.saveDatabase, saveId));
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

  async loadAircraftSchedules(saveId: string, aircraftId?: string): Promise<AircraftScheduleView[]> {
    const schedules = await this.withExistingSaveDatabase(saveId, (context) => loadAircraftSchedules(context.saveDatabase, saveId, aircraftId));
    return schedules ?? [];
  }

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
