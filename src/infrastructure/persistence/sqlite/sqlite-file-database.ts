import DatabaseConstructor from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type BindParams = Record<string, unknown> | readonly unknown[] | unknown | undefined;

export interface SqliteFileDatabaseOpenOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
  enableWriteOptimizations?: boolean;
}

function hasNamedParameters(params: BindParams): params is Record<string, unknown> {
  return typeof params === "object" && params !== null && !Array.isArray(params);
}

function normalizeNamedParameters(params: Record<string, unknown>): Record<string, unknown> {
  const normalizedEntries = Object.entries(params).map(([key, value]) => [key.replace(/^[:@$]/u, ""), value]);
  return Object.fromEntries(normalizedEntries);
}

export class SqliteFileDatabase {
  private constructor(
    public readonly filePath: string,
    private readonly database: InstanceType<typeof DatabaseConstructor>,
    private readonly readOnly: boolean,
  ) {}

  static async open(filePath: string, options: SqliteFileDatabaseOpenOptions = {}): Promise<SqliteFileDatabase> {
    const readOnly = options.readonly ?? false;

    if (!readOnly) {
      await mkdir(dirname(filePath), { recursive: true });
    }

    const database = new DatabaseConstructor(filePath, {
      readonly: readOnly,
      fileMustExist: options.fileMustExist ?? false,
      timeout: 5000,
    });

    const sqliteFileDatabase = new SqliteFileDatabase(filePath, database, readOnly);
    sqliteFileDatabase.exec("PRAGMA foreign_keys = ON;");

    if (!readOnly && (options.enableWriteOptimizations ?? true)) {
      sqliteFileDatabase.exec("PRAGMA journal_mode = WAL;");
      sqliteFileDatabase.exec("PRAGMA synchronous = NORMAL;");
    }

    return sqliteFileDatabase;
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  run(sql: string, params?: BindParams): void {
    const statement = this.database.prepare(sql);

    if (params === undefined) {
      statement.run();
      return;
    }

    if (Array.isArray(params)) {
      statement.run(...params);
      return;
    }

    if (hasNamedParameters(params)) {
      statement.run(normalizeNamedParameters(params));
      return;
    }

    statement.run(params);
  }

  getOne<TRow extends Record<string, unknown>>(sql: string, params?: BindParams): TRow | null {
    const statement = this.database.prepare(sql);
    let row: TRow | undefined;

    if (params === undefined) {
      row = statement.get() as TRow | undefined;
    } else if (Array.isArray(params)) {
      row = statement.get(...params) as TRow | undefined;
    } else if (hasNamedParameters(params)) {
      row = statement.get(normalizeNamedParameters(params)) as TRow | undefined;
    } else {
      row = statement.get(params) as TRow | undefined;
    }

    return row ?? null;
  }

  all<TRow extends Record<string, unknown>>(sql: string, params?: BindParams): TRow[] {
    const statement = this.database.prepare(sql);

    if (params === undefined) {
      return statement.all() as TRow[];
    }

    if (Array.isArray(params)) {
      return statement.all(...params) as TRow[];
    }

    if (hasNamedParameters(params)) {
      return statement.all(normalizeNamedParameters(params)) as TRow[];
    }

    return statement.all(params) as TRow[];
  }

  transaction<TResult>(operation: () => TResult): TResult {
    this.exec("BEGIN IMMEDIATE TRANSACTION;");

    try {
      const result = operation();
      this.exec("COMMIT;");
      return result;
    } catch (error) {
      try {
        this.exec("ROLLBACK;");
      } catch {
        // Ignore rollback errors so the original error is preserved.
      }

      throw error;
    }
  }

  async persist(): Promise<void> {
    if (!this.readOnly) {
      this.exec("PRAGMA wal_checkpoint(PASSIVE);");
    }
  }

  async close(): Promise<void> {
    if (!this.database.open) {
      return;
    }

    if (!this.readOnly) {
      try {
        this.exec("PRAGMA optimize;");
      } catch {
        // Best effort only.
      }

      try {
        this.exec("PRAGMA wal_checkpoint(TRUNCATE);");
      } catch {
        // Best effort only.
      }
    }

    this.database.close();
  }
}
