const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function normalizeUtcTimestamp(value: string): string | null {
  const trimmedValue = value.trim();

  if (!trimmedValue || !UTC_TIMESTAMP_PATTERN.test(trimmedValue)) {
    return null;
  }

  const parsedTimestamp = Date.parse(trimmedValue);
  if (Number.isNaN(parsedTimestamp)) {
    return null;
  }

  return new Date(parsedTimestamp).toISOString();
}

export function normalizeOptionalUtcTimestamp<T extends string | null | undefined>(value: T): T extends string ? string | null : T {
  if (typeof value !== "string") {
    return value as T extends string ? string | null : T;
  }

  return normalizeUtcTimestamp(value) as T extends string ? string | null : T;
}
