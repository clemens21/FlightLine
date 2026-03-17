/*
 * Renders the base HTML shell that the browser client hydrates after a save is opened.
 * It provides the layout, static chrome, and bootstrapping hooks for the richer client-side shell experience.
 */

import type { SavePageTab } from "./save-shell-model.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderIncrementalSavePage(saveId: string, activeTab: SavePageTab, saveShellClientAssetPath: string): string {
    const configJson = JSON.stringify({ saveId, initialTab: activeTab })
        .replaceAll("&", "\\u0026")
        .replaceAll("<", "\\u003c")
        .replaceAll(">", "\\u003e");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FlightLine</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #efe9de;
      --bg-alt: linear-gradient(160deg, rgba(250,244,234,.95), rgba(233,228,216,.9));
      --panel: rgba(255,255,255,.78);
      --panel-strong: rgba(255,255,255,.92);
      --text: #182126;
      --muted: #61707b;
      --line: rgba(24,33,38,.08);
      --accent: #0d6a77;
      --accent-soft: rgba(13,106,119,.12);
      --danger-soft: rgba(176,58,46,.14);
      --shadow: 0 20px 50px rgba(28,33,40,.12);
    }
    body[data-theme="dark"] {
      color-scheme: dark;
      --bg: #0f1720;
      --bg-alt: radial-gradient(circle at top left, rgba(29,74,96,.32), transparent 34%), linear-gradient(180deg, rgba(15,23,32,.98), rgba(14,20,28,.98));
      --panel: rgba(20,29,40,.84);
      --panel-strong: rgba(17,25,35,.96);
      --text: #edf3f7;
      --muted: #8e9daa;
      --line: rgba(237,243,247,.08);
      --accent: #6fc9d4;
      --accent-soft: rgba(111,201,212,.12);
      --danger-soft: rgba(239,140,131,.14);
      --shadow: 0 24px 60px rgba(0,0,0,.34);
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      overflow: hidden;
      background: var(--bg-alt);
      color: var(--text);
      font: 15px/1.45 Aptos, "Segoe UI Variable Text", "Trebuchet MS", sans-serif;
    }
    [hidden] { display: none !important; }
    .eyebrow { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); }
    .muted { color: var(--muted); }
    .theme-toggle, button, .button-link {
      appearance: none;
      border: 0;
      border-radius: 12px;
      padding: 10px 14px;
      background: var(--text);
      color: #fff;
      cursor: pointer;
      font: inherit;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    body[data-theme="dark"] .theme-toggle,
    body[data-theme="dark"] button,
    body[data-theme="dark"] .button-link {
      color: #091018;
      background: var(--accent);
    }
    .button-secondary { background: transparent; color: var(--text); border: 1px solid var(--line); }
    body[data-theme="dark"] .button-secondary { color: var(--text); background: transparent; }
    .shell-root { height: 100vh; overflow: hidden; padding: 20px 24px; }
    .handoff-screen {
      display: grid;
      place-items: center;
      height: 100%;
    }
    .handoff-card {
      width: min(560px, 100%);
      display: grid;
      gap: 16px;
      padding: 32px;
      border-radius: 24px;
      background: var(--panel-strong);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
    }
    .handoff-card h1 { margin: 0; font-size: 30px; }
    .handoff-card p { margin: 0; color: var(--muted); }
    .loading-error {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid rgba(176,58,46,.24);
      background: var(--danger-soft);
      color: var(--text);
    }
    .loading-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .shell-frame[hidden] { display: none !important; }
    .shell-frame { display: flex; flex-direction: column; gap: 16px; height: 100%; }
    .shell-topbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 16px; flex: 0 0 auto; }
    .shell-topbar-main { display: flex; align-items: center; gap: 14px; min-width: 0; flex-wrap: wrap; }
    .shell-actions { display: flex; align-items: start; justify-content: end; gap: 12px; }
    .shell-copy { min-width: 0; display: grid; gap: 4px; }
    .shell-copy h1 { margin: 0; font-size: 30px; }
    .shell-copy p { margin: 0; color: var(--muted); }
    .shell-cash-card {
      min-width: 180px;
      display: grid;
      gap: 4px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
      box-shadow: var(--shadow);
    }
    .shell-cash-card strong {
      font-size: 20px;
      line-height: 1.1;
    }
    .clock-menu,
    .settings-menu { position: relative; }
    .clock-menu summary,
    .settings-menu summary { list-style: none; }
    .clock-menu summary::-webkit-details-marker,
    .settings-menu summary::-webkit-details-marker { display: none; }
    .clock-trigger,
    body[data-theme="dark"] .clock-trigger {
      appearance: none;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 10px 12px;
      background: var(--panel-strong);
      color: var(--text);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 12px;
      min-height: 48px;
      box-shadow: var(--shadow);
    }
    .clock-trigger-copy {
      display: grid;
      gap: 2px;
      text-align: left;
      min-width: 0;
    }
    .clock-trigger-copy strong {
      font-size: 15px;
      line-height: 1.1;
    }
    .clock-rate-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 42px;
      padding: 7px 10px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .clock-trigger:hover,
    .clock-menu[open] .clock-trigger,
    .settings-trigger:hover,
    .settings-menu[open] .settings-trigger {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent-soft) 55%, var(--panel-strong));
    }
    .clock-popover,
    .settings-popover {
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      display: grid;
      gap: 12px;
      padding: 16px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel-strong) 96%, transparent);
      box-shadow: var(--shadow);
      backdrop-filter: blur(20px);
      z-index: 12;
    }
    .clock-popover {
      width: min(440px, calc(100vw - 40px));
    }
    .settings-trigger,
    body[data-theme="dark"] .settings-trigger {
      appearance: none;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 10px 12px;
      background: var(--panel-strong);
      color: var(--text);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 48px;
      min-height: 48px;
      box-shadow: var(--shadow);
    }
    .settings-gear {
      width: 18px;
      height: 18px;
      display: inline-block;
    }
    .clock-panel {
      display: grid;
      gap: 14px;
    }
    .clock-current {
      display: grid;
      gap: 6px;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel);
    }
    .clock-current-time {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 12px;
    }
    .clock-current-time strong {
      font-size: 28px;
      line-height: 1;
    }
    .clock-current-time .pill {
      font-weight: 700;
    }
    .clock-meta-line {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      color: var(--muted);
      font-size: 13px;
    }
    .clock-rate-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .clock-rate-button,
    body[data-theme="dark"] .clock-rate-button {
      appearance: none;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 8px 12px;
      background: var(--panel);
      color: var(--text);
      font: inherit;
      cursor: pointer;
      box-shadow: none;
    }
    .clock-rate-button.current {
      border-color: transparent;
      background: var(--accent);
      color: #091018;
      font-weight: 700;
    }
    .clock-calendar-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .clock-calendar-grid {
      display: grid;
      gap: 8px;
    }
    .clock-weekdays,
    .clock-days {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 8px;
    }
    .clock-weekday {
      text-align: center;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--muted);
    }
    .clock-day,
    body[data-theme="dark"] .clock-day {
      appearance: none;
      min-height: 68px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel);
      color: var(--text);
      padding: 10px 8px;
      display: grid;
      align-content: space-between;
      gap: 8px;
      cursor: pointer;
      font: inherit;
      box-shadow: none;
    }
    .clock-day.outside {
      opacity: .55;
    }
    .clock-day.today {
      box-shadow: inset 0 0 0 1px var(--accent);
    }
    .clock-day.selected {
      border-color: transparent;
      background: color-mix(in srgb, var(--accent-soft) 66%, var(--panel));
    }
    .clock-day-number {
      font-weight: 700;
      justify-self: end;
    }
    .clock-day-markers {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      justify-content: start;
    }
    .clock-day-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: rgba(127,127,127,.28);
    }
    .clock-day-dot.warning { background: var(--warn); }
    .clock-day-dot.critical { background: var(--danger); }
    .clock-day-popover {
      display: grid;
      gap: 12px;
      padding: 14px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel) 76%, transparent);
    }
    .clock-day-popover-head {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
    }
    .clock-day-warning {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid rgba(239,177,95,.28);
      background: rgba(239,177,95,.12);
      color: var(--text);
    }
    .clock-warning-list {
      display: grid;
      gap: 8px;
      max-height: 220px;
      overflow: auto;
      padding-right: 4px;
    }
    .clock-warning-item {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel);
      display: grid;
      gap: 6px;
    }
    .clock-warning-item.critical { border-color: rgba(176,58,46,.24); }
    .clock-warning-item.warning { border-color: rgba(239,177,95,.24); }
    .clock-day-popover-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .settings-copy {
      display: grid;
      gap: 4px;
    }
    .settings-meta {
      display: grid;
      gap: 8px;
      padding: 12px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel);
    }
    .settings-meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .settings-actions {
      display: grid;
      gap: 8px;
    }
    .settings-action,
    body[data-theme="dark"] .settings-action {
      width: 100%;
      justify-content: flex-start;
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      text-align: left;
      box-shadow: none;
    }
    .settings-action:hover {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent-soft) 55%, var(--panel));
    }
    .tabbar { display: flex; gap: 10px; overflow: auto; padding: 2px 2px 4px; flex: 0 0 auto; }
    .tab-link { display: inline-flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; padding: 10px 14px; border: 1px solid var(--line); border-radius: 999px; color: inherit; text-decoration: none; background: var(--panel); white-space: nowrap; }
    .tab-link.current { border-color: var(--accent); background: var(--accent-soft); }
    .tab-link.current .tab-count { background: rgba(255,255,255,.7); color: var(--accent); }
    body[data-theme="dark"] .tab-link.current .tab-count { background: rgba(9,13,18,.46); }
    .tab-count { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; padding: 2px 8px; border-radius: 999px; background: var(--panel-strong); color: var(--muted); font-size: 12px; }
    .flash-stack { display: grid; gap: 10px; flex: 0 0 auto; }
    .flash { padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); }
    .flash.notice { background: var(--accent-soft); border-color: rgba(13,106,119,.22); }
    .flash.error { background: var(--danger-soft); border-color: rgba(176,58,46,.24); }
    .tab-surface { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
    .tab-panel { height: 100%; overflow: auto; }
    .tab-loading { position: absolute; inset: 18px; display: grid; place-items: center; border-radius: 20px; border: 1px solid var(--line); background: color-mix(in srgb, var(--panel-strong) 88%, transparent); backdrop-filter: blur(14px); z-index: 3; }
    .view-grid {
      min-height: 0;
      height: 100%;
      display: grid;
      gap: 18px;
      overflow: hidden;
    }
    .view-grid.two-up { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .view-grid.sidebar-wide { grid-template-columns: minmax(320px, .78fr) minmax(0, 1.22fr); }
    .view-grid.stack-and-side { grid-template-columns: minmax(0, 1.1fr) minmax(340px, .9fr); }
    .stack-column {
      min-height: 0;
      display: grid;
      gap: 18px;
      overflow: hidden;
      grid-auto-rows: minmax(0, 1fr);
    }
    .panel {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 20px;
      background: var(--panel);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }
    .panel-head {
      padding: 16px 18px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--line);
      flex: 0 0 auto;
    }
    .panel-head h3 { margin: 0; font-size: 17px; }
    .panel-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 16px 18px 18px;
    }
    .actions { display: grid; gap: 14px; }
    .action-group { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
    .action-group.tight { gap: 8px; }
    form.inline { display: inline-flex; gap: 8px; align-items: end; flex-wrap: wrap; }
    label { display: grid; gap: 6px; font-size: 13px; color: var(--muted); min-width: 140px; }
    input, select {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
      color: var(--text);
      padding: 10px 12px;
      font: inherit;
    }
    table { width: 100%; border-collapse: collapse; min-width: 100%; }
    .table-wrap { min-height: 0; overflow: auto; }
    th, td { text-align: left; padding: 12px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--muted);
      background: var(--panel-strong);
    }
    .badge { display: inline-flex; padding: 4px 8px; border-radius: 999px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    .badge.neutral { background: rgba(127,127,127,.12); }
    .badge.accent { background: var(--accent-soft); color: var(--accent); }
    .badge.warn { background: var(--warn-soft); color: var(--warn); }
    .badge.danger { background: var(--danger-soft); color: var(--danger); }
    .route { font-weight: 600; }
    .meta-stack { display: grid; gap: 4px; }
    .summary-list { display: grid; gap: 12px; }
    .summary-item {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
    }
    .summary-item strong { display: block; font-size: 18px; margin-top: 3px; }
    .event-list { display: grid; gap: 10px; }
    .event-item {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
    }
    .empty-state { padding: 18px; border: 1px dashed var(--line); border-radius: 16px; color: var(--muted); }
    .compact { padding: 12px; }
    .pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill {
      display: inline-flex;
      padding: 7px 10px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
      color: var(--muted);
      font-size: 13px;
    }
    .contracts-host {
      display: block;
      min-height: 0;
      height: 100%;
    }
    .contracts-app-shell {
      min-height: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .contracts-toolbar {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 16px;
    }
    .contracts-toolbar strong {
      display: block;
      font-size: 20px;
      margin: 4px 0;
    }
    .contracts-main-head {
      align-items: start;
    }
    .contracts-board-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: end;
    }
    .contracts-board-tab,
    body[data-theme="dark"] .contracts-board-tab {
      appearance: none;
      border: 1px solid rgba(111,201,212,.18) !important;
      background: rgba(18, 40, 55, .88) !important;
      color: #9bb8c9 !important;
      border-radius: 999px;
      padding: 10px 14px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font: inherit;
      cursor: pointer;
    }
    .contracts-board-tab.current,
    .contracts-board-tab[aria-selected="true"],
    body[data-theme="dark"] .contracts-board-tab.current,
    body[data-theme="dark"] .contracts-board-tab[aria-selected="true"] {
      background: var(--accent) !important;
      border-color: transparent !important;
      color: #091018 !important;
    }
    .contracts-board-tab[aria-selected="false"],
    body[data-theme="dark"] .contracts-board-tab[aria-selected="false"] {
      background: rgba(18, 40, 55, .88) !important;
      border-color: rgba(111,201,212,.18) !important;
      color: #9bb8c9 !important;
    }
    .contracts-board-tab-count {
      display: inline-flex;
      min-width: 28px;
      justify-content: center;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(127,127,127,.14);
      color: inherit;
      font-size: 11px;
    }
    .contracts-board-tab[aria-selected="true"] .contracts-board-tab-count {
      background: rgba(9,16,24,.14);
      color: inherit;
    }
    .contracts-grid {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(460px, 1fr);
      gap: 18px;
      overflow: hidden;
    }
     .contracts-side-column {
      min-height: 0;
      min-width: 0;
      display: grid;
      gap: 18px;
      grid-template-rows: minmax(0, .62fr) minmax(0, .38fr);
      overflow: hidden;
      align-content: stretch;
    }
    .contracts-main-body {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 14px;
      overflow: hidden;
    }
    .contracts-filters {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      flex: 0 0 auto;
    }
    .contracts-filter-placeholder {
      min-height: 78px;
      display: grid;
      align-content: end;
      gap: 4px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--panel-strong);
    }
    .filter-shortcut {
      min-height: 78px;
      display: grid;
      align-content: end;
      gap: 8px;
      padding: 10px 12px;
      border: 1px dashed var(--line);
      border-radius: 12px;
      background: color-mix(in srgb, var(--panel-strong) 88%, transparent);
    }
    .filter-shortcut .button-secondary {
      justify-self: start;
    }
    .contracts-board-wrap {
      min-height: 0;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--panel-strong);
    }
    .contracts-board-table { min-width: 100%; }
    th.sortable { white-space: nowrap; }
    .table-sort,
    body[data-theme="dark"] .table-sort {
      appearance: none;
      border: 0;
      padding: 0;
      margin: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .table-sort.current {
      color: var(--accent);
    }
    .table-sort-direction {
      font-size: 10px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .contract-row { cursor: pointer; }
     .contract-row.selected td { background: color-mix(in srgb, var(--accent-soft) 55%, transparent); }
    .contract-row.matches-endpoint td:first-child {
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .contract-route-button,
    body[data-theme="dark"] .contract-route-button {
      appearance: none;
      border: 0;
      border-radius: 0;
      padding: 0;
      margin: 0;
      width: 100%;
      display: block;
      text-align: left;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      box-shadow: none;
    }
    .contract-route-content {
      display: grid;
      gap: 4px;
      justify-items: start;
    }
    .contract-route-detail {
      display: block;
      line-height: 1.3;
    }
    .contract-route-detail strong {
      color: var(--text);
      font-weight: 600;
    }
    .range-field {
      display: grid;
      gap: 6px;
      font-size: 13px;
      color: var(--muted);
      min-width: 0;
    }
     .checkbox-field {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 46px;
    }
    .checkbox-field input {
      width: 18px;
      height: 18px;
      margin: 0;
    }
    .range-inputs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
     .contracts-map-panel {
      position: sticky;
      top: 0;
      z-index: 1;
      height: 100%;
    }
    .contracts-map-body {
      padding: 14px;
      background: linear-gradient(180deg, rgba(13,106,119,.08), transparent 45%);
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 10px;
      overflow: hidden;
    }
     .contracts-planner-panel {
      min-height: 0;
      overflow: hidden;
    }
    .contracts-planner-body {
      min-height: 0;
      overflow: auto;
    }
    .planner-list {
      display: grid;
      gap: 10px;
    }
    .planner-item {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px;
      background: var(--panel-strong);
      display: grid;
      gap: 10px;
    }
    .planner-item-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .planner-sequence {
      display: inline-flex;
      width: 28px;
      height: 28px;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--text);
      font-weight: 700;
    }
    .planner-item-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .contracts-map {
      width: 100%;
      height: 100%;
      min-height: 420px;
      display: block;
      border-radius: 18px;
      touch-action: none;
      overflow: hidden;
    }
    .map-attribution {
      font-size: 11px;
      color: var(--muted);
      text-align: right;
    }
    .map-bg { fill: rgba(8, 18, 28, .08); stroke: var(--line); }
    body[data-theme="dark"] .map-bg { fill: rgba(6, 12, 18, .92); }
    .map-scrim { fill: rgba(7, 14, 22, .14); }
    body[data-theme="dark"] .map-scrim { fill: rgba(5, 10, 16, .08); }
    .map-tiles image { image-rendering: auto; }
    .map-grid line { stroke: rgba(127,127,127,.18); stroke-width: 1; }
    .map-route { fill: none; stroke-linecap: round; }
     .map-route.accepted { stroke: rgba(255,255,255,.34); stroke-width: 3; stroke-dasharray: 10 8; }
    .map-route.planned { stroke: rgba(111,201,212,.42); stroke-width: 2.5; stroke-dasharray: 6 6; }
    .map-route.selected { stroke: var(--accent); stroke-width: 6; }
    .map-point.origin { fill: var(--accent); }
    .map-point.destination { fill: var(--warn); }
     .map-point.accepted { fill: rgba(255,255,255,.3); }
    .map-point.planned { fill: rgba(111,201,212,.55); }
    .map-range-ring { fill: none; stroke-width: 2; opacity: .85; }
    .map-range-ring.origin { stroke: rgba(111,201,212,.4); }
    .map-range-ring.destination { stroke: rgba(239,177,95,.4); }
    .map-label { fill: var(--text); font-size: 20px; font-weight: 600; paint-order: stroke; stroke: rgba(9, 15, 21, .55); stroke-width: 6px; stroke-linejoin: round; }
    .contracts-accepted-body { overflow: auto; }
    .aircraft-tab-grid {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(320px, .65fr);
      gap: 18px;
      overflow: hidden;
    }
    .aircraft-tab-main {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 18px;
      overflow: hidden;
    }
    .aircraft-side-column {
      min-height: 0;
      display: grid;
      gap: 18px;
      align-content: start;
    }
    .aircraft-summary-grid {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }
    .aircraft-workspace-body {
      min-height: 0;
      overflow: hidden;
    }
    .aircraft-workbench {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(340px, .92fr);
      gap: 18px;
      overflow: hidden;
    }
    .aircraft-fleet-panel,
    .aircraft-detail-panel {
      min-height: 0;
    }
    .aircraft-fleet-body {
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 14px;
      overflow: hidden;
    }
    .aircraft-table-wrap {
      min-height: 0;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--panel-strong);
    }
    .aircraft-toolbar {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .market-toolbar {
      grid-template-columns: minmax(0, 1.1fr) minmax(180px, .55fr) minmax(0, 1.35fr);
    }
    .aircraft-location-range .range-inputs {
      grid-template-columns: minmax(0, 1fr) 120px;
    }
    .aircraft-row { cursor: pointer; }
    .aircraft-row.selected td {
      background: color-mix(in srgb, var(--accent-soft) 55%, transparent);
    }
    .aircraft-row.selected td:first-child {
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .aircraft-row-button,
    body[data-theme="dark"] .aircraft-row-button {
      appearance: none;
      border: 0;
      border-radius: 0;
      padding: 0;
      margin: 0;
      width: 100%;
      display: block;
      text-align: left;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      box-shadow: none;
    }
    .aircraft-detail-body {
      min-height: 0;
      overflow: auto;
    }
    .aircraft-detail-stack {
      display: grid;
      gap: 14px;
    }
    .aircraft-detail-hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 172px;
      align-items: start;
      gap: 16px;
    }
    .aircraft-hero-image {
      margin: 0;
      width: 172px;
      justify-self: end;
      border-radius: 16px;
      border: 1px solid var(--line);
      overflow: hidden;
      background: var(--panel-strong);
      box-shadow: var(--shadow);
    }
    .aircraft-hero-image img {
      display: block;
      width: 100%;
      height: 108px;
      object-fit: cover;
      background: color-mix(in srgb, var(--panel-strong) 88%, #0d1822);
    }
    .aircraft-facts-card {
      display: grid;
      gap: 8px;
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
    }
    .aircraft-facts-list {
      display: grid;
    }
    .aircraft-fact-row {
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr);
      gap: 12px;
      padding: 10px 0;
      border-top: 1px solid var(--line);
    }
    .aircraft-fact-row:first-child {
      border-top: 0;
      padding-top: 0;
    }
    .aircraft-fact-row:last-child {
      padding-bottom: 0;
    }
    .aircraft-fact-copy {
      min-width: 0;
      display: grid;
      gap: 4px;
    }
    .aircraft-fact-copy strong {
      display: block;
      font-size: 14px;
      line-height: 1.35;
      margin: 0;
    }
    .aircraft-fact-copy .muted {
      font-size: 13px;
      line-height: 1.4;
    }
    .aircraft-fact-list {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 4px;
      color: var(--muted);
    }
    .market-deals {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-items: start;
    }
    .market-deal-card {
      display: grid;
      gap: 6px;
      align-content: start;
    }
    .market-deal-card button {
      width: 100%;
      justify-content: center;
    }
    .market-deal-card strong {
      font-size: 16px;
      margin: 0;
    }
    .market-deal-card .actions {
      margin-top: 4px;
    }
    .market-review-card {
      gap: 14px;
    }
    .market-review-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
    }
    .market-option-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .market-option-button,
    body[data-theme="dark"] .market-option-button {
      appearance: none;
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 10px 12px;
      background: var(--panel-strong);
      color: var(--text);
      display: grid;
      gap: 3px;
      text-align: left;
      box-shadow: none;
    }
    .market-option-button.current,
    body[data-theme="dark"] .market-option-button.current {
      border-color: rgba(111,201,212,.45);
      background: color-mix(in srgb, var(--accent-soft) 55%, var(--panel-strong));
      color: var(--text);
    }
    .market-option-title {
      font-weight: 700;
      font-size: 14px;
    }
    .market-option-copy {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.3;
    }
    .market-review-summary {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .market-confirm-form {
      display: grid;
      gap: 10px;
      justify-items: start;
    }
    .market-confirm-form button {
      width: 100%;
      justify-content: center;
    }
    .aircraft-why-list {
      margin: 8px 0 0;
      padding-left: 18px;
      display: grid;
      gap: 8px;
      color: var(--text);
    }
    .aircraft-empty-note {
      margin-top: 12px;
    }
    @media (max-width: 1240px) {
      body { overflow: auto; }
      .shell-root { height: auto; min-height: 100vh; padding: 18px; }
      .shell-frame { height: auto; }
      .shell-topbar { grid-template-columns: 1fr; }
      .tab-surface { min-height: 60vh; }
      .aircraft-tab-grid,
      .aircraft-workbench,
      .aircraft-summary-grid,
      .aircraft-toolbar,
      .market-deals,
      .market-review-summary,
      .contracts-grid,
      .contracts-side-column {
        grid-template-columns: 1fr;
        height: auto;
      }
      .market-option-list {
        grid-template-columns: 1fr;
      }
      .aircraft-tab-main,
      .aircraft-side-column {
        height: auto;
      }
      .aircraft-fact-row {
        grid-template-columns: 1fr;
        gap: 6px;
      }
      .aircraft-detail-hero {
        grid-template-columns: 1fr;
      }
      .aircraft-hero-image {
        justify-self: start;
      }
    }
  </style>
</head>
<body>
  <main class="shell-root" data-save-shell-app data-screen="handoff">
    <section class="handoff-screen" data-shell-loader>
      <div class="handoff-card">
        <div class="eyebrow">Save Handoff</div>
        <h1 data-loader-title>Opening ${escapeHtml(saveId)}</h1>
        <p>Finalizing the save handoff before the operations shell appears.</p>
        <p class="loading-error" data-loader-error hidden></p>
        <div class="loading-actions" data-loader-actions hidden>
          <button type="button" data-loader-retry>Retry</button>
          <a class="button-link button-secondary" href="/">Back to saves</a>
        </div>
      </div>
    </section>
    <section class="shell-frame" data-shell-frame hidden>
      <header class="shell-topbar">
        <div class="shell-topbar-main">
          <div class="shell-copy">
            <div class="eyebrow">Save Slot</div>
            <h1 data-shell-title>Opening save...</h1>
            <p data-shell-subtitle>Preparing the operations shell.</p>
          </div>
          <aside class="shell-cash-card" data-shell-cash-card hidden></aside>
        </div>
        <div class="shell-actions">
          <details class="clock-menu" data-clock-menu>
            <summary class="clock-trigger" aria-label="Open clock and calendar">
              <div class="clock-trigger-copy">
                <span class="eyebrow">Clock</span>
                <strong data-clock-label>Loading...</strong>
              </div>
              <span class="clock-rate-badge" data-clock-rate>1x</span>
            </summary>
            <div class="clock-popover">
              <div class="clock-panel" data-clock-panel>
                <div class="empty-state compact">Loading clock...</div>
              </div>
            </div>
          </details>
          <details class="settings-menu" data-settings-menu>
            <summary class="settings-trigger" aria-label="Open settings menu">
              <svg class="settings-gear" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3.25"></circle>
                <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1 0 2.8l-.6.6a2 2 0 0 1-2.8 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V21a2 2 0 0 1-2 2h-.9a2 2 0 0 1-2-2v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8 0l-.6-.6a2 2 0 0 1 0-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H3a2 2 0 0 1-2-2v-.9a2 2 0 0 1 2-2h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 0-2.8l.6-.6a2 2 0 0 1 2.8 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V3a2 2 0 0 1 2-2h.9a2 2 0 0 1 2 2v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a2 2 0 0 1 2 2v.9a2 2 0 0 1-2 2h-.2a1 1 0 0 0-.9.6z"></path>
              </svg>
            </summary>
            <div class="settings-popover">
              <div class="settings-copy">
                <div class="eyebrow">Settings</div>
                <strong>Shell controls</strong>
              </div>
              <div class="settings-meta">
                <div class="settings-meta-row"><span class="muted">Save slot</span><strong>${escapeHtml(saveId)}</strong></div>
                <div class="settings-meta-row"><span class="muted">Theme</span><strong data-settings-theme-label>Loading...</strong></div>
              </div>
              <div class="settings-actions">
                <button class="settings-action" type="button" data-settings-theme>Toggle theme</button>
                <a class="button-link settings-action" href="/">Back to saved games</a>
              </div>
            </div>
          </details>
        </div>      </header>
      <nav class="tabbar" data-shell-tabs></nav>
      <section class="flash-stack" data-shell-flash></section>
      <section class="tab-surface">
        <div class="tab-loading" data-shell-tab-loading hidden>Loading tab...</div>
        <div class="tab-panel" data-shell-tab-panel></div>
      </section>
    </section>
    <script type="application/json" data-shell-config>${configJson}</script>
  </main>
  <script>
    (() => {
      const key = 'flightline-theme';
      const root = document.body;
      const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const initial = localStorage.getItem(key) || preferred;
      root.dataset.theme = initial;
      window.toggleTheme = () => {
        const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
        root.dataset.theme = next;
        localStorage.setItem(key, next);
      };
    })();
  </script>
  <script type="module" src="${saveShellClientAssetPath}"></script>
</body>
</html>`;
}
