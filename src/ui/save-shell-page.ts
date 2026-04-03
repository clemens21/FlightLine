/*
 * Renders the base HTML shell that the browser client hydrates after a save is opened.
 * It provides the layout, static chrome, and bootstrapping hooks for the richer client-side shell experience.
 * This file is mostly structure and CSS. When a shell layout or visual regression appears, start here before assuming
 * the browser controller is wrong, because many "logic bugs" in the UI are really shell-level layout issues.
 */

import {
  getHelpCenterTopic,
  getHelpCenterTopicsForSection,
  helpCenterHomeShortcutGroups,
  helpCenterSections,
  type HelpCenterSectionId,
  type HelpCenterTopic,
} from "./help-center-content.js";
import type { SavePageTab } from "./save-shell-model.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHelpCenterSectionTabs(): string {
  return helpCenterSections.map((section, index) => {
    const isCurrent = index === 0;
    return `<button
      type="button"
      class="help-section-button${isCurrent ? " current" : ""}"
      data-help-section-tab="${escapeHtml(section.id)}"
      aria-selected="${isCurrent ? "true" : "false"}"
    >
      <strong>${escapeHtml(section.label)}</strong>
      <span class="muted">${escapeHtml(section.description)}</span>
    </button>`;
  }).join("");
}

function renderHelpTopicButton(topic: HelpCenterTopic, isCurrent: boolean, className = "help-topic-button"): string {
  return `<button
    type="button"
    class="${className}${isCurrent ? " current" : ""}"
    data-help-topic-button="${escapeHtml(topic.id)}"
    data-help-topic-section="${escapeHtml(topic.sectionId)}"
    aria-current="${isCurrent ? "true" : "false"}"
  >
    <strong>${escapeHtml(topic.title)}</strong>
    <span class="muted">${escapeHtml(topic.summary)}</span>
  </button>`;
}

function renderHelpRelatedTopics(topic: HelpCenterTopic): string {
  const relatedButtons = topic.relatedTopicIds.map((relatedTopicId) => {
    const relatedTopic = getHelpCenterTopic(relatedTopicId);
    if (!relatedTopic) {
      return "";
    }

    return renderHelpTopicButton(relatedTopic, false, "help-related-topic");
  }).join("");

  if (!relatedButtons) {
    return "";
  }

  return `<section class="help-article-section">
    <h4>Related topics</h4>
    <div class="help-related-topics">${relatedButtons}</div>
  </section>`;
}

function renderHelpArticle(topic: HelpCenterTopic, isCurrent: boolean): string {
  const sectionLabel = helpCenterSections.find((section) => section.id === topic.sectionId)?.label ?? topic.sectionId;
  return `<article
    class="help-article"
    data-help-topic-panel="${escapeHtml(topic.id)}"
    data-help-topic-section="${escapeHtml(topic.sectionId)}"
    ${isCurrent ? "" : "hidden"}
  >
    <header class="help-article-head">
      <div class="eyebrow">${escapeHtml(sectionLabel)}</div>
      <h3>${escapeHtml(topic.title)}</h3>
      <p>${escapeHtml(topic.summary)}</p>
    </header>
    <section class="help-article-section">
      <h4>What this is</h4>
      <p>${escapeHtml(topic.whatThisIs)}</p>
    </section>
    <section class="help-article-section">
      <h4>Why you might be stuck</h4>
      <ul class="help-list">
        ${topic.whyYouMightBeStuck.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}
      </ul>
    </section>
    <section class="help-article-section">
      <h4>What to do next</h4>
      <ol class="help-steps">
        ${topic.whatToDoNext.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}
      </ol>
    </section>
    <section class="help-article-section">
      <h4>Where to go</h4>
      <ul class="help-list">
        ${topic.whereToGo.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}
      </ul>
    </section>
    ${renderHelpRelatedTopics(topic)}
  </article>`;
}

function renderHelpCenterHome(): string {
  const shortcutGroups = helpCenterHomeShortcutGroups.map((group) => {
    const shortcutButtons = group.topicIds.map((topicId) => {
      const topic = getHelpCenterTopic(topicId);
      if (!topic) {
        return "";
      }

      return renderHelpTopicButton(topic, false, "help-home-shortcut");
    }).join("");

    return `<section class="help-home-group">
      <div class="help-home-group-head">
        <h3>${escapeHtml(group.title)}</h3>
        <p>${escapeHtml(group.description)}</p>
      </div>
      <div class="help-home-shortcuts">${shortcutButtons}</div>
    </section>`;
  }).join("");

  return `<section class="help-section-panel help-home-panel" data-help-section-panel="home">
    <section class="help-home-hero">
      <div class="eyebrow">Help Home</div>
      <h2>Need a quick recovery path?</h2>
      <p>Start with a short guide, not a manual. This Help Center is here to tell you what FlightLine is asking for next, why you may be blocked, and which workspace should solve the problem.</p>
    </section>
    <section class="help-home-note">
      <strong>First-pass scope</strong>
      <span class="muted">This is a small player-facing reference for the current slice. It explains Contracts, Aircraft, Staff, Dispatch, Time Advance, Calendar, and Cash without trying to document every hidden rule.</span>
    </section>
    <div class="help-home-groups">${shortcutGroups}</div>
  </section>`;
}

function renderHelpTopicSection(sectionId: Exclude<HelpCenterSectionId, "home">): string {
  const topics = getHelpCenterTopicsForSection(sectionId);
  const firstTopicId = topics[0]?.id ?? "";

  return `<section class="help-section-panel help-topic-section" data-help-section-panel="${escapeHtml(sectionId)}" hidden>
    <nav class="help-topic-list" aria-label="${escapeHtml(sectionId)} help topics">
      ${topics.map((topic, index) => renderHelpTopicButton(topic, index === 0)).join("")}
    </nav>
    <div class="help-article-region">
      ${topics.map((topic, index) => renderHelpArticle(topic, index === 0 && topic.id === firstTopicId)).join("")}
    </div>
  </section>`;
}

function renderHelpCenterOverlay(): string {
  return `<section class="help-center-overlay" data-help-center hidden>
    <button type="button" class="help-center-backdrop" data-help-close aria-label="Close Help Center"></button>
    <div class="help-center-dialog" role="dialog" aria-modal="true" aria-labelledby="help-center-title">
      <header class="help-center-head">
        <div class="help-center-copy">
          <div class="eyebrow">Help Center</div>
          <h2 id="help-center-title">Help Center</h2>
          <p>Short player-facing guidance for what to do next, why you may be blocked, and what the current slice is trying to tell you.</p>
        </div>
        <button type="button" class="button-secondary help-center-close" data-help-close>Close</button>
      </header>
      <div class="help-center-body">
        <aside class="help-section-nav" aria-label="Help sections">
          ${renderHelpCenterSectionTabs()}
        </aside>
        <div class="help-center-content">
          ${renderHelpCenterHome()}
          ${renderHelpTopicSection("next")}
          ${renderHelpTopicSection("blocked")}
          ${renderHelpTopicSection("concepts")}
        </div>
      </div>
    </div>
  </section>`;
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
    body[data-theme="dark"] .button-link,
    body[data-theme="forest"] .theme-toggle,
    body[data-theme="forest"] button,
    body[data-theme="forest"] .button-link {
      color: #091018;
      background: var(--accent);
    }
    .button-secondary { background: transparent; color: var(--text); border: 1px solid var(--line); }
    body[data-theme="dark"] .button-secondary,
    body[data-theme="forest"] .button-secondary { color: var(--text); background: transparent; }
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
      padding: 0;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .shell-cash-button {
      width: 100%;
      display: grid;
      gap: 4px;
      padding: 12px 14px;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .shell-cash-button:hover,
    .shell-cash-button:focus-visible {
      background: color-mix(in srgb, var(--accent-soft) 54%, var(--panel-strong));
      outline: none;
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
    body[data-theme="dark"] .settings-action,
    body[data-theme="forest"] .settings-action {
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
    .help-center-overlay {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 28px;
      z-index: 30;
    }
    .help-center-backdrop {
      position: absolute;
      inset: 0;
      border: 0;
      padding: 0;
      background: rgba(22, 29, 36, 0.18);
      backdrop-filter: blur(10px);
      cursor: pointer;
    }
    .help-center-dialog {
      position: relative;
      width: min(1080px, calc(100vw - 80px));
      height: min(760px, calc(100vh - 80px));
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      border-radius: 24px;
      border: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel-strong) 96%, transparent);
      box-shadow: var(--shadow);
      backdrop-filter: blur(22px);
      overflow: hidden;
    }
    .help-center-head {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 16px;
      padding: 22px 24px 18px;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel) 70%, transparent);
    }
    .help-center-copy {
      display: grid;
      gap: 6px;
      min-width: 0;
    }
    .help-center-copy h2 {
      margin: 0;
      font-size: 26px;
      line-height: 1.05;
    }
    .help-center-copy p {
      margin: 0;
      color: var(--muted);
      max-width: 760px;
    }
    .help-center-close,
    body[data-theme="dark"] .help-center-close,
    body[data-theme="forest"] .help-center-close {
      box-shadow: none;
      min-width: 96px;
      justify-content: center;
    }
    .help-center-body {
      min-height: 0;
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
    }
    .help-section-nav {
      min-height: 0;
      overflow: auto;
      display: grid;
      gap: 10px;
      padding: 18px;
      border-right: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel) 72%, transparent);
      align-content: start;
    }
    .help-section-button,
    body[data-theme="dark"] .help-section-button,
    body[data-theme="forest"] .help-section-button {
      width: 100%;
      display: grid;
      gap: 4px;
      justify-items: start;
      text-align: left;
      padding: 14px 16px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
      color: var(--text);
      box-shadow: none;
    }
    .help-section-button.current {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent-soft) 60%, var(--panel));
    }
    .help-center-content {
      min-height: 0;
      position: relative;
    }
    .help-section-panel {
      min-height: 0;
      height: 100%;
    }
    .help-home-panel {
      overflow: auto;
      display: grid;
      gap: 18px;
      padding: 20px 24px 24px;
      align-content: start;
    }
    .help-home-hero,
    .help-home-note,
    .help-home-group {
      display: grid;
      gap: 10px;
      padding: 18px 20px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: var(--panel);
    }
    .help-home-hero h2,
    .help-home-group h3 {
      margin: 0;
    }
    .help-home-hero p,
    .help-home-group p,
    .help-home-note span {
      margin: 0;
      color: var(--muted);
    }
    .help-home-groups {
      display: grid;
      gap: 16px;
    }
    .help-home-shortcuts {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .help-topic-section {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(260px, 0.4fr) minmax(0, 0.6fr);
    }
    .help-topic-list {
      min-height: 0;
      overflow: auto;
      display: grid;
      gap: 10px;
      padding: 18px;
      border-right: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel) 72%, transparent);
      align-content: start;
    }
    .help-topic-button,
    .help-home-shortcut,
    .help-related-topic,
    body[data-theme="dark"] .help-topic-button,
    body[data-theme="dark"] .help-home-shortcut,
    body[data-theme="dark"] .help-related-topic,
    body[data-theme="forest"] .help-topic-button,
    body[data-theme="forest"] .help-home-shortcut,
    body[data-theme="forest"] .help-related-topic {
      width: 100%;
      display: grid;
      gap: 4px;
      justify-items: start;
      text-align: left;
      padding: 14px 16px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
      color: var(--text);
      box-shadow: none;
    }
    .help-topic-button.current,
    .help-home-shortcut.current,
    .help-related-topic.current {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent-soft) 60%, var(--panel));
    }
    .help-related-topic {
      width: auto;
      justify-items: start;
      padding: 10px 12px;
      border-radius: 999px;
    }
    .help-article-region {
      min-height: 0;
      overflow: auto;
      padding: 20px 24px 24px;
    }
    .help-article {
      display: grid;
      gap: 18px;
      align-content: start;
    }
    .help-article-head {
      display: grid;
      gap: 8px;
    }
    .help-article-head h3 {
      margin: 0;
      font-size: 28px;
      line-height: 1.05;
    }
    .help-article-head p {
      margin: 0;
      color: var(--muted);
    }
    .help-article-section {
      display: grid;
      gap: 10px;
      padding: 16px 18px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: var(--panel);
    }
    .help-article-section h4 {
      margin: 0;
      font-size: 12px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .help-article-section p {
      margin: 0;
    }
    .help-list,
    .help-steps {
      display: grid;
      gap: 8px;
      margin: 0;
      padding-left: 18px;
    }
    .help-related-topics {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
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
    .choice-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .choice-card {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      align-items: start;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: rgba(12, 19, 29, 0.72);
      min-width: 0;
      cursor: pointer;
    }
    .choice-card input { width: auto; margin-top: 4px; }
    .choice-card-copy { display: grid; gap: 6px; min-width: 0; }
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
    .table-wrap {
      min-height: 0;
      overflow: auto;
      scrollbar-gutter: stable;
    }
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
    .overview-finance-panel {
      min-height: 0;
    }
    .overview-finance-panel:focus-visible,
    .overview-finance-panel.overview-finance-focused {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }
    .overview-finance-body {
      display: grid;
      gap: 16px;
    }
    .overview-finance-summary-strip,
    .overview-finance-category-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .overview-finance-category-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .overview-finance-summary-card,
    .overview-finance-category-card,
    .overview-finance-scrub-summary {
      min-height: 0;
    }
    .overview-finance-main-grid {
      align-items: stretch;
    }
    .overview-finance-graph-panel,
    .overview-finance-category-panel,
    .overview-finance-obligation-panel {
      min-height: 0;
      display: grid;
      gap: 14px;
    }
    .overview-finance-graph-shell {
      display: grid;
      gap: 12px;
    }
    .overview-finance-graph-toolbar,
    .overview-finance-scrub-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .overview-finance-graph-frame {
      border: 1px solid var(--line);
      border-radius: 18px;
      background: color-mix(in srgb, var(--panel-strong) 88%, transparent);
      padding: 12px;
      min-height: 220px;
    }
    .overview-finance-graph-frame svg {
      width: 100%;
      height: 196px;
      display: block;
    }
    .overview-finance-graph-grid-line {
      stroke: var(--line);
      stroke-width: 1;
    }
    .overview-finance-graph-base-line {
      fill: none;
      stroke: var(--text);
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .overview-finance-graph-uplift-line {
      fill: none;
      stroke: var(--accent);
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 8 7;
      opacity: .9;
    }
    .overview-finance-graph-uplift-area {
      fill: color-mix(in srgb, var(--accent-soft) 72%, transparent);
      opacity: .6;
    }
    .overview-finance-graph-point {
      fill: var(--panel-strong);
      stroke: var(--text);
      stroke-width: 2;
    }
    .overview-finance-graph-point.uplift {
      stroke: var(--accent);
    }
    .overview-finance-graph-point.current {
      fill: var(--accent);
    }
    .overview-finance-graph-axis-label {
      fill: var(--muted);
      font-size: 11px;
      letter-spacing: .04em;
    }
    .overview-finance-horizon-button.current {
      border-color: color-mix(in srgb, var(--accent) 38%, var(--line));
      color: var(--accent);
      background: color-mix(in srgb, var(--accent-soft) 58%, var(--panel-strong));
    }
    .overview-finance-obligation-list {
      display: grid;
      gap: 10px;
    }
    .overview-finance-obligation {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 12px 14px;
      background: color-mix(in srgb, var(--panel-strong) 92%, transparent);
    }
    .overview-finance-obligation.warning {
      border-color: color-mix(in srgb, var(--warn) 30%, var(--line));
      background: color-mix(in srgb, var(--warn-soft) 42%, var(--panel-strong));
    }
    .overview-finance-obligation.critical {
      border-color: color-mix(in srgb, var(--danger) 34%, var(--line));
      background: color-mix(in srgb, var(--danger-soft) 42%, var(--panel-strong));
    }
    .overview-finance-obligation-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .overview-finance-category-note {
      font-size: 13px;
    }
    .overview-finance-scrub-row input[type="range"] {
      flex: 1 1 240px;
      min-width: 220px;
    }
    .staffing-hire-workspace {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      overflow: hidden;
    }
    .staffing-hire-stage {
      position: relative;
      min-height: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .staffing-hire-table-panel {
      min-height: 0;
      flex: 1 1 auto;
    }
    .staffing-hire-table-panel > .panel-body {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    .staffing-hire-table-body {
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      flex: 1 1 auto;
      gap: 14px;
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }
    .staffing-hire-market-shell {
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
    }
    .staffing-hire-market-list {
      flex: 1 1 auto;
      min-height: 280px;
      height: 100%;
      max-height: 100%;
      position: relative;
      isolation: isolate;
      overflow: auto;
      overscroll-behavior: contain;
    }
    .staffing-hire-market-list table {
      min-width: 1740px;
      width: 100%;
      table-layout: fixed;
      border-collapse: separate;
      border-spacing: 0;
    }
    .staffing-hire-market-list thead {
      position: sticky;
      top: 0;
      z-index: 4;
    }
    .staffing-hire-market-list th {
      position: sticky;
      top: 0;
      z-index: 5;
      overflow: visible;
      vertical-align: top;
      background: linear-gradient(180deg, color-mix(in srgb, var(--panel-strong) 94%, transparent), color-mix(in srgb, var(--panel) 92%, transparent));
      backdrop-filter: blur(10px) saturate(1.02);
      -webkit-backdrop-filter: blur(10px) saturate(1.02);
      box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--accent) 16%, var(--line));
    }
    .staffing-hire-market-list th,
    .staffing-hire-market-list td {
      position: relative;
    }
    .staffing-hire-market-list th:not(:first-child)::before,
    .staffing-hire-market-list td:not(:first-child)::before {
      content: "";
      position: absolute;
      left: 0;
      width: 1px;
      pointer-events: none;
    }
    .staffing-hire-market-list th:not(:first-child)::before {
      top: 10px;
      bottom: 8px;
      background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--accent) 34%, var(--line)) 18%, color-mix(in srgb, var(--accent) 34%, var(--line)) 82%, transparent 100%);
      opacity: 0.85;
    }
    .staffing-hire-market-list td:not(:first-child)::before {
      top: 9px;
      bottom: 9px;
      background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--text) 14%, var(--line)) 22%, color-mix(in srgb, var(--text) 14%, var(--line)) 78%, transparent 100%);
      opacity: 0.45;
    }
    .staffing-hire-column-head {
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
    }
    .staffing-hire-sort-button,
    body[data-theme="dark"] .staffing-hire-sort-button,
    body[data-theme="forest"] .staffing-hire-sort-button {
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
      font-weight: 700;
      cursor: pointer;
      min-width: 0;
      white-space: nowrap;
      box-shadow: none;
      justify-content: flex-start;
      text-align: left;
      color: var(--text);
      font-size: 13px;
      line-height: 1.1;
      letter-spacing: 0.01em;
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1 1 auto;
    }
    .staffing-hire-sort-button:hover,
    .staffing-hire-sort-button:focus-visible {
      color: color-mix(in srgb, var(--accent) 72%, var(--text));
      outline: none;
    }
    .staffing-hire-column[aria-sort="ascending"] .staffing-hire-sort-button,
    .staffing-hire-column[aria-sort="descending"] .staffing-hire-sort-button {
      color: var(--accent);
    }
    .staffing-hire-column[aria-sort="ascending"] .staffing-hire-sort-button::after,
    .staffing-hire-column[aria-sort="descending"] .staffing-hire-sort-button::after {
      font-size: 11px;
      line-height: 1;
      opacity: 0.9;
    }
    .staffing-hire-column[aria-sort="ascending"] .staffing-hire-sort-button::after {
      content: "↑";
    }
    .staffing-hire-column[aria-sort="descending"] .staffing-hire-sort-button::after {
      content: "↓";
    }
    .staffing-hire-column.is-sorted::after {
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
    .staffing-hire-column-actions {
      display: inline-flex;
      gap: 4px;
      flex: 0 0 auto;
      position: relative;
      z-index: 2;
    }
    .staffing-hire-icon-button,
    body[data-theme="dark"] .staffing-hire-icon-button,
    body[data-theme="forest"] .staffing-hire-icon-button {
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
    .staffing-hire-icon-button:hover,
    .staffing-hire-icon-button:focus-visible {
      background: color-mix(in srgb, var(--accent-soft) 58%, var(--panel-strong));
      outline: none;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent);
    }
    .staffing-hire-icon-button svg {
      width: 12px;
      height: 12px;
      fill: currentColor;
      pointer-events: none;
    }
    .staffing-hire-icon-button svg * {
      pointer-events: none;
    }
    .staffing-hire-popover {
      position: absolute;
      z-index: 6;
      transform: translateX(var(--staffing-hire-popover-nudge, 0));
    }
    .staffing-hire-popover--search {
      top: 50%;
      right: 34px;
      width: max(180px, min(320px, calc(100% - 44px)));
      max-width: min(320px, calc(100vw - 24px));
      transform: translateX(var(--staffing-hire-popover-nudge, 0)) translateY(-50%);
    }
    .staffing-hire-inline-search,
    .staffing-hire-inline-search:is(input) {
      width: 100%;
      height: 34px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--line));
      background: color-mix(in srgb, var(--panel-strong) 92%, var(--accent-soft));
      color: var(--text);
      box-shadow: var(--shadow);
    }
    .staffing-hire-inline-search::placeholder {
      color: color-mix(in srgb, var(--muted) 80%, var(--text));
    }
    .staffing-hire-inline-search:focus {
      outline: none;
      border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent), var(--shadow);
    }
    .staffing-hire-popover--filter {
      top: calc(100% + 8px);
      right: 0;
      width: min(248px, calc(100vw - 48px));
      max-width: calc(100vw - 24px);
      padding: 10px;
      display: grid;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel-strong);
      box-shadow: var(--shadow);
    }
    .staffing-hire-popover--filter[data-staffing-hire-popover-side="start"] {
      left: 0;
      right: auto;
    }
    .staffing-hire-popover-body {
      display: grid;
      gap: 10px;
    }
    .staffing-hire-popover-field {
      display: grid;
      gap: 6px;
    }
    .staffing-hire-popover-field--compact {
      gap: 8px;
    }
    .staffing-hire-range-fields {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .staffing-hire-range-field {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .staffing-hire-range-field input {
      width: 100%;
    }
    .staffing-hire-checkbox-list {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      justify-items: start;
    }
    .staffing-hire-checkbox-option {
      display: inline-grid;
      grid-template-columns: 16px minmax(0, 1fr);
      align-items: center;
      gap: 6px;
      width: 100%;
      min-width: 0;
      color: var(--text);
      font-size: 12px;
      line-height: 1.2;
    }
    .staffing-hire-checkbox-option input {
      margin: 0;
      accent-color: var(--accent);
    }
    .staffing-hire-popover-field input,
    .staffing-hire-popover-field select {
      width: 100%;
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
    .staffing-hire-market-list td:nth-child(9) {
      white-space: nowrap;
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
    .staffing-hire-overlay {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 8px;
      z-index: 12;
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
      width: min(1320px, calc(100vw - 16px));
      max-height: calc(100vh - 16px);
      overflow: hidden;
    }
    .staffing-hire-overlay-card .panel-head {
      padding: 10px 12px 6px;
    }
    .staffing-hire-overlay-card .panel-body {
      padding: 8px 10px 10px;
    }
    .staffing-hire-detail-grid {
      grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.95fr);
      gap: 8px;
      align-content: start;
    }
    .staffing-hire-detail-grid > .staffing-detail-section {
      min-width: 0;
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
      align-content: start;
      gap: 6px;
      padding: 8px 10px;
    }
    .staffing-hire-detail-grid > .staffing-detail-section--snapshot,
    .staffing-hire-detail-grid > .staffing-detail-section--comparison,
    .staffing-hire-detail-grid > .staffing-detail-section--coverage {
      grid-column: 1 / -1;
    }
    .staffing-hire-action-row {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
    }
    .staffing-hire-detail-grid > .staffing-hire-action-row {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
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
    .staffing-hire-detail-grid .staffing-comparison-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .staffing-hire-detail-grid .aircraft-fact-row {
      grid-template-columns: 124px minmax(0, 1fr);
      gap: 10px;
      padding: 6px 0;
      align-items: center;
    }
    .staffing-hire-overlay-card .staffing-detail-headline h3 {
      font-size: clamp(28px, 2.6vw, 34px);
      line-height: 1.05;
      letter-spacing: -0.02em;
    }
    .staffing-hire-detail-grid .summary-item {
      padding: 10px 12px;
    }
    .staffing-hire-detail-grid .summary-item strong {
      font-size: 16px;
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
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      height: 100%;
    }
    .staffing-comparison-copy {
      display: grid;
      gap: 8px;
      min-width: 0;
      align-content: start;
    }
    .staffing-comparison-action {
      justify-self: end;
      align-self: center;
    }
    .staffing-hire-choice-form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    .staffing-hire-choice-form--embedded {
      display: grid;
      gap: 8px;
    }
    .staffing-hire-choice-form--embedded button {
      width: auto;
      min-width: 180px;
    }
    .staffing-hire-base-field {
      display: grid;
      gap: 6px;
      min-width: 0;
      width: 100%;
    }
    .staffing-hire-base-field input {
      width: 100%;
      min-width: 0;
      text-transform: uppercase;
    }
    .staffing-snapshot-grid {
      display: grid;
      grid-template-columns: minmax(0, 0.96fr) minmax(0, 1.04fr);
      gap: 10px;
      align-items: start;
    }
    .staffing-compact-facts {
      display: grid;
      gap: 0;
    }
    .staffing-cert-hours-card {
      display: grid;
      gap: 8px;
      min-width: 0;
    }
    .staffing-cert-hours-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
    }
    .staffing-cert-hours-table th,
    .staffing-cert-hours-table td {
      padding: 5px 6px;
      border-top: 1px solid var(--line);
      white-space: nowrap;
    }
    .staffing-cert-hours-table tbody tr:first-child th,
    .staffing-cert-hours-table tbody tr:first-child td {
      border-top: 0;
    }
    .staffing-cert-hours-table th {
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-align: left;
      text-transform: uppercase;
    }
    .staffing-cert-hours-table td {
      color: var(--text);
      font-size: 13px;
      font-weight: 600;
      text-align: right;
    }
    .staffing-cert-hours-table .is-muted {
      color: var(--muted);
      opacity: 0.85;
    }
    .staffing-stat-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .staffing-stat-card {
      display: grid;
      gap: 8px;
      align-content: start;
    }
    .staffing-stat-card .pilot-stat-rating {
      width: 100%;
      justify-content: space-between;
    }
    .staffing-stat-card .pilot-stat-rating.compact .pilot-stat-stars {
      font-size: 14px;
    }
    .staffing-stat-card .pilot-stat-rating.compact .pilot-stat-score {
      font-size: 12px;
    }
    .staffing-employee-note {
      display: grid;
      gap: 4px;
      align-content: start;
    }
    .staffing-employee-note strong {
      display: block;
      font-size: 15px;
    }
    .staffing-detail-note-list {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 6px;
    }
    .staffing-detail-note-list li {
      color: var(--muted);
      line-height: 1.25;
    }
    .staffing-detail-note-list li::marker {
      color: var(--accent);
    }
    .staffing-coverage-strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0 14px;
    }
    .staffing-coverage-strip .aircraft-fact-row {
      grid-template-columns: 110px minmax(0, 1fr);
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
    .contracts-toolbar-actions {
      display: flex;
      justify-content: end;
      align-items: start;
      flex: 0 0 auto;
      margin-left: auto;
    }
    .contracts-toolbar strong {
      display: block;
      font-size: 20px;
      margin: 4px 0;
    }
    .contracts-workspace-tabs {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: end;
      gap: 10px;
    }
    .contracts-workspace-tab,
    body[data-theme="dark"] .contracts-workspace-tab {
      appearance: none;
      border: 1px solid rgba(111,201,212,.18) !important;
      background: rgba(18, 40, 55, .88) !important;
      color: #9bb8c9 !important;
      border-radius: 14px;
      padding: 10px 14px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font: inherit;
      cursor: pointer;
      transition: background-color .15s ease, border-color .15s ease, color .15s ease;
    }
    .contracts-workspace-tab.current,
    .contracts-workspace-tab[aria-selected="true"],
    body[data-theme="dark"] .contracts-workspace-tab.current,
    body[data-theme="dark"] .contracts-workspace-tab[aria-selected="true"] {
      background: var(--accent) !important;
      border-color: transparent !important;
      color: #091018 !important;
    }
    .contracts-workspace-tab[aria-selected="false"],
    body[data-theme="dark"] .contracts-workspace-tab[aria-selected="false"] {
      background: rgba(18, 40, 55, .88) !important;
      border-color: rgba(111,201,212,.18) !important;
      color: #9bb8c9 !important;
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
      grid-template-columns: minmax(0, 1fr) 596px;
      gap: 18px;
      overflow: hidden;
    }
    .contracts-side-column {
      min-height: 0;
      min-width: 0;
      display: grid;
      gap: 18px;
      grid-template-rows: auto minmax(0, 1fr);
      overflow: hidden;
      align-content: start;
    }
    @media (max-width: 1200px) {
      .contracts-toolbar {
        flex-direction: column;
        align-items: stretch;
      }
      .contracts-toolbar-actions,
      .contracts-workspace-tabs {
        justify-content: start;
        margin-left: 0;
      }
    }
    .contracts-main-body {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 0;
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
    .contracts-board-stage {
      position: relative;
      min-height: 0;
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      overflow: visible;
    }
    .contracts-board-wrap {
      min-height: 0;
      flex: 1 1 auto;
      height: 100%;
      isolation: isolate;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--panel-strong);
    }
    .contracts-board-wrap thead {
      position: sticky;
      top: 0;
      z-index: 4;
    }
    .contracts-board-table {
      min-width: 1260px;
      width: 100%;
      table-layout: fixed;
    }
    .contracts-board-table th,
    .contracts-board-table td {
      position: relative;
    }
    .contracts-board-table th {
      z-index: 5;
    }
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
      align-self: start;
    }
    .contracts-map-body {
      padding: 14px;
      background: linear-gradient(180deg, rgba(13,106,119,.08), transparent 45%);
      display: grid;
      grid-template-rows: auto auto;
      gap: 10px;
      overflow: hidden;
    }
    .contracts-selected-panel {
      min-height: 0;
      overflow: hidden;
    }
    .contracts-selected-body {
      display: grid;
      gap: 14px;
    }
    .contracts-selected-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .contracts-selected-card {
      display: grid;
      gap: 6px;
      min-width: 0;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: color-mix(in srgb, var(--panel-strong) 88%, transparent);
    }
    .contracts-selected-card strong {
      font-size: 15px;
      line-height: 1.25;
    }
    .contracts-selected-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .contracts-due-cell {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .contracts-board-header-popover {
      position: absolute;
      top: var(--contracts-board-popover-top, 0);
      left: var(--contracts-board-popover-left, 0);
      z-index: 16;
    }
    .contracts-board-header-popover--search {
      width: var(--contracts-board-popover-width, 240px);
      max-width: calc(100vw - 24px);
      transform: translateY(-50%);
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel-strong);
      box-shadow: var(--shadow);
    }
    .contracts-board-header-popover--search-group {
      transform: none;
      padding: 12px;
      border-radius: 16px;
    }
    .contracts-board-popover-body--search {
      display: grid;
      gap: 8px;
    }
    .contracts-board-header-popover--search-group .contracts-board-popover-body--search {
      gap: 10px;
    }
    .contracts-board-search-field {
      display: grid;
      gap: 6px;
    }
    .contracts-board-inline-search,
    .contracts-board-inline-search:is(input) {
      width: 100%;
      height: 34px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--line));
      background: color-mix(in srgb, var(--panel-strong) 92%, var(--accent-soft));
      color: var(--text);
      box-shadow: var(--shadow);
    }
    .contracts-board-inline-search::placeholder {
      color: color-mix(in srgb, var(--muted) 80%, var(--text));
    }
    .contracts-board-inline-search:focus {
      outline: none;
      border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent), var(--shadow);
    }
    .contracts-board-header-popover--filter {
      width: var(--contracts-board-popover-width, min(236px, calc(100vw - 48px)));
      max-width: calc(100vw - 24px);
      padding: 10px;
      display: grid;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel-strong);
      box-shadow: var(--shadow);
    }
    .contracts-board-popover-body {
      display: grid;
      gap: 8px;
    }
    .contracts-board-popover-field {
      display: grid;
      gap: 8px;
    }
    .contracts-board-range-fields {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .contracts-board-range-field {
      display: grid;
      gap: 6px;
      min-width: 0;
    }
    .contracts-board-range-field input {
      width: 100%;
    }
    .contracts-board-checkbox-list {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      justify-items: start;
    }
    .contracts-board-checkbox-option {
      display: inline-grid;
      grid-template-columns: 16px minmax(0, 1fr);
      gap: 6px;
      align-items: center;
      width: 100%;
      min-width: 0;
      color: var(--text);
      font-size: 12px;
      line-height: 1.2;
    }
    .contracts-board-checkbox-option input {
      margin: 0;
      accent-color: var(--accent);
    }
     .contracts-planning-panel {
      flex: 1 1 auto;
      min-height: 0;
    }
     .contracts-planner-panel {
      min-height: 0;
      overflow: hidden;
    }
    .contracts-planner-body {
      min-height: 0;
      overflow: hidden;
      padding: 14px 16px 16px;
    }
    .planner-shell {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-columns: minmax(320px, .72fr) minmax(0, 1.28fr);
      gap: 18px;
      overflow: hidden;
    }
    .planner-workbench {
      min-height: 0;
      min-width: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) minmax(260px, .82fr);
      gap: 14px;
      overflow: hidden;
    }
    .planner-anchor-panel .panel-body,
    .planner-candidate-panel .panel-body {
      min-height: 0;
      overflow: hidden;
      padding: 0;
    }
    .planner-anchor-table-wrap,
    .planner-candidate-table-wrap {
      min-height: 0;
      height: 100%;
      overflow: auto;
      background: var(--panel-strong);
    }
    .planner-anchor-table-wrap thead,
    .planner-candidate-table-wrap thead {
      position: sticky;
      top: 0;
      z-index: 4;
    }
    .planner-anchor-table,
    .planner-candidate-table {
      width: 100%;
      table-layout: fixed;
    }
    .planner-anchor-table {
      min-width: 0;
    }
    .planner-candidate-table {
      min-width: 1126px;
    }
    .planner-setup-card {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 12px 14px;
      background: var(--panel-strong);
      display: grid;
      gap: 10px;
    }
    .planner-setup-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .planner-setup-metric {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 10px 12px;
      background: var(--panel);
      display: grid;
      gap: 6px;
    }
    .planner-setup-metric strong {
      font-size: 14px;
    }
    .planner-aircraft-picker,
    .planner-aircraft-brief {
      display: grid;
      gap: 6px;
    }
    .planner-inline-callout {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 10px 12px;
      background: var(--panel);
      display: grid;
      gap: 6px;
    }
    .planner-summary-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .planner-summary-card,
    .planner-continuity-issue {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 10px 12px;
      background: var(--panel-strong);
      display: grid;
      gap: 5px;
    }
    .planner-summary-card.accent {
      border-color: rgba(13,106,119,.22);
      background: color-mix(in srgb, var(--accent-soft) 54%, var(--panel-strong));
    }
    .planner-summary-card.warning {
      border-color: rgba(239,177,95,.3);
      background: color-mix(in srgb, var(--warn-soft) 48%, var(--panel-strong));
    }
    .planner-summary-card strong,
    .planner-continuity-issue strong {
      font-size: 16px;
    }
    .planner-continuity-list {
      display: grid;
      gap: 8px;
    }
    .planner-continuity-issue {
      font-size: 13px;
    }
    .planner-continuity-issue.ok {
      border-color: rgba(13,106,119,.22);
      background: color-mix(in srgb, var(--accent-soft) 40%, var(--panel-strong));
    }
    .planner-candidate-panel {
      min-height: 0;
    }
    .planner-review {
      display: grid;
      gap: 14px;
    }
    .planner-review-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .planner-review-section {
      display: grid;
      gap: 10px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
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
      gap: 10px;
    }
    .planner-review-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: var(--muted);
    }
    .planner-review-toggle input {
      width: 18px;
      height: 18px;
      margin: 0;
    }
    .planner-review-toggle.static {
      opacity: .8;
    }
    .planner-chain-panel .panel-body {
      min-height: 0;
      overflow: auto;
      display: grid;
      gap: 12px;
      padding: 12px 14px 14px;
    }
    .planner-chain-map-card {
      display: grid;
      gap: 8px;
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
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
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
    .planner-table-action-cell {
      display: grid;
      gap: 6px;
      align-items: start;
      justify-items: start;
    }
    .planner-table-action-cell .muted {
      font-size: 12px;
      line-height: 1.25;
    }
    .planner-anchor-row.selected td {
      background: color-mix(in srgb, var(--accent-soft) 55%, transparent);
    }
    .planner-candidate-row--blocked {
      opacity: .9;
    }
    .planner-item .meta-stack {
      min-width: 0;
    }
    .planner-item .meta-stack strong,
    .planner-review-item .meta-stack strong {
      overflow-wrap: anywhere;
    }
    .planner-review-item .meta-stack {
      min-width: 0;
    }
    .planner-item.candidate-offer,
    .planner-review-item.candidate_offer {
      border-color: rgba(111,201,212,.18);
    }
    .planner-item.accepted_contract,
    .planner-review-item.accepted_contract {
      border-color: rgba(239,177,95,.24);
    }
    .planner-item-source {
      display: inline-flex;
      width: fit-content;
      align-items: center;
      padding: 4px 9px;
      border-radius: 999px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .08em;
      line-height: 1;
    }
    .planner-item-source.planned {
      background: color-mix(in srgb, var(--accent-soft) 56%, var(--panel-strong));
      color: var(--accent);
    }
    .planner-item-source.accepted {
      background: color-mix(in srgb, var(--warn-soft) 56%, var(--panel-strong));
      color: var(--warn);
    }
    .planner-item.stale,
    .planner-review-item.candidate_stale {
      opacity: .82;
    }
    .contracts-map {
      width: 100%;
      height: auto;
      min-height: 0;
      aspect-ratio: 1 / 1;
      display: block;
      border-radius: 18px;
      touch-action: none;
      overflow: hidden;
    }
    .contracts-plan-map {
      aspect-ratio: auto;
      height: 220px;
      min-height: 220px;
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
    .map-sequence { fill: rgba(9, 16, 24, .9); stroke: var(--panel-strong); stroke-width: 2; }
    .map-sequence.accepted { fill: rgba(239,177,95,.9); }
    .map-sequence.planned { fill: rgba(111,201,212,.92); }
    .map-sequence-text { fill: #091018; font-size: 11px; font-weight: 700; }
    .map-segment-label { font-size: 12px; font-weight: 500; }
    .contracts-accepted-body { overflow: auto; }
    @media (max-width: 1480px) {
      .planner-shell {
        grid-template-columns: minmax(300px, .78fr) minmax(0, 1.22fr);
      }
      .planner-setup-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 1240px) {
      .planner-shell {
        grid-template-columns: minmax(0, 1fr);
      }
      .planner-workbench {
        grid-template-rows: auto minmax(320px, 1fr) minmax(260px, auto);
      }
      .contracts-planner-body {
        overflow: auto;
      }
    }
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
      height: 100%;
      display: grid;
      overflow: hidden;
    }
    .aircraft-workspace-shell {
      position: relative;
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      overflow: hidden;
    }
    .staffing-workspace-host,
    .staffing-workspace-panel,
    .staffing-workspace-shell {
      min-height: 0;
      height: 100%;
    }
    .staffing-workspace-host {
      display: grid;
    }
    .staffing-workspace-panel {
      overflow: hidden;
    }
    .staffing-workspace-panel > .panel-body {
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      min-height: 0;
      overflow: hidden;
    }
    .staffing-workspace-shell {
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      overflow: hidden;
    }
    .staffing-workspace-shell > [data-staffing-workspace-panel] {
      min-height: 0;
      overflow: hidden;
    }
    .aircraft-workbench.staffing-employees-workbench {
      grid-template-columns: minmax(300px, 0.68fr) minmax(0, 1.32fr);
      gap: 16px;
    }
    .staffing-tab-host[data-staffing-active-view="employees"],
    .staffing-tab-host[data-staffing-active-view="employees"] .staffing-workspace-panel,
    .staffing-tab-host[data-staffing-active-view="employees"] .staffing-workspace-shell,
    .staffing-tab-host[data-staffing-active-view="employees"] .staffing-workspace-panel > .panel-body,
    .staffing-tab-host[data-staffing-active-view="employees"] .staffing-workspace-shell > [data-staffing-workspace-panel="employees"] {
      height: auto;
      overflow: visible;
    }
    .staffing-tab-host[data-staffing-active-view="employees"] .staffing-workspace-panel > .panel-body,
    .staffing-tab-host[data-staffing-active-view="employees"] .staffing-workspace-shell {
      grid-template-rows: auto;
    }
    .staffing-tab-host[data-staffing-active-view="employees"] .aircraft-workbench.staffing-employees-workbench {
      height: auto;
      overflow: visible;
      align-items: start;
    }
    .aircraft-workbench {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(340px, .92fr);
      gap: 18px;
      overflow: hidden;
    }
    .aircraft-market-stage {
      position: relative;
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      overflow: visible;
    }
    .aircraft-fleet-panel,
    .aircraft-detail-panel,
    .aircraft-market-panel {
      min-height: 0;
    }
    .aircraft-market-panel {
      height: 100%;
      transition: filter 140ms ease, opacity 140ms ease, transform 140ms ease;
    }
    .aircraft-market-stage.overlay-open > .aircraft-market-panel {
      filter: blur(7px) saturate(0.94);
      opacity: 0.72;
      transform: scale(0.994);
      pointer-events: none;
      user-select: none;
    }
    .aircraft-fleet-body {
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 14px;
      overflow: hidden;
    }
    .staffing-roster-table {
      width: 100%;
      table-layout: fixed;
    }
    .aircraft-market-body {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      overflow: hidden;
    }
    .aircraft-market-body .aircraft-table-wrap {
      height: 100%;
      min-height: 280px;
    }
    .aircraft-table-wrap {
      min-height: 0;
      height: 100%;
      isolation: isolate;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--panel-strong);
    }
    .aircraft-table-wrap thead {
      position: sticky;
      top: 0;
      z-index: 4;
    }
    .aircraft-market-table {
      min-width: 1480px;
      width: 100%;
      table-layout: fixed;
    }
    .aircraft-market-table th,
    .aircraft-market-table td {
      position: relative;
    }
    .aircraft-market-table th {
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
    .aircraft-market-header-popover {
      position: absolute;
      top: var(--aircraft-market-popover-top, 0);
      left: var(--aircraft-market-popover-left, 0);
      z-index: 16;
    }
    .aircraft-market-header-popover--search {
      width: var(--aircraft-market-popover-width, 240px);
      max-width: calc(100vw - 24px);
      transform: translateY(-50%);
    }
    .aircraft-market-inline-search,
    .aircraft-market-inline-search:is(input) {
      width: 100%;
      height: 34px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--line));
      background: color-mix(in srgb, var(--panel-strong) 92%, var(--accent-soft));
      color: var(--text);
      box-shadow: var(--shadow);
    }
    .aircraft-market-inline-search::placeholder {
      color: color-mix(in srgb, var(--muted) 80%, var(--text));
    }
    .aircraft-market-inline-search:focus {
      outline: none;
      border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent), var(--shadow);
    }
    .aircraft-market-header-popover--filter {
      width: var(--aircraft-market-popover-width, min(236px, calc(100vw - 48px)));
      max-width: calc(100vw - 24px);
      padding: 10px;
      display: grid;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel-strong);
      box-shadow: var(--shadow);
    }
    .aircraft-market-popover-body {
      display: grid;
      gap: 10px;
    }
    .aircraft-market-popover-field {
      display: grid;
      gap: 8px;
    }
    .aircraft-market-range-fields {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .aircraft-market-range-field {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .aircraft-market-range-field input {
      width: 100%;
    }
    .aircraft-market-checkbox-list {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      justify-items: start;
    }
    .aircraft-market-checkbox-option {
      display: inline-grid;
      grid-template-columns: 16px minmax(0, 1fr);
      align-items: center;
      gap: 6px;
      width: 100%;
      min-width: 0;
      color: var(--text);
      font-size: 12px;
      line-height: 1.2;
    }
    .aircraft-market-checkbox-option input {
      margin: 0;
      accent-color: var(--accent);
    }
    .aircraft-market-table td:nth-child(3),
    .aircraft-market-table td:nth-child(4),
    .aircraft-market-table td:nth-child(5),
    .aircraft-market-table td:nth-child(6),
    .aircraft-market-table td:nth-child(7),
    .aircraft-market-table td:nth-child(8) {
      white-space: nowrap;
    }
    .aircraft-toolbar {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
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
    .compare-toggle-button {
      width: 100%;
      justify-content: center;
    }
    .compare-toggle-button.current,
    .compare-action-button.current,
    .aircraft-compare-pill {
      border-color: rgba(111,201,212,.42);
      background: color-mix(in srgb, var(--accent-soft) 58%, var(--panel-strong));
      color: var(--text);
    }
    .aircraft-market-listing {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
    }
    .aircraft-market-listing-thumb {
      margin: 0;
      width: 72px;
      height: 48px;
      border-radius: 12px;
      border: 1px solid var(--line);
      overflow: hidden;
      background: var(--panel-strong);
      box-shadow: var(--shadow);
    }
    .aircraft-market-listing-thumb img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: color-mix(in srgb, var(--panel-strong) 88%, #0d1822);
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
    .staffing-employee-detail-body {
      padding: 12px 14px 14px;
    }
    .staffing-tab-host[data-staffing-active-view="employees"] [data-staffing-detail-body="employees"] {
      overflow: visible;
    }
    .staffing-employee-detail-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr) minmax(240px, 0.8fr);
      gap: 10px;
      align-content: start;
    }
    .staffing-employee-detail-card {
      min-width: 0;
      display: grid;
      align-content: start;
      gap: 8px;
      padding: 12px 14px;
    }
    .staffing-employee-detail-card--hero,
    .staffing-employee-detail-card--actions {
      grid-column: 1 / -1;
    }
    .staffing-employee-hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: start;
    }
    .staffing-employee-hero-actions {
      min-width: 228px;
      display: grid;
      gap: 8px;
      align-content: start;
      justify-items: start;
    }
    .staffing-employee-hero-actions .meta-stack,
    .staffing-employee-hero-actions form.inline {
      width: 100%;
    }
    .staffing-employee-hero-actions .muted {
      font-size: 12px;
      line-height: 1.3;
    }
    .staffing-employee-detail-grid .aircraft-facts-list {
      gap: 0;
    }
    .staffing-employee-detail-grid .aircraft-fact-row {
      grid-template-columns: 96px minmax(0, 1fr);
      gap: 8px;
      padding: 6px 0;
    }
    .staffing-employee-detail-grid .aircraft-fact-copy strong {
      font-size: 13px;
      line-height: 1.3;
    }
    .staffing-employee-detail-grid .aircraft-fact-copy .muted {
      font-size: 12px;
      line-height: 1.35;
    }
    .staffing-employee-detail-grid .staff-identity-card {
      gap: 10px;
      align-items: center;
    }
    .staffing-employee-detail-grid .summary-list {
      gap: 10px;
    }
    .staffing-employee-detail-grid .summary-item {
      padding: 8px 10px;
    }
    .staffing-employee-summary-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .staffing-employee-summary-item {
      min-width: 0;
      display: grid;
      gap: 4px;
      align-content: start;
      padding: 8px 10px;
    }
    .staffing-employee-summary-item--wide {
      grid-column: 1 / -1;
    }
    .staffing-employee-summary-item strong {
      font-size: 13px;
      line-height: 1.3;
    }
    .staffing-employee-summary-item .muted {
      font-size: 12px;
      line-height: 1.35;
    }
    .staffing-employee-detail-grid .staffing-stat-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .aircraft-detail-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      margin-top: -4px;
    }
    .aircraft-compare-dock {
      position: absolute;
      inset: auto 18px 18px 18px;
      z-index: 5;
      display: grid;
      gap: 12px;
      max-height: 38%;
      overflow: auto;
      box-shadow: var(--shadow);
    }
    .aircraft-compare-dock-body {
      padding-top: 0;
    }
    .aircraft-compare-dock .panel-head {
      padding-bottom: 0;
    }
    .aircraft-compare-overlay {
      position: absolute;
      inset: 0;
      z-index: 6;
      display: grid;
      place-items: center;
      padding: 18px;
    }
    .aircraft-compare-backdrop {
      appearance: none;
      position: absolute;
      inset: 0;
      border: 0;
      border-radius: inherit;
      margin: 0;
      padding: 0;
      background: rgba(6, 10, 16, 0.04);
      box-shadow: none;
      color: transparent;
      font-size: 0;
      line-height: 0;
      backdrop-filter: blur(7px) saturate(0.95);
      -webkit-backdrop-filter: blur(7px) saturate(0.95);
      cursor: pointer;
    }
    .aircraft-compare-card {
      position: relative;
      z-index: 1;
      width: min(1480px, calc(100vw - 36px));
      max-height: calc(100vh - 36px);
      overflow: hidden;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }
    .aircraft-compare-body {
      min-height: 0;
      display: grid;
      gap: 14px;
      overflow: hidden;
    }
    .aircraft-compare-layout {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-columns: minmax(280px, .42fr) minmax(0, 1fr);
      gap: 14px;
      overflow: hidden;
    }
    .aircraft-compare-rail {
      min-height: 0;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel-strong);
      padding: 12px;
    }
    .aircraft-compare-rail-list {
      display: grid;
      gap: 10px;
    }
    .aircraft-compare-rail-list.compact {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .aircraft-compare-card-item {
      display: grid;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: color-mix(in srgb, var(--panel) 72%, transparent);
      cursor: pointer;
    }
    .aircraft-compare-card-item.baseline {
      border-color: rgba(111,201,212,.42);
      background: color-mix(in srgb, var(--accent-soft) 42%, var(--panel-strong));
    }
    .aircraft-compare-card-item.focused {
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.06);
    }
    .aircraft-compare-card-actions {
      justify-content: flex-start;
    }
    .aircraft-compare-content {
      min-height: 0;
      overflow: auto;
      display: grid;
      gap: 14px;
      align-content: start;
    }
    .aircraft-compare-focus {
      display: grid;
      grid-template-columns: 180px minmax(0, 1fr);
      gap: 16px;
      align-items: start;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel-strong);
    }
    .aircraft-compare-focus-image {
      margin: 0;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid var(--line);
      background: var(--panel);
      box-shadow: var(--shadow);
    }
    .aircraft-compare-focus-image img {
      display: block;
      width: 100%;
      height: 118px;
      object-fit: cover;
    }
    .compare-tabbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .aircraft-compare-matrix {
      min-height: 0;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel-strong);
    }
    .aircraft-compare-matrix table {
      width: 100%;
      min-width: 760px;
    }
    .aircraft-compare-matrix th,
    .aircraft-compare-matrix td {
      vertical-align: top;
    }
    .aircraft-compare-matrix th.baseline,
    .aircraft-compare-matrix td.baseline {
      background: color-mix(in srgb, var(--accent-soft) 36%, var(--panel-strong));
    }
    .aircraft-compare-matrix td.delta strong {
      color: var(--accent);
    }
    .aircraft-compare-replacement {
      display: grid;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid rgba(111,201,212,.22);
      border-radius: 16px;
      background: color-mix(in srgb, var(--accent-soft) 42%, var(--panel-strong));
    }
    .aircraft-market-overlay {
      position: fixed;
      inset: 0;
      display: grid;
      align-items: start;
      justify-items: center;
      padding: 12px;
      overflow: auto;
      z-index: 12;
    }
    .aircraft-market-overlay[hidden] {
      display: none;
    }
    .aircraft-market-overlay-backdrop {
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
    body[data-theme="dark"] .aircraft-market-overlay-backdrop,
    body[data-theme="forest"] .aircraft-market-overlay-backdrop {
      background: rgba(6, 10, 16, 0.04);
    }
    .aircraft-market-overlay-card {
      position: relative;
      z-index: 1;
      width: min(1380px, calc(100vw - 36px));
      max-width: calc(100vw - 36px);
      max-height: var(--aircraft-market-overlay-max-height, calc(100vh - 48px));
      box-sizing: border-box;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      transform: translateY(var(--aircraft-market-overlay-nudge, 0px));
    }
    .aircraft-market-overlay-close {
      position: static;
      justify-self: end;
      margin: 14px 14px 0 0;
    }
    .aircraft-market-overlay-card .aircraft-detail-body {
      padding: 8px 18px 18px;
    }
    .aircraft-detail-actions .button-secondary,
    .aircraft-compare-card-actions .button-secondary {
      white-space: nowrap;
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
    @media (max-width: 1200px) {
      .aircraft-compare-card {
        width: min(100vw - 24px, 1480px);
        max-height: calc(100vh - 24px);
      }
      .aircraft-compare-layout {
        grid-template-columns: minmax(0, 1fr);
      }
      .aircraft-compare-rail {
        order: 2;
      }
      .aircraft-compare-content {
        order: 1;
      }
      .aircraft-compare-focus {
        grid-template-columns: 132px minmax(0, 1fr);
      }
      .aircraft-compare-focus-image img {
        height: 92px;
      }
      .aircraft-compare-rail-list.compact {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .aircraft-compare-matrix table {
        min-width: 620px;
      }
    }
    @media (max-width: 900px) {
      .aircraft-compare-dock {
        inset: auto 12px 12px 12px;
        max-height: 44%;
      }
      .aircraft-compare-card {
        width: calc(100vw - 18px);
        max-height: calc(100vh - 18px);
      }
      .aircraft-compare-focus {
        grid-template-columns: 1fr;
      }
      .aircraft-compare-focus-image {
        max-width: 240px;
      }
      .aircraft-compare-matrix table {
        min-width: 540px;
      }
      .aircraft-detail-actions {
        justify-content: flex-start;
      }
    }
    .dispatch-workspace {
      min-height: 0;
      display: grid;
      gap: 16px;
    }
    .dispatch-ops-bar,
    .dispatch-contract-list-panel,
    .dispatch-contract-focus-panel,
    .dispatch-selected-aircraft-panel,
    .dispatch-plan-panel,
    .dispatch-readiness-panel,
    .dispatch-commit-bar {
      box-shadow: var(--shadow);
    }
    .dispatch-ops-bar {
      overflow: visible;
    }
    .dispatch-ops-bar > .panel-body {
      overflow: visible;
      display: grid;
      gap: 16px;
      padding: 18px 20px;
    }
    .dispatch-ops-bar-body {
      display: grid;
      grid-template-columns: minmax(280px, .92fr) minmax(0, 1.58fr);
      gap: 18px;
      align-items: start;
    }
    .dispatch-ops-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .dispatch-ops-overview {
      display: grid;
      gap: 6px;
      align-content: start;
    }
    .dispatch-ops-overview strong {
      font-size: 24px;
      line-height: 1.05;
      letter-spacing: -.03em;
    }
    .dispatch-ops-card {
      min-height: 0;
    }
    .dispatch-aircraft-strip {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(240px, 260px);
      gap: 12px;
      overflow-x: auto;
      padding: 0 2px 6px 0;
      scrollbar-gutter: stable both-edges;
    }
    .dispatch-aircraft-card,
    body[data-theme="dark"] .dispatch-aircraft-card,
    body[data-theme="forest"] .dispatch-aircraft-card {
      appearance: none;
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 12px 14px;
      background: var(--panel);
      color: var(--text);
      display: grid;
      gap: 8px;
      text-align: left;
      box-shadow: var(--shadow);
    }
    .dispatch-aircraft-card.selected {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent-soft) 58%, var(--panel-strong));
    }
    .dispatch-source-selector {
      display: grid;
      gap: 12px;
    }
    .dispatch-source-card,
    body[data-theme="dark"] .dispatch-source-card,
    body[data-theme="forest"] .dispatch-source-card {
      appearance: none;
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 12px 14px;
      background: var(--panel-strong);
      color: var(--text);
      display: grid;
      gap: 8px;
      text-align: left;
      cursor: pointer;
      box-shadow: none;
    }
    .dispatch-source-card.selected {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent-soft) 58%, var(--panel-strong));
    }
    .dispatch-aircraft-summary-head {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--line);
    }
    .dispatch-aircraft-card-head,
    .dispatch-input-card-head,
    .dispatch-input-section-head,
    .dispatch-message-head {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
    }
    .dispatch-aircraft-card-meta,
    .dispatch-aircraft-card-facts,
    .dispatch-input-card-meta,
    .dispatch-leg-button-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      color: var(--muted);
      font-size: 13px;
    }
    .dispatch-board {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(360px, .96fr) minmax(0, 1.34fr);
      gap: 18px;
      align-items: start;
    }
    .dispatch-workbench {
      min-height: 0;
      display: grid;
      gap: 18px;
      align-content: start;
    }
    .dispatch-assignment-grid {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1.06fr) minmax(340px, .94fr);
      gap: 16px;
      align-items: start;
    }
    .dispatch-contract-list-panel > .panel-body,
    .dispatch-validation-body,
    .dispatch-plan-body,
    .dispatch-selected-aircraft-panel > .panel-body,
    .dispatch-plan-panel > .panel-body,
    .dispatch-commit-bar > .panel-body {
      display: grid;
      gap: 14px;
      overflow: visible;
    }
    .dispatch-contract-list-panel > .panel-body {
      grid-template-rows: auto minmax(0, 1fr) auto;
      overflow: hidden;
    }
    .dispatch-contract-list-body,
    .dispatch-selected-aircraft-body,
    .dispatch-readiness-panel-body {
      min-height: 0;
      display: grid;
      gap: 14px;
    }
    .dispatch-readiness-stack {
      display: grid;
      gap: 12px;
    }
    .dispatch-readiness-list {
      display: grid;
      gap: 10px;
      max-height: clamp(260px, 42vh, 560px);
      overflow: auto;
      padding-right: 4px;
    }
    .dispatch-input-section {
      display: grid;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
    }
    .dispatch-input-section:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    .dispatch-section-note {
      font-size: 13px;
    }
    .dispatch-inline-action,
    .dispatch-inline-form {
      display: grid;
      gap: 8px;
    }
    .dispatch-input-list,
    .dispatch-message-list,
    .dispatch-queue-list,
    .dispatch-source-list {
      display: grid;
      gap: 10px;
    }
    .dispatch-source-list {
      max-height: clamp(240px, 42vh, 520px);
      overflow: auto;
      padding-right: 4px;
    }
    .dispatch-selected-work-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .dispatch-input-card,
    .dispatch-detail-card,
    .dispatch-message-item,
    .dispatch-readiness-item {
      border-radius: 16px;
      border: 1px solid var(--line);
      background: var(--panel-strong);
      display: grid;
      gap: 8px;
      overflow: hidden;
    }
    .dispatch-detail-card,
    .dispatch-message-item {
      padding: 12px 14px;
    }
    .dispatch-readiness-item {
      padding: 0;
    }
    .dispatch-message-item.warning {
      border-color: rgba(239,177,95,.3);
      background: color-mix(in srgb, var(--warn-soft) 72%, var(--panel-strong));
    }
    .dispatch-message-item.blocker {
      border-color: rgba(176,58,46,.24);
      background: color-mix(in srgb, var(--danger-soft) 72%, var(--panel-strong));
    }
    .dispatch-readiness-item.pass {
      border-color: rgba(13,106,119,.22);
      background: color-mix(in srgb, var(--accent-soft) 58%, var(--panel-strong));
    }
    .dispatch-readiness-item.watch {
      border-color: rgba(239,177,95,.3);
      background: color-mix(in srgb, var(--warn-soft) 72%, var(--panel-strong));
    }
    .dispatch-readiness-item.blocked {
      border-color: rgba(176,58,46,.24);
      background: color-mix(in srgb, var(--danger-soft) 72%, var(--panel-strong));
    }
    .dispatch-selected-aircraft-grid,
    .dispatch-detail-grid,
    .dispatch-commit-metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .dispatch-selected-aircraft-grid--dense {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .dispatch-validation-summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .dispatch-aircraft-support-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.12fr) minmax(0, .88fr);
      gap: 12px;
      align-items: start;
    }
    .dispatch-plan-summary,
    .dispatch-selected-work-summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .dispatch-selected-work-summary--contract-first {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .dispatch-selected-work-action-card {
      grid-column: 1 / -1;
    }
    .dispatch-plan-summary {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .dispatch-commit-metrics {
      grid-template-columns: 1fr;
    }
    .dispatch-readiness-summary {
      display: block;
      list-style: none;
      cursor: pointer;
      padding: 12px 14px;
    }
    .dispatch-readiness-summary::-webkit-details-marker {
      display: none;
    }
    .dispatch-readiness-summary::marker {
      content: "";
    }
    .dispatch-readiness-detail {
      padding: 0 14px 14px;
    }
    .dispatch-readiness-detail-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .dispatch-readiness-detail-card {
      display: grid;
      gap: 6px;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel) 86%, transparent);
    }
    .dispatch-queue-grid {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(0, .92fr);
      gap: 16px;
      align-items: start;
    }
    .dispatch-queue-region,
    .dispatch-leg-detail-region {
      min-height: 0;
      display: grid;
      gap: 12px;
    }
    .dispatch-subsection-head {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
    }
    .dispatch-queue-scroll {
      max-height: clamp(260px, 44vh, 560px);
      overflow: auto;
      padding-right: 4px;
    }
    .dispatch-leg-button,
    body[data-theme="dark"] .dispatch-leg-button,
    body[data-theme="forest"] .dispatch-leg-button {
      appearance: none;
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 10px 12px;
      background: var(--panel-strong);
      color: var(--text);
      display: grid;
      gap: 8px;
      text-align: left;
      box-shadow: none;
    }
    .dispatch-leg-button.selected {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent-soft) 58%, var(--panel-strong));
    }
    .dispatch-leg-button-route {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: start;
    }
    .dispatch-leg-button-stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 12px;
      color: var(--muted);
      font-size: 12px;
    }
    .dispatch-leg-button-stats strong {
      color: var(--text);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .06em;
      margin-right: 6px;
    }
    .dispatch-leg-sequence {
      display: inline-flex;
      width: 28px;
      height: 28px;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--text);
      font-weight: 700;
      flex: 0 0 auto;
    }
    .dispatch-leg-detail-stack {
      display: grid;
      gap: 14px;
    }
    .dispatch-time-utility .dispatch-advance-form {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: end;
    }
    .dispatch-time-utility .dispatch-advance-form button {
      grid-column: span 2;
    }
    .dispatch-commit-bar {
      position: static;
      padding: 0;
      backdrop-filter: none;
      overflow: visible;
    }
    .dispatch-commit-copy {
      display: grid;
      gap: 12px;
    }
    .dispatch-commit-actions {
      display: grid;
      gap: 10px;
      align-content: start;
      min-width: 0;
    }
    .dispatch-commit-panel-inline {
      padding-top: 12px;
      border-top: 1px solid var(--line);
    }
    .dispatch-commit-metric {
      display: grid;
      gap: 4px;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--panel);
    }
    .dispatch-commit-metric.pass {
      border-color: rgba(13,106,119,.22);
      background: color-mix(in srgb, var(--accent-soft) 48%, var(--panel));
    }
    .dispatch-commit-metric.watch {
      border-color: rgba(239,177,95,.3);
      background: color-mix(in srgb, var(--warn-soft) 60%, var(--panel));
    }
    .dispatch-commit-metric.blocked {
      border-color: rgba(176,58,46,.24);
      background: color-mix(in srgb, var(--danger-soft) 60%, var(--panel));
    }
    @media (max-width: 1240px) {
      body { overflow: auto; }
      .shell-root { height: auto; min-height: 100vh; padding: 18px; }
      .shell-frame { height: auto; }
      .shell-topbar { grid-template-columns: 1fr; }
      .help-center-overlay { padding: 18px; }
      .help-center-dialog {
        width: min(1080px, calc(100vw - 36px));
        height: min(760px, calc(100vh - 36px));
      }
      .help-center-body,
      .help-topic-section {
        grid-template-columns: 1fr;
      }
      .help-section-nav,
      .help-topic-list {
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
      .tab-surface { min-height: 60vh; }
      .aircraft-tab-grid,
      .aircraft-workbench,
      .aircraft-summary-grid,
      .aircraft-toolbar,
      .market-deals,
      .market-review-summary,
      .dispatch-ops-bar-body,
      .dispatch-ops-grid,
      .dispatch-board,
      .dispatch-workbench,
      .dispatch-assignment-grid,
      .dispatch-queue-grid,
      .dispatch-selected-aircraft-grid,
      .dispatch-selected-aircraft-grid--dense,
      .dispatch-aircraft-support-grid,
      .dispatch-plan-summary,
      .dispatch-selected-work-summary,
      .dispatch-selected-work-summary--contract-first,
      .dispatch-detail-grid,
      .dispatch-validation-summary,
      .dispatch-commit-metrics,
      .contracts-grid,
      .contracts-side-column,
      .planner-workbench,
      .planner-setup-grid,
      .planner-summary-grid,
      .contracts-selected-grid {
        grid-template-columns: 1fr;
        height: auto;
      }
      .planner-control-row {
        grid-template-columns: 1fr;
      }
      .market-option-list {
        grid-template-columns: 1fr;
      }
      .aircraft-tab-main,
      .aircraft-side-column {
        height: auto;
      }
      .aircraft-market-listing {
        grid-template-columns: 60px minmax(0, 1fr);
        gap: 10px;
      }
      .aircraft-market-listing-thumb {
        width: 60px;
        height: 40px;
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
      .dispatch-aircraft-strip {
        grid-auto-columns: minmax(220px, 84vw);
      }
      .dispatch-aircraft-summary-head,
      .dispatch-subsection-head {
        flex-direction: column;
        align-items: stretch;
      }
      .dispatch-leg-button-route {
        grid-template-columns: auto minmax(0, 1fr);
      }
      .dispatch-leg-button-route > :last-child {
        grid-column: 1 / -1;
        justify-self: start;
      }
      .dispatch-leg-button-stats {
        grid-template-columns: 1fr;
      }
      .dispatch-source-list,
      .dispatch-readiness-list,
      .dispatch-queue-scroll {
        max-height: none;
      }
      .dispatch-time-utility .dispatch-advance-form {
        grid-template-columns: 1fr;
      }
      .dispatch-time-utility .dispatch-advance-form button {
        grid-column: auto;
      }
      .dispatch-readiness-detail-grid {
        grid-template-columns: 1fr;
      }
      .aircraft-market-overlay {
        padding: 12px;
      }
      .aircraft-market-overlay-card {
        width: calc(100vw - 24px);
        max-width: calc(100vw - 24px);
        max-height: calc(100vh - 32px);
      }
      .staffing-hire-overlay-card {
        width: min(980px, calc(100% - 32px));
      }
      .staffing-hire-detail-grid,
      .staffing-employee-detail-grid,
      .staffing-employee-summary-grid,
      .staffing-snapshot-grid,
      .staffing-stat-grid,
      .staffing-hire-detail-grid .staffing-comparison-grid,
      .staffing-coverage-strip {
        grid-template-columns: 1fr;
      }
      .staffing-employee-hero {
        grid-template-columns: 1fr;
      }
      .staffing-employee-hero-actions {
        min-width: 0;
      }
      .staffing-comparison-card {
        grid-template-columns: 1fr;
        align-items: start;
      }
      .staffing-comparison-action {
        justify-self: stretch;
      }
      .staffing-hire-choice-form--embedded button {
        width: 100%;
        min-width: 0;
      }
      .staffing-hire-detail-grid > .staffing-detail-section--snapshot,
      .staffing-hire-detail-grid > .staffing-detail-section--comparison,
      .staffing-hire-detail-grid > .staffing-detail-section--coverage {
        grid-column: auto;
      }
    }
    @media (max-width: 760px) {
      .help-center-overlay { padding: 12px; }
      .help-center-dialog {
        width: calc(100vw - 24px);
        height: calc(100vh - 24px);
      }
      .help-center-head {
        padding: 18px;
        grid-auto-flow: row;
      }
      .help-home-panel,
      .help-article-region {
        padding: 16px;
      }
      .help-home-shortcuts {
        grid-template-columns: 1fr;
      }
      .dispatch-aircraft-strip {
        grid-template-columns: 1fr;
      }
      .staffing-hire-overlay {
        padding: 12px;
      }
      .staffing-hire-overlay-card {
        width: calc(100vw - 24px);
        max-height: calc(100vh - 24px);
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
                <div class="settings-meta-row"><span class="muted">Activity popups</span><strong data-settings-popup-label>Loading...</strong></div>
              </div>
              <div class="settings-actions">
                <button class="settings-action" type="button" data-settings-open-help>Open Help Center</button>
                <button class="settings-action" type="button" data-settings-open-activity>Open activity log</button>
                <button class="settings-action" type="button" data-settings-popup-mode-toggle>Activity popups: Loading...</button>
                <button class="settings-action" type="button" data-settings-theme>Theme: Loading...</button>
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
    ${renderHelpCenterOverlay()}
    <script type="application/json" data-shell-config>${configJson}</script>
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
        window.dispatchEvent(new CustomEvent('flightline:theme-changed', { detail: { theme: next } }));
        return next;
      };
    })();
  </script>
  <script type="module" src="${saveShellClientAssetPath}"></script>
</body>
</html>`;
}
