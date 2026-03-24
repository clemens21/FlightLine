// @ts-nocheck
import { isValidSaveId } from "./save-slot-files.js";

export function saveRoute(saveId, options = {}) {
    const search = new URLSearchParams();
    if (options.tab && options.tab !== "dashboard") {
        search.set("tab", options.tab);
    }
    if (options.contractsView) {
        search.set("contractsView", options.contractsView);
    }
    if (options.flash?.notice) {
        search.set("notice", options.flash.notice);
    }
    if (options.flash?.error) {
        search.set("error", options.flash.error);
    }
    const query = search.toString();
    return `/save/${encodeURIComponent(saveId)}${query ? `?${query}` : ""}`;
}

export function openSaveRoute(saveId, options = {}) {
    const search = new URLSearchParams();
    if (options.tab && options.tab !== "dashboard") {
        search.set("tab", options.tab);
    }
    const query = search.toString();
    return `/open-save/${encodeURIComponent(saveId)}${query ? `?${query}` : ""}`;
}

export function launcherRoute(options = {}) {
    const search = new URLSearchParams();
    if (options.confirmDeleteSaveId) {
        search.set("confirmDelete", options.confirmDeleteSaveId);
    }
    if (options.flash?.notice) {
        search.set("notice", options.flash.notice);
    }
    if (options.flash?.error) {
        search.set("error", options.flash.error);
    }
    const query = search.toString();
    return query ? `/?${query}` : "/";
}

export function readConfirmDeleteSaveId(url, saveIds) {
    const confirmDeleteSaveId = url.searchParams.get("confirmDelete") ?? undefined;
    if (!confirmDeleteSaveId || !isValidSaveId(confirmDeleteSaveId) || !saveIds.includes(confirmDeleteSaveId)) {
        return undefined;
    }
    return confirmDeleteSaveId;
}

export async function readForm(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

export function sendHtml(response, html) {
    response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
    });
    response.end(html);
}

export function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
}

export function redirect(response, location) {
    response.writeHead(303, { location });
    response.end();
}

export function readFlashState(url) {
    const notice = url.searchParams.get("notice") ?? undefined;
    const error = url.searchParams.get("error") ?? undefined;
    return { notice, error };
}

export function logUiTiming(label, startedAtMs) {
    const durationMs = Date.now() - startedAtMs;
    console.log(`[ui:timing] ${label} ${durationMs}ms`);
}

export async function withUiTiming(label, operation) {
    const startedAtMs = Date.now();
    try {
        return await operation();
    }
    finally {
        logUiTiming(label, startedAtMs);
    }
}
