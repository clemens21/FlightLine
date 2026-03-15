import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { SqliteFileDatabase } from "./sqlite-file-database.js";

const SAVE_MIGRATION_FILES = ["0001_initial.sql"] as const;
const saveSchemaDirectoryUrl = new URL("../save-schema/", import.meta.url);

export async function applySaveMigrations(database: SqliteFileDatabase, appVersion = "dev"): Promise<void> {
  database.run(
    `CREATE TABLE IF NOT EXISTS schema_migration (
      migration_id TEXT PRIMARY KEY,
      applied_at_utc TEXT NOT NULL,
      app_version TEXT NOT NULL
    )`,
  );

  const appliedMigrationRows = database.all<{ migration_id: string }>(
    "SELECT migration_id FROM schema_migration ORDER BY migration_id",
  );
  const appliedMigrations = new Set(appliedMigrationRows.map((row) => row.migration_id));

  for (const migrationFileName of SAVE_MIGRATION_FILES) {
    const migrationId = migrationFileName.replace(/\.sql$/u, "");

    if (appliedMigrations.has(migrationId)) {
      continue;
    }

    const migrationFilePath = fileURLToPath(new URL(migrationFileName, saveSchemaDirectoryUrl));
    const migrationSql = await readFile(migrationFilePath, "utf8");

    database.transaction(() => {
      database.exec(migrationSql);
      database.run(
        `INSERT INTO schema_migration (
          migration_id,
          applied_at_utc,
          app_version
        ) VALUES (
          $migration_id,
          $applied_at_utc,
          $app_version
        )`,
        {
          $migration_id: migrationId,
          $applied_at_utc: new Date().toISOString(),
          $app_version: appVersion,
        },
      );
    });
  }
}
