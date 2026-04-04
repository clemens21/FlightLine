import type { JsonObject } from "../../domain/common/primitives.js";

export function parseJsonObject<T = JsonObject>(rawValue: string): T {
  return JSON.parse(rawValue) as T;
}

export function nullToUndefined<T>(value: T | null): T | undefined {
  return value ?? undefined;
}
