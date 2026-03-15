import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import initSqlJs from "sql.js";
import type { BindParams, Database as SqlJsDatabase, SqlJsStatic } from "sql.js";

const require = createRequire(import.meta.url);
let sqlJsPromise: Promise<SqlJsStatic> | null = null;

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: (file) => {
        const resolvedFilePath = require.resolve(`sql.js/dist/${file}`);
        return pathToFileURL(resolvedFilePath).href;
      },
    });
  }

  return sqlJsPromise;
}

export class SqliteFileDatabase {
  private constructor(
    public readonly filePath: string,
    private readonly database: SqlJsDatabase,
  ) {}

  static async open(filePath: string): Promise<SqliteFileDatabase> {
    await mkdir(dirname(filePath), { recursive: true });

    let sourceBytes: Buffer | undefined;

    try {
      sourceBytes = await readFile(filePath);
    } catch (error) {
      const maybeNodeError = error as NodeJS.ErrnoException;

      if (maybeNodeError.code !== "ENOENT") {
        throw error;
      }
    }

    const SQL = await loadSqlJs();
    const database = sourceBytes ? new SQL.Database(sourceBytes) : new SQL.Database();
    const sqliteFileDatabase = new SqliteFileDatabase(filePath, database);
    sqliteFileDatabase.run("PRAGMA foreign_keys = ON;");
    return sqliteFileDatabase;
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  run(sql: string, params?: BindParams): void {
    this.database.run(sql, params);
  }

  getOne<TRow extends Record<string, unknown>>(sql: string, params?: BindParams): TRow | null {
    const statement = this.database.prepare(sql, params);

    try {
      if (!statement.step()) {
        return null;
      }

      return statement.getAsObject() as TRow;
    } finally {
      statement.free();
    }
  }

  all<TRow extends Record<string, unknown>>(sql: string, params?: BindParams): TRow[] {
    const statement = this.database.prepare(sql, params);

    try {
      const rows: TRow[] = [];

      while (statement.step()) {
        rows.push(statement.getAsObject() as TRow);
      }

      return rows;
    } finally {
      statement.free();
    }
  }

  transaction<TResult>(operation: () => TResult): TResult {
    this.run("BEGIN IMMEDIATE TRANSACTION;");

    try {
      const result = operation();
      this.run("COMMIT;");
      return result;
    } catch (error) {
      try {
        this.run("ROLLBACK;");
      } catch {
        // Ignore rollback errors so the original error is preserved.
      }

      throw error;
    }
  }

  async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, Buffer.from(this.database.export()));
  }

  async close(): Promise<void> {
    this.database.close();
  }
}
