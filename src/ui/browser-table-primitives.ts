import { escapeHtml, formatDeadlineCountdown, renderStaticTableHeaderCell } from "./browser-ui-primitives.js";

export interface TableRouteCellAirport {
  code: string;
  label: string;
}

export function renderTableRouteCell(
  origin: TableRouteCellAirport,
  destination: TableRouteCellAirport,
  note: string | undefined = undefined,
): string {
  return `
    <div class="contract-route-content">
      <span class="muted contract-route-detail"><strong>Departure:</strong> ${escapeHtml(origin.code)} - ${escapeHtml(origin.label)}</span>
      <span class="muted contract-route-detail"><strong>Destination:</strong> ${escapeHtml(destination.code)} - ${escapeHtml(destination.label)}</span>
      ${note ? `<span class="muted contract-route-detail">${escapeHtml(note)}</span>` : ""}
    </div>
  `;
}

export function renderTableDueCell(deadlineUtc: string, currentTimeUtc: string, formatDate: (value: string) => string): string {
  return `
    <div class="contracts-due-cell">
      <strong>${escapeHtml(formatDate(deadlineUtc))}</strong>
      <span class="muted">${escapeHtml(formatDeadlineCountdown(deadlineUtc, currentTimeUtc))}</span>
    </div>
  `;
}

export { renderStaticTableHeaderCell };
