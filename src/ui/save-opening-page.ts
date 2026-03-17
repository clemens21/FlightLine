/*
 * Renders the intermediate open-save page that appears before the main shell is shown.
 * The page is intentionally lightweight because its only purpose is to stage the handoff into the real shell.
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

export function renderSaveOpeningPage(saveId: string, activeTab: SavePageTab, destinationUrl: string, openSaveClientAssetPath: string): string {
    const configJson = JSON.stringify({
        saveId,
        initialTab: activeTab,
        destinationUrl,
    })
        .replaceAll("&", "\\u0026")
        .replaceAll("<", "\\u003c")
        .replaceAll(">", "\\u003e");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Opening ${escapeHtml(saveId)} | FlightLine</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #efe9de;
      --bg-alt: linear-gradient(160deg, rgba(250,244,234,.95), rgba(233,228,216,.9));
      --panel: rgba(255,255,255,.82);
      --panel-strong: rgba(255,255,255,.94);
      --text: #182126;
      --muted: #61707b;
      --line: rgba(24,33,38,.08);
      --accent: #0d6a77;
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
    .eyebrow { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); }
    .muted { color: var(--muted); }
    button, .button-link {
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
    body[data-theme="dark"] button,
    body[data-theme="dark"] .button-link,
    body[data-theme="forest"] button,
    body[data-theme="forest"] .button-link {
      color: #091018;
      background: var(--accent);
    }
    .button-secondary { background: transparent; color: var(--text); border: 1px solid var(--line); }
    body[data-theme="dark"] .button-secondary,
    body[data-theme="forest"] .button-secondary { color: var(--text); background: transparent; }
    .opening-screen {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(320px, 540px) minmax(320px, 1fr);
      align-items: stretch;
      background:
        radial-gradient(circle at top left, rgba(13,106,119,.18), transparent 28%),
        radial-gradient(circle at bottom right, rgba(24,33,38,.08), transparent 24%),
        var(--bg-alt);
    }
    .opening-panel,
    .opening-art {
      min-width: 0;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }
    .opening-panel {
      border-right: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel) 76%, transparent);
      backdrop-filter: blur(18px);
    }
    .opening-art {
      position: relative;
      overflow: hidden;
    }
    .loading-card {
      width: min(520px, 100%);
      display: grid;
      gap: 18px;
      padding: 32px;
      border-radius: 28px;
      background: var(--panel-strong);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
    }
    .loading-card h1 { margin: 0; font-size: 34px; line-height: 1.08; }
    .loading-card p { margin: 0; color: var(--muted); }
    .loading-summary { max-width: 42ch; }
    .loading-stage { font-size: 16px; color: var(--text) !important; }
    .loading-error {
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid rgba(176,58,46,.24);
      background: var(--danger-soft);
      color: var(--text) !important;
    }
    .loading-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .progress-rail { position: relative; height: 74px; }
    .progress-track {
      position: absolute;
      left: 0;
      right: 0;
      top: 38px;
      height: 8px;
      border-radius: 999px;
      background: rgba(127,127,127,.18);
      overflow: hidden;
    }
    .progress-track::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.24), transparent);
      transform: translateX(-100%);
      animation: route-shimmer 1.8s linear infinite;
    }
    .progress-fill {
      position: absolute;
      left: 0;
      top: 38px;
      height: 8px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, white));
      width: 0%;
      transition: width .35s ease;
    }
    .plane-marker {
      position: absolute;
      top: 12px;
      left: 0%;
      width: 46px;
      height: 46px;
      transform: translateX(-50%);
      color: var(--accent);
      transition: left .35s ease;
      filter: drop-shadow(0 10px 18px rgba(13,106,119,.2));
    }
    .plane-marker svg { width: 100%; height: 100%; display: block; }
    .progress-labels { display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
    .opening-art svg { width: min(780px, 100%); height: auto; display: block; opacity: .92; }
    .art-annotation {
      position: absolute;
      bottom: 42px;
      right: 42px;
      padding: 14px 16px;
      border-radius: 18px;
      background: color-mix(in srgb, var(--panel-strong) 82%, transparent);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      max-width: 280px;
    }
    @keyframes route-shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    @media (max-width: 1240px) {
      body { overflow: auto; }
      .opening-screen { grid-template-columns: 1fr; min-height: auto; }
      .opening-panel { border-right: 0; border-bottom: 1px solid var(--line); }
      .opening-art { min-height: 280px; padding-top: 12px; }
      .art-annotation { position: static; margin-top: 16px; }
    }
  </style>
</head>
<body>
  <main class="opening-screen" data-open-save-app>
    <section class="opening-panel">
      <div class="loading-card">
        <div class="eyebrow">Opening Save</div>
        <h1 data-loader-title>Opening ${escapeHtml(saveId)}</h1>
        <p class="loading-summary">Loading company state, current operations, and the first active workspace before the dashboard appears.</p>
        <p class="loading-stage" data-loader-stage>Opening save</p>
        <div class="progress-rail" aria-hidden="true">
          <div class="progress-track"></div>
          <div class="progress-fill" data-loader-fill></div>
          <div class="plane-marker" data-loader-plane>
            <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M54.5 30.5L36.5 23.5L28.5 7.5C27.8 6.1 26.2 5.4 24.7 5.9C23.3 6.4 22.4 7.8 22.6 9.3L24.8 24.2L13.4 20.2L9.8 12.6C9.2 11.4 7.8 10.8 6.5 11.2C5 11.7 4.1 13.2 4.4 14.7L6.5 24.7L4.4 34.7C4.1 36.2 5 37.7 6.5 38.2C7.8 38.6 9.2 38 9.8 36.8L13.4 29.2L24.8 25.2L22.6 40.1C22.4 41.6 23.3 43 24.7 43.5C26.2 44 27.8 43.3 28.5 41.9L36.5 25.9L54.5 18.9C56.2 18.2 57.2 16.5 57.1 14.7C57 12.8 55.8 11.2 54 10.6L47.6 8.3C46.7 8 45.8 8.1 45 8.5L35.6 13.8L33 11.2L32.4 7.9C32.2 6.7 31.2 5.8 29.9 5.7C28.7 5.6 27.5 6.3 27 7.4L22.4 17.1L10.2 21.8C8.9 22.3 8 23.6 8 25C8 26.4 8.9 27.7 10.2 28.2L22.4 32.9L27 42.6C27.5 43.7 28.7 44.4 29.9 44.3C31.2 44.2 32.2 43.3 32.4 42.1L33 38.8L35.6 36.2L45 41.5C45.8 41.9 46.7 42 47.6 41.7L54 39.4C55.8 38.8 57 37.2 57.1 35.3C57.2 33.5 56.2 31.8 54.5 31.1V30.5Z" fill="currentColor"/>
            </svg>
          </div>
        </div>
        <div class="progress-labels"><span>Gate</span><span>Taxi</span><span>Enroute</span><span>Arrival</span></div>
        <p class="loading-error" data-loader-error hidden></p>
        <div class="loading-actions" data-loader-actions hidden>
          <button type="button" data-loader-retry>Retry</button>
          <a class="button-link button-secondary" href="/">Back to saves</a>
        </div>
      </div>
    </section>
    <section class="opening-art" aria-hidden="true">
      <svg viewBox="0 0 900 620" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="routeGlow" x1="0" x2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.08"/>
            <stop offset="50%" stop-color="currentColor" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="currentColor" stop-opacity="0.08"/>
          </linearGradient>
        </defs>
        <g color="var(--accent)">
          <circle cx="120" cy="150" r="10" fill="currentColor" fill-opacity="0.65"/>
          <circle cx="330" cy="210" r="10" fill="currentColor" fill-opacity="0.55"/>
          <circle cx="520" cy="120" r="10" fill="currentColor" fill-opacity="0.55"/>
          <circle cx="770" cy="280" r="10" fill="currentColor" fill-opacity="0.65"/>
          <circle cx="640" cy="470" r="10" fill="currentColor" fill-opacity="0.55"/>
          <path d="M120 150C210 110 260 230 330 210C410 188 430 88 520 120C615 154 665 334 770 280" stroke="url(#routeGlow)" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M330 210C410 270 480 420 640 470" stroke="url(#routeGlow)" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M120 150C210 290 360 340 640 470" stroke="url(#routeGlow)" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="10 16"/>
        </g>
      </svg>
      <div class="art-annotation">
        <div class="eyebrow">Ops Bootstrap</div>
        <strong>Open fast, then switch to the dashboard.</strong>
        <div class="muted">This screen loads the first save snapshot before the main shell appears.</div>
      </div>
    </section>
    <script type="application/json" data-open-save-config>${configJson}</script>
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
    })();
  </script>
  <script type="module" src="${openSaveClientAssetPath}"></script>
</body>
</html>`;
}
