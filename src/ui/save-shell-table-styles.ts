export function renderSharedTableHeaderStyles(): string {
  return `
    .table-header-column {
      position: relative;
      overflow: visible;
      vertical-align: top;
      text-transform: none;
      letter-spacing: 0.01em;
    }
    .table-header-control {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      justify-content: stretch;
      gap: 10px;
      min-width: 0;
      min-height: 30px;
      padding: 2px 0;
      position: relative;
      isolation: isolate;
      text-transform: none;
      letter-spacing: 0.01em;
    }
    .table-header-label {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      font-size: 13px;
      line-height: 1.1;
      font-weight: 700;
      letter-spacing: 0.01em;
      text-transform: none;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
      justify-content: flex-start;
      text-align: left;
    }
    .table-sort > .table-header-label {
      color: inherit;
      font: inherit;
      font-weight: inherit;
      line-height: inherit;
      letter-spacing: inherit;
      text-transform: inherit;
      min-width: 0;
      width: auto;
      justify-content: flex-start;
      text-align: left;
    }
    .table-header-control .table-sort {
      appearance: none;
      border: 0;
      border-radius: 0;
      margin: 0;
      background: transparent;
      color: inherit;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0;
      font: inherit;
      min-width: 0;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: 0.01em;
      text-transform: none;
      white-space: nowrap;
      box-shadow: none;
      justify-content: flex-start;
      text-align: left;
      color: var(--text);
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1 1 auto;
    }
    .table-header-control .table-sort:hover,
    .table-header-control .table-sort:focus-visible {
      color: color-mix(in srgb, var(--accent) 72%, var(--text));
      outline: none;
    }
    .table-header-actions {
      display: inline-flex;
      gap: 4px;
      flex: 0 0 auto;
      position: relative;
      z-index: 2;
    }
    .table-header-icon-button,
    body[data-theme="dark"] .table-header-icon-button,
    body[data-theme="forest"] .table-header-icon-button {
      appearance: none;
      border: 0;
      background: var(--accent-soft);
      color: var(--accent);
      border-radius: 999px;
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
      z-index: 2;
      flex: 0 0 auto;
    }
    .table-header-icon-button:hover,
    .table-header-icon-button:focus-visible {
      background: color-mix(in srgb, var(--accent-soft) 58%, var(--panel-strong));
      outline: none;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent);
    }
    .table-header-icon-button svg {
      width: 12px;
      height: 12px;
      fill: currentColor;
      pointer-events: none;
    }
    .table-header-icon-button svg * {
      pointer-events: none;
    }
    .table-header-column[aria-sort="ascending"] .table-sort,
    .table-header-column[aria-sort="descending"] .table-sort {
      color: var(--accent);
    }
    .table-header-column[aria-sort="ascending"] .table-sort::after,
    .table-header-column[aria-sort="descending"] .table-sort::after {
      font-size: 11px;
      line-height: 1;
      opacity: 0.9;
    }
    .table-header-column[aria-sort="ascending"] .table-sort::after {
      content: "\\2191";
    }
    .table-header-column[aria-sort="descending"] .table-sort::after {
      content: "\\2193";
    }
    .table-header-column.is-sorted::after {
      content: "";
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: 0;
      height: 2px;
      border-radius: 999px;
      background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--accent) 72%, #fff) 18%, color-mix(in srgb, var(--accent) 72%, #fff) 82%, transparent 100%);
      pointer-events: none;
    }
    .table-header-popover {
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      z-index: 6;
      width: min(320px, calc(100vw - 48px));
      max-width: calc(100vw - 24px);
      padding: 12px;
      display: grid;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel-strong);
      box-shadow: var(--shadow);
      transform: translateX(var(--table-header-popover-nudge, 0px));
    }
    .table-header-popover[data-table-header-popover-side="end"] {
      left: auto;
      right: 0;
    }
    .table-header-popover-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .table-header-popover-body {
      display: grid;
      gap: 10px;
    }
    .table-header-popover-field {
      display: grid;
      gap: 6px;
    }
    .table-header-popover-field input,
    .table-header-popover-field select {
      width: 100%;
    }
    .table-header-range-field {
      display: grid;
      gap: 6px;
    }
    .table-header-range-inputs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .table-header-shortcut {
      display: grid;
      gap: 8px;
      padding: 10px 12px;
      border: 1px dashed var(--line);
      border-radius: 12px;
      background: color-mix(in srgb, var(--panel-strong) 88%, transparent);
    }
    .table-header-shortcut .button-secondary {
      justify-self: start;
    }
  `;
}

export function renderContractsAircraftSharedTableStyles(): string {
  return `
    .aircraft-market-table th::before,
    .aircraft-market-table td::before,
    .contracts-board-table th::before,
    .contracts-board-table td::before {
      content: "";
      position: absolute;
      left: 0;
      width: 1px;
      pointer-events: none;
    }
    .aircraft-market-table th:not(:first-child)::before,
    .contracts-board-table th:not(:first-child)::before {
      top: 10px;
      bottom: 8px;
      background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--accent) 34%, var(--line)) 18%, color-mix(in srgb, var(--accent) 34%, var(--line)) 82%, transparent 100%);
      opacity: 0.85;
    }
    .aircraft-market-table td:not(:first-child)::before,
    .contracts-board-table td:not(:first-child)::before {
      top: 9px;
      bottom: 9px;
      background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--text) 14%, var(--line)) 22%, color-mix(in srgb, var(--text) 14%, var(--line)) 78%, transparent 100%);
      opacity: 0.45;
    }
    .aircraft-market-table th,
    .aircraft-market-table td,
    .contracts-board-table th,
    .contracts-board-table td {
      position: relative;
    }
    .aircraft-market-table th,
    .contracts-board-table th {
      z-index: 5;
    }
    .aircraft-market-table .table-header-label,
    .contracts-board-table .table-header-label {
      color: var(--text);
    }
    .aircraft-market-table .table-sort > .table-header-label,
    .contracts-board-table .table-sort > .table-header-label {
      color: inherit;
    }
    .aircraft-market-table .table-header-column[aria-sort="none"] .table-sort,
    .contracts-board-table .table-header-column[aria-sort="none"] .table-sort {
      color: var(--text);
    }
    .aircraft-market-table .table-header-column[aria-sort="ascending"] .table-sort,
    .aircraft-market-table .table-header-column[aria-sort="descending"] .table-sort,
    .contracts-board-table .table-header-column[aria-sort="ascending"] .table-sort,
    .contracts-board-table .table-header-column[aria-sort="descending"] .table-sort {
      color: var(--accent);
    }
    .aircraft-market-table .table-header-column[aria-sort="ascending"] .table-sort > .table-header-label,
    .aircraft-market-table .table-header-column[aria-sort="descending"] .table-sort > .table-header-label,
    .contracts-board-table .table-header-column[aria-sort="ascending"] .table-sort > .table-header-label,
    .contracts-board-table .table-header-column[aria-sort="descending"] .table-sort > .table-header-label {
      color: inherit;
    }
    .aircraft-market-table .table-header-column[aria-sort="ascending"] .table-sort::after,
    .aircraft-market-table .table-header-column[aria-sort="descending"] .table-sort::after,
    .contracts-board-table .table-header-column[aria-sort="ascending"] .table-sort::after,
    .contracts-board-table .table-header-column[aria-sort="descending"] .table-sort::after {
      font-size: 11px;
      line-height: 1;
      opacity: 0.9;
    }
    .aircraft-market-table .table-header-column[aria-sort="ascending"] .table-sort::after,
    .contracts-board-table .table-header-column[aria-sort="ascending"] .table-sort::after {
      content: "\\2191";
    }
    .aircraft-market-table .table-header-column[aria-sort="descending"] .table-sort::after,
    .contracts-board-table .table-header-column[aria-sort="descending"] .table-sort::after {
      content: "\\2193";
    }
    .aircraft-market-table .table-header-control .table-sort,
    .aircraft-market-table .table-header-label,
    .contracts-board-table .table-header-control .table-sort,
    .contracts-board-table .table-header-label {
      font-size: 13px;
      line-height: 1.1;
      font-weight: 700;
      letter-spacing: 0.01em;
      text-transform: none;
      color: var(--text);
    }
  `;
}
