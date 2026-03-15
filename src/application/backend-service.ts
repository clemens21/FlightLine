import { access, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { handleAcceptContractOffer } from "./commands/accept-contract-offer.js";
import { handleAdvanceTime } from "./commands/advance-time.js";
import { handleAcquireAircraft } from "./commands/acquire-aircraft.js";
import { handleActivateStaffingPackage } from "./commands/activate-staffing-package.js";
import { handleCommitAircraftSchedule } from "./commands/commit-aircraft-schedule.js";
import { handleCreateCompany } from "./commands/create-company.js";
import { handleCreateSaveGame } from "./commands/create-save-game.js";
import { handleRefreshContractBoard } from "./commands/refresh-contract-board.js";
import { handleSaveScheduleDraft } from "./commands/save-schedule-draft.js";
import type { CommandResult, SupportedCommand } from "./commands/types.js";
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

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled command: ${JSON.stringify(value)}`);
}

export class FlightLineBackend {
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
        const { database, saveFilePath } = await this.openSaveDatabase(command.saveId);

        try {
          return await handleCreateSaveGame(command, {
            saveDatabase: database,
            saveFilePath,
            resolveAirportSnapshotVersion: async () => this.airportReference.getSnapshotVersion(),
            resolveAircraftSnapshotVersion: async () => this.resolveAircraftSnapshotVersion(),
          });
        } finally {
          await database.close();
        }
      }

      case "CreateCompany": {
        const opened = await this.openExistingSaveDatabase(command.saveId);
        if (!opened) {
          return this.missingSaveResult(command.commandId, command.saveId);
        }

        try {
          return await handleCreateCompany(command, {
            saveDatabase: opened.database,
            airportReference: this.airportReference,
          });
        } finally {
          await opened.database.close();
        }
      }

      case "AcquireAircraft": {
        const opened = await this.openExistingSaveDatabase(command.saveId);
        if (!opened) {
          return this.missingSaveResult(command.commandId, command.saveId);
        }

        try {
          return await handleAcquireAircraft(command, {
            saveDatabase: opened.database,
            airportReference: this.airportReference,
            aircraftReference: this.aircraftReference,
          });
        } finally {
          await opened.database.close();
        }
      }

      case "ActivateStaffingPackage": {
        const opened = await this.openExistingSaveDatabase(command.saveId);
        if (!opened) {
          return this.missingSaveResult(command.commandId, command.saveId);
        }

        try {
          return await handleActivateStaffingPackage(command, {
            saveDatabase: opened.database,
            aircraftReference: this.aircraftReference,
          });
        } finally {
          await opened.database.close();
        }
      }

      case "SaveScheduleDraft": {
        const opened = await this.openExistingSaveDatabase(command.saveId);
        if (!opened) {
          return this.missingSaveResult(command.commandId, command.saveId);
        }

        try {
          return await handleSaveScheduleDraft(command, {
            saveDatabase: opened.database,
            airportReference: this.airportReference,
            aircraftReference: this.aircraftReference,
          });
        } finally {
          await opened.database.close();
        }
      }

      case "CommitAircraftSchedule": {
        const opened = await this.openExistingSaveDatabase(command.saveId);
        if (!opened) {
          return this.missingSaveResult(command.commandId, command.saveId);
        }

        try {
          return await handleCommitAircraftSchedule(command, {
            saveDatabase: opened.database,
            airportReference: this.airportReference,
            aircraftReference: this.aircraftReference,
          });
        } finally {
          await opened.database.close();
        }
      }

      case "RefreshContractBoard": {
        const opened = await this.openExistingSaveDatabase(command.saveId);
        if (!opened) {
          return this.missingSaveResult(command.commandId, command.saveId);
        }

        try {
          return await handleRefreshContractBoard(command, {
            saveDatabase: opened.database,
            airportReference: this.airportReference,
          });
        } finally {
          await opened.database.close();
        }
      }

      case "AcceptContractOffer": {
        const opened = await this.openExistingSaveDatabase(command.saveId);
        if (!opened) {
          return this.missingSaveResult(command.commandId, command.saveId);
        }

        try {
          return await handleAcceptContractOffer(command, {
            saveDatabase: opened.database,
          });
        } finally {
          await opened.database.close();
        }
      }

      case "AdvanceTime": {
        const opened = await this.openExistingSaveDatabase(command.saveId);
        if (!opened) {
          return this.missingSaveResult(command.commandId, command.saveId);
        }

        try {
          return await handleAdvanceTime(command, {
            saveDatabase: opened.database,
            aircraftReference: this.aircraftReference,
          });
        } finally {
          await opened.database.close();
        }
      }
    }

    return assertUnreachable(command);
  }

  async loadCompanyContext(saveId: string): Promise<CompanyContext | null> {
    const opened = await this.openExistingSaveDatabase(saveId);
    if (!opened) {
      return null;
    }

    try {
      return loadActiveCompanyContext(opened.database, saveId);
    } finally {
      await opened.database.close();
    }
  }

  async loadCompanyContracts(saveId: string): Promise<CompanyContractsView | null> {
    const opened = await this.openExistingSaveDatabase(saveId);
    if (!opened) {
      return null;
    }

    try {
      return loadCompanyContracts(opened.database, saveId);
    } finally {
      await opened.database.close();
    }
  }

  async loadActiveContractBoard(saveId: string): Promise<ContractBoardView | null> {
    const opened = await this.openExistingSaveDatabase(saveId);
    if (!opened) {
      return null;
    }

    try {
      return loadActiveContractBoard(opened.database, saveId);
    } finally {
      await opened.database.close();
    }
  }

  async loadRecentEventLog(saveId: string, limit = 20): Promise<EventLogView | null> {
    const opened = await this.openExistingSaveDatabase(saveId);
    if (!opened) {
      return null;
    }

    try {
      return loadRecentEventLog(opened.database, saveId, limit);
    } finally {
      await opened.database.close();
    }
  }

  async loadFleetState(saveId: string): Promise<FleetStateView | null> {
    const opened = await this.openExistingSaveDatabase(saveId);
    if (!opened) {
      return null;
    }

    try {
      return loadFleetState(opened.database, this.aircraftReference, saveId);
    } finally {
      await opened.database.close();
    }
  }

  async loadStaffingState(saveId: string): Promise<StaffingStateView | null> {
    const opened = await this.openExistingSaveDatabase(saveId);
    if (!opened) {
      return null;
    }

    try {
      return loadStaffingState(opened.database, saveId);
    } finally {
      await opened.database.close();
    }
  }

  async loadAircraftSchedules(saveId: string, aircraftId?: string): Promise<AircraftScheduleView[]> {
    const opened = await this.openExistingSaveDatabase(saveId);
    if (!opened) {
      return [];
    }

    try {
      return loadAircraftSchedules(opened.database, saveId, aircraftId);
    } finally {
      await opened.database.close();
    }
  }

  async close(): Promise<void> {
    await Promise.all([this.airportReference.close(), this.aircraftReference.close()]);
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

  private async openSaveDatabase(saveId: string): Promise<{ database: SqliteFileDatabase; saveFilePath: string }> {
    const saveFilePath = resolve(this.config.saveDirectoryPath, `${saveId}.sqlite`);
    const database = await SqliteFileDatabase.open(saveFilePath);
    await applySaveMigrations(database);
    await database.persist();
    return { database, saveFilePath };
  }

  private async openExistingSaveDatabase(saveId: string): Promise<{ database: SqliteFileDatabase; saveFilePath: string } | null> {
    const saveFilePath = resolve(this.config.saveDirectoryPath, `${saveId}.sqlite`);

    try {
      await access(saveFilePath);
    } catch {
      return null;
    }

    const database = await SqliteFileDatabase.open(saveFilePath);
    await applySaveMigrations(database);
    return { database, saveFilePath };
  }

  private async resolveAircraftSnapshotVersion(): Promise<string> {
    const fileStat = await stat(this.config.aircraftDatabasePath);
    return `flightline-aircraft:${fileStat.size}:${fileStat.mtime.toISOString()}`;
  }
}


