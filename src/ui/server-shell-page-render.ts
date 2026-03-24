// @ts-nocheck

let contractsTabClientAssetPath;
let escapeHtml;
let formatMoney;
let formatDate;
let formatNumber;
let formatPercent;
let formatAirportSize;
let hoursUntil;
let renderAirportDisplay;
let renderRouteDisplay;
let formatPayload;
let renderBadge;
let launcherRoute;
let openSaveRoute;
let saveRoute;
let saveTabs;
let starterAircraftOptions;
let staffingPresets;

export function createServerShellPageRenderers(deps) {
    ({
        contractsTabClientAssetPath,
        escapeHtml,
        formatMoney,
        formatDate,
        formatNumber,
        formatPercent,
        formatAirportSize,
        hoursUntil,
        renderAirportDisplay,
        renderRouteDisplay,
        formatPayload,
        renderBadge,
        launcherRoute,
        openSaveRoute,
        saveRoute,
        saveTabs,
        starterAircraftOptions,
        staffingPresets,
    } = deps);

    return {
        renderLauncherPage,
        renderSavePage,
        renderShell,
        serializeJsonForScript,
    };
}

function renderContextRail(cards) {
    return `<section class="context-rail">${cards.map((card) => `<div class="context-card ${card.tone ?? "neutral"}"><div class="eyebrow">${escapeHtml(card.label)}</div><strong>${escapeHtml(card.value)}</strong><span class="muted">${escapeHtml(card.detail)}</span></div>`).join("")}</section>`;
}

function renderTabInput(tab) {
    return `<input type="hidden" name="tab" value="${escapeHtml(tab)}" />`;
}

function renderPanel(title, body, options = {}) {
    const className = options.className ? ` ${options.className}` : "";
    return `<section class="panel${className}"><div class="panel-head"><h3>${escapeHtml(title)}</h3>${options.actionHtml ?? ""}</div><div class="panel-body">${body}</div></section>`;
}
function renderMetricStrip(model) {
    const company = model.companyContext;
    const fleet = model.fleetState?.aircraft ?? [];
    const offers = model.contractBoard?.offers ?? [];
    const dispatchAvailableCount = model.fleetState?.dispatchAvailableCount ?? 0;
    const staffingMonthlyCost = model.staffingState?.totalMonthlyFixedCostAmount ?? 0;
    if (!company) {
        return "";
    }
    return `<section class="metrics-strip">
    <div class="metric-card"><div class="eyebrow">Cash Position</div><strong>${formatMoney(company.currentCashAmount)}</strong><span class="muted">${escapeHtml(company.financialPressureBand.replaceAll("_", " "))}</span></div>
    <div class="metric-card"><div class="eyebrow">Clock</div><strong>${escapeHtml(formatDate(company.currentTimeUtc))}</strong><span class="muted">Home ${escapeHtml(company.homeBaseAirportId)}</span></div>
    <div class="metric-card"><div class="eyebrow">Growth Stage</div><strong>${escapeHtml(company.companyPhase.replaceAll("_", " "))}</strong><span class="muted">Tier ${company.progressionTier} | Rep ${company.reputationScore}</span></div>
    <div class="metric-card"><div class="eyebrow">Fleet Readiness</div><strong>${dispatchAvailableCount}/${fleet.length || 0}</strong><span class="muted">dispatchable aircraft</span></div>
    <div class="metric-card"><div class="eyebrow">Commercial Load</div><strong>${company.activeContractCount}</strong><span class="muted">${offers.filter((offer) => offer.offerStatus === "available").length} offers live | ${formatMoney(staffingMonthlyCost)}/mo labor</span></div>
  </section>`;
}
function renderSaveTabs(saveId, activeTab, tabMeta = {}) {
    return `<nav class="tabbar">${saveTabs.map((tab) => `<a class="tab-link ${tab.id === activeTab ? "current" : ""}" href="${saveRoute(saveId, { tab: tab.id })}"><span>${escapeHtml(tab.label)}</span>${tabMeta[tab.id] ? `<span class="tab-count">${escapeHtml(tabMeta[tab.id] ?? "")}</span>` : ""}</a>`).join("")}</nav>`;
}
function renderShell(title, saveIds, currentSaveId, flash, body, options = {}) {
    void saveIds;
    void options;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
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
      --warn: #b36c18;
      --warn-soft: rgba(179,108,24,.14);
      --danger: #b03a2e;
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
      --warn: #efb15f;
      --warn-soft: rgba(239,177,95,.12);
      --danger: #ef8c83;
      --danger-soft: rgba(239,140,131,.14);
      --shadow: 0 24px 60px rgba(0,0,0,.34);
    }
    body[data-theme="forest"] {
      color-scheme: dark;
      --bg: #0d1512;
      --bg-alt: radial-gradient(circle at top left, rgba(41,95,74,.28), transparent 34%), linear-gradient(180deg, rgba(13,21,18,.98), rgba(10,17,14,.98));
      --panel: rgba(18,31,26,.9);
      --panel-strong: rgba(15,25,22,.98);
      --text: #eef6f1;
      --muted: #96aaa0;
      --line: rgba(238,246,241,.08);
      --accent: #78d3a7;
      --accent-soft: rgba(120,211,167,.12);
      --danger: #ef8c83;
      --danger-soft: rgba(239,140,131,.14);
      --shadow: 0 24px 60px rgba(0,0,0,.34);
    }
    body[data-theme="forest"] {
      color-scheme: dark;
      --bg: #0d1512;
      --bg-alt: radial-gradient(circle at top left, rgba(41,95,74,.28), transparent 34%), linear-gradient(180deg, rgba(13,21,18,.98), rgba(10,17,14,.98));
      --panel: rgba(18,31,26,.84);
      --panel-strong: rgba(15,25,22,.96);
      --text: #eef6f1;
      --muted: #96aaa0;
      --line: rgba(238,246,241,.08);
      --accent: #78d3a7;
      --accent-soft: rgba(120,211,167,.12);
      --warn: #efb15f;
      --warn-soft: rgba(239,177,95,.12);
      --danger: #ef8c83;
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
    .app {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    .main {
      min-width: 0;
      min-height: 0;
      width: 100%;
      overflow: hidden;
      padding: 20px 24px 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .topbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 16px;
      flex: 0 0 auto;
    }
    .topbar-meta {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .topbar-copy {
      min-width: 0;
      display: grid;
      gap: 4px;
    }
    .topbar h2 { margin: 0; font-size: 28px; }
    .topbar p { margin: 0; color: var(--muted); }
    .eyebrow { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); }
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
    }
    body[data-theme="dark"] .theme-toggle,
    body[data-theme="dark"] button,
    body[data-theme="dark"] .button-link {
      color: #091018;
      background: var(--accent);
    }
    .button-secondary { background: transparent; color: var(--text); border: 1px solid var(--line); }
    body[data-theme="dark"] .button-secondary { color: var(--text); background: transparent; }
    .flash { padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); flex: 0 0 auto; }
    .flash.notice { background: var(--accent-soft); border-color: rgba(13,106,119,.22); }
    .flash.error { background: var(--danger-soft); border-color: rgba(176,58,46,.24); }
    .tabbar {
      display: flex;
      gap: 10px;
      overflow: auto;
      padding: 2px 2px 4px;
      flex: 0 0 auto;
    }
    .tab-link {
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
      padding: 10px 14px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: inherit;
      text-decoration: none;
      background: var(--panel);
      white-space: nowrap;
    }
    .tab-link.current { border-color: var(--accent); background: var(--accent-soft); }
    .tab-link.current .tab-count { background: rgba(255,255,255,.7); color: var(--accent); }
    body[data-theme="dark"] .tab-link.current .tab-count { background: rgba(9,13,18,.46); }
    .tab-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 26px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--panel-strong);
      color: var(--muted);
      font-size: 12px;
    }
    .content-shell {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .metrics-strip {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 14px;
      flex: 0 0 auto;
    }
    .metric-card {
      display: grid;
      gap: 6px;
      padding: 16px;
      border-radius: 18px;
      background: var(--panel-strong);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
    }
    .metric-card strong { font-size: 22px; }
    .context-rail {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      flex: 0 0 auto;
    }
    .context-card {
      display: grid;
      gap: 6px;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
    }
    .context-card strong { font-size: 18px; }
    .context-card.accent { border-color: rgba(13,106,119,.24); background: color-mix(in srgb, var(--accent-soft) 65%, var(--panel-strong)); }
    .context-card.warn { border-color: rgba(179,108,24,.24); background: color-mix(in srgb, var(--warn-soft) 60%, var(--panel-strong)); }
    .context-card.danger { border-color: rgba(176,58,46,.24); background: color-mix(in srgb, var(--danger-soft) 60%, var(--panel-strong)); }
    .view-grid {
      min-height: 0;
      height: 100%;
      display: grid;
      gap: 18px;
      overflow: hidden;
    }
    .view-grid.two-up { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .view-grid.staffing-three-up { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.1fr) minmax(300px, .85fr); }
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
    .meta-stack { display: grid; gap: 4px; min-width: 0; }
    .aircraft-table-wrap {
      min-height: 0;
      overflow: auto;
    }
    .staff-identity {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 4px;
      align-items: center;
      min-width: 0;
    }
    .staff-identity-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 6px;
      align-items: center;
      min-width: 0;
    }
    .staffing-detail-headline {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      min-width: 0;
    }
    .staffing-detail-headline h3 {
      min-width: 0;
      margin: 0;
    }
    .staff-portrait-frame {
      display: inline-flex;
      width: 24px;
      height: 24px;
      min-width: 24px;
      min-height: 24px;
      border-radius: 999px;
      overflow: hidden;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, color-mix(in srgb, var(--panel-strong) 86%, white), var(--panel));
      box-shadow: inset 0 1px 0 rgba(255,255,255,.28);
      flex: 0 0 auto;
      line-height: 0;
      vertical-align: middle;
    }
    .staff-portrait-frame.detail {
      width: 64px;
      height: 64px;
      min-width: 64px;
      min-height: 64px;
      border-radius: 999px;
    }
    .staff-portrait-frame.detail[data-staff-portrait-frame='hire-detail'] {
      width: 80px;
      height: 80px;
      min-width: 80px;
      min-height: 80px;
    }
    .staff-portrait-image {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
      flex: 0 0 auto;
    }
    .ghost-button {
      border: 1px solid var(--line);
      background: var(--panel-strong);
      color: var(--muted);
      padding: 8px 12px;
      border-radius: 999px;
      font: inherit;
      cursor: pointer;
    }
    .staffing-hire-workspace {
      min-height: 0;
      height: 100%;
    }
    .staffing-hire-stage {
      position: relative;
      min-height: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .staffing-hire-table-panel {
      min-height: 0;
      flex: 1 1 auto;
    }
    .staffing-hire-table-body {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 0;
      overflow: hidden;
    }
    .staffing-hire-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: end;
    }
    .staffing-hire-toolbar-primary {
      display: grid;
      grid-template-columns: minmax(240px, 1.5fr) minmax(180px, 1fr) minmax(180px, 1fr);
      gap: 10px;
      min-width: 0;
    }
    .staffing-hire-toolbar-actions {
      display: flex;
      gap: 8px;
      justify-self: end;
      align-items: center;
      flex-wrap: wrap;
    }
    .staffing-hire-more {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) minmax(160px, 220px) minmax(0, 1.4fr);
      gap: 10px;
      align-items: end;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel-strong);
    }
    .staffing-hire-control {
      min-width: 0;
      display: grid;
      gap: 6px;
    }
    .staffing-hire-control input,
    .staffing-hire-control select {
      width: 100%;
    }
    .staffing-hire-market-note {
      display: grid;
      gap: 4px;
      min-width: 0;
      align-content: start;
    }
    .staffing-hire-market-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
    }
    .staffing-hire-market-list table {
      min-width: 1520px;
    }
    .staffing-hire-market-list th,
    .staffing-hire-market-list td {
      padding: 8px 7px;
      font-size: 13px;
    }
    .staffing-hire-market-list td {
      vertical-align: middle;
    }
    .staffing-hire-market-list th {
      font-size: 12px;
    }
    .staffing-hire-market-list .staff-identity {
      gap: 8px;
    }
    .staffing-hire-market-list .staff-identity > strong {
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .staffing-hire-market-list td:nth-child(2),
    .staffing-hire-market-list td:nth-child(3),
    .staffing-hire-market-list td:nth-child(4),
    .staffing-hire-market-list td:nth-child(5),
    .staffing-hire-market-list td:nth-child(6) {
      white-space: nowrap;
    }
    .staffing-hire-market-list td:nth-child(7),
    .staffing-hire-market-list td:nth-child(8),
    .staffing-hire-market-list td:nth-child(9),
    .staffing-hire-market-list td:nth-child(10) {
      white-space: nowrap;
    }
    .staffing-hire-row-pills {
      margin-top: 4px;
    }
    .staffing-certifications-cell {
      font-size: 12px;
    }
    .staffing-fact-value {
      min-width: 0;
    }
    .pilot-stat-rating {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      white-space: nowrap;
    }
    .pilot-stat-rating.compact {
      gap: 6px;
      font-size: 12px;
    }
    .pilot-stat-stars {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      line-height: 1;
      font-size: 14px;
    }
    .pilot-stat-rating.compact .pilot-stat-stars {
      font-size: 12px;
    }
    .pilot-stat-star {
      display: inline-block;
      width: 1em;
      height: 1em;
      flex: 0 0 auto;
      background: linear-gradient(90deg, #d4a73b 0%, #d4a73b var(--pilot-stat-fill, 0%), rgba(212, 167, 59, 0.24) var(--pilot-stat-fill, 0%), rgba(212, 167, 59, 0.24) 100%);
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M12 2l2.97 6.63 7.03.61-5.3 4.73 1.56 7.03L12 17.27 5.74 21l1.56-7.03L2 9.24l7.03-.61z'/%3E%3C/svg%3E");
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M12 2l2.97 6.63 7.03.61-5.3 4.73 1.56 7.03L12 17.27 5.74 21l1.56-7.03L2 9.24l7.03-.61z'/%3E%3C/svg%3E");
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-position: center;
      mask-position: center;
      -webkit-mask-size: contain;
      mask-size: contain;
    }
    .pilot-stat-score {
      color: var(--muted);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .pilot-stat-rating.compact .pilot-stat-score {
      font-size: 11px;
    }
    .staffing-hire-overlay-card .staffing-detail-headline h3 {
      font-size: clamp(28px, 2.6vw, 34px);
      line-height: 1.05;
      letter-spacing: -0.02em;
    }
    .staffing-hire-overlay {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 28px;
      z-index: 4;
    }
    .staffing-hire-overlay[hidden] {
      display: none;
    }
    .staffing-hire-overlay-backdrop {
      appearance: none;
      position: absolute;
      inset: 0;
      border: 0;
      border-radius: inherit;
      margin: 0;
      padding: 0;
      background: rgba(6, 10, 16, 0.02);
      box-shadow: none;
      color: transparent;
      font-size: 0;
      line-height: 0;
      backdrop-filter: blur(4px) saturate(0.96);
      -webkit-backdrop-filter: blur(4px) saturate(0.96);
      cursor: pointer;
    }
    body[data-theme="dark"] .staffing-hire-overlay-backdrop,
    body[data-theme="forest"] .staffing-hire-overlay-backdrop {
      background: rgba(6, 10, 16, 0.04);
    }
    .staffing-hire-overlay-card {
      position: relative;
      z-index: 1;
      width: min(640px, calc(100% - 48px));
      max-height: calc(100% - 48px);
      overflow: hidden;
    }
    .staffing-hire-market-shell {
      display: grid;
      gap: 12px;
      min-height: 0;
      overflow: auto;
    }
    .staffing-hire-action-row {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
    }
    .staffing-detail-section {
      display: grid;
      gap: 12px;
      padding-top: 16px;
      margin-top: 16px;
      border-top: 1px solid var(--line);
    }
    .staffing-detail-section:first-child {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
    }
    .summary-list { display: grid; gap: 12px; }
    .staffing-comparison-grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .summary-item {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
    }
    .summary-item strong { display: block; font-size: 18px; margin-top: 3px; }
    .staffing-comparison-card {
      display: grid;
      gap: 10px;
      align-content: start;
    }
    .staffing-hire-choice-form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    .event-list { display: grid; gap: 10px; }
    .event-item {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
    }
    .empty-state { padding: 18px; border: 1px dashed var(--line); border-radius: 16px; color: var(--muted); }
    .compact { padding: 12px; }
    .muted { color: var(--muted); }
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
    .workspace-toggle-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 14px;
    }
    .workspace-toggle-button {
      appearance: none;
      border: 1px solid var(--line);
      background: var(--panel-strong);
      color: var(--muted);
      border-radius: 999px;
      padding: 10px 14px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font: inherit;
      cursor: pointer;
      transition: border-color .16s ease, color .16s ease, background .16s ease, transform .16s ease;
    }
    .workspace-toggle-button.current {
      border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
      background: color-mix(in srgb, var(--accent-soft) 72%, var(--panel-strong));
      color: var(--text);
    }
    .workspace-toggle-button:hover {
      transform: translateY(-1px);
    }
    .workspace-panel-group {
      min-height: 0;
      display: grid;
      gap: 18px;
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
    .contracts-grid {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(340px, .9fr);
      gap: 18px;
      overflow: hidden;
    }
    .contracts-side-column {
      min-height: 0;
      display: grid;
      gap: 18px;
      grid-template-rows: minmax(240px, .95fr) minmax(0, .8fr) minmax(0, 1fr);
      overflow: hidden;
    }
    .contracts-main-body {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 14px;
      overflow: hidden;
    }
    .contracts-filters {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      flex: 0 0 auto;
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
     .contract-row.selected td { background: color-mix(in srgb, var(--accent-soft) 55%, transparent); }
    .contract-row.matches-endpoint td:first-child {
      box-shadow: inset 3px 0 0 var(--accent);
    }
    .contract-route-button {
      appearance: none;
      border: 0;
      padding: 0;
      margin: 0;
      width: 100%;
      text-align: left;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
    }
    .contracts-map-body {
      padding: 12px;
      background: linear-gradient(180deg, rgba(13,106,119,.08), transparent 45%);
    }
     .contracts-planner-panel {
      min-height: 0;
      overflow: hidden;
    }
    .contracts-planner-body {
      min-height: 0;
      overflow: auto;
    }
    .planner-shell {
      display: grid;
      gap: 18px;
    }
    .planner-candidate-panel .panel-body {
      display: grid;
      gap: 14px;
    }
    .planner-chain-panel .panel-body {
      min-height: 0;
      overflow: auto;
    }
    .planner-endpoint-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
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
    .planner-panel-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }
    .planner-review {
      display: grid;
      gap: 14px;
    }
    .planner-review-actions {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    .planner-review-section {
      display: grid;
      gap: 10px;
    }
    .planner-review-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .planner-review-list {
      display: grid;
      gap: 10px;
    }
    .planner-review-item {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px;
      background: var(--panel-strong);
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
    }
    .planner-review-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .planner-review-toggle input {
      width: 18px;
      height: 18px;
      margin: 0;
    }
    .planner-review-toggle.static {
      min-width: 48px;
    }
    .contracts-map {
      width: 100%;
      height: 100%;
      min-height: 240px;
      display: block;
      border-radius: 18px;
      touch-action: none;
    }
    .map-bg { fill: rgba(8, 18, 28, .08); stroke: var(--line); }
    body[data-theme="dark"] .map-bg { fill: rgba(6, 12, 18, .92); }
    .map-grid line { stroke: rgba(127,127,127,.18); stroke-width: 1; }
    .map-route { fill: none; stroke-linecap: round; }
    .map-route.accepted { stroke: rgba(127,127,127,.38); stroke-width: 3; stroke-dasharray: 10 8; }
    .map-route.selected { stroke: var(--accent); stroke-width: 6; }
    .map-point.origin { fill: var(--accent); }
    .map-point.destination { fill: var(--warn); }
    .map-label { fill: var(--text); font-size: 20px; font-weight: 600; }
    .contracts-accepted-body { overflow: auto; }
    @media (max-width: 1240px) {
      .metrics-strip,
      .context-rail,
      .view-grid.two-up,
      .view-grid.staffing-three-up,
      .view-grid.sidebar-wide,
      .view-grid.stack-and-side,
      .contracts-grid,
      .contracts-filters,
      .staffing-hire-toolbar,
      .staffing-hire-toolbar-primary,
      .staffing-hire-more {
        grid-template-columns: 1fr;
      }
      .main { padding: 18px; }
      body { overflow: auto; }
      .app { height: auto; min-height: 100vh; }
      .main, .content-shell, .view-grid, .panel, .contracts-app-shell, .contracts-grid, .contracts-side-column { min-height: unset; height: auto; }
      .contracts-side-column { grid-template-rows: none; }
      .topbar { grid-template-columns: 1fr; }
      .topbar-meta { align-items: start; }
      .contracts-toolbar { flex-direction: column; }
      .staffing-hire-toolbar-actions { justify-self: start; }
    }
  </style>
</head>
<body>
  <div class="app">
    <main class="main">
      <div class="topbar">
        <div class="topbar-meta">
          <a class="button-link button-secondary" href="/">Back to saves</a>
          <div class="topbar-copy">
            <div class="eyebrow">Save Slot</div>
            <h2>${escapeHtml(title)}</h2>
            <p>${currentSaveId ? `Save ${escapeHtml(currentSaveId)}` : "Local simulation shell"}</p>
          </div>
        </div>
        <button class="theme-toggle" type="button" onclick="window.toggleTheme()">Toggle theme</button>
      </div>
      ${flash.notice ? `<div class="flash notice">${escapeHtml(flash.notice)}</div>` : ""}
      ${flash.error ? `<div class="flash error">${escapeHtml(flash.error)}</div>` : ""}
      ${body}
    </main>
  </div>
  <script>
    (() => {
      const key = 'flightline-theme';
      const themes = ['light', 'dark', 'forest'];
      const themeSet = new Set(themes);
      const root = document.body;
      const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const stored = localStorage.getItem(key);
      const initial = stored && themeSet.has(stored) ? stored : preferred;
      root.dataset.theme = initial;
      window.toggleTheme = () => {
        const currentIndex = themes.indexOf(root.dataset.theme || 'light');
        const next = themes[(currentIndex + 1 + themes.length) % themes.length];
        root.dataset.theme = next;
        localStorage.setItem(key, next);
        window.dispatchEvent(new CustomEvent('flightline:theme-changed', { detail: { theme: next } }));
        return next;
      };
    })();
  </script>
</body>
</html>`;
}
// The launcher remains a pure server render because its interactions are simple and it is the first screen every session hits.
function renderLauncherPage(saveIds, flash, confirmDeleteSaveId) {
    const saveRows = saveIds.length === 0
        ? `<div class="launcher-empty">No saves yet. Create one to start the first company.</div>`
        : saveIds.map((saveId) => {
            const isConfirmingDelete = confirmDeleteSaveId === saveId;
            const openHref = openSaveRoute(saveId);
            const deleteHref = launcherRoute({ confirmDeleteSaveId: saveId });
            return `<article class="launcher-save-row ${isConfirmingDelete ? "warning" : ""}">
        <div class="launcher-save-main">
          <strong>${escapeHtml(saveId)}</strong>
          <span class="muted">${isConfirmingDelete ? "This permanently deletes the local save file." : "Open this save and continue the simulation."}</span>
        </div>
        <div class="launcher-save-actions">
          ${isConfirmingDelete
                ? `<form method="post" action="/actions/delete-save" class="launcher-inline-form"><input type="hidden" name="saveId" value="${escapeHtml(saveId)}" /><button type="submit" class="button-danger">Confirm delete</button></form><a class="button-link button-secondary" href="/">Cancel</a>`
                : `<a class="button-link" href="${openHref}">Open</a><a class="button-link button-secondary" href="${deleteHref}">Delete</a>`}
        </div>
      </article>`;
        }).join("");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Open or Create Save</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #efe9de;
      --bg-alt: linear-gradient(160deg, rgba(250,244,234,.95), rgba(233,228,216,.9));
      --panel: rgba(255,255,255,.88);
      --panel-strong: rgba(255,255,255,.96);
      --text: #182126;
      --muted: #61707b;
      --line: rgba(24,33,38,.08);
      --accent: #0d6a77;
      --accent-soft: rgba(13,106,119,.12);
      --danger: #b03a2e;
      --danger-soft: rgba(176,58,46,.14);
      --shadow: 0 24px 60px rgba(28,33,40,.14);
    }
    body[data-theme="dark"] {
      color-scheme: dark;
      --bg: #0f1720;
      --bg-alt: radial-gradient(circle at top left, rgba(29,74,96,.32), transparent 34%), linear-gradient(180deg, rgba(15,23,32,.98), rgba(14,20,28,.98));
      --panel: rgba(20,29,40,.9);
      --panel-strong: rgba(17,25,35,.98);
      --text: #edf3f7;
      --muted: #8e9daa;
      --line: rgba(237,243,247,.08);
      --accent: #6fc9d4;
      --accent-soft: rgba(111,201,212,.12);
      --danger: #ef8c83;
      --danger-soft: rgba(239,140,131,.14);
      --shadow: 0 24px 60px rgba(0,0,0,.34);
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg-alt);
      color: var(--text);
      font: 15px/1.45 Aptos, "Segoe UI Variable Text", "Trebuchet MS", sans-serif;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    [hidden] { display: none !important; }
    .launcher-shell {
      width: min(760px, 100%);
      display: grid;
      gap: 18px;
    }
    .launcher-header {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 16px;
    }
    .launcher-header h1 {
      margin: 8px 0 6px;
      font-size: 34px;
      line-height: 1.05;
    }
    .launcher-header p {
      margin: 0;
      color: var(--muted);
    }
    .eyebrow { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); }
    .launcher-card {
      display: grid;
      gap: 16px;
      padding: 22px;
      border-radius: 24px;
      background: var(--panel);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }
    .launcher-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .launcher-card-head h2 {
      margin: 0;
      font-size: 18px;
    }
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
    .button-secondary {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--line);
    }
    body[data-theme="dark"] .button-secondary {
      color: var(--text);
      background: transparent;
    }
    .button-danger {
      background: var(--danger);
      color: #fff;
    }
    body[data-theme="dark"] .button-danger {
      background: var(--danger);
      color: #091018;
    }
    .launcher-form {
      display: flex;
      gap: 12px;
      align-items: end;
      flex-wrap: wrap;
    }
    label {
      display: grid;
      gap: 6px;
      flex: 1 1 280px;
      color: var(--muted);
      font-size: 13px;
    }
    input {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
      color: var(--text);
      padding: 11px 12px;
      font: inherit;
    }
    .flash {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
    }
    .flash.notice { background: var(--accent-soft); border-color: rgba(13,106,119,.22); }
    .flash.error { background: var(--danger-soft); border-color: rgba(176,58,46,.24); }
    .launcher-save-list {
      display: grid;
      gap: 10px;
    }
    .launcher-save-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
    }
    .launcher-save-row.warning {
      border-color: rgba(176,58,46,.32);
      background: color-mix(in srgb, var(--danger-soft) 55%, var(--panel-strong));
    }
    .launcher-save-main {
      min-width: 0;
      display: grid;
      gap: 4px;
    }
    .launcher-save-main strong {
      font-size: 16px;
      overflow-wrap: anywhere;
    }
    .launcher-save-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: end;
    }
    .launcher-inline-form {
      display: inline-flex;
    }
    .launcher-empty {
      padding: 18px;
      border: 1px dashed var(--line);
      border-radius: 16px;
      color: var(--muted);
      text-align: center;
    }
    .muted { color: var(--muted); }
    @media (max-width: 720px) {
      body { padding: 18px; }
      .launcher-card { padding: 18px; }
      .launcher-header,
      .launcher-card-head,
      .launcher-save-row {
        align-items: stretch;
        grid-auto-flow: row;
        flex-direction: column;
      }
      .launcher-save-actions {
        justify-content: stretch;
      }
      .launcher-save-actions > * {
        flex: 1 1 auto;
      }
      .launcher-form button {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <main class="launcher-shell">
    <header class="launcher-header">
      <div>
        <div class="eyebrow">FlightLine</div>
        <h1>Open or Create Save</h1>
        <p>Create a new save or continue an existing local company.</p>
      </div>
    </header>
    ${flash.notice ? `<div class="flash notice">${escapeHtml(flash.notice)}</div>` : ""}
    ${flash.error ? `<div class="flash error">${escapeHtml(flash.error)}</div>` : ""}
    <section class="launcher-card">
      <div class="launcher-card-head">
        <div>
          <div class="eyebrow">Create</div>
          <h2>New Save</h2>
        </div>
      </div>
      <form method="post" action="/actions/create-save" class="launcher-form">
        <label>Save Name
          <input name="saveName" placeholder="flightline_alpha" autofocus />
        </label>
        <button type="submit">Create save</button>
      </form>
    </section>
    <section class="launcher-card">
      <div class="launcher-card-head">
        <div>
          <div class="eyebrow">Open</div>
          <h2>Existing Saves</h2>
        </div>
        <span class="muted">${saveIds.length} total</span>
      </div>
      <div class="launcher-save-list">${saveRows}</div>
    </section>
  </main>
  <script>
    (() => {
      const key = 'flightline-theme';
      const themes = ['light', 'dark', 'forest'];
      const themeSet = new Set(themes);
      const root = document.body;
      const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const stored = localStorage.getItem(key);
      const initial = stored && themeSet.has(stored) ? stored : preferred;
      root.dataset.theme = initial;
      window.toggleTheme = () => {
        const currentIndex = themes.indexOf(root.dataset.theme || 'light');
        const next = themes[(currentIndex + 1 + themes.length) % themes.length];
        root.dataset.theme = next;
        localStorage.setItem(key, next);
      };
    })();
  </script>
</body>
</html>`;
}
// Save-page rendering composes the loaded projections into either a plain fallback shell or the richer hydrated experience.
function serializeJsonForScript(value) {
    return JSON.stringify(value)
        .replaceAll("&", "\\u0026")
        .replaceAll("<", "\\u003c")
        .replaceAll(">", "\\u003e");
}
function renderContractsTab(saveId, payload) {
    if (!payload) {
        return renderPanel("Contract Market", `<div class="empty-state">The contracts board becomes available after the company exists and the market can be generated.</div>`);
    }
    return `<div class="contracts-app-shell"><div data-contracts-app data-view-url="/api/save/${encodeURIComponent(saveId)}/contracts/view" data-accept-url="/api/save/${encodeURIComponent(saveId)}/contracts/accept"><script type="application/json" data-contracts-payload>${serializeJsonForScript(payload)}</script><div class="panel"><div class="panel-body"><div class="empty-state compact">Loading contracts board...</div></div></div></div><script type="module" src="${contractsTabClientAssetPath}"></script></div>`;
}
function renderSavePage(model, saveIds, flash, activeTab, contractsPayload = null) {
    if (!model.companyContext) {
        return renderShell(`Save ${model.saveId}`, saveIds, model.saveId, flash, `<div class="content-shell">${renderPanel("Create Company", `<form method="post" action="/actions/create-company" class="actions">
        <input type="hidden" name="saveId" value="${escapeHtml(model.saveId)}" />
        ${renderTabInput(activeTab)}
        <label>Display Name
          <input name="displayName" value="FlightLine Regional" />
        </label>
        <label>Starter Airport
          <input name="starterAirportId" value="KDEN" />
        </label>
        <div class="summary-item">
          <div class="eyebrow">Starting Capital</div>
          <strong>$3,500,000</strong>
          <div class="muted">Fixed startup cash for the current slice.</div>
        </div>
        <button type="submit">Create company</button>
      </form>`)}
      </div>`);
    }
    const company = model.companyContext;
    const fleet = model.fleetState?.aircraft ?? [];
    const contracts = model.companyContracts?.contracts ?? [];
    const offers = model.contractBoard?.offers ?? [];
    const schedules = model.schedules;
    const staffingPackages = model.staffingState?.staffingPackages ?? [];
    const staffingCoverage = model.staffingState?.coverageSummaries ?? [];
    const activeSchedules = schedules.filter((schedule) => !schedule.isDraft && schedule.scheduleState !== "completed");
    const draftSchedules = schedules.filter((schedule) => schedule.isDraft);
    const unassignedContracts = contracts.filter((contract) => contract.contractState === "accepted");
    const assignedContracts = contracts.filter((contract) => contract.contractState === "assigned");
    const inFlightContracts = contracts.filter((contract) => contract.contractState === "active");
    const upcomingContracts = contracts.filter((contract) => ["accepted", "assigned", "active"].includes(contract.contractState));
    const idleAircraftCount = fleet.filter((aircraft) => aircraft.dispatchAvailable).length;
    const groundedAircraftCount = fleet.length - idleAircraftCount;
    const offersAvailableCount = offers.filter((offer) => offer.offerStatus === "available").length;
    const urgentContracts = upcomingContracts.filter((contract) => hoursUntil(company.currentTimeUtc, contract.deadlineUtc) <= 24);
    const aircraftById = new Map(fleet.map((aircraft) => [aircraft.aircraftId, aircraft]));
    const pilotOptions = fleet
        .map((aircraft) => `<option value="${escapeHtml(aircraft.aircraftId)}">${escapeHtml(aircraft.registration)} | ${escapeHtml(aircraft.modelDisplayName)} | ${escapeHtml(aircraft.currentAirportId)}</option>`)
        .join("");
    const hiddenContext = `<input type="hidden" name="saveId" value="${escapeHtml(model.saveId)}" />${renderTabInput(activeTab)}`;
    const priorityItems = [];
    if (fleet.length === 0) {
        priorityItems.push({
            label: "Acquire your first aircraft",
            detail: "No aircraft are available to service contracts or build schedules.",
            tone: "danger",
        });
    }
    if (staffingPackages.length === 0) {
        priorityItems.push({
            label: "Activate pilot and cabin coverage",
            detail: "Your operation has no active staffing packages, so dispatch will remain blocked.",
            tone: "danger",
        });
    }
    if (!model.contractBoard || offersAvailableCount === 0) {
        priorityItems.push({
            label: "Refresh the contract market",
            detail: "There is no live contract board to evaluate for new work.",
            tone: "warn",
        });
    }
    if (unassignedContracts.length > 0) {
        priorityItems.push({
            label: "Assign accepted work",
            detail: `${unassignedContracts.length} accepted contract${unassignedContracts.length === 1 ? " is" : "s are"} still waiting for aircraft assignment.`,
            tone: urgentContracts.length > 0 ? "danger" : "warn",
        });
    }
    if (draftSchedules.length > 0) {
        priorityItems.push({
            label: "Commit drafted schedules",
            detail: `${draftSchedules.length} draft schedule${draftSchedules.length === 1 ? " is" : "s are"} ready for commitment.`,
            tone: "warn",
        });
    }
    if (priorityItems.length === 0) {
        priorityItems.push({
            label: "Stable operating state",
            detail: "Refresh the market for better contracts or advance time to execute the current plan.",
            tone: "accent",
        });
    }
    const firstPriority = priorityItems[0] ?? {
        label: "Stable operating state",
        detail: "Refresh the market for better contracts or advance time to execute the current plan.",
        tone: "accent",
    };
    const contextCards = [
        {
            label: "Current Focus",
            value: firstPriority.label,
            detail: firstPriority.detail,
            tone: firstPriority.tone,
        },
        {
            label: "Accepted Work",
            value: `${unassignedContracts.length} unassigned`,
            detail: `${assignedContracts.length} assigned | ${inFlightContracts.length} active`,
            tone: urgentContracts.length > 0 ? "warn" : "neutral",
        },
        {
            label: "Dispatch Readiness",
            value: `${idleAircraftCount}/${fleet.length || 0} aircraft`,
            detail: `${draftSchedules.length} drafts | ${activeSchedules.length} active schedules`,
            tone: idleAircraftCount > 0 ? "accent" : "warn",
        },
        {
            label: "Deadline Pressure",
            value: urgentContracts.length > 0 ? `${urgentContracts.length} due in 24h` : "Clear",
            detail: urgentContracts.length > 0 ? "Advance time carefully or rework the dispatch queue." : "No accepted contract is nearing an immediate deadline.",
            tone: urgentContracts.length > 0 ? "danger" : "accent",
        },
    ];
    const tabMeta = {
        dashboard: urgentContracts.length > 0 ? `${urgentContracts.length}!` : `${upcomingContracts.length}`,
        contracts: `${offersAvailableCount}/${contracts.length}`,
        aircraft: `${idleAircraftCount}/${fleet.length || 0}`,
        staffing: `${model.staffingState?.totalActiveCoverageUnits ?? 0}`,
        dispatch: `${draftSchedules.length + activeSchedules.length}`,
        activity: `${model.eventLog?.entries.length ?? 0}`,
    };
    const contractsLink = `<a class="button-link button-secondary" href="${saveRoute(model.saveId, { tab: "contracts" })}">Open contract board</a>`;
    const riskyContractsLink = `<a class="button-link button-secondary" href="${saveRoute(model.saveId, { tab: "contracts", contractsView: "my_contracts" })}">Open risky contracts</a>`;
    const advanceTimeForm = `<form method="post" action="/actions/advance-time" class="actions">
    ${hiddenContext}
    <div class="action-group">
      <label>Hours
        <input name="hours" type="number" min="1" value="24" />
      </label>
      <label>Stop Mode
        <select name="stopMode">
          <option value="target_time">Target time</option>
          <option value="leg_completed">Until leg completed</option>
        </select>
      </label>
      <button type="submit">Advance time</button>
    </div>
  </form>`;
    const acquireAircraftForm = `<form method="post" action="/actions/acquire-aircraft" class="actions">
    ${hiddenContext}
    <label>Starter Aircraft
      <select name="aircraftModelId">${starterAircraftOptions.map((option) => `<option value="${option.modelId}">${escapeHtml(option.label)}</option>`).join("")}</select>
    </label>
    <button type="submit">Acquire aircraft</button>
  </form>`;
    const staffingActionRow = Object.entries(staffingPresets).map(([presetKey, preset]) => `<form method="post" action="/actions/add-staffing" class="inline">${hiddenContext}<input type="hidden" name="presetKey" value="${escapeHtml(presetKey)}" /><button type="submit">${escapeHtml(preset.label)}</button></form>`).join("");
    const contractBoardBody = offers.length === 0
        ? `<div class="empty-state">No active contract board is currently visible.</div>`
        : `<div class="table-wrap"><table><thead><tr><th>Route</th><th>Fit</th><th>Payload</th><th>Window</th><th>Payout</th><th></th></tr></thead><tbody>${offers.map((offer) => `<tr><td>${renderRouteDisplay(offer.originAirportId, offer.destinationAirportId)}</td><td><div class="meta-stack">${renderBadge(offer.difficultyBand)}<span class="muted">${escapeHtml(offer.likelyRole.replaceAll("_", " "))}</span></div></td><td>${escapeHtml(formatPayload(offer.volumeType, offer.passengerCount, offer.cargoWeightLb))}</td><td><div class="meta-stack"><span>${escapeHtml(formatDate(offer.earliestStartUtc))}</span><span class="muted">due ${escapeHtml(formatDate(offer.latestCompletionUtc))}</span></div></td><td>${formatMoney(offer.payoutAmount)}</td><td>${offer.offerStatus === "available" ? `<form method="post" action="/actions/accept-contract" class="inline">${hiddenContext}<input type="hidden" name="contractOfferId" value="${escapeHtml(offer.contractOfferId)}" /><button type="submit">Accept</button></form>` : renderBadge(offer.offerStatus)}</td></tr>`).join("")}</tbody></table></div>`;
    const companyContractsBody = contracts.length === 0
        ? `<div class="empty-state">No accepted company contracts yet.</div>`
        : `<div class="table-wrap"><table><thead><tr><th>State</th><th>Route</th><th>Payload</th><th>Deadline</th><th>Assignment</th><th></th></tr></thead><tbody>${contracts.map((contract) => {
            const assignedAircraft = contract.assignedAircraftId ? aircraftById.get(contract.assignedAircraftId) : undefined;
            const assignmentHtml = assignedAircraft
                ? `<div class="meta-stack"><span>${escapeHtml(assignedAircraft.registration)}</span><span class="muted">${escapeHtml(assignedAircraft.modelDisplayName)}</span></div>`
                : `<span class="muted">Unassigned</span>`;
            return `<tr><td>${renderBadge(contract.contractState)}</td><td>${renderRouteDisplay(contract.originAirportId, contract.destinationAirportId)}</td><td>${escapeHtml(formatPayload(contract.volumeType, contract.passengerCount, contract.cargoWeightLb))}</td><td><div class="meta-stack"><span>${escapeHtml(formatDate(contract.deadlineUtc))}</span><span class="muted">earliest ${escapeHtml(formatDate(contract.earliestStartUtc))}</span></div></td><td>${assignmentHtml}</td><td>${fleet.length > 0 && ["accepted", "assigned"].includes(contract.contractState) ? `<form method="post" action="/actions/auto-plan-contract" class="inline">${hiddenContext}<input type="hidden" name="companyContractId" value="${escapeHtml(contract.companyContractId)}" /><label>Aircraft<select name="aircraftId">${pilotOptions}</select></label><button type="submit">Auto-plan</button></form>` : ""}</td></tr>`;
        }).join("")}</tbody></table></div>`;
    const fleetSummaryBody = `<div class="summary-list">
    <div class="summary-item"><div class="eyebrow">Dispatchable</div><strong>${formatNumber(idleAircraftCount)}</strong><div class="muted">${formatPercent(fleet.length > 0 ? (idleAircraftCount / fleet.length) * 100 : 0)} of fleet ready now.</div></div>
    <div class="summary-item"><div class="eyebrow">Grounded or busy</div><strong>${formatNumber(groundedAircraftCount)}</strong><div class="muted">Aircraft unavailable due to schedule or state.</div></div>
    <div class="summary-item"><div class="eyebrow">MSFS overlap</div><strong>${formatNumber(fleet.filter((aircraft) => aircraft.msfs2024Status === "confirmed_available").length)}</strong><div class="muted">Currently confirmed as available in MSFS 2024.</div></div>
    <div class="summary-item"><div class="eyebrow">Lease or finance load</div><strong>${formatMoney((model.fleetState?.aircraft ?? []).reduce((sum, aircraft) => sum + (aircraft.recurringPaymentAmount ?? 0), 0))}</strong><div class="muted">Recurring aircraft obligations currently visible.</div></div>
  </div>`;
    const fleetBody = fleet.length === 0
        ? `<div class="empty-state">No aircraft in the fleet yet.</div>`
        : `<div class="table-wrap"><table><thead><tr><th>Aircraft</th><th>Status</th><th>Location</th><th>Operating Envelope</th><th>MSFS</th></tr></thead><tbody>${fleet.map((aircraft) => `<tr><td><div class="meta-stack"><span class="route">${escapeHtml(aircraft.registration)}</span><span class="muted">${escapeHtml(aircraft.modelDisplayName)} | ${escapeHtml(aircraft.ownershipType)}</span></div></td><td><div class="meta-stack">${renderBadge(aircraft.statusInput)}<span class="muted">${formatPercent(aircraft.conditionValue, 0)} condition | dispatch ${aircraft.dispatchAvailable ? "yes" : "no"}</span></div></td><td>${renderAirportDisplay(aircraft.currentAirportId)}</td><td><div class="meta-stack"><span>${aircraft.maxPassengers} pax | ${formatNumber(aircraft.maxCargoLb)} lb | ${formatNumber(aircraft.rangeNm)} nm</span><span class="muted">${formatAirportSize(aircraft.minimumAirportSize)} | ${formatNumber(aircraft.minimumRunwayFt)} ft runway</span></div></td><td>${renderBadge(aircraft.msfs2024Status.replaceAll("_", " "))}</td></tr>`).join("")}</tbody></table></div>`;
    const eventLogBody = !model.eventLog || model.eventLog.entries.length === 0
        ? `<div class="empty-state">No event log entries yet.</div>`
        : `<div class="event-list">${model.eventLog.entries.map((entry) => `<div class="event-item"><div class="meta-stack"><div>${entry.severity ? renderBadge(entry.severity) : ""} <strong>${escapeHtml(entry.message)}</strong></div><div class="muted">${escapeHtml(formatDate(entry.eventTimeUtc))} | ${escapeHtml(entry.eventType)}</div></div></div>`).join("")}</div>`;
    const quickActionsPanel = renderPanel("Control Tower", `<div class="actions">
    <div class="action-group tight">${contractsLink}${riskyContractsLink}</div>
    ${advanceTimeForm}
  </div>`, {
        actionHtml: `<div class="pill-row"><span class="pill">${offersAvailableCount} live offers</span><span class="pill">${upcomingContracts.length} active contracts</span></div>`,
    });
    const overviewFocusPanel = renderPanel("Immediate Priorities", `<div class="summary-list">${priorityItems.map((item) => `<div class="summary-item"><div class="meta-stack">${renderBadge(item.tone === "danger" ? "critical" : item.tone === "warn" ? "warning" : "active")}<strong>${escapeHtml(item.label)}</strong><span class="muted">${escapeHtml(item.detail)}</span></div></div>`).join("")}</div>`);
    const dashboardSnapshotPanel = renderPanel("Operating Snapshot", `<div class="summary-list">
    <div class="summary-item"><div class="eyebrow">Accepted contracts waiting</div><strong>${formatNumber(unassignedContracts.length)}</strong><div class="muted">Need assignment before execution.</div></div>
    <div class="summary-item"><div class="eyebrow">Draft schedules</div><strong>${formatNumber(draftSchedules.length)}</strong><div class="muted">Ready for review and commit.</div></div>
    <div class="summary-item"><div class="eyebrow">Active schedules</div><strong>${formatNumber(activeSchedules.length)}</strong><div class="muted">Currently holding aircraft capacity.</div></div>
    <div class="summary-item"><div class="eyebrow">Staff coverage</div><strong>${formatNumber(model.staffingState?.totalActiveCoverageUnits ?? 0)}</strong><div class="muted">${formatMoney(model.staffingState?.totalMonthlyFixedCostAmount ?? 0)} monthly fixed labor cost.</div></div>
  </div>`);
    const dashboardQueuePanel = renderPanel("Execution Queue", upcomingContracts.length === 0
        ? `<div class="empty-state">No active company contracts are waiting for action.</div>`
        : `<div class="summary-list">${upcomingContracts.slice(0, 6).map((contract) => `<div class="summary-item"><div class="meta-stack">${renderRouteDisplay(contract.originAirportId, contract.destinationAirportId)}<span class="muted">${formatMoney(contract.acceptedPayoutAmount)} | due ${escapeHtml(formatDate(contract.deadlineUtc))}</span></div></div>`).join("")}</div>`);
    const contractsMarketSummaryPanel = renderPanel("Market Snapshot", `<div class="summary-list">
    <div class="summary-item"><div class="eyebrow">Live offers</div><strong>${formatNumber(offersAvailableCount)}</strong><div class="muted">${model.contractBoard ? `Board expires ${escapeHtml(formatDate(model.contractBoard.expiresAtUtc))}.` : "No active board."}</div></div>
    <div class="summary-item"><div class="eyebrow">Accepted work</div><strong>${formatNumber(contracts.length)}</strong><div class="muted">${formatNumber(unassignedContracts.length)} still need aircraft assignment.</div></div>
    <div class="summary-item"><div class="eyebrow">Near-term pressure</div><strong>${formatNumber(urgentContracts.length)}</strong><div class="muted">Contracts due within the next 24 hours.</div></div>
  </div>`);
    const staffingSummaryPanel = renderPanel("Coverage Posture", `<div class="summary-list">
    <div class="summary-item"><div class="eyebrow">Active units</div><strong>${formatNumber(model.staffingState?.totalActiveCoverageUnits ?? 0)}</strong><div class="muted">Coverage currently in force.</div></div>
    <div class="summary-item"><div class="eyebrow">Pending units</div><strong>${formatNumber(model.staffingState?.totalPendingCoverageUnits ?? 0)}</strong><div class="muted">Packages not yet active.</div></div>
    <div class="summary-item"><div class="eyebrow">Qualification lines</div><strong>${formatNumber(staffingCoverage.length)}</strong><div class="muted">Distinct labor/qualification combinations tracked.</div></div>
    <div class="summary-item"><div class="eyebrow">Monthly cost</div><strong>${formatMoney(model.staffingState?.totalMonthlyFixedCostAmount ?? 0)}</strong><div class="muted">Visible fixed labor obligation.</div></div>
  </div>`);
    const dispatchControlsPanel = renderPanel("Dispatch Controls", `<div class="actions">${advanceTimeForm}</div>`, {
        actionHtml: `<div class="pill-row"><span class="pill">${activeSchedules.length} active</span><span class="pill">${draftSchedules.length} drafts</span></div>`,
    });
    const dispatchQueuePanel = renderPanel("Contracts Ready For Dispatch", companyContractsBody, {
        actionHtml: `<div class="pill-row"><span class="pill">${unassignedContracts.length} unassigned</span><span class="pill">${assignedContracts.length} assigned</span></div>`,
    });
    const activitySnapshotPanel = renderPanel("Dispatch Snapshot", `<div class="summary-list"><div class="summary-item"><div class="eyebrow">Current time</div><strong>${escapeHtml(formatDate(company.currentTimeUtc))}</strong><div class="muted">Home base ${escapeHtml(company.homeBaseAirportId)}</div></div><div class="summary-item"><div class="eyebrow">Event volume</div><strong>${formatNumber(model.eventLog?.entries.length ?? 0)}</strong><div class="muted">Most recent operational events in this save.</div></div><div class="summary-item"><div class="eyebrow">Open contracts</div><strong>${formatNumber(upcomingContracts.length)}</strong><div class="muted">Accepted contracts still in play.</div></div><div class="summary-item"><div class="eyebrow">Dispatchable fleet</div><strong>${formatNumber(idleAircraftCount)}</strong><div class="muted">Aircraft available for new work.</div></div></div>`);
    const activeTabBody = (() => {
        switch (activeTab) {
            case "contracts":
                return renderContractsTab(model.saveId, contractsPayload);
            case "aircraft":
                return `<div class="view-grid stack-and-side"><div class="stack-column">${renderPanel("Aircraft Actions", `<div class="actions">${acquireAircraftForm}</div>`)}${renderPanel("Fleet Posture", fleetSummaryBody)}</div><div class="stack-column">${renderPanel("Fleet", fleetBody, { actionHtml: `<div class="pill-row"><span class="pill">${idleAircraftCount} ready</span><span class="pill">${groundedAircraftCount} unavailable</span></div>` })}${renderPanel("Access and Fit", `<div class="summary-list"><div class="summary-item"><div class="eyebrow">Airport access floor</div><strong>${fleet.length > 0 ? formatAirportSize(Math.max(...fleet.map((aircraft) => aircraft.minimumAirportSize))) : "-"}</strong><div class="muted">Largest minimum airport size currently required by the fleet.</div></div><div class="summary-item"><div class="eyebrow">Runway floor</div><strong>${fleet.length > 0 ? `${formatNumber(Math.max(...fleet.map((aircraft) => aircraft.minimumRunwayFt)))} ft` : "-"}</strong><div class="muted">Highest minimum runway requirement in the active fleet.</div></div><div class="summary-item"><div class="eyebrow">Typical labor model</div><strong>${fleet[0] ? escapeHtml(fleet[0].pilotQualificationGroup) : "-"}</strong><div class="muted">Use the staffing tab to build coverage against qualification groups.</div></div></div>`)}</div></div>`;
            case "staffing":
                return `<div class="view-grid stack-and-side"><div class="stack-column">${renderPanel("Staffing Actions", `<div class="actions"><div class="action-group tight">${staffingActionRow}</div></div>`)}${staffingSummaryPanel}</div><div class="stack-column">${renderPanel("Coverage Summary", staffingCoverageBody)}${renderPanel("Active Packages", staffingPackagesBody)}</div></div>`;
            case "dispatch":
                return `<div class="view-grid stack-and-side"><div class="stack-column">${renderPanel("Schedules", schedulesBody)}${dispatchControlsPanel}</div><div class="stack-column">${dispatchQueuePanel}</div></div>`;
            case "activity":
                return `<div class="view-grid two-up">${renderPanel("Recent Activity", eventLogBody)}${activitySnapshotPanel}</div>`;
            case "dashboard":
            default:
                return `<div class="view-grid stack-and-side"><div class="stack-column">${quickActionsPanel}${overviewFocusPanel}${dashboardSnapshotPanel}</div><div class="stack-column">${dashboardQueuePanel}${renderPanel("Recent Activity", eventLogBody)}</div></div>`;
        }
    })();
    return renderShell(company.displayName, saveIds, model.saveId, flash, `<div class="content-shell">${renderMetricStrip(model)}${renderSaveTabs(model.saveId, activeTab, tabMeta)}${activeTab === "contracts" ? "" : renderContextRail(contextCards)}${activeTabBody}</div>`);
}
